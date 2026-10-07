/**
 * lib/a11y.ts 的契约测试（此前零测试）。
 *
 * `activateOnEnterSpace` 把 Enter / Space 映射成与点击相同的动作，用于
 * `role="button"` + `tabIndex={0}` 的非 <button> 可点击容器
 * （level-selector-dialog / chord-exercise-level-selector / song-selector-dialog）。
 * 键盘可访问性坏了不会崩，只会「键盘按了没反应」—— 所以值得钉住。
 */
import { describe, it, expect, vi } from 'vitest'
import { activateOnEnterSpace } from '@/lib/a11y'

/** 最小可用的键盘事件替身 */
const keyEvent = (key: string) => ({ key, preventDefault: vi.fn() })

describe('activateOnEnterSpace', () => {
  it('Enter 触发动作并阻止默认行为', () => {
    const fn = vi.fn()
    const handler = activateOnEnterSpace(fn)
    const e = keyEvent('Enter')
    handler(e)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('Space 同样触发', () => {
    const fn = vi.fn()
    const e = keyEvent(' ')
    activateOnEnterSpace(fn)(e)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('其它按键不触发、也不阻止默认行为', () => {
    const fn = vi.fn()
    const handler = activateOnEnterSpace(fn)
    for (const k of ['Escape', 'Tab', 'a', 'ArrowDown', 'Enter ']) {
      const e = keyEvent(k)
      handler(e)
      expect(fn, k).not.toHaveBeenCalled()
      expect(e.preventDefault, k).not.toHaveBeenCalled()
    }
  })

  it('同一个 handler 可重复触发（每次按键都算一次激活）', () => {
    const fn = vi.fn()
    const handler = activateOnEnterSpace(fn)
    handler(keyEvent('Enter'))
    handler(keyEvent(' '))
    handler(keyEvent('Enter'))
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('互不干扰：两个 handler 各自绑定自己的动作', () => {
    const a = vi.fn()
    const b = vi.fn()
    const ha = activateOnEnterSpace(a)
    const hb = activateOnEnterSpace(b)
    ha(keyEvent('Enter'))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    hb(keyEvent(' '))
    expect(b).toHaveBeenCalledTimes(1)
  })
})
