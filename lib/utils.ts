import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface TauriWindow {
  __TAURI__?: boolean
}

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

export function isTauriEnv(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as TauriWindow).__TAURI__
}

export function getAudioContextClass(): typeof AudioContext {
  if (typeof window === 'undefined') {
    return AudioContext
  }
  return (window as WebkitWindow).webkitAudioContext || AudioContext
}
