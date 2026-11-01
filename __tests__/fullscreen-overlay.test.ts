/**
 * components/fullscreen-overlay.tsx 的契约测试（此前零测试）。
 *
 * 全屏练习覆盖层：按 store 的 activeTab + isPlaying 显示不同内容（找音/和弦/
 * 和弦练习/音阶/音程），带「下一题预览」和可交互指板；点背景或 Esc 退出全屏
 * （内层 stopPropagation 防止误退）。
 *
 * 契约重点：
 *  ① 退出：点背景 → setFullscreenMode(false)；Esc 同样（**Enter/Space 不再退出** ——
 *     它们归当前焦点控件与全局快捷键，见审计 2026-10-31 第 13 项）；
 *     外层不再是 role=button（否则内部控件对读屏是装饰）；其它键不退出；
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
    chordDegreeCurrentStep: 0,
    chordExerciseTargetChord: null,
    chordExerciseSequence: [] as string[],
    chordExerciseCurrentStep: 0,
    nextChordExerciseInfo: null,
    scaleExerciseSequence: [] as string[],
    scaleExerciseCurrentStep: 0,
    scaleKey: 'E',
    selectedScale: SCALE_MODES.pentatonic[0],
    nextScaleExerciseInfo: null,
    threeNps: null,
    nextThreeNps: null,
    currentIntervalExercise: null,
    score: { correct: 0, total: 0 },
    timeLeft: 285,
    practiceTime: 300,
    formatTime: (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`,
    showAccuracy: true,
    showTimer: true,
    intervalDirection: 'up' as const,
    intervalExerciseQueue: [] as number[],
    intervalCurrentQueueIndex: 0,
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
  /**
   * 🚨 2026-10-31 审计第 13 项改了这条契约：外层**不再是** `role="button"`。
   *
   * 全屏层里有指板按钮、钢琴键。整块挂成 role=button 时，ARIA 规定它的子节点是
   * presentational ⇒ 读屏把里面的控件全当装饰，全屏练习对读屏用户等于不可操作。
   * 退出方式改为「点背景」+「Esc」，不再靠这一个巨型按钮。
   */
  it('外层不再是 role=button（读屏要把内部控件当控件），点击背景仍退出', () => {
    const p = mount()
    const outer = p.outer()!
    expect(outer.getAttribute('role')).toBeNull()
    expect(outer.getAttribute('tabindex'), '也不该再进 Tab 序列').toBeNull()
    p.click(outer)
    expect(p.setFullscreenMode).toHaveBeenCalledWith(false)
    p.unmount()
  })

  it('Esc 退出；Enter / Space 不再由本层退出（归当前控件与全局快捷键）', () => {
    const p = mount()
    p.press(p.outer(), 'Escape')
    expect(p.setFullscreenMode).toHaveBeenCalledTimes(1)

    // Enter / Space：本层不拦（否则全屏里按 Enter 激活格子会连带退出全屏）
    p.press(p.outer(), 'Enter')
    p.press(p.outer(), ' ')
    p.press(p.outer(), 'a')
    p.press(p.outer(), 'ArrowUp')
    expect(p.setFullscreenMode).toHaveBeenCalledTimes(1)
    p.unmount()
  })

  it('子控件已用掉这次按键（defaultPrevented）⇒ 本层不再退出', () => {
    const p = mount()
    const cell = document.createElement('button')
    cell.addEventListener('keydown', (e) => e.preventDefault())
    p.inner()!.appendChild(cell)
    p.press(cell, 'Escape')
    expect(p.setFullscreenMode).not.toHaveBeenCalled()
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

  /**
   * 🚨 用户报的真 bug（2026-10-31）：**音程练习进全屏后方向没了**。
   *
   * 普通模式的题面（`components/interval-question.tsx`）顶部有「计时 / 方向 / 进度」，
   * 而全屏层这里原先只渲染「根音 + 音程串」—— 方向信息整个消失：
   * 用户不知道该往上还是往下按；`either`（上下都对）与 `random`（每题随机）
   * 更是连"有没有方向限制"都看不出来。
   *
   * 修法是把 `intervalDirection` / 队列进度显式传进来（方向不是题目的属性，
   * 而是独立设置项，推不出来），符号走 `lib/interval-direction.ts` 的唯一真相源。
   */
  const intervalExercise = {
    rootNote: 'E',
    interval: { name: 'Major Third', symbol: '3', semitones: 4 },
    targetNote: 'G♯',
    allIntervals: [],
    currentIntervalDisplay: '3',
    completedIntervals: [],
    answered: false,
  }

  it('★ 音程练习全屏：显示方向（四档符号都对）', () => {
    setStore({ activeTab: 'interval' })
    for (const [direction, symbol] of [
      ['up', '↑'],
      ['down', '↓'],
      ['either', '↕'],
      ['random', '🔀'],
    ] as const) {
      const p = mount({
        currentIntervalExercise: intervalExercise,
        intervalDirection: direction,
        intervalExerciseQueue: [0, 1, 2],
        intervalCurrentQueueIndex: 0,
      })
      const badge = p.container.querySelector('[data-interval-direction]')
      expect(badge, `方向 ${direction} 没有渲染出来`).not.toBeNull()
      expect(badge!.getAttribute('data-interval-direction'), '渲染的方向与传入的不一致').toBe(direction)
      expect(badge!.textContent, `方向 ${direction} 应显示 ${symbol}`).toContain(symbol)
      // 不能只有符号没有标签 —— 单独一个 ↑ 在超大字号下很像题目内容
      expect(badge!.textContent).toContain(tZh('direction'))
      p.unmount()
    }
  })

  it('★ 音程练习全屏：显示队列进度（第几题 / 共几题）', () => {
    setStore({ activeTab: 'interval' })
    const p = mount({
      currentIntervalExercise: intervalExercise,
      intervalExerciseQueue: [0, 1, 2, 3],
      intervalCurrentQueueIndex: 2,
    })
    const progress = p.container.querySelector('[data-interval-progress]')
    expect(progress, '队列进度没有渲染出来').not.toBeNull()
    expect(progress!.textContent).toBe('2/4')
    p.unmount()
  })

  /**
   * 🚨 与普通模式对齐的另外两项（2026-10-31 排查）：
   *   · 本轮选中的音程集合（普通模式当作背景信息显示「3 5 ♭7」这类清单）；
   *   · 答对后短暂显示的目标音（绿色确认）。
   * 两项都在 `currentIntervalExercise` 里，不需要新 prop，但**必须真的渲染**。
   */
  it('显示本轮选中的音程集合（allIntervals）', () => {
    setStore({ activeTab: 'interval' })
    const p = mount({
      currentIntervalExercise: {
        ...intervalExercise,
        allIntervals: [
          { name: 'Major Third', symbol: '3', semitones: 4 },
          { name: 'Perfect Fifth', symbol: '5', semitones: 7 },
        ],
      },
    })
    const text = p.text()
    expect(text).toContain(formatDegree('3'))
    expect(text).toContain(formatDegree('5'))
    p.unmount()
  })

  it('答对后显示目标音（answered=true）', () => {
    setStore({ activeTab: 'interval' })
    const answered = mount({ currentIntervalExercise: { ...intervalExercise, answered: true } })
    expect(answered.text(), '答对后没显示目标音').toContain('G♯')
    answered.unmount()

    const pending = mount({ currentIntervalExercise: { ...intervalExercise, answered: false } })
    expect(pending.text(), '未答对不该提前泄露目标音').not.toContain('G♯')
    pending.unmount()
  })

  it('方向 / 进度只在音程 tab 出现（不泄漏到别的练习）', () => {
    for (const tab of ['practice', 'chord', 'chord_exercise', 'scale']) {
      setStore({ activeTab: tab })
      const p = mount({
        // 别的 tab 也可能拿到这些 prop（页面统一传），但不该渲染出来
        currentIntervalExercise: intervalExercise,
        intervalExerciseQueue: [0, 1, 2],
        intervalCurrentQueueIndex: 1,
      })
      expect(p.container.querySelector('[data-interval-direction]'), `${tab} tab 出现了音程方向`).toBeNull()
      expect(p.container.querySelector('[data-interval-progress]'), `${tab} tab 出现了音程进度`).toBeNull()
      p.unmount()
    }
  })

  it('未开始（isPlaying=false）不渲染音程信息', () => {
    setStore({ activeTab: 'interval', isPlaying: false })
    const p = mount({
      currentIntervalExercise: intervalExercise,
      intervalExerciseQueue: [0, 1],
      intervalCurrentQueueIndex: 0,
    })
    expect(p.container.querySelector('[data-interval-direction]')).toBeNull()
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
    // 🚨 断言要**限定在指板内**：退出提示也是 `div.pointer-events-none`（2026-10-31 起
    //    改为浮动提示），不限定范围就会把它的数量算进来 ⇒ 这条会假红。
    const board = p.container.querySelector('[data-fullscreen-fretboard]') as HTMLElement | null
    expect(board, '护栏自检：找不到全屏指板容器').toBeTruthy()
    expect(board!.querySelectorAll('div.pointer-events-none').length, '分隔线 = 弦数 - 1').toBe(3)

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

/**
 * 🚨 2026-10-31 排查发现的第二类缺口：**全屏层把顶栏盖住了**。
 *
 * 全屏层是 `fixed inset-0 z-[9999]`，而「得分（正确/总数 + 百分比）」与
 * 「剩余时间」只在 `components/app-header.tsx` 里显示 ⇒ 一进全屏两样全没了。
 * 练习中「对了几题」「还剩几分钟」恰恰是要一直看到的。
 *
 * 修法：徽章抽到 `components/practice-status.tsx`，顶栏与全屏共用；全屏在题目列
 * 上方自己摆一行。以下用例钉住「真的显示出来了」，以及「与本轮时长/练习状态同口径」。
 */
describe('全屏状态条：得分 + 剩余时间', () => {
  const score = { correct: 7, total: 10 }

  it('五个练习 tab 都显示得分与倒计时', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['practice', {}],
      ['interval', { currentIntervalExercise: { rootNote: 'C', interval: { name: 'P5', symbol: '5', semitones: 7 }, targetNote: 'G', allIntervals: [], currentIntervalDisplay: '5', completedIntervals: [], answered: false } }],
      ['chord_exercise', { chordExerciseTargetChord: { root: 'C', type: 'Major' }, chordExerciseSequence: ['1'], chordExerciseCurrentStep: 0 }],
      ['scale', { scaleExerciseSequence: ['1', '2', '3'], scaleExerciseCurrentStep: 0 }],
      ['chord', {}],
    ]
    for (const [tab, extra] of cases) {
      setStore({ activeTab: tab })
      const p = mount({ score, timeLeft: 285, practiceTime: 300, ...extra })
      const status = p.container.querySelector('[data-fullscreen-status]')
      expect(status, `${tab}：全屏没有状态条 ⇒ 得分/倒计时看不见`).not.toBeNull()
      expect(status!.textContent, `${tab}：得分未显示`).toContain('7/10')
      expect(status!.textContent, `${tab}：正确率未显示`).toContain('70%')
      expect(status!.textContent, `${tab}：剩余时间未显示`).toContain('4:45')
      p.unmount()
    }
  })

  it('不限时（practiceTime=0）不显示倒计时，得分仍在', () => {
    const p = mount({ score, practiceTime: 0 })
    const status = p.container.querySelector('[data-fullscreen-status]')!
    expect(status.textContent).toContain('7/10')
    expect(status.textContent, '不限时不该出现倒计时').not.toContain('4:45')
    p.unmount()
  })

  it('未开始（isPlaying=false）不显示状态条', () => {
    setStore({ isPlaying: false })
    const p = mount({ score })
    expect(p.container.querySelector('[data-fullscreen-status]')).toBeNull()
    p.unmount()
  })

  it('得分与顶栏同源：百分比口径一致（≥70% 用实心徽章）', () => {
    const p = mount({ score: { correct: 7, total: 10 } })
    const percent = [...p.container.querySelectorAll('[data-fullscreen-status] span')].find(
      (el) => (el.textContent ?? '').trim() === '70%',
    ) as HTMLElement | undefined
    expect(percent, '没找到百分比徽章').toBeTruthy()
    // 颜色判定是流程外可见的那一半：`secondary`（灰）说明 70% 被判成低分
    expect(percent!.className, '70% 应判为达标（实心徽章），不该是 secondary').not.toContain('bg-secondary')
    p.unmount()
  })
})

describe('全屏状态条受「显示与外观」开关门控', () => {
  it('showAccuracy=false 时不显示得分徽章', () => {
    const p = mount({ score: { correct: 7, total: 10 }, showAccuracy: false, showTimer: true })
    const status = p.container.querySelector('[data-fullscreen-status]')!
    expect(status.textContent, '关掉正确率后不该出现 7/10').not.toContain('7/10')
    expect(status.textContent, '倒计时仍应显示').toContain('4:45')
    p.unmount()
  })

  it('showTimer=false 时不显示倒计时（即使时有练习）', () => {
    const p = mount({ score: { correct: 7, total: 10 }, showAccuracy: true, showTimer: false })
    const status = p.container.querySelector('[data-fullscreen-status]')!
    expect(status.textContent, '得分仍应显示').toContain('7/10')
    expect(status.textContent, '关掉倒计时后不该出现 4:45').not.toContain('4:45')
    p.unmount()
  })

  it('两个都关时不渲染任何徽章', () => {
    const p = mount({ score: { correct: 7, total: 10 }, showAccuracy: false, showTimer: false })
    const status = p.container.querySelector('[data-fullscreen-status]')!
    expect(status.textContent?.trim()).toBe('')
    p.unmount()
  })
})

/**
 * 「点击退出全屏」提示自动显隐：进入全屏先显示 3 秒 → 隐藏；鼠标/触摸移动再显示 → 停下 3 秒后隐藏。
 */
describe('退出提示自动显隐', () => {
  it('进入后显示，3 秒后自动隐藏；移动时再现，停下 3 秒再隐藏', () => {
    vi.useFakeTimers()
    try {
      const p = mount()
      const exitControl = () => p.container.querySelector('[data-exit-control]')
      // 进入即显示
      expect(exitControl(), '进入全屏应立即显示退出提示').not.toBeNull()
      expect(p.text()).toContain(tZh('click_to_exit_fullscreen'))

      // 3 秒后自动隐藏
      act(() => { vi.advanceTimersByTime(3000) })
      expect(exitControl(), '3 秒后应自动隐藏退出提示').toBeNull()

      // 鼠标移动 → 再次出现
      const outer = p.outer()!
      act(() => {
        outer.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      })
      expect(exitControl(), '鼠标移动应让退出提示再现').not.toBeNull()

      // 停下 3 秒 → 再次隐藏
      act(() => { vi.advanceTimersByTime(3000) })
      expect(exitControl(), '停下 3 秒后退出提示应再次隐藏').toBeNull()

      p.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('点击退出提示（冒泡到外层）也会退出全屏', () => {
    const p = mount()
    const ctrl = p.container.querySelector('[data-exit-control]') as HTMLElement
    expect(ctrl).not.toBeNull()
    p.click(ctrl)
    expect(p.setFullscreenMode).toHaveBeenCalledTimes(1)
    expect(p.setFullscreenMode).toHaveBeenCalledWith(false)
    p.unmount()
  })
})

/**
 * 🚨 2026-10-31 排查发现的第三类缺口：**一弦三音（3NPS）在全屏里退化成 35 步数字墙**。
 *
 * 3NPS 的序列是 35 步（3×6 上行 + 17 下行）。普通模式早就改成「把位视图 +
 * 9 步滑窗」，而全屏层**无条件**把整条序列铺成徽章 ⇒ 实测是一屏纯数字：
 * `1 2 3 4 5 6 7 / 1 2 3 4 5 6 7 / 1 2 3 4 3 2 1 / 7 6 5 4 3 2 1 / 7 6 5 4 3 2 1`
 * 把位、连击、目标音在几弦几品、当前位置全都没有。
 *
 * 这些数据由页面侧的 `threeNps` 快照提供（与普通模式同一个对象），组件不必推算。
 */
describe('一弦三音（3NPS）全屏用把位视图', () => {
  const threeNps = {
    position: 3,
    totalPositions: 7,
    combo: 5,
    maxCombo: 9,
    direction: 'up' as const,
    isShift: false,
    stepNow: 12,
    stepTotal: 35,
    target: { label: 'b3', note: 'E♭', stringIndex: 2, fret: 8, isRoot: false },
    window: ['1', '2', '3', '4', '5', '6', '7', '1', '2'].map((label, i) => ({
      label,
      done: i < 4,
      current: i === 4,
    })),
  }
  const nextThreeNps = { position: 4, totalPositions: 7, startStringIndex: 0, startFret: 5 }
  /** 35 步的真实序列（用来证明它**不再**被整条铺出来） */
  const sequence35 = ['1', '2', '3', '4', '5', '6', '7', '1', '2', '3', '4', '5', '6', '7',
    '1', '2', '3', '4', '3', '2', '1', '7', '6', '5', '4', '3', '2', '1', '7', '6', '5', '4', '3', '2', '1']

  function mountThreeNps(overrides: Record<string, unknown> = {}) {
    setStore({ activeTab: 'scale' })
    return mount({
      scaleKey: 'C',
      scaleExerciseSequence: sequence35,
      scaleExerciseCurrentStep: 11,
      threeNps,
      nextThreeNps,
      ...overrides,
    })
  }

  it('显示把位进度 / 方向 / 连击', () => {
    const p = mountThreeNps()
    const text = p.text()
    expect(text, '缺「把位 3 / 7」').toContain('把位 3 / 7')
    expect(text, '缺方向').toContain(tZh('three_nps_ascending'))
    expect(text, '缺连击').toContain('连击 5×')
    p.unmount()
  })

  it('显示目标音、音名与「第几弦第几品」（弦号 1 起）', () => {
    const p = mountThreeNps()
    const text = p.text()
    expect(text).toContain('E♭')
    // stringIndex=2（0 起）⇒ 用户看到「第 3 弦」
    expect(text, '弦号换算错了（0 起 vs 1 起）').toContain('第 3 弦 · 第 8 品')
    expect(text).toContain('12 / 35')
    p.unmount()
  })

  it('9 步滑窗每步一格，当前步高亮、已完成变淡', () => {
    const p = mountThreeNps()
    // 🚨 用**语义属性** `data-three-nps-step` 选格子，不再按尺寸 class（`w-12 h-12`）选：
    //    格子必须能改成自适应宽度（固定 48px × 9 在 400px 窄列里必然换行 ⇒ 见下一组护栏），
    //    一旦按尺寸选，这条断言就会跟着「一起坏掉」而失去牙齿。
    const windowSlots = [...p.container.querySelectorAll('span[data-three-nps-step]')] as HTMLElement[]
    expect(windowSlots.length, `滑窗应有 9 格，实际 ${windowSlots.length}`).toBe(9)
    expect(windowSlots[4].className, '当前步没高亮').toContain('bg-primary')
    expect(windowSlots[0].className, '已完成步没变淡').toContain('border-border/40')
    p.unmount()
  })

  /**
   * 🚨 滑窗不许用固定宽度（2026-10-31 修）。
   *
   * 全屏窄列的内容宽只有 368px（`max-w-[400px]` − `p-4`×2），而 9 个固定 `w-12`(48px)
   * + 8 个 `gap`(8px) = **496px** ⇒ `flex-wrap` 永远换行成 2 排（实测 `rowCount=2`），
   * 「滑窗」变成两行数字，视觉语义直接崩掉。
   *
   * 断言方式：**不许出现任何固定宽 token**（`^w-\d+$`），且必须是 `flex-1`（靠平分宽度）。
   * jsdom 没有布局引擎，量不出实际宽度 —— 所以这里钉的是**成因**（固定宽 ⇒ 必然换行），
   * 实际宽度由 CDP 探针在真实浏览器里复核。
   */
  it('9 步滑窗格子是自适应宽度（不许固定宽）+ 容器不许换行', () => {
    const p = mountThreeNps()
    const cells = [...p.container.querySelectorAll('span[data-three-nps-step]')] as HTMLElement[]
    expect(cells.length, `滑窗应有 9 格，实际 ${cells.length}`).toBe(9)
    for (const cell of cells) {
      const t = cell.className.split(/\s+/).filter(Boolean)
      expect(t, '格子必须靠 flex 平分宽度（basis-0），才能在窄列里排成一行').toContain('flex-1')
      expect(
        t.filter((x) => /^w-\d+$/.test(x)),
        '格子不许有固定宽度（48px×9 + gap 在 368px 窄列里必然换行成两排）',
      ).toEqual([])
    }
    const box = cells[0].parentElement as HTMLElement
    expect(
      box.className.split(/\s+/).filter(Boolean),
      '滑窗容器不许换行（flex-wrap 会把「当前步固定第 4 格」冲掉）',
    ).toContain('flex-nowrap')
    p.unmount()
  })

  it('🚨 不再把整条 35 步序列铺出来（那正是数字墙）', () => {
    const p = mountThreeNps()
    // 普通音阶分支的音级字号是 text-4xl；3NPS 下不该出现
    const bigDegreeSpans = [...p.container.querySelectorAll('span')].filter((el) =>
      el.className.includes('text-4xl'),
    )
    expect(bigDegreeSpans.length, `3NPS 下仍有 ${bigDegreeSpans.length} 个整条序列徽章`).toBe(0)
    p.unmount()
  })

  it('下一题预览是「下一把位 4」+ 起始弦品，而不是整条序列', () => {
    const p = mountThreeNps()
    const text = p.text()
    expect(text).toContain('下一把位 4')
    expect(text, '起始位置弦号错了').toContain('第 1 弦 · 第 5 品')
    expect(text).not.toContain(sequence35.join(' '))
    p.unmount()
  })

  it('换把时方向位置显示「换把 → 把位 n」', () => {
    const p = mountThreeNps({ threeNps: { ...threeNps, isShift: true } })
    expect(p.text()).toContain('换把 → 把位 3')
    p.unmount()
  })

  it('非 3NPS（threeNps=null）仍走普通音阶版式（不误伤）', () => {
    setStore({ activeTab: 'scale' })
    const p = mount({
      scaleKey: 'C',
      scaleExerciseSequence: ['1', '2', '3', '5', '6', '1'],
      scaleExerciseCurrentStep: 0,
      threeNps: null,
      nextThreeNps: null,
    })
    expect(p.text()).toContain('1')
    expect(p.text(), '普通音阶不该出现把位文案').not.toContain('把位')
    p.unmount()
  })
})

/**
 * 🚨 2026-10-31 修：全屏 + 一弦三音 + **开指板** ⇒ 「题目区压在指板上」+「顶部被裁」。
 *
 * 用户原话：「一弦三音的练习，如果开指板显示，在全屏模式中会已显示不全/重叠」。
 * CDP 实测（无头 Chrome 156，1366×768）：
 *   · 题目窄列 `clientH=472` 而 `scrollH=565` ⇒ **内容溢出 93px**，
 *     「下一把位」那段文字直接画在指板第一行格子上（截图可见）；
 *   · 调式名「C 伊奥尼亚调式」只剩「调式」两个字 —— 顶部被裁**且滚不回去**。
 *
 * 两个成因都是**布局**的，jsdom 没有布局引擎 ⇒ 量不出重叠；但**成因本身可以钉死**：
 *
 *  ① **重叠** = 根容器 `flex flex-col` + 固定 `height:100vh` ⇒ 子项默认 `flex-shrink:1`。
 *     内容总高超过视口时根容器会**压缩**子项来「装下」；窄列有 `min-h-[300px]`
 *     ⇒ 压不到内容高度 ⇒ 内容从自己的盒子溢出去，盖在兄弟节点（指板）上。
 *     ⇒ 三个子项必须都带 `shrink-0`。
 *     ⚠️「**只有开指板才出现**」不是巧合：不开指板时根容器只有一个 flex 子项，压不动。
 *
 *  ② **顶部被裁** = 裸 `justify-center` 在内容高于容器时把溢出甩到**顶部之外**，
 *     而 `overflow-auto` 只能往下滚 ⇒ 顶部永久不可达。
 *     ⇒ 必须用 `justify-[safe_center]`（放不下时自动退回 `start`）。
 */
describe('全屏布局：窄列不被压缩、顶部不被裁（2026-10-31 修）', () => {
  const tokens = (el: HTMLElement) => el.className.split(/\s+/).filter(Boolean)

  it('根容器用 safe center（放不下时退回顶部对齐），不用裸 justify-center', () => {
    const p = mount()
    const t = tokens(p.outer()!)
    expect(t, '全屏根容器必须用 safe-center-y').toContain('safe-center-y')
    expect(t, '裸 justify-center 会把溢出的顶部裁掉且滚不回去').not.toContain('justify-center')
    // ⚠️ 类名存在 ≠ 样式存在：这条规则是**手写**在 globals.css 里的
    //    （Tailwind 3.4.19 不生成 `justify-[safe_center]` 任意值 ⇒ 静默失效）。
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css, 'globals.css 里没有 .safe-center-y 的定义（手写类被删 ⇒ 类名进了 JS 但没样式）')
      .toMatch(/\.safe-center-y\s*\{[^}]*justify-content:\s*safe center/)
    p.unmount()
  })

  it('根容器的**流式**子项都带 shrink-0；退出提示必须脱离文档流（否则出现/消失会顶动上下）', () => {
    const p = mount({ showFretboard: true })
    const kids = [...p.outer()!.children] as HTMLElement[]
    // 护栏自检：子项数量变了说明结构变了，下面会空转
    expect(kids.length, '根容器下应有「题目窄列 + 指板 + 退出提示」三个子项').toBe(3)
    const hint = kids.find((k) => k.getAttribute('data-exit-control') !== null) as HTMLElement | undefined
    expect(hint, '护栏自检：找不到退出提示').toBeTruthy()
    for (const kid of kids.filter((k) => k !== hint)) {
      const name = kid.getAttribute('data-fullscreen-fretboard') !== null ? '指板' : '题目窄列'
      expect(tokens(kid), `${name} 缺 shrink-0：会被根容器压扁，内容溢出后盖住兄弟节点`).toContain('shrink-0')
    }
    // 🚨 退出提示必须**脱离文档流**：它在流里的话，一出现/消失就改变根容器的内容高度，
    //    `safe center` 的居中基线跟着动 ⇒ 上面整块题目上下跳（用户原话「有跳动的感觉，影响练习」）。
    expect(
      tokens(hint!).filter((x) => x === 'fixed' || x === 'absolute' || x === 'sticky'),
      '退出提示必须脱离文档流（fixed/absolute/sticky），否则出现/消失会让上面内容跳动',
    ).not.toEqual([])
    // 且不许抢点击：浮动后可能压在指板底部（窄屏内容刚好放满时），可点击会吃掉品格的点击。
    // 提示语「点击退出全屏」说的是「点背景任意处即退出」（外层 onClick），本身不需要自己可点。
    expect(tokens(hint!), '退出提示必须 pointer-events-none').toContain('pointer-events-none')
    p.unmount()
  })
})

/**
 * 🚨 2026-10-31 用户反馈的两条（都是「全屏层是另一套版式 ⇒ 没跟普通模式对齐」的缺口）：
 *
 *  ① **和弦转换：弹对的音要逐个变灰**。普通模式 `components/chord-degrees-display.tsx`
 *     早就按 `chordDegreeCurrentStep` 逐个 `opacity-50` + 当前音高亮；全屏层**根本没接
 *     这个 prop**，三个音级从头到尾都是 `text-primary` ⇒ 弹没弹对全一个样，用户只能
 *     等整和弦弹完、切到下一和弦才反应过来（用户原话「修改成弹对哪个音哪个音变灰」）。
 *  ② **和弦名 / 音阶名必须一行**（`whitespace-nowrap`）：换行会改变该块高度，
 *     整块内容跟着上下跳（正是用户说的「影响其他部分」）。
 */
describe('全屏：和弦转换逐音变灰 + 名称一行不换行（2026-10-31 修）', () => {
  const chordProps = {
    transposedChords: [{ root: 'C', type: 'Major' }],
    currentChordIndex: 0,
    // 🚨 必须是「三个和弦音」这一档：`single_chord_tones_root` 只出 1 个音级，
    //    没法断言「已弹 / 当前 / 未弹」三态。
    practiceLevel: 'three_chord_tones_root_3rd_5th',
    getCurrentChordDisplay: () => 'Cmaj7UNIQUE',
    getNextChordDisplay: () => null,
    getLevelOptions: () => ({}),
  }
  const degreeCells = (p: ReturnType<typeof mount>) =>
    [...p.container.querySelectorAll('[data-chord-degree]')] as HTMLElement[]

  it('和弦转换：已弹对的音变灰、当前音高亮、未弹的暗（口径与普通模式一致）', () => {
    setStore({ activeTab: 'chord' })
    const p = mount({ ...chordProps, chordDegreeCurrentStep: 1 })
    const cells = degreeCells(p)
    expect(cells.length, '护栏自检：应渲染出和弦音级格').toBeGreaterThan(1)
    expect(cells[0].getAttribute('data-done'), '第 0 个音已弹对').toBe('1')
    expect(cells[0].className, '已弹对的音必须变灰').toContain('text-muted-foreground/50')
    expect(cells[1].getAttribute('data-done'), '第 1 个是当前要弹的').toBe('0')
    expect(cells[1].className, '当前音必须高亮').toContain('text-primary')
    expect(cells[2]?.className ?? '', '未弹的音必须是暗色（待弹）').toContain('text-muted-foreground/80')
    expect(cells[2]?.className ?? '', '未弹的音不该高亮').not.toContain('text-primary')
    p.unmount()
  })

  it('全部弹完 ⇒ 所有音级都变灰（弹对哪个哪个灰，而不是等切和弦才反应）', () => {
    setStore({ activeTab: 'chord' })
    const p = mount({ ...chordProps, chordDegreeCurrentStep: 99 })
    const cells = degreeCells(p)
    expect(cells.length, '护栏自检：应渲染出和弦音级格').toBeGreaterThan(0)
    for (const c of cells) {
      expect(c.getAttribute('data-done'), `「${c.textContent}」应已弹对`).toBe('1')
      expect(c.className, `「${c.textContent}」应变灰`).toContain('text-muted-foreground/50')
    }
    p.unmount()
  })

  it('和弦名 / 音阶名都是 whitespace-nowrap（换行会改高度 ⇒ 内容上下跳）', () => {
    setStore({ activeTab: 'chord' })
    const chord = mount(chordProps)
    const chordTitle = chord.container.querySelector('[data-fullscreen-title]') as HTMLElement | null
    expect(chordTitle, '找不到和弦名元素').toBeTruthy()
    expect(
      chordTitle!.className.split(/\s+/),
      '和弦名必须 whitespace-nowrap（换行会让整块内容跳动）',
    ).toContain('whitespace-nowrap')
    expect((chordTitle!.textContent ?? '').trim(), '和弦名元素要真的渲染出名字').toBe('Cmaj7UNIQUE')
    chord.unmount()

    setStore({ activeTab: 'scale' })
    const scale = mount({
      scaleKey: 'C',
      selectedScale: SCALE_MODES.pentatonic[0],
      scaleExerciseSequence: ['1', '2', '3'],
      scaleExerciseCurrentStep: 0,
    })
    const scaleTitle = scale.container.querySelector('[data-fullscreen-title]') as HTMLElement | null
    expect(scaleTitle, '找不到音阶名元素').toBeTruthy()
    expect(
      scaleTitle!.className.split(/\s+/),
      '音阶名必须 whitespace-nowrap（换行会让整块内容跳动）',
    ).toContain('whitespace-nowrap')
    scale.unmount()
  })

  it('和弦练习的和弦名也是一行（同一套版式，别只修了和弦转换）', () => {
    setStore({ activeTab: 'chord_exercise' })
    const p = mount({
      chordExerciseTargetChord: { root: 'C', type: 'Major' },
      chordExerciseSequence: ['1', '3', '5'],
      chordExerciseCurrentStep: 0,
    })
    const title = p.container.querySelector('[data-fullscreen-title]') as HTMLElement | null
    expect(title, '找不到和弦练习的和弦名').toBeTruthy()
    expect(title!.className.split(/\s+/)).toContain('whitespace-nowrap')
    p.unmount()
  })
})
