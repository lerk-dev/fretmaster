/**
 * hooks/use-fullscreen.ts 的契约测试（此前零测试）。
 *
 * 它是全屏入口，页面里四处调用，其中三种语义混在一起：
 *   - `handleToggleFullscreen()`            —— 真正的「切换」
 *   - `handleToggleFullscreen(false)`       —— Escape / 退出专注模式，要求「确保退出」
 *   - `setFullscreenMode(true)`             —— 标题栏的全屏按钮，要求「确保进入」
 *
 * 后者是本轮修掉的 bug：原实现只把 `enable` 用于原生调用，store 一律 `toggleFullscreen()`，
 * 于是「已全屏时再点进入全屏」会**反而退出**；在 Tauri 下更糟 ——
 * 原生被置为「全屏」而 store 变成「非全屏」，两边长期打架。
 *
 * 另一条要钉住的是文件头注释里写的修复：`isTauri` 必须是**显式参数且进依赖数组**
 * （原来它取自挂载后才置位的 state，首次切换时闭包里还是 false，原生全屏不生效）。
 *
 * 2026-10-03 新增：原生调用改为按 `focusMode.fullscreenMode` 经
 * `applyFullscreen(enable, mode)` 分派（窗口全屏=窗口一律不动/内容铺满当前窗口，
 * 真全屏=客户区铺满整块显示器含任务栏）。
 * 这里钉住 hook **把当前设置原样透传**、且设置改了当场生效（不闭包旧值）。
 * 分派本身分两处钉：运行时命令序列在 native-invoke-contract.test.ts，
 * 源码形态在 fullscreen-mode-dispatch.test.ts。
 *
 * 注意 store 的 `isFullscreen` 是模块级全局状态，用例之间必须复位。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useFullscreen } from '@/hooks/use-fullscreen'
import { useAppStore } from '@/lib/store'
import * as nativeWindow from '@/lib/native-window'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// 🚨 替身必须与被替换对象同形（铁律 8）：hook 现在只用 `applyFullscreen`，
// 替身就必须提供 `applyFullscreen`；留着旧的 `setTrueFullscreen` 只会掩盖接线错误。
vi.mock('@/lib/native-window', () => ({
  applyFullscreen: vi.fn(async () => undefined),
}))

type Api = ReturnType<typeof useFullscreen>
let api: Api | null = null
let root: Root | null = null

function Probe({ isTauri }: { isTauri: boolean }) {
  api = useFullscreen(isTauri)
  return null
}

function mount(isTauri: boolean) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(createElement(Probe, { isTauri })) })
  return {
    rerender(next: boolean) {
      act(() => { root!.render(createElement(Probe, { isTauri: next })) })
    },
    unmount() {
      if (!root) return
      act(() => { root!.unmount() })
      root = null
      container.remove()
    },
  }
}

const applyFullscreen = vi.mocked(nativeWindow.applyFullscreen)

beforeEach(() => {
  useAppStore.getState().setFullscreen(false)
  // 全屏类型是全局 store 状态，用例之间必须复位到默认值
  useAppStore.getState().setFullscreenMode('windowed')
  api = null
  applyFullscreen.mockClear()
  applyFullscreen.mockImplementation(async () => undefined)
})

afterEach(() => {
  if (root) {
    act(() => { root!.unmount() })
    root = null
  }
  useAppStore.getState().setFullscreen(false)
  vi.restoreAllMocks()
})

describe('useFullscreen', () => {
  it('返回值取自 store：isFullscreen 响应式、两个切换函数与 store 同一引用', () => {
    const h = mount(false)
    expect(api!.isFullscreen).toBe(false)
    expect(api!.toggleFullscreenState).toBe(useAppStore.getState().toggleFullscreen)
    // setFullscreenMode 只是 handleToggleFullscreen 的别名
    expect(api!.setFullscreenMode).toBe(api!.handleToggleFullscreen)

    act(() => { useAppStore.getState().setFullscreen(true) })
    expect(api!.isFullscreen).toBe(true)
    h.unmount()
  })

  it('不带参数 = 切换（false → true → false）', async () => {
    const h = mount(false)
    expect(api!.isFullscreen).toBe(false)

    await act(async () => { await api!.handleToggleFullscreen() })
    expect(useAppStore.getState().isFullscreen).toBe(true)

    await act(async () => { await api!.handleToggleFullscreen() })
    expect(useAppStore.getState().isFullscreen).toBe(false)
    h.unmount()
  })

  it('显式 enable=true 是「确保进入」：已全屏时再调必须保持 true（钉住本轮修复）', async () => {
    const h = mount(false)
    // 先进入全屏
    await act(async () => { await api!.handleToggleFullscreen(true) })
    expect(useAppStore.getState().isFullscreen).toBe(true)

    // 再点一次「进入全屏」——原实现会翻成 false
    await act(async () => { await api!.handleToggleFullscreen(true) })
    expect(useAppStore.getState().isFullscreen).toBe(true)

    // 第三次也一样
    await act(async () => { await api!.handleToggleFullscreen(true) })
    expect(useAppStore.getState().isFullscreen).toBe(true)
    h.unmount()
  })

  it('显式 enable=false 是「确保退出」：未全屏时保持 false、已全屏时退出', async () => {
    const h = mount(false)
    await act(async () => { await api!.handleToggleFullscreen(false) })
    expect(useAppStore.getState().isFullscreen).toBe(false)

    act(() => { useAppStore.getState().setFullscreen(true) })
    await act(async () => { await api!.handleToggleFullscreen(false) })
    expect(useAppStore.getState().isFullscreen).toBe(false)
    h.unmount()
  })

  it('非 Tauri 环境不加载原生模块（不调用 applyFullscreen）', async () => {
    const h = mount(false)
    await act(async () => { await api!.handleToggleFullscreen(true) })
    await act(async () => { await api!.handleToggleFullscreen(false) })
    expect(applyFullscreen).not.toHaveBeenCalled()
    h.unmount()
  })

  it('Tauri 环境：原生的目标值与 store 的最终值始终一致', async () => {
    const h = mount(true)

    await act(async () => { await api!.handleToggleFullscreen(true) })
    expect(applyFullscreen).toHaveBeenLastCalledWith(true, 'windowed')
    expect(useAppStore.getState().isFullscreen).toBe(true)

    // 已全屏时再来一次 enable=true —— 原生与 store 都必须仍是「全屏」
    await act(async () => { await api!.handleToggleFullscreen(true) })
    expect(applyFullscreen).toHaveBeenLastCalledWith(true, 'windowed')
    expect(useAppStore.getState().isFullscreen).toBe(true)

    await act(async () => { await api!.handleToggleFullscreen(false) })
    expect(applyFullscreen).toHaveBeenLastCalledWith(false, 'windowed')
    expect(useAppStore.getState().isFullscreen).toBe(false)

    // 不带参数：目标值应为本渲染期的 !isFullscreen
    await act(async () => { await api!.handleToggleFullscreen() })
    expect(applyFullscreen).toHaveBeenLastCalledWith(true, 'windowed')
    expect(useAppStore.getState().isFullscreen).toBe(true)
    h.unmount()
  })

  it('🚨 把当前全屏类型原样透传：windowed 与 fullscreen 分别对应两种形态', async () => {
    const h = mount(true)

    // 默认窗口全屏（窗口不动，内容铺满当前窗口）
    useAppStore.getState().setFullscreenMode('windowed')
    await act(async () => { await api!.handleToggleFullscreen(true) })
    expect(applyFullscreen).toHaveBeenLastCalledWith(true, 'windowed')

    // 切成真全屏（含任务栏）—— 必须用 act 包住，让重渲染先落地，
    // 否则下面取的仍是上一次渲染的 callback（闭包里的旧模式），测的是过期闭包
    act(() => { useAppStore.getState().setFullscreenMode('fullscreen') })
    await act(async () => { await api!.handleToggleFullscreen(true) })
    expect(applyFullscreen).toHaveBeenLastCalledWith(true, 'fullscreen')

    // 退出时模式同样要带上（applyFullscreen 对两种模式都关）
    await act(async () => { await api!.handleToggleFullscreen(false) })
    expect(applyFullscreen).toHaveBeenLastCalledWith(false, 'fullscreen')
    h.unmount()
  })

  it('🚨 设置改完立刻生效：不闭包挂载期的旧 fullscreenMode', async () => {
    const h = mount(true)
    useAppStore.getState().setFullscreenMode('windowed')
    // 挂载/首渲染期是 windowed —— 此处尚不应调用
    expect(applyFullscreen).not.toHaveBeenCalled()

    // 用户在设置页切成真全屏（同一个已挂载的实例，不重新挂载）
    act(() => { useAppStore.getState().setFullscreenMode('fullscreen') })
    await act(async () => { await api!.handleToggleFullscreen(true) })

    expect(applyFullscreen).toHaveBeenLastCalledWith(true, 'fullscreen')
    h.unmount()
  })

  it('原生调用失败不影响 store 状态（异常被吞并记录）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    applyFullscreen.mockRejectedValueOnce(new Error('boom'))

    const h = mount(true)
    await act(async () => { await api!.handleToggleFullscreen(true) })

    expect(useAppStore.getState().isFullscreen).toBe(true)
    expect(errSpy).toHaveBeenCalled()
    h.unmount()
  })

  it('isTauri 取自当前渲染（换值后回调立即生效，不闭包住旧值）', async () => {
    const h = mount(false)
    // 挂载时是 Web，调用不应触发原生
    await act(async () => { await api!.handleToggleFullscreen(false) })
    expect(applyFullscreen).not.toHaveBeenCalled()

    // 挂载后才补上 isTauri（正是页面里 setIsTauri(isTauriEnv()) 的时序）
    h.rerender(true)
    await act(async () => { await api!.handleToggleFullscreen(false) })
    expect(applyFullscreen).toHaveBeenCalledWith(false, 'windowed')
    h.unmount()
  })
})
