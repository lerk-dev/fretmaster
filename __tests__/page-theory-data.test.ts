/**
 * lib/page-theory-data.ts 的契约测试（数据表）。
 *
 * 该模块是乐理数据的真相源：音名表 / 度数映射 / 65 种和弦类型 / 音程表 / 76 个音阶模式 /
 * 显示名。chord-type-registry.test.ts 已覆盖 CHORD_TYPES ↔ DISPLAY_NAMES 的显示名一致性；
 * 本文件补的是**其余表内部与表之间的对齐**——尤其 SCALE_MODES 里每个音阶的
 * `notes`（半音数组）与 `intervals`（音级字符串数组）是两份并行手写数据，一旦错位
 * 不会抛异常、只会安静画错音阶。
 *
 * 探针结论：76 个音阶的 notes ↔ intervals ↔ formula 全部自洽，65 个和弦类型的
 * name/symbol 唯一、group 与 groupName/groupZh 一一对应 —— 故本轮为**纯护栏**。
 */
import { describe, it, expect } from 'vitest'
import {
  NOTES,
  NOTES_FLAT,
  DEGREE_TO_SEMITONE,
  CHORD_TYPES,
  INTERVALS,
  SCALE_MODES,
  SCALE_PRACTICE_SEQUENCES,
} from '@/lib/page-theory-data'
import { noteToSemitones, intervalToSemitones, degreeToSemitone, getScaleNoteNames } from '@/lib/page-theory-functions'

// ---------------------------------------------------- 音名表

describe('NOTES / NOTES_FLAT', () => {
  it('都是 12 个音，且逐位互为等音', () => {
    expect(NOTES).toHaveLength(12)
    expect(NOTES_FLAT).toHaveLength(12)
    for (let i = 0; i < 12; i++) {
      expect(noteToSemitones[NOTES[i]], `${NOTES[i]}`).toBe(i)
      expect(noteToSemitones[NOTES_FLAT[i]], `${NOTES_FLAT[i]} 应与 ${NOTES[i]} 等音`).toBe(i)
    }
  })

  it('NOTES 用升号、NOTES_FLAT 用降号（除自然音外）', () => {
    expect(NOTES.filter(n => n.includes('b'))).toEqual([])
    expect(NOTES_FLAT.filter(n => n.includes('#'))).toEqual([])
  })
})

// ---------------------------------------------------- 音阶模式

describe('SCALE_MODES：notes 与 intervals 必须一一对应', () => {
  const allScales = Object.entries(SCALE_MODES).flatMap(([group, scales]) =>
    (scales as Array<{ name: string; notes: number[]; intervals: string[]; formula: string }>).map(s => ({
      group,
      ...s,
    })))

  it('至少含 70 个音阶，每组的 name 都非空且组内不重名', () => {
    expect(allScales.length).toBeGreaterThanOrEqual(70)
    for (const [group, scales] of Object.entries(SCALE_MODES)) {
      const list = scales as Array<{ name: string }>
      expect(list.length, group).toBeGreaterThan(0)
      expect(new Set(list.map(s => s.name)).size, group).toBe(list.length)
    }
  })

  it('每个音阶：notes.length == intervals.length == formula 的音数', () => {
    const failures: string[] = []
    for (const s of allScales) {
      if (s.notes.length !== s.intervals.length) {
        failures.push(`${s.group}/${s.name}: notes=${s.notes.length} intervals=${s.intervals.length}`)
      }
      if (s.formula.split(/\s+/).length !== s.intervals.length) {
        failures.push(`${s.group}/${s.name}: formula 音数不符 '${s.formula}' vs ${s.intervals.join(' ')}`)
      }
    }
    expect(failures, `\n${failures.join('\n')}`).toEqual([])
  })

  it('每个音阶：intervals 推出的半音序列必须等于 notes', () => {
    const failures: string[] = []
    for (const s of allScales) {
      const derived = s.intervals.map(i => {
        const v = DEGREE_TO_SEMITONE[i]
        return v === undefined ? NaN : v % 12
      })
      if (JSON.stringify(derived) !== JSON.stringify(s.notes)) {
        failures.push(`${s.group}/${s.name}: notes=${JSON.stringify(s.notes)} vs intervals 推出 ${JSON.stringify(derived)} (${s.intervals.join(' ')})`)
      }
    }
    expect(failures, `\n${failures.join('\n')}`).toEqual([])
  })

  it('每个音阶的 intervals 元素都是已知音级，且 notes 落在 0..11', () => {
    for (const s of allScales) {
      for (const i of s.intervals) {
        expect(DEGREE_TO_SEMITONE[i], `${s.group}/${s.name} 的音级 '${i}'`).toBeDefined()
      }
      for (const n of s.notes) {
        expect(n, `${s.group}/${s.name}`).toBeGreaterThanOrEqual(0)
        expect(n, `${s.group}/${s.name}`).toBeLessThanOrEqual(11)
      }
    }
  })

  it('每个音阶的 formula 文本与 intervals 一致', () => {
    for (const s of allScales) {
      expect(s.formula.split(/\s+/).join(' '), `${s.group}/${s.name}`).toBe(s.intervals.join(' '))
    }
  })

  it('每个音阶都能被 getScaleNoteNames 完整命名（不得出现空音名）', () => {
    // 钉住修复：degreeToSemitone 曾缺 '#2'，导致含 #2 的音阶（Altered / Augmented Scale /
    // Lydian #9 / Lydian Augmented #2）在 UI 上（page.tsx 用 getScaleNoteNames 展示音名）
    // 会缺音 —— 坏音级会返回空串。
    const failures: string[] = []
    for (const s of allScales) {
      const names = getScaleNoteNames('C', s.intervals)
      if (names.some(n => !n)) {
        failures.push(`${s.group}/${s.name}: ${JSON.stringify(names)} (${s.intervals.join(' ')})`)
      }
    }
    expect(failures, `\n${failures.join('\n')}`).toEqual([])
  })
})

// ---------------------------------------------------- 和弦类型

describe('CHORD_TYPES', () => {
  type ChordType = { name: string; intervals: number[]; symbol: string; group: string; groupName: string; groupZh: string }

  it('每个条目字段完整', () => {
    for (const c of CHORD_TYPES as ChordType[]) {
      expect(c.name, JSON.stringify(c)).toBeTruthy()
      // Major 的 symbol 是空串（大三和弦无后缀），是既有约定，故只要求是字符串
      expect(typeof c.symbol, c.name).toBe('string')
      expect(c.group, c.name).toBeTruthy()
      expect(c.groupName, c.name).toBeTruthy()
      expect(c.groupZh, c.name).toBeTruthy()
      expect(Array.isArray(c.intervals), c.name).toBe(true)
    }
  })

  it('name 与 symbol 都唯一', () => {
    const names = CHORD_TYPES.map((c: ChordType) => c.name)
    const symbols = CHORD_TYPES.map((c: ChordType) => c.symbol)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(symbols).size).toBe(symbols.length)
  })

  it('intervals 以 0（根音）开头，且长度在 3..7', () => {
    for (const c of CHORD_TYPES as ChordType[]) {
      expect(c.intervals[0], c.name).toBe(0)
      expect(c.intervals.length, c.name).toBeGreaterThanOrEqual(3)
      expect(c.intervals.length, c.name).toBeLessThanOrEqual(7)
    }
  })

  it('同一 group 必须对应同一个 groupName / groupZh', () => {
    const byGroup = new Map<string, Set<string>>()
    for (const c of CHORD_TYPES as ChordType[]) {
      if (!byGroup.has(c.group)) byGroup.set(c.group, new Set())
      byGroup.get(c.group)!.add(`${c.groupName}|${c.groupZh}`)
    }
    for (const [group, combos] of byGroup) {
      expect(combos.size, `group '${group}' 对应了多种名称`).toBe(1)
    }
  })

  it('如实记录：恰好 3 个和弦的 intervals 非严格升序（附加音排在末尾）', () => {
    // maj7b6 / maj9b6 / m7b6 把 b6(8) 作为附加音放在数组末尾（maj7 之后），
    // 因此数值上不是升序 —— 这是「先骨架音、后特征附加音」的排列约定，不是错误。
    const unordered = (CHORD_TYPES as ChordType[])
      .filter(c => c.intervals.some((v, i) => i > 0 && v < c.intervals[i - 1]))
      .map(c => c.name)
      .sort()
    expect(unordered).toEqual(['m7b6', 'maj7b6', 'maj9b6'])
  })
})

// ---------------------------------------------------- 度数 / 音程表

describe('度数映射表的一致性', () => {
  it('DEGREE_TO_SEMITONE 与 intervalToSemitones 在共有键上完全一致', () => {
    const diffs: string[] = []
    for (const k of Object.keys(intervalToSemitones)) {
      if (DEGREE_TO_SEMITONE[k] !== intervalToSemitones[k]) {
        diffs.push(`${k}: data=${DEGREE_TO_SEMITONE[k]} fn=${intervalToSemitones[k]}`)
      }
    }
    expect(diffs, diffs.join(' | ')).toEqual([])
    // 反向：data 里多出的键应恰好是这两个（各自用于不同场景）
    const onlyData = Object.keys(DEGREE_TO_SEMITONE).filter(k => !(k in intervalToSemitones)).sort()
    expect(onlyData).toEqual(['#2', 'maj7'])
  })

  it('两套「延伸音表示」在取模 12 后一致（单八度派 vs 含八度派）', () => {
    // DEGREE_TO_SEMITONE / intervalToSemitones 把 9/11/13 记成单八度内（2/5/9）；
    // degreeToSemitone / INTERVALS 记成含八度（14/17/21）。两者 %12 后必须相等。
    for (const k of Object.keys(intervalToSemitones)) {
      const d = degreeToSemitone(k)
      if (d === undefined) continue
      expect(((d % 12) + 12) % 12, `${k}: degreeToSemitone=${d}`).toBe(intervalToSemitones[k] % 12)
    }
  })

  it('INTERVALS 的 symbol→semitones 与 degreeToSemitone（含八度派）一致', () => {
    for (const it of INTERVALS as Array<{ symbol: string; semitones: number }>) {
      expect(degreeToSemitone(it.symbol), it.symbol).toBe(it.semitones)
    }
  })

  it('INTERVALS 的 symbol 唯一', () => {
    const symbols = (INTERVALS as Array<{ symbol: string }>).map(i => i.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })
})

// ---------------------------------------------------- 练习序列

describe('SCALE_PRACTICE_SEQUENCES', () => {
  it('id 唯一、name 非空', () => {
    const ids = SCALE_PRACTICE_SEQUENCES.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SCALE_PRACTICE_SEQUENCES) {
      expect(s.name, s.id).toBeTruthy()
    }
  })

  it('包含 random 项（UI 用 id==="random" 分支处理）', () => {
    expect(SCALE_PRACTICE_SEQUENCES.some(s => s.id === 'random')).toBe(true)
  })
})
