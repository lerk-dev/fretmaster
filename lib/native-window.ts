import { logger } from './logger'
import { isTauriEnv } from './utils'
import type { FullscreenModeType } from './store'

const isTauri = (): boolean => {
  return isTauriEnv()
}

async function getInvoke() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('minimize_window')
  } catch (error) {
    logger.error('minimizeWindow failed:', error)
  }
}

export async function maximizeWindow(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('maximize_window')
  } catch (error) {
    logger.error('maximizeWindow failed:', error)
  }
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('close_window')
  } catch (error) {
    logger.error('closeWindow failed:', error)
  }
}

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const invoke = await getInvoke()
    return await invoke('is_window_maximized')
  } catch (error) {
    logger.error('isWindowMaximized failed:', error)
    return false
  }
}

export async function startDragging(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('start_dragging')
  } catch (error) {
    logger.error('startDragging failed:', error)
  }
}

export async function setFullscreen(fullscreen: boolean): Promise<void> {
  if (!isTauri()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const window = getCurrentWindow()
    await window.setFullscreen(fullscreen)
  } catch (error) {
    logger.error('setFullscreen failed:', error)
  }
}

export async function isFullscreen(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const window = getCurrentWindow()
    return await window.isFullscreen()
  } catch (error) {
    logger.error('isFullscreen failed:', error)
    return false
  }
}

export async function setTrueFullscreen(enable: boolean): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_true_fullscreen', { enable })
    await setWebViewBackgroundColor('#0b0f14')
  } catch (error) {
    logger.error('setTrueFullscreen failed:', error)
  }
}

export async function setWebViewBackgroundColor(color: string): Promise<void> {
  if (!isTauri()) return
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    const webview = getCurrentWebview()
    await webview.setBackgroundColor(color)
  } catch (error) {
    logger.error('setWebViewBackgroundColor failed:', error)
  }
}

export async function isTrueFullscreen(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const invoke = await getInvoke()
    return await invoke('is_true_fullscreen')
  } catch (error) {
    logger.error('isTrueFullscreen failed:', error)
    return false
  }
}

/**
 * 按「全屏类型」把窗口切到对应形态 —— **模式 → 原生调用**的唯一分派点。
 *
 * 语义（用户 2026-10-03 二次拍板，原文）：
 *   「我说的窗口全屏，是当前窗口全屏，而不是最大化留任务栏，当前窗口的大小保持不变，
 *     内容填满当前窗口」
 *
 *   - `'windowed'`   窗口全屏 = **窗口一律不动**（尺寸/位置/窗口样式全部保持当前值）。
 *                    「内容填满当前窗口」由**应用层**完成 —— `components/layout-shell.tsx`
 *                    在 `isFullscreen` 时隐藏自带标题栏（`TitleBar` / `DebugPanel`），
 *                    内容区 `flex-1 overflow-hidden` 自然长满窗口客户区。
 *                    原生侧唯一要做的事是「确保没停在真全屏形态」⇒ 发 `set_true_fullscreen(false)`。
 *   - `'fullscreen'` 真全屏   = 手工 Win32 全屏：把**客户区**对齐整个显示器（含任务栏）。
 *
 * 🚨 **第一版语义是错的，别再改回去**：2026-10-03 早些时候把「窗口全屏」实现成
 * `window.maximize()`（占满工作区、保留任务栏），还写了个原生命令 `set_windowed_fullscreen`。
 * 用户直接否掉：「当前窗口的大小保持不变」。那条命令已从 Rust 侧**删除**
 * （见 `src-tauri/src/commands/window_commands.rs` 里留的墓碑注释）——
 * 本仓唯一允许改窗口几何的全屏命令是 `set_true_fullscreen`。
 *
 * 这里保留 `mode` 形参（而不是让 hook 自己 if/else）仍然有意义：**分派点只有一个**，
 * 且「真全屏要不要开」的判据（`enable && mode === 'fullscreen'`）只在这一个地方写。
 */
export async function applyFullscreen(enable: boolean, mode: FullscreenModeType): Promise<void> {
  if (!isTauri()) return

  // 未知/缺省值一律按「窗口全屏」处理 —— 老 blob 迁移出 undefined 时宁可**不动窗口**，
  // 也不要静默变成真全屏（真全屏更难自救）。
  const wantTrueFullscreen = enable && mode === 'fullscreen'
  await setTrueFullscreen(wantTrueFullscreen)
}
