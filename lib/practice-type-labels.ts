/**
 * 练习类型中文标签的**唯一真相源**（铁律 12：同一「量」不许两份判定）。
 *
 * ## 为什么需要它
 *
 * 统计数据的回环是这样的：
 *   写侧 `hooks/use-practice-session.ts` 把 `PracticeType` 翻成中文标签，
 *   随 `recordPractice(type, detailName)` 落库（`exercise_type` 字段存的就是这个标签）；
 *   读侧 `hooks/use-practice-stats.ts::reloadStats` 再把它翻回 `PracticeType` 做聚合。
 *
 * 历史上这两份翻译表是各自硬编码的，且**键覆盖不一致**：
 *   · 写侧用 `pitch_finding → '找音练习'`（v0.2.16 后的新名）；
 *   · 读侧只认 legacy `'音高识别'`，没有 `'找音练习'` —— 靠 `|| 'pitch_finding'`
 *     的兜底**蒙对**（fallback 恰好等于目标值）。
 *   这是最危险的一类正确：改任何一侧的另一条记录、或动一下兜底值，
 *   都会让「找音练习」的记录静默归错类，且没有任何测试会红。
 *
 * ## 边界说明（消费方各取所需，但都从本模块取数）
 *
 *   · `PRACTICE_TYPE_LABELS` —— 写侧与读侧共用的**数据回环**标签表；
 *   · `practiceTypeFromLabel` —— 读侧回转，带 legacy 别名与兜底；
 *   · `lib/export-utils.ts` 的 `EXERCISE_TYPE_MAP` 与 `components/stats-panel.tsx`
 *     的 `typeDisplayMap` 是**显示层超集**（额外认英文 key、'和弦转换' 等历史脏值），
 *     刻意保持宽容，不并入本模块 —— 但它们的「中文标签 → 内部 key」部分
 *     必须与本表一致（有回环护栏测试盯着）。
 */

import type { PracticeType } from '@/lib/page-stats-types'

/**
 * `PracticeType` → 中文标签（写侧：会话结束时按类型写 detailName）。
 *
 * 🚨 字符串值即线上数据：改了写侧，老记录就读不回来（读侧只认这里出现过的值）。
 *    要改名必须先加读侧别名过渡，不能直接改字面量。
 */
export const PRACTICE_TYPE_LABELS: Record<PracticeType, string> = {
  pitch_finding: '找音练习',
  interval: '音程练习',
  scale: '音阶练习',
  chord_exercise: '和弦练习',
  chord_progression: '和弦进行',
}

/**
 * 中文标签 → `PracticeType`（读侧：从落库记录还原类型）。
 *
 * 行为与收敛前的读侧**完全等价**：
 *   · 识别 5 个当前标签（含 `'找音练习'` —— 收敛前它靠兜底蒙对，这里显式认）；
 *   · 识别 legacy `'音高识别'`（v0.2.16 之前写侧用的名字，老记录里仍有）；
 *   · 其余一律兜底 `pitch_finding`（与收敛前 `|| 'pitch_finding'` 相同 ——
 *     未知类型不猜，宁可归进「练习」大类，统计也不会崩）。
 */
export function practiceTypeFromLabel(label: string): PracticeType {
  switch (label) {
    case PRACTICE_TYPE_LABELS.pitch_finding:
    case '音高识别': // legacy：老版本写侧名，历史记录里仍有
      return 'pitch_finding'
    case PRACTICE_TYPE_LABELS.interval:
      return 'interval'
    case PRACTICE_TYPE_LABELS.scale:
      return 'scale'
    case PRACTICE_TYPE_LABELS.chord_exercise:
      return 'chord_exercise'
    case PRACTICE_TYPE_LABELS.chord_progression:
      return 'chord_progression'
    default:
      return 'pitch_finding'
  }
}
