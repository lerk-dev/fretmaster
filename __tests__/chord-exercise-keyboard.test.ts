/**
 * components/chord-exercise-keyboard.tsx 的契约测试（此前零测试）。
 *
 * 和弦练习的钢琴键盘：**有目标和弦时以目标为准**（root/type 都取 target），
 * 没有目标（尚未出题）时退化为「练习根音 + 已选和弦类型的第一项」，类型缺失时兜底 Major。
 *
 * 契约：
 *  ① target 存在 → 高亮与根音都来自 target，与 chordExerciseRoot / chordExerciseTypes 无关；
 *  ② target 缺失 → 用 chordExerciseRoot + chordExerciseTypes[0]（空数组兜底 "Major"）；
 *  ③ 当前步音只在有 target 时给出（无目标时序列无意义）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ChordExerciseKeyboard } from '@/components/chord-exercise-keyboard'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const HIGHLIGHT_MARKERS = ['bg-blue-200/70', 'bg-blue-400/80', 'bg-blue-500', 'bg-sky-400']

let cleanups: Array<() => void> = []
afterEach(() => {
  // 用例中途断言失败会跳过自己的 unmount()，卸载本身也可能抛错 —— 都会留下 DOM 污染
  // 下一条用例（表现为无关的「假失败」）。逐条 try + 兜底清空 body。
  for (const fn of cleanups) {
    try { fn() } catch { /* 忽略卸载异常 */ }
  }
  cleanups = []
  document.body.innerHTML = ''
})

function render(el: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(el) })
  const unmount = () => { act(() => root.unmount()); container.remove() }
  cleanups.push(unmount)
  return { container, unmount }
}

function readKeys(container: HTMLElement) {
  const divs = [...container.querySelectorAll('div')]
  const whiteLayer = divs.find((d) => d.classList.contains('z-0'))
  const blackLayer = divs.find((d) => d.classList.contains('z-10'))
  if (!whiteLayer || !blackLayer) return null
  return {
    whites: [...(whiteLayer as HTMLElement).children] as HTMLElement[],
    blacks: [...(blackLayer as HTMLElement).children] as HTMLElement[],
  }
}

const isLit = (el: HTMLElement) => HIGHLIGHT_MARKERS.some((c) => el.className.includes(c))

/** 精确匹配单个 class token —— 不能用 includes：`bg-blue-500` 会命中 `dark:bg-blue-500/25` */
const hasExactClass = (el: HTMLElement, cls: string) => el.className.split(/\s+/).includes(cls)

function lit(container: HTMLElement) {
  const keys = readKeys(container)
  if (!keys) return null
  const whites = keys.whites.filter(isLit)
  const blacks = keys.blacks.filter(isLit)
  return {
    whites,
    blacks,
    /** 去重后的音名集合（黑键 label 只在点亮时渲染；白键含 C 的兜底 label，故 C 恒在） */
    labels: new Set([...whites, ...blacks].map((k) => k.textContent?.trim()).filter(Boolean)),
  }
}

const pulseCount = (container: HTMLElement) => container.querySelectorAll('.animate-pulse').length

function mount(props: Partial<{
  chordExerciseRoot: string
  chordExerciseTypes: string[]
  chordExerciseLevel: string
  chordExerciseTargetChord: { root: string; type: string } | null
  chordExerciseCurrentStep: number
}> = {}) {
  const p = {
    chordExerciseRoot: 'C',
    chordExerciseTypes: ['Major'],
    chordExerciseLevel: 'all',
    chordExerciseTargetChord: null as { root: string; type: string } | null,
    chordExerciseCurrentStep: 0,
    getLevelOptions: () => ({}),
    ...props,
  }
  return { ...render(createElement(ChordExerciseKeyboard as never, p as never)), props: p }
}

describe('有目标和弦 → 一切以 target 为准', () => {
  it('用 target.root / target.type，忽略 chordExerciseRoot 与 chordExerciseTypes', () => {
    const p = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseRoot: 'D', // 若被使用 → 会点亮 D / F♯
      chordExerciseTypes: ['Minor'], // 若被使用 → 会点亮 D♯（E♭）
    })
    const l = lit(p.container)!
    expect(l.blacks).toHaveLength(0)
    expect(l.whites).toHaveLength(9)
    expect(l.labels).toEqual(new Set(['C', 'E', 'G']))
    // rootNote 也必须来自 target：根音锚点（深蓝）只应落在 C 上。
    // 若误用 chordExerciseRoot='D'，D 不在高亮集合里 ⇒ 没有任何键会拿到锚点色。
    const anchors = l.whites.filter((k) => hasExactClass(k, 'bg-blue-500'))
    expect(anchors).toHaveLength(3)
    expect(anchors.every((k) => k.textContent?.trim() === 'C')).toBe(true)
    p.unmount()
  })

  it('target 是升号根音（F♯ Major）也能正确点亮（回归 Unicode 音名）', () => {
    const p = mount({ chordExerciseTargetChord: { root: 'F♯', type: 'Major' } })
    const l = lit(p.container)!
    // F♯ A♯ C♯：全是黑键
    expect(l.blacks).toHaveLength(9)
    expect(l.whites).toHaveLength(0)
    p.unmount()
  })
})

describe('无目标和弦 → 退化为「练习根音 + 首个已选类型」', () => {
  it('root=G / types=[Minor] → G A# D（黑键标签由组件自己的 ASCII 表渲染）', () => {
    const p = mount({
      chordExerciseTargetChord: null,
      chordExerciseRoot: 'G',
      chordExerciseTypes: ['Minor'],
    })
    const l = lit(p.container)!
    expect(l.blacks).toHaveLength(3) // A♯
    expect(l.whites).toHaveLength(6) // G / D
    expect(l.labels).toEqual(new Set(['G', 'D', 'A#']))
    p.unmount()
  })

  it('types 为空数组 → 兜底 "Major"（D 大调三和弦：D F♯ A）', () => {
    const p = mount({
      chordExerciseTargetChord: null,
      chordExerciseRoot: 'D',
      chordExerciseTypes: [],
    })
    const l = lit(p.container)!
    expect(l.blacks).toHaveLength(3) // F♯
    expect(l.whites).toHaveLength(6) // D / A
    p.unmount()
  })

  it('多选类型时只用第一项', () => {
    const p = mount({
      chordExerciseTargetChord: null,
      chordExerciseRoot: 'C',
      chordExerciseTypes: ['Minor', 'Major'],
    })
    const l = lit(p.container)!
    // Minor = 1 b3 5 → C E♭ G（若错用第二项 Major 则是 C E G：黑键应为 0）
    expect(l.blacks).toHaveLength(3)
    expect(l.labels.has('E')).toBe(false)
    p.unmount()
  })
})

describe('当前步音', () => {
  it('有 target 时按 target 的度数渲染呼吸点（step=1 → 3 个八度的 E）', () => {
    const p = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseCurrentStep: 1,
    })
    expect(pulseCount(p.container)).toBe(3)
    const sky = lit(p.container)!.whites.filter((k) => k.className.includes('bg-sky-400'))
    expect(sky).toHaveLength(3)
    expect(sky.every((k) => k.textContent?.trim() === 'E')).toBe(true)
    p.unmount()
  })

  it('无 target → 不渲染呼吸点（即使下标合法）', () => {
    const p = mount({ chordExerciseTargetChord: null, chordExerciseCurrentStep: 0 })
    expect(pulseCount(p.container)).toBe(0)
    p.unmount()
  })

  it('有 target 但下标越界 → 不渲染呼吸点', () => {
    const p = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseCurrentStep: 9,
    })
    expect(pulseCount(p.container)).toBe(0)
    p.unmount()
  })
})
