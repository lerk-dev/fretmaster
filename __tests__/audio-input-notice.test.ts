/**
 * components/audio-input-notice.tsx 的契约测试（此前零测试）。
 *
 * 练习模式专享的「音频输入未开启」提示条：文案 + 一个「去设置」按钮。
 * 存在的意义是消除「调音器能识别、练习却没反应」的盲区（两者走不同音频链路）。
 *
 * 契约：
 *  ① 是 `role="status"`（读屏可感知的提示）；
 *  ② 正文与按钮文案都走 `t()`，英文下不含任何汉字；
 *  ③ 按钮点击 → onOpenSettings（仅一次）。
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioInputNotice } from '@/components/audio-input-notice'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const CJK = /[\u4e00-\u9fff]/
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k

function mount(t: (k: string) => string = tZh) {
  const onOpenSettings = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(AudioInputNotice as never, { t, onOpenSettings } as never)) })
  return {
    container,
    onOpenSettings,
    status: () => container.querySelector('[role="status"]') as HTMLElement | null,
    button: () => container.querySelector('button') as HTMLButtonElement | null,
    click(el: HTMLElement | null) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    text: () => container.textContent ?? '',
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

describe('结构与文案', () => {
  it('角色是 status，正文与按钮文案走 t()', () => {
    const p = mount()
    expect(p.status()).not.toBeNull()
    expect(p.text()).toContain(tZh('audio_input_required'))
    expect(p.button()!.textContent).toBe(tZh('audio_input_open_settings'))
    p.unmount()
  })

  it('英文下不含任何汉字', () => {
    const p = mount(tEn)
    expect(p.text()).toContain(en['audio_input_required'])
    expect(p.text()).not.toMatch(CJK)
    p.unmount()
  })
})

describe('交互', () => {
  it('点按钮打开设置（回调一次），点提示条本身不触发', () => {
    const p = mount()
    p.click(p.status())
    expect(p.onOpenSettings).not.toHaveBeenCalled()
    p.click(p.button())
    expect(p.onOpenSettings).toHaveBeenCalledTimes(1)
    p.unmount()
  })
})
