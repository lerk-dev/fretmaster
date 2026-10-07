/**
 * 音阶**音级标签**的显示层兜底（`lib/scale-degree-display.ts`）。
 *
 * ## 它只管显示，不参与判定
 * 判定一律走 `lib/scale-target-note.ts`（标签 → 半音 → 音名下标）。显示方向相反
 * （半音 → 标签），**不可避免**要在异名同音里选一侧，所以显示表只能当兜底：
 * 音阶数据自带 `intervals`（正确拼写）时永远优先用它。
 *
 * ## 为什么必须有这么一个文件
 * 2026-10-07 实测：`app/page.tsx` 的音阶信息面板里**相邻两行**各写了一张半音→标签表，
 * 而且互相矛盾 ——
 *   - 音程行：`1 → "b9"`、`6 → "#4"`
 *   - 音符行：`1 → "b2"`、`6 → "b5"`
 * 于是同一个音阶、同一块面板里，1 半音既显示 `b9` 又显示 `b2`，6 半音既显示 `#4` 又显示 `b5`。
 * （`b9` 还是**和弦**语境的写法，放在音阶音级里本身就不对。）
 *
 * 两份真相源的代价不只是「看着别扭」：改一处忘另一处，界面就自相矛盾，而没有任何
 * 报错。所以收敛到这一张表，两行共用。
 */
const SEMITONE_TO_DEGREE_FALLBACK: Readonly<Record<number, string>> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
}

/**
 * 取音阶的音级标签数组。
 *
 * 优先用音阶自带的 `intervals`（它携带该音阶**正确**的升/降拼写，例如 Lydian 是 `#4`、
 * Locrian 是 `b5` —— 兜底表分不清这两者）。只有 `intervals` 缺失时才回落兜底表。
 */
export function scaleDegreeLabels(scale: {
  intervals?: readonly string[] | null
  notes?: readonly number[] | null
}): string[] {
  if (Array.isArray(scale?.intervals) && scale.intervals.length > 0) return [...scale.intervals]
  if (!Array.isArray(scale?.notes)) return []
  return scale.notes.map((n) => SEMITONE_TO_DEGREE_FALLBACK[n % 12] ?? String(n))
}
