/**
 * components/trainer-fretboard.tsx 的契约测试（此前零测试）。
 *
 * 这是**第三套指板皮肤**的渲染器，同时被两处使用：
 *   · `guitarrun-fretboard.tsx` 的 `skin='trainer'` 分支（练习指板，可点击）；
 *   · `caged-board.tsx` 的整幅 CAGED/音阶浏览器（只读）。
 * 它本身**不判断任何语义**（角色由调用方算好），所以这里钉的全是「渲染器该守的规矩」：
 *
 *  ① 结构：弦数 × (1 + fretCount) 个格子，`data-string` / `data-fret` 齐全；
 *  ② 只读 vs 可点击：不传 `onCellClick` 时**必须**渲染 `div`（不进 tab 序、不假装是按钮），
 *     传了才渲染 `button` —— 混用会让整幅 CAGED 变成 96 个 tab 停留点；
 *  ③ 可见性走 `data-visible`（铁律：`textContent` ≠ 屏幕所见，`visible:false` 的圆点必须留在 DOM 里）；
 *  ④ `data-role` 原样透传到圆点；**每个可能的 role 都必须在 globals.css 里有配色规则**
 *     （漏一个 = 圆点没有底色，静默变透明，不报错）；
 *  ⑤ 🚨 弦粗 `--ft-string-w` **两个分支都要设** —— 只设在 button 分支时，只读的整幅 CAGED
 *     会全部落到兜底的 1px，六根弦一样粗（这是本文件写出来时才发现的真 bug）；
 *  ⑥ 🚨 aria-label 的 `{note}` 占位符必须被替换 —— 漏了不报错，读屏会念「{note} 1弦 0品」
 *     （本皮肤第一版正是只替换了 `{string}`/`{fret}`，所以这里同时钉「无残留占位符」）；
 *  ⑦ 品记点只画在**中间那根弦**（不是最低音弦）；品号行的 marker 与 `fretMarkers` 一致。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  TrainerCagedLegend,
  TrainerFretboard,
  trainerStringLineWidth,
  type TrainerCellView,
} from '@/components/trainer-fretboard'
import { TRAINER_ROLE } from '@/components/guitarrun-fretboard'
import { CAGED_ADJACENT_PAIRS, CAGED_FORM_ORDER } from '@/lib/fretboard-trainer-theory'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k
const CJK = /[\u4e00-\u9fff]/

/** 0 = 最高音弦（与 INSTRUMENT_CONFIG 同约定） */
const STD = [4, 11, 7, 2, 9, 4]
const SEVEN = [4, 11, 7, 2, 9, 4, 11]
const FRETS = 15
const MARKERS = [3, 5, 7, 9, 12, 15]

/** 只覆盖 (5,8) 一格的最小 cells 表 —— 用来验证「没有条目的格子仍然渲染」 */
function sparseCells(): Map<string, TrainerCellView> {
  return new Map([['5-8', { text: 'C', role: 'root', visible: true, note: 'C' }]])
}

/** 覆盖每个位置 —— 用来验证「每个可点格子都有完整 aria-label」 */
function fullCells(tuning: number[]): Map<string, TrainerCellView> {
  const map = new Map<string, TrainerCellView>()
  for (let s = 0; s < tuning.length; s++) {
    for (let f = 0; f <= FRETS; f++) {
      map.set(`${s}-${f}`, { text: 'E', role: 'tone', visible: false, note: 'E' })
    }
  }
  return map
}

/** 模块级兜底拆树：断言失败会跳过用例自己的 unmount，残留 root 会让后续用例冒假失败 */
const mounted: Array<() => void> = []

function mount(overrides: Record<string, unknown> = {}) {
  const handleCellClick = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    tuning: STD,
    fretCount: FRETS,
    cells: sparseCells(),
    fretMarkers: MARKERS,
    openLabel: zh['fretboard_open_label'],
    t: tZh,
    ...overrides,
  }
  act(() => {
    root.render(createElement(TrainerFretboard as never, props as never))
  })

  const cells = () => [...container.querySelectorAll('.ft-cell')] as HTMLElement[]
  const cellAt = (s: number, f: number) =>
    container.querySelector(`.ft-cell[data-string="${s}"][data-fret="${f}"]`) as HTMLElement | null
  const dotOf = (s: number, f: number) => cellAt(s, f)?.querySelector('.ft-dot') as HTMLElement | null
  const unmount = () => {
    act(() => root.unmount())
    container.remove()
  }
  mounted.push(unmount)
  return { container, root, handleCellClick, cells, cellAt, dotOf, unmount }
}

afterEach(() => {
  for (const fn of mounted) {
    try {
      fn()
    } catch {
      /* 拆树失败不该影响后续用例 */
    }
  }
  mounted.length = 0
  document.body.innerHTML = ''
})

describe('结构', () => {
  it('格子数 = 弦数 × (1 个空弦 + fretCount 个品)', () => {
    const p = mount()
    expect(p.cells().length).toBe(STD.length * (1 + FRETS))
  })

  it('每个格子都带 data-string / data-fret', () => {
    const p = mount()
    const pairs = p.cells().map((el) => [el.dataset.string, el.dataset.fret])
    expect(pairs.filter(([, f]) => !/^\d+$/.test(f!)).length).toBe(0)
    expect(new Set(pairs.map(([s, f]) => `${s}-${f}`)).size).toBe(STD.length * (1 + FRETS))
  })

  it('品号行：第一格是 openLabel，之后是 1..fretCount', () => {
    const p = mount()
    const nums = [...p.container.querySelectorAll('.ft-num--open, .ft-nums > span:not(.ft-num--open)')]
    expect(nums.length).toBe(1 + FRETS)
    expect(nums[0].textContent).toBe(zh['fretboard_open_label'])
    expect(nums.slice(1).map((n) => n.textContent)).toEqual(
      Array.from({ length: FRETS }, (_, i) => String(i + 1)),
    )
  })

  it('品号行里 fretMarkers 的品号带 marker 类', () => {
    const p = mount()
    expect([...p.container.querySelectorAll('.ft-num--marker')].map((n) => n.textContent)).toEqual(
      MARKERS.map(String),
    )
  })

  it('弦数 / 品数跟随入参（七弦 = 7 行）', () => {
    const p = mount({ tuning: SEVEN, fretCount: 4 })
    expect(p.cells().length).toBe(7 * 5)
    expect(p.container.querySelectorAll('.ft-nums > span').length).toBe(5)
  })
})

describe('只读 vs 可点击：不许假装是按钮', () => {
  it('🚨 不传 onCellClick ⇒ 零个 button、全部是 div（整幅 CAGED 不该有 96 个 tab 停留点）', () => {
    const p = mount()
    expect(p.container.querySelectorAll('button').length).toBe(0)
    expect(p.cells().length).toBe(STD.length * (1 + FRETS))
    for (const el of p.cells()) expect(el.tagName).toBe('DIV')
  })

  it('传了 onCellClick ⇒ 全部是原生 button（键盘可达）', () => {
    const p = mount({ onCellClick: vi.fn() })
    expect(p.container.querySelectorAll('button.ft-cell').length).toBe(STD.length * (1 + FRETS))
  })

  it('点击回调收到 (弦索引, 品)', () => {
    const handleCellClick = vi.fn()
    const p = mount({ onCellClick: handleCellClick })
    act(() => {
      p.cellAt(3, 10)!.click()
    })
    expect(handleCellClick.mock.calls).toEqual([[3, 10]])
  })

  it('isCellEnabled 判 false 的弦：button 被 disabled，且点击不触发回调', () => {
    const handleCellClick = vi.fn()
    const p = mount({ onCellClick: handleCellClick, isCellEnabled: (s: number) => s === 0 })
    const enabled = p.cellAt(0, 3) as HTMLButtonElement
    const disabled = p.cellAt(4, 3) as HTMLButtonElement
    expect(enabled.disabled).toBe(false)
    expect(disabled.disabled).toBe(true)
    act(() => {
      disabled.click()
    })
    expect(handleCellClick).not.toHaveBeenCalled()
  })
})

describe('可见性与角色（textContent ≠ 屏幕所见）', () => {
  it('visible=false 的圆点仍在 DOM 里，靠 data-visible=0 表达不可见', () => {
    const p = mount()
    const dot = p.dotOf(0, 1)
    expect(dot && dot.tagName).toBe('SPAN')
    expect(dot!.getAttribute('data-visible')).toBe('0')
    // 不可见时文字为空 —— 但格子本身没有被卸载
    expect(dot!.textContent).toBe('')
    expect(p.cellAt(0, 1)).not.toBeNull()
  })

  it('visible=true 的圆点带文字且 data-visible=1', () => {
    const p = mount()
    const dot = p.dotOf(5, 8)
    expect(dot!.getAttribute('data-visible')).toBe('1')
    expect(dot!.textContent).toBe('C')
  })

  it('data-role 原样透传到圆点（含 `form-DC` 这种双色共享音）', () => {
    const cells = new Map<string, TrainerCellView>([
      ['0-0', { text: '', role: 'form-DC', visible: true, note: 'E' }],
      ['0-1', { text: '', role: 'form-AG', visible: true, note: 'F' }],
    ])
    const p = mount({ cells })
    expect(p.dotOf(0, 0)!.getAttribute('data-role')).toBe('form-DC')
    expect(p.dotOf(0, 1)!.getAttribute('data-role')).toBe('form-AG')
  })

  it('没有条目的格子：圆点仍在、data-visible=0、角色回落到 default；格子上的 data-role 为空', () => {
    const p = mount()
    expect(p.dotOf(0, 7)!.getAttribute('data-visible')).toBe('0')
    expect(p.dotOf(0, 7)!.getAttribute('data-role')).toBe('default')
    expect(p.cellAt(0, 7)!.getAttribute('data-role')).toBeNull()
  })
})

describe('🚨 弦粗 --ft-string-w：两个分支都要设', () => {
  it('六弦的宽度与参考站深色主题一致（1 / 1.5 / 2 / 2.5 / 3.2 / 4.2）', () => {
    expect([0, 1, 2, 3, 4, 5].map(trainerStringLineWidth)).toEqual([1, 1.5, 2, 2.5, 3.2, 4.2])
  })

  it('超过六弦走连续公式兜底，且不与前面任何一根重复', () => {
    const widths = [0, 1, 2, 3, 4, 5, 6].map(trainerStringLineWidth)
    expect(widths[6]).toBe(4.6)
    expect(new Set(widths).size).toBe(widths.length)
  })

  it('🚨 只读（整幅 CAGED）分支也把 --ft-string-w 写进 style —— 否则六根弦全落到兜底 1px', () => {
    const p = mount()
    for (let s = 0; s < STD.length; s++) {
      const style = p.cellAt(s, 5)!.getAttribute('style') ?? ''
      expect({ s, has: style.includes(`--ft-string-w: ${trainerStringLineWidth(s)}px`) }).toEqual({
        s,
        has: true,
      })
    }
  })

  it('可点击分支同样带上 --ft-string-w（两个分支不许分叉）', () => {
    const p = mount({ onCellClick: vi.fn() })
    const style = p.cellAt(5, 5)!.getAttribute('style') ?? ''
    expect(style).toContain('--ft-string-w: 4.2px')
  })
})

describe('品记点：画在中间那根弦上', () => {
  it('六弦 ⇒ 只有 index 3 那根弦有品记点，数量 = fretMarkers.length（0 品不画）', () => {
    const p = mount()
    const inlays = [...p.container.querySelectorAll('.ft-inlay')] as HTMLElement[]
    expect(inlays.length).toBe(MARKERS.length)
    const ownerStrings = p
      .cells()
      .filter((el) => el.querySelector('.ft-inlay'))
      .map((el) => Number(el.dataset.string))
    expect(new Set(ownerStrings)).toEqual(new Set([3]))
  })

  it('0 品（空弦列）不画品记点', () => {
    const p = mount()
    expect(p.cellAt(3, 0)!.querySelector('.ft-inlay')).toBeNull()
  })

  it('品记点是纯装饰（aria-hidden），不进无障碍树', () => {
    const p = mount()
    for (const el of p.container.querySelectorAll('.ft-inlay')) {
      expect(el.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('七弦 ⇒ 中间是 index 3（floor(7/2)）', () => {
    const p = mount({ tuning: SEVEN })
    const ownerStrings = p
      .cells()
      .filter((el) => el.querySelector('.ft-inlay'))
      .map((el) => Number(el.dataset.string))
    expect(new Set(ownerStrings)).toEqual(new Set([3]))
  })
})

describe('无障碍', () => {
  it('ariaLabel 存在时 .ft-board 是 role=group + aria-label；缺省时不给 role', () => {
    const withLabel = mount({ ariaLabel: 'C CAGED' })
    const board = withLabel.container.querySelector('.ft-board')!
    expect(board.getAttribute('role')).toBe('group')
    expect(board.getAttribute('aria-label')).toBe('C CAGED')
    withLabel.unmount()

    const without = mount()
    const bare = without.container.querySelector('.ft-board')!
    expect(bare.getAttribute('role')).toBeNull()
    expect(bare.getAttribute('aria-label')).toBeNull()
    without.unmount()
  })

  it('可点格子的 aria-label 走 i18n 模板（中文含「弦」「品」）', () => {
    const p = mount({ onCellClick: vi.fn() })
    expect(p.cellAt(5, 8)!.getAttribute('aria-label')).toBe('C 6弦 8品')
  })

  it('英文界面下 aria-label 不含任何汉字', () => {
    const p = mount({ onCellClick: vi.fn(), t: tEn, openLabel: en['fretboard_open_label'] })
    const label = p.cellAt(5, 8)!.getAttribute('aria-label') ?? ''
    expect(label).toBe('C, string 6, fret 8')
    expect(CJK.test(label), label).toBe(false)
  })

  it('🚨 每一格的 aria-label 都不残留 `{...}` 占位符（漏替换不报错，读屏会照着念）', () => {
    const p = mount({ onCellClick: vi.fn(), cells: fullCells(STD) })
    const labels = [...p.container.querySelectorAll('button.ft-cell')].map(
      (b) => b.getAttribute('aria-label') ?? '',
    )
    expect(labels.length).toBe(STD.length * (1 + FRETS))
    const leaked = labels.filter((l) => /[{}]/.test(l))
    expect(leaked, `残留占位符：${leaked.slice(0, 3).join(' | ')}`).toEqual([])
  })

  it('被禁用的弦不给 aria-label（与另两套皮肤一致）', () => {
    const p = mount({ onCellClick: vi.fn(), isCellEnabled: (s: number) => s !== 0 })
    expect(p.cellAt(0, 3)!.getAttribute('aria-label')).toBeNull()
    expect(p.cellAt(5, 3)!.getAttribute('aria-label')).not.toBeNull()
  })
})

describe('TrainerCagedLegend', () => {
  it('按环序渲染 C A G E D 五个形状色块', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(TrainerCagedLegend))
    })
    const items = [...container.querySelectorAll('.ft-legend > span')]
    expect(items.map((el) => el.textContent)).toEqual([...CAGED_FORM_ORDER])
    // 每个色块一个类，颜色在 CSS 里（.ft-legend-C 等）
    expect(items.map((el) => el.className)).toEqual([...CAGED_FORM_ORDER].map((f) => `ft-legend-${f}`))
    // 纯装饰
    expect(container.querySelector('.ft-legend')!.getAttribute('aria-hidden')).toBe('true')
    act(() => root.unmount())
    container.remove()
  })
})

describe('🚨 配色层守卫：每个可能出现的 role 都必须在 globals.css 里有规则', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')
  /** globals.css 里写了 `.ft-dot[data-role='X']` 的 X 集合 */
  const cssRoles = new Set(
    [...css.matchAll(/\.ft-dot\[data-role='([^']+)'\]/g)].map((m) => m[1]),
  )

  it('练习皮肤（TRAINER_ROLE）的每个非空角色都有配色', () => {
    const missing = Object.values(TRAINER_ROLE).filter((r) => r && !cssRoles.has(r))
    expect(missing, `缺配色的角色：${missing.join(', ')}`).toEqual([])
  })

  it('整幅浏览器的每个角色（root / default / seventh / blue + 五单形状 + 五相邻对）都有配色', () => {
    const needed = [
      'root',
      'default',
      'seventh',
      'blue',
      ...CAGED_FORM_ORDER.map((f) => `form-${f}`),
      ...CAGED_ADJACENT_PAIRS.map(([a, b]) => `form-${a}${b}`),
    ]
    const missing = needed.filter((r) => !cssRoles.has(r))
    expect(missing, `缺配色的角色：${missing.join(', ')}`).toEqual([])
  })

  it('反向对照：CSS 里不存在「没人会发」的角色规则（拼错的 form 对会被这条抓住）', () => {
    const emittable = new Set<string>([
      ...Object.values(TRAINER_ROLE).filter(Boolean),
      'root',
      'default',
      'seventh',
      'blue',
      ...CAGED_FORM_ORDER.map((f) => `form-${f}`),
      ...CAGED_ADJACENT_PAIRS.map(([a, b]) => `form-${a}${b}`),
    ])
    const dead = [...cssRoles].filter((r) => !emittable.has(r))
    expect(dead, `CSS 里有多余的角色规则：${dead.join(', ')}`).toEqual([])
  })

  it('data-visible 的开关规则存在（缺了 ⇒ 圆点永远不显示）', () => {
    expect(css).toMatch(/\.ft-dot\[data-visible='1'\]\s*\{/)
  })
})
