'use client'

import { useEffect, useState, useRef, memo, useCallback } from 'react'
import { useAppStore } from '@/lib/store'

interface MetronomeVisualizerProps {
  bpm: number
  enabled: boolean
  isPlaying: boolean
  beatsPerMeasure?: number
  language?: 'zh-CN' | 'en'
}

export const MetronomeVisualizer = memo(function MetronomeVisualizer({
  bpm,
  enabled,
  isPlaying,
  beatsPerMeasure = 4,
  language = 'zh-CN',
}: MetronomeVisualizerProps) {
  const [currentBeat, setCurrentBeat] = useState(0)
  const [pulseScale, setPulseScale] = useState(1)
  const [beatHistory, setBeatHistory] = useState<number[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const beatCountRef = useRef(0)

  const t = useCallback((key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'zh-CN': {
        'beat': '拍',
      },
      'en': {
        'beat': 'Beat',
      },
    }
    return translations[language]?.[key] || key
  }, [language])

  useEffect(() => {
    if (!enabled || !isPlaying || bpm <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const interval = (60 / bpm) * 1000

    intervalRef.current = setInterval(() => {
      beatCountRef.current = (beatCountRef.current + 1) % beatsPerMeasure
      const beat = beatCountRef.current
      setCurrentBeat(beat)

      setPulseScale(1.3)
      setTimeout(() => setPulseScale(1), 100)

      setBeatHistory(prev => {
        const newHistory = [...prev, beat]
        return newHistory.slice(-16)
      })
    }, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, isPlaying, bpm, beatsPerMeasure])

  useEffect(() => {
    if (!isPlaying) {
      beatCountRef.current = 0
      setCurrentBeat(0)
      setBeatHistory([])
    }
  }, [isPlaying])

  if (!enabled || !isPlaying) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative flex items-center justify-center"
          style={{
            transform: `scale(${pulseScale})`,
            transition: 'transform 0.1s ease-out',
          }}
        >
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/40 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-lg font-bold">
                  {currentBeat + 1}
                </span>
              </div>
            </div>
          </div>
          <div
            className="absolute inset-0 rounded-full border-2 border-primary/50 animate-ping"
            style={{ animationDuration: `${(60 / bpm) * 1000}ms` }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {Array.from({ length: beatsPerMeasure }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-100 ${
                i === currentBeat
                  ? 'bg-primary scale-150'
                  : i < currentBeat
                  ? 'bg-primary/40'
                  : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        <div className="flex items-end gap-0.5 h-6">
          {beatHistory.map((beat, i) => (
            <div
              key={`${i}-${beat}`}
              className="w-1 bg-primary/60 rounded-full transition-all"
              style={{
                height: `${Math.max(4, (beat + 1) * 4)}px`,
                opacity: 0.3 + (i / beatHistory.length) * 0.7,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

interface MetronomePulseProps {
  isPulsing: boolean
  bpm: number
  color?: string
}

export const MetronomePulse = memo(function MetronomePulse({
  isPulsing,
  bpm,
  color = 'hsl(var(--primary))',
}: MetronomePulseProps) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!isPulsing) return

    const interval = (60 / bpm) * 1000
    const pulseInterval = setInterval(() => {
      setScale(1.2)
      setTimeout(() => setScale(1), 80)
    }, interval)

    return () => clearInterval(pulseInterval)
  }, [isPulsing, bpm])

  return (
    <div
      className="w-3 h-3 rounded-full transition-transform duration-75"
      style={{
        backgroundColor: color,
        transform: `scale(${scale})`,
      }}
    />
  )
})
