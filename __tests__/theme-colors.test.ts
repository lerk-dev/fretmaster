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
    expect(themeBackgroundColor('light')).toBe('#eeebe6')
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
