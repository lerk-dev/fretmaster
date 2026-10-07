// 歌曲和弦的纯函数（从 app/page.tsx 抽出，逻辑未改动）：
//   transposeSongChords —— 把歌曲和弦按当前调性转调
//   parseIrealPro       —— 解析 iReal Pro 文本为和弦对象数组
//
// 抽出来的意义主要是**可测**：转调是核心乐理，之前藏在组件里完全没法验证。
import { parseChord, transposeChord } from "@/lib/page-theory-functions"
import { CHORD_TYPES } from "@/lib/page-theory-data"
import type { SongProgression } from "@/lib/page-songs"

export const transposeSongChords = (customChords: { root: string; type: string; bass?: string }[], song: SongProgression, progressionKey: string) => {
  if (customChords.length > 0) {
    return customChords
  }
  const songKey = song.key || "C"
  // 提取歌曲调性的音名部分进行比较
  const songKeyNote = songKey.endsWith('m') ? songKey.slice(0, -1) : songKey
  if (progressionKey === songKeyNote) {
    return song.chords.map(c => parseChord(c))
  }
  // 转调
  return song.chords.map(chordString => {
    const transposed = transposeChord(chordString, songKeyNote, progressionKey)
    return parseChord(transposed)
  })
}

export const parseIrealPro = (text: string) => {
  const chords: { root: string; type: string; bass?: string }[] = []
  
  // 简单解析 - 按空格或|分割
  const tokens = text.split(/[\s|]+/).filter(t => t.trim())
  
  for (const token of tokens) {
    // 跳过特殊标记
    if (token.match(/^[\[\]\(\)\*\r\n]/)) continue

    // 只接受「以音名开头」的 token（与 parseChord 的根音正则同口径）。
    //
    // 原实现是 `const parsed = parseChord(token); if (parsed.root) chords.push(parsed)`，
    // 但那个守卫**恒真**：parseChord 对无法识别的输入会**回退**成
    // { root: 'C', type: 'Major' }，所以任何 token 都能通过。
    // 后果是静默产生错数据 —— iReal Pro 原生格式里的段落标记（T44 拍号、N1）、
    // 或用户直接粘贴的 irealbook:// URL，都会变成一堆 C 大三和弦，
    // 界面还提示「导入成功」。（本文件从 page.tsx 搬出来时保持原样，这里单独修正。）
    if (!/^[A-G][#♯b♭]?/.test(token)) continue
    chords.push(parseChord(token))
  }
  
  return chords
}

// ============================================================================
// iReal Pro 的 irealbook:// URL 解析
// ----------------------------------------------------------------------------
// 格式依据官方文档 https://www.irealpro.com/ireal-pro-file-format/ ：
//
//   irealbook://标题=作曲者=风格=调号=n=和弦进行
//
//   6 个字段，用 '=' 分隔。官方明确说明「和弦进行里不能出现 '='」，所以前 5 个 '='
//   是字段分隔符，剩下整段都是和弦进行。第 5 个字段历史上是 'n'，现已不用。
//
// 和弦进行用的是 iReal 自己的记号（都不是和弦，需要跳过）：
//   T44 拍号 / *A 排练记号 / | [ ] { } 小节线 / N1 结束标记 / <文本> / Y 垂直留白 /
//   Z S Q f x 等符号
// 和弦质量用：^(major) -(minor) h(half-dim) o(dim) +(aug) sus，以及数字与升降号。
// ============================================================================

/**
 * iReal Pro 的和弦质量记号 → 本项目 `type` 键。
 *
 * 目标是 `lib/page-theory-data.ts` 里 `DISPLAY_NAMES.*.chordTypes` 实际存在的键，
 * 这样 `getChordDisplayName()` 才能翻成中文/爵士记谱；未命中时原样返回（界面上
 * 仍显示 iReal 的写法，不会变成「C」）。
 *
 * 为什么不直接复用 `normalizeChordType`：它是**精确查表**，认 `-7`/`o7`/`ø`，
 * 但不认 iReal 的 `^`（major）和 `h`（half-diminished），也不认 `maj9`→`Maj9`
 * 这类大小写差异。这里显式列全，避免"看起来归一了、其实落回原文"。
 */
const IREAL_QUALITY_MAP: Record<string, string> = {
  '': 'Major',
  // major
  '^': 'Major',
  '^7': 'Maj7',
  '^9': 'Maj9',
  '^13': 'maj13',
  'maj': 'Major',
  'maj7': 'Maj7',
  'maj9': 'Maj9',
  'M7': 'Maj7',
  'Δ7': 'Maj7',
  // minor
  '-': 'Minor',
  'm': 'Minor',
  'min': 'Minor',
  '-7': 'm7',
  '-9': 'm9',
  '-11': 'm11',
  '-13': 'm13',
  '-6': 'm6',
  '-^7': 'mMaj7',
  '-maj7': 'mMaj7',
  'mMaj7': 'mMaj7',
  // 半减 / 减 / 增
  'h': 'm7b5',
  'h7': 'm7b5',
  'h9': 'm9b5',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  'o': 'Dim',
  'dim': 'Dim',
  'o7': 'dim7',
  'dim7': 'dim7',
  '+': 'Aug',
  'aug': 'Aug',
  '+7': 'aug7',
  'aug7': 'aug7',
  // 属和弦
  '7': '7',
  '9': '9',
  '13': '13',
  '6': '6',
  '6/9': '6add9',
  '7b5': '7b5',
  '7#5': '7#5',
  '7b9': '7b9',
  '7#9': '7#9',
  '7#11': '7#11',
  '9#11': '9#11',
  '13#11': '13#11',
  '7alt': '7alt', // 项目无此键，原样显示
  // 挂留 / 加音
  'sus': 'sus4',
  'sus4': 'sus4',
  'sus2': 'sus2',
  '7sus': '7sus4',
  '7sus4': '7sus4',
  '9sus': '9sus4',
  '9sus4': '9sus4',
  'add9': 'add9',
  'madd9': 'madd9',
  'm6/9': 'm6add9',

  // ── 以下为官方文档 "All valid qualities" 全表中此前未收录的部分 ──
  // 目标不是逐音等价（项目没有对应类型时不可能做到），而是：
  // ① 界面不会漏出 iReal 专有记号；② 练习不会因类型不可识别而静默退化成「只问根音」。
  // 有妥协的条目都注明了理由。
  '5': 'Major', // 强力和弦（1+5）：项目无此类型，退到大三（会多出三音）
  '2': 'sus2',
  '69': '6add9',
  '-69': 'm6add9',
  '-^9': 'mMaj9',
  '-7b5': 'm7b5',
  '-b6': 'm7b6', // 项目无 m(b6) 三和弦；m7b6 是唯一含 b6 的类型
  '-#5': 'm7b6', // 与 -b6 等音（#5 == b6）
  '-b13': 'm7b6', // 与上同音，iReal 里偶见
  '^7#11': 'maj7#11',
  '^9#11': 'maj9#11',
  '^7#5': 'maj7#5',
  '9b5': '9#11', // b5 与 #11 等音
  '9#5': '9b13', // #5 与 b13 等音
  '7#9#5': '7#5#9',
  '7#9b5': '7b5#9',
  '7b9b5': '7b5b9',
  '7b9#5': '7#5b9',
  '7#9#11': '7alt', // 双变化音：项目无对应类型，归入变化属和弦
  '7b9#11': '7alt',
  '7b9#9': '7alt',
  '7b9sus': '7sus4b9',
  '7b13sus': '7sus4', // 项目无「挂留 + b13」
  '7susadd3': '7', // 挂留加三音即普通属七
  '13sus': '13sus4',
  'min13': 'm13',
  'min^11': 'mMaj7', // 项目无小大十一，退到小大七（丢掉十一度而非凭空加音）
  'min^13': 'mMaj13',
  'min7b6': 'm7b6',
  'min9b6': 'm7b6', // 项目无 m9b6
  'maj13#11': 'maj13#11',
  'maj7b5': 'maj7#11', // b5 与 #11 等音
  'maj7#9': 'maj7#9',
  'maj(add4)': 'Major', // add4 项目无对应，退到大三
  'min(add4)': 'Minor',
  '7(add13)': '7', // 退到属七（丢掉 13，而非凭空补 9/11）
  // 属十一和弦：项目原先漏登记 CHORD_TYPES（extendedChordMap 里那条度数序列因此不可达），
  // 已在 lib/page-theory-data.ts 补上该类型，故这里映射到自身。
  '11': '11',
}

/** 项目能识别的和弦类型集合（兜底用：本身就是合法 type 的写法直接放行） */
const PROJECT_CHORD_TYPES = new Set(CHORD_TYPES.map((ct) => ct.name))

/**
 * iReal 的质量记号 → 项目 type 键。
 *
 * 官方文档 "All valid qualities" 全表（72 项）已逐条收录（见 IREAL_QUALITY_MAP）。
 * 未收录的写法按兜底链换算，最后**若本身就是项目认识的 type 就直接放行**
 * （便于纯文本导入沿用项目自己的命名，如 `m7b5` / `maj7#11`）；仍无法识别才原样返回。
 */
export function irealQualityToProjectType(quality: string): string {
  const q = quality.trim()
  if (q in IREAL_QUALITY_MAP) return IREAL_QUALITY_MAP[q]
  // 兜底：把 iReal 专有符号换成项目能认的等价格式后再试一次
  // （例如 '-' 开头的小调变体、'^' 开头的 major 变体）
  let s = q.replace(/\^/g, 'maj').replace(/^h/, 'm7b5')
  if (s in IREAL_QUALITY_MAP) return IREAL_QUALITY_MAP[s]
  if (PROJECT_CHORD_TYPES.has(s)) return s
  s = s.replace(/^-/, 'm')
  if (s in IREAL_QUALITY_MAP) return IREAL_QUALITY_MAP[s]
  if (PROJECT_CHORD_TYPES.has(s)) return s
  return q
}

export interface IrealSong {
  title: string
  composer: string
  style: string
  key: string
  chords: { root: string; type: string; bass?: string }[]
}

/** 拆一个 iReal 和弦 token（如 `C^7` / `A-7` / `G7#5` / `C/E`） */
function parseIrealChordToken(token: string): { root: string; type: string; bass?: string } | null {
  const m = token.match(/^([A-G])([#b]?)(.*)$/)
  if (!m) return null
  const root = m[1] + m[2]
  let rest = m[3]

  // 斜杠低音：`/E`。注意 `/9` 这种（6/9 和弦）后面不是音名，属于质量记号，不能当低音。
  let bass: string | undefined
  const bassMatch = rest.match(/\/([A-G][#b]?)$/)
  if (bassMatch) {
    bass = bassMatch[1]
    rest = rest.slice(0, rest.length - bassMatch[0].length)
  }

  const type = irealQualityToProjectType(rest)
  return bass ? { root, type, bass } : { root, type }
}

/**
 * 从 iReal 的和弦进行串里抽出和弦（剔掉拍号/小节线/记号/尺寸记/备用和弦/文本）。
 *
 * 官方文档的 A Walkin Thing 全曲示例用到了这里必须处理的几类记号
 * （前一轮只测过那个「空格 + |」的简单示例，把下面这些全漏掉了）：
 *   - `,` 紧凑分隔符（不占格）：`Bh7, Bb7(A7b9)`
 *   - `s` / `l` 和弦宽度记号：`sEh,A7,`、`||lD-`
 *   - `p` 「重复上一和弦」的斜杠记号：`A7,p,p,p,`
 *   - `Y` 垂直留白、`Z`/`S`/`Q`/`f`/`N1` 等段落记号，且常**紧贴**在和弦上（`A7Z`、`SD-`）
 *   - `(...)` 备用和弦（显示在主和弦上方的可选替代）——整体丢弃，
 *     否则会被当成独立和弦凭空多出小节
 */
export function extractIrealChords(music: string) {
  let s = music
  s = s.replace(/<[^>]*>/g, ' ') // 文本标注（可能含 iReal 命令，如 "n1x"）
  s = s.replace(/\([^)]*\)/g, ' ') // 备用和弦：整体丢弃（见上方说明）
  s = s.replace(/T\d+/g, ' ') // 拍号 T44 / T34 ...
  s = s.replace(/\*[A-Za-z]/g, ' ') // 排练记号 *A *B *V *i
  s = s.replace(/N\d/g, ' ') // 结束标记 N1 / N2 / N0
  s = s.replace(/[|\[\]{}]/g, ' ') // 小节线与反复记号
  s = s.replace(/,/g, ' ') // 紧凑分隔符（不占格）
  s = s.replace(/p+/g, ' ') // 「重复上一和弦」的斜杠记号
  s = s.replace(/\bY+\b/g, ' ') // 垂直留白
  s = s.replace(/(^|\s)[ZSQfx]\d*(?=\s|$)/g, ' ') // 独立成词的段落符号

  const chords: { root: string; type: string; bass?: string }[] = []
  for (let token of s.split(/\s+/)) {
    if (!token) continue
    // 紧贴式和弦的段落/尺寸记号：`A7Z` → `A7`、`SD-` → `D-`、`sEh` → `Eh`
    token = token.replace(/^[ZSQf]+/, '').replace(/^[sl](?=[A-G])/, '')
    token = token.replace(/[ZSQfx]+\d*$/, '')
    if (!token) continue
    const chord = parseIrealChordToken(token)
    if (chord) chords.push(chord)
  }
  return chords
}

/**
 * 解析 iReal Pro 的 `irealbook://` URL。
 *
 * @returns 解析结果；输入不是 iReal URL、或字段数不足时返回 `null`
 *          （调用方据此回退到纯文本解析，或提示用户格式不对）
 */
export function parseIrealUrl(input: string): IrealSong | null {
  const trimmed = input.trim()
  if (!/^irealbook:\/\//i.test(trimmed)) return null

  let body = trimmed.replace(/^irealbook:\/\//i, '')
  // URL 解码：iReal 会把空格、花括号、竖线等都做百分号编码。
  // 用 try 包住 —— 手工粘贴的 URL 里常见落单的 '%'，decodeURIComponent 会抛。
  try {
    body = decodeURIComponent(body)
  } catch {
    /* 保留原串，继续按明文处理 */
  }

  const parts = body.split('=')
  if (parts.length < 6) return null

  const [title, composer, style, key] = parts
  // 第 5 个字段（历史占位的 'n'）跳过；第 6 个字段是整段和弦进行。
  // 官方规定和弦进行不含 '='，这里仍做一次容错拼接，避免异常 URL 把进行从中间截断。
  const music = parts.slice(5).join('=')

  return {
    title: title.trim(),
    composer: composer.trim(),
    style: style.trim(),
    key: key.trim(),
    chords: extractIrealChords(music),
  }
}

