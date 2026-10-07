/**
 * components/scale-keyboard.tsx 的契约测试（此前零测试）。
 *
 * 音阶练习的钢琴键盘 wrapper：把「当前调性 + 当前音阶 + 练习序列当前步」翻译成
 * `SimplePianoKeyboard` 需要的音名，再交给它画图。
 *
 * 契约：
 *  ① 高亮音 = NOTES[(getNoteIndex(scaleKey) + interval) % 12]，对**每个音阶音**都要高亮；
 *  ② 当前步音 = sequence[step] → DEGREE_TO_SEMITONE → 音名，且只在序列有效时给出；
 *  ③ 音阶由 (分类, 音阶名) 两元组定位；名字与分类不匹配时不点亮任何键（现状即如此）。
 *
 * 之所以盯住「高亮集合」而不是 class 细节：本文件曾因 SimplePianoKeyboard 的
 * ASCII/Unicode 音名不匹配（`C♯` 匹配不到 ASCII 表 → 回退 MIDI 60）而把带升号的音
 * 全画到 C 键上；只有断言「具体哪些键被点亮」才能咬住这类错误。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ScaleKeyboard } from '@/components/scale-keyboard'
import { SCALE_MODES } from '@/lib/page-theory-data'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const HIGHLIGHT_MARKERS = ['bg-blue-200/70', 'bg-blue-400/80', 'bg-blue-500', 'bg-sky-400']
const ROOT_MARKER = 'bg-blue-500'

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

/** 白键层 / 黑键层（与 piano-keyboard 的 DOM 结构约定一致） */
function readKeys(container: HTMLElement) {
  const divs = [...container.querySelectorAll('div')]
  const whiteLayer = divs.find((d) => d.classList.contains('z-0'))
  const blackLayer = divs.find((d) => d.classList.contains('z-10'))
  expect(whiteLayer, '找不到白键层').toBeTruthy()
  expect(blackLayer, '找不到黑键层').toBeTruthy()
  return {
    whites: [...(whiteLayer as HTMLElement).children] as HTMLElement[],
    blacks: [...(blackLayer as HTMLElement).children] as HTMLElement[],
  }
}

const isLit = (el: HTMLElement) => HIGHLIGHT_MARKERS.some((c) => el.className.includes(c))

/** 精确匹配单个 class token —— 不能用 includes：`bg-blue-500` 会命中 `dark:bg-blue-500/25` */
const hasExactClass = (el: HTMLElement, cls: string) => el.className.split(/\s+/).includes(cls)

function litCounts(container: HTMLElement) {
  const { whites, blacks } = readKeys(container)
  return {
    whites: whites.filter(isLit),
    blacks: blacks.filter(isLit),
    total: whites.filter(isLit).length + blacks.filter(isLit).length,
  }
}

/** 当前步呼吸点（animate-pulse 只加在“当前步”的白键上） */
const pulseCount = (container: HTMLElement) => container.querySelectorAll('.animate-pulse').length

function mount(props: Partial<{
  scaleKey: string
  selectedScale: typeof SCALE_MODES.pentatonic[number]
  selectedScaleCategory: keyof typeof SCALE_MODES
  scaleExerciseSequence: string[]
  scaleExerciseCurrentStep: number
}> = {}) {
  const p = {
    scaleKey: 'C',
    selectedScale: SCALE_MODES.pentatonic[0],
    selectedScaleCategory: 'pentatonic' as keyof typeof SCALE_MODES,
    scaleExerciseSequence: [] as string[],
    scaleExerciseCurrentStep: 0,
    ...props,
  }
  return { ...render(createElement(ScaleKeyboard as never, p as never)), props: p }
}

describe('高亮音（音阶音 × 调性）', () => {
  it('C + 大调五声音阶（0/2/4/7/9）→ 点亮 C D E G A 全白键，每音 3 个八度', () => {
    const p = mount({ scaleKey: 'C', selectedScale: SCALE_MODES.pentatonic[0] })
    const lit = litCounts(p.container)
    // 五个音全在自然音级上 ⇒ 无黑键
    expect(lit.blacks).toHaveLength(0)
    // 5 音 × 3 八度 = 15 个白键
    expect(lit.whites).toHaveLength(15)
    // 点亮的白键音名（去重后）应恰为音阶音集合
    expect(new Set(lit.whites.map((k) => k.textContent?.trim()))).toEqual(new Set(['C', 'D', 'E', 'G', 'A']))
    p.unmount()
  })

  it('C + 小调五声音阶（0/3/5/7/10）→ 白键 3 音 + 黑键 2 音（含升号，回归 Unicode 音名）', () => {
    const p = mount({ scaleKey: 'C', selectedScale: SCALE_MODES.pentatonic[1] })
    const lit = litCounts(p.container)
    // C E♭(黑) F G B♭(黑)：白键 C/F/G = 3×3，黑键 2×3
    expect(lit.whites).toHaveLength(9)
    expect(lit.blacks).toHaveLength(6)
    // 白键标签由组件自己的 ASCII 表渲染（C# 体系），故这里按半音位置断言
    expect(new Set(lit.whites.map((k) => k.textContent?.trim()))).toEqual(new Set(['C', 'F', 'G']))
    p.unmount()
  })

  it('换调性 → 整个高亮集合随之平移（G 调：G A B D E）', () => {
    const p = mount({ scaleKey: 'G', selectedScale: SCALE_MODES.pentatonic[0] })
    const lit = litCounts(p.container)
    expect(lit.blacks).toHaveLength(0)
    expect(new Set(lit.whites.map((k) => k.textContent?.trim()))).toEqual(new Set(['G', 'A', 'B', 'D', 'E']))
    p.unmount()
  })

  it('七声大调（Ionian）→ 7 个白键音全部点亮', () => {
    const p = mount({
      scaleKey: 'C',
      selectedScaleCategory: 'majorScaleModes',
      selectedScale: SCALE_MODES.majorScaleModes[0],
    })
    const lit = litCounts(p.container)
    expect(lit.blacks).toHaveLength(0)
    expect(lit.whites).toHaveLength(21) // 7 音 × 3 八度
    p.unmount()
  })

  it('音阶名与分类不匹配 → 一个键都不点亮（现状契约：find 失败即空）', () => {
    const p = mount({
      scaleKey: 'C',
      // 'Major Pentatonic' 不在 majorScaleModes 里
      selectedScaleCategory: 'majorScaleModes',
      selectedScale: SCALE_MODES.pentatonic[0],
    })
    expect(litCounts(p.container).total).toBe(0)
    p.unmount()
  })

  it('根音位置用深蓝锚点色（C 调时 C 键为 bg-blue-500）', () => {
    const p = mount({ scaleKey: 'C', selectedScale: SCALE_MODES.pentatonic[0] })
    const lit = litCounts(p.container)
    const roots = lit.whites.filter((k) => hasExactClass(k, ROOT_MARKER))
    expect(roots).toHaveLength(3) // C3/C4/C5
    expect(roots.every((k) => k.textContent?.trim() === 'C')).toBe(true)
    // 非根音的高亮音不能是锚点色（D/E/G/A 都用浅蓝上下文色）
    expect(lit.whites.filter((k) => !hasExactClass(k, ROOT_MARKER))).toHaveLength(12)
    p.unmount()
  })
})

describe('练习序列当前步', () => {
  it('step=0 且序列首音级为 1 → 3 个八度的根音出现呼吸点', () => {
    const p = mount({
      scaleExerciseSequence: ['1', '2', '3', '5', '6'],
      scaleExerciseCurrentStep: 0,
    })
    expect(pulseCount(p.container)).toBe(3)
    p.unmount()
  })

  it('step=1（音级 2 = D）→ 呼吸点落在 D 上，且 D 用当前步色 bg-sky-400', () => {
    const p = mount({
      scaleExerciseSequence: ['1', '2', '3', '5', '6'],
      scaleExerciseCurrentStep: 1,
    })
    expect(pulseCount(p.container)).toBe(3)
    const lit = litCounts(p.container)
    const sky = lit.whites.filter((k) => hasExactClass(k, 'bg-sky-400'))
    expect(sky).toHaveLength(3)
    expect(sky.every((k) => k.textContent?.trim() === 'D')).toBe(true)
    p.unmount()
  })

  it('空序列 → 无呼吸点', () => {
    const p = mount({ scaleExerciseSequence: [], scaleExerciseCurrentStep: 0 })
    expect(pulseCount(p.container)).toBe(0)
    p.unmount()
  })

  it('下标越界 → 无呼吸点（不崩）', () => {
    const p = mount({ scaleExerciseSequence: ['1', '2', '3'], scaleExerciseCurrentStep: 9 })
    expect(pulseCount(p.container)).toBe(0)
    p.unmount()
  })

  it('未知音级（不在 DEGREE_TO_SEMITONE 里）→ 无呼吸点（不崩）', () => {
    const p = mount({ scaleExerciseSequence: ['not-a-degree'], scaleExerciseCurrentStep: 0 })
    expect(pulseCount(p.container)).toBe(0)
    // 高亮音仍按音阶本身点亮，不受序列影响
    expect(litCounts(p.container).whites).toHaveLength(15)
    p.unmount()
  })
})
