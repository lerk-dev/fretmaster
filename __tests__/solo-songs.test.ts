/**
 * lib/solo-songs.ts 的契约测试（此前零测试）。
 *
 * 该模块把 SOLO 原版格式的歌曲数据（`public/data/songs.json`，301KB，确实存在）
 * 转换成 FretMaster 格式：三张手写映射表 + convertSoloSong。
 *
 * ⚠️ 现状（如实记录）：`loadSoloSongs` 与全部 convert* 函数**当前零消费者**
 * —— `app/page.tsx` 只 `import { SOLO_SONGS }`（那是恒为 `[]` 的占位），整条链路未接线。
 * 因此这些断言是「防未来接线时静默出错」的护栏。
 *
 * 本轮修了一个真 bug：`convertChordType('major')` 因 `||` 的空字符串短路返回 `'major'`
 * 而非映射值 `''`（详见该函数注释）；影响被解析器的大小写容错掩盖，故症状隐蔽。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  convertRootNote,
  convertChordType,
  convertKey,
  chordToSymbol,
  convertSoloSong,
  type SoloSongRaw,
} from '@/lib/solo-songs'
import { parseChordSymbol, ROOT_NOTES } from '@/lib/custom-song-editor'

// CHORD_TYPE_MAP 的输入键（从源码逐条抄录，共 46 个）
const SOLO_CHORD_KEYS = [
  'major', 'majorSeven', 'majorNine', 'majorEleven', 'majorThirteen', 'majorSix', 'majorSixNine',
  'minor', 'minorSeven', 'minorNine', 'minorEleven', 'minorThirteen', 'minorSix', 'minorMajorSeven',
  'minorSevenFlatFive', 'minorNineFlatFive', 'dominantSeven', 'dominantNine', 'dominantEleven',
  'dominantThirteen', 'dominantSevenFlatFive', 'dominantSevenSharpFive', 'dominantSevenFlatNine',
  'dominantSevenSharpNine', 'dominantSevenSharpEleven', 'dominantSevenFlatThirteen',
  'dominantSevenFlatNineFlatThirteen', 'dominantSevenSharpFiveFlatNine', 'dominantSevenSharpFiveSharpNine',
  'dominantThirteenFlatNine', 'dominantThirteenSharpEleven', 'dominantSevenAlt', 'diminished',
  'diminishedSeven', 'augmented', 'augmentedSeven', 'augmentedMajorSeven', 'suspendedTwo',
  'suspendedFour', 'dominantSevenSuspendedFour', 'dominantNineSuspendedFour',
  'dominantElevenSuspendedFour', 'addNine', 'minorAddNine', 'majorSevenSharpFive', 'halfDiminished',
]

const ROOT_KEYS = [
  'c', 'cSharp', 'd', 'eFlat', 'e', 'f', 'fSharp', 'g', 'aFlat', 'a', 'bFlat', 'b',
  'dFlat', 'gFlat', 'aSharp', 'dSharp', 'gSharp', 'cFlat', 'fFlat', 'eSharp', 'bSharp',
]

function raw(overrides: Partial<SoloSongRaw> = {}): SoloSongRaw {
  return {
    id: 1, name: 'T', composer: 'X', beatsPerMeasure: 4, beatSize: 4, tempo: 120,
    key: 'cMajor',
    chords: [
      { beats: 4, function: 'T', rootNote: 'c', chordType: 'majorSeven' },
      { beats: 2, function: 'S', rootNote: 'a', chordType: 'minorSeven' },
    ],
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

// ---------------------------------------------------- 单独转换函数

describe('convertRootNote', () => {
  it('把 SOLO 的根音名转成标准记法', () => {
    expect(convertRootNote('c')).toBe('C')
    expect(convertRootNote('cSharp')).toBe('C#')
    expect(convertRootNote('eFlat')).toBe('Eb')
    expect(convertRootNote('fSharp')).toBe('F#')
    expect(convertRootNote('bFlat')).toBe('Bb')
  })

  it('未收录的输入原样大写（兜底不抛）', () => {
    expect(convertRootNote('zzz')).toBe('ZZZ')
  })
})

describe('convertChordType', () => {
  it('把 SOLO 的和弦类型转成标准后缀', () => {
    expect(convertChordType('majorSeven')).toBe('Maj7')
    expect(convertChordType('minorSeven')).toBe('m7')
    expect(convertChordType('dominantSeven')).toBe('7')
    expect(convertChordType('halfDiminished')).toBe('m7b5')
    expect(convertChordType('minorAddNine')).toBe('madd9')
    expect(convertChordType('majorSixNine')).toBe('6/9')
  })

  it('大三和弦映射为空后缀（钉住修复：|| 的空字符串短路 bug）', () => {
    // 'major' 在映射表里是 ''，用 || 会被 falsy 短路 ⇒ 返回原文 'major' ⇒ 符号变成 'Cmajor'
    expect(convertChordType('major')).toBe('')
  })

  it('未收录的输入原样返回', () => {
    expect(convertChordType('someNewType')).toBe('someNewType')
  })
})

describe('convertKey', () => {
  it('大调 / 小调都能转', () => {
    expect(convertKey('cMajor')).toBe('C')
    expect(convertKey('fSharpMajor')).toBe('F#')
    expect(convertKey('bFlatMajor')).toBe('Bb')
    expect(convertKey('aMinor')).toBe('Am')
    expect(convertKey('gSharpMinor')).toBe('G#m')
    expect(convertKey('eFlatMinor')).toBe('Ebm')
  })

  it('未收录的输入原样返回', () => {
    expect(convertKey('huh')).toBe('huh')
  })
})

describe('chordToSymbol', () => {
  it('根音 + 后缀拼接；大三和弦不带后缀', () => {
    expect(chordToSymbol({ rootNote: 'c', chordType: 'major', beats: 4, function: '' })).toBe('C')
    expect(chordToSymbol({ rootNote: 'a', chordType: 'minorSeven', beats: 4, function: '' })).toBe('Am7')
    expect(chordToSymbol({ rootNote: 'eFlat', chordType: 'majorSeven', beats: 4, function: '' })).toBe('EbMaj7')
  })

  it('每个映射值都用「根音 C」拼一次（覆盖全部键，确保不抛）', () => {
    for (const k of SOLO_CHORD_KEYS) {
      expect(() => chordToSymbol({ rootNote: 'c', chordType: k, beats: 4, function: '' })).not.toThrow()
    }
  })
})

// -------------------------------------------------- convertSoloSong

describe('convertSoloSong', () => {
  it('保留元数据，转换 key / chords / chordsDetailed', () => {
    const out = convertSoloSong(raw())
    expect(out).toMatchObject({
      id: 1, name: 'T', composer: 'X', beatsPerMeasure: 4, beatSize: 4, tempo: 120, key: 'C',
    })
    expect(out.chords).toEqual(['CMaj7', 'Am7'])
    expect(out.chordsDetailed).toEqual([
      { beats: 4, function: 'T', rootNote: 'C', chordType: 'majorSeven' },
      { beats: 2, function: 'S', rootNote: 'A', chordType: 'minorSeven' },
    ])
  })

  it('chords 与 chordsDetailed 一一对应', () => {
    const out = convertSoloSong(raw())
    expect(out.chords).toHaveLength(out.chordsDetailed.length)
    out.chordsDetailed.forEach((c, i) => {
      expect(out.chords[i]).toBe(c.rootNote + (convertChordType(c.chordType)))
    })
  })
})

// ---------------------------------------------------- loadSoloSongs

describe('loadSoloSongs', () => {
  /** cachedSongs 是模块级状态，每个用例都取一份全新的模块实例 */
  async function freshLoad() {
    vi.resetModules()
    const mod = await import('@/lib/solo-songs')
    return mod.loadSoloSongs
  }

  it('从 /data/songs.json 加载并转换', async () => {
    const load = await freshLoad()
    const fetchSpy = vi.fn(async () => ({
      json: async () => ({
        songs: [{
          id: 7, name: 'S', composer: 'C', beatsPerMeasure: 4, beatSize: 4, tempo: 100,
          key: 'aMinor',
          chords: [{ beats: 4, function: '', rootNote: 'a', chordType: 'minor' }],
        }],
      }),
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const songs = await load()
    expect(fetchSpy).toHaveBeenCalledWith('/data/songs.json')
    expect(songs[0].key).toBe('Am')
    expect(songs[0].chords).toEqual(['Am'])
  })

  it('第二次调用复用缓存（不再 fetch、返回同一引用）', async () => {
    const load = await freshLoad()
    const fetchSpy = vi.fn(async () => ({
      json: async () => ({ songs: [raw()] }),
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const a = await load()
    const b = await load()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('加载失败时返回空数组（不抛）', async () => {
    const load = await freshLoad()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    await expect(load()).resolves.toEqual([])
  })

  it('SOLO_SONGS 是恒空的占位导出', async () => {
    vi.resetModules()
    const mod = await import('@/lib/solo-songs')
    expect(mod.SOLO_SONGS).toEqual([])
  })
})

// ---------------------------------- 与项目类型库的对齐（如实记录）

describe('映射表与项目和弦类型库的对齐情况（如实记录，非断言“正确”）', () => {
  /**
   * 这些 SOLO 类型转换后**无法被项目的 parseChordSymbol 识别**，会被降级为大三和弦。
   * 因为整条链路尚未接线，目前不影响用户；一旦接线，这些和弦会静默变成大三和弦。
   * 若将来给 CHORD_TYPES 补齐了类型，本断言会失败 —— 届时请更新此清单。
   */
  const NOT_RECOGNIZED: Record<string, string> = {
    majorEleven: 'Maj11',
    majorThirteen: 'Maj13',
    minor: 'm',
    minorThirteen: 'm13',
    dominantSevenSharpEleven: '7#11',
    dominantSevenFlatThirteen: '7b13',
    dominantSevenFlatNineFlatThirteen: '7b9b13',
    dominantSevenSharpFiveFlatNine: '7#5b9',
    dominantSevenSharpFiveSharpNine: '7#5#9',
    dominantSevenAlt: '7alt',
    augmentedMajorSeven: 'augMaj7',
    dominantElevenSuspendedFour: '11sus4',
  }

  it('无法识别的映射清单与记录一致', () => {
    const degraded: Record<string, string> = {}
    for (const k of SOLO_CHORD_KEYS) {
      const type = convertChordType(k)
      if (type === '') continue // 大三和弦无后缀，正确
      const parsed = parseChordSymbol('C' + type)
      if (!parsed || parsed.chordType === 'Major') degraded[k] = type
    }
    expect(degraded).toEqual(NOT_RECOGNIZED)
    // 其余映射均能被正确识别
    expect(Object.keys(degraded)).toHaveLength(12)
  })

  it('根音映射里有 4 个理论音名不在项目的 ROOT_NOTES 中（如实记录）', () => {
    const roots = new Set<string>(ROOT_NOTES.map((r) => r.id))
    const missing = ROOT_KEYS.map(convertRootNote).filter((r) => !roots.has(r))
    expect(missing.sort()).toEqual(['B#', 'Cb', 'E#', 'Fb'])
  })
})
