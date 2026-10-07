/**
 * components/practice-fretboard.tsx 的契约测试（此前零测试）。
 *
 * 练习指板：弦分隔线 + 每弦「空弦 + 1..fretCount 品」按钮 + 品数行。
 * 弦数/品数来自 store（`INSTRUMENT_CONFIG[user.instrument].stringCount` 与
 * `practice.fretCount`），调弦来自 `lib/string-tuning` 的 getter。
 *
 * 契约重点：
 *  ① 弦分隔线 = stringCount - 1；每弦按钮 = 1（空弦）+ fretCount；
 *  ② 品数行渲染 1..fretCount，且 FRET_MARKERS 里的品号用 `text-primary` 高亮；
 *  ③ **aria-label 必须走 i18n**：zh = `E 1弦 0品`、en = `E, string 1, fret 0`。
 *     这是 2026-09-28 修掉的真 bug —— 原先用模板字符串硬编码「弦/品」，
 *     切英文后视觉英文、**读屏仍念中文**（护栏 `hardcoded-a11y-labels.test.ts` 当时漏了
 *     `attr={...}` 表达式，现已补上）。此处做**行为级**回归：en 下标签不得含任何汉字。
 *  ④ 找音练习下，未选中的弦 `disabled` 且**不给 aria-label**；选中弦可点；
 *  ⑤ 非找音练习（和弦/音阶/音程等）所有弦都可点；
 *  ⑥ 点击 → `handleFretClick(stringIndex, fret)`（0 品也走同一回调）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PracticeFretboard } from '@/components/practice-fretboard'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import { SCALE_MODES } from '@/lib/page-theory-data'
import { getNoteAtPosition } from '@/lib/page-theory-functions'
import { getStringTuning, setStringTuning } from '@/lib/string-tuning'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k

const CJK = /[\u4e00-\u9fff]/
const STRING_COUNT = 6 // six_string_guitar
const DEFAULT_FRETS = 15

function setStore(patch: { activeTab?: string; isPlaying?: boolean; fretCount?: number } = {}) {
  const state = useAppStore.getState()
  useAppStore.setState({
    activeTab: patch.activeTab ?? 'chord',
    isPlaying: patch.isPlaying ?? false,
    practice: { ...state.practice, fretCount: patch.fretCount ?? DEFAULT_FRETS },
    user: { ...state.user, instrument: 'six_string_guitar' },
  })
}

function mount(overrides: Record<string, unknown> = {}) {
  const handleFretClick = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    t: tZh,
    formatNoteByAccidentalSetting: (n: string) => n,
    handleFretClick,
    getNoteButtonColor: () => '',
    showAllNotes: true,
    highlightedFrets: new Map<string, boolean>(),
    selectedStrings: [] as number[],
    rootNote: 'E',
    selectedIntervals: [] as number[],
    scaleKey: 'E',
    selectedScale: SCALE_MODES.pentatonic[0],
    scaleExerciseSequence: [] as string[],
    transposedChords: [] as { root: string; type: string; bass?: string }[],
    currentChordIndex: 0,
    chordExerciseTargetChord: null,
    showChordFretboard: true,
    showScaleFretboard: true,
    showIntervalFretboard: true,
    showChordExerciseFretboard: true,
    FRET_MARKERS: [3, 5, 7, 9, 12, 15],
    ...overrides,
  }
  act(() => { root.render(createElement(PracticeFretboard as never, props as never)) })

  const fretCount = () => useAppStore.getState().practice.fretCount
  const allButtons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[]
  /** 第 i 根弦（0 起）的按钮序列：下标 0 是空弦，1..n 是 1..fretCount 品 */
  const stringButtons = (i: number) => allButtons().slice(i * (1 + fretCount()), (i + 1) * (1 + fretCount()))
  const click = (el: HTMLButtonElement | undefined) => {
    act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  const rerender = (extra: Record<string, unknown>) => {
    act(() => { root.render(createElement(PracticeFretboard as never, { ...props, ...extra } as never)) })
  }

  return {
    container,
    handleFretClick,
    allButtons,
    stringButtons,
    click,
    rerender,
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

beforeEach(() => {
  setStore()
  document.body.innerHTML = ''
})

describe('结构', () => {
  it('弦分隔线 = 弦数 - 1', () => {
    const p = mount()
    expect(p.container.querySelectorAll('div.pointer-events-none').length).toBe(STRING_COUNT - 1)
    p.unmount()
  })

  it('每根弦有 1 个空弦按钮 + fretCount 个品按钮', () => {
    const p = mount()
    const perString = 1 + DEFAULT_FRETS
    expect(p.allButtons().length).toBe(STRING_COUNT * perString)
    for (let i = 0; i < STRING_COUNT; i++) {
      expect(p.stringButtons(i).length, `第 ${i + 1} 根弦`).toBe(perString)
    }
    p.unmount()
  })

  it('品数由 store 的 fretCount 驱动（改小则按钮变少、品数行跟着变）', () => {
    setStore({ fretCount: 3 })
    const p = mount()
    expect(p.allButtons().length).toBe(STRING_COUNT * 4)
    const text = p.container.textContent ?? ''
    expect(text).toContain('3')
    expect(text).not.toContain('4')
    p.unmount()
  })

  it('品数行渲染 1..fretCount，泛音点品号用 text-primary 高亮', () => {
    setStore({ fretCount: 5 })
    const p = mount()
    const markers = [3, 5]
    const spans = [...p.container.querySelectorAll('span')].filter((s) => /^[0-9]+$/.test(s.textContent ?? ''))
    const nums = spans.map((s) => Number(s.textContent))
    expect(nums).toEqual([1, 2, 3, 4, 5])
    for (const s of spans) {
      const isMarker = markers.includes(Number(s.textContent))
      expect(s.className.includes('text-primary'), `品 ${s.textContent}`).toBe(isMarker)
    }
    p.unmount()
  })
})

describe('无障碍标签走 i18n（2026-09-28 真 bug 的行为级回归）', () => {
  it('中文下：`{音名} {弦号}弦 {品号}品`', () => {
    const p = mount()
    expect(p.stringButtons(0)[0].getAttribute('aria-label')).toBe(`${getNoteAtPosition(0, 0)} 1弦 0品`)
    expect(p.stringButtons(0)[3].getAttribute('aria-label')).toBe(`${getNoteAtPosition(0, 3)} 1弦 3品`)
    // 第 6 根弦（最低音弦）
    expect(p.stringButtons(5)[0].getAttribute('aria-label')).toBe(`${getNoteAtPosition(5, 0)} 6弦 0品`)
    p.unmount()
  })

  it('英文下：`{note}, string {n}, fret {f}`，且**不含任何汉字**', () => {
    const p = mount({ t: tEn })
    const label0 = p.stringButtons(0)[0].getAttribute('aria-label')!
    expect(label0).toBe(`${getNoteAtPosition(0, 0)}, string 1, fret 0`)
    expect(p.stringButtons(0)[3].getAttribute('aria-label')).toBe(`${getNoteAtPosition(0, 3)}, string 1, fret 3`)
    // 回归：修 bug 前这里是 `${note} 1弦 0品`，英文界面下仍含「弦/品」
    for (const b of p.allButtons()) {
      const label = b.getAttribute('aria-label')
      if (label) expect(label, `label="${label}"`).not.toMatch(CJK)
    }
    p.unmount()
  })

  it('渲染只认乐器配置的调弦 —— 手改模块级全局调弦不影响指板（2026-10-01 口径变更）', () => {
    // 旧口径：组件从模块级全局 `getStringTuning()` 取调弦 ⇒「改全局，指板跟着变」。
    // 新口径：调弦与弦数**同源**，都来自 `INSTRUMENT_CONFIG[user.instrument]`；全局只服务
    // 页面里那些拿不到乐器上下文的命令式调用（出题 / 点击 / 判分）。
    // 为什么必须换：组件一边从 config 取弦数、一边从全局取音名，两个来源一旦不同步就会
    // 画出「分隔线数与行数对不上、音名还是别的乐器」的指板，且不报错。
    const standard = getStringTuning()
    try {
      setStringTuning([5, 11, 7, 2, 9, 4]) // 假装有人手改了全局
      const p = mount()
      expect(getNoteAtPosition(0, 0)).toBe('F') // 全局确实变了
      expect(p.stringButtons(0)[0].getAttribute('aria-label')).toBe('E 1弦 0品') // 但指板不变
      p.unmount()
    } finally {
      setStringTuning(standard)
    }
  })

  it('换乐器后音名与行数一起变 —— 证明两者同源（四弦贝斯 G D A E）', () => {
    useAppStore.setState({ user: { ...useAppStore.getState().user, instrument: 'four_string_bass' } })
    const p = mount()
    expect(p.allButtons().length).toBe(4 * (1 + DEFAULT_FRETS))
    expect(p.stringButtons(0)[0].getAttribute('aria-label')).toBe('G 1弦 0品')
    expect(p.stringButtons(3)[0].getAttribute('aria-label')).toBe('E 4弦 0品')
    p.unmount()
  })
})

describe('找音练习：弦的启用/禁用', () => {
  it('未选中的弦 disabled 且不给 aria-label', () => {
    setStore({ activeTab: 'practice' })
    const p = mount({ selectedStrings: [1] })
    const s1 = p.stringButtons(0)
    const s2 = p.stringButtons(1)
    expect(s1.every((b) => !b.disabled)).toBe(true)
    expect(s1[0].getAttribute('aria-label')).not.toBeNull()
    expect(s2.every((b) => b.disabled)).toBe(true)
    expect(s2[0].getAttribute('aria-label')).toBeNull()
    p.unmount()
  })

  it('禁用的弦点击不触发回调；启用的弦触发 (stringIndex, fret)', () => {
    setStore({ activeTab: 'practice' })
    const p = mount({ selectedStrings: [1] })
    p.click(p.stringButtons(1)[0]) // 未选中 → 禁用
    expect(p.handleFretClick).not.toHaveBeenCalled()
    p.click(p.stringButtons(0)[0]) // 空弦
    expect(p.handleFretClick).toHaveBeenCalledWith(0, 0)
    p.click(p.stringButtons(0)[4]) // 4 品
    expect(p.handleFretClick).toHaveBeenCalledWith(0, 4)
    p.unmount()
  })

  it('非找音练习下所有弦都可点（含最低音弦）', () => {
    setStore({ activeTab: 'scale' })
    const p = mount({ selectedStrings: [] })
    expect(p.allButtons().every((b) => !b.disabled)).toBe(true)
    p.click(p.stringButtons(5)[6])
    expect(p.handleFretClick).toHaveBeenCalledWith(5, 6)
    p.unmount()
  })
})

describe('重渲染', () => {
  it('highlightedFrets 变化后对应按钮高亮（不与其它品混）', () => {
    const p = mount({ showAllNotes: false })
    // showAllNotes=false 时文本靠 opacity 控制
    const opacities = () => p.allButtons().map((b) => (b.querySelector('span') as HTMLElement | null)?.className ?? '')
    expect(opacities()[1].includes('opacity-0')).toBe(true)
    // 空弦列是弦标签：即使 showAllNotes=false 也恒显音名（否则用户看到整列空白）
    expect(opacities()[0].includes('opacity-100')).toBe(true)

    p.rerender({ highlightedFrets: new Map([['0-1', true]]) })
    expect(opacities()[1].includes('opacity-100')).toBe(true)
    // 同弦 2 品不受影响
    expect(opacities()[2].includes('opacity-0')).toBe(true)
    p.unmount()
  })
})

describe('一弦三音：下一把位预览必须跟着 prop 刷新', () => {
  /**
   * 🚨 2026-10-04 审计抓到的**真缝隙**：`roleCtx` 的 useMemo 依赖数组里漏了
   * `nextThreeNpsCells`（`components/practice-fretboard.tsx`）。
   *
   * 后果不是报错，而是「预览不刷新」：产出侧 `app/page.tsx:nextThreeNpsCells` 的
   * deps 含 `isThreeNpsActive` 与 `nextScaleExerciseInfo`，这两个**都不在** roleCtx
   * 的 deps 里 ⇒ 它们变化时产出侧换了新 Map、消费侧仍握着旧引用 ⇒ 「下一把位预览」
   * 这套提示在该刷的时刻不刷。
   *
   * 构造要点：**只改 `nextThreeNpsCells` 一个 prop**，其余 props 引用全不动
   * （`rerender` 是对同一个 props 对象做浅合并）⇒ 「红」只可能来自漏依赖。
   * 判定落在 `data-role`（两套皮肤共用的语义落点），不依赖配色类名。
   */
  const CELL = '0-0' // 6 弦空弦 = E，在 E 五声音阶内 ⇒ 能走到预览判定
  const baseThreeNps = {
    scaleExerciseSequence: ['E'],
    threeNpsTarget: null,
    threeNpsCellKeys: new Map<string, unknown>(),
    nextThreeNpsCells: new Map<string, 'note' | 'root' | 'start'>(),
  }

  it('nextThreeNpsCells 由空变非空 ⇒ 对应格子 data-role 变成 previewStart', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const p = mount({ ...baseThreeNps })
    const roles = () =>
      [...p.container.querySelectorAll('button[data-role]')].map((b) => b.getAttribute('data-role'))

    expect(roles()).not.toContain('previewStart')

    p.rerender({ nextThreeNpsCells: new Map([[CELL, 'start']]) })
    expect(roles(), '只改 nextThreeNpsCells 后，下一把位预览必须刷新').toContain('previewStart')
    p.unmount()
  })

  it('previewStart 变回空 ⇒ 预览必须撤掉（双向都刷新）', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const p = mount({ ...baseThreeNps, nextThreeNpsCells: new Map([[CELL, 'start']]) })
    const roles = () =>
      [...p.container.querySelectorAll('button[data-role]')].map((b) => b.getAttribute('data-role'))

    expect(roles()).toContain('previewStart')

    p.rerender({ nextThreeNpsCells: new Map<string, 'note' | 'root' | 'start'>() })
    expect(roles(), '预览必须跟着撤掉，否则是「只增不减」的单向 stale').not.toContain('previewStart')
    p.unmount()
  })
})
