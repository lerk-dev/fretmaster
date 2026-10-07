/**
 * components/ui/progress.tsx 的契约测试（此前零测试，且本批次修了一个 a11y bug）。
 *
 * 这个 shadcn 包装层此前把 `value` 解构出来只用于算 Indicator 的 transform，
 * **没有把它透传给 Radix 的 Root** ⇒ 进度条永远是 `data-state="indeterminate"`、
 * 没有 `aria-valuenow`，读屏软件完全读不出进度（视觉正确，所以长期没被发现）。
 * 教程浮层的进度条就在用它。
 *
 * 契约重点：
 *  ① `value` 必须透传到 Root：`aria-valuenow` 等于传入值、`data-state` 反映进度状态；
 *  ② Indicator 的 `translateX(-(100-value)%)` —— 这是唯一驱动视觉的属性；
 *  ③ 不传 `value` 时保持 Radix 的 indeterminate 语义（无 aria-valuenow）；
 *  ④ 自定义 className 与基础类名合并（不能把基础类名顶掉）。
 */
import { describe, it, expect } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Progress } from '@/components/ui/progress'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: Record<string, unknown>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Progress as never, props as never)) })
  return {
    container,
    bar: () => container.querySelector('[role="progressbar"]') as HTMLElement,
    indicator: () => container.querySelector('[data-slot="progress-indicator"]') as HTMLElement,
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

describe('进度条的语义', () => {
  it('是 role=progressbar，范围 0..100', () => {
    const p = mount({ value: 40 })
    expect(p.bar().getAttribute('role')).toBe('progressbar')
    expect(p.bar().getAttribute('aria-valuemin')).toBe('0')
    expect(p.bar().getAttribute('aria-valuemax')).toBe('100')
    p.unmount()
  })

  it('value 透传到 Root：aria-valuenow 就是传入值（此前是缺失的）', () => {
    const p = mount({ value: 11.111 })
    expect(p.bar().hasAttribute('aria-valuenow')).toBe(true)
    expect(Number(p.bar().getAttribute('aria-valuenow'))).toBeCloseTo(11.111, 3)
    expect(p.bar().getAttribute('data-state')).toBe('loading')
    p.unmount()
  })

  it('value=100 时状态是完成态', () => {
    const p = mount({ value: 100 })
    expect(p.bar().getAttribute('data-state')).toBe('complete')
    expect(p.indicator().getAttribute('style')).toContain('translateX(-0%)')
    p.unmount()
  })

  it('不传 value 时保持 indeterminate（没有 aria-valuenow 可读）', () => {
    const p = mount({})
    expect(p.bar().hasAttribute('aria-valuenow')).toBe(false)
    expect(p.bar().getAttribute('data-state')).toBe('indeterminate')
    // transform 按 0 处理 ⇒ 整条不可见
    expect(p.indicator().getAttribute('style')).toContain('translateX(-100%)')
    p.unmount()
  })
})

describe('视觉：Indicator 的位移动画', () => {
  it.each([
    [0, 'translateX(-100%)'],
    [25, 'translateX(-75%)'],
    [11.111, 'translateX(-88.889%)'],
  ])('value=%s → %s', (value, expected) => {
    const p = mount({ value })
    expect(p.indicator().getAttribute('style')?.replace(/\s/g, '')).toContain(expected.replace(/\s/g, ''))
    p.unmount()
  })
})

describe('样式', () => {
  it('自定义 className 与基础类名合并', () => {
    const p = mount({ value: 50, className: 'h-1 mb-4' })
    const cls = p.bar().className
    expect(cls).toContain('h-1')
    expect(cls).toContain('mb-4')
    expect(cls).toContain('bg-primary/20')   // 基础类名不能被顶掉
    expect(cls).toContain('rounded-full')
    p.unmount()
  })
})
