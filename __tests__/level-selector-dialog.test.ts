/**
 * components/level-selector-dialog.tsx 的契约测试（此前零测试）。
 *
 * 练习模式选择弹窗：8 个分组的等级列表 + 收藏星标 + ⓘ 详情 + 关闭。
 * 等级数据来自 lib/practice-levels（那边已有测试），这里钉界面契约：
 * **哪个分组挂哪个数组**、点卡片/星标/ⓘ 各自该发生什么、以及选中态的反映。
 *
 * 契约重点：
 *  ① 8 个分组标题齐全，且每个分组的**卡片数与对应数组长度一致** ——
 *     这种重复结构最容易把数组接错（例如把「变化音」分组接成「减音阶」）；
 *  ② 点卡片 = onSelectLevel(id) + onOpenChange(false)（选完自动关）；
 *  ③ 键盘 Enter/Space 与点击等效（走 lib/a11y 的 activateOnEnterSpace）；
 *  ④ aria-pressed 反映 selectedLevelId；
 *  ⑤ ⓘ 按钮必须 stopPropagation（只弹详情，不能顺带选中并关闭弹窗），
 *     且回传的是 ALL_PRACTICE_LEVELS 里的完整对象（不是分组里的精简对象）；
 *  ⑥ ★ 按钮必须 stopPropagation，并调用 store 的 toggleLevelFavorite；
 *     图标与 aria-label 随收藏状态变化；
 *  ⑦ 描述取自 level_desc_<id>，且**57 个等级在 zh/en 下都必须有键** ——
 *     缺键时 `t()` 返回 key 本身（真值），`|| level.description` 这个兜底永远不会生效，
 *     用户会直接看到 `level_desc_xxx` 这种原始 key；
 *  ⑧ 关闭按钮走 onOpenChange(false)。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { LevelSelectorDialog } from '@/components/level-selector-dialog'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import {
  ALL_PRACTICE_LEVELS,
  SINGLE_CHORD_TONES_LEVELS,
  TWO_CHORD_TONES_LEVELS,
  THREE_CHORD_TONES_LEVELS,
  FOUR_CHORD_TONES_LEVELS,
  MELODIC_ROOT_TO_5TH_LEVELS,
  MELODIC_5TH_TO_9TH_LEVELS,
  VOICE_LED_LEVELS,
  SUSPENDED_LEVELS,
  CHORD_SCALES_LEVELS,
  PASSING_NOTE_CHORD_SCALES_LEVELS,
  ALTERED_LEVELS,
  DIMINISHED_SCALES_LEVELS,
} from '@/lib/practice-levels'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* jsdom 缺口 */ }

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

/** 弹窗里 8 个分组 → 对应数组（顺序与组件一致） */
const SECTIONS: Array<{ key: string; levels: { id: string }[] }> = [
  { key: 'practice_category_basic', levels: [...SINGLE_CHORD_TONES_LEVELS, ...TWO_CHORD_TONES_LEVELS, ...THREE_CHORD_TONES_LEVELS] },
  { key: 'level_group_four_chord_tones', levels: FOUR_CHORD_TONES_LEVELS },
  { key: 'practice_category_melodic_r5', levels: MELODIC_ROOT_TO_5TH_LEVELS },
  { key: 'practice_category_melodic_59', levels: MELODIC_5TH_TO_9TH_LEVELS },
  { key: 'practice_category_voice_led', levels: VOICE_LED_LEVELS },
  { key: 'practice_category_passing', levels: [...SUSPENDED_LEVELS, ...CHORD_SCALES_LEVELS, ...PASSING_NOTE_CHORD_SCALES_LEVELS] },
  { key: 'level_group_altered', levels: ALTERED_LEVELS },
  { key: 'level_group_diminished', levels: DIMINISHED_SCALES_LEVELS },
]

function mount(opts: { open?: boolean; selectedLevelId?: string } = {}) {
  const { open = true, selectedLevelId = '' } = opts
  const onOpenChange = vi.fn()
  const onSelectLevel = vi.fn()
  const onShowLevelInfo = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(LevelSelectorDialog as never, {
      open, onOpenChange, onSelectLevel, onShowLevelInfo, selectedLevelId, t,
    } as never))
  })

  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null
  const cards = () => [...(dialog()?.querySelectorAll('[role="button"]') ?? [])] as HTMLElement[]
  /** 卡片按 aria-pressed 之外的唯一标识：卡片内标题文案 = t(level.nameKey) */
  const cardByTitle = (title: string) => cards().find((c) => c.querySelector('.font-medium')?.textContent === title)
  const cardById = (id: string) => {
    const level = ALL_PRACTICE_LEVELS.find((l) => l.id === id)!
    return cardByTitle(t(level.nameKey))
  }
  const buttonsIn = (card: HTMLElement) => [...card.querySelectorAll('button')] as HTMLButtonElement[]
  const iconButton = (card: HTMLElement, label: string) => buttonsIn(card).find((b) => b.getAttribute('aria-label') === label)

  return {
    container,
    onOpenChange,
    onSelectLevel,
    onShowLevelInfo,
    dialog,
    cards,
    cardByTitle,
    cardById,
    buttonsIn,
    iconButton,
    text: () => dialog()?.textContent ?? '',
    click(el: HTMLElement | undefined | null) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    press(el: HTMLElement | undefined | null, key: string) {
      act(() => { el?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

beforeEach(() => {
  useAppStore.setState({ favorites: { levelFavorites: [], songFavorites: [] } })
  document.body.innerHTML = ''
})
afterEach(() => { vi.restoreAllMocks() })

describe('结构', () => {
  it('关闭时什么都不渲染', () => {
    const p = mount({ open: false })
    expect(p.dialog()).toBeNull()
    p.unmount()
  })

  it('标题 + 8 个分组标题齐全', () => {
    const p = mount()
    expect(p.dialog()).not.toBeNull()
    expect(p.text()).toContain(t('practice_level'))
    for (const s of SECTIONS) expect(p.text(), `缺分组标题 ${s.key}`).toContain(t(s.key))
    p.unmount()
  })

  it('每个分组的卡片数与该分组的数组长度一致（防止接错数组）', () => {
    const p = mount()
    for (const s of SECTIONS) {
      // 该分组标题之后的卡片：用「卡片里是否含该组某个等级名」来数
      const titles = new Set(s.levels.map((l) => t(ALL_PRACTICE_LEVELS.find((x) => x.id === l.id)!.nameKey)))
      const found = p.cards().filter((c) => titles.has(c.querySelector('.font-medium')?.textContent ?? ''))
      expect(found.length, `分组 ${s.key} 的卡片数不符`).toBe(s.levels.length)
    }
    p.unmount()
  })

  it('所有等级在弹窗里只出现一次（无重复、无遗漏）', () => {
    const p = mount()
    const titles = p.cards().map((c) => c.querySelector('.font-medium')?.textContent)
    const expected = ALL_PRACTICE_LEVELS.map((l) => t(l.nameKey))
    expect(titles).toHaveLength(expected.length)
    expect(new Set(titles).size).toBe(expected.length)
    p.unmount()
  })

  it('每个等级都渲染了描述，且描述里不出现原始 i18n key', () => {
    const p = mount()
    expect(p.text()).not.toContain('level_desc_')
    p.unmount()
  })

  it('57 个等级在 zh / en 下都有 level_desc_ 与 nameKey 键（缺键会露出原始 key）', () => {
    const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
    const en = TRANSLATIONS['en'] as Record<string, string>
    const missing: string[] = []
    for (const l of ALL_PRACTICE_LEVELS) {
      for (const [lang, table] of [['zh', zh], ['en', en]] as const) {
        if (!(`level_desc_${l.id}` in table)) missing.push(`${lang}:level_desc_${l.id}`)
        if (!(l.nameKey in table)) missing.push(`${lang}:${l.nameKey}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('选择等级', () => {
  it('点卡片：回调 id 并关闭弹窗', () => {
    const p = mount()
    const level = SINGLE_CHORD_TONES_LEVELS[0]
    p.click(p.cardById(level.id))
    expect(p.onSelectLevel).toHaveBeenCalledWith(level.id)
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    p.unmount()
  })

  it('键盘 Enter / Space 与点击等效，其它键不触发', () => {
    const p = mount()
    const level = TWO_CHORD_TONES_LEVELS[0]
    const card = p.cardById(level.id)
    p.press(card, 'Enter')
    expect(p.onSelectLevel).toHaveBeenCalledWith(level.id)
    p.press(card, ' ')
    expect(p.onSelectLevel).toHaveBeenCalledTimes(2)
    p.press(card, 'a')
    expect(p.onSelectLevel).toHaveBeenCalledTimes(2)
    p.unmount()
  })

  it('aria-pressed 反映当前选中等级', () => {
    const id = THREE_CHORD_TONES_LEVELS[0].id
    const p = mount({ selectedLevelId: id })
    expect(p.cardById(id)!.getAttribute('aria-pressed')).toBe('true')
    const other = SINGLE_CHORD_TONES_LEVELS[0].id
    expect(p.cardById(other)!.getAttribute('aria-pressed')).toBe('false')
    p.unmount()
  })
})

describe('详情按钮 ⓘ', () => {
  it('只弹详情：不选中、不关弹窗', () => {
    const p = mount()
    const level = ALTERED_LEVELS[0]
    const card = p.cardById(level.id)!
    p.click(p.iconButton(card, t('view_details')))
    expect(p.onShowLevelInfo).toHaveBeenCalledTimes(1)
    expect(p.onSelectLevel).not.toHaveBeenCalled()
    expect(p.onOpenChange).not.toHaveBeenCalled()
    p.unmount()
  })

  it('回传的是 ALL_PRACTICE_LEVELS 里的完整对象', () => {
    const p = mount()
    const level = VOICE_LED_LEVELS[0]
    p.click(p.iconButton(p.cardById(level.id)!, t('view_details')))
    const passed = p.onShowLevelInfo.mock.calls[0][0]
    expect(passed.id).toBe(level.id)
    expect(passed).toBe(ALL_PRACTICE_LEVELS.find((l) => l.id === level.id))
    p.unmount()
  })
})

describe('收藏星标', () => {
  it('点星标只切收藏：不选中、不关弹窗', () => {
    const p = mount()
    const level = SINGLE_CHORD_TONES_LEVELS[0]
    const card = p.cardById(level.id)!
    p.click(p.iconButton(card, t('add_to_favorites')))
    expect(useAppStore.getState().favorites.levelFavorites).toEqual([level.id])
    expect(p.onSelectLevel).not.toHaveBeenCalled()
    expect(p.onOpenChange).not.toHaveBeenCalled()
    p.unmount()
  })

  it('已收藏时 aria-label 变成「取消收藏」，再点一次移除', () => {
    const level = SINGLE_CHORD_TONES_LEVELS[1]
    const p = mount()
    const card = () => p.cardById(level.id)!
    p.click(p.iconButton(card(), t('add_to_favorites')))
    expect(p.iconButton(card(), t('remove_from_favorites'))).toBeDefined()

    p.click(p.iconButton(card(), t('remove_from_favorites')))
    expect(useAppStore.getState().favorites.levelFavorites).toEqual([])
    p.unmount()
  })

  it('只有「基础练习」分组带星标（其余分组只有详情按钮）', () => {
    const p = mount()
    const basicCard = p.cardById(SINGLE_CHORD_TONES_LEVELS[0].id)!
    expect(p.buttonsIn(basicCard)).toHaveLength(2)
    const alteredCard = p.cardById(ALTERED_LEVELS[0].id)!
    expect(p.buttonsIn(alteredCard)).toHaveLength(1)
    p.unmount()
  })
})

describe('关闭', () => {
  it('底部关闭按钮走 onOpenChange(false)', () => {
    const p = mount()
    const close = [...p.dialog()!.querySelectorAll('button')].find((b) => b.textContent?.includes(t('btn_close')))
    p.click(close as HTMLElement)
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    expect(p.onSelectLevel).not.toHaveBeenCalled()
    p.unmount()
  })

  it('有 sr-only 的描述（供读屏理解弹窗用途）', () => {
    const p = mount()
    const desc = p.dialog()!.querySelector('[id^="radix-"]')
    expect(desc).not.toBeNull()
    p.unmount()
  })
})

/**
 * 8 个分组是**复制粘贴**出来的 JSX 块，但只有「基础练习」被反复点到。
 * 下面把「点卡片 / 回车 / 点 ⓘ / 按钮数」逐组跑一遍 —— 复制粘贴时最常见的错误是
 * 某一块把 `onShowLevelInfo` 写成了 `onSelectLevel`、或漏了 `stopPropagation`，
 * 只测一两个分组是抓不到的。
 *
 * 顺带钉住一处**实现不一致（本轮只报告未改）**：`level_group_altered` 与
 * `level_group_diminished` 两组的 ⓘ 直接回传分组数组里的 `level`，
 * 其余 6 组走 `ALL_PRACTICE_LEVELS.find(l => l.id === level.id)`。
 * 因为 `ALL_PRACTICE_LEVELS` 是这些数组的展开（同一批对象引用），两者结果相同，
 * 所以暂无实际 bug；但这里用**对象标识**断言「回传的必须是 ALL_PRACTICE_LEVELS 里的那个对象」，
 * 以后有人往分组里塞了与 ALL_PRACTICE_LEVELS 不同源的等级对象时，这条会挂。
 */
describe('8 个分组的交互等价性（逐组验证）', () => {
  for (const s of SECTIONS) {
    const sample = s.levels[0]
    const label = `[${s.key}]`

    it(`${label} 点卡片 → onSelectLevel(id) + 关窗`, () => {
      const p = mount()
      p.click(p.cardById(sample.id))
      expect(p.onSelectLevel).toHaveBeenCalledWith(sample.id)
      expect(p.onOpenChange).toHaveBeenCalledWith(false)
      p.unmount()
    })

    it(`${label} 回车与点击等效`, () => {
      const p = mount()
      p.press(p.cardById(sample.id), 'Enter')
      expect(p.onSelectLevel).toHaveBeenCalledWith(sample.id)
      expect(p.onOpenChange).toHaveBeenCalledWith(false)
      p.unmount()
    })

    it(`${label} ⓘ 只调 onShowLevelInfo，且回传 ALL_PRACTICE_LEVELS 里的同一个对象`, () => {
      const p = mount()
      const card = p.cardById(sample.id)!
      p.click(p.iconButton(card, t('view_details')))
      expect(p.onShowLevelInfo).toHaveBeenCalledTimes(1)
      expect(p.onSelectLevel).not.toHaveBeenCalled()
      expect(p.onOpenChange).not.toHaveBeenCalled()
      const passed = p.onShowLevelInfo.mock.calls[0][0]
      expect(passed.id).toBe(sample.id)
      expect(passed).toBe(ALL_PRACTICE_LEVELS.find((l) => l.id === sample.id))
      p.unmount()
    })

    it(`${label} 卡片里只有 ⓘ（星标只在「基础练习」分组）`, () => {
      const p = mount()
      const isBasic = s.key === 'practice_category_basic'
      expect(p.buttonsIn(p.cardById(sample.id)!)).toHaveLength(isBasic ? 2 : 1)
      p.unmount()
    })
  }
})
