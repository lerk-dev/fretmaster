/**
 * 「这台机器是不是老用户」的**唯一真相源**。
 *
 * 🚨 背景（0.2.220 exe「能打开、但点哪都没反应」的根因）：
 *   `onboarding-context.tsx` 的自动启动只看 onboarding 自己那个
 *   `fretmaster-onboarding` 键。实测用户机器上这个键**丢了**
 *   （WebView2 leveldb 里 7/20 的 000005.ldb 里有，之后全库搜不到），
 *   于是每次启动都被判成「首次访问」，1 秒后弹出全屏
 *   `bg-black/60 pointer-events-auto` 遮罩吞掉所有点击。
 *
 * 🚨 为什么不能只信 onboarding 的键（= 铁律 21「持久化意图 ≠ 运行时状态」）：
 *   键会丢（清理、迁移、WebView2 profile 重建、版本升级路径变化），
 *   而**「用户用过这个 app」这件事有另一份独立证据**：
 *   zustand persist 的 `fretmaster-store`。它由 `lib/store.ts:1018` 落盘，
 *   只要 app 真正跑起来并发生过一次状态变更就会存在。
 *
 * 为什么不直接读练习统计（`fretmaster-stats` / SQLite）：
 *   桌面端统计在 SQLite，启动时**异步**加载；拿它做同步判据会引入竞态
 *   （先判「没记录」→ 弹教程 → 记录才加载出来），正是铁律 21 反例。
 *
 * 判据语义（三态，别压成布尔）：
 *  - `true`  ：有使用痕迹 ⇒ 老用户，不该被强弹教程
 *  - `false` ：确定没有任何痕迹 ⇒ 新用户，弹教程是对的
 *  - `null`  ：读不出来（JSON 损坏 / 环境异常）⇒ **当作 false**（新用户），
 *              宁可多弹一次教程，也不能让老用户被全屏遮罩锁死。
 */
export const LEGACY_USER_EVIDENCE_KEY = 'fretmaster-store'

/**
 * 这台机器上是否已经有过「真正跑过 app」的痕迹。
 *
 * 只读不写，且**永远不抛异常** —— 它会被自动启动路径调用，
 * 抛错就会把「弹教程」变成「应用起不来」。
 */
export function hasExistingUserEvidence(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(LEGACY_USER_EVIDENCE_KEY)
    if (!raw) return false
    // 必须能解析成一个对象才算数：`'null'` / `'0'` / `'""'` 这类
    // 「键存在但没有真实内容」的情况仍应判为新用户。
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0
  } catch {
    // 读不到 / 坏 JSON ⇒ 保守当作没有痕迹
    return false
  }
}
