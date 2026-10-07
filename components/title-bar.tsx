'use client'

import { useState, useEffect, memo, useCallback, useRef } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'
import { cn, isTauriEnv } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { createTranslator } from '@/lib/i18n'
import { logger } from '@/lib/logger'

interface TitleBarProps {
  className?: string
}

const TitleBarInner = memo(function TitleBarInner({ className }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const isTauri = isTauriEnv()
  const language = useAppStore((s) => s.user.language)
  // 译文统一走 i18n 表（title_* 键早已存在）；此前这里内联了同义中英文三元表达式，
  // 相当于把译文复制了一份 —— 改 i18n 表不会同步，是典型的"看似没问题"的漂移隐患。
  const t = createTranslator(language)
  const unlistenRef = useRef<(() => void) | null>(null)

  const checkMaximized = useCallback(async () => {
    if (!isTauri) return
    try {
      const { isWindowMaximized } = await import('@/lib/native-window')
      const maximized = await isWindowMaximized()
      setIsMaximized(maximized)
    } catch (e) {
      logger.debug('checkMaximized failed:', e)
    }
  }, [isTauri])

  useEffect(() => {
    if (!isTauri) return

    checkMaximized()

    let cancelled = false
    let stopPolling: (() => void) | null = null

    const setupListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const window = getCurrentWindow()

        const unlisten = await window.onResized(async () => {
          checkMaximized()
        })

        // 若在 await 期间组件已卸载，立刻注销，避免监听器泄漏
        if (cancelled) {
          unlisten()
          return
        }
        unlistenRef.current = unlisten
      } catch (e) {
        logger.debug('Failed to setup window resize listener, falling back to polling:', e)
        if (cancelled) return
        // ⚠️ 轮询必须能被卸载清理。原先这里 `return () => clearInterval(...)`，
        // 但 `setupListener()` 的返回值没人接收 ⇒ setInterval 永不释放：
        // 进全屏时 layout-shell 会卸载 TitleBar，轮询却继续每 2s 发一次 IPC。
        const pollInterval = setInterval(checkMaximized, 2000)
        stopPolling = () => clearInterval(pollInterval)
      }
    }

    setupListener()

    return () => {
      cancelled = true
      if (stopPolling) stopPolling()
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [isTauri, checkMaximized])

  const handleMinimize = async () => {
    if (!isTauri) return
    try {
      const { minimizeWindow } = await import('@/lib/native-window')
      await minimizeWindow()
    } catch (e) {
      logger.debug('handleMinimize failed:', e)
    }
  }

  const handleMaximize = async () => {
    if (!isTauri) return
    try {
      const { maximizeWindow } = await import('@/lib/native-window')
      await maximizeWindow()
      setTimeout(checkMaximized, 100)
    } catch (e) {
      logger.debug('handleMaximize failed:', e)
    }
  }

  const handleClose = async () => {
    if (!isTauri) return
    try {
      const { closeWindow } = await import('@/lib/native-window')
      await closeWindow()
    } catch (e) {
      logger.debug('handleClose failed:', e)
    }
  }

  const handleDragStart = async () => {
    if (!isTauri) return
    try {
      const { startDragging } = await import('@/lib/native-window')
      await startDragging()
    } catch (e) {
      logger.debug('handleDragStart failed:', e)
    }
  }

  return (
    <div
      className={cn(
        'h-11 bg-background border-b flex items-center justify-between select-none',
        className
      )}
    >
      <div 
        className="flex items-center gap-2 px-4 flex-1 h-full"
        onMouseDown={handleDragStart}
      >
        <div className="w-5 h-5 rounded bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">F</span>
        </div>
        <span className="text-sm font-medium text-foreground/80">FretMaster</span>
      </div>

      <div className="flex items-center">
        <button
          onClick={handleMinimize}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-11 w-12 flex items-center justify-center hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:bg-accent/50"
          title={t('title_minimize')}
          aria-label={t('title_minimize')}
        >
          <Minus className="w-4 h-4 text-foreground/70" />
        </button>
        <button
          onClick={handleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-11 w-12 flex items-center justify-center hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:bg-accent/50"
          title={isMaximized ? t('title_restore') : t('title_maximize')}
          aria-label={isMaximized ? t('title_restore') : t('title_maximize')}
        >
          {isMaximized ? (
            <Square className="w-3.5 h-3.5 text-foreground/70" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 text-foreground/70" />
          )}
        </button>
        <button
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-11 w-12 flex items-center justify-center hover:bg-red-500/90 hover:text-white transition-colors focus-visible:outline-none focus-visible:bg-red-500/90"
          title={t('title_close')}
          aria-label={t('title_close')}
        >
          <X className="w-4 h-4 text-foreground/70 hover:text-white" />
        </button>
      </div>
    </div>
  )
})

export function TitleBar({ className }: TitleBarProps) {
  const [isNative, setIsNative] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__
    setIsNative(isTauri)
  }, [])

  if (!mounted || !isNative) {
    return null
  }

  return <TitleBarInner className={className} />
}
