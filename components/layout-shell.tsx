"use client"

import { TitleBar } from '@/components/title-bar'
import { DebugPanel } from '@/components/debug-panel'
import { Toaster } from 'sonner'
import { ClientOnly } from '@/components/client-only'
import { ErrorBoundary } from '@/components/error-boundary'
import { useAppStore, isLightTheme } from '@/lib/store'
import { applySiteMeta } from '@/lib/site-meta'
import { useEffect, useState } from 'react'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const isFullscreen = useAppStore((state) => state.isFullscreen)
  const theme = useAppStore((state) => state.user.theme)
  const language = useAppStore((state) => state.user.language)
  // 客户端 mounted 标记，避免 hydration mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const sonnerTheme = mounted && isLightTheme(theme) ? 'light' : 'dark'

  // 语言切换时同步文档标题 / meta description / <html lang> 标注。
  // 🚨 描述也要同步（审计 2026-10-31 第 14 项）：静态导出只有一份 HTML，原先
  //    `meta[name=description]` 永远是中文 ⇒ 英文用户分享出去的链接预览是中文。
  //    站点元信息的文案与写入逻辑统一在 `lib/site-meta.ts`（可单测）。
  useEffect(() => {
    applySiteMeta(language)
  }, [language])

  // 同步 isFullscreen 到 html/body 标签（html/body 在 server component 中渲染，需在此副作用操作 DOM）
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    if (isFullscreen) {
      html.classList.add('fullscreen-mode')
      body.style.margin = '0'
      body.style.padding = '0'
      body.style.position = 'fixed'
      body.style.top = '0'
      body.style.left = '0'
      body.style.right = '0'
      body.style.bottom = '0'
      body.style.width = '100vw'
      body.style.height = '100vh'
    } else {
      html.classList.remove('fullscreen-mode')
      body.style.margin = ''
      body.style.padding = ''
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.bottom = ''
      body.style.width = ''
      body.style.height = ''
    }
  }, [isFullscreen])

  return (
    <>
      {!isFullscreen && (
        <ClientOnly>
          <TitleBar />
        </ClientOnly>
      )}
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary language={language}>
          {children}
        </ErrorBoundary>
      </div>
      {!isFullscreen && (
        <ClientOnly>
          <DebugPanel />
        </ClientOnly>
      )}
      <Toaster
        theme={sonnerTheme}
        richColors
        closeButton
        position="top-center"
      />
    </>
  )
}
