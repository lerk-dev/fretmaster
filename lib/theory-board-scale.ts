/**
 * 「乐理知识页图形缩放」的真相源。
 *
 * ## 为什么需要独立于全局 `displayScale`
 *
 * 全局显示缩放（`lib/display-scale.ts`）改的是 `html` 根字号 ⇒ 字号变大，但**指板格子
 * 是固定 rem 高度**（`--ft-row-h`）⇒ 大屏上字变大了、图没跟着变大，比例反而更失衡。
 * 用户侧的原话是「整体放大页面又不太美观」，所以这里给乐理页的图**单独**一个倍率。
 *
 * ## 命名与作用域
 *
 * 倍率以 CSS 变量 `--board-scale` 下发，只在 `TheoryPanel` 根节点上设置 ⇒
 * 练习页的 `.ft-stage`（GuitarRun trainer 皮肤）读不到该变量，`var(--board-scale, 1)`
 * 自动退回 1，**不会被乐理页的设置影响**。
 *
 * ## 谁乘这个倍率、谁不乘
 *
 * 乘：格子行高、圆点直径、空弦列宽、品号行高、圆点字号、mini 指板格子、五度圈 SVG。
 * 不乘：弦线粗细、品丝、琴枕、品记点、1px 分隔线 —— 它们是**乐器比例件**，
 *       与 `display-scale.ts` 的取舍一致（放大只会把它们糊成一团）。
 */

/** 倍率区间。上限 1.8：再大 CAGED 的五个形状在 1440 宽下会各占一行。 */
export const BOARD_SCALE_MIN = 0.8
export const BOARD_SCALE_MAX = 1.8
export const BOARD_SCALE_DEFAULT = 1
/** 控件步进（百分比） */
export const BOARD_SCALE_STEP = 0.1

/** localStorage 键。独立于 store 的 persist —— 这是单页显示偏好，不属于全局设置。 */
export const BOARD_SCALE_STORAGE_KEY = 'fretmaster-theory-board-scale'

/**
 * 把任意来源的倍率收敛为可信值。
 *
 * 值来自 localStorage（`JSON.parse` 不保证类型）⇒ 必须防 `NaN` / `Infinity` /
 * 字符串数字 / 越界值。任一不合法都回落到 1（不缩放），绝不让非法值进 DOM 样式。
 * 合法值取整到 2 位小数，避免 `0.8 + 0.1` 这类浮点尾巴累积（`0.9000000000000001`）。
 */
export function normalizeBoardScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BOARD_SCALE_DEFAULT
  if (value < BOARD_SCALE_MIN || value > BOARD_SCALE_MAX) return BOARD_SCALE_DEFAULT
  return Math.round(value * 100) / 100
}

/** 步进一档，并钳在区间内（供「−/+」按钮用） */
export function stepBoardScale(current: number, delta: number): number {
  const next = normalizeBoardScale(current) + delta
  return Math.min(BOARD_SCALE_MAX, Math.max(BOARD_SCALE_MIN, Math.round(next * 100) / 100))
}

/**
 * 读持久化值。读不到 / 解析失败 / 非法值 ⇒ 默认 1。
 *
 * 存储里直接存数字（不是 JSON 对象），解析失败时 `Number('') === 0` 会被 normalize 拦掉。
 */
export function readStoredBoardScale(storage?: Pick<Storage, 'getItem'>): number {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return BOARD_SCALE_DEFAULT
    const raw = store.getItem(BOARD_SCALE_STORAGE_KEY)
    if (raw === null) return BOARD_SCALE_DEFAULT
    return normalizeBoardScale(Number(raw))
  } catch {
    // 隐私模式 / 配额异常下 localStorage 读取会抛 —— 静默回落，不能让 UI 崩
    return BOARD_SCALE_DEFAULT
  }
}

/** 写持久化值。写入失败（隐私模式、配额）只忽略：缩放是显示偏好，丢一次不影响使用。 */
export function writeStoredBoardScale(scale: number, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    store?.setItem(BOARD_SCALE_STORAGE_KEY, String(normalizeBoardScale(scale)))
  } catch {
    /* 忽略：显示偏好写不进去不值得打断用户 */
  }
}
