/**
 * lib/native-audio.ts 的 **Tauri 分支**契约测试。
 *
 * 与其同目录的 native-audio.test.ts 只覆盖了「非 Tauri → 静默降级」那一半（Web 环境）；
 * 真正干活的 `invoke(...)` / `listen(...)` 那半在 jsdom 下从未被执行过 —— 那正是行覆盖
 * 只有 27.9% 的原因。而它偏偏是最容易**静默**出错的地方：
 *
 *   ① **命令名拼错** → invoke reject → 被各自 catch 吞掉 → 功能悄无声息失效。
 *   ② **参数名拼错** → Tauri 反序列化失败（或 serde 静默丢字段）→ 同上。
 *      Tauri 只把命令的**顶层**参数名转 camelCase；嵌套结构体字段名由 serde 原样匹配。
 *   ③ **返回值/降级方向**只有在真机才看得到：查询类降级成空值、写入类必须上抛。
 *   ④ **模块级单例状态机**（deviceMonitorState）在重复调用下是否泄漏监听器/定时器。
 *
 * 本文件同时补一条**跨语言参数名护栏**（命令名护栏已在 native-invoke-contract.test.ts）：
 * 运行期捕获前端实际发出的参数键，与 Rust `audio_commands.rs` 的形参名逐一比对。
 * 本文件落地时它当场抓出两个真 bug（见 lib/native-audio.ts 内注释）：
 *   - `set_sample_rate` 发的是 `{ rate }`，Rust 形参是 `sample_rate` → 必需参数缺失、被吞。
 *   - `set_audio_filters` 的嵌套字段发 `highPass`/`lowPass`，Rust `FilterConfig` 是
 *     `high_pass`/`low_pass`（无 rename_all）→ 被 serde 当未知字段丢弃、无报错。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

import * as native from '@/lib/native-audio'
import type { AudioDeviceInfo, DeviceChangeEvent, PitchStreamEvent } from '@/lib/native-audio'

const winLike = window as unknown as { __TAURI__?: boolean }

/**
 * 轮询/订阅链路里混杂着 `await import('@tauri-apps/api/…')`，用 fake timers 会把这条
 * 微任务链一起卡住（实测：`vi.useFakeTimers()` 下动态 import 要等到
 * `advanceTimersByTimeAsync` 才推进，于是「建定时器」和「触发定时器」的时序全乱）。
 * 所以本文件一律用**真实定时器 + 短轮询间隔 + 等待助手**，牺牲几十毫秒换取确定性。
 */
async function waitUntil(pred: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil 超时：条件始终不成立')
    await new Promise((r) => setTimeout(r, 4))
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 统计 invoke 收到过多少次某命令。 */
function invokeCount(cmd: string): number {
  return mocks.invoke.mock.calls.filter((c) => c[0] === cmd).length
}

function dev(name: string, isDefault = false): AudioDeviceInfo {
  return { name, isDefault, channels: 2, sampleRate: 48000 }
}

beforeEach(() => {
  // 各函数的 catch 会 console.error 打日志（错误路径用例必然触发）——静音，避免输出被淹没。
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})

  winLike.__TAURI__ = true // 让模块内 isTauri() 返回 true，走到 invoke 分支
  mocks.invoke.mockReset()
  mocks.listen.mockReset()
  mocks.invoke.mockResolvedValue(undefined)
  mocks.listen.mockResolvedValue(vi.fn())
})

afterEach(() => {
  // 逐条 try/catch：任一条失败不能拖累后面的清场（残留 --TAURI-- 会让后续用例全部走错分支）。
  // 顺序要紧：先（仍在 Tauri 态下）把模块级单例状态清干净，再摘掉标志。
  const steps: Array<() => void> = [
    () => native.stopDevicePolling(),
    () => native.unlistenDeviceChanges(),
    () => { delete winLike.__TAURI__ },
    () => vi.useRealTimers(),
    () => vi.restoreAllMocks(),
    () => { document.body.innerHTML = '' },
  ]
  for (const step of steps) {
    try { step() } catch { /* 忽略清场异常 */ }
  }
})

// ==================================================== 命令名 / 参数名 / 返回值

describe('逐函数：命令名、参数名、返回值透传', () => {
  it('无参查询类命令名正确，返回值原样透传', async () => {
    mocks.invoke.mockResolvedValue([dev('Mic A', true)])
    expect(await native.getAudioDevices()).toEqual([dev('Mic A', true)])
    expect(mocks.invoke).toHaveBeenCalledWith('get_audio_devices')

    mocks.invoke.mockResolvedValue(dev('Mic B'))
    expect(await native.getDefaultAudioDevice()).toEqual(dev('Mic B'))
    expect(mocks.invoke).toHaveBeenCalledWith('get_default_audio_device')

    const pitch = {
      note: 'A', octave: 4, frequency: 440, cents: 3,
      confidence: { yin: 0.9, harmonic: 0.8, temporal: 0.7, overall: 0.85 },
      volume_db_spl: -30,
    }
    mocks.invoke.mockResolvedValue(pitch)
    expect(await native.detectPitch()).toEqual(pitch)
    expect(mocks.invoke).toHaveBeenCalledWith('detect_pitch')

    mocks.invoke.mockResolvedValue(12.5)
    expect(await native.getLatencyMs()).toBe(12.5)
    expect(mocks.invoke).toHaveBeenCalledWith('get_latency_ms')

    mocks.invoke.mockResolvedValue(true)
    expect(await native.isPitchStreamRunning()).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('is_pitch_stream_running')

    mocks.invoke.mockResolvedValue(true)
    expect(await native.isAgcEnabled()).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('is_agc_enabled')

    mocks.invoke.mockResolvedValue(1.8)
    expect(await native.getAgcGain()).toBe(1.8)
    expect(mocks.invoke).toHaveBeenCalledWith('get_agc_gain')

    mocks.invoke.mockResolvedValue(null)
    expect(await native.getAudioLevel()).toBeNull()
    expect(mocks.invoke).toHaveBeenCalledWith('get_audio_level')
  })

  it('getAudioStatus 透传后端状态（含实际生效的 backend）', async () => {
    const status = { isCapturing: true, latencyMs: 5, bufferSize: 256, sampleRate: 96000, backend: 'asio' as const }
    mocks.invoke.mockResolvedValue(status)
    expect(await native.getAudioStatus()).toEqual(status)
    expect(mocks.invoke).toHaveBeenCalledWith('get_audio_status')
  })

  it('start_audio_capture* 三兄弟：参数名 deviceName/sampleRate/backend + 默认值', async () => {
    await native.startAudioCapture('Mic A')
    expect(mocks.invoke).toHaveBeenCalledWith('start_audio_capture', { deviceName: 'Mic A' })

    await native.startAudioCaptureWithSampleRate('Mic A', 44100)
    expect(mocks.invoke).toHaveBeenCalledWith('start_audio_capture_with_sample_rate', {
      deviceName: 'Mic A',
      sampleRate: 44100,
    })

    // sampleRate 省略时补 48000（不能把 0/undefined 透给 Rust 的 Option<u32>）
    await native.startAudioCaptureWithSampleRate('Mic A')
    expect(mocks.invoke).toHaveBeenLastCalledWith('start_audio_capture_with_sample_rate', {
      deviceName: 'Mic A',
      sampleRate: 48000,
    })

    await native.startAudioCaptureWithBackend('Mic A', 96000, 'wasapi_exclusive')
    expect(mocks.invoke).toHaveBeenLastCalledWith('start_audio_capture_with_backend', {
      deviceName: 'Mic A',
      sampleRate: 96000,
      backend: 'wasapi_exclusive',
    })

    // backend 缺省为 wasapi_shared
    await native.startAudioCaptureWithBackend('Mic A', 48000)
    expect(mocks.invoke).toHaveBeenLastCalledWith('start_audio_capture_with_backend', {
      deviceName: 'Mic A',
      sampleRate: 48000,
      backend: 'wasapi_shared',
    })
  })

  it('无参写入/停止类命令名正确', async () => {
    await native.stopAudioCapture()
    expect(mocks.invoke).toHaveBeenCalledWith('stop_audio_capture')

    await native.stopPitchStream()
    expect(mocks.invoke).toHaveBeenCalledWith('stop_pitch_stream')
  })

  it('set* 类：参数名与 Rust 形参对齐', async () => {
    await native.setBufferSize(512)
    expect(mocks.invoke).toHaveBeenCalledWith('set_buffer_size', { size: 512 })

    // 回归：曾是 { rate }（Rust 形参是 sample_rate → sampleRate），报错被吞、采样率永不生效
    await native.setSampleRate(96000)
    expect(mocks.invoke).toHaveBeenCalledWith('set_sample_rate', { sampleRate: 96000 })

    await native.setNoiseSuppression(70)
    expect(mocks.invoke).toHaveBeenCalledWith('set_noise_suppression', { level: 70 })

    await native.setPitchThreshold(0.15)
    expect(mocks.invoke).toHaveBeenCalledWith('set_pitch_threshold', { threshold: 0.15 })

    await native.setGain(1.5)
    expect(mocks.invoke).toHaveBeenCalledWith('set_gain', { gain: 1.5 })

    await native.setAgcEnabled(true)
    expect(mocks.invoke).toHaveBeenCalledWith('set_agc_enabled', { enabled: true })
  })

  it('setFilters 把 camelCase 的 TS 参数翻译成 Rust 的 snake_case 嵌套字段', async () => {
    await native.setFilters({ highPass: true, lowPass: false, notch50: true, notch60: false })
    expect(mocks.invoke).toHaveBeenCalledWith('set_audio_filters', {
      filters: { high_pass: true, low_pass: false, notch50: true, notch60: false },
    })
  })

  it('setFilters 未提供的字段保持 undefined（不被默认成 true/false）', async () => {
    await native.setFilters({ notch50: true })
    expect(mocks.invoke).toHaveBeenCalledWith('set_audio_filters', {
      filters: { high_pass: undefined, low_pass: undefined, notch50: true, notch60: undefined },
    })
  })

  it('startPitchStream 的 intervalMs 透传（省略则为 undefined → Rust 用默认 50）', async () => {
    await native.startPitchStream(50)
    expect(mocks.invoke).toHaveBeenCalledWith('start_pitch_stream', { intervalMs: 50 })

    await native.startPitchStream()
    expect(mocks.invoke).toHaveBeenLastCalledWith('start_pitch_stream', { intervalMs: undefined })
  })
})

// ==================================================== 事件订阅

describe('listenPitchDetected / listenDeviceChanges', () => {
  it('listenPitchDetected 订阅 pitch-detected，并把 payload 归一后交给回调', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    const cb = vi.fn()

    const fn = await native.listenPitchDetected(cb)
    expect(fn).toBe(unlisten)
    expect(mocks.listen).toHaveBeenCalledWith('pitch-detected', expect.any(Function))

    const payload = {
      pitch: {
        note: 'E', octave: 2, frequency: 82.4, cents: -2,
        confidence: { yin: 0.9, harmonic: 0.8, temporal: 0.7, overall: 0.85 },
        volume_db_spl: -28,
      },
      isNoteOnset: true,
      agcGain: 1.4,
    } satisfies PitchStreamEvent
    const handler = mocks.listen.mock.calls[0][1] as (e: { payload: PitchStreamEvent }) => void
    handler({ payload })
    expect(cb).toHaveBeenCalledWith(payload)
  })

  // 🚨 线上真实形状：Rust `PitchStreamEvent`(src-tauri/src/audio/pipeline.rs) **没有** rename_all
  // ⇒ serde 按字段原名发 snake_case。前端若直接读 `event.isNoteOnset` 会恒得 undefined，
  // `lib/note-confirm.ts` 的第一级（起音）就静默失效、不报任何错。
  it('Rust 的 snake_case payload 要在边界归一成 camelCase（否则起音信号静默丢失）', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    const cb = vi.fn()
    await native.listenPitchDetected(cb)

    // 逐字照抄 Rust serde 的输出（字段名与 pipeline.rs 的 struct 一一对应）
    const raw = {
      pitch: {
        note: 'E', octave: 2, frequency: 82.4, cents: -2,
        confidence: { yin: 0.9, harmonic: 0.8, temporal: 0.7, overall: 0.85 },
        volume_db_spl: -28,
      },
      is_note_onset: true,
      agc_gain: 1.4,
    }
    const handler = mocks.listen.mock.calls[0][1] as (e: { payload: unknown }) => void
    handler({ payload: raw })

    expect(cb).toHaveBeenCalledWith({
      pitch: raw.pitch,
      isNoteOnset: true, // ← 归一化前这里是 undefined
      agcGain: 1.4,
    })
  })

  it('payload 缺起音字段 → 归一成 false（不把 undefined 当「本帧是起音」）', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    const cb = vi.fn()
    await native.listenPitchDetected(cb)

    const raw = {
      pitch: {
        note: 'E', octave: 2, frequency: 82.4, cents: -2,
        confidence: { yin: 0.9, harmonic: 0.8, temporal: 0.7, overall: 0.85 },
        volume_db_spl: -28,
      },
      // 两套命名都没有
    }
    const handler = mocks.listen.mock.calls[0][1] as (e: { payload: unknown }) => void
    handler({ payload: raw })

    expect(cb).toHaveBeenCalledWith({ pitch: raw.pitch, isNoteOnset: false, agcGain: 1 })
  })

  it('listenPitchDetected 订阅失败降级为 null（不抛）', async () => {
    mocks.listen.mockRejectedValue(new Error('no event api'))
    expect(await native.listenPitchDetected(() => {})).toBeNull()
  })

  it('首次 listenDeviceChanges：先启动 Rust device_monitor(1500ms)，再注册事件监听', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    const cb = vi.fn()

    const fn = await native.listenDeviceChanges(cb)
    expect(fn).toBe(unlisten)
    expect(mocks.invoke).toHaveBeenCalledWith('start_device_monitor', { intervalMs: 1500 })
    expect(mocks.listen).toHaveBeenCalledWith('audio-device-changed', expect.any(Function))

    // 顺序：monitor 必须先起来，否则监听期间会漏事件
    const invokeOrder = mocks.invoke.mock.invocationCallOrder[0]
    const listenOrder = mocks.listen.mock.invocationCallOrder[0]
    expect(invokeOrder).toBeLessThan(listenOrder)

    const payload: DeviceChangeEvent = { added: [dev('Mic B')], removed: [], devices: [dev('Mic B')] }
    const handler = mocks.listen.mock.calls[0][1] as (e: { payload: DeviceChangeEvent }) => void
    handler({ payload })
    expect(cb).toHaveBeenCalledWith(payload)
  })

  it('第二次 listenDeviceChanges 不会重复启动 device_monitor（单例只起一次）', async () => {
    mocks.listen.mockResolvedValue(vi.fn())
    await native.listenDeviceChanges(() => {})
    mocks.invoke.mockClear()

    await native.listenDeviceChanges(() => {})
    expect(mocks.invoke).not.toHaveBeenCalledWith('start_device_monitor', expect.anything())
  })

  it('第二次 listenDeviceChanges 会先注销上一个监听器（避免 Tauri 监听泄漏）', async () => {
    const first = vi.fn()
    mocks.listen.mockResolvedValueOnce(first).mockResolvedValueOnce(vi.fn())

    await native.listenDeviceChanges(() => {})
    await native.listenDeviceChanges(() => {})

    // 若直接覆盖槽位，first 就再也没有引用可注销 —— 它会一直把事件推给已卸载的组件
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('unlistenDeviceChanges 注销监听 + 停掉 Rust monitor；重复调用不再发命令', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    await native.listenDeviceChanges(() => {})

    mocks.invoke.mockClear()
    native.unlistenDeviceChanges()
    expect(unlisten).toHaveBeenCalledTimes(1)
    await waitUntil(() => invokeCount('stop_device_monitor') === 1)
    expect(mocks.invoke).toHaveBeenCalledWith('stop_device_monitor')

    // 第二次：monitorStarted 已复位 → 不该再发 stop_device_monitor（幂等）
    mocks.invoke.mockClear()
    native.unlistenDeviceChanges()
    await sleep(20)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('listen 不可用 → 回退到 2s 轮询，返回的清理函数能真正停掉轮询', async () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    mocks.invoke.mockResolvedValue([])
    mocks.listen.mockRejectedValue(new Error('event api unavailable'))
    const cb = vi.fn()

    const stop = await native.listenDeviceChanges(cb)
    expect(typeof stop).toBe('function')
    // 注意顺序：start_device_monitor 是在订阅之前就 await 了的（这样 Rust monitor 起来后
    // 立刻发的那批「全部设备」事件才不会被当成新设备）。所以事件 API 不可用时，
    // Rust monitor 其实已经起来了 —— 靠 unlisten 收尾，而不是靠这里不启动。
    await waitUntil(() => setSpy.mock.calls.length >= 1)
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 2000)

    stop?.()
    expect(clearSpy).toHaveBeenCalled()

    await sleep(30)
    mocks.invoke.mockClear()
    await sleep(60)
    expect(mocks.invoke, 'stop() 之后轮询还在继续').not.toHaveBeenCalled()
  })
})

// ==================================================== 轮询 diff

describe('startDevicePolling：设备增删的 diff 与定时器管理', () => {
  const POLL_MS = 25

  it('以首次设备列表为基线，之后按 added/removed 触发回调', async () => {
    const cb = vi.fn()
    mocks.invoke
      .mockResolvedValueOnce([dev('Mic A')])                       // startDevicePolling 内的基线拉取
      .mockResolvedValueOnce([dev('Mic A'), dev('Mic B')])          // 第 1 次轮询：新增 B
      .mockResolvedValueOnce([dev('Mic B')])                        // 第 2 次轮询：移除 A

    native.startDevicePolling(cb, POLL_MS)
    await waitUntil(() => invokeCount('get_audio_devices') >= 1)
    expect(cb, '基线拉取本身不该触发回调').not.toHaveBeenCalled()

    await waitUntil(() => cb.mock.calls.length >= 1)
    expect(cb.mock.calls[0][0]).toEqual({
      added: [dev('Mic B')],
      removed: [],
      devices: [dev('Mic A'), dev('Mic B')],
    })

    await waitUntil(() => cb.mock.calls.length >= 2)
    expect(cb.mock.calls[1][0]).toEqual({
      added: [],
      removed: ['Mic A'],
      devices: [dev('Mic B')],
    })
  })

  it('设备没变化时不触发回调（只更新基线）', async () => {
    const cb = vi.fn()
    mocks.invoke.mockResolvedValue([dev('Mic A')])

    native.startDevicePolling(cb, POLL_MS)
    await waitUntil(() => invokeCount('get_audio_devices') >= 3)
    expect(cb).not.toHaveBeenCalled()
  })

  it('重复 startDevicePolling 只留一个定时器（旧的必须被 clearInterval 掉）', async () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    mocks.invoke.mockResolvedValue([])

    native.startDevicePolling(() => {}, POLL_MS)
    await waitUntil(() => setSpy.mock.calls.length >= 1)
    native.startDevicePolling(() => {}, POLL_MS)
    await waitUntil(() => setSpy.mock.calls.length >= 2)

    // 用句柄核算，比「数 invoke 次数」确定：只应有 1 个定时器既没被清掉、又还活着
    const created = setSpy.mock.results.map((r) => r.value as unknown)
    const cleared = new Set(clearSpy.mock.calls.map((c) => c[0] as unknown))
    const alive = created.filter((id) => !cleared.has(id))
    expect(alive.length, `新建了 ${created.length} 个定时器，只清掉 ${cleared.size} 个`).toBe(1)
  })

  it('stopDevicePolling 可重复调用且之后不再轮询', async () => {
    mocks.invoke.mockResolvedValue([])
    native.startDevicePolling(() => {}, POLL_MS)
    await waitUntil(() => invokeCount('get_audio_devices') >= 1)

    native.stopDevicePolling()
    expect(() => native.stopDevicePolling()).not.toThrow()
    await sleep(POLL_MS * 2)
    mocks.invoke.mockClear()
    await sleep(POLL_MS * 4)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

// ==================================================== 失败降级方向

describe('invoke 失败时的降级方向（查询→空值 / 写入→上抛）', () => {
  beforeEach(() => {
    mocks.invoke.mockRejectedValue(new Error('device busy'))
  })

  it('启动类必须上抛（不能假装「已在采集」）', async () => {
    await expect(native.startAudioCapture()).rejects.toThrow('device busy')
    await expect(native.startAudioCaptureWithSampleRate()).rejects.toThrow('device busy')
    await expect(native.startAudioCaptureWithBackend()).rejects.toThrow('device busy')
    await expect(native.startPitchStream()).rejects.toThrow('device busy')
  })

  it('停止/设置类一律吞掉（设置面板不能因为一次失败就崩）', async () => {
    const calls: Array<[string, () => Promise<unknown>]> = [
      ['stopAudioCapture', () => native.stopAudioCapture()],
      ['setBufferSize', () => native.setBufferSize(512)],
      ['setSampleRate', () => native.setSampleRate(48000)],
      ['setNoiseSuppression', () => native.setNoiseSuppression(50)],
      ['setFilters', () => native.setFilters({ highPass: true })],
      ['setPitchThreshold', () => native.setPitchThreshold(0.2)],
      ['setGain', () => native.setGain(1)],
      ['stopPitchStream', () => native.stopPitchStream()],
      ['setAgcEnabled', () => native.setAgcEnabled(false)],
    ]
    for (const [name, fn] of calls) {
      await expect(fn(), name).resolves.toBeUndefined()
    }
  })

  it('查询类降级为空值（页面照常渲染，只是没数据）', async () => {
    expect(await native.getAudioDevices()).toEqual([])
    expect(await native.getDefaultAudioDevice()).toBeNull()
    expect(await native.detectPitch()).toBeNull()
    expect(await native.getAudioLevel()).toBeNull()
    expect(await native.getLatencyMs()).toBe(0)
    expect(await native.isPitchStreamRunning()).toBe(false)
    expect(await native.isAgcEnabled()).toBe(false)
    expect(await native.getAgcGain()).toBe(1.0)
    expect(await native.getAudioStatus()).toEqual({
      isCapturing: false,
      latencyMs: 0,
      bufferSize: 2048,
      sampleRate: 48000,
      backend: 'wasapi_shared',
    })
  })

  it('轮询中途失败不污染基线（保持上一次的有效列表，不误报「设备全没了」）', async () => {
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValueOnce([dev('Mic A')])          // 基线
    mocks.invoke.mockRejectedValueOnce(new Error('boom'))       // 第 1 次轮询：失败 → getAudioDevices 返回 []
    mocks.invoke.mockResolvedValue([dev('Mic A')])              // 之后都成功，且与基线相同

    const cb = vi.fn()
    native.startDevicePolling(cb, 25)
    await waitUntil(() => invokeCount('get_audio_devices') >= 3)
    // 若失败的那次把基线覆盖成 []，下一次成功就会报「added: [Mic A]」—— 这是误报
    expect(cb).not.toHaveBeenCalled()
  })
})

// ==================================================== 跨语言参数名护栏

const ROOT = process.cwd()
const RUST_AUDIO = path.join('src-tauri', 'src', 'commands', 'audio_commands.rs')

/** 剥掉**整行**注释（否则被注释掉的注册/定义仍会被正则匹配，护栏会漏报）。 */
function stripLineComments(text: string): string {
  return text.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n')
}

/** `device_name` → `deviceName`（Tauri 对**顶层**命令参数做的 camelCase 转换）。 */
function snakeToCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** 按**顶层**逗号切分参数表（`State<'_, AppState>` 里的逗号不能算分隔符）。 */
function splitTopLevelParams(params: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of params) {
    if (ch === '<' || ch === '(' || ch === '[') depth++
    else if (ch === '>' || ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

/** 解析 Rust 命令的形参名（排除 Tauri 注入的 state / app）。 */
function parseCommandParams(rustText: string): Map<string, string[]> {
  const text = stripLineComments(rustText)
  const out = new Map<string, string[]>()
  const re = /#\[tauri::command\]\s*pub\s+async\s+fn\s+([a-z_0-9]+)\s*\(([\s\S]*?)\)\s*->/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const params = splitTopLevelParams(m[2])
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split(':')[0].trim())
      .filter((n) => n && n !== 'state' && n !== 'app')
    out.set(m[1], params)
  }
  return out
}

/** 解析命名结构体的字段名，并按 `#[serde(rename_all)]` 推断实际线上键名。 */
function parseStructFields(rustText: string, structName: string): string[] | null {
  const text = stripLineComments(rustText)
  const re = new RegExp(`((?:#\\[[^\\]]*\\]\\s*)*)pub\\s+struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`)
  const m = re.exec(text)
  if (!m) return null
  const renameAll = /rename_all\s*=\s*"([a-zA-Z_]+)"/.exec(m[1])?.[1]
  const fields: string[] = []
  for (const line of m[2].split('\n')) {
    const f = /^\s*pub\s+([a-z_0-9]+)\s*:/.exec(line)
    if (f) fields.push(renameAll === 'camelCase' ? snakeToCamel(f[1]) : f[1])
  }
  return fields
}

/**
 * lib/native-audio.ts 的 `normalizePitchStreamEvent` 认得的**线上**键名（`pitch` 直通）。
 * 与 `src-tauri/src/audio/pipeline.rs` 的 `PitchStreamEvent` 字段名必须互相覆盖。
 */
const ACCEPTED_PITCH_EVENT_WIRE_KEYS = new Set(['pitch', 'is_note_onset', 'agc_gain', 'isNoteOnset', 'agcGain'])

/** 从 Rust 源码解析 `PitchStreamEvent` 的线上键名，并挑出归一化没覆盖的那些。 */
function pitchEventWireKeys(rustText: string): { keys: string[]; unknown: string[] } | null {
  const fields = parseStructFields(rustText, 'PitchStreamEvent')
  if (!fields) return null
  return { keys: fields, unknown: fields.filter((f) => !ACCEPTED_PITCH_EVENT_WIRE_KEYS.has(f)) }
}

/** 前端每个直接调用后端音频命令的函数（命令名 → 调用方式）。 */
const FRONTEND_CALLS: Array<[string, () => Promise<unknown>]> = [
  ['get_audio_devices', () => native.getAudioDevices()],
  ['get_default_audio_device', () => native.getDefaultAudioDevice()],
  ['start_audio_capture', () => native.startAudioCapture('Mic A')],
  ['start_audio_capture_with_sample_rate', () => native.startAudioCaptureWithSampleRate('Mic A', 44100)],
  ['start_audio_capture_with_backend', () => native.startAudioCaptureWithBackend('Mic A', 44100, 'asio')],
  ['stop_audio_capture', () => native.stopAudioCapture()],
  ['detect_pitch', () => native.detectPitch()],
  ['get_latency_ms', () => native.getLatencyMs()],
  ['get_audio_status', () => native.getAudioStatus()],
  ['set_buffer_size', () => native.setBufferSize(512)],
  ['set_sample_rate', () => native.setSampleRate(96000)],
  ['set_noise_suppression', () => native.setNoiseSuppression(70)],
  ['set_audio_filters', () => native.setFilters({ highPass: true, lowPass: true, notch50: true, notch60: true })],
  ['set_pitch_threshold', () => native.setPitchThreshold(0.2)],
  ['set_gain', () => native.setGain(1)],
  ['get_audio_level', () => native.getAudioLevel()],
  ['start_pitch_stream', () => native.startPitchStream(50)],
  ['stop_pitch_stream', () => native.stopPitchStream()],
  ['is_pitch_stream_running', () => native.isPitchStreamRunning()],
  ['set_agc_enabled', () => native.setAgcEnabled(true)],
  ['is_agc_enabled', () => native.isAgcEnabled()],
  ['get_agc_gain', () => native.getAgcGain()],
]

describe('跨语言护栏：invoke 的顶层参数名必须与 Rust 形参一致', () => {
  const rustText = (): string => fs.readFileSync(path.join(ROOT, RUST_AUDIO), 'utf8')

  describe('护栏自测（防止护栏自己失效后恒真）', () => {
    it('只从 #[tauri::command] 函数里取形参，并剔除 state/app', () => {
      const fake = [
        '#[tauri::command]',
        'pub async fn do_thing(',
        "    app: AppHandle,",
        "    state: State<'_, AppState>,",
        '    device_name: Option<String>,',
        '    interval_ms: Option<u64>,',
        ') -> Result<(), String> {',
        '    Ok(())',
        '}',
      ].join('\n')
      expect(parseCommandParams(fake).get('do_thing')).toEqual(['device_name', 'interval_ms'])
    })

    it('整行注释掉的命令定义不算数（含单行形式）', () => {
      const multi = ['// #[tauri::command]', '// pub async fn hidden() -> Result<(), String> {'].join('\n')
      expect(parseCommandParams(multi).size).toBe(0)
      // 单行形式才是真考验：若不先剥注释，正则会在 `// …` 内部匹配到
      // `#[tauri::command] pub async fn`，把注释掉的命令当成有效定义（护栏静默漏报）
      const single = '// #[tauri::command] pub async fn hidden2() -> Result<(), String> {'
      expect(parseCommandParams(single).size).toBe(0)
    })

    it('结构体字段按 rename_all 推断线上键名', () => {
      const snake = 'pub struct S {\n    pub high_pass: Option<bool>,\n    pub notch50: Option<bool>,\n}'
      expect(parseStructFields(snake, 'S')).toEqual(['high_pass', 'notch50'])

      const camel = '#[serde(rename_all = "camelCase")]\npub struct S {\n    pub high_pass: Option<bool>,\n}'
      expect(parseStructFields(camel, 'S')).toEqual(['highPass'])

      expect(parseStructFields(snake, 'Nope')).toBeNull()
    })

    it('snakeToCamel 处理多下划线与数字后缀', () => {
      expect(snakeToCamel('device_name')).toBe('deviceName')
      expect(snakeToCamel('interval_ms')).toBe('intervalMs')
      expect(snakeToCamel('sample_rate')).toBe('sampleRate')
      expect(snakeToCamel('notch50')).toBe('notch50')
      expect(snakeToCamel('size')).toBe('size')
    })

    it('按顶层逗号切分：泛型里的逗号不算分隔符', () => {
      expect(splitTopLevelParams("state: State<'_, AppState>, device_name: Option<String>"))
        .toEqual(["state: State<'_, AppState>", ' device_name: Option<String>'])
      expect(splitTopLevelParams('a: u32')).toEqual(['a: u32'])
      expect(splitTopLevelParams('')).toEqual([''])
    })
  })

  it('每个前端函数发出的命令与参数键，都能对上 Rust 的形参', async () => {
    const params = parseCommandParams(rustText())
    expect(params.size, 'Rust 命令形参解析数量过少，护栏可能已失效').toBeGreaterThanOrEqual(25)

    const problems: string[] = []
    for (const [cmd, call] of FRONTEND_CALLS) {
      mocks.invoke.mockClear()
      await call()
      const called = mocks.invoke.mock.calls.find((c) => c[0] === cmd)
      if (!called) {
        problems.push(`${cmd}: 前端没有发出该命令（实际发出 ${mocks.invoke.mock.calls.map((c) => String(c[0])).join(',') || '无'}）`)
        continue
      }
      const rustParams = params.get(cmd)
      if (!rustParams) {
        problems.push(`${cmd}: Rust audio_commands.rs 里找不到该命令`)
        continue
      }
      const expected = rustParams.map(snakeToCamel).sort()
      const actual = Object.keys((called[1] ?? {}) as Record<string, unknown>).sort()
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        problems.push(`${cmd}: 前端发送 ${JSON.stringify(actual)}，Rust 形参要求 ${JSON.stringify(expected)}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('set_audio_filters 的嵌套字段名与 Rust FilterConfig 一致（Tauri 不转换嵌套字段）', async () => {
    const fields = parseStructFields(rustText(), 'FilterConfig')
    expect(fields, 'audio_commands.rs 里找不到 FilterConfig').not.toBeNull()
    expect(fields!.length, 'FilterConfig 字段解析为 0 个，护栏可能已失效').toBeGreaterThanOrEqual(4)

    mocks.invoke.mockClear()
    await native.setFilters({ highPass: true, lowPass: true, notch50: true, notch60: true })
    const sent = (mocks.invoke.mock.calls[0][1] as { filters: Record<string, unknown> }).filters
    expect(Object.keys(sent).sort()).toEqual([...fields!].sort())
  })
})

// ============================================================================
// 跨语言护栏：pitch-detected 事件的**字段名**（src-tauri/src/audio/pipeline.rs）
// ============================================================================
//
// `PitchStreamEvent` 没有 rename_all ⇒ serde 按字段原名发 snake_case（`is_note_onset`
// / `agc_gain`）。前端若按 camelCase 读，`event.isNoteOnset` 恒为 undefined ⇒
// lib/note-confirm.ts 的两级前置滤波第一级（起音）静默失效，且不报任何错。
// 这条护栏不写死线上形状，而是**从 Rust 解析**出实际键名再喂给 listenPitchDetected，
// 所以 Rust 侧补不补 rename_all 都能成立，只有「新增/改名了字段却没改归一化」才会挂。
describe('跨语言护栏：pitch-detected 的线上字段名', () => {
  const RUST_PIPELINE = path.join('src-tauri', 'src', 'audio', 'pipeline.rs')
  const rustText = (): string => fs.readFileSync(path.join(ROOT, RUST_PIPELINE), 'utf8')

  it('护栏自测：Rust 里多出一个字段时会被判为「归一化没覆盖」（去掉这步就恒真）', () => {
    const fake = [
      '#[derive(serde::Serialize)]',
      'pub struct PitchStreamEvent {',
      '    pub pitch: PitchResult,',
      '    pub is_note_onset: bool,',
      '    pub onset_strength: f32,',
      '}',
    ].join('\n')
    const r = pitchEventWireKeys(fake)
    expect(r, '解析器认不出自测用的结构体，护栏已失效').not.toBeNull()
    expect(r!.unknown).toEqual(['onset_strength'])
  })

  it('护栏自测：带 rename_all="camelCase" 的结构体按 camelCase 解析', () => {
    const fake = [
      '#[derive(serde::Serialize)]',
      '#[serde(rename_all = "camelCase")]',
      'pub struct PitchStreamEvent {',
      '    pub pitch: PitchResult,',
      '    pub is_note_onset: bool,',
      '    pub agc_gain: f32,',
      '}',
    ].join('\n')
    const r = pitchEventWireKeys(fake)!
    expect(r.keys).toEqual(['pitch', 'isNoteOnset', 'agcGain'])
    expect(r.unknown).toEqual([])
  })

  it('能真实解析到 pipeline.rs 的 PitchStreamEvent', () => {
    const r = pitchEventWireKeys(rustText())
    expect(r, 'src-tauri/src/audio/pipeline.rs 里找不到 PitchStreamEvent（被改名/搬走了？）').not.toBeNull()
    expect(r!.keys.length, '字段解析为 0 个，护栏可能已失效').toBeGreaterThanOrEqual(2)
  })

  it('线上每个字段名都被 lib/native-audio.ts 的归一化覆盖，且起音字段确实存在', () => {
    const r = pitchEventWireKeys(rustText())!
    expect(
      r.unknown,
      `Rust 新增/改名了字段，lib/native-audio.ts 的 normalizePitchStreamEvent 没有对应分支：${r.unknown.join(', ')}`
    ).toEqual([])
    expect(
      r.keys.includes('is_note_onset') || r.keys.includes('isNoteOnset'),
      'PitchStreamEvent 里没有起音字段 —— 两级滤波第一级会失去数据来源'
    ).toBe(true)
  })

  it('把 Rust 真实线上形状喂给 listenPitchDetected，归一化后 isNoteOnset 必须为 true', async () => {
    const keys = pitchEventWireKeys(rustText())!.keys
    const payload: Record<string, unknown> = {
      pitch: {
        note: 'E', octave: 2, frequency: 82.4, cents: -2,
        confidence: { yin: 0.9, harmonic: 0.8, temporal: 0.7, overall: 0.85 },
        volume_db_spl: -28,
      },
    }
    for (const k of keys) {
      if (k === 'pitch') continue
      // 起音字段给 true，其余（AGC 增益类）给 1.4 —— 值的语义不影响这条护栏
      payload[k] = /onset/i.test(k) ? true : 1.4
    }

    const cb = vi.fn()
    await native.listenPitchDetected(cb)
    const handler = mocks.listen.mock.calls[0][1] as (e: { payload: unknown }) => void
    handler({ payload })

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ isNoteOnset: true, agcGain: 1.4 }))
  })
})

// ==================================================== ensureCaptureRunning

/**
 * 「确保采集在跑」的组合助手（启动恢复 / M 快捷键共用）。
 * 它把三个 invoke 串成一个决策链：读状态 → 列设备 → 启动。
 * 每一步的降级方向都必须钉住 —— 任一步静默走偏，桌面端就复刻
 * 「以为开了其实没开」的静默失效（2026-10-02 用户报障根因的近亲）。
 */
describe('ensureCaptureRunning：读状态 → 列设备 → 启动 的决策链', () => {
  it('已在采集 ⇒ 不重复启动（started=false），一个 start 都不发', async () => {
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_audio_status') return { isCapturing: true, latencyMs: 1, bufferSize: 2, sampleRate: 48000, backend: 'wasapi_shared' }
      if (cmd === 'get_audio_devices') return [dev('Mic A', true)]
      return undefined
    })

    const r = await native.ensureCaptureRunning({ selectedDevice: 'Mic A', sampleRate: 48000 })
    expect(r).toEqual({ started: false, device: null })
    expect(invokeCount('start_audio_capture_with_backend')).toBe(0)
  })

  it('未在采集 + 有已保存设备 ⇒ 用已保存设备启动，并回传设备名', async () => {
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_audio_status') return { isCapturing: false, latencyMs: 0, bufferSize: 2, sampleRate: 48000, backend: 'wasapi_shared' }
      if (cmd === 'get_audio_devices') return [dev('Mic A', true), dev('Saved Mic')]
      return undefined
    })

    const r = await native.ensureCaptureRunning({ selectedDevice: 'Saved Mic', sampleRate: 48000, backend: 'asio' })
    expect(r).toEqual({ started: true, device: 'Saved Mic' })
    expect(mocks.invoke).toHaveBeenCalledWith('start_audio_capture_with_backend', {
      deviceName: 'Saved Mic',
      sampleRate: 48000,
      backend: 'asio',
    })
  })

  it('没有已保存设备 ⇒ 用系统默认；连默认都没有 ⇒ 用第一个', async () => {
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_audio_status') return { isCapturing: false, latencyMs: 0, bufferSize: 2, sampleRate: 48000, backend: 'wasapi_shared' }
      if (cmd === 'get_audio_devices') return [dev('Mic A'), dev('Mic B', true)]
      return undefined
    })

    // 两个分支各跑一次，避免用例内共享状态
    mocks.invoke.mockClear()
    const r1 = await native.ensureCaptureRunning({ selectedDevice: '不存在的设备' })
    expect(r1).toEqual({ started: true, device: 'Mic B' }) // 系统默认优先

    mocks.invoke.mockClear()
    const r2 = await native.ensureCaptureRunning() // 什么都不给
    expect(r2).toEqual({ started: true, device: 'Mic B' })
  })

  it('设备列表为空 ⇒ started=false / device=null，不发 start（设备不存在不是错误，不能上抛砸掉启动流程）', async () => {
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_audio_status') return { isCapturing: false, latencyMs: 0, bufferSize: 2, sampleRate: 48000, backend: 'wasapi_shared' }
      if (cmd === 'get_audio_devices') return []
      return undefined
    })

    const r = await native.ensureCaptureRunning()
    expect(r).toEqual({ started: false, device: null })
    expect(invokeCount('start_audio_capture_with_backend')).toBe(0)
  })

  it('非 Tauri 环境 ⇒ 直接 no-op（Web 侧误调也不许碰 getUserMedia）', async () => {
    winLike.__TAURI__ = false
    const r = await native.ensureCaptureRunning()
    expect(r).toEqual({ started: false, device: null })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('启动失败 ⇒ 上抛（写入类失败必须可见，不能吞成「看起来成功」）', async () => {
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_audio_status') return { isCapturing: false, latencyMs: 0, bufferSize: 2, sampleRate: 48000, backend: 'wasapi_shared' }
      if (cmd === 'get_audio_devices') return [dev('Mic A', true)]
      if (cmd === 'start_audio_capture_with_backend') throw new Error('device busy')
      return undefined
    })

    await expect(native.ensureCaptureRunning()).rejects.toThrow('device busy')
  })
})
