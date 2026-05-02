'use client'

import { useState, useEffect, memo } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// 检查是否在 Tauri 环境
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__

interface TitleBarProps {
  className?: string
}

export const TitleBar = memo(function TitleBar({ className }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    setIsNative(isTauri)
    if (isTauri) {
      checkMaximized()
    }
  }, [])

  const checkMaximized = async () => {
    if (!isTauri) return
    try {
      const { isWindowMaximized } = await import('@/lib/native-window')
      const maximized = await isWindowMaximized()
      setIsMaximized(maximized)
    } catch (e) {
      console.error('Failed to check window state:', e)
    }
  }

  const handleMinimize = async () => {
    if (!isTauri) return
    try {
      const { minimizeWindow } = await import('@/lib/native-window')
      await minimizeWindow()
    } catch (e) {
      console.error('Failed to minimize window:', e)
    }
  }

  const handleMaximize = async () => {
    if (!isTauri) return
    try {
      const { maximizeWindow } = await import('@/lib/native-window')
      await maximizeWindow()
      await checkMaximized()
    } catch (e) {
      console.error('Failed to maximize window:', e)
    }
  }

  const handleClose = async () => {
    if (!isTauri) return
    try {
      const { closeWindow } = await import('@/lib/native-window')
      await closeWindow()
    } catch (e) {
      console.error('Failed to close window:', e)
    }
  }

  const handleDragStart = async () => {
    if (!isTauri) return
    try {
      const { startDragging } = await import('@/lib/native-window')
      await startDragging()
    } catch (e) {
      console.error('Failed to start dragging:', e)
    }
  }

  // Web 版本不显示自定义标题栏
  if (!isNative) {
    return null
  }

  return (
    <div
      className={cn(
        'h-10 bg-background border-b flex items-center justify-between select-none',
        className
      )}
    >
      {/* 左侧：标题和图标区域 - 可拖动 */}
      <div 
        className="flex items-center gap-2 px-4 flex-1 h-full"
        onMouseDown={handleDragStart}
      >
        <div className="w-5 h-5 rounded bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">F</span>
        </div>
        <span className="text-sm font-medium text-foreground/80">FretMaster</span>
      </div>

      {/* 右侧：窗口控制按钮 - 不可拖动 */}
      <div className="flex items-center">
        <button
          onClick={handleMinimize}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-10 w-12 flex items-center justify-center hover:bg-accent/50 transition-colors"
          title="最小化"
        >
          <Minus className="w-4 h-4 text-foreground/70" />
        </button>
        <button
          onClick={handleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-10 w-12 flex items-center justify-center hover:bg-accent/50 transition-colors"
          title={isMaximized ? '还原' : '最大化'}
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
          title="关闭"
        >
          <X className="w-4 h-4 text-foreground/70 hover:text-white" />
        </button>
      </div>
    </div>
  )
})
