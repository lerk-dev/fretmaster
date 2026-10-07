import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PracticeModeControls } from '@/components/practice-mode-controls'
import { NOTES } from '@/lib/page-theory-data'
import { getNoteAtPosition } from '@/lib/page-theory-functions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// radix Select 展开要用的 jsdom 缺口（补齐后才能真正驱动 onValueChange）
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

/** 模拟「偏好 ASCII 变音记号」的格式化器，顺带证明格式化函数真的被用上了 */
const toAscii = (n: string) => n.replace(/♯/g, '#').replace(/♭/g, 'b')

type Props = ComponentProps<typeof PracticeModeControls>

const baseProps = (over: Partial<Props> = {}): Props => ({
  t: (k: string) => k,
  practiceAnswerMode: 'fretboard',
  onPracticeAnswerModeChange: vi.fn(),
  formatNoteByAccidentalSetting: toAscii,
  targetNote: 'F♯',
  stringCount: 6,
  selectedStrings: [1, 2, 3, 4, 5, 6],
  onSelectedStringsChange: vi.fn(),
  pitchFindingTime: 3,
  onPitchFindingTimeChange: vi.fn(),
  showPracticeSuggestions: false,
  onShowPracticeSuggestionsChange: vi.fn(),
  showAllNotes: false,
  onShowAllNotesChange: vi.fn(),
  isPlaying: false,
  onIsPlayingChange: vi.fn(),
  practiceTime: 180,
  timeLeft: 180,
  onTimeLeftChange: vi.fn(),
  highlightedTargetPosition: null,
  onHighlightedFretsChange: vi.fn(),
  onHighlightedTargetPositionChange: vi.fn(),
  onScoreChange: vi.fn(),
  recordPositionStat: vi.fn(),
  generateNewTarget: vi.fn(),
  formatTime: (s: number) => `${s}s`,
  currentPracticeSuggestion: '',
  ...over,
})

const containers: HTMLElement[] = []
const roots: Root[] = []

function mount(props: Props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(createElement(PracticeModeControls as never, props as never))
  })
  return { container, unmount: () => act(() => root.unmount()) }
}

const text = () => document.body.textContent ?? ''
const allButtons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[]
const buttonByName = (name: string) => {
  const b = allButtons().find((x) => (x.textContent ?? '') === name)
  if (!b) throw new Error(`找不到文案为「${name}」的按钮`)
  return b
}
const noteLabels = (NOTES as string[]).map(toAscii)
const noteButtons = () => allButtons().filter((b) => noteLabels.includes(b.textContent ?? ''))

/** 展开第 idx 个 Select 并选中文案为 label 的选项（radix 要 pointerdown **再** click 才展开） */
function pickOption(idx: number, label: string) {
  const c = [...document.querySelectorAll('[role="combobox"]')][idx] as HTMLElement
  if (!c) throw new Error(`第 ${idx} 个 combobox 不存在`)
  act(() => {
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  const opts = [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
  const opt = opts.find((o) => o.textContent === label)
  if (!opt) throw new Error(`找不到选项「${label}」；实际有：${opts.map((o) => o.textContent).join(' | ')}`)
  act(() => { opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

afterEach(() => {
  act(() => {
    roots.forEach((r) => r.unmount())
  })
  roots.length = 0
  containers.forEach((c) => c.remove())
  containers.length = 0
  vi.useRealTimers()
})

describe('PracticeModeControls — 目标音符与琴弦', () => {
  it('指板答题模式：显示目标音符卡，音名过 formatNoteByAccidentalSetting', () => {
    mount(baseProps({ practiceAnswerMode: 'fretboard', targetNote: 'F♯' }))
    expect(text()).toContain('target_note')
    expect(text()).toContain('F#')
  })

  it('按钮答题模式：不显示目标音符卡', () => {
    mount(baseProps({ practiceAnswerMode: 'buttons' }))
    expect(text()).not.toContain('target_note')
  })

  it('琴弦按钮数量等于 stringCount', () => {
    mount(baseProps({ stringCount: 7 }))
    for (const n of ['1', '2', '3', '4', '5', '6', '7']) buttonByName(n)
    expect(allButtons().some((b) => b.textContent === '8')).toBe(false)
  })

  it('勾选新弦时按数值升序排（12 弦下 10 与 2 的顺序 —— 旧实现裸 .sort() 会给出 1,10,2）', () => {
    let upd: ((p: number[]) => number[]) | null = null
    mount(
      baseProps({
        stringCount: 12,
        selectedStrings: [1],
        onSelectedStringsChange: (u) => {
          upd = u
        },
      }),
    )
    act(() => buttonByName('10').click())
    expect(upd!([1])).toEqual([1, 10])
    act(() => buttonByName('2').click())
    expect(upd!([1, 10])).toEqual([1, 2, 10])
  })

  it('取消勾选：多于一根弦时移除该弦', () => {
    let upd: ((p: number[]) => number[]) | null = null
    mount(
      baseProps({
        selectedStrings: [1, 3],
        onSelectedStringsChange: (u) => {
          upd = u
        },
      }),
    )
    act(() => buttonByName('3').click())
    expect(upd!([1, 3])).toEqual([1])
  })

  it('至少保留一根弦：只剩一根时点它不触发变更', () => {
    const onSelectedStringsChange = vi.fn()
    mount(baseProps({ selectedStrings: [2], onSelectedStringsChange }))
    act(() => buttonByName('2').click())
    expect(onSelectedStringsChange).not.toHaveBeenCalled()
  })
})

describe('PracticeModeControls — 显示选项与答题模式', () => {
  it('显示/隐藏音符按钮的文案随 showAllNotes 切换', () => {
    const a = mount(baseProps({ showAllNotes: false }))
    expect(text()).toContain('show_all_notes')
    a.unmount()
    mount(baseProps({ showAllNotes: true }))
    expect(text()).toContain('hide_notes')
  })

  it('点显示/隐藏按钮 → 取反 updater', () => {
    let upd: ((p: boolean) => boolean) | null = null
    mount(
      baseProps({
        showAllNotes: false,
        onShowAllNotesChange: (u) => {
          upd = u
        },
      }),
    )
    act(() => buttonByName('show_all_notes').click())
    expect(upd!(false)).toBe(true)
    expect(upd!(true)).toBe(false)
  })

  it('练习建议开关的 checked 与 props 一致', () => {
    const a = mount(baseProps({ showPracticeSuggestions: true }))
    expect(document.querySelector('button[role="switch"]')).toHaveAttribute('aria-checked', 'true')
    a.unmount()
    mount(baseProps({ showPracticeSuggestions: false }))
    expect(document.querySelector('button[role="switch"]')).toHaveAttribute('aria-checked', 'false')
  })

  it('练习未进行时切换答题模式：不重置任何练习态', () => {
    const props = baseProps({ practiceAnswerMode: 'fretboard', isPlaying: false })
    mount(props)
    act(() => buttonByName('practice_mode_identify').click())
    expect(props.onIsPlayingChange).not.toHaveBeenCalled()
    expect(props.onTimeLeftChange).not.toHaveBeenCalled()
    expect(props.onHighlightedFretsChange).not.toHaveBeenCalled()
    expect(props.onHighlightedTargetPositionChange).not.toHaveBeenCalled()
    expect(props.onPracticeAnswerModeChange).toHaveBeenCalledWith('buttons')
  })

  it('练习进行中切换答题模式：先停练习、重置剩余时间与高亮，再切模式', () => {
    const props = baseProps({
      practiceAnswerMode: 'fretboard',
      isPlaying: true,
      practiceTime: 300,
      timeLeft: 42,
    })
    mount(props)
    act(() => buttonByName('practice_mode_identify').click())
    expect(props.onIsPlayingChange).toHaveBeenCalledWith(false)
    expect(props.onTimeLeftChange).toHaveBeenCalledWith(300)
    expect(props.onHighlightedFretsChange).toHaveBeenCalledWith(new Map())
    expect(props.onHighlightedTargetPositionChange).toHaveBeenCalledWith(null)
    expect(props.onPracticeAnswerModeChange).toHaveBeenCalledWith('buttons')
  })

  it('时长下拉存在且可用', () => {
    mount(baseProps())
    const combo = document.querySelector('[role="combobox"]')!
    expect(combo).not.toHaveAttribute('disabled')
    expect(combo).toHaveAttribute('aria-expanded', 'false')
  })

  /**
   * 时长下拉此前**从没被驱动过**（语句命中 0）：onValueChange 里那次 `Number(v)`
   * 是 String→Number 的唯一转换点，漏了它会把 `"5"` 当字符串存进 store，
   * 后面的计时算术（×60、比较大小）静默失效。
   */
  it('时长下拉：回传**数字** 5，不是字符串 "5"', () => {
    const onPitchFindingTimeChange = vi.fn()
    mount(baseProps({ pitchFindingTime: 1, onPitchFindingTimeChange }))
    pickOption(0, 'pitch_finding_5_minutes')
    expect(onPitchFindingTimeChange).toHaveBeenCalledWith(5)
    expect(typeof onPitchFindingTimeChange.mock.calls[0][0]).toBe('number')
  })
})

/**
 * 「找音」与「识别」两个按钮的 onClick 是**复制粘贴的两份**（源码 183-192 / 200-209）。
 * 此前只测了「识别」那份 ⇒ 「找音」那份漏掉某个重置（比如忘了 onTimeLeftChange）
 * 完全测不出来。这里把**同一套断言**在「找音」上再跑一遍。
 */
describe('PracticeModeControls — 「找音」按钮（与「识别」是复制的两份，必须行为一致）', () => {
  it('练习未进行中：只切模式，不动任何练习态', () => {
    const props = baseProps({ practiceAnswerMode: 'buttons', isPlaying: false })
    mount(props)
    act(() => buttonByName('practice_mode_find').click())
    expect(props.onPracticeAnswerModeChange).toHaveBeenCalledWith('fretboard')
    expect(props.onIsPlayingChange).not.toHaveBeenCalled()
    expect(props.onTimeLeftChange).not.toHaveBeenCalled()
    expect(props.onHighlightedFretsChange).not.toHaveBeenCalled()
    expect(props.onHighlightedTargetPositionChange).not.toHaveBeenCalled()
  })

  it('练习进行中：先停练习、把剩余时间重置为**总时长**、清空高亮，再切模式', () => {
    const props = baseProps({
      practiceAnswerMode: 'buttons',
      isPlaying: true,
      practiceTime: 300,
      timeLeft: 42,
    })
    mount(props)
    act(() => buttonByName('practice_mode_find').click())
    expect(props.onIsPlayingChange).toHaveBeenCalledWith(false)
    expect(props.onTimeLeftChange).toHaveBeenCalledWith(300)   // 不是 42、也不是 0
    expect(props.onHighlightedFretsChange).toHaveBeenCalledWith(new Map())
    expect(props.onHighlightedTargetPositionChange).toHaveBeenCalledWith(null)
    expect(props.onPracticeAnswerModeChange).toHaveBeenCalledWith('fretboard')
  })
})

describe('PracticeModeControls — 按钮答题的判定与计分', () => {
  it('按钮答题进行中：渲染全部音名按钮（NOTES 全部，且过格式化器）', () => {
    mount(
      baseProps({
        practiceAnswerMode: 'buttons',
        isPlaying: true,
        highlightedTargetPosition: { stringIndex: 0, fret: 2 },
      }),
    )
    expect(noteButtons().length).toBe(NOTES.length)
  })

  it('未在按钮答题进行中：不渲染音名按钮', () => {
    mount(baseProps({ practiceAnswerMode: 'buttons', isPlaying: false }))
    expect(noteButtons().length).toBe(0)
  })

  it('点正确音名：高亮该位置为 true、correct 与 total 各 +1、记录位置正确', () => {
    const onHighlightedFretsChange = vi.fn()
    const onScoreChange = vi.fn()
    const recordPositionStat = vi.fn()
    mount(
      baseProps({
        practiceAnswerMode: 'buttons',
        isPlaying: true,
        highlightedTargetPosition: { stringIndex: 0, fret: 2 },
        onHighlightedFretsChange,
        onScoreChange,
        recordPositionStat,
      }),
    )
    expect(getNoteAtPosition(0, 2)).toBe('F♯')
    act(() => buttonByName('F#').click())
    expect(onHighlightedFretsChange).toHaveBeenCalledWith(new Map([['0-2', true]]))
    expect(onScoreChange.mock.calls[0][0]({ correct: 1, total: 3 })).toEqual({ correct: 2, total: 4 })
    expect(recordPositionStat).toHaveBeenCalledWith(true)
  })

  it('点错误音名：total +1、correct 不变、记录位置错误', () => {
    const onHighlightedFretsChange = vi.fn()
    const onScoreChange = vi.fn()
    const recordPositionStat = vi.fn()
    mount(
      baseProps({
        practiceAnswerMode: 'buttons',
        isPlaying: true,
        highlightedTargetPosition: { stringIndex: 0, fret: 2 },
        onHighlightedFretsChange,
        onScoreChange,
        recordPositionStat,
      }),
    )
    act(() => buttonByName('C').click())
    expect(onHighlightedFretsChange).toHaveBeenCalledWith(new Map([['0-2', false]]))
    expect(onScoreChange.mock.calls[0][0]({ correct: 5, total: 9 })).toEqual({ correct: 5, total: 10 })
    expect(recordPositionStat).toHaveBeenCalledWith(false)
  })

  it('没有高亮目标位置时点音名：不触发任何判定回调', () => {
    const onHighlightedFretsChange = vi.fn()
    const onScoreChange = vi.fn()
    const recordPositionStat = vi.fn()
    const generateNewTarget = vi.fn()
    mount(
      baseProps({
        practiceAnswerMode: 'buttons',
        isPlaying: true,
        highlightedTargetPosition: null,
        onHighlightedFretsChange,
        onScoreChange,
        recordPositionStat,
        generateNewTarget,
      }),
    )
    act(() => buttonByName('C').click())
    expect(onHighlightedFretsChange).not.toHaveBeenCalled()
    expect(onScoreChange).not.toHaveBeenCalled()
    expect(recordPositionStat).not.toHaveBeenCalled()
    expect(generateNewTarget).not.toHaveBeenCalled()
  })

  it('作答 800ms 后清空高亮并生成下一题', () => {
    const onHighlightedFretsChange = vi.fn()
    const generateNewTarget = vi.fn()
    mount(
      baseProps({
        practiceAnswerMode: 'buttons',
        isPlaying: true,
        highlightedTargetPosition: { stringIndex: 0, fret: 2 },
        onHighlightedFretsChange,
        generateNewTarget,
      }),
    )
    vi.useFakeTimers()
    act(() => buttonByName('F#').click())
    expect(generateNewTarget).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(generateNewTarget).toHaveBeenCalledTimes(1)
    expect(onHighlightedFretsChange).toHaveBeenLastCalledWith(new Map())
  })
})

describe('PracticeModeControls — 剩余时间与练习建议', () => {
  it('练习中显示剩余时间（走 formatTime）', () => {
    mount(baseProps({ isPlaying: true, timeLeft: 95 }))
    expect(text()).toContain('time_remaining')
    expect(text()).toContain('95s')
  })

  it('未练习时不显示剩余时间', () => {
    mount(baseProps({ isPlaying: false }))
    expect(text()).not.toContain('time_remaining')
  })

  it('练习中有建议时显示建议框（标题走 t）', () => {
    mount(baseProps({ isPlaying: true, currentPracticeSuggestion: '慢速分解和弦' }))
    expect(text()).toContain('practice_suggestion_title')
    expect(text()).toContain('慢速分解和弦')
  })

  it('建议为空串时不显示建议框', () => {
    mount(baseProps({ isPlaying: true, currentPracticeSuggestion: '' }))
    expect(text()).not.toContain('practice_suggestion_title')
  })

  it('未练习时不显示建议框（即使有建议文案）', () => {
    mount(baseProps({ isPlaying: false, currentPracticeSuggestion: '慢速分解和弦' }))
    expect(text()).not.toContain('practice_suggestion_title')
  })
})
