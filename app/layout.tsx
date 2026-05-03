import type { Metadata } from 'next'
import './globals.css'
import { TitleBar } from '@/components/title-bar'
import { DebugPanel } from '@/components/debug-panel'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'FretMaster - 吉他指板练习工具',
  description: '专业的吉他指板可视化练习工具，助你掌握指板音符位置',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          window.__fmerrors = [];
          window.onerror = function(msg, src, line, col, err) {
            var info = (err && err.message) || msg;
            window.__fmerrors.push('[onerror] ' + info + ' @ ' + src + ':' + line);
            var el = document.getElementById('__fmerr');
            if (el) { el.textContent = window.__fmerrors.join('\\n'); el.classList.remove('hidden'); }
          };
          window.addEventListener('unhandledrejection', function(e) {
            var info = e.reason && (e.reason.message || e.reason);
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
      </head>
      <body className="font-sans antialiased flex flex-col h-screen overflow-hidden" suppressHydrationWarning>
        <div id="__fmerr" className="hidden fixed bottom-0 left-0 right-0 z-[99999] bg-red-950 text-red-400 p-2 text-[11px] font-mono max-h-[120px] overflow-auto whitespace-pre-wrap border-t-2 border-red-600"></div>
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
        <DebugPanel />
        <Toaster />
      </body>
    </html>
  )
}
