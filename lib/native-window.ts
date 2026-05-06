import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export async function minimizeWindow(): Promise<void> {
  await invoke('minimize_window')
}

export async function maximizeWindow(): Promise<void> {
  await invoke('maximize_window')
}

export async function closeWindow(): Promise<void> {
  await invoke('close_window')
}

export async function isWindowMaximized(): Promise<boolean> {
  return await invoke('is_window_maximized')
}

export async function startDragging(): Promise<void> {
  await invoke('start_dragging')
}

export async function setFullscreen(fullscreen: boolean): Promise<void> {
  const window = getCurrentWindow()
  await window.setFullscreen(fullscreen)
}

export async function isFullscreen(): Promise<boolean> {
  const window = getCurrentWindow()
  return await window.isFullscreen()
}

/**
 * 设置窗口全屏模式 - 最大化窗口，不覆盖任务栏
 * @param enable true 最大化窗口，false 还原窗口
 */
export async function setWindowedFullscreen(enable: boolean): Promise<void> {
  await invoke('set_windowed_fullscreen', { enable })
}

/**
 * 设置真全屏模式 - 完全覆盖任务栏
 * @param enable true 启用真全屏，false 退出全屏
 */
export async function setTrueFullscreen(enable: boolean): Promise<void> {
  await invoke('set_true_fullscreen', { enable })
}

/**
 * 检查是否处于真全屏模式
 */
export async function isTrueFullscreen(): Promise<boolean> {
  return await invoke('is_true_fullscreen')
}
