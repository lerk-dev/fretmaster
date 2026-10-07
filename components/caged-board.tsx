// 整幅指板浏览器（乐理面板「CAGED」区块的新样式）—— 复刻 myfretboardtrainer.com 的 /pentatonic 页。
//
// 与同区块里原来的「五形状分图」的关系：
//   · 分图：**每个**形状各画一张小指板（`theory-panel.tsx` 原有），看不出形状之间的重叠；
//   · 本组件：**五个**形状叠在**一张**指板上，相邻形状共用的音位用**双色半半**圆点表示
//     （参考站做法：`linear-gradient(90deg, A 40%, B 60%)`）。
//   · 两者取音规则不同（照参考站实测）：CAGED 档只画「形状按得到」的音，
//     所以 C 大三和弦在 CAGED 档是 22 格，而在 Arpeggios 档是 26 格（多出 6 弦 0/3/12/15 品）。
//
// 六档显示模式 + 十二个根音 + 大小调 + 音级开关，全部照参考站的功能面。
// ⚠️ 参考站还有「Triads」「Box」两组过滤按钮 —— 实测它们**不改变任何渲染输出**
// （只影响参考站自己的点击练习范围），本项目此处是只读展示，故不实现（见 KNOWN-ISSUES 记录）。

"use client"

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { NOTES, NOTES_FLAT } from '@/lib/page-theory-data'
import { getNoteIndex } from '@/lib/page-theory-functions'
import { translateOr } from '@/lib/i18n'
import type { ChordQuality, FretboardConfig } from '@/lib/fretboard-positions'
import { TRAINER_MODE_ORDER, getTrainerBoard, type TrainerMode } from '@/lib/fretboard-trainer-theory'
import { TrainerCagedLegend, TrainerFretboard, type TrainerCellView } from '@/components/trainer-fretboard'

export interface CagedBoardProps {
  t: (key: string) => string
  language: string
  config: FretboardConfig
  fretCount: number
  fretMarkers: number[]
  openLabel: string
  /** 默认根音（跟随乐理面板当前选中的调） */
  defaultRoot: string
  /** 大小调受控（与同区块的「分图」样式共用同一个状态，避免切换样式后调性对不上） */
  quality: ChordQuality
  onQualityChange: (q: ChordQuality) => void
  /** 升降号偏好：true 用 ♭、否则用 ♯（音名表仍是项目唯一的 NOTES/NOTES_FLAT） */
  preferFlat?: boolean
}

const MODE_LABEL_KEY: Record<TrainerMode, string> = {
  caged: 'trainer_mode_caged',
  arpeggio: 'trainer_mode_arpeggio',
  arp7: 'trainer_mode_arp7',
  pentatonic: 'trainer_mode_pentatonic',
  blues: 'trainer_mode_blues',
  scale: 'trainer_mode_scale',
}

const MODE_FALLBACK: Record<TrainerMode, { zh: string; en: string }> = {
  caged: { zh: 'CAGED', en: 'CAGED' },
  arpeggio: { zh: '琶音', en: 'Arpeggios' },
  arp7: { zh: '属七琶音', en: 'Dominant 7 Arpeggios' },
  pentatonic: { zh: '五声音阶', en: 'Pentatonic' },
  blues: { zh: '布鲁斯', en: 'Blues' },
  scale: { zh: '音阶', en: 'Scale' },
}

const norm12 = (n: number) => (((n % 12) + 12) % 12)

export function CagedBoard({
  t,
  language,
  config,
  fretCount,
  fretMarkers,
  openLabel,
  defaultRoot,
  quality,
  onQualityChange,
  preferFlat = false,
}: CagedBoardProps) {
  const isEn = language === 'en'
  const noteName = (pc: number) => (preferFlat ? NOTES_FLAT[pc] : NOTES[pc])
  const [mode, setMode] = useState<TrainerMode>('caged')
  const [showIntervals, setShowIntervals] = useState(false)
  const [rootPitchClass, setRootPitchClass] = useState(() => norm12(getNoteIndex(defaultRoot)))

  // 面板里换调时跟着走（不做的话用户会看到「标题说 D 调、指板还是 C」）
  useEffect(() => {
    setRootPitchClass(norm12(getNoteIndex(defaultRoot)))
  }, [defaultRoot])

  const board = useMemo(
    () => getTrainerBoard(mode, rootPitchClass, quality, config, fretCount),
    [mode, rootPitchClass, quality, config, fretCount],
  )

  const cells = useMemo(() => {
    const map = new Map<string, TrainerCellView>()
    for (const [key, cell] of board) {
      map.set(key, {
        text: showIntervals ? cell.degree : noteName(cell.pitchClass),
        role: cell.role,
        visible: true,
        note: noteName(cell.pitchClass),
      })
    }
    return map
    // noteName 由 preferFlat 派生，直接依赖 preferFlat 而不是函数引用（避免每次渲染新建函数导致 memo 失效）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, showIntervals, preferFlat])

  const modeLabel = (m: TrainerMode) => {
    if (m === 'scale') {
      const key = quality === 'major' ? 'trainer_mode_scale_major' : 'trainer_mode_scale_minor'
      const fb = quality === 'major' ? { zh: '大调音阶', en: 'Major scale' } : { zh: '小调音阶', en: 'Minor scale' }
      return translateOr(t, key, isEn ? fb.en : fb.zh)
    }
    return translateOr(t, MODE_LABEL_KEY[m], isEn ? MODE_FALLBACK[m].en : MODE_FALLBACK[m].zh)
  }

  const rootNoteName = NOTES[rootPitchClass]

  return (
    <div className="space-y-3">
      {/* 大小调 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xs text-muted-foreground w-12">
          {translateOr(t, 'trainer_quality', isEn ? 'Quality' : '性质')}
        </span>
        <div className="flex items-center gap-1 bg-card/30 rounded-md border border-border/30 p-0.5">
          {(['major', 'minor'] as ChordQuality[]).map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={quality === q}
              onClick={() => onQualityChange(q)}
              className={cn(
                'px-2.5 h-6 rounded text-xs transition-colors',
                quality === q
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {translateOr(t, q === 'major' ? 'trainer_quality_major' : 'trainer_quality_minor', isEn ? (q === 'major' ? 'Major' : 'Minor') : (q === 'major' ? '大调' : '小调'))}
            </button>
          ))}
        </div>
      </div>

      {/* 根音（十二个，与参考站同一排布：黑键音名用小一号） */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xs text-muted-foreground w-12">
          {translateOr(t, 'trainer_root', isEn ? 'Root' : '根音')}
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {NOTES.map((note, pc) => {
            const isSharp = note.includes('♯')
            const active = rootPitchClass === pc
            return (
              <button
                key={note}
                type="button"
                aria-pressed={active}
                // 🚨 可访问名必须与**可见文字**用同一种拼写：降号偏好下按钮写的是 `D♭`，
                // 这里若恒用 `NOTES` 的 `C♯`，读屏/语音控制就会念出一个屏幕上不存在的名字
                // （WCAG 2.5.3 Label in Name）。有护栏钉住 aria-label === textContent。
                aria-label={noteName(pc)}
                onClick={() => setRootPitchClass(pc)}
                className={cn(
                  'rounded-md border transition-colors font-medium',
                  isSharp ? 'w-7 h-7 text-2xs' : 'w-9 h-9 text-xs',
                  active
                    ? 'border-primary/50 bg-primary/20 text-primary'
                    : 'border-border/30 bg-card/30 text-muted-foreground hover:text-foreground',
                )}
              >
                {noteName(pc)}
              </button>
            )
          })}
        </div>
      </div>

      {/* 显示档 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xs text-muted-foreground w-12">
          {translateOr(t, 'trainer_mode', isEn ? 'Show' : '显示')}
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {TRAINER_MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 h-7 rounded-full border text-2xs font-semibold transition-colors',
                mode === m
                  ? 'border-primary/50 bg-primary/20 text-primary'
                  : 'border-border/30 bg-card/30 text-muted-foreground hover:text-foreground',
              )}
            >
              {modeLabel(m)}
            </button>
          ))}
        </div>
      </div>

      {/* 音级开关 */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-muted-foreground w-12">
          {translateOr(t, 'trainer_label', isEn ? 'Label' : '标签')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={showIntervals}
          onClick={() => setShowIntervals((v) => !v)}
          className={cn(
            'inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
            showIntervals ? 'bg-primary border-primary' : 'bg-muted border-border',
          )}
        >
          <span
            className={cn(
              'block h-4 w-4 rounded-full bg-background transition-transform',
              showIntervals ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
        <span className="text-xs text-muted-foreground">
          {translateOr(t, 'trainer_show_intervals', isEn ? 'Show intervals' : '显示音级')}
        </span>
      </div>

      <TrainerFretboard
        tuning={config.tuning}
        fretCount={fretCount}
        cells={cells}
        fretMarkers={fretMarkers}
        openLabel={openLabel}
        t={t}
        ariaLabel={`${rootNoteName} ${modeLabel(mode)}`}
      />

      {mode === 'caged' && (
        <div className="flex justify-center pt-1">
          <TrainerCagedLegend />
        </div>
      )}
    </div>
  )
}
