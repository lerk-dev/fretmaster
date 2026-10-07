/**
 * components/onboarding/onboarding-overlay.tsx 的契约测试（此前零测试）。
 *
 * 新手教程的浮层：遮罩 + 步骤气泡 + 聚光灯 + 暂停/跳过/上下步。
 *
 * 契约重点：
 *  ① **未激活（或还没挂载、或没有当前步）时返回 null** —— 教程不该在没开始时占屏；
 *  ② 步骤计数 `下标+1 / 总数`、标题/描述走 t()、进度条值 = progress；
 *  ③ 首步「上一步」禁用；末步换成「完成」且正文里的「跳过」按钮消失
 *     （末步只能完成，不能"跳过"）；
 *  ④ 点击遮罩 = 暂停（不是关闭）；暂停后气泡变半透明、出现「继续」浮层、
 *     顶部暂停按钮消失；
 *  ⑤ 顶部 X 与正文「跳过」都走 skipOnboarding → 浮层整体消失；
 *  ⑥ 聚光灯只在「找到目标元素」且该步 `highlightArea !== 'full'` 时出现；
 *     welcome / complete 两步标了 full，即使目标存在也不挖洞；
 *  ⑦ **定位数学**（`calculateTooltipPosition`）：以目标矩形为中心按 top/bottom/left/right
 *     摆位、留 16px 间隙，并**钳制在视口内**（这是最容易写错、写错就飘出屏幕的部分）。
 *     用 `MotionGlobalConfig.skipAnimations = true` 让 framer-motion 直接落到终值，
 *     从而能断言精确的 translateX/Y。
 *
 * ⚠️ jsdom 的 `getBoundingClientRect` 恒返回 0：这里把它替换成「目标元素返回造好的矩形、
 *    气泡返回 400x250」，这样定位数学才可验证（也顺带证明气泡尺寸确实参与了计算）。
 * ⚠️ jsdom 缺 `scrollIntoView`，需补桩，否则跑到有目标的那一步会直接抛错。
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionGlobalConfig } from 'framer-motion'
import { OnboardingProvider, useOnboarding, type OnboardingStep } from '@/components/onboarding/onboarding-context'
import { OnboardingOverlay } from '@/components/onboarding/onboarding-overlay'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Ctx = ReturnType<typeof useOnboarding>

const t = (k: string) => k
const KEY = 'overlay-test-onboarding'

// —— 定位数学里用到的常量（与组件实现约定一致：间隙 16px、气泡实测 400x250） ——
const PAD = 16
const TW = 400
const TH = 250
const W = () => window.innerWidth
const H = () => window.innerHeight

const SELECTORS = ['tuner', 'fretboard', 'practice-tabs', 'chord-exercise', 'scale-exercise', 'settings']

/** 目标元素当前应返回的矩形（每个用例自己改） */
let targetRect: DOMRect

function rect(o: Partial<DOMRect>): DOMRect {
  return {
    x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0,
    toJSON: () => ({}), ...o,
  } as DOMRect
}

/** 视口正中、100x40 的目标 */
const CENTERED = rect({ left: W() / 2 - 50, top: H() / 2 - 20, width: 100, height: 40, right: W() / 2 + 50, bottom: H() / 2 + 20 })

let ctx: Ctx | null = null
function Probe() {
  ctx = useOnboarding()
  return createElement(OnboardingOverlay as never, null as never) as ReactNode
}

/** 所有挂过的树（断言失败时也保证拆干净，避免残留 root 污染后续用例） */
const mounted: Array<() => void> = []

function mount(over: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(OnboardingProvider as never, {
      t,
      config: { storageKey: KEY, autoStartOnFirstVisit: false, ...over },
    } as never, createElement(Probe as never, null as never)))
  })
  const tooltip = () => [...container.querySelectorAll('div')].find((d) => {
    const c = String(d.className)
    return c.includes('pointer-events-auto') && c.includes('bg-card')
  }) as HTMLElement | undefined
  const api = {
    container,
    text: () => container.textContent ?? '',
    root,
    tooltip,
    /** 解析气泡的 translateX/Y（skipAnimations 下就是终值） */
    pos(): { x: number; y: number } {
      const style = this.tooltip()?.getAttribute('style') ?? ''
      const mx = /translateX\(([-\d.]+)px\)/.exec(style)
      const my = /translateY\(([-\d.]+)px\)/.exec(style)
      return { x: mx ? parseFloat(mx[1]) : NaN, y: my ? parseFloat(my[1]) : NaN }
    },
    /** 聚光灯（挖洞 + 外圈阴影） */
    spotlight: () => [...container.querySelectorAll('[style*="9999px"]')],
    progressbar: () => container.querySelector('[role="progressbar"]') as HTMLElement | null,
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    buttonByText: (s: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(s)),
    buttonByLabel: (s: string) => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === s),
    click(el: HTMLElement | undefined) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    unmount() {
      try { act(() => root.unmount()) } catch { /* 已拆过 */ }
      container.remove()
    },
  }
  mounted.push(() => api.unmount())
  return api
}

/** 挂载 + 开始 + 跳到指定步 */
function at(stepIndex: number, over: Record<string, unknown> = {}) {
  const p = mount(over)
  act(() => { ctx!.startOnboarding() })
  act(() => { ctx!.goToStep(stepIndex) })
  return p
}

/**
 * 等一帧：`MotionGlobalConfig.skipAnimations` 只是让动画不做插值，
 * framer-motion 仍要等到下一帧才把终值写进 style（初始 style 只有 initial 里的 y:20）。
 */
async function tick() {
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
}

/** 挂载 + 跳到指定步 + 等定位落地（断言 pos 时必须用它） */
async function atSettled(stepIndex: number, over: Record<string, unknown> = {}) {
  const p = at(stepIndex, over)
  await tick()
  return p
}

const origGetRect = Element.prototype.getBoundingClientRect
let targetEls: HTMLElement[] = []

beforeAll(() => {
  for (const name of SELECTORS) {
    const el = document.createElement('div')
    el.setAttribute('data-onboarding', name)
    el.className = 'target-el'
    document.body.appendChild(el)
    targetEls.push(el)
  }
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this instanceof HTMLElement && this.hasAttribute('data-onboarding')) return targetRect
    const c = String((this as HTMLElement).className ?? '')
    if (c.includes('bg-card') && c.includes('pointer-events-auto')) return rect({ width: TW, height: TH })
    return origGetRect.call(this)
  }
  ;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* jsdom 缺口 */ }
})

afterAll(() => {
  Element.prototype.getBoundingClientRect = origGetRect
  for (const el of targetEls) el.remove()
  targetEls = []
})

beforeEach(() => {
  targetRect = CENTERED
  MotionGlobalConfig.skipAnimations = true
  ctx = null
})
afterEach(() => {
  // 兜底拆树：断言失败会跳过用例自己的 unmount()，残留 root 会让后续用例冒假失败
  for (const u of mounted.splice(0)) { try { u() } catch { /* 已拆过 */ } }
  MotionGlobalConfig.skipAnimations = false
})

describe('显隐', () => {
  it('未开始时返回 null（教程不占屏）', () => {
    const p = mount()
    expect(p.tooltip()).toBeUndefined()
    expect(p.text()).not.toContain('1 / 9')
    p.unmount()
  })

  it('开始后出现浮层：步骤计数 / 标题 / 描述 / 进度条', () => {
    const p = at(0)
    expect(p.tooltip()).toBeDefined()
    expect(p.text()).toContain('1 / 9')
    expect(p.text()).toContain(t('onboarding_welcome_title'))
    expect(p.text()).toContain(t('onboarding_welcome_desc'))
    // 进度条把 progress 透传到 aria-valuenow（依赖 components/ui/progress 的修复）
    const bar = p.progressbar()
    expect(bar).not.toBeNull()
    expect(Number(bar!.getAttribute('aria-valuenow'))).toBeCloseTo((1 / 9) * 100, 1)
    p.unmount()
  })

  it('停掉之后浮层消失', () => {
    const p = at(0)
    act(() => { ctx!.stopOnboarding() })
    expect(p.tooltip()).toBeUndefined()
    p.unmount()
  })

  it('带 actionKey 的步骤会渲染提示行，没有则整行不渲染', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', titleKey: 'ta', descriptionKey: 'da', actionKey: 'action_a' },
      { id: 'b', titleKey: 'tb', descriptionKey: 'db' },
    ]
    const p = at(0, { steps })
    expect(p.text()).toContain(`💡 ${t('onboarding_tip')}: ${t('action_a')}`)

    act(() => { ctx!.goToStep(1) })
    expect(p.text()).not.toContain(`💡 ${t('onboarding_tip')}`)
    p.unmount()
  })
})

describe('首步 / 末步', () => {
  it('首步「上一步」禁用，其余步可用', () => {
    const p = at(0)
    const prev = () => p.buttons().find((b) => b.textContent?.includes(t('onboarding_prev')))!
    expect(prev().hasAttribute('disabled')).toBe(true)

    act(() => { ctx!.goToStep(1) })
    expect(prev().hasAttribute('disabled')).toBe(false)
    p.unmount()
  })

  it('末步按钮文案变「完成」，且正文里的「跳过」按钮消失', () => {
    const p = at(1)
    expect(p.buttonByText(t('onboarding_next'))).toBeDefined()
    expect(p.buttonByText(t('onboarding_skip'))).toBeDefined()

    act(() => { ctx!.goToStep(8) })   // complete
    expect(p.buttonByText(t('onboarding_finish'))).toBeDefined()
    expect(p.buttonByText(t('onboarding_next'))).toBeUndefined()
    // 顶部 X 仍在（aria-label=onboarding_skip），但正文里那个带文字的「跳过」没了
    expect(p.buttonByLabel(t('onboarding_skip'))).toBeDefined()
    const textSkip = p.buttons().filter((b) => b.textContent?.includes(t('onboarding_skip')))
    expect(textSkip).toHaveLength(0)
    p.unmount()
  })

  it('点「下一步」文本随之推进', () => {
    const p = at(0)
    p.click(p.buttonByText(t('onboarding_next')))
    expect(ctx!.currentStepIndex).toBe(1)
    expect(p.text()).toContain(`2 / 9`)
    expect(p.text()).toContain(t('onboarding_tuner_title'))
    p.unmount()
  })
})

describe('暂停 / 跳过', () => {
  it('点遮罩是「暂停」而不是关闭', () => {
    const p = at(0)
    const backdrop = p.container.querySelector('.bg-black\\/60') as HTMLElement
    expect(backdrop).not.toBeNull()
    p.click(backdrop)
    expect(ctx!.isPaused).toBe(true)
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })

  it('暂停后：出现「继续」浮层与暂停文案，顶部暂停按钮消失', () => {
    const p = at(0)
    const pauseBtn = p.buttonByLabel(t('pause'))
    expect(pauseBtn).toBeDefined()

    p.click(pauseBtn)
    expect(ctx!.isPaused).toBe(true)
    expect(p.buttonByLabel(t('pause'))).toBeUndefined()      // 顶部暂停按钮隐藏
    expect(p.buttonByText(t('onboarding_continue'))).toBeDefined()
    // 暂停文案在两处（徽标 + 浮层）
    expect(p.text().split(t('onboarding_paused')).length - 1).toBeGreaterThanOrEqual(2)

    p.click(p.buttonByText(t('onboarding_continue')))
    expect(ctx!.isPaused).toBe(false)
    expect(p.buttonByLabel(t('pause'))).toBeDefined()
    p.unmount()
  })

  it('顶部 X（aria-label=onboarding_skip）关闭教程', () => {
    const p = at(3)
    expect(ctx!.isActive).toBe(true)
    p.click(p.buttonByLabel(t('onboarding_skip')))
    expect(ctx!.isActive).toBe(false)
    expect(ctx!.hasSeenOnboarding).toBe(true)
    expect(p.tooltip()).toBeUndefined()
    p.unmount()
  })

  it('正文「跳过」按钮同样关闭教程', () => {
    const p = at(2)
    const skip = p.buttons().find((b) => b.textContent?.includes(t('onboarding_skip')))
    p.click(skip)
    expect(ctx!.isActive).toBe(false)
    p.unmount()
  })
})

describe('聚光灯', () => {
  it('找到目标且不是 full 高亮 → 挖洞', () => {
    const p = at(1)   // tuning-section: [data-onboarding='tuner']，未标 full
    expect(p.spotlight()).toHaveLength(1)
    p.unmount()
  })

  it('标了 highlightArea:「full」的步骤即使有目标也不挖洞', () => {
    // 默认步骤里标记 full 的 welcome/complete 恰好都没有 targetSelector，
    // 「有目标 + full」这条分支只能在自定义步骤里覆盖（否则这条断言形同虚设）。
    const steps: OnboardingStep[] = [
      { id: 'a', titleKey: 'ta', descriptionKey: 'da', targetSelector: "[data-onboarding='tuner']", position: 'bottom', highlightArea: 'full' },
    ]
    const p = at(0, { steps })
    expect(p.spotlight()).toHaveLength(0)
    p.unmount()

    const q = at(0)
    expect(q.spotlight()).toHaveLength(0)   // welcome
    act(() => { ctx!.goToStep(8) })
    expect(q.spotlight()).toHaveLength(0)   // complete
    q.unmount()
  })

  it('找不到目标元素时（页面还没有对应的锚点）不挖洞，且退回居中气泡', async () => {
    const hidden = targetEls.map((el) => { const a = el.getAttribute('data-onboarding'); el.removeAttribute('data-onboarding'); return [el, a] as const })
    const p = await atSettled(1)
    expect(p.spotlight()).toHaveLength(0)
    expect(p.pos()).toEqual({ x: W() / 2 - TW / 2, y: H() / 2 - TH / 2 })
    p.unmount()
    for (const [el, a] of hidden) if (a) el.setAttribute('data-onboarding', a)
  })
})

describe('定位数学（间隙 16px + 视口钳制）', () => {
  it('center：无目标或标 center 时居中', async () => {
    const p = await atSettled(7)   // shortcuts：无 targetSelector，position center
    expect(p.pos()).toEqual({ x: W() / 2 - TW / 2, y: H() / 2 - TH / 2 })
    p.unmount()

    const q = await atSettled(0)   // welcome：有 position center（即使有目标也按 center）
    expect(q.pos()).toEqual({ x: W() / 2 - TW / 2, y: H() / 2 - TH / 2 })
    q.unmount()
  })

  it('bottom：水平对齐目标中心，垂直挂在目标下方 + 16px', async () => {
    const p = await atSettled(1)
    expect(p.pos()).toEqual({
      x: CENTERED.left + CENTERED.width / 2 - TW / 2,
      y: CENTERED.bottom + PAD,
    })
    p.unmount()
  })

  it('top：垂直挂在目标上方 - 16px（把气泡高度也算进去）', async () => {
    const p = await atSettled(2)   // fretboard：position top
    expect(p.pos()).toEqual({
      x: CENTERED.left + CENTERED.width / 2 - TW / 2,
      y: CENTERED.top - TH - PAD,
    })
    p.unmount()
  })

  it('left：水平挂在目标左侧 - 16px（含气泡宽度）', async () => {
    const p = await atSettled(6)   // settings：position left
    expect(p.pos()).toEqual({
      x: CENTERED.left - TW - PAD,
      y: CENTERED.top + CENTERED.height / 2 - TH / 2,
    })
    p.unmount()
  })

  it('right：水平挂在目标右侧 + 16px', async () => {
    const p = await atSettled(5)   // scale-exercise：position right
    expect(p.pos()).toEqual({
      x: CENTERED.right + PAD,
      y: CENTERED.top + CENTERED.height / 2 - TH / 2,
    })
    p.unmount()
  })

  it('目标贴右下角时被钳回视口内（不再飘出屏幕）', async () => {
    targetRect = rect({ left: 1000, top: 750, width: 200, height: 60, right: 1200, bottom: 810 })
    const p = await atSettled(5)   // right
    expect(p.pos()).toEqual({
      x: W() - TW - PAD,     // 1216 → 钳到 608
      y: H() - TH - PAD,     // 655  → 钳到 502
    })
    p.unmount()
  })

  it('目标贴左上角时被钳回视口左上（最小留 16px）', async () => {
    targetRect = rect({ left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 })
    const p = await atSettled(6)   // left
    expect(p.pos()).toEqual({ x: PAD, y: PAD })
    p.unmount()
  })

  it('未知 position → 走 default 分支（与 bottom 同款摆位）', async () => {
    // position 的类型是联合类型，但运行时拿到什么全看数据；「脏数据不能让气泡飞走」
    // 只有 default 分支能兜住，它是这条链路上唯一没有类型保护的一档。
    const steps: OnboardingStep[] = [
      {
        id: 'x', titleKey: 'tx', descriptionKey: 'dx',
        targetSelector: "[data-onboarding='tuner']",
        position: 'nonsense' as unknown as OnboardingStep['position'],
      },
    ]
    const p = await atSettled(0, { steps })
    expect(p.pos()).toEqual({
      x: CENTERED.left + CENTERED.width / 2 - TW / 2,
      y: CENTERED.bottom + PAD,
    })
    p.unmount()
  })
})

describe('跟随窗口重定位', () => {
  it('resize 后重新测量目标（气泡不钉在旧矩形上）', async () => {
    const p = await atSettled(1)   // tuner: position bottom
    const before = p.pos()
    expect(before.x).toBeCloseTo(CENTERED.left + CENTERED.width / 2 - TW / 2, 1)

    targetRect = rect({ left: 300, top: 200, width: 120, height: 50, right: 420, bottom: 250 })
    await act(async () => { window.dispatchEvent(new Event('resize')) })
    await tick()

    expect(p.pos().x).toBeCloseTo(300 + 60 - TW / 2, 1)
    expect(p.pos().y).toBeCloseTo(250 + PAD, 1)
    expect(p.pos().x).not.toBeCloseTo(before.x, 1)
    p.unmount()
  })

  it('scroll 也触发重定位（监听挂在 capture 阶段，滚动的是内部容器也能收到）', async () => {
    const p = await atSettled(1)
    targetRect = rect({ left: 100, top: 300, width: 80, height: 40, right: 180, bottom: 340 })
    await act(async () => { window.dispatchEvent(new Event('scroll')) })
    await tick()
    expect(p.pos().y).toBeCloseTo(340 + PAD, 1)
    p.unmount()
  })

  it('教程结束后不再监听 resize（卸载监听，避免继续 setState）', async () => {
    const p = await atSettled(1)
    const before = p.pos()
    act(() => { ctx!.stopOnboarding() })

    targetRect = rect({ left: 700, top: 600, width: 60, height: 30, right: 760, bottom: 630 })
    await act(async () => { window.dispatchEvent(new Event('resize')) })
    await tick()
    // 已经不渲染了，位置无从谈起；关键是这条路径不抛错、也不再写 state
    expect(p.tooltip()).toBeUndefined()
    expect(before.x).not.toBeNaN()
    p.unmount()
  })
})

/**
 * 🚨 回归（0.2.220 exe「能打开、但点哪都没反应」）：自救通道。
 *
 * 浮层一旦出现就用 `bg-black/60 pointer-events-auto` 遮罩吞掉**全屏**点击，
 * 而遮罩的点击语义是 `pauseOnboarding`（= 卡片变半透明，视觉上更像「界面死了」）。
 * 万一自动启动判据被绕过、或用户就是不想看教程，鼠标路径上没有明确出口，
 * 所以必须有键盘出口：`Esc` = 跳过，并且**落盘 hasSeen**（否则每次启动都要重按）。
 */
describe('Esc 自救通道（0.2.220 exe 回归）', () => {
  const ls = localStorage as unknown as {
    getItem: ReturnType<typeof import('vitest').vi.fn>
    setItem: ReturnType<typeof import('vitest').vi.fn>
  }

  function pressEsc() {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
  }

  it('教程激活时按 Esc ⇒ 教程关闭', async () => {
    const p = at(0)
    await tick()
    expect(ctx!.isActive).toBe(true)
    pressEsc()
    expect(ctx!.isActive).toBe(false)
    expect(p.tooltip()).toBeUndefined()
    p.unmount()
  })

  it('Esc 不只是隐藏：必须落盘 hasSeen（否则下次启动又弹，等于没修）', async () => {
    // 🚨 必须**在 startOnboarding 之后**再清空调用记录：
    //    at() 里的 startOnboarding 自己也会写一次 hasSeen，
    //    若在它之前清零，末条写入就永远来自 start ⇒ 断言恒真（铁律 20）。
    const p = at(0)
    await tick()
    ls.setItem.mockClear()
    pressEsc()
    const calls = ls.setItem.mock.calls.filter((c) => c[0] === KEY)
    expect(calls.length).toBeGreaterThan(0)
    expect(JSON.parse(String(calls[calls.length - 1][1]))).toMatchObject({ hasSeen: true })
    p.unmount()
  })

  it('教程未激活时按 Esc 不抛错、也不写盘（不能污染正常浏览）', async () => {
    const p = mount()
    ls.setItem.mockClear()
    expect(() => pressEsc()).not.toThrow()
    expect(ls.setItem).toHaveBeenCalledTimes(0)
    p.unmount()
  })

  it('卸载后不残留 keydown 监听（否则 Esc 会打到已销毁的树上）', async () => {
    const p = at(0)
    await tick()
    p.unmount()
    expect(() => pressEsc()).not.toThrow()
  })

  it('其它按键不触发跳过（不能把键盘契约放宽成「随便按个键就关」）', async () => {
    const p = at(0)
    await tick()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })
})
