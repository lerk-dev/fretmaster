// 自定义和弦序列的存取纯逻辑（从 app/page.tsx 抽出）。
//
// 抽出来的是两个"I/O 外壳里的纯核心"：
//   parseStoredCustomChords —— localStorage 里的字符串 → 四种结果（含 JSON 损坏）
//   buildCustomChordsExport —— 和弦列表 → 导出文本
//     这个导出格式是**用户可见**的（会写进剪贴板/下载成 .txt），
//     且内含"大三和弦省略后缀"（C 而不是 CMajor）这条规则，值得测。
//
// localStorage / clipboard / toast / Blob 这些副作用仍留在页面。

import { formatChordShape, getChordDisplayName } from '@/lib/page-theory-functions'

/** 和弦的最小结构（与 lib/page-theory-functions 的 parseChord 返回一致） */
export interface ChordShape {
  root: string
  type: string
  bass?: string
}

/** localStorage 键名——页面与外部的既有约定，改动需考虑已存数据 */
export const CUSTOM_CHORD_STORAGE_KEY = 'customChordSequence'

export type StoredCustomChordsResult =
  /** 读到了非空序列 */
  | { kind: 'loaded'; sequence: ChordShape[]; name: string }
  /** 存过，但序列为空 */
  | { kind: 'empty' }
  /** 存过，但内容不是能解析的 JSON */
  | { kind: 'invalid' }
  /** 压根没存过（含 SSR 无 localStorage） */
  | { kind: 'missing' }

/**
 * 解析 localStorage 里的自定义和弦记录。
 *
 * 判定条件与页面原实现逐字一致（`data.sequence && data.sequence.length > 0`），
 * **没有**顺手加 Array.isArray —— 那是另一件事，会改变既有行为。
 * 另外注意 `data && data.sequence` 的短路：raw 为 'null' 时 data 是 null，
 * 不会去取 .sequence，因此结果是 empty 而不是 invalid（有测试钉住）。
 */
export function parseStoredCustomChords(raw: string | null | undefined): StoredCustomChordsResult {
  if (!raw) return { kind: 'missing' }
  try {
    const data = JSON.parse(raw)
    if (data && data.sequence && data.sequence.length > 0) {
      return { kind: 'loaded', sequence: data.sequence as ChordShape[], name: data.name || '' }
    }
    return { kind: 'empty' }
  } catch {
    return { kind: 'invalid' }
  }
}

export interface CustomChordsExport {
  /** 导出文本第一行的名字（空名时用 unnamedLabel） */
  name: string
  /** 形如 "C | Am | F" 的和弦串 */
  chords: string
  /** 实际写入剪贴板/文件的完整文本：名字 + 换行 + 和弦串 */
  text: string
}

/**
 * 构造自定义和弦的导出内容。
 *
 * 每个和弦的显示名走 `formatChordShape`（和弦显示的唯一真相源）——
 * 这样导出的文本与屏幕显示完全一致（含音名归一化：C# → C♯）。
 * 此前这里自己拼了一遍且漏了归一化，导致屏幕上 C♯m7、导出却是 C#m7。
 */
export function buildCustomChordsExport(
  chords: ChordShape[],
  options: {
    name: string
    /** 名字为空时的占位（页面传 i18n 的「未命名」） */
    unnamedLabel: string
    chordScaleDisplay: Parameters<typeof getChordDisplayName>[1]
    chordSymbols?: Parameters<typeof getChordDisplayName>[2]
  }
): CustomChordsExport {
  const chordText = chords
    .map((chord) => formatChordShape(chord, options.chordScaleDisplay, options.chordSymbols))
    .join(' | ')

  const name = options.name || options.unnamedLabel
  return { name, chords: chordText, text: `${name}\n${chordText}` }
}
