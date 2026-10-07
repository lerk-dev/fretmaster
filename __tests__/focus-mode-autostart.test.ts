/**
 * 专注模式「自动全屏」与「隐藏干扰元素」的**源码级**契约（2026-10-04 实现）。
 *
 * 背景（考古自 a3815f9a2 的 diff）：
 *   `enableFullscreen` 原本在 page.tsx 的 effect 里接线（enabled && enableFullscreen → 全屏），
 *   2026-07-10「浮动侧边面板」改造把**进入侧**删了、只留退出侧 ⇒ 字段悬空近三个月；
 *   `dimBackground` / `hideDistractions` 的旧消费随「覆盖层 → 浮面板」形态改造一并失效
 *   （前者原为覆盖层遮罩深浅、后者从未有过消费逻辑）。
 *
 * 为什么只能靠源码断言：
 *   · 接线点在 app/page.tsx（5000+ 行巨石）的 effect 里 —— 无法单独渲染；
 *   · bug 形态 = 「条件被绕过 / 调用缺失 / 依赖数组漂移」，且 vitest 里没有 Tauri 原生全屏。
 *
 * 职责边界（铁律 14）：行为侧（暗纱渲染 / html.focus-clean 同步）由
 * `focus-mode.test.ts` 覆盖；本文件只钉 page.tsx 接线与 CSS/标记两半，两处不重复判定。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PAGE_SRC = readFileSync('app/page.tsx', 'utf8')
const CSS_SRC = readFileSync('app/globals.css', 'utf8')
const PMC_SRC = readFileSync('components/practice-mode-controls.tsx', 'utf8')
const FSO_SRC = readFileSync('components/fullscreen-overlay.tsx', 'utf8')

/** 从 page.tsx 切出「专注模式 × 全屏」effect 整块（从 ref 声明到 deps 数组收尾）。 */
function sliceFocusFullscreenEffect(): string {
  const startAnchor = 'const prevFocusModeEnabled = useRef(focusMode?.enabled)'
  const start = PAGE_SRC.indexOf(startAnchor)
  expect(
    start,
    `page.tsx 里找不到 \`${startAnchor}\` —— effect 被重构/改名，本护栏会静默空转，请同步更新锚点`
  ).toBeGreaterThan(-1)

  const endAnchor =
    '}, [focusMode?.enabled, focusMode?.enableFullscreen, isFullscreen, handleToggleFullscreen])'
  const end = PAGE_SRC.indexOf(endAnchor, start)
  expect(
    end,
    'effect 依赖数组不含 `focusMode?.enableFullscreen` 或结构被改 —— ' +
      '不完整依赖会让「专注模式内切换开关」等场景用旧值判定'
  ).toBeGreaterThan(start)
  return PAGE_SRC.slice(start, end + endAnchor.length)
}

describe('专注模式「自动全屏」接线（源码级）', () => {
  it('锚点自检：effect 切片完整且两侧调用都在', () => {
    const body = sliceFocusFullscreenEffect()
    expect(body, '进入侧调用缺失 —— 开了开关也不会自动全屏').toContain(
      'handleToggleFullscreen(true)'
    )
    expect(body, '退出侧调用缺失 —— 退出专注不再配对退全屏').toContain(
      'handleToggleFullscreen(false)'
    )
  })

  it('进入侧受 enableFullscreen 条件约束 + !isFullscreen 守卫（不得无条件自动全屏）', () => {
    const body = sliceFocusFullscreenEffect()
    const gate = body.indexOf('if (focusMode?.enableFullscreen)')
    const guard = body.indexOf('!isFullscreen')
    const enter = body.indexOf('handleToggleFullscreen(true)')
    expect(gate, 'enableFullscreen 总开关条件缺失 —— 关掉开关也会自动全屏').toBeGreaterThan(-1)
    expect(guard, '进入侧缺 !isFullscreen 守卫 —— 已全屏时会重复触发原生调用').toBeGreaterThan(-1)
    expect(gate < guard && guard < enter, '条件与守卫必须出现在进入调用之前').toBe(true)
  })

  it('退出侧同样在总开关条件之内（关掉开关 = 完全不碰全屏，不打扰手动全屏）', () => {
    const body = sliceFocusFullscreenEffect()
    const gate = body.indexOf('if (focusMode?.enableFullscreen)')
    const exit = body.indexOf('handleToggleFullscreen(false)')
    expect(gate, 'enableFullscreen 总开关条件缺失').toBeGreaterThan(-1)
    expect(exit, '退出侧调用缺失').toBeGreaterThan(-1)
    expect(gate < exit, '退出调用不在总开关条件之后 —— 开关关闭时仍会强退用户手动全屏').toBe(true)
    // 反向对照：旧形态（无条件配对退出）不得回归
    expect(
      body.includes('if (!focusMode?.enabled && isFullscreen)'),
      '退出侧退回旧的无条件配对（enableFullscreen=false 时也会强退全屏）'
    ).toBe(false)
  })

  it('依赖数组完整：enabled / enableFullscreen / isFullscreen / handler 四个都在', () => {
    const m = PAGE_SRC.match(/const prevFocusModeEnabled[\s\S]*?\}, \[([^\]]*)\]\)/)
    expect(m, '找不到 effect 的依赖数组（结构被改）').not.toBeNull()
    const deps = m![1]
    for (const d of [
      'focusMode?.enabled',
      'focusMode?.enableFullscreen',
      'isFullscreen',
      'handleToggleFullscreen',
    ]) {
      expect(deps, `依赖数组缺 ${d}`).toContain(d)
    }
  })
})

describe('「隐藏干扰元素」标记契约（CSS 规则 + 四处标记）', () => {
  it('globals.css：html.focus-clean 规则存在且用 display:none', () => {
    // 剥注释再断言（墓碑注释里可能逐字写着选择器 —— 铁律 20 的假通过形态）
    const css = CSS_SRC.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css, 'focus-clean 隐藏规则缺失 —— 开关勾了页面上什么都不隐藏').toContain(
      'html.focus-clean [data-focus-distraction]'
    )
    const m = css.match(/html\.focus-clean \[data-focus-distraction\]\s*\{([^}]*)\}/)
    expect(m, '规则体缺失（选择器可能被改成了别的形态）').not.toBeNull()
    expect(m![1], '必须是 display:none（保留 DOM 的视觉隐藏，铁律 18①）').toMatch(
      /display:\s*none/
    )
  })

  it('四个干扰元素标记齐全：结构浮动窗口 ×2 + 练习建议条 ×2', () => {
    const scaleAnchor = PAGE_SRC.indexOf('音阶结构浮动窗口')
    expect(scaleAnchor, '找不到音阶结构浮动窗口（被改名/重构）').toBeGreaterThan(-1)
    expect(
      PAGE_SRC.slice(scaleAnchor, scaleAnchor + 600),
      '音阶结构浮动窗口缺 data-focus-distraction 标记'
    ).toContain('data-focus-distraction')

    const chordAnchor = PAGE_SRC.indexOf('和弦练习结构浮动窗口')
    expect(chordAnchor, '找不到和弦练习结构浮动窗口').toBeGreaterThan(-1)
    expect(
      PAGE_SRC.slice(chordAnchor, chordAnchor + 600),
      '和弦练习结构浮动窗口缺 data-focus-distraction 标记'
    ).toContain('data-focus-distraction')

    expect(PMC_SRC, 'practice-mode-controls 的练习建议条缺标记').toContain(
      'data-focus-distraction'
    )
    expect(FSO_SRC, 'fullscreen-overlay 的练习建议条缺标记').toContain('data-focus-distraction')
  })

  it('标记数恰好 4 处（防标记被复制到别处，造成意外的「被隐藏」）', () => {
    const count = (src: string) => (src.match(/data-focus-distraction/g) ?? []).length
    expect(count(PAGE_SRC), 'page.tsx 应恰好 2 处（两个结构浮动窗口）').toBe(2)
    expect(count(PMC_SRC), 'practice-mode-controls 应恰好 1 处').toBe(1)
    expect(count(FSO_SRC), 'fullscreen-overlay 应恰好 1 处').toBe(1)
  })
})
