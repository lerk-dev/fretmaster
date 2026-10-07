/**
 * components/chord-progression-keyboard.tsx 的契约测试（此前零测试）。
 *
 * 和弦进行（转换）的钢琴键盘：取 `transposedChords[currentChordIndex]`，
 * 按 `getChordDegrees(type, practiceLevel, getLevelOptions())` 算出应高亮的音级，
 * 再映射到具体音名；没有当前和弦时整块不渲染。
 *
 * 契约：
 *  ① 无当前和弦（空数组 / 下标越界）→ 不渲染任何内容；
 *  ② 高亮音由 (和弦 type, practiceLevel, 等级选项) 三者共同决定 —— 任一变化都应反映出来；
 *  ③ 根音来自当前和弦的 root（用半音位置比较，兼容 Unicode 音名）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ChordProgressionKeyboard } from '@/components/chord-progression-keyboard'

// 记录 getChordDegrees 的调用参数（原实现照常执行）：这是「组件的三个输入
// （type / practiceLevel / options）真的被传下去」最直接的证据，比推断高亮音更硬。
const { degreeCalls } = vi.hoisted(() => ({ degreeCalls: [] as unknown[][] }))
vi.mock('@/lib/page-theory-functions', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/page-theory-functions')>()
  return {
    ...orig,
    getChordDegrees: (...args: unknown[]) => {
      degreeCalls.push(args)
      return (orig.getChordDegrees as (...a: never[]) => string[])(...(args as never[]))
    },
  }
})

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

/** 精确匹配单个 class token —— 不能用 includes：`bg-blue-500` 会命中 `dark:bg-blue-500/70` */
const hasExactClass = (el: HTMLElement, cls: string) => el.className.split(/\s+/).includes(cls)

function lit(container: HTMLElement) {
  const keys = readKeys(container)
  if (!keys) return null
  return {
    whites: keys.whites.filter(isLit),
    blacks: keys.blacks.filter(isLit),
  }
}

const pulseCount = (container: HTMLElement) => container.querySelectorAll('.animate-pulse').length

function mount(props: Partial<{
  transposedChords: { root: string; type: string; bass?: string }[]
  currentChordIndex: number
  practiceLevel: string
  chordDegreeCurrentStep: number
  getLevelOptions: () => Record<string, unknown>
}> = {}) {
  const getLevelOptions = props.getLevelOptions ?? (() => ({}))
  const p = {
    transposedChords: [{ root: 'C', type: 'Major' }],
    currentChordIndex: 0,
    practiceLevel: 'all',
    chordDegreeCurrentStep: 0,
    ...props,
    getLevelOptions,
  }
  return { ...render(createElement(ChordProgressionKeyboard as never, p as never)), props: p, getLevelOptions }
}

describe('无当前和弦 → 不渲染', () => {
  it('空和弦数组', () => {
    const p = mount({ transposedChords: [] })
    expect(p.container.innerHTML).toBe('')
    expect(readKeys(p.container)).toBeNull()
    p.unmount()
  })

  it('下标越界', () => {
    const p = mount({ transposedChords: [{ root: 'C', type: 'Major' }], currentChordIndex: 5 })
    expect(p.container.innerHTML).toBe('')
    p.unmount()
  })
})

describe('高亮音（和弦度数 × 根音）', () => {
  it('C Major → C E G（全白键，每音 3 个八度）', () => {
    const p = mount({ transposedChords: [{ root: 'C', type: 'Major' }] })
    const l = lit(p.container)!
    expect(l.blacks).toHaveLength(0)
    expect(l.whites).toHaveLength(9)
    expect(new Set(l.whites.map((k) => k.textContent?.trim()))).toEqual(new Set(['C', 'E', 'G']))
    p.unmount()
  })

  it('D Major → D F♯ A（含升号黑键，回归 Unicode 音名）', () => {
    const p = mount({ transposedChords: [{ root: 'D', type: 'Major' }] })
    const l = lit(p.container)!
    expect(l.whites).toHaveLength(6) // D / A
    expect(l.blacks).toHaveLength(3) // F♯
    expect(new Set(l.whites.map((k) => k.textContent?.trim()))).toEqual(new Set(['D', 'A']))
    p.unmount()
  })

  it('A♭ Major → 根音是黑键，仍能正确点亮（降号 + 半音比较）', () => {
    const p = mount({ transposedChords: [{ root: 'A♭', type: 'Major' }] })
    const l = lit(p.container)!
    // A♭ C E♭：黑键 A♭/E♭，白键 C
    expect(l.whites).toHaveLength(3)
    expect(l.blacks).toHaveLength(6)
    // 根音 A♭ 是该和弦的黑键根音 → 深蓝锚点（E♭ 只是普通高亮，不能用 includes 判色）
    expect(l.blacks.filter((k) => hasExactClass(k, 'bg-blue-500'))).toHaveLength(3)
    p.unmount()
  })

  it('根音来自当前和弦：同 type 换 root 会整体平移', () => {
    const c = mount({ transposedChords: [{ root: 'C', type: 'Major' }] })
    const cSet = new Set(lit(c.container)!.whites.map((k) => k.textContent?.trim()))
    c.unmount()
    const d = mount({ transposedChords: [{ root: 'D', type: 'Major' }] })
    const dSet = new Set(lit(d.container)!.whites.map((k) => k.textContent?.trim()))
    d.unmount()
    expect(cSet).not.toEqual(dSet)
  })

  it('取的是 currentChordIndex 指向的那个和弦', () => {
    const chords = [
      { root: 'C', type: 'Major' }, // C E G —— 不含 F
      { root: 'F', type: 'Major' }, // F A C —— 含 F
    ]
    const p0 = mount({ transposedChords: chords, currentChordIndex: 0 })
    const s0 = new Set(lit(p0.container)!.whites.map((k) => k.textContent?.trim()))
    p0.unmount()
    const p1 = mount({ transposedChords: chords, currentChordIndex: 1 })
    const s1 = new Set(lit(p1.container)!.whites.map((k) => k.textContent?.trim()))
    p1.unmount()
    // C 与 F 是两和弦各自的根音，用「F 只应出现在 index=1」来区分（C 是两者共有的五音/根音）
    expect(s0.has('F')).toBe(false)
    expect(s1.has('F')).toBe(true)
  })
})

describe('等级参数真的被传下去了', () => {
  it('practiceLevel 不同 → 度数不同（all 给三和弦音，single_chord_tones_root 只给根音）', () => {
    const all = mount({ practiceLevel: 'all' })
    expect(new Set(lit(all.container)!.whites.map((k) => k.textContent?.trim()))).toEqual(new Set(['C', 'E', 'G']))
    all.unmount()

    const rootOnly = mount({ practiceLevel: 'single_chord_tones_root' })
    const l = lit(rootOnly.container)!
    expect(l.blacks).toHaveLength(0)
    expect(new Set(l.whites.map((k) => k.textContent?.trim()))).toEqual(new Set(['C']))
    rootOnly.unmount()
  })

  it('把 (当前和弦的 type, practiceLevel, 等级选项) 原样传给 getChordDegrees', () => {
    degreeCalls.length = 0
    const opts = { forceNaturalFive: true, endOnStartingInterval: false }
    const p = mount({
      transposedChords: [{ root: 'C', type: 'Minor' }],
      practiceLevel: 'single_chord_tones_root',
      getLevelOptions: () => opts,
    })
    expect(degreeCalls.length).toBeGreaterThan(0)
    for (const call of degreeCalls) {
      expect(call[0]).toBe('Minor') // 用的是和弦自己的 type，不是根音/别的字段
      expect(call[1]).toBe('single_chord_tones_root')
      expect(call[2]).toEqual(opts)
    }
    p.unmount()
  })

  it('getLevelOptions 被调用（每次渲染至少一次）', () => {
    const getLevelOptions = vi.fn(() => ({}))
    const p = mount({ getLevelOptions })
    expect(getLevelOptions).toHaveBeenCalled()
    expect(lit(p.container)!.whites.length).toBeGreaterThan(0)
    p.unmount()
  })
})

describe('当前步音', () => {
  it('step=2（度数为 5 = G）→ 呼吸点 3 个且在 G 上', () => {
    const p = mount({ chordDegreeCurrentStep: 2 })
    expect(pulseCount(p.container)).toBe(3)
    const sky = lit(p.container)!.whites.filter((k) => k.className.includes('bg-sky-400'))
    expect(sky).toHaveLength(3)
    expect(sky.every((k) => k.textContent?.trim() === 'G')).toBe(true)
    p.unmount()
  })

  it('step 越界 → 无呼吸点', () => {
    const p = mount({ chordDegreeCurrentStep: 9 })
    expect(pulseCount(p.container)).toBe(0)
    p.unmount()
  })
})
