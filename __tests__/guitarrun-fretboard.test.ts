/**
 * components/guitarrun-fretboard.tsx 的契约测试。
 *
 * 这是「备选指板显示方案」的渲染层：结构是 grid（行 = 弦、列 = 品 + 一个空弦宽列），
 * 每个音是一个圆点，靠 **语义 class** 上色（`.gr-cell--tone/root/target/...`）。
 *
 * 契约重点：
 *  ① 结构：弦数 × (1 + fretCount) 个格子；`data-string` / `data-fret` 齐全；
 *  ② **角色来自 lib/fretboard-cell-role**（不自己实现一套判定）—— 否则两套皮肤会分叉，
 *     而分叉不会报错，只会让人以为"换了皮肤结果就变了"。这里既做行为断言，也做源码接线断言；
 *  ③ 文字可见性走 `data-visible`（不是 opacity）—— 铁律：`textContent` ≠ 屏幕所见；
 *  ④ 弦线粗细 `--gr-string-w` 随弦索引变化（低音弦更粗），不能所有弦一个值；
 *  ⑤ aria-label 一律走 i18n，英文下不得含汉字；
 *  ⑥ 跟随本项目配置：fretCount / 乐器弦数 / 变音号偏好，不照抄 GuitarRun 的 17 品 6 弦。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { GuitarRunFretboard } from '@/components/guitarrun-fretboard'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import { SCALE_MODES, NOTES } from '@/lib/page-theory-data'
import { INSTRUMENT_CONFIG, type InstrumentType } from '@/lib/practice-suggestions'
import { setStringTuning } from '@/lib/string-tuning'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k

const CJK = /[\u4e00-\u9fff]/
const STANDARD_TUNING = [4, 11, 7, 2, 9, 4]
const DEFAULT_FRETS = 15
const MARKERS = [3, 5, 7, 9, 12, 15]
const MAJOR = SCALE_MODES.basic.find((s) => s.name === 'Major') as never
/** role → 期望的 class（人工写的映射表，不用组件导出的 ROLE_CLASS，否则是同义反复） */
const EXPECTED_CLASS: Record<string, string> = {
  tone: 'gr-cell--tone',
  root: 'gr-cell--root',
  target: 'gr-cell--target',
  matched: 'gr-cell--hit',
  wrong: 'gr-cell--wrong',
  muted: 'gr-cell--muted',
  preview: 'gr-cell--next',
  previewRoot: 'gr-cell--next-root',
  previewStart: 'gr-cell--next-start',
}

function setStore(
  patch: {
    activeTab?: string
    isPlaying?: boolean
    fretCount?: number
    instrument?: string
    fretZoneEnabled?: boolean
    fretZoneStart?: number
    fretZoneSize?: number
  } = {},
) {
  const state = useAppStore.getState()
  useAppStore.setState({
    activeTab: patch.activeTab ?? 'chord',
    isPlaying: patch.isPlaying ?? false,
    practice: {
      ...state.practice,
      fretCount: patch.fretCount ?? DEFAULT_FRETS,
      // 显式复位品区，避免上一条用例的 store 写入泄漏到下一条
      fretZoneEnabled: patch.fretZoneEnabled ?? false,
      fretZoneStart: patch.fretZoneStart ?? 0,
      fretZoneSize: patch.fretZoneSize ?? 5,
    },
    user: { ...state.user, instrument: (patch.instrument ?? 'six_string_guitar') as never },
  })
}

/** 模块级兜底拆树：断言失败会跳过用例自己的 unmount，残留 root 会让后续用例冒假失败 */
const mounted: Array<() => void> = []

function mount(overrides: Record<string, unknown> = {}) {
  const handleFretClick = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    t: tZh,
    formatNoteByAccidentalSetting: (n: string) => n,
    handleFretClick,
    showAllNotes: true,
    highlightedFrets: new Map<string, boolean>(),
    selectedStrings: [] as number[],
    rootNote: 'E',
    selectedIntervals: [] as number[],
    scaleKey: 'C',
    selectedScale: MAJOR,
    scaleExerciseSequence: [] as string[],
    transposedChords: [] as { root: string; type: string; bass?: string }[],
    currentChordIndex: 0,
    chordExerciseTargetChord: null,
    FRET_MARKERS: MARKERS,
    targetNote: 'E',
    practiceAnswerMode: 'fretboard',
    highlightedTargetPosition: null,
    threeNpsTarget: null,
    threeNpsCellKeys: new Map<string, unknown>(),
    nextThreeNpsCells: new Map<string, string>(),
    ...overrides,
  }
  act(() => {
    root.render(createElement(GuitarRunFretboard as never, props as never))
  })

  const cells = () => [...container.querySelectorAll('.gr-cell')] as HTMLButtonElement[]
  const cellAt = (s: number, f: number) =>
    container.querySelector(`.gr-cell[data-string="${s}"][data-fret="${f}"]`) as HTMLButtonElement | null
  const classesOf = (el: Element | null) => (el?.className ?? '').split(/\s+/)
  const rerender = (extra: Record<string, unknown>) => {
    act(() => {
      root.render(createElement(GuitarRunFretboard as never, { ...props, ...extra } as never))
    })
  }
  const unmount = () => {
    act(() => root.unmount())
    container.remove()
  }
  mounted.push(unmount)
  return { container, handleFretClick, cells, cellAt, classesOf, rerender, unmount }
}

beforeEach(() => {
  setStore()
  setStringTuning([...STANDARD_TUNING])
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const fn of mounted) {
    try {
      fn()
    } catch {
      /* 拆树失败不该影响后续用例 */
    }
  }
  mounted.length = 0
  document.body.innerHTML = ''
})

describe('结构', () => {
  it('格子数 = 弦数 × (1 个空弦 + fretCount 个品)', () => {
    const p = mount()
    expect(p.cells().length).toBe(STANDARD_TUNING.length * (1 + DEFAULT_FRETS))
  })

  it('每个格子都带 data-string / data-fret', () => {
    const p = mount()
    for (const el of p.cells()) {
      expect(el.dataset.string).toMatch(/^\d+$/)
      expect(el.dataset.fret).toMatch(/^\d+$/)
    }
  })

  it('行 = 弦：每根弦的格子按弦号分组，且 0 品就是空弦格', () => {
    const p = mount()
    for (let s = 0; s < STANDARD_TUNING.length; s++) {
      const row = p.cells().filter((el) => Number(el.dataset.string) === s)
      expect(row.length, `第 ${s + 1} 弦`).toBe(1 + DEFAULT_FRETS)
      expect(row[0].dataset.fret).toBe('0')
      expect(p.classesOf(row[0])).toContain('gr-cell--open')
    }
  })

  it('品号行：第一格是「空弦」标签，之后是 1..fretCount', () => {
    const p = mount()
    const nums = [...p.container.querySelectorAll('.gr-fret-number')]
    expect(nums.length).toBe(1 + DEFAULT_FRETS)
    expect(nums[0].textContent).toBe(zh['fretboard_open_label'])
    expect(nums.slice(1).map((n) => n.textContent)).toEqual(
      Array.from({ length: DEFAULT_FRETS }, (_, i) => String(i + 1)),
    )
  })

  it('品号行里 FRET_MARKERS 的品号带 marker 类', () => {
    const p = mount()
    const marked = [...p.container.querySelectorAll('.gr-fret-number--marker')].map((n) => n.textContent)
    expect(marked).toEqual(MARKERS.map(String))
  })

  it('品数由 store 的 fretCount 驱动', () => {
    setStore({ fretCount: 4 })
    const p = mount()
    expect(p.cells().length).toBe(STANDARD_TUNING.length * 5)
    expect(p.container.querySelectorAll('.gr-fret-number').length).toBe(5)
  })

  it('弦数跟随乐器配置（七弦吉他 = 7 行）—— 且不需要同步模块级调弦', () => {
    // 修前这里必须先 `setStringTuning([4,11,7,2,9,4,11])` 才能过：组件弦数取 config、
    // 行数却取模块级全局，两边不同源。现在行迭代与音名都从乐器配置派生，这一同步已不需要。
    setStore({ instrument: 'seven_string_guitar' })
    const p = mount()
    expect(p.cells().length).toBe(7 * (1 + DEFAULT_FRETS))
    const last = p.cells().filter((el) => Number(el.dataset.string) === 6)
    expect(last.length).toBe(1 + DEFAULT_FRETS)
  })
})

/**
 * 乐器自洽：**弦数与音名只能有一个来源**（乐器配置）。
 *
 * 修前：弦数取 `INSTRUMENT_CONFIG[x].stringCount`，行迭代与音名却走模块级全局
 * `lib/string-tuning.ts`（由 `app/page.tsx` 渲染期写入）。真实页面恰好把两边对齐，所以
 * 肉眼看不出；但单独挂载组件时四弦贝斯会画成 6 行 E B G D A E —— 不报错，整体画错。
 *
 * 下面刻意**不同步**全局（beforeEach 把它复位成六弦标准），这正是修前被掩盖的缝隙。
 */
describe('乐器自洽：弦数与音名同源', () => {
  const INSTRUMENTS = Object.keys(INSTRUMENT_CONFIG) as InstrumentType[]

  it('不变量：每个乐器的 stringCount 都等于调弦长度（否则「分隔/行数取哪个」必然分叉）', () => {
    for (const name of INSTRUMENTS) {
      expect(INSTRUMENT_CONFIG[name].tuning.length, name).toBe(INSTRUMENT_CONFIG[name].stringCount)
    }
    expect(INSTRUMENTS.length).toBeGreaterThan(5) // 防止枚举被写空
  })

  it.each(INSTRUMENTS)('%s：行数与空弦音名都跟乐器配置走', (instrument) => {
    const cfg = INSTRUMENT_CONFIG[instrument]
    setStore({ instrument })
    const p = mount()
    expect(p.cells().length).toBe(cfg.tuning.length * (1 + DEFAULT_FRETS))
    for (let s = 0; s < cfg.tuning.length; s++) {
      expect(
        p.cellAt(s, 0)!.textContent?.trim(),
        `${instrument} 第 ${s + 1} 弦空弦（期望调弦半音值 ${cfg.tuning[s]}）`,
      ).toBe(NOTES[cfg.tuning[s]])
    }
  })

  it('全局调弦改不动渲染 —— 渲染只认乐器配置（防止再退回两个来源）', () => {
    try {
      setStringTuning([5, 11, 7, 2, 9, 4]) // 假装有人手改了全局
      const p = mount()
      expect(p.cellAt(0, 0)!.textContent?.trim()).toBe('E') // 仍是乐器配置的高 E
    } finally {
      setStringTuning([...STANDARD_TUNING])
    }
  })
})

describe('弦线粗细', () => {
  it('低音弦比高音弦粗（--gr-string-w 随弦索引递增）', () => {
    const p = mount()
    const widthOf = (s: number) =>
      Number(p.cellAt(s, 1)!.style.getPropertyValue('--gr-string-w').replace('px', ''))
    const widths = STANDARD_TUNING.map((_, s) => widthOf(s))
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i], `第 ${i + 1} 弦应比第 ${i} 弦粗`).toBeGreaterThan(widths[i - 1])
    }
    // 且不能所有弦同一个值（这正是"忘了随弦变化"的失效形态）
    expect(new Set(widths).size).toBe(widths.length)
  })

  it('同一根弦的所有格子用同一个粗细值', () => {
    const p = mount()
    const w0 = p.cellAt(2, 0)!.style.getPropertyValue('--gr-string-w')
    for (let f = 0; f <= DEFAULT_FRETS; f++) {
      expect(p.cellAt(2, f)!.style.getPropertyValue('--gr-string-w'), `品 ${f}`).toBe(w0)
    }
  })
})

describe('角色 → class（判定来自 lib/fretboard-cell-role）', () => {
  it('音阶练习：根音带 root 类、其余音阶音带 tone 类、音阶外无角色类', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const p = mount({ scaleKey: 'C', scaleExerciseSequence: ['1'] })
    // 第 6 弦（索引 5）8 品 = C = 根音
    expect(p.cellAt(5, 8)!.dataset.role).toBe('root')
    expect(p.classesOf(p.cellAt(5, 8))).toContain(EXPECTED_CLASS.root)
    // 第 6 弦 10 品 = D = 音阶音但非根音
    expect(p.cellAt(5, 10)!.dataset.role).toBe('tone')
    expect(p.classesOf(p.cellAt(5, 10))).toContain(EXPECTED_CLASS.tone)
    // 第 6 弦 9 品 = C#/Db，不在 C 大调里
    expect(p.cellAt(5, 9)!.dataset.role).toBe('none')
    expect(p.classesOf(p.cellAt(5, 9))).not.toContain(EXPECTED_CLASS.tone)
  })

  it('练习未开始时不点亮任何题目音（防止"答案一直亮着"）', () => {
    setStore({ activeTab: 'scale', isPlaying: false })
    const p = mount({ scaleKey: 'C', scaleExerciseSequence: ['1'] })
    expect(p.cells().every((el) => el.dataset.role === 'none')).toBe(true)
  })

  it('点击反馈：对 = hit 类、错 = wrong 类（同一格）', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const ok = mount({
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      highlightedFrets: new Map([['5-8', true]]),
    })
    expect(ok.cellAt(5, 8)!.dataset.role).toBe('matched')
    expect(ok.classesOf(ok.cellAt(5, 8))).toContain('gr-cell--hit')
    ok.unmount()

    const bad = mount({
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      highlightedFrets: new Map([['5-8', false]]),
    })
    expect(bad.cellAt(5, 8)!.dataset.role).toBe('wrong')
    expect(bad.classesOf(bad.cellAt(5, 8))).toContain('gr-cell--wrong')
    bad.unmount()
  })

  it('一弦三音：目标格 = target，把位外 = muted', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const p = mount({
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      threeNpsTarget: { stringIndex: 5, fret: 8 },
      threeNpsCellKeys: new Map<string, unknown>([['5-8', 1], ['5-10', 1]]),
    })
    expect(p.cellAt(5, 8)!.dataset.role).toBe('target')
    expect(p.classesOf(p.cellAt(5, 8))).toContain('gr-cell--target')
    expect(p.cellAt(5, 10)!.dataset.role).toBe('tone')
    // 第 1 弦 8 品 = C，在音阶里但在把位表外 ⇒ 压暗
    expect(p.cellAt(0, 8)!.dataset.role).toBe('muted')
    expect(p.classesOf(p.cellAt(0, 8))).toContain('gr-cell--muted')
  })

  it('一弦三音：下一把位预览三种强调级别各有 class', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    // ⚠️ 预览只在**当前把位已跑完**（threeNpsTarget === null）时出现 —— 与产出侧
    // `app/page.tsx:nextThreeNpsCells` 的守卫同一时机。修前两边时机相反 ⇒ 一次都没显示过。
    const p = mount({
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      threeNpsTarget: null,
      nextThreeNpsCells: new Map<string, string>([
        ['0-8', 'note'],
        ['0-10', 'root'],
        ['0-12', 'start'],
      ]),
    })
    expect(p.classesOf(p.cellAt(0, 8))).toContain(EXPECTED_CLASS.preview)
    expect(p.classesOf(p.cellAt(0, 10))).toContain(EXPECTED_CLASS.previewRoot)
    expect(p.classesOf(p.cellAt(0, 12))).toContain(EXPECTED_CLASS.previewStart)
    expect(p.cellAt(0, 8)!.dataset.role).toBe('preview')
  })

  it('当前把位进行中不读预览表（同一格给 muted 而不是 preview）', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const p = mount({
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      threeNpsTarget: { stringIndex: 5, fret: 8 },
      threeNpsCellKeys: new Map<string, unknown>([['5-8', 1]]),
      nextThreeNpsCells: new Map<string, string>([['0-8', 'start']]),
    })
    expect(p.cellAt(0, 8)!.dataset.role).toBe('muted')
  })

  it('限制品区：区外格子带 muted 类、区内不带', () => {
    setStore({ activeTab: 'scale', isPlaying: true, fretZoneEnabled: true, fretZoneStart: 5, fretZoneSize: 3 })
    const p = mount({ scaleKey: 'C', scaleExerciseSequence: ['1'] })
    // 第 6 弦 8 品 = C（音阶内）但在 5..7 之外
    expect(p.classesOf(p.cellAt(5, 8))).toContain('gr-cell--muted')
    // 第 6 弦 5 品 = A（音阶内）且在品区内
    expect(p.classesOf(p.cellAt(5, 5))).not.toContain('gr-cell--muted')
  })
})

describe('文字可见性（data-visible，不是 opacity）', () => {
  it('showAllNotes = false 时音名不可见，但文本仍渲染在 DOM 里', () => {
    setStore({ activeTab: 'chord', isPlaying: false })
    const p = mount({ showAllNotes: false })
    const dot = p.cellAt(5, 8)!.querySelector('.gr-note-dot') as HTMLElement
    expect(dot.dataset.visible).toBe('0')
    expect(dot.textContent).not.toBe('') // 文本在，只是不可见 —— 别用 textContent 判可见性
  })

  it('空弦列恒显音名（弦标签语义，与 GuitarRun 的 OPEN 列一致），即使 showAllNotes = false', () => {
    setStore({ activeTab: 'chord', isPlaying: false })
    const p = mount({ showAllNotes: false })
    for (let s = 0; s < 6; s++) {
      const dot = p.cellAt(s, 0)!.querySelector('.gr-note-dot') as HTMLElement
      expect(dot.dataset.visible, `弦 ${s + 1} 空弦`).toBe('1')
    }
    // 对照：同一根弦 1 品仍隐藏
    expect((p.cellAt(3, 1)!.querySelector('.gr-note-dot') as HTMLElement).dataset.visible).toBe('0')
  })

  it('showAllNotes = true 时音名可见（找音练习的「显示全部音符」）', () => {
    setStore({ activeTab: 'practice', isPlaying: true })
    const p = mount({ showAllNotes: true })
    expect((p.cellAt(5, 8)!.querySelector('.gr-note-dot') as HTMLElement).dataset.visible).toBe('1')
  })

  it('命中题目时显示**音级符号**，未命中显示音名', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const p = mount({ scaleKey: 'C', scaleExerciseSequence: ['1'], formatNoteByAccidentalSetting: (n: string) => n })
    expect((p.cellAt(5, 8)!.querySelector('.gr-note-dot') as HTMLElement).textContent).toBe('1') // C 是 1 级
    // 9 品是音阶外 ⇒ 显示音名（此处 format 是恒等函数）
    const outside = (p.cellAt(5, 9)!.querySelector('.gr-note-dot') as HTMLElement)
    expect(outside.dataset.visible).toBe('0') // 没命中也不该给答案
  })

  it('空弦格永远能看见音名（GuitarRun 的 .cell.open 语义）', () => {
    const p = mount({ showAllNotes: false })
    const dot = p.cellAt(5, 0)!.querySelector('.gr-note-dot') as HTMLElement
    // 判定层直接给 showText=true（弦标签语义），不再依赖 CSS 对 .gr-cell--open 的特判
    expect(dot.dataset.visible).toBe('1')
    expect(p.classesOf(p.cellAt(5, 0))).toContain('gr-cell--open')
  })

  it('音名走 formatNoteByAccidentalSetting（升降号偏好）', () => {
    const format = vi.fn((n: string) => `F(${n})`)
    const p = mount({ showAllNotes: true, formatNoteByAccidentalSetting: format })
    expect(format).toHaveBeenCalled()
    expect((p.cellAt(5, 0)!.querySelector('.gr-note-dot') as HTMLElement).textContent).toBe('F(E)')
  })
})

describe('品记点', () => {
  it('只有最底下一根弦带 data-marker，且只落在 FRET_MARKERS 的品上', () => {
    const p = mount()
    const marked = p.cells().filter((el) => el.dataset.marker === '1')
    expect(marked.length).toBeGreaterThan(0)
    for (const el of marked) {
      expect(el.dataset.string).toBe(String(STANDARD_TUNING.length - 1))
      expect(MARKERS).toContain(Number(el.dataset.fret))
    }
    // 每一根弦（不是最底的）都不该有标记
    for (let s = 0; s < STANDARD_TUNING.length - 1; s++) {
      expect(p.cells().filter((el) => Number(el.dataset.string) === s && el.dataset.marker === '1')).toHaveLength(0)
    }
  })
})

describe('可访问性 / i18n', () => {
  it('aria-label 走 t()：中文下含「弦」「品」', () => {
    const p = mount()
    const label = p.cellAt(5, 8)!.getAttribute('aria-label') ?? ''
    expect(label).toContain('弦')
    expect(label).toContain('品')
    expect(label).toContain('8')
  })

  it('英文下 aria-label 不含任何汉字', () => {
    const p = mount({ t: tEn })
    const label = p.cellAt(5, 8)!.getAttribute('aria-label') ?? ''
    expect(label).not.toBe('')
    expect(CJK.test(label), label).toBe(false)
    // 英文标签里弦号 1 起（stringIndex 5 ⇒ 「string 6」）
    expect(label).toContain('6')
  })

  it('空弦标签走 i18n（英文是 OPEN）', () => {
    const p = mount({ t: tEn })
    expect(p.container.querySelector('.gr-fret-number')!.textContent).toBe('OPEN')
  })

  it('被禁用的弦不给 aria-label（与经典皮肤一致）', () => {
    setStore({ activeTab: 'practice', isPlaying: true })
    const p = mount({ selectedStrings: [6] }) // 只勾选第 6 弦
    expect(p.cellAt(0, 0)!.disabled).toBe(true)
    expect(p.cellAt(0, 0)!.getAttribute('aria-label')).toBeNull()
    expect(p.cellAt(5, 0)!.disabled).toBe(false)
    expect(p.cellAt(5, 0)!.getAttribute('aria-label')).not.toBeNull()
  })
})

describe('交互', () => {
  it('点击格子回传 (stringIndex, fret)，0 品也走同一回调', () => {
    setStore({ activeTab: 'scale', isPlaying: false })
    const p = mount()
    act(() => {
      p.cellAt(3, 7)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(p.handleFretClick).toHaveBeenCalledWith(3, 7)
    act(() => {
      p.cellAt(3, 0)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(p.handleFretClick).toHaveBeenCalledWith(3, 0)
  })

  it('禁用的弦点击不触发回调', () => {
    setStore({ activeTab: 'practice', isPlaying: true })
    const p = mount({ selectedStrings: [1] })
    act(() => {
      p.cellAt(5, 3)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(p.handleFretClick).not.toHaveBeenCalled()
  })

  it('重渲染后角色跟着变（不缓存旧判定）', () => {
    setStore({ activeTab: 'scale', isPlaying: true })
    const p = mount({ scaleKey: 'C', scaleExerciseSequence: ['1'] })
    expect(p.cellAt(5, 8)!.dataset.role).toBe('root')
    p.rerender({ highlightedFrets: new Map([['5-8', false]]) })
    expect(p.cellAt(5, 8)!.dataset.role).toBe('wrong')
  })
})

describe('接线护栏：判定必须来自 lib（防止两套皮肤分叉）', () => {
  const src = readFileSync('components/guitarrun-fretboard.tsx', 'utf8')

  it('从 @/lib/fretboard-cell-role 引入 resolveFretCellRole', () => {
    expect(src).toMatch(/import\s*\{[\s\S]*?resolveFretCellRole[\s\S]*?\}\s*from\s*['"]@\/lib\/fretboard-cell-role['"]/)
  })

  it('在渲染循环里真的调用它（而不是引入后不用）', () => {
    expect(src).toMatch(/resolveFretCellRole\s*\(/)
    // 自测：把调用点抠掉，上面的正则必须不再匹配 —— 否则这条护栏是恒真的
    expect(src.replace(/resolveFretCellRole\s*\(/g, 'X(')).not.toMatch(/resolveFretCellRole\s*\(/)
  })

  it('自己不重复实现一套"哪个音高亮"的表（禁止出现第二份音级映射）', () => {
    // 组件只该把 role 翻译成 class；一旦出现音级表/半音表，就是判定被复制了第二份
    expect(src).not.toMatch(/SCALE_SEMITONE_DEGREE_FALLBACK/)
    expect(src).not.toMatch(/semitone\s*===/)
  })
})
