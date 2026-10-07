/**
 * hooks/use-mobile.ts 的契约测试（此前零测试）。
 *
 * 只有 19 行，但两条约定容易悄悄改坏：
 *  ① **断点**：`(max-width: 767px)`，即 MOBILE_BREAKPOINT - 1 = 767。
 *     写成 768 会让「正好 768px」被判成移动端，与 CSS 断点错位一格。
 *  ② **判定依据**：mql 只负责「什么时候重算」，真正取值始终来自 `window.innerWidth`
 *     （不是 `mql.matches`）。所以宽度变了但 change 没触发时，值不会自己变。
 *  ③ 首次渲染返回 false（`useState<boolean | undefined>(undefined)` → `!!undefined`），
 *     避免 SSR/首帧与客户端不一致。
 *
 * 消费者：components/ui/sidebar.tsx:69。jsdom 的 matchMedia 由 __tests__/setup.ts 提供。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useIsMobile } from '@/hooks/use-mobile'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let value: boolean | undefined
let root: Root | null = null

function Probe() {
  value = useIsMobile()
  return null
}

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(createElement(Probe)) })
  return {
    unmount() {
      if (!root) return
      act(() => { root!.unmount() })
      root = null
      container.remove()
    },
  }
}

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}

/** 取到 hook 注册过的 change 回调 */
function onChangeCallbacks() {
  const mqls = (window.matchMedia as ReturnType<typeof vi.fn>).mock.results
  return mqls.map((r) => {
    const mql = r.value as { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
    const call = mql.addEventListener.mock.calls.find((c) => c[0] === 'change')
    return { onChange: call?.[1] as (() => void) | undefined, mql }
  })
}

beforeEach(() => {
  value = undefined
  setWidth(1024)
  // 只清调用记录，setTimeout/mockImplementation 由 setup.ts 提供、需保留
  ;(window.matchMedia as ReturnType<typeof vi.fn>).mockClear()
})

afterEach(() => {
  if (root) {
    act(() => { root!.unmount() })
    root = null
  }
})

describe('useIsMobile', () => {
  it('宽屏（1200）判为 false，窄屏（375）判为 true', () => {
    setWidth(1200)
    const a = mount()
    expect(value).toBe(false)
    a.unmount()

    setWidth(375)
    const b = mount()
    expect(value).toBe(true)
    b.unmount()
  })

  it('断点边界：767 是移动端、768 不是（max-width: 767px）', () => {
    setWidth(767)
    const a = mount()
    expect(value).toBe(true)
    a.unmount()

    setWidth(768)
    const b = mount()
    expect(value).toBe(false)
    b.unmount()
  })

  it('mql 查询串是 (max-width: 767px)', () => {
    const h = mount()
    expect((window.matchMedia as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('(max-width: 767px)')
    h.unmount()
  })

  it('change 事件触发后按最新 innerWidth 重算', () => {
    setWidth(1200)
    const h = mount()
    expect(value).toBe(false)

    const { onChange } = onChangeCallbacks()[0]
    expect(typeof onChange).toBe('function')

    setWidth(375)
    act(() => { onChange!() })
    expect(value).toBe(true)

    setWidth(1200)
    act(() => { onChange!() })
    expect(value).toBe(false)
    h.unmount()
  })

  it('判定依据是 window.innerWidth 而不是 mql.matches（matches 恒为 false 不影响结果）', () => {
    // setup.ts 的 matchMedia mock 固定返回 matches: false
    setWidth(375)
    const h = mount()
    expect(value, '窄屏应按 innerWidth 判为 true，不受 mql.matches 影响').toBe(true)
    h.unmount()
  })

  it('卸载时移除 change 监听', () => {
    const h = mount()
    const { onChange, mql } = onChangeCallbacks()[0]
    h.unmount()
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', onChange)
  })

  it('首次渲染前返回 false（初值是 undefined，不是闪一下 true）', () => {
    setWidth(375)
    value = undefined
    expect(value).toBeUndefined()
    const h = mount()
    expect(value).toBe(true) // 挂载后由 effect 立即算出
    h.unmount()
  })
})
