/**
 * lib/practice-type-labels.ts 护栏：练习类型中文标签的**唯一真相源**。
 *
 * ## 收敛前的隐患（本文件存在的原因）
 *
 * 统计回环是「写侧把 PracticeType 翻成中文标签落库 → 读侧翻回来聚合」，
 * 而两份翻译表各自硬编码且**键覆盖不一致**：
 *   · 写侧 `pitch_finding → '找音练习'`；
 *   · 读侧只认 legacy `'音高识别'`，没有 `'找音练习'` —— 靠 `|| 'pitch_finding'`
 *     的兜底**蒙对**（fallback 恰好等于目标值）。
 * 这是最危险的一类「正确」：兜底值一改、或另一条记录的键一改，
 * 「找音练习」的记录就静默归错类，且没有任何测试会红。
 *
 * ## 三层判据
 *
 *   ① **回环**：每个 PracticeType 经「标签 → 回转」后必须等于自身
 *      （含显式认 '找音练习' —— 收敛前它只能靠兜底蒙对）；
 *   ② **兼容**：legacy '音高识别' 别名为 pitch_finding；未知值兜底 pitch_finding
 *      （与收敛前 `|| 'pitch_finding'` 完全等价，零行为变化）；
 *   ③ **源码级**：写侧/读侧两个 hook 必须 import 本模块、不得再内联字面量表；
 *      两份显示层超集（export-utils / stats-panel）的「中文标签 → 目标」
 *      必须与本表一致（否则改了标签，显示层会静默miss）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PRACTICE_TYPE_LABELS,
  practiceTypeFromLabel,
} from '@/lib/practice-type-labels'
import type { PracticeType } from '@/lib/page-stats-types'

const TYPES: PracticeType[] = [
  'pitch_finding',
  'scale',
  'chord_exercise',
  'interval',
  'chord_progression',
]

/** 剥注释：否则文件里文档注释提到标签字面量会误报（本仓 doc 块大量引用这些值） */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

describe('practiceTypeFromLabel：数据回环', () => {
  it('① 每个 PracticeType 经「标签 → 回转」后等于自身', () => {
    for (const type of TYPES) {
      expect(
        practiceTypeFromLabel(PRACTICE_TYPE_LABELS[type]),
        `类型 ${type} 的标签「${PRACTICE_TYPE_LABELS[type]}」回转后不等于自身 —— 写侧落库的记录读回来会归错类`,
      ).toBe(type)
    }
  })

  it('① 显式认「找音练习」（收敛前读侧没有这个键，只能靠兜底蒙对）', () => {
    // 这条是收敛前最大的静默隐患：写侧写 '找音练习'，读侧表里没这个键，
    // 靠 fallback 恰好等于 pitch_finding 才「正确」。
    expect(PRACTICE_TYPE_LABELS.pitch_finding).toBe('找音练习')
    expect(practiceTypeFromLabel('找音练习')).toBe('pitch_finding')
  })

  it('① 五个标签互不相同（两个类型共用一个标签 ⇒ 回转有歧义）', () => {
    const labels = TYPES.map((t) => PRACTICE_TYPE_LABELS[t])
    expect(new Set(labels).size).toBe(TYPES.length)
  })
})

describe('practiceTypeFromLabel：历史兼容与兜底', () => {
  it('② legacy「音高识别」仍回转为 pitch_finding（老记录里还有这个值）', () => {
    expect(practiceTypeFromLabel('音高识别')).toBe('pitch_finding')
  })

  it('② 未知值一律兜底 pitch_finding（与收敛前 `|| \'pitch_finding\'` 等价）', () => {
    // 空串 / 任意明细名 / 英文 key（英文 key 只在显示层超集里认，数据回环不认）
    for (const unknown of ['', 'C 大调音阶', 'scale', 'chord_exercise', '练习', '和弦转换']) {
      expect(practiceTypeFromLabel(unknown), `未知值「${unknown}」的兜底行为变了`).toBe('pitch_finding')
    }
  })

  it('② 标签值锁定：五个标签的字符串不得改动（改了等于老记录读不回来）', () => {
    expect(PRACTICE_TYPE_LABELS).toEqual({
      pitch_finding: '找音练习',
      interval: '音程练习',
      scale: '音阶练习',
      chord_exercise: '和弦练习',
      chord_progression: '和弦进行',
    })
  })
})

describe('源码级：两个 hook 必须走唯一真相源，不许再内联字面量表', () => {
  it('③ 写侧 use-practice-session.ts import 真相源，且不再内联 detailNames 表', () => {
    const src = stripComments(readFileSync('hooks/use-practice-session.ts', 'utf8'))
    expect(src, '写侧没有 import 真相源 —— 又要把标签表复制一份？').toContain("from '@/lib/practice-type-labels'")
    expect(src).not.toContain('detailNames')
    // 五个标签字面量一个都不该出现在写侧（都从 PRACTICE_TYPE_LABELS 取）
    for (const label of Object.values(PRACTICE_TYPE_LABELS)) {
      expect(src, `写侧又硬编码了标签「${label}」`).not.toContain(`'${label}'`)
    }
  })

  it('③ 读侧 use-practice-stats.ts import 真相源，且不再内联 typeMapping 表', () => {
    const src = stripComments(readFileSync('hooks/use-practice-stats.ts', 'utf8'))
    expect(src, '读侧没有 import 真相源 —— 读写两侧又会各翻各的').toContain("from '@/lib/practice-type-labels'")
    expect(src).not.toContain('typeMapping')
    expect(src, '读侧又硬编码了 legacy 别名「音高识别」').not.toContain("'音高识别'")
    // 五个标签字面量一个都不该出现在读侧（都从 practiceTypeFromLabel 取）
    for (const label of Object.values(PRACTICE_TYPE_LABELS)) {
      expect(src, `读侧又硬编码了标签「${label}」`).not.toContain(`'${label}'`)
    }
  })
})

describe('源码级：真相源自身的两个「被兜底掩蔽」的 case 必须显式存在', () => {
  /**
   * 🚨 这两个 case 是**唯一两个删了也不红**的变异（2026-10-21 变异验证实测 M2 存活）：
   * `pitch_finding` 的主标签与 legacy 别名、default 兜底三者恰好同值 ⇒ 少写一个 case，
   * 行为上被 default 蒙对。行为测试对此无能为力，只能源码级钉住。
   * 为什么必须显式：兜底值是产品决策（未知类型归「练习」大类），哪天它一改，
   * 这两个 case 就是 legacy 老记录与找音练习记录不回归错类的唯一保障。
   */
  it('③ pitch_finding 主标签与 legacy 别名的 case 必须显式声明', () => {
    const src = stripComments(readFileSync('lib/practice-type-labels.ts', 'utf8'))
    expect(src, 'pitch_finding 主标签的 case 没了 —— 现在靠 default 兜底蒙对，兜底一改就静默归错类')
      .toContain('case PRACTICE_TYPE_LABELS.pitch_finding:')
    expect(src, 'legacy「音高识别」的 case 没了 —— 老记录现在靠 default 兜底蒙对')
      .toContain("case '音高识别':")
  })
})

describe('源码级：显示层超集与真相源一致（改标签不会让显示层静默 miss）', () => {
  /** 从 lib/export-utils.ts 的 EXERCISE_TYPE_MAP 取「中文标签 → 内部 key」 */
  const exportUtilsTarget = (label: string): string | null => {
    const src = stripComments(readFileSync('lib/export-utils.ts', 'utf8'))
    const m = src.match(new RegExp(`'${label}'\\s*:\\s*'([a-z_]+)'`))
    return m ? m[1] : null
  }

  it('③ export-utils 的 EXERCISE_TYPE_MAP：五个标签 + legacy 别名都翻成正确的内部 key', () => {
    for (const type of TYPES) {
      expect(
        exportUtilsTarget(PRACTICE_TYPE_LABELS[type]),
        `export-utils 里「${PRACTICE_TYPE_LABELS[type]}」没有映射到 ${type}`,
      ).toBe(type)
    }
    expect(exportUtilsTarget('音高识别')).toBe('pitch_finding')
  })

  it('③ stats-panel 的 typeDisplayMap：同类型标签显示目标相同、跨类型互不相同', () => {
    const src = stripComments(readFileSync('components/stats-panel.tsx', 'utf8'))
    const targetOf = (label: string): string | null => {
      const m = src.match(new RegExp(`'${label}'\\s*:\\s*t\\('([^']+)'\\)`))
      return m ? m[1] : null
    }

    const byType = new Map<PracticeType, string>()
    for (const type of TYPES) {
      const target = targetOf(PRACTICE_TYPE_LABELS[type])
      expect(target, `stats-panel 的类型映射里找不到标签「${PRACTICE_TYPE_LABELS[type]}」`).not.toBeNull()
      byType.set(type, target!)
    }
    // pitch_finding 的 legacy 别名必须与现名显示一致（否则老记录与新记录显示不同名）
    expect(targetOf('音高识别')).toBe(byType.get('pitch_finding'))
    // 跨类型显示目标不得撞车（撞车 ⇒ 用户分不出是哪种练习）
    expect(new Set(byType.values()).size).toBe(TYPES.length)
  })
})
