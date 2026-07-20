'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { Timer, Eye, EyeOff, Target, Zap, Coffee, Play, Pause, RotateCcw, X, CheckCircle2, Circle, ChevronRight, ChevronLeft } from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface FocusModeProps {
  language: 'zh-CN' | 'en'
  isPlaying: boolean
  score: { correct: number; total: number }
  timeLeft: number
  practiceTime: number
  onClose?: () => void
}

export const FocusMode = memo(function FocusMode({
  language,
  isPlaying,
  score,
  timeLeft,
  practiceTime,
  onClose,
}: FocusModeProps) {
  const store = useAppStore()
  const focusMode = store?.focusMode || {}
  const setFocusModeSettings = store.setFocusModeSettings

  const [pomodoroTime, setPomodoroTime] = useState(0)
  const [pomodoroRunning, setPomodoroRunning] = useState(false)
  const [pomodoroPhase, setPomodoroPhase] = useState<'work' | 'break'>('work')
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pomodoroRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseDurationRef = useRef(25 * 60)
  const phaseRef = useRef<'work' | 'break'>('work')
  const wakeLockRef = useRef<any>(null)

  const workDuration = focusMode.targetDuration || 25
  const breakDuration = 5
  const currentPhaseDuration = pomodoroPhase === 'work' ? workDuration * 60 : breakDuration * 60

  phaseDurationRef.current = currentPhaseDuration
  phaseRef.current = pomodoroPhase
  const progressPercent = currentPhaseDuration > 0 ? (pomodoroTime / currentPhaseDuration) * 100 : 0

  const t = useCallback((key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'zh-CN': {
        'focus_mode': '专注模式',
        'pomodoro_timer': '番茄钟',
        'work_phase': '专注中',
        'break_phase': '休息中',
        'start': '开始',
        'pause': '暂停',
        'reset': '重置',
        'work_duration': '专注时长(分钟)',
        'progress': '练习进度',
        'correct_rate': '正确率',
        'remaining': '剩余时间',
        'completed_pomodoros': '已完成番茄',
        'settings': '设置',
        'wake_lock': '保持屏幕常亮',
        'dim_background': '背景调暗',
        'hide_distractions': '隐藏干扰元素',
        'show_timer': '显示计时器',
        'show_progress': '显示进度',
        'exit_focus': '退出专注模式',
        'minutes': '分',
        'seconds': '秒',
        'practice_score': '练习得分',
        'time_elapsed': '已用时间',
        'collapse': '收起',
        'expand': '展开',
      },
      'en': {
        'focus_mode': 'Focus Mode',
        'pomodoro_timer': 'Pomodoro Timer',
        'work_phase': 'Focusing',
        'break_phase': 'Break',
        'start': 'Start',
        'pause': 'Pause',
        'reset': 'Reset',
        'work_duration': 'Work Duration (min)',
        'progress': 'Progress',
        'correct_rate': 'Accuracy',
        'remaining': 'Remaining',
        'completed_pomodoros': 'Completed Pomodoros',
        'settings': 'Settings',
        'wake_lock': 'Keep Screen On',
        'dim_background': 'Dim Background',
        'hide_distractions': 'Hide Distractions',
        'show_timer': 'Show Timer',
        'show_progress': 'Show Progress',
        'exit_focus': 'Exit Focus Mode',
        'minutes': 'min',
        'seconds': 'sec',
        'practice_score': 'Practice Score',
        'time_elapsed': 'Time Elapsed',
        'collapse': 'Collapse',
        'expand': 'Expand',
      }
    }
    return translations[language]?.[key] || key
  }, [language])

  const togglePomodoro = useCallback(() => {
    setPomodoroRunning(prev => !prev)
  }, [])

  const resetPomodoro = useCallback(() => {
    setPomodoroRunning(false)
    setPomodoroTime(0)
    setPomodoroPhase('work')
  }, [])

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }, [])

  useEffect(() => {
    if (pomodoroRunning) {
      pomodoroRef.current = setInterval(() => {
        setPomodoroTime(prev => {
          const next = prev + 1
          if (next >= phaseDurationRef.current) {
            if (phaseRef.current === 'work') {
              setPomodoroPhase('break')
              setPomodoroCount(c => c + 1)
            } else {
              setPomodoroPhase('work')
            }
            return 0
          }
          return next
        })
      }, 1000)
    }
    return () => {
      if (pomodoroRef.current) {
        clearInterval(pomodoroRef.current)
        pomodoroRef.current = null
      }
    }
  }, [pomodoroRunning])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        store.setFocusModeSettings({ enabled: false })
        onClose?.()
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        togglePomodoro()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, store, togglePomodoro])

  useEffect(() => {
    let cancelled = false
    if (focusMode.enableWakeLock && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((lock) => {
        if (!cancelled) {
          wakeLockRef.current = lock
        } else {
          lock.release()
        }
      }).catch(() => {})
    }
    return () => {
      cancelled = true
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
    }
  }, [focusMode.enableWakeLock])

  const remainingTime = currentPhaseDuration - pomodoroTime
  const correctRate = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0
  const practiceProgress = practiceTime > 0 ? Math.min(100, Math.round(((practiceTime * 60 - timeLeft) / (practiceTime * 60)) * 100)) : 0

  // 收起状态：只显示一个小条
  if (collapsed) {
    return (
      <div className="fixed top-20 right-2 z-[9999] bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-lg transition-colors"
        >
          <div className={`w-2 h-2 rounded-full ${pomodoroPhase === 'work' ? 'bg-red-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
          <span className="font-mono text-xs">{formatTime(remainingTime)}</span>
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed top-16 right-2 bottom-16 z-[9999] w-64 bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg flex flex-col overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${pomodoroPhase === 'work' ? 'bg-red-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
          <span className="text-xs font-medium">
            {pomodoroPhase === 'work' ? t('work_phase') : t('break_phase')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(prev => !prev)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t('settings')}
          >
            {showSettings ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t('collapse')}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              store.setFocusModeSettings({ enabled: false })
              onClose?.()
            }}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t('exit_focus')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-border/30 space-y-2">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={focusMode.showTimer ?? true}
                onChange={(e) => setFocusModeSettings({ showTimer: e.target.checked })}
                className="rounded"
              />
              {t('show_timer')}
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={focusMode.showProgress ?? true}
                onChange={(e) => setFocusModeSettings({ showProgress: e.target.checked })}
                className="rounded"
              />
              {t('show_progress')}
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={focusMode.enableWakeLock ?? true}
                onChange={(e) => setFocusModeSettings({ enableWakeLock: e.target.checked })}
                className="rounded"
              />
              {t('wake_lock')}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t('work_duration')}</span>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={workDuration}
              onChange={(e) => setFocusModeSettings({ targetDuration: Number(e.target.value) })}
              className="flex-1 h-1"
            />
            <span className="text-xs font-mono w-6 text-right">{workDuration}</span>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-3 overflow-y-auto">
        {/* 番茄钟计时器 */}
        {focusMode.showTimer !== false && (
          <div className="relative flex flex-col items-center">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                <circle
                  cx="100" cy="100" r="90"
                  fill="none"
                  stroke="rgba(128,128,128,0.15)"
                  strokeWidth="8"
                />
                <circle
                  cx="100" cy="100" r="90"
                  fill="none"
                  stroke={pomodoroPhase === 'work' ? '#ef4444' : '#22c55e'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 90}`}
                  strokeDashoffset={`${2 * Math.PI * 90 * (1 - progressPercent / 100)}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-mono font-light tracking-wider">
                  {formatTime(remainingTime)}
                </span>
                <span className="text-muted-foreground text-[10px] mt-1">
                  {pomodoroPhase === 'work' ? t('work_phase') : t('break_phase')}
                </span>
              </div>
            </div>

            {/* 番茄钟控制 */}
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={resetPomodoro}
                className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={togglePomodoro}
                className="p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {pomodoroRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
            </div>

            {/* 已完成番茄数 */}
            <div className="flex items-center gap-0.5 mt-2">
              {Array.from({ length: Math.min(pomodoroCount, 8) }).map((_, i) => (
                <CheckCircle2 key={i} className="w-3 h-3 text-red-400" />
              ))}
              {Array.from({ length: Math.max(0, 4 - Math.min(pomodoroCount, 4)) }).map((_, i) => (
                <Circle key={`empty-${i}`} className="w-3 h-3 text-muted-foreground/30" />
              ))}
              <span className="text-muted-foreground text-[10px] ml-1">{pomodoroCount} {t('completed_pomodoros')}</span>
            </div>
          </div>
        )}

        {/* 练习进度 */}
        {focusMode.showProgress !== false && isPlaying && (
          <div className="w-full space-y-2">
            <div className="bg-muted/50 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">{t('practice_score')}</span>
                <span className="text-sm font-mono">
                  {score.correct}/{score.total}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">{t('correct_rate')}</span>
                <span className={`text-sm font-mono ${correctRate >= 80 ? 'text-green-600 dark:text-green-500' : correctRate >= 50 ? 'text-yellow-600 dark:text-yellow-500' : 'text-red-600 dark:text-red-500'}`}>
                  {correctRate}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-300 bg-gradient-to-r from-blue-500 to-purple-500"
                  style={{ width: `${practiceProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{t('time_elapsed')}</span>
                <span>{practiceProgress}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="text-center py-2 border-t border-border/30">
        <span className="text-muted-foreground text-[10px]">
          {t('focus_mode')} · {workDuration}{t('minutes')}
        </span>
      </div>
    </div>
  )
})
