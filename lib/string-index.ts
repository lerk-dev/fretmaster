/**
 * 弦号 ↔ 指板行下标 的**唯一真相源**。
 *
 * 🚨 全项目只有一套约定：**下标 0 = 弦号 1 = 最高音弦**（`tuning[0]`），
 * 下标 N-1 = 弦号 N = 最低音弦。指板行、`getNoteAtPosition(stringIndex)`、
 * 各渲染组件的 `stringIndex + 1`、`three-notes-per-string` 的
 * `tuning[stringCount - 1]`（最低音弦）全部按这套走。
 *
 * 历史坑（2026-10-10）：出题端 `generateNewTarget` 写成 `STRING_COUNT - 弦号`
 * （把弦号 1 映射到下标 N-1），与渲染端镜像相反 ⇒「限制弦」里**选中的弦被禁用、
 * 目标落在没选的弦上**。6 弦 63 种选弦组合里 56 种（88.9%）出题位置不可点，
 * 用户报的就是「有时候会出不在该弦上的音，看不到该位置无法答题」——
 * 只有镜像自对称的 7 种组合（如 {1,6}、{3,4}、全选）碰巧正确。
 *
 * 修改或读取弦号时**一律**走这里，不要在别处手写 `±1` 或 `STRING_COUNT - `。
 */

/** 弦号（1..N，1 = 最高音弦）→ 指板行下标（0..N-1，0 = 最高音弦） */
export function stringNumberToIndex(stringNumber: number): number {
  return stringNumber - 1
}

/** 指板行下标（0..N-1，0 = 最高音弦）→ 弦号（1..N） */
export function stringIndexToNumber(stringIndex: number): number {
  return stringIndex + 1
}

/**
 * 「限制弦」选中的弦号集合 → 可用的**行下标**集合。
 *
 * 空集合（或全部越界）视作「不限制弦」⇒ 返回全部下标，与旧的
 * `selectedStrings.length > 0 ? selectedStrings : allStrings` 兜底语义一致。
 * 重复项与越界项被丢弃；结果按弦号升序（= 下标升序）。
 */
export function resolveAvailableStringIndexes(
  selectedStrings: number[],
  stringCount: number,
): number[] {
  const all = Array.from({ length: stringCount }, (_, i) => i)
  if (!selectedStrings || selectedStrings.length === 0) return all
  const valid = Array.from(new Set(
    selectedStrings
      .filter(n => Number.isInteger(n) && n >= 1 && n <= stringCount)
      .map(stringNumberToIndex),
  )).sort((a, b) => a - b)
  return valid.length > 0 ? valid : all
}
