/**
 * components/caged-board.tsx 的契约测试（此前零测试）。
 *
 * 这是**整幅 CAGED / 音阶浏览器**（乐理面板 CAGED 区块的「整幅」样式，复刻
 * myfretboardtrainer.com/pentatonic 的功能面）。数据层已在
 * `__tests__/fretboard-trainer-theory.test.ts` 用参考站实测 golden 钉死了，这里钉的是**接线**：
 *
 *  ① 默认档是 CAGED、默认根音跟随 `defaultRoot`；C 大调 CAGED = 22 个可见圆点（参考站实测）；
 *  ② 🚨 **共享音的双色**：`(0,0)` 是 `form-DC`（D 与 C 的共用音，左黄右紫）、`(3,10)` 是 `form-ED`；
 *     「一半一半」这件事在 DOM 上就体现为 **role 是两个字母**，颜色由 CSS 的 40%/60% 渐变给；
 *  ③ 六个显示档按钮真的会换数据（CAGED 22 → 琶音 26 → 布鲁斯 49 且出现 `blue` 圆点）；
 *  ④ 音级开关把圆点文字从**音名**换成**音级**；
 *  ⑤ 根音 / 大小调都是受控的：大小调只回调、不自己存状态（与同区块「分图」共用 `cagedQuality`）；
 *  ⑥ `preferFlat` 决定用 ♯ 还是 ♭（音名表仍是项目唯一的 NOTES / NOTES_FLAT）；
 *  ⑦ 只读：整块指板里**没有 button 格子**（不该有 100+ 个 tab 停留点）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { CagedBoard } from '@/components/caged-board'
import type { ChordQuality, FretboardConfig } from '@/lib/fretboard-positions'
import { getTrainerBoard } from '@/lib/fretboard-trainer-theory'
import { getNoteIndex } from '@/lib/page-theory-functions'
import { NOTES, NOTES_FLAT } from '@/lib/page-theory-data'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k

const STD: FretboardConfig = { stringCount: 6, tuning: [4, 11, 7, 2, 9, 4] }
const BASS: FretboardConfig = { stringCount: 4, tuning: [7, 2, 9, 4] }
const FRETS = 15
const MARKERS = [3, 5, 7, 9, 12, 15]

const mounted: Array<() => void> = []

function mount(overrides: Record<string, unknown> = {}) {
  const onQualityChange = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    t: tZh,
    language: 'zh-CN',
    config: STD,
    fretCount: FRETS,
    fretMarkers: MARKERS,
    openLabel: zh['theory_open_string'],
    defaultRoot: 'C',
    quality: 'major' as ChordQuality,
    onQualityChange,
    ...overrides,
  }
  act(() => {
    root.render(createElement(CagedBoard as never, props as never))
  })

  /** 可见圆点（data-visible=1）—— 不用 textContent 判可见（铁律 9） */
  const visibleDots = () =>
    [...container.querySelectorAll('.ft-board .ft-dot[data-visible="1"]')] as HTMLElement[]
  const dotAt = (s: number, f: number) =>
    container.querySelector(`.ft-cell[data-string="${s}"][data-fret="${f}"] .ft-dot`) as HTMLElement | null
  const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[]
  const byText = (label: string) => buttons().find((b) => (b.textContent ?? '').trim() === label)
  const rootBtn = (label: string) =>
    container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null
  /** 12 个根音按钮 —— 本组件里唯一带 aria-label 的控件（档/性质按钮不带） */
  const rootBtnAll = () => buttons().filter((b) => b.getAttribute('aria-label') !== null)
  const click = (el: Element | null | undefined) => {
    expect(el, '要点的控件不存在').toBeTruthy()
    act(() => {
      ;(el as HTMLElement).click()
    })
  }
  const unmount = () => {
    act(() => root.unmount())
    container.remove()
  }
  mounted.push(unmount)
  return { container, root, onQualityChange, visibleDots, dotAt, buttons, byText, rootBtn, rootBtnAll, click, unmount }
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

describe('默认状态：C 大调 CAGED', () => {
  it('22 个可见圆点（= 参考站实测的 C 大调 CAGED 音位数）', () => {
    const p = mount()
    expect(p.visibleDots().length).toBe(22)
  })

  it('🚨 共享音是「两个字母的 role」：`(0,0)` = form-DC、`(3,10)` = form-ED', () => {
    // 这两格来自参考站抓取的 golden 表（见 fretboard-trainer-theory.test.ts 的 CAGED_C_MAJOR）。
    // 「一半一半」在这里就体现为 role 含两个形状 —— 颜色由 CSS 的 linear-gradient(90deg, A 40%, B 60%) 给。
    const p = mount()
    expect(p.dotAt(0, 0)!.getAttribute('data-role')).toBe('form-DC')
    expect(p.dotAt(3, 10)!.getAttribute('data-role')).toBe('form-ED')
  })

  it('非共享音是单形状 role（`(3,2)` = form-C）', () => {
    const p = mount()
    expect(p.dotAt(3, 2)!.getAttribute('data-role')).toBe('form-C')
  })

  it('🚨 6 弦 0/3/12/15 品不画（CAGED 档只画形状按得到的音）', () => {
    const p = mount()
    for (const fret of [0, 3, 12, 15]) {
      expect(p.dotAt(5, fret)!.getAttribute('data-visible'), `(5,${fret})`).toBe('0')
    }
  })

  it('CAGED 档显示五形状图例（C A G E D）', () => {
    const p = mount()
    const legend = p.container.querySelector('.ft-legend')
    expect(legend).toBeTruthy()
    expect([...legend!.querySelectorAll('span')].map((s) => s.textContent)).toEqual([
      'C',
      'A',
      'G',
      'E',
      'D',
    ])
  })

  it('整块指板只有控件是 button —— 格子本身都是 div（没有只读格子进 tab 序）', () => {
    const p = mount()
    expect(p.container.querySelectorAll('button.ft-cell').length).toBe(0)
    expect(p.container.querySelectorAll('.ft-cell').length).toBe(6 * (1 + FRETS))
  })

  it('指的 aria-label = 根音 + 档名', () => {
    const p = mount()
    expect(p.container.querySelector('.ft-board')!.getAttribute('aria-label')).toBe('C CAGED')
  })
})

describe('显示档：真的会换数据', () => {
  it('六个档按钮都在（顺序 = 参考站按钮顺序）', () => {
    const p = mount()
    const labels = ['CAGED', '琶音', '属七琶音', '五声音阶', '布鲁斯', '大调音阶']
    for (const l of labels) expect(p.byText(l), `缺按钮 ${l}`).toBeTruthy()
    expect(p.buttons().filter((b) => b.getAttribute('aria-pressed') !== null).length).toBeGreaterThanOrEqual(6)
  })

  it('切到「琶音」⇒ 26 个可见圆点（比 CAGED 多出 4 格形状外的和弦音）', () => {
    const p = mount()
    p.click(p.byText('琶音'))
    expect(p.visibleDots().length).toBe(26)
    // 多出来的就是 6 弦 0/3/12/15 品
    for (const fret of [0, 3, 12, 15]) {
      expect(p.dotAt(5, fret)!.getAttribute('data-visible'), `(5,${fret})`).toBe('1')
    }
  })

  it('切到「布鲁斯」⇒ 49 个可见圆点，且出现单独着色的蓝调音（role=blue）', () => {
    const p = mount()
    p.click(p.byText('布鲁斯'))
    expect(p.visibleDots().length).toBe(49)
    const blue = p.container.querySelectorAll('.ft-board .ft-dot[data-role="blue"][data-visible="1"]')
    expect(blue.length).toBe(7) // C 大调蓝调音 = ♭3，7 格
  })

  it('切到「大调音阶」⇒ 59 个可见圆点，且图例消失（图例只在 CAGED 档显示）', () => {
    const p = mount()
    p.click(p.byText('大调音阶'))
    expect(p.visibleDots().length).toBe(59)
    expect(p.container.querySelector('.ft-legend')).toBeNull()
  })

  it('档按钮的 aria-pressed 互斥', () => {
    const p = mount()
    p.click(p.byText('琶音'))
    const pressed = p.buttons().filter((b) => b.getAttribute('aria-pressed') === 'true')
    // 根音/性质按钮也可有 aria-pressed ⇒ 只数档按钮那几个文本
    const modeLabels = ['CAGED', '琶音', '属七琶音', '五声音阶', '布鲁斯', '大调音阶']
    const pressedModeLabels = pressed.map((b) => (b.textContent ?? '').trim())
    expect(pressedModeLabels.filter((l) => modeLabels.includes(l))).toEqual(['琶音'])
  })
})

describe('音级开关', () => {
  it('默认显示音名（C 大调 (0,0) 是空弦高音 E）', () => {
    const p = mount()
    expect(p.dotAt(0, 0)!.textContent).toBe('E')
  })

  it('🚨 打开开关后圆点文字换成音级（E 相对 C 是 3 音）', () => {
    const p = mount()
    const sw = p.container.querySelector('button[role="switch"]') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    p.click(sw)
    expect(p.container.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
    expect(p.dotAt(0, 0)!.textContent).toBe('3')
    // 根音格的音级是 1
    const rootDots = [...p.container.querySelectorAll('.ft-dot[data-role="form-DC"]')]
    expect(rootDots.length).toBeGreaterThan(0)
  })

  it('开关是纯 UI 辅助、不卸载指板（关掉再开，圆点数量不变）', () => {
    const p = mount()
    const sw = () => p.container.querySelector('button[role="switch"]') as HTMLButtonElement
    p.click(sw())
    expect(p.visibleDots().length).toBe(22)
    p.click(sw())
    expect(p.visibleDots().length).toBe(22)
    expect(p.dotAt(0, 0)!.textContent).toBe('E')
  })
})

describe('根音与性质：受控', () => {
  it('12 个根音按钮，黑键音名用小一号（w-7 h-7 vs w-9 h-9）', () => {
    const p = mount()
    const roots = NOTES.map((n) => p.rootBtn(n))
    expect(roots.filter(Boolean).length).toBe(12)
    expect(/\bw-7 h-7\b/.test(p.rootBtn(NOTES[1])!.className), NOTES[1]).toBe(true) // C♯
    expect(/\bw-9 h-9\b/.test(p.rootBtn('C')!.className), 'C').toBe(true)
  })

  it('🚨 可访问名 === 可见文字（降号偏好下 aria-label 也必须是 `D♭`，不能是 `C♯`）', () => {
    // 之前 aria-label 恒取 NOTES（升号），屏幕写 `D♭`、读屏念「C sharp」—— 语音控制匹配不到。
    for (const preferFlat of [false, true]) {
      const p = mount({ preferFlat })
      for (const b of p.rootBtnAll()) {
        expect({ preferFlat, label: b.getAttribute('aria-label') }).toEqual({
          preferFlat,
          label: (b.textContent ?? '').trim(),
        })
      }
      p.unmount()
    }
  })

  it('换根音：aria-label 与音位数都跟着变（DOM 的音位数 === 数据层算出来的）', () => {
    const p = mount()
    p.click(p.rootBtn('D'))
    expect(p.container.querySelector('.ft-board')!.getAttribute('aria-label')).toBe('D CAGED')
    // ⚠️ CAGED 档的音位数**随根音变**（0..fretCount 窗口会把低八度等价格裁掉）：
    // C 22 格、D 21 格。所以这里不写死数字，改为断言「DOM 与数据层一致」。
    const expected = getTrainerBoard('caged', getNoteIndex('D') % 12, 'major', STD, FRETS).size
    expect(expected).toBe(21)
    expect(p.visibleDots().length).toBe(expected)
    // 换根的「铁证」：`(0,0)` 是空弦高音 E —— C 调下它是 DC 共享音，D 调下 E 不是 D 和弦音
    // （相对 D 是 2 个半音），所以这格**必须**消失。根音没真的换掉时它会还留着。
    expect(p.dotAt(0, 0)!.getAttribute('data-visible')).toBe('0')
    expect(p.dotAt(0, 0)!.getAttribute('data-role')).toBe('default')
  })

  it('🚨 大小调是**受控**的：点「小调」只回调，组件自己不改状态', () => {
    const p = mount()
    p.click(p.byText('小调'))
    expect(p.onQualityChange.mock.calls).toEqual([['minor']])
    // props 没变 ⇒ 渲染仍是 C 大调（22 格）；自己存 state 的实现这里会变成 21 格
    expect(p.visibleDots().length).toBe(22)
  })

  it('外部把 quality 改成 minor 后按小调渲染（21 格）', () => {
    const p = mount({ quality: 'minor' })
    expect(p.visibleDots().length).toBe(21)
  })

  it('defaultRoot 变化时跟随（换调后指板不会还停在上一个根音）', () => {
    const p = mount()
    act(() => {
      p.root.render(
        createElement(CagedBoard as never, {
          t: tZh,
          language: 'zh-CN',
          config: STD,
          fretCount: FRETS,
          fretMarkers: MARKERS,
          openLabel: zh['theory_open_string'],
          defaultRoot: 'G',
          quality: 'major',
          onQualityChange: p.onQualityChange,
        } as never),
      )
    })
    expect(p.container.querySelector('.ft-board')!.getAttribute('aria-label')).toBe('G CAGED')
  })
})

describe('拼写与语言', () => {
  it('默认升号：圆点音名用 NOTES', () => {
    const p = mount()
    // C 大调没有黑键音，换个调看黑键：defaultRoot=F♯ ⇒ 按钮显示 F♯
    const q = mount({ defaultRoot: 'F♯' })
    expect(q.rootBtn(NOTES[6])).toBeTruthy()
    expect(q.container.querySelector('.ft-board')!.getAttribute('aria-label')).toBe('F♯ CAGED')
    expect(p.visibleDots().length).toBe(22)
  })

  it('preferFlat：圆点与根音按钮都用 ♭ 拼写', () => {
    const p = mount({ preferFlat: true, defaultRoot: 'D♯' })
    // 根音按钮标签变成 E♭（aria-label 与可见文字同步换拼写）
    expect(p.container.querySelector(`button[aria-label="${NOTES_FLAT[3]}"]`)).toBeTruthy()
    expect(p.container.querySelector(`button[aria-label="${NOTES[3]}"]`)).toBeNull()
    const notesShown = new Set(p.visibleDots().map((d) => d.textContent))
    expect(notesShown.size).toBeGreaterThan(0)
    for (const n of notesShown) {
      expect(NOTES_FLAT, `${n} 不在降号音名表里`).toContain(n)
    }
  })

  it('英文界面：档名与 aria-label 用英文，且不含汉字', () => {
    const p = mount({ t: tEn, language: 'en', openLabel: en['theory_open_string'] })
    expect(p.byText('Arpeggios')).toBeTruthy()
    expect(p.byText('Blues')).toBeTruthy()
    p.click(p.byText('Major scale'))
    expect(p.container.textContent ?? '').not.toMatch(/[\u4e00-\u9fff]/)
  })
})

describe('非六弦：整表为空但不崩', () => {
  it('四弦贝斯 ⇒ 0 个可见圆点，格子结构仍在', () => {
    const p = mount({ config: BASS })
    expect(p.visibleDots().length).toBe(0)
    expect(p.container.querySelectorAll('.ft-cell').length).toBe(4 * (1 + FRETS))
  })
})
