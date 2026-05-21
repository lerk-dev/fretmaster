import { logger } from './logger'
import { getAudioContextClass as getAudioContextClassUtil } from './utils'

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isSafari(): boolean {
  if (typeof window === 'undefined') return false

  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function isIOSSafari(): boolean {
  return isIOS() && isSafari()
}

export function needsUserInteractionForAudio(): boolean {
  return isIOS() || isSafari()
}

export function supportsAudioWorklet(): boolean {
  if (typeof window === 'undefined') return false

  return (
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined'
  )
}

export function supportsWebAudio(): boolean {
  if (typeof window === 'undefined') return false

  return (
    typeof AudioContext !== 'undefined' ||
    getAudioContextClassUtil() !== AudioContext
  )
}

export function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null

  return getAudioContextClassUtil()
}

export class IOSAudioUnlocker {
  private unlocked = false
  private unlockCallbacks: (() => void)[] = []

  isUnlocked(): boolean {
    return this.unlocked
  }

  onUnlock(callback: () => void): void {
    if (this.unlocked) {
      callback()
    } else {
      this.unlockCallbacks.push(callback)
    }
  }

  async unlock(context: AudioContext): Promise<boolean> {
    if (this.unlocked) return true

    try {
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      gainNode.gain.value = 0
      oscillator.connect(gainNode)
      gainNode.connect(context.destination)

      oscillator.start(0)
      oscillator.stop(context.currentTime + 0.001)

      if (context.state === 'suspended') {
        await context.resume()
      }

      this.unlocked = true

      this.unlockCallbacks.forEach(cb => cb())
      this.unlockCallbacks = []

      return true
    } catch (error) {
      logger.error('iOS audio unlock failed:', error)
      return false
    }
  }

  reset(): void {
    this.unlocked = false
  }
}

export const iosAudioUnlocker = new IOSAudioUnlocker()

export class IOSAudioContextManager {
  private context: AudioContext | null = null
  private isContextReady = false

  async createContext(): Promise<AudioContext | null> {
    if (!supportsWebAudio()) {
      logger.warn('Web Audio API not supported')
      return null
    }

    const AudioContextClass = getAudioContextClass()
    if (!AudioContextClass) {
      logger.warn('AudioContext not available')
      return null
    }

    try {
      this.context = new AudioContextClass()

      if (needsUserInteractionForAudio()) {
        logger.debug('iOS/Safari detected: Audio context requires user interaction')

        if (this.context.state === 'suspended') {
          this.isContextReady = false
        } else {
          this.isContextReady = true
        }
      } else {
        this.isContextReady = true
      }

      return this.context
    } catch (error) {
      logger.error('Failed to create audio context:', error)
      return null
    }
  }

  getContext(): AudioContext | null {
    return this.context
  }

  isReady(): boolean {
    return this.isContextReady && this.context !== null && this.context.state === 'running'
  }

  async unlock(): Promise<boolean> {
    if (!this.context) return false

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume()
        await iosAudioUnlocker.unlock(this.context)
        this.isContextReady = true
        logger.debug('Audio context unlocked successfully')
        return true
      } catch (error) {
        logger.error('Failed to unlock audio context:', error)
        return false
      }
    }

    return true
  }

  async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close()
      } catch (error) {
        logger.error('Failed to close audio context:', error)
      }
      this.context = null
      this.isContextReady = false
    }
  }
}

export const iosAudioContextManager = new IOSAudioContextManager()

export function showIOSAudioUnlockPrompt(): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.id = 'ios-audio-unlock-overlay'
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
    `

    overlay.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 48px; margin-bottom: 20px;">🎸</div>
        <h2 style="margin: 0 0 10px 0; font-size: 24px;">点击屏幕开始</h2>
        <p style="margin: 0; font-size: 16px; opacity: 0.8;">
          iOS 设备需要用户交互才能启动音频
        </p>
      </div>
    `

    const handleClick = async () => {
      await iosAudioContextManager.unlock()
      overlay.remove()
      resolve()
    }

    overlay.addEventListener('click', handleClick)
    overlay.addEventListener('touchstart', handleClick)

    document.body.appendChild(overlay)
  })
}

export async function handleIOSAudioUnlock(): Promise<boolean> {
  if (!needsUserInteractionForAudio()) {
    return true
  }

  const context = iosAudioContextManager.getContext()
  if (!context) return false

  if (context.state === 'suspended') {
    await showIOSAudioUnlockPrompt()
  }

  return iosAudioContextManager.isReady()
}
