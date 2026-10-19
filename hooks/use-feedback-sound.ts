import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@/lib/logger'
import { getAudioContextClass } from '@/lib/utils'
import { ensureGuitarSamples, playGuitarPluck } from '@/lib/guitar-sound'
import { useFeedbackSoundSettings } from '@/lib/store'

/**
 * useFeedbackSound
 *
 * 反馈音与正误反馈：共享 AudioContext 的音效播放 + 正确/错误提示的显隐。
 * 
 * 从 app/page.tsx 原样搬出，逐行搬运、逻辑未改动：
 * - showCorrectFeedback / correctFeedbackNote：正确答案提示的显隐与音符
 * - showWrongFeedback / wrongFeedbackNote：错误提示的显隐与音符
 * - feedbackAudioCtxRef：反馈音共享的 AudioContext（避免每次播放新建实例，
 *   浏览器/WebView 通常限制约 6 个实例，超限后新创建会抛异常导致反馈音静默失效）
 * - playFeedbackSound：按设置播放反馈音 —— **真实钢弦木吉他采样**（见 lib/guitar-sound.ts）；
 *   采样未就绪（首声/加载失败）时退回原来的 880Hz 正弦 / 220Hz 锯齿提示音
 * - triggerCorrectFeedback / triggerWrongFeedback：设置提示内容并 500/600ms 后自动隐藏
 * 
 * 外部依赖面：仅 feedbackSoundSettings（由 hook 内部 useFeedbackSoundSettings 自取，
 * 不当作参数传入）。
 * 页面通过解构接回同名变量，因此页面正文一行都不用改。
 */
export function useFeedbackSound() {
  const feedbackSoundSettings = useFeedbackSoundSettings()

  const [showCorrectFeedback, setShowCorrectFeedback] = useState(false)
  const [correctFeedbackNote, setCorrectFeedbackNote] = useState<string | null>(null)
  const [showWrongFeedback, setShowWrongFeedback] = useState(false)
  const [wrongFeedbackNote, setWrongFeedbackNote] = useState<string | null>(null)
  // 反馈音共享 AudioContext，避免每次播放都创建新实例导致内存泄漏和配额耗尽
  // （浏览器/WebView 通常限制约 6 个 AudioContext 实例）
  const feedbackAudioCtxRef = useRef<AudioContext | null>(null)
  // 🚨 P3-8：自动隐藏定时器必须去重 + 卸载清理。此前每次 trigger 都新挂一个裸 setTimeout，
  //    高速连答（同一题答错立即再点下一题）时，**前一题的定时器**会先把后一题的反馈熄灭
  //    ⇒ 后一题的正误提示一闪而过甚至完全不显示；卸载后还会在已卸载组件上 setState。
  const correctFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrongFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (correctFeedbackTimerRef.current !== null) clearTimeout(correctFeedbackTimerRef.current)
      if (wrongFeedbackTimerRef.current !== null) clearTimeout(wrongFeedbackTimerRef.current)
      correctFeedbackTimerRef.current = null
      wrongFeedbackTimerRef.current = null
    },
    []
  )
  /**
   * 播放一次答题反馈。
   *
   * @param isCorrect 答题对错（决定用「清脆拨弦」还是「闷音」）
   * @param midi      被点击位置的音高（C4=60）；不传则用 A3 兜底，保证有声音
   *
   * 🚨 采样是**可选增强**：首次调用时采样还没解码完（见 lib/guitar-sound.ts），
   *    那一声会退回合成提示音，之后的点击就是吉他。加载彻底失败也一样退回，
   *    绝不出现「点了没声音」。
   */
  /**
   * 取（或建）共享 AudioContext。
   *
   * 抽出来是为了让「首次交互预热」和「播放」用**同一个**实例：
   * 浏览器配额约 6 个 AudioContext，多建一个就少一次容错。
   * 创建失败（极端环境下会抛）返回 null，由调用方决定安静降级。
   */
  const ensureContext = useCallback((): AudioContext | null => {
    try {
      const AudioCtx = getAudioContextClass()
      if (!feedbackAudioCtxRef.current || feedbackAudioCtxRef.current.state === 'closed') {
        feedbackAudioCtxRef.current = new AudioCtx()
      }
      const ctx = feedbackAudioCtxRef.current
      // Tauri WebView2 / autoplay policy 下 AudioContext 可能处于挂起状态，需显式 resume
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      return ctx
    } catch (e) {
      logger.debug('创建反馈音 AudioContext 失败', e)
      return null
    }
  }, [])

  /**
   * 首次交互预热：在**用户手势里**创建 AudioContext 并开始下载/解码吉他采样。
   *
   * 为什么需要：`playFeedbackSound` 是同步的，采样没解码完只能退回合成提示音 ——
   * 而「开始练习」按钮本身就是一次手势，比第一次点指板早好几秒。
   * 只挂在 `pointerdown`（一次性）：页面里**不新增 window keydown**（唯一监听器是
   * use-global-shortcuts），点击/触摸已覆盖所有交互入口。
   */
  useEffect(() => {
    if (!feedbackSoundSettings.enabled) return
    if (typeof window === 'undefined') return
    let warmed = false
    const warm = () => {
      if (warmed) return
      warmed = true
      const ctx = ensureContext()
      if (ctx) void ensureGuitarSamples(ctx)
    }
    window.addEventListener('pointerdown', warm, { once: true, passive: true })
    return () => window.removeEventListener('pointerdown', warm)
  }, [feedbackSoundSettings.enabled, ensureContext])

  const playFeedbackSound = useCallback((isCorrect: boolean, midi?: number) => {
    if (!feedbackSoundSettings.enabled) return
    if (isCorrect && !feedbackSoundSettings.correctSound) return
    if (!isCorrect && !feedbackSoundSettings.wrongSound) return
    
    try {
      // 复用共享 AudioContext（见 ensureContext 注释：配额约 6 个，必须复用）
      const ctx = ensureContext()
      if (!ctx) return
      // 采样优先：已解码就直接播真实吉他，返回 false 才走下面的合成音兜底。
      // 顺手发起加载（同一 ctx 只发一轮请求，失败也只告警一次）。
      void ensureGuitarSamples(ctx)
      if (playGuitarPluck(ctx, { midi, muted: !isCorrect })) return

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      
      if (isCorrect) {
        oscillator.frequency.value = 880
        oscillator.type = "sine"
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.15)
      } else {
        oscillator.frequency.value = 220
        oscillator.type = "sawtooth"
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.2)
      }
    } catch (e) {
      logger.debug('播放反馈音失败', e)
    }
  }, [feedbackSoundSettings, ensureContext])
  // 触发正确答案反馈
  const triggerCorrectFeedback = useCallback((note: string) => {
    setCorrectFeedbackNote(note)
    setShowCorrectFeedback(true)

    // P3-8：先清掉上一题的定时器再挂新的（去重），否则旧定时器会提前熄灭本次反馈。
    if (correctFeedbackTimerRef.current !== null) clearTimeout(correctFeedbackTimerRef.current)
    correctFeedbackTimerRef.current = setTimeout(() => {
      setShowCorrectFeedback(false)
      setCorrectFeedbackNote(null)
      correctFeedbackTimerRef.current = null
    }, 500)
  }, [])
  const triggerWrongFeedback = useCallback((note: string) => {
    setWrongFeedbackNote(note)
    setShowWrongFeedback(true)

    if (wrongFeedbackTimerRef.current !== null) clearTimeout(wrongFeedbackTimerRef.current)
    wrongFeedbackTimerRef.current = setTimeout(() => {
      setShowWrongFeedback(false)
      setWrongFeedbackNote(null)
      wrongFeedbackTimerRef.current = null
    }, 600)
  }, [])

  return {
    showCorrectFeedback,
    setShowCorrectFeedback,
    correctFeedbackNote,
    setCorrectFeedbackNote,
    showWrongFeedback,
    setShowWrongFeedback,
    wrongFeedbackNote,
    setWrongFeedbackNote,
    feedbackAudioCtxRef,
    playFeedbackSound,
    triggerCorrectFeedback,
    triggerWrongFeedback,
  }
}
