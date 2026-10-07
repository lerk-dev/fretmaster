// 和弦进行信息浮动窗：可拖动（鼠标 / 触摸 / 方向键，Shift 加速）+ 调性/歌曲/和弦序列展示
"use client"

import { memo } from 'react'
import type { MutableRefObject, MouseEvent, TouchEvent } from 'react'
import { GripVertical, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatChordName } from '@/lib/page-theory-functions'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'

interface ChordStructureWindowProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 界面语言（zh-CN / en） */
  language: string
  /** 是否显示（关闭按钮用） */
  showChordStructure: boolean
  onShowChordStructureChange: (v: boolean) => void
  /** 窗口位移 */
  chordStructurePosition: { x: number; y: number }
  onChordStructurePositionChange: (updater: (p: { x: number; y: number }) => { x: number; y: number }) => void
  /** 拖拽状态（用于光标样式） */
  dragRef: MutableRefObject<{ isDragging: boolean; startX: number; startY: number; initialX: number; initialY: number; target: 'chord' | 'scale' | 'chordExercise' | null }>
  handleDragStart: (e: MouseEvent | TouchEvent, target: 'chord' | 'scale' | 'chordExercise') => void
  /** 调性 */
  progressionKey: string
  /** 是否小调 */
  isMinor: boolean
  /** 当前选中的歌曲 */
  selectedSong: (typeof SONG_PROGRESSIONS)[number]
  /** 已转调的和弦序列 */
  transposedChords: { root: string; type: string; bass?: string }[]
  /** 当前和弦下标（高亮用） */
  currentChordIndex: number
}

/**
 * 和弦进行信息浮动窗（从 app/page.tsx 原样搬出，行为不变）。
可拖动（鼠标/触摸/方向键），显示当前调性、歌曲与和弦序列，高亮当前和弦。
 */
export const ChordStructureWindow = memo(function ChordStructureWindow({
  t,
  language,
  showChordStructure: _showChordStructure,
  onShowChordStructureChange,
  chordStructurePosition,
  onChordStructurePositionChange,
  dragRef,
  handleDragStart,
  progressionKey,
  isMinor,
  selectedSong,
  transposedChords,
  currentChordIndex,
}: ChordStructureWindowProps) {
  return (
<div 
  className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50"
  style={{ 
    transform: `translate(${chordStructurePosition.x}px, ${chordStructurePosition.y}px)`,
    cursor: dragRef.current.isDragging && dragRef.current.target === 'chord' ? 'grabbing' : 'default'
  }}
>
  <div className="bg-card/95 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg p-3">
    <div 
      className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      role="button"
      tabIndex={0}
      aria-label={t('chord_structure_drag_hint')}
      onMouseDown={(e) => handleDragStart(e, 'chord')}
      onTouchStart={(e) => handleDragStart(e, 'chord')}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 20 : 5
        if (e.key === 'ArrowLeft') { e.preventDefault(); onChordStructurePositionChange(p => ({ ...p, x: p.x - step })) }
        else if (e.key === 'ArrowRight') { e.preventDefault(); onChordStructurePositionChange(p => ({ ...p, x: p.x + step })) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); onChordStructurePositionChange(p => ({ ...p, y: p.y - step })) }
        else if (e.key === 'ArrowDown') { e.preventDefault(); onChordStructurePositionChange(p => ({ ...p, y: p.y + step })) }
      }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
        <h4 className="text-xs font-semibold">{t('chord_progression_info')}</h4>
      </div>
      <button
        onClick={() => onShowChordStructureChange(false)}
        className="text-muted-foreground hover:text-foreground p-1 min-h-[28px] min-w-[28px] flex items-center justify-center"
        aria-label={t('chord_structure_close_label')}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t('select_key')}:</span>
        <span className="font-mono">{progressionKey + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t('select_song')}:</span>
        <span className="font-mono">{selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name}</span>
      </div>
      {/* 显示该调的所有和弦*/}
      <div className="pt-1.5 border-t border-border/20">
        <span className="text-muted-foreground block mb-1.5">{t('chord_progression')}:</span>
        <div className="flex flex-wrap gap-1">
          {(() => {
            const chords = transposedChords
            return chords.map((chord, index) => (
              <Badge
                key={index}
                variant={index === currentChordIndex ? "default" : "secondary"}
                className="text-2xs py-0 px-1"
              >
                {formatChordName(chord, t)}
              </Badge>
            ))
          })()}
        </div>
      </div>
    </div>
  </div>
</div>
  )
})
