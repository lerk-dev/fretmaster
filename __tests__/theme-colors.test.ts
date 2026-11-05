/**
 * `lib/theme-colors.ts` 与 `app/layout.tsx` 内联脚本的**一致性**护栏。
 *
 * ## 为什么是「比对」而不是「引用」
 *
 * `app/layout.tsx` 的那段脚本必须**内联**（在首绘前刷 `html` 的主题类与背景色，
 * 否则非深色用户会先看到深色再跳变），因此它不能 `import` 本模块 —— 只能手抄一份。
 * 手抄就会漂移：此前不仅有这两份，`lib/native-window.ts::setTrueFullscreen` 还写死了
 * 第三份 `'#0b0f14'`（既不在表里、也与 dark 的 `#101317` 不同），
 * 导致「浅色主题 + 真全屏」露出深色过扫描边。
 *
 * 现在第三份已经删掉（改为从 `themeBackgroundColor()` 取），
 * 剩下这两份由本文件钉死：内联表少一项、多一项、或某个色号被改，都会红。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { THEME_BACKGROUNDS, themeBackgroundColor, FALLBACK_THEME_BACKGROUND } from '@/lib/theme-colors'

const layoutSrc = readFileSync('app/layout.tsx', 'utf8')

/** 从内联脚本里抠出 `var THEME_BG = { ... }` */
function inlineBackgrounds(): Record<string, string> {
  const start = layoutSrc.indexOf('var THEME_BG = {')
  expect(start, '内联脚本里找不到 THEME_BG（结构变了，请同步本用例）').toBeGreaterThan(-1)
  const end = layoutSrc.indexOf('};', start)
  const block = layoutSrc.slice(start, end)
  return Object.fromEntries(
    [...block.matchAll(/'([a-z-]+)':\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => [m[1], m[2]]),
  )
}

/** 从内联脚本里抠出 `var THEME_CLASSES = [ ... ]` */
function inlineClasses(): string[] {
  const start = layoutSrc.indexOf('var THEME_CLASSES = [')
  expect(start, '内联脚本里找不到 THEME_CLASSES').toBeGreaterThan(-1)
  const end = layoutSrc.indexOf('];', start)
  return [...layoutSrc.slice(start, end).matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
}

describe('主题底色：内联表与 lib/theme-colors.ts 必须逐项一致', () => {
  it('内联表解析出 22 项（11 风格 × 明暗）', () => {
    expect(Object.keys(inlineBackgrounds())).toHaveLength(22)
  })

  it('🚨 两张表的键与色号完全一致（漏一项 = 首绘配色与稳态不一致）', () => {
    expect(inlineBackgrounds()).toEqual(THEME_BACKGROUNDS)
  })

  it('🚨 内联的 THEME_CLASSES 与底色表的键完全一致（多一个类会切换不掉）', () => {
    expect([...inlineClasses()].sort()).toEqual(Object.keys(THEME_BACKGROUNDS).sort())
  })

  it('每种主题都有非空底色（空串会让 setBackgroundColor 变透明）', () => {
    for (const [theme, color] of Object.entries(THEME_BACKGROUNDS)) {
      expect(color, `${theme} 的底色为空`).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

describe('themeBackgroundColor 的兜底', () => {
  it('已知主题返回对应色号', () => {
    expect(themeBackgroundColor('dark')).toBe('#101317')
    // 2026-11-03 UI 改版：经典浅色改为暖羊皮纸（不再是近白灰）
    expect(themeBackgroundColor('light')).toBe('#e1d9cc')
    expect(themeBackgroundColor('ocean-dark')).toBe('#0a1420')
  })

  it('未知 / 空 / null 一律回落到深色（与内联脚本的 `|| #101317` 一致）', () => {
    expect(themeBackgroundColor('nope')).toBe(FALLBACK_THEME_BACKGROUND)
    expect(themeBackgroundColor('')).toBe(FALLBACK_THEME_BACKGROUND)
    expect(themeBackgroundColor(null)).toBe(FALLBACK_THEME_BACKGROUND)
    expect(themeBackgroundColor(undefined)).toBe(FALLBACK_THEME_BACKGROUND)
    expect(FALLBACK_THEME_BACKGROUND).toBe('#101317')
  })

  it('不把原型链上的键当成主题（防 `toString` 之类）', () => {
    expect(themeBackgroundColor('toString')).toBe(FALLBACK_THEME_BACKGROUND)
  })
})


/**
 * 🚨 2026-11-05：经典浅色在**三个**地方各写了一份底色 ——
 *   · app/globals.css 的 `.light { --background: H S% L% }`（页面最终渲染色）
 *   · app/layout.tsx 的 `themeColor` + 内联 `THEME_BG.light`（首绘 / 浏览器 UI 色）
 *   · lib/theme-colors.ts 的 `THEME_BACKGROUNDS.light`（Tauri WebView 常驻底色）
 * 上面的护栏只比对后两份，**CSS 那份没人钉** ⇒ 2026-11-03 UI 改版把 CSS 改成
 * `hsl(38 26% 84%)`（浏览器实测 = #e1d9cc），手抄的 hex 却写成 `#eed9cc`（R 差 13）
 * ⇒ 桌面端过扫描边 / 滚动回弹露出偏红的底色、首绘也会闪一下。
 * 这里把 CSS 一并纳入：三份必须逐字节一致。
 */
describe('CSS --background 与内联表 / lib 表三处一致（经典浅色）', () => {
  function hslToHex(h: number, s: number, l: number): string {
    s /= 100
    l /= 100
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r: number, g: number, b: number
    if (h < 60) { r = c; g = x; b = 0 }
    else if (h < 120) { r = x; g = c; b = 0 }
    else if (h < 180) { r = 0; g = c; b = x }
    else if (h < 240) { r = 0; g = x; b = c }
    else if (h < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }
    return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
  }

  it('CSS 的 .light --background(HSL) 换算后 == lib 表 == 内联表 == themeColor', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const at = css.indexOf('.light {')
    expect(at, 'globals.css 里找不到 .light 规则块（锚点失效）').toBeGreaterThan(-1)
    const body = css.slice(at, css.indexOf('}', at))
    const m = body.match(/--background:\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%/)
    expect(m, '.light 块里没有 HSL 格式的 --background').not.toBeNull()
    const fromCss = hslToHex(Number(m![1]), Number(m![2]), Number(m![3]))
    expect(THEME_BACKGROUNDS.light, `CSS 换算出 ${fromCss}，lib 表却不是这个值`).toBe(fromCss)
    expect(inlineBackgrounds().light, '内联 THEME_BG.light 与 CSS 不一致（首绘闪色）').toBe(fromCss)
    expect(layoutSrc, 'viewport.themeColor 的 light 与 CSS 不一致（浏览器 UI 色差）').toContain(`color: '${fromCss}'`)
  })
})
