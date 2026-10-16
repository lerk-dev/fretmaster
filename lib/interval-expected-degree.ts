/**
 * 音程练习「当前该弹哪个音级」的推导。
 *
 * ## 与 `lib/answer-judge.ts` 的分工（2026-10-16）
 *
 * 本函数回答的是「**下一个该弹的音级叫什么**」（返回音级字符串），
 * 供 UI 提示 / 显示用；
 * 而 `lib/answer-judge.ts::buildExpectationFromLabels({ strictOrder: true })`
 * 回答的是「**弹出来的这个音算不算对**」（返回半音集合 + 命中下标），
 * 三条输入路径（音频 / MIDI / 点击）的判定共用它。
 *
 * 两者在「先找根音 + 回弹根音」上的**语义一致**：
 *   - 本函数：`findRootFirst && degrees.includes('1') && !rootCompleted` ⇒ 只认 `'1'`
 *   - 那边：同一条件 ⇒ `activeIndexes = [第一个未完成]`
 *
 * ⚠️ 判定**一律**走 answer-judge；本函数目前只有测试在用（页面原先把它的返回值
 * 当成期望半音，其实是错的 —— 见 `handleFretClick` 的 interval 分支注释）。
 * 若将来页面要显示「下一步弹什么」，用它；若只是判对错，用 answer-judge。
 *
 * ---
 * 音程练习「点击路径」的期望音级推导（原始用途）。
 *
 * `currentIntervalDisplay` 是一串空格分隔的音级，用户需按顺序依次弹出：
 *   - 不先找根音、无回弹: "b3"
 *   - 不先找根音 + 回弹:   "b3 1"
 *   - 先找根音 + 回弹:     "1 b3 1"
 *
 * 点击指板/钢琴时要先知道「现在该点哪个音级」，红/绿反馈才是对的。
 * 此前该处硬用本题目音程（`interval.semitones`），于是「回弹根音」那一拍
 * （display 末位的 1）必然被判成错 —— 与显示串重复同一个 addRootBack 缺陷家族
 * （2026-10-07）。
 */
export function resolveExpectedIntervalDegree(
  display: string,
  completedIndexes: number[],
  findRootFirst: boolean,
): string | null {
  const degrees = display.split(' ')
  const rootCompleted = degrees.some((d, i) => d === '1' && completedIndexes.includes(i))

  // 先找根音模式：根音还没弹出之前，只认根音
  // （串里确实有根音才算「先找根音」，否则退化为顺序推进，避免永远只认根音）
  if (findRootFirst && degrees.includes('1') && !rootCompleted) return '1'

  // 其余情形 = 序列里第一个尚未完成的音级；全部完成时返回 null
  const index = degrees.findIndex((_degree, i) => !completedIndexes.includes(i))
  return index >= 0 ? degrees[index] : null
}
