/**
 * 收藏星标的刷新行为。
 *
 * 背景：app/page.tsx 曾用 `isFavorite={store.isLevelFavorite}` 把「求值函数」传给
 * LevelSelectorDialog / SongSelectorDialog。但这两个弹窗是 `memo()` 包裹、且其余 props
 * 引用全部稳定（t = useCallback([language])、onShowLevelInfo = useCallback([])、
 * 其余是 setState / store action），父组件即便因收藏变化而重渲染也会被 memo 跳过 ——
 * 结果：点击星标后 store 已更新，图标却不刷新。
 *
 * 修复：让弹窗自身订阅 favorites（`useAppStore((s) => s.favorites.levelFavorites)`），
 * 订阅驱动重渲染，星标即时刷新。本文件第 1、2 组断言验证修复；
 * 第 3 组保留「旧写法为什么不生效」的最小复现，作为设计理由的活文档。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, createElement, memo, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { LevelSelectorDialog } from '@/components/level-selector-dialog'
import { SongSelectorDialog } from '@/components/song-selector-dialog'
import { TRANSLATIONS } from '@/lib/i18n'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'
import { useAppStore } from '@/lib/store'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Radix（ScrollArea / Dialog）在 jsdom 下需要 ResizeObserver
if (!(globalThis as Record<string, unknown>).ResizeObserver) {
  ;(globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const t = (key: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[key] ?? key
const ADD = t('add_to_favorites') // 添加收藏
const REMOVE = t('remove_from_favorites') // 取消收藏

const favorites = () => useAppStore.getState().favorites
const resetFavorites = () =>
  useAppStore.setState({ favorites: { levelFavorites: [], songFavorites: [] } })

/** 在真实 DOM 上挂一个组件（Dialog 内容会 portal 到 document.body） */
function mount(ui: ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return {
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

const starWithLabel = (label: string) =>
  document.querySelector(`button[aria-label="${label}"]`) as HTMLElement | null

/** 弹窗里每个条目都有一个星标，所以要按数量断言（不能断言某个 label 是否存在） */
const countStars = (label: string) =>
  document.querySelectorAll(`button[aria-label="${label}"]`).length

beforeEach(() => {
  resetFavorites()
  document.querySelectorAll('[data-radix-popper-content-wrapper]').forEach((n) => n.remove())
})

describe('修复后：弹窗自身订阅 favorites，点击星标即时刷新', () => {
  it('LevelSelectorDialog：点「添加收藏」后按钮立刻变成「取消收藏」', () => {
    const h = mount(
      createElement(LevelSelectorDialog, {
        open: true,
        onOpenChange: () => {},
        selectedLevelId: '',
        onSelectLevel: () => {},
        onShowLevelInfo: () => {},
        t,
      })
    )

    const addBtn = starWithLabel(ADD)
    expect(addBtn).not.toBeNull()
    expect(countStars(REMOVE)).toBe(0)

    click(addBtn!)

    // store 更新
    expect(favorites().levelFavorites).toHaveLength(1)
    // 且 UI 立即反映（修复前这里是 0，要关掉重开弹窗才变）
    expect(countStars(REMOVE)).toBe(1)

    h.unmount()
  })

  it('SongSelectorDialog：点「添加收藏」后按钮立刻变成「取消收藏」', () => {
    const h = mount(
      createElement(SongSelectorDialog, {
        open: true,
        onOpenChange: () => {},
        groups: [{ group: '全部', songs: [SONG_PROGRESSIONS[0]] }],
        sortBy: 'title-asc',
        onSortByChange: () => {},
        searchQuery: '',
        onSearchQueryChange: () => {},
        selectedSongName: '',
        onSelectSong: () => {},
        onShowSongInfo: () => {},
        onEditCustomSong: () => {},
        onCreateCustomSong: () => {},
        t,
      })
    )

    const addBtn = starWithLabel(ADD)
    expect(addBtn).not.toBeNull()
    expect(countStars(REMOVE)).toBe(0)

    click(addBtn!)

    expect(favorites().songFavorites).toHaveLength(1)
    expect(countStars(REMOVE)).toBe(1)

    h.unmount()
  })
})

describe('反例（设计理由）：若改成「父组件传求值函数」，memo 会让星标不刷新', () => {
  it('memo 子组件 + 引用稳定的 props ⇒ 父组件重渲染也带不动它', () => {
    // 这正是修复前的形态：父订阅 favorites（值不使用），把 store action 作为 props 往下传
    // 等价于已删除的 store.isLevelFavorite：引用稳定、non-reactive 的「求值函数」。
    // 在测试内本地复现同一形态，以免测试依赖「只为测试而存在」的 store API。
    const readLevelFavorite = (id: string) =>
      useAppStore.getState().favorites.levelFavorites.includes(id)
    const toggleLevelFavorite = (id: string) =>
      useAppStore.getState().toggleLevelFavorite(id)

    const StarRow = memo(function StarRow({
      isFavorite,
      onToggle,
    }: {
      isFavorite: (id: string) => boolean
      onToggle: (id: string) => void
    }) {
      return createElement('button', {
        'data-testid': 'star',
        'data-fav': String(isFavorite('level-a')),
        onClick: () => onToggle('level-a'),
      })
    })

    function Parent() {
      useAppStore((s) => s.favorites) // 父组件确实订阅了
      return createElement(StarRow, {
        isFavorite: readLevelFavorite,
        onToggle: toggleLevelFavorite,
      })
    }

    const h = mount(createElement(Parent))
    const star = () => document.querySelector('[data-testid="star"]') as HTMLElement
    expect(star().getAttribute('data-fav')).toBe('false')

    click(star())

    // store 变了
    expect(favorites().levelFavorites).toContain('level-a')
    // 但 UI 没变 —— 这就是本次修复要消除的行为
    expect(star().getAttribute('data-fav')).toBe('false')

    h.unmount()
  })
})
