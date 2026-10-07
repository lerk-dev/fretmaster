/**
 * 练习等级数据（lib/practice-levels.ts，57 个等级 / 12 个分组）的契约测试。
 *
 * 这是「练习出题与判分」的唯一真相源：`sequences` 里的数字是 1-based 音级位置，
 * `getChordDegrees` 直接拿它去取「和弦对应音阶」上的音 —— 缺项或空数组会让练习
 * 静默失效（历史上「音级序列为空 → 练习无反应」就是这么来的）。该文件此前零测试。
 */
import { describe, it, expect } from 'vitest'
import {
  ALL_PRACTICE_LEVELS,
  PRACTICE_MODE_GROUPS,
  SINGLE_CHORD_TONES_LEVELS,
  TWO_CHORD_TONES_LEVELS,
  THREE_CHORD_TONES_LEVELS,
  FOUR_CHORD_TONES_LEVELS,
  MELODIC_ROOT_TO_5TH_LEVELS,
  MELODIC_5TH_TO_9TH_LEVELS,
  VOICE_LED_LEVELS,
  SUSPENDED_LEVELS,
  CHORD_SCALES_LEVELS,
  PASSING_NOTE_CHORD_SCALES_LEVELS,
  ALTERED_LEVELS,
  DIMINISHED_SCALES_LEVELS,
  type PracticeLevel,
} from '@/lib/practice-levels'

/** 12 个分组数组，顺序必须与 PRACTICE_MODE_GROUPS 一致 */
const GROUP_ARRAYS: Array<[string, PracticeLevel[]]> = [
  ['single_chord_tones', SINGLE_CHORD_TONES_LEVELS],
  ['two_chord_tones', TWO_CHORD_TONES_LEVELS],
  ['three_chord_tones', THREE_CHORD_TONES_LEVELS],
  ['four_chord_tones', FOUR_CHORD_TONES_LEVELS],
  ['melodic_root_to_5th', MELODIC_ROOT_TO_5TH_LEVELS],
  ['melodic_5th_to_9th', MELODIC_5TH_TO_9TH_LEVELS],
  ['voice_led', VOICE_LED_LEVELS],
  ['suspended', SUSPENDED_LEVELS],
  ['chord_scales', CHORD_SCALES_LEVELS],
  ['passing_note_chord_scales', PASSING_NOTE_CHORD_SCALES_LEVELS],
  ['altered', ALTERED_LEVELS],
  ['diminished_scales', DIMINISHED_SCALES_LEVELS],
]

const REQUIRED_SEQS = ['dominant', 'major', 'minor', 'sus', 'diminished', 'diminishedDominant', 'six'] as const
const OPTIONAL_SEQS = ['altered', 'sus2', 'augmented', 'diminishedMajorSeven'] as const

describe('ALL_PRACTICE_LEVELS 的组成', () => {
  it('等于 12 个分组数组的按序拼接（无遗漏、无重复、无乱序）', () => {
    const concat = GROUP_ARRAYS.flatMap(([, arr]) => arr)
    expect(ALL_PRACTICE_LEVELS.map((l) => l.id)).toEqual(concat.map((l) => l.id))
  })

  it('PRACTICE_MODE_GROUPS 与分组数组一一对应，且 groups[i].levels 就是同一个数组对象', () => {
    expect(PRACTICE_MODE_GROUPS).toHaveLength(GROUP_ARRAYS.length)
    PRACTICE_MODE_GROUPS.forEach((g, i) => {
      // 用引用相等钉住：防止有人只改了其中一个数组/分组而另一处不同步
      expect(g.levels, `第 ${i} 组 (${g.id})`).toBe(GROUP_ARRAYS[i][1])
      expect(g.id, `第 ${i} 组`).toBe(GROUP_ARRAYS[i][0])
      expect(g.levels.length, `组 ${g.id} 不应为空`).toBeGreaterThan(0)
      expect(g.name.length, `组 ${g.id} 英文名`).toBeGreaterThan(0)
      expect(g.nameZh, `组 ${g.id} 中文名`).toMatch(/[\u4e00-\u9fff]/)
    })
    const total = PRACTICE_MODE_GROUPS.reduce((n, g) => n + g.levels.length, 0)
    expect(total).toBe(ALL_PRACTICE_LEVELS.length)
  })

  it('等级 id 与分组 id 都全局唯一', () => {
    const ids = ALL_PRACTICE_LEVELS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    const gids = PRACTICE_MODE_GROUPS.map((g) => g.id)
    expect(new Set(gids).size).toBe(gids.length)
  })
})

describe('每个等级的数据契约', () => {
  it('必填的 sequences 都存在且非空（空序列会让练习静默失效）', () => {
    const bad: string[] = []
    for (const lv of ALL_PRACTICE_LEVELS) {
      for (const k of REQUIRED_SEQS) {
        if (!Array.isArray(lv.sequences[k]) || lv.sequences[k].length === 0) bad.push(`${lv.id}.${k}`)
      }
    }
    expect(bad, `缺失或为空的必填序列:\n${bad.join('\n')}`).toEqual([])
  })

  it('可选的 sequences 要么不定义、要么非空（不允许写成空数组）', () => {
    const bad: string[] = []
    for (const lv of ALL_PRACTICE_LEVELS) {
      for (const k of OPTIONAL_SEQS) {
        const seq = lv.sequences[k]
        if (seq !== undefined && seq.length === 0) bad.push(`${lv.id}.${k}`)
      }
    }
    expect(bad, `被写成空数组的可选序列:\n${bad.join('\n')}`).toEqual([])
  })

  it('sequences 里全是 1..16 的整数音级', () => {
    for (const lv of ALL_PRACTICE_LEVELS) {
      for (const [k, seq] of Object.entries(lv.sequences)) {
        for (const n of seq as number[]) {
          expect(Number.isInteger(n), `${lv.id}.${k} 含非整数 ${n}`).toBe(true)
          expect(n, `${lv.id}.${k} 含越界值 ${n}`).toBeGreaterThanOrEqual(1)
          expect(n, `${lv.id}.${k} 含越界值 ${n}`).toBeLessThanOrEqual(16)
        }
      }
    }
  })

  it('notesPerChord 为正整数、startingIntervalOption 取值合法', () => {
    for (const lv of ALL_PRACTICE_LEVELS) {
      expect(Number.isInteger(lv.notesPerChord), `${lv.id} notesPerChord=${lv.notesPerChord}`).toBe(true)
      expect(lv.notesPerChord, `${lv.id}`).toBeGreaterThanOrEqual(1)
      // 减音阶是 8 音音阶，因此会出现 9（8 音 + 回到起始音），别把上限定成 8
      expect(lv.notesPerChord, `${lv.id}`).toBeLessThanOrEqual(12)
      expect(['any', 'first', 'chordTone'], `${lv.id}`).toContain(lv.startingIntervalOption)
    }
  })

  it('文案字段非空，且中文字段确实是中文', () => {
    for (const lv of ALL_PRACTICE_LEVELS) {
      for (const f of ['id', 'nameKey', 'name', 'nameZh', 'description', 'groupName', 'groupNameZh'] as const) {
        expect(typeof lv[f], `${lv.id}.${f} 类型`).toBe('string')
        expect(lv[f].trim().length, `${lv.id}.${f} 为空`).toBeGreaterThan(0)
      }
      expect(lv.nameZh, `${lv.id}.nameZh`).toMatch(/[\u4e00-\u9fff]/)
      expect(lv.groupNameZh, `${lv.id}.groupNameZh`).toMatch(/[\u4e00-\u9fff]/)
    }
  })

  it('必需布尔开关都是布尔值', () => {
    for (const lv of ALL_PRACTICE_LEVELS) {
      for (const f of ['takeStartingIntervalBeforeOrder', 'orderOption', 'randomOption', 'forceNaturalFive'] as const) {
        expect(typeof lv[f], `${lv.id}.${f}`).toBe('boolean')
      }
    }
  })
})
