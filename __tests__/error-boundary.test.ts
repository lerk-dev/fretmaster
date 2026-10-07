/**
 * ErrorBoundary —— 应用级错误兜底契约测试
 *
 * 类组件（getDerivedStateFromError + componentDidCatch），全应用兜底。
 * 契约分三块：① 捕获与上报 ② 兜底 UI 的文案与条件渲染 ③ 两个按钮的行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ErrorBoundary } from '@/components/error-boundary'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
let consoleError: ReturnType<typeof vi.spyOn> | null = null

/** 只在 `throwIt` 为 true 时抛错，便于测「重试后恢复」 */
let throwIt = false
function Child({ label = '正常内容' }: { label?: string }) {
  if (throwIt) throw new Error('炸了')
  return createElement('div', null, label)
}

type Props = Record<string, unknown>

function mount(props: Props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      createElement(
        ErrorBoundary as never,
        { language: 'zh-CN', ...props } as never,
        createElement(Child as never, null) as never,
      ),
    )
  })
  const text = () => container!.textContent ?? ''
  const buttons = () => [...container!.querySelectorAll('button')] as HTMLButtonElement[]
  const btn = (label: string) => buttons().find((b) => b.textContent?.trim() === label)
  const click = (el: HTMLElement | undefined) => {
    expect(el, '待点击元素应存在').toBeTruthy()
    act(() => {
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { container: () => container!, text, buttons, btn, click, unmount }
}

beforeEach(() => {
  throwIt = false
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  consoleError?.mockRestore()
  delete (window as unknown as { __fmerrors?: string[] }).__fmerrors
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ErrorBoundary', () => {
  describe('正常路径', () => {
    it('没有错误时原样渲染 children、不显示兜底', () => {
      const p = mount()
      expect(p.text()).toContain('正常内容')
      expect(p.text()).not.toContain('出现了一些问题')
      expect(p.buttons()).toHaveLength(0)
      p.unmount()
    })
  })

  describe('捕获与上报', () => {
    it('子组件抛错 → 显示兜底 UI（role=alert）', () => {
      throwIt = true
      const p = mount()
      expect(p.text()).toContain('出现了一些问题')
      expect(p.container().querySelector('[role="alert"]')).toBeTruthy()
      expect(p.container().querySelector('[aria-hidden="true"]')?.textContent).toBe('🎸')
      p.unmount()
    })

    it('调用 onError(error, errorInfo)', () => {
      throwIt = true
      const onError = vi.fn()
      const p = mount({ onError })
      expect(onError).toHaveBeenCalledTimes(1)
      const [err, info] = onError.mock.calls[0] as [Error, React.ErrorInfo]
      expect(err.message).toBe('炸了')
      expect(info).toHaveProperty('componentStack')
      p.unmount()
    })

    it('把错误记录到 window.__fmerrors', () => {
      ;(window as unknown as { __fmerrors: string[] }).__fmerrors = []
      throwIt = true
      const p = mount()
      const log = (window as unknown as { __fmerrors: string[] }).__fmerrors
      expect(log).toHaveLength(1)
      expect(log[0]).toBe('[ErrorBoundary] 炸了')
      p.unmount()
    })

    it('有 componentName 时日志带前缀', () => {
      ;(window as unknown as { __fmerrors: string[] }).__fmerrors = []
      throwIt = true
      const p = mount({ componentName: 'TunerSheet' })
      expect((window as unknown as { __fmerrors: string[] }).__fmerrors[0]).toBe(
        '[ErrorBoundary TunerSheet] 炸了',
      )
      p.unmount()
    })

    it('window.__fmerrors 不存在时不抛错（只是不上报）', () => {
      throwIt = true
      expect(() => mount()).not.toThrow()
      // 已挂载的实例手动卸载，避免泄漏
      act(() => root?.unmount())
      container?.remove()
      root = null
      container = null
    })
  })

  describe('兜底 UI 文案', () => {
    it('默认中文文案', () => {
      throwIt = true
      const p = mount()
      expect(p.text()).toContain('出现了一些问题')
      expect(p.text()).toContain('炸了') // 错误信息
      expect(p.text()).toContain('重试')
      expect(p.text()).toContain('刷新页面')
      p.unmount()
    })

    it('language=en 时用英文文案', () => {
      throwIt = true
      const p = mount({ language: 'en' })
      expect(p.text()).toContain('Something went wrong')
      expect(p.text()).toContain('Retry')
      expect(p.text()).toContain('Refresh Page')
      p.unmount()
    })

    it('componentName 存在时标题换成「<名> 组件出现问题」', () => {
      throwIt = true
      const p = mount({ componentName: 'StatsPanel' })
      expect(p.text()).toContain('StatsPanel 组件出现问题')
      expect(p.text()).not.toContain('出现了一些问题')
      p.unmount()
      const en = mount({ language: 'en', componentName: 'StatsPanel' })
      expect(en.text()).toContain('StatsPanel component encountered an issue')
      en.unmount()
    })

    it('错误没有 message 时显示兜底文案', () => {
      const NoMsg = () => {
        throw new Error('')
      }
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
      act(() => {
        root!.render(
          createElement(ErrorBoundary as never, { language: 'zh-CN' } as never, createElement(NoMsg) as never),
        )
      })
      expect(container.textContent).toContain('应用发生了意外错误')
      act(() => root!.unmount())
      container.remove()
      root = null
      container = null
    })

    it('提供 fallback 时完全用 fallback 替换兜底 UI', () => {
      throwIt = true
      const p = mount({ fallback: createElement('div', null, '自定义兜底') })
      expect(p.text()).toContain('自定义兜底')
      expect(p.text()).not.toContain('出现了一些问题')
      expect(p.buttons()).toHaveLength(0)
      p.unmount()
    })

    it('componentDidCatch 写入 componentStack 后出现「查看详情」折叠块', () => {
      throwIt = true
      const p = mount()
      const details = p.container().querySelector('details')
      expect(details, 'componentStack 写入后应出现 details').toBeTruthy()
      expect(p.text()).toContain('查看详情')
      expect(details!.querySelector('pre')?.textContent).toBeTruthy()
      p.unmount()
      throwIt = true
      const en = mount({ language: 'en' })
      expect(en.text()).toContain('View details')
      en.unmount()
    })
  })

  describe('按钮行为', () => {
    it('「重试」复位状态 —— 子组件不再抛错时恢复渲染', () => {
      throwIt = true
      const p = mount()
      expect(p.text()).toContain('出现了一些问题')
      throwIt = false
      p.click(p.btn('重试'))
      expect(p.text()).toContain('正常内容')
      expect(p.text()).not.toContain('出现了一些问题')
      p.unmount()
    })

    it('「刷新页面」调用 window.location.reload', () => {
      const reload = vi.fn()
      const original = window.location
      Object.defineProperty(window, 'location', {
        value: { ...original, reload },
        writable: true,
        configurable: true,
      })
      try {
        throwIt = true
        const p = mount()
        p.click(p.btn('刷新页面'))
        expect(reload).toHaveBeenCalledTimes(1)
        p.unmount()
      } finally {
        Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
      }
    })
  })
})
