/**
 * components/song-selector-dialog.tsx 的契约测试（此前零测试）。
 *
 * 乐曲选择弹窗：分组曲单 + 排序下拉 + 搜索框 + 星标/详情 + 底部三个按钮。
 *
 * 契约重点：
 *  ① 关闭不渲染；`groups` 为空显示 `no_songs_found`；
 *  ② 分组标题 = 传入的 group 名，每组歌曲数 = songs.length（防分组串位）；
 *  ③ 点歌曲 → onSelectSong(song)（**不**自动关闭，由调用方决定）；Enter/Space 等效；
 *     aria-pressed 反映 selectedSongName；
 *  ④ ★ → toggleSongFavorite(song.name) 且 stopPropagation；ⓘ → onShowSongInfo(song) 且 stopPropagation；
 *  ⑤ 排序下拉的当前值文案 = `t('sort_*')`（8 个取值都要有对应键）；
 *  ⑥ 搜索框值/占位符走 props 与 t()；
 *  ⑦ 元信息兜底：composer / year 空 → `unknown`，style 空 → `jazz_standard`；
 *  ⑧ 底部：编辑器按钮文案走 `t('song_editor_title')`（2026-09-28 由内联 `language === 'zh-CN' ? …`
 *     改为 i18n 键），自定义 → `chord_custom`，取消 → onOpenChange(false)。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SongSelectorDialog, type SongSortBy } from '@/components/song-selector-dialog'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const t = (k: string) => zh[k] ?? k

const SONG = SONG_PROGRESSIONS[0]
const SPARSE = { name: 'Untitled', composer: '', year: '', style: '', tempo: '', key: '', chords: [] } as unknown as typeof SONG

type Groups = Array<{ group: string; songs: typeof SONG[] }>

function mount(overrides: Record<string, unknown> = {}) {
  const onOpenChange = vi.fn()
  const onSelectSong = vi.fn()
  const onShowSongInfo = vi.fn()
  const onEditCustomSong = vi.fn()
  const onCreateCustomSong = vi.fn()
  const onSortByChange = vi.fn()
  const onSearchQueryChange = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    open: true,
    onOpenChange,
    groups: [{ group: '爵士标准曲', songs: [SONG] }] as Groups,
    sortBy: 'title-asc' as SongSortBy,
    onSortByChange,
    searchQuery: '',
    onSearchQueryChange,
    selectedSongName: '',
    onSelectSong,
    onShowSongInfo,
    onEditCustomSong,
    onCreateCustomSong,
    t,
    ...overrides,
  }
  act(() => { root.render(createElement(SongSelectorDialog as never, props as never)) })

  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null
  const rows = () => [...(dialog()?.querySelectorAll('[role="button"]') ?? [])] as HTMLElement[]
  const rowByTitle = (title: string) =>
    rows().find((r) => r.querySelector('.font-medium')?.textContent === title)
  const buttonsIn = (row: HTMLElement) => [...row.querySelectorAll('button')] as HTMLButtonElement[]
  const iconButton = (row: HTMLElement, label: string) =>
    buttonsIn(row).find((b) => b.getAttribute('aria-label') === label)
  const allButtons = () => [...(dialog()?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]

  return {
    container,
    onOpenChange, onSelectSong, onShowSongInfo, onEditCustomSong, onCreateCustomSong,
    onSortByChange, onSearchQueryChange,
    dialog, rows, rowByTitle, buttonsIn, iconButton, allButtons,
    text: () => dialog()?.textContent ?? '',
    click(el: HTMLElement | undefined | null) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    press(el: HTMLElement | undefined | null, key: string) {
      act(() => { el?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
    },
    type(value: string) {
      const input = dialog()!.querySelector('input') as HTMLInputElement
      // ⚠️ React 用 value tracker 去重：直接 `input.value = x` 再派发 input 事件会被判成「没变」
      // 而丢掉 onChange。必须走原型上的原生 setter 才能让 tracker 观察到变化。
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      act(() => {
        nativeSetter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

beforeEach(() => {
  useAppStore.setState({ favorites: { levelFavorites: [], songFavorites: [] } })
  document.body.innerHTML = ''
})

describe('结构', () => {
  it('关闭时什么都不渲染', () => {
    const p = mount({ open: false })
    expect(p.dialog()).toBeNull()
    p.unmount()
  })

  it('没有歌曲时显示「未找到」提示', () => {
    const p = mount({ groups: [] })
    expect(p.text()).toContain(t('no_songs_found'))
    expect(p.rows()).toHaveLength(0)
    p.unmount()
  })

  it('分组标题与歌曲数一一对应（防分组串位）', () => {
    const groups: Groups = [
      { group: 'A 组', songs: [SONG, SPARSE] },
      { group: 'B 组', songs: [SONG_PROGRESSIONS[1]] },
    ]
    const p = mount({ groups })
    expect(p.text()).toContain('A 组')
    expect(p.text()).toContain('B 组')
    // 「A 组」下 2 首 + 「B 组」下 1 首
    expect(p.rows()).toHaveLength(3)
    expect(p.rowByTitle(SONG.name)).toBeDefined()
    expect(p.rowByTitle('Untitled')).toBeDefined()
    expect(p.rowByTitle(SONG_PROGRESSIONS[1].name)).toBeDefined()
    p.unmount()
  })

  it('元信息兜底：composer / year 空显示「未知」，style 空显示「爵士标准曲」', () => {
    const p = mount({ groups: [{ group: 'g', songs: [SPARSE] }] })
    const row = p.rowByTitle('Untitled')!
    expect(row.textContent).toContain(t('unknown'))
    expect(row.textContent).toContain(t('jazz_standard'))
    p.unmount()
  })
})

describe('选择歌曲', () => {
  it('点歌曲行 → onSelectSong(song)（回调拿到的就是原对象）', () => {
    const p = mount()
    p.click(p.rowByTitle(SONG.name))
    expect(p.onSelectSong).toHaveBeenCalledTimes(1)
    expect(p.onSelectSong.mock.calls[0][0]).toBe(SONG)
    p.unmount()
  })

  it('键盘 Enter / Space 等效，其它键不触发', () => {
    const p = mount()
    const row = p.rowByTitle(SONG.name)!
    p.press(row, 'Enter')
    expect(p.onSelectSong).toHaveBeenCalledTimes(1)
    p.press(row, ' ')
    expect(p.onSelectSong).toHaveBeenCalledTimes(2)
    p.press(row, 'a')
    expect(p.onSelectSong).toHaveBeenCalledTimes(2)
    p.unmount()
  })

  it('aria-pressed 反映 selectedSongName', () => {
    const p = mount({ selectedSongName: SONG.name })
    expect(p.rowByTitle(SONG.name)!.getAttribute('aria-pressed')).toBe('true')
    p.unmount()
    const q = mount({ selectedSongName: '' })
    expect(q.rowByTitle(SONG.name)!.getAttribute('aria-pressed')).toBe('false')
    q.unmount()
  })
})

describe('星标与详情', () => {
  it('★ 只切收藏：不选中歌曲', () => {
    const p = mount()
    const row = p.rowByTitle(SONG.name)!
    p.click(p.iconButton(row, t('add_to_favorites')))
    expect(useAppStore.getState().favorites.songFavorites).toEqual([SONG.name])
    expect(p.onSelectSong).not.toHaveBeenCalled()
    p.unmount()
  })

  it('已收藏时 aria-label 变「取消收藏」，再点移除', () => {
    const p = mount()
    const row = () => p.rowByTitle(SONG.name)!
    p.click(p.iconButton(row(), t('add_to_favorites')))
    expect(p.iconButton(row(), t('remove_from_favorites'))).toBeDefined()
    p.click(p.iconButton(row(), t('remove_from_favorites')))
    expect(useAppStore.getState().favorites.songFavorites).toEqual([])
    p.unmount()
  })

  it('ⓘ 只弹详情：不选中歌曲', () => {
    const p = mount()
    const row = p.rowByTitle(SONG.name)!
    p.click(p.iconButton(row, t('view_details')))
    expect(p.onShowSongInfo).toHaveBeenCalledWith(SONG)
    expect(p.onSelectSong).not.toHaveBeenCalled()
    p.unmount()
  })
})

describe('排序与搜索', () => {
  it('8 个排序取值都能显示对应文案', () => {
    const values: SongSortBy[] = [
      'title-asc', 'title-desc', 'style-asc', 'style-desc',
      'composer-asc', 'composer-desc', 'year-asc', 'year-desc',
    ]
    for (const sortBy of values) {
      const p = mount({ sortBy })
      const trigger = p.dialog()!.querySelector('[role="combobox"]') as HTMLElement
      const key = `sort_${sortBy.replace('-', '_')}`
      expect(trigger.textContent, sortBy).toBe(t(key))
      p.unmount()
    }
  })

  it('搜索框占位符走 t()，输入回调带回新值', () => {
    const p = mount()
    const input = p.dialog()!.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('placeholder')).toBe(t('search_song_placeholder'))
    p.type('autumn')
    expect(p.onSearchQueryChange).toHaveBeenCalledWith('autumn')
    p.unmount()
  })
})

describe('底部按钮', () => {
  it('「歌曲编辑器」文案走 i18n，点击 → onEditCustomSong', () => {
    const p = mount()
    const btn = p.allButtons().find((b) => b.textContent?.includes(t('song_editor_title')))
    expect(btn, '未找到歌曲编辑器按钮').toBeDefined()
    p.click(btn)
    expect(p.onEditCustomSong).toHaveBeenCalledTimes(1)
    p.unmount()
  })

  it('「自定义」→ onCreateCustomSong；「取消」→ onOpenChange(false)', () => {
    const p = mount()
    p.click(p.allButtons().find((b) => b.textContent?.includes(t('chord_custom'))))
    expect(p.onCreateCustomSong).toHaveBeenCalledTimes(1)
    p.click(p.allButtons().find((b) => b.textContent?.includes(t('btn_cancel'))))
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    expect(p.onSelectSong).not.toHaveBeenCalled()
    p.unmount()
  })
})
