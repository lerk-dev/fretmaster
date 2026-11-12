/**
 * 「单音全指板」纯逻辑护栏。
 *
 * 守三件事：
 *   ① 枚举出的位置数量必须与手算一致（E 音 12 品 = 8 个、24 品 = 14 个）——
 *      这是「一轮能不能把所有位置找完」的分子，错了进度条就永远填不满；
 *   ② 巡游顺序必须是入参的排列（不丢、不重、不新增）；
 *   ③ 换音逻辑：固定顺序 12 音循环；随机模式在见过的音之外取，全见完则重来。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  enumerateTargetPositions,
  buildTour,
  attributeHit,
  nextTargetNote,
  cellKey,
  type CellPos,
} from '@/lib/single-note-tour'
import { guitarPositionToMidi } from '@/lib/guitar-sound'
import { NOTES } from '@/lib/page-theory-data'

/** 标准调弦，高音弦 → 低音弦：E4 B3 G3 D3 A2 E2 */
const STANDARD_TUNING = [4, 11, 7, 2, 9, 4]
const ALL_STRINGS = [0, 1, 2, 3, 4, 5]

const enumerateE = (maxFret: number) =>
  enumerateTargetPositions({
    targetNote: 'E',
    maxFret,
    allowedStringIndexes: ALL_STRINGS,
    tuning: STANDARD_TUNING,
  })

describe('enumerateTargetPositions：某音在品域内的全部落点', () => {
  it('E 音在 12 品内共 8 个位置（含两根空弦与两个 12 品）', () => {
    const positions = enumerateE(12)
    expect(positions).toHaveLength(8)
    expect(positions).toEqual([
      { stringIndex: 0, fret: 0 },
      { stringIndex: 0, fret: 12 },
      { stringIndex: 1, fret: 5 },
      { stringIndex: 2, fret: 9 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 4, fret: 7 },
      { stringIndex: 5, fret: 0 },
      { stringIndex: 5, fret: 12 },
    ])
  })

  it('E 音在 24 品内共 14 个位置', () => {
    expect(enumerateE(24)).toHaveLength(14)
  })

  it('每个位置的音名都确实是目标音（全 12 音 × 0-24 品穷举）', () => {
    for (const targetNote of NOTES) {
      const positions = enumerateTargetPositions({
        targetNote,
        maxFret: 24,
        allowedStringIndexes: ALL_STRINGS,
        tuning: STANDARD_TUNING,
      })
      for (const pos of positions) {
        const note = [4, 11, 7, 2, 9, 4][pos.stringIndex]
        expect(NOTES[(note + pos.fret) % 12]).toBe(targetNote)
      }
    }
  })

  it('限制弦时只在该弦上取点', () => {
    const positions = enumerateTargetPositions({
      targetNote: 'E',
      maxFret: 12,
      allowedStringIndexes: [3],
      tuning: STANDARD_TUNING,
    })
    expect(positions).toEqual([{ stringIndex: 3, fret: 2 }])
  })

  it('品域为负 / 音名为空时返回空数组', () => {
    expect(enumerateE(-1)).toEqual([])
    expect(
      enumerateTargetPositions({
        targetNote: '',
        maxFret: 12,
        allowedStringIndexes: ALL_STRINGS,
        tuning: STANDARD_TUNING,
      }),
    ).toEqual([])
  })
})

describe('buildTour：顺序必须是输入位置的排列', () => {
  const positions = enumerateE(12)
  const modes = ['byPosition', 'byString', 'nearest', 'octave', 'random'] as const

  it.each(modes)('%s 不丢、不重、不新增', (mode) => {
    const tour = buildTour(positions, mode)
    expect(tour).toHaveLength(positions.length)
    expect(new Set(tour.map(cellKey)).size).toBe(positions.length)
    expect(new Set(tour.map(cellKey))).toEqual(new Set(positions.map(cellKey)))
  })

  it('byPosition 先按品、再按弦', () => {
    const tour = buildTour(
      [
        { stringIndex: 2, fret: 7 },
        { stringIndex: 1, fret: 2 },
        { stringIndex: 0, fret: 7 },
      ],
      'byPosition',
    )
    expect(tour).toEqual([
      { stringIndex: 1, fret: 2 },
      { stringIndex: 0, fret: 7 },
      { stringIndex: 2, fret: 7 },
    ])
  })

  it('byString 先按弦、再按品', () => {
    const tour = buildTour(
      [
        { stringIndex: 2, fret: 7 },
        { stringIndex: 0, fret: 12 },
        { stringIndex: 0, fret: 0 },
      ],
      'byString',
    )
    expect(tour).toEqual([
      { stringIndex: 0, fret: 0 },
      { stringIndex: 0, fret: 12 },
      { stringIndex: 2, fret: 7 },
    ])
  })

  it('nearest 起点固定在琴枕侧，且总移动代价不劣于逐把位', () => {
    // 与实现同一度量：跨一根弦按 3 个「品距」折算（换弦比移动手指贵）
    const cost = (tour: CellPos[]) =>
      tour.slice(1).reduce((sum, cur, i) => {
        const prev = tour[i]
        return sum + Math.abs(cur.fret - prev.fret) + Math.abs(cur.stringIndex - prev.stringIndex) * 3
      }, 0)

    const nearest = buildTour(positions, 'nearest')
    expect(nearest[0]).toEqual({ stringIndex: 0, fret: 0 })
    // 就近顺序的意义就是「别来回跳」：总代价不能比按品横向扫更高
    expect(cost(nearest)).toBeLessThanOrEqual(cost(buildTour(positions, 'byPosition')))
  })

  it('octave 走八度梯子：最低品起步 → 4弦2 → 2弦5 → 5弦7 → 3弦9 → 1弦12 → 下一把位', () => {
    // 12 品内
    expect(buildTour(enumerateE(12), 'octave')).toEqual([
      { stringIndex: 0, fret: 0 },   // 1弦0（E 的最低品，两根空弦同品）
      { stringIndex: 5, fret: 0 },   // 6弦0（两个空弦先互联）
      { stringIndex: 3, fret: 2 },   // 4弦2
      { stringIndex: 1, fret: 5 },   // 2弦5
      { stringIndex: 4, fret: 7 },   // 5弦7
      { stringIndex: 2, fret: 9 },   // 3弦9
      { stringIndex: 0, fret: 12 },  // 1弦12
      { stringIndex: 5, fret: 12 },  // 6弦12（下一把位起点）
    ])

    // 24 品内：第二段梯子 6弦12 → 4弦14 → 2弦17 → 5弦19 → 3弦21 → 1弦24
    expect(buildTour(enumerateE(24), 'octave')).toEqual([
      { stringIndex: 0, fret: 0 },
      { stringIndex: 5, fret: 0 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 1, fret: 5 },
      { stringIndex: 4, fret: 7 },
      { stringIndex: 2, fret: 9 },
      { stringIndex: 0, fret: 12 },
      { stringIndex: 5, fret: 12 },
      { stringIndex: 3, fret: 14 },
      { stringIndex: 1, fret: 17 },
      { stringIndex: 4, fret: 19 },
      { stringIndex: 2, fret: 21 },
      { stringIndex: 0, fret: 24 },
      { stringIndex: 5, fret: 24 },
    ])
  })

  it('octave 起点是「这个音的最低品」，不是固定的 1 弦/6 弦空弦', () => {
    const tourC = buildTour(
      enumerateTargetPositions({
        targetNote: 'C',
        maxFret: 12,
        allowedStringIndexes: ALL_STRINGS,
        tuning: STANDARD_TUNING,
      }),
      'octave',
    )
    // C 没有空弦，最低把位是 2弦1品 ⇒ 从这里开始，而不是 6弦8品
    expect(tourC[0]).toEqual({ stringIndex: 1, fret: 1 })
    expect(tourC.map((p) => `${p.stringIndex}-${p.fret}`)).toEqual([
      '1-1', '4-3', '2-5', '0-8', '5-8', '3-10',
    ])
  })

  it('octave：全 12 音 × 12/24 品都从最低品起步，且品号单调不降（只往高把位走）', () => {
    for (const targetNote of NOTES) {
      for (const maxFret of [12, 24]) {
        const positions = enumerateTargetPositions({
          targetNote,
          maxFret,
          allowedStringIndexes: ALL_STRINGS,
          tuning: STANDARD_TUNING,
        })
        const tour = buildTour(positions, 'octave')
        const minFret = Math.min(...positions.map((p) => p.fret))
        expect(tour[0].fret, `${targetNote} ${maxFret} 品应从最低品起步`).toBe(minFret)
        const frets = tour.map((p) => p.fret)
        expect(
          frets.every((fret, i) => i === 0 || fret >= frets[i - 1]),
          `${targetNote} ${maxFret} 品的巡游出现了往回走：${frets.join(',')}`,
        ).toBe(true)
      }
    }
  })

  it('octave：全 12 音都能把位置走完（不卡在半路）', () => {
    for (const targetNote of NOTES) {
      const positions = enumerateTargetPositions({
        targetNote,
        maxFret: 24,
        allowedStringIndexes: ALL_STRINGS,
        tuning: STANDARD_TUNING,
      })
      const tour = buildTour(positions, 'octave')
      expect(tour).toHaveLength(positions.length)
      expect(new Set(tour.map(cellKey)).size).toBe(positions.length)
    }
  })

  it('不修改入参', () => {
    const input: CellPos[] = [
      { stringIndex: 1, fret: 5 },
      { stringIndex: 0, fret: 1 },
    ]
    const snapshot = JSON.parse(JSON.stringify(input))
    buildTour(input, 'byPosition')
    expect(input).toEqual(snapshot)
  })
})

describe('「全部」= 当前指板品数内的所有该音（2026-11-11）', () => {
  /**
   * 修前有两个上限：练习设置里的指板品数 + 单音模式自己的「品域」12/24。
   * 取 min 的后果：指板显示 15 品时，「全部」只覆盖 0-12 品，
   * 13-15 品上的落点永远轮不到，用户以为弹完了其实还有好几个。
   */
  it('15 品指板：枚举必须覆盖 13~15 品上的落点（旧实现被 12 品上限切掉）', () => {
    const positions = enumerateTargetPositions({
      targetNote: 'C',
      maxFret: 15,
      allowedStringIndexes: ALL_STRINGS,
      tuning: STANDARD_TUNING,
    })
    expect(positions.some((p) => p.fret === 13), '2弦13品应包含在内').toBe(true)
    expect(positions.some((p) => p.fret === 15), '4弦15品应包含在内').toBe(true)
    expect(positions.every((p) => p.fret <= 15)).toBe(true)
  })

  it('位置数随品数单调增长：12 → 15 → 22 → 24 品都要变多', () => {
    const count = (maxFret: number) => enumerateE(maxFret).length
    expect(count(12)).toBe(8)
    expect(count(15)).toBeGreaterThan(count(12))
    expect(count(22)).toBeGreaterThanOrEqual(count(15))
    expect(count(24)).toBeGreaterThan(count(22))
  })

  it('页面把范围直接接到指板品数（fretCount），不能再引入第二个品域上限', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf8')
    expect(src).toContain('maxFret: fretCount')
    expect(src).not.toContain('singleNoteMaxFret')
  })
})

describe('attributeHit：弹对了必须在指板上点亮对应位置（含无提示模式）', () => {
  const octaveOf = (p: CellPos) => {
    const midi = guitarPositionToMidi(p.stringIndex, p.fret)
    return midi === null ? null : Math.floor(midi / 12) - 1
  }
  /** E（12 品内）的巡游：0-0(4) 5-0(2) 3-2(3) 1-5(4) 4-7(3) 2-9(4) 0-12(5) 5-12(3) */
  const tour = buildTour(enumerateE(12), 'octave')
  const hit = (patch: Partial<Parameters<typeof attributeHit>[0]> = {}) =>
    attributeHit({
      tour,
      found: [],
      skipped: [],
      prompt: 'none',
      promptPos: null,
      octaveOf,
      ...patch,
    })

  it('无提示 + 音频：靠八度把落点找出来（修前这里返回 undefined ⇒ 指板永远不亮）', () => {
    expect(hit({ octave: 4 })).toEqual({ stringIndex: 0, fret: 0 })
    expect(hit({ octave: 2 })).toEqual({ stringIndex: 5, fret: 0 })
  })

  it('无提示：同八度按巡游顺序依次点亮，已找到的跳过', () => {
    const first = hit({ octave: 4 })
    const second = hit({ octave: 4, found: [first!] })
    expect(second).not.toEqual(first)
    expect(octaveOf(second!)).toBe(4)
    expect(second).toEqual({ stringIndex: 1, fret: 5 })
  })

  it('无提示：该八度已全部找到 ⇒ 退到相邻八度（-1 优先），不再静默丢弃', () => {
    const allE4 = tour.filter((p) => octaveOf(p) === 4)
    const fallback = hit({ octave: 4, found: allE4 })
    expect(fallback).toBeDefined()
    expect(octaveOf(fallback!)).toBe(3)
  })

  it('无提示：全本轮位置都找完 ⇒ 才返回 undefined', () => {
    expect(hit({ octave: 4, found: tour })).toBeUndefined()
  })

  it('无提示 + 拿不到八度 ⇒ 不记位置（只计次数）', () => {
    expect(hit()).toBeUndefined()
  })

  it('点击命中但不在本轮巡游内（超出品数）⇒ undefined，不能点亮圈外格子', () => {
    expect(hit({ position: { stringIndex: 0, fret: 24 } })).toBeUndefined()
    expect(hit({ position: { stringIndex: 3, fret: 2 } })).toEqual({ stringIndex: 3, fret: 2 })
  })

  it('精确提示：八度对上记提示位置，对不上先找同八度位置，找不到才退回提示位置', () => {
    const promptPos: CellPos = { stringIndex: 0, fret: 0 } // E4
    expect(hit({ prompt: 'exact', promptPos, octave: 4 })).toEqual(promptPos)
    // 弹的是 E3：优先记同八度的未去位置，而不是硬记提示位置
    expect(hit({ prompt: 'exact', promptPos, octave: 3 })).toEqual({ stringIndex: 3, fret: 2 })
    // E3 的位置都去过了 ⇒ 退回提示位置（宁可记错也不卡进度）
    const allE3 = tour.filter((p) => octaveOf(p) === 3)
    expect(hit({ prompt: 'exact', promptPos, octave: 3, found: allE3 })).toEqual(promptPos)
  })
})

describe('nextTargetNote：一轮结束后的下一个音', () => {
  it('固定顺序按 NOTES 循环', () => {
    expect(nextTargetNote('C', [], false)).toBe(NOTES[1])
    expect(nextTargetNote(NOTES[NOTES.length - 1], [], false)).toBe(NOTES[0])
  })

  it('随机模式不会取到已见过的音', () => {
    const seen = NOTES.slice(0, 11)
    expect(nextTargetNote('C', seen, true, () => 0)).toBe(NOTES[11])
  })

  it('全部见过时清空重来', () => {
    const seen = [...NOTES]
    const picked = nextTargetNote('C', seen, true, () => 0)
    expect(NOTES).toContain(picked)
  })
})
