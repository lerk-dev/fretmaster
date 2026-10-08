/**
 * 「点开下拉选框时，最右边的边框向左跳」—— Radix 浮层的滚动条补偿必须被对掉。
 *
 * ## 现象与根因（真机实测，2026-10-08）
 *
 * Radix 的 Select / Dialog / DropdownMenu 等在打开时经 `react-remove-scroll` 注入：
 *
 *   body[data-scroll-locked] { margin-right: <gap>px !important; ... }
 *
 * 其中 `gap = window.innerWidth - document.documentElement.clientWidth`
 * （`react-remove-scroll-bar/dist/*\/utils.js` 的 `getGapWidth`，默认 gapMode='margin'，
 *  `@radix-ui/react-select` 未覆盖该默认值）。意图是补偿「页面滚动条被移除」的宽度跳变。
 *
 * 但本项目的滚动条是 **html 上常驻**的（`app/globals.css` 的
 * `html { overflow-y: scroll; scrollbar-gutter: stable }`），打开浮层并不会让它消失。
 * 真机量（headless Chrome 155，脚本 `scripts/cdp-probe-select.mjs`，视口 1280）：
 *
 *   打开前  documentElement.clientWidth = 1246, body.margin-right = 0px,   body 宽 1246
 *   打开后  documentElement.clientWidth = 1246（**没变**）, margin-right = 8px, body 宽 1238
 *   ⇒ 下拉框右边界 722 → 718（Δ = −4；容器居中，左右各移一半）
 *   ⇒ 按 Esc 关闭后完全复原
 *
 * 即：这笔补偿**没有换来任何东西**，纯粹让页面右侧整体左移一个滚动条宽。
 * 用户看到的就是「最右侧的 border 向左移动」。
 *
 * ## 为什么用「源码级护栏」而不是行为断言
 *
 * jsdom 没有布局引擎 —— 任何 `getBoundingClientRect()` 在本环境下恒等于 0，
 * 写「宽度不变」的断言只会恒真（假通过）。真正的回归防线是**真机探针**
 * （`scripts/cdp-probe-select.mjs`，改完 CSS 后重跑，判据是「打开前后 Δ 必须为 0」），
 * 而本文件守的是**让真机修复静默失效的三个写法陷阱**：
 *
 *   ① 规则被挪进 `@layer` —— 分层样式会被 Radix 的**非分层**运行时样式压过，
 *      与特异性高低无关（CSS Cascade Layers 规则）。改对了写法也照样失效。
 *   ② 选择器退化成裸 `body[data-scroll-locked]` —— 与 Radix 注入的规则**特异性相同**，
 *      而 Radix 的 <style> 是运行时插到 head 末尾的 ⇒ 后者胜出，修复等于没写。
 *   ③ 丢掉 `!important` —— 被 Radix 的 `!important` 直接压过。
 *
 * 三种失效**都不会报错、不会被任何行为测试发现**，只会在真机上重新跳那一下。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const CSS_PATH = 'app/globals.css'
const rawCss = readFileSync(CSS_PATH, 'utf8')

/**
 * 剥掉块注释后再做判定。
 * ⚠️ 本文件的说明性注释里会引用 Radix 注入规则的**原文**（里面就有裸 `body[...]`
 *    和 `@layer` 字样）。不剥注释，「裸选择器」「落在 layer 内」这类判据会被
 *    注释自己命中 ⇒ 恒红；反过来只要把注释改个写法又会变恒绿 —— 都是假判据。
 * 实测：未剥注释时第 4 条用例报 bare.length = 1，命中的正是注释里那行规则原文。
 */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '')

/** 目标选择器：必须**带祖先限定**（html / :root），不能是裸 body[...] */
const TARGET_RE = /(^|[\s,{};])((?:html|:root)\s+body\[data-scroll-locked\])\s*\{([^}]*)\}/g

/** 找出所有 `@layer ... { }` 块的 [start, end) 区间（大括号配对） */
function layerRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const opener = /@layer[\w-]*(?:\s+[\w-]+)?\s*\{/g
  let m: RegExpExecArray | null
  while ((m = opener.exec(src)) !== null) {
    const start = m.index
    let depth = 0
    let i = src.indexOf('{', start)
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    ranges.push([start, i + 1])
  }
  return ranges
}

const ranges = layerRanges(css)
const matches = Array.from(css.matchAll(TARGET_RE))

describe('滚动条补偿对掉规则（源码级护栏）', () => {
  it('globals.css 里存在带祖先限定的对掉规则', () => {
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('规则体把 margin-right 置 0 且带 !important（缺 !important 会被 Radix 压过）', () => {
    expect(matches.length).toBeGreaterThanOrEqual(1)
    const bodies = matches.map((m) => m[3])
    const ok = bodies.some((body) => {
      const decl = /margin-right\s*:\s*0(?:px)?\s*!important/i
      return decl.test(body)
    })
    expect(ok, `规则体里没有 "margin-right: 0 !important"，实际: ${JSON.stringify(bodies)}`).toBe(true)
  })

  it('规则位于任何 @layer 块之外（分层样式会被 Radix 的非分层样式压过）', () => {
    expect(matches.length).toBeGreaterThanOrEqual(1)
    const inside = matches.filter((m) => {
      const idx = m.index ?? -1
      return ranges.some(([s, e]) => idx >= s && idx < e)
    })
    expect(
      inside.length,
      `对掉规则被写进了 @layer 块（区段 ${JSON.stringify(ranges)}）—— 这在真机上会静默失效`,
    ).toBe(0)
  })

  it('选择器不是裸 body[...]（特异性必须严格高于 Radix 注入的 body[...]）', () => {
    expect(matches.length).toBeGreaterThanOrEqual(1)
    // TARGET_RE 已要求 html/:root 前缀；这条用例把「裸 body 写法」作为反面钉住，
    // 防止有人「简化」掉祖先限定符。
    // ⚠️ 必须锚在行首：写成 /(^|[\s,{};])body\[...\]/ 会把 `html body[...]`
    //    里的 body 也匹配上（它前面正好是空格）⇒ 用例恒红或恒绿的假判据。
    const bareRe = /^[ \t]*body\[data-scroll-locked\]\s*\{/gm
    const bare = Array.from(css.matchAll(bareRe))
    expect(bare.length, '出现了裸 body[data-scroll-locked] 规则，特异性与 Radix 相同 ⇒ 会被后者压过').toBe(0)
  })
})
