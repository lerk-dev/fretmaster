/**
 * SettingsDisplaySection —— 「显示与外观」折叠段契约测试
 *
 * 纯受控组件（状态全在 props、修改全走回调），且**必须渲染在 Accordion 上下文里**
 * （它返回的是 AccordionItem）。测试用真实 Accordion 包裹并默认展开。
 *
 * 重点契约：
 *  ① 主题色卡：11 个风格 × 当前明暗 → 点击回传 composeTheme(风格, **当前明暗**)（保留明暗）
 *  ② 明暗按钮：composeTheme(**当前风格**, 目标明暗)（保留风格）
 *  ③ 缩放滑块：内部用百分比（displayScale*100），回传时 ÷100；range 80..150 step 10
 *  ④ 细粒度偏好：三个 3 选 1（小调符号 / 半减七 / 7b9）+ 7b9 音阶三选一，
 *     回传的是 **patch 对象**而非整体替换
 *  ⑤ 语言相关文案：多数分节用 language 内联文案，少数几处走 t()
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { SettingsDisplaySection } from '@/components/settings-display-section'
import { Accordion } from '@/components/ui/accordion'
import { composeTheme, parseTheme, type ChordSymbolSettings, type ThemeMode } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const tZh = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k
const tEn = (k: string) => (TRANSLATIONS['en'] as Record<string, string>)[k] ?? k

const DEFAULT_SYMBOLS: ChordSymbolSettings = {
  minorSymbol: 'm',
  minor7flat5Symbol: 'ø7',
  dominant7flat9Symbol: '7b9',
  useUnicode: false,
  useJazzNotation: false,
  sevenFlatNineScaleChoice: 'altered',
}

type Props = Record<string, unknown>

/** 选中态判据：default 变体带 bg-primary（Button 不输出 data-variant） */
const isActive = (el: HTMLElement | undefined) => Boolean(el && /\bbg-primary\b/.test(el.className))

function mount(props: Props = {}, lang: 'zh-CN' | 'en' = 'zh-CN') {
  const calls: Record<string, unknown[]> = {}
  const track = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args.length > 1 ? args : args[0])
  }
  const base: Props = {
    t: lang === 'en' ? tEn : tZh,
    language: lang,
    fullscreenMode: 'windowed',
    onFullscreenModeChange: track('fullscreen'),
    onSelectLanguage: track('language'),
    theme: composeTheme('classic', 'dark'),
    onThemeChange: track('theme'),
    displayScale: 1,
    onDisplayScaleChange: track('scale'),
    chordScaleDisplay: 'chinese',
    onChordScaleDisplayChange: track('chordScale'),
    noteAccidentalDisplay: 'sharp',
    onNoteAccidentalDisplayChange: track('accidental'),
    chordSymbols: DEFAULT_SYMBOLS,
    onChordSymbolChange: track('symbols'),
    fretboardStyle: 'classic' as const,
    onFretboardStyleChange: track('fretboardStyle'),
    pianoKeyboardStyle: 'classic' as const,
    onPianoKeyboardStyleChange: track('pianoKeyboardStyle'),
    ...props,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(
        Accordion as never,
        { type: 'multiple', defaultValue: ['display'] } as never,
        createElement(SettingsDisplaySection as never, base as never) as ReactNode,
      ),
    )
  })
  const text = () => container.textContent ?? ''
  const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[]
  const btn = (label: string) => buttons().find((b) => b.textContent?.trim() === label)
  const sliders = () => [...container.querySelectorAll('[role="slider"]')] as HTMLElement[]
  const click = (el: HTMLElement | undefined) => {
    expect(el, '待点击元素应存在').toBeTruthy()
    act(() => {
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }
  return {
    container,
    calls,
    text,
    buttons,
    btn,
    sliders,
    click,
    isActive,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

/** 从 rgb(r, g, b) 取绿分量 */
function greenOf(el: HTMLElement | undefined): number {
  const m = /rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/.exec(el?.style.background ?? '')
  expect(m, `应能解析 rgb：${el?.style.background}`).toBeTruthy()
  return Number(m![2])
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SettingsDisplaySection', () => {
  describe('折叠段', () => {
    it('折叠时内容不渲染、标题仍在；展开后才出现内容', () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      const minimal: Props = {
        t: tZh,
        language: 'zh-CN',
        fullscreenMode: 'windowed',
        onFullscreenModeChange: () => {},
        onSelectLanguage: () => {},
        theme: composeTheme('classic', 'dark'),
        onThemeChange: () => {},
        displayScale: 1,
        onDisplayScaleChange: () => {},
        chordScaleDisplay: 'chinese',
        onChordScaleDisplayChange: () => {},
        noteAccidentalDisplay: 'sharp',
        onNoteAccidentalDisplayChange: () => {},
        chordSymbols: DEFAULT_SYMBOLS,
        onChordSymbolChange: () => {},
      }
      act(() => {
        root.render(
          createElement(
            Accordion as never,
            { type: 'multiple' } as never,
            createElement(SettingsDisplaySection as never, minimal as never) as ReactNode,
          ),
        )
      })
      expect(container.textContent).toContain('显示与外观')
      expect(container.textContent).not.toContain('全屏类型')
      const trigger = container.querySelector('[data-slot="accordion-trigger"]') as HTMLElement
      expect(trigger).toBeTruthy()
      act(() => {
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      expect(container.textContent).toContain('全屏类型')
      act(() => root.unmount())
      container.remove()
    })

    it('标题按语言切换（中文「显示与外观」/ 英文 Display & Appearance）', () => {
      const zh = mount()
      expect(zh.text()).toContain('显示与外观')
      zh.unmount()
      const en = mount({ language: 'en' }, 'en')
      expect(en.text()).toContain('Display & Appearance')
      en.unmount()
    })
  })

  describe('全屏类型', () => {
    it('两个按钮回传 windowed / fullscreen，选中态反映 props', () => {
      const p = mount({ fullscreenMode: 'windowed' })
      expect(p.isActive(p.btn('窗口全屏'))).toBe(true)
      expect(p.isActive(p.btn('真全屏'))).toBe(false)
      p.click(p.btn('真全屏'))
      expect(p.calls.fullscreen).toEqual(['fullscreen'])
      p.unmount()
    })

    it('当前为 fullscreen 时「真全屏」是选中态', () => {
      const p = mount({ fullscreenMode: 'fullscreen' })
      expect(p.isActive(p.btn('真全屏'))).toBe(true)
      expect(p.isActive(p.btn('窗口全屏'))).toBe(false)
      p.unmount()
    })

    it('说明文案按语言切换，且如实描述「窗口全屏不动窗口 / 真全屏含任务栏」的语义', () => {
      // 🚨 这段文案是用户了解两种模式**唯一**的地方（设置项本身只存一个枚举）。
      // 语义由用户 2026-10-03 **二次**拍板：「窗口全屏＝当前窗口全屏，不是最大化留任务栏，
      // 当前窗口的大小保持不变，内容填满当前窗口」。
      // 第一版文案写的是「最大化窗口，保留任务栏」—— 已被用户否掉，别再改回去。
      const zh = mount()
      const zhText = zh.text()
      expect(zhText).toContain('窗口全屏：内容铺满当前窗口，窗口大小不变')
      expect(zhText).toContain('真全屏：覆盖整个屏幕（含任务栏）')
      // 反面：绝不能再出现「最大化」（那正是被否掉的旧语义）
      expect(zhText).not.toContain('最大化窗口')
      zh.unmount()

      const en = mount({ language: 'en' }, 'en')
      const enText = en.text()
      expect(enText).toContain('without resizing it')
      expect(enText).toContain('including the taskbar')
      en.unmount()
    })
  })

  describe('语言', () => {
    it('两个语言按钮回传 zh-CN / en，选中态反映 language', () => {
      const p = mount({ language: 'zh-CN' })
      expect(p.isActive(p.btn(tZh('lang_zh')))).toBe(true)
      expect(p.isActive(p.btn(tZh('lang_en')))).toBe(false)
      p.click(p.btn(tZh('lang_en')))
      expect(p.calls.language).toEqual(['en'])
      p.unmount()
    })
  })

  describe('主题风格色卡', () => {
    it('渲染 11 个风格按钮，aria-pressed 只标记当前风格', () => {
      const p = mount({ theme: composeTheme('classic', 'dark') })
      // 色卡按钮的判据是「有 title（悬浮说明）」—— 本段里后来加的「指板显示方案」两个按钮
      // 同样带 aria-pressed，只按 aria-pressed 过滤会把它们一起数进来（实测 13 ≠ 11）。
      const cards = p.buttons().filter((b) => b.getAttribute('aria-pressed') !== null && b.hasAttribute('title'))
      expect(cards).toHaveLength(11)
      const pressed = cards.filter((b) => b.getAttribute('aria-pressed') === 'true')
      expect(pressed).toHaveLength(1)
      expect(pressed[0].getAttribute('aria-label')).toBe(tZh('theme_style_classic'))
      p.unmount()
    })

    it('点击色卡回传 composeTheme(风格, **当前明暗**) —— 换风格不改变明暗', () => {
      const p = mount({ theme: composeTheme('classic', 'light') })
      const ocean = p.buttons().find((b) => b.getAttribute('aria-label') === tZh('theme_style_ocean'))!
      p.click(ocean)
      expect(p.calls.theme).toEqual([composeTheme('ocean', 'light')])
      const [next] = p.calls.theme as unknown as [ThemeMode]
      expect(parseTheme(next).brightness).toBe('light')
      expect(parseTheme(next).style).toBe('ocean')
      p.unmount()
    })

    it('当前主题名称与描述显示在色卡下方', () => {
      const p = mount({ theme: composeTheme('forest', 'dark') })
      expect(p.text()).toContain(tZh('theme_style_forest'))
      expect(p.text()).toContain(tZh('theme_style_forest_desc'))
      p.unmount()
    })

    it('主色圆点用当前明暗对应的主色（dark 更亮）', () => {
      const dark = mount({ theme: composeTheme('classic', 'dark') })
      const darkDot = [...dark.container.querySelectorAll('span')].find((s) =>
        (s as HTMLElement).className.includes('rounded-full'),
      ) as HTMLElement
      const darkG = greenOf(darkDot)
      dark.unmount()
      const light = mount({ theme: composeTheme('classic', 'light') })
      const lightDot = [...light.container.querySelectorAll('span')].find((s) =>
        (s as HTMLElement).className.includes('rounded-full'),
      ) as HTMLElement
      const lightG = greenOf(lightDot)
      light.unmount()
      // classic 是绿色系：darkPrimary 比 lightPrimary 亮
      expect(darkG).toBeGreaterThan(lightG)
    })
  })

  describe('明暗模式', () => {
    it('两个按钮回传 composeTheme(**当前风格**, 目标明暗) —— 换明暗不改变风格', () => {
      const p = mount({ theme: composeTheme('sand', 'dark') })
      p.click(p.btn(tZh('theme_light')))
      expect(p.calls.theme).toEqual([composeTheme('sand', 'light')])
      const [next] = p.calls.theme as unknown as [ThemeMode]
      expect(parseTheme(next).style).toBe('sand')
      expect(parseTheme(next).brightness).toBe('light')
      p.unmount()
    })

    it('当前明暗决定按钮选中态', () => {
      const dark = mount({ theme: composeTheme('classic', 'dark') })
      expect(dark.isActive(dark.btn(tZh('theme_dark')))).toBe(true)
      expect(dark.isActive(dark.btn(tZh('theme_light')))).toBe(false)
      dark.unmount()
    })
  })

  describe('显示大小（缩放）', () => {
    it('滑块 range 80..150 step 10，当前值 = displayScale*100', () => {
      const p = mount({ displayScale: 1.2 })
      const s = p.sliders()[0]
      expect(s.getAttribute('aria-valuemin')).toBe('80')
      expect(s.getAttribute('aria-valuemax')).toBe('150')
      expect(s.getAttribute('aria-valuenow')).toBe('120')
      expect(p.text()).toContain('120%')
      p.unmount()
    })

    it('用方向键调整后回传的是小数（÷100）', () => {
      const p = mount({ displayScale: 1 })
      const s = p.sliders()[0]
      act(() => {
        s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      })
      expect(p.calls.scale).toEqual([1.1])
      p.unmount()
    })

    it('缩放百分比取整显示（1.15 → 115%）', () => {
      const p = mount({ displayScale: 1.15 })
      expect(p.text()).toContain('115%')
      p.unmount()
    })
  })

  describe('和弦与音阶显示', () => {
    it('四个选项回传对应 mode，选中态反映 props', () => {
      const p = mount({ chordScaleDisplay: 'english_short' })
      expect(p.isActive(p.btn(tZh('display_english_short')))).toBe(true)
      expect(p.isActive(p.btn(tZh('display_chinese')))).toBe(false)
      p.click(p.btn(tZh('display_jazz')))
      expect(p.calls.chordScale).toEqual(['jazz'])
      p.unmount()
    })
  })

  describe('音符升降号显示', () => {
    it('三个选项回传 sharp / flat / mixed，选中态反映 props', () => {
      const p = mount({ noteAccidentalDisplay: 'mixed' })
      expect(p.isActive(p.btn('混用'))).toBe(true)
      p.click(p.btn('升号 ♯'))
      expect(p.calls.accidental).toEqual(['sharp'])
      p.unmount()
      const en = mount({ language: 'en', noteAccidentalDisplay: 'flat' }, 'en')
      expect(en.isActive(en.btn('Flat ♭'))).toBe(true)
      en.unmount()
    })

    it('说明文案按语言切换', () => {
      const p = mount()
      expect(p.text()).toContain('升号：所有变化音用♯显示')
      p.unmount()
    })
  })

  describe('细粒度和弦符号偏好', () => {
    it('小调符号三选一：回传 patch（只含 minorSymbol）', () => {
      const p = mount({ chordSymbols: { ...DEFAULT_SYMBOLS, minorSymbol: 'm' } })
      expect(p.isActive(p.btn('Cm7'))).toBe(true)
      p.click(p.btn('C-7'))
      expect(p.calls.symbols).toEqual([{ minorSymbol: '-' }])
      p.unmount()
    })

    it('半减七符号三选一：回传 patch（只含 minor7flat5Symbol）', () => {
      const p = mount({ chordSymbols: { ...DEFAULT_SYMBOLS, minor7flat5Symbol: 'ø7' } })
      expect(p.isActive(p.btn('Cø7'))).toBe(true)
      p.click(p.btn('C half-dim'))
      expect(p.calls.symbols).toEqual([{ minor7flat5Symbol: 'half-dim' }])
      p.unmount()
    })

    it('7b9 符号三选一：回传 patch（只含 dominant7flat9Symbol）', () => {
      const p = mount({ chordSymbols: { ...DEFAULT_SYMBOLS, dominant7flat9Symbol: '7b9' } })
      p.click(p.btn('C7♭9'))
      expect(p.calls.symbols).toEqual([{ dominant7flat9Symbol: '7♭9' }])
      p.unmount()
    })

    it('7b9 音阶三选一：回传 patch（只含 sevenFlatNineScaleChoice）', () => {
      const p = mount({ chordSymbols: { ...DEFAULT_SYMBOLS, sevenFlatNineScaleChoice: 'altered' } })
      expect(p.isActive(p.btn('Altered'))).toBe(true)
      p.click(p.btn('H-W Dim'))
      expect(p.calls.symbols).toEqual([{ sevenFlatNineScaleChoice: 'diminishedHalfWhole' }])
      p.unmount()
    })

    it('说明文案按语言切换', () => {
      const p = mount()
      expect(p.text()).toContain('细粒度和弦符号偏好，仅对英文/爵士记谱法生效')
      p.unmount()
      const en = mount({ language: 'en' }, 'en')
      expect(en.text()).toContain('Fine-grained chord symbol preferences')
      en.unmount()
    })
  })

  /**
   * 全按钮矩阵 —— 上面那些 describe 只点了每个分组的**其中一个**按钮，
   * 于是另外 16 个按钮的 onClick 箭头体从未执行（覆盖率实测）：
   * 这些块是复制粘贴出来的，只点一个抓不到「某组按钮接错回调 / 载荷写错」。
   * 这里把 8 组共 25 个按钮**逐个**点一遍，并断言：
   *   ① 只触发它自己所属的那个回调；
   *   ② 载荷与按钮文案严格对应；
   *   ③ 不误触任何其它回调（copy-paste 最典型的事故）。
   */
  describe('全按钮矩阵：每个按钮都接到正确回调，且不误触其它回调', () => {
    type BtnCase = { group: string; label: string; bucket: string; payload: unknown }

    const CASES: BtnCase[] = [
      // 全屏类型
      { group: '全屏类型', label: '窗口全屏', bucket: 'fullscreen', payload: 'windowed' },
      { group: '全屏类型', label: '真全屏', bucket: 'fullscreen', payload: 'fullscreen' },
      // 语言
      { group: '语言', label: tZh('lang_zh'), bucket: 'language', payload: 'zh-CN' },
      { group: '语言', label: tZh('lang_en'), bucket: 'language', payload: 'en' },
      // 明暗模式（当前风格固定为 classic）
      { group: '明暗模式', label: tZh('theme_dark'), bucket: 'theme', payload: composeTheme('classic', 'dark') },
      { group: '明暗模式', label: tZh('theme_light'), bucket: 'theme', payload: composeTheme('classic', 'light') },
      // 和弦与音阶显示
      { group: '和弦与音阶显示', label: tZh('display_chinese'), bucket: 'chordScale', payload: 'chinese' },
      { group: '和弦与音阶显示', label: tZh('display_english'), bucket: 'chordScale', payload: 'english' },
      { group: '和弦与音阶显示', label: tZh('display_english_short'), bucket: 'chordScale', payload: 'english_short' },
      { group: '和弦与音阶显示', label: tZh('display_jazz'), bucket: 'chordScale', payload: 'jazz' },
      // 升降号
      { group: '升降号', label: '升号 ♯', bucket: 'accidental', payload: 'sharp' },
      { group: '升降号', label: '降号 ♭', bucket: 'accidental', payload: 'flat' },
      { group: '升降号', label: '混用', bucket: 'accidental', payload: 'mixed' },
      // 小调符号
      { group: '小调符号', label: 'Cm7', bucket: 'symbols', payload: { minorSymbol: 'm' } },
      { group: '小调符号', label: 'C-7', bucket: 'symbols', payload: { minorSymbol: '-' } },
      { group: '小调符号', label: 'Cmin7', bucket: 'symbols', payload: { minorSymbol: 'min' } },
      // 半减七
      { group: '半减七', label: 'Cm7b5', bucket: 'symbols', payload: { minor7flat5Symbol: 'm7b5' } },
      { group: '半减七', label: 'Cø7', bucket: 'symbols', payload: { minor7flat5Symbol: 'ø7' } },
      { group: '半减七', label: 'C half-dim', bucket: 'symbols', payload: { minor7flat5Symbol: 'half-dim' } },
      // 属七降九
      { group: '属七降九', label: 'C7b9', bucket: 'symbols', payload: { dominant7flat9Symbol: '7b9' } },
      { group: '属七降九', label: 'C7♭9', bucket: 'symbols', payload: { dominant7flat9Symbol: '7♭9' } },
      { group: '属七降九', label: 'C7-9', bucket: 'symbols', payload: { dominant7flat9Symbol: '7-9' } },
      // 7b9 对应音阶
      { group: '7b9 音阶', label: 'Altered', bucket: 'symbols', payload: { sevenFlatNineScaleChoice: 'altered' } },
      { group: '7b9 音阶', label: 'W-H Dim', bucket: 'symbols', payload: { sevenFlatNineScaleChoice: 'diminishedWholeHalf' } },
      { group: '7b9 音阶', label: 'H-W Dim', bucket: 'symbols', payload: { sevenFlatNineScaleChoice: 'diminishedHalfWhole' } },
    ]

    it(`矩阵本身覆盖 9 个分组共 ${CASES.length} 个按钮（防止分组被漏掉）`, () => {
      const groups = new Set(CASES.map((c) => c.group))
      expect(groups.size).toBe(9)
      expect(CASES).toHaveLength(25)
    })

    it('每个按钮文案在本段内唯一（否则「按文案定位」会静默点到另一个按钮）', () => {
      const p = mount()
      const labels = p.buttons().map((b) => b.textContent?.trim() ?? '')
      for (const c of CASES) {
        expect(labels.filter((l) => l === c.label), `"${c.label}" 出现了多次`).toHaveLength(1)
      }
      p.unmount()
    })

    for (const c of CASES) {
      it(`${c.group} · 「${c.label}」→ ${c.bucket} 只收到自己的载荷`, () => {
        const p = mount({ theme: composeTheme('classic', 'dark') })
        p.click(p.btn(c.label))
        expect(p.calls[c.bucket]).toEqual([c.payload])
        // copy-paste 事故：某按钮把回调接成了相邻分组的 —— 一次点击只应留下一个回调记录
        const touched = Object.entries(p.calls).filter(([, v]) => (v as unknown[]).length > 0)
        expect(touched.map(([k]) => k), `除 ${c.bucket} 外不该有回调被触发`).toEqual([c.bucket])
        p.unmount()
      })
    }
  })

  describe('回调边界 / 不变性', () => {
    it('渲染不修改 props 对象（chordSymbols 引用不变）', () => {
      const symbols = { ...DEFAULT_SYMBOLS }
      const p = mount({ chordSymbols: symbols })
      expect(p.container).toBeTruthy()
      expect(symbols).toEqual(DEFAULT_SYMBOLS)
      p.unmount()
    })

    it('同一交互多次点击会多次回传（受控组件不自持状态）', () => {
      const p = mount()
      p.click(p.btn('C-7'))
      p.click(p.btn('C-7'))
      p.click(p.btn('C-7'))
      expect(p.calls.symbols).toHaveLength(3)
      p.unmount()
    })
  })

  describe('指板显示方案', () => {
    const CJK = /[\u4e00-\u9fff]/
    const hintAbout = (container: HTMLElement, needle: string) =>
      [...container.querySelectorAll('p')].map((el) => el.textContent ?? '').find((t) => t.includes(needle))

    it('提供「经典」与「GuitarRun 风格」两个选项', () => {
      const p = mount()
      expect(p.btn('经典')).toBeTruthy()
      expect(p.btn('GuitarRun 风格')).toBeTruthy()
      p.unmount()
    })

    it('选中项由 props 驱动：classic 时「经典」高亮，guitarrun 时换成另一个', () => {
      const a = mount({ fretboardStyle: 'classic' })
      expect(isActive(a.btn('经典'))).toBe(true)
      expect(a.btn('经典')!.getAttribute('aria-pressed')).toBe('true')
      expect(isActive(a.btn('GuitarRun 风格'))).toBe(false)
      expect(a.btn('GuitarRun 风格')!.getAttribute('aria-pressed')).toBe('false')
      a.unmount()

      const b = mount({ fretboardStyle: 'guitarrun' })
      expect(isActive(b.btn('GuitarRun 风格'))).toBe(true)
      expect(b.btn('GuitarRun 风格')!.getAttribute('aria-pressed')).toBe('true')
      expect(isActive(b.btn('经典'))).toBe(false)
      b.unmount()
    })

    it('点击回传目标方案值，且只有这一个回调被触发', () => {
      const p = mount({ fretboardStyle: 'classic' })
      p.click(p.btn('GuitarRun 风格'))
      expect(p.calls.fretboardStyle).toEqual(['guitarrun'])
      const touched = Object.entries(p.calls).filter(([, v]) => (v as unknown[]).length > 0)
      expect(touched.map(([k]) => k)).toEqual(['fretboardStyle'])
      p.unmount()
    })

    it('从 guitarrun 切回 classic 也能回传（不是单向开关）', () => {
      const p = mount({ fretboardStyle: 'guitarrun' })
      p.click(p.btn('经典'))
      expect(p.calls.fretboardStyle).toEqual(['classic'])
      p.unmount()
    })

    it('英文界面用英文文案，且提示里不含汉字', () => {
      const p = mount({}, 'en')
      expect(p.btn('Classic')).toBeTruthy()
      expect(p.btn('GuitarRun')).toBeTruthy()
      const hint = hintAbout(p.container, 'GuitarRun')
      expect(hint, '英文提示应提到 GuitarRun').toBeTruthy()
      expect(CJK.test(hint!), hint).toBe(false)
      p.unmount()
    })

    it('中文界面提示提到 GuitarRun（这个皮肤名不翻译）+ 含中文说明', () => {
      const p = mount({}, 'zh-CN')
      const hint = hintAbout(p.container, 'GuitarRun')
      expect(hint).toBeTruthy()
      expect(CJK.test(hint!), hint).toBe(true)
      p.unmount()
    })

    // ---------------- 第三套皮肤（MyFretboardTrainer 风格） ----------------

    it('🚨 第三套皮肤也要有选项：经典 / GuitarRun 风格 / 3D 琴颈风格 三选一', () => {
      const p = mount()
      expect(p.btn('经典')).toBeTruthy()
      expect(p.btn('GuitarRun 风格')).toBeTruthy()
      expect(p.btn('3D 琴颈风格')).toBeTruthy()
      p.unmount()
    })

    it('选中项由 props 驱动：trainer 时只有「3D 琴颈风格」高亮', () => {
      const p = mount({ fretboardStyle: 'trainer' })
      expect(isActive(p.btn('3D 琴颈风格'))).toBe(true)
      expect(p.btn('3D 琴颈风格')!.getAttribute('aria-pressed')).toBe('true')
      expect(isActive(p.btn('经典'))).toBe(false)
      expect(isActive(p.btn('GuitarRun 风格'))).toBe(false)
      p.unmount()
    })

    it('三个值里恰好一个 aria-pressed=true（逐值跑一遍，防两个同时亮）', () => {
      const labels = ['经典', 'GuitarRun 风格', '3D 琴颈风格']
      for (const [idx, style] of (['classic', 'guitarrun', 'trainer'] as const).entries()) {
        const p = mount({ fretboardStyle: style })
        const pressed = labels.filter((l) => p.btn(l)!.getAttribute('aria-pressed') === 'true')
        expect({ style, pressed }).toEqual({ style, pressed: [labels[idx]] })
        p.unmount()
      }
    })

    it('点击「3D 琴颈风格」回传 trainer，且只有这一个回调被触发', () => {
      const p = mount({ fretboardStyle: 'classic' })
      p.click(p.btn('3D 琴颈风格'))
      expect(p.calls.fretboardStyle).toEqual(['trainer'])
      const touched = Object.entries(p.calls).filter(([, v]) => (v as unknown[]).length > 0)
      expect(touched.map(([k]) => k)).toEqual(['fretboardStyle'])
      p.unmount()
    })

    it('从 trainer 切回另两套也都能回传（三个值互通，不是单向开关）', () => {
      const p = mount({ fretboardStyle: 'trainer' })
      p.click(p.btn('经典'))
      expect(p.calls.fretboardStyle).toEqual(['classic'])
      p.click(p.btn('GuitarRun 风格'))
      expect(p.calls.fretboardStyle).toEqual(['classic', 'guitarrun'])
      p.unmount()
    })

    it('🚨 说明文案把三套皮肤都写全（只写原来的两套会让新皮肤「没有介绍」）', () => {
      const p = mount({}, 'zh-CN')
      const hint = hintAbout(p.container, '3D 琴颈风格')
      expect(hint, '提示里应出现「3D 琴颈风格」').toBeTruthy()
      expect(hint).toContain('经典')
      expect(hint).toContain('GuitarRun')
      p.unmount()
    })

    it('英文界面第三个选项是 3D Neck，提示含 Classic / GuitarRun 且不含汉字', () => {
      const p = mount({}, 'en')
      expect(p.btn('3D Neck')).toBeTruthy()
      const hint = hintAbout(p.container, '3D Neck')
      expect(hint).toBeTruthy()
      expect(hint).toContain('Classic')
      expect(hint).toContain('GuitarRun')
      expect(CJK.test(hint!), hint).toBe(false)
      p.unmount()
    })
  })

  describe('钢琴键盘样式', () => {
    const CJK = /[\u4e00-\u9fff]/
    /**
     * 按「小标题文字」定位它下面那一组按钮。
     * 不能直接用 `btn('经典')` —— 本段与「指板显示方案」都有「经典」，`find()` 只会拿到前一个。
     */
    const blockButtons = (container: HTMLElement, heading: string) => {
      const head = [...container.querySelectorAll('div')].find((el) => el.textContent?.trim() === heading)
      expect(head, `找不到小标题「${heading}」`).toBeTruthy()
      const grid = head!.nextElementSibling as HTMLElement | null
      expect(grid, `「${heading}」下面应有按钮组`).toBeTruthy()
      return [...grid!.querySelectorAll('button')] as HTMLButtonElement[]
    }
    const hintAbout = (container: HTMLElement, needle: string) =>
      [...container.querySelectorAll('p')].map((el) => el.textContent ?? '').find((t) => t.includes(needle))

    it('提供「经典」与「MusMath 风格」两个选项（挂在钢琴键盘样式下面）', () => {
      const p = mount()
      const btns = blockButtons(p.container, '钢琴键盘样式')
      expect(btns.map((b) => b.textContent?.trim())).toEqual(['经典', 'MusMath 风格'])
      p.unmount()
    })

    it('选中项由 props 驱动，且与「指板显示方案」互不影响（两个「经典」各管各的）', () => {
      const a = mount({ fretboardStyle: 'guitarrun', pianoKeyboardStyle: 'classic' })
      const [kClassic, kMusmath] = blockButtons(a.container, '钢琴键盘样式')
      expect(isActive(kClassic)).toBe(true)
      expect(kClassic.getAttribute('aria-pressed')).toBe('true')
      expect(isActive(kMusmath)).toBe(false)
      // 同一屏里指板选了 GuitarRun，键盘仍是经典 —— 两档独立
      expect(isActive(a.btn('GuitarRun 风格'))).toBe(true)
      a.unmount()

      const b = mount({ fretboardStyle: 'classic', pianoKeyboardStyle: 'musmath' })
      const [kClassic2, kMusmath2] = blockButtons(b.container, '钢琴键盘样式')
      expect(isActive(kMusmath2)).toBe(true)
      expect(kMusmath2.getAttribute('aria-pressed')).toBe('true')
      expect(isActive(kClassic2)).toBe(false)
      b.unmount()
    })

    it('点击回传目标样式值，且只有这一个回调被触发', () => {
      const p = mount({ pianoKeyboardStyle: 'classic' })
      const [, musmath] = blockButtons(p.container, '钢琴键盘样式')
      p.click(musmath)
      expect(p.calls.pianoKeyboardStyle).toEqual(['musmath'])
      const touched = Object.entries(p.calls).filter(([, v]) => (v as unknown[]).length > 0)
      expect(touched.map(([k]) => k)).toEqual(['pianoKeyboardStyle'])
      p.unmount()
    })

    it('从 musmath 切回 classic 也能回传（不是单向开关）', () => {
      const p = mount({ pianoKeyboardStyle: 'musmath' })
      const [classic] = blockButtons(p.container, '钢琴键盘样式')
      p.click(classic)
      expect(p.calls.pianoKeyboardStyle).toEqual(['classic'])
      p.unmount()
    })

    it('提示文案说清两种画法的差别（中文界面含中文，英文界面不含汉字）', () => {
      const zh = mount({}, 'zh-CN')
      const zhHint = hintAbout(zh.container, 'MusMath')
      expect(zhHint, '中文提示应点名 MusMath 与画法差别').toBeTruthy()
      expect(CJK.test(zhHint!)).toBe(true)
      zh.unmount()

      const en = mount({}, 'en')
      const enHint = hintAbout(en.container, 'MusMath')
      expect(enHint).toBeTruthy()
      expect(CJK.test(enHint!), enHint).toBe(false)
      en.unmount()
    })
  })
})
