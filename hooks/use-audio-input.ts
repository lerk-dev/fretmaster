/**
 * 音频输入域 —— 从 `app/page.tsx` 抽出的**独立功能域**：把声音送进应用的全部管道。
 *
 * ## 这里装了什么
 *
 * - **Web 收音链路**：`getUserMedia` → GainNode → Analyser → AudioWorklet（默认）
 *   或 ScriptProcessorNode（回退）。两条路径的起音门限 / YIN 门限 / 多帧确认
 *   按**同一规则**推导（见 `lib/pitch-detection.ts`、`lib/note-confirm.ts`）。
 * - **Tauri 原生链路**：启动时把落盘的音频设置同步给 Rust 后端并按用户意图恢复采集；
 *   练习进行时订阅 `pitch-detected` 事件流（替代 50ms × IPC 轮询）。
 * - **MIDI 设备**：授权、设备热插拔列表、note-on 订阅。
 * - **环境噪声校准**：倒计时 → 采样 → 85 百分位，结果同时下发 worklet 与 TS 两条路径。
 *
 * ## 这里**不**装什么
 *
 * **判对错**不在这里。三条收音路径（worklet / ScriptProcessor / Tauri）都只负责
 * 「确认了某个音」→ 交给注入的 `processMatchRef`，由页面的 `processPracticeMatch`
 * 走 `lib/answer-judge.ts` 的真相源判定。这条边界是刻意的：输入管道不该知道练习模式。
 *
 * ## 两条容易踩的坑（勿改）
 *
 * 1. **卸载清理 effect 的 deps 必须保持 `[]` 且经 `tunerDisposeChainRef` 拆调音器链路** ——
 *    `tunerDisposeChain` 的身份每帧都可能变，写进 deps 会让「只跑一次」的清理变成每帧重跑。
 *    （`stopAudioInput` 自身的 deps 与搬迁前**逐字相同**：`[audioContext, setDetectedCents,
 *    setDetectedPitch, setMicEnabled]`。）
 * 2. **关麦必须同时中止噪声校准**（`noiseCalibrationAbortRef`）—— 校准采的是
 *    `analyser` 上的帧，关麦后链路被拆掉，它会静默采到一堆「读不到帧」的无效样本，
 *    最后报一个假的「环境很安静」。
 *
 * 两条都有护栏：`__tests__/hooks-deps-safety.test.ts`。
 *
 * ## 与页面的接口
 *
 * `app/page.tsx` 仍是 store 的唯一入口：本 hook 不订阅 store，所有设置与 action
 * 都按值传入（与 `hooks/use-tuner.ts` 同一约定）。除返回值外，页面还要注入
 * `cooldownRef` / `isCoolingDownRef` / `noteConfirmStateRef` —— 它们被页面的
 * `processPracticeMatch` 共用（冷却期与多帧确认的记忆必须与收音链路是同一份）。
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  calculateRMS,
  detectFloorForLowestHz,
  frequencyToNoteName,
  getMinDetectFreq,
  getOnsetGate,
  getSOLOYinAnalyser,
  resetPitchDetectionState,
  resolveYinThreshold,
  seedPitchDetectionNoiseFloor,
  setMinDetectFreq,
  updateOnsetGate,
  YINPitchDetection,
} from '@/lib/pitch-detection'
import {
  createNoteConfirmState,
  createOnsetState,
  detectOnset,
  type NoteConfirmState,
  type OnsetState,
} from '@/lib/note-confirm'
import {
  formatNoisePercent,
  onsetGateFromNoiseFloor,
  runNoiseFloorCalibration,
} from '@/lib/noise-calibration'
import { getEffectiveAudioSettings } from '@/lib/audio-settings-effective'
import { useAppStore } from '@/lib/store'
import type { AudioBackend } from '@/lib/native-audio'
import { getAudioContextClass, isTauriEnv } from '@/lib/utils'
import { NOTES } from '@/lib/page-theory-data'
import { logger } from '@/lib/logger'

/**
 * ScriptProcessor 回退路径的起音门限**不再写死**。
 *
 * 此前这里是 `const SCRIPT_PROCESSOR_ONSET_GATE = 0.001`，而 worklet / Tauri 两条路径
 * 的门限都跟着各自跟踪的环境底噪走（`max(0.0008, 底噪 × 1.5)`）。校准出高底噪
 * （上界 0.025 ⇒ 门限 0.0375）后，回退路径的门限低了 37 倍 ⇒ 环境噪声的起伏被当成
 * 「一次新的拨弦」⇒ 多帧一致的确认记忆被反复清空 ⇒ 嘈杂房间里永不确认。
 * 现在统一走 `updateOnsetGate(energy)`：它与另两处**同规则**（见 lib/pitch-detection.ts
 * 的「起音门限」段），并且吃的是同一帧的**原始** RMS。
 */

// ==================== 各收音路径的帧长度（多帧一致按时间换算要用） ====================
// 🚨 三条路径的帧间隔差 17 倍，而 lib/note-confirm.ts 的多帧一致是按**时间**定的目标
// （NOTE_CONFIRM_TARGET_MS = 32ms）。所以每条路径都必须把自己的帧间隔报上去，
// 否则会按 worklet 口径算，回退路径上确认延迟被放大成 ~0.5s。
// 这三个常量与各自的实际用法**同源**（下面都直接引用它们），不要写第二份字面量。

/** AudioWorklet 的 hop 长度（与 public/js/audio-worklet-processor.js 的 hopSize 默认值一致）。 */
const AUDIO_WORKLET_HOP_SIZE = 512
/** ScriptProcessor 回退的缓冲区长度（createScriptProcessor 的第一个参数）。 */
const SCRIPT_PROCESSOR_BUFFER_SIZE = 8192
/** Tauri 原生流的出帧间隔（startPitchStream 的实参；Rust 侧据此 sleep）。 */
const NATIVE_PITCH_INTERVAL_MS = 50

/** 由「每帧采样数 + 采样率」算出该路径的帧间隔（ms）。采样率非法时返回 0（调用方回落 worklet 口径）。 */
const frameMsOf = (samplesPerFrame: number, sampleRate: number): number =>
  sampleRate > 0 ? (samplesPerFrame / sampleRate) * 1000 : 0

// 根据运行环境获取 AudioWorklet 模块的正确路径
// Tauri: 从根路径加载; Web子路径部署: 自动检测前缀
const getAudioWorkletModulePath = (): string => {
  if (typeof window === 'undefined') return '/js/audio-worklet-processor.js'
  if (isTauriEnv()) return '/js/audio-worklet-processor.js'
  const path = window.location.pathname
  const match = path.match(/^(\/[^/]+)\//)
  if (match) return match[1] + '/js/audio-worklet-processor.js'
  return '/js/audio-worklet-processor.js'
}

/**
 * 一次音高检测结果 —— 练习匹配器的输入。
 * 用对象参数而非位置参数：历史上这里有两份重复实现，签名分别是
 * (frequency, detectedNote, probability) 与 (detectedFreq, probability, detectedNote)，
 * 顺序相反、极易传错（现已统一为此接口，并只保留一份实现）。
 */
export interface DetectedPitchForMatch {
  frequency: number
  note: string
  probability: number
  /**
   * 本帧是否为一次新的起音。三条收音路径都会提供：
   * worklet 用 data.isNoteOnset、Tauri 用 result.isNoteOnset、
   * ScriptProcessor 回退在页面内用 detectOnset() 现算。
   * 缺省 false —— 退化成「每个音只计一次分」，见 lib/note-confirm.ts 顶部说明。
   */
  isNoteOnset?: boolean
  /**
   * 未经平滑的原始频率，供多帧一致判定使用。
   * 平滑频率（frequency 字段）只用于显示，判定用它会把上一个音带进下一个音的起始帧。
   * worklet 路径在消息里已带 rawFrequency；没有时回退到 frequency。
   */
  rawFrequency?: number
  /**
   * 本路径的帧间隔（ms），交给多帧一致按**时间**换算帧数（见 lib/note-confirm.ts 的
   * `NOTE_CONFIRM_TARGET_MS`）。三条路径帧率差 17 倍（worklet 10.7ms / Tauri 50ms /
   * ScriptProcessor ~186ms），不报就会按 worklet 口径算，回退路径上确认延迟会放大成 ~0.5s。
   */
  frameMs?: number
}

export interface UseAudioInputOptions {
  // ---------------- 环境 ----------------
  isTauri: boolean
  language: string
  t: (key: string) => string
  /** 当前乐器（仅用于日志） */
  instrumentName: string
  /** 乐器配置：最低弦频率决定 YIN 门限与检测下限 */
  instrumentConfig: { lowestStringHz: number }

  // ---------------- 跨域共用的状态镜像 ref ----------------
  // 🚨 这几个 ref 由页面持有、页面里的 `processPracticeMatch` 也读它们，
  //    必须共用**同一个对象**（各建一份就会「练习看到的门限」与「收音用的门限」分叉）。
  /** 置信度门限（worklet 消息先过这道门） */
  confidenceThresholdRef: { current: number }
  /** 当前音高算法（ScriptProcessor 回退路径按它选 YIN / SOLO） */
  pitchAlgorithmRef: { current: string }
  /** 是否正在练习（worklet 回调据此决定要不要送判定） */
  isPlayingRef: { current: boolean }
  /** 命中回调 —— 页面的 `processPracticeMatchRef`，避免长生命周期音频回调捕获旧闭包 */
  processMatchRef: { current: ((input: DetectedPitchForMatch) => void) | null }

  // ---------------- store（页面是唯一入口） ----------------
  micEnabled: boolean
  setMicEnabled: (v: boolean) => void
  /**
   * 用户**显式关**过音频输入才为 true（决定 Tauri 启动时是否恢复采集）。
   * `undefined` = 旧持久化数据未写过该键，按「没关过」处理（见 `!== true` 的判定）。
   */
  micUserDisabled: boolean | undefined
  selectedAudioDevice: string
  setSelectedAudioDevice: (v: string) => void
  inputGain: number
  noiseFloor: number | undefined
  setNoiseFloor: (v: number) => void
  /** 期望采样率（可选 —— 未设时由 `ensureCaptureRunning` 落到 48000） */
  sampleRate: number | undefined
  audioBackend: AudioBackend | undefined
  setAudioInitializing: (v: boolean) => void
  setAudioError: (v: string | null) => void
  setDetectedPitch: (v: string | null) => void
  setDetectedCents: (v: number | null) => void

  // ---------------- MIDI ----------------
  midiEnabled: boolean
  setMidiEnabled: (v: boolean) => void
  selectedMidiDevice: string
  /**
   * MIDI note-on 的处理入口 —— 页面的 `handleMIDINoteInputRef`。
   * 与 `processMatchRef` 同理：设备订阅回调的生命周期比页面渲染长，
   * 经 ref 取值才能拿到最新闭包（页面里的 `handleMIDINoteInput` 依赖
   * 练习状态，每次渲染重建）。
   */
  handleMIDINoteInputRef: { current: ((note: string) => void) | null }

  // ---------------- 练习 / 调音器 ----------------
  isPlaying: boolean
  tunerActive: boolean
  stopTuner: () => Promise<void>
  /** 只拆调音器链路（不碰 UI 状态、不发 toast），见 hooks/use-tuner.ts */
  tunerDisposeChain: () => void
}

export interface AudioInputHandle {
  // 设置面板 / JSX 消费
  useAudioWorklet: boolean
  setUseAudioWorklet: (v: boolean) => void
  midiDevices: WebMidi.MIDIInput[]
  noiseCalibrating: boolean
  noiseCalibrationCountdown: number | null
  noiseCalibrationProgress: number | null
  calibrateNoiseFloor: () => Promise<void>
  /** 清掉校准结果（设置重置时用），见实现处说明 */
  clearNoiseFloor: () => void
  stopAudioInput: () => void

  // 与页面的 processPracticeMatch 共用同一批可变 ref
  cooldownRef: { current: ReturnType<typeof setTimeout> | null }
  isCoolingDownRef: { current: boolean }
  noteConfirmStateRef: { current: NoteConfirmState | null }
}

export function useAudioInput(options: UseAudioInputOptions): AudioInputHandle {
  const {
    isTauri,
    language,
    t,
    instrumentName,
    instrumentConfig,
    confidenceThresholdRef,
    pitchAlgorithmRef,
    isPlayingRef,
    processMatchRef,
    micEnabled,
    setMicEnabled,
    micUserDisabled,
    selectedAudioDevice,
    setSelectedAudioDevice,
    inputGain,
    noiseFloor,
    setNoiseFloor,
    sampleRate,
    audioBackend,
    setAudioInitializing,
    setAudioError,
    setDetectedPitch,
    setDetectedCents,
    midiEnabled,
    setMidiEnabled,
    selectedMidiDevice,
    handleMIDINoteInputRef,
    isPlaying,
    tunerActive,
    stopTuner,
    tunerDisposeChain,
  } = options

  // ---------------- 音频图 / 检测链 ----------------
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)
  const [useAudioWorklet, setUseAudioWorklet] = useState(true)

  // ---------------- 环境噪声校准（P1）----------------
  const [noiseCalibrating, setNoiseCalibrating] = useState(false)
  /** 倒计时剩余秒数；null = 不在倒计时（未开始 / 已进入采样 / 已结束） */
  const [noiseCalibrationCountdown, setNoiseCalibrationCountdown] = useState<number | null>(null)
  /** 采样进度（已采轮数），仅采样阶段非 null */
  const [noiseCalibrationProgress, setNoiseCalibrationProgress] = useState<number | null>(null)
  /** 同一时刻只允许一次校准（重复点击 / 关麦竞态） */
  const noiseCalibratingRef = useRef(false)
  /** 校准的中止开关：关掉麦克风、离开页面时置 true */
  const noiseCalibrationAbortRef = useRef(false)

  // ---------------- MIDI ----------------
  const [midiDevices, setMidiDevices] = useState<WebMidi.MIDIInput[]>([])
  const [midiAccess, setMidiAccess] = useState<WebMidi.MIDIAccess | null>(null)

  // ---------------- 收音链路的句柄 ----------------
  const pitchDetectionRef = useRef<number | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const cooldownRef = useRef<NodeJS.Timeout | null>(null)
  const isCoolingDownRef = useRef(false)
  // 收音两级前置滤波的状态（详见 lib/note-confirm.ts）。
  // - onsetState 仅 ScriptProcessor 回退路径需要：另两条路径的起音由 worklet / Rust 算好发过来。
  // - confirmState 三条路径共用（都在页面的 processPracticeMatch 里过这道门）。
  const onsetStateRef = useRef<OnsetState | null>(null)
  if (onsetStateRef.current === null) onsetStateRef.current = createOnsetState()
  const noteConfirmStateRef = useRef<NoteConfirmState | null>(null)
  if (noteConfirmStateRef.current === null) noteConfirmStateRef.current = createNoteConfirmState()
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const handleAudioWorkletMessageRef = useRef<((message: { type: string; data: unknown }) => void) | null>(null)
  /** `disposeTunerChain` 经 ref 调用：卸载清理的 deps 是 `[]`，直接引用会让它每次渲染重建。 */
  const tunerDisposeChainRef = useRef(tunerDisposeChain)
  tunerDisposeChainRef.current = tunerDisposeChain

  // 音频输入处理

  /**
   * 把与 ScriptProcessor 路径一致的动态 YIN 参数推送给 worklet
   * （低频目标 threshold/cliff 0.05，其余 0.1）。带变更守卫，参数没变就不发消息。
   * #23：此前 worklet 的门限一直是硬编码默认值（threshold 0.15），低音弦的检测质量与
   * ScriptProcessor 路径不一致。
   */
  const workletYinParamsKeyRef = useRef('')
  // 音高检测下限随乐器变化：吉他族保持 70Hz 级（搜索下限本身就是工频哼声护栏），
  // 只有贝斯/七弦这类真有 30~62Hz 音的乐器才下探。TS 路径（ScriptProcessor 回退）与
  // worklet 共用这个值 —— 前者读模块级设置，后者由 syncWorkletYinParams 推送。
  useEffect(() => {
    const floor = detectFloorForLowestHz(instrumentConfig.lowestStringHz)
    setMinDetectFreq(floor)
    logger.debug('音高检测下限已按乐器设置', 'instrument:', instrumentName, 'lowestStringHz:', instrumentConfig.lowestStringHz, 'floor(Hz):', floor.toFixed(2))
    // 桌面端还要同步 YIN 门限（与 web 三条路径同源，见 lib/pitch-detection 的 resolveYinThreshold）：
    // Rust detector 默认 0.15，跨会话从不自动调整（只受 set_pitch_threshold 影响，此前零调用）
    // ⇒ 贝斯/七弦低 B 用户永远拿不到放宽后的 0.2（低频段 CMND 天然偏高，门限越紧越检不出）。
    // 本 effect 是唯一同步点（挂载 + 每次换乐器都跑）；detector 常驻 pipeline，与是否在采集无关。
    if (isTauri) {
      void import('@/lib/native-audio').then(({ setPitchThreshold }) =>
        setPitchThreshold(resolveYinThreshold(instrumentConfig.lowestStringHz))
      )
    }
  }, [instrumentConfig.lowestStringHz, instrumentName, isTauri])

  const syncWorkletYinParams = useCallback(() => {
    const node = audioWorkletNodeRef.current
    // 门限按乐器音域解析，与 TS 两条路径同源（见 lib/pitch-detection 的 resolveYinThreshold）
    const threshold = resolveYinThreshold(instrumentConfig.lowestStringHz)
    const probabilityCliff = 0.1
    const floor = getMinDetectFreq()
    const key = `${threshold}/${probabilityCliff}/${floor.toFixed(2)}`
    if (key === workletYinParamsKeyRef.current) return
    workletYinParamsKeyRef.current = key
    if (!node) return
    node.port.postMessage({ type: 'updateParams', data: { threshold, probabilityCliff, minDetectFreq: floor } })
  }, [instrumentConfig.lowestStringHz])

  /**
   * 把校准结果**立刻**下发给当前在跑的两条收音路径。
   *
   * - worklet：`updateParams.noiseFloor` 是一次性覆盖（之后 worklet 照常 EMA 跟踪）。
   *   页面**不会**每帧下发 —— 那会把 EMA 钉死，换房间 / 关空调后门限再也不能自适应。
   * - TS 路径（ScriptProcessor 回退）：`lib/pitch-detection` 的噪声底是**模块级/进程级**状态。
   *   只下发 worklet 会复现「开 worklet 测得到、关掉测不到」的双路径分叉（本项目踩过）。
   */
  const applyNoiseFloor = useCallback((floor: number) => {
    seedPitchDetectionNoiseFloor(floor)
    const node = audioWorkletNodeRef.current
    if (node) {
      node.port.postMessage({ type: 'updateParams', data: { noiseFloor: floor } })
    }
  }, [])

  /**
   * 把校准结果**清掉**，回到「没校准过」的初始态。设置重置时由页面调用。
   *
   * `resetSettings` 会把 audio slice（含 `noiseFloor`）恢复默认，运行中的收音链路
   * 必须同步 —— 否则是「设置已重置，门限却还按着之前那间屋子的底噪走」。
   * worklet 侧传 `null` 表示**清除**（内部回落到 0.0005，之后照常 EMA 跟踪）；
   * TS 侧 `resetPitchDetectionState()` 把模块级噪声底与 SOLO 单例一起复位
   * （它同时清掉 `pendingSoloNoiseFloor` 那笔账）。
   */
  const clearNoiseFloor = useCallback(() => {
    const node = audioWorkletNodeRef.current
    if (node) {
      node.port.postMessage({ type: 'updateParams', data: { noiseFloor: null } })
    }
    resetPitchDetectionState()
  }, [])

  /**
   * 用户主动校准环境噪声底：倒计时 3 秒 → 采样 1 秒（50 帧）→ 取 85 百分位。
   * 测量口径见 `lib/noise-calibration.ts`（只借竞品 GuitarRun 的**测量方法**，
   * 门限仍用本项目的 `max(0.0008, 底噪 × 1.5)`，不是它的 ×3.2）。
   *
   * 采样点选在 `analyser`：链路是 `source → gain → analyser → worklet/scriptProcessor`，
   * 与检测器看到的是**同一条链路、同一个增益**，所以量出来的值可以和门限直接比较。
   *
   * 失败一律「如实报错 + 让用户重试」，**不悄悄回落默认值** —— 那会让用户以为量准了。
   */
  const calibrateNoiseFloor = useCallback(async () => {
    if (noiseCalibratingRef.current) return
    if (isTauriEnv()) {
      // 桌面版走 Rust cpal，Web Audio 的 analyser 不在链路上，量不到真实底噪
      toast.info(t('noise_calib_tauri_unsupported'))
      return
    }
    const analyser = analyserNode
    if (!analyser) {
      toast.error(t('noise_calib_need_mic'))
      return
    }

    noiseCalibratingRef.current = true
    noiseCalibrationAbortRef.current = false
    setNoiseCalibrating(true)
    try {
      let frame = new Float32Array(analyser.fftSize)
      const result = await runNoiseFloorCalibration({
        readFrame: () => {
          // fftSize 理论上不变，但切设备后可能重建 analyser；长度不符就重取，避免抛错
          if (frame.length !== analyser.fftSize) frame = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(frame)
          return calculateRMS(frame)
        },
        sleep: (ms) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms) }),
        // 倒计时阶段报 3/2/1，进入采样时报 0（UI 用它切换成「采样中」）
        onCountdown: (s) => setNoiseCalibrationCountdown(s > 0 ? s : null),
        onProgress: (sampled) => setNoiseCalibrationProgress(sampled),
        isCancelled: () => noiseCalibrationAbortRef.current,
      })

      if (!result) {
        toast.error(t('noise_calib_failed'))
        return
      }

      setNoiseFloor(result.noiseFloor)
      applyNoiseFloor(result.noiseFloor)
      logger.debug(
        '[噪声校准] 完成',
        `noiseFloor=${result.noiseFloor.toFixed(6)}`,
        `raw=${result.raw.toFixed(6)}`,
        `samples=${result.sampleCount}`,
        `gate=${onsetGateFromNoiseFloor(result.noiseFloor).toFixed(6)}`
      )
      toast.success(
        t('noise_calib_done')
          .replace('{noise}', formatNoisePercent(result.noiseFloor))
          .replace('{gate}', formatNoisePercent(onsetGateFromNoiseFloor(result.noiseFloor)))
      )
    } catch (err) {
      console.error('噪声校准失败:', err)
      toast.error(t('noise_calib_failed'))
    } finally {
      setNoiseCalibrating(false)
      setNoiseCalibrationCountdown(null)
      setNoiseCalibrationProgress(null)
      noiseCalibratingRef.current = false
    }
  }, [analyserNode, setNoiseFloor, applyNoiseFloor, t])

  // 卸载时中止未完成的校准（否则定时器会在组件消失后继续跑，最后 setState 到已卸载组件）
  useEffect(() => () => { noiseCalibrationAbortRef.current = true }, [])

  // 实际的音高检测逻辑 - 完全按照原HTML文件的processAudio实现
  const runPitchDetection = useCallback((analyser: AnalyserNode, ctx: AudioContext, scriptProcessor: ScriptProcessorNode) => {
    logger.debug('音高检测已启动，使用 ScriptProcessorNode，sampleRate:', ctx.sampleRate)
    
    // 性能优化：防抖和节流变量
    let lastPitchUpdateTime = 0
    let lastDetectedPitch: string | null = null
    const PITCH_UPDATE_INTERVAL = 50 // 音高更新间隔 50ms
    
    // 使用 ScriptProcessorNode 的 onaudioprocess 事件处理音频
    scriptProcessor.onaudioprocess = (event) => {
      // 检查是否需要停止
      if (!scriptProcessorRef.current) {
        logger.debug('音高检测已停止')
        return
      }
      
      // 检查是否在冷却期内
      if (isCoolingDownRef.current) return
      
      // 获取输入音频数据
      const inputData = event.inputBuffer.getChannelData(0)
      const sampleRate = ctx.sampleRate

      // 起音检测必须跑在下面两个提前 return **之前**：
      // 门限以下的帧也要更新 prevRms，否则「从门限下升上来」的那一帧永远判不出起音
      // （worklet 侧同样把它放在噪声门之前，见 audio-worklet-processor.js 的 process()）。
      //
      // 门限由 `updateOnsetGate(energy)` 从本帧**原始** RMS 推进的环境底噪算出，与
      // worklet / Rust 同规则（`max(0.0008, 底噪 × 1.5)`），所以同一间屋子三条路径
      // 的门限一致。此前这里写死 0.001，与校准后的底噪脱钩（见文件上方注释）。
      const energy = calculateRMS(inputData)
      const isNoteOnset = detectOnset(
        energy,
        updateOnsetGate(energy),
        performance.now(),
        onsetStateRef.current!
      )
      
      // 获取当前状态
      const currentPitchAlgorithm = pitchAlgorithmRef.current
      
      // YIN 门限：按乐器音域解析（低频乐器 0.2 / 其余 0.15），与 worklet 路径同源。
      // 此前这里按「目标音是否 <110Hz」判定并给低频下发 0.05 —— 该判定恒为 false，
      // 且方向相反（threshold 越小越严格），从未生效。
      const yinParams = {
        threshold: resolveYinThreshold(instrumentConfig.lowestStringHz),
        probabilityCliff: 0.1,
      }
      
      // 根据设置选择算法
      let yinResult: { frequency: number; probability: number } | null = null
      
      if (currentPitchAlgorithm === 'solo') {
        // 使用SOLO FFT加速算法
        const soloAnalyser = getSOLOYinAnalyser(inputData.length, sampleRate, yinParams.threshold)
        const soloResult = soloAnalyser.analyze(inputData)
        if (soloResult && soloResult.valid) {
          yinResult = {
            frequency: soloResult.frequency,
            probability: soloResult.probability
          }
        }
      } else {
        // 使用标准YIN算法（使用实际采样率，避免 44100 设备偏高 1.46 半音）
        yinResult = YINPitchDetection(inputData, sampleRate, yinParams.threshold, yinParams.probabilityCliff)
      }
      
      if (!yinResult || !yinResult.frequency) {
        return
      }
      
      // 噪声门：与 worklet 的 `adaptiveThreshold` 是**同一个值、同一个量**。
      // worklet 用这一个值同时干两件事 —— 起音判定与噪声门（`if (energy < adaptiveThreshold) return`），
      // 两者都吃本帧的**原始** RMS；所以这里也必须用 `getOnsetGate()`（上面起音检测刚推进过的那个门限），
      // 而不是另立一个阈值 —— 那条老写法是按**检测频率**分档的两个字面量，worklet 侧没有这个分档：
      //       const energyThreshold = yinResult.frequency < 110 ? 0.001 : 0.002
      //       if (energy < energyThreshold) {
      // 于是两条 Web 路径的灵敏度不一致，且方向随底噪翻转：
      //   · 底噪低（未校准 ⇒ 门限 0.0008）时这个字面量更严格 ⇒ 轻弹「开着 worklet 测得到、关掉测不到」；
      //   · 底噪高（校准到 0.02 ⇒ 门限 0.03）时它更宽松 ⇒ 纯环境抖动被当成有信号送进匹配。
      // 护栏见 __tests__/onset-gate.test.ts 的 ④（双向缝隙证明 + 源码解析）。
      if (energy < getOnsetGate()) {
        return
      }
      
      // 谐波增强处理 - 特别针对低频（与原文件一致）
      let detectedFreq = yinResult.frequency
      if (detectedFreq < 110) {
        const possibleFundamental = detectedFreq / 2
        let fundamentalResult: { frequency: number; probability: number } | null = null
        
        if (currentPitchAlgorithm === 'solo') {
          const soloAnalyser2 = getSOLOYinAnalyser(inputData.length, sampleRate, yinParams.threshold)
          const soloResult = soloAnalyser2.analyze(inputData)
          if (soloResult && soloResult.valid) {
            fundamentalResult = {
              frequency: soloResult.frequency,
              probability: soloResult.probability
            }
          }
        } else {
          fundamentalResult = YINPitchDetection(inputData, sampleRate, yinParams.threshold, yinParams.probabilityCliff)
        }
        
        if (fundamentalResult && fundamentalResult.frequency &&
            Math.abs(fundamentalResult.frequency - possibleFundamental) < 5) {
          detectedFreq = possibleFundamental
        }
      }
      
      const now = Date.now()
      
      // 获取检测到的音符用于显示
      const detectedNote = frequencyToNoteName(detectedFreq)
      
      // 性能优化：节流更新音高显示（每50ms更新一次，且音高有变化时）
      if (now - lastPitchUpdateTime >= PITCH_UPDATE_INTERVAL && detectedNote !== lastDetectedPitch) {
        setDetectedPitch(detectedNote)
        lastPitchUpdateTime = now
        lastDetectedPitch = detectedNote
      }
      
      // 调用共用的练习匹配逻辑（Web 和 Tauri 两条路径共用）
      // `?.` 是防御性的：页面在渲染期就把它赋成 `processPracticeMatch`，首帧回调之前已非 null。
      processMatchRef.current?.({
        frequency: detectedFreq,
        note: detectedNote,
        probability: yinResult.probability,
        isNoteOnset,
        rawFrequency: detectedFreq,
        frameMs: frameMsOf(SCRIPT_PROCESSOR_BUFFER_SIZE, sampleRate)
      })
    }
    // 🚨 `pitchAlgorithmRef` / `processMatchRef` 是**页面持有的 ref**（`useRef` 结果经 option
    //    传入），身份恒定，不需要也不应该进 deps。ESLint 只认「本组件内 useRef 出来的」是
    //    ref，认不出 props 里的，故这里显式豁免（下同）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentConfig.lowestStringHz, setDetectedPitch])

  // 直接使用节点启动音高检测（用于避免React状态延迟）
  const startPitchDetectionWithNodes = useCallback((analyser: AnalyserNode, ctx: AudioContext, scriptProcessor: ScriptProcessorNode) => {
    logger.debug('startPitchDetectionWithNodes 被调用')
    runPitchDetection(analyser, ctx, scriptProcessor)
  }, [runPitchDetection])

  // 处理 AudioWorklet 消息

  // 更新 AudioWorklet 消息处理函数的 ref
  const handleAudioWorkletMessage = useCallback((message: { type: string; data: unknown }) => {
    const { type, data } = message

    // 练习目标变化时同步动态 YIN 参数到 worklet（低频目标用更宽松的门限）
    syncWorkletYinParams()
    
    if (type === 'pitchDetected') {
      const pitchData = data as { 
        frequency: number | null
        probability: number
        clarity: number
        energy: number
        hasSignal: boolean
        /** YIN 原始频率（未经 smoothFrequency 平滑）；判定用它、显示用 frequency */
        rawFrequency?: number | null
        /** worklet 的 _detectAmplitudeDiff 结果，作为多帧一致的起音信号 */
        isNoteOnset?: boolean
      }
      
      
      // 处理音高检测结果 - 使用与 ScriptProcessorNode 相同的逻辑
      if (pitchData.frequency && pitchData.hasSignal && pitchData.probability > (confidenceThresholdRef.current || 0.8)) {
        const detectedNote = frequencyToNoteName(pitchData.frequency)
        if (detectedNote) {
          setDetectedPitch(detectedNote)
          
          // 如果正在练习，处理匹配逻辑
          if (isPlayingRef.current && !isCoolingDownRef.current) {
            // `?.` 是防御性的：页面在渲染期就把它赋成 `processPracticeMatch`，首帧回调之前已非 null。
      processMatchRef.current?.({
              frequency: pitchData.frequency,
              note: detectedNote,
              probability: pitchData.probability,
              isNoteOnset: pitchData.isNoteOnset,
              rawFrequency: pitchData.rawFrequency ?? undefined,
              frameMs: frameMsOf(AUDIO_WORKLET_HOP_SIZE, audioContextRef.current?.sampleRate ?? 0)
            })
          }
        }
      }
    } else if (type === 'debug') {
      logger.debug('AudioWorklet Debug:', data)
    }
    // 同上：`confidenceThresholdRef` / `isPlayingRef` / `processMatchRef` 是页面传入的 ref。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDetectedPitch, syncWorkletYinParams])

  // 更新 AudioWorklet 消息处理函数的 ref
  useEffect(() => {
    handleAudioWorkletMessageRef.current = handleAudioWorkletMessage
  }, [handleAudioWorkletMessage])

  const startAudioInput = useCallback(async () => {
    // Tauri 环境使用 Rust cpal 直接采集，不走 getUserMedia（避免 WebView2 权限弹窗）
    if (isTauriEnv()) {
      logger.warn('Tauri 环境应使用 native audio，startAudioInput 已阻止')
      return
    }
    // 复位检测器的自适应状态（噪声底跨帧累积，且 TS 路径是模块级/进程级状态）
    resetPitchDetectionState()
    // 复位后如果用户之前校准过房间，就把它当作本次会话的起点，而不是让 EMA 从 0.0005
    // 慢慢爬（上升 alpha 是 0.0005，约需 20 秒）—— 那 20 秒正是换房间后误检最多的时候。
    if (noiseFloor !== undefined) {
      seedPitchDetectionNoiseFloor(noiseFloor)
    }
    if (tunerActive) {
      stopTuner()
    }
    if (audioContext) {
      return
    }
    logger.debug('startAudioInput: 开始初始化音频...')
    setAudioInitializing(true)
    setAudioError(null)
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const errorMsg = language === 'zh-CN' 
          ? isHttps 
            ? '浏览器不支持音频输入，请更换浏览器（Chrome/Firefox/Edge）'
            : '音频输入需要 HTTPS 安全连接。请使用 HTTPS 地址访问，或下载桌面版应用'
          : isHttps 
            ? 'Browser does not support audio input. Please try Chrome/Firefox/Edge'
            : 'Audio input requires HTTPS. Please use HTTPS URL or download the desktop app'
        toast.error(errorMsg)
        setAudioError(errorMsg)
        throw new Error(errorMsg)
      }

      try {
        const { needsUserInteractionForAudio, handleIOSAudioUnlock } = await import('@/lib/ios-compat')
        if (needsUserInteractionForAudio()) {
          await handleIOSAudioUnlock()
        }
      } catch {
        // iOS compat not available, continue
      }
      // 音频约束 - 与原HTML文件一致
      //
      // `latency` 是 Chrome 的实验性约束，不在标准 `MediaTrackConstraints` 里。
      // 用交叉类型补齐，而不是 `@ts-ignore` —— 后者会连这一整段里**其它真正的类型错误**
      // 一起吞掉（比如哪天 `sampleRate` 拼错也不会报错）。
      const audioConstraints: MediaTrackConstraints & { latency?: number } = {
        deviceId: selectedAudioDevice ? { ideal: selectedAudioDevice } : undefined,
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0.01
      }
      const constraints: MediaStreamConstraints = { audio: audioConstraints }
      let stream: MediaStream
      logger.debug('startAudioInput: 正在调用 getUserMedia...')
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        logger.debug('startAudioInput: getUserMedia 成功')
      } catch (permissionErr: unknown) {
        console.error('startAudioInput: getUserMedia 失败:', permissionErr)
        const err = permissionErr as { name?: string; message?: string }
        let errorMsg = ''
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = language === 'zh-CN'
            ? '麦克风权限被拒绝。请在浏览器设置中允许访问麦克风，然后刷新页面重试。'
            : 'Microphone permission denied. Please allow microphone access in browser settings and refresh the page.'
        } else if (err.name === 'NotFoundError') {
          errorMsg = language === 'zh-CN'
            ? '未找到麦克风设备。请检查麦克风是否已连接。'
            : 'No microphone found. Please check if your microphone is connected.'
        } else if (err.name === 'NotReadableError') {
          errorMsg = language === 'zh-CN'
            ? '麦克风被其他应用程序占用。请关闭其他使用麦克风的应用后重试。'
            : 'Microphone is being used by another application. Please close other apps using the microphone and try again.'
        } else {
          errorMsg = language === 'zh-CN'
            ? `无法访问麦克风: ${err.message || '未知错误'}`
            : `Cannot access microphone: ${err.message || 'Unknown error'}`
        }
        toast.error(errorMsg)
        setAudioError(errorMsg)
        throw permissionErr
      }
      mediaStreamRef.current = stream
      
      // 创建 AudioContext - 与原HTML文件一致，固定48000采样率
      const ctx = new (getAudioContextClass())({
        sampleRate: 48000,
        latencyHint: 'interactive'
      })
      const source = ctx.createMediaStreamSource(stream)
      
      const gainNode = ctx.createGain()
      gainNode.gain.value = inputGain
      gainNodeRef.current = gainNode
      
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      
      // 尝试使用 AudioWorklet，如果不支持则回退到 ScriptProcessorNode
      let useWorklet = useAudioWorklet && !!ctx.audioWorklet
      logger.debug('startAudioInput: 检查 AudioWorklet 支持...', 'useAudioWorklet:', useAudioWorklet, 'ctx.audioWorklet:', !!ctx.audioWorklet)
      if (useAudioWorklet && ctx.audioWorklet) {
        try {
          // 加载 AudioWorklet 处理器
          logger.debug('startAudioInput: 正在加载 AudioWorklet 模块...')
          const workletPath = getAudioWorkletModulePath()
          await ctx.audioWorklet.addModule(workletPath)
          logger.debug('startAudioInput: AudioWorklet 模块加载成功, path:', workletPath)
          
          // 创建 AudioWorkletNode
          const workletNode = new AudioWorkletNode(ctx, 'pitch-detection-processor', {
            processorOptions: {
              sampleRate: ctx.sampleRate,
              // 4096（原 2048）：YIN 可解析的最长周期是 halfBufferSize 个采样，
              // 2048 只能到 ~46.9Hz，贝斯 E1(41.2)/B0(30.9) 与七弦低 B(61.7，tau=777>684 上限) 都够不到。
              // hopSize 不变，因此检测刷新率/延迟不变（仍是 512/48000 ≈ 10.7ms 一帧）。
              bufferSize: 4096,
              hopSize: 512,
              // 用户主动校准过的环境噪声底，作为 worklet 的初值。
              // undefined 时 worklet 自己回落到 0.0005 并由 EMA 慢慢爬 —— 那是「没校准过」的正常路径。
              noiseFloor,
            }
          })
          audioWorkletNodeRef.current = workletNode
          
          // 推送初始动态 YIN 参数（低频目标判定），此后由消息处理器在目标变化时同步
          syncWorkletYinParams()
          
          // 设置消息处理 - 使用 ref 确保始终调用最新的回调
          workletNode.port.onmessage = (event) => {
            if (handleAudioWorkletMessageRef.current) {
              handleAudioWorkletMessageRef.current(event.data)
            }
          }
          
          // 连接音频节点（不连接到扬声器，避免音频反馈）
          source.connect(gainNode)
          gainNode.connect(analyser)
          analyser.connect(workletNode)
          
          useWorklet = true
          logger.debug('AudioWorklet 初始化成功')
        } catch (workletError) {
          console.warn('AudioWorklet 初始化失败，回退到 ScriptProcessorNode:', workletError)
          setUseAudioWorklet(false)
        }
      }
      
      // 如果不使用 AudioWorklet，使用 ScriptProcessorNode
      if (!useWorklet) {
        // 性能优化：增大缓冲区减少回调频率（从4096增加到8192）
        // ⚠️ 这个长度决定了本路径的帧间隔（~186ms @44.1k），多帧一致的帧数由它换算
        //    （见 frameMsOf(SCRIPT_PROCESSOR_BUFFER_SIZE, …)）。改动此处会让确认延迟跟着变。
        const scriptProcessor = ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1)
        scriptProcessorRef.current = scriptProcessor
        
        source.connect(gainNode)
        gainNode.connect(analyser)
        analyser.connect(scriptProcessor)
        // ScriptProcessorNode 需要连接到 destination 才能触发 onaudioprocess
        // 但我们创建一个静音的 gain 节点来避免声音输出
        const silentGain = ctx.createGain()
        silentGain.gain.value = 0
        scriptProcessor.connect(silentGain)
        silentGain.connect(ctx.destination)
        
        startPitchDetectionWithNodes(analyser, ctx, scriptProcessor)
      }
      
      setAudioContext(ctx)
      setAnalyserNode(analyser)
      setAudioError(null)
      
      const modeText = useWorklet ? 'AudioWorklet' : 'ScriptProcessorNode'
      logger.debug(`%c[音频模式] 当前使用: ${modeText}`, 'color: #00ff00; font-size: 14px; font-weight: bold;')
      logger.debug(`[音频模式] useWorklet: ${useWorklet}, useAudioWorklet状态 ${useAudioWorklet}`)
      
      toast.success(language === 'zh-CN' ? 
        (useWorklet ? '音频输入已启用(AudioWorklet)' : '音频输入已启用(ScriptProcessor)') : 
        (useWorklet ? 'Audio input started (AudioWorklet)' : 'Audio input started (ScriptProcessor)'))
    } catch (err) {
      console.error('Failed to start audio input:', err)
      setMicEnabled(false)
      throw err
    } finally {
      setAudioInitializing(false)
    }
    // 🚨 搬迁前这里挂着一条 `eslint-disable-next-line react-hooks/exhaustive-deps`，
    //    理由是「`startPitchDetectionWithNodes` 声明在本回调之后，写进 deps 会 TDZ」，
    //    并顺带声称「函数体并不使用 `tunerActive`/`stopTuner`」—— 后者与事实不符
    //    （`startAudioInput` 开头就在用它们，只是靠省略依赖侥幸拿到不算太旧的闭包）。
    //    搬进本 hook 后：`runPitchDetection` / `startPitchDetectionWithNodes` 都排在
    //    本回调**之前**，`tunerActive`/`stopTuner` 是显式 option ⇒ 依赖照实写全，
    //    这段历史遗留的例外可以删掉，闭包也不会再陈旧。
  }, [noiseFloor, audioContext, setAudioInitializing, setAudioError, selectedAudioDevice, inputGain, useAudioWorklet, language, syncWorkletYinParams, setMicEnabled, startPitchDetectionWithNodes, tunerActive, stopTuner])

  const stopAudioInput = useCallback(() => {
    // 关麦会拆掉 analyser 所在的链路 ⇒ 正在跑的校准必须中止，否则它会在静默中
    // 采到一堆「读不到帧」的无效样本，最后报一个假的「环境很安静」结果。
    // （中止后 runNoiseFloorCalibration 返回 null，UI 提示重试。）
    noiseCalibrationAbortRef.current = true
    // 停止 AudioWorkletNode
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.port.onmessage = null
      audioWorkletNodeRef.current.disconnect()
      audioWorkletNodeRef.current = null
    }
    
    // 停止 ScriptProcessorNode
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    // 停止增益节点
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
      gainNodeRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
      setAudioContext(null)
    }
    if (pitchDetectionRef.current) {
      cancelAnimationFrame(pitchDetectionRef.current)
      pitchDetectionRef.current = null
    }
    // 清理冷却期
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current)
      cooldownRef.current = null
    }
    isCoolingDownRef.current = false
    setAnalyserNode(null)
    setMicEnabled(false)
    setDetectedPitch(null)
    setDetectedCents(null)
  }, [audioContext, setDetectedCents, setDetectedPitch, setMicEnabled])

  // 初始化MIDI - 当开启开关时才申请权限
  useEffect(() => {
    if (!midiEnabled) return
    
    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      navigator.requestMIDIAccess().then(access => {
        setMidiAccess(access)
        const inputs = Array.from(access.inputs.values()).filter(d => d.id)
        setMidiDevices(inputs)
        
        access.onstatechange = () => {
          const updatedInputs = Array.from(access.inputs.values()).filter(d => d.id)
          setMidiDevices(updatedInputs)
        }
      }).catch(err => {
        console.error('MIDI access denied:', err)
        toast.error(t('midi_device_none'))
        setMidiEnabled(false)
      })
    } else {
      toast.error(t('midi_device_none'))
      setMidiEnabled(false)
    }
    // `setMidiEnabled` 是页面的 `useState` setter（React 保证身份恒定），进 deps 无害。
  }, [midiEnabled, t, setMidiEnabled])

  // MIDI消息处理
  useEffect(() => {
    if (!midiEnabled || !midiAccess) return
    
    const handleMIDIMessage = (event: WebMidi.MIDIMessageEvent) => {
      const [command, note, velocity] = event.data
      
      if (command === 144 && velocity > 0) {
        // Note on
        const noteName = NOTES[note % 12]
        setDetectedPitch(noteName)
        
        // 处理MIDI输入 - 使用ref避免循环依赖
        if (handleMIDINoteInputRef.current) {
          handleMIDINoteInputRef.current(noteName)
        }
      }
    }
    
    midiDevices.forEach(device => {
      if (selectedMidiDevice === 'random' || device.id === selectedMidiDevice) {
        device.onmidimessage = handleMIDIMessage
      }
    })
    
    return () => {
      midiDevices.forEach(device => {
        device.onmidimessage = null
      })
    }
    // 同上：`handleMIDINoteInputRef` 是页面传入的 ref。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiEnabled, midiAccess, midiDevices, selectedMidiDevice, setDetectedPitch])

  // 组件卸载时释放全部音频资源。
  // 原实现只在用户主动停止/关面板时释放，切换路由或 HMR 会导致麦克风持续被占用
  // （录音指示灯常亮）以及 AudioContext 泄漏。
  const audioContextRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    audioContextRef.current = audioContext
  }, [audioContext])

  useEffect(() => {
    return () => {
      // 主音频链路
      if (pitchDetectionRef.current) {
        cancelAnimationFrame(pitchDetectionRef.current)
        pitchDetectionRef.current = null
      }
      if (cooldownRef.current) {
        clearTimeout(cooldownRef.current)
        cooldownRef.current = null
      }
      if (audioWorkletNodeRef.current) {
        audioWorkletNodeRef.current.port.onmessage = null
        audioWorkletNodeRef.current.disconnect()
        audioWorkletNodeRef.current = null
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.onaudioprocess = null
        scriptProcessorRef.current.disconnect()
        scriptProcessorRef.current = null
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect()
        gainNodeRef.current = null
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      // 调音器链路 —— 它是一条**独立**的收音路径（自己的 AudioContext + rAF），
      // 但停止练习收音时也必须一起拆掉，否则两条检测链会抢同一个流 / 各自空转。
      // 具体清理逻辑已随调音器搬进 hooks/use-tuner.ts，这里只发号施令
      // （经 ref 调用，避免把 `disposeTunerChain` 放进本回调的 `[]` deps 而连锁重建）。
      tunerDisposeChainRef.current()
    }
  }, [])

  // 当 micEnabled 为 true 时自动启动音频输入（仅限 Web 版本）
  useEffect(() => {
    if (isTauri) return
    if (micEnabled && !audioContext) {
      logger.debug('useEffect: 开始启动音频输入...')
      toast.info(language === 'zh-CN' ? '正在请求麦克风权限...' : 'Requesting microphone permission...')
      startAudioInput().catch(err => {
        console.error('自动启动音频输入失败:', err)
        setMicEnabled(false)
      })
    }
  }, [micEnabled, audioContext, startAudioInput, language, isTauri, setMicEnabled])

  // Tauri 环境：应用启动时把「音频输入」恢复到用户偏好对应的状态
  //
  // 产品语义（2026-10-02 用户确认）：**默认开** —— 「应该直接启用音频输入，
  // 不需要我每次开启，关闭才需要每次关闭」，且选择「跨会话记住」。
  // ⇒ 有效意图 = `micEnabled || micUserDisabled !== true`
  //    （`micUserDisabled` 只有用户在设置页/M 键**显式关**才会置 true；
  //      从没碰过开关 = 默认开。关了的跨会话记住，不会再默认开。）
  //
  // 🚨 这里曾经是一个**静默失效**的根因（用户报「启用音频输入后点开始练习，
  //    弹任何音都没反应，调音也无效」）：
  //
  //    旧实现 `if (micEnabled) return // 已启用则跳过` 把两个不同层级的东西当成一个：
  //      · `micEnabled`      = **持久化的用户意图**（写在 store 里，跨会话保留）
  //      · Rust 采集在不在跑 = **进程级运行时状态**（每次启动应用都归零）
  //    于是：用户开过一次音频 → `micEnabled=true` 被持久化 →
  //    下次启动应用时 store 恢复 true ⇒ 这里直接 return ⇒ **采集从未启动**，
  //    但界面与练习检测都以为「已启用」（`micEnabled` 为 true、练习 effect 照常
  //    startPitchStream）⇒ Rust 侧 `is_capturing()` 为 false ⇒ `pipeline.rs` 的
  //    `if !pipeline.is_capturing()` 守卫让检测线程静默空转（不报错、只是没反应）。
  //
  //    正确判据必须是**真实运行状态**：先问 Rust「你现在在采集吗」，
  //    只有它说没在采集、而用户意图是「开」时，才去启动采集。
  useEffect(() => {
    if (!isTauri) return

    let cancelled = false
    const restoreAudio = async () => {
      try {
        const { getAudioStatus, stopAudioCapture, ensureCaptureRunning, setNoiseSuppression, setFilters, setGain, setBufferSize } = await import('@/lib/native-audio')

        // ① 先读**真实状态**（不要相信 micEnabled 这个意图标志）
        let actuallyCapturing = false
        try {
          const status = await getAudioStatus()
          actuallyCapturing = !!status.isCapturing
        } catch {
          // 读不到状态时按「未采集」处理：宁可多启动一次（start 是幂等的），
          // 也不要因为读失败就永远不启动采集。
          actuallyCapturing = false
        }
        if (cancelled) return

        // ①.5 把**落盘的音频设置**同步到后端（preprocessor / capture gain 都是**进程级状态**）：
        //      Rust 每次启动一律回到编译期默认值（例如 60Hz 陷波默认**开**、噪声门倍数默认
        //      1.5），而设置页显示的是 store 落盘值（默认 60Hz 陷波**关**）⇒ 不主动对齐就是
        //      「界面显示 A、后端实际跑 B」，用户拖过控件才偶然一致。
        //      同步与「采集开没开」无关（preprocessor 常驻 pipeline），所以放在意图分支
        //      **之前**：哪怕这次意图是「关」，下次开采集时设置也已经是正确的。
        //      `bufferSize` 同属此列：它是 capture 的配置字段，起流时按它设置固定缓冲
        //      （Rust 每次启动回到 DEFAULT_BUFFER_SIZE），不同步就是「设置页显示 2048、
        //      流实际用别的」（此前的真机实测是设 4096 用 1024）。
        //      独立 try/catch：同步失败最坏只是设置晚一次生效，绝不能让采集恢复陪葬。
        try {
          const effAudio = getEffectiveAudioSettings(useAppStore.getState().audio)
          await setNoiseSuppression(effAudio.noiseSuppression)
          await setFilters({
            highPass: effAudio.highPass,
            lowPass: effAudio.lowPass,
            notch50: effAudio.notch50,
            notch60: effAudio.notch60,
          })
          await setGain(effAudio.inputGain)
          await setBufferSize(effAudio.bufferSize)
        } catch (syncErr) {
          console.error('[Tauri] 同步音频设置失败:', syncErr)
        }

        // ② 有效意图：显式开过，或从未主动关过（默认开）。
        //    首次默认开生效时把 UI 开关也对齐成「开」（setMicEnabled 不动 micUserDisabled，
        //    那不是用户选择）。
        const micWanted = micEnabled || micUserDisabled !== true
        if (micWanted && !micEnabled) {
          setMicEnabled(true)
        }

        // ③ 有效意图是「关」（用户显式关过，跨会话记住）⇒ 若 Rust 侧还在采集
        //    （例如异常遗留），把它停掉对齐。
        if (!micWanted) {
          if (actuallyCapturing) {
            await stopAudioCapture()
          }
          return
        }

        // ④ 意图是「开」且真的还没在采集 ⇒ 恢复采集（这正是旧实现漏掉的一步）。
        //    设备挑选（已保存 → 系统默认 → 第一个）收敛在 ensureCaptureRunning 唯一一份。
        const r = await ensureCaptureRunning({
          selectedDevice: selectedAudioDevice || undefined,
          sampleRate: sampleRate || 48000,
          backend: audioBackend || 'wasapi_shared',
        })
        if (cancelled) {
          // 如果已被取消（用户手动停止），立即停止捕获
          await stopAudioCapture()
          return
        }
        if (r.started && r.device) {
          setSelectedAudioDevice(r.device)
          logger.info('[Tauri] 已按保存的意图恢复音频输入:', r.device)
        }
      } catch (err) {
        console.error('[Tauri] 恢复音频输入失败:', err)
      }
    }
    restoreAudio()
    return () => { cancelled = true }
    // 🚨 依赖数组刻意只放 [isTauri]：
    //    本 effect 的职责是「启动时对齐一次」。若把 micEnabled 放进依赖，
    //    用户在设置页开关一次就会触发这里重新读状态并与设置页自己的启停竞态
    //    （设置页 startAudio 已经负责启动采集了）。
    //    首帧的 micEnabled 值是 store 恢复后的持久化值，正是我们要用的那个。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri])

  // Tauri 环境：练习模式音高检测 —— 事件驱动
  // WindowsAudioSettings 启用音频后，Rust 后端持续采集；练习进行时启动 Rust 检测线程，
  // 由它按 interval 检测并 emit「pitch-detected」事件，前端订阅处理。
  // （替代原 50ms × async IPC 轮询：省去每秒 ~20 次 Tauri invoke 往返，CPU 与延迟双降）
  useEffect(() => {
    if (!isTauri) return
    if (!micEnabled || !isPlaying || tunerActive) return

    let isActive = true
    let unlisten: (() => void) | null = null
    let stopStream: (() => Promise<void>) | null = null
    let lastDisplayedNote: string | null = null
    let lastDisplayUpdateTime = 0
    const DISPLAY_THROTTLE_MS = 50

    const start = async () => {
      const { listenPitchDetected, startPitchStream, stopPitchStream } = await import('@/lib/native-audio')

      // 动态 import 是异步的：若在等待期间 effect 已被清理（isActive=false），
      // 就不能再订阅/启动流——那时 cleanup 早已执行完，会留下无法回收的监听器与 Rust 线程。
      if (!isActive) return
      stopStream = stopPitchStream

      const off = await listenPitchDetected((event) => {
        if (!isActive) return

        try {
          const result = event.pitch
          if (!result || result.frequency <= 0) return

          // 与 Web 路径对齐：使用 YIN probability（confidence.yin）而非 overall
          // overall = 0.5*yin + 0.25*harmonic + 0.25*temporal，前 ~400ms temporal 未累积会偏低
          // yin probability 单次好检测即可达 0.85-0.99，与 Web AudioWorklet 路径行为一致
          const prob = result.confidence?.yin ?? 0
          const currentConfidenceThreshold = confidenceThresholdRef.current
          if (prob <= currentConfidenceThreshold) return

          const detectedFreq = result.frequency
          const detectedNote = frequencyToNoteName(detectedFreq)
          if (!detectedNote) return

          // 节流更新音高显示
          const now = Date.now()
          if (now - lastDisplayUpdateTime >= DISPLAY_THROTTLE_MS && detectedNote !== lastDisplayedNote) {
            setDetectedPitch(detectedNote)
            lastDisplayUpdateTime = now
            lastDisplayedNote = detectedNote
          }

          // 复用 Web 版的练习匹配逻辑
          // isNoteOnset 是 PitchStreamEvent 的兄弟字段（不在 pitch 里），由 Rust 的
          // detect_amplitude_diff 算出 —— 此前前端从未读取过它。
          // `?.` 是防御性的：页面在渲染期就把它赋成 `processPracticeMatch`，首帧回调之前已非 null。
      processMatchRef.current?.({
            frequency: detectedFreq,
            note: detectedNote,
            probability: prob,
            isNoteOnset: event.isNoteOnset,
            rawFrequency: detectedFreq,
            frameMs: NATIVE_PITCH_INTERVAL_MS
          })
        } catch (e) {
          console.error('Tauri 练习模式音高事件处理错误:', e)
        }
      })

      if (!isActive) {
        off?.()
        return
      }
      unlisten = off

      await startPitchStream(NATIVE_PITCH_INTERVAL_MS)
      // startPitchStream 期间被清理：立即停掉，避免孤儿线程
      if (!isActive) {
        await stopPitchStream().catch(() => {})
      }
    }

    start()

    return () => {
      isActive = false
      if (unlisten) {
        unlisten()
        unlisten = null
      }
      // 停止 Rust 检测线程（捕获不停，由 WindowsAudioSettings 管理）
      stopStream?.()
    }
    // 同上：`confidenceThresholdRef` / `processMatchRef` 是页面传入的 ref。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri, micEnabled, isPlaying, tunerActive, setDetectedPitch])

  return {
    useAudioWorklet,
    setUseAudioWorklet,
    midiDevices,
    noiseCalibrating,
    noiseCalibrationCountdown,
    noiseCalibrationProgress,
    calibrateNoiseFloor,
    clearNoiseFloor,
    stopAudioInput,
    cooldownRef,
    isCoolingDownRef,
    noteConfirmStateRef,
  }
}
