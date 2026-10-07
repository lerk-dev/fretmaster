/**
 * components/debug-panel.tsx 的「动态 import 失败」分支（debug-panel.test.ts 覆盖不到）。
 *
 * 为什么单独开一个文件：面板内部是 `await import('@tauri-apps/api/core')`，
 * 而三条 IPC 各自带了 `.catch(() => null)` —— **只有「加载模块本身失败」**
 * （桌面端降级 / 打包缺失）才会漏到最外层 try/catch。
 * 要让动态 import 在**首次加载**时就抛，mock factory 必须在模块注册阶段就抛，
 * 而 `vi.resetModules()` 会把 mock 注册一起清掉（实测走了真实模块），
 * 所以只能靠独立文件顶层的 `vi.mock(..., () => { throw })`。
 *
 * 契约：
 *  ① 加载失败 → `console.warn('Debug update error:', e)`，不把异常抛到 React 渲染里；
 *  ② 面板仍然渲染（不白屏），数据停在默认值；
 *  ③ 下一次轮询照常继续，一次失败不会让调试面板永久停摆。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DebugPanel } from '@/components/debug-panel'

vi.mock('@tauri-apps/api/core', () => {
  throw new Error('module load failed')
})

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(DebugPanel as never, null as never)) })
  act(() => { /* flush Tauri 判定 effect */ })
  const text = () => container.textContent ?? ''
  const rowValue = (label: string): string | undefined => {
    const hit = [...container.querySelectorAll('span')].find((s) => s.textContent === label)
    return hit?.parentElement?.querySelectorAll('span')[1]?.textContent ?? undefined
  }
  return {
    container,
    text,
    rowValue,
    circle: () => container.querySelector('[aria-label="Open debug panel"]') as HTMLElement | null,
    click(el: HTMLElement | null) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    async tick(n = 1) {
      for (let i = 0; i < n; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(500) })
      }
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  ;(window as unknown as Record<string, unknown>).__TAURI__ = true
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as Record<string, unknown>).__TAURI__
})

describe('@tauri-apps/api/core 加载不出来时', () => {
  it('只 console.warn 兜底：面板照常渲染、数据停在默认值', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    const p = mount()
    p.click(p.circle())
    await p.tick(1)

    expect(warn).toHaveBeenCalledWith('Debug update error:', expect.any(Error))
    expect(p.text()).toContain('Debug Panel')
    expect(p.rowValue('Note')).toBe('-')
    expect(p.rowValue('Capturing')).toBe('○ OFF')
    // 采样率的兜底 48000 写在 get_audio_status 的 .catch 里，这条路径根本没跑到那里
    expect(p.rowValue('Sample Rate')).toBe('0.0 kHz')
    warn.mockRestore()
    p.unmount()
  })

  it('一次失败不会让轮询永久停摆', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    const p = mount()
    p.click(p.circle())
    await p.tick(3)
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
    p.unmount()
  })
})
