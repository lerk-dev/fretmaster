/**
 * 极简 renderHook / 清理工具（测试用）。
 *
 * 为什么不引 @testing-library/react：它的 peer 依赖 @testing-library/dom 本项目没装，
 * 而这里只需要「渲染一个 hook + 读返回值 + 触发重渲染 + 卸载」这点能力，
 * react 自带的 act + react-dom/client 足够。
 *
 * 收敛到一个文件是避免每个 hook 测试各抄一份（抄两份就会漂移）。
 */
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// react-dom 的 act 需要在非 testing-library 环境下显式声明
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

export interface RenderedHook<T> {
  readonly current: T
  unmount: () => void
}

const activeHooks: Array<{ unmount: () => void }> = []

export interface RenderHookOptions {
  /**
   * 用 <StrictMode> 包裹渲染。
   * 用途：state updater 的**纯度**回归 —— StrictMode 会双调用 updater，
   * 若 updater 改写了传入的旧 state，计数就会翻倍（只有 StrictMode 下才暴露）。
   */
  strict?: boolean
}

export function renderHook<T>(hook: () => T, options: RenderHookOptions = {}): RenderedHook<T> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let current: T | undefined

  function Probe() {
    current = hook()
    return null
  }

  const tree = options.strict
    ? createElement(StrictMode, null, createElement(Probe))
    : createElement(Probe)

  act(() => {
    root.render(tree)
  })

  const handle: RenderedHook<T> = {
    get current(): T {
      if (current === undefined) throw new Error('hook 尚未渲染')
      return current
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
  activeHooks.push(handle)
  return handle
}

/** 在 afterEach 里调用，卸载本轮渲染的所有 hook（避免容器与 React 树泄漏到下一个用例） */
export function unmountAllHooks() {
  while (activeHooks.length) activeHooks.pop()!.unmount()
}
