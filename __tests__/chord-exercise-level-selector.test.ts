/**
 * components/chord-exercise-level-selector.tsx 的契约测试（此前零测试）。
 *
 * 与 level-selector-dialog 是**两个不同的入口**：那个用内置的 8 组练习等级，
 * 这个的 groups 由 props 传入（和弦练习模式），因此这里测的是「组件如何消费 groups」。
 *
 * 契约：
 *  ① `open` 为假 → 不渲染任何东西（Dialog 走 portal，查 document.body）；
 *  ② 分组标题按 language 取 nameZh / name；
 *  ③ 每条等级：名字走 t(nameKey)、描述走 t(level_desc_<id>)、aria-pressed 反映选中；
 *  ④ 点卡片 = 选中 + 关闭；Enter / Space 等价；
 *  ⑤ ⓘ 只弹详情，不选中、不关闭（stopPropagation）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ChordExerciseLevelSelector } from '@/components/chord-exercise-level-selector'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
// radix 的 ScrollArea / Dialog 内部依赖 ResizeObserver（jsdom 无）
;(globalThis as Record<string, unknown>).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k
const CJK = /[\u4e00-\u9fff]/

/** 最小可用的 PracticeLevel（组件只读 id / nameKey / description 等少数字段） */
function level(id: string, nameKey: string, description: string) {
  return { id, nameKey, name: id, nameZh: id, description, groupName: 'g', groupNameZh: 'G' } as never
}

const GROUPS = [
  {
    id: 'triads',
    name: 'Triads',
    nameZh: '三和弦',
    levels: [
      // description 用**英文**：真实 PracticeLevel.description 全是英文原文，它是
      // 「译文键缺失时」的兜底显示（lib/i18n.ts 的 translateOr）。此前 fixture 写成
      // 中文，恰好掩盖了真兜底的行为 —— 英文界面下会显示这段中文，被「不含汉字」用例抓到。
      level('triad_root', 'level_triad_root', 'Root notes only'),
      level('triad_arrpeggio', 'level_triad_arrpeggio', 'All chord tones'),
    ],
  },
  {
    id: 'sevenths',
    name: 'Sevenths',
    nameZh: '七和弦',
    levels: [level('seventh_root', 'level_seventh_root', 'Seventh root only')],
  },
] as never

let cleanups: Array<() => void> = []
beforeEach(() => {
  cleanups = []
})
afterEach(() => {
  // 用例中途断言失败会跳过自己的 unmount()，卸载本身也可能抛错 —— 都会留下 DOM 污染
  // 下一条用例（表现为无关的「假失败」）。逐条 try + 兜底清空 body（Dialog 走 portal）。
  for (const fn of cleanups) {
    try { fn() } catch { /* 忽略卸载异常 */ }
  }
  cleanups = []
  document.body.innerHTML = ''
})

function mount(props: Partial<{
  open: boolean
  language: string
  t: (k: string) => string
  groups: unknown
  selectedLevelId: string
}> = {}) {
  const onOpenChange = vi.fn()
  const onSelectLevel = vi.fn()
  const onShowLevelInfo = vi.fn()
  const p = {
    open: true,
    onOpenChange,
    groups: GROUPS,
    selectedLevelId: '',
    onSelectLevel,
    onShowLevelInfo,
    language: 'zh-CN',
    t: tZh,
    ...props,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(ChordExerciseLevelSelector as never, p as never)) })
  cleanups.push(() => { act(() => root.unmount()); container.remove() })

  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null
  const cards = () => [...(dialog()?.querySelectorAll('[role="button"]') ?? [])] as HTMLElement[]
  const infoButtons = () =>
    [...(dialog()?.querySelectorAll('button[aria-label]') ?? [])].filter(
      (b) => b.getAttribute('aria-label') === zh['view_details'],
    ) as HTMLElement[]

  return {
    container,
    onOpenChange,
    onSelectLevel,
    onShowLevelInfo,
    dialog,
    cards,
    infoButtons,
    unmount: () => { act(() => root.unmount()); container.remove() },
    click(el: HTMLElement | null | undefined) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    key(el: HTMLElement | null | undefined, k: string) {
      act(() => {
        el?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
      })
    },
    text: () => dialog()?.textContent ?? '',
  }
}

describe('开关与结构', () => {
  it('open=false → 不渲染任何内容', () => {
    const p = mount({ open: false })
    expect(p.dialog()).toBeNull()
    p.unmount()
  })

  it('open=true → 渲染 dialog，标题走 t(practice_level)', () => {
    const p = mount()
    expect(p.dialog()).not.toBeNull()
    expect(p.text()).toContain(tZh('practice_level'))
    // 两个分组 × 各自的等级数 = 3 张卡
    expect(p.cards()).toHaveLength(3)
    p.unmount()
  })

  it('分组标题按 language 取 nameZh / name', () => {
    const zhP = mount({ language: 'zh-CN' })
    expect(zhP.text()).toContain('三和弦')
    expect(zhP.text()).toContain('七和弦')
    zhP.unmount()

    const enP = mount({ language: 'en', t: tEn })
    expect(enP.text()).toContain('Triads')
    expect(enP.text()).toContain('Sevenths')
    expect(enP.text()).not.toContain('三和弦')
    enP.unmount()
  })

  it('每条等级都把 nameKey 与 level_desc_<id> 交给 t()', () => {
    // 用 spy 记录被请求的键：直接断言文本会「假通过」——假键名经 t() 返回键名本身，
    // 组件渲染的也正是键名，于是 toContain(键名) 恒真。
    const requested: string[] = []
    const spyT = (k: string) => { requested.push(k); return tZh(k) }
    const p = mount({ t: spyT })
    expect(requested).toContain('level_triad_root')
    expect(requested).toContain('level_triad_arrpeggio')
    expect(requested).toContain('level_seventh_root')
    expect(requested).toContain('level_desc_triad_root')
    expect(requested).toContain('level_desc_seventh_root')
    p.unmount()
  })

  it('英文下不含汉字（含分组的英文名）', () => {
    const p = mount({ language: 'en', t: tEn })
    expect(p.text()).not.toMatch(CJK)
    p.unmount()
  })
})

describe('选中态', () => {
  it('aria-pressed 只对 selectedLevelId 那条为 true', () => {
    const p = mount({ selectedLevelId: 'triad_arrpeggio' })
    const pressed = p.cards().map((c) => c.getAttribute('aria-pressed'))
    expect(pressed).toEqual(['false', 'true', 'false'])
    p.unmount()
  })

  it('无选中时全部为 false', () => {
    const p = mount({ selectedLevelId: '' })
    expect(p.cards().every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true)
    p.unmount()
  })

  it('等级卡是可聚焦的（tabIndex=0）', () => {
    const p = mount()
    expect(p.cards().every((c) => c.getAttribute('tabindex') === '0')).toBe(true)
    p.unmount()
  })
})

describe('交互', () => {
  it('点卡片 → onSelectLevel(id) 且关闭弹窗', () => {
    const p = mount()
    p.click(p.cards()[0])
    expect(p.onSelectLevel).toHaveBeenCalledWith('triad_root')
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    p.unmount()
  })

  it('Enter 与 Space 等价于点击', () => {
    const p = mount()
    p.key(p.cards()[1], 'Enter')
    expect(p.onSelectLevel).toHaveBeenCalledWith('triad_arrpeggio')
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    p.unmount()

    const p2 = mount()
    p2.key(p2.cards()[2], ' ')
    expect(p2.onSelectLevel).toHaveBeenCalledWith('seventh_root')
    expect(p2.onOpenChange).toHaveBeenCalledWith(false)
    p2.unmount()
  })

  it('其它按键（如 Tab）不选中', () => {
    const p = mount()
    p.key(p.cards()[0], 'Tab')
    expect(p.onSelectLevel).not.toHaveBeenCalled()
    expect(p.onOpenChange).not.toHaveBeenCalled()
    p.unmount()
  })

  it('点 ⓘ → 只弹详情：不选中、不关闭', () => {
    const p = mount()
    const btns = p.infoButtons()
    expect(btns).toHaveLength(3)
    p.click(btns[1])
    expect(p.onShowLevelInfo).toHaveBeenCalledTimes(1)
    expect((p.onShowLevelInfo.mock.calls[0][0] as { id: string }).id).toBe('triad_arrpeggio')
    expect(p.onSelectLevel).not.toHaveBeenCalled()
    expect(p.onOpenChange).not.toHaveBeenCalled()
    p.unmount()
  })

  it('关闭按钮 → onOpenChange(false)', () => {
    const p = mount()
    const closeBtn = [...(p.dialog()?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === tZh('btn_close'),
    ) as HTMLElement | undefined
    expect(closeBtn, '找不到底部关闭按钮').toBeTruthy()
    p.click(closeBtn)
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    p.unmount()
  })
})
