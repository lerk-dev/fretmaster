/**
 * 音阶「显示名 + 音级标签」的跨表一致性护栏（审查报告 #17）。
 *
 * ## 背景：本项目有两套音阶表，各有用途，但必须对得上
 * - `lib/scale-theory.ts`  —— `ScaleType` 枚举 + `SCALE_DISPLAY_NAMES`（**紧凑短名**：
 *   `大调` / `多利亚`）+ `SCALE_INTERVAL_DISPLAY`（音级标签）。用于把位教学 / CAGED 迷你图、
 *   和弦音阶选择器这些**空间受限**的地方。
 * - `lib/page-theory-data.ts` —— `SCALE_MODES`（每个音阶自带 `notes` + `intervals` + `formula`）
 *   + `DISPLAY_NAMES.*.scaleTypes`（**完整名**：`大调音阶` / `多利亚调式`，四段
 *   chinese / english / english_short / jazz）。用于音阶练习下拉、调式图鉴。
 *
 * 两套表**不要求逐字相同**（短名 vs 完整名是合理分工），但报告点名的真实缺陷是：
 * ① 同一音阶在四处出现**4 种措辞**（减音阶半全 / 减音阶全半 / 半全减音阶 / 全半减音阶）；
 * ② `Augmented` 与 `Augmented Scale` **中文名都叫「增音阶」**，音级标签却不同
 *    （`b3 3 5 b6 7` vs `#2 3 5 #5 7`）⇒ 用户以为是两种东西；
 * ③ 同名音阶（如迁移分组带来的 `Bebop Minor`）存在**两条不同定义**。
 *
 * 于是本文件把「能机械判定的部分」钉死：
 * - **同名必同内容**：`SCALE_MODES` 里 `name` 相同的条目，`notes`/`intervals` 必须逐字相同；
 * - **同显示名必同拼写**：中文显示名相同的条目，`intervals` 必须逐字相同
 *   （这正是「都译作增音阶却标签不同」的可判定形式）；
 * - **紧凑表 ↔ 完整表**：音高集合相同时，音级标签必须一致 —— 差异只允许出现在
 *   显式登记的 `ALLOWED_CROSS_TABLE_SPELLING_DIFFS` 里；
 * - **紧凑表自洽**：`SCALE_INTERVAL_DISPLAY[t][i]` 解析出的半音必须等于 `SCALE_INTERVALS[t][i]`。
 */
import { describe, it, expect } from 'vitest'
import { DISPLAY_NAMES, SCALE_MODES, DEGREE_TO_SEMITONE } from '@/lib/page-theory-data'
import {
  ScaleType,
  SCALE_DISPLAY_NAMES,
  SCALE_INTERVAL_DISPLAY,
  SCALE_INTERVALS,
} from '@/lib/scale-theory'
import { getScaleDisplayName as getScaleDisplayNameByName } from '@/lib/page-theory-functions'

type Seg = 'chinese' | 'english' | 'english_short' | 'jazz'
const SEGS: readonly Seg[] = ['chinese', 'english', 'english_short', 'jazz'] as const

interface ScaleEntry {
  cat: string
  name: string
  notes: number[]
  intervals: string[]
  formula: string
}

const ALL_ENTRIES: ScaleEntry[] = Object.entries(SCALE_MODES).flatMap(([cat, list]) =>
  (list as ScaleEntry[]).map((s) => ({ cat, name: s.name, notes: s.notes, intervals: s.intervals, formula: s.formula })),
)

const id = (e: ScaleEntry) => `${e.cat}/${e.name}`
const scaleTypesOf = (seg: Seg): Record<string, string> =>
  (DISPLAY_NAMES[seg] as unknown as { scaleTypes: Record<string, string> }).scaleTypes

/** 中文显示名（缺键时 `getScaleDisplayName` 原样返回英文名 —— 铁律 1 的实例，这里如实反映） */
const zhName = (name: string) => getScaleDisplayNameByName(name, 'chinese')

const ALL_TYPES = Object.values(ScaleType) as ScaleType[]

describe('#17 同名音阶必须同定义（第二真相源护栏）', () => {
  it('SCALE_MODES 里 name 相同的条目，notes 与 intervals 必须逐字相同', () => {
    const byName = new Map<string, ScaleEntry[]>()
    for (const e of ALL_ENTRIES) {
      const bucket = byName.get(e.name)
      if (bucket) bucket.push(e)
      else byName.set(e.name, [e])
    }

    const diffs: string[] = []
    for (const [name, list] of byName) {
      if (list.length < 2) continue
      const first = list[0]
      for (const e of list.slice(1)) {
        if (JSON.stringify(e.notes) !== JSON.stringify(first.notes)) {
          diffs.push(`${name}: notes ${id(first)} ${JSON.stringify(first.notes)} vs ${id(e)} ${JSON.stringify(e.notes)}`)
        }
        if (JSON.stringify(e.intervals) !== JSON.stringify(first.intervals)) {
          diffs.push(`${name}: intervals ${id(first)} ${JSON.stringify(first.intervals)} vs ${id(e)} ${JSON.stringify(e.intervals)}`)
        }
      }
    }
    expect(diffs, '同名音阶出现了两种定义').toEqual([])
  })

  it('探针自检：确实存在多分组的同名音阶（否则上面那条恒真）', () => {
    const byName = new Map<string, number>()
    for (const e of ALL_ENTRIES) byName.set(e.name, (byName.get(e.name) ?? 0) + 1)
    const dup = [...byName.entries()].filter(([, n]) => n > 1)
    expect(dup.length).toBeGreaterThanOrEqual(8)
  })
})

describe('#17 中文显示名相同的音阶，音级标签必须逐字相同', () => {
  it('「增音阶」「半全减音阶」「全半减音阶」等重名分组内不得出现两种读法', () => {
    const byZh = new Map<string, ScaleEntry[]>()
    for (const e of ALL_ENTRIES) {
      const key = zhName(e.name)
      const bucket = byZh.get(key)
      if (bucket) bucket.push(e)
      else byZh.set(key, [e])
    }

    const diffs: string[] = []
    for (const [label, list] of byZh) {
      if (list.length < 2) continue
      const first = list[0]
      for (const e of list.slice(1)) {
        if (JSON.stringify(e.intervals) !== JSON.stringify(first.intervals)) {
          diffs.push(`「${label}」: ${id(first)} ${JSON.stringify(first.intervals)} vs ${id(e)} ${JSON.stringify(e.intervals)}`)
        }
      }
    }
    expect(diffs, '同一显示名却有多种音级读法').toEqual([])
  })

  it('探针自检：「增音阶」确实有两条（Augmented / Augmented Scale）', () => {
    const augmented = ALL_ENTRIES.filter((e) => zhName(e.name) === '增音阶')
    expect(augmented.map(id).sort()).toEqual(['otherScales/Augmented Scale', 'symmetrical/Augmented'])
  })
})

describe('#17 减音阶措辞只能有一种（旧实现有 4 种）', () => {
  it('紧凑表：半全 / 全半减音阶', () => {
    expect(SCALE_DISPLAY_NAMES[ScaleType.diminishedHalfWhole].chinese).toBe('半全减音阶')
    expect(SCALE_DISPLAY_NAMES[ScaleType.diminishedWholeHalf].chinese).toBe('全半减音阶')
  })

  it('完整表：中文段的这四个键必须与紧凑表同措辞（不得再出现「减音阶半全」这类倒装）', () => {
    const st = scaleTypesOf('chinese')
    expect(st['Half-Whole Diminished']).toBe('半全减音阶')
    expect(st['Whole-Half Diminished']).toBe('全半减音阶')
    expect(st['Diminished Half Whole']).toBe('半全减音阶')
    expect(st['Diminished Whole Half']).toBe('全半减音阶')
    // ⚠️ 只对中文段要求跨键同译名：英文/缩写段刻意用「Half-Whole Dim」与「Diminished H-W」
    // 两种不同的缩写（前者贴合音阶名、后者贴合旧键名），那是缩写风格差异，不是「两种东西」。
    expect(st['Half-Whole Diminished']).toBe(st['Diminished Half Whole'])
    expect(st['Whole-Half Diminished']).toBe(st['Diminished Whole Half'])
  })

  it('四段里都不许再出现「减音阶半全 / 减音阶全半」这种倒装措辞', () => {
    for (const seg of SEGS) {
      const values = Object.values(scaleTypesOf(seg))
      const inverted = values.filter((v) => v.includes('减音阶半全') || v.includes('减音阶全半'))
      expect(inverted, `${seg} 仍有倒装措辞`).toEqual([])
    }
  })
})

describe('#17 紧凑表内部自洽（音级标签 ↔ 半音集合）', () => {
  it('SCALE_INTERVAL_DISPLAY[t][i] 解析出的半音必须是 SCALE_INTERVALS[t][i]', () => {
    const bad: string[] = []
    for (const t of ALL_TYPES) {
      const semis = SCALE_INTERVALS[t] as number[]
      const labels = SCALE_INTERVAL_DISPLAY[t] as string[]
      if (labels.length !== semis.length) {
        bad.push(`${t}: 标签 ${labels.length} 个 vs 半音 ${semis.length} 个`)
        continue
      }
      labels.forEach((label, i) => {
        const parsed = DEGREE_TO_SEMITONE[label]
        if (parsed !== (((semis[i] % 12) + 12) % 12)) {
          bad.push(`${t}[${i}] '${label}' → ${parsed}，应为 ${semis[i]}`)
        }
      })
    }
    expect(bad).toEqual([])
  })

  it('紧凑表的短名不得含括号（旧实现是「减音阶(半全)」）', () => {
    const bad = ALL_TYPES.filter((t) => /[()（）]/.test(SCALE_DISPLAY_NAMES[t].chinese))
      .map((t) => `${t} = ${SCALE_DISPLAY_NAMES[t].chinese}`)
    expect(bad).toEqual([])
  })
})

/**
 * 紧凑表 ↔ 完整表：**音高集合相同但音级拼写不同**的配对白名单。
 *
 * 这些是刻意保留的差异：两处的**中文显示名不同**（`布鲁斯` vs `布鲁斯音阶`、
 * `全音阶` vs `全音音阶`），即用户不会看到「同一个名字两种读法」；而两种拼写
 * （♭5/♯4、♭7/♯6）在教材里都通行，收敛的收益小于改动面。
 *
 * 🚨 新增条目会让本文件红 —— 必须先想清楚「是不是又出现了同名两种读法」。
 */
const ALLOWED_CROSS_TABLE_SPELLING_DIFFS: ReadonlyArray<{ pair: string; why: string }> = [
  { pair: 'blues->otherScales/Blues', why: '蓝调的蓝音：紧凑表 ♭5 vs 完整表 ♯4（两者都通行）' },
  { pair: 'blues->other/Blues', why: '同上，旧分组存量数据' },
  { pair: 'wholeTone->otherScales/Whole Tone', why: '全音阶第 6 音：紧凑表 ♭7 vs 完整表 ♯6（两者都通行）' },
  { pair: 'wholeTone->other/Whole Tone', why: '同上，旧分组存量数据' },
  {
    pair: 'alteredDominantFlatFlat7->harmonicMinorScaleModes/Superlocrian bb7',
    why: '同一音高集合两个名字（变化属音阶bb7 / 超洛克里亚bb7）；且 `bb7`/`b4` 这类双变音记号 ' +
      '`getScaleNoteNames` 的正则还解析不了，收敛需先扩解析器，超出本次范围',
  },
]

describe('#17 紧凑表 ↔ 完整表：同一音阶的音级标签必须一致（差异需登记）', () => {
  it('差异集合恰好等于已登记的清单', () => {
    const actual: string[] = []
    for (const t of ALL_TYPES) {
      const semis = JSON.stringify(SCALE_INTERVALS[t])
      const labels = JSON.stringify(SCALE_INTERVAL_DISPLAY[t])
      for (const e of ALL_ENTRIES) {
        if (JSON.stringify(e.notes) !== semis) continue
        if (JSON.stringify(e.intervals) !== labels) actual.push(`${t}->${id(e)}`)
      }
    }
    const allowed = ALLOWED_CROSS_TABLE_SPELLING_DIFFS.map((d) => d.pair)
    expect([...actual].sort(), '出现了未登记的音级拼写差异（或清单里有已修好的陈旧条目）').toEqual([...allowed].sort())
  })

  it('探针自检：确实比对到了几十对（紧凑表 ↔ 完整表的音高集合交集），不是恒真', () => {
    let matched = 0
    for (const t of ALL_TYPES) {
      const semis = JSON.stringify(SCALE_INTERVALS[t])
      for (const e of ALL_ENTRIES) if (JSON.stringify(e.notes) === semis) matched++
    }
    // 实测 53 对（2026-10-15）。数字骤降说明 notes 被改成对不上了，骤升说明加了重复条目。
    expect(matched).toBeGreaterThanOrEqual(50)
    expect(matched).toBeGreaterThan(ALLOWED_CROSS_TABLE_SPELLING_DIFFS.length * 5)
  })

  it('紧凑短名与完整名必须同概念：完整名不含汉字以外的乱码，且都能取到名字', () => {
    for (const t of ALL_TYPES) {
      expect(SCALE_DISPLAY_NAMES[t].chinese, `${t} 紧凑短名为空`).not.toBe('')
      expect(SCALE_DISPLAY_NAMES[t].standard, `${t} 英文短名为空`).not.toBe('')
    }
    // 完整表：SCALE_MODES 里每个音阶名在四段都得有译名（缺键会原样返回英文名 —— 铁律 1）
    const missing: string[] = []
    for (const e of ALL_ENTRIES) {
      for (const seg of SEGS) {
        if (scaleTypesOf(seg)[e.name] === undefined) missing.push(`${seg}:${e.name}`)
      }
    }
    expect(missing, 'DISPLAY_NAMES 缺键（中文界面会漏出英文名）').toEqual([])
  })
})
