import type { Metadata } from 'next'
import './globals.css'
import { TitleBar } from '@/components/title-bar'

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
      <body className="font-sans antialiased flex flex-col h-screen overflow-hidden" suppressHydrationWarning>
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  )
}
