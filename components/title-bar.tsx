'use client'

import { useState, useEffect, memo, useCallback, useRef } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'
import { cn, isTauriEnv } from '@/lib/utils'

interface TitleBarProps {
  className?: string
}

const TitleBarInner = memo(function TitleBarInner({ className }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const isTauri = isTauriEnv()
  const unlistenRef = useRef<(() => void) | null>(null)

  const checkMaximized = useCallback(async () => {
    if (!isTauri) return
    try {
      const { isWindowMaximized } = await import('@/lib/native-window')
      const maximized = await isWindowMaximized()
      setIsMaximized(maximized)
    } catch (e) {
      console.debug('checkMaximized failed:', e)
    }
  }, [isTauri])

  useEffect(() => {
    if (!isTauri) return

    checkMaximized()

    const setupListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const window = getCurrentWindow()
        
        const unlisten = await window.onResized(async () => {
          checkMaximized()
        })
        
        unlistenRef.current = unlisten
      } catch (e) {
        console.debug('Failed to setup window resize listener, falling back to polling:', e)
        const pollInterval = setInterval(checkMaximized, 2000)
        return () => clearInterval(pollInterval)
      }
    }

    setupListener()

    return () => {
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
      console.debug('handleMinimize failed:', e)
    }
  }

  const handleMaximize = async () => {
    if (!isTauri) return
    try {
      const { maximizeWindow } = await import('@/lib/native-window')
      await maximizeWindow()
      setTimeout(checkMaximized, 100)
    } catch (e) {
      console.debug('handleMaximize failed:', e)
    }
  }

  const handleClose = async () => {
    if (!isTauri) return
    try {
      const { closeWindow } = await import('@/lib/native-window')
      await closeWindow()
    } catch (e) {
      console.debug('handleClose failed:', e)
    }
  }

  const handleDragStart = async () => {
    if (!isTauri) return
    try {
      const { startDragging } = await import('@/lib/native-window')
      await startDragging()
    } catch (e) {
      console.debug('handleDragStart failed:', e)
    }
  }

  return (
    <div
      className={cn(
        'h-10 bg-background border-b flex items-center justify-between select-none',
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
          className="h-10 w-12 flex items-center justify-center hover:bg-accent/50 transition-colors"
          title="Minimize"
        >
          <Minus className="w-4 h-4 text-foreground/70" />
        </button>
        <button
          onClick={handleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-10 w-12 flex items-center justify-center hover:bg-accent/50 transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
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
          className="h-10 w-12 flex items-center justify-center hover:bg-red-500/90 hover:text-white transition-colors"
          title="Close"
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
