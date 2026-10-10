import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ChordTokenizer, ChordType, parseChord, clearChordTheoryCache } from '../lib/chord-theory'

// ============================================================================
// P2-8：符号写法（`Δ` / `°7` / `ø7`）的分词切片错误
// ----------------------------------------------------------------------------
// 三个 bug 同源：都用「已归一化的多字符前缀」去比「短/带大小写的符号」，或并到
// 一个分支里统一 `slice(N)` 而实际消耗长度不同 ⇒ 静默啃错字符、类型判错。
//
//   1) `CΔ7`  → 应为 majorSeven。旧写法拿 `str.slice(0,3).toLowerCase()` 比 `'Δ'`
//               （长度 1、且是大写）⇒ 恒假 ⇒ Δ 被当未知字符跳过 ⇒ 判成属七。
//   2) `C°7`  → 应为 diminished（减七）。旧写法 `firstFourChars === '°7'` 命中后
//               `slice(3)`，对 2 字符的串切掉 3 个 ⇒ 把 `7` 一起吞掉 ⇒ 只剩
//               DIMINISHED ⇒ 判成**减三和弦**（丢减七音）。
//   3) `Cø7`  → 应为 minorSevenFlatFive（半减七 m7♭5）。旧写法只给 MINOR + 让 `7`
//               走 SEVEN ⇒ 最多判成 minorSeven，**丢掉 ♭5**；而 `ø7` 正是本项目
//               m7♭5 的默认显示符号（`minor7flat5Symbol`）⇒ 显示与解析自相矛盾。
// ============================================================================

const SRC_PATH = resolve(__dirname, '../lib/chord-theory.ts')
const SRC = readFileSync(SRC_PATH, 'utf8')

/** 剥掉行注释与块注释，避免注释里的代码片段被当成真代码（铁律 20 / 34）。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 取 `nextToken` 函数体（从声明到下一个顶层 `static ` 或类结束），供作用域内断言。 */
function nextTokenBody(src: string): string {
  const start = src.indexOf('static nextToken(')
  expect(start).toBeGreaterThan(-1)
  const rest = src.slice(start)
  const end = rest.indexOf('\n    static ', 1)
  return end === -1 ? rest : rest.slice(0, end)
}

describe('P2-8 · Δ 分支：必须直接看首字符（不能靠 slice(0,3).toLowerCase()）', () => {
  it('nextToken(\'Δ\') 产出 MAJOR，且只吃 1 个字符', () => {
    expect(ChordTokenizer.nextToken('Δ')).toEqual({ token: 'MAJOR', remaining: '' })
    expect(ChordTokenizer.nextToken('Δ7')).toEqual({ token: 'MAJOR', remaining: '7' })
  })

  it('CΔ7 端到端解析为 majorSeven（不是属七）', () => {
    clearChordTheoryCache()
    const chord = parseChord('CΔ7')
    expect(chord).not.toBeNull()
    expect(chord!.rootNote).toBe(0)
    expect(chord!.chordType).toBe(ChordType.majorSeven)
  })

  it('源码锚点：Δ 分支用 str[0] === \'Δ\'，且不再有 firstThreeChars === \'Δ\' 的死写法', () => {
    const body = stripComments(nextTokenBody(SRC))
    // 判据 1：存在「首字符直比」的正确分支。
    expect(body).toContain("str[0] === 'Δ'")
    // 判据 2：不存在拿归一化三字符前缀去比单字符符号的死分支。
    expect(body).not.toContain("firstThreeChars === 'Δ'")
    // 判据 3：该分支返回的 remaining 是 slice(1)（只吃符号本身，留给后面的 7）。
    const idx = body.indexOf("str[0] === 'Δ'")
    const slice = body.slice(idx, idx + 160)
    expect(slice).toMatch(/remaining:\s*str\.slice\(1\)/)
  })
})

describe('P2-8 · °7 分支：只吃符号（1 字符），7 必须留给下游 SEVEN token', () => {
  it('nextToken(\'°7\') 产出 DIMINISHED 且 remaining === \'7\'（不是空串）', () => {
    // 🚨 这是旧 bug 的直接判据：旧写法 remaining 恒为 ''（把 7 吞了）。
    expect(ChordTokenizer.nextToken('°7')).toEqual({ token: 'DIMINISHED', remaining: '7' })
    expect(ChordTokenizer.nextToken('°')).toEqual({ token: 'DIMINISHED', remaining: '' })
  })

  it('tokenize(\'°7\') 得到 DIMINISHED + SEVEN 两个 token', () => {
    expect(ChordTokenizer.tokenize('°7')).toEqual(['DIMINISHED', 'SEVEN'])
  })

  it('C°7 端到端解析为 diminished（减七），不是 diminishedTriad（减三）', () => {
    clearChordTheoryCache()
    const seven = parseChord('C°7')
    const triad = parseChord('C°')
    expect(seven!.chordType).toBe(ChordType.diminished)
    expect(triad!.chordType).toBe(ChordType.diminishedTriad)
    // 元证明：两者必须**不同**（否则本用例无法区分修复前后）。
    expect(seven!.chordType).not.toBe(triad!.chordType)
  })

  it('源码锚点：存在 firstTwoChars === \'°7\' 且其 remaining 为 slice(1)', () => {
    const body = stripComments(nextTokenBody(SRC))
    const idx = body.indexOf("firstTwoChars === '°7'")
    expect(idx).toBeGreaterThan(-1)
    const slice = body.slice(idx, idx + 160)
    expect(slice).toMatch(/remaining:\s*str\.slice\(1\)/)
  })
})

describe('P2-8 · ø7 分支：必须一次产出 MINOR + SEVEN + FLAT_FIVE（半减七）', () => {
  it('nextToken(\'ø7\') 产出三个 token', () => {
    expect(ChordTokenizer.nextToken('ø7')).toEqual({
      token: ['MINOR', 'SEVEN', 'FLAT_FIVE'],
      remaining: '',
    })
  })

  it('tokenize(\'ø7\') === [MINOR, SEVEN, FLAT_FIVE]', () => {
    expect(ChordTokenizer.tokenize('ø7')).toEqual(['MINOR', 'SEVEN', 'FLAT_FIVE'])
  })

  it('Cø7 端到端解析为 minorSevenFlatFive（不是 minorSeven / minorTriad）', () => {
    clearChordTheoryCache()
    const chord = parseChord('Cø7')
    expect(chord).not.toBeNull()
    expect(chord!.rootNote).toBe(0)
    expect(chord!.chordType).toBe(ChordType.minorSevenFlatFive)
    // 元证明：必须与 minorSeven 区分开，否则顿位改回单 token 也能蒙混过去。
    expect(chord!.chordType).not.toBe(ChordType.minorSeven)
  })

  it('源码锚点：ø7 分支的 token 是数组且含 FLAT_FIVE', () => {
    const body = stripComments(nextTokenBody(SRC))
    const idx = body.indexOf("firstTwoChars === 'ø7'")
    expect(idx).toBeGreaterThan(-1)
    const slice = body.slice(idx, idx + 240)
    expect(slice).toContain('FLAT_FIVE')
    expect(slice).toMatch(/remaining:\s*str\.slice\(2\)/)
  })
})

describe('P2-8 · tokenize 必须能展开数组 token（否则 ø7 的三 token 会丢）', () => {
  it('源码锚点：tokenize 里有 Array.isArray(result.token) 的展开分支', () => {
    const body = stripComments(SRC)
    const idx = body.indexOf('static tokenize(')
    expect(idx).toBeGreaterThan(-1)
    const fn = body.slice(idx, idx + 700)
    expect(fn).toContain('Array.isArray(result.token)')
    expect(fn).toMatch(/tokens\.push\(\.\.\.result\.token\)/)
  })

  it('nextToken 返回类型放宽为 ChordToken | ChordToken[] | null', () => {
    const body = stripComments(SRC)
    expect(body).toContain('token: ChordToken | ChordToken[] | null')
  })
})
