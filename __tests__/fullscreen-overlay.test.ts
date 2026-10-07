/**
 * components/fullscreen-overlay.tsx 的契约测试（此前零测试）。
 *
 * 全屏练习覆盖层：按 store 的 activeTab + isPlaying 显示不同内容（找音/和弦/
 * 和弦练习/音阶/音程），带「下一题预览」和可交互指板；点击任意处或
 * Esc/Enter/Space 退出全屏（内层 stopPropagation 防止误退）。
 *
 * 契约重点：
 *  ① 退出：点外层 → setFullscreenMode(false)；Esc/Enter/Space 同样；其它键不退出；
 *     点内层内容区不退出（stopPropagation）；
 *  ② 按 tab 只渲染对应内容：practice（分 fretboard/buttons 两种答题模式）、
 *     chord、chord_exercise、scale、interval —— 且都要求 isPlaying；
 *  ③ 指板显隐由「当前 tab 对应的 showXxxFretboard」决定；
 *  ④ **指板按钮的 aria-label 走 i18n**（2026-09-28 修的同类真 bug：
 *     原先模板字符串硬编码「弦/品」，英文界面下读屏仍念中文）；
 *  ⑤ 下一题预览用 t('next_chord') 作标题。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { FullscreenOverlay } from '@/components/fullscreen-overlay'
import { PracticeFretboard } from '@/components/practice-fretboard'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import { SCALE_MODES } from '@/lib/page-theory-data'
import { getNoteAtPosition, formatDegree } from '@/lib/page-theory-functions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k

const CJK = /[\u4e00-\u9fff]/
const FRET_MARKERS = [3, 5, 7, 9, 12, 15]

function setStore(patch: { activeTab?: string; isPlaying?: boolean; fretCount?: number } = {}) {
  const state = useAppStore.getState()
  useAppStore.setState({
    activeTab: patch.activeTab ?? 'practice',
    isPlaying: patch.isPlaying ?? true,
    practice: { ...state.practice, fretCount: patch.fretCount ?? 15 },
    user: { ...state.user, instrument: 'six_string_guitar' },
  })
}

function mount(overrides: Record<string, unknown> = {}) {
  const setFullscreenMode = vi.fn()
  const handleFretClick = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    t: tZh,
    setFullscreenMode,
    formatNoteByAccidentalSetting: (n: string) => n,
    targetNote: 'E',
    practiceAnswerMode: 'fretboard' as const,
    currentPracticeSuggestion: '',
    selectedStrings: [] as number[],
    showAllNotes: true,
    highlightedFrets: new Map<string, boolean>(),
    currentChordIndex: 0,
    practiceLevel: 'single_chord_tones_root',
    transposedChords: [{ root: 'C', type: 'Major' }],
    getCurrentChordDisplay: () => 'C',
    getNextChordDisplay: () => null,
    getLevelOptions: () => ({}),
    chordExerciseTargetChord: null,
    chordExerciseSequence: [] as string[],
    chordExerciseCurrentStep: 0,
    nextChordExerciseInfo: null,
    scaleExerciseSequence: [] as string[],
    scaleExerciseCurrentStep: 0,
    scaleKey: 'E',
    selectedScale: SCALE_MODES.pentatonic[0],
    nextScaleExerciseInfo: null,
    currentIntervalExercise: null,
    showFretboard: false,
    showIntervalFretboard: false,
    showChordFretboard: false,
    showChordExerciseFretboard: false,
    showScaleFretboard: false,
    handleFretClick,
    getNoteButtonColor: () => '',
    FRET_MARKERS,
    ...overrides,
  }
  act(() => { root.render(createElement(FullscreenOverlay as never, props as never)) })

  const outer = () => container.firstElementChild as HTMLElement | null
  const inner = () => outer()?.firstElementChild as HTMLElement | null
  const fire = (el: HTMLElement | null, type: 'click' | 'keydown', key?: string) => {
    act(() => {
      el?.dispatchEvent(
        type === 'click'
          ? new MouseEvent('click', { bubbles: true, cancelable: true })
          : new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      )
    })
  }
  const buttons = () => [...(container.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
  /** 一个格子的 span：文本 + 是否真的可见（`opacity-100`） */
  const cellSpan = (index: number) => {
    const span = buttons()[index].querySelector('span') as HTMLElement | null
    if (!span) throw new Error(`第 ${index} 个指板按钮没有 span —— 渲染结构变了？`)
    return { text: (span.textContent ?? '').trim(), visible: span.className.split(/\s+/).includes('opacity-100') }
  }

  let unmounted = false
  const api = {
    container,
    outer,
    inner,
    setFullscreenMode,
    handleFretClick,
    buttons,
    cellSpan,
    click: (el: HTMLElement | null) => fire(el, 'click'),
    press: (el: HTMLElement | null, key: string) => fire(el, 'keydown', key),
    text: () => container.textContent ?? '',
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

/** 已挂载实例：用例中途断言失败会跳过自己的 unmount()，由 afterEach 兜底拆树 */
const mounted: Array<{ unmount: () => void }> = []

beforeEach(() => {
  setStore()
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const m of mounted.splice(0)) {
    try { m.unmount() } catch { /* 拆树失败不掩盖真实断言 */ }
  }
  document.body.innerHTML = ''
})

describe('退出全屏', () => {
  it('外层是 role=button，aria-label 走 i18n，点击即退出', () => {
    const p = mount()
    expect(p.outer()!.getAttribute('role')).toBe('button')
    expect(p.outer()!.getAttribute('aria-label')).toBe(tZh('fullscreen_exit_hint'))
    p.click(p.outer())
    expect(p.setFullscreenMode).toHaveBeenCalledWith(false)
    p.unmount()
  })

  it('Esc / Enter / Space 退出，其它键不触发', () => {
    const p = mount()
    p.press(p.outer(), 'Escape')
    p.press(p.outer(), 'Enter')
    p.press(p.outer(), ' ')
    expect(p.setFullscreenMode).toHaveBeenCalledTimes(3)
    p.press(p.outer(), 'a')
    p.press(p.outer(), 'ArrowUp')
    expect(p.setFullscreenMode).toHaveBeenCalledTimes(3)
    p.unmount()
  })

  it('点内层内容区不退出（stopPropagation）', () => {
    const p = mount()
    p.click(p.inner())
    expect(p.setFullscreenMode).not.toHaveBeenCalled()
    p.unmount()
  })

  it('底部提示文字走 i18n', () => {
    const p = mount()
    expect(p.text()).toContain(tZh('click_to_exit_fullscreen'))
    p.unmount()
  })
})

describe('按 tab 渲染对应内容', () => {
  it('找音练习（fretboard 模式）显示目标音 + 标签；非 playing 不显示', () => {
    const p = mount({ practiceAnswerMode: 'fretboard', targetNote: 'E' })
    expect(p.text()).toContain('E')
    expect(p.text()).toContain(tZh('target_note'))
    p.unmount()

    setStore({ isPlaying: false })
    const q = mount({ practiceAnswerMode: 'fretboard' })
    expect(q.text()).not.toContain(tZh('target_note'))
    q.unmount()
  })

  it('找音练习（buttons 模式）改为显示「目标音」标题 + 说明', () => {
    const p = mount({ practiceAnswerMode: 'buttons' })
    expect(p.text()).toContain(tZh('target_note'))
    expect(p.text()).toContain(tZh('practice_mode_description_identify'))
    p.unmount()
  })

  it('练习建议存在时才渲染建议块', () => {
    const p = mount({ currentPracticeSuggestion: '慢速分解和弦' })
    expect(p.text()).toContain(tZh('practice_suggestion_title'))
    p.unmount()
    const q = mount({ currentPracticeSuggestion: '' })
    expect(q.text()).not.toContain(tZh('practice_suggestion_title'))
    q.unmount()
  })

  it('和弦进行：显示当前和弦名 + 音级 + 下一题预览', () => {
    setStore({ activeTab: 'chord' })
    const p = mount({
      getCurrentChordDisplay: () => 'C',
      getNextChordDisplay: () => ({ index: 1, root: 'F', type: 'Major', degrees: ['1', '3', '5'] }),
    })
    expect(p.text()).toContain('C')
    expect(p.text()).toContain(tZh('next_chord'))
    expect(p.text()).toContain('F')
    p.unmount()
  })

  it('和弦练习：显示目标和弦与音级序列，当前步与已过步样式不同', () => {
    setStore({ activeTab: 'chord_exercise' })
    const p = mount({
      chordExerciseTargetChord: { root: 'D', type: 'Minor' },
      chordExerciseSequence: ['1', 'b3', '5'],
      chordExerciseCurrentStep: 1,
    })
    const seq = ['1', 'b3', '5'].map(formatDegree) // formatDegree 会把 b/# 转成 ♭/♯
    const spans = [...p.container.querySelectorAll('span')].filter((s) => seq.includes(s.textContent ?? ''))
    expect(spans.map((s) => s.textContent)).toEqual(seq)
    expect(spans[1].className).toContain('text-primary') // 当前步
    expect(spans[0].className).toContain('opacity-30') // 已过步
    p.unmount()
  })

  it('音阶练习：显示调性 + 音阶名 + 序列；空序列不渲染', () => {
    setStore({ activeTab: 'scale' })
    const p = mount({ scaleKey: 'E', scaleExerciseSequence: ['1', '2', '3'] })
    expect(p.text()).toContain('E')
    expect(p.text()).toContain('1')
    p.unmount()

    const q = mount({ scaleExerciseSequence: [] })
    expect(q.text()).not.toContain('2')
    q.unmount()
  })

  it('音程练习：已完成音程加删除线', () => {
    setStore({ activeTab: 'interval' })
    const p = mount({
      currentIntervalExercise: {
        rootNote: 'E',
        interval: { name: 'Major Third', symbol: '3', semitones: 4 },
        targetNote: 'G♯',
        allIntervals: [],
        currentIntervalDisplay: '3 5',
        completedIntervals: [0],
        answered: false,
      },
    })
    const spans = [...p.container.querySelectorAll('span')].filter((s) =>
      ['3', '5'].includes(s.textContent ?? ''),
    )
    expect(spans[0].className).toContain('line-through')
    expect(spans[1].className).not.toContain('line-through')
    p.unmount()
  })
})

describe('全屏指板', () => {
  it('显隐由当前 tab 对应的 showXxxFretboard 决定', () => {
    const p = mount({ showFretboard: false })
    expect(p.buttons().length).toBe(0)
    p.unmount()

    const q = mount({ showFretboard: true })
    expect(q.buttons().length).toBe(6 * (1 + 15))
    q.unmount()

    // interval tab 看 showIntervalFretboard（不看 showFretboard）
    setStore({ activeTab: 'interval' })
    const r = mount({
      showFretboard: true,
      showIntervalFretboard: false,
      currentIntervalExercise: {
        rootNote: 'E',
        interval: { name: 'Major Third', symbol: '3', semitones: 4 },
        targetNote: 'G♯',
        allIntervals: [],
        currentIntervalDisplay: '3',
        completedIntervals: [],
        answered: false,
      },
    })
    expect(r.buttons().length).toBe(0)
    r.unmount()
  })

  it('乐器自洽：弦数、分隔线、音名都跟乐器配置走（四弦贝斯 G D A E）', () => {
    // 修前：分隔线取 `INSTRUMENT_CONFIG[x].stringCount`、行数与音名取模块级全局
    // `lib/string-tuning.ts` ⇒ 单独挂载时四弦贝斯会画成「3 条分隔线 + 6 行标准吉他」。
    // 真实页面靠 app/page.tsx 渲染期写全局掩盖了这个缝隙，所以这条只能靠单独挂载来咬。
    const state = useAppStore.getState()
    useAppStore.setState({ user: { ...state.user, instrument: 'four_string_bass' } })
    // ⚠️ 本组件有**三个**算音名的调用点，必须逐个覆盖（首轮变异只改了第一个而没被咬住）：
    //   ① 空弦 aria-label  ② 交给配色函数 getNoteButtonColor 的音名  ③ 格子里显示的字
    const colored: Array<{ note: string; s: number; f: number }> = []
    const p = mount({
      showFretboard: true,
      selectedStrings: [1, 2, 3, 4], // 找音练习下不选中的弦不给 aria-label
      getNoteButtonColor: (note: string, s: number, f: number) => {
        colored.push({ note, s, f })
        return ''
      },
    })
    expect(p.buttons().length, '四弦 × (1 空弦 + 15 品)').toBe(4 * (1 + 15))
    expect(p.container.querySelectorAll('div.pointer-events-none').length, '分隔线 = 弦数 - 1').toBe(3)

    // ③ 格子里的字（空弦）
    expect(p.cellSpan(0).text).toBe('G')
    expect(p.cellSpan(3 * 16).text).toBe('E')
    // ① aria-label（另一个 getNoteAtPosition 调用点）
    const openLabels = p
      .buttons()
      .filter((_, i) => i % 16 === 0)
      .map((b) => b.getAttribute('aria-label'))
    expect(openLabels).toEqual(['G 1弦 0品', 'D 2弦 0品', 'A 3弦 0品', 'E 4弦 0品'])
    // ② 交给配色函数的音名（第三个调用点）
    expect(colored.filter((c) => c.f === 0).map((c) => c.note)).toEqual(['G', 'D', 'A', 'E'])
    // ④ 1..n 品也走调弦（`note = getNoteAtPosition(s, actualFret, tuning)` 是**另一个**调用点，
    //    只断言空弦是咬不住它的 —— 首轮变异就栽在这里）
    expect(p.cellSpan(1).text, '1 弦 1 品：贝斯 G 弦 +1 = G♯').toBe('G♯')
    expect(p.cellSpan(1).text, '修前（走全局标准调弦）会算成 F').not.toBe('F')
    p.unmount()
  })

  it('指板按钮 aria-label 走 i18n：中文 `{音} {n}弦 {f}品`', () => {
    setStore({ activeTab: 'chord' })
    const p = mount({ showChordFretboard: true })
    const labels = p.buttons().map((b) => b.getAttribute('aria-label'))
    expect(labels[0]).toBe(`${getNoteAtPosition(0, 0)} 1弦 0品`)
    expect(labels[3]).toBe(`${getNoteAtPosition(0, 3)} 1弦 3品`)
    p.unmount()
  })

  it('英文下标签不含任何汉字（2026-09-28 真 bug 的行为级回归）', () => {
    setStore({ activeTab: 'chord' })
    const p = mount({ showChordFretboard: true, t: tEn })
    expect(p.buttons()[0].getAttribute('aria-label')).toBe(`${getNoteAtPosition(0, 0)}, string 1, fret 0`)
    for (const b of p.buttons()) {
      const label = b.getAttribute('aria-label')
      if (label) expect(label).not.toMatch(CJK)
    }
    p.unmount()
  })

  it('点击指板 → handleFretClick(stringIndex, fret)', () => {
    setStore({ activeTab: 'chord' })
    const p = mount({ showChordFretboard: true })
    p.click(p.buttons()[0])
    expect(p.handleFretClick).toHaveBeenCalledWith(0, 0)
    p.click(p.buttons()[4])
    expect(p.handleFretClick).toHaveBeenCalledWith(0, 4)
    p.unmount()
  })

  it('经典皮肤与主指板**同源**：逐格文字 / 可见性 / 角色完全一致（差分护栏）', () => {
    // 2026-10-01 去重：全屏那份内联副本已删除，改为复用 `PracticeFretboard`（`embedded`）。
    // 这条是**差分护栏** —— 同一组 props/状态下，两处渲染出来的每一格必须一模一样。
    // 修前那份副本：不显示音级（恒音名）、一个 `data-role` 都没有、字号与列宽也各写一份
    // ⇒ **不报错，只在全屏里画错**（含手机上被 `overflow-hidden` 裁掉右侧的品）。
    //
    // ⚠️ 差分护栏只对拍文字是不够的：两个角色可能显示同样的字（`muted` 压暗 vs `tone`
    // 只差在 role）⇒ 必须同时对拍 `data-role`，否则「少传一个 prop」看不出来。
    setStore({ activeTab: 'chord' })
    const shared = {
      t: tZh,
      formatNoteByAccidentalSetting: (n: string) => n,
      handleFretClick: vi.fn(),
      getNoteButtonColor: () => '',
      showAllNotes: false,
      highlightedFrets: new Map<string, boolean>(),
      selectedStrings: [] as number[],
      rootNote: 'E',
      selectedIntervals: [] as number[],
      scaleKey: 'E',
      selectedScale: SCALE_MODES.pentatonic[0],
      scaleExerciseSequence: [] as string[],
      transposedChords: [{ root: 'C', type: 'Major' }],
      currentChordIndex: 0,
      chordExerciseTargetChord: null,
      targetNote: 'E',
      practiceAnswerMode: 'fretboard',
      highlightedTargetPosition: null,
      threeNpsTarget: null,
      threeNpsCellKeys: new Map<string, unknown>(),
      nextThreeNpsCells: new Map<string, 'note' | 'root' | 'start'>(),
      showChordFretboard: true,
      showScaleFretboard: false,
      showIntervalFretboard: false,
      showChordExerciseFretboard: false,
      FRET_MARKERS,
    }
    const p = mount(shared)
    const board = p.outer()!.querySelector('[data-fullscreen-fretboard]') as HTMLElement | null
    expect(board, '护栏自检：找不到全屏指板的话下面全是空转').not.toBeNull()

    // 参照物：直接用共享组件渲染同一组 props
    const refHost = document.createElement('div')
    document.body.appendChild(refHost)
    const refRoot = createRoot(refHost)
    act(() => { refRoot.render(createElement(PracticeFretboard as never, shared as never)) })
    mounted.push({ unmount: () => { act(() => refRoot.unmount()); refHost.remove() } })

    const read = (scope: ParentNode) =>
      [...scope.querySelectorAll('button')].map((b) => {
        const span = b.querySelector('span') as HTMLElement | null
        return {
          text: (span?.textContent ?? '').trim(),
          visible: (span?.className ?? '').split(/\s+/).includes('opacity-100'),
          role: b.getAttribute('data-role'),
        }
      })

    const fsCells = read(board!)
    const mainCells = read(refHost)
    expect(fsCells.length, '护栏自检：两处都真的渲染了 6 × 16 格').toBe(96)
    expect(mainCells.length).toBe(96)
    // 非空转自检：可见性必须两态都有、角色必须多于一种，否则 `toEqual` 是在比两串「全一样」
    expect(new Set(fsCells.map((c) => c.visible)).size, '两种可见性都出现').toBe(2)
    expect(new Set(fsCells.map((c) => c.role)).size, '角色不止一种').toBeGreaterThan(1)
    expect(fsCells.every((c) => c.role), '每一格都要落 data-role（修前一个都没有）').toBe(true)
    expect(fsCells, '全屏与主指板逐格一致').toEqual(mainCells)
    p.unmount()
  })
})

/**
 * 2026-10-01 修：全屏指板「非常窄、且填不满设定的品数」。
 *
 * 根因是**布局**而不是数据：题目区声明是 `max-w-[400px]` 的窄列，指板被放在它**内部**
 * ⇒ 可用宽度 400 - p-8(64) - px-4(32) = 304px；而「空弦 + 15 品」= 16 列 × `min-w-[24px]`
 * = 384px ⇒ 一行放不下，右侧 3 个多的品被指板外层的 `overflow-hidden` 直接裁掉。
 * ⇒ 修法是把指板提到与题目窄列**同级**的宽列（`max-w-6xl`）。
 *
 * ⚠️ 这几条断言必须能咬住「指板被重新塞回窄列」这类改法，所以既查 DOM 父子关系、
 * 也做**缝隙量化**（用源码里解析出来的宽度/列宽算一遍），而不是只断言某个 class 存在。
 */
describe('全屏布局：指板不被题目窄列压窄（2026-10-01 修）', () => {
  const src = readFileSync('components/fullscreen-overlay.tsx', 'utf8')
  /**
   * 格子的最小列宽（px）。
   *
   * 🚨 2026-10-01 去重后，指板标记的唯一实现是 `components/practice-fretboard.tsx`
   * （全屏走 `embedded` 复用它）。**列宽必须从这里解析** —— 早先解析的是全屏里那份
   * 内联副本（24/32），副本删掉后正则直接落空（`Infinity`），缝隙证明整段变成空转。
   */
  const boardSrc = readFileSync('components/practice-fretboard.tsx', 'utf8')
  const MIN_CELLS = (boardSrc.match(/min-w-\[(\d+)px\]/g) ?? []).map((tok) => Number(tok.match(/(\d+)/)![1]))
  /** 移动端断点的列宽 */
  const MIN_CELL = Math.min(...MIN_CELLS)
  /** 桌面断点（`sm:`）的列宽 —— 练习 App 实际跑在桌面/Tauri 上，这条才是约束 */
  const MIN_CELL_DESKTOP = Math.max(...MIN_CELLS)
  /** 题目窄列的宽度上限（px） */
  const QUESTION_CAP = Number(src.match(/className="[^"]*max-w-\[(\d+)px\][^"]*min-h-\[/)![1])
  /** 指板宽列的宽度上限（px）：max-w-6xl = 72rem */
  const MAX_W_SCALE: Record<string, number> = { '6xl': 72 * 16 }
  const BOARD_CAP = MAX_W_SCALE[src.match(/className="[^"]*max-w-(\w+) mt-8/)![1]]
  const P_8 = 32 // p-8
  const PX_4 = 16 // px-4

  /**
   * 护栏本体：指板若被题目窄列包住，就会被 400px 压窄（返回缺陷描述，'' = 合规）。
   * 抽出来是为了给它写**自测** —— 用合成 DOM 证明「包住」这种形状真的会报缺陷，
   * 而不是永远返回 ''（本仓踩过护栏恒真的坑）。
   */
  function nestedBoardDefect(outer: HTMLElement, questionBox: HTMLElement, selector: string): string {
    const board = outer.querySelector(selector)
    if (!board) return `没找到指板容器（${selector}）`
    return questionBox.contains(board) ? '指板被题目窄列包住了 ⇒ 会被 400px 压窄、裁掉右侧的品' : ''
  }

  it('缝隙证明：一行指板塞进题目窄列必然溢出被裁（真机实测少 7 个品）', () => {
    // 护栏自检：解析失效时下面几条会「空转通过」
    expect(MIN_CELL, '解析到了移动端断点的列宽（来自共享组件）').toBe(20)
    expect(MIN_CELL_DESKTOP, '解析到了桌面断点的列宽（来自共享组件）').toBe(28)
    expect(QUESTION_CAP, '解析到了题目窄列上限').toBe(400)
    expect(BOARD_CAP, '解析到了指板宽列上限').toBe(1152)

    const columns = 1 + 15 // 空弦 + 默认 15 品
    const oldUsable = QUESTION_CAP - 2 * P_8 - 2 * PX_4
    const newUsable = BOARD_CAP - 2 * PX_4 // 指板现在与题目窄列同级，不再吃 p-8
    expect(oldUsable, '旧布局（塞在题目窄列里）只有 304px').toBe(304)

    // 两个断点分开算：手机与桌面**都要放得下**才算真修好
    expect(oldUsable, '旧布局：移动端断点也放不下').toBeLessThan(columns * MIN_CELL)
    expect(oldUsable, '旧布局：桌面断点差得更远').toBeLessThan(columns * MIN_CELL_DESKTOP)
    expect(newUsable, '新布局（桌面）').toBeGreaterThanOrEqual(columns * MIN_CELL_DESKTOP)

    // 🚨 手机窄屏：这一条是「全屏那份内联副本」翻车的地方，也是去重的直接动因。
    // 360px 视口下全屏宽列可用 360 - 2×px-4 = 328px；共享组件的 16 × 20 = 320 ⇒ 放得下；
    // 而旧副本是 16 × 24 = 384 ⇒ 溢出 56px，被 `overflow-hidden` 裁掉（真机实测 326 / 384）。
    const PHONE = 360
    const phoneUsable = PHONE - 2 * PX_4
    expect(columns * MIN_CELL, '共享组件在 360px 放得下').toBeLessThanOrEqual(phoneUsable)
    expect(columns * 24, '旧内联副本的 24px 在 360px 放不下').toBeGreaterThan(phoneUsable)

    // 真机实测（无头 Chrome 1414×800，CDP 走了一遍 开始练习 → 全屏 → ↑）。
    // ⚠️ 这些数字只有真浏览器量得出：jsdom 没有布局引擎，class 写对了也不代表没被裁。
    //   ① 桌面修前：内板 client 302 / scroll 512（= 16 × 32，当时的副本列宽）⇒ 只有 54/96 格可见，
    //      即 16 列里只看得见 9 列，右侧 7 列（含 14、15 品）被裁
    //   ② 桌面修后：1118 / 1118 ⇒ 0 裁剪，96/96 格可见
    const REAL_OLD_CLIENT = 302
    const REAL_OLD_SCROLL = 512
    const REAL_OLD_CELL = 32
    expect(REAL_OLD_SCROLL, '修前一行要 16 × 32px').toBe(columns * REAL_OLD_CELL)
    expect(
      columns - Math.floor(REAL_OLD_CLIENT / REAL_OLD_CELL),
      '修前完整可见 9 列 ⇒ 右侧 7 列被 overflow-hidden 裁掉',
    ).toBe(7)
    expect(54 / 96, '真机 54/96 格可见 ⇔ 9/16 列').toBeCloseTo(9 / 16)
  })

  it('指板是题目窄列的**兄弟**节点，题目窄列自己仍保持 400px 上限', () => {
    const p = mount({ showFretboard: true })
    const outer = p.outer()!
    const questionBox = p.inner()! // outer 的第一个孩子 = 题目窄列
    // 护栏自检：找不到指板时 helper 会返回「没找到」，不会空转通过
    expect(nestedBoardDefect(outer, questionBox, '[data-fullscreen-fretboard]')).toBe('')
    expect(questionBox.contains(outer.querySelector('[data-fullscreen-fretboard]')), '指板不在窄列内部').toBe(false)
    expect(
      questionBox.className.split(/\s+/),
      '题目窄列自己仍要窄：无指板的题型靠它居中',
    ).toContain('max-w-[400px]')

    const board = outer.querySelector('[data-fullscreen-fretboard]') as HTMLElement | null
    expect(board, '指板容器带 data-fullscreen-fretboard').not.toBeNull()
    const cls = board!.className.split(/\s+/)
    expect(cls, '指板走独立宽列').toContain('max-w-6xl')
    expect(cls, '旧的 max-w-5xl 只剩 928px 可用').not.toContain('max-w-5xl')
    p.unmount()
  })

  it('护栏自测：指板被塞进题目窄列时，上面那条必须报缺陷', () => {
    const outer = document.createElement('div')
    // 违规形状：指板嵌在题目框**内部** —— 必须先证明这种形状会被判定出来，否则护栏恒真
    outer.innerHTML = '<div data-q=""><div data-fullscreen-fretboard=""></div></div>'
    const nested = outer.querySelector('[data-q]') as HTMLElement
    expect(nestedBoardDefect(outer, nested, '[data-fullscreen-fretboard]')).toContain('包住了')

    // 合规形状：宽列与题目框同级
    outer.innerHTML = '<div data-q=""></div><div data-fullscreen-fretboard=""></div>'
    const sibling = outer.querySelector('[data-q]') as HTMLElement
    expect(nestedBoardDefect(outer, sibling, '[data-fullscreen-fretboard]')).toBe('')

    // 找不到指板也要显式失败（而不是静默返回 ''）
    outer.innerHTML = '<div data-q=""></div>'
    expect(
      nestedBoardDefect(outer, outer.querySelector('[data-q]') as HTMLElement, '[data-fullscreen-fretboard]'),
    ).toContain('没找到')
  })

  it('非练习中（isPlaying=false）不渲染指板 —— isPlaying 仍是总开关', () => {
    setStore({ isPlaying: false })
    const p = mount({ showFretboard: true })
    expect(p.outer()!.querySelector('[data-fullscreen-fretboard]'), 'isPlaying 为假时不该出现指板').toBeNull()
    expect(p.buttons().length).toBe(0)
    p.unmount()
  })

  it('两套皮肤共用同一个指板外壳 ⇒ 宽度上限一致（GuitarRun 皮肤也一样宽）', () => {
    const state = useAppStore.getState()
    for (const style of ['classic', 'guitarrun'] as const) {
      useAppStore.setState({ user: { ...state.user, fretboardStyle: style } })
      const p = mount({ showFretboard: true })
      const boards = p.outer()!.querySelectorAll('[data-fullscreen-fretboard]')
      expect(boards.length, `${style}: 只有一个指板外壳`).toBe(1)
      expect((boards[0] as HTMLElement).className.split(/\s+/), style).toContain('max-w-6xl')
      expect(p.buttons().length, `${style}: 指板真的渲染出来了`).toBe(6 * 16)
      p.unmount()
    }
    useAppStore.setState({ user: { ...state.user, fretboardStyle: state.user.fretboardStyle } })
  })

  it('点指板外壳 / 点品格都不退出全屏（stopPropagation 随指板一起搬出题目窄列）', () => {
    setStore({ activeTab: 'chord' }) // 找音 tab 默认未选中任何弦 ⇒ 品格是 disabled，点不动
    const p = mount({ showChordFretboard: true })
    const board = p.outer()!.querySelector('[data-fullscreen-fretboard]') as HTMLElement
    p.click(board)
    expect(p.setFullscreenMode, '点指板空白处不该退出').not.toHaveBeenCalled()

    p.click(p.buttons()[0]) // 点空弦（0 品）
    expect(p.handleFretClick).toHaveBeenCalledWith(0, 0)
    expect(p.setFullscreenMode, '点品格更不该顺带退出全屏').not.toHaveBeenCalled()
    p.unmount()
  })
})
