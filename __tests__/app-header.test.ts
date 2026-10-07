/**
 * components/app-header.tsx 的契约测试（此前零测试）。
 *
 * 顶栏聚合组件：品牌 + 三块状态显示（得分 / 计时 / 检测音高）+ 快捷键入口 +
 * TunerSheet + 设置抽屉（Sheet，radix portal 渲染到 document.body）。
 *
 * 最有价值的契约是**检测音高的音分颜色分档**（≤15 绿 / ≤35 黄 / 其它红）——
 * 这是调音的核心反馈，边界错一档用户就以为调准了；以及**正负号**（负数无 +、
 * 0 显示 +0）。得分百分比 70% 的档位边界与「练习中才显示」同样值得钉住。
 *
 * store 状态用 useAppStore.setState 直接驱动；Sheet 内容走 portal，
 * 断言要查 document.body 而不是组件容器。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AppHeader } from '@/components/app-header'
import { useAppStore } from '@/lib/store'
import { VERSION, BUILD_DATE_LOCAL } from '@/lib/version'
import { TRANSLATIONS } from '@/lib/i18n'

/**
 * 设置抽屉里那 8 个接线回调（`onInstrumentChange` / `onMicToggle` / `onSelectLanguage` …）
 * 此前**一次都没被调用过**（函数覆盖仅 46.7%）。它们本身没有 UI，是 AppHeader 传给
 * 各 Settings*Section 的 props ⇒ 直接在 DOM 里驱动要展开 4 个 Accordion 段、再操作
 * Select/Switch/Slider，成本高且脆。
 *
 * 这里改用**分层测法**：mock 掉 4 个 Section，捕获 AppHeader 交给它们的 props，
 * 然后直接调用回调、断言 store 落点。子组件的「UI → 回调」由各组件自己的契约测试覆盖
 * （如 `settings-display-section` 的 25 按钮矩阵），本文件只钉**接线**。
 */
// makeStub 必须来自 vi.hoisted：vi.mock 的工厂会被提升到文件顶部执行，
// 那时模块顶层的普通 const 还在 TDZ（实测会报 "Cannot access ... before initialization"）。
const { captured, makeStub } = vi.hoisted(() => {
  const captured: Record<string, Record<string, unknown>> = {}
  const makeStub = (exportName: string, key: string) => () => ({
    [exportName]: (props: Record<string, unknown>) => {
      captured[key] = props
      return null
    },
  })
  return { captured, makeStub }
})

vi.mock('@/components/settings-practice-section', makeStub('SettingsPracticeSection', 'practice'))
vi.mock('@/components/settings-metronome-section', makeStub('SettingsMetronomeSection', 'metronome'))
vi.mock('@/components/settings-audio-section', makeStub('SettingsAudioSection', 'audio'))
vi.mock('@/components/settings-display-section', makeStub('SettingsDisplaySection', 'display'))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// radix Slider（设置面板里大量使用）依赖 ResizeObserver，jsdom 没有 ——
// 缺了它 Sheet 内容会抛错、被 ErrorBoundary 兜底成「出现了一些问题」，
// 后面的 Accordion（含版本号行）根本不渲染。这是环境能力问题，不是组件缺陷。
class ResizeObserverStub {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub

function noop() { /* 空回调 */ }

function render(props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(AppHeader as never, {
      t,
      formatTime: fmt,
      timeLeft: 0,
      mounted: true,
      isTauri: false,
      detectedNote: '',
      detectedFrequency: 0,
      cents: 0,
      tunerActive: false,
      tunerOpen: false,
      onTunerOpenChange: noop,
      toggleTuner: noop,
      handleReferenceFrequencyChange: noop,
      onShowShortcutsHelpChange: noop,
      midiEnabled: false,
      onMidiEnabledChange: noop,
      midiDevices: [],
      selectedMidiDevice: '',
      onSelectedMidiDeviceChange: noop,
      useAudioWorklet: false,
      onUseAudioWorkletChange: noop,
      enumerateAudioDevices: vi.fn(async () => {}),
      stopAudioInput: noop,
      handlePracticeTimeChange: noop,
      handleFretCountChange: noop,
      handleCooldownDurationChange: noop,
      handleMetronomeBpmChange: noop,
      handleInputGainChange: noop,
      saveSettings: noop,
      resetSettings: noop,
      exportSettings: noop,
      importSettings: noop,
      ...props,
    } as never))
  })
  return {
    /** 组件容器（不含 portal） */
    container,
    /** 全文档（含 Sheet 的 portal 内容） */
    all: () => document.body,
    text: () => container.textContent ?? '',
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

/** 设置练习中的得分 */
function setScore(correct: number, total: number) {
  act(() => { useAppStore.setState({ isPlaying: true, score: { correct, total } }) })
}

beforeEach(() => {
  useAppStore.setState({
    isPlaying: false,
    score: { correct: 0, total: 0 },
    detectedPitch: null,
    detectedCents: null,
    settingsOpen: false,
  })
})
afterEach(() => {
  useAppStore.setState({ isPlaying: false, score: { correct: 0, total: 0 }, detectedPitch: null, detectedCents: null })
  useAppStore.setState({ settingsOpen: false })
})

describe('得分显示', () => {
  it('练习中显示 correct/total 与百分比', () => {
    setScore(7, 10)
    const p = render()
    expect(p.text()).toContain('7/10')
    expect(p.text()).toContain('70%')
    p.unmount()
  })

  it('total=0 时不显示百分比徽章', () => {
    setScore(0, 0)
    const p = render()
    expect(p.text()).toContain('0/0')
    expect(p.text()).not.toContain('%')
    p.unmount()
  })

  it('≥70% 与 <70% 的徽章样式不同（档位边界 7/10 与 6/10）', () => {
    setScore(7, 10)
    const good = render()
    const goodPct = [...good.container.querySelectorAll('span,div')]
      .find((e) => e.textContent === '70%')!
    good.unmount()

    useAppStore.setState({ score: { correct: 6, total: 10 } })
    const bad = render()
    const badPct = [...bad.container.querySelectorAll('span,div')]
      .find((e) => e.textContent === '60%')!
    expect(goodPct.className).not.toBe(badPct.className)
    bad.unmount()
  })

  it('未练习时不显示得分', () => {
    useAppStore.setState({ isPlaying: false, score: { correct: 7, total: 10 } })
    const p = render()
    expect(p.text()).not.toContain('7/10')
    p.unmount()
  })
})

describe('计时显示', () => {
  it('练习中且 practiceTime>0 时显示剩余时间', () => {
    useAppStore.setState({ isPlaying: true })
    act(() => { useAppStore.getState().setPracticeTime(5) })
    const p = render({ timeLeft: 125 })
    expect(p.text()).toContain('2:05')
    p.unmount()
  })

  it('practiceTime=0（不限时）不显示计时', () => {
    useAppStore.setState({ isPlaying: true })
    act(() => { useAppStore.getState().setPracticeTime(0) })
    const p = render({ timeLeft: 125 })
    expect(p.text()).not.toContain('2:05')
    p.unmount()
  })
})

describe('检测音高与音分颜色分档', () => {
  function centsBadge(cents: number | null) {
    useAppStore.setState({ detectedPitch: 'A4', detectedCents: cents })
    const p = render()
    const label = cents === null ? '' : `${cents < 0 ? '' : '+'}${cents.toFixed(0)}¢`
    const badge = [...p.container.querySelectorAll('span,div')]
      .find((e) => e.textContent === label)
    p.unmount()
    return badge
  }

  it('音分 ≤15 绿色（边界 15 绿 / 16 黄）', () => {
    expect(centsBadge(15)!.className).toContain('bg-green-500/20')
    expect(centsBadge(16)!.className).toContain('bg-amber-500/20')
  })

  it('音分 ≤35 黄色（边界 35 黄 / 36 红）', () => {
    expect(centsBadge(35)!.className).toContain('bg-amber-500/20')
    expect(centsBadge(36)!.className).toContain('bg-red-500/20')
  })

  it('负音分不带 + 号；0 显示 +0¢', () => {
    const neg = centsBadge(-5)!
    expect(neg.textContent).toBe('-5¢')
    expect(neg.className).toContain('bg-green-500/20')
    expect(centsBadge(0)!.textContent).toBe('+0¢')
  })

  it('detectedCents=null 时不显示音分徽章（只有音名）', () => {
    useAppStore.setState({ detectedPitch: 'A4', detectedCents: null })
    const p = render()
    expect(p.text()).toContain('A4')
    expect(p.text()).not.toContain('¢')
    p.unmount()
  })

  it('未检测到音高时整块不渲染', () => {
    useAppStore.setState({ detectedPitch: null })
    const p = render()
    expect(p.text()).not.toContain('¢')
    p.unmount()
  })
})

describe('入口与设置抽屉', () => {
  it('快捷键按钮回传 true', () => {
    const spy = vi.fn()
    const p = render({ onShowShortcutsHelpChange: spy })
    p.buttons().find((b) => b.getAttribute('aria-label') === t('keyboard_shortcuts'))!.click()
    expect(spy).toHaveBeenCalledWith(true)
    p.unmount()
  })

  it('settingsOpen=false 时抽屉内容不渲染', () => {
    useAppStore.setState({ settingsOpen: false })
    const p = render()
    expect(p.all().textContent).not.toContain('Build')
    p.unmount()
  })

  it('settingsOpen=true 时抽屉渲染（portal 到 body），含版本号', () => {
    useAppStore.setState({ settingsOpen: true })
    const p = render()
    expect(p.all().textContent).toContain(`v${VERSION} (${BUILD_DATE_LOCAL})`)
    p.unmount()
  })

  it('关闭抽屉后 portal 内容移除', () => {
    useAppStore.setState({ settingsOpen: true })
    const p = render()
    expect(p.all().textContent).toContain('Build')
    act(() => { useAppStore.setState({ settingsOpen: false }) })
    expect(p.all().textContent).not.toContain(`v${VERSION} (${BUILD_DATE_LOCAL})`)
    p.unmount()
  })
})

const tEn = (k: string) => (TRANSLATIONS['en'] as Record<string, string>)[k] ?? k

describe('无障碍标签（2026-09-26 修复：此前硬编码中文）', () => {
  it('得分区 aria-label 走 t() 并跟随语言', () => {
    act(() => {
      useAppStore.setState({ isPlaying: true, score: { correct: 3, total: 4 } })
    })
    const zh = render()
    const zhLabel = [...zh.container.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label'))
      .find((v) => v?.includes('得分'))!
    expect(zhLabel).toBe(t('score_aria_label').replace('{correct}', '3').replace('{total}', '4'))
    expect(zhLabel).toBe('得分 3 / 4')
    zh.unmount()

    const en = render({ t: tEn })
    expect(
      [...en.container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')),
    ).toContain('Score 3 / 4')
    en.unmount()
  })

  it('计时区 aria-label 走 t() 并跟随语言', () => {
    // 与「计时显示」组同款写法：practiceTime 用 store 的 action 设置
    useAppStore.setState({ isPlaying: true })
    act(() => { useAppStore.getState().setPracticeTime(5) })
    const zh = render({ timeLeft: 125 })
    const labels = [...zh.container.querySelectorAll('[aria-label]')].map((e) =>
      e.getAttribute('aria-label'),
    )
    expect(labels).toContain(t('time_left_aria_label').replace('{time}', fmt(125)))
    expect(labels).toContain('剩余时间 2:05')
    zh.unmount()

    const en = render({ t: tEn, timeLeft: 125 })
    expect(
      [...en.container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')),
    ).toContain('Time remaining 2:05')
    en.unmount()
  })
})

/**
 * 设置抽屉的**接线**：AppHeader 把哪些回调交给各 Settings*Section、回调最终写到 store 的哪。
 * 这些回调此前一次都没被调用过（函数覆盖 46.7%）——「改了设置不落库」完全测不出来。
 * 见文件头注释：子组件用 mock 捕获 props，本组只钉接线，不重复测子组件的 UI。
 */
describe('设置抽屉的接线（回调 → store 落点）', () => {
  const SLICES = ['user', 'practice', 'metronome', 'audio', 'focusMode'] as const
  let snapshot: Record<string, unknown>

  beforeEach(() => {
    const s = useAppStore.getState() as unknown as Record<string, unknown>
    snapshot = Object.fromEntries(SLICES.map((k) => [k, s[k]]))
  })
  afterEach(() => {
    act(() => { useAppStore.setState(snapshot) })
  })

  /** 打开抽屉（Sheet content 才会 mount），拿到 AppHeader 交给各 Section 的 props */
  function openSettings(props: Record<string, unknown> = {}) {
    act(() => { useAppStore.setState({ settingsOpen: true }) })
    return render(props)
  }

  /** 直接调用被捕获的回调（内部会写 store ⇒ 包 act） */
  function call(group: string, name: string, ...args: unknown[]) {
    const fn = captured[group]?.[name]
    expect(fn, `AppHeader 应把 ${group}.${name} 传给对应 Section`).toBeTypeOf('function')
    act(() => { (fn as (...a: unknown[]) => void)(...args) })
  }

  it('改乐器 → 落 store.user.instrument', () => {
    const p = openSettings()
    call('practice', 'onInstrumentChange', 'seven_string_guitar')
    expect(useAppStore.getState().user.instrument).toBe('seven_string_guitar')
    p.unmount()
  })

  it('5 品区起点与宽度 → 落 store.practice.fretZone*', () => {
    const p = openSettings()
    call('practice', 'onFretZoneStartChange', 4)
    call('practice', 'onFretZoneSizeChange', 7)
    const pr = useAppStore.getState().practice
    expect(pr.fretZoneStart).toBe(4)
    expect(pr.fretZoneSize).toBe(7)
    p.unmount()
  })

  it('节拍器「可视化」→ visualize 落库，同 slice 的其它字段不受影响', () => {
    // ⚠️ 这条断言的是 store 的**最终结果**，因此「把 AppHeader 里的
    // `{ ...metronomeSettings, visualize: v }` 去掉 spread」是**行为等价变异**（实测咬 0 条）：
    // store 的 setMetronomeSettings 自身就是 `{ ...state.metronome, ...settings }` 浅合并
    // （lib/store.ts:858），外层那个 spread 属冗余防御 —— 不是缺陷，也别指望这条用例能咬住它。
    act(() => { useAppStore.getState().setMetronomeSettings({ bpm: 111 }) })
    const p = openSettings()
    call('metronome', 'onVisualizeChange', true)
    const m = useAppStore.getState().metronome
    expect(m.visualize).toBe(true)
    expect(m.bpm).toBe(111)
    p.unmount()
  })

  it('开麦克风：micEnabled=true 且不调 stopAudioInput；关：=false 并调一次 stopAudioInput', () => {
    const stopAudioInput = vi.fn()
    const p = openSettings({ stopAudioInput })
    call('audio', 'onMicToggle', true)
    expect(useAppStore.getState().audio.micEnabled).toBe(true)
    expect(stopAudioInput, '开启时不该去停音频').not.toHaveBeenCalled()

    call('audio', 'onMicToggle', false)
    expect(useAppStore.getState().audio.micEnabled).toBe(false)
    expect(stopAudioInput).toHaveBeenCalledTimes(1)
    p.unmount()
  })

  it('音高算法 → 落 store.audio.pitchAlgorithm', () => {
    const p = openSettings()
    call('audio', 'onPitchAlgorithmChange', 'standard')
    expect(useAppStore.getState().audio.pitchAlgorithm).toBe('standard')
    p.unmount()
  })

  it('环境噪声校准：回调透传到 audio 段，且校准状态另外 3 个字段一起传下去', () => {
    // 这 4 个 prop 是 page.tsx 的本地 state/回调，**不经过 store** ⇒
    // AppHeader 漏传任何一个，设置面板里就会永远显示「未校准 / 按钮点不动」，且不报错。
    const onCalibrateNoiseFloor = vi.fn()
    const p = openSettings({
      noiseFloor: 0.004,
      noiseCalibrating: true,
      noiseCalibrationCountdown: 2,
      noiseCalibrationProgress: null,
      onCalibrateNoiseFloor,
    })
    call('audio', 'onCalibrateNoiseFloor')
    expect(onCalibrateNoiseFloor).toHaveBeenCalledTimes(1)

    const props = captured['audio'] as Record<string, unknown>
    expect(props.noiseFloor).toBe(0.004)
    expect(props.noiseCalibrating).toBe(true)
    expect(props.noiseCalibrationCountdown).toBe(2)
    expect(props.noiseCalibrationProgress).toBeNull()
    p.unmount()
  })

  it('全屏模式 → 落 store.focusMode.fullscreenMode', () => {
    const p = openSettings()
    call('display', 'onFullscreenModeChange', 'fullscreen')
    expect(useAppStore.getState().focusMode.fullscreenMode).toBe('fullscreen')
    p.unmount()
  })

  it('切语言：language 与 chordScaleDisplay **必须一起变**（否则和弦名和界面语言不一致）', () => {
    const p = openSettings()
    call('display', 'onSelectLanguage', 'en')
    expect(useAppStore.getState().user.language).toBe('en')
    expect(useAppStore.getState().user.chordScaleDisplay).toBe('english')

    call('display', 'onSelectLanguage', 'zh-CN')
    expect(useAppStore.getState().user.language).toBe('zh-CN')
    expect(useAppStore.getState().user.chordScaleDisplay).toBe('chinese')
    p.unmount()
  })
})
