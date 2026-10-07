/**
 * lib/native-audio.ts 的契约测试（此前零测试）。
 *
 * 该模块是 Tauri（Windows 桌面版）原生音频能力的封装：每个函数都以
 * `if (!isTauri())` 开头做**降级**——因为同一份前端代码也跑在 Web 上。
 * 降级行为分三类，必须分毫不差（错一类就会在 Web 上崩或静默失效）：
 *  ① 抛 `Not in Tauri environment`：启动类（startAudioCapture* / startPitchStream）
 *  ② 返回空/null/false/0：查询类
 *  ③ 静默无操作：设置类（stop* / set*）
 *
 * 测试环境 jsdom 下 isTauri() 恒为 false，所以这里覆盖的正是「Web 环境」这一支。
 * 探针体检未发现真 bug —— 本轮为**纯护栏**。
 */
import { describe, it, expect } from 'vitest'
import * as native from '@/lib/native-audio'
import { nativeAudio } from '@/lib/native-audio'

const NOT_TAURI = 'Not in Tauri environment'

// ---------------------------------------------------- 环境判定

describe('isTauri', () => {
  it('jsdom 下为 false（Web 环境）', () => {
    expect(native.isTauri()).toBe(false)
  })
})

// ---------------------------------------------------- ① 启动类：抛错

describe('启动类 API：非 Tauri 时抛 Not in Tauri environment', () => {
  it('startAudioCapture', async () => {
    await expect(native.startAudioCapture()).rejects.toThrow(NOT_TAURI)
  })

  it('startAudioCaptureWithBackend', async () => {
    await expect(native.startAudioCaptureWithBackend()).rejects.toThrow(NOT_TAURI)
  })

  it('startAudioCaptureWithSampleRate', async () => {
    await expect(native.startAudioCaptureWithSampleRate()).rejects.toThrow(NOT_TAURI)
  })

  it('startPitchStream', async () => {
    await expect(native.startPitchStream()).rejects.toThrow(NOT_TAURI)
  })
})

// ---------------------------------------------------- ② 查询类：空值

describe('查询类 API：非 Tauri 时返回空值', () => {
  it('getAudioDevices → []', async () => {
    expect(await native.getAudioDevices()).toEqual([])
  })

  it('getDefaultAudioDevice → null', async () => {
    expect(await native.getDefaultAudioDevice()).toBeNull()
  })

  it('detectPitch → null', async () => {
    expect(await native.detectPitch()).toBeNull()
  })

  it('getAudioLevel → null', async () => {
    expect(await native.getAudioLevel()).toBeNull()
  })

  it('listenDeviceChanges → null（且不会退化成轮询）', async () => {
    expect(await native.listenDeviceChanges(() => {})).toBeNull()
  })

  it('listenPitchDetected → null', async () => {
    expect(await native.listenPitchDetected(() => {})).toBeNull()
  })

  it('getLatencyMs → 0', async () => {
    expect(await native.getLatencyMs()).toBe(0)
  })

  it('isPitchStreamRunning / isAgcEnabled → false', async () => {
    expect(await native.isPitchStreamRunning()).toBe(false)
    expect(await native.isAgcEnabled()).toBe(false)
  })

  it('getAgcGain → 1.0（中性增益）', async () => {
    expect(await native.getAgcGain()).toBe(1.0)
  })

  it('getAudioStatus → 默认状态（48kHz / 2048 / wasapi_shared / 未采集）', async () => {
    expect(await native.getAudioStatus()).toEqual({
      isCapturing: false,
      latencyMs: 0,
      bufferSize: 2048,
      sampleRate: 48000,
      backend: 'wasapi_shared',
    })
  })
})

// ---------------------------------------------------- ③ 设置类：静默

describe('设置类 API：非 Tauri 时静默无操作（不抛）', () => {
  it('所有 set* / stop* / unlisten* 都能安全调用', async () => {
    const calls: Array<[string, () => Promise<unknown>]> = [
      ['stopAudioCapture', () => native.stopAudioCapture()],
      ['setBufferSize', () => native.setBufferSize(512)],
      ['setSampleRate', () => native.setSampleRate(96000)],
      ['setNoiseSuppression', () => native.setNoiseSuppression(70)],
      ['setFilters', () => native.setFilters({ highPass: true, lowPass: false, notch50: true, notch60: false })],
      ['setPitchThreshold', () => native.setPitchThreshold(0.8)],
      ['setGain', () => native.setGain(1.5)],
      ['stopPitchStream', () => native.stopPitchStream()],
      ['setAgcEnabled', () => native.setAgcEnabled(true)],
    ]
    for (const [name, fn] of calls) {
      await expect(fn(), name).resolves.toBeUndefined()
    }
    // 同步的轮询/监听清理函数
    expect(() => native.startDevicePolling(() => {})).not.toThrow()
    expect(() => native.stopDevicePolling()).not.toThrow()
    expect(() => native.unlistenDeviceChanges()).not.toThrow()
  })

  it('startDevicePolling 在非 Tauri 下不建立定时器（stop 后无残留）', async () => {
    // isTauri() 为 false 时函数在开头就 return，不会走到 setInterval，
    // 故再次调用 stopDevicePolling 也不应报错、且没有副作用。
    native.startDevicePolling(() => {}, 10)
    native.stopDevicePolling()
    expect(await native.getAudioDevices()).toEqual([])
  })
})

// ---------------------------------------------------- 导出完整性

describe('nativeAudio 聚合对象', () => {
  it('包含全部导出函数，且都是函数类型', () => {
    const expected = [
      'getAudioDevices', 'getDefaultAudioDevice', 'startAudioCapture',
      'startAudioCaptureWithSampleRate', 'startAudioCaptureWithBackend', 'stopAudioCapture',
      'detectPitch', 'getLatencyMs', 'getAudioStatus', 'setBufferSize', 'setSampleRate',
      'setNoiseSuppression', 'setFilters', 'setPitchThreshold', 'setGain', 'getAudioLevel',
      'startDevicePolling', 'stopDevicePolling', 'listenDeviceChanges', 'unlistenDeviceChanges',
      'startPitchStream', 'stopPitchStream', 'isPitchStreamRunning', 'listenPitchDetected',
      'setAgcEnabled', 'isAgcEnabled', 'getAgcGain',
    ]
    expect(Object.keys(nativeAudio).sort()).toEqual([...expected].sort())
    for (const [k, v] of Object.entries(nativeAudio)) {
      expect(typeof v, k).toBe('function')
    }
  })

  it('聚合对象与具名导出是同一引用（不会出现两套实现）', () => {
    expect(nativeAudio.getAudioDevices).toBe(native.getAudioDevices)
    expect(nativeAudio.startPitchStream).toBe(native.startPitchStream)
  })
})
