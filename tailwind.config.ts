import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  // 🚨 这里必须覆盖**所有会写 tailwind 类名的源码目录**。
  // 漏一个目录 ⇒ 该目录里的类名在产物 CSS 里被静默 purge：不报错、不告警，
  // 只是运行时「没有样式」。2026-10-01 实测：`lib/` 曾被漏掉，导致
  // `lib/fretboard-note-button-color.ts`（经典皮肤配色的唯一实现）里的
  // `bg-emerald-400/50`（音阶/和弦音）、`bg-blue-400/60`（根音）、`bg-amber-400`
  // （一弦三音当前目标）、`opacity-20`（限制品区压暗）与整套「下一把位预览」配色
  // 在**生产和开发**两种产物里全都不存在（浏览器实测 18 个类不在样式表）。
  // 护栏：`__tests__/tailwind-content.test.ts`（动态扫目录，漏一个就红）。
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // 指板字体（两套皮肤共用一条栈）。
      //
      // 🚨 这里**不写字体族字面量**，只把工具类指向 globals.css 的 `--font-fretboard`
      // （唯一真相源）。写成 `fretboard: ['ui-monospace', ...]` 会得到第二份栈，
      // 与 `.gr-*` 用的 CSS 变量静默分叉 —— 正是铁律 14 禁的「同一量的判定逻辑两份」。
      // 产物形态：`.font-fretboard{font-family:var(--font-fretboard)}`。
      fontFamily: {
        fretboard: 'var(--font-fretboard)',
      },
      // 🚨 显示缩放（displayScale）依赖这些 token —— 必须用 **rem** 而非 px。
      //
      // 背景：`displayScale` 曾用根容器 CSS `zoom` 实现，但 `zoom` **参与布局计算**
      // （MDN），会压缩逻辑可用宽 ⇒ 放大后标题反而被截断、按钮出屏。
      // 现改为「只改 html 根字号」：`document.documentElement.style.fontSize = 16 * z`。
      // 该方案要求**所有字号都是 rem**（rem 认 html 根字号），
      // 而 Tailwind 内置档位（text-xs/sm/base/lg/2xl…）**本来就是 rem**（实测产物 CSS）。
      //
      // 唯一的钉子是全站 121 处 `text-[10px]` 这类 **px 任意值** —— 它们写死物理像素、
      // 不随根字号缩放。以下 4 个 token 就是它们的语义化替代（取值集合只有这 4 个）：
      //   text-[10px] ×106 → text-2xs         text-[11px] ×6 → text-2xs-plus
      //   text-[9px]  ×6   → text-3xs         text-[8px]  ×3 → text-4xs
      // ⚠️ 命名是**尺寸序**而非像素值，将来调整基准只改这里一处。
      fontSize: {
        '4xs': ['0.5rem', { lineHeight: '0.75rem' }],      // 8px  基准：指板/钢琴键最小字
        '3xs': ['0.5625rem', { lineHeight: '0.8125rem' }], // 9px  基准：极小徽标
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],   // 10px 基准：标签/说明（主力）
        '2xs-plus': ['0.6875rem', { lineHeight: '0.9375rem' }], // 11px 基准：小标签
      },
    },
  },
  plugins: [],
}

export default config
