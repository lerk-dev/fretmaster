/**
 * components/title-bar.tsx 的契约测试（此前零测试）。
 *
 * Tauri 桌面版的窗口标题栏：拖拽区 + 最小化/最大化(还原)/关闭三个按钮。
 * 外层 `TitleBar` 只有在 `window.__TAURI__` 存在时（且已 mounted）才渲染内层。
 *
 * 契约重点：
 *  ① 非 Tauri（Web 版）什么都不渲染 —— 这是 hydration 安全的关键（首次渲染必须与服务端一致）；
 *  ② 三个按钮的 `title` / `aria-label` **走 i18n**：
 *     `title_minimize` / `title_maximize`(最大化时换 `title_restore`) / `title_close`。
 *     原先这里是内联的 `zh ? '最小化' : 'Minimize'` 三元表达式 —— 与 i18n 表里的
 *     同义译文**重复**，改表不会同步（漂移隐患），2026-09-28 已改为 `t()`。
 *  ③ 窗口最大化时中间按钮换「还原」文案 + 方形图标；
 *  ④ 拖拽区按下触发 startDragging；窗口按钮上按下 **不触发** —— 由**两层**保证：
 *     ① **结构**：三个按钮是拖拽区的**兄弟节点**（不在其子树里），mousedown 只会向上冒泡，
 *        不会横向进兄弟子树；
 *     ② 三个按钮各自的 `onMouseDown={e => e.stopPropagation()}`，拦住合成事件继续向上派发。
 *     ⚠️ 变异取证（2026-09-28，三条互相印证，别把 ② 当空操作删掉）：
 *        单独删掉 3 处 stopPropagation → **咬 0 条**（当前没有祖先挂 mousedown，看不出差别）；
 *        单独把 handleDragStart 挪到行容器上 → **也咬 0 条**（被按钮的 stopPropagation 拦住）；
 *        **两者同时去掉** → 精确咬 2 条。⇒ ② 是**有效守卫**，只是今天还没有祖先用到它；
 *  ⑤ **回退轮询必须能被卸载清理**（2026-09-28 修的真 bug）：
 *     `window.onResized` 不可用时回退到 `setInterval(checkMaximized, 2000)`，
 *     但原实现 `return () => clearInterval(...)` 的返回值没人接收 ⇒ 定时器永不释放。
 *     进全屏时 layout-shell 会卸载 TitleBar，轮询却继续每 2s 发一次 IPC。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { TitleBar } from '@/components/title-bar'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import { logger } from '@/lib/logger'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const CJK = /[\u4e00-\u9fff]/

const {
  isWindowMaximizedMock,
  onResizedMock,
  startDraggingMock,
  minimizeWindowMock,
  maximizeWindowMock,
  closeWindowMock,
} = vi.hoisted(() => ({
  isWindowMaximizedMock: vi.fn(async () => false),
  onResizedMock: vi.fn(),
  startDraggingMock: vi.fn(async () => {}),
  minimizeWindowMock: vi.fn(async () => {}),
  maximizeWindowMock: vi.fn(async () => {}),
  closeWindowMock: vi.fn(async () => {}),
}))

vi.mock('@/lib/native-window', () => ({
  isWindowMaximized: isWindowMaximizedMock,
  minimizeWindow: minimizeWindowMock,
  maximizeWindow: maximizeWindowMock,
  closeWindow: closeWindowMock,
  startDragging: startDraggingMock,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onResized: onResizedMock }),
}))

const setTauri = (on: boolean) => {
  const w = window as unknown as Record<string, unknown>
  if (on) w.__TAURI__ = {}
  else delete w.__TAURI__
}

const setLanguage = (language: 'zh-CN' | 'en') =>
  useAppStore.setState({ user: { ...useAppStore.getState().user, language } })

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(TitleBar)) })
  return {
    container,
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    /** 拖拽区（外层第一个子 div） */
    dragArea: () => container.firstElementChild?.firstElementChild as HTMLElement,
    text: () => container.textContent ?? '',
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

/** 让动态 import + 一连串 promise 落定 */
async function settle(times = 8) {
  for (let i = 0; i < times; i++) {
    await act(async () => { await Promise.resolve() })
  }
}

const mouseDown = (el: Element | null | undefined) => {
  act(() => { el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) })
}

const click = (el: Element | null | undefined) => {
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

beforeEach(() => {
  vi.useFakeTimers()
  setLanguage('zh-CN')
  isWindowMaximizedMock.mockReset().mockResolvedValue(false)
  onResizedMock.mockReset().mockRejectedValue(new Error('onResized unavailable in test'))
  startDraggingMock.mockClear()
  minimizeWindowMock.mockReset().mockResolvedValue(undefined)
  maximizeWindowMock.mockReset().mockResolvedValue(undefined)
  closeWindowMock.mockReset().mockResolvedValue(undefined)
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  setTauri(false)
})

describe('渲染门槛', () => {
  it('非 Tauri（Web 版）不渲染任何内容（保证首屏与 SSR 一致）', () => {
    setTauri(false)
    const p = mount()
    expect(p.buttons()).toHaveLength(0)
    expect(p.text()).toBe('')
    p.unmount()
  })

  it('Tauri 环境渲染拖拽区（品牌名）+ 3 个窗口按钮', async () => {
    setTauri(true)
    const p = mount()
    await settle()
    expect(p.text()).toContain('FretMaster')
    expect(p.buttons()).toHaveLength(3)
    p.unmount()
  })
})

describe('窗口按钮文案走 i18n', () => {
  it('中文：最小化 / 最大化 / 关闭（title 与 aria-label 一致）', async () => {
    setTauri(true)
    const p = mount()
    await settle()
    const [min, max, close] = p.buttons()
    expect(min.getAttribute('aria-label')).toBe(zh['title_minimize'])
    expect(min.getAttribute('title')).toBe(zh['title_minimize'])
    expect(max.getAttribute('aria-label')).toBe(zh['title_maximize'])
    expect(close.getAttribute('aria-label')).toBe(zh['title_close'])
    p.unmount()
  })

  it('英文：Minimize / Maximize / Close，且不含任何汉字', async () => {
    setTauri(true)
    setLanguage('en')
    const p = mount()
    await settle()
    const [min, max, close] = p.buttons()
    expect(min.getAttribute('aria-label')).toBe(en['title_minimize'])
    expect(max.getAttribute('aria-label')).toBe(en['title_maximize'])
    expect(close.getAttribute('aria-label')).toBe(en['title_close'])
    for (const b of p.buttons()) {
      for (const attr of ['aria-label', 'title']) {
        const v = b.getAttribute(attr)
        if (v) expect(v, `${attr}="${v}"`).not.toMatch(CJK)
      }
    }
    p.unmount()
  })

  it('窗口最大化时中间按钮变「还原」', async () => {
    setTauri(true)
    isWindowMaximizedMock.mockResolvedValue(true)
    const p = mount()
    await settle()
    expect(p.buttons()[1].getAttribute('aria-label')).toBe(zh['title_restore'])
    expect(p.buttons()[1].getAttribute('title')).toBe(zh['title_restore'])
    p.unmount()
  })
})

describe('拖拽区与按钮的 mousedown 隔离', () => {
  it('拖拽区按下 → startDragging；窗口按钮上按下 → 不拖拽', async () => {
    setTauri(true)
    const p = mount()
    await settle()

    mouseDown(p.dragArea())
    await settle()
    expect(startDraggingMock).toHaveBeenCalledTimes(1)

    startDraggingMock.mockClear()
    mouseDown(p.buttons()[0])
    await settle()
    expect(startDraggingMock).not.toHaveBeenCalled()
    p.unmount()
  })

  /**
   * ⚠️ 这条用例的价值有两层：
   *  ① 结构回归护栏：三个窗口按钮是拖拽区的**兄弟节点**（行容器有两个子 div：
   *     左拖拽区、右按钮组），mousedown 从按钮向外冒泡只到行容器，**不会横向进兄弟子树**。
   *     若将来有人把按钮组挪进拖拽区里，`contains` 断言立刻挂。
   *  ② 行为护栏：即便有人给某层祖先挂上拖拽处理器，按钮上的 `stopPropagation`
   *     也必须继续拦住（见文件头 ④ 的三条变异取证）。
   */
  it('三个窗口按钮都在拖拽区**之外**（结构隔离），且按下不触发拖拽', async () => {
    setTauri(true)
    const p = mount()
    await settle()
    const drag = p.dragArea()
    for (const i of [0, 1, 2]) {
      expect(drag.contains(p.buttons()[i]), `按钮 ${i} 不该位于拖拽区内`).toBe(false)

      startDraggingMock.mockClear()
      mouseDown(p.buttons()[i])
      await settle()
      expect(startDraggingMock, `按钮 ${i} 的 mousedown 不该触发拖拽`).not.toHaveBeenCalled()
    }
    p.unmount()
  })
})

describe('窗口尺寸监听的降级与清理', () => {
  it('onResized 可用时用监听器，卸载时注销（且不启动轮询）', async () => {
    setTauri(true)
    const unlisten = vi.fn()
    onResizedMock.mockReset().mockResolvedValue(unlisten)
    const p = mount()
    await settle()

    expect(unlisten).not.toHaveBeenCalled()
    // 监听器已挂上，就不该再用轮询
    const callsBefore = isWindowMaximizedMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(isWindowMaximizedMock.mock.calls.length).toBe(callsBefore)

    p.unmount()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('onResized 不可用时回退轮询，且**卸载后不再轮询**（2026-09-28 真 bug 回归）', async () => {
    setTauri(true)
    const p = mount()
    await settle()
    expect(onResizedMock).toHaveBeenCalled()

    const afterMount = isWindowMaximizedMock.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)

    // 轮询确实在跑（2s 一次）
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    const afterPoll = isWindowMaximizedMock.mock.calls.length
    expect(afterPoll, '2s 后应有一次轮询').toBeGreaterThan(afterMount)

    // 卸载后必须停：修 bug 前这里是「仍每 2s 增加一次」
    p.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(isWindowMaximizedMock.mock.calls.length, '卸载后不应再轮询').toBe(afterPoll)
  })

  it('onResized 回调被触发时重新查询最大化状态（不是只在挂载时查一次）', async () => {
    setTauri(true)
    let cb: (() => void) | null = null
    const unlisten = vi.fn()
    onResizedMock.mockReset().mockImplementation((fn: () => void) => {
      cb = fn
      return Promise.resolve(unlisten)
    })
    const p = mount()
    await settle()
    expect(cb, '应已注册 resize 回调').not.toBeNull()

    const before = isWindowMaximizedMock.mock.calls.length
    await act(async () => {
      cb!()
      await Promise.resolve()
    })
    await settle()
    expect(isWindowMaximizedMock.mock.calls.length, '回调应再查一次').toBeGreaterThan(before)
    p.unmount()
  })

  it('onResized 落地前组件已卸载 → 立刻注销，且卸载时不会二次注销', async () => {
    setTauri(true)
    let resolveOnResized: (fn: () => void) => void = () => { /* 占位 */ }
    onResizedMock.mockReset().mockReturnValue(
      new Promise((r) => {
        resolveOnResized = r
      }),
    )
    const p = mount()
    await settle()

    // 先卸载（此时清理函数已跑过 cancelled=true）
    p.unmount()
    const unlisten = vi.fn()
    await act(async () => {
      resolveOnResized(unlisten)
      await Promise.resolve()
    })
    await settle()
    // 旧实现不补注销 ⇒ Tauri 事件监听器一直挂着
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('onResized 失败前组件已卸载 → 不启动轮询（cancelled 短路）', async () => {
    setTauri(true)
    let rejectOnResized: (e: unknown) => void = () => { /* 占位 */ }
    onResizedMock.mockReset().mockReturnValue(
      new Promise((_res, rej) => {
        rejectOnResized = rej
      }),
    )
    // 🚨 spy 的是 `logger.debug` 而不是 `console.debug`：标题栏的降级日志已统一走
    //    `lib/logger.ts`（dev-only），spy console 会永远抓空 —— 2026-10-04 踩过。
    const dbg = vi.spyOn(logger, 'debug').mockImplementation(() => { /* 静音 */ })
    const p = mount()
    await settle()

    p.unmount()
    await act(async () => {
      rejectOnResized(new Error('boom'))
      await Promise.resolve()
    })
    await settle()

    const before = isWindowMaximizedMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(isWindowMaximizedMock.mock.calls.length, '已卸载就不该回退轮询').toBe(before)
    dbg.mockRestore()
  })
})

describe('窗口按钮 → 调用对应 native 命令', () => {
  it('最小化 / 最大化 / 关闭 分别调用 minimizeWindow / maximizeWindow / closeWindow', async () => {
    setTauri(true)
    const p = mount()
    await settle()

    click(p.buttons()[0])
    await settle()
    expect(minimizeWindowMock).toHaveBeenCalledTimes(1)
    expect(maximizeWindowMock).not.toHaveBeenCalled()
    expect(closeWindowMock).not.toHaveBeenCalled()

    click(p.buttons()[1])
    await settle()
    expect(maximizeWindowMock).toHaveBeenCalledTimes(1)
    // handleMaximize 结束后还会 setTimeout(checkMaximized, 100) 让图标尽快跟上
    const before = isWindowMaximizedMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(isWindowMaximizedMock.mock.calls.length, '最大化后应复查状态').toBeGreaterThan(before)

    click(p.buttons()[2])
    await settle()
    expect(closeWindowMock).toHaveBeenCalledTimes(1)
    // 三个按钮的点击都不该顺带拖窗口
    expect(startDraggingMock).not.toHaveBeenCalled()
    p.unmount()
  })

  it('native 命令失败 → logger.debug 兜底、不冒泡、按钮仍在', async () => {
    setTauri(true)
    const dbg = vi.spyOn(logger, 'debug').mockImplementation(() => { /* 静音 */ })
    isWindowMaximizedMock.mockRejectedValue(new Error('query down'))
    minimizeWindowMock.mockRejectedValue(new Error('min down'))
    maximizeWindowMock.mockRejectedValue(new Error('max down'))
    closeWindowMock.mockRejectedValue(new Error('close down'))

    const p = mount()
    await settle()
    click(p.buttons()[0])
    await settle()
    click(p.buttons()[1])
    await settle()
    click(p.buttons()[2])
    await settle()

    const msgs = dbg.mock.calls.map((c) => String(c[0]))
    for (const expected of [
      'checkMaximized failed:',
      'handleMinimize failed:',
      'handleMaximize failed:',
      'handleClose failed:',
    ]) {
      expect(msgs, `应记录 ${expected}`).toContain(expected)
    }
    // 命令失败不该把标题栏打崩
    expect(p.buttons()).toHaveLength(3)
    dbg.mockRestore()
    p.unmount()
  })

  it('startDragging 失败 → logger.debug 兜底（拖拽失败不影响按钮可用）', async () => {
    setTauri(true)
    const dbg = vi.spyOn(logger, 'debug').mockImplementation(() => { /* 静音 */ })
    startDraggingMock.mockRejectedValue(new Error('drag down'))
    const p = mount()
    await settle()

    mouseDown(p.dragArea())
    await settle()
    expect(dbg.mock.calls.map((c) => String(c[0]))).toContain('handleDragStart failed:')
    expect(p.buttons()).toHaveLength(3)
    dbg.mockRestore()
    p.unmount()
  })
})

/**
 * `isTauri` 是**渲染期**算出来的常量（`isTauriEnv()`），而外层 `TitleBar` 的
 * `isNative` 是 mount 时定下的 state。两者一旦分叉（`__TAURI__` 在挂载后被摘掉），
 * 内层的四组 `if (!isTauri) return` 短路分支就会被走到 —— 这条路径此前零覆盖。
 */
describe('__TAURI__ 在挂载后被摘掉：命令与拖拽全部短路', () => {
  it('三个按钮、拖拽、尺寸监听注册都不再发生', async () => {
    setTauri(true)
    const p = mount()
    await settle()
    expect(onResizedMock).toHaveBeenCalledTimes(1)

    // 摘掉 __TAURI__，再用 store 变化触发内层重渲染（外层 isNative 不回头）
    act(() => {
      setTauri(false)
      setLanguage('en')
    })
    await settle()

    startDraggingMock.mockClear()
    minimizeWindowMock.mockClear()
    maximizeWindowMock.mockClear()
    closeWindowMock.mockClear()
    onResizedMock.mockClear()

    click(p.buttons()[0])
    await settle()
    click(p.buttons()[1])
    await settle()
    click(p.buttons()[2])
    await settle()
    mouseDown(p.dragArea())
    await settle()

    expect(minimizeWindowMock).not.toHaveBeenCalled()
    expect(maximizeWindowMock).not.toHaveBeenCalled()
    expect(closeWindowMock).not.toHaveBeenCalled()
    expect(startDraggingMock).not.toHaveBeenCalled()
    // effect 重跑时 isTauri=false ⇒ 直接 return：既不补注册监听，也不启动轮询
    expect(onResizedMock).not.toHaveBeenCalled()
    const before = isWindowMaximizedMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(isWindowMaximizedMock.mock.calls.length, '不该轮询').toBe(before)
    p.unmount()
  })
})
