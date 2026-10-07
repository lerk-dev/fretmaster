/**
 * components/practice-fretboard.tsx 的**题目音级**契约测试（补充 `practice-fretboard.test.ts`）。
 *
 * 上面那份测试覆盖了结构（弦数/品数/分隔线）、a11y 标签与「找音练习的弦启用/禁用」，
 * 但没有覆盖指板最核心的一块：**练习进行中把「属于当前题目」的品渲染成音级符号**
 * （不是音名）。这块是整个组件的存在意义 —— 屏幕上看起来一模一样，改错了不会报错，
 * 只会显示成错的音级，学生读到的是错的信息。
 *
 * ⚠️ 探针要点（第一版就踩了）：品 1..n 的文本**恒在 DOM 里**，靠 span 的 `opacity-0`
 * 隐藏 —— 所以不能拿 `textContent` 当「屏幕上显示了什么」，必须看 `opacity-100`。
 * 而**空弦（品 0）压根没有 span**，文本是 button 的直接子节点、永远可见。
 *
 * 四条互斥分支（各自只在自己的 tab + isPlaying 下生效）：
 *  ① chord          → transposedChords[currentChordIndex]        → getNoteDegreeInChord
 *  ② chord_exercise → chordExerciseTargetChord                   → getNoteDegreeInChord
 *  ③ interval       → rootNote（恒 `1`）+ selectedIntervals      → INTERVALS[i].symbol
 *  ④ scale          → scaleKey + selectedScale.notes             → scaleDegreeLabel（共享真相源）
 *
 * 契约：
 *  · 匹配的品显示**音级符号**（经 formatDegree 把 `#`→`♯`、`b`→`♭`）；不匹配的品不显示；
 *  · `isPlaying=false` 时四条分支全部关闭（否则「准备中」就把答案泄给用户）；
 *  · tab 不匹配时其它三条互不干扰；
 *  · 边界：`transposedChords` 下标越界 / `chordExerciseTargetChord=null` /
 *    `selectedIntervals` 为空或含越界索引 / `scaleExerciseSequence` 为空 ⇒ 都不得显示音级。
 *
 * 🚨 **空弦（品 0）与 1..fretCount 品必须同构（2026-09-30 修）**：
 *  · 修前：0 品的渲染写在这个循环**之外**，只写死音名、也没有 opacity 开关 ⇒
 *    ① 正在练 E 大三和弦时，1 弦空弦（就是根音 E）不显示 `1`，而同一根弦的 12 品会；
 *    ② 找音练习默认 `showAllNotes=false`，1 品以上都把音名藏起来，唯独空弦把答案亮着。
 *    配色早就按 0 品传了 ⇒ 当时是「有颜色、没音级」的半途状态，不报错、只是显示错。
 *  · 修后：两处共用 `getCellDisplay(stringIndex, fret)`，0 品也走音级判定 + opacity 开关。
 *    下面「空弦的显示 = 同弦 12 品的显示」是一条**与实现无关**的不变量（同一个音、同一条规则）。
 *  · interval 分支用 `(noteIdx-rootIdx+12)%12` ⇒ 同一音级的高八度算同一个音程（下面有断言）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PracticeFretboard } from '@/components/practice-fretboard'
import { useAppStore } from '@/lib/store'
import { SCALE_MODES, NOTES } from '@/lib/page-theory-data'
import { INSTRUMENT_CONFIG, type InstrumentType } from '@/lib/practice-suggestions'
import { getStringTuning } from '@/lib/string-tuning'
import { resolveFretCellRole, scaleDegreeLabel, SCALE_SEMITONE_DEGREE_FALLBACK, type FretboardRoleContext, type ThreeNpsPreviewKind } from '@/lib/fretboard-cell-role'
import { formatDegree, getNoteAtPosition, getNoteDegreeInChord } from '@/lib/page-theory-functions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const STRING_COUNT = 6
const FRET_COUNT = 12

const t = (k: string) => k
const identity = (n: string) => n

/** 已挂载实例：失败用例会跳过自己的 unmount()，由 afterEach 兜底拆树 */
const mounted: Array<{ unmount: () => void }> = []

function setStore(patch: { activeTab?: string; isPlaying?: boolean } = {}) {
  const state = useAppStore.getState()
  useAppStore.setState({
    activeTab: patch.activeTab ?? 'chord',
    isPlaying: patch.isPlaying ?? true,
    practice: { ...state.practice, fretCount: FRET_COUNT },
    user: { ...state.user, instrument: 'six_string_guitar' },
  })
}

function mount(overrides: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    t,
    formatNoteByAccidentalSetting: identity,
    handleFretClick: vi.fn(),
    getNoteButtonColor: () => '',
    showAllNotes: false, // 只看「题目音级」这一路，避免 showAllNotes 把音名也显示出来
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
    FRET_MARKERS: [3, 5, 7, 9, 12],
    ...overrides,
  }
  act(() => {
    root.render(createElement(PracticeFretboard as never, props as never))
  })

  /** 重新渲染（改 highlightedFrets 等）—— 与 mount 同一份 props 基线 */
  const rerender = (extra: Record<string, unknown>) => {
    act(() => {
      root.render(createElement(PracticeFretboard as never, { ...props, ...extra } as never))
    })
  }

  const allButtons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[]
  /** 第 i 根弦（0 起）的按钮：下标 0 = 空弦，1..FRET_COUNT = 1..FRET_COUNT 品 */
  const stringButtons = (i: number) => allButtons().slice(i * (1 + FRET_COUNT), (i + 1) * (1 + FRET_COUNT))
  /**
   * 一个格子：文本读 span、可见性看 `opacity-100`。
   * ⚠️ **不能拿 `textContent` 当「屏幕上显示了什么」**：品 ≥1 的文本恒在 DOM 里，靠
   * `opacity-0` 隐藏。修前 0 品没有 span（文本是 button 的直接子节点、永远可见），
   * 修后 0 品也有 span 了 —— 这里索性**没有 span 就报错**，免得再退回「用 textContent 断言」。
   */
  const cell = (stringIndex: number, fret: number) => {
    const btn = stringButtons(stringIndex)[fret]
    const span = btn.querySelector('span') as HTMLElement | null
    if (!span) throw new Error(`弦${stringIndex + 1} 品${fret} 没有 span —— 渲染结构变了？`)
    return {
      text: (span.textContent ?? '').trim(),
      visible: span.className.split(/\s+/).includes('opacity-100'),
    }
  }
  /** 屏幕上实际看得见的字（不可见 = 空串） */
  const shown = (stringIndex: number, fret: number) => {
    const c = cell(stringIndex, fret)
    return c.visible ? c.text : ''
  }
  /**
   * 该格的**语义角色**（`data-role`）。
   *
   * 有了它，「两套皮肤对同一格给出同一角色」才在 DOM 上可断言 —— GuitarRun 皮肤落同一个属性。
   * 只比文字是不够的：`muted`（压暗）与 `tone` 的**字完全一样**，只差在 role ⇒
   * 少传一个 prop（例如 `nextThreeNpsCells`）在文字层看不出来，正是它上次静默失效的原因。
   */
  const role = (stringIndex: number, fret: number) =>
    stringButtons(stringIndex)[fret].getAttribute('data-role') ?? ''

  let unmounted = false
  const api = {
    container,
    allButtons,
    stringButtons,
    cell,
    shown,
    role,
    rerender,
    unmount() {
      if (unmounted) return
      unmounted = true
      act(() => root.unmount())
      container.remove()
    },
  }
  mounted.push(api)
  return api
}

beforeEach(() => {
  setStore()
  document.body.innerHTML = ''
})

afterEach(() => {
  // 用例中途断言失败会跳过它自己的 unmount() ⇒ 由这里统一拆树，避免残留 root 污染后续用例
  for (const m of mounted.splice(0)) {
    try { m.unmount() } catch { /* 拆树失败不掩盖真实断言 */ }
  }
  document.body.innerHTML = ''
})

describe('和声进行（chord）：当前和弦的音级', () => {
  const CHORDS = [{ root: 'E', type: 'Major' }]

  it('匹配的品显示音级符号，不匹配的品什么都不显示', () => {
    const p = mount({ transposedChords: CHORDS, currentChordIndex: 0 })
    // E 大三和弦 = E(1) / G♯(3) / B(5)
    expect(p.shown(0, 4)).toBe('3')   // E → G♯
    expect(p.shown(0, 7)).toBe('5')   // E → B
    // F 不在 E 大三和弦里 ⇒ 不显示
    expect(p.shown(0, 1)).toBe('')
    // 但 DOM 里仍留着音名（靠 opacity 隐藏）—— 顺带钉住「不能用 textContent 当可见性」
    expect(p.cell(0, 1).text).toBe('F')
    expect(p.cell(0, 1).visible).toBe(false)
    p.unmount()
  })

  it('用 getNoteDegreeInChord 当 oracle：品 1..n 的可见文本 = 音级或空', () => {
    const p = mount({ transposedChords: CHORDS, currentChordIndex: 0 })
    for (let s = 0; s < STRING_COUNT; s++) {
      for (let f = 1; f <= FRET_COUNT; f++) {
        const note = getNoteAtPosition(s, f)
        const degree = getNoteDegreeInChord(note, 'E', 'Major')
        expect(p.shown(s, f), `弦${s + 1} 品${f} note=${note}`).toBe(
          degree ? formatDegree(degree) : '',
        )
      }
    }
    p.unmount()
  })

  it('空弦（品 0）也标音级 —— E 大三和弦下 1 弦/6 弦空弦都是根音 ⇒ 显示 `1`（修前只显示 `E`）', () => {
    const p = mount({ transposedChords: CHORDS, currentChordIndex: 0 })
    expect(p.shown(0, 0)).toBe('1')  // 1 弦空弦 = E = 根音
    expect(p.shown(5, 0)).toBe('1')  // 6 弦空弦 = E = 根音
    expect(p.shown(1, 0)).toBe('5')  // 2 弦空弦 = B = 五音
    expect(p.shown(2, 0)).toBe('G')  // 3 弦空弦 = G，不在 E 大三和弦里 ⇒ 显音名（弦标签恒显）
    expect(p.shown(3, 0)).toBe('D')  // 4 弦空弦 = D
    expect(p.shown(4, 0)).toBe('A')  // 5 弦空弦 = A
    // 显示的是音级符号而不是音名（音名已不在 span 里了）
    expect(p.cell(0, 0).text).toBe('1')
    expect(p.cell(0, 0).visible).toBe(true)
    p.unmount()
  })

  it('不变量：空弦命中题目 ⇒ 与同弦 12 品显示同一音级；未命中 ⇒ 显示音名（弦标签语义）', () => {
    const configs: Array<{ name: string; tab: string; props: Record<string, unknown> }> = [
      { name: '和声进行', tab: 'chord', props: { transposedChords: CHORDS, currentChordIndex: 0 } },
      { name: '和弦练习', tab: 'chord_exercise', props: { chordExerciseTargetChord: { root: 'E', type: 'Major' } } },
      { name: '音程练习', tab: 'interval', props: { rootNote: 'E', selectedIntervals: [0, 1, 4, 7] } },
      { name: '音阶练习', tab: 'scale', props: { scaleKey: 'E', selectedScale: SCALE_MODES.pentatonic[0], scaleExerciseSequence: ['1'] } },
      { name: '找音练习', tab: 'practice', props: { selectedStrings: [1, 2, 3, 4, 5, 6] } },
    ]
    for (const c of configs) {
      setStore({ activeTab: c.tab, isPlaying: true })
      const p = mount(c.props)
      for (let s = 0; s < STRING_COUNT; s++) {
        // 12 品与空弦是同一个音：它可见 ⇔ 该音在题目内
        if (p.shown(s, 12) !== '') {
          expect(p.shown(s, 0), `${c.name} 弦${s + 1} 空弦命中 ⇒ 与 12 品同音级`).toBe(p.shown(s, 12))
        } else {
          expect(p.shown(s, 0), `${c.name} 弦${s + 1} 空弦未命中 ⇒ 显音名`).toBe(getNoteAtPosition(s, 0))
        }
      }
      p.unmount()
    }
  })

  it('找音练习默认 showAllNotes=false：空弦仍显音名（弦标签），同音的 12 品照旧藏', () => {
    setStore({ activeTab: 'practice' })
    const hidden = mount({ showAllNotes: false, selectedStrings: [1, 2, 3, 4, 5, 6] })
    expect(hidden.cell(0, 0).text).toBe('E')
    expect(hidden.cell(0, 0).visible).toBe(true)   // 弦标签恒显（用户 2026-09-30 口径）
    expect(hidden.shown(0, 0)).toBe('E')
    expect(hidden.shown(0, 12)).toBe('')           // 同音的 12 品仍藏 —— 不泄露「按哪里」
    hidden.unmount()

    const all = mount({ showAllNotes: true, selectedStrings: [1, 2, 3, 4, 5, 6] })
    expect(all.shown(0, 0)).toBe('E')              // 开了「显示全部音符」就照常显示音名
    expect(all.shown(0, 12)).toBe('E')
    all.unmount()
  })

  it('点击反馈：highlightedFrets 命中 ⇒ 该品可见（≥1 品靠反馈显隐；0 品恒显不靠反馈）', () => {
    setStore({ activeTab: 'practice' })
    const p = mount({ showAllNotes: false, selectedStrings: [1, 2, 3, 4, 5, 6] })
    expect(p.shown(0, 0)).toBe('E')  // 弦标签恒显
    p.rerender({ highlightedFrets: new Map([['0-1', true]]) })
    expect(p.shown(0, 1)).toBe('F')  // 反馈让 1 品可见
    expect(p.shown(0, 2)).toBe('')   // 同弦 2 品不受影响
    p.unmount()
  })

  it('isPlaying=false 时不显示音级（空弦照常显音名，音级才是答案）', () => {
    setStore({ activeTab: 'chord', isPlaying: false })
    const p = mount({ transposedChords: CHORDS, currentChordIndex: 0 })
    expect(p.shown(0, 4)).toBe('')   // 本该是 '3'
    expect(p.shown(0, 12)).toBe('')  // 本该是 '1'
    expect(p.shown(0, 0)).toBe('E')  // 弦标签：显音名而非音级 ⇒ 不泄露答案
    expect(p.shown(5, 0)).toBe('E')  // 6 弦空弦亦然
    p.unmount()
  })

  it('currentChordIndex 越界（拿不到当前和弦）时不显示音级', () => {
    const p = mount({ transposedChords: CHORDS, currentChordIndex: 5 })
    expect(p.shown(0, 4)).toBe('')
    p.unmount()
  })

  it('切到别的 tab 时 chord 分支不生效（互不干扰）', () => {
    setStore({ activeTab: 'scale' })
    const p = mount({ transposedChords: CHORDS, currentChordIndex: 0 })
    // scale 分支此刻也没数据（scaleExerciseSequence 为空）⇒ 一律不显示
    expect(p.shown(0, 4)).toBe('')
    p.unmount()
  })
})

describe('和弦练习（chord_exercise）：目标和弦的音级', () => {
  it('有目标和弦时显示音级；null 时不显示', () => {
    setStore({ activeTab: 'chord_exercise' })
    const withTarget = mount({ chordExerciseTargetChord: { root: 'E', type: 'Major' } })
    expect(withTarget.shown(0, 4)).toBe('3')
    expect(withTarget.shown(0, 1)).toBe('')
    withTarget.unmount()

    const noTarget = mount({ chordExerciseTargetChord: null })
    expect(noTarget.shown(0, 4)).toBe('')
    noTarget.unmount()
  })

  it('isPlaying=false 时不显示音级', () => {
    setStore({ activeTab: 'chord_exercise', isPlaying: false })
    const p = mount({ chordExerciseTargetChord: { root: 'E', type: 'Major' } })
    expect(p.shown(0, 4)).toBe('')
    p.unmount()
  })
})

describe('音程练习（interval）：按半音差匹配所选音程', () => {
  it('命中的品显示 INTERVALS 的符号（b2 → ♭2）；根音恒显示 `1`', () => {
    setStore({ activeTab: 'interval' })
    // INTERVALS[1] = { semitones: 1, symbol: 'b2' }
    const p = mount({ rootNote: 'E', selectedIntervals: [1] })
    expect(p.shown(0, 1)).toBe('♭2')  // F = 1 半音
    expect(p.shown(0, 3)).toBe('')    // G = 3 半音
    expect(p.shown(0, 2)).toBe('')    // F♯ = 2 半音
    // 🚨 根音不受 selectedIntervals 影响：配色层（page.tsx 的 getNoteButtonColor）与
    // GuitarRun 皮肤都单独处理根音，只有这里漏了 ⇒ 根音「有颜色、没音级」（蓝格子写着 `E`）。
    expect(p.shown(0, 0)).toBe('1')   // 1 弦空弦 = E = 根音
    expect(p.shown(0, 12)).toBe('1')  // 12 品又是 E
    p.unmount()
  })

  it('半音差按 %12 归一 ⇒ 同一音级的高八度也算命中', () => {
    setStore({ activeTab: 'interval' })
    const p = mount({ rootNote: 'E', selectedIntervals: [0] }) // root 音程
    expect(p.shown(0, 12)).toBe('1')  // 12 品又是 E
    expect(p.shown(0, 0)).toBe('1')   // 空弦也是 E ⇒ 同样命中（修前显示 'E'）
    expect(p.shown(1, 5)).toBe('1')   // B 弦 5 品 = E
    expect(p.shown(2, 9)).toBe('1')   // G 弦 9 品 = E
    expect(p.shown(0, 1)).toBe('')
    p.unmount()
  })

  it('selectedIntervals 为空 / 含越界索引时，非根音的格子不显示音级', () => {
    setStore({ activeTab: 'interval' })
    const empty = mount({ rootNote: 'E', selectedIntervals: [] })
    expect(empty.shown(0, 1)).toBe('')   // F：不是根音、也没被选中 ⇒ 不显示
    expect(empty.shown(0, 0)).toBe('1')  // 根音照常标 `1`（与配色层 / GuitarRun 一致）
    empty.unmount()

    const outOfRange = mount({ rootNote: 'E', selectedIntervals: [9999] })
    expect(outOfRange.shown(0, 1)).toBe('')
    expect(outOfRange.shown(0, 0)).toBe('1')
    outOfRange.unmount()
  })
})

describe('音阶练习（scale）：按调性与音阶成员判定', () => {
  const MAJOR_PENTA = SCALE_MODES.pentatonic[0] // notes: [0,2,4,7,9]（1 2 3 5 6）

  it('音阶内成员显示音级、成员外不显示', () => {
    setStore({ activeTab: 'scale' })
    const p = mount({
      scaleKey: 'E',
      selectedScale: MAJOR_PENTA,
      scaleExerciseSequence: ['1', '2', '3', '5', '6'],
    })
    expect(p.shown(0, 2)).toBe('2')   // F♯ = 2
    expect(p.shown(0, 4)).toBe('3')   // G♯ = 4
    expect(p.shown(0, 7)).toBe('5')   // B  = 7
    expect(p.shown(0, 9)).toBe('6')   // C♯ = 9
    expect(p.shown(0, 1)).toBe('')    // F  = 1 ⇒ 不在五声音阶内
    p.unmount()
  })

  it('序列为空（没开始）时不显示音级；isPlaying=false 亦不显示', () => {
    setStore({ activeTab: 'scale' })
    const noSeq = mount({ scaleKey: 'E', selectedScale: MAJOR_PENTA, scaleExerciseSequence: [] })
    expect(noSeq.shown(0, 2)).toBe('')
    noSeq.unmount()

    setStore({ activeTab: 'scale', isPlaying: false })
    const notPlaying = mount({ scaleKey: 'E', selectedScale: MAJOR_PENTA, scaleExerciseSequence: ['1'] })
    expect(notPlaying.shown(0, 2)).toBe('')
    notPlaying.unmount()
  })

  it('音级符号里的 # / b 经 formatDegree 转成 ♯ / ♭', () => {
    setStore({ activeTab: 'scale' })
    // 多里安 = 1 2 b3 4 5 6 b7；E 调下 G = 3 半音 → b3
    const dorian = SCALE_MODES.majorScaleModes[1]
    const p = mount({ scaleKey: 'E', selectedScale: dorian, scaleExerciseSequence: ['1'] })
    expect(p.shown(0, 3)).toBe('♭3')
    expect(p.shown(0, 10)).toBe('♭7')  // D = 10 半音
    p.unmount()
  })
})

/**
 * 🚨 **两套皮肤一致性护栏**（2026-10-01）。
 *
 * `lib/fretboard-cell-role.ts` 的 `resolveFretCellRole` 声明自己是「指板格子语义的唯一真相源」，
 * GuitarRun 皮肤直接用它。经典皮肤（本组件）原本**自带第二份实现**（`getCellDisplay`），
 * 两份已经分叉：
 *   · **音阶分支**：经典皮肤用一张**手写**的「半音 → 音级」表，GuitarRun 用音阶自带的
 *     `intervals[i] ↔ notes[i]` 对齐表。穷举 76 个音阶 × 每个音（532 对）实测：
 *     **53 对 / 29 个音阶**上手写表给的是**错标签** —— Phrygian 的 ♭2 写成 `b9`、
 *     Altered 的 #2 写成 `b3`、Locrian 的 b5 写成 `#4`、Lydian Augmented 的 #5 写成 `b6`…
 *   · **音程分支**：经典皮肤只按 `selectedIntervals` 判，漏了「根音单独成 `1`」这一层
 *     （而它自己的**配色**层和 GuitarRun 都有这一层 ⇒ 蓝格子写着 `E`）。
 * 两条都「不报错、只教错」，且都是「同一条规则有两份实现、其中一份漏一层」。
 *
 * 下面这两条用例**不重抄任何判定规则**，只断言「经典皮肤渲染出来的东西 == 共享真相源给出的东西」：
 * 判据取 `resolveFretCellRole(ctx, s, f)` 的 `degree`（有则显示音级）与 `showText`（无音级时是否显音名）。
 * 换掉任一份实现、或让任何一边漏一层，这里立刻红。
 */
describe('经典皮肤与共享真相源（GuitarRun 用的 resolveFretCellRole）必须给出同一结论', () => {
  /** 从组件 props 直接映射过来的上下文（与 GuitarRunFretboard 的映射同义） */
  const baseCtx = (overrides: Partial<FretboardRoleContext>): FretboardRoleContext => ({
    activeTab: 'scale',
    isPlaying: true,
    showAllNotes: false,
    highlightedFrets: new Map<string, boolean>(),
    fretZoneEnabled: false,
    fretZoneStart: 1,
    fretZoneSize: 5,
    fretCount: FRET_COUNT,
    rootNote: 'E',
    selectedIntervals: [],
    scaleKey: 'E',
    selectedScale: SCALE_MODES.pentatonic[0],
    scaleExerciseSequence: ['1'],
    ...overrides,
  })

  /** 共享真相源的结论 → 屏幕上应该看到的字（可见时） */
  const expectedShown = (ctx: FretboardRoleContext, s: number, f: number): string => {
    const r = resolveFretCellRole(ctx, s, f)
    if (r.degree !== '') return formatDegree(r.degree)
    return r.showText ? identity(r.note) : ''
  }

  const ALL_SCALES = Object.values(SCALE_MODES).flat()

  /**
   * 一弦三音「下一把位预览」：经典皮肤必须**真的把提示画出来**。
   *
   * 修前这条提示一次都没显示过（两套皮肤都没有，详见 `lib/fretboard-cell-role.ts` ②）。
   * 文字层这一侧的契约：预览格的音级照常可见（配色由
   * `__tests__/fretboard-note-button-color.test.ts` ⑦ 负责 —— 两边必须都做，
   * 只做一半就是「有颜色没音级」或「有音级看不出是预览」）。
   */
  it('一弦三音：下一把位预览格照常显示音级（文字层这一半）', () => {
    const preview = new Map<string, ThreeNpsPreviewKind>([
      ['0-8', 'note'],
      ['0-10', 'root'],
      ['0-12', 'start'],
    ])
    setStore({ activeTab: 'scale', isPlaying: true })
    const props = {
      scaleKey: 'C',
      selectedScale: SCALE_MODES.basic[0],
      scaleExerciseSequence: ['1'],
      threeNpsTarget: null, // 当前把位已跑完 ⇒ 预览生效
      threeNpsCellKeys: new Map<string, unknown>(),
      nextThreeNpsCells: preview,
    }
    const ctx = baseCtx({ activeTab: 'scale', isPlaying: true, ...props })
    const p = mount(props)

    const expectedRole: Record<ThreeNpsPreviewKind, string> = {
      note: 'preview',
      root: 'previewRoot',
      start: 'previewStart',
    }
    for (const [key, kind] of preview) {
      const [s, f] = key.split('-').map(Number)
      expect(resolveFretCellRole(ctx, s, f).role, `${key}(${kind}) 的角色`).toBe(expectedRole[kind])
      // 🚨 必须对拍 **role** 而不是只对拍文字：`muted`（把位外压暗）与 `tone` 显示的字完全一样，
      //    所以「少传 nextThreeNpsCells」在文字层看不出来（首轮变异 M4 就是这样 ZERO 的）。
      expect(p.role(s, f), `${key} 经典皮肤的 role = 真相源的结论`).toBe(expectedRole[kind])
      const shown = p.shown(s, f)
      expect(shown, `${key} 预览格必须看得见音级`).not.toBe('')
      expect(shown, `${key} 经典皮肤的字 = 真相源的结论`).toBe(expectedShown(ctx, s, f))
    }
    // 对照：同一个 props 但**不传**预览表 ⇒ role 立刻退回非预览档
    //（证明上面的 preview 角色确实来自这条接线，不是碰巧算出来的）
    p.unmount()
    const noPreview = mount({ ...props, nextThreeNpsCells: undefined })
    for (const key of preview.keys()) {
      const [s, f] = key.split('-').map(Number)
      expect(noPreview.role(s, f), `${key} 不传预览表就不该是 preview*`).not.toMatch(/^preview/)
    }
    noPreview.unmount()
  })

  it('接线护栏：page.tsx 必须把预览表给到**每一个**消费方（漏一处就静默失效）', () => {
    // 这一条是被打脸的教训：2026-10-01 之前「下一把位预览」在两套皮肤下都不显示，
    // 一半原因是消费侧判定写反（见上一节），另一半正是**经典皮肤根本没接这个 prop** ——
    // 而当时所有测试都是绿的。组件级单测盯不到「巨石里有没有把 prop 传下去」，
    // 只有源码接线断言能盯住。
    const src = readFileSync('app/page.tsx', 'utf8')
    const wiring = src.match(/nextThreeNpsCells=\{nextThreeNpsCells\}/g) ?? []
    // 三个指板消费方：GuitarRun 皮肤 / 经典皮肤 / 全屏覆盖层
    expect(wiring.length, '每个指板渲染入口都要拿到预览表').toBeGreaterThanOrEqual(3)
    // 经典皮肤的**配色层**走 page.tsx 的 getNoteButtonColor 闭包，它也必须拿到
    expect(src).toMatch(/threeNpsTarget, threeNpsCellKeys, nextThreeNpsCells,/)
  })

  it('音阶练习：全部 76 个音阶 × 全部格子，经典皮肤 = resolveFretCellRole', () => {
    setStore({ activeTab: 'scale' })
    // 音阶库扩容/改名时回来看一眼：下面的 covers 断言会跟着失效，逼你确认护栏还在测东西
    expect(ALL_SCALES.length).toBe(76)

    let cells = 0
    let degreeCells = 0
    const wrong: string[] = []

    for (const scale of ALL_SCALES) {
      const ctx = baseCtx({ selectedScale: scale })
      const p = mount({ scaleKey: 'E', selectedScale: scale, scaleExerciseSequence: ['1'] })
      for (let s = 0; s < STRING_COUNT; s++) {
        for (let f = 0; f <= FRET_COUNT; f++) {
          const expected = expectedShown(ctx, s, f)
          const actual = p.shown(s, f)
          cells++
          if (resolveFretCellRole(ctx, s, f).degree !== '') degreeCells++
          if (actual !== expected) {
            wrong.push(`${scale.name} 弦${s + 1} 品${f}: 经典='${actual}' 真相源='${expected}'`)
          }
          // 角色也要逐格对拍 —— 只比文字抓不到「少传 prop ⇒ role 悄悄退化成 muted/tone」
          if (p.role(s, f) !== resolveFretCellRole(ctx, s, f).role) {
            wrong.push(
              `${scale.name} 弦${s + 1} 品${f}: 经典 role='${p.role(s, f)}' 真相源='${resolveFretCellRole(ctx, s, f).role}'`,
            )
          }
        }
      }
      p.unmount()
    }

    expect(wrong.slice(0, 8)).toEqual([])
    expect(cells).toBe(76 * 6 * (FRET_COUNT + 1))
    // 探针自检：真的在比对音级，不是两边全空导致的「假通过」
    expect(degreeCells).toBeGreaterThan(1500)
  }, 60000)

  it('共享真相源必须取**音阶自带**的对齐表，而不是手写兜底表（穷举 76 音阶 × 532 对）', () => {
    let pairs = 0
    let differentFromFallback = 0
    for (const scale of ALL_SCALES) {
      const intervals = scale.intervals as string[]
      for (let k = 0; k < scale.notes.length; k++) {
        const interval = ((scale.notes[k] % 12) + 12) % 12
        pairs++
        if (SCALE_SEMITONE_DEGREE_FALLBACK[interval] !== intervals[k]) differentFromFallback++
        expect(
          scaleDegreeLabel(scale, interval),
          `${scale.name} 半音${interval} 取了错标签（应取音阶自带的 '${intervals[k]}'，而不是手写兜底表）`,
        ).toBe(intervals[k])
      }
    }
    expect(pairs).toBe(532)
    // 🚨 证据：手写兜底表在 **53 对 / 29 个音阶**上与音阶自带标签不同 ⇒「优先自带表」不是可有可无的偏好。
    // 这条同时是「把 scaleDegreeLabel 改成只用兜底表」这类改动的护栏 —— 上一条差分用例抓不到它
    // （两边会同向变错、仍然相等），只有这里对**音阶数据本身**做断言才咬得住。
    expect(differentFromFallback).toBe(53)
  })

  it('全部 tab × isPlaying 两态：经典皮肤屏幕上的字 = resolveFretCellRole 的结论', () => {
    // 这是**跨皮肤护栏**：GuitarRun 皮肤直接调 resolveFretCellRole 渲染，经典皮肤走
    // getCellDisplay。两者对「这一格该显示什么」必须逐字一致，否则换个皮肤结果就变。
    // 重点是两态都跑：「没开始练习」曾经是唯一的分叉点（经典皮肤有 isPlaying 门禁、
    // 而真相源照抄了颜色函数那份没有 ⇒ GuitarRun 会亮、经典皮肤不亮）。
    const cases: Array<{
      tab: string
      props: Record<string, unknown>
      chordTarget?: FretboardRoleContext['chordTarget']
    }> = [
      {
        tab: 'practice',
        props: {
          showAllNotes: true,
          targetNote: 'C',
          practiceAnswerMode: 'buttons',
          selectedStrings: [1, 2, 3, 4, 5, 6],
        },
      },
      {
        tab: 'chord',
        props: {
          transposedChords: [{ root: 'C', type: 'Major' }],
          currentChordIndex: 0,
        },
        chordTarget: { root: 'C', type: 'Major' },
      },
      {
        tab: 'chord_exercise',
        props: { chordExerciseTargetChord: { root: 'C', type: 'Major' } },
        chordTarget: { root: 'C', type: 'Major' },
      },
      {
        tab: 'interval',
        props: { rootNote: 'C', selectedIntervals: [0, 4, 7] },
      },
      {
        tab: 'scale',
        props: {
          scaleKey: 'C',
          selectedScale: SCALE_MODES.basic[0],
          scaleExerciseSequence: ['1'],
        },
      },
    ]

    const wrong: string[] = []
    let degreeCells = 0
    let cells = 0

    for (const c of cases) {
      for (const isPlaying of [true, false]) {
        setStore({ activeTab: c.tab, isPlaying })
        const ctx = baseCtx({
          activeTab: c.tab,
          isPlaying,
          chordTarget: c.chordTarget ?? null,
          ...c.props,
        })
        const p = mount(c.props)
        for (let s = 0; s < STRING_COUNT; s++) {
          for (let f = 0; f <= FRET_COUNT; f++) {
            const expected = expectedShown(ctx, s, f)
            const actual = p.shown(s, f)
            cells++
            if (resolveFretCellRole(ctx, s, f).degree !== '') degreeCells++
            if (actual !== expected) {
              wrong.push(
                `${c.tab} isPlaying=${isPlaying} 弦${s + 1} 品${f}: 经典='${actual}' 真相源='${expected}'`,
              )
            }
            if (p.role(s, f) !== resolveFretCellRole(ctx, s, f).role) {
              wrong.push(
                `${c.tab} isPlaying=${isPlaying} 弦${s + 1} 品${f}: 经典 role='${p.role(s, f)}' 真相源='${resolveFretCellRole(ctx, s, f).role}'`,
              )
            }
          }
        }
        p.unmount()
      }
    }

    expect(wrong.slice(0, 8)).toEqual([])
    expect(cells).toBe(cases.length * 2 * STRING_COUNT * (FRET_COUNT + 1))
    // 探针自检：真的在比对音级，不是两边全空导致的「假通过」
    expect(degreeCells).toBeGreaterThan(0)
  }, 60000)

  it('音程练习：根音恒 `1`，选中音程按符号显示 —— 与真相源逐格相同', () => {
    setStore({ activeTab: 'interval' })
    const wrong: string[] = []
    let degreeCells = 0

    for (const rootNote of ['E', 'B♭', 'F♯']) {
      for (const selectedIntervals of [[], [1], [0, 4, 7], [3, 6, 11]]) {
        const ctx = baseCtx({ activeTab: 'interval', rootNote, selectedIntervals })
        const p = mount({ rootNote, selectedIntervals })
        for (let s = 0; s < STRING_COUNT; s++) {
          for (let f = 0; f <= FRET_COUNT; f++) {
            const expected = expectedShown(ctx, s, f)
            const actual = p.shown(s, f)
            if (resolveFretCellRole(ctx, s, f).degree !== '') degreeCells++
            if (actual !== expected) {
              wrong.push(
                `root=${rootNote} 选中=[${selectedIntervals}] 弦${s + 1} 品${f}: 经典='${actual}' 真相源='${expected}'`,
              )
            }
          }
        }
        p.unmount()
      }
    }

    expect(wrong.slice(0, 8)).toEqual([])
    expect(degreeCells).toBeGreaterThan(0) // 探针自检
  }, 60000)
})

describe('乐器自洽：分隔线、行数、音名必须同源（2026-10-01 修）', () => {
  const INSTRUMENTS = Object.keys(INSTRUMENT_CONFIG) as InstrumentType[]
  const separatorsOf = (p: ReturnType<typeof mount>) =>
    p.container.querySelectorAll('div.pointer-events-none').length

  it('未知乐器名回退到六弦吉他（不崩、弦数按 6 算）', () => {
    const state = useAppStore.getState()
    useAppStore.setState({ user: { ...state.user, instrument: 'ukulele' as never } })
    const p = mount()
    expect(separatorsOf(p)).toBe(STRING_COUNT - 1)
    expect(p.allButtons().length).toBe(STRING_COUNT * (1 + FRET_COUNT))
    p.unmount()
  })

  it('不变量：每个乐器的 stringCount 都等于调弦长度（否则「取哪个」必然分叉）', () => {
    for (const name of INSTRUMENTS) {
      expect(INSTRUMENT_CONFIG[name].tuning.length, name).toBe(INSTRUMENT_CONFIG[name].stringCount)
    }
    expect(INSTRUMENTS.length).toBeGreaterThan(5) // 防止枚举被写空
  })

  /**
   * 修前的缝隙（这就是断言要咬住的东西）：
   *  · 分隔线数取 `INSTRUMENT_CONFIG[x].stringCount`、**行数与音名却取模块级全局**
   *    `lib/string-tuning.ts`（由 `app/page.tsx` 渲染期写入）。
   *  · 真实页面恰好把两边对齐 ⇒ 肉眼看不出；单独挂载组件时四弦贝斯会画成
   *    「3 条分隔线 + 6 行、音名还是标准吉他 E B G D A E」（应当是 3 条 + 4 行 G D A E）。
   *
   * 下面刻意**不同步**全局调弦（beforeEach 已把它复位成六弦标准）—— 这正是修前被掩盖的那一步，
   * `__tests__/guitarrun-fretboard.test.ts` 曾经靠手动 `setStringTuning` 掩盖过。
   */
  it.each(INSTRUMENTS)('%s：分隔线 = 行数 - 1，行音名 = 该乐器调弦', (instrument) => {
    const cfg = INSTRUMENT_CONFIG[instrument]
    const globalBefore = getStringTuning()
    useAppStore.setState({ user: { ...useAppStore.getState().user, instrument } })
    const p = mount()

    const rows = p.allButtons().length / (1 + FRET_COUNT)
    expect(rows, `${instrument} 行数`).toBe(cfg.tuning.length)
    expect(separatorsOf(p), `${instrument} 分隔线（应为行数 - 1）`).toBe(rows - 1)
    for (let s = 0; s < rows; s++) {
      expect(p.shown(s, 0), `${instrument} 第 ${s + 1} 弦空弦音名`).toBe(NOTES[cfg.tuning[s]])
    }
    expect(getStringTuning(), '组件不该顺手改写全局调弦').toEqual(globalBefore)
    p.unmount()
  })
})

describe('找音练习（practice）', () => {
  it('practice tab 下即使 isPlaying 也不显示音级', () => {
    setStore({ activeTab: 'practice' })
    const p = mount({ selectedStrings: [1, 2, 3, 4, 5, 6], transposedChords: [{ root: 'E', type: 'Major' }] })
    expect(p.shown(0, 4)).toBe('')
    p.unmount()
  })

  /**
   * 🚨 辨音模式（按钮答题）：目标格**只亮位置、不写音名**。
   *
   * 缝隙证明：修前 `resolveBaseRole` 给目标格 `result('target')`（`showText` 默认 `true`），
   * 经典皮肤把 `showText` 翻成 `opacity-100` ⇒ 那块亮着的格子上直接写着答案音名。
   * 这里**同时**钉 role 与屏幕可见性：只钉 role 抓不到文字层，只钉文字抓不到配色层。
   */
  it('辨音模式：目标格 role=target，但屏幕上**看不见字**', () => {
    setStore({ activeTab: 'practice', isPlaying: true })
    const p = mount({
      practiceAnswerMode: 'buttons',
      highlightedTargetPosition: { stringIndex: 2, fret: 3 },
      selectedStrings: [1, 2, 3, 4, 5, 6],
    })
    expect(p.role(2, 3)).toBe('target')
    expect(p.shown(2, 3)).toBe('') // 屏幕上没有字（`shown` 走 opacity-100 判定，不看 textContent）
    expect(p.cell(2, 3).visible).toBe(false)
    // 对照：非目标格本来就没字 ⇒ 上面那格「空」不是因为整块指板都没字
    expect(p.role(0, 1)).toBe('none')
    expect(p.shown(0, 1)).toBe('')
    p.unmount()
  })

  it('辨音模式：**空弦目标**（品 0）也不写字；同列的非目标空弦仍是弦标签', () => {
    setStore({ activeTab: 'practice', isPlaying: true })
    const p = mount({
      practiceAnswerMode: 'buttons',
      highlightedTargetPosition: { stringIndex: 0, fret: 0 },
      selectedStrings: [1, 2, 3, 4, 5, 6],
    })
    expect(p.role(0, 0)).toBe('target')
    expect(p.shown(0, 0)).toBe('')
    // 「空弦列恒显音名」是既有契约（用户曾反馈「空弦音都不显示了」）—— 这里必须**只**藏目标格
    expect(p.shown(1, 0)).not.toBe('')
    p.unmount()
  })
})
