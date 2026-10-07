/**
 * 和弦类型「登记一致性」契约 + 补上 `11`（属十一和弦）的验证。
 *
 * 起因：`getChordDegrees` 的 `extendedChordMap` 里有一条 `'11'` 的度数序列，
 * 但 `CHORD_TYPES` 并没有 `11` 这个类型 —— 于是那条**永远走不到**
 * （函数开头 `if (!chordType) return ["1"]` 先返回了），iReal 导入的 `11`
 * 也只能退到 `9`。而 `DISPLAY_NAMES` 的四个模式段、i18n 的 `chord_11`
 * **都已经写好了** —— 说明当初就是漏了 CHORD_TYPES 这一条。
 *
 * 第一条断言是结构性的：任何新加的和弦类型都必须在 4 种显示模式下有显示名，
 * 否则界面会漏出类型 key（`getChordDisplayName` 是 `chordTypes[type] || type`）。
 */
import { describe, it, expect } from 'vitest'
import { CHORD_TYPES, DISPLAY_NAMES } from '@/lib/page-theory-data'
import {
  getChordDegrees,
  getChordDisplayName,
  getScaleForChord,
  getSequenceTypeForChord,
} from '@/lib/page-theory-functions'
import { irealQualityToProjectType } from '@/lib/song-chords'

const MODES = ['chinese', 'english', 'english_short', 'jazz'] as const

describe('和弦类型登记一致性：CHORD_TYPES 与 DISPLAY_NAMES 必须对齐', () => {
  /**
   * 四段（chinese / english / english_short / jazz）的键集合**必须完全一致** ——
   * 这不只是风格问题：`getChordDisplayName` 里写的是
   *   `DISPLAY_NAMES[displayMode].chordTypes[chordType as keyof typeof ...chinese.chordTypes]`
   * 而 `DISPLAY_NAMES[displayMode].chordTypes` 是四个对象类型的**联合**，
   * 索引的键必须同时存在于四个成员上，否则直接编译报错（TS2551）。
   * 本条的实测教训：只想给中文段补 25 个名字 → tsc 立刻报 `Property 'dimMaj7' does not exist`。
   */
  it('四种模式的 chordTypes 键集合完全一致', () => {
    const keysOf = (mode: (typeof MODES)[number]) =>
      Object.keys(DISPLAY_NAMES[mode].chordTypes as Record<string, string>).sort()
    const base = keysOf('chinese')
    for (const mode of MODES) {
      expect({ mode, keys: keysOf(mode) }).toEqual({ mode, keys: base })
    }
  })

  /**
   * 曾经有 25 个和弦类型在四段里都没有条目（`7alt` / `maj13` / `m7b5nat9` …），
   * 于是 `getChordDisplayName` 回退成类型 key，**中文界面直接显示记谱**。
   * 已四段同步补齐（各 40 → 65 键）。下面两条把「必须完整」钉死，
   * 以后再加和弦类型却忘了登记显示名，就会在这里失败。
   */
  it('每个和弦类型在四段里都有条目（不得回退成类型 key）', () => {
    // 注意用 `in` 而不是 `!table[name]`：english_short 的 `Major` 值是**空串**
    // （简写模式下大三和弦只写根音），那是既有约定，不是缺失。
    const gaps: string[] = []
    for (const mode of MODES) {
      const table = DISPLAY_NAMES[mode].chordTypes as Record<string, string>
      for (const ct of CHORD_TYPES) if (!(ct.name in table)) gaps.push(`${mode} 缺 ${ct.name}`)
    }
    expect(gaps).toEqual([])
  })

  it('中文段的每个名字都是真中文名（不得等于类型记谱）', () => {
    const bad: string[] = []
    for (const ct of CHORD_TYPES) {
      const zh = getChordDisplayName(ct.name, 'chinese')
      if (!zh || zh === ct.name || !/[\u4e00-\u9fa5]/.test(zh)) bad.push(`${ct.name} → "${zh}"`)
    }
    expect(bad).toEqual([])
  })

  it('四段里唯一的空串是 english_short 的 `Major`（既有约定，钉住防漂移）', () => {
    const empties: string[] = []
    for (const mode of MODES) {
      const table = DISPLAY_NAMES[mode].chordTypes as Record<string, string>
      for (const ct of CHORD_TYPES) if (table[ct.name] === '') empties.push(`${mode}/${ct.name}`)
    }
    expect(empties).toEqual(['english_short/Major'])
  })

  it('每个类型都能被 getChordDegrees 解析（不得退化成「只弹根音」）', () => {
    const bad = CHORD_TYPES.filter((ct) => getChordDegrees(ct.name).length <= 1).map((ct) => ct.name)
    expect(bad).toEqual([])
  })
})

describe('属十一和弦（11）—— 补齐 CHORD_TYPES 后的行为', () => {
  it('已登记在 CHORD_TYPES 里，音程为 1 3 5 b7 9 11', () => {
    const ct = CHORD_TYPES.find((c) => c.name === '11')
    expect(ct).toBeDefined()
    expect(ct!.intervals).toEqual([0, 4, 7, 10, 14, 17])
  })

  it('extendedChordMap 里那条曾经不可达的 `11` 序列现在可达', () => {
    // level 为 undefined / 'all' 时走 extendedChordMap
    expect(getChordDegrees('11')).toEqual(['1', '3', '5', 'b7', '9', '11'])
  })

  it('按属和弦路由：音阶 mixolydian、序列类型 dominant', () => {
    expect(getScaleForChord('11')).toBe('mixolydian')
    expect(getSequenceTypeForChord('11')).toBe('dominant')
  })

  it('iReal 的 `11` 映射到自身（不再退到 9）', () => {
    expect(irealQualityToProjectType('11')).toBe('11')
  })

  it('四种显示模式的中文/英文名都在', () => {
    expect(getChordDisplayName('11', 'chinese')).toBe('属十一和弦')
    for (const mode of MODES) {
      expect(getChordDisplayName('11', mode)).toBeTruthy()
    }
  })
})
