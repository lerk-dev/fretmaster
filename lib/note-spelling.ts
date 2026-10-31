/**
 * 音名拼写（note spelling）—— 按**调号**把一个音阶/和弦写成「七个字母各就各位」的音名。
 *
 * ## 🚨 为什么不能直接用 12 音表
 *
 * `NOTE_UNICODE_NAMES` / `NOTE_UNICODE_NAMES_FLAT` 是「pitch class → 音名」的**固定表**，
 * 结构上表达不了「同一个 pc 在不同调里拼成不同字母」。七声音阶的定义要求
 * 7 个音落在 7 个**不同字母**上，固定表做不到：
 *
 * ```
 * C♯ 大调（旧输出）  C♯ D♯ F  F♯ G♯ A♯ C     ← 两个 F、两个 C，缺 E 和 B
 * C♯ 大调（正确）    C♯ D♯ E♯ F♯ G♯ A♯ B♯
 * F♯ 大调（旧输出）  F♯ G♯ A♯ B C♯ D♯ F      ← 两个 F，缺 E
 * F♯ 大调（正确）    F♯ G♯ A♯ B C♯ D♯ E♯
 * ```
 *
 * 对一个乐理教学工具来说，「一个音阶里两个 F、没有 E」是硬伤（审计 2026-10-31 第 5 项）。
 *
 * ## 算法
 *
 * 1. **根音字母**由调用方给的偏好决定（`sharp` / `flat`；不传则按惯用拼写：
 *    黑键取降号侧，唯独 F♯ 用升号 —— 吉他与五度圈的习惯）；
 * 2. **每个音级的字母** = 根音字母 + (音级数 − 1)，再对 7 取模
 *    ⇒ 音级 3 永远落在「根音字母往上数第 3 个字母」上；
 * 3. **升降号个数** = 目标 pc − 该字母的自然 pc，折算到 [−2, +2]
 *    （±2 是重升/重降，例如变化音阶的 `bb7`）。
 *
 * 音级的**半音值**取自 `lib/degree-semitone.ts`（唯一真相源），本文件不重复任何
 * 「音级 → 半音」的字面量；音级**标签**由调用方提供（音阶用 `SCALE_INTERVAL_DISPLAY`
 * / `SCALE_MODES[].intervals`，和弦用 `chordToneLabel`）。
 *
 * 护栏：`__tests__/note-spelling.test.ts` 穷举 12 个根音 × 7 声音阶的**字母唯一性**，
 * 以及 C♯/F♯ 大调、减/增和弦等具体拼写。
 */

import { degreeSemitoneMod12 } from './degree-semitone'
import { chordToneLabel } from './theory-mode-guide'

/** 自然音字母（C=0 … B=6）。索引即「字母序」，用来按音级推进。 */
export const NATURAL_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

/** 每个自然音字母的半音值：C=0 D=2 E=4 F=5 G=7 A=9 B=11 */
const LETTER_PC: readonly number[] = [0, 2, 4, 5, 7, 9, 11]

/** 升降号偏好。`sharp` = 升号侧（C♯/D♯/F♯/G♯/A♯），`flat` = 降号侧（D♭/E♭/G♭/A♭/B♭）。 */
export type AccidentalPreference = 'sharp' | 'flat'

/** [字母索引, 升降号个数] */
type RootSpelling = readonly [number, number]

/** 升号侧的根音拼写（按 pitch class 索引） */
const SHARP_ROOTS: readonly RootSpelling[] = [
  [0, 0], // C
  [0, 1], // C♯
  [1, 0], // D
  [1, 1], // D♯
  [2, 0], // E
  [3, 0], // F
  [3, 1], // F♯
  [4, 0], // G
  [4, 1], // G♯
  [5, 0], // A
  [5, 1], // A♯
  [6, 0], // B
]

/** 降号侧的根音拼写 */
const FLAT_ROOTS: readonly RootSpelling[] = [
  [0, 0], // C
  [1, -1], // D♭
  [1, 0], // D
  [2, -1], // E♭
  [2, 0], // E
  [3, 0], // F
  [4, -1], // G♭
  [4, 0], // G
  [5, -1], // A♭
  [5, 0], // A
  [6, -1], // B♭
  [6, 0], // B
]

/**
 * 未指定偏好时的惯用拼写：黑键用降号侧，**唯独 pc 6 用 F♯**。
 * 理由：F♯ 在吉他语境里比 G♭ 常用得多（E 大调/关系和弦、CAGED 形状），
 * 而 D♭/E♭/A♭/B♭ 是各自最常见的写法。
 */
const DEFAULT_ROOTS: readonly RootSpelling[] = [
  [0, 0],
  [1, -1], // D♭
  [1, 0],
  [2, -1], // E♭
  [2, 0],
  [3, 0],
  [3, 1], // F♯
  [4, 0],
  [5, -1], // A♭
  [5, 0],
  [6, -1], // B♭
  [6, 0],
]

const normalizePc = (pc: number) => ((pc % 12) + 12) % 12

/** 升降号个数 → 记号（±2 写成重复记号：`♯♯` / `♭♭`，与全站单记号字形一致）。 */
function accidentalSymbol(count: number): string {
  if (count === 0) return ''
  const glyph = count > 0 ? '♯' : '♭'
  return glyph.repeat(Math.abs(count))
}

/**
 * 把「目标 pc − 字母自然 pc」折算到 [−2, +2]。
 * 超出范围说明**这个字母表达不了这个音**（例如三全音配错字母），返回 null 让调用方兜底。
 */
function normalizeAccidental(diff: number): number | null {
  let d = normalizePc(diff)
  if (d > 6) d -= 12
  return Math.abs(d) <= 2 ? d : null
}

function rootSpelling(rootPc: number, prefer?: AccidentalPreference): RootSpelling {
  const pc = normalizePc(rootPc)
  const table = prefer === 'sharp' ? SHARP_ROOTS : prefer === 'flat' ? FLAT_ROOTS : DEFAULT_ROOTS
  return table[pc]
}

/** 单个音级（'1' / 'b3' / '#4' / 'bb7' / '9' …）的拼写。 */
export interface DegreeSpelling {
  /** 带升降号的音名，如 `C♯` / `E♯` / `B♭♭` */
  name: string
  /** 音名对应的 pitch class（0..11） */
  pc: number
  /** 自然音字母索引（0=C … 6=B） */
  letterIndex: number
  /** 升降号个数（−2 … +2） */
  accidental: number
}

/**
 * 解析音级标签：`b`/`#`（可重复）前缀 + 数字。
 * `maj7` 是 `7` 的别名（`DEGREE_SEMITONE_MOD12` 里两键同值）。
 */
export function parseDegreeLabel(label: string): { degreeNumber: number; accidental: number } | null {
  const text = label.trim()
  const normalized = text === 'maj7' ? '7' : text
  const match = /^(#{1,2}|b{1,2})?(\d{1,2})$/.exec(normalized)
  if (!match) return null
  const accidentalText = match[1] ?? ''
  const accidental =
    accidentalText.length === 0 ? 0 : accidentalText.startsWith('#') ? accidentalText.length : -accidentalText.length
  return { degreeNumber: Number(match[2]), accidental }
}

/**
 * 把一个音级写成音名。
 *
 * @param rootPc 根音 pitch class（0..11）
 * @param degree 音级标签（`'1'` / `'b3'` / `'#4'` / `'bb7'` / `'9'` …），
 *               半音值从 `DEGREE_SEMITONE_MOD12` 查（复合音程按 mod-12 处理）
 * @param prefer 升降号偏好；不传按 `DEFAULT_ROOTS`
 */
export function spellDegree(
  rootPc: number,
  degree: string,
  prefer?: AccidentalPreference,
): DegreeSpelling {
  const root = rootSpelling(rootPc, prefer)
  const parsed = parseDegreeLabel(degree)
  const fallbackPc = normalizePc(rootPc)

  if (!parsed) {
    // 解析不了（拼错的标签）：退化成根音，至少不让界面出现空白/NaN
    return {
      name: NATURAL_LETTERS[root[0]] + accidentalSymbol(root[1]),
      pc: fallbackPc,
      letterIndex: root[0],
      accidental: root[1],
    }
  }

  const semitone = degreeSemitoneMod12(degree === 'maj7' ? '7' : degree)
  if (semitone === undefined) {
    return {
      name: NATURAL_LETTERS[root[0]] + accidentalSymbol(root[1]),
      pc: fallbackPc,
      letterIndex: root[0],
      accidental: root[1],
    }
  }

  const letterIndex = (root[0] + (parsed.degreeNumber - 1)) % 7
  const targetPc = normalizePc(rootPc + semitone)
  const diff = targetPc - LETTER_PC[letterIndex]
  const accidental = normalizeAccidental(diff)

  if (accidental === null) {
    // 理论上不该发生（音级与半音同源）。真撞上时用标签自带的升降号，
    // 而不是退回固定 pc 表 —— 那会再次产生「字母不唯一」。
    return {
      name: NATURAL_LETTERS[letterIndex] + accidentalSymbol(parsed.accidental),
      pc: targetPc,
      letterIndex,
      accidental: parsed.accidental,
    }
  }

  return {
    name: NATURAL_LETTERS[letterIndex] + accidentalSymbol(accidental),
    pc: targetPc,
    letterIndex,
    accidental,
  }
}

/**
 * 一串音级 → 音名数组。`degrees` 必须与调用方的音阶/和弦数据同序同源。
 *
 * 典型用法：`spellScale(root, SCALE_INTERVAL_DISPLAY[scaleType], prefer)`。
 */
export function spellDegrees(
  rootPc: number,
  degrees: readonly string[],
  prefer?: AccidentalPreference,
): string[] {
  return degrees.map((degree) => spellDegree(rootPc, degree, prefer).name)
}

/**
 * **显示用**：理论拼写与用户的 ♯/♭ 偏好冲突时，按偏好侧取等音。
 *
 * ## 为什么需要这一层
 *
 * `spellDegree` 是纯理论拼写：C 利底亚的 ♯4 永远写成 F♯，C 洛克里亚的 ♭2 永远写成 D♭。
 * 但界面上有一个「拼写 ♯ / ♭」开关，用户点了它就必须看到变化 —— 否则它会变成一个
 * 看起来坏掉的控件（C 调的所有调式都会「按了没反应」）。
 *
 * 所以这里把「偏好」解释为**这个音用哪一侧的等音写**：
 * - 偏好 `sharp` 而理论拼写是降号（D♭）⇒ 改用等音（C♯）；
 * - 偏好 `flat` 而理论拼写是升号（F♯）⇒ 改用等音（G♭）。
 *
 * ⚠️ 代价：当音阶本身要求这个变化音（利底亚的 ♯4、洛克里亚的 ♭2）时，强行取反
 * 会产生「同一音阶两个同字母」（C 利底亚按降号 = C D E G♭ G A B）。这是「强制偏好」
 * 的固有矛盾，不是实现缺陷；不传偏好（或偏好与理论一致）时不会发生。
 */
export function spellDegreeForDisplay(
  rootPc: number,
  degree: string,
  prefer?: AccidentalPreference,
): string {
  const spelled = spellDegree(rootPc, degree, prefer)
  if (!prefer) return spelled.name
  const conflicts = prefer === 'sharp' ? spelled.accidental < 0 : spelled.accidental > 0
  if (!conflicts) return spelled.name
  // 等音：直接按 pitch class 取偏好侧的音名（字母会变，音高不变）
  const table = prefer === 'sharp' ? SHARP_ROOTS : FLAT_ROOTS
  const [letter, accidental] = table[spelled.pc]
  return NATURAL_LETTERS[letter] + accidentalSymbol(accidental)
}

/** 根音的音名（同样遵守拼写偏好）。 */
export function spellRoot(rootPc: number, prefer?: AccidentalPreference): string {
  const [letter, accidental] = rootSpelling(rootPc, prefer)
  return NATURAL_LETTERS[letter] + accidentalSymbol(accidental)
}

/**
 * 和弦音的拼写。`intervals` 是 `CHORD_INTERVALS[type]`（相对根音的半音，含复合音程
 * 如 14/21）。音级标签取自 `chordToneLabel()`（和弦音级标签的唯一真相源）。
 *
 * ## 为什么单独做一个函数
 *
 * `chordToneLabel(semitone)` 是「半音 → 音级」的单向映射，对多数和弦够用，但
 * **增和弦的五音有歧义**：半音 8 的默认标签是 `b6`，而 C 增三和弦应当是 `G♯`（♯5）
 * 而不是 `A♭`。判据是「和弦里有没有真正的纯五度」：有（7 存在，如 Cm6 的 0,3,7,8）
 * ⇒ 8 是 ♭6；没有（0,4,8）⇒ 8 就是 ♯5。
 *
 * 同理，**减七和弦的七音**（半音 9）默认标签是 `6`，但「有减五度、没有纯五度」的
 * 和弦里它是 `bb7`（Cdim7 = C E♭ G♭ B♭♭，不是 C E♭ G♭ A）。
 */
export function spellChord(
  rootPc: number,
  intervals: readonly number[],
  prefer?: AccidentalPreference,
): string[] {
  const rounded = intervals.map((iv) => ((iv % 12) + 12) % 12)
  const hasPerfectFifth = rounded.includes(7)
  const hasTritone = rounded.includes(6)

  return intervals.map((interval, index) => {
    const label = chordToneLabel(interval)
    let degree = label === 'R' ? '1' : label
    const pc = rounded[index]

    // 增和弦：♭6 实为 ♯5（两者同 pc，但字母不同）
    if (!hasPerfectFifth && pc === 8 && degree === 'b6') {
      degree = '#5'
    }
    // 减七和弦：6 实为 ♭♭7
    if (hasTritone && !hasPerfectFifth && pc === 9 && degree === '6') {
      degree = 'bb7'
    }
    return spellDegree(rootPc, degree, prefer).name
  })
}
