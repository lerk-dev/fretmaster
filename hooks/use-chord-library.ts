import { useState } from 'react'
import { toast } from 'sonner'
import {
  CUSTOM_CHORD_STORAGE_KEY,
  parseStoredCustomChords,
  buildCustomChordsExport,
} from '@/lib/custom-chords-io'
import { parseIrealPro, parseIrealUrl } from '@/lib/song-chords'
import type { createTranslator } from '@/lib/i18n'

/** 一个和弦（根音 + 类型 + 可选低音）——与页面/导出/后端共用同一形状 */
export interface CustomChordShape {
  root: string
  type: string
  bass?: string
}

/**
 * useChordLibrary —— 「自定义和弦序列」的唯一真相源。
 *
 * 装：序列本身 + 编辑态（正在输入的和弦 / 序列名 / iReal 输入框）+ 六个动作。
 *
 * ## 解析与文本构造不在这里
 *
 * 全部在 lib：
 *   · `parseStoredCustomChords` / `buildCustomChordsExport`（lib/custom-chords-io.ts）——
 *     读取结果的四种分类（loaded / empty / invalid / not-found）也由它返回，页面只负责提示文案。
 *   · `parseIrealUrl` / `parseIrealPro`（lib/song-chords.ts）—— irealbook:// URL 优先，
 *     一次能拿到歌名与进行；不是 URL 时回退纯文本。
 *
 * ## IO 的两个坑（都踩过）
 *
 * 1. `saveCustomChords` 的 localStorage 写入必须 try/catch —— 和弦序列可能很长，
 *    配额超限时抛异常会冒泡到调用方（onClick 之外还会经 React 事件系统重抛），
 *    用户侧表现为「点了没反应 + 控制台红字」。
 * 2. `exportCustomChords` 先试剪贴板，失败才回退到下载文件 —— 桌面版 WebView 里
 *    剪贴板可能不给权限，但下载始终可用。
 *
 * ## 装配顺序
 *
 * 调用点必须在 `transposedChords`（用 customChords 做移调的 useMemo）之前 —— 否则 TDZ。
 */

export interface UseChordLibraryOptions {
  t: ReturnType<typeof createTranslator>
  chordScaleDisplay: Parameters<typeof buildCustomChordsExport>[1]['chordScaleDisplay']
  chordSymbols: Parameters<typeof buildCustomChordsExport>[1]['chordSymbols']
}

export function useChordLibrary(options: UseChordLibraryOptions) {
  const { t, chordScaleDisplay, chordSymbols } = options

  const [customChords, setCustomChords] = useState<CustomChordShape[]>([])
  const [irealInput, setIrealInput] = useState("")
  const [newChordRoot, setNewChordRoot] = useState("C")
  const [newChordType, setNewChordType] = useState("Major")
  const [newChordBass] = useState<string | undefined>(undefined)
  const [customChordName, setCustomChordName] = useState("")

  // 添加自定义和弦
  const addCustomChord = () => {
    setCustomChords(prev => [...prev, { root: newChordRoot, type: newChordType, bass: newChordBass }])
  }

  // 移除自定义和弦
  const removeCustomChord = (index: number) => {
    setCustomChords(prev => prev.filter((_, i) => i !== index))
  }

  // 清空自定义和弦
  const clearCustomChords = () => {
    setCustomChords([])
  }

  // 保存自定义和弦序列到本地存储
  const saveCustomChords = () => {
    if (customChords.length === 0) {
      toast.error(t('custom_chord_empty'))
      return
    }
    const data = {
      name: customChordName || t('custom_chord_unnamed'),
      sequence: customChords
    }
    if (typeof window !== 'undefined') {
      // P3-3：配额超限（和弦序列可能很长）时必须捕获，否则抛异常冒泡到调用方
      // （onClick 之外还会经 React 事件系统重抛），用户侧表现为「点了没反应 + 控制台红字」。
      try {
        localStorage.setItem(CUSTOM_CHORD_STORAGE_KEY, JSON.stringify(data))
      } catch (e) {
        console.warn('Failed to persist custom chords:', e)
        toast.error(t('custom_chord_save_failed'))
        return
      }
    }
    toast.success(t('custom_chord_saved'))
  }

  // 从本地存储加载自定义和弦序列（解析与四种结果分类见 lib/custom-chords-io.ts）
  const loadCustomChords = () => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_CHORD_STORAGE_KEY) : null
    const result = parseStoredCustomChords(raw)
    if (result.kind === 'loaded') {
      setCustomChords(result.sequence)
      setCustomChordName(result.name)
      toast.success(t('custom_chord_loaded'))
      return
    }
    if (result.kind === 'empty') {
      toast.error(t('custom_chord_empty_load'))
      return
    }
    if (result.kind === 'invalid') {
      toast.error(t('custom_chord_load_error'))
      return
    }
    toast.error(t('custom_chord_not_found'))
  }

  // 导入iReal Pro（解析实现见 lib/song-chords.ts）
  // irealbook:// URL 优先 —— 一次能拿到歌名与和弦进行；不是 URL 时回退到纯文本解析
  const importIrealPro = () => {
    const fromUrl = parseIrealUrl(irealInput)
    const chords = fromUrl ? fromUrl.chords : parseIrealPro(irealInput)
    if (chords.length > 0) {
      setCustomChords(chords)
      // URL 里带的歌名顺手用作序列名（纯文本导入没有这个信息）
      if (fromUrl?.title) setCustomChordName(fromUrl.title)
      toast.success(t('import_success'))
      setIrealInput("")
    } else {
      toast.error(t('error_occurred'))
    }
  }

  // 导出自定义和弦为简化格式（文本构造见 lib/custom-chords-io.ts 的 buildCustomChordsExport）
  const exportCustomChords = () => {
    if (customChords.length === 0) {
      toast.error(t('custom_chord_empty'))
      return
    }

    const { name, text } = buildCustomChordsExport(customChords, {
      name: customChordName,
      unnamedLabel: t('custom_chord_unnamed'),
      chordScaleDisplay,
      chordSymbols,
    })

    navigator.clipboard.writeText(text).then(() => {
      toast.success(t('export_success'))
    }).catch(() => {
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(t('export_success'))
    })
  }

  return {
    customChords, setCustomChords,
    irealInput, setIrealInput,
    newChordRoot, setNewChordRoot,
    newChordType, setNewChordType,
    customChordName, setCustomChordName,
    addCustomChord, removeCustomChord, clearCustomChords,
    saveCustomChords, loadCustomChords, importIrealPro, exportCustomChords,
  }
}
