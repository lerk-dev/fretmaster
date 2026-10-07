import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// radix Slider 依赖 ResizeObserver（jsdom 无）→ 渲染即抛错
;(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// radix Select 展开时用到的 jsdom 缺口
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

const { mockNative, mockToast } = vi.hoisted(() => ({
  mockNative: {
    getAudioDevices: vi.fn(),
    startAudioCaptureWithBackend: vi.fn(),
    stopAudioCapture: vi.fn(),
    detectPitch: vi.fn(),
    getLatencyMs: vi.fn(),
    getAudioStatus: vi.fn(),
    listenDeviceChanges: vi.fn(),
    unlistenDeviceChanges: vi.fn(),
    // 滤波器/增益接线（三函数必须与真身同形：异步、返回 Promise——
    // 缺一个就是被测路径静默空转，⛔ 铁律 8）
    setNoiseSuppression: vi.fn(),
    setFilters: vi.fn(),
    setGain: vi.fn(),
    setBufferSize: vi.fn(),
    // 采样率接线（2026-10-07 补）：控件原先只写 store、不调它 ⇒ 下拉是装饰品。
    // ⛔ 铁律 8：替身必须与真身同形 —— 少了它，被测路径会**静默空转**（调用
    // undefined 直接抛，或更糟：mock 返回 undefined 让断言看起来还在跑）。
    setSampleRate: vi.fn(),
  },
  mockToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/native-audio', () => ({ nativeAudio: mockNative }))
vi.mock('sonner', () => ({ toast: mockToast }))

import { WindowsAudioSettings } from '@/components/windows-audio-settings'
import { useAppStore } from '@/lib/store'

type AudioState = ReturnType<typeof useAppStore.getState>['audio']
const AUDIO_DEFAULTS: AudioState = { ...useAppStore.getState().audio }

const setAudio = (over: Partial<AudioState> = {}) =>
  act(() => {
    useAppStore.setState({ audio: { ...AUDIO_DEFAULTS, ...over } })
  })

const setUA = (ua: string) =>
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

const containers: HTMLElement[] = []
const roots: Root[] = []

/** 挂载并冲掉 mount effect 里的 await */
async function mount(language: 'zh-CN' | 'en' = 'zh-CN') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(createElement(WindowsAudioSettings as never, { language } as never))
  })
  return container
}

const text = () => document.body.textContent ?? ''
const sliders = () => [...document.querySelectorAll('[role="slider"]')] as HTMLElement[]
/** 输入增益滑块上界 200，噪声抑制上界 100（用 aria-valuemax 区分，避免撞车） */
const gainSlider = () => document.querySelector('[role="slider"][aria-valuemax="200"]') as HTMLElement
const noiseSlider = () => document.querySelector('[role="slider"][aria-valuemax="100"]') as HTMLElement

/** 让动态 promise 链（mockResolvedValue / await）全部落定 */
async function settle(times = 8) {
  for (let i = 0; i < times; i++) await act(async () => { await Promise.resolve() })
}

/** 展开第 idx 个 Select 并选中文本为 label 的选项（radix 要 pointerdown + click 才展开） */
function pickOption(idx: number, label: string) {
  const c = document.querySelectorAll('[role="combobox"]')[idx] as HTMLElement
  expect(c, `第 ${idx} 个 combobox 应存在`).toBeTruthy()
  act(() => {
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === label)
  if (!opt) {
    const actual = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent).join('|')
    throw new Error(`找不到选项 ${label}；实际有：${actual}`)
  }
  act(() => { opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

/** 拖动/键盘改 slider 值（radix Slider 的 thumb 上派 keydown 即可） */
const pressArrow = (el: HTMLElement | null, key: string) => {
  expect(el, '待操作滑块应存在').toBeTruthy()
  act(() => { el!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
}

/** 「启用音频输入」开关（页面里第一个 switch，其余 4 个是滤波器） */
const enableSwitch = () => document.querySelector('button[role="switch"]') as HTMLButtonElement
/** 全部 switch（[0] = 启用音频，[1..4] = 高通/低通/50Hz/60Hz） */
const switches = () => [...document.querySelectorAll('button[role="switch"]')] as HTMLButtonElement[]
/** 第 i 个滤波器开关（0..3 = 高通/低通/50/60） */
const filterSwitch = (i: number) => switches()[i + 1]
/** 点一个 switch 并冲干净的 await 链 */
async function clickFilterSwitch(i: number) {
  const btn = filterSwitch(i)
  expect(btn, `第 ${i} 个滤波器开关应存在`).toBeTruthy()
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  await settle()
}

beforeEach(() => {
  vi.clearAllMocks()
  setUA(MAC_UA)
  useAppStore.setState({ audio: { ...AUDIO_DEFAULTS } })
  mockNative.getAudioDevices.mockResolvedValue([])
  mockNative.listenDeviceChanges.mockResolvedValue(null)
  mockNative.unlistenDeviceChanges.mockReturnValue(undefined)
  mockNative.setNoiseSuppression.mockResolvedValue(undefined)
  mockNative.setFilters.mockResolvedValue(undefined)
  mockNative.setGain.mockResolvedValue(undefined)
  mockNative.setBufferSize.mockResolvedValue(undefined)
})

afterEach(() => {
  act(() => {
    roots.forEach((r) => r.unmount())
  })
  roots.length = 0
  containers.forEach((c) => c.remove())
  containers.length = 0
})

describe('WindowsAudioSettings — 设备与后端', () => {
  it('设备列表加载后自动选中默认设备（用户尚未选择时）', async () => {
    mockNative.getAudioDevices.mockResolvedValue([
      { name: 'Mic B', isDefault: false },
      { name: 'Mic A', isDefault: true },
    ])
    await mount()
    expect(useAppStore.getState().audio.selectedAudioDevice).toBe('Mic A')
  })

  it('已有选择时不覆盖用户的选择', async () => {
    setAudio({ selectedAudioDevice: 'Mic B' })
    mockNative.getAudioDevices.mockResolvedValue([
      { name: 'Mic A', isDefault: true },
      { name: 'Mic B', isDefault: false },
    ])
    await mount()
    expect(useAppStore.getState().audio.selectedAudioDevice).toBe('Mic B')
  })

  it('设备选择行始终渲染（列表容器未展开时也应有 combobox）', async () => {
    await mount()
    expect(document.querySelector('[role="combobox"]')).not.toBeNull()
  })

  it('未选择设备：显示「未选择设备」提示且启用开关被禁用', async () => {
    await mount()
    expect(text()).toContain('未选择设备')
    expect(document.querySelector('button[role="switch"]')).toHaveAttribute('disabled')
  })

  it('已选择设备：启用开关可用', async () => {
    setAudio({ selectedAudioDevice: 'Mic A' })
    await mount()
    expect(document.querySelector('button[role="switch"]')).not.toHaveAttribute('disabled')
  })

  it('加载设备失败 → 弹出错误提示，不崩溃', async () => {
    mockNative.getAudioDevices.mockRejectedValue(new Error('boom'))
    await mount()
    expect(mockToast.error).toHaveBeenCalledWith('加载音频设备失败')
  })

  it('非 Windows：不渲染音频后端区块（WASAPI/ASIO 是 Windows 专属，选了必回退）', async () => {
    setUA(MAC_UA)
    setAudio({ audioBackend: 'asio' })
    await mount()
    expect(text()).not.toContain('音频后端')
    expect(text()).not.toContain('ASIO')
    // 仅设备 / 缓冲区 / 采样率 3 个下拉
    expect(document.querySelectorAll('[role="combobox"]').length).toBe(3)
  })

  it('Windows：渲染音频后端区块，且当前后端文案反映 store 取值', async () => {
    setUA(WIN_UA)
    setAudio({ audioBackend: 'asio' })
    await mount()
    expect(text()).toContain('音频后端')
    expect(text()).toContain('ASIO (最低延迟)')
    expect(document.querySelectorAll('[role="combobox"]').length).toBe(4)
  })
})

describe('WindowsAudioSettings — 性能与滤波器数值显示', () => {
  it('输入增益为 0 时显示 0%（falsy-0 回归：旧实现 `|| 1` 会显示 100%）', async () => {
    setAudio({ inputGain: 0 })
    await mount()
    expect(text()).toContain('0%')
    expect(text()).not.toContain('100%')
    // 滑块也必须在 0，不能是 NaN
    expect(gainSlider().getAttribute('aria-valuenow')).toBe('0')
  })

  it('输入增益 1.5 → 显示 150%，滑块同步到 150', async () => {
    setAudio({ inputGain: 1.5 })
    await mount()
    expect(text()).toContain('150%')
    expect(gainSlider().getAttribute('aria-valuenow')).toBe('150')
  })

  it('输入增益字段缺失（旧持久化数据）时按 100% 兜底，滑块不会是 NaN', async () => {
    act(() => {
      useAppStore.setState({
        audio: { ...AUDIO_DEFAULTS, inputGain: undefined as unknown as number },
      })
    })
    await mount()
    expect(text()).toContain('100%')
    expect(gainSlider().getAttribute('aria-valuenow')).toBe('100')
  })

  it('噪声抑制为 0 时显示 0%（?? 已正确兜底）且滑块为 0', async () => {
    setAudio({ noiseSuppression: 0 })
    await mount()
    expect(text()).toContain('0%')
    expect(noiseSlider().getAttribute('aria-valuenow')).toBe('0')
  })

  it('缓冲区大小与采样率显示 store 取值', async () => {
    setAudio({ bufferSize: 4096, sampleRate: 44100 })
    await mount()
    expect(text()).toContain('4096')
    expect(text()).toContain('44.1kHz')
  })

  it('两个滑块的上界分别是 200（增益）与 100（噪声抑制），共 5 个开关（1 启用 + 4 滤波）', async () => {
    await mount()
    expect(sliders().length).toBe(2)
    expect(document.querySelectorAll('button[role="switch"]').length).toBe(5)
  })
})

describe('WindowsAudioSettings — 采集态与 i18n', () => {
  it('采集中显示延迟文案（micEnabled 即采集态）', async () => {
    setAudio({ selectedAudioDevice: 'Mic A', micEnabled: true })
    await mount()
    expect(text()).toContain('0.0ms')
    expect(text()).toContain('延迟')
  })

  it('未采集时不显示延迟行', async () => {
    setAudio({ selectedAudioDevice: 'Mic A', micEnabled: false })
    await mount()
    expect(text()).not.toContain('0.0ms')
  })

  it('英文界面：所有文案走英文表，且不含任何汉字', async () => {
    setUA(WIN_UA) // 让 Windows 专属的后端区块也一起受检
    await mount('en')
    expect(text()).toContain('Audio Input Device')
    expect(text()).toContain('Audio Backend')
    expect(text()).toContain('Buffer Size')
    expect(text()).not.toMatch(/[\u4e00-\u9fff]/)
  })

  it('中文界面：显示中文标签', async () => {
    await mount('zh-CN')
    expect(text()).toContain('音频输入设备')
    expect(text()).toContain('缓冲区大小')
  })
})

describe('WindowsAudioSettings — 设备热插拔', () => {
  let captured: ((e: unknown) => void) | null = null

  beforeEach(() => {
    captured = null
    mockNative.listenDeviceChanges.mockImplementation((cb: (e: unknown) => void) => {
      captured = cb
      return Promise.resolve(() => {})
    })
  })

  it('当前设备被移除 → 停止采集、弹提示并清空设备选择', async () => {
    setAudio({ selectedAudioDevice: 'Mic A', micEnabled: true })
    await mount()
    expect(captured).not.toBeNull()
    await act(async () => {
      captured!({ devices: [], added: [], removed: ['Mic A'] })
    })
    expect(mockNative.stopAudioCapture).toHaveBeenCalled()
    expect(useAppStore.getState().audio.selectedAudioDevice).toBe('')
    expect(mockToast.error).toHaveBeenCalledWith('当前音频设备已断开，音频输入已停止')
  })

  it('别的设备被移除 → 不停采集、不动当前选择', async () => {
    setAudio({ selectedAudioDevice: 'Mic A', micEnabled: true })
    await mount()
    await act(async () => {
      captured!({ devices: [{ name: 'Mic B', isDefault: false }], added: [], removed: ['Mic B'] })
    })
    expect(mockNative.stopAudioCapture).not.toHaveBeenCalled()
    expect(useAppStore.getState().audio.selectedAudioDevice).toBe('Mic A')
  })

  it('事件带来设备列表且当前无选择 → 自动选中默认设备', async () => {
    await mount()
    await act(async () => {
      captured!({ devices: [{ name: 'Mic Z', isDefault: true }], added: ['Mic Z'], removed: [] })
    })
    expect(useAppStore.getState().audio.selectedAudioDevice).toBe('Mic Z')
  })

  it('组件在监听注册落地前卸载 → 补调用注销函数（监听/定时器泄漏回归）', async () => {
    let resolveListen: (fn: (() => void) | null) => void = () => {}
    mockNative.listenDeviceChanges.mockReturnValue(
      new Promise((r) => {
        resolveListen = r
      }),
    )
    const unlisten = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(WindowsAudioSettings as never, { language: 'zh-CN' } as never))
    })
    act(() => {
      root.unmount()
    })
    await act(async () => {
      resolveListen(unlisten)
    })
    // 旧实现：清理函数被丢弃，Tauri 事件监听器与 Rust device_monitor 会一直挂着
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('正常卸载 → 注销事件订阅与模块级监听', async () => {
    const unlisten = vi.fn()
    mockNative.listenDeviceChanges.mockResolvedValue(unlisten)
    await mount()
    act(() => {
      roots[roots.length - 1].unmount()
    })
    expect(unlisten).toHaveBeenCalledTimes(1)
    expect(mockNative.unlistenDeviceChanges).toHaveBeenCalled()
  })
})

/**
 * 采集开关的完整链路 —— 此前**一次都没点过**这个开关：
 * `startAudio` / `stopAudio` / `toggleAudio` / 50ms 轮询与清理，全部零覆盖。
 *
 * 用假定时器是为了验证「轮询真的按 50ms 跑」和「关闭/卸载后真的停」——
 * 只断言「函数被调过」抓不到定时器泄漏（历史上 Windows 侧就吃过一次这个亏）。
 */
describe('WindowsAudioSettings — 采集开关完整链路', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** 采集链路的最小可用桩：设备已选、三条 native 调用都成功 */
  function primeCapture(over: Partial<AudioState> = {}) {
    setAudio({
      selectedAudioDevice: 'Mic A',
      micEnabled: false,
      sampleRate: 48000,
      audioBackend: 'wasapi_shared',
      ...over,
    })
    mockNative.startAudioCaptureWithBackend.mockResolvedValue(undefined)
    mockNative.stopAudioCapture.mockResolvedValue(undefined)
    mockNative.getAudioStatus.mockResolvedValue({ backend: 'wasapi_shared' })
    mockNative.getLatencyMs.mockResolvedValue(0)
    mockNative.detectPitch.mockResolvedValue(null)
  }

  async function clickSwitch() {
    const btn = enableSwitch()
    expect(btn, '启用音频开关应存在').toBeTruthy()
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    await settle()
  }

  /**
   * 「没有设备就不该能开采集」这件事有**两道防线**：
   *   ① UI：`<Switch disabled={isInitializing || !selectedAudioDevice}>` —— 用户根本点不动；
   *   ② 逻辑：`startAudio` 开头的 `if (!audioSettings.selectedAudioDevice) { toast + return }`。
   * 第 ② 道在**当前 UI 上不可达**（开关的 disabled 与它用的是同一个表达式，同一个渲染闭包），
   * 因此只钉住第 ① 道；②保留为防御（例如将来放开 disabled 改成「点了就提示选设备」）。
   */
  it('未选择设备时开关是禁用态（第一道防线）；强行派发 click 也不会触发任何回调', async () => {
    setAudio({ selectedAudioDevice: '', micEnabled: false })
    await mount()
    const btn = enableSwitch()
    expect(btn.disabled).toBe(true)

    // React 会为 disabled 的 form 元素跳过 mouse 事件（实测 enabled→1 次、disabled→0 次），
    // 所以这里既不该开采集，也不该看到「请先选择音频设备」的兜底提示。
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    await settle()
    expect(mockNative.startAudioCaptureWithBackend).not.toHaveBeenCalled()
    expect(useAppStore.getState().audio.micEnabled).toBe(false)
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  it('开启：按 (设备, 采样率, 后端) 调 native，置 micEnabled、弹成功、并把**实际生效**的后端显示出来', async () => {
    primeCapture({ audioBackend: 'wasapi_exclusive' })
    // 独占失败 → Rust 侧自动回退到共享；界面必须让用户看得见这个回退
    mockNative.getAudioStatus.mockResolvedValue({ backend: 'wasapi_shared' })
    await mount()
    expect(enableSwitch().disabled).toBe(false)

    await clickSwitch()

    expect(mockNative.startAudioCaptureWithBackend).toHaveBeenCalledTimes(1)
    expect(mockNative.startAudioCaptureWithBackend).toHaveBeenCalledWith('Mic A', 48000, 'wasapi_exclusive')
    expect(useAppStore.getState().audio.micEnabled).toBe(true)
    expect(mockToast.success).toHaveBeenCalledWith('音频输入已启用')
    expect(text()).toContain('WASAPI 共享 (兼容)')
    expect(text()).toContain('所选后端不可用，已回退到共享模式')
  })

  it('开启：采样率/后端缺省时用 48000 与 wasapi_shared 兜底', async () => {
    primeCapture({ sampleRate: undefined as unknown as number, audioBackend: undefined as unknown as 'wasapi_shared' })
    await mount()
    await clickSwitch()
    expect(mockNative.startAudioCaptureWithBackend).toHaveBeenCalledWith('Mic A', 48000, 'wasapi_shared')
  })

  it('采集期间每 50ms 拉一次音高与延迟，并渲染到面板', async () => {
    primeCapture()
    mockNative.detectPitch.mockResolvedValue({
      note: 'A',
      octave: 4,
      confidence: { overall: 0.905 },
      volume_db_spl: -18.24,
    } as never)
    mockNative.getLatencyMs.mockResolvedValue(11.23)
    await mount()
    await clickSwitch()

    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(mockNative.detectPitch).toHaveBeenCalled()
    expect(text()).toContain('A4')
    expect(text()).toContain('90.5%')
    expect(text()).toContain('-18.2 dB')
    expect(text()).toContain('11.2ms')

    // 下一拍还要继续拉（不是只拉一次）
    const first = mockNative.detectPitch.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(mockNative.detectPitch.mock.calls.length).toBeGreaterThan(first)
  })

  it('检测不到音高时保留上一次读数（静音一拍不清空面板）', async () => {
    primeCapture()
    // 第一拍检测到，第二拍静音（返回 null）
    mockNative.detectPitch.mockResolvedValueOnce({
      note: 'A', octave: 4, confidence: { overall: 0.9 }, volume_db_spl: -20,
    } as never)
    await mount()
    await clickSwitch()
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(text()).toContain('A4')

    // `if (pitch) setLastPitch(pitch)` ⇒ null 不覆盖，读数留在屏幕上
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(text()).toContain('A4')
  })

  it('关闭：清轮询、调 stopAudioCapture、micEnabled=false、清掉音高与后端并弹提示', async () => {
    primeCapture()
    mockNative.detectPitch.mockResolvedValue({
      note: 'A', octave: 4, confidence: { overall: 0.9 }, volume_db_spl: -20,
    } as never)
    mockNative.getLatencyMs.mockResolvedValue(2)
    await mount()

    await clickSwitch()
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(text()).toContain('A4')

    await clickSwitch()
    expect(mockNative.stopAudioCapture).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().audio.micEnabled).toBe(false)
    expect(mockToast.success).toHaveBeenCalledWith('音频输入已停止')
    expect(text()).not.toContain('A4')

    // 关键：关闭后定时器必须真的清掉，不能继续每 50ms 发 IPC
    const before = mockNative.detectPitch.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(mockNative.detectPitch.mock.calls.length, '关闭后不该继续轮询').toBe(before)
  })

  it('采集中卸载 → 清掉轮询定时器', async () => {
    primeCapture()
    await mount()
    await clickSwitch()
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })

    const before = mockNative.detectPitch.mock.calls.length
    act(() => { roots[roots.length - 1].unmount() })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(mockNative.detectPitch.mock.calls.length, '卸载后不该继续轮询').toBe(before)
  })

  it('轮询里检测失败 → console.error 兜底，轮询不中断', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    primeCapture()
    mockNative.detectPitch.mockRejectedValue(new Error('pitch boom'))
    await mount()
    await clickSwitch()
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })

    expect(errSpy.mock.calls.map((c) => String(c[0]))).toContain('Pitch detection error:')
    const before = mockNative.detectPitch.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(mockNative.detectPitch.mock.calls.length, '单次失败不该掐断轮询').toBeGreaterThan(before)
    errSpy.mockRestore()
  })

  it('开启失败 → toast.error，micEnabled 保持 false，开关回到可用（isInitializing 已复位）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    primeCapture()
    mockNative.startAudioCaptureWithBackend.mockRejectedValue(new Error('device busy'))
    await mount()
    await clickSwitch()

    expect(useAppStore.getState().audio.micEnabled).toBe(false)
    expect(mockToast.error).toHaveBeenCalledWith('启动音频失败: Error: device busy')
    expect(text()).not.toContain('音频输入已启用')
    expect(enableSwitch().disabled, '失败后必须能再试一次').toBe(false)
    errSpy.mockRestore()
  })

  /**
   * ⚠️ 钉住现状（不是断言「正确」）：`stopAudio` 里 `setMicEnabled(false)` 排在
   * `await nativeAudio.stopAudioCapture()` **之后**，所以停止失败时：
   * 定时器已清、命令已发出，但 `micEnabled` 仍是 true ⇒ 界面继续显示「采集态」，
   * 延迟数字冻结不再更新。要不要改成「先落状态再发命令」属产品决策，这里只钉住行为。
   */
  it('停止失败 → console.error 兜底；但 micEnabled 仍是 true（状态与界面漂移，现状）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    primeCapture()
    mockNative.stopAudioCapture.mockRejectedValue(new Error('stop boom'))
    await mount()
    await clickSwitch()   // 开
    await clickSwitch()   // 关 → 失败

    expect(errSpy.mock.calls.map((c) => String(c[0]))).toContain('Failed to stop audio:')
    expect(useAppStore.getState().audio.micEnabled, '现状：停止失败也不回滚采集态').toBe(true)
    errSpy.mockRestore()
  })
})

/**
 * 五个「性能 / 滤波器」控件的回调 —— 与 store 的接线此前零覆盖。
 * 缓冲区与采样率是**字符串 → 数字**的转换点（写错就是静默失效：下拉能选、值没落库）。
 */
describe('WindowsAudioSettings — 性能与滤波器控件写回 store', () => {
  it('音频后端下拉 → setAudioBackend', async () => {
    setUA(WIN_UA)
    await mount()
    // 非 Windows 下这里是 [设备, 后端, 缓冲区, 采样率] 的第 1 个
    pickOption(1, 'ASIO (最低延迟)')
    expect(useAppStore.getState().audio.audioBackend).toBe('asio')
  })

  it('缓冲区下拉 → setBufferSize（字符串转数字，且落在白名单里）', async () => {
    await mount()
    // MAC UA ⇒ 没有后端下拉：[设备, 缓冲区, 采样率]
    pickOption(1, '512 (低延迟)')
    expect(useAppStore.getState().audio.bufferSize).toBe(512)
  })

  it('采样率下拉 → setSampleRate（字符串转数字）', async () => {
    await mount()
    pickOption(2, '96 kHz')
    expect(useAppStore.getState().audio.sampleRate).toBe(96000)
    // ⛔ 铁律 22：只写 store 不算到位，必须真的送达后端。
    // 2026-10-07 前这里零调用 ⇒ 桌面端改采样率毫无效果（对照组 bufferSize 一直是好的）。
    expect(mockNative.setSampleRate).toHaveBeenCalledWith(96000)
  })

  it('噪声抑制滑块 → setNoiseSuppression', async () => {
    setAudio({ noiseSuppression: 70 })
    await mount()
    pressArrow(noiseSlider(), 'ArrowRight')
    expect(useAppStore.getState().audio.noiseSuppression).toBe(80)
  })

  it('输入增益滑块 → setInputGain（面板是百分比，落库要 ÷100）', async () => {
    setAudio({ inputGain: 1 })
    await mount()
    pressArrow(gainSlider(), 'ArrowRight')
    expect(useAppStore.getState().audio.inputGain).toBeCloseTo(1.1, 6)
  })
})

/**
 * 「滤波器设置」整节的 6 个控件 —— 此前是**装饰品**：只写 store，
 * `lib/native-audio.ts` 的 `setNoiseSuppression` / `setFilters` / `setGain` 三个函数
 * 全仓零调用方 ⇒ 用户拖了滑块、拨了开关，Rust 侧压根收不到（拖了没反应且零报错，
 * ⛔ 铁律 22）。本组钉住「控件 → nativeAudio」这层接线：store 照旧落地 +
 * 后端收到**具体参数**（参数抄错=静默失效，必须断言实参而不是「函数被调过」）。
 */
describe('WindowsAudioSettings — 滤波器/增益控件必须同时到达后端（接线）', () => {
  it('噪声抑制滑块 → setNoiseSuppression(新值)', async () => {
    setAudio({ noiseSuppression: 70 })
    await mount()
    pressArrow(noiseSlider(), 'ArrowRight')
    expect(useAppStore.getState().audio.noiseSuppression).toBe(80)
    expect(mockNative.setNoiseSuppression).toHaveBeenCalledWith(80)
  })

  it('输入增益滑块 → setGain(倍率=百分比÷100)', async () => {
    setAudio({ inputGain: 1 })
    await mount()
    pressArrow(gainSlider(), 'ArrowRight')
    expect(mockNative.setGain).toHaveBeenCalledWith(1.1)
  })

  it('高通开关拨到「关」→ setFilters 收到**全量 4 开关**（本次改动 + 其余当前值）', async () => {
    // store 默认：高通开/低通开/50Hz 开/60Hz 关
    await mount()
    await clickFilterSwitch(0)
    expect(useAppStore.getState().audio.enableHighPass).toBe(false)
    expect(mockNative.setFilters).toHaveBeenCalledWith({
      highPass: false, lowPass: true, notch50: true, notch60: false,
    })
  })

  it('低通开关拨到「关」→ 改的是 lowPass 字段（防四个开关抄同一份）', async () => {
    await mount()
    await clickFilterSwitch(1)
    expect(useAppStore.getState().audio.enableLowPass).toBe(false)
    expect(mockNative.setFilters).toHaveBeenCalledWith({
      highPass: true, lowPass: false, notch50: true, notch60: false,
    })
  })

  it('50Hz 陷波拨到「关」→ 改的是 notch50 字段', async () => {
    await mount()
    await clickFilterSwitch(2)
    expect(useAppStore.getState().audio.enableNotch50).toBe(false)
    expect(mockNative.setFilters).toHaveBeenCalledWith({
      highPass: true, lowPass: true, notch50: false, notch60: false,
    })
  })

  it('60Hz 陷波拨到「开」→ 改的是 notch60 字段（默认关，点开）', async () => {
    await mount()
    await clickFilterSwitch(3)
    expect(useAppStore.getState().audio.enableNotch60).toBe(true)
    expect(mockNative.setFilters).toHaveBeenCalledWith({
      highPass: true, lowPass: true, notch50: true, notch60: true,
    })
  })

  it('旧持久化缺字段：推送的是**兜底后的布尔**，4 个字段一个不少（undefined 会被 invoke 丢字段 ⇒ 静默失效）', async () => {
    setAudio({
      enableHighPass: undefined as unknown as boolean,
      enableLowPass: undefined as unknown as boolean,
      enableNotch50: undefined as unknown as boolean,
      enableNotch60: undefined as unknown as boolean,
    })
    await mount()
    await clickFilterSwitch(0) // 高通显示兜底值「开」→ 点后 false
    const arg = mockNative.setFilters.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(arg).toEqual({ highPass: false, lowPass: true, notch50: true, notch60: false })
    // 显式类型断言：四个字段必须都是 boolean（不许 undefined / 缺字段）
    for (const k of ['highPass', 'lowPass', 'notch50', 'notch60']) {
      expect(typeof arg[k], `${k} 必须是 boolean，实际 ${typeof arg[k]}`).toBe('boolean')
    }
  })

  it('缓冲区下拉 → setBufferSize 同时到达**后端**（此前只写 store，Rust 侧永不知情 ⇒ 下拉是装饰品）', async () => {
    // MAC UA ⇒ 没有后端下拉：[设备, 缓冲区, 采样率]
    await mount()
    pickOption(1, '4096 (稳定)')
    expect(useAppStore.getState().audio.bufferSize).toBe(4096)
    expect(mockNative.setBufferSize).toHaveBeenCalledWith(4096)
  })

  it('旧持久化缺 bufferSize：显示兜底 2048（不再是空白），改动后推送合法数字', async () => {
    setAudio({ bufferSize: undefined as unknown as number })
    await mount()
    // MAC UA：[设备, 缓冲区, 采样率] —— 第 1 个 combobox 显示当前选中值
    const combos = [...document.querySelectorAll('[role="combobox"]')]
    expect(combos[1].textContent).toContain('2048')
    pickOption(1, '512 (低延迟)')
    expect(mockNative.setBufferSize).toHaveBeenCalledWith(512)
    expect(typeof mockNative.setBufferSize.mock.calls.at(-1)![0], '推给后端的必须是 number').toBe('number')
  })

  it('持久化里是非法值（999）：显示回落 2048，不停在无匹配项的空白态', async () => {
    // 旧盘数据绕过 store.setBufferSize 的白名单直接恢复 ⇒ 界面层必须自己兑底
    setAudio({ bufferSize: 999 as unknown as number })
    await mount()
    const combos = [...document.querySelectorAll('[role="combobox"]')]
    expect(combos[1].textContent).toContain('2048')
  })
})
