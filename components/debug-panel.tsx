'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Bug,
  Activity,
  Volume2,
  Signal,
  Cpu,
  X,
  ChevronDown,
  ChevronUp,
  Radio,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { isTauriEnv } from '@/lib/utils'

interface DebugData {
  frequency: number
  note: string
  octave: number
  cents: number
  confidenceYin: number
  confidenceHarmonic: number
  confidenceTemporal: number
  confidenceOverall: number
  
  isCapturing: boolean
  latencyMs: number
  bufferSize: number
  sampleRate: number
  
  rms: number
  dbSpl: number
  peak: number
  isVoiced: boolean
  noiseFloor: number
  snrDb: number
  
  detectTimeMs: number
  fps: number
  
  deviceName: string
  calibrationOffset: number
  gain: number
}

const defaultDebugData: DebugData = {
  frequency: 0,
  note: '-',
  octave: 0,
  cents: 0,
  confidenceYin: 0,
  confidenceHarmonic: 0,
  confidenceTemporal: 0,
  confidenceOverall: 0,
  isCapturing: false,
  latencyMs: 0,
  bufferSize: 0,
  sampleRate: 0,
  rms: 0,
  dbSpl: -96,
  peak: 0,
  isVoiced: false,
  noiseFloor: 0,
  snrDb: 0,
  detectTimeMs: 0,
  fps: 0,
  deviceName: '-',
  calibrationOffset: 0,
  gain: 1,
}

const FREQ_HISTORY_LENGTH = 60

const DebugPanelInner = memo(function DebugPanelInner() {
  const [visible, setVisible] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [data, setData] = useState<DebugData>(defaultDebugData)
  const [freqHistory, setFreqHistory] = useState<number[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(Date.now())
  const invokeRef = useRef<((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null>(null)

  const store = useAppStore()
  const audioSettings = store?.audio || { selectedAudioDevice: '', inputGain: 1 }

  const updateDebugData = useCallback(async () => {
    const startTime = performance.now()

    try {
      if (!invokeRef.current) {
        const { invoke } = await import('@tauri-apps/api/core')
        invokeRef.current = invoke
      }
      const invoke = invokeRef.current
      
      interface PitchData {
        note: string
        octave: number
        frequency: number
        cents: number
        confidence: { yin: number; harmonic: number; temporal: number; overall: number }
      }
      
      interface AudioStatus {
        isCapturing: boolean
        latencyMs: number
        bufferSize: number
        sampleRate: number
      }
      
      interface AudioLevel {
        rms: number
        db_spl: number
        peak: number
        is_voiced: boolean
        noise_floor: number
        snr_db: number
      }
      
      const [pitch, status, audioLevel] = await Promise.all([
        invoke('detect_pitch').catch(() => null) as Promise<PitchData | null>,
        invoke('get_audio_status').catch(() => ({
          isCapturing: false, latencyMs: 0, bufferSize: 0, sampleRate: 48000,
        })) as Promise<AudioStatus>,
        invoke('get_audio_level').catch(() => null) as Promise<AudioLevel | null>,
      ])

      const detectTime = performance.now() - startTime

      frameCountRef.current++
      const now = Date.now()
      if (now - lastFpsTimeRef.current >= 1000) {
        const fps = frameCountRef.current
        frameCountRef.current = 0
        lastFpsTimeRef.current = now

        setData(prev => ({ ...prev, fps }))
      }

      setData(prev => ({
        ...prev,
        frequency: pitch?.frequency ?? prev.frequency,
        note: pitch?.note ?? '-',
        octave: pitch?.octave ?? 0,
        cents: pitch?.cents ?? 0,
        confidenceYin: pitch?.confidence?.yin ?? 0,
        confidenceHarmonic: pitch?.confidence?.harmonic ?? 0,
        confidenceTemporal: pitch?.confidence?.temporal ?? 0,
        confidenceOverall: pitch?.confidence?.overall ?? 0,
        isCapturing: status?.isCapturing ?? false,
        latencyMs: status?.latencyMs ?? 0,
        bufferSize: status?.bufferSize ?? 0,
        sampleRate: status?.sampleRate ?? 48000,
        rms: audioLevel?.rms ?? 0,
        dbSpl: audioLevel?.db_spl ?? -96,
        peak: audioLevel?.peak ?? 0,
        isVoiced: audioLevel?.is_voiced ?? false,
        noiseFloor: audioLevel?.noise_floor ?? 0,
        snrDb: audioLevel?.snr_db ?? 0,
        detectTimeMs: detectTime,
        deviceName: audioSettings?.selectedAudioDevice || '-',
        calibrationOffset: audioSettings?.inputGain ?? 1,
        gain: audioSettings?.inputGain ?? 1,
      }))

      if (pitch && pitch.frequency > 0) {
        setFreqHistory(prev => {
          const next = [...prev, pitch.frequency]
          return next.length > FREQ_HISTORY_LENGTH ? next.slice(-FREQ_HISTORY_LENGTH) : next
        })
      }
    } catch (e) {
      console.warn('Debug update error:', e)
    }
  }, [audioSettings?.selectedAudioDevice, audioSettings?.inputGain])

  useEffect(() => {
    if (visible && !minimized) {
      intervalRef.current = setInterval(updateDebugData, 500)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [visible, minimized, updateDebugData])

  const renderMiniWaveform = () => {
    if (freqHistory.length < 2) return null

    const width = 200
    const height = 30
    const min = Math.min(...freqHistory)
    const max = Math.max(...freqHistory)
    const range = max - min || 1

    const points = freqHistory.map((f, i) => {
      const x = (i / (FREQ_HISTORY_LENGTH - 1)) * width
      const y = height - ((f - min) / range) * height
      return `${x},${y}`
    }).join(' ')

    return (
      <svg width={width} height={height} className="w-full h-auto">
        <polyline
          points={points}
          fill="none"
          stroke="hsl(142, 71%, 45%)"
          strokeWidth="1.5"
        />
      </svg>
    )
  }

  const ConfidenceBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-12 text-right font-mono">{(value * 100).toFixed(1)}%</span>
    </div>
  )

  return (
    <>
      {!visible && (
        <button
          onClick={() => setVisible(true)}
          className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center hover:bg-accent/20 transition-colors"
          title="Debug Panel"
        >
          <Bug className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {visible && (
        <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[80vh] overflow-hidden rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-2xl">
          <div
            className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border cursor-pointer select-none"
            onClick={() => setMinimized(!minimized)}
          >
            <div className="flex items-center gap-2">
              <Bug className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold">Debug Panel</span>
              {data.isCapturing && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-green-500 text-green-500">
                  <Radio className="w-2.5 h-2.5 mr-0.5 animate-pulse" />
                  LIVE
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-muted-foreground">
                {data.fps} FPS
              </span>
              {minimized ? (
                <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setVisible(false) }}
                className="ml-1 hover:bg-destructive/20 rounded p-0.5"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </div>

          {!minimized && (
            <div className="overflow-y-auto max-h-[70vh] p-3 space-y-3 text-xs">
              <section>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Signal className="w-3 h-3" /> Pitch Detection
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Note</span>
                    <span className="font-bold text-sm chord-symbol">
                      {data.note}{data.octave > 0 ? data.octave : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cents</span>
                    <span className={data.cents > 0 ? 'text-red-400' : data.cents < 0 ? 'text-blue-400' : 'text-green-400'}>
                      {data.cents > 0 ? '+' : ''}{data.cents.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Freq</span>
                    <span>{data.frequency.toFixed(2)} Hz</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Detect</span>
                    <span>{data.detectTimeMs.toFixed(1)} ms</span>
                  </div>
                </div>
                
                <div className="mt-2 space-y-1">
                  <ConfidenceBar label="YIN" value={data.confidenceYin} color="#22c55e" />
                  <ConfidenceBar label="Harmonic" value={data.confidenceHarmonic} color="#3b82f6" />
                  <ConfidenceBar label="Temporal" value={data.confidenceTemporal} color="#a855f7" />
                  <ConfidenceBar label="Overall" value={data.confidenceOverall} color="#f59e0b" />
                </div>

                {freqHistory.length > 2 && (
                  <div className="mt-2 p-1 bg-muted/50 rounded">
                    {renderMiniWaveform()}
                  </div>
                )}
              </section>

              <section>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Audio Status
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capturing</span>
                    <span className={data.isCapturing ? 'text-green-400' : 'text-red-400'}>
                      {data.isCapturing ? '● ON' : '○ OFF'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latency</span>
                    <span className={data.latencyMs > 50 ? 'text-red-400' : data.latencyMs > 20 ? 'text-amber-400' : 'text-green-400'}>
                      {data.latencyMs.toFixed(1)} ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buffer</span>
                    <span>{data.bufferSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sample Rate</span>
                    <span>{(data.sampleRate / 1000).toFixed(1)} kHz</span>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Audio Level
                </h4>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-muted-foreground">RMS</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-150"
                        style={{ width: `${Math.min(100, data.rms * 500)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono">
                      {data.rms < 0.001 && data.rms > 0
                        ? data.rms.toExponential(2)
                        : data.rms.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-muted-foreground">dB</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-150"
                        style={{
                          width: `${Math.max(0, Math.min(100, ((data.dbSpl + 96) / 96) * 100))}%`,
                          backgroundColor: data.dbSpl > -6 ? '#ef4444' : data.dbSpl > -20 ? '#f59e0b' : '#22c55e',
                        }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono">{data.dbSpl.toFixed(1)} dB</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Peak</span>
                      <span>{data.peak.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Voiced</span>
                      <span className={data.isVoiced ? 'text-green-400' : 'text-red-400'}>
                        {data.isVoiced ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Noise</span>
                      <span>{data.noiseFloor.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SNR</span>
                      <span>{data.snrDb.toFixed(1)} dB</span>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> Device
                </h4>
                <div className="space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device</span>
                    <span className="truncate ml-2 max-w-[200px]" title={data.deviceName}>
                      {data.deviceName.length > 30 ? data.deviceName.slice(0, 30) + '...' : data.deviceName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gain</span>
                    <span>{data.gain.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cal. Offset</span>
                    <span>{data.calibrationOffset.toFixed(1)} cents</span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </>
  )
})

export function DebugPanel() {
  const [isTauri, setIsTauri] = useState(false)
  
  useEffect(() => {
    setIsTauri(isTauriEnv())
  }, [])
  
  if (!isTauri) {
    return null
  }
  return <DebugPanelInner />
}
