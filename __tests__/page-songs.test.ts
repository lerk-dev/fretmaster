/**
 * lib/page-songs.ts 的契约测试（127 首内置曲库，纯数据）。
 *
 * 消费链：`app/page.tsx` 用 `selectedSong.chords.map(c => parseChord(c))` 得到和弦对象，
 * 再交给练习逻辑。所以**每个和弦符号都必须能被解析成注册表里真实存在的类型** ——
 * 否则 `getChordDegrees` 会走 `if (!chordType) return ["1"]`，该和弦退化成「只弹根音」。
 *
 * 本轮据此修了一处真 bug：曲库里的 'Maj7#11' / 'Maj7#5' 与注册表的 'maj7#11' / 'maj7#5'
 * 大小写不符，导致 18 个和弦（16 个 #11 + 2 个 #5，分布在多首歌里）练习时只弹根音。
 */
import { describe, it, expect } from 'vitest'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'
import { parseChord, normalizeChordType, getChordDegrees } from '@/lib/page-theory-functions'
import { CHORD_TYPES } from '@/lib/page-theory-data'

const VALID_TEMPOS = ['Slow', 'Medium', 'Fast']
const NOTE_KEY = /^[A-G][#b]?m?$/
const REGISTRY_NAMES = new Set(CHORD_TYPES.map(c => (c as { name: string }).name))

const ALL_SYMBOLS = [...new Set(SONG_PROGRESSIONS.flatMap(s => s.chords))]

// ---------------------------------------------------- 数据完整性

describe('曲库数据完整性', () => {
  it('127 首，每首字段齐全、chords 非空', () => {
    expect(SONG_PROGRESSIONS).toHaveLength(127)
    for (const s of SONG_PROGRESSIONS) {
      expect(s.name?.trim(), JSON.stringify(s)).toBeTruthy()
      expect(s.composer?.trim(), s.name).toBeTruthy()
      expect(s.style?.trim(), s.name).toBeTruthy()
      expect(s.tempo?.trim(), s.name).toBeTruthy()
      expect(s.key?.trim(), s.name).toBeTruthy()
      expect(s.chords.length, s.name).toBeGreaterThan(0)
    }
  })

  it('tempo 只在允许集合里', () => {
    const bad = SONG_PROGRESSIONS.filter(s => !VALID_TEMPOS.includes(s.tempo)).map(s => `${s.name}: ${s.tempo}`)
    expect(bad, bad.join(' | ')).toEqual([])
  })

  it('key 是合法调性（音名 + 可选 m）', () => {
    const bad = SONG_PROGRESSIONS.filter(s => !NOTE_KEY.test(s.key)).map(s => `${s.name}: ${s.key}`)
    expect(bad, bad.join(' | ')).toEqual([])
  })

  it('year 要么为空、要么是 4 位数字', () => {
    const bad = SONG_PROGRESSIONS.filter(s => s.year && !/^\d{4}$/.test(s.year)).map(s => `${s.name}: ${s.year}`)
    expect(bad, bad.join(' | ')).toEqual([])
  })

  it('如实记录：只有 1 个曲名重复，且是两版编配（chords 不同）', () => {
    const names = SONG_PROGRESSIONS.map(s => s.name)
    const dupNames = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
    expect(dupNames).toEqual(['The Girl From Ipanema'])

    const dupes = SONG_PROGRESSIONS.filter(s => s.name === 'The Girl From Ipanema')
    expect(dupes).toHaveLength(2)
    // 两条是有意的不同编配（一条每小节 1 个和弦的简化版、一条每小节 2 个）
    expect(JSON.stringify(dupes[0].chords)).not.toBe(JSON.stringify(dupes[1].chords))
  })
})

// ---------------------------------------------------- 和弦符号可解析（核心）

describe('每个和弦符号都必须能被解析并落到注册表类型上', () => {
  it('parseChord 能正确切出根音（不触发 C-Major 兜底）', () => {
    const bad: string[] = []
    for (const c of ALL_SYMBOLS) {
      const rootMatch = c.match(/^([A-G][#♯b♭]?)/)
      const p = parseChord(c)
      if (!rootMatch || p.root !== rootMatch[1]) bad.push(`${c} → ${JSON.stringify(p)}`)
    }
    expect(bad, bad.join(' | ')).toEqual([])
  })

  it('归一后的类型都存在于 CHORD_TYPES 注册表', () => {
    const bad: string[] = []
    for (const c of ALL_SYMBOLS) {
      const norm = normalizeChordType(parseChord(c).type)
      if (!REGISTRY_NAMES.has(norm)) bad.push(`${c} → '${parseChord(c).type}' → '${norm}'`)
    }
    expect(bad, bad.join(' | ')).toEqual([])
  })

  it('没有任何和弦会退化成「只弹根音」', () => {
    // 钉住修复：'Maj7#11' / 'Maj7#5' 曾因大小写不符被判定为未知类型，
    // getChordDegrees 直接返回 ["1"]。
    const degenerate = ALL_SYMBOLS.filter(c => getChordDegrees(parseChord(c).type).length <= 1)
    expect(degenerate, degenerate.join(' | ')).toEqual([])
  })

  it('Maj7#11 / Maj7#5 能解析出正确音级（本轮修复的具体用例）', () => {
    expect(getChordDegrees('Maj7#11')).toEqual(['1', '3', '5', '7', '#11'])
    expect(getChordDegrees('Maj7#5')).toEqual(['1', '3', '#5', '7'])
  })
})
