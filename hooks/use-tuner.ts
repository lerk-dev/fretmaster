/**
 * 调音器（Tuner）—— 从 `app/page.tsx` 抽出的**独立功能域**。
 *
 * ## 为什么单独一个 hook
 *
 * 调音器是「一条完全独立的收音路径」：自己的 `AudioContext` + `MediaStream` +
 * rAF 轮询（Web），或复用 Rust 采集后端 + `pitch-detected` 事件流（Tauri）。
 * 它既不经过练习路径的 worklet/ScriptProcessor，也没有环境噪声校准。
 * 把这些 360 行摊在 5481 行的页面组件里，读者为了看懂调音器要翻越整个文件。
 *
 * ## 接口约定（**故意**让页面侧零改动）
 *
 * 返回对象与页面里原有的局部变量**同名同型**，页面侧直接解构即可：
 *
 *     const { tunerOpen, setTunerOpen, tunerActive, detectedNote,
 *             detectedFrequency, cents, startTuner, stopTuner, toggleTuner }
 *       = useTuner({ ... })
 *
 * 这样搬迁不需要动任何 JSX 与调用点。
 *
 * ## 两条容易踩的坑（都有专门测试钉住，勿改）
 *
 * 1. **`startTuner` 不得无差别 `setMicEnabled(false)`**（仅 Web 路径需要）——
 *    `micEnabled` 是设置页「启用音频输入」的**全局**开关，Tauri 下调音器只是复用
 *    同一个 Rust 采集后端。旧实现在这里一刀切地关掉它，导致「碰过一次调音器后
 *    全局开关被悄悄关掉、回练习页完全没反应」。护栏 `tuner-preserve-mic-enabled.test.ts`。
 * 2. **互斥锁必须在第一个 `await` 之前置位、在 `finally` 里释放** ——
 *    `getUserMedia` 的 await 窗口里第二次点击会并发两条启动链，互相覆盖句柄
 *    ⇒ rAF 链 / MediaStream 永久泄漏。护栏 `tuner-reentry-guard.test.ts`。
 *
 * @see __tests__/tuner-reentry-guard.test.ts
 * @see __tests__/tuner-preserve-mic-enabled.test.ts
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  calculateRMS,
  frequencyToNote,
  frequencyToNoteName,
  getSOLOYinAnalyser,
  resolveYinThreshold,
  YINPitchDetection,
} from '@/lib/pitch-detection'
import { getAudioContextClass } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

/** Rust 原生音高流的推送间隔（ms）。与练习路径同源，避免两处漂移。 */
const NATIVE_PITCH_INTERVAL_MS = 50

/** 平滑用的权重表：越新的帧权重越大（index 越新 weight 越大）。 */
const SMOOTHING_WEIGHTS = [0.1, 0.2, 0.3, 0.4]

/** 历史帧缓冲上限（超出后 shift 掉最旧的）。 */
const HISTORY_LIMIT = 5

/** 少于这个帧数时不平滑，直接显示原始检测值。 */
const SMOOTHING_MIN_FRAMES = 3

/** 低于该频率（Hz）启用「二分基频」谐波增强，且用更低的能量门限。 */
const LOW_FREQ_HZ = 110
const LOW_FREQ_RMS_THRESHOLD = 0.001
const NORMAL_RMS_THRESHOLD = 0.002

export interface UseTunerOptions {
  /** 是否 Tauri 桌面形态（决定走 Rust 事件流还是 Web Audio）。 */
  isTauri: boolean
  /** 设置页的「启用音频输入」全局开关。 */
  micEnabled: boolean
  setMicEnabled: (v: boolean) => void
  /** 选中的音频输入设备 id（空 = 系统默认）。 */
  selectedAudioDevice: string
  /** 翻译函数。 */
  t: (key: string) => string
  /** 参考音高（A4 的 Hz，默认 440）。 */
  referenceFrequency: number
  /** 输入增益（Web 路径的 GainNode 用）。 */
  inputGain: number
  /** 乐器最低弦频率 —— YIN 门限由它推导（与练习路径同源）。 */
  lowestStringHz: number
  /** 当前音高算法（'solo' | 'yin'）。 */
  pitchAlgorithm: string
  /** 置信度门限（YIN probability）。 */
  confidenceThreshold: number
  /**
   * 停掉「练习用的」收音链路。仅在 Web 路径调用（见文件头坑 1）。
   *
   * 🚨 页面侧的 `useTuner({...})` 调用点必须留在 `stopAudioInput` 声明**之后** ——
   * options 对象是立即求值的，放前面会 TDZ（拿到 undefined，点调音器时才炸）。
   * 2026-10-15 拆分时就是按这个约束摆的位置；护栏 `hooks-deps-safety.test.ts`
   * 钉住了两个声明在 page.tsx 里的先后顺序。
   */
  stopAudioInput: () => Promise<void> | void
}

export interface TunerHandle {
  tunerOpen: boolean
  setTunerOpen: (v: boolean) => void
  tunerActive: boolean
  detectedNote: string
  detectedFrequency: number
  cents: number
  startTuner: () => Promise<void>
  stopTuner: () => Promise<void>
  toggleTuner: () => void
  /** 只拆链路（给 `stopAudioInput` 用），见实现处说明。 */
  disposeTunerChain: () => void
}

export function useTuner(options: UseTunerOptions): TunerHandle {
  const {
    isTauri,
    micEnabled,
    setMicEnabled,
    selectedAudioDevice,
    t,
    referenceFrequency,
    inputGain,
    lowestStringHz,
    pitchAlgorithm,
    confidenceThreshold,
    stopAudioInput,
  } = options

  const [tunerOpen, setTunerOpen] = useState(false)
  const [tunerActive, setTunerActive] = useState(false)
  const [detectedNote, setDetectedNote] = useState<string>('-')
  const [detectedFrequency, setDetectedFrequency] = useState<number>(0)
  const [cents, setCents] = useState<number>(0)

  const tunerAudioContextRef = useRef<AudioContext | null>(null)
  const tunerAnalyserRef = useRef<AnalyserNode | null>(null)
  const tunerStreamRef = useRef<MediaStream | null>(null)
  const tunerGainNodeRef = useRef<GainNode | null>(null)
  const tunerAnimationRef = useRef<number | null>(null)
  const tunerHistoryRef = useRef<{ frequency: number; note: string; cents: number }[]>([])
  // Tauri 调音器：pitch-detected 事件监听与 Rust 检测线程的拆除句柄（stopTuner 需要）
  const tunerUnlistenRef = useRef<(() => void) | null>(null)
  const tunerStreamRunningRef = useRef(false)
  // 🚨 同步互斥锁 + 代际号（P2-5）。`startTuner` 里有多个 await（getUserMedia /
  //    动态 import），若不用「第一个 await 之前就生效」的守卫，快速双击会并发两条
  //    启动链：后写的句柄覆盖先写的 ⇒ `stopTuner` 只能拆掉一条，另一条（rAF 循环 /
  //    MediaStream）永久泄漏：表针还跳、麦克风常亮、CPU 空转。
  //    ref 不是 state ⇒ 同一 tick 内立即可见，能真正拦住重入。
  const tunerStartingRef = useRef(false)
  // Web 路径的 rAF 检测链是否「活着」。此前是 `startTuner` 里的局部 `let isActive`，
  // 而唯一会翻转它的 `return () => { isActive = false }` 写在 async 函数里、返回值无人
  // 接收 —— 死代码，兜底完全失效。改为 ref 持有，由 stopTuner 真正翻转。
  const tunerActiveRef = useRef(false)

  const pitchAlgorithmRef = useRef(pitchAlgorithm)
  const confidenceThresholdRef = useRef(confidenceThreshold)
  const referenceFrequencyRef = useRef(referenceFrequency)
  pitchAlgorithmRef.current = pitchAlgorithm
  confidenceThresholdRef.current = confidenceThreshold
  referenceFrequencyRef.current = referenceFrequency

  const startTuner = useCallback(async () => {
    // 🚨 同步互斥：必须在**任何 await 之前**置位，否则 `getUserMedia` 的 await 窗口里
    //    第二次点击会再进一遍 ⇒ 并发的两条启动链互相覆盖句柄 ⇒ 泄漏（P2-5）。
    //    `finally` 里释放，保证任何失败路径（含 catch）都不会把锁卡死。
    if (tunerStartingRef.current) return
    tunerStartingRef.current = true
    try {
      // 若已有检测循环在跑（快速连点的情况），先取消，避免并存多条 rAF 检测链 / 事件监听
      if (tunerAnimationRef.current) {
        cancelAnimationFrame(tunerAnimationRef.current)
        tunerAnimationRef.current = null
      }
      if (tunerUnlistenRef.current) {
        tunerUnlistenRef.current()
        tunerUnlistenRef.current = null
      }
      tunerStreamRunningRef.current = false
      // 上一轮 Web 检测链若还在（tunerActiveRef 为 true），先显式停掉，避免遗留 rAF 继续跑
      tunerActiveRef.current = false
      // 🚨 Web 路径才需要停掉「练习用的」MediaStream —— 调音器和练习共用同一个 AudioContext
      //    时会出现两条检测链抢同一个流。Tauri 路径**不能**在这里关 micEnabled：
      //    它是设置页「启用音频输入」的全局开关，调音器只是复用同一个 Rust 采集后端
      //    （下面 startAudioCapture 会重建采集，stopTuner 再停）。
      //    旧实现在这里无差别 `setMicEnabled(false)` ⇒ 用户从设置页开启音频后，
      //    只要碰过一次调音器，全局开关就被悄悄关掉，回练习/调音页完全没反应
      //    （Rust 采集已停、pipeline 守卫判定未采集而静默空转）。
      if (!isTauri && micEnabled) {
        await stopAudioInput()
        setMicEnabled(false)
      }
      if (isTauri) {
      // Tauri环境：Rust 原生音频 + 事件流（pitch-detected 每 50ms 一帧，替代每帧一次 IPC 的 rAF 轮询）
      try {
        const { startAudioCapture, listenPitchDetected, startPitchStream } = await import('@/lib/native-audio')

        await startAudioCapture(selectedAudioDevice || undefined)
        setTunerActive(true)
        toast.success(t('tuner_start'))

        const off = await listenPitchDetected((event) => {
          try {
            const result = event.pitch

            if (result && result.frequency > 0 && (result.confidence?.yin ?? 0) > confidenceThresholdRef.current) {
              const noteName = frequencyToNoteName(result.frequency)
              const noteResult = frequencyToNote(result.frequency, referenceFrequencyRef.current)

              tunerHistoryRef.current.push({
                frequency: result.frequency,
                note: noteName || '-',
                cents: noteResult.cents
              })

              if (tunerHistoryRef.current.length > HISTORY_LIMIT) {
                tunerHistoryRef.current.shift()
              }

              if (tunerHistoryRef.current.length >= SMOOTHING_MIN_FRAMES) {
                let weightedFreq = 0
                let totalWeight = 0

                tunerHistoryRef.current.forEach((item, index) => {
                  const weight = SMOOTHING_WEIGHTS[Math.min(index, SMOOTHING_WEIGHTS.length - 1)]
                  weightedFreq += item.frequency * weight
                  totalWeight += weight
                })

                const smoothedFreq = weightedFreq / totalWeight
                const smoothedNote = frequencyToNoteName(smoothedFreq)
                const smoothedResult = frequencyToNote(smoothedFreq, referenceFrequencyRef.current)

                setDetectedNote(smoothedNote || '-')
                setDetectedFrequency(Math.round(smoothedFreq))
                setCents(smoothedResult.cents)
              } else {
                setDetectedNote(noteName || '-')
                setDetectedFrequency(Math.round(result.frequency))
                setCents(noteResult.cents)
              }
            }
          } catch (e) {
            console.error('Native pitch event error:', e)
          }
        })

        tunerUnlistenRef.current = off
        await startPitchStream(NATIVE_PITCH_INTERVAL_MS)
        tunerStreamRunningRef.current = true
      } catch (err) {
        console.error('Failed to start native tuner:', err)
        toast.error(t('tuner_need_mic'))
      }
    } else {
      // Web环境：使用Web Audio API
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedAudioDevice
            ? {
                deviceId: { ideal: selectedAudioDevice },
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
              }
            : {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
              }
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        tunerStreamRef.current = stream

        const audioContext = new (getAudioContextClass())({
          sampleRate: 48000,
          latencyHint: 'interactive'
        })
        tunerAudioContextRef.current = audioContext
        // Tauri WebView2 / autoplay policy 下 AudioContext 可能挂起，需显式 resume
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {})
        }

        const source = audioContext.createMediaStreamSource(stream)

        const gainNode = audioContext.createGain()
        gainNode.gain.value = inputGain
        tunerGainNodeRef.current = gainNode

        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 4096
        tunerAnalyserRef.current = analyser

        source.connect(gainNode)
        gainNode.connect(analyser)

        tunerHistoryRef.current = []

        setTunerActive(true)
        toast.success(t('tuner_start'))

        // rAF 链的存活标志由 ref 持有（见 ref 声明处的说明），stopTuner 会翻转它。
        tunerActiveRef.current = true

        const detectPitch = () => {
          if (!tunerActiveRef.current || !analyser || !audioContext) return

          const buffer = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(buffer)

          const currentAlgorithm = pitchAlgorithmRef.current
          // YIN 门限与练习路径同源（见 lib/pitch-detection 的 resolveYinThreshold）
          const yinThreshold = resolveYinThreshold(lowestStringHz)
          let yinResult: { frequency: number; probability: number } | null = null

          // 使用完整缓冲区（与练习模式一致），低频需要更多周期才能准确检测
          if (currentAlgorithm === 'solo') {
            const soloAnalyser = getSOLOYinAnalyser(buffer.length, audioContext.sampleRate, yinThreshold)
            const soloResult = soloAnalyser.analyze(buffer)
            if (soloResult && soloResult.valid) {
              yinResult = {
                frequency: soloResult.frequency,
                probability: soloResult.probability
              }
            }
          } else {
            yinResult = YINPitchDetection(buffer, audioContext.sampleRate, yinThreshold, 0.1)
          }

          if (!yinResult || !yinResult.frequency) {
            tunerAnimationRef.current = requestAnimationFrame(detectPitch)
            return
          }

          // 调音表是**独立**的收音路径：自己的 AudioContext + MediaStream + rAF 轮询，
          // 既不经过 worklet/ScriptProcessor，也没有环境噪声校准（底噪只有本模块级的初值）。
          // 所以这里保留固定阈值，**不要**照搬练习路径的 `getOnsetGate()` —— 那条门限
          // 反映的是练习流的环境底噪，与调音表这条流的房间噪声无关。
          const rms = calculateRMS(buffer)
          const energyThreshold = yinResult.frequency < LOW_FREQ_HZ ? LOW_FREQ_RMS_THRESHOLD : NORMAL_RMS_THRESHOLD
          if (rms < energyThreshold) {
            tunerAnimationRef.current = requestAnimationFrame(detectPitch)
            return
          }

          // 谐波增强处理 - 针对低频（与练习模式一致）
          let detectedFreq = yinResult.frequency
          if (detectedFreq < LOW_FREQ_HZ) {
            const possibleFundamental = detectedFreq / 2
            let fundamentalResult: { frequency: number; probability: number } | null = null

            if (currentAlgorithm === 'solo') {
              const soloAnalyser2 = getSOLOYinAnalyser(buffer.length, audioContext.sampleRate, yinThreshold)
              const soloResult2 = soloAnalyser2.analyze(buffer)
              if (soloResult2 && soloResult2.valid) {
                fundamentalResult = {
                  frequency: soloResult2.frequency,
                  probability: soloResult2.probability
                }
              }
            } else {
              fundamentalResult = YINPitchDetection(buffer, audioContext.sampleRate, yinThreshold, 0.1)
            }

            if (fundamentalResult && fundamentalResult.frequency &&
                Math.abs(fundamentalResult.frequency - possibleFundamental) < 5) {
              detectedFreq = possibleFundamental
            }
          }

          if (detectedFreq > 0 && yinResult.probability > confidenceThresholdRef.current) {
            const noteName = frequencyToNoteName(detectedFreq)
            const result = frequencyToNote(detectedFreq, referenceFrequencyRef.current)

            tunerHistoryRef.current.push({
              frequency: detectedFreq,
              note: noteName || '-',
              cents: result.cents
            })

            if (tunerHistoryRef.current.length > HISTORY_LIMIT) {
              tunerHistoryRef.current.shift()
            }

            if (tunerHistoryRef.current.length >= SMOOTHING_MIN_FRAMES) {
              let weightedFreq = 0
              let totalWeight = 0

              tunerHistoryRef.current.forEach((item, index) => {
                const weight = SMOOTHING_WEIGHTS[Math.min(index, SMOOTHING_WEIGHTS.length - 1)]
                weightedFreq += item.frequency * weight
                totalWeight += weight
              })

              const smoothedFreq = weightedFreq / totalWeight
              const smoothedNote = frequencyToNoteName(smoothedFreq)
              const smoothedResult = frequencyToNote(smoothedFreq, referenceFrequencyRef.current)

              setDetectedNote(smoothedNote || '-')
              setDetectedFrequency(Math.round(smoothedFreq))
              setCents(smoothedResult.cents)
            } else {
              setDetectedNote(noteName || '-')
              setDetectedFrequency(Math.round(detectedFreq))
              setCents(result.cents)
            }
          }

          tunerAnimationRef.current = requestAnimationFrame(detectPitch)
        }

        tunerAnimationRef.current = requestAnimationFrame(detectPitch)
      } catch (err) {
        console.error('Failed to start tuner:', err)
        toast.error(t('tuner_need_mic'))
      }
    }
    } finally {
      // 无论成功/失败都释放互斥锁 —— 保证失败路径不会把调音器永久锁死。
      tunerStartingRef.current = false
    }
  }, [isTauri, micEnabled, setMicEnabled, selectedAudioDevice, t, inputGain, lowestStringHz, stopAudioInput])

  /**
   * **只拆链路、不动 UI state、不发 toast**。
   *
   * 给页面侧的 `stopAudioInput()` 用：它停止「练习用的」收音时，也要把调音器这条
   * 独立链路一起拆掉（否则两条检测链会抢同一个流 / 各自空转）。
   * 单独暴露而不是直接调 `stopTuner()`，因为后者还会 `setTunerActive(false)` +
   * `toast.success(t('tuner_stop'))` —— 用户并没有点停止调音器，不该弹这个提示。
   *
   * `useCallback([])` ⇒ 引用稳定，页面侧可以安心放进 ref，不会让 `stopAudioInput`
   * 的 deps 数组膨胀、连锁触发下游回调重建。
   */
  const disposeTunerChain = useCallback(() => {
    // 🚨 必须**先翻转存活标志、再取消 rAF**。反过来的话，正在执行的那一帧末尾还会
    //    再排一次 rAF（自续命）⇒ 检测链永远停不下来。护栏钉住了这个顺序。
    tunerActiveRef.current = false
    if (tunerAnimationRef.current) {
      cancelAnimationFrame(tunerAnimationRef.current)
      tunerAnimationRef.current = null
    }
    if (tunerStreamRef.current) {
      tunerStreamRef.current.getTracks().forEach(track => track.stop())
      tunerStreamRef.current = null
    }
    if (tunerAudioContextRef.current) {
      tunerAudioContextRef.current.close().catch(() => {})
      tunerAudioContextRef.current = null
    }
    tunerAnalyserRef.current = null
    tunerGainNodeRef.current = null
  }, [])

  const stopTuner = useCallback(async () => {
    disposeTunerChain()

    if (isTauri) {
      // 拆除事件监听与 Rust 检测线程（事件驱动改造新增）
      if (tunerUnlistenRef.current) {
        tunerUnlistenRef.current()
        tunerUnlistenRef.current = null
      }
      if (tunerStreamRunningRef.current) {
        tunerStreamRunningRef.current = false
        try {
          const { stopPitchStream } = await import('@/lib/native-audio')
          await stopPitchStream()
        } catch (e) {
          console.error('Failed to stop pitch stream:', e)
        }
      }
      // 🚨 只在「设置里也没开音频输入」时才拆掉 Rust 采集。
      //    stopTuner 是「退出调音」，不是「关闭音频输入」—— 两者是不同层级的意图。
      //    旧实现无条件 stopAudioCapture() ⇒ 调音器一关，练习模式的收音也一起死，
      //    且 `pipeline.rs` 的 `if !is_capturing()` 守卫会让后续检测**静默空转**
      //    （不报错、只是没反应），正是用户看到的现象。
      //    调音器复用的是同一个采集后端，退出时把它留着交给练习模式继续用。
      if (!useAppStore.getState().audio.micEnabled) {
        try {
          const { stopAudioCapture } = await import('@/lib/native-audio')
          await stopAudioCapture()
        } catch (e) {
          console.error('Failed to stop native audio:', e)
        }
      }
    }

    if (tunerStreamRef.current) {
      tunerStreamRef.current.getTracks().forEach(track => track.stop())
      tunerStreamRef.current = null
    }

    if (tunerAudioContextRef.current) {
      tunerAudioContextRef.current.close()
      tunerAudioContextRef.current = null
    }

    tunerAnalyserRef.current = null
    tunerGainNodeRef.current = null
    setTunerActive(false)
    setDetectedNote('-')
    setDetectedFrequency(0)
    setCents(0)
    toast.success(t('tuner_stop'))
  }, [t, isTauri, disposeTunerChain])

  // 切换调音器状态
  const toggleTuner = useCallback(() => {
    if (tunerActive) {
      stopTuner()
    } else {
      startTuner()
    }
  }, [tunerActive, startTuner, stopTuner])

  // 关闭调音器面板时停止调音
  useEffect(() => {
    if (!tunerOpen && tunerActive) {
      stopTuner()
    }
  }, [tunerOpen, tunerActive, stopTuner])

  return {
    tunerOpen,
    setTunerOpen,
    tunerActive,
    detectedNote,
    detectedFrequency,
    cents,
    startTuner,
    stopTuner,
    toggleTuner,
    disposeTunerChain,
  }
}
