import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@/lib/logger'
import { getAudioContextClass } from '@/lib/utils'
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
 * - playFeedbackSound：按设置播放正确音（880Hz 正弦）/ 错误音（220Hz 锯齿）
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
  const playFeedbackSound = useCallback((isCorrect: boolean) => {
    if (!feedbackSoundSettings.enabled) return
    if (isCorrect && !feedbackSoundSettings.correctSound) return
    if (!isCorrect && !feedbackSoundSettings.wrongSound) return
    
    try {
      // 复用共享 AudioContext，避免每次调用都创建新实例导致配额耗尽
      // （Chromium 限制约 6 个 AudioContext，超过后新创建会抛异常导致反馈音静默失效）
      const AudioCtx = getAudioContextClass()
      if (!feedbackAudioCtxRef.current || feedbackAudioCtxRef.current.state === 'closed') {
        feedbackAudioCtxRef.current = new AudioCtx()
      }
      const ctx = feedbackAudioCtxRef.current
      // Tauri WebView2 / autoplay policy 下 AudioContext 可能处于挂起状态，需显式 resume
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
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
  }, [feedbackSoundSettings])
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
