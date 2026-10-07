/**
 * 「当前 tab → 该 tab 的指板显隐开关」的**唯一真相源**。
 *
 * 项目里有三处需要做这个映射：
 *   ① 全屏覆盖层读取 —— 决定全屏时要不要画指板（`components/fullscreen-overlay.tsx`）；
 *   ② ↑ 键的写入 —— 按上箭头「显示指板」（`app/page.tsx` 全局键盘监听）；
 *   ③ ↓ 键的写入 —— 按下箭头「隐藏指板 / 下一题」（同上）。
 *
 * 修前这三处**各写一份** `if (activeTab === 'x') ... else if ...` 链（读那份是三元链）。
 * 当前恰好没有分叉，但两边**顺序已经不同**（读那份把 `interval` 放第一、写那份把
 * `practice` 放第一；读那份 `chord` 在 `chord_exercise` 前、写那份相反）——
 * 顺序不同 + 条件互斥 ⇒ 今天结果一致，**一旦有 tab 同时命中两条分支就会静默分叉**。
 * 更现实的风险：加第 6 个练习 tab 要改 3 个地方，漏一处就「那个 tab 的指板按 ↑ 没反应」。
 *
 * 所以映射（含顺序）收敛到这里，三处一律调用本模块。
 *
 * 🚨 这里**只**管「指板显隐」这一个量。tab → 其它东西（配色、音级、答题反馈）的映射
 * 各自有真相源（`lib/fretboard-cell-role.ts` / `lib/fretboard-note-button-color.ts`），
 * 别往这里塞。
 */

/**
 * 练习 tab 的**顺序与全集**（数字键 1..N 的映射也是它，见 `app/page.tsx` 的键盘处理）。
 *
 * 🚨 这个顺序是**对外契约**（数字键切换 tab），不是随便排的。改顺序等于改快捷键。
 */
export const PRACTICE_TABS = ['practice', 'interval', 'chord_exercise', 'chord', 'scale'] as const

/** 练习 tab 字面量联合。`activeTab` 本身是宽松的 `string`（还有 stats / theory / course 等非练习页）。 */
export type PracticeTab = (typeof PRACTICE_TABS)[number]

/**
 * 每个练习 tab 对应的指板开关在**页面状态里的名字**。
 *
 * 名字即契约：`app/page.tsx` 用它们既是本地 state 变量名、又是传给子组件的 prop 名。
 * 全屏覆盖层没有这些 state，只能接收**同名 prop** 再按当前 tab 选一个 —— 那就是下面
 * `pickTabFretboardFlag` 的用法。
 */
export const TAB_FRETBOARD_FLAG = {
  practice: 'showFretboard',
  interval: 'showIntervalFretboard',
  chord_exercise: 'showChordExerciseFretboard',
  chord: 'showChordFretboard',
  scale: 'showScaleFretboard',
} as const satisfies Readonly<Record<PracticeTab, string>>

/** 开关名（`showFretboard` 等）。 */
export type TabFretboardFlag = (typeof TAB_FRETBOARD_FLAG)[PracticeTab]

/** 某个 tab 是否属于「有指板开关的练习 tab」。 */
export function isPracticeTab(tab: string): tab is PracticeTab {
  return (PRACTICE_TABS as readonly string[]).includes(tab)
}

/**
 * 取该 tab 的指板开关名。
 * 非练习 tab（stats / theory / course / tuner…）返回 `null` —— 它们**没有**这个开关，
 * 调用方必须据此跳过，不许拿一个假名字去查表（查不到会被静默当成 false）。
 */
export function getTabFretboardFlag(tab: string): TabFretboardFlag | null {
  return isPracticeTab(tab) ? TAB_FRETBOARD_FLAG[tab] : null
}

/**
 * 从「一批同名开关」里按当前 tab 挑出对应的那个值。
 *
 * 这是全屏覆盖层的用法：它拿到 5 个 prop（`showFretboard` / `showIntervalFretboard` / …），
 * 得知道「现在这个 tab 该看哪一个」。**找不到就是 `false`**（非练习 tab 不该画指板），
 * 且**不需要**调用方自己写 `: false` 兜底 —— 兜底逻辑也只该有一份。
 */
export function pickTabFretboardFlag(
  tab: string,
  flags: Partial<Record<TabFretboardFlag, boolean>>,
): boolean {
  const flag = getTabFretboardFlag(tab)
  if (!flag) return false
  return flags[flag] === true
}
