import { invoke } from '@tauri-apps/api/core'

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
