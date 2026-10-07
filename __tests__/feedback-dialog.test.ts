/**
 * components/onboarding/feedback-dialog.tsx 的契约测试（此前零测试）。
 *
 * 教程结束后的反馈弹窗。当前 app 里没有引用它（`FeedbackDialog` 未被渲染），
 * 但它是 onboarding 模块对外导出的组件，且是唯一会往 localStorage 累积数据的组件，
 * 所以契约重点在「写什么、写几次、什么时候清空」。
 *
 * 契约重点：
 *  ① **必须选评分才能提交**（未选时提交按钮 disabled）；
 *  ② 提交是**追加**一条到 `fretmaster-feedback`（先读再 spread），不是覆盖 ——
 *     写错就把历史反馈清了；
 *  ③ 提交是「模拟」的：中间有 1 秒延迟，期间按钮禁用并显示「提交中...」；
 *  ④ 坏 JSON 不能崩（catch 住→照常进成功页，只是这条没存下）；
 *  ⑤ **关闭要清空表单**：跳过/关闭后再打开应该是干净的空表单
 *     （组件本身不卸载，只有 DialogContent 卸载，所以状态会留着）；
 *  ⑥ 成功页两个按钮语义不同：「重新观看教程」要 resetOnboarding，
 *     「开始使用」只关闭；
 *  ⑦ 功能建议按钮把文案追加到反馈文本里，重复点同一个不重复追加；
 *  ⑧ 文案随 store 的 language 切换。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionGlobalConfig } from 'framer-motion'
import { OnboardingProvider } from '@/components/onboarding/onboarding-context'
import { FeedbackDialog } from '@/components/onboarding/feedback-dialog'
import { useAppStore } from '@/lib/store'

const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastSpies, Toaster: () => null }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* jsdom 缺口 */ }

const t = (k: string) => k
const KEY = 'feedback-test-onboarding'

const ls = localStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
}

/** 取出写进 fretmaster-feedback 的最后一次数组值 */
function savedFeedback(): unknown[] {
  const calls = ls.setItem.mock.calls.filter((c) => c[0] === 'fretmaster-feedback')
  expect(calls.length).toBeGreaterThan(0)
  return JSON.parse(String(calls[calls.length - 1][1]))
}

function setLang(language: 'zh-CN' | 'en') {
  const s = useAppStore.getState()
  useAppStore.setState({ user: { ...s.user, language } })
}

let openFn: ((v: boolean) => void) | null = null
function Wrapper() {
  const [open, setOpen] = useState(true)
  openFn = setOpen
  return createElement(FeedbackDialog as never, { open, onOpenChange: setOpen } as never) as ReactNode
}

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(OnboardingProvider as never, {
      t, config: { storageKey: KEY, autoStartOnFirstVisit: false },
    } as never, createElement(Wrapper as never, null as never)))
  })
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null
  const buttons = () => [...(dialog()?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
  const buttonByText = (s: string) => buttons().find((b) => b.textContent?.includes(s))
  const radios = () => [...(dialog()?.querySelectorAll('[role="radio"]') ?? [])] as HTMLElement[]
  const textarea = () => dialog()?.querySelector('textarea') as HTMLTextAreaElement | null
  return {
    container,
    root,
    dialog,
    text: () => dialog()?.textContent ?? '',
    buttons,
    buttonByText,
    radios,
    textarea,
    submitButton: () => buttons().find((b) => b.textContent?.includes('提交反馈')),
    click(el: HTMLElement | undefined) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    type(v: string) {
      const el = textarea()!
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      act(() => {
        setter.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    setOpen(v: boolean) { act(() => { openFn?.(v) }) },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

beforeEach(() => {
  for (const f of Object.values(toastSpies)) f.mockClear()
  ls.getItem.mockReset().mockReturnValue(null)
  ls.setItem.mockReset()
  ls.removeItem.mockReset()
  setLang('zh-CN')
  openFn = null
  // AnimatePresence 用了 mode="wait"：表单/成功页的切换要等退出动画走完。
  // jsdom 里动画不推进会把成功页一直挡住，所以直接跳过动画。
  MotionGlobalConfig.skipAnimations = true
  // 清掉上一个用例可能残留的 portal（用例在断言失败时不会走到 unmount）
  document.body.innerHTML = ''
})
afterEach(() => { MotionGlobalConfig.skipAnimations = false; vi.useRealTimers(); setLang('zh-CN') })

describe('表单结构与提交门槛', () => {
  it('渲染评分项 / 文本框 / 功能建议 / 跳过 / 提交', () => {
    const p = mount()
    expect(p.text()).toContain('教程完成反馈')
    expect(p.radios()).toHaveLength(5)
    expect(p.textarea()).not.toBeNull()
    expect(p.buttonByText('跳过')).toBeDefined()
    expect(p.submitButton()).toBeDefined()
    p.unmount()
  })

  it('没选评分时提交按钮禁用', () => {
    const p = mount()
    expect(p.submitButton()!.hasAttribute('disabled')).toBe(true)
    p.unmount()
  })

  it('选了评分后提交按钮可用', () => {
    const p = mount()
    p.click(p.radios()[3])
    expect(p.radios()[3].getAttribute('aria-checked')).toBe('true')
    expect(p.submitButton()!.hasAttribute('disabled')).toBe(false)
    p.unmount()
  })
})

describe('提交：延迟 / 追加落盘 / 成功态', () => {
  it('提交期间按钮显示「提交中...」并禁用，1 秒后才进成功页', async () => {
    vi.useFakeTimers()
    const p = mount()
    p.click(p.radios()[1])
    p.click(p.submitButton())

    expect(p.buttonByText('提交中')).toBeDefined()
    expect(p.buttonByText('提交中')!.hasAttribute('disabled')).toBe(true)

    await act(async () => { await vi.advanceTimersByTimeAsync(999) })
    expect(p.text()).toContain('教程完成反馈')          // 还停在表单

    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(p.text()).toContain('感谢你的反馈！')        // 成功页
    expect(toastSpies.success).toHaveBeenCalledWith('感谢你的反馈！')
    p.unmount()
  })

  it('落盘内容包含评分/文本/时间戳/UA', async () => {
    vi.useFakeTimers()
    const p = mount()
    p.click(p.radios()[4])                              // 🤩
    p.type('希望加个和弦库')
    p.click(p.submitButton())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    const saved = savedFeedback()
    expect(saved).toHaveLength(1)
    const item = saved[0] as Record<string, unknown>
    expect(item.rating).toBe('5')
    expect(item.feedback).toBe('希望加个和弦库')
    expect(typeof item.timestamp).toBe('string')
    expect(String(item.userAgent)).toBe(navigator.userAgent)
    p.unmount()
  })

  it('是追加而不是覆盖：已有历史反馈会保留', async () => {
    vi.useFakeTimers()
    ls.getItem.mockReturnValue(JSON.stringify([{ rating: '1', feedback: '旧记录' }]))
    const p = mount()
    p.click(p.radios()[2])
    p.click(p.submitButton())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    const saved = savedFeedback()
    expect(saved).toHaveLength(2)
    expect((saved[0] as Record<string, unknown>).feedback).toBe('旧记录')
    expect((saved[1] as Record<string, unknown>).rating).toBe('3')
    p.unmount()
  })

  it('已有数据是坏 JSON 时不崩，仍然进成功页（只是这条没存进去）', async () => {
    vi.useFakeTimers()
    ls.getItem.mockReturnValue('不是 JSON')
    const err = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    const p = mount()
    p.click(p.radios()[0])
    p.click(p.submitButton())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    expect(err).toHaveBeenCalled()
    expect(p.text()).toContain('感谢你的反馈！')
    expect(ls.setItem.mock.calls.filter((c) => c[0] === 'fretmaster-feedback')).toHaveLength(0)
    err.mockRestore()
    p.unmount()
  })
})

describe('清空与关闭语义', () => {
  it('点「跳过」关闭弹窗；重新打开时表单是空的', () => {
    const p = mount()
    p.click(p.radios()[2])
    p.type('一些想法')
    p.click(p.buttonByText('跳过'))

    expect(p.dialog()).toBeNull()               // 已关闭
    p.setOpen(true)
    expect(p.dialog()).not.toBeNull()
    expect(p.textarea()!.value).toBe('')        // 文本被清空
    expect(p.radios().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(p.submitButton()!.hasAttribute('disabled')).toBe(true)
    p.unmount()
  })

  it('成功页「重新观看教程」会 resetOnboarding 并关闭', async () => {
    vi.useFakeTimers()
    const p = mount()
    p.click(p.radios()[3])
    p.click(p.submitButton())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    p.click(p.buttonByText('重新观看教程'))
    expect(ls.removeItem).toHaveBeenCalledWith(KEY)
    expect(p.dialog()).toBeNull()
    p.unmount()
  })

  it('成功页「开始使用」只关闭，不重置教程状态', async () => {
    vi.useFakeTimers()
    const p = mount()
    p.click(p.radios()[3])
    p.click(p.submitButton())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    p.click(p.buttonByText('开始使用'))
    expect(p.dialog()).toBeNull()
    expect(ls.removeItem).not.toHaveBeenCalled()
    p.unmount()
  })
})

describe('功能建议按钮', () => {
  it('点一次把「希望增加：X」追加到反馈文本，重复点不重复追加', () => {
    const p = mount()
    const suggestion = p.buttonByText('进度统计')!
    p.click(suggestion)
    expect(p.textarea()!.value).toBe('希望增加：进度统计')

    p.click(suggestion)
    expect(p.textarea()!.value).toBe('希望增加：进度统计')

    p.click(p.buttonByText('社交功能')!)
    expect(p.textarea()!.value).toBe('希望增加：进度统计，希望增加：社交功能')
    p.unmount()
  })
})

describe('语言', () => {
  it('英文下标题与按钮文案切换', () => {
    setLang('en')
    const p = mount()
    expect(p.text()).toContain('Tutorial Feedback')
    expect(p.buttonByText('Skip')).toBeDefined()
    expect(p.buttonByText('Submit Feedback')).toBeDefined()
    p.unmount()
  })
})
