export interface FocusModeState {
  isActive: boolean
  practiceType: 'interval' | 'scale' | 'chord' | 'chord_progression' | 'note'
  startTime: number | null
  elapsedTime: number
  targetDuration: number
  wakeLock: WakeLockSentinel | null
}

export interface FocusModeConfig {
  enableWakeLock: boolean
  enableFullscreen: boolean
  showTimer: boolean
  showProgress: boolean
  dimBackground: boolean
  hideDistractions: boolean
}

export const DEFAULT_FOCUS_CONFIG: FocusModeConfig = {
  enableWakeLock: true,
  enableFullscreen: true,
  showTimer: true,
  showProgress: true,
  dimBackground: true,
  hideDistractions: true,
}

export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if ('wakeLock' in navigator) {
    try {
      const wakeLock = await navigator.wakeLock.request('screen')
      console.log('Wake Lock acquired')
      return wakeLock
    } catch (err) {
      console.warn('Wake Lock failed:', err)
      return null
    }
  }
  return null
}

export async function releaseWakeLock(wakeLock: WakeLockSentinel | null): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release()
      console.log('Wake Lock released')
    } catch (err) {
      console.warn('Wake Lock release failed:', err)
    }
  }
}

export async function enterFullscreen(element: HTMLElement): Promise<boolean> {
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen()
      return true
    }
    return false
  } catch (err) {
    console.warn('Fullscreen failed:', err)
    return false
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    }
  } catch (err) {
    console.warn('Exit fullscreen failed:', err)
  }
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function calculateProgress(elapsed: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, (elapsed / target) * 100)
}

export class FocusModeManager {
  private state: FocusModeState = {
    isActive: false,
    practiceType: 'note',
    startTime: null,
    elapsedTime: 0,
    targetDuration: 0,
    wakeLock: null,
  }
  
  private config: FocusModeConfig = DEFAULT_FOCUS_CONFIG
  private timerInterval: NodeJS.Timeout | null = null
  private onStateChange: ((state: FocusModeState) => void) | null = null
  private element: HTMLElement | null = null
  private boundFullscreenChange: () => void
  private boundVisibilityChange: () => void
  
  constructor(config?: Partial<FocusModeConfig>) {
    if (config) {
      this.config = { ...DEFAULT_FOCUS_CONFIG, ...config }
    }
    
    this.boundFullscreenChange = this.handleFullscreenChange.bind(this)
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this)
    
    document.addEventListener('fullscreenchange', this.boundFullscreenChange)
    document.addEventListener('visibilitychange', this.boundVisibilityChange)
  }
  
  private handleFullscreenChange(): void {
    if (!document.fullscreenElement && this.state.isActive) {
      this.state = { ...this.state, isActive: false }
      this.notifyStateChange()
    }
  }
  
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible' && this.state.isActive && this.config.enableWakeLock) {
      requestWakeLock().then(wakeLock => {
        this.state = { ...this.state, wakeLock }
        this.notifyStateChange()
      })
    }
  }
  
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.state)
    }
  }
  
  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      if (this.state.startTime) {
        const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000)
        this.state = { ...this.state, elapsedTime: elapsed }
        this.notifyStateChange()
        
        if (this.state.targetDuration > 0 && elapsed >= this.state.targetDuration) {
          this.exit()
        }
      }
    }, 1000)
  }
  
  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }
  
  async enter(
    element: HTMLElement,
    practiceType: FocusModeState['practiceType'],
    targetDuration: number = 0
  ): Promise<boolean> {
    this.element = element
    
    if (this.config.enableFullscreen) {
      await enterFullscreen(element)
    }
    
    let wakeLock: WakeLockSentinel | null = null
    if (this.config.enableWakeLock) {
      wakeLock = await requestWakeLock()
    }
    
    this.state = {
      isActive: true,
      practiceType,
      startTime: Date.now(),
      elapsedTime: 0,
      targetDuration,
      wakeLock,
    }
    
    this.startTimer()
    this.notifyStateChange()
    
    return true
  }
  
  async exit(): Promise<void> {
    this.stopTimer()
    
    if (this.config.enableFullscreen && isFullscreen()) {
      await exitFullscreen()
    }
    
    if (this.state.wakeLock) {
      await releaseWakeLock(this.state.wakeLock)
    }
    
    this.state = {
      isActive: false,
      practiceType: 'note',
      startTime: null,
      elapsedTime: 0,
      targetDuration: 0,
      wakeLock: null,
    }
    
    this.notifyStateChange()
  }
  
  toggle(): void {
    if (this.state.isActive) {
      this.exit()
    } else if (this.element) {
      this.enter(this.element, this.state.practiceType, this.state.targetDuration)
    }
  }
  
  getState(): FocusModeState {
    return { ...this.state }
  }
  
  setOnStateChange(callback: (state: FocusModeState) => void): void {
    this.onStateChange = callback
  }
  
  updateConfig(config: Partial<FocusModeConfig>): void {
    this.config = { ...this.config, ...config }
  }
  
  destroy(): void {
    this.stopTimer()
    if (this.state.wakeLock) {
      releaseWakeLock(this.state.wakeLock)
    }
    document.removeEventListener('fullscreenchange', this.boundFullscreenChange)
    document.removeEventListener('visibilitychange', this.boundVisibilityChange)
  }
}
