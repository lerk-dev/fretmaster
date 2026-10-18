/**
 * 主题 → 底色的**唯一真相源**。
 *
 * ## 为什么需要这个文件
 *
 * 同一个「主题底色」此前有三份：
 *   1. `app/layout.tsx` 的内联脚本（pre-hydration 首绘前刷背景，必须内联，不能 import）；
 *   2. 各主题类在 `globals.css` 里的 `--background`（CSS 侧真正生效的那份）；
 *   3. `lib/native-window.ts::setTrueFullscreen` 里**写死的 `'#0b0f14'`** ——
 *      而且这个值既不在主题表里、跟 `dark` 的 `#101317` 也不一样。
 *
 * 第 3 份的后果：桌面版用浅色主题进真全屏时，WebView 底色仍是深色 ⇒
 * 客户区外的过扫描区露出深色边（真全屏下最容易看见）。
 *
 * 现在：这里的表就是第 1 份的数据源，`lib/native-window.ts` 从它取色，
 * 并由 `__tests__/theme-colors.test.ts` 钉死「layout 内联表与这里逐项一致」
 *（内联脚本没法 import，只能靠测试比对 —— 别再手抄第三份）。
 *
 * ⚠️ 改动这里的值时，必须同步 `globals.css` 的 `--background` 与 layout 内联表，
 *    否则就会出现「首绘一眼一个色、稳态另一个色」的跳变。
 */
import type { ThemeMode } from './store'

/** 22 个主题（11 种风格 × 明暗）的底色，与 globals.css 的 --background 对应 */
export const THEME_BACKGROUNDS: Record<ThemeMode, string> = {
  light: '#eeebe6',
  dark: '#101317',
  'forest-light': '#dbe5d6',
  'forest-dark': '#0d1410',
  'ocean-light': '#d9e6f2',
  'ocean-dark': '#0a1420',
  'sunset-light': '#f5e0d4',
  'sunset-dark': '#1a0e0a',
  'monochrome-light': '#e8e8e8',
  'monochrome-dark': '#0a0a0a',
  'rose-light': '#f0dce0',
  'rose-dark': '#1a0d11',
  'midnight-light': '#dfe1f0',
  'midnight-dark': '#080a1a',
  'sand-light': '#ede0c8',
  'sand-dark': '#1a140d',
  'celadon-light': '#dce8e0',
  'celadon-dark': '#0a1410',
  'lavender-light': '#e2dcec',
  'lavender-dark': '#0f0a1a',
  'carbon-light': '#e0e0e0',
  'carbon-dark': '#0a0a0a',
}

/** 兜底：未知/缺失主题按深色处理（与 layout 内联脚本的 `|| '#101317'` 一致） */
export const FALLBACK_THEME_BACKGROUND = THEME_BACKGROUNDS.dark

/**
 * 取主题底色。接受任意字符串（来自持久化/导入设置，可能是历史值），
 * 未知值一律回落到深色 —— 不抛错，也不返回空串（空串会让 setBackgroundColor 变成透明）。
 */
export function themeBackgroundColor(theme: string | null | undefined): string {
  if (theme && Object.prototype.hasOwnProperty.call(THEME_BACKGROUNDS, theme)) {
    return THEME_BACKGROUNDS[theme as ThemeMode]
  }
  return FALLBACK_THEME_BACKGROUND
}
