// iOS 兼容性处理工�?
import { logger } from './logger'

// 检测是否是 iOS 设备
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

// 检测是否是 Safari 浏览�?export function isSafari(): boolean {
  if (typeof window === 'undefined') return false
  
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

// 检测是否是 iOS Safari
export function isIOSSafari(): boolean {
  return isIOS() && isSafari()
}

// 检测是否需要用户交互才能启动音�?export function needsUserInteractionForAudio(): boolean {
  return isIOS() || isSafari()
}

// 检测是否支�?AudioWorklet
export function supportsAudioWorklet(): boolean {
  if (typeof window === 'undefined') return false
  
  return (
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined'
  )
}

// 检测是否支�?Web Audio API
export function supportsWebAudio(): boolean {
  if (typeof window === 'undefined') return false
  
  return (
    typeof AudioContext !== 'undefined' ||
    typeof (window as any).webkitAudioContext !== 'undefined'
  )
}

// 获取合适的 AudioContext 构造函�?export function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  
  return (
    window.AudioContext ||
    (window as any).webkitAudioContext ||
    null
  )
}

// iOS 音频解锁�?export class IOSAudioUnlocker {
  private unlocked = false
  private unlockCallbacks: (() => void)[] = []
  
  // 检查是否已解锁
  isUnlocked(): boolean {
    return this.unlocked
  }
  
  // 添加解锁回调
  onUnlock(callback: () => void): void {
    if (this.unlocked) {
      callback()
    } else {
      this.unlockCallbacks.push(callback)
    }
  }
  
  // 尝试解锁（需要用户交互事件）
  async unlock(context: AudioContext): Promise<boolean> {
    if (this.unlocked) return true
    
    try {
      // 创建一个短暂的静音振荡器来解锁音频
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()
      
      gainNode.gain.value = 0 // 静音
      oscillator.connect(gainNode)
      gainNode.connect(context.destination)
      
      oscillator.start(0)
      oscillator.stop(context.currentTime + 0.001)
      
      // 如果上下文是暂停状态，恢复�?      if (context.state === 'suspended') {
        await context.resume()
      }
      
      this.unlocked = true
      
      // 触发所有回�?      this.unlockCallbacks.forEach(cb => cb())
      this.unlockCallbacks = []
      
      return true
    } catch (error) {
      logger.error('iOS audio unlock failed:', error)
      return false
    }
  }
  
  // 重置解锁状�?  reset(): void {
    this.unlocked = false
  }
}

// 全局 iOS 音频解锁器实�?export const iosAudioUnlocker = new IOSAudioUnlocker()

// iOS 音频上下文管理器
export class IOSAudioContextManager {
  private context: AudioContext | null = null
  private isContextReady = false
  
  // 创建音频上下�?  async createContext(): Promise<AudioContext | null> {
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
      
      // iOS 需要等待用户交互后才能启动音频上下�?      if (needsUserInteractionForAudio()) {
        logger.debug('iOS/Safari detected: Audio context requires user interaction')
        
        // 如果上下文是暂停状态，标记为需要解�?        if (this.context.state === 'suspended') {
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
  
  // 获取当前上下�?  getContext(): AudioContext | null {
    return this.context
  }
  
  // 检查上下文是否就绪
  isReady(): boolean {
    return this.isContextReady && this.context !== null && this.context.state === 'running'
  }
  
  // 解锁音频上下文（需要用户交互事件）
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
  
  // 关闭音频上下�?  async close(): Promise<void> {
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

// 全局 iOS 音频上下文管理器实例
export const iosAudioContextManager = new IOSAudioContextManager()

// 显示 iOS 音频解锁提示
export function showIOSAudioUnlockPrompt(): Promise<void> {
  return new Promise((resolve) => {
    // 创建提示元素
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
        <h2 style="margin: 0 0 10px 0; font-size: 24px;">点击屏幕开�?/h2>
        <p style="margin: 0; font-size: 16px; opacity: 0.8;">
          iOS 设备需要用户交互才能启动音�?        </p>
      </div>
    `
    
    // 点击后解�?    const handleClick = async () => {
      await iosAudioContextManager.unlock()
      overlay.remove()
      resolve()
    }
    
    overlay.addEventListener('click', handleClick)
    overlay.addEventListener('touchstart', handleClick)
    
    document.body.appendChild(overlay)
  })
}

// 自动处理 iOS 音频解锁
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
