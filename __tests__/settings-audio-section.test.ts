/**
 * components/settings-audio-section.tsx 的契约测试（此前零测试）。
 *
 * 设置抽屉的「音频与输入」折叠段：反馈音效 / 音频输入设备（Web 与 Tauri 两条分支）/ MIDI。
 * 纯受控组件（不存在内部 state），所有值都来自 props、所有改动都回调出去。
 *
 * 契约重点：
 *  ① 反馈音「总开关关掉后两个子开关必须消失」——否则用户以为还能单独调；
 *  ② **两条分支互斥且看 mounted**：`!mounted` → 骨架屏；`isTauri` → WindowsAudioSettings；
 *     否则 Web 分支。且 MIDI 段**在 mounted 判定之外**，骨架态也应渲染；
 *  ③ **单位契约**：增益滑块对外回传「百分比数组」（0..200），置信度滑块对外回传
 *     「0..1 小数」（内部 50..95 整数）。两边单位相反，写错就是静默失效；
 *  ④ 联动禁用：麦克风初始化中 → 麦克风开关禁用；麦克风开着 → 增益滑块与
 *     「使用 AudioWorklet」开关都禁用（运行中不能改，否则参数不生效）；
 *  ⑤ 设备权限提示的两种文案（无设备 / 有设备但无名字）与「请求麦克风权限」按钮流程；
 *  ⑥ MIDI：开关关闭时设备下拉禁用；设备数量文案要做 `{count}` 插值。
 *
 * ⚠️ 组件用了 AccordionItem/Trigger/Content，**必须包在 `<Accordion>` 里渲染**；
 *     radix Slider 依赖 ResizeObserver（jsdom 无），需要 stub。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Accordion } from '@/components/ui/accordion'
import { SettingsAudioSection } from '@/components/settings-audio-section'
import { formatNoisePercent, onsetGateFromNoiseFloor, CALIBRATION_SAMPLE_ROUNDS } from '@/lib/noise-calibration'
import { logger } from '@/lib/logger'
import { TRANSLATIONS } from '@/lib/i18n'

// vi.mock 会被提升到文件顶部，工厂里不能引用顶层变量，用 vi.hoisted 一起提升
const toastSpies = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastSpies, Toaster: () => null }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub

// radix Select 展开时用到的 jsdom 缺口
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

const noop = () => { /* 空回调 */ }

function device(deviceId: string, label = '', kind = 'audioinput'): MediaDeviceInfo {
  return { deviceId, label, kind, groupId: '', toJSON: () => ({}) } as unknown as MediaDeviceInfo
}

function midiInput(id: string, name: string): WebMidi.MIDIInput {
  return { id, name } as unknown as WebMidi.MIDIInput
}

/** 默认 props：已挂载 / Web 端 / 麦克风关 / 反馈音关 —— 便于逐项打开 */
function defaultProps(over: Record<string, unknown> = {}) {
  return {
    t,
    language: 'zh-CN',
    feedbackSoundEnabled: false,
    onFeedbackSoundEnabledChange: noop,
    correctSound: true,
    onCorrectSoundChange: noop,
    wrongSound: true,
    onWrongSoundChange: noop,
    mounted: true,
    isTauri: false,
    audioDevices: [] as MediaDeviceInfo[],
    selectedAudioDevice: '',
    onSelectedAudioDeviceChange: noop,
    onRefreshAudioDevices: async () => { /* 空刷新 */ },
    micEnabled: false,
    onMicToggle: noop,
    audioInitializing: false,
    audioError: null,
    useAudioWorklet: true,
    onUseAudioWorkletChange: noop,
    inputGain: 1,
    onInputGainChange: noop,
    pitchAlgorithm: 'standard' as const,
    onPitchAlgorithmChange: noop,
    confidenceThreshold: 0.8,
    onConfidenceThresholdChange: noop,
    noiseFloor: undefined as number | undefined,
    noiseCalibrating: false,
    noiseCalibrationCountdown: null as number | null,
    noiseCalibrationProgress: null as number | null,
    onCalibrateNoiseFloor: noop,
    midiEnabled: false,
    onMidiEnabledChange: noop,
    midiDevices: [] as WebMidi.MIDIInput[],
    selectedMidiDevice: 'random',
    onSelectedMidiDeviceChange: noop,
    ...over,
  }
}

function mount(over: Record<string, unknown> = {}) {
  const props = defaultProps(over)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Accordion as never, { type: 'multiple', defaultValue: ['audio'] } as never,
      createElement(SettingsAudioSection as never, props as never) as ReactNode))
  })
  const sliders = () => [...container.querySelectorAll('[role="slider"]')] as HTMLElement[]
  return {
    container,
    props,
    text: () => container.textContent ?? '',
    sliders,
    /** 按 aria-valuenow 找滑块（本段只有增益/置信度两个，值不同） */
    sliderByNow: (now: number) => sliders().find((s) => s.getAttribute('aria-valuenow') === String(now)),
    switches: () => [...container.querySelectorAll('[role="switch"]')] as HTMLElement[],
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    button: (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!,
    comboboxes: () => [...container.querySelectorAll('[role="combobox"]')] as HTMLButtonElement[],
    /** 展开第 i 个 Select（radix 靠 pointerdown 打开），选项会渲染到 body 的 portal 里 */
    openCombo(i: number) {
      const combo = [...container.querySelectorAll('[role="combobox"]')][i] as HTMLElement
      act(() => {
        combo.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
        combo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
    },
    /** 当前展开列表里的选项文本 */
    options: () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent),
    click(el: HTMLElement) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }) },
    /** 键盘方向键驱动 radix 滑块（按 step 步进并触发 onValueChange） */
    key(el: HTMLElement, k: string) {
      act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

beforeEach(() => { for (const f of Object.values(toastSpies)) f.mockClear() })

describe('折叠与段标题', () => {
  it('默认收起时不渲染内容，展开后渲染', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (defaultValue: string[]) => act(() => {
      root.render(createElement(Accordion as never, { type: 'multiple', defaultValue } as never,
        createElement(SettingsAudioSection as never, defaultProps() as never) as ReactNode))
    })
    render([])
    expect(container.textContent).toContain('音频与输入')
    expect(container.textContent).not.toContain(t('feedback_sound_enabled'))

    const trigger = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('音频与输入'))!
    act(() => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    expect(container.textContent).toContain(t('feedback_sound_enabled'))

    act(() => root.unmount()); container.remove()
  })

  it('段标题按 language 切换', () => {
    const p = mount({ language: 'en' })
    expect(p.text()).toContain('Audio & Input')
    p.unmount()
  })
})

describe('反馈音效', () => {
  it('总开关关闭时只有 1 个反馈音开关，两个子开关不渲染', () => {
    const p = mount({ feedbackSoundEnabled: false })
    expect(p.text()).toContain(t('feedback_sound_enabled'))
    expect(p.text()).not.toContain(t('correct_sound'))
    expect(p.text()).not.toContain(t('wrong_sound'))
    p.unmount()
  })

  it('总开关打开后出现正确/错误提示音两个开关', () => {
    const p = mount({ feedbackSoundEnabled: true })
    expect(p.text()).toContain(t('correct_sound'))
    expect(p.text()).toContain(t('wrong_sound'))
    p.unmount()
  })

  it('三个开关分别回调（总开关 / 正确 / 错误）', () => {
    const onFeedbackSoundEnabledChange = vi.fn()
    const onCorrectSoundChange = vi.fn()
    const onWrongSoundChange = vi.fn()
    const p = mount({ feedbackSoundEnabled: true, onFeedbackSoundEnabledChange, onCorrectSoundChange, onWrongSoundChange })
    // 开关顺序：反馈音总开关 → 正确 → 错误 → 麦克风 → Worklet → MIDI
    const sw = p.switches()
    p.click(sw[0])
    expect(onFeedbackSoundEnabledChange).toHaveBeenCalledWith(false) // 当前 true
    p.click(sw[1])
    expect(onCorrectSoundChange).toHaveBeenCalledWith(false) // 当前 true
    p.click(sw[2])
    expect(onWrongSoundChange).toHaveBeenCalledWith(false)
    expect(onFeedbackSoundEnabledChange).toHaveBeenCalledTimes(1)
    p.unmount()
  })
})

describe('mounted / isTauri 两条分支', () => {
  it('未挂载时渲染骨架屏：无滑块、无设备下拉，但 MIDI 段仍在', () => {
    const p = mount({ mounted: false })
    expect(p.container.querySelector('.animate-pulse')).not.toBeNull()
    expect(p.sliders()).toHaveLength(0)
    // MIDI 在 mounted 判定之外，骨架态也渲染（其依赖的 navigator 能力与 hydration 无关）
    expect(p.text()).toContain(t('midi_support'))
    // 但 Web 分支的设备下拉不在
    expect(p.text()).not.toContain(t('hint_select_device'))
    p.unmount()
  })

  it('已挂载且非 Tauri 时走 Web 分支：出现两个滑块与音频设备下拉', () => {
    const p = mount({ mounted: true, isTauri: false })
    expect(p.container.querySelector('.animate-pulse')).toBeNull()
    expect(p.sliders()).toHaveLength(2)
    expect(p.text()).toContain(t('hint_select_device'))
    p.unmount()
  })

  it('Tauri 端不渲染 Web 的控件，改渲染 Windows 原生音频设置', () => {
    const p = mount({ isTauri: true })
    // Web 专属：设备下拉占位、权限提示、AudioWorklet 开关都不出现
    expect(p.text()).not.toContain(t('hint_select_device'))
    expect(p.text()).not.toContain(t('mic_permission_needed_for_device'))
    expect(p.text()).not.toContain('使用 AudioWorklet')
    // 换成 Windows 原生面板（其独有文案）
    expect(p.text()).toContain('缓冲区大小')
    expect(p.text()).toContain('采样率')
    // MIDI 段与平台无关，仍然渲染
    expect(p.text()).toContain(t('midi_support'))
    p.unmount()
  })
})

describe('增益滑块（单位：百分比）', () => {
  it('范围 0..200、步长 10，值取 Math.round(gain*100)，并显示百分比', () => {
    const p = mount({ inputGain: 1.05 })
    const s = p.sliderByNow(105)!
    expect(s).toBeDefined()
    expect(s.getAttribute('aria-valuemin')).toBe('0')
    expect(s.getAttribute('aria-valuemax')).toBe('200')
    expect(p.text()).toContain('105%')
    p.unmount()
  })

  it('方向键向右回传的是「百分比数组」（不除 100）', () => {
    const onInputGainChange = vi.fn()
    const p = mount({ inputGain: 1, micEnabled: true, onInputGainChange })
    p.key(p.sliderByNow(100)!, 'ArrowRight')
    // step=10 ⇒ 100 → 110，直接透传百分比数组
    expect(onInputGainChange).toHaveBeenCalledWith([110])
    p.unmount()
  })

  it('麦克风未开启时增益滑块禁用，开启后可用', () => {
    const off = mount({ micEnabled: false })
    expect(off.sliderByNow(100)!.hasAttribute('data-disabled')).toBe(true)
    off.unmount()

    const on = mount({ micEnabled: true })
    expect(on.sliderByNow(100)!.hasAttribute('data-disabled')).toBe(false)
    on.unmount()
  })
})

describe('置信度阈值滑块（单位：0..1 小数）', () => {
  it('范围 50..95、步长 5，值取 Math.round(threshold*100)，并显示两位小数', () => {
    const p = mount({ confidenceThreshold: 0.8 })
    const s = p.sliderByNow(80)!
    expect(s).toBeDefined()
    expect(s.getAttribute('aria-valuemin')).toBe('50')
    expect(s.getAttribute('aria-valuemax')).toBe('95')
    expect(p.text()).toContain('0.80')
    p.unmount()
  })

  it('方向键向右回传的是「小数」（除以 100），与增益的单位相反', () => {
    const onConfidenceThresholdChange = vi.fn()
    const p = mount({ confidenceThreshold: 0.8, onConfidenceThresholdChange })
    p.key(p.sliderByNow(80)!, 'ArrowRight')
    // step=5 ⇒ 85 → 0.85
    expect(onConfidenceThresholdChange).toHaveBeenCalledWith(0.85)
    p.unmount()
  })
})

describe('音频输入设备（Web 分支）', () => {
  it('无设备：显示「需要权限检测设备」提示与请求权限按钮', () => {
    const p = mount({ audioDevices: [] })
    expect(p.text()).toContain(t('mic_permission_needed_for_device'))
    expect(p.button(t('request_mic_permission'))).toBeDefined()
    p.unmount()
  })

  it('有设备但全无 label：改用「需要权限显示名称」提示', () => {
    const p = mount({ audioDevices: [device('a'), device('b')] })
    expect(p.text()).toContain(t('mic_permission_needed_for_label'))
    expect(p.text()).not.toContain(t('mic_permission_needed_for_device'))
    p.unmount()
  })

  it('有设备且有 label：不显示权限提示', () => {
    const p = mount({ audioDevices: [device('a', '麦克风 A')] })
    expect(p.text()).not.toContain(t('mic_permission_needed_for_device'))
    expect(p.text()).not.toContain(t('mic_permission_needed_for_label'))
    p.unmount()
  })

  it('设备选项：有名字显示名字，无名字退化显示 Device + id 前 8 位', () => {
    const p = mount({
      audioDevices: [device('aaaabbbbcccc', '麦克风 A'), device('1234567890abcdef', '')],
    })
    p.openCombo(0)
    expect(p.options()).toEqual(['麦克风 A', 'Device 12345678...'])
    p.unmount()
  })

  it('麦克风开关在初始化时禁用并显示「初始化中...」', () => {
    const p = mount({ audioInitializing: true })
    // 开关顺序：反馈音 → 麦克风 → Worklet → MIDI
    expect(p.switches()[1].hasAttribute('data-disabled')).toBe(true)
    expect(p.text()).toContain('初始化中...')
    p.unmount()
  })

  it('麦克风开启时「使用 AudioWorklet」开关禁用（运行中不许改），关闭时可用', () => {
    const on = mount({ micEnabled: true })
    // 开关顺序：反馈音 → 麦克风 → Worklet → MIDI
    expect(on.switches()[2].hasAttribute('data-disabled')).toBe(true)
    on.unmount()

    const off = mount({ micEnabled: false })
    expect(off.switches()[2].hasAttribute('data-disabled')).toBe(false)
    off.unmount()
  })

  it('切换 AudioWorklet 会回传（麦克风开着时开关禁用，故先关掉麦克风）', () => {
    const onUseAudioWorkletChange = vi.fn()
    const p = mount({ micEnabled: false, useAudioWorklet: true, onUseAudioWorkletChange })
    p.click(p.switches()[2])
    expect(onUseAudioWorkletChange).toHaveBeenCalledWith(false)
    p.unmount()
  })

  it('麦克风开启时才显示「当前生效的后端」徽标（关着只留开关文案）', () => {
    const count = (s: string, sub: string) => s.split(sub).length - 1
    // 关着：'AudioWorklet' 只出现在「使用 AudioWorklet」这行标签里
    const off = mount({ micEnabled: false, useAudioWorklet: true })
    expect(count(off.text(), 'AudioWorklet')).toBe(1)
    off.unmount()

    // 开着且 Worklet：多出设备行下方的后端徽标
    const aw = mount({ micEnabled: true, useAudioWorklet: true })
    expect(count(aw.text(), 'AudioWorklet')).toBe(2)
    aw.unmount()

    // 开着但 ScriptProcessor：徽标与提示各一处
    const sp = mount({ micEnabled: true, useAudioWorklet: false })
    expect(count(sp.text(), 'ScriptProcessor')).toBe(2)
    sp.unmount()
  })

  it('初始化中的提示按语言切换', () => {
    const zh = mount({ audioInitializing: true, language: 'zh-CN' })
    expect(zh.text()).toContain('初始化中...')
    zh.unmount()

    const en = mount({ audioInitializing: true, language: 'en' })
    expect(en.text()).toContain('Initializing...')
    en.unmount()
  })

  it('切回 AudioWorklet（false → true）同样写回，且日志里记的是 AudioWorklet', () => {
    // 263 行的三元 `checked ? 'AudioWorklet' : 'ScriptProcessorNode'`：两个方向都得走一遍
    const onUseAudioWorkletChange = vi.fn()
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => { /* 静音 */ })
    // 开关顺序：反馈音 → 麦克风 → Worklet → MIDI
    const p = mount({ useAudioWorklet: false, micEnabled: false, onUseAudioWorkletChange })
    p.click(p.switches()[2])
    expect(onUseAudioWorkletChange).toHaveBeenCalledWith(true)
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('AudioWorklet'))
    debug.mockRestore()
    p.unmount()
  })

  it('audioError 会渲染在错误框里，无错误则不渲染', () => {
    const p = mount({ audioError: '设备被占用' })
    expect(p.text()).toContain('设备被占用')
    p.unmount()

    const clean = mount({ audioError: null })
    expect(clean.text()).not.toContain('设备被占用')
    clean.unmount()
  })

  it('音高算法下拉显示当前算法', () => {
    const p = mount({ pitchAlgorithm: 'solo' })
    // combobox 顺序：音频设备 → 算法 → MIDI
    expect(p.comboboxes()[1].textContent).toContain(t('algorithm_solo'))
    p.unmount()

    const q = mount({ pitchAlgorithm: 'standard' })
    expect(q.comboboxes()[1].textContent).toContain(t('algorithm_standard'))
    q.unmount()
  })

  it('切换音高算法会回传（standard → solo）', () => {
    // ⚠️ radix 对「选中当前值」不触发 onValueChange，所以必须从另一个值出发
    const onPitchAlgorithmChange = vi.fn()
    const p = mount({ pitchAlgorithm: 'standard', onPitchAlgorithmChange })
    p.openCombo(1)
    const opt = [...document.querySelectorAll('[role="option"]')]
      .find((o) => o.textContent?.includes(t('algorithm_solo'))) as HTMLElement
    expect(opt, `选项列表：${p.options().join('|')}`).toBeDefined()
    p.click(opt)
    expect(onPitchAlgorithmChange).toHaveBeenCalledWith('solo')
    p.unmount()
  })
})

describe('请求麦克风权限流程', () => {
  // 下面两条补的是 catch 块里的两个「兜底」：
  //  ① 抛出来的可能压根不是 Error（第三方库常抛字符串/对象）→ 要包成 Error 再判 name；
  //  ② Error 但 message 为空 → 提示文案后面不能拼出 "undefined"。
  // 全局 setup 已把 navigator.mediaDevices 定义成不可重定义的属性，
  // 因此这里只替换它的方法实现，而不是重新定义整个对象。
  const media = navigator.mediaDevices as unknown as {
    getUserMedia: ReturnType<typeof vi.fn>
    enumerateDevices: ReturnType<typeof vi.fn>
  }

  it('浏览器根本没有 mediaDevices → 提示不支持，且不发起任何授权请求', async () => {
    // 换掉整个 navigator（而不是改 mediaDevices 属性：那条是 configurable:false）
    const noMedia = { userAgent: 'jsdom', mediaDevices: undefined }
    vi.stubGlobal('navigator', noMedia)
    try {
      const onRefreshAudioDevices = vi.fn(async () => { /* 空 */ })
      const p = mount({ audioDevices: [], onRefreshAudioDevices })
      await act(async () => { p.click(p.button(t('request_mic_permission'))) })
      expect(toastSpies.error).toHaveBeenCalledWith(t('browser_not_support_audio'))
      // 连「正在请求权限」都没走 —— 说明是在发起 getUserMedia 之前就 return 了
      expect(toastSpies.info).not.toHaveBeenCalled()
      expect(toastSpies.success).not.toHaveBeenCalled()
      expect(onRefreshAudioDevices).not.toHaveBeenCalled()
      p.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  function stubMediaDevices(over: Record<string, unknown> = {}) {
    const track = { stop: vi.fn() }
    media.getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }))
    media.enumerateDevices = vi.fn(async () => [device('a', '麦克风 A')])
    Object.assign(media, over)
    return { track, media }
  }

  it('授权成功且设备有名字：刷新设备列表 + 成功提示', async () => {
    const { track, media: md } = stubMediaDevices()
    const onRefreshAudioDevices = vi.fn(async () => { /* 空 */ })
    const p = mount({ audioDevices: [], onRefreshAudioDevices })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })

    expect(md.getUserMedia).toHaveBeenCalledWith({ audio: true })
    // 拿到流后必须立刻停掉轨道，否则麦克风指示灯常亮
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(onRefreshAudioDevices).toHaveBeenCalledWith(false)
    expect(toastSpies.info).toHaveBeenCalledWith(t('requesting_mic_permission'))
    expect(toastSpies.success).toHaveBeenCalledWith(t('mic_granted_with_label'))
    p.unmount()
  })

  it('授权成功但设备无名字：给出「名称不可用」警告', async () => {
    stubMediaDevices({ enumerateDevices: vi.fn(async () => [device('a', '')]) })
    const p = mount({ audioDevices: [] })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })
    expect(toastSpies.warning).toHaveBeenCalledWith(t('mic_granted_no_label'))
    p.unmount()
  })

  it('授权成功但没有任何输入设备：给出「无输入设备」警告', async () => {
    stubMediaDevices({ enumerateDevices: vi.fn(async () => []) })
    const p = mount({ audioDevices: [] })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })
    expect(toastSpies.warning).toHaveBeenCalledWith(t('mic_no_input_device'))
    p.unmount()
  })

  it('NotAllowedError → 提示权限被拒绝', async () => {
    const err = new Error('denied'); err.name = 'NotAllowedError'
    stubMediaDevices({ getUserMedia: vi.fn(async () => { throw err }) })
    const p = mount({ audioDevices: [] })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })
    expect(toastSpies.error).toHaveBeenCalledWith(t('mic_permission_denied'))
    p.unmount()
  })

  it('NotFoundError → 提示未找到麦克风', async () => {
    const err = new Error('none'); err.name = 'NotFoundError'
    stubMediaDevices({ getUserMedia: vi.fn(async () => { throw err }) })
    const p = mount({ audioDevices: [] })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })
    expect(toastSpies.error).toHaveBeenCalledWith(t('mic_not_found'))
    p.unmount()
  })

  it('其它错误 → 拼接通用提示 + 原始 message', async () => {
    stubMediaDevices({ getUserMedia: vi.fn(async () => { throw new Error('boom') }) })
    const p = mount({ audioDevices: [] })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })
    expect(toastSpies.error).toHaveBeenCalledWith(`${t('mic_generic_error')} boom`)
    p.unmount()
  })

  it('抛的不是 Error 实例 → 先包成 Error（name 变 Error）再走通用提示', async () => {
    stubMediaDevices({ getUserMedia: vi.fn(async () => { throw 'plain rejection' }) })
    const p = mount({ audioDevices: [] })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })
    expect(toastSpies.error).toHaveBeenCalledWith(`${t('mic_generic_error')} plain rejection`)
    p.unmount()
  })

  it('Error 但 message 为空 → 文案退化成「通用提示 + 一个空格」，不会出现 undefined', async () => {
    // ⚠️ 这条用例咬住的是 174 行那条 `instanceof Error` 的**then 分支**（Error 正常路径）
    //    与 180 行 else 的**空 message 分支**。
    //    至于源码里的 `error.message || ''` —— **`|| ''` 是纯冗余**：`error` 已经过
    //    `instanceof Error` 归一，TS 与运行时都保证 `.message` 是 string，`''||''` 与
    //    `'x'||''` 都等于左侧 ⇒ 去掉 `|| ''` 后行为完全等价（变异实测 Failed Tests 0）。
    //    所以「不留 undefined」这条断言其实恒真，真正的护栏是下面那条「非 Error 实例」用例。
    stubMediaDevices({ getUserMedia: vi.fn(async () => { throw new Error('') }) })
    const p = mount({ audioDevices: [] })
    await act(async () => { p.click(p.button(t('request_mic_permission'))); await Promise.resolve() })
    expect(toastSpies.error).toHaveBeenCalledWith(`${t('mic_generic_error')} `)
    expect(toastSpies.error).not.toHaveBeenCalledWith(expect.stringContaining('undefined'))
    p.unmount()
  })
})

describe('MIDI', () => {
  it('MIDI 总开关默认关闭时设备下拉禁用，打开后可用', () => {
    const off = mount({ midiEnabled: false })
    // combobox 顺序：音频设备 → 算法 → MIDI
    expect(off.comboboxes()[2].hasAttribute('data-disabled')).toBe(true)
    off.unmount()

    const on = mount({ midiEnabled: true })
    expect(on.comboboxes()[2].hasAttribute('data-disabled')).toBe(false)
    on.unmount()
  })

  it('切换 MIDI 开关会回调', () => {
    const onMidiEnabledChange = vi.fn()
    const p = mount({ midiEnabled: false, onMidiEnabledChange })
    // 开关顺序：反馈音 → 麦克风 → Worklet → MIDI
    p.click(p.switches()[3])
    expect(onMidiEnabledChange).toHaveBeenCalledWith(true)
    p.unmount()
  })

  it('无设备时显示「未检测到」，有设备时把数量插值进文案', () => {
    const none = mount({ midiDevices: [] })
    expect(none.text()).toContain(t('midi_device_none'))
    none.unmount()

    const some = mount({ midiDevices: [midiInput('1', 'Keystation'), midiInput('2', 'nanoKEY')] })
    const expected = t('midi_device_detected').replace('{count}', '2')
    expect(some.text()).toContain(expected)
    // 插值不能留下未替换的占位符
    expect(some.text()).not.toContain('{count}')
    some.unmount()
  })
})

// ---------------------------------------------------------------------------
// 环境噪声校准（P1）
//
// 这一段 UI 是「主动量一次房间底噪」的唯一入口，契约有三条容易静默写错：
//  ① 它必须只出现在 Web 分支 —— 桌面版走 Rust cpal，Web Audio 的 analyser 不在链路上；
//  ② 未校准时**不能**显示一个假的百分比（那会让用户以为量过了），要显示「未校准」；
//  ③ 门限展示值必须走 onsetGateFromNoiseFloor（底噪 ×1.5），不是竞品的 ×3.2。
// ---------------------------------------------------------------------------
describe('环境噪声校准', () => {
  const START = t('noise_calib_start')
  const RUNNING = t('noise_calib_running')
  const status = (p: ReturnType<typeof mount>) =>
    [...p.container.querySelectorAll('[role="status"]')].map((e) => e.textContent ?? '')

  it('未校准：显示「未校准」，且不显示门限行', () => {
    const p = mount({ noiseFloor: undefined })
    expect(p.text()).toContain(t('device_noise_calibration'))
    expect(p.text()).toContain(t('noise_calib_never'))
    expect(p.text()).not.toContain(t('noise_calib_gate').replace('{gate}', ''))
    p.unmount()
  })

  it('已校准：显示底噪百分比与推导出的门限（底噪 ×1.5）', () => {
    const p = mount({ noiseFloor: 0.004 })
    expect(p.text()).toContain(formatNoisePercent(0.004)) // 0.40%
    const expectedGate = formatNoisePercent(onsetGateFromNoiseFloor(0.004)) // 0.60%
    expect(p.text()).toContain(t('noise_calib_gate').replace('{gate}', expectedGate))
    // 不能是竞品的 ×3.2（0.0128 → 1.28%）
    expect(p.text()).not.toContain(formatNoisePercent(0.004 * 3.2))
    p.unmount()
  })

  it('麦克风关着：按钮禁用，状态行提示「请先开启麦克风」', () => {
    const p = mount({ micEnabled: false })
    const btn = p.button(START)
    expect(btn).toBeDefined()
    expect(btn.disabled).toBe(true)
    expect(status(p)).toContain(t('noise_calib_need_mic'))
    p.unmount()
  })

  it('麦克风开着：按钮可用，点击回调出去（组件不自己跑校准）', () => {
    const onCalibrateNoiseFloor = vi.fn()
    const p = mount({ micEnabled: true, onCalibrateNoiseFloor })
    expect(p.button(START).disabled).toBe(false)
    p.click(p.button(START))
    expect(onCalibrateNoiseFloor).toHaveBeenCalledTimes(1)
    p.unmount()
  })

  it('校准中：按钮变「校准中…」且禁用（防重复点击）', () => {
    const onCalibrateNoiseFloor = vi.fn()
    const p = mount({ micEnabled: true, noiseCalibrating: true, onCalibrateNoiseFloor })
    expect(p.button(RUNNING).disabled).toBe(true)
    expect(p.button(START)).toBeUndefined()
    p.unmount()
  })

  it('倒计时：状态行把 {seconds} 替换成剩余秒数，且不留占位符', () => {
    const p = mount({ micEnabled: true, noiseCalibrating: true, noiseCalibrationCountdown: 3 })
    const lines = status(p)
    expect(lines).toContain(t('noise_calib_countdown').replace('{seconds}', '3'))
    expect(lines.join('|')).not.toContain('{seconds}')
    p.unmount()
  })

  it('采样中：状态行显示「n/50」（总数走 CALIBRATION_SAMPLE_ROUNDS，不是硬编码）', () => {
    const p = mount({ micEnabled: true, noiseCalibrating: true, noiseCalibrationProgress: 12 })
    const expected = t('noise_calib_sampling')
      .replace('{done}', '12')
      .replace('{total}', String(CALIBRATION_SAMPLE_ROUNDS))
    expect(status(p)).toContain(expected)
    expect(status(p).join('|')).not.toContain('{done}')
    p.unmount()
  })

  it('状态行是 aria-live 区域（倒计时/进度一直在变，读屏必须能跟上）', () => {
    const p = mount({ micEnabled: true, noiseCalibrating: true, noiseCalibrationCountdown: 2 })
    const live = [...p.container.querySelectorAll('[aria-live]')]
    expect(live.length).toBeGreaterThan(0)
    expect(live.some((e) => e.getAttribute('aria-live') === 'polite')).toBe(true)
    p.unmount()
  })

  it('只在 Web 分支渲染：未挂载与 Tauri 都不出现校准入口', () => {
    const skeleton = mount({ mounted: false })
    expect(skeleton.text()).not.toContain(t('device_noise_calibration'))
    skeleton.unmount()

    const desktop = mount({ isTauri: true })
    expect(desktop.text()).not.toContain(t('device_noise_calibration'))
    expect(desktop.text()).not.toContain(t('noise_calib_never'))
    desktop.unmount()
  })

  it('英文界面下文案跟着切（所有新键都有 en 译文）', () => {
    // ⚠️ `t` 是外部注入的（测试里默认绑 zh-CN），所以这里必须把英文译器一起传进去，
    //    否则语言切换只改了组件内部写死的字面量、t() 出的文案还是中文 —— 那测不到真实路径。
    const en = TRANSLATIONS['en'] as Record<string, string>
    const tEn = (k: string) => en[k] ?? k
    const p = mount({ t: tEn, language: 'en', micEnabled: true, noiseFloor: 0.004 })
    expect(p.text()).toContain(en['device_noise_calibration'])
    expect(p.text()).toContain(en['noise_calib_start'])
    expect(p.text()).toContain(en['noise_calib_gate'].replace('{gate}', formatNoisePercent(onsetGateFromNoiseFloor(0.004))))
    p.unmount()
  })
})
