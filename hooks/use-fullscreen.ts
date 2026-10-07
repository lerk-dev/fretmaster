import { useCallback } from 'react'
import { useAppStore } from '@/lib/store'

/**
 * useFullscreen
 *
 * 全屏：响应式订阅 + 切换处理。
 * 
 * 从 app/page.tsx 原样搬出，逐行搬运。内容：
 * - isFullscreen：store 响应式订阅（useAppStore((s) => s.isFullscreen)）
 * - toggleFullscreenState：store.toggleFullscreen
 * - handleToggleFullscreen：Tauri 下先调原生切窗口，再切 store 状态
 * - setFullscreenMode：handleToggleFullscreen 的别名
 *
 * 🚨 **原生调用必须按 `focusMode.fullscreenMode` 分派**（2026-10-03 修）：
 *   窗口全屏 → **窗口一律不动**，只保证「没停在真全屏」（内容铺满是应用层的事）；
 *   真全屏   → 客户区铺满整个显示器（**含任务栏**）。
 * 分派逻辑本身在 `lib/native-window.ts::applyFullscreen`（模式 → 原生调用的唯一真相源），
 * 这里只负责把**当前设置**传进去 —— 所以 `fullscreenMode` 必须响应式订阅并进依赖数组，
 * 否则用户在设置页改完、本次会话里仍按挂载期的旧值走（铁律 21 的同类坑）。
 *
 * ⚠️ 唯一有意改动：原 handleToggleFullscreen 的依赖数组是 [isFullscreen, toggleFullscreenState]，
 * **漏了 isTauri**（isTauri 是挂载后才置位的 state，见 page 的 setIsTauri(isTauriEnv())）。
 * 本次把 isTauri 提升为 hook 的显式参数并并入依赖，回调拿到的是当前值 —— 修复首次切换时
 * 闭包里 isTauri 仍为 false、导致原生全屏不生效的问题。
 * 除此之外逐行未改（与 git 原文逐行比对一致）。
 * 页面通过解构接回同名变量，因此页面正文一行都不用改。
 */
export function useFullscreen(isTauri: boolean) {
  const store = useAppStore.getState()

  const isFullscreen = useAppStore((s) => s.isFullscreen)
  // 全屏类型（'windowed' | 'fullscreen'）—— 响应式订阅，改完设置立刻对下一次切换生效
  const fullscreenMode = useAppStore((s) => s.focusMode.fullscreenMode)
  const toggleFullscreenState = store.toggleFullscreen
  const setFullscreenState = store.setFullscreen
  // 全屏切换处理函数
  const handleToggleFullscreen = useCallback(async (enable?: boolean) => {
    const newState = enable !== undefined ? enable : !isFullscreen
    
    if (isTauri) {
      try {
        const { applyFullscreen } = await import('@/lib/native-window')
        await applyFullscreen(newState, fullscreenMode)
      } catch (e) {
        console.error('Failed to set fullscreen:', e)
      }
    }
    
    // 显式传了目标态就写入该值，只有不带参数才是真正的「切换」。
    // 原实现在这里无条件 toggle：已全屏时再调 handleToggleFullscreen(true)
    // 会反而退出全屏，且 Tauri 下原生被置为「全屏」而 store 变成「非全屏」，两边打架。
    if (enable !== undefined) {
      setFullscreenState(newState)
    } else {
      toggleFullscreenState()
    }
  }, [isFullscreen, toggleFullscreenState, setFullscreenState, isTauri, fullscreenMode])
  const setFullscreenMode = handleToggleFullscreen

  return {
    isFullscreen,
    toggleFullscreenState,
    handleToggleFullscreen,
    setFullscreenMode,
  }
}
