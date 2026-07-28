import './globals.css'
import '@fontsource/noto-music'
import { LayoutShell } from '@/components/layout-shell'

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#101317' },
    { media: '(prefers-color-scheme: light)', color: '#eeebe6' },
  ],
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
          (function(){
            try {
              // Pre-hydration 主题应用：在首绘前读取 localStorage 的持久化主题，
              // 避免非深色主题用户加载时看到深色跳变
              var THEME_CLASSES = ['light','dark','forest-light','forest-dark','ocean-light','ocean-dark','sunset-light','sunset-dark','monochrome-light','monochrome-dark','rose-light','rose-dark','midnight-light','midnight-dark','sand-light','sand-dark','celadon-light','celadon-dark','lavender-light','lavender-dark','carbon-light','carbon-dark'];
              // 各主题的初始背景色（与 globals.css 中 --background 对应）
              var THEME_BG = {
                'light': '#eeebe6', 'dark': '#101317',
                'forest-light': '#dbe5d6', 'forest-dark': '#0d1410',
                'ocean-light': '#d9e6f2', 'ocean-dark': '#0a1420',
                'sunset-light': '#f5e0d4', 'sunset-dark': '#1a0e0a',
                'monochrome-light': '#e8e8e8', 'monochrome-dark': '#0a0a0a',
                'rose-light': '#f0dce0', 'rose-dark': '#1a0d11',
                'midnight-light': '#dfe1f0', 'midnight-dark': '#080a1a',
                'sand-light': '#ede0c8', 'sand-dark': '#1a140d',
                'celadon-light': '#dce8e0', 'celadon-dark': '#0a1410',
                'lavender-light': '#e2dcec', 'lavender-dark': '#0f0a1a',
                'carbon-light': '#e0e0e0', 'carbon-dark': '#0a0a0a'
              };
              var raw = localStorage.getItem('fretmaster-store');
              var theme = 'dark';
              if (raw) {
                try {
                  var parsed = JSON.parse(raw);
                  var stored = parsed && parsed.state && parsed.state.user && parsed.state.user.theme;
                  if (stored && THEME_BG[stored]) theme = stored;
                } catch(e){}
              }
              var bg = THEME_BG[theme] || '#101317';
              var html = document.documentElement;
              // 移除所有主题类，添加当前主题
              for (var i = 0; i < THEME_CLASSES.length; i++) html.classList.remove(THEME_CLASSES[i]);
              html.classList.add(theme);
              html.style.backgroundColor = bg;
            } catch(e) {}
          })();
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
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  )
}
