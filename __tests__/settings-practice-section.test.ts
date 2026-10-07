/**
 * components/settings-practice-section.tsx 的契约测试（此前零测试）。
 *
 * 设置抽屉的「练习」折叠段：乐器选择 + 3 个基础滑块（练习时长/品格数/冷却时长）
 * + 限制练习（品区限制 / 八度切换 / 弱点加权）。纯受控组件。
 *
 * 契约重点：
 *  ① **5 个滑块的范围与步长** —— 范围写错会让用户拖到非法值；
 *  ② **品区两个滑块互相耦合**：start 的上限是 `fretCount - fretZoneSize`、
 *     size 的上限是 `fretCount`（改一个会挤压另一个的可选空间）；
 *  ③ **品区文案** `当前品区：start - (start + size - 1)`（闭区间，末尾要减 1）；
 *  ④ 联动显隐：冷却时长 / 品区两项 / 八度模式 / 弱点加权说明都只在对应开关打开时渲染；
 *  ⑤ 八度模式三选一（含"随机"）。
 *
 * ⚠️ 组件用了 AccordionItem/Trigger/Content，**必须包在 `<Accordion>` 里渲染**；
 * 且 radix Slider 依赖 ResizeObserver（jsdom 无），需要 stub。
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Accordion } from '@/components/ui/accordion'
import { SettingsPracticeSection } from '@/components/settings-practice-section'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// radix Slider 依赖 ResizeObserver（jsdom 无）
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub

// radix Select 展开时用到的 jsdom 缺口
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

function noop() { /* 空回调 */ }

/** 默认 props：全部限制开关关闭，便于逐项打开验证 */
function defaultProps(over: Record<string, unknown> = {}) {
  return {
    t,
    language: 'zh-CN',
    instrument: 'six_string_guitar',
    onInstrumentChange: noop,
    practiceTime: 120,
    onPracticeTimeChange: noop,
    fretCount: 12,
    onFretCountChange: noop,
    cooldownEnabled: false,
    onCooldownEnabledChange: noop,
    cooldownDuration: 500,
    onCooldownDurationChange: noop,
    fretZoneEnabled: false,
    onFretZoneEnabledChange: noop,
    fretZoneStart: 3,
    onFretZoneStartChange: noop,
    fretZoneSize: 5,
    onFretZoneSizeChange: noop,
    octaveShiftEnabled: false,
    onOctaveShiftEnabledChange: noop,
    octaveShiftMode: 'up' as const,
    onOctaveShiftModeChange: noop,
    weaknessWeightedEnabled: false,
    onWeaknessWeightedEnabledChange: noop,
    ...over,
  }
}

/** 包在 Accordion 里并默认展开，这样内容才挂载 */
function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(Accordion as never, { type: 'multiple', defaultValue: ['practice'] } as never,
        createElement(SettingsPracticeSection as never, defaultProps(props) as never) as ReactNode,
      ),
    )
  })
  const sliders = () => [...container.querySelectorAll('[role="slider"]')] as HTMLElement[]
  return {
    container,
    text: () => container.textContent ?? '',
    sliders,
    /** 按 aria-valuenow 找滑块（值唯一时好用） */
    sliderByNow: (now: number) => sliders().find((s) => s.getAttribute('aria-valuenow') === String(now)),
    switches: () => [...container.querySelectorAll('[role="switch"]')] as HTMLElement[],
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    comboboxes: () => [...container.querySelectorAll('[role="combobox"]')] as HTMLButtonElement[],
    click(el: HTMLElement) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }) },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

describe('折叠与基础渲染', () => {
  it('默认收起时不渲染内容；展开后渲染', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(Accordion as never, { type: 'multiple', defaultValue: [] } as never,
        createElement(SettingsPracticeSection as never, defaultProps() as never) as ReactNode))
    })
    expect(container.textContent).toContain(t('settings_practice'))
    expect(container.textContent).not.toContain(t('instrument_select'))
    // 点开
    const trigger = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(t('settings_practice')))!
    act(() => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    expect(container.textContent).toContain(t('instrument_select'))
    act(() => root.unmount()); container.remove()
  })

  it('显示各数值的当前值（含单位）', () => {
    const p = mount({ practiceTime: 300, fretCount: 20 })
    expect(p.text()).toContain('300s')
    expect(p.text()).toContain('20 frets')
    p.unmount()
  })

  it('乐器 combobox 显示当前所选', () => {
    const p = mount({ instrument: 'five_string_bass' })
    expect(p.comboboxes()[0].textContent).toBe(t('instrument_bass_5'))
    p.unmount()
  })
})

describe('三个基础滑块的范围与步长', () => {
  it('练习时长：30..600、步长 30', () => {
    const p = mount({ practiceTime: 120 })
    const s = p.sliderByNow(120)!
    expect(s.getAttribute('aria-valuemin')).toBe('30')
    expect(s.getAttribute('aria-valuemax')).toBe('600')
    p.unmount()
  })

  it('品格数：12..24、步长 1', () => {
    const p = mount({ fretCount: 12 })
    const s = p.sliderByNow(12)!
    expect(s.getAttribute('aria-valuemin')).toBe('12')
    expect(s.getAttribute('aria-valuemax')).toBe('24')
    p.unmount()
  })

  it('冷却时长：仅开关打开时渲染，范围 200..3000', () => {
    const off = mount({ cooldownEnabled: false })
    expect(off.text()).not.toContain('500ms')
    expect(off.sliders().length).toBe(2) // 只剩练习时长 + 品格数
    off.unmount()

    const on = mount({ cooldownEnabled: true, cooldownDuration: 500 })
    expect(on.text()).toContain('500ms')
    const s = on.sliderByNow(500)!
    expect(s.getAttribute('aria-valuemin')).toBe('200')
    expect(s.getAttribute('aria-valuemax')).toBe('3000')
    on.unmount()
  })
})

describe('品区限制（两个滑块互相耦合）', () => {
  it('start 上限 = fretCount - size；size 上限 = fretCount', () => {
    const p = mount({ fretZoneEnabled: true, fretCount: 12, fretZoneStart: 3, fretZoneSize: 5 })
    const start = p.sliderByNow(3)!
    const size = p.sliderByNow(5)!
    expect(start.getAttribute('aria-valuemin')).toBe('0')
    expect(start.getAttribute('aria-valuemax'), 'start 上限 = 12 - 5').toBe('7')
    expect(size.getAttribute('aria-valuemin')).toBe('2')
    expect(size.getAttribute('aria-valuemax'), 'size 上限 = fretCount').toBe('12')
    p.unmount()
  })

  it('size 变大时 start 的上限相应收窄', () => {
    const p = mount({ fretZoneEnabled: true, fretCount: 12, fretZoneStart: 0, fretZoneSize: 10 })
    expect(p.sliderByNow(0)!.getAttribute('aria-valuemax')).toBe('2')
    p.unmount()
  })

  it('品区覆盖整个指板（size = fretCount）时 start 无选择空间 → 不渲染滑块，但数值仍在', () => {
    // min === max 会让 radix Slider 内部 0/0 = NaN、生成非法 CSS（jsdom 直接抛错），
    // 所以该退化情况下必须不渲染 Slider。
    const p = mount({ fretZoneEnabled: true, fretCount: 12, fretZoneStart: 0, fretZoneSize: 12 })
    // 此时只剩「练习时长 / 品格数 / 品区大小」3 个滑块，start 那个不渲染
    expect(p.sliders().length).toBe(3)
    // start 的数值文本仍在
    expect(p.text()).toContain(t('limit_fret_zone_start'))
    // size 滑块仍在且上限是 fretCount。
    // 注意不能用 sliderByNow(12) —— fretZoneSize=12 与 fretCount=12 的 valuenow 撞车，
    // 会先命中「品格数」滑块（min=12）。用 min=2 唯一定位 size 滑块。
    const sizeSlider = p.sliders().find((x) => x.getAttribute('aria-valuemin') === '2')!
    expect(sizeSlider.getAttribute('aria-valuemax')).toBe('12')
    p.unmount()
  })

  it('size = fretCount - 1 时 start 上限为 1（仍有选择空间，滑块保留）', () => {
    const p = mount({ fretZoneEnabled: true, fretCount: 12, fretZoneStart: 1, fretZoneSize: 11 })
    expect(p.sliders().length).toBe(4)
    expect(p.sliderByNow(1)!.getAttribute('aria-valuemax')).toBe('1')
    p.unmount()
  })

  it('品区文案是闭区间：start - (start + size - 1)', () => {
    const p = mount({ fretZoneEnabled: true, fretZoneStart: 3, fretZoneSize: 5 })
    expect(p.text()).toContain('当前品区：3 - 7 品') // 3 + 5 - 1 = 7
    p.unmount()
  })

  it('品区未开启时两个滑块与文案都不渲染', () => {
    const p = mount({ fretZoneEnabled: false })
    expect(p.text()).not.toContain('当前品区')
    expect(p.sliders().length).toBe(2)
    p.unmount()
  })
})

describe('八度切换', () => {
  it('未开启时无模式按钮；开启后三选一（含"随机"）', () => {
    const off = mount({ octaveShiftEnabled: false })
    expect(off.text()).not.toContain(t('limit_octave_mode'))
    off.unmount()

    const on = mount({ octaveShiftEnabled: true, octaveShiftMode: 'down' })
    expect(on.text()).toContain(t('limit_octave_mode'))
    const labels = [t('direction_up'), t('direction_down'), t('direction_random')]
    const btns = on.buttons().filter((b) => labels.includes(b.textContent ?? ''))
    expect(btns.length).toBe(3)
    // 选中的是 down，样式唯一
    const classes = btns.map((b) => b.className)
    expect(new Set(classes).size).toBe(2)
    expect(classes.filter((c) => c === classes[1]).length).toBe(1)
    on.unmount()
  })

  it('点击模式按钮回传对应值', () => {
    const spy = vi.fn()
    const p = mount({ octaveShiftEnabled: true, onOctaveShiftModeChange: spy })
    const labels = [t('direction_up'), t('direction_down'), t('direction_random')]
    const btns = p.buttons().filter((b) => labels.includes(b.textContent ?? ''))
    btns.forEach((b) => p.click(b))
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['up', 'down', 'random'])
    p.unmount()
  })
})

describe('弱点加权', () => {
  it('未开启无说明；开启后显示说明', () => {
    const off = mount({ weaknessWeightedEnabled: false })
    expect(off.text()).not.toContain(t('weakness_weighted_desc'))
    off.unmount()
    const on = mount({ weaknessWeightedEnabled: true })
    expect(on.text()).toContain(t('weakness_weighted_desc'))
    on.unmount()
  })
})

describe('滑块回调', () => {
  it('练习时长滑块用方向键 +step 后回传数组', () => {
    const spy = vi.fn()
    const p = mount({ practiceTime: 120, onPracticeTimeChange: spy })
    const s = p.sliderByNow(120)!
    s.focus()
    act(() => {
      s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    })
    expect(spy, '应回传一次').toHaveBeenCalled()
    expect(spy.mock.calls[0][0], 'radix Slider 回传数组').toEqual([150]) // 120 + step 30
    p.unmount()
  })

  it('品区 start 滑块回传的是数字（取数组首值）', () => {
    const spy = vi.fn()
    const p = mount({
      fretZoneEnabled: true, fretZoneStart: 3, fretZoneSize: 5, onFretZoneStartChange: spy,
    })
    const s = p.sliderByNow(3)!
    s.focus()
    act(() => {
      s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    })
    expect(spy).toHaveBeenCalledWith(4)
    p.unmount()
  })

  it('品区 size 滑块同样回传数字（上限是 fretCount）', () => {
    const spy = vi.fn()
    const p = mount({
      fretZoneEnabled: true, fretZoneStart: 3, fretZoneSize: 5, fretCount: 12, onFretZoneSizeChange: spy,
    })
    const s = p.sliderByNow(5)!
    s.focus()
    act(() => {
      s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    })
    expect(spy).toHaveBeenCalledWith(6)
    p.unmount()
  })
})

describe('说明文案按语言切换', () => {
  it('language=en 时三处内联说明都走英文（品区文案也是英文句式）', () => {
    // 这三处是组件里唯一的硬编码中英三元，且都挂在「开关打开」的条件渲染里，
    // 所以必须同时打开品区与八度才能一次看全。
    const p = mount({
      language: 'en',
      fretZoneEnabled: true, fretZoneStart: 3, fretZoneSize: 5,
      octaveShiftEnabled: true,
    })
    expect(p.text()).toContain('Limitation Exercises are core training methods')
    expect(p.text()).toContain('Current zone: frets 3 - 7')
    expect(p.text()).toContain('Shift between equivalent octave positions')
    expect(p.text()).not.toContain('限制练习是')
    p.unmount()
  })
})

describe('乐器下拉', () => {
  it('切换乐器回传新值（六弦吉他 → 七弦吉他）', () => {
    // ⚠️ radix 对「选中当前值」不触发 onValueChange，所以不能从 six_string_guitar 出发再选它
    const spy = vi.fn()
    const p = mount({ instrument: 'six_string_guitar', onInstrumentChange: spy })
    const combo = p.comboboxes()[0]
    act(() => {
      combo.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      combo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const opts = [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
    const target = opts.find((o) => o.textContent === t('instrument_guitar_7'))
    expect(target, `选项列表：${opts.map((o) => o.textContent).join('|')}`).toBeDefined()
    p.click(target!)
    expect(spy).toHaveBeenCalledWith('seven_string_guitar')
    p.unmount()
  })
})

describe('开关数量', () => {
  it('四个限制开关的选中态反映 props', () => {
    const p = mount({
      cooldownEnabled: true, fretZoneEnabled: false,
      octaveShiftEnabled: true, weaknessWeightedEnabled: false,
    })
    // 顺序：冷却 / 品区 / 八度 / 弱点加权
    expect(p.switches().map((s) => s.getAttribute('data-state')))
      .toEqual(['checked', 'unchecked', 'checked', 'unchecked'])
    p.unmount()
  })
})
