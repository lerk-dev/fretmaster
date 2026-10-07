/**
 * components/onboarding/onboarding-trigger.tsx 的契约测试（此前零测试）。
 *
 * 教程入口按钮（三种变体：icon / button / menu）。当前 app 里没有引用它，
 * 但它是 onboarding 模块对外导出的组件之一，行为契约仍需钉住。
 *
 * 契约重点：
 *  ① **文案与图标随「是否看过」切换**：没看过 = 「新手指引」+ 问号图标 + 新徽标；
 *     看过/已完成 = 「重新观看教程」+ 重播图标 + 无徽标；
 *  ② 文案随 store 里的语言切换（zh-CN / en）——注意它读的是 `useUser().language`，
 *     不是从 props 传 t，所以两套文案是内联写死的；
 *  ③ **点击语义**：没看过 → 直接 startOnboarding；看过 → 必须先 resetOnboarding
 *     再延迟 100ms 开始（否则 isCompleted 会把它立刻关掉）；
 *  ④ `showBadge={false}` 在三种变体里都要能抑制徽标（此前只有 icon 变体判断了它，
 *     button/menu 变体无视该属性，本次一并修正）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { OnboardingProvider, useOnboarding } from '@/components/onboarding/onboarding-context'
import { OnboardingTrigger } from '@/components/onboarding/onboarding-trigger'
import { useAppStore } from '@/lib/store'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }

type Ctx = ReturnType<typeof useOnboarding>
const t = (k: string) => k
const KEY = 'trigger-test-onboarding'

let ctx: Ctx | null = null
function Cap() { ctx = useOnboarding(); return null }

const ls = localStorage as unknown as { getItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> }

function setSeen(seen: boolean) {
  ls.getItem.mockReturnValue(seen ? JSON.stringify({ hasSeen: true, completed: true }) : null)
}

function setLang(language: 'zh-CN' | 'en') {
  const s = useAppStore.getState()
  useAppStore.setState({ user: { ...s.user, language } })
}

function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(OnboardingProvider as never, {
      t, config: { storageKey: KEY, autoStartOnFirstVisit: false },
    } as never, createElement('div', null,
      createElement(Cap as never, null as never),
      createElement(OnboardingTrigger as never, props as never),
    ) as ReactNode))
  })
  const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[]
  return {
    container,
    text: () => container.textContent ?? '',
    html: () => container.innerHTML,
    buttons,
    /** icon 变体渲染在 Tooltip 里，真正可点的是容器内唯一的 button */
    mainButton: () => buttons()[0],
    icons: () => container.querySelectorAll('svg').length,
    /**
     * 新徽标元素（三种变体都用 bg-red-500 的 span：icon 变体是纯红点，button/menu 变体带「新/New」文字）。
     * ⚠️ 不能拿按钮文案找徽标：「新手指引」「重新观看教程」里都含「新」字，子串判定必假阳。
     */
    badge: () => container.querySelectorAll('span[class*="bg-red-500"]'),
    click(el: HTMLElement) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }) },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

beforeEach(() => {
  ls.getItem.mockReset().mockReturnValue(null)
  ls.removeItem.mockReset()
  setLang('zh-CN')
  ctx = null
})
afterEach(() => { setLang('zh-CN') })

describe('icon 变体：文案 / 图标 / 徽标', () => {
  it('没看过：「新手指引」+ 新徽标，点击直接开始', () => {
    const p = mount({ variant: 'icon' })
    expect(p.mainButton().getAttribute('aria-label')).toBe('新手指引')
    expect(p.badge()).toHaveLength(1)
    p.click(p.mainButton())
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })

  it('看过后：「重新观看教程」+ 无徽标，点击要先重置再开始', async () => {
    vi.useFakeTimers()
    setSeen(true)
    const p = mount({ variant: 'icon' })
    expect(p.mainButton().getAttribute('aria-label')).toBe('重新观看教程')
    expect(p.badge()).toHaveLength(0)

    p.click(p.mainButton())
    expect(ls.removeItem).toHaveBeenCalledWith(KEY)   // 先 reset
    expect(ctx!.isActive).toBe(false)                 // 还没到点

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(ctx!.isActive).toBe(true)
    vi.useRealTimers()
    p.unmount()
  })

  it('英文语言下文案与徽标都切到英文', () => {
    setLang('en')
    const p = mount({ variant: 'icon' })
    expect(p.mainButton().getAttribute('aria-label')).toBe('Getting Started')
    expect(p.container.textContent).not.toContain('新手指引')
    p.unmount()

    setSeen(true)
    const q = mount({ variant: 'icon' })
    expect(q.mainButton().getAttribute('aria-label')).toBe('Restart Tutorial')
    q.unmount()
  })

  it('showBadge=false 时不渲染新徽标', () => {
    const p = mount({ variant: 'icon', showBadge: false })
    expect(p.badge()).toHaveLength(0)
    p.unmount()
  })
})

describe('button / menu 变体', () => {
  it('button 变体：带图标与文案，没看过时徽标是「新」', () => {
    const p = mount({ variant: 'button' })
    const btn = p.mainButton()
    expect(btn.textContent).toContain('新手指引')
    expect(p.badge()).toHaveLength(1)
    expect(p.badge()[0].textContent).toBe('新')
    p.unmount()
  })

  it('button 变体：看过后文案变「重新观看教程」且没有徽标', () => {
    setSeen(true)
    const p = mount({ variant: 'button' })
    const btn = p.mainButton()
    expect(btn.textContent).toContain('重新观看教程')
    expect(p.badge()).toHaveLength(0)
    p.unmount()
  })

  it('button/menu 变体同样遵守 showBadge=false', () => {
    const b = mount({ variant: 'button', showBadge: false })
    expect(b.mainButton().textContent).toContain('新手指引')
    expect(b.badge()).toHaveLength(0)
    b.unmount()

    const m = mount({ variant: 'menu', showBadge: false })
    expect(m.mainButton().textContent).toContain('新手指引')
    expect(m.badge()).toHaveLength(0)
    m.unmount()
  })

  it('menu 变体：渲染成普通按钮，文案与徽标齐全，点击可开始', () => {
    const p = mount({ variant: 'menu' })
    const btn = p.mainButton()
    expect(btn.textContent).toContain('新手指引')
    expect(p.badge()).toHaveLength(1)
    expect(p.badge()[0].textContent).toBe('新')
    p.click(btn)
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })

  it('英文下 button 变体的徽标是 New', () => {
    setLang('en')
    const p = mount({ variant: 'button' })
    expect(p.mainButton().textContent).toContain('Getting Started')
    expect(p.badge()[0].textContent).toBe('New')
    p.unmount()
  })
})
