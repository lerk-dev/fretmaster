/**
 * 三套指板皮肤（经典 / GuitarRun / MyFretboardTrainer）**功能对齐**的护栏。
 *
 * 2026-11-13 审计发现：三套皮肤的「判定 + 配色语义」完全同源（都走
 * `lib/fretboard-cell-role.ts`），缺的全在**渲染层**。本文件把修掉的四处缺口逐个钉住：
 *
 *  ① 圆点皮肤的品列下限 —— 列原来是 `minmax(0, 1fr)`，可以压到比圆点还窄，
 *     相邻圆点互相压住（390px/24 品实测：Trainer 格子 12.8px / 圆点 24px = 1.88×，
 *     连默认 15 品也已经 1.18×）；同时 `.gr-scroll/.ft-scroll { overflow-x:auto }`
 *     因为「永远不会溢出」而成了死代码。
 *  ② 宽度要跟内容走 —— 只给列下限还不够：指板盒子仍是容器宽，`inset-0` 的连线覆盖层
 *     只有可视宽，横滚到右边时路径线被截断。
 *  ③ 经典皮肤的横向滚动 —— 它没有 `.gr-scroll`，格子又有 `min-w-[20px]`，
 *     17 品以上直接被 `overflow-hidden` 裁掉且滚不动（24 品裁 150px，品号只到 18）。
 *  ④ 功能缺口：trainer 缺新手引导锚点、「答错」配色与「压暗」同色、经典缺品记、
 *     弦号手写 `+1`（值等价 ⇒ 行为测不出来，只能源码钉住）、✓/✗ 角标只有经典有、
 *     3NPS「预览根音」的语义色三套不一致。
 *
 * ⚠️ 几何类结论（圆点是否压住、是否被裁）**无法在 jsdom 里断言**（没有布局引擎），
 *    这里钉的是「产生该几何的源码条件」；真实几何由 CDP 探针
 *    `local-only/probe-skin-parity.mjs` 复核。
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PracticeFretboard } from '@/components/practice-fretboard'
import { TrainerFretboard, type TrainerCellView } from '@/components/trainer-fretboard'
import { PREVIEW_CLASS } from '@/lib/fretboard-note-button-color'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import { SCALE_MODES } from '@/lib/page-theory-data'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k

const read = (rel: string) => fs.readFileSync(rel, 'utf8')
const stripCssComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '')
/**
 * 剥掉 TS/TSX 注释再断言。
 * 🚨 不剥的话，**注释里的反例**会把 `not.toContain` 判红（本文件第一次跑就是：
 *    源码注释写着「不是 `minmax(0, 1fr)`」，于是「不许出现」的断言命中了注释）。
 */
const stripJs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const CSS_RAW = read('app/globals.css')
const CSS = stripCssComments(CSS_RAW)

/** 取某选择器的规则体（锚点必须是规则起始处，避免命中后代选择器的后半段） */
function ruleBody(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{`, 'm').exec(css)
  expect(m, `globals.css 里找不到规则 ${selector}（选择器改名了？）`).not.toBeNull()
  const start = m!.index + m![0].length
  return css.slice(start, css.indexOf('}', start))
}

/**
 * 逗号并列的选择器（`A,\nB { ... }`）取规则体。
 * `ruleBody` 只认「单选择器紧跟 `{`」，并列时会在 `,` 处失败 ⇒ 用本函数。
 */
function ruleWindow(css: string, selector: string): string {
  const at = css.indexOf(selector)
  expect(at, `globals.css 里找不到选择器 ${selector}`).toBeGreaterThanOrEqual(0)
  const brace = css.indexOf('{', at)
  expect(brace, `${selector} 后面没有规则体`).toBeGreaterThan(at)
  return css.slice(brace + 1, css.indexOf('}', brace))
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = []
afterEach(() => {
  for (const { root, el } of mounted.splice(0)) {
    act(() => root.unmount())
    el.remove()
  }
})

function mountEl(element: ReturnType<typeof createElement>): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  act(() => { root.render(element) })
  mounted.push({ root, el })
  return el
}

/** 经典皮肤：最小可用 props（判定的细节不是本文件的关注点） */
function mountClassic(fretCount = 15): HTMLElement {
  const state = useAppStore.getState()
  useAppStore.setState({
    activeTab: 'chord',
    isPlaying: false,
    practice: { ...state.practice, fretCount },
    user: { ...state.user, instrument: 'six_string_guitar' },
  })
  return mountEl(
    createElement(PracticeFretboard as never, {
      t: tZh,
      formatNoteByAccidentalSetting: (n: string) => n,
      handleFretClick: () => {},
      getNoteButtonColor: () => '',
      showAllNotes: true,
      highlightedFrets: new Map<string, boolean>(),
      selectedStrings: [],
      rootNote: 'E',
      selectedIntervals: [],
      scaleKey: 'E',
      selectedScale: SCALE_MODES.pentatonic[0],
      scaleExerciseSequence: [],
      transposedChords: [],
      currentChordIndex: 0,
      chordExerciseTargetChord: null,
      targetNote: 'E',
      practiceAnswerMode: 'mic',
      highlightedTargetPosition: null,
      threeNpsTarget: null,
      threeNpsCellKeys: new Map(),
      FRET_MARKERS: [3, 5, 7, 9, 12, 15],
    } as never),
  )
}

const STD = [4, 11, 7, 2, 9, 4]
const FRETS = 15
const MARKERS = [3, 5, 7, 9, 12, 15]

function trainerCells(frets = FRETS): Map<string, TrainerCellView> {
  const map = new Map<string, TrainerCellView>()
  for (let s = 0; s < STD.length; s++) {
    for (let f = 0; f <= frets; f++) {
      map.set(`${s}-${f}`, { text: 'E', role: 'tone', visible: false, note: 'E' })
    }
  }
  return map
}

function mountTrainer(extra: Record<string, unknown> = {}): HTMLElement {
  return mountEl(
    createElement(TrainerFretboard as never, {
      tuning: STD,
      fretCount: FRETS,
      cells: trainerCells(),
      fretMarkers: MARKERS,
      openLabel: '空弦',
      t: tZh,
      onCellClick: () => {},
      ...extra,
    } as never),
  )
}

describe('① 圆点皮肤：品列必须有下限（否则圆点互相压住）', () => {
  const gr = stripJs(read('components/guitarrun-fretboard.tsx'))
  const ft = stripJs(read('components/trainer-fretboard.tsx'))

  it('两套皮肤的列模板都用 minmax(var(--*-fret-min), 1fr)', () => {
    expect(gr, 'GuitarRun 的列模板没有下限').toContain(
      'repeat(${fretCount}, minmax(var(--gr-fret-min), 1fr))',
    )
    expect(ft, 'Trainer 的列模板没有下限').toContain(
      'repeat(${fretCount}, minmax(var(--ft-fret-min), 1fr))',
    )
  })

  it('🚨 不再有 minmax(0, 1fr)：0 下限 = 格子可以压到比圆点还窄', () => {
    expect(gr, 'GuitarRun 又退回无下限的列').not.toContain('minmax(0, 1fr)')
    expect(ft, 'Trainer 又退回无下限的列').not.toContain('minmax(0, 1fr)')
  })

  it('下限 = 圆点 + 4px，且定义在各自的 stage 作用域里（跟随 --board-scale 缩放）', () => {
    expect(ruleBody(CSS, '.gr-stage')).toContain('--gr-fret-min: calc(var(--gr-dot) + 2px)')
    expect(ruleBody(CSS, '.ft-stage')).toContain('--ft-fret-min: calc(var(--ft-dot) + 2px)')
    // 反向：不许写死像素（否则显示缩放后圆点变大了、下限没变 ⇒ 又压住）
    expect(ruleBody(CSS, '.gr-stage'), '下限写死了 px').not.toMatch(/--gr-fret-min:\s*\d+px/)
    expect(ruleBody(CSS, '.ft-stage'), '下限写死了 px').not.toMatch(/--ft-fret-min:\s*\d+px/)
  })
})

describe('② 指板盒子必须跟内容一起变宽（否则连线覆盖层被截断）', () => {
  for (const sel of ['.gr-fretboard', '.gr-fret-numbers', '.ft-grid', '.ft-board', '.ft-nums']) {
    it(`${sel} 同时有 width: max-content 与 min-width: 100%`, () => {
      const body = ruleBody(CSS, sel)
      expect(body, `${sel} 缺 width: max-content ⇒ 盒子恒等于容器宽，横滚时覆盖层错位`).toContain('width: max-content')
      expect(body, `${sel} 缺 min-width: 100% ⇒ 宽容器下不再铺满`).toContain('min-width: 100%')
    })
  }
})

describe('③ 经典皮肤：品数多 / 窄屏时必须能横向滚动', () => {
  it('指板与品号行包在同一个 overflow-x-auto 容器里', () => {
    const el = mountClassic()
    const scroller = el.querySelector('.overflow-x-auto')
    expect(scroller, '经典皮肤没有横向滚动容器 ⇒ 17 品以上直接被裁掉且滚不动').not.toBeNull()
    // 按钮（指板本体）和品记（品号行）必须在**同一个**滚动容器内，否则滚动时错位
    expect(scroller!.querySelectorAll('button').length).toBe(STD.length * (FRETS + 1))
    expect(scroller!.querySelector('[data-marker="1"]'), '品号行不在滚动容器内').not.toBeNull()
  })

  it('内层是 w-max min-w-full（内容窄时铺满、内容宽时跟内容走）', () => {
    const el = mountClassic()
    const inner = el.querySelector('.overflow-x-auto > .w-max.min-w-full')
    expect(inner, '缺 w-max min-w-full ⇒ 内层恒等于容器宽，格子溢出到盒子外（覆盖层/边框错位）').not.toBeNull()
    expect(inner!.querySelectorAll('button').length).toBe(STD.length * (FRETS + 1))
  })
})

describe('④ Trainer 皮肤：新手引导锚点', () => {
  it('传 dataOnboarding 时挂在 .ft-stage 上（引导第 2 步才有 spotlight）', () => {
    const el = mountTrainer({ dataOnboarding: 'fretboard' })
    const stage = el.querySelector('.ft-stage')
    expect(stage, '找不到 .ft-stage').not.toBeNull()
    expect(stage!.getAttribute('data-onboarding')).toBe('fretboard')
  })

  it('不传时**没有**该属性（乐理面板不能多出一个同名锚点）', () => {
    const el = mountTrainer()
    expect(el.querySelector('[data-onboarding]'), '默认就该没有锚点').toBeNull()
  })

  it('guitarrun 的 trainer 分支显式传了 dataOnboarding="fretboard"', () => {
    const gr = stripJs(read('components/guitarrun-fretboard.tsx'))
    const branchStart = gr.indexOf("skin === 'trainer'")
    expect(branchStart, '找不到 trainer 分支').toBeGreaterThan(-1)
    const grStage = gr.indexOf('className="gr-stage"', branchStart)
    expect(grStage, '找不到 GuitarRun 分支的根节点（拿不到分支边界）').toBeGreaterThan(branchStart)
    const trainerBranch = gr.slice(branchStart, grStage)
    expect(trainerBranch, 'trainer 分支没传引导锚点 ⇒ 换到该皮肤后引导找不到指板').toContain(
      'dataOnboarding="fretboard"',
    )
  })
})

describe('⑤ Trainer 皮肤：答错必须与「压暗」区分开', () => {
  it('wrong 走红色系（--ft-danger），不再是与 muted 同族的灰蓝', () => {
    const wrong = ruleBody(CSS, ".ft-dot[data-role='wrong']")
    expect(wrong, '答错没有用红色').toContain('--ft-danger')
    expect(wrong, '又退回灰蓝 rgba(148,163,184)——与「压暗」几乎同色').not.toContain('148, 163, 184')
  })

  it('wrong 与 muted 的主色不同（换皮肤不能换掉「对/错」的语义）', () => {
    const muted = ruleBody(CSS, ".ft-dot[data-role='muted']")
    const wrong = ruleBody(CSS, ".ft-dot[data-role='wrong']")
    const colorOf = (body: string) => (body.match(/rgba?\([^)]*\)/g) ?? [])[0]
    expect(colorOf(muted)).toBeTruthy()
    expect(colorOf(wrong)).toBeTruthy()
    expect(colorOf(wrong), 'wrong 与 muted 用了同一个颜色').not.toBe(colorOf(muted))
  })
})

describe('⑥ 经典皮肤：补上品记（另两套都有）', () => {
  it('品号行按 FRET_MARKERS 落 data-marker', () => {
    const el = mountClassic()
    const marked = [...el.querySelectorAll('[data-marker="1"]')].map((n) =>
      Number(n.getAttribute('data-fret-number')),
    )
    expect(marked, '品记覆盖的品号不对').toEqual(MARKERS.filter((f) => f <= FRETS))
  })

  it('标记品的小圆点绝对定位（不改变行高，否则整块指板会下移）', () => {
    const el = mountClassic()
    const marker = el.querySelector('[data-marker="1"]')!
    const dot = marker.querySelector('span.rounded-full')
    expect(dot, '标记品没有品记圆点').not.toBeNull()
    expect(dot!.className, '品记圆点必须绝对定位（否则改变行高）').toContain('absolute')
    expect(dot!.className, '品记圆点没上色').toContain('bg-primary')
  })

  it('非标记品只留透明占位（不画实心点）', () => {
    const el = mountClassic()
    const plain = [...el.querySelectorAll('[data-fret-number]')].filter(
      (n) => n.getAttribute('data-marker') !== '1',
    )
    expect(plain.length, '品号行格子数不对').toBe(FRETS - MARKERS.filter((f) => f <= FRETS).length)
    for (const n of plain) {
      const dot = n.querySelector('span.rounded-full')
      expect(dot, '非标记品连占位都没有 ⇒ 各行高度不一致').not.toBeNull()
      expect(dot!.className, '非标记品画了个实心点').toContain('bg-transparent')
    }
  })
})

describe('⑦ 弦号走唯一真相源', () => {
  it('🚨 trainer 的 aria-label 不许手写 stringIndex + 1（值等价 ⇒ 行为测不出来）', () => {
    const ft = stripJs(read('components/trainer-fretboard.tsx'))
    expect(ft, 'trainer 又手写弦号偏移').not.toContain('stringIndex + 1')
    expect(ft, 'trainer 没走唯一真相源').toContain('stringIndexToNumber(stringIndex)')
    expect(ft, '没 import 真相源').toContain("from '@/lib/string-index'")
  })
})

describe('⑧ 对/错的**非颜色**编码：三套皮肤都要有', () => {
  it('圆点皮肤补了 ✓ / ✗ 角标', () => {
    expect(ruleWindow(CSS, '.gr-cell--hit .gr-note-dot::after'), 'GuitarRun 的对勾角标没了').toContain("content: '✓'")
    expect(ruleWindow(CSS, '.gr-cell--wrong .gr-note-dot::after'), 'GuitarRun 的叉号角标没了').toContain("content: '✗'")
    expect(ruleWindow(CSS, ".ft-dot[data-role='matched']::after"), 'Trainer 的对勾角标没了').toContain("content: '✓'")
    expect(ruleWindow(CSS, ".ft-dot[data-role='wrong']::after"), 'Trainer 的叉号角标没了').toContain("content: '✗'")
  })

  it('经典皮肤原本就有（对照组，删掉要红）', () => {
    expect(ruleBody(CSS, '.fret-feedback-correct::after')).toContain("content: '✓'")
    expect(ruleBody(CSS, '.fret-feedback-wrong::after')).toContain("content: '✗'")
  })

  it('角标不写 font-family（`.gr-` 区块的字体族条数被另一条护栏钉死）', () => {
    expect(ruleWindow(CSS, '.gr-cell--hit .gr-note-dot::after')).not.toContain('font-family')
  })
})

describe('⑨ 3NPS「下一把位预览根音」三套皮肤同一语义色', () => {
  it('Trainer 不再是玫红，改成青柠（与经典 lime / GuitarRun --gr-acid 同族）', () => {
    const body = ruleBody(CSS, ".ft-dot[data-role='preview-root']")
    expect(body, '又退回玫红').not.toContain('251, 113, 133')
    expect(body, '不是青柠系').toContain('163, 230, 53')
  })

  it('另外两套确实是青柠系（对照，防止只改一套）', () => {
    expect(PREVIEW_CLASS.root, '经典的预览根音不是青柠').toContain('lime')
    expect(ruleBody(CSS, '.gr-cell--next-root .gr-note-dot')).toContain('--gr-acid')
  })
})
