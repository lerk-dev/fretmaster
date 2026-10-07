/**
 * 音阶数据表与「和弦 → 音阶」映射的契约测试。
 *
 * 这几张表都是**并行的手写表**，错位不会抛异常、只会安静地显示错音阶或错度数；
 * 消费者是 components/theory-panel.tsx（和弦音阶 tab、把位 tab 的度数标签）。
 *
 * 「和弦音 ⊆ 所配音阶」已逐条审过并修正（2026-09-24）：原先 23 处不满足，
 * 其中 22 处已改（含补入 Mixolydian b6 音阶），仅 thirteenSusFourFlatNine
 * 全库无音阶可同时含 sus4 的 11、b9 与 13，作为显式豁免列在文末。
 */
import { describe, it, expect } from 'vitest'
import { ChordType, CHORD_INTERVALS, Note } from '@/lib/chord-theory'
import {
  CHORD_SCALE_OPTIONS,
  SCALE_DISPLAY_NAMES,
  SCALE_INTERVAL_DISPLAY,
  SCALE_INTERVALS,
  ScaleType,
  getScaleDisplayName,
  getScaleNotes,
  getScaleOptionsForChord,
} from '@/lib/scale-theory'

const ALL_SCALES = Object.values(ScaleType) as ScaleType[]
const ALL_CHORD_TYPES = Object.values(ChordType)
const mod12 = (n: number) => ((n % 12) + 12) % 12

/** 音级（1 起）→ 半音。复合度数（9/11/13）按「8ve + 简单度数」展开。 */
const SIMPLE_DEGREE_SEMITONES: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 }
function degreeLabelToSemitones(label: string): number {
  const m = label.match(/^([#b]*)(\d+)$/)
  if (!m) throw new Error(`非法度数标签: ${label}`)
  const accidentals = m[1]
  const degree = parseInt(m[2], 10)
  const octaves = Math.floor((degree - 1) / 7)
  const simple = ((degree - 1) % 7) + 1
  let semitones = SIMPLE_DEGREE_SEMITONES[simple] + 12 * octaves
  for (const ch of accidentals) semitones += ch === '#' ? 1 : -1
  return semitones
}

describe('SCALE_INTERVAL_DISPLAY 与 SCALE_INTERVALS 必须一一对应', () => {
  it('每个音阶两表等长，且度数标签换算出的半音值与 interval 一致', () => {
    for (const st of ALL_SCALES) {
      const intervals = SCALE_INTERVALS[st]
      const labels = SCALE_INTERVAL_DISPLAY[st]
      expect(labels, `scale=${st}`).toHaveLength(intervals.length)
      intervals.forEach((semitones, i) => {
        const fromLabel = mod12(degreeLabelToSemitones(labels[i]))
        expect(
          fromLabel,
          `scale=${st} 第 ${i + 1} 音：标签 ${labels[i]} → ${fromLabel}，但 interval = ${semitones}`,
        ).toBe(mod12(semitones))
      })
    }
  })

  it('标签格式合法、首音为 1', () => {
    for (const st of ALL_SCALES) {
      const labels = SCALE_INTERVAL_DISPLAY[st]
      expect(labels[0], `scale=${st}`).toBe('1')
      for (const l of labels) {
        expect(l, `scale=${st}`).toMatch(/^[#b]*\d+$/)
      }
    }
  })
})

describe('SCALE_INTERVALS 自身形状', () => {
  it('首音为 0、严格递增、同一八度内音级不重复', () => {
    for (const st of ALL_SCALES) {
      const intervals = SCALE_INTERVALS[st]
      expect(intervals.length, `scale=${st}`).toBeGreaterThanOrEqual(4)
      expect(intervals.length, `scale=${st}`).toBeLessThanOrEqual(8)
      expect(intervals[0], `scale=${st}`).toBe(0)
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i], `scale=${st} @${i}`).toBeGreaterThan(intervals[i - 1])
      }
      const pcs = intervals.map(mod12)
      expect(new Set(pcs).size, `scale=${st} 音级重复: ${pcs.join(',')}`).toBe(pcs.length)
    }
  })
})

describe('SCALE_DISPLAY_NAMES', () => {
  it('每个音阶都有中英写法，中文名含汉字', () => {
    for (const st of ALL_SCALES) {
      const info = SCALE_DISPLAY_NAMES[st]
      expect(info, `scale=${st}`).toBeDefined()
      expect(info.standard.length, `scale=${st}`).toBeGreaterThan(0)
      expect(info.unicode.length, `scale=${st}`).toBeGreaterThan(0)
      expect(info.chinese, `scale=${st}`).toMatch(/[\u4e00-\u9fff]/)
    }
  })

  it('unicode 写法就是 standard 的变音号替换（# → ♯、bb → 𝄫）', () => {
    for (const st of ALL_SCALES) {
      const { standard, unicode } = SCALE_DISPLAY_NAMES[st]
      // ⚠️ 只替换「紧跟数字」的变音记号 —— 否则 Bebop 里的小写 b 会被误替换成 Be♭op
      expect(unicode, `scale=${st}: ${standard} → ${unicode}`).toBe(
        standard.replace(/bb(?=\d)/g, '𝄫').replace(/b(?=\d)/g, '♭').replace(/#(?=\d)/g, '♯'),
      )
    }
  })
})

describe('CHORD_SCALE_OPTIONS', () => {
  it('覆盖全部和弦类型，且每个和弦至少有一个音阶选项', () => {
    expect(ALL_CHORD_TYPES.length).toBeGreaterThanOrEqual(60)
    for (const ct of ALL_CHORD_TYPES) {
      const options = CHORD_SCALE_OPTIONS[ct]
      expect(options, `chord=${ct}`).toBeDefined()
      expect(options.length, `chord=${ct}`).toBeGreaterThan(0)
    }
  })

  it('所有选项都是合法的 ScaleType（防拼错后静默落到兜底）', () => {
    const valid = new Set<string>(ALL_SCALES)
    for (const ct of ALL_CHORD_TYPES) {
      for (const st of CHORD_SCALE_OPTIONS[ct]) {
        expect(valid.has(st), `chord=${ct} 引用了未知音阶 ${st}`).toBe(true)
      }
    }
  })

  it('getScaleOptionsForChord 返回配置本身；未知和弦兜底大调音阶', () => {
    for (const ct of ALL_CHORD_TYPES) {
      expect(getScaleOptionsForChord(ct)).toEqual(CHORD_SCALE_OPTIONS[ct])
    }
    expect(getScaleOptionsForChord('not-a-chord' as ChordType)).toEqual([ScaleType.major])
  })
})

describe('getScaleNotes / getScaleDisplayName', () => {
  it('音数等于 interval 数，且都是合法音级', () => {
    for (const st of ALL_SCALES) {
      const notes = getScaleNotes(Note.E, st)
      expect(notes, `scale=${st}`).toHaveLength(SCALE_INTERVALS[st].length)
      for (const n of notes) {
        expect(n, `scale=${st}`).toBeGreaterThanOrEqual(0)
        expect(n, `scale=${st}`).toBeLessThanOrEqual(11)
      }
    }
  })

  it('按语言与 unicode 开关选择写法', () => {
    expect(getScaleDisplayName(ScaleType.major, true, 'zh')).toBe('大调')
    expect(getScaleDisplayName(ScaleType.major, true, 'en')).toBe('Major')
    expect(getScaleDisplayName(ScaleType.dorianSharp4, true, 'en')).toBe('Dorian ♯4')
    expect(getScaleDisplayName(ScaleType.dorianSharp4, false, 'en')).toBe('Dorian #4')
    expect(getScaleDisplayName(ScaleType.lydianSharp9, true, 'en')).toBe('Lydian ♯9')
    expect(getScaleDisplayName(ScaleType.alteredDominantFlatFlat7, true, 'en')).toBe('Altered Dominant 𝄫7')
    // 2026-09-24 为 9b13 补入的音阶
    expect(getScaleDisplayName(ScaleType.mixolydianFlat6, true, 'en')).toBe('Mixolydian ♭6')
    expect(getScaleDisplayName(ScaleType.mixolydianFlat6, false, 'en')).toBe('Mixolydian b6')
    expect(getScaleDisplayName(ScaleType.mixolydianFlat6, true, 'zh')).toBe('混合利底亚b6')
  })
})

describe('和弦 → 音阶：每个候选音阶都必须完整包含和弦的全部音', () => {
  // 13sus4b9 要同时含 sus4 的 11(5)、b9(1)、13(9) —— 全库音阶无一满足，
  // 故它唯一的候选 phrygianDominant 只能算「近似」（它给 b13 而非 13）。
  const EXEMPT = new Set<string>(['thirteenSusFourFlatNine'])

  it('豁免清单外，候选音阶缺任何一个和弦音都算失败', () => {
    const failures: string[] = []
    for (const ct of ALL_CHORD_TYPES) {
      if (EXEMPT.has(ct)) continue
      const chord = CHORD_INTERVALS[ct].map(mod12)
      for (const st of CHORD_SCALE_OPTIONS[ct] ?? []) {
        const scale = (SCALE_INTERVALS[st] ?? []).map(mod12)
        const missing = chord.filter(x => !scale.includes(x))
        if (missing.length) {
          failures.push(`chord=${ct} 和弦音=${JSON.stringify(chord)} → 音阶 ${st} 缺 [${missing.join(', ')}]`)
        }
      }
    }
    expect(failures, `\n${failures.join('\n')}`).toEqual([])
  })

  it('豁免清单里的和弦仍然无解（哪天补上音阶，这条会提醒删掉豁免）', () => {
    for (const ct of EXEMPT) {
      const chord = CHORD_INTERVALS[ct as ChordType].map(mod12)
      const allCovered = (CHORD_SCALE_OPTIONS[ct as ChordType] ?? []).every(st => {
        const scale = (SCALE_INTERVALS[st] ?? []).map(mod12)
        return chord.every(x => scale.includes(x))
      })
      expect(allCovered, `${ct} 的候选音阶已全部合规，请把它从豁免清单删掉`).toBe(false)
    }
  })
})
