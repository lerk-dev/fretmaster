/**
 * lib/three-notes-per-string.ts —— 一弦三音（3NPS）生成器契约测试
 *
 * 这是从 guitarrun.com 的「3NPS Marathon」搬过来的练习生成算法（逐行逆详见
 * `guitarrun-3nps-analysis.md`）。测试分三层，从"事实"到"结构"再到"不许漂移"：
 *
 *  ① **参考表**：C 大调 P1（最高把位）与 P3（开放把位）的逐弦品号，是手工从算法推演出来的
 *     硬事实，也是对方首页上 `ROOT C · START C · STRING 6 · FRET 8` 那条注记的出处。
 *  ② **结构不变量**：每弦恰好 3 音、弦内品号严格递增、整体音高严格递增、35 步 = 18 上行 + 17 下行、
 *     下行是上行的镜像且**顶音只弹一次**、换把标记只出现在非首把位的第一音。
 *  ③ **差分对照**：把 GuitarRun 的**原始写法**（绝对 MIDI + 硬编码起点 40）在测试里再实现一遍，
 *     断言我们改写成"相对最低空弦音"之后，在六弦吉他上**逐把位逐弦逐品完全相同**。
 *     没有这一条，任何人把 `openStringOffsets` 改错都只会表现为"指型看起来还像那么回事"。
 *
 * 🚨 两个最容易写错、且错了不会报错的地方（都有用例）：
 *  - 下行写成 `notes.slice().reverse()` ⇒ 顶音弹两次，35 步变 36 步；
 *  - 起点照抄硬编码 `40` ⇒ 七弦/贝斯整个把位顶飞出指板。
 */
import { describe, it, expect } from 'vitest'
import {
  NOTES_PER_STRING,
  THREE_NPS_REQUIRED_INTERVALS,
  THREE_NPS_WINDOW_LEAD,
  THREE_NPS_WINDOW_SIZE,
  isThreeNpsEligible,
  threeNpsStepsPerPosition,
  openStringOffsets,
  buildThreeNpsNotes,
  buildThreeNpsPositions,
  flattenThreeNpsSteps,
  marathonStepCount,
  nextThreeNpsPositionIndex,
  threeNpsWindow,
  positionCellKeys,
  type ThreeNpsConfig,
} from '@/lib/three-notes-per-string'
import { INSTRUMENT_CONFIG } from '@/lib/practice-suggestions'
import { SCALE_MODES } from '@/lib/page-theory-data'

const GUITAR = INSTRUMENT_CONFIG.six_string_guitar
const SEVEN = INSTRUMENT_CONFIG.seven_string_guitar
const BASS4 = INSTRUMENT_CONFIG.four_string_bass

/** 标准调弦的相对半音偏移（= GuitarRun 的 dt 减 40） */
const GUITAR_OFFSETS = [24, 19, 15, 10, 5, 0]

/** 数据源里的名字是调式名：Ionian = 大调，Aeolian = 自然小调 */
const IONIAN = SCALE_MODES.majorScaleModes.find((s) => s.name === 'Ionian')!
const AEOLIAN = SCALE_MODES.majorScaleModes.find((s) => s.name === 'Aeolian')!
if (!IONIAN || !AEOLIAN) throw new Error('majorScaleModes 里找不到 Ionian/Aeolian —— 数据源被改名了')

/** 七声音阶（Ionian）—— 一弦三音唯一可用的音阶形态 */
const MAJOR = IONIAN

function cfg(overrides: Partial<ThreeNpsConfig> = {}): ThreeNpsConfig {
  return {
    rootPitchClass: 0, // C
    intervals: MAJOR.notes,
    degreeLabels: MAJOR.intervals,
    tuning: GUITAR.tuning,
    maxFret: GUITAR.defaultFretCount, // 15
    ...overrides,
  }
}

/** 取某个把位「弦索引 → 品号数组」，低弦在前 */
function fretsByString(notes: { stringIndex: number; fret: number }[], stringCount = 6) {
  const out: number[][] = []
  for (let s = stringCount - 1; s >= 0; s--) {
    out.push(notes.filter((n) => n.stringIndex === s).map((n) => n.fret))
  }
  return out
}

// =====================================================================================
// ① 参考表
// =====================================================================================

describe('参考表：C 大调把位指型（手工推演，对不上就是实现错了）', () => {
  it('P1（d=0，8 品起）：六个弦的品号逐一对上', () => {
    const notes = buildThreeNpsNotes(cfg(), 0)
    expect(fretsByString(notes)).toEqual([
      [8, 10, 12], // 6 弦（低 E）
      [8, 10, 12], // 5 弦（A）
      [9, 10, 12], // 4 弦（D）
      [9, 10, 12], // 3 弦（G）
      [10, 12, 13], // 2 弦（B）
      [10, 12, 13], // 1 弦（高 E）
    ])
  })

  it('P1 首音就是对方首页那条注记：ROOT C · STRING 6 · FRET 8', () => {
    const notes = buildThreeNpsNotes(cfg(), 0)
    const first = notes[0]
    expect(first.stringIndex).toBe(5) // 6 弦
    expect(first.fret).toBe(8)
    expect(first.pitchClass).toBe(0) // C
    expect(first.isRoot).toBe(true)
    expect(first.degreeLabel).toBe('1')
  })

  it('P3（d=2，开放把位）：2 弦/1 弦从 1 品起 —— 不是「每弦都往低品凑」', () => {
    const notes = buildThreeNpsNotes(cfg(), 2)
    expect(fretsByString(notes)).toEqual([
      [0, 1, 3],
      [0, 2, 3],
      [0, 2, 3],
      [0, 2, 4],
      [1, 3, 5], // ← 若写成「从 0 品起」这里会变成 [0,1,3]
      [1, 3, 5],
    ])
  })

  it('七个把位的「起始 6 弦品号」是音级序 8/10/0/1/3/5/7（P3 反而是开放把位）', () => {
    const startFrets = [0, 1, 2, 3, 4, 5, 6].map((d) => buildThreeNpsNotes(cfg(), d)[0].fret)
    expect(startFrets).toEqual([8, 10, 0, 1, 3, 5, 7])
  })

  it('七个把位的最高品号 ≤ 15（默认 15 品指板装得下全部 7 个把位）', () => {
    const positions = buildThreeNpsPositions(cfg())
    expect(positions.map((p) => p.endFret)).toEqual([13, 15, 5, 7, 8, 10, 12])
    // 每个把位都完整 = 每弦 3 音 × 6 弦
    expect(positions.every((p) => p.notes.length === 18)).toBe(true)
  })
})

// =====================================================================================
// ② 结构不变量
// =====================================================================================

describe('结构不变量', () => {
  it('每弦恰好 3 个音，且弦索引只出现在 0..5', () => {
    for (let d = 0; d < 7; d++) {
      const notes = buildThreeNpsNotes(cfg(), d)
      const counts = [0, 1, 2, 3, 4, 5].map((s) => notes.filter((n) => n.stringIndex === s).length)
      expect(counts, `把位 ${d + 1}`).toEqual([3, 3, 3, 3, 3, 3])
    }
  })

  it('弦内品号严格递增', () => {
    for (let d = 0; d < 7; d++) {
      for (const frets of fretsByString(buildThreeNpsNotes(cfg(), d))) {
        for (let i = 1; i < frets.length; i++) {
          expect(frets[i], `把位 ${d + 1}`).toBeGreaterThan(frets[i - 1])
        }
      }
    }
  })

  it('整体音高严格递增（低弦 → 高弦、弦内自低到高）', () => {
    for (let d = 0; d < 7; d++) {
      const notes = buildThreeNpsNotes(cfg(), d)
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i].neckMidi, `把位 ${d + 1} 第 ${i} 音`).toBeGreaterThan(notes[i - 1].neckMidi)
      }
    }
  })

  it('品号与音级自洽：pitchClass = (弦音级 + 品号) mod 12', () => {
    for (let d = 0; d < 7; d++) {
      for (const n of buildThreeNpsNotes(cfg(), d)) {
        const openPC = GUITAR.tuning[n.stringIndex]
        expect((openPC + n.fret) % 12).toBe(n.pitchClass)
      }
    }
  })

  it('isRoot 恰好等价于 pitchClass === 主音音级（不是靠标签猜的）', () => {
    const notes = buildThreeNpsNotes(cfg(), 0)
    const roots = notes.filter((n) => n.isRoot)
    expect(roots.length).toBeGreaterThan(0)
    expect(roots.every((n) => n.pitchClass === 0)).toBe(true)
    expect(notes.filter((n) => !n.isRoot).every((n) => n.pitchClass !== 0)).toBe(true)
  })

  it('音级标签与音阶表按下标对齐（P1 前 8 个音级就是 1 2 3 4 5 6 7 1）', () => {
    const notes = buildThreeNpsNotes(cfg(), 0)
    expect(notes.slice(0, 8).map((n) => n.degreeLabel)).toEqual(['1', '2', '3', '4', '5', '6', '7', '1'])
    expect(notes.map((n) => n.degree)).toEqual(notes.map((n) => n.degreeIndex + 1))
  })

  it('单把位 35 步 = 18 上行 + 17 下行；顶音只出现一次', () => {
    const positions = buildThreeNpsPositions(cfg())
    expect(threeNpsStepsPerPosition(6)).toBe(35)
    for (const p of positions) {
      expect(p.steps.length, `把位 ${p.index}`).toBe(35)
      expect(p.steps.filter((s) => s.direction === 'up').length).toBe(18)
      expect(p.steps.filter((s) => s.direction === 'down').length).toBe(17)
    }
  })

  it('🚨 下行是上行的镜像，且顶音不重复（写成完整 reverse 会变 36 步 / 顶音两次）', () => {
    const positions = buildThreeNpsPositions(cfg())
    for (const p of positions) {
      // steps[18+j] 应等于 notes[16-j]
      for (let j = 0; j < 17; j++) {
        expect(p.steps[18 + j].fret, `把位 ${p.index} 第 ${18 + j} 步`).toBe(p.notes[16 - j].fret)
        expect(p.steps[18 + j].stringIndex).toBe(p.notes[16 - j].stringIndex)
      }
      // 顶音（notes[17]）在整段里恰好出现一次
      const top = p.notes[17]
      const topCount = p.steps.filter(
        (s) => s.stringIndex === top.stringIndex && s.fret === top.fret
      ).length
      expect(topCount, `把位 ${p.index} 顶音重复次数`).toBe(1)
      // 首音（起点）在整段里恰好出现两次（上行起点 + 下行终点）
      const first = p.notes[0]
      const firstCount = p.steps.filter(
        (s) => s.stringIndex === first.stringIndex && s.fret === first.fret
      ).length
      expect(firstCount).toBe(2)
    }
  })

  it('换把标记只出现在非首把位的第一音（GuitarRun: shift = l>0 && step===0）', () => {
    const positions = buildThreeNpsPositions(cfg())
    expect(positions[0].steps.some((s) => s.isShift)).toBe(false)
    for (const p of positions.slice(1)) {
      expect(p.steps[0].isShift, `把位 ${p.index}`).toBe(true)
      expect(p.steps.slice(1).some((s) => s.isShift)).toBe(false)
    }
  })

  it('把位号 / 锚点音级：把位 1..7 = 音级 1..7（不是「把位从低到高」）', () => {
    const positions = buildThreeNpsPositions(cfg())
    expect(positions.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(positions.map((p) => p.anchorDegree)).toEqual([1, 2, 3, 4, 5, 6, 7])
    // 每个把位的首音是它自己的锚点音级
    expect(positions.map((p) => p.steps[0].degreeLabel)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('Marathon：七个把位拼起来，步号连续、整场 245 步', () => {
    const positions = buildThreeNpsPositions(cfg())
    const flat = flattenThreeNpsSteps(positions)
    expect(flat.length).toBe(245)
    expect(marathonStepCount(6)).toBe(245)
    expect(flat.filter((s) => s.isShift).length).toBe(6)
    // 每个把位 35 步
    for (let i = 0; i < 7; i++) {
      expect(flat.filter((s) => s.position === i + 1).length).toBe(35)
    }
  })

  it('非七声音阶一律返回空（五声/六声/八声都不生成）', () => {
    expect(isThreeNpsEligible(MAJOR.notes)).toBe(true)
    expect(isThreeNpsEligible([0, 2, 4, 7, 9])).toBe(false) // 五声
    expect(isThreeNpsEligible([0, 1, 3, 6, 7, 9])).toBe(false) // 全音阶
    expect(isThreeNpsEligible([0, 2, 4, 5, 7, 9, 10, 11])).toBe(false) // bebop 八声
    expect(isThreeNpsEligible(undefined)).toBe(false)
    expect(isThreeNpsEligible(null)).toBe(false)

    const penta = SCALE_MODES.pentatonic[0]
    expect(buildThreeNpsPositions(cfg({ intervals: penta.notes, degreeLabels: penta.intervals }))).toEqual([])
    expect(THREE_NPS_REQUIRED_INTERVALS).toBe(7)
    expect(NOTES_PER_STRING).toBe(3)
  })

  it('buildThreeNpsNotes 是导出函数 ⇒ 空音阶 / 空调弦直接喂进去也不能炸（返回空）', () => {
    // `buildThreeNpsPositions` 会先挡掉非七声，但本函数是导出的，可能被直接调用
    expect(buildThreeNpsNotes(cfg({ intervals: [], degreeLabels: [] }), 0)).toEqual([])
    expect(buildThreeNpsNotes(cfg({ tuning: [] }), 0)).toEqual([])
  })
})

// =====================================================================================
// ③ 调弦 / 品数 / 差分对照
// =====================================================================================

describe('调弦与品数', () => {
  it('openStringOffsets：六弦标准 = GuitarRun 的 dt 减 40', () => {
    expect(openStringOffsets(GUITAR.tuning)).toEqual(GUITAR_OFFSETS)
    expect(openStringOffsets([64 - 60, 59 - 60, 55 - 60, 50 - 60, 45 - 60, 40 - 60])).toEqual(GUITAR_OFFSETS)
    // 空调弦不炸
    expect(openStringOffsets([])).toEqual([])
  })

  it('七弦（加低 B）与四弦贝斯的偏移都是"往上一根弦"的正确音程', () => {
    // 七弦：B1 E2 A2 D3 G3 B3 E4 → 相对低 B 的偏移
    expect(openStringOffsets(SEVEN.tuning)).toEqual([29, 24, 20, 15, 10, 5, 0])
    // 四弦贝斯：E1 A1 D2 G2
    expect(openStringOffsets(BASS4.tuning)).toEqual([15, 10, 5, 0])
  })

  it('🚨 不用绝对八度：同一调弦 + 同一把位，对不同乐器都从「最低空弦音」起算', () => {
    // 贝斯 4 弦一弦三音：单把位 2*3*4-1 = 23 步
    expect(threeNpsStepsPerPosition(4)).toBe(23)
    expect(marathonStepCount(4)).toBe(161)
    const bassNotes = buildThreeNpsNotes(
      cfg({ tuning: BASS4.tuning, maxFret: BASS4.defaultFretCount }),
      2 // P3 = 开放把位
    )
    // 低弦（4 弦 E）首音必须是 0 品（E），而不是被顶到 12 品上去
    const lowest = bassNotes.filter((n) => n.stringIndex === 3)
    expect(lowest[0].fret).toBe(0)
    expect(lowest[0].pitchClass).toBe(4) // E
    // 每个音都落在指板内
    expect(bassNotes.every((n) => n.fret >= 0 && n.fret <= BASS4.defaultFretCount)).toBe(true)
  })

  it('越界音静默剔除：每弦剩下的都是该弦原序列的前缀，且音高仍严格递增', () => {
    const full = buildThreeNpsNotes(cfg(), 1) // P2 最高品 15（1 弦与 0 弦都踩线）
    expect(full.length).toBe(18)
    expect(fretsByString(full)).toEqual([
      [10, 12, 13],
      [10, 12, 14],
      [10, 12, 14],
      [10, 12, 14],
      [12, 13, 15],
      [12, 13, 15],
    ])

    const clipped = buildThreeNpsNotes(cfg({ maxFret: 14 }), 1)
    expect(clipped.length).toBe(16) // 1 弦与 0 弦各掉一个 15 品
    expect(clipped.every((n) => n.fret <= 14)).toBe(true)
    // 🚨 不是「整串的前缀」：掉音发生在**每根弦各自组的末尾**（1 弦掉在 0 弦之前），
    // 所以只能按弦分别比前缀。
    const fullByString = fretsByString(full)
    const clippedByString = fretsByString(clipped)
    clippedByString.forEach((frets, i) => {
      expect(frets, `第 ${i} 组`).toEqual(fullByString[i].slice(0, frets.length))
    })
    // 但音高仍然严格递增（不含八度信息的相对坐标）
    for (let i = 1; i < clipped.length; i++) {
      expect(clipped[i].neckMidi).toBeGreaterThan(clipped[i - 1].neckMidi)
    }
  })

  it('品数太小导致把位为空时会被跳过，而不是塞一个空把位进去', () => {
    const positions = buildThreeNpsPositions(cfg({ maxFret: 0 }))
    // 0 品指板只留下空弦音，绝大多数把位落空
    expect(positions.every((p) => p.notes.length > 0)).toBe(true)
    expect(positions.length).toBeLessThan(7)
  })

  it('12 个调 × 7 个把位都不会产生越界或空指型（15 品）', () => {
    for (let root = 0; root < 12; root++) {
      const positions = buildThreeNpsPositions(cfg({ rootPitchClass: root }))
      expect(positions.length, `主音 ${root}`).toBe(7)
      for (const p of positions) {
        // 起点品号取 0..11，最高音比起点高 5~6 品 ⇒ 15 品指板最多掉尾部 2 个音
        expect(p.notes.length, `主音 ${root} 把位 ${p.index}`).toBeGreaterThanOrEqual(16)
        expect(p.notes.length).toBeLessThanOrEqual(18)
        expect(p.startFret).toBeGreaterThanOrEqual(0)
        expect(p.endFret).toBeLessThanOrEqual(15)
        // 掉音只会掉在高音端 ⇒ 首音永远是「最低空弦音上的那个音级」
        expect(p.steps[0].stringIndex).toBe(5)
        expect(p.steps[0].fret).toBe(p.startFret)
      }
    }
  })
})

/**
 * GuitarRun 的**原始写法**（绝对 MIDI + 硬编码起点 40），从压缩产物逐行抄下来。
 * 只用于差分对照：证明我们改成「相对最低空弦音」之后，在六弦吉他上结果**完全一致**。
 */
function guitarRunOriginal(rootPC: number, intervals: number[], positionIndex: number, maxFret = 17) {
  const dt = [64, 59, 55, 50, 45, 40]
  const nps = intervals.length === 5 ? 2 : 3
  const total = nps * 6
  const first = (rootPC + intervals[positionIndex]) % 12
  let v = 40
  while (v % 12 !== first) v++
  const pitches: number[] = []
  let curs = v
  for (let a = 0; a < total; a++) {
    const pc = (rootPC + intervals[(positionIndex + a) % intervals.length]) % 12
    while (curs % 12 !== pc) curs++
    pitches.push(curs)
    curs++
  }
  const out: { string: number; fret: number }[] = []
  let le = 0
  for (let s = 5; s >= 0; s--) {
    for (let k = 0; k < nps; k++) {
      const note = pitches[le++]
      const fret = note - dt[s]
      if (fret >= 0 && fret <= maxFret) out.push({ string: s, fret })
    }
  }
  return out
}

describe('差分对照：与 GuitarRun 的原始绝对 MIDI 写法逐品一致', () => {
  const minor = AEOLIAN

  it('六弦标准调弦下，12 个调 × 7 个把位 × Major/Minor 全部一致', () => {
    const scales = [
      { intervals: MAJOR.notes, labels: MAJOR.intervals },
      { intervals: minor.notes, labels: minor.intervals },
    ]
    let compared = 0
    for (const scale of scales) {
      for (let root = 0; root < 12; root++) {
        const ours = buildThreeNpsPositions(
          cfg({ rootPitchClass: root, intervals: scale.intervals, degreeLabels: scale.labels, maxFret: 17 })
        )
        for (let d = 0; d < 7; d++) {
          const mine = ours[d].notes.map((n) => ({ string: n.stringIndex, fret: n.fret }))
          const theirs = guitarRunOriginal(root, scale.intervals, d)
          expect(mine, `根音 ${root} 把位 ${d + 1}`).toEqual(theirs)
          compared++
        }
      }
    }
    // 防止循环被写空（"恒真的护栏"）
    expect(compared).toBe(2 * 12 * 7)
  })
})

// =====================================================================================
// ④ 滑窗 与 指板查表
// =====================================================================================

describe('threeNpsWindow —— 9 步滑窗', () => {
  const steps = Array.from({ length: 35 }, (_, i) => ({ step: i }))

  it('当前步固定落在第 4 格（左边恒有 3 个已完成）', () => {
    const w = threeNpsWindow(steps, 10)
    expect(w.start).toBe(7)
    expect(w.items.length).toBe(THREE_NPS_WINDOW_SIZE)
    expect(w.items.map((i) => i.index)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15])
    const current = w.items.find((i) => i.current)!
    expect(current.index).toBe(10)
    expect(w.items.indexOf(current)).toBe(THREE_NPS_WINDOW_LEAD)
    expect(w.items.filter((i) => i.done).length).toBe(3)
  })

  it('开头贴左边界：start 夹到 0，当前步在窗口内但不一定在第 4 格', () => {
    const w = threeNpsWindow(steps, 0)
    expect(w.start).toBe(0)
    expect(w.items.map((i) => i.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(w.items[0].current).toBe(true)
    expect(w.items.filter((i) => i.done).length).toBe(0)
  })

  it('结尾贴右边界：start 夹到 len-size，当前步仍固定看得见', () => {
    const w = threeNpsWindow(steps, 34)
    expect(w.start).toBe(35 - THREE_NPS_WINDOW_SIZE)
    expect(w.items.map((i) => i.index)).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34])
    expect(w.items[w.items.length - 1].current).toBe(true)
    expect(w.items.filter((i) => i.done).length).toBe(8)
  })

  it('边界外的当前步号会被夹住（不会出现"没有任何一格是 current"）', () => {
    expect(threeNpsWindow(steps, -5).items[0].current).toBe(true)
    const last = threeNpsWindow(steps, 999)
    expect(last.items[last.items.length - 1].current).toBe(true)
  })

  it('序列比窗口短时整段显示；空序列返回空', () => {
    const short = steps.slice(0, 4)
    const w = threeNpsWindow(short, 1)
    expect(w.items.map((i) => i.index)).toEqual([0, 1, 2, 3])
    expect(w.items[1].current).toBe(true)
    expect(threeNpsWindow([], 0).items).toEqual([])
  })
})

describe('positionCellKeys —— 指板高亮查表', () => {
  it('键是"弦索引-品号"，与 PracticeFretboard 的 highlightedFrets 同形', () => {
    const notes = buildThreeNpsNotes(cfg(), 0)
    const map = positionCellKeys(notes)
    expect(map.size).toBe(18)
    expect(map.has('5-8')).toBe(true) // 6 弦 8 品 = C
    expect(map.get('5-8')!.pitchClass).toBe(0)
    expect(map.has('0-13')).toBe(true)
    expect(map.has('5-7')).toBe(false)
  })
})

// =====================================================================================
// ⑤ Marathon 推进规则
// =====================================================================================

describe('nextThreeNpsPositionIndex —— Marathon 推进规则', () => {
  it('还没到最后一个把位就往后走一格', () => {
    expect(nextThreeNpsPositionIndex(0, 7)).toBe(1)
    expect(nextThreeNpsPositionIndex(3, 7)).toBe(4)
    expect(nextThreeNpsPositionIndex(5, 7)).toBe(6)
  })

  it('🚨 走到最后一个把位返回 null —— 调用方据此换调/换音阶，而不是越界或原地循环', () => {
    expect(nextThreeNpsPositionIndex(6, 7)).toBeNull()
    // 这是「把所有位当环」和「跑完 P7 就停」的分界：若有人改成 % positionCount，
    // 上面这条会立刻挂。
    expect(nextThreeNpsPositionIndex(0, 1)).toBeNull()
    expect(nextThreeNpsPositionIndex(0, 0)).toBeNull()
  })

  it('没有可用把位时返回 null（不会让调用方以为还有下一题）', () => {
    expect(nextThreeNpsPositionIndex(0, 0)).toBeNull()
    expect(nextThreeNpsPositionIndex(3, -1)).toBeNull()
  })

  it('把位号跳号（品数太小剔除个别把位）时按数组长度判定，不按把位号', () => {
    // 只剩 3 个可用把位 ⇒ 下标 2 就是最后一个
    expect(nextThreeNpsPositionIndex(1, 3)).toBe(2)
    expect(nextThreeNpsPositionIndex(2, 3)).toBeNull()
  })

  it('非法输入（NaN / 小数 / 负数）被规整，不会产生越界下标', () => {
    expect(nextThreeNpsPositionIndex(Number.NaN, 7)).toBeNull()
    expect(nextThreeNpsPositionIndex(1.7, 7)).toBe(2)
    expect(nextThreeNpsPositionIndex(-3, 7)).toBe(1)
  })
})
