/**
 * 指板把位 / CAGED 的契约测试。
 *
 * 该模块此前零测试，而它决定「把位指型面板」上画的每一个音与每一个指法数字
 * （components/theory-panel.tsx:518 直接把 note.finger 显示到格子上，
 *   :545 的图例写明 1=食指 2=中指 3=无名指 4=小指）。
 * 这类错误不会抛异常，只会安静地画出错误指法 —— 正是最该钉住的一类。
 */
import { describe, it, expect } from 'vitest'
import {
  generateScalePositions,
  getScaleNotesInWindow,
  getCagedShapes,
  isStandardSixStringGuitar,
  getDegreeLabels,
  type FretboardConfig,
  type PositionNote,
} from '@/lib/fretboard-positions'
import { SCALE_INTERVALS, ScaleType } from '@/lib/scale-theory'

/** 标准六弦吉他：索引 0 = 最高音弦（1 弦 E），索引 5 = 最低音弦（6 弦 E） */
const STD: FretboardConfig = { stringCount: 6, tuning: [4, 11, 7, 2, 9, 4] }
const BASS: FretboardConfig = { stringCount: 4, tuning: [7, 2, 9, 4] }
const ALL_SCALES = Object.values(ScaleType) as ScaleType[]
const FRET_COUNT = 15

/**
 * 一指一品：手指编号由**窗口内的绝对品位置**决定，与「该品上是否恰好有音」无关。
 * 食指尖所在的品 = max(startFret, 1) —— startFret=0 的开放把位没有「第 0 品手指」，食指落在 1 品。
 * 从该品起每高 1 品换下一根手指，最多到小指(4)。
 * ⚠️ 不能用「窗口内实际最低的按弦音」当食指：窗口起点品上恰好没有音阶音时它并不存在
 *   （如 D 大调五声的 0–4 品窗口，f1 无音，最低音在 f2，但 f2 仍应是中指）。
 */
function fingeringErrors(startFret: number, notes: PositionNote[]): string[] {
  const errors: string[] = []
  const indexFret = Math.max(startFret, 1)
  for (const n of notes) {
    if (n.fret === 0) {
      if (n.finger !== 0) errors.push(`空弦 f0 的 finger=${n.finger}，应为 0`)
      continue
    }
    const expected = Math.min(4, n.fret - indexFret + 1)
    if (n.finger !== expected) {
      errors.push(`f${n.fret} 的 finger=${n.finger}，按食指定律（食指尖在 ${indexFret} 品）应为 ${expected}`)
    }
  }
  return errors
}

describe('getDegreeLabels', () => {
  it('把半音记号替换为 Unicode 升降号', () => {
    expect(getDegreeLabels(ScaleType.major)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(getDegreeLabels(ScaleType.naturalMinor)).toEqual(['1', '2', '♭3', '4', '5', '♭6', '♭7'])
    expect(getDegreeLabels(ScaleType.majorPentatonic)).toEqual(['1', '2', '3', '5', '6'])
    // 重降号（两个 b）也要整体替换
    expect(getDegreeLabels(ScaleType.alteredDominantFlatFlat7)).toContain('♭♭7')
  })

  it('每个音阶的标签数等于其 interval 数，且不含遗留的 ASCII b/#', () => {
    for (const st of ALL_SCALES) {
      const labels = getDegreeLabels(st)
      expect(labels, `scale=${st}`).toHaveLength(SCALE_INTERVALS[st].length)
      for (const l of labels) {
        expect(l, `scale=${st} label=${l}`).not.toMatch(/[b#]/)
      }
    }
  })
})

describe('generateScalePositions 结构不变量', () => {
  it('窗口在指板范围内、index 连续、anchorDegree 唯一且不超音阶音数', () => {
    for (const root of [0, 1, 4, 7, 9, 11]) {
      for (const st of ALL_SCALES) {
        const positions = generateScalePositions(root, st, STD, FRET_COUNT)
        expect(positions.length, `root=${root} scale=${st}`).toBeGreaterThan(0)
        const degrees = new Set<number>()
        positions.forEach((p, i) => {
          expect(p.index, `root=${root} scale=${st}`).toBe(i + 1)
          expect(p.startFret).toBeGreaterThanOrEqual(0)
          expect(p.endFret).toBeLessThanOrEqual(FRET_COUNT)
          expect(p.endFret).toBeGreaterThanOrEqual(p.startFret)
          expect(p.anchorDegree).toBeGreaterThanOrEqual(1)
          expect(p.anchorDegree).toBeLessThanOrEqual(SCALE_INTERVALS[st].length)
          expect(degrees.has(p.anchorDegree), `root=${root} scale=${st} 重复 anchorDegree=${p.anchorDegree}`).toBe(false)
          degrees.add(p.anchorDegree)
        })
      }
    }
  })

  it('每个音的 pitchClass / degree / isRoot 与实际弦品一致，且音都落在窗口内', () => {
    const root = 4 // E
    for (const st of ALL_SCALES) {
      const len = SCALE_INTERVALS[st].length
      for (const p of generateScalePositions(root, st, STD, FRET_COUNT)) {
        for (const n of p.notes) {
          expect(n.fret).toBeGreaterThanOrEqual(p.startFret)
          expect(n.fret).toBeLessThanOrEqual(p.endFret)
          expect(n.stringIndex).toBeGreaterThanOrEqual(0)
          expect(n.stringIndex).toBeLessThan(STD.stringCount)
          const expectedPC = ((STD.tuning[n.stringIndex] + n.fret) % 12 + 12) % 12
          expect(n.pitchClass).toBe(expectedPC)
          expect(n.degree).toBeGreaterThanOrEqual(1)
          expect(n.degree).toBeLessThanOrEqual(len)
          expect(n.isRoot).toBe(n.pitchClass === root)
        }
      }
    }
  })
})

describe('把位指法（一指一品）', () => {
  it('开放把位窗口（startFret=0）的按弦品从食指起算', () => {
    // E 大调：E 弦空弦即主音 → 首个把位窗口恰为 0–3 品
    const open = generateScalePositions(4, ScaleType.major, STD, FRET_COUNT).find(p => p.startFret === 0)
    expect(open, 'E 大调应存在 0 品起的把位窗口').toBeDefined()
    const at = (fret: number) => open!.notes.find(n => n.fret === fret)!

    expect(at(1).finger, '0 把位的 1 品应为食指').toBe(1)
    expect(at(2).finger, '0 把位的 2 品应为中指').toBe(2)
    // 空弦不受影响
    for (const n of open!.notes.filter(n => n.fret === 0)) {
      expect(n.finger).toBe(0)
    }
  })

  it('高把位窗口的指法与 0 把位同规则（回归护栏）', () => {
    const positions = generateScalePositions(4, ScaleType.major, STD, FRET_COUNT)
    const high = positions.find(p => p.startFret === 2)! // 窗口 2–5
    const at = (fret: number) => high.notes.find(n => n.fret === fret)!
    expect(at(2).finger).toBe(1)
    expect(at(4).finger).toBe(3)
    expect(at(5).finger).toBe(4)
  })

  it('全部窗口、全部音阶都满足食指定律', () => {
    for (const root of [0, 2, 4, 5, 7, 9, 11]) {
      for (const st of ALL_SCALES) {
        for (const p of generateScalePositions(root, st, STD, FRET_COUNT)) {
          expect(fingeringErrors(p.startFret, p.notes), `root=${root} scale=${st} win=${p.startFret}-${p.endFret}`).toEqual([])
        }
      }
    }
  })

  it('getScaleNotesInWindow 也遵守同一指法规则', () => {
    const notes = getScaleNotesInWindow(4, ScaleType.majorPentatonic, STD, 0, 4)
    expect(notes.length).toBeGreaterThan(0)
    expect(fingeringErrors(0, notes)).toEqual([])
    // G 弦 1 品（G#）是窗口内最低按弦品 → 食指
    expect(notes.find(n => n.stringIndex === 2 && n.fret === 1)!.finger).toBe(1)
  })
})

describe('isStandardSixStringGuitar', () => {
  it('仅在 6 弦且调弦为 EADGBE 时为真', () => {
    expect(isStandardSixStringGuitar(STD)).toBe(true)
    expect(isStandardSixStringGuitar(BASS)).toBe(false)
    expect(isStandardSixStringGuitar({ stringCount: 6, tuning: [4, 11, 7, 2, 9, 5] })).toBe(false)
    expect(isStandardSixStringGuitar({ stringCount: 6, tuning: [4, 11, 7, 2, 9] })).toBe(false)
  })
})

describe('getCagedShapes', () => {
  it('非标准六弦调弦直接返回空（该体系仅适用于 EADGBE）', () => {
    expect(getCagedShapes(4, BASS, FRET_COUNT)).toEqual([])
    expect(getCagedShapes(4, { stringCount: 6, tuning: [4, 11, 7, 2, 9, 5] }, FRET_COUNT)).toEqual([])
  })

  it('E 调大调给出 5 个型，且按窗口起点从低到高排序', () => {
    const shapes = getCagedShapes(4, STD, FRET_COUNT, 'major')
    expect(shapes.map(s => s.form).sort()).toEqual(['A', 'C', 'D', 'E', 'G'])
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i].windowStart).toBeGreaterThanOrEqual(shapes[i - 1].windowStart)
    }
  })

  it('E 型在 0 品处画出标准开放 E 和弦', () => {
    const e = getCagedShapes(4, STD, FRET_COUNT, 'major').find(s => s.form === 'E')!
    expect(e.rootStringIndex).toBe(5)
    expect(e.rootFret).toBe(0)
    expect(e.windowStart).toBe(0)
    const tone = (s: number, f: number) => e.chordTones.find(t => t.stringIndex === s && t.fret === f)
    // 6弦空弦根 / 3弦2品根 / 5弦2品五度 / 4弦1品三度 / 2弦空弦五度 / 1弦空弦根
    expect(tone(5, 0)?.role).toBe('root')
    expect(tone(3, 2)?.role).toBe('root')
    expect(tone(4, 2)?.role).toBe('fifth')
    expect(tone(2, 1)?.role).toBe('third')
    expect(tone(1, 0)?.role).toBe('fifth')
    expect(tone(0, 0)?.role).toBe('root')
    // 每个和弦音都在指板范围内
    for (const t of e.chordTones) {
      expect(t.fret).toBeGreaterThanOrEqual(0)
      expect(t.fret).toBeLessThanOrEqual(FRET_COUNT)
    }
  })

  it('小三和弦只把三音下移一品，其余不动', () => {
    const major = getCagedShapes(4, STD, FRET_COUNT, 'major')
    const minor = getCagedShapes(4, STD, FRET_COUNT, 'minor')
    expect(minor).toHaveLength(major.length)
    for (const mj of major) {
      const mi = minor.find(s => s.form === mj.form)!
      // 根音/五度位置完全一致
      for (const t of mj.chordTones.filter(t => t.role !== 'third')) {
        expect(mi.chordTones.find(x => x.stringIndex === t.stringIndex && x.role === t.role)?.fret).toBe(t.fret)
      }
      // 三音下移一品（若在小三下仍落在指板内）
      for (const t of mj.chordTones.filter(t => t.role === 'third')) {
        const shifted = mi.chordTones.find(x => x.stringIndex === t.stringIndex && x.role === 'third')
        if (shifted) expect(shifted.fret).toBe(t.fret - 1)
      }
    }
  })

  it('每个型的根音品与其根音弦空弦音 + 根音品 == 目标根音', () => {
    for (const root of [0, 2, 4, 5, 7, 9, 11]) {
      for (const s of getCagedShapes(root, STD, FRET_COUNT, 'major')) {
        const pc = ((STD.tuning[s.rootStringIndex] + s.rootFret) % 12 + 12) % 12
        expect(pc, `root=${root} form=${s.form}`).toBe(root)
      }
    }
  })

  it('建议音阶随和弦性质切换', () => {
    expect(getCagedShapes(4, STD, FRET_COUNT, 'major')[0].suggestedScale).toBe(ScaleType.majorPentatonic)
    expect(getCagedShapes(4, STD, FRET_COUNT, 'minor')[0].suggestedScale).toBe(ScaleType.minorPentatonic)
  })
})

// ============================================================================
// 兜底守卫：未注册音阶 / 退化调弦配置
// ============================================================================
describe('generateScalePositions 的防线', () => {
  it('未注册的音阶类型（SCALE_INTERVALS 里没有）→ 返回空数组，不抛错', () => {
    expect(generateScalePositions(0, 'nonsense' as ScaleType, STD, FRET_COUNT)).toEqual([])
  })

  it('退化配置（tuning 短于 stringCount）→ 最低弦空弦取不到，窗口落空，返回空数组而非抛错', () => {
    // 最低弦索引 = stringCount-1 = 6，但 tuning 只有 6 项 ⇒ tuning[6] === undefined
    // ⇒ 主音品为 NaN ⇒ 每个窗口都收集不到音（collectNotesInWindow 的内层 for 直接不执行）。
    // 这是**防御性守卫**：正常 INSTRUMENT_CONFIG 里 tuning.length === stringCount，走不到。
    const degenerate: FretboardConfig = { stringCount: 7, tuning: [4, 11, 7, 2, 9, 4] }
    expect(generateScalePositions(0, ScaleType.major, degenerate, FRET_COUNT)).toEqual([])
    expect(generateScalePositions(5, ScaleType.minorPentatonic, degenerate, FRET_COUNT)).toEqual([])
  })

  it('stringCount 为 0 → 无弦可收集，返回空数组', () => {
    expect(generateScalePositions(0, ScaleType.major, { stringCount: 0, tuning: [] }, FRET_COUNT)).toEqual([])
  })
})
