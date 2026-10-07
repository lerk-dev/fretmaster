/**
 * components/theory-panel.tsx 的契约测试（此前零测试）。
 *
 * 乐理面板：五度圈 / 和弦音阶（含和弦音位图）/ 把位教学（含 CAGED）/ 调式图鉴 / 音程探索。
 * 底层乐理计算在 lib/ 里已有测试，这里钉的是**界面契约**：选了哪个音就该按哪种拼写显示、
 * 选中态怎么走、哪些内容在哪个乐器下出现。
 *
 * 契约重点：
 *  ① 五度圈：12 大调 + 12 小调节点，点击/键盘选中互斥，中心文本与详情联动；
 *  ② **调号与音名的拼写必须一致**：`keySig > 0` 用升号、`< 0` 用降号、`0` 显示「—」
 *     （面板显示的调号与音阶拼写不一致会直接教错人）；
 *  ③ 和弦音阶：根音选择器是**混用拼写**的（C♯ 但 E♭/A♭/B♭），
 *     和弦符号与音名必须跟着所选拼写走 —— 选 E♭ 不能显示成 D♯7（本次修的真 bug）；
 *  ④ 把位：有卡片、范围、根音标记、指法说明；
 *  ⑤ CAGED 只在标准六弦吉他出现，其它乐器给明确的不支持文案；major/minor 可切；
 *  ⑥ 文案随语言（含音阶名与指法说明）；
 *  ⑦ 调式图鉴：调式按钮名走 `getScaleDisplayName(name)`（吃**英文名**的那个，
 *     曾误用 `@/lib/scale-theory` 的同名函数 ⇒ 全是英文名 / 编译不过）；
 *     指板格子随「调式 × 根音 × 音名/音级 × ♯/♭」四轴联动，父调提示随根音重算；
 *  ⑧ 音程探索：格子可点 → 换根音；互补对成组着色（转位同形的视觉逻辑）；
 *  ⑨ 和弦音位图：度数标签 R/3/5/b7（复合音程 9/11/13 不许被 %12 折成 2/5/6）。
 *
 * ⚠️ radix Tabs 的触发器在 jsdom 里要 **mousedown + click** 才会切换（只派 click 不生效）。
 * ⚠️ radix Select 展开要派 pointerdown + click，并补 hasPointerCapture 等 jsdom 缺口。
 * ⚠️ 迷你指板用 `data-fretboard` / `data-cell` 定位，别拿样式类猜格子。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { TheoryPanel } from '@/components/theory-panel'
import { ChordType, getChordTypeUnicodeDisplayString } from '@/lib/chord-theory'
import { getCagedShapes, generateScalePositions } from '@/lib/fretboard-positions'
import { getScaleDisplayName, ScaleType } from '@/lib/scale-theory'
// ⚠️ 与上一行同名但**不同函数**：这个吃「音阶英文名」，调式图鉴的按钮名/父调提示走它。
// 用错那个（吃 ScaleType 的）会直接渲染崩或退化成英文名 —— 本文件有专门用例钉住。
import { getScaleDisplayName as getScaleDisplayNameByName } from '@/lib/page-theory-functions'
import { MODE_FAMILIES, INTERVAL_GROUPS, chordToneLabel } from '@/lib/theory-mode-guide'
import { INSTRUMENT_CONFIG } from '@/lib/practice-suggestions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* jsdom 缺口 */ }

type Instrument = 'six_string_guitar' | 'seven_string_guitar'

function mount(opts: { instrument?: Instrument; fretCount?: number; language?: 'zh-CN' | 'en' } = {}) {
  const { instrument = 'six_string_guitar', fretCount = 12, language = 'zh-CN' } = opts
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(TheoryPanel as never, {
        instrument,
        fretCount,
        language,
        // 品记品由 page 传入（与练习指板同一份 FRET_MARKERS）——面板不再自己写一份
        fretMarkers: [3, 5, 7, 9, 12],
      } as never),
    )
  })

  const text = () => container.textContent ?? ''
  const tab = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!
  /** 五度圈外圈/内圈节点（svg 里的 role=button，带 aria-label） */
  const p_nodes = () => [...container.querySelectorAll('svg [role="button"]')] as (SVGElement & HTMLElement)[]
  const circleNodes = p_nodes
  const nodeByLabel = (label: string) => circleNodes().find((n) => n.getAttribute('aria-label') === label)!
  const combos = () => [...container.querySelectorAll('[role="combobox"]')] as HTMLElement[]

  const click = (el: Element | undefined | null, type = 'click') => {
    act(() => { el?.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })) })
  }
  const press = (el: Element, key: string) => {
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
  }

  // ⚠️ 迷你指板用 data-fretboard / data-cell 定位（弦索引 0 = 顶部高音弦，品从 startFret 起）。
  // 不用样式类猜格子：类名一改测试就假红，而格子内容才是契约。
  const boards = () => [...container.querySelectorAll('[data-fretboard="mini"]')] as HTMLElement[]
  const cellAt = (boardIdx: number, s: number, f: number) =>
    boards()[boardIdx]?.querySelector(`[data-cell="${s}-${f}"]`) as HTMLElement | null
  const cellText = (boardIdx: number, s: number, f: number) => (cellAt(boardIdx, s, f)?.textContent ?? '').trim()
  /** 按可见文本找按钮（调式按钮行等） */
  const buttonByText = (label: string) =>
    [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === label)
  /** 一个「设置行」右侧的选项钮：先按标题文本找到行，再取行内所有按钮 */
  const rowButtons = (rowLabel: string) => {
    const row = [...container.querySelectorAll('div')].find((d) => (d.textContent ?? '').trim() === rowLabel)
    return row ? ([...row.parentElement!.querySelectorAll('button')] as HTMLButtonElement[]) : []
  }

  return {
    container,
    root,
    text,
    tab,
    circleNodes,
    nodeByLabel,
    combos,
    click,
    press,
    boards,
    cellAt,
    cellText,
    buttonByText,
    rowButtons,
    switchTab(label: string) {
      const el = tab(label)
      act(() => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
    },
    /** 展开第 idx 个 Select 并选中文本为 label 的选项 */
    pickOption(idx: number, label: string) {
      const c = combos()[idx]
      act(() => {
        c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
        c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === label)
      if (!opt) throw new Error(`找不到选项 ${label}；实际有：${[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent).join('|')}`)
      click(opt)
    },
    /** 当前处于选中态的五度圈节点的 aria-label（24 个里应当恰好 1 个） */
    selectedNodeLabel(): string | null {
      const hit = p_nodes().filter((n) => {
        const c = n.querySelector('circle')!
        return (c.getAttribute('class') ?? '').split(/\s+/).includes('fill-primary')
      })
      if (hit.length !== 1) return hit.length === 0 ? null : `<多个:${hit.length}>`
      return hit[0].getAttribute('aria-label')
    },
    /** 「大调 / 小调」徽标的完整文本（不能用 textContent 判 —— 「关系小调」里也含「小调」） */
    modeBadge(): string {
      const b = [...container.querySelectorAll('[data-slot="badge"]')]
        .find((el) => ['大调', '小调'].includes((el.textContent ?? '').trim()))
      return (b?.textContent ?? '').trim()
    },
    /** 和弦符号右侧那一串音名（「符号 = 音名…」那一行里的 note 记号） */
    chordToneTokens(): string[] {
      const eq = [...container.querySelectorAll('span')].find((s) => s.textContent === '=')
      if (!eq?.parentElement) return []
      return [...eq.parentElement.querySelectorAll('span')]
        .map((s) => s.textContent ?? '')
        .filter((tx) => /^[A-G][♯♭]?$/.test(tx))
    },
    /**
     * 五度圈详情里的「音阶音符」记号。
     * ⚠️ 不能用整页 textContent 断言：五度圈的 24 个节点标签本身就含 F♯/G♭/D♭/C♯，
     * 整页断言必然假阳（踩过一次）。
     * ⚠️ 定位时要注意祖先 div 的 textContent 也以「音阶音符」开头（包着标签 + 音名），
     * 所以取文档序里最后一个（= 最内层的那个标签 div）再取它的下一个兄弟。
     */
    scaleNoteTokens(): string[] {
      const labels = [...container.querySelectorAll('div')].filter((d) => (d.textContent ?? '').startsWith('音阶音符'))
      const row = labels[labels.length - 1]?.nextElementSibling
      if (!row) return []
      return [...row.querySelectorAll('span')].map((s) => s.textContent ?? '')
    },
    /**
     * 读五度圈详情里的「标签 → 值」行（调号 / 关系小调 / 关系大调）。
     * 值可能由多个 span 拼成（如 ♯ + (+1)），所以取父节点的整段文本再去掉标签本身。
     */
    detailRow(label: string): string {
      const el = [...container.querySelectorAll('span')].find((s) => s.textContent === label)
      if (!el?.parentElement) return ''
      return (el.parentElement.textContent ?? '').slice(label.length)
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

let errSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  document.body.innerHTML = ''
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 radix 的 a11y 噪音 */ })
})
afterEach(() => { errSpy.mockRestore() })

describe('面板结构', () => {
  it('标题与五个 Tab 都在，默认停在五度圈', () => {
    const p = mount()
    expect(p.text()).toContain('乐理知识')
    for (const label of ['五度圈', '和弦音阶', '把位教学', '调式图鉴', '音程探索']) {
      expect(p.tab(label), label).toBeDefined()
    }
    expect(p.text()).toContain('点击任意调性查看详情')   // theory_circle_hint
    expect(p.container.querySelector('svg')).not.toBeNull()
    p.unmount()
  })

  it('切到和弦音阶 Tab 出现两个选择器', () => {
    const p = mount()
    expect(p.combos()).toHaveLength(0)
    p.switchTab('和弦音阶')
    expect(p.combos()).toHaveLength(2)
    p.unmount()
  })

  it('切到把位 Tab 出现把位与 CAGED 区块', () => {
    const p = mount()
    p.switchTab('把位教学')
    expect(p.text()).toContain('CAGED')
    expect(p.text()).toContain('指法')
    p.unmount()
  })
})

describe('五度圈：选中与拼写', () => {
  it('内外圈各 12 个节点，aria-label 就是音名', () => {
    const p = mount()
    const nodes = p.circleNodes()
    expect(nodes).toHaveLength(24)
    expect(nodes.slice(0, 12).map((n) => n.getAttribute('aria-label'))).toEqual(
      ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'],
    )
    expect(nodes.slice(12).map((n) => n.getAttribute('aria-label'))).toEqual(
      ['Am', 'Em', 'Bm', 'F♯m', 'C♯m', 'G♯m', 'D♯m', 'B♭m', 'G♭m', 'E♭m', 'Cm', 'Gm'],
    )
    p.unmount()
  })

  it('默认选中 C 大调：中心显示 C、调号显示「—」、相对小调 Am', () => {
    const p = mount()
    expect(p.text()).toContain('大调')
    expect(p.detailRow('调号')).toBe('—')             // C 大调无升降号
    expect(p.detailRow('关系小调')).toBe('Am')
    expect(p.scaleNoteTokens()).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
    p.unmount()
  })

  it('选 G 大调：调号 +1 用升号，音阶出现 F♯ 而不是 G♭', () => {
    const p = mount()
    p.click(p.nodeByLabel('G'))
    expect(p.detailRow('调号')).toBe('♯(+1)')
    expect(p.detailRow('关系小调')).toBe('Em')
    const notes = p.scaleNoteTokens()
    expect(notes).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F♯'])
    p.unmount()
  })

  it('选 A♭ 大调：调号 -4 用降号，音阶出现 D♭ 而不是 C♯', () => {
    const p = mount()
    p.click(p.nodeByLabel('A♭'))
    expect(p.detailRow('调号')).toBe('♭♭♭♭(-4)')
    expect(p.scaleNoteTokens()).toEqual(['A♭', 'B♭', 'C', 'D♭', 'E♭', 'F', 'G'])
    p.unmount()
  })

  it('键盘 Enter / Space 与点击等效', () => {
    const p = mount()
    p.press(p.nodeByLabel('D'), 'Enter')
    expect(p.text()).toContain('(+2)')                 // D 大调两个升号
    p.press(p.nodeByLabel('F'), ' ')
    expect(p.text()).toContain('(-1)')                 // F 大调一个降号
    p.press(p.nodeByLabel('C'), 'a')                   // 其它键不动
    expect(p.text()).toContain('(-1)')
    p.unmount()
  })

  it('选小调：中心显示 Am、徽标切到小调、音阶是自然小调', () => {
    const p = mount()
    p.click(p.nodeByLabel('Am'))
    expect(p.selectedNodeLabel(), '点内圈应选中内圈节点').toBe('Am')
    expect(p.modeBadge()).toBe('小调')
    expect(p.text()).toContain('Am')
    expect(p.text()).not.toContain('(+1)')             // A 小调无调号
    p.unmount()
  })

  /**
   * 内圈（小调）的 `onKeyDown` 与外圈是**复制粘贴的两份**（源码 284-290 / 325-331）。
   * 原测试只按过大调节点，所以内圈那份一次都没跑过 —— 内圈漏掉 preventDefault
   * 或漏掉 setCircleMode('minor') 都测不出来。
   */
  it('小调节点键盘 Enter / Space 与点击等效（内圈是独立实现，不能只测外圈）', () => {
    const p = mount()
    // ⚠️ 不能用 `text()).toContain('小调')` —— 详情区恒渲染「关系小调」一行，
    // 它是大调/小调共用的（同 index 的大小调互为关系调），mode 写错照样通过。
    // 必须钉住「哪个节点是选中态」+ 徽标，这两个才真正区分 mode。
    p.press(p.nodeByLabel('Am'), 'Enter')
    expect(p.selectedNodeLabel(), 'Enter 应选中内圈 Am').toBe('Am')
    expect(p.modeBadge()).toBe('小调')
    expect(p.detailRow('关系大调')).toBe('C')

    p.press(p.nodeByLabel('Em'), ' ')
    expect(p.selectedNodeLabel(), 'Space 应选中内圈 Em').toBe('Em')
    expect(p.modeBadge()).toBe('小调')
    expect(p.detailRow('关系大调')).toBe('G')

    p.press(p.nodeByLabel('Am'), 'a')                  // 其它键不动
    expect(p.selectedNodeLabel(), '其它键不该改变选中').toBe('Em')
    p.unmount()
  })

  it('小调节点按 Enter / Space 会 preventDefault（否则空格会滚动页面）', () => {
    const p = mount()
    for (const key of ['Enter', ' ']) {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      act(() => { p.nodeByLabel('Am').dispatchEvent(ev) })
      expect(ev.defaultPrevented, `按 ${JSON.stringify(key)} 应 preventDefault`).toBe(true)
    }
    const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    act(() => { p.nodeByLabel('Am').dispatchEvent(other) })
    expect(other.defaultPrevented, '其它键不该 preventDefault').toBe(false)
    p.unmount()
  })

  it('大调/小调选中互斥：选过小调后大调的 C 不再是选中态', () => {
    const p = mount()
    const isSelected = (label: string) => {
      const node = p.nodeByLabel(label)
      const circle = node.querySelector('circle')!
      return (circle.getAttribute('class') ?? '').includes('fill-primary')
    }
    expect(isSelected('C')).toBe(true)
    expect(isSelected('Am')).toBe(false)

    p.click(p.nodeByLabel('Am'))
    expect(isSelected('C')).toBe(false)
    expect(isSelected('Am')).toBe(true)
    p.unmount()
  })
})

describe('和弦音阶：符号与音名必须与所选拼写一致', () => {
  it('默认 C7 = C E G A♯（符号为 C7）', () => {
    // ⚠️ 已知局限：和弦音的拼写目前跟根音走同一张表（C 根音用升号表），
    // 所以 C7 的七音显示成 A♯ 而不是 B♭、Cm7 的三音显示成 D♯ 而不是 E♭。
    // 要彻底正确需要按「音级」拼写（大三度 → E♭、小七度 → B♭），属独立的乐理拼写引擎工作，
    // 本批次只统一了「根音符号与根音选择器一致」，音级拼写记为后续项。
    const p = mount()
    p.switchTab('和弦音阶')
    expect(p.text()).toContain('C7')
    const tones = p.chordToneTokens()
    expect(tones).toHaveLength(4)
    expect(tones[0]).toBe('C')
    p.unmount()
  })

  it('选 E♭ 后显示 E♭7 与降号音名（不是 D♯7 / A♯）', () => {
    const p = mount()
    p.switchTab('和弦音阶')
    p.pickOption(0, 'E♭')
    expect(p.text()).toContain('E♭7')
    expect(p.chordToneTokens()).toEqual(['E♭', 'G', 'B♭', 'D♭'])
    expect(p.text()).not.toContain('D♯7')
    p.unmount()
  })

  it('选 C♯ 后仍用升号（不因修 E♭ 而一律降号）', () => {
    const p = mount()
    p.switchTab('和弦音阶')
    p.pickOption(0, 'C♯')
    expect(p.text()).toContain('C♯7')
    expect(p.chordToneTokens()).toEqual(['C♯', 'F', 'G♯', 'B'])
    expect(p.text()).not.toContain('D♭7')
    p.unmount()
  })

  it('切换和弦类型会改符号（m7）', () => {
    const p = mount()
    p.switchTab('和弦音阶')
    const m7 = getChordTypeUnicodeDisplayString(ChordType.minorSeven)
    p.pickOption(1, m7)
    expect(p.text()).toContain(`C${m7}`)
    expect(p.chordToneTokens()).toHaveLength(4)
    p.unmount()
  })

  it('列出该和弦可用的音阶，名字按语言切换', () => {
    const zh = mount()
    zh.switchTab('和弦音阶')
    expect(zh.text()).toContain('混合利底亚')
    zh.unmount()

    const en = mount({ language: 'en' })
    en.switchTab('Chord-Scale')
    const enText = en.text()
    expect(enText).toContain('Mixolydian')
    expect(enText).not.toContain('混合利底亚')
    en.unmount()
  })
})

describe('乐器兜底', () => {
  /**
   * 源码 181：`INSTRUMENT_CONFIG[instrument] || INSTRUMENT_CONFIG.six_string_guitar`
   * —— 传入未登记的乐器时回落到六弦吉他。这是父子组件之间的**隐式契约**：
   * 父组件一旦传错字符串，界面会静默按六弦渲染（而不是崩或空白），
   * 所以必须钉住「回落的是六弦」这个具体值。
   */
  it('未登记的乐器回落到六弦吉他（品数/弦数与六弦一致，且显示 CAGED）', () => {
    const p = mount({ instrument: 'bogus_instrument' as never })
    p.switchTab('把位教学')
    const cfg = INSTRUMENT_CONFIG.six_string_guitar
    expect(p.text().split('把位 ').length - 1).toBe(
      generateScalePositions(0, ScaleType.majorPentatonic, cfg, 12).length,
    )
    // 六弦才有的 CAGED —— 回落成功才会出现
    const shapes = getCagedShapes(0, cfg, 12, 'major')
    expect(p.text().split('和弦指法').length - 1).toBe(shapes.length)
    expect(p.text()).not.toContain('仅支持六弦吉他标准调弦')
    p.unmount()
  })
})

describe('把位教学', () => {
  it('渲染把位卡片：编号、范围、主音把位标记、指法说明', () => {
    const p = mount({ fretCount: 12 })
    p.switchTab('把位教学')
    const text = p.text()
    expect(text).toContain('把位 1')
    expect(text).toMatch(/\d+–\d+/)                     // x–y 范围
    expect(text).toContain('主音把位')
    expect(text).toContain('指法')
    expect(text).toContain('食指')
    expect(text).toContain('小指')
    p.unmount()
  })

  it('英文下指法说明用英文', () => {
    const p = mount({ language: 'en' })
    p.switchTab('Positions')
    expect(p.text()).toContain('index')
    expect(p.text()).toContain('pinky')
    p.unmount()
  })

  /**
   * 把位页的两个 Select 此前**一次都没被驱动过**（语句命中 0）。
   * 根音那个是 `String → Number` 的唯一转换点（`parseInt`）：漏掉它就会把字符串
   *  `"6"` 当作 rootNote 传给 lib，positions 直接算空、界面退化成「无数据」，
   *  而下拉本身看起来完全正常（value 仍是 "6"）。
   */
  it('根音下拉：parseInt 后按新根音重算把位（数量与 lib 一致，且不再是 C 的结果）', () => {
    const p = mount({ fretCount: 12 })
    p.switchTab('把位教学')
    const cfg = INSTRUMENT_CONFIG.six_string_guitar
    const countCards = () => (p.text().split('把位 ').length - 1)

    expect(countCards()).toBe(generateScalePositions(0, ScaleType.majorPentatonic, cfg, 12).length)

    p.pickOption(0, 'F♯')                              // ROOT_PC_NAMES[6]
    expect(p.combos()[0].textContent).toBe('F♯')       // 下拉自身显示新值
    expect(countCards(), '换根音后必须按新根音重算').toBe(
      generateScalePositions(6, ScaleType.majorPentatonic, cfg, 12).length,
    )
    p.unmount()
  })

  it('音阶下拉：切换音阶后把位与度数标签都跟着换', () => {
    const p = mount({ fretCount: 12 })
    p.switchTab('把位教学')
    const cfg = INSTRUMENT_CONFIG.six_string_guitar
    expect(p.combos()[1].textContent).toBe(getScaleDisplayName(ScaleType.majorPentatonic, true, 'zh'))

    p.pickOption(1, getScaleDisplayName(ScaleType.blues, true, 'zh'))
    expect(p.combos()[1].textContent).toBe(getScaleDisplayName(ScaleType.blues, true, 'zh'))
    expect(p.text().split('把位 ').length - 1).toBe(
      generateScalePositions(0, ScaleType.blues, cfg, 12).length,
    )
    p.unmount()
  })

  /**
   * 源码 513 / 575：把位与 CAGED 在算不出结果时都要给「暂无数据」，而不是留一片空白。
   * 两条分支此前都是零覆盖 —— 品数太小（如 3 品）时才会走到，正常 12 品永远不触发。
   */
  it('品数太小算不出把位 → 显示「暂无数据」而不是空白', () => {
    const p = mount({ fretCount: 3 })
    p.switchTab('把位教学')
    const cfg = INSTRUMENT_CONFIG.six_string_guitar
    expect(generateScalePositions(0, ScaleType.majorPentatonic, cfg, 3)).toHaveLength(0)
    expect(getCagedShapes(0, cfg, 3, 'major')).toHaveLength(0)
    // 两处「暂无数据」：把位区 + CAGED 区
    expect(p.text().split('暂无数据').length - 1).toBe(2)
    p.unmount()
  })

  it('把位算不出、但 CAGED 算得出时只显示一处「暂无数据」（两块独立判空）', () => {
    const p = mount({ fretCount: 4 })
    p.switchTab('把位教学')
    const cfg = INSTRUMENT_CONFIG.six_string_guitar
    p.pickOption(1, getScaleDisplayName(ScaleType.blues, true, 'zh'))   // 4 品下 blues 无把位
    expect(generateScalePositions(0, ScaleType.blues, cfg, 4)).toHaveLength(0)
    expect(getCagedShapes(0, cfg, 4, 'major')).not.toHaveLength(0)
    expect(p.text().split('暂无数据').length - 1).toBe(1)
    p.unmount()
  })

  it('非标准六弦乐器不显示 CAGED 卡片，给明确的不支持文案', () => {
    const p = mount({ instrument: 'seven_string_guitar' })
    p.switchTab('把位教学')
    expect(p.text()).toContain('CAGED')
    expect(p.text()).toContain('仅支持六弦吉他标准调弦')
    expect(p.text()).not.toContain('和弦指法')
    expect(p.text()).not.toContain('五声盒子')
    p.unmount()
  })
})

describe('CAGED', () => {
  it('标准六弦：形状卡数量与 lib 一致，每卡都有和弦指法与五声盒子两块迷你指板', () => {
    const p = mount()
    p.switchTab('把位教学')
    const text = p.text()
    const count = (s: string) => text.split(s).length - 1
    // 不写死 5：形状数取决于调性与品数（窗口超界会跳过），以 lib 为准
    const shapes = getCagedShapes(0, INSTRUMENT_CONFIG.six_string_guitar, 12, 'major')
    expect(shapes.length).toBeGreaterThan(0)
    expect(count('和弦指法')).toBe(shapes.length)
    expect(count('五声盒子')).toBe(shapes.length)

    const badges = [...p.container.querySelectorAll('[data-slot="badge"]')].map((b) => b.textContent)
    for (const shape of shapes) expect(badges).toContain(shape.form)
    p.unmount()
  })

  it('major / minor 切换：选中态与内容跟着变', () => {
    const p = mount()
    p.switchTab('把位教学')
    const quality = (label: string) => [...p.container.querySelectorAll('button')].find((b) => b.textContent === label)!
    const isOn = (label: string) => (quality(label).className ?? '').includes('bg-primary')
    expect(isOn('大三')).toBe(true)
    expect(isOn('小三')).toBe(false)

    p.click(quality('小三'))
    expect(isOn('小三')).toBe(true)
    expect(isOn('大三')).toBe(false)
    const minorShapes = getCagedShapes(0, INSTRUMENT_CONFIG.six_string_guitar, 12, 'minor')
    expect(p.text().split('和弦指法').length - 1).toBe(minorShapes.length)
    p.unmount()
  })
})

/**
 * CAGED 区块的**第二种呈现样式**：把五个形状叠在一张整幅指板上
 * （复刻 myfretboardtrainer.com/pentatonic 的 CAGED 档）。
 *
 * 与上面「分图」的关系：同一个区块、同一个 `cagedQuality`，只是呈现不同。
 * 所以这里重点钉**切换时的相互影响**：
 *  · 切到整幅后，外层那组「大三/小三」必须**消失**（整幅自带一组「大调/小调」）——
 *    两组按钮同时显示会互相不同步，用户点哪个都懵；
 *  · 但**功能不许丢**：整幅里仍然能切大小调，且切换后指板真的变（12 品窗口下 C 大调 18 格 → C 小调 17 格）。
 */
describe('CAGED 区块：分图 / 整幅两种样式', () => {
  const styledMount = () => {
    const p = mount()
    p.switchTab('把位教学')
    return p
  }
  const styleBtn = (p: ReturnType<typeof styledMount>, label: string) => p.buttonByText(label)
  const visibleDots = (p: ReturnType<typeof styledMount>) =>
    p.container.querySelectorAll('.ft-board .ft-dot[data-visible="1"]').length

  it('默认「分图」：两个样式按钮都在，且渲染的是分图（没有整幅的 .ft-stage）', () => {
    const p = styledMount()
    expect(styleBtn(p, '分图')).toBeTruthy()
    expect(styleBtn(p, '整幅')).toBeTruthy()
    expect(p.container.querySelectorAll('.ft-stage').length).toBe(0)
    expect(p.text()).toContain('五个经典可移动指型') // theory_caged_hint
    p.unmount()
  })

  it('样式按钮的选中态互斥', () => {
    const p = styledMount()
    const isOn = (label: string) => styleBtn(p, label)!.getAttribute('aria-pressed')
    expect(isOn('分图')).toBe('true')
    expect(isOn('整幅')).toBe('false')
    p.click(styleBtn(p, '整幅'))
    expect(styleBtn(p, '分图')!.getAttribute('aria-pressed')).toBe('false')
    expect(styleBtn(p, '整幅')!.getAttribute('aria-pressed')).toBe('true')
    p.unmount()
  })

  it('🚨 切到整幅：出现整幅指板与五形状图例，且外层「大三/小三」消失（避免两组不同步的按钮）', () => {
    const p = styledMount()
    expect(p.buttonByText('大三')).toBeTruthy() // 分图时在
    p.click(styleBtn(p, '整幅'))

    expect(p.container.querySelectorAll('.ft-stage').length).toBe(1)
    expect(p.container.querySelectorAll('.ft-legend span').length).toBe(5)
    expect(p.buttonByText('大三'), '外层性质组应被隐藏').toBeUndefined()
    expect(p.buttonByText('小三')).toBeUndefined()
    // 样式开关自己还在
    expect(styleBtn(p, '分图')).toBeTruthy()
    p.unmount()
  })

  it('🚨 整幅里功能不丢：自带「大调/小调」，切换后指板真的换数据（18 → 17 格）', () => {
    const p = styledMount()
    p.click(styleBtn(p, '整幅'))
    expect(visibleDots(p)).toBe(18)
    // 大调下 (0,0) 是空弦高音 E = C 的三音，且同时落在 C 与 D 两个形状里 ⇒ 双色共享音
    const dotAt00 = () =>
      p.container
        .querySelector('.ft-cell[data-string="0"][data-fret="0"] .ft-dot')!
        .getAttribute('data-role')
    expect(dotAt00()).toBe('form-DC')

    const minorBtn = p.buttonByText('小调')
    expect(minorBtn, '整幅应自带大小调切换').toBeTruthy()
    p.click(minorBtn)
    expect(visibleDots(p)).toBe(17)
    // 换小调后 E 不是 C 小三和弦音（相对 C 是 4 个半音，而小调三和弦是 0/3/7）⇒ 该格必须消失
    expect(dotAt00()).toBe('default')
    p.unmount()
  })

  it('提示文案随样式切换（分图讲五形状，整幅讲双色半半）', () => {
    const p = styledMount()
    p.click(styleBtn(p, '整幅'))
    expect(p.text()).toContain('双色半半')
    expect(p.text()).not.toContain('五个经典可移动指型')
    p.unmount()
  })

  it('切换样式不影响外层 major/minor 的状态（两处共用 cagedQuality）', () => {
    const p = styledMount()
    p.click(p.buttonByText('小三'))
    p.click(styleBtn(p, '整幅'))
    // 外层已隐藏，但状态被带过去 ⇒ 整幅应直接是小调
    expect(p.buttonByText('小调')!.getAttribute('aria-pressed')).toBe('true')
    expect(visibleDots(p)).toBe(17)
    p.unmount()
  })

  it('非标准六弦：即使点「整幅」也不渲染整幅指板，仍给不支持文案', () => {
    const p = mount({ instrument: 'seven_string_guitar' })
    p.switchTab('把位教学')
    p.click(styleBtn(p, '整幅'))
    expect(p.container.querySelectorAll('.ft-stage').length).toBe(0)
    expect(p.text()).toContain('CAGED')
    p.unmount()
  })
})

// ==================== 调式图鉴（展示方式参考 myfretboardtrainer.com） ====================

const FAMILY_LABEL: Record<string, string> = {
  major: '大调调式',
  harmonicMinor: '和声小调调式',
  melodicMinor: '旋律小调调式',
}

describe('调式图鉴', () => {
  it('切到该 Tab：3 个调式族按钮 + 7 个调式按钮 + 全指板', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    expect(p.text()).toContain('选择调式族与根音')            // theory_modes_hint
    for (const label of Object.values(FAMILY_LABEL)) expect(p.buttonByText(label), label).toBeDefined()
    expect(p.boards()).toHaveLength(1)
    // 默认族 = 大调，7 个调式按钮全在
    for (const name of ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian']) {
      expect(p.buttonByText(getScaleDisplayNameByName(name, 'chinese')), name).toBeDefined()
    }
    p.unmount()
  })

  it('调式按钮名必须走「按英文名取显示名」的那个函数（用错同名函数会退化成英文名）', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    for (const family of MODE_FAMILIES) {
      p.click(p.buttonByText(FAMILY_LABEL[family.id]))
      for (const mode of family.modes) {
        const zh = getScaleDisplayNameByName(mode.name, 'chinese')
        // 中文本地化确实存在（缺键会静默回落成英文原名，屏幕上就是没翻译）
        expect(zh, `${mode.name} 缺中文译名`).not.toBe(mode.name)
        expect(p.buttonByText(zh), `${mode.name} → ${zh}`).toBeDefined()
      }
    }
    p.unmount()
  })

  it('默认 Ionian/C：指板按音级标注（弦索引 5 = 低音 E 弦）', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    // 低音 E 弦 0 品 = E ⇒ C 大调第 3 级；8 品 = C ⇒ 根音
    expect(p.cellText(0, 5, 0)).toBe('3')
    expect(p.cellText(0, 5, 8)).toBe('1')
    expect(p.cellText(0, 5, 10)).toBe('2')   // +10 = D
    // 根音格用主色（不看 textContent —— 颜色才是「这是根音」的视觉契约）
    expect((p.cellAt(0, 5, 8)?.className ?? '').split(/\s+/)).toContain('bg-primary/80')
    expect((p.cellAt(0, 5, 0)?.className ?? '').split(/\s+/)).not.toContain('bg-primary/80')
    p.unmount()
  })

  it('切调式会重算指板：Locrian 里 E 不是音阶音 ⇒ 该格变空', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    expect(p.cellText(0, 5, 0)).toBe('3')                       // C Ionian 的 E
    p.click(p.buttonByText(getScaleDisplayNameByName('Locrian', 'chinese')))
    expect(p.cellText(0, 5, 0)).toBe('')                        // C Locrian 无 E
    expect(p.cellText(0, 5, 8)).toBe('1')                       // 根音还在
    p.unmount()
  })

  it('显示切换：音级 ↔ 音名；♯/♭ 切换只影响音名拼写', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    // 换到 Locrian 才有 C♯/D♭ 这种可两种拼写的音（C 大调全是白键）
    p.click(p.buttonByText(getScaleDisplayNameByName('Locrian', 'chinese')))
    // 高音 E 弦 9 品 = pc 1 ⇒ 音级 b2
    expect(p.cellText(0, 0, 9)).toBe('♭2')
    const [, notesBtn] = p.rowButtons('显示')
    p.click(notesBtn)
    expect(p.cellText(0, 0, 9)).toBe('C♯')                      // 默认升号拼写
    const [sharpsBtn, flatsBtn] = p.rowButtons('拼写')
    p.click(flatsBtn)
    expect(p.cellText(0, 0, 9)).toBe('D♭')
    p.click(sharpsBtn)
    expect(p.cellText(0, 0, 9)).toBe('C♯')
    p.unmount()
  })

  it('父调提示随「调式 × 根音」重算（D Dorian = C 大调第 2 级 → E Dorian = D 大调第 2 级）', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    p.click(p.buttonByText(getScaleDisplayNameByName('Dorian', 'chinese')))
    p.pickOption(0, 'D')
    expect(p.text()).toContain('父调：C 伊奥尼亚调式 的第 2 级')
    p.pickOption(0, 'E')
    expect(p.text()).toContain('父调：D 伊奥尼亚调式 的第 2 级')
    expect(p.text()).not.toContain('父调：C 伊奥尼亚调式')
    p.unmount()
  })

  it('父调提示的调式名也跟着换族（E 弗里几亚属 = A 和声小调第 5 级）', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    p.click(p.buttonByText(FAMILY_LABEL.harmonicMinor))
    // 换族会把调式索引重置回 0（Harmonic Minor 自己）—— 此时无父调行
    expect(p.text()).toContain('和声小调')
    expect(p.text()).not.toContain('父调：')
    p.click(p.buttonByText(getScaleDisplayNameByName('Phrygian Dominant', 'chinese')))
    p.pickOption(0, 'E')
    expect(p.text()).toContain('父调：A 和声小调 的第 5 级')
    p.unmount()
  })

  it('换族会把调式索引重置到 0（否则会带着上一族的第 N 个调式跨族，含义完全不同）', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    // 先在大调族切到第 5 个（Mixolydian）
    p.click(p.buttonByText(getScaleDisplayNameByName('Mixolydian', 'chinese')))
    expect(p.text()).toContain('属七和弦的本命调式')
    p.click(p.buttonByText(FAMILY_LABEL.melodicMinor))
    // 重置到 index 0 = Melodic Minor 自己（而不是旋律小调族的第 5 个 Locrian Nat 2）
    expect(p.text()).toContain('爵士小调的基准')
    expect(p.text()).not.toContain('属七和弦的本命调式')
    p.unmount()
  })

  it('根音换到 C♯：根音格跟着移到 pc 1（高音 E 弦 9 品）', () => {
    const p = mount()
    p.switchTab('调式图鉴')
    p.pickOption(0, 'C♯')
    expect((p.cellAt(0, 0, 9)?.className ?? '').split(/\s+/)).toContain('bg-primary/80')
    expect((p.cellAt(0, 5, 8)?.className ?? '').split(/\s+/)).not.toContain('bg-primary/80')  // 原来的 C
    p.unmount()
  })

  it('七弦吉他也能用（走 instrument 配置而不是写死六弦）', () => {
    const p = mount({ instrument: 'seven_string_guitar' })
    p.switchTab('调式图鉴')
    // 第 7 行（索引 6）= 低音 B 弦：0 品 B 是 C 大调第 7 级
    expect(p.cellText(0, 6, 0)).toBe('7')
    p.unmount()
  })
})

// ==================== 音程探索 ====================

describe('音程探索', () => {
  it('切到该 Tab：整指板每格都是按钮，13 品 × 6 弦，7 组图例', () => {
    const p = mount()
    p.switchTab('音程探索')
    expect(p.text()).toContain('点击任意格子把该音设为根音')   // theory_intervals_hint
    const board = p.boards()[0]
    expect(board).toBeDefined()
    // 6 弦 × 13 品（0..12）全可点
    expect(board.querySelectorAll('button[data-cell]')).toHaveLength(6 * 13)
    for (const g of INTERVAL_GROUPS) expect(p.text(), g.id).toContain(g.labelZh)
    p.unmount()
  })

  it('默认根音 C：格子标出与根音的音程，根音格用主色', () => {
    const p = mount()
    p.switchTab('音程探索')
    expect(p.cellText(0, 5, 8)).toBe('1')                       // 低音 E 弦 8 品 = C
    expect(p.cellText(0, 5, 0)).toBe('3')                       // 0 品 E = 大三度
    expect(p.cellText(0, 5, 1)).toBe('4')                       // F 纯四度
    expect((p.cellAt(0, 5, 8)?.className ?? '').split(/\s+/)).toContain('bg-primary/80')
    p.unmount()
  })

  it('点格子换根音：该格变 1，原根音格按新根音重算，下拉同步，配色跟着重排', () => {
    const p = mount()
    p.switchTab('音程探索')
    expect(p.combos()[0].textContent).toBe('C')
    p.click(p.cellAt(0, 0, 0))                                  // 高音 E 弦 0 品 = E
    expect(p.cellText(0, 0, 0)).toBe('1')
    expect(p.cellText(0, 5, 8)).toBe('♭6')                      // C 相对 E 是小六度
    expect(p.combos()[0].textContent).toBe('E')
    const cls = (s: number, f: number) => (p.cellAt(0, s, f)?.className ?? '').split(/\s+/)
    // 配色必须跟着新根音重排：E 格变主色、C 格落到小六度组
    expect(cls(0, 0)).toContain('bg-primary/80')
    expect(cls(5, 8)).toContain('bg-sky-500/25')                // 8 半音 = 大三度·小六度对
    p.unmount()
  })

  it('互补对同色（转位在指板上同形）：pc 1 与 pc 11 都用半音组配色，三全音自成一色', () => {
    const p = mount()
    p.switchTab('音程探索')
    // 根音 C：高音 E 弦 9 品 = pc 1（小二度），7 品 = pc 11（大七度），2 品 = pc 6（三全音）
    expect(p.cellText(0, 0, 9)).toBe('♭2')
    expect(p.cellText(0, 0, 7)).toBe('7')
    expect(p.cellText(0, 0, 2)).toBe('♭5')
    const cls = (s: number, f: number) => (p.cellAt(0, s, f)?.className ?? '').split(/\s+/)
    expect(cls(0, 9)).toContain('bg-rose-500/25')
    expect(cls(0, 7)).toContain('bg-rose-500/25')
    expect(cls(0, 2)).toContain('bg-orange-500/30')
    p.unmount()
  })

  it('音名显示：切成音名后格子显示音名而不是音级', () => {
    const p = mount()
    p.switchTab('音程探索')
    const [, notesBtn] = p.rowButtons('显示')
    p.click(notesBtn)
    expect(p.cellText(0, 5, 8)).toBe('C')
    expect(p.cellText(0, 5, 0)).toBe('E')
    p.unmount()
  })

  it('英文界面下图例与提示走英文', () => {
    const p = mount({ language: 'en' })
    p.switchTab('Interval Explorer')
    expect(p.text()).toContain(INTERVAL_GROUPS.find((g) => g.id === 'tritone')!.labelEn)
    expect(p.text()).not.toContain('三全音')
    p.unmount()
  })
})

// ==================== 和弦音位图（整指板） ====================

describe('和弦音阶：整指板和弦音位图', () => {
  it('默认 C7：标出 R/3/5/♭7', () => {
    const p = mount()
    p.switchTab('和弦音阶')
    expect(p.text()).toContain('和弦音位（整指板）')            // theory_chord_map
    expect(p.boards()).toHaveLength(1)
    expect(p.cellText(0, 5, 8)).toBe('R')                       // C
    expect(p.cellText(0, 5, 0)).toBe('3')                       // E
    expect(p.cellText(0, 5, 3)).toBe('5')                       // G
    expect(p.cellText(0, 5, 6)).toBe('♭7')                      // B♭（走 formatDegree ⇒ ♭ 号与全屏一致）
    expect(p.cellText(0, 5, 1)).toBe('')                        // F 不是和弦音
    p.unmount()
  })

  it('和弦根音参与移调：根音换 D 后 D 才是 R，原来的 C 变成 ♭7', () => {
    const p = mount()
    p.switchTab('和弦音阶')
    p.pickOption(0, 'D')                                        // combos[0] = 根音
    expect(p.cellText(0, 5, 10)).toBe('R')                      // 低音 E 弦 10 品 = D
    expect(p.cellText(0, 5, 8)).toBe('♭7')                      // 8 品 = C
    expect((p.cellAt(0, 5, 10)?.className ?? '').split(/\s+/)).toContain('bg-primary/80')
    p.unmount()
  })

  it('复合音程不被 %12 折成 2/9：属十三和弦出现 9 与 13', () => {
    const p = mount()
    p.switchTab('和弦音阶')
    // combos[1] = 和弦类型（combos[0] 是根音）；选项显示的是符号记谱而非中文名
    p.pickOption(1, getChordTypeUnicodeDisplayString(ChordType.dominantThirteen))
    expect(p.cellText(0, 5, 10)).toBe('9')                      // pc 2 ⇒ iv 14
    expect(p.cellText(0, 5, 5)).toBe('13')                      // pc 9 ⇒ iv 21
    // %12 折叠会显示成 2 / 6 —— 正是这条用例要挡的
    expect(p.cellText(0, 5, 10)).not.toBe(chordToneLabel(2))
    p.unmount()
  })
})
