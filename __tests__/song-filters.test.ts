/**
 * 乐曲选择辅助函数（lib/song-filters.ts）的契约测试。
 *
 * 这三个纯函数决定「乐曲选择器」的搜索、排序与分组。最容易出错的地方是
 * **排序键与分组键不一致**：filterAndGroupSongs 是「先排序、再按相邻 groupKey 归组」，
 * 一旦排序结果里同一个组键不连续，UI 就会出现两个同名的分组块。
 * 本文件用全量真实数据（127 首 × 8 种排序）把这一点钉死。
 */
import { describe, it, expect } from 'vitest'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'
import type { SongProgression } from '@/lib/page-songs'
import { filterAndGroupSongs, getSongGroupKey, sortSongs } from '@/lib/song-filters'

type Songs = typeof SONG_PROGRESSIONS

const SORTS = [
  'title-asc', 'title-desc', 'style-asc', 'style-desc',
  'composer-asc', 'composer-desc', 'year-asc', 'year-desc',
]

/** 造一首最小可用歌曲（只填测试关心的字段） */
function mk(name: string, extra: Partial<SongProgression> = {}): SongProgression {
  return { name, composer: '', year: '', style: '', tempo: '', key: '', chords: [], ...extra } as unknown as SongProgression
}
const asSongs = (arr: SongProgression[]) => arr as unknown as Songs

describe('getSongGroupKey', () => {
  it('title 排序：字母取首字母大写、数字开头归 #、中文归「中文」', () => {
    expect(getSongGroupKey(mk('Autumn Leaves'), 'title-asc')).toBe('A')
    expect(getSongGroupKey(mk('autumn leaves'), 'title-desc')).toBe('A') // 大小写无关
    expect(getSongGroupKey(mk('500 Miles'), 'title-asc')).toBe('#')
    expect(getSongGroupKey(mk('蓝莲花'), 'title-asc')).toBe('中文')
    expect(getSongGroupKey(mk('蓝莲花'), 'title-desc')).toBe('中文')
  })

  it('style / composer 排序：按原值分组，缺省分别归「其他」「未知」', () => {
    expect(getSongGroupKey(mk('x', { style: 'Bebop' }), 'style-asc')).toBe('Bebop')
    expect(getSongGroupKey(mk('x'), 'style-asc')).toBe('其他')
    expect(getSongGroupKey(mk('x', { composer: 'Bill Evans' }), 'composer-asc')).toBe('B')
    expect(getSongGroupKey(mk('x', { composer: '艾热' }), 'composer-asc')).toBe('中文')
    expect(getSongGroupKey(mk('x'), 'composer-desc')).toBe('未知')
  })

  it('year 排序：按十年分组，解析不出年份的归「未知」', () => {
    expect(getSongGroupKey(mk('x', { year: '1962' }), 'year-asc')).toBe('1960s')
    expect(getSongGroupKey(mk('x', { year: '1951' }), 'year-desc')).toBe('1950s')
    expect(getSongGroupKey(mk('x', { year: '' }), 'year-asc')).toBe('未知')
    expect(getSongGroupKey(mk('x', { year: 'abc' }), 'year-asc')).toBe('未知')
  })

  it('未知排序方式归「其他」', () => {
    expect(getSongGroupKey(mk('x'), 'nope')).toBe('其他')
    expect(getSongGroupKey(mk('x'), '')).toBe('其他')
  })
})

describe('sortSongs', () => {
  it('不改入参、返回新数组', () => {
    const input = [mk('B'), mk('A')]
    const snapshot = input.map((s) => s.name)
    const out = sortSongs(asSongs(input), 'title-asc')
    expect(input.map((s) => s.name)).toEqual(snapshot) // 原数组顺序未被动过
    expect(out).not.toBe(input) // 是另一个数组
    expect(out.map((s) => s.name)).toEqual(['A', 'B'])
  })

  it('title 排序的优先级：数字 < 字母 < 中文', () => {
    const out = sortSongs(asSongs([mk('中文歌'), mk('Beta'), mk('123')]), 'title-asc')
    expect(out.map((s) => s.name)).toEqual(['123', 'Beta', '中文歌'])
  })

  it('title-desc 在组内反向，但优先级不变（数字组仍最前）', () => {
    const out = sortSongs(asSongs([mk('Apple'), mk('Avocado'), mk('123')]), 'title-desc')
    expect(out.map((s) => s.name)).toEqual(['123', 'Avocado', 'Apple'])
  })

  it('style / composer 升降序', () => {
    const data = [mk('s1', { style: 'Zzz' }), mk('s2', { style: 'Aaa' })]
    expect(sortSongs(asSongs(data), 'style-asc').map((s) => s.style)).toEqual(['Aaa', 'Zzz'])
    expect(sortSongs(asSongs(data), 'style-desc').map((s) => s.style)).toEqual(['Zzz', 'Aaa'])
    const c = [mk('c1', { composer: 'Zed' }), mk('c2', { composer: 'Abe' })]
    expect(sortSongs(asSongs(c), 'composer-asc').map((s) => s.composer)).toEqual(['Abe', 'Zed'])
    expect(sortSongs(asSongs(c), 'composer-desc').map((s) => s.composer)).toEqual(['Zed', 'Abe'])
  })

  it('year 排序把解析不出的年份当 0（排最前）', () => {
    const data = [mk('later', { year: '1990' }), mk('none', { year: '' }), mk('early', { year: '1930' })]
    expect(sortSongs(asSongs(data), 'year-asc').map((s) => s.name)).toEqual(['none', 'early', 'later'])
    expect(sortSongs(asSongs(data), 'year-desc').map((s) => s.name)).toEqual(['later', 'early', 'none'])
  })

  it('未知排序方式返回等长副本（保持原顺序）', () => {
    const out = sortSongs(asSongs([mk('B'), mk('A')]), 'nope')
    expect(out.map((s) => s.name)).toEqual(['B', 'A'])
  })
})

describe('filterAndGroupSongs', () => {
  it('空查询返回全部，各组总数守恒（不丢歌）', () => {
    for (const sortBy of SORTS) {
      const groups = filterAndGroupSongs(SONG_PROGRESSIONS, '', sortBy)
      const total = groups.reduce((n, g) => n + g.songs.length, 0)
      expect(total, sortBy).toBe(SONG_PROGRESSIONS.length)
    }
  })

  it('分组键不得重复出现 —— 排序键与分组键必须一致（否则 UI 会有两个同名分组块）', () => {
    for (const sortBy of SORTS) {
      const seen = new Set<string>()
      for (const g of filterAndGroupSongs(SONG_PROGRESSIONS, '', sortBy)) {
        expect(seen.has(g.group), `${sortBy} 的组「${g.group}」重复出现`).toBe(false)
        seen.add(g.group)
      }
    }
  })

  it('每首歌的 groupKey 必须等于它所在组的组名（分组语义自洽）', () => {
    for (const sortBy of SORTS) {
      for (const g of filterAndGroupSongs(SONG_PROGRESSIONS, '', sortBy)) {
        for (const s of g.songs) {
          expect(getSongGroupKey(s, sortBy), `${sortBy} / 组「${g.group}」/ 曲「${s.name}」`).toBe(g.group)
        }
      }
    }
  })

  it('搜索命中 name / style / composer / year，且大小写不敏感', () => {
    const data = asSongs([
      mk('Autumn Leaves', { style: 'Jazz Swing', composer: 'Kosma', year: '1945' }),
      mk('Blue Bossa', { style: 'Bossa', composer: 'Kenny Dorham', year: '1963' }),
    ])
    const names = (q: string) =>
      filterAndGroupSongs(data, q, 'title-asc').flatMap((g) => g.songs.map((s) => s.name))
    expect(names('autumn')).toEqual(['Autumn Leaves']) // 曲名，小写查询
    expect(names('AUTUMN')).toEqual(['Autumn Leaves']) // 大写查询
    expect(names('bossa')).toEqual(['Blue Bossa'])
    expect(names('jazz swing')).toEqual(['Autumn Leaves']) // style 命中
    expect(names('dorham')).toEqual(['Blue Bossa']) // composer 命中
    expect(names('1963')).toEqual(['Blue Bossa']) // year 命中
    expect(names('zzz')).toEqual([])
  })

  it('纯空白查询等同于不过滤', () => {
    const data = asSongs([mk('Aaa'), mk('Abb')]) // 同首字母 → 落在同一组
    const groups = filterAndGroupSongs(data, '   ', 'title-asc')
    expect(groups.flatMap((g) => g.songs)).toHaveLength(2)
  })

  it('未知排序方式归为单一「其他」组', () => {
    const groups = filterAndGroupSongs(SONG_PROGRESSIONS, '', 'nope')
    expect(groups).toHaveLength(1)
    expect(groups[0].group).toBe('其他')
    expect(groups[0].songs).toHaveLength(SONG_PROGRESSIONS.length)
  })

  it('搜索后再分组，分组键仍不重复', () => {
    for (const q of ['a', 'jazz', '19', 'Bossa']) {
      for (const sortBy of SORTS) {
        const seen = new Set<string>()
        for (const g of filterAndGroupSongs(SONG_PROGRESSIONS, q, sortBy)) {
          expect(seen.has(g.group), `q=${q} sortBy=${sortBy} 的组「${g.group}」重复出现`).toBe(false)
          seen.add(g.group)
        }
      }
    }
  })
})
