import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChordExerciseQuestion } from '@/components/chord-exercise-question'
import { useAppStore } from '@/lib/store'
import { formatDegree, getChordDisplayName } from '@/lib/page-theory-functions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Props = ComponentProps<typeof ChordExerciseQuestion>
const t = (k: string) => k

const setStore = (isPlaying: boolean) => {
  useAppStore.setState({ isPlaying })
  useAppStore.setState({
    user: { ...useAppStore.getState().user, chordScaleDisplay: 'chinese' },
  })
}

const display = (type: string) =>
  getChordDisplayName(type, useAppStore.getState().user.chordScaleDisplay, useAppStore.getState().chordSymbols)

const containers: HTMLElement[] = []
const roots: Root[] = []

function mount(props: Partial<Props>) {
  const full = {
    t,
    chordExerciseTargetChord: null,
    chordExerciseSequence: [] as string[],
    chordExerciseCurrentStep: 0,
    nextChordExerciseInfo: null,
    ...props,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(createElement(ChordExerciseQuestion as never, full as never))
  })
  return container
}

/** 只有音级徽章是 span，且文本恰好等于 formatDegree 的结果 */
const degreeSpans = (c: HTMLElement) =>
  [...c.querySelectorAll('span')].filter((s) => /^[1-9♭♯]/.test(s.textContent ?? '') && !(s.textContent ?? '').includes(' '))

beforeEach(() => setStore(false))
afterEach(() => {
  act(() => {
    roots.forEach((r) => r.unmount())
  })
  roots.length = 0
  containers.forEach((c) => c.remove())
  containers.length = 0
})

describe('ChordExerciseQuestion — 当前题目', () => {
  it('未练习：提示点击开始，不渲染音级徽章', () => {
    const c = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseSequence: ['1', '3', '5'],
    })
    expect(c.textContent).toContain('click_start_to_begin')
    expect(degreeSpans(c).length).toBe(0)
  })

  it('练习但无目标和弦：仍显示开始提示', () => {
    setStore(true)
    const c = mount({ chordExerciseTargetChord: null, chordExerciseSequence: [] })
    expect(c.textContent).toContain('click_start_to_begin')
  })

  it('练习中：标题为「根音 + 和弦名」（根音与和弦名都归一化）', () => {
    setStore(true)
    const c = mount({
      chordExerciseTargetChord: { root: 'C♯', type: 'Minor' },
      chordExerciseSequence: ['1', 'b3', '5'],
    })
    expect(c.textContent).toContain(`C♯ ${display('Minor')}`)
  })

  it('音级徽章数量与序列一致，且过 formatDegree', () => {
    setStore(true)
    const c = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseSequence: ['1', 'b3', '5', 'b7'],
    })
    expect(degreeSpans(c).map((s) => s.textContent)).toEqual(['1', '♭3', '5', '♭7'])
    expect(formatDegree('b3')).toBe('♭3')
  })

  it('当前步之前的音级淡化（opacity-50），当前及之后不淡化', () => {
    setStore(true)
    const c = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseSequence: ['1', '3', '5'],
      chordExerciseCurrentStep: 1,
    })
    const faded = [...c.querySelectorAll('span')].filter((s) => s.className.includes('opacity-50'))
    expect(faded.length).toBe(1)
    expect(faded[0].textContent).toBe('1')
  })
})

describe('ChordExerciseQuestion — 下一题预览', () => {
  const next = { root: 'G', type: 'Major', sequence: ['1', '3', '5'] }

  it('练习中且有下一题：显示标题与音级序列', () => {
    setStore(true)
    const c = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseSequence: ['1', '3', '5'],
      nextChordExerciseInfo: next,
    })
    expect(c.textContent).toContain('next_chord')
    expect(c.textContent).toContain(`G ${display('Major')}`)
    expect(c.textContent).toContain('1 3 5')
  })

  it('未练习：不显示下一题预览', () => {
    const c = mount({ nextChordExerciseInfo: next })
    expect(c.textContent).not.toContain('next_chord')
  })

  it('没有下一题时不显示预览', () => {
    setStore(true)
    const c = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseSequence: ['1'],
      nextChordExerciseInfo: null,
    })
    expect(c.textContent).not.toContain('next_chord')
  })

  it('ASCII 形式的根音在「当前」与「下一题」两处渲染完全一致（归一化回归）', () => {
    setStore(true)
    const asciiChord = { root: 'C#', type: 'Major' }
    const c = mount({
      chordExerciseTargetChord: asciiChord,
      chordExerciseSequence: ['1', '3', '5'],
      nextChordExerciseInfo: { ...asciiChord, sequence: ['1', '3', '5'] },
    })
    const text = c.textContent ?? ''
    // 旧实现：预览那处漏了 normalizeNoteName，同一和弦会一处 C♯、一处 C#
    expect(text).not.toContain('C#')
    expect(text.split('C♯').length - 1).toBe(2)
  })

  it('降号根音同样归一化为 ♭ 形式', () => {
    setStore(true)
    const c = mount({
      chordExerciseTargetChord: { root: 'Db', type: 'Major' },
      chordExerciseSequence: ['1'],
    })
    expect(c.textContent).toContain('D♭')
    expect(c.textContent).not.toContain('Db')
  })
})
