/**
 * components/mobile-nav.tsx 的契约测试。
 *
 * 背景（2026-10-19 用户报）：手机底部原本平铺 8 个入口，390px 宽每个只剩 ~48px，
 * 短名被截断、点击目标过小。现在固定 5 个练习页 + 「更多」，教程/乐理/统计折进面板。
 *
 * 钉住的契约：
 *  ① 常驻只渲染传入的练习项（不再出现教程/乐理/统计）；
 *  ② 「更多」按钮的 aria 三件套（haspopup / expanded / controls）指向真实面板；
 *  ③ 面板内三项点得动、点完关闭、背板点得动、Esc 关闭并还焦点；
 *  ④ **切页后自动关闭** —— 这个收口才让「全局快捷键切页」也不会留一个悬空面板；
 *  ⑤ 当前页落在折叠项时，「更多」按钮显示该页自己的短名（否则用户看不出自己在哪）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Activity, BarChart3, BookOpen, GraduationCap, Guitar, ListMusic, Music, Target } from 'lucide-react'

import { MobileNav, type MobileNavItem } from '@/components/mobile-nav'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const PRACTICE: MobileNavItem[] = [
  { id: 'practice', label: '找音练习', shortLabel: '找音', Icon: Target },
  { id: 'interval', label: '音程练习', shortLabel: '音程', Icon: Activity },
  { id: 'chord_exercise', label: '和弦练习', shortLabel: '和弦', Icon: Guitar },
  { id: 'chord', label: '和弦转换', shortLabel: '转换', Icon: ListMusic },
  { id: 'scale', label: '音阶练习', shortLabel: '音阶', Icon: Music },
]

const FOLDED: MobileNavItem[] = [
  { id: 'course', label: '引导教程', shortLabel: '教程', Icon: GraduationCap },
  { id: 'theory', label: '乐理知识', shortLabel: '乐理', Icon: BookOpen },
  { id: 'stats', label: '统计', shortLabel: '统计', Icon: BarChart3 },
]

const roots: Root[] = []
const containers: HTMLElement[] = []

function mount(over: Partial<{ activeTab: string; items: MobileNavItem[]; foldedItems: MobileNavItem[]; onSelect: (id: string) => void }> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  const root = createRoot(container)
  roots.push(root)
  const onSelect = over.onSelect ?? vi.fn()
  act(() => {
    root.render(
      createElement(MobileNav, {
        items: over.items ?? PRACTICE,
        foldedItems: over.foldedItems ?? FOLDED,
        activeTab: over.activeTab ?? 'practice',
        onSelect,
        moreLabel: '更多',
        ariaLabel: '练习导航',
      }),
    )
  })
  return { container, onSelect, rerender: (activeTab: string) => act(() => {
    root.render(
      createElement(MobileNav, {
        items: over.items ?? PRACTICE,
        foldedItems: over.foldedItems ?? FOLDED,
        activeTab,
        onSelect,
        moreLabel: '更多',
        ariaLabel: '练习导航',
      }),
    )
  }) }
}

const q = <T extends Element>(c: HTMLElement, sel: string) => c.querySelector(sel) as T | null
const moreBtn = (c: HTMLElement) => q<HTMLButtonElement>(c, '[data-testid="mobile-more-button"]')
const menu = (c: HTMLElement) => q<HTMLElement>(c, '[data-testid="mobile-more-menu"]')
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })

afterEach(() => {
  for (const r of roots.splice(0)) { try { act(() => r.unmount()) } catch { /* 已拆 */ } }
  for (const c of containers.splice(0)) c.remove()
  document.body.innerHTML = ''
})

describe('常驻导航：只放练习页', () => {
  it('渲染 5 个练习 tab，且不含教程/乐理/统计', () => {
    const { container } = mount()
    const tabs = [...container.querySelectorAll('[role="tab"]')] as HTMLElement[]
    expect(tabs).toHaveLength(5)
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(
      ['找音练习', '音程练习', '和弦练习', '和弦转换', '音阶练习']
    )
    expect(container.textContent, '教程/乐理/统计不该再占常驻位置').not.toMatch(/引导教程|乐理知识/)
  })

  it('点 tab 回传对应 id，当前页 aria-selected=true', () => {
    const { container, onSelect } = mount({ activeTab: 'scale' })
    const tabs = [...container.querySelectorAll('[role="tab"]')] as HTMLElement[]
    expect(tabs[4].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    click(tabs[1])
    expect(onSelect).toHaveBeenCalledWith('interval')
  })
})

describe('「更多」面板', () => {
  it('默认关闭；点开后列出三个折叠页，aria 三件套互相指认', () => {
    const { container } = mount()
    const btn = moreBtn(container)!
    expect(menu(container), '默认不该展开').toBeNull()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
    expect(btn.getAttribute('aria-controls')).toBe('mobile-more-menu')

    click(btn)
    const m = menu(container)!
    expect(m, '点开后应出现面板').not.toBeNull()
    expect(m.id).toBe('mobile-more-menu')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect([...m.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual([
      '引导教程', '乐理知识', '统计',
    ])
  })

  it('点面板项：回传 id 且面板关闭', () => {
    const { container, onSelect } = mount()
    click(moreBtn(container)!)
    const items = [...menu(container)!.querySelectorAll('[role="menuitem"]')] as HTMLElement[]
    click(items[1])   // 乐理知识
    expect(onSelect).toHaveBeenCalledWith('theory')
    expect(menu(container), '选完应收起').toBeNull()
  })

  it('点背板关闭（背板是透明遮罩，不能吞掉导航按钮）', () => {
    const { container } = mount()
    click(moreBtn(container)!)
    const back = q<HTMLElement>(container, '[data-testid="mobile-more-backdrop"]')!
    expect(back).not.toBeNull()
    click(back)
    expect(menu(container)).toBeNull()
  })

  it('Esc 关闭并把焦点还给「更多」按钮', () => {
    const { container } = mount()
    const btn = moreBtn(container)!
    click(btn)
    const m = menu(container)!
    // 展开后焦点应已进入面板（Esc 才有地方可听）
    expect(m.contains(document.activeElement)).toBe(true)
    act(() => {
      m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(menu(container)).toBeNull()
    expect(document.activeElement).toBe(btn)
  })

  it('切页（含全局快捷键路径）后面板自动收起', () => {
    const { container, rerender } = mount({ activeTab: 'practice' })
    click(moreBtn(container)!)
    expect(menu(container)).not.toBeNull()
    rerender('theory')
    expect(menu(container), 'activeTab 变化应收起面板（否则会留一个悬空面板）').toBeNull()
  })

  it('当前页在折叠项时：更多按钮显示该页短名并高亮', () => {
    const { container } = mount({ activeTab: 'stats' })
    const btn = moreBtn(container)!
    expect(btn.textContent).toContain('统计')
    expect(btn.className).toContain('text-primary')
  })

  it('折叠项为空时不渲染「更多」按钮（防御：无课程的分支）', () => {
    const { container } = mount({ foldedItems: [] })
    expect(moreBtn(container)).toBeNull()
  })
})
