import { isTauriEnv } from './utils'
import { logger } from './logger'

export const isTauri = (): boolean => {
  return isTauriEnv()
}

async function getInvoke() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke
}

async function getListen() {
  const { listen } = await import('@tauri-apps/api/event')
  return listen
}

export interface AudioDeviceInfo {
  name: string
  isDefault: boolean
  channels: number
  sampleRate: number
}

export interface PitchResult {
  note: string
  octave: number
  frequency: number
  cents: number
  confidence: {
    yin: number
    harmonic: number
    temporal: number
    overall: number
  }
  volume_db_spl: number
}

/** 桌面端音频后端：WASAPI 共享 / WASAPI 独占 / ASIO */
export type AudioBackend = 'wasapi_shared' | 'wasapi_exclusive' | 'asio'

export interface AudioStatus {
  isCapturing: boolean
  latencyMs: number
  bufferSize: number
  sampleRate: number
  /** 实际生效的后端（独占/ASIO 启动失败会回退共享） */
  backend: AudioBackend
}

export interface DeviceChangeEvent {
  added: AudioDeviceInfo[]
  removed: string[]
  devices: AudioDeviceInfo[]
}

type UnlistenFn = () => void

const deviceMonitorState = {
  deviceChangeListener: null as UnlistenFn | null,
  devicePollInterval: null as NodeJS.Timeout | null,
  lastDevices: [] as AudioDeviceInfo[],
  monitorStarted: false,
}

export async function getAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (!isTauri()) return []
  try {
    const invoke = await getInvoke()
    const devices = await invoke<AudioDeviceInfo[]>('get_audio_devices')
    deviceMonitorState.lastDevices = devices
    return devices
  } catch (error) {
    logger.error('Failed to get audio devices:', error)
    return []
  }
}

export async function listenDeviceChanges(callback: (event: DeviceChangeEvent) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null

  try {
    const invoke = await getInvoke()
    const listen = await getListen()

    if (!deviceMonitorState.monitorStarted) {
      await invoke('start_device_monitor', { intervalMs: 1500 })
      deviceMonitorState.monitorStarted = true
    }

    // 替换之前先注销上一个监听器。重复调用（React StrictMode 双挂载、或调用方忘了
    // 清理）时，若直接覆盖这个槽位，旧的 Tauri 事件监听器就再也没有引用可注销了 ——
    // 它会永远活着，每次设备变化都往一个已卸载的组件里回调。
    if (deviceMonitorState.deviceChangeListener) {
      deviceMonitorState.deviceChangeListener()
      deviceMonitorState.deviceChangeListener = null
    }

    deviceMonitorState.deviceChangeListener = await listen<DeviceChangeEvent>('audio-device-changed', (event) => {
      deviceMonitorState.lastDevices = event.payload.devices
      callback(event.payload)
    })
    return deviceMonitorState.deviceChangeListener
  } catch (error) {
    logger.warn('Tauri event-based monitoring unavailable, falling back to polling:', error)
    startDevicePolling(callback, 2000)
    return () => stopDevicePolling()
  }
}

export function unlistenDeviceChanges(): void {
  if (deviceMonitorState.deviceChangeListener) {
    deviceMonitorState.deviceChangeListener()
    deviceMonitorState.deviceChangeListener = null
  }
  stopDevicePolling()
  
  if (deviceMonitorState.monitorStarted && isTauri()) {
    getInvoke().then(invoke => invoke('stop_device_monitor')).catch(() => {})
    deviceMonitorState.monitorStarted = false
  }
}

export function startDevicePolling(callback: (event: DeviceChangeEvent) => void, intervalMs: number = 2000): void {
  if (!isTauri()) return
  
  getAudioDevices().then(() => {
    // 先停掉可能已存在的定时器再建新的：重复调用（例如 listenDeviceChanges 连续两次
    // 失败回退）会让旧定时器失去引用 —— 它既不会被清掉，也还在持续 invoke，
    // 泄漏一个永远跑着的轮询。
    stopDevicePolling()
    deviceMonitorState.devicePollInterval = setInterval(async () => {
      try {
        const invoke = await getInvoke()
        const newDevices = await invoke<AudioDeviceInfo[]>('get_audio_devices')
        
        const added = newDevices.filter(d => !deviceMonitorState.lastDevices.some(ld => ld.name === d.name))
        const removed = deviceMonitorState.lastDevices.filter(d => !newDevices.some(nd => nd.name === d.name)).map(d => d.name)
        
        if (added.length > 0 || removed.length > 0) {
          callback({ added, removed, devices: newDevices })
        }
        
        deviceMonitorState.lastDevices = newDevices
      } catch (error) {
        logger.error('Device polling error:', error)
      }
    }, intervalMs)
  })
}

export function stopDevicePolling(): void {
  if (deviceMonitorState.devicePollInterval) {
    clearInterval(deviceMonitorState.devicePollInterval)
    deviceMonitorState.devicePollInterval = null
  }
}

export async function startAudioCapture(deviceName?: string): Promise<void> {
  if (!isTauri()) throw new Error('Not in Tauri environment')
  try {
    const invoke = await getInvoke()
    await invoke('start_audio_capture', { deviceName })
  } catch (error) {
    console.error('Failed to start audio capture:', error)
    throw error
  }
}

/**
 * 按指定后端启动采集（WASAPI 共享 / WASAPI 独占 / ASIO）。
 * backend 缺省为 wasapi_shared；独占或 ASIO 不可用时 Rust 侧会自动回退共享。
 */
export async function startAudioCaptureWithBackend(
  deviceName?: string,
  sampleRate?: number,
  backend: AudioBackend = 'wasapi_shared'
): Promise<void> {
  if (!isTauri()) throw new Error('Not in Tauri environment')
  try {
    const invoke = await getInvoke()
    await invoke('start_audio_capture_with_backend', {
      deviceName,
      sampleRate: sampleRate || 48000,
      backend,
    })
  } catch (error) {
    console.error('Failed to start audio capture:', error)
    throw error
  }
}

export async function startAudioCaptureWithSampleRate(
  deviceName?: string,
  sampleRate?: number
): Promise<void> {
  if (!isTauri()) throw new Error('Not in Tauri environment')
  try {
    const invoke = await getInvoke()
    await invoke('start_audio_capture_with_sample_rate', { 
      deviceName, 
      sampleRate: sampleRate || 48000 
    })
  } catch (error) {
    console.error('Failed to start audio capture:', error)
    throw error
  }
}

export async function stopAudioCapture(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('stop_audio_capture')
  } catch (error) {
    console.error('Failed to stop audio capture:', error)
  }
}

/**
 * 确保采集在跑：先读真实运行状态（`get_audio_status`），已在采集就不动；
 * 否则按「已保存设备 → 系统默认 → 第一个」挑一个设备启动采集。
 *
 * 🚨 这是**设备挑选逻辑的唯一真相源**（铁律 14：同一判定不许复制两份）。
 * 消费者：`app/page.tsx` 启动恢复 effect、M 快捷键。此前 page.tsx 的恢复 effect
 * 内联了整套挑选逻辑 —— 若 M 快捷键再抄一份，两处会静默漂移。
 *
 * 返回 `{ started, device }`：
 *   - `started=false`（已在采集）或没有可用设备时 `device=null`；
 *   - `started=true` 时 `device` 是实际启动的设备名（调用方据此回写 selectedAudioDevice）。
 * 注意：本函数不抛「设备不存在」这类错误（返回 null 表达）；
 * `startAudioCaptureWithBackend` 的失败会原样上抛。
 */
export async function ensureCaptureRunning(opts: {
  selectedDevice?: string
  sampleRate?: number
  backend?: AudioBackend
} = {}): Promise<{ started: boolean; device: string | null }> {
  if (!isTauri()) return { started: false, device: null }
  const status = await getAudioStatus()
  if (status.isCapturing) return { started: false, device: null }

  const deviceList = await getAudioDevices()
  if (deviceList.length === 0) return { started: false, device: null }

  const saved = opts.selectedDevice
    ? deviceList.find((d) => d.name === opts.selectedDevice)
    : null
  const target = saved || deviceList.find((d) => d.isDefault) || deviceList[0]

  await startAudioCaptureWithBackend(target.name, opts.sampleRate || 48000, opts.backend || 'wasapi_shared')
  return { started: true, device: target.name }
}

export async function detectPitch(): Promise<PitchResult | null> {
  if (!isTauri()) return null
  try {
    const invoke = await getInvoke()
    return await invoke<PitchResult | null>('detect_pitch')
  } catch (error) {
    console.error('Failed to detect pitch:', error)
    return null
  }
}

export async function getLatencyMs(): Promise<number> {
  if (!isTauri()) return 0
  try {
    const invoke = await getInvoke()
    return await invoke<number>('get_latency_ms')
  } catch (error) {
    console.error('Failed to get latency:', error)
    return 0
  }
}

/**
 * `get_audio_status` 返回值在 **Rust 侧**的线上格式
 * （`src-tauri/src/commands/audio_commands.rs` 的 `AudioStatus`）。
 *
 * 该结构体**没有** `#[serde(rename_all = ...)]` ⇒ serde 按字段原名序列化，
 * 即 `is_capturing` / `latency_ms` / `buffer_size` / `sample_rate`。
 * （对照：`db/stats.rs` 显式写了 `rename_all = "camelCase"`，所以它才是 camelCase。
 *   本项目里两种口径并存，**必须逐个结构体确认**，不能凭印象统一。）
 *
 * 🚨 不归一化的话 `status.isCapturing` 恒为 `undefined`，且三条后果全部静默：
 *   ① `ensureCaptureRunning` 的幂等守卫失效 ⇒ 每次按键都重开设备，独占模式下
 *      反复重建 COM `IAudioClient` ⇒ 丢音；
 *   ② 「用户意图关、但 Rust 仍在采集」的清理分支永不执行；
 *   ③ debug 面板永久显示「○ OFF / 延迟 0.0ms」，等于没法用它诊断任何音频问题。
 *
 * 两种命名都接受：将来若 Rust 侧补上 `rename_all = "camelCase"`，前端不必再改。
 * 字段集合由 `__tests__/native-invoke-contract.test.ts` 与 Rust 侧做**双向比对**，
 * 任一侧加减字段 / 改命名都会红 —— 这是防同类 bug 再生的护栏，改字段时别绕过它。
 */
interface RawAudioStatus {
  is_capturing?: boolean
  latency_ms?: number
  buffer_size?: number
  sample_rate?: number
  backend?: AudioBackend
  // 兼容未来 Rust 侧补 rename_all 的情况
  isCapturing?: boolean
  latencyMs?: number
  bufferSize?: number
  sampleRate?: number
}

/** 与 `getAudioStatus()` 非 Tauri / 出错降级分支共用的中性值（未采集 + 48k/2048）。 */
const NEUTRAL_AUDIO_STATUS: AudioStatus = {
  isCapturing: false,
  latencyMs: 0,
  bufferSize: 2048,
  sampleRate: 48000,
  backend: 'wasapi_shared',
}

/**
 * 把 Rust 的线上 payload 归一化成前端唯一形状 `AudioStatus`。
 *
 * 缺省值语义与 `NEUTRAL_AUDIO_STATUS` 一致：拿不到真实状态时退化成「未采集」，
 * 而不是把 `undefined` 传播给下游（下游 `if (status.isCapturing)` 会把
 * `undefined` 当假 ⇒ 与「未采集」同形，无法区分「真没在采」和「读不到状态」）。
 */
function normalizeAudioStatus(raw: RawAudioStatus | null | undefined): AudioStatus {
  if (!raw) return { ...NEUTRAL_AUDIO_STATUS }
  return {
    isCapturing: raw.isCapturing ?? raw.is_capturing ?? false,
    latencyMs: raw.latencyMs ?? raw.latency_ms ?? 0,
    bufferSize: raw.bufferSize ?? raw.buffer_size ?? 2048,
    sampleRate: raw.sampleRate ?? raw.sample_rate ?? 48000,
    backend: raw.backend ?? 'wasapi_shared',
  }
}

export async function getAudioStatus(): Promise<AudioStatus> {
  if (!isTauri()) {
    return { ...NEUTRAL_AUDIO_STATUS }
  }
  try {
    const invoke = await getInvoke()
    return normalizeAudioStatus(await invoke<RawAudioStatus>('get_audio_status'))
  } catch (error) {
    console.error('Failed to get audio status:', error)
    return { ...NEUTRAL_AUDIO_STATUS }
  }
}

export async function setBufferSize(size: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_buffer_size', { size })
  } catch (error) { console.error('Failed to set buffer size:', error) }
}

export async function setSampleRate(rate: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    // 参数名必须与 Rust 侧形参 `sample_rate` 对齐（Tauri 会把顶层参数名转成 camelCase，
    // 即 `sampleRate`）。此前误写成 `{ rate }` → invoke 报「缺少必需参数 sampleRate」
    // → 被下面的 catch 静默吞掉，桌面端的采样率设置从未真正生效。
    await invoke('set_sample_rate', { sampleRate: rate })
  } catch (error) { console.error('Failed to set sample rate:', error) }
}

export async function setNoiseSuppression(level: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_noise_suppression', { level })
  } catch (error) { console.error('Failed to set noise suppression:', error) }
}

export async function setFilters(filters: {
  highPass?: boolean
  lowPass?: boolean
  notch50?: boolean
  notch60?: boolean
}): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    // 🚨 Tauri 只把**命令的顶层参数名**转成 camelCase，嵌套结构体的字段名由 serde
    // 原样匹配。Rust 侧 `FilterConfig` 没加 `#[serde(rename_all = "camelCase")]`，
    // 所以这里必须显式发 snake_case：否则 `highPass`/`lowPass` 被 serde 当未知字段丢弃，
    // Option 缺失又默认为 None ⇒ 命令不报错、高通/低通开关静默失效
    // （`notch50`/`notch60` 恰好两边同名，只有这两个幸存）。
    await invoke('set_audio_filters', {
      filters: {
        high_pass: filters.highPass,
        low_pass: filters.lowPass,
        notch50: filters.notch50,
        notch60: filters.notch60,
      },
    })
  } catch (error) { console.error('Failed to set filters:', error) }
}

export async function getDefaultAudioDevice(): Promise<AudioDeviceInfo | null> {
  if (!isTauri()) return null
  try {
    const invoke = await getInvoke()
    return await invoke<AudioDeviceInfo | null>('get_default_audio_device')
  } catch (error) {
    console.error('Failed to get default audio device:', error)
    return null
  }
}

export async function setPitchThreshold(threshold: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_pitch_threshold', { threshold })
  } catch (error) { console.error('Failed to set pitch threshold:', error) }
}

export async function setGain(gain: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_gain', { gain })
  } catch (error) { console.error('Failed to set gain:', error) }
}

export async function getAudioLevel(): Promise<{
  rms: number; db_spl: number; peak: number; is_voiced: boolean; noise_floor: number; snr_db: number
} | null> {
  if (!isTauri()) return null
  try {
    const invoke = await getInvoke()
    return await invoke('get_audio_level')
  } catch (error) { console.error('Failed to get audio level:', error); return null }
}

/**
 * `pitch-detected` 事件在 **Rust 侧**的线上格式（`src-tauri/src/audio/pipeline.rs`
 * 的 `PitchStreamEvent`）。该结构体**没有** `#[serde(rename_all = ...)]`
 * ⇒ serde 按字段原名序列化，即 `is_note_onset` / `agc_gain`
 * （同一事件里的 `PitchResult.volume_db_spl` 也是这个道理）。
 *
 * 两个命名都接受：将来若 Rust 侧补上 `#[serde(rename_all = "camelCase")]`
 * （`db/stats.rs` 就是这么做的），前端不必再改。
 */
interface RawPitchStreamEvent {
  pitch: PitchResult
  is_note_onset?: boolean
  agc_gain?: number
  isNoteOnset?: boolean
  agcGain?: number
}

/**
 * 前端使用的**归一化后**形状（camelCase）。其余代码只认这个形状，
 * 不要再在别处判断线上命名风格。
 */
export interface PitchStreamEvent {
  pitch: PitchResult
  isNoteOnset: boolean
  agcGain: number
}

/**
 * 把 Rust 的线上 payload 归一化。
 *
 * 🚨 不归一化的话 `event.isNoteOnset` 恒为 `undefined` —— `lib/note-confirm.ts`
 * 的两级前置滤波里第一级（起音）在桌面端就永远不触发，且不报任何错，
 * 只是静默退化成「每个音只计一次分」。
 */
function normalizePitchStreamEvent(raw: RawPitchStreamEvent): PitchStreamEvent {
  return {
    pitch: raw.pitch,
    // 缺省 false：与 app/page.tsx 的 `!!isNoteOnset` 口径一致 —— 拿不到起音信号时
    // 退化成「每个音只计一次分」，而不是把 undefined 当成本帧是起音
    isNoteOnset: raw.isNoteOnset ?? raw.is_note_onset ?? false,
    // 1.0 是 Rust AGC 的中性增益（无音高分支也发 1.0）
    agcGain: raw.agcGain ?? raw.agc_gain ?? 1,
  }
}

export async function startPitchStream(intervalMs?: number): Promise<void> {
  if (!isTauri()) throw new Error('Not in Tauri environment')
  try {
    const invoke = await getInvoke()
    await invoke('start_pitch_stream', { intervalMs })
  } catch (error) {
    console.error('Failed to start pitch stream:', error)
    throw error
  }
}

export async function stopPitchStream(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('stop_pitch_stream')
  } catch (error) {
    console.error('Failed to stop pitch stream:', error)
  }
}

export async function isPitchStreamRunning(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const invoke = await getInvoke()
    return await invoke<boolean>('is_pitch_stream_running')
  } catch (error) {
    console.error('Failed to check pitch stream:', error)
    return false
  }
}

export async function listenPitchDetected(callback: (event: PitchStreamEvent) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  try {
    const listen = await getListen()
    return await listen<RawPitchStreamEvent>('pitch-detected', (event) => {
      callback(normalizePitchStreamEvent(event.payload))
    })
  } catch (error) {
    console.error('Failed to listen pitch detected:', error)
    return null
  }
}

export async function setAgcEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_agc_enabled', { enabled })
  } catch (error) { console.error('Failed to set AGC:', error) }
}

export async function isAgcEnabled(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const invoke = await getInvoke()
    return await invoke<boolean>('is_agc_enabled')
  } catch (error) { console.error('Failed to check AGC:', error); return false }
}

export async function getAgcGain(): Promise<number> {
  if (!isTauri()) return 1.0
  try {
    const invoke = await getInvoke()
    return await invoke<number>('get_agc_gain')
  } catch (error) { console.error('Failed to get AGC gain:', error); return 1.0 }
}

export const nativeAudio = {
  getAudioDevices,
  getDefaultAudioDevice,
  startAudioCapture,
  startAudioCaptureWithSampleRate,
  startAudioCaptureWithBackend,
  stopAudioCapture,
  detectPitch,
  getLatencyMs,
  getAudioStatus,
  setBufferSize,
  setSampleRate,
  setNoiseSuppression,
  setFilters,
  setPitchThreshold,
  setGain,
  getAudioLevel,
  startDevicePolling,
  stopDevicePolling,
  listenDeviceChanges,
  unlistenDeviceChanges,
  startPitchStream,
  stopPitchStream,
  isPitchStreamRunning,
  listenPitchDetected,
  setAgcEnabled,
  isAgcEnabled,
  getAgcGain,
}
