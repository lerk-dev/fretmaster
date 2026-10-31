/**
 * lib/note-spelling.ts 的护栏（审计 2026-10-31 第 5 项）。
 *
 * 核心不变量：**七声音阶的 7 个音必须落在 7 个不同的字母上**。
 * 这条不变量是唯一能把「固定 12 音表查音名」这个错误钉死的东西 ——
 * 旧实现在 C♯ / F♯ 上输出「两个 F、没有 E」，肉眼很难在长列表里发现。
 */
import { describe, it, expect } from 'vitest'
import {
  spellDegree,
  spellDegreeForDisplay,
  spellDegrees,
  spellRoot,
  spellChord,
  parseDegreeLabel,
  NATURAL_LETTERS,
} from '@/lib/note-spelling'
import { SCALE_INTERVALS, SCALE_INTERVAL_DISPLAY, ScaleType } from '@/lib/scale-theory'
import { CHORD_INTERVALS, ChordType } from '@/lib/chord-theory'

const letterOf = (name: string) => name.charAt(0)
const pcOf = (pc: number) => ((pc % 12) + 12) % 12
const ALL_ROOTS = Array.from({ length: 12 }, (_, i) => i)

describe('根音拼写', () => {
  it('黑色键的两种拼写都正确（同一个 pc 两个名字）', () => {
    expect(spellRoot(1, 'sharp')).toBe('C♯')
    expect(spellRoot(1, 'flat')).toBe('D♭')
    expect(spellRoot(3, 'sharp')).toBe('D♯')
    expect(spellRoot(3, 'flat')).toBe('E♭')
    expect(spellRoot(6, 'sharp')).toBe('F♯')
    expect(spellRoot(6, 'flat')).toBe('G♭')
  })

  it('不指定偏好时：黑键取降号侧，唯独 F♯ 用升号（吉他习惯）', () => {
    expect(spellRoot(1)).toBe('D♭')
    expect(spellRoot(6)).toBe('F♯')
    expect(spellRoot(10)).toBe('B♭')
  })

  it('自然音没有升降号', () => {
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) {
      expect(spellDegrees(pc, ['1'])[0]).toBe(spellRoot(pc, 'sharp'))
      expect(spellDegrees(pc, ['1'])[0]).toBe(spellRoot(pc, 'flat'))
    }
  })
})

describe('🚨 七声音阶：7 个音必须是 7 个不同字母', () => {
  /** 只有「音级数字互不重复」的音阶才满足这个不变量（blues 的 ♭5 与 ♮5 同字母是正常的） */
  const heptatonic = (Object.values(ScaleType) as ScaleType[]).filter((st) => {
    const degrees = SCALE_INTERVAL_DISPLAY[st] ?? []
    const numbers = degrees.map((d) => parseDegreeLabel(d)?.degreeNumber).filter((n) => n !== undefined)
    return degrees.length === 7 && new Set(numbers).size === 7
  })

  it('至少覆盖到全部七声调式（防止过滤条件写错后这个 describe 变成空跑）', () => {
    expect(heptatonic.length).toBeGreaterThanOrEqual(15)
  })

  it.each(heptatonic)('%s：12 个根音 × 两种拼写偏好，字母都唯一', (scaleType) => {
    const degrees = SCALE_INTERVAL_DISPLAY[scaleType]
    for (const prefer of ['sharp', 'flat'] as const) {
      for (const root of ALL_ROOTS) {
        const names = spellDegrees(root, degrees, prefer)
        const letters = names.map(letterOf)
        expect(
          new Set(letters).size,
          `${spellRoot(root, prefer)} ${scaleType}（${prefer}）→ ${names.join(' ')} 有重复字母`,
        ).toBe(7)
      }
    }
  })

  it('C♯ 大调 = C♯ D♯ E♯ F♯ G♯ A♯ B♯（旧实现给的是 C♯ D♯ F F♯ G♯ A♯ C）', () => {
    expect(spellDegrees(1, SCALE_INTERVAL_DISPLAY[ScaleType.major], 'sharp')).toEqual([
      'C♯', 'D♯', 'E♯', 'F♯', 'G♯', 'A♯', 'B♯',
    ])
  })

  it('F♯ 大调 = F♯ G♯ A♯ B C♯ D♯ E♯（旧实现给的是 F♯ G♯ A♯ B C♯ D♯ F）', () => {
    expect(spellDegrees(6, SCALE_INTERVAL_DISPLAY[ScaleType.major], 'sharp')).toEqual([
      'F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯',
    ])
  })

  it('降号侧：D♭ 大调 = D♭ E♭ F G♭ A♭ B♭ C', () => {
    expect(spellDegrees(1, SCALE_INTERVAL_DISPLAY[ScaleType.major], 'flat')).toEqual([
      'D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C',
    ])
  })

  it('降号侧回归：E♭ 大调 = E♭ F G A♭ B♭ C D（别把原本正确的调改坏）', () => {
    expect(spellDegrees(3, SCALE_INTERVAL_DISPLAY[ScaleType.major], 'flat')).toEqual([
      'E♭', 'F', 'G', 'A♭', 'B♭', 'C', 'D',
    ])
  })

  it('小调：C♯ 自然小调 = C♯ D♯ E F♯ G♯ A B', () => {
    expect(spellDegrees(1, SCALE_INTERVAL_DISPLAY[ScaleType.naturalMinor], 'sharp')).toEqual([
      'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A', 'B',
    ])
  })
})

describe('和弦拼写', () => {
  it('C♯ 大七 = C♯ E♯ G♯ B♯（旧实现给的是 C♯ F G♯ C）', () => {
    expect(spellChord(1, CHORD_INTERVALS[ChordType.majorSeven], 'sharp')).toEqual([
      'C♯', 'E♯', 'G♯', 'B♯',
    ])
  })

  it('F♯ 大七 = F♯ A♯ C♯ E♯（旧实现给的是 F♯ A♯ C♯ F）', () => {
    expect(spellChord(6, CHORD_INTERVALS[ChordType.majorSeven], 'sharp')).toEqual([
      'F♯', 'A♯', 'C♯', 'E♯',
    ])
  })

  it('增三和弦的五音是 ♯5 不是 ♭6（C aug = C E G♯）', () => {
    expect(spellChord(0, CHORD_INTERVALS[ChordType.augmentedTriad])).toEqual(['C', 'E', 'G♯'])
  })

  it('减三/减七和弦用 ♭5 / ♭♭7（C dim7 = C E♭ G♭ B♭♭）', () => {
    expect(spellChord(0, CHORD_INTERVALS[ChordType.diminishedTriad])).toEqual(['C', 'E♭', 'G♭'])
    expect(spellChord(0, CHORD_INTERVALS[ChordType.diminished])).toEqual([
      'C', 'E♭', 'G♭', 'B♭♭',
    ])
  })

  it('属七 / 挂四：C7 = C E G B♭，Csus4 = C F G', () => {
    expect(spellChord(0, CHORD_INTERVALS[ChordType.dominantSeven])).toEqual(['C', 'E', 'G', 'B♭'])
    expect(spellChord(0, CHORD_INTERVALS[ChordType.susFourTriad])).toEqual(['C', 'F', 'G'])
  })

  it('全表和弦：字母不重复，且每个音名可解析回原 pc', () => {
    for (const type of Object.values(ChordType) as ChordType[]) {
      const intervals = CHORD_INTERVALS[type] ?? []
      if (intervals.length === 0) continue
      for (const root of ALL_ROOTS) {
        const names = spellChord(root, intervals)
        expect(names.length).toBe(intervals.length)
        for (const [i, name] of names.entries()) {
          // 音名 → pc 必须与「根音 + 音程」一致（拼写可以不同，音高不能变）
          const spelledPc = pcFromName(name)
          expect(spelledPc, `${spellRoot(root)} ${type}: ${name}`).toBe(pcOf(root + intervals[i]))
        }
      }
    }
  })
})

describe('显示层：♯/♭ 偏好（spellDegreeForDisplay）', () => {
  it('理论拼写与偏好一致时原样返回（不破坏 C♯ 大调的 E♯）', () => {
    expect(spellDegreeForDisplay(1, '3', 'sharp')).toBe('E♯')
    expect(spellDegreeForDisplay(1, '7', 'sharp')).toBe('B♯')
    expect(spellDegreeForDisplay(3, 'b3', 'flat')).toBe('G♭')
  })

  it('偏好与理论拼写冲突时取等音（洛里亚的 ♭2 在升号偏好下写 C♯）', () => {
    expect(spellDegree(0, 'b2', 'sharp').name).toBe('D♭')
    expect(spellDegreeForDisplay(0, 'b2', 'sharp')).toBe('C♯')
    expect(spellDegreeForDisplay(0, 'b2', 'flat')).toBe('D♭')
  })

  it('利底亚的 ♯4 在降号偏好下取等音', () => {
    expect(spellDegree(0, '#4', 'flat').name).toBe('F♯')
    expect(spellDegreeForDisplay(0, '#4', 'flat')).toBe('G♭')
  })

  it('不传偏好时不做任何等音替换', () => {
    expect(spellDegreeForDisplay(0, 'b2')).toBe('D♭')
    expect(spellDegreeForDisplay(0, '#4')).toBe('F♯')
  })
})

describe('音级解析', () => {
  it('前缀升降号与度数分开解析，支持重升重降', () => {
    expect(parseDegreeLabel('1')).toEqual({ degreeNumber: 1, accidental: 0 })
    expect(parseDegreeLabel('b3')).toEqual({ degreeNumber: 3, accidental: -1 })
    expect(parseDegreeLabel('#4')).toEqual({ degreeNumber: 4, accidental: 1 })
    expect(parseDegreeLabel('bb7')).toEqual({ degreeNumber: 7, accidental: -2 })
    expect(parseDegreeLabel('##5')).toEqual({ degreeNumber: 5, accidental: 2 })
    expect(parseDegreeLabel('maj7')).toEqual({ degreeNumber: 7, accidental: 0 })
    expect(parseDegreeLabel('b13')).toEqual({ degreeNumber: 13, accidental: -1 })
  })

  it('解析不了时退化成根音（不许返回空串或 NaN）', () => {
    expect(spellDegree(4, 'nonsense').name).toBe('E')
  })

  it('复合音级（9/11/13）按 mod-12 落到正确的字母', () => {
    expect(spellDegree(0, '9').name).toBe('D')
    expect(spellDegree(0, '11').name).toBe('F')
    expect(spellDegree(0, '13').name).toBe('A')
  })
})

describe('完整音阶表抽样：字母数 = 音级数', () => {
  it('每个音阶在每个根音上都能给出与音级数量一致的音名', () => {
    for (const scaleType of Object.values(ScaleType) as ScaleType[]) {
      const degrees = SCALE_INTERVAL_DISPLAY[scaleType]
      const intervals = SCALE_INTERVALS[scaleType]
      if (!degrees || !intervals) continue
      expect(degrees.length, `${scaleType} 的音级表与半音表长度不一致`).toBe(intervals.length)
      for (const root of ALL_ROOTS) {
        expect(spellDegrees(root, degrees).length).toBe(degrees.length)
      }
    }
  })
})

/** 音名（字母 + 升降号）→ pitch class；只给测试用，独立于被测实现。 */
function pcFromName(name: string): number {
  const letter = NATURAL_LETTERS.indexOf(name.charAt(0) as (typeof NATURAL_LETTERS)[number])
  const rest = name.slice(1)
  const accidentals = [...rest].reduce((sum, ch) => sum + (ch === '♯' ? 1 : ch === '♭' ? -1 : 0), 0)
  const base = [0, 2, 4, 5, 7, 9, 11][letter]
  return pcOf(base + accidentals)
}
