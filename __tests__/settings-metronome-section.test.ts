/**
 * components/settings-metronome-section.tsx 的契约测试（此前零测试）。
 *
 * 设置抽屉里「节拍器」折叠段：开关 + 速度滑块 + 音效/闪灯/可视化三个开关。
 *
 * 契约：
 *  ① 4 个 Switch 的受控状态与 props 一致（radix Switch 的 click **不触发** onCheckedChange，
 *     见 MEMORY：只断言 `aria-checked` / `data-state`，不模拟点击）；
 *  ② 速度显示 `{bpm} BPM`；Slider 的 aria-valuenow/min/max 与 props/常量一致，
 *     且 onValueChange 接的是 bpm 回调；
 *  ③ 所有标签文案走 t()；
 *  ④ 第一个开关用 aria-labelledby 关联可见标签（读屏能念出用途）。
 *
 * ⚠️ 折叠段必须包在 `<Accordion>` 里、且 item 处于展开态才会渲染内容（radix 延迟挂载）。
 * ⚠️ radix Slider 依赖 ResizeObserver（jsdom 无）→ 必须在文件顶部补 stub。
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SettingsMetronomeSection } from '@/components/settings-metronome-section'
import { Accordion } from '@/components/ui/accordion'
import { TRANSLATIONS } from '@/lib/i18n'
import { METRONOME_BEATS_DEFAULT, METRONOME_BEATS_OPTIONS } from '@/lib/store'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub

// radix Select 展开要用的 jsdom 缺口（补齐后才能驱动 onBeatsPerMeasureChange）：
// 少了 hasPointerCapture 会在点选项时抛 TypeError（用例本身仍算过，但留下 uncaught error）。
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const t = (k: string) => zh[k] ?? k

function mount(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onEnabledChange: vi.fn(),
    onBpmChange: vi.fn(),
    onBeatsPerMeasureChange: vi.fn(),
    onSoundChange: vi.fn(),
    onFlashChange: vi.fn(),
    onVisualizeChange: vi.fn(),
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    t,
    enabled: false,
    bpm: 120,
    beatsPerMeasure: METRONOME_BEATS_DEFAULT,
    sound: false,
    flash: false,
    visualize: false,
    ...handlers,
    ...overrides,
  }
  act(() => {
    root.render(
      createElement(
        Accordion as never,
        { type: 'single', collapsible: true, defaultValue: 'metronome' } as never,
        createElement(SettingsMetronomeSection as never, props as never),
      ),
    )
  })

  return {
    container,
    ...handlers,
    switches: () => [...container.querySelectorAll('[role="switch"]')] as HTMLElement[],
    slider: () => container.querySelector('[role="slider"]') as HTMLElement | null,
    text: () => container.textContent ?? '',
    /** 拍号下拉（选项 portal 到 body，故打开时查 document） */
    openBeats: () => {
      const c = container.querySelector('[role="combobox"]') as HTMLElement | null
      expect(c, '拍号 combobox 应存在').toBeTruthy()
      act(() => {
        c!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
        c!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      return [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

describe('结构', () => {
  it('渲染 4 个开关 + 1 个速度滑块 + 1 个拍号下拉', () => {
    const p = mount()
    expect(p.switches()).toHaveLength(4)
    expect(p.slider()).not.toBeNull()
    // 拍号（#14 新增）是 Select 而不是第 5 个 Switch —— 拍号是离散选项，不是开关
    expect(p.container.querySelectorAll('[role="combobox"]')).toHaveLength(1)
    p.unmount()
  })

  it('折叠标题与五个标签文案都走 t()', () => {
    const p = mount()
    for (const key of ['device_metronome', 'device_tempo', 'metronome_beats', 'metronome_sound', 'metronome_flash', 'metronome_visualize']) {
      expect(p.text(), `缺 ${key}`).toContain(t(key))
    }
    p.unmount()
  })

  it('速度显示「{bpm} BPM」并随 props 变', () => {
    const p = mount({ bpm: 96 })
    expect(p.text()).toContain('96 BPM')
    p.unmount()
    const q = mount({ bpm: 200 })
    expect(q.text()).toContain('200 BPM')
    q.unmount()
  })
})

describe('开关的受控状态（radix Switch 点击不触发回调，只断言状态）', () => {
  it('四个开关的 checked 与 props 一一对应', () => {
    const p = mount({ enabled: true, sound: false, flash: true, visualize: false })
    const [en, sound, flash, vis] = p.switches()
    expect(en.getAttribute('aria-checked')).toBe('true')
    expect(sound.getAttribute('aria-checked')).toBe('false')
    expect(flash.getAttribute('aria-checked')).toBe('true')
    expect(vis.getAttribute('aria-checked')).toBe('false')
    p.unmount()
  })

  it('aria-checked 与 data-state 一致', () => {
    const p = mount({ enabled: true })
    const sw = p.switches()[0]
    expect(sw.getAttribute('data-state')).toBe('checked')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    p.unmount()
    const q = mount({ enabled: false })
    expect(q.switches()[0].getAttribute('data-state')).toBe('unchecked')
    q.unmount()
  })

  it('第一个开关用 aria-labelledby 关联可见标签', () => {
    const p = mount()
    const labelledby = p.switches()[0].getAttribute('aria-labelledby')
    expect(labelledby).toBe('metronome-toggle-label')
    expect(p.container.querySelector(`#${labelledby}`)!.textContent).toBe(t('device_metronome'))
    p.unmount()
  })
})

describe('速度滑块', () => {
  it('范围 40–240、当前值 = bpm', () => {
    const p = mount({ bpm: 132 })
    const s = p.slider()!
    expect(s.getAttribute('aria-valuemin')).toBe('40')
    expect(s.getAttribute('aria-valuemax')).toBe('240')
    expect(s.getAttribute('aria-valuenow')).toBe('132')
    p.unmount()
  })

  it('边界值也在范围内（不产生非法状态）', () => {
    for (const bpm of [40, 240]) {
      const p = mount({ bpm })
      const s = p.slider()!
      expect(Number(s.getAttribute('aria-valuenow'))).toBe(bpm)
      expect(Number(s.getAttribute('aria-valuemin'))).toBeLessThanOrEqual(bpm)
      expect(Number(s.getAttribute('aria-valuemax'))).toBeGreaterThanOrEqual(bpm)
      p.unmount()
    }
  })
})

describe('拍号（#14 新增：重音落在哪一拍、可视化画几个圆点）', () => {
  it('触发区显示「{拍数}/4」，随 props 变', () => {
    const p = mount({ beatsPerMeasure: 3 })
    expect(p.container.querySelector('[role="combobox"]')!.textContent).toContain('3/4')
    p.unmount()
    const q = mount({ beatsPerMeasure: 6 })
    expect(q.container.querySelector('[role="combobox"]')!.textContent).toContain('6/4')
    q.unmount()
  })

  it('选项集合与 store 的白名单常量**逐项一致**（不许在这里另写一份列表）', () => {
    const p = mount()
    const labels = p.openBeats().map((o) => o.textContent)
    expect(labels).toEqual(METRONOME_BEATS_OPTIONS.map((b) => `${b}/4`))
    p.unmount()
  })

  it('选中某一项 → 以数字回调（不是字符串，组件负责转换）', () => {
    const p = mount()
    const opts = p.openBeats()
    const target = opts.find((o) => o.textContent === '3/4')!
    act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    expect(p.onBeatsPerMeasureChange).toHaveBeenCalledTimes(1)
    expect(p.onBeatsPerMeasureChange).toHaveBeenCalledWith(3)
    p.unmount()
  })

  it('拍号行的标签用 aria-labelledby 关联可见文案（读屏能念出用途）', () => {
    const p = mount()
    const combo = p.container.querySelector('[role="combobox"]') as HTMLElement
    const labelledby = combo.getAttribute('aria-labelledby')
    expect(labelledby).toBe('metronome-beats-label')
    expect(p.container.querySelector(`#${labelledby}`)!.textContent).toBe(t('metronome_beats'))
    p.unmount()
  })
})
