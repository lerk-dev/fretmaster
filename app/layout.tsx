"use client"

import './globals.css'
import { TitleBar } from '@/components/title-bar'
import { DebugPanel } from '@/components/debug-panel'
import { Toaster } from 'sonner'
import { ClientOnly } from '@/components/client-only'
import { ErrorBoundary } from '@/components/error-boundary'
import { useAppStore } from '@/lib/store'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const isFullscreen = useAppStore((state) => state.isFullscreen)
  
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          window.__fmerrors = [];
          window.onerror = function(msg, src, line, col, err) {
            var info = (err && err.message) || msg;
            if (info && info.indexOf('Hydration') !== -1) return;
            if (info && info.indexOf('418') !== -1) return;
            window.__fmerrors.push('[onerror] ' + info + ' @ ' + src + ':' + line);
            var el = document.getElementById('__fmerr');
            if (el) { el.textContent = window.__fmerrors.join('\\n'); el.classList.remove('hidden'); }
          };
          window.addEventListener('unhandledrejection', function(e) {
            var info = e.reason && (e.reason.message || e.reason);
            if (info && info.indexOf('Hydration') !== -1) return;
            if (info && info.indexOf('418') !== -1) return;
            window.__fmerrors.push('[rejection] ' + info);
            var el = document.getElementById('__fmerr');
            if (el) { el.textContent = window.__fmerrors.join('\\n'); el.classList.remove('hidden'); }
          });
        `}} />
        {/* Noto Music - 专业音乐符号字体，覆盖 ♯♭♮Δø° 等音乐记号 */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Music&text=%E2%99%AF%E2%99%AE%E2%99%AD%CE%94%C3%B8%C2%B0%E2%81%80%E2%81%B1%E2%81%B2%E2%81%B3%E2%81%B4%E2%81%B5%E2%81%B6%E2%81%B7%E2%81%B8%E2%81%B9&display=swap"
          rel="stylesheet"
        />
        <title>FretMaster - 吉他指板练习工具</title>
        <meta name="description" content="专业的吉他指板可视化练习工具，助你掌握指板音符位置" />
        <meta name="generator" content="v0.app" />
        <link rel="icon" href="/icon-light-32x32.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/icon-dark-32x32.png" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className="font-sans antialiased flex flex-col h-screen overflow-hidden" suppressHydrationWarning>
        <div id="__fmerr" className="hidden fixed bottom-0 left-0 right-0 z-[99999] bg-red-950 text-red-400 p-2 text-[11px] font-mono max-h-[120px] overflow-auto whitespace-pre-wrap border-t-2 border-red-600"></div>
        {!isFullscreen && (
          <ClientOnly>
            <TitleBar />
          </ClientOnly>
        )}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
        {!isFullscreen && (
          <ClientOnly>
            <DebugPanel />
          </ClientOnly>
        )}
        <Toaster />
      </body>
    </html>
  )
}
