/**
 * 音程符号 ⇄ `INTERVALS` 下标 的**唯一真相源**。
 *
 * ## 🚨 背景（2026-10-08 用户报「小三度 ♭3 课程点进去练的是 #2」）
 *
 * `IntervalPracticeSettings.selectedIntervals: number[]` 存的是 **`INTERVALS` 的数组下标**，
 * 不是半音数——这是全链路既成事实：
 *   - `components/interval-controls.tsx`：`selectedIntervals.includes(index)` / `onToggleInterval(index)`
 *   - `hooks/use-interval-exercise.ts`：`INTERVALS[idx]` 取 `symbol` 与 `semitones`
 *   - `app/page.tsx` 练习队列：同样 `INTERVALS[idx]`
 *
 * 而课程启动（引导教程「进入练习」）曾写成 `.map(i => i.semitones)`，把**半音数**塞进这个
 * 下标字段 ⇒ 半音数被当作下标解读。实测 18 个课程音程里 14 个错位、其中 12 个连目标音的
 * 半音位置都错（如大三度 `3` → 实际练 b3；大七度 `7` → 实际练 b6）。
 *
 * ## 为什么必须按**符号**正向匹配，不能用半音数反查
 *
 * `INTERVALS` 里异名同音各有其位（`#2` s=3 与 `b3` s=3；`#4`/`b5` s=6；`#5`/`b6` s=8；
 * `6` s=9 与 `bb7` s=9）。从半音数反查只能表达一侧，另一侧必然判错——
 * 这正是「♭3 位置对但标签显示 #2」的来源。所以只能**正向**：符号 → 下标。
 *
 * @see __tests__/interval-index.test.ts
 */

import { INTERVALS } from '@/lib/page-theory-data'

/**
 * 音程符号归一化：Unicode 变体（♭ ♯）→ ASCII（b #），去首尾空白。
 *
 * 课程数据两种写法并存（`CourseDiagram.interval` 用 `♭3`，`launch.intervals` 用 `b3`），
 * 归一化后二者可比。
 */
export function normalizeIntervalSymbol(symbol: string): string {
  return symbol.replace(/♯/g, '#').replace(/♭/g, 'b').trim()
}

/**
 * 单个音程符号 → `INTERVALS` 下标；未命中返回 -1。
 *
 * 匹配依据是**符号本身**（经归一化），不是半音数 ⇒ 异名同音不会被混为一谈。
 */
export function intervalIndexBySymbol(symbol: string): number {
  const want = normalizeIntervalSymbol(symbol)
  return INTERVALS.findIndex((i) => normalizeIntervalSymbol(i.symbol) === want)
}

/**
 * 音程符号列表 → `INTERVALS` 下标列表（按 `INTERVALS` 原顺序、去重、丢弃未命中项）。
 *
 * 返回顺序固定跟随 `INTERVALS`，与入参顺序无关 ⇒ 同一份配置每次得到的练习集合稳定。
 */
export function resolveIntervalIndices(symbols: readonly string[]): number[] {
  if (!symbols || symbols.length === 0) return []
  const wanted = new Set(symbols.map(normalizeIntervalSymbol))
  const out: number[] = []
  INTERVALS.forEach((iv, idx) => {
    if (wanted.has(normalizeIntervalSymbol(iv.symbol))) out.push(idx)
  })
  return out
}

/**
 * 指板要标注的音程集合 = 用户选中集 ∪ **当前题目**显示的音程集。
 *
 * ## 🚨 为什么需要并集（2026-11-03 bug 修复）
 *
 * `lib/interval-direction.ts` 的方向队列在 down/random/either 下放的是**互补音程**：
 * 选中「♭3 + 下行」出的题显示符号是 `6`（目标音 = 根音 +9 半音）。
 * 而指板度数标注（`lib/fretboard-cell-role.ts` / `lib/fretboard-note-button-color.ts`）
 * 只按用户原始 `selectedIntervals` 匹配 ⇒ 下行题的目标度数格**不亮**、反而亮着题目没问的
 * `♭3` 格，与题面符号矛盾。并集后：原始选中集照常作参考图，当前题的度数也一定标出。
 *
 * 顺序：当前题派生的下标在前（异名同音撞格时优先用**题面符号**当标签），
 * 其余按 `selectedIntervals` 原顺序补尾；整体去重。根音符号 `1` 不入集（root 由专属分支管）。
 */
export function effectiveFretboardIntervals(
  selectedIntervals: readonly number[],
  currentIntervalDisplay?: string
): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  const push = (idx: number) => {
    if (idx >= 0 && !seen.has(idx)) {
      seen.add(idx)
      out.push(idx)
    }
  }
  if (currentIntervalDisplay) {
    for (const sym of currentIntervalDisplay.split(/\s+/).filter(Boolean)) {
      if (normalizeIntervalSymbol(sym) === '1') continue
      push(intervalIndexBySymbol(sym))
    }
  }
  for (const idx of selectedIntervals) push(idx)
  return out
}
