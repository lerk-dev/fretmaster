/**
 * 可访问性（a11y）工具
 *
 * 此前 level-selector-dialog / chord-exercise-level-selector / song-selector-dialog
 * 各复制了一份 activateOnEnterSpace，现统一到此处，新代码不要再抄第四份。
 */

/**
 * 卡片键盘激活：把 Enter / Space 映射为与点击相同的动作。
 * 配合 `role="button"` + `tabIndex={0}` 使用（用于非 <button> 的可点击容器）。
 *
 * 参数类型刻意写成结构化的最小契约（而非 DOM 的 KeyboardEvent），
 * 这样既能直接用于 React 的 onKeyDown，也能用于原生 addEventListener。
 */
/**
 * ## 🚨 行内嵌套按钮：`onKeyDown` 也要 `stopPropagation`
 *
 * 列表行常用的写法是「整行 `role="button"` + 行尾一个收藏/详情 `<Button>`」。
 * 内层按钮的 `onClick` 里写了 `e.stopPropagation()` 只挡**鼠标**；
 * **键盘**激活走的是 keydown，会照旧冒泡到行上，触发 `activateOnEnterSpace`
 * 的「选中该行 + 关闭弹窗」⇒ 用户以为点了星标，结果等级被切换、弹窗关了。
 * （审计 2026-10-31 第 9 项；等级 / 和弦等级 / 曲目三个选择弹窗全中。）
 *
 * 因此行内的真实按钮都要同时写：
 * ```tsx
 * onKeyDown={(e) => e.stopPropagation()}
 * onClick={(e) => { e.stopPropagation(); doSomething() }}
 * ```
 */

export const activateOnEnterSpace =
  (fn: () => void) =>
  (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }
