/**
 * components/debug-panel.tsx 的契约测试（此前零测试）。
 *
 * 桌面端（Tauri）的音频调试浮窗：右下角圆钮 → 展开面板 → 每 500ms 拉一次
 * `detect_pitch / get_audio_status / get_audio_level` 并渲染。
 *
 * 契约重点：
 *  ① **Web 环境必须返回 null**（`isTauriEnv()` 为假时整个面板不渲染）——
 *     这是它能在生产 Web 版里安全存在的前提；
 *  ② 三种形态切换：圆钮 → 面板（展开）→ 面板（最小化）。折叠头是 role=button +
 *     aria-expanded，支持 Enter/Space；关闭按钮要 `stopPropagation`
 *     （否则会连带把「最小化」也切一次）；
 *  ③ **只在「可见且未最小化」时轮询**：最小化/关闭后必须停表（clearInterval），
 *     否则面板关了还在后台每 500ms 调三次 Tauri IPC；
 *  ④ 三条 IPC 各自独立 catch：某条失败只是该段显示兜底值，整块不能崩；
 *  ⑤ 渲染细节：音符只在 octave>0 时拼八度、cents 带符号、置信度条宽 `min(100, v*100)`
 *     且百分比保留 1 位、dB 条宽 `(db+96)/96` 并夹到 0..100、RMS 小于 0.001 时用科学计数法、
 *     设备名超 30 字截断、频率历史只留 60 点；
 *  ⑥ 波形图：历史 < 2 点不渲染 SVG，之后每个点一个坐标。
 *
 * ⚠️ `DebugPanel` 用 `isTauriEnv()` 做门禁（看 `window.__TAURI__`），
 *    所以测试里把它设上才能渲染到内部面板。
 * ⚠️ 内部 `invoke` 是 `await import('@tauri-apps/api/core')` 动态引入的，用 vi.mock 拦。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DebugPanel } from '@/components/debug-panel'
import { useAppStore } from '@/lib/store'

const tauri = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

interface PitchFixture {
  note: string
  octave: number
  frequency: number
  cents: number
  confidence: { yin: number; harmonic: number; temporal: number; overall: number }
}
interface StatusFixture { isCapturing: boolean; latencyMs: number; bufferSize: number; sampleRate: number }
interface LevelFixture { rms: number; db_spl: number; peak: number; is_voiced: boolean; noise_floor: number; snr_db: number }

let pitch: PitchFixture | null = null
let status: StatusFixture | null = null
let level: LevelFixture | null = null
let failures = new Set<string>()

function installInvoke() {
  tauri.invoke.mockImplementation(async (cmd: string) => {
    if (failures.has(cmd)) throw new Error(`IPC fail: ${cmd}`)
    if (cmd === 'detect_pitch') return pitch
    if (cmd === 'get_audio_status') return status ?? { isCapturing: false, latencyMs: 0, bufferSize: 0, sampleRate: 48000 }
    if (cmd === 'get_audio_level') return level
    throw new Error(`unknown command ${cmd}`)
  })
}

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(DebugPanel as never, null as never)) })
  // DebugPanel 的 Tauri 判定在 effect 里，需要再冲一次
  act(() => { /* flush effect */ })

  const buttonByLabel = (s: string) => container.querySelector(`[aria-label="${s}"]`) as HTMLElement | null
  const header = () => buttonByLabel('Toggle debug panel')
  const text = () => container.textContent ?? ''
  /** 读「标签 → 值」行：面板里大量成对 span，label 精确匹配后取同一容器的第二个 span */
  const rowValue = (label: string): string | undefined => {
    const spans = [...container.querySelectorAll('span')]
    const hit = spans.find((s) => s.textContent === label)
    if (!hit) return undefined
    return hit.parentElement?.querySelectorAll('span')[1]?.textContent ?? undefined
  }
  return {
    container,
    text,
    rowValue,
    header,
    buttonByLabel,
    circle: () => buttonByLabel('Open debug panel'),
    closeButton: () => buttonByLabel('Close debug panel'),
    click(el: HTMLElement | null) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    key(el: HTMLElement | null, k: string) {
      act(() => { el?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
    },
    polylinePoints: () => {
      const pl = container.querySelector('polyline')
      return pl ? (pl.getAttribute('points') ?? '').trim().split(/\s+/) : null
    },
    /** 取某一行进度条的宽度百分比（RMS / dB / 置信度都适用） */
    barWidth(label: string): number {
      const hit = [...container.querySelectorAll('span')].find((s) => s.textContent === label)
      const fill = hit?.parentElement?.querySelector('.h-full.rounded-full') as HTMLElement | undefined
      const w = /width:\s*([-\d.]+)%/.exec(fill?.getAttribute('style') ?? '')
      return w ? parseFloat(w[1]) : NaN
    },
    /** 推进 n 次 500ms 轮询 */
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
  tauri.invoke.mockReset()
  installInvoke()
  pitch = null
  status = null
  level = null
  failures = new Set()
  ;(window as unknown as Record<string, unknown>).__TAURI__ = true
  const s = useAppStore.getState()
  useAppStore.setState({ audio: { ...s.audio, selectedAudioDevice: '', inputGain: 1 } })
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as Record<string, unknown>).__TAURI__
})

describe('环境门禁', () => {
  it('Web 环境（非 Tauri）整块返回 null', () => {
    delete (window as unknown as Record<string, unknown>).__TAURI__
    const p = mount()
    expect(p.container.innerHTML).toBe('')
    expect(p.circle()).toBeNull()
    p.unmount()
  })

  it('Tauri 环境默认只显示右下角圆钮，面板未展开', () => {
    const p = mount()
    expect(p.circle()).not.toBeNull()
    expect(p.header()).toBeNull()
    expect(p.text()).not.toContain('Debug Panel')
    p.unmount()
  })
})

describe('展开 / 最小化 / 关闭', () => {
  it('点圆钮展开面板，折叠头 aria-expanded=true', () => {
    const p = mount()
    p.click(p.circle())
    expect(p.circle()).toBeNull()
    expect(p.header()).not.toBeNull()
    expect(p.header()!.getAttribute('aria-expanded')).toBe('true')
    expect(p.text()).toContain('Debug Panel')
    expect(p.text()).toContain('Pitch Detection')
    p.unmount()
  })

  it('点折叠头最小化：内容区消失、aria-expanded=false、圆钮也不出现', () => {
    const p = mount()
    p.click(p.circle())
    p.click(p.header())
    expect(p.header()!.getAttribute('aria-expanded')).toBe('false')
    expect(p.text()).not.toContain('Pitch Detection')
    expect(p.circle()).toBeNull()
    p.unmount()
  })

  it('折叠头支持 Enter / Space，其它键不切换', () => {
    const p = mount()
    p.click(p.circle())
    p.key(p.header(), 'Enter')
    expect(p.header()!.getAttribute('aria-expanded')).toBe('false')
    p.key(p.header(), ' ')
    expect(p.header()!.getAttribute('aria-expanded')).toBe('true')
    p.key(p.header(), 'a')
    expect(p.header()!.getAttribute('aria-expanded')).toBe('true')
    p.unmount()
  })

  it('关闭按钮回到圆钮，且不会顺带切换最小化状态', () => {
    const p = mount()
    p.click(p.circle())
    p.click(p.header())                       // 先最小化
    p.click(p.closeButton())                  // 关闭（要 stopPropagation）
    expect(p.circle()).not.toBeNull()

    p.click(p.circle())                       // 重新打开
    expect(p.header()!.getAttribute('aria-expanded')).toBe('false')   // 仍是「最小化」
    expect(p.text()).not.toContain('Pitch Detection')
    p.unmount()
  })
})

describe('轮询节流', () => {
  it('展开后每 500ms 调三条 IPC；最小化后停表', async () => {
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    const callsAfterOne = tauri.invoke.mock.calls.map((c) => c[0]).sort()
    expect(callsAfterOne).toEqual(['detect_pitch', 'get_audio_level', 'get_audio_status'])

    await p.tick(2)
    expect(tauri.invoke.mock.calls.length).toBe(9)   // 3 次轮询 × 3 条

    p.click(p.header())                              // 最小化
    const before = tauri.invoke.mock.calls.length
    await p.tick(3)
    expect(tauri.invoke.mock.calls.length).toBe(before)   // 停表了
    p.unmount()
  })

  it('关闭面板后同样停止轮询', async () => {
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    p.click(p.closeButton())
    const before = tauri.invoke.mock.calls.length
    await p.tick(3)
    expect(tauri.invoke.mock.calls.length).toBe(before)
    p.unmount()
  })
})

describe('数据渲染', () => {
  it('音符 / 音分 / 频率 / 检测耗时 / 四条置信度', async () => {
    pitch = { note: 'A', octave: 4, frequency: 440.123, cents: -12.34, confidence: { yin: 0.91, harmonic: 0.82, temporal: 0.73, overall: 0.66 } }
    status = { isCapturing: true, latencyMs: 12.3, bufferSize: 512, sampleRate: 48000 }
    level = { rms: 0.0123, db_spl: -18.5, peak: 0.25, is_voiced: true, noise_floor: 0.0003, snr_db: 21.5 }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)

    expect(p.rowValue('Note')).toBe('A4')
    expect(p.rowValue('Cents')).toBe('-12.3')          // 正数才加 +，这里负数直接显示
    expect(p.rowValue('Freq')).toBe('440.12 Hz')
    expect(p.rowValue('YIN')).toBe('91.0%')
    expect(p.rowValue('Harmonic')).toBe('82.0%')
    expect(p.rowValue('Temporal')).toBe('73.0%')
    expect(p.rowValue('Overall')).toBe('66.0%')
    expect(p.text()).toContain('LIVE')                 // isCapturing → LIVE 徽标
    p.unmount()
  })

  it('octave=0 时不拼八度；正数音分带 + 号', async () => {
    pitch = { note: '-', octave: 0, frequency: 0, cents: 7.5, confidence: { yin: 0, harmonic: 0, temporal: 0, overall: 0 } }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.rowValue('Note')).toBe('-')
    expect(p.rowValue('Cents')).toBe('+7.5')
    p.unmount()
  })

  it('Audio Status：ON/OFF、延迟分级配色、缓冲区、采样率 kHz', async () => {
    status = { isCapturing: false, latencyMs: 60, bufferSize: 1024, sampleRate: 44100 }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.rowValue('Capturing')).toBe('○ OFF')
    expect(p.rowValue('Buffer')).toBe('1024')
    expect(p.rowValue('Sample Rate')).toBe('44.1 kHz')
    const latency = [...p.container.querySelectorAll('span')].find((s) => s.textContent === 'Latency')!.parentElement!
    expect(latency.querySelectorAll('span')[1].className).toContain('text-red-400')   // >50ms
    p.unmount()
  })

  it('Audio Level：RMS 小值用科学计数法、dB/Peak/Noise/SNR/Voiced', async () => {
    level = { rms: 0.00042, db_spl: -18.456, peak: 0.25, is_voiced: false, noise_floor: 0.00031, snr_db: 21.55 }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.rowValue('RMS')).toBe('4.20e-4')
    expect(p.rowValue('dB')).toBe('-18.5 dB')
    expect(p.rowValue('Peak')).toBe('0.2500')
    expect(p.rowValue('Voiced')).toBe('No')
    expect(p.rowValue('Noise')).toBe('0.0003')
    expect(p.rowValue('SNR')).toBe('21.6 dB')
    p.unmount()
  })

  it('进度条宽度：置信度 min(100, v*100)、RMS 放大 500 倍、dB 按 (db+96)/96 并夹到 0..100', async () => {
    pitch = { note: 'A', octave: 4, frequency: 440, cents: 0, confidence: { yin: 0.91, harmonic: 0, temporal: 0, overall: 0 } }
    level = { rms: 0.00042, db_spl: -18.456, peak: 0, is_voiced: false, noise_floor: 0, snr_db: 0 }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.barWidth('YIN')).toBeCloseTo(91, 6)
    expect(p.barWidth('RMS')).toBeCloseTo(0.21, 6)          // 0.00042 * 500
    expect(p.barWidth('dB')).toBeCloseTo(((96 - 18.456) / 96) * 100, 3)
    p.unmount()
  })

  it('超界读数被夹住：置信度 >1 只到 100%，dB 超过满量程也只到 100%', async () => {
    pitch = { note: 'A', octave: 4, frequency: 440, cents: 0, confidence: { yin: 1.5, harmonic: 0, temporal: 0, overall: 0 } }
    // db_spl = 90 ⇒ (90+96)/96*100 = 193.75% ，必须被 min(100, …) 夹住
    level = { rms: 5, db_spl: 90, peak: 0, is_voiced: false, noise_floor: 0, snr_db: 0 }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.barWidth('YIN')).toBe(100)                     // min(100, 150)
    expect(p.barWidth('RMS')).toBe(100)                     // min(100, 5*500)
    expect(p.barWidth('dB')).toBe(100)                      // min(100, 193.75)
    p.unmount()
  })

  it('dB 低于量程下界时宽度不会变成负数（夹在 0）', async () => {
    // ⚠️ 这条只验证「不出现负数宽度」的意图：jsdom/cssstyle 会把非法的负值宽度
    //    直接吞掉（style 里读不到 width），所以 max(0, …) 那一层在 jsdom 里
    //    无法真正区分。此处至少保证不会渲染出负数宽度。
    level = { rms: 0, db_spl: -200, peak: 0, is_voiced: false, noise_floor: 0, snr_db: 0 }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.barWidth('dB') <= 100).toBe(true)
    expect(p.rowValue('dB')).toBe('-200.0 dB')
    p.unmount()
  })

  it('Device 段：名字超 30 字截断并挂 title，Gain 显示两位小数 + x', async () => {
    const longName = '设备'.repeat(20)   // 40 字，必须真的超过 30 才会截断
    const s = useAppStore.getState()
    useAppStore.setState({ audio: { ...s.audio, selectedAudioDevice: longName, inputGain: 1.25 } })
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    const shown = p.rowValue('Device')!
    expect(shown).toBe(longName.slice(0, 30) + '...')
    expect(shown.length).toBe(33)                      // 30 + '...'
    // 完整名字挂在 title 上，鼠标悬停能看到
    const cell = [...p.container.querySelectorAll('span')].find((x) => x.textContent === shown)!
    expect(cell.getAttribute('title')).toBe(longName)
    expect(p.rowValue('Gain')).toBe('1.25x')
    p.unmount()
  })
})

describe('失败与兜底', () => {
  it('三条 IPC 全部失败时不崩：音符显示 -、采样率走兜底 48000', async () => {
    failures = new Set(['detect_pitch', 'get_audio_status', 'get_audio_level'])
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.rowValue('Note')).toBe('-')
    expect(p.rowValue('Sample Rate')).toBe('48.0 kHz')   // get_audio_status 的 catch 兜底
    expect(p.rowValue('Capturing')).toBe('○ OFF')
    p.unmount()
  })

  it('pitch 为 null 时保留上一次的频率读数（不跳回 0）', async () => {
    pitch = { note: 'A', octave: 4, frequency: 440, cents: 0, confidence: { yin: 1, harmonic: 1, temporal: 1, overall: 1 } }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.rowValue('Freq')).toBe('440.00 Hz')

    pitch = null
    await p.tick(1)
    expect(p.rowValue('Freq')).toBe('440.00 Hz')   // 频率沿用上次
    expect(p.rowValue('Note')).toBe('-')            // 但音符归零
    p.unmount()
  })

  // 「动态 import 本身失败」这条分支见 __tests__/debug-panel-import-fail.test.ts：
  // 必须在模块注册阶段就让 factory 抛错，单文件内靠 vi.resetModules 做不到（会把 mock 注册一起清掉）。
})

describe('频率历史与波形', () => {
  it('不足 2 个点时没有波形；之后每个点一个坐标', async () => {
    pitch = { note: 'A', octave: 4, frequency: 440, cents: 0, confidence: { yin: 1, harmonic: 1, temporal: 1, overall: 1 } }
    const p = mount()
    p.click(p.circle())
    await p.tick(1)
    expect(p.polylinePoints()).toBeNull()

    await p.tick(2)
    expect(p.polylinePoints()).toHaveLength(3)
    p.unmount()
  })

  it('历史最多保留 60 个点', async () => {
    pitch = { note: 'A', octave: 4, frequency: 440, cents: 0, confidence: { yin: 1, harmonic: 1, temporal: 1, overall: 1 } }
    const p = mount()
    p.click(p.circle())
    await p.tick(65)
    expect(p.polylinePoints()).toHaveLength(60)
    p.unmount()
  })
})
