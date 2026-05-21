import { logger } from './logger'
import { isTauriEnv } from './utils'

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

export async function setWindowedFullscreen(enable: boolean): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_windowed_fullscreen', { enable })
  } catch (error) {
    logger.error('setWindowedFullscreen failed:', error)
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
