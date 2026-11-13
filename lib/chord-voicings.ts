// 和弦标准指法（#4）：开放把位手写表 + 可移动型模板。
//
// 为什么不搞「全指板穷举」：穷举会生成大量跨 5 品、按不响的形状，排序也很难做对。
// 这里只收录两件事：
//   ① 开放把位（C/A/G/E/D 大三，常见小/属七/大七/挂留/半减）—— 手写标准按法；
//   ② E 型 / A 型可移动模板 —— 按根音落点整体平移。
// 生成后统一校验（音的集合必须是和弦音、必须含根音、品号不越界），
// 校验同时导出给 `__tests__/chord-voicings.test.ts` 复用，避免数据表手滑。
//
// 🚨 弦序约定与全项目一致：**下标 0 = 弦号 1 = 最高音弦**（见 `lib/string-index.ts`）。
//    所以 `frets` / `tuning` 都是「高 → 低」，与常见吉他谱的「低 → 高」书写**相反**。
//    数据表里一律写「高 → 低」；从六线谱抄形状时记得倒过来。
import { CHORD_TYPES } from '@/lib/page-theory-data'
import { getNoteIndex, normalizeChordType } from '@/lib/page-theory-functions'

export interface ChordVoicing {
  /** 稳定 id：`open:C:Major` / `E:8:Major` */
  id: string
  /** 开放把位 / 可移动型 */
  kind: 'open' | 'movable'
  /** 可移动型的形状名（E 型 / A 型）；开放把位为 null */
  shape: 'E' | 'A' | null
  /** 最低按弦品：0 = 开放把位（含空弦） */
  baseFret: number
  /** 每根弦的绝对品号，null = 不弹；下标 0 = 最高音弦 */
  frets: (number | null)[]
}

/** 标准吉他调弦（下标 0 = 高音 E）：E B G D A E */
const STANDARD_TUNING = [4, 11, 7, 2, 9, 4]

/** 开放把位标准按法（**高 → 低**，即 [1弦, 2弦, …, 6弦]） */
const OPEN_SHAPES: Record<string, { frets: (number | null)[] }> = {
  'C|Major': { frets: [0, 1, 0, 2, 3, null] },
  'A|Major': { frets: [0, 2, 2, 2, 0, null] },
  'G|Major': { frets: [3, 0, 0, 0, 2, 3] },
  'E|Major': { frets: [0, 0, 1, 2, 2, 0] },
  'D|Major': { frets: [2, 3, 2, 0, null, null] },

  'A|Minor': { frets: [0, 1, 2, 2, 0, null] },
  'E|Minor': { frets: [0, 0, 0, 2, 2, 0] },
  'D|Minor': { frets: [1, 3, 2, 0, null, null] },

  'E|7': { frets: [0, 0, 1, 0, 2, 0] },
  'A|7': { frets: [0, 2, 0, 2, 0, null] },
  'D|7': { frets: [2, 1, 2, 0, null, null] },
  'B|7': { frets: [2, 0, 2, 1, 2, null] },
  'C|7': { frets: [0, 1, 3, 2, 3, null] },
  'G|7': { frets: [1, 0, 0, 0, 2, 3] },

  'E|m7': { frets: [0, 0, 0, 0, 2, 0] },
  'A|m7': { frets: [0, 1, 0, 2, 0, null] },
  'D|m7': { frets: [1, 1, 2, 0, null, null] },

  'C|Maj7': { frets: [0, 0, 0, 2, 3, null] },
  'F|Maj7': { frets: [0, 1, 2, 3, null, null] },
  'G|Maj7': { frets: [2, 0, 0, 0, 2, 3] },
  'A|Maj7': { frets: [0, 2, 1, 2, 0, null] },

  'A|6': { frets: [2, 2, 2, 2, 0, null] },
  'E|6': { frets: [0, 2, 1, 2, 2, 0] },
  'A|m6': { frets: [2, 1, 2, 2, 0, null] },
  'E|m6': { frets: [0, 2, 0, 2, 2, 0] },

  'A|sus4': { frets: [0, 3, 2, 2, 0, null] },
  'D|sus4': { frets: [3, 3, 2, 0, null, null] },
  'E|sus4': { frets: [0, 0, 2, 2, 2, 0] },
  'A|sus2': { frets: [0, 0, 2, 2, 0, null] },
  'D|sus2': { frets: [0, 3, 2, 0, null, null] },
  'C|sus2': { frets: [3, 3, 0, 0, 3, null] },

  'B|m7b5': { frets: [null, 3, 2, 3, 2, null] },
  'D|m7b5': { frets: [1, 1, 1, 0, null, null] },
}

/**
 * 可移动型模板：`offsets` 是相对「根音所在弦上的把位 r」的品差（**高 → 低**）。
 * `rootString`：下标 5 = 低音 E 弦，4 = A 弦。
 */
const MOVABLE_SHAPES: { shape: 'E' | 'A'; rootString: number; types: Record<string, (number | null)[]> }[] = [
  {
    shape: 'E',
    rootString: 5,
    types: {
      Major: [0, 0, 1, 2, 2, 0],
      Minor: [0, 0, 0, 2, 2, 0],
      '7': [0, 0, 1, 0, 2, 0],
      m7: [0, 0, 0, 0, 2, 0],
      Maj7: [0, 0, 1, 1, 2, 0],
      '6': [0, 2, 1, 2, 2, 0],
      m6: [0, 2, 0, 2, 2, 0],
      sus4: [0, 0, 2, 2, 2, 0],
      sus2: [0, 0, 4, 4, 2, 0],
    },
  },
  {
    shape: 'A',
    rootString: 4,
    types: {
      Major: [0, 2, 2, 2, 0, null],
      Minor: [0, 1, 2, 2, 0, null],
      '7': [0, 2, 0, 2, 0, null],
      m7: [0, 1, 0, 2, 0, null],
      Maj7: [0, 2, 1, 2, 0, null],
      '6': [2, 2, 2, 2, 0, null],
      m6: [2, 1, 2, 2, 0, null],
      sus4: [0, 3, 2, 2, 0, null],
      sus2: [0, 0, 2, 2, 0, null],
      m7b5: [null, 1, 0, 1, 0, null],
    },
  },
]

/** 模板最多跨几品（再宽一般按不住） */
const MAX_FRET_SPAN = 4

/** 取该和弦**绝对** pitch class 集合（根音 + 音程，mod 12） */
export function chordTonePitchClasses(root: string, type: string): Set<number> | null {
  const canonical = normalizeChordType(type)
  const rootPc = getNoteIndex(root)
  const def = CHORD_TYPES.find((t) => t.name === canonical)
  if (!def || rootPc < 0) return null
  return new Set(def.intervals.map((i) => ((rootPc + i) % 12 + 12) % 12))
}

/**
 * 校验一个指法是否属于该和弦：每个按弦音都是和弦音、且至少出现一次根音。
 * 弦数/调弦不匹配的指法直接判无效（切到 7 弦/贝斯时不会画出错位的图）。
 *
 * `frets` 与 `tuning` 都按项目约定（下标 0 = 最高音弦）。
 */
export function isValidVoicing(
  root: string,
  type: string,
  frets: (number | null)[],
  tuning: number[]
): boolean {
  const rootPc = getNoteIndex(root)
  const tones = chordTonePitchClasses(root, type)
  if (rootPc < 0 || !tones || frets.length !== tuning.length) return false
  let hasRoot = false
  for (let i = 0; i < frets.length; i++) {
    const fret = frets[i]
    if (fret === null) continue
    const pc = ((tuning[i] % 12) + fret) % 12
    if ((pc + 12) % 12 === rootPc) hasRoot = true
    if (!tones.has(pc)) return false
  }
  return hasRoot
}

/**
 * 取某和弦的标准指法与变体。
 *
 * @param root      根音（`C` / `F♯` / `B♭` 等）
 * @param type      和弦类型（项目里 `CHORD_TYPES.name` 的口径）
 * @param tuning    调弦（每弦空弦 pitch class，**下标 0 = 最高音弦**）
 * @param fretCount 指板品数（越界指法会被丢弃）
 * @returns 开放把位优先、其余按把位升序；不支持的类型返回空数组
 */
export function getChordVoicings(
  root: string,
  type: string,
  tuning: number[] = STANDARD_TUNING,
  fretCount = 24
): ChordVoicing[] {
  const canonical = normalizeChordType(type)
  const rootPc = getNoteIndex(root)
  if (rootPc < 0) return []
  const tones = chordTonePitchClasses(root, canonical)
  if (!tones) return []

  const result: ChordVoicing[] = []
  const seen = new Set<string>()

  const push = (voicing: ChordVoicing) => {
    const key = voicing.frets.join(',')
    if (seen.has(key)) return
    if (!isValidVoicing(root, canonical, voicing.frets, tuning)) return
    if (voicing.frets.some((f) => f !== null && (f < 0 || f > fretCount))) return
    seen.add(key)
    result.push(voicing)
  }

  // ① 开放把位（调弦必须是标准 6 弦，EADGBE 的空弦音才成立）
  const open = OPEN_SHAPES[`${root}|${canonical}`]
  if (open && tuning.length === 6) {
    push({ id: `open:${root}:${canonical}`, kind: 'open', shape: null, baseFret: 0, frets: open.frets })
  }

  // ② 可移动型：根音落在 E 弦 / A 弦上的把位（0 把位已由开放把位覆盖，故取 1..11）
  for (const template of MOVABLE_SHAPES) {
    const offsets = template.types[canonical]
    if (!offsets) continue
    if (tuning.length !== offsets.length) continue
    const openPc = ((tuning[template.rootString] ?? 0) % 12 + 12) % 12
    let r = ((rootPc - openPc + 12) % 12)
    if (r === 0) r = 12
    if (r > fretCount) continue
    const frets = offsets.map((off) => (off === null ? null : off + r))
    const fretted = frets.filter((f): f is number => f !== null)
    if (fretted.length === 0) continue
    const max = Math.max(...fretted)
    const min = Math.min(...fretted.filter((f) => f > 0))
    if (max > fretCount) continue
    if (Number.isFinite(min) && max - min > MAX_FRET_SPAN) continue
    push({
      id: `${template.shape}:${r}:${canonical}`,
      kind: 'movable',
      shape: template.shape,
      baseFret: r,
      frets,
    })
  }

  return result.sort((a, b) => {
    const rank = (v: ChordVoicing) => (v.kind === 'open' ? -1 : v.baseFret)
    const diff = rank(a) - rank(b)
    return diff !== 0 ? diff : a.frets.join(',').localeCompare(b.frets.join(','))
  })
}
