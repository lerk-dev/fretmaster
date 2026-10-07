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
export const activateOnEnterSpace =
  (fn: () => void) =>
  (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }
