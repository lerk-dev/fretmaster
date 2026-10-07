/**
 * components/piano-keyboard.tsx 的契约测试（此前零测试）。
 *
 * 两个导出：`PianoKeyboard`（按 MIDI 高亮）与 `SimplePianoKeyboard`（按音名，固定 3–5 八度）。
 * 消费者：chord-exercise-keyboard / chord-progression-keyboard / scale-keyboard 三个 wrapper
 * 都用 `SimplePianoKeyboard`，所以它是**活的**。
 *
 * 本轮修的真 bug 在**黑键定位**：
 *   白键按 DOM 顺序平铺（第 k 个白键占 x ∈ [k·W, (k+1)·W]），黑键用绝对定位画在上层，
 *   中心必须落在「它前面那个白键」与「后面那个白键」的交界 x = k·W 上。
 *   原实现写的是 `(白键数 + 1) · W`，于是**所有黑键整体右移一个白键宽（26px）**：
 *   C# 画到了 D–E 交界、D# 画到了 E–F 交界（而 E–F 之间根本没有黑键）——
 *   结果是「该有黑键的位置空着，不该有的位置多一个黑键」。
 *
 * 因此最强的那条断言不是坐标数值，而是 **E–F / B–C 这类相邻半音白键之间绝不能有黑键**：
 * 它是纯乐理约束，与布局常量无关，偏移一整格时必然被抓。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PianoKeyboard, SimplePianoKeyboard } from '@/components/piano-keyboard'
import { useAppStore } from '@/lib/store'
import { chromaColor, MUSMATH_DARK_KEY_COLORS, resolveMusmathKeyGeometry, type PianoKeyboardStyle } from '@/lib/piano-keyboard-style'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// 与组件内 PIANO_CONFIG 一致（布局常量若改动，测试会失败提醒同步）
const W = 26, BW = 16, WHITE_H = 88, BLACK_H = 56
const START_NOTE = 21, END_NOTE = 108
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12)

/** 测试自己的模型：给定音域算出白/黑键序列 */
function model(minOctave: number, maxOctave: number) {
  const start = Math.max(START_NOTE, (minOctave + 1) * 12)
  const end = Math.min(END_NOTE, (maxOctave + 2) * 12 - 1)
  const whites: number[] = []
  const blacks: number[] = []
  for (let m = start; m <= end; m++) (isBlack(m) ? blacks : whites).push(m)
  return { start, end, whites, blacks }
}

function render(el: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(el) })
  return {
    container,
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

function readKeys(container: HTMLElement) {
  const divs = [...container.querySelectorAll('div')]
  const whiteLayer = divs.find((d) => d.classList.contains('z-0'))!
  const blackLayer = divs.find((d) => d.classList.contains('z-10'))!
  expect(whiteLayer, '找不到白键层').toBeTruthy()
  expect(blackLayer, '找不到黑键层').toBeTruthy()
  return {
    whites: [...whiteLayer.children] as HTMLElement[],
    blacks: [...blackLayer.children] as HTMLElement[],
  }
}

const blackCenter = (el: HTMLElement) => parseFloat(el.style.left) + BW / 2

const HIGHLIGHT_MARKERS = ['bg-blue-200/70', 'bg-blue-400/80', 'bg-blue-500', 'bg-sky-400']

describe('黑键定位（本轮修的 bug）', () => {
  it('每个黑键的中心都落在「前一白键与后一白键的交界」上', () => {
    for (const [lo, hi] of [[3, 5], [1, 2], [2, 6], [0, 8], [3, 3]]) {
      const { container, unmount } = render(
        createElement(PianoKeyboard as never, { minOctave: lo, maxOctave: hi } as never),
      )
      const { blacks } = readKeys(container)
      const { blacks: wantBlacks } = model(lo, hi)
      expect(blacks.length, `octave ${lo}-${hi} 黑键数`).toBe(wantBlacks.length)

      wantBlacks.forEach((m, i) => {
        let before = 0
        for (let k = model(lo, hi).start; k < m; k++) if (!isBlack(k)) before++
        expect(
          blackCenter(blacks[i]),
          `octave ${lo}-${hi} 的 ${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1} 位置`,
        ).toBe(before * W)
      })
      unmount()
    }
  })

  it('相邻半音的白键之间绝不能有黑键（E–F / B–C）——最强的一条乐理约束', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, { minOctave: 3, maxOctave: 5 } as never),
    )
    const { blacks } = readKeys(container)
    const { whites } = model(3, 5)

    for (const el of blacks) {
      const boundary = blackCenter(el) / W // 第几条交界
      const left = whites[boundary - 1]
      const right = whites[boundary]
      expect(left, `交界 ${boundary} 左侧没有白键`).toBeDefined()
      expect(right, `交界 ${boundary} 右侧没有白键`).toBeDefined()
      expect(
        right - left,
        `黑键落在 ${NOTE_NAMES[left % 12]}–${NOTE_NAMES[right % 12]} 之间，这两者是相邻半音、不该有黑键`,
      ).toBe(2)
    }
    unmount()
  })

  it('黑键中心严格递增，且都落在键盘宽度内', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, { minOctave: 3, maxOctave: 5 } as never),
    )
    const { blacks } = readKeys(container)
    const centers = blacks.map(blackCenter)
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i], `第 ${i} 个黑键`).toBeGreaterThan(centers[i - 1])
    }
    for (const c of centers) {
      expect(c).toBeGreaterThan(0)
      expect(c).toBeLessThanOrEqual(model(3, 5).whites.length * W)
    }
    unmount()
  })

  it('每个八度恰好 5 个黑键，且音级依次为 #1/#3/#6/#8/#10', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, { minOctave: 3, maxOctave: 5 } as never),
    )
    const { blacks } = readKeys(container)
    const { blacks: wantBlacks } = model(3, 5)
    expect(wantBlacks.map((m) => m % 12).slice(0, 5)).toEqual([1, 3, 6, 8, 10])
    expect(blacks.length).toBe(15) // 3 个八度 × 5
    unmount()
  })
})

describe('键数与音域', () => {
  it('默认 3–5 八度：21 白键 + 15 黑键（C3..B5）', () => {
    const { container, unmount } = render(createElement(PianoKeyboard as never, {} as never))
    const { whites, blacks } = readKeys(container)
    expect(whites.length).toBe(21)
    expect(blacks.length).toBe(15)
    unmount()
  })

  it('minOctave / maxOctave 的夹取：不会越出 PIANO_CONFIG 的 21..108', () => {
    for (const [lo, hi] of [[0, 0], [0, 8], [-3, 20], [1, 2], [7, 8]]) {
      const { container, unmount } = render(
        createElement(PianoKeyboard as never, { minOctave: lo, maxOctave: hi } as never),
      )
      const { whites, blacks } = readKeys(container)
      const { whites: ww, blacks: bb, start, end } = model(lo, hi)
      expect(start, `octave ${lo}-${hi} start`).toBeGreaterThanOrEqual(START_NOTE)
      expect(end, `octave ${lo}-${hi} end`).toBeLessThanOrEqual(END_NOTE)
      expect(whites.length).toBe(ww.length)
      expect(blacks.length).toBe(bb.length)
      unmount()
    }
  })

  it('白键与黑键的尺寸取自配置', () => {
    const { container, unmount } = render(createElement(PianoKeyboard as never, {} as never))
    const { whites, blacks } = readKeys(container)
    expect(whites[0].style.width).toBe(`${W}px`)
    expect(whites[0].style.height).toBe(`${WHITE_H}px`)
    expect(blacks[0].style.width).toBe(`${BW}px`)
    expect(blacks[0].style.height).toBe(`${BLACK_H}px`)
    unmount()
  })
})

describe('高亮 / 根音 / 当前步骤', () => {
  it('高亮按音名匹配到所有八度（C → C3/C4/C5 三个白键）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60], // C4
        minOctave: 3, maxOctave: 5,
      } as never),
    )
    const { whites } = readKeys(container)
    const lit = whites.filter((w) => HIGHLIGHT_MARKERS.some((c) => w.className.includes(c)))
    expect(lit.length, 'C3/C4/C5 都应高亮').toBe(3)
    unmount()
  })

  it('根音 + 高亮：根音键用深蓝并带顶部锚点圆点', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60], rootNote: 'C', minOctave: 3, maxOctave: 5,
      } as never),
    )
    const { whites } = readKeys(container)
    const rootKeys = whites.filter((w) => w.className.includes('bg-blue-500'))
    expect(rootKeys.length).toBe(3)
    // 锚点小圆点：h-1 w-1
    expect(rootKeys[0].querySelectorAll('span').length).toBeGreaterThanOrEqual(1)
    unmount()
  })

  it('根音单独给（不在 highlightedNotes 里）时不高亮', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        rootNote: 'C', minOctave: 3, maxOctave: 5,
      } as never),
    )
    const { whites } = readKeys(container)
    expect(whites.filter((w) => HIGHLIGHT_MARKERS.some((c) => w.className.includes(c)))).toHaveLength(0)
    unmount()
  })

  it('currentStepNotes 用亮蓝（sky-400），与和弦音的浅蓝区分', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], currentStepNotes: [64],
        minOctave: 3, maxOctave: 5,
      } as never),
    )
    const { whites } = readKeys(container)
    expect(whites.filter((w) => w.className.includes('bg-sky-400')).length).toBe(3) // E3/E4/E5
    expect(whites.filter((w) => w.className.includes('bg-blue-200/70')).length).toBe(6) // C 与 G 各 3
    unmount()
  })

  it('showLabels=false 时不渲染音名标签', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, { showLabels: false, minOctave: 3, maxOctave: 5 } as never),
    )
    expect(container.querySelectorAll('span').length).toBe(0)
    unmount()
  })

  it('默认只给 C 与高亮键加标签', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, { minOctave: 3, maxOctave: 5 } as never),
    )
    const labels = [...container.querySelectorAll('span')].map((s) => s.textContent)
    expect(labels).toEqual(['C', 'C', 'C']) // C3/C4/C5
    unmount()
  })
})

describe('SimplePianoKeyboard', () => {
  it('按音名高亮，并展开到 3–5 八度', () => {
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, {
        rootNote: 'C', highlightedNotes: ['C', 'E', 'G'],
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    expect(whites.length).toBe(21)
    expect(blacks.length).toBe(15)
    // C/E/G 三个白键音 × 3 个八度 = 9 个白键被点亮
    const lit = [...whites, ...blacks].filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c)))
    expect(lit.length).toBe(9)
    unmount()
  })

  it('黑键音名也能高亮（如 A#）', () => {
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, {
        rootNote: 'A#', highlightedNotes: ['A#'],
      } as never),
    )
    const { blacks } = readKeys(container)
    const lit = blacks.filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c)))
    expect(lit.length).toBe(3) // A#3/A#4/A#5
    unmount()
  })

  it('Unicode 升号音名（A♯）能高亮，且根音锚点生效（回归：曾整片错高亮到 C）', () => {
    // app 里的音名一律来自 NOTES / NOTES_FLAT，是 **Unicode** 升/降号（["C","C♯",…]）。
    // 组件内原用 ASCII 的 NOTE_NAMES.indexOf 匹配 ⇒ 对 'A♯' 恒为 -1 ⇒ 回退 MIDI 60（C）。
    // 后果：三个 keyboard wrapper（scale/chord-progression/chord-exercise）里凡带升号的音
    // 全部点亮 C 键。三个 wrapper 传的都是 Unicode，故 ASCII 用例（上一条）测不到。
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, {
        rootNote: 'A♯', highlightedNotes: ['A♯'],
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    const litBlacks = blacks.filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c)))
    expect(litBlacks.length).toBe(3) // A♯3/A♯4/A♯5
    // 根音 + 高亮 → 深蓝锚点色（说明 rootNote 也做了半音归一化比较，而不是字符串相等）
    expect(litBlacks.every((k) => k.className.includes('bg-blue-500'))).toBe(true)
    // 白键一个都不亮（A♯ 是黑键；原 bug 下 C 白键会被点亮）
    expect(whites.filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c)))).toHaveLength(0)
    unmount()
  })

  it('降号音名（B♭）能高亮（走 NOTES_FLAT 表）', () => {
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, {
        rootNote: 'B♭', highlightedNotes: ['B♭', 'D'],
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    expect(blacks.filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c))).length).toBe(3)
    expect(whites.filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c))).length).toBe(3)
    unmount()
  })

  it('未知音名兜底为 C4（midi 60），不崩', () => {
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, {
        rootNote: 'X', highlightedNotes: ['X', 'C'],
      } as never),
    )
    const { whites } = readKeys(container)
    expect(whites.length).toBe(21)
    unmount()
  })

  it('空高亮列表只画键盘、不点亮任何键', () => {
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, { rootNote: 'C', highlightedNotes: [] } as never),
    )
    const { whites, blacks } = readKeys(container)
    expect([...whites, ...blacks].filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c))))
      .toHaveLength(0)
    unmount()
  })
})

// ==================== musmath 皮肤（键面留白 + 十二音级色标） ====================
//
// 画法抄自 musmath.com 的音阶页：键面保持白/黑**不清染**，只在音阶/和弦音
// 所在的键上落一枚圆形色标，底色按「十二音级色谱」取（同一半音跨八度同色），
// 根音那枚改方形。色号与规则在 lib/piano-keyboard-style.ts，这里钉 DOM 契约。

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
const badgesOf = (el: HTMLElement) => [...el.querySelectorAll('[data-note-badge]')] as HTMLElement[]
/** 键上的色标底色（jsdom 会把 hex 归一化成 rgb() 字面量） */
const badgeColor = (b: HTMLElement) => b.style.backgroundColor

describe('musmath 皮肤', () => {
  const musmathProps = { variant: 'musmath', minOctave: 3, maxOctave: 5 } as const

  it('键面不再被高亮染色：任何一个键都没有 classic 的蓝底类', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], rootNote: 'C', ...musmathProps,
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    const tinted = [...whites, ...blacks].filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c)))
    expect(tinted.map((k) => k.className), 'musmath 皮肤不该有整键底色高亮').toEqual([])
    unmount()
  })

  it('键面是 Dark Reader 后的深色：组件字面量必须与 lib 常量逐字一致（差分护栏）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], rootNote: 'C', ...musmathProps,
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    // 期望类名**从常量拼出来**：组件里的字面量或 lib 常量任何一侧被单独改动都会红
    // （只用字面量断言抓不到「改常量不改组件」，只有这种差分才咬得住）。
    const whiteCls = whites[0].className.split(/\s+/)
    const blackCls = blacks[0].className.split(/\s+/)
    expect(whiteCls, '白键面').toContain(`bg-[${MUSMATH_DARK_KEY_COLORS.whiteKey}]`)
    expect(blackCls, '黑键面').toContain(`bg-[${MUSMATH_DARK_KEY_COLORS.blackKey}]`)
    expect(whiteCls, '白键描边').toContain(`border-[${MUSMATH_DARK_KEY_COLORS.border}]`)
    expect(blackCls, '黑键描边').toContain(`border-[${MUSMATH_DARK_KEY_COLORS.border}]`)
    unmount()
  })

  it('浅色键面绝迹、也不再按明暗主题分档（浅色铺在深色卡片上会整块发亮）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], rootNote: 'C', ...musmathProps,
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    const tokens = [...whites[0].className.split(/\s+/), ...blacks[0].className.split(/\s+/)]
    // 被替换掉的浅色原值：浅色主题的白键 `bg-white`、深色主题的米色键 `#d8c69c`、描边 `#c6bca8`/`#0a5159`
    for (const banned of ['bg-white', '#d8c69c', '#c6bca8', '#0a5159']) {
      expect(tokens.filter((t) => t.includes(banned)), `键面不该再有 ${banned}`).toEqual([])
    }
    // 两套应用主题共用同一组深色 ⇒ 键面上不许存在任何 dark: 分支
    expect(tokens.filter((t) => t.startsWith('dark:')), '键面不该再按主题分档').toEqual([])
    unmount()
  })

  it('色标只落在音阶音所在键上，且跨八度同色（C–E–G ⇒ 9 枚白键色标、黑键 0 枚）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], rootNote: 'C', ...musmathProps,
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    const whiteBadges = whites.flatMap(badgesOf)
    expect(whiteBadges).toHaveLength(9) // C/E/G × 3 个八度
    expect(blacks.flatMap(badgesOf)).toHaveLength(0)

    // 三个半音各自的色标颜色必须等于色谱色，且三个八度完全一致
    const byPc = new Map<number, Set<string>>()
    for (const b of whiteBadges) {
      const pc = Number(b.getAttribute('data-note-badge'))
      ;(byPc.get(pc) ?? byPc.set(pc, new Set()).get(pc)!).add(badgeColor(b) ?? '')
    }
    expect([...byPc.keys()].sort((a, b) => a - b)).toEqual([0, 4, 7])
    for (const [pc, colors] of byPc) {
      expect([...colors], `pc=${pc} 跨八度必须同色`).toEqual([hexToRgb(chromaColor(pc))])
    }
    unmount()
  })

  it('根音色标是方形，其余是圆形（musmath 用它区分根音，不看文字也能认）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], rootNote: 'C', ...musmathProps,
      } as never),
    )
    const { whites } = readKeys(container)
    const shapes = whites.flatMap(badgesOf).map((b) => [b.getAttribute('data-note-badge'), b.getAttribute('data-badge-shape')])
    expect(shapes).toHaveLength(9)
    for (const [pc, shape] of shapes) {
      expect(shape, `pc=${pc}`).toBe(Number(pc) === 0 ? 'square' : 'circle')
    }
    // 方形用直角/微圆角，圆形用 rounded-full —— 形状本身也要落成类名
    const rootBadge = whites.flatMap(badgesOf).find((b) => b.getAttribute('data-note-badge') === '0')!
    const circleBadge = whites.flatMap(badgesOf).find((b) => b.getAttribute('data-note-badge') === '4')!
    expect(rootBadge.className.split(/\s+/)).not.toContain('rounded-full')
    expect(circleBadge.className.split(/\s+/)).toContain('rounded-full')
    unmount()
  })

  it('黑键音也有色标，且落在黑键上（A♯ = pc10）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [58], rootNote: 'A♯', ...musmathProps,
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    expect(blacks.flatMap(badgesOf)).toHaveLength(3) // A♯3/A♯4/A♯5
    expect(whites.flatMap(badgesOf)).toHaveLength(0)
    for (const b of blacks.flatMap(badgesOf)) {
      expect(b.getAttribute('data-note-badge')).toBe('10')
      expect(badgeColor(b)).toBe(hexToRgb(chromaColor(10)))
      expect(b.getAttribute('data-badge-shape')).toBe('square') // 它就是根音
    }
    unmount()
  })

  it('差分护栏：有色标的半音集合必须**恰好等于**高亮的半音集合', () => {
    // 只高亮 pc 0..6 —— 覆盖面最广的两种错法（漏画一个音 / 多画一个音）都会在这里现形
    const pcs = [0, 1, 2, 3, 4, 5, 6]
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: pcs.map((pc) => 60 + pc), rootNote: 'C', ...musmathProps,
      } as never),
    )
    const { whites, blacks } = readKeys(container)
    const badges = [...whites, ...blacks].flatMap(badgesOf)
    // 3 个八度 × 7 个半音
    expect(badges).toHaveLength(21)
    const seen = badges.map((b) => Number(b.getAttribute('data-note-badge')))
    expect([...new Set(seen)].sort((a, b) => a - b)).toEqual(pcs)
    for (const pc of pcs) {
      expect(seen.filter((x) => x === pc), `pc=${pc} 应在 3 个八度各出现一次`).toHaveLength(3)
    }
    for (const b of badges) {
      expect(badgeColor(b)).toBe(hexToRgb(chromaColor(Number(b.getAttribute('data-note-badge')))))
    }
    unmount()
  })

  it('当前步骤的色标带呼吸与描边（classic 的「顶部小圆点」不再出现）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], currentStepNotes: [64], rootNote: 'C', ...musmathProps,
      } as never),
    )
    const { whites } = readKeys(container)
    const badges = whites.flatMap(badgesOf)
    const pulsing = badges.filter((b) => /(^|\s)animate-pulse(\s|$)/.test(b.className))
    expect(pulsing).toHaveLength(3) // E3/E4/E5
    for (const b of pulsing) expect(b.getAttribute('data-note-badge')).toBe('4')
    // classic 的两个顶部装饰圆点（h-1 / h-1.5）在 musmath 皮肤里必须消失
    expect(container.querySelectorAll('.h-1, .h-1\\.5')).toHaveLength(0)
    unmount()
  })

  it('同一个键既是根音又是当前步骤：方形 + 脉冲两个信号都要在（两套皮肤都验）', () => {
    // 练习序列的第 0 步就是根音 —— 这是最常见的组合，两个信号必须独立保留
    const mk = (variant: 'classic' | 'musmath') =>
      render(
        createElement(PianoKeyboard as never, {
          highlightedNotes: [60], currentStepNotes: [60], rootNote: 'C', variant, minOctave: 3, maxOctave: 5,
        } as never),
      )

    const c = mk('classic')
    const cWhite = readKeys(c.container).whites
    const decorated = cWhite.filter((k) => k.querySelectorAll('span.animate-pulse').length > 0)
    expect(decorated, 'C3/C4/C5 三个键才该有脉冲点').toHaveLength(3)
    expect(decorated.every((k) => k.className.split(/\s+/).includes('bg-blue-500'))).toBe(true)
    for (const k of decorated) {
      // 根音锚点圆点（h-1）与当前步骤脉冲点（h-1.5）必须**同时**在 —— 两个信号独立
      expect(k.querySelectorAll('span.h-1')).toHaveLength(1)
      expect(k.querySelectorAll('span.h-1\\.5')).toHaveLength(1)
      expect(k.querySelectorAll('span.animate-pulse')).toHaveLength(1)
    }
    // 非 C 白键一个装饰都没有
    expect(cWhite.filter((k) => k.querySelectorAll('span').length === 0)).toHaveLength(18)
    c.unmount()

    const m = mk('musmath')
    const mBadges = readKeys(m.container).whites.flatMap(badgesOf)
    expect(mBadges).toHaveLength(3)
    for (const b of mBadges) {
      expect(b.getAttribute('data-badge-shape')).toBe('square')
      expect(b.className.split(/\s+/)).toContain('animate-pulse')
    }
    m.unmount()
  })

  it('showLabels=false 时色标仍是色标（形状与颜色是契约），只是不带音名', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64], rootNote: 'C', showLabels: false, ...musmathProps,
      } as never),
    )
    const badges = [...container.querySelectorAll('[data-note-badge]')] as HTMLElement[]
    expect(badges).toHaveLength(6)
    for (const b of badges) {
      expect(b.textContent).toBe('')
      expect(b.style.backgroundColor).toBeTruthy()
    }
    unmount()
  })

  it('非音阶音所在键完全不渲染节点（不留「屏幕上看不见的文字」）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60], rootNote: 'C', ...musmathProps,
      } as never),
    )
    // 整个键盘的文本只应剩 C 的音名（3 个八度），其它音级一个字都不许有
    const texts = [...container.querySelectorAll('span')].map((s) => s.textContent)
    expect(texts).toEqual(['C', 'C', 'C'])
    unmount()
  })
})

describe('全局档位（store）驱动 SimplePianoKeyboard', () => {
  const setStyle = (v: PianoKeyboardStyle) => {
    act(() => {
      useAppStore.setState((s) => ({ user: { ...s.user, pianoKeyboardStyle: v } }))
    })
  }
  afterEach(() => setStyle('classic'))

  it('默认 classic：整键底色高亮，无色标', () => {
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, { rootNote: 'C', highlightedNotes: ['C', 'E', 'G'] } as never),
    )
    const { whites } = readKeys(container)
    expect(container.querySelectorAll('[data-note-badge]')).toHaveLength(0)
    expect(whites.filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c)))).toHaveLength(9)
    unmount()
  })

  it('档位切到 musmath 后同一个组件换成色标画法；切回 classic 又能还原', () => {
    setStyle('musmath')
    const { container, unmount } = render(
      createElement(SimplePianoKeyboard as never, { rootNote: 'C', highlightedNotes: ['C', 'E', 'G'] } as never),
    )
    const { whites } = readKeys(container)
    const badges = whites.flatMap(badgesOf)
    expect(badges).toHaveLength(9)
    expect(badges.filter((b) => b.getAttribute('data-badge-shape') === 'square')).toHaveLength(3) // C × 3 个八度
    expect(whites.filter((k) => HIGHLIGHT_MARKERS.some((c) => k.className.includes(c)))).toHaveLength(0)
    // 生产路径（store 档位 → SimplePianoKeyboard → PianoKeyboard）也要落到深色键面
    expect(whites[0].className.split(/\s+/)).toContain(`bg-[${MUSMATH_DARK_KEY_COLORS.whiteKey}]`)
    // 根音 C 的色标必须是 C 的色谱色（不是 classic 的深蓝）
    expect(badgeColor(badges[0])).toBe(hexToRgb(chromaColor(0)))
    unmount()

    setStyle('classic')
    const second = render(
      createElement(SimplePianoKeyboard as never, { rootNote: 'C', highlightedNotes: ['C', 'E', 'G'] } as never),
    )
    expect(second.container.querySelectorAll('[data-note-badge]')).toHaveLength(0)
    second.unmount()
  })
})

// 键的**形状**（宽/高/黑键比例/圆角/投影）照抄 musmath 原站的类。
// 期望值一律从真相源 `resolveMusmathKeyGeometry` 取，不在测试里手抄数字 ——
// 否则「组件写死一个值、真相源改成另一个值」两边同时错也能绿。
describe('musmath 键的形状', () => {
  const G = resolveMusmathKeyGeometry(W)   // W = 26，与组件用的白键宽同一输入
  const mProps = { variant: 'musmath', minOctave: 3, maxOctave: 5 } as const

  const mountMusmath = () =>
    render(
      createElement(PianoKeyboard as never, {
        highlightedNotes: [60, 64, 67], rootNote: 'C', ...mProps,
      } as never),
    )

  it('白键 = 真相源派生的 26×121（不再是 classic 的 88 高 —— 键要更细长）', () => {
    const { container, unmount } = mountMusmath()
    const { whites } = readKeys(container)
    expect(whites.length).toBeGreaterThan(0)
    for (const k of whites) {
      expect(k.style.width).toBe(`${G.whiteWidth}px`)
      expect(k.style.height).toBe(`${G.whiteHeight}px`)
    }
    // 形状确实变了的硬证据：与 classic 的白键高不同
    expect(G.whiteHeight).not.toBe(WHITE_H)
    unmount()
  })

  it('黑键 = 21×75（原实现 16×56，相对宽度 0.615 → 原站的 0.8）', () => {
    const { container, unmount } = mountMusmath()
    const { blacks } = readKeys(container)
    expect(blacks.length).toBeGreaterThan(0)
    for (const k of blacks) {
      expect(k.style.width).toBe(`${G.blackWidth}px`)
      expect(k.style.height).toBe(`${G.blackHeight}px`)
    }
    expect(G.blackWidth).not.toBe(BW)
    expect(G.blackHeight).not.toBe(BLACK_H)
    // 黑键占白键宽的比例必须真的变宽了（这才是「学形状」的要点）
    expect(G.blackWidth / G.whiteWidth).toBeGreaterThan(BW / W)
    unmount()
  })

  it('换了几何，黑键中心仍必须落在白键交界上（定位公式得跟着新宽走）', () => {
    const { container, unmount } = mountMusmath()
    const { blacks } = readKeys(container)
    for (const b of blacks) {
      const center = parseFloat(b.style.left) + parseFloat(b.style.width) / 2
      const offBy = Math.abs(center - Math.round(center / G.whiteWidth) * G.whiteWidth)
      expect(offBy, `黑键中心 ${center} 偏离 ${G.whiteWidth}px 的整数倍交界 ${offBy}px`).toBeLessThan(0.001)
    }
    unmount()
  })

  it('classic 的尺寸一个都没动（形状只随 musmath 皮肤走）', () => {
    const { container, unmount } = render(
      createElement(PianoKeyboard as never, { highlightedNotes: [60], rootNote: 'C', minOctave: 3, maxOctave: 5 } as never),
    )
    const { whites, blacks } = readKeys(container)
    expect(whites[0].style.width).toBe(`${W}px`)
    expect(whites[0].style.height).toBe(`${WHITE_H}px`)
    expect(blacks[0].style.width).toBe(`${BW}px`)
    expect(blacks[0].style.height).toBe(`${BLACK_H}px`)
    unmount()
  })

  it('圆角/描边/投影三件套照抄原站；classic 的黑键重投影不进 musmath', () => {
    const sunken = 'shadow-[0_2px_4px_rgba(0,0,0,0.35)]'
    const m = mountMusmath()
    const mk = readKeys(m.container)
    for (const [k, who] of [[mk.whites[0], '白键'], [mk.blacks[0], '黑键']] as const) {
      const cls = k.className.split(/\s+/)
      // 原站：`rounded-b-md border border-piano-key-border shadow-md shadow-shadow/10`
      expect(cls, `${who}只有底部两角`).toContain('rounded-b-md')
      expect(cls, `${who}不该四角都圆`).not.toContain('rounded-md')
      expect(cls, `${who}描边`).toContain(`border-[${MUSMATH_DARK_KEY_COLORS.border}]`)
      expect(cls, `${who}用原站同款 shadow-md`).toContain('shadow-md')
      // 投影色 = 原站 `--color-shadow` 取 10%，取 Dark Reader 后的同源深色
      expect(cls, `${who}投影色`).toContain(`shadow-[${MUSMATH_DARK_KEY_COLORS.blackKey}]/10`)
      expect(cls, `${who}不该用 classic 的重投影`).not.toContain(sunken)
    }
    m.unmount()

    const c = render(
      createElement(PianoKeyboard as never, { highlightedNotes: [60], rootNote: 'C', minOctave: 3, maxOctave: 5 } as never),
    )
    const cb = readKeys(c.container).blacks[0].className.split(/\s+/)
    expect(cb, '经典黑键保留原来的浮起投影').toContain(sunken)
    expect(cb, '经典皮肤不该混进 musmath 的 shadow-md').not.toContain('shadow-md')
    c.unmount()
  })
})
