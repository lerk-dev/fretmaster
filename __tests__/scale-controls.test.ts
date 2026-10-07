/**
 * components/scale-controls.tsx 的契约测试（此前零测试）。
 *
 * 音阶练习控制面板：调性 / 调式分类 / 方向 / 根音移动 / 显示开关 / 练习序列 / 音阶多选。
 *
 * 契约：
 *  ① 所有可见文案走 t()（英文下不含汉字）；
 *  ② 方向与练习序列是「单选按钮组」—— 选中项用 default variant（bg-primary）区分；
 *  ③ 显示选项三个 Switch 的 checked 由 props 决定，并与 Label 的 htmlFor 关联；
 *  ④ 音阶多选的「至少保留一个」规则：只剩一个时点击已选项**不触发任何回调**。
 *  ⑤ 三个 Select 的 onValueChange 是「字符串 → 回调实参」的转换点，此前**一次都没被驱动过**：
 *     - 调性选「随机调」要**同时**置 isScaleKeyRandom=true 并给一个合法的随机音名；
 *       选具体音则置 false 并回传该音（两者互斥，漏一个就出现「开关与值不一致」）。
 *     - 调式分类是**联动**：改分类必须同时把当前音阶重置为该分类的第一项
 *       （否则会拿上一分类的音阶去练新分类）。
 *     - 根音移动原样回传 id。
 *
 * ⚠️ 旧注释曾写「radix Select 在 jsdom 打不开，故只断言 combobox 存在」——那是**误判**：
 * 补上 `hasPointerCapture/setPointerCapture/releasePointerCapture/scrollIntoView` 四个 jsdom 缺口后，
 * trigger 上派 `pointerdown` **再** `click` 即可展开，再点 `[role="option"]` 就能选中。
 * 不驱动回调 = 「改了下拉、父组件没收到」这类回归完全测不出来。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ScaleControls } from '@/components/scale-controls'
import { NOTES, SCALE_MODES, SCALE_PRACTICE_SEQUENCES } from '@/lib/page-theory-data'
import { getScaleDisplayName } from '@/lib/page-theory-functions'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
;(globalThis as Record<string, unknown>).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// radix Select 展开要用的 jsdom 缺口（补齐后才能真正驱动 onValueChange）
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k
const tEn = (k: string) => en[k] ?? k
const CJK = /[\u4e00-\u9fff]/

const PENTA = SCALE_MODES.pentatonic
const MAJOR_MODES = SCALE_MODES.majorScaleModes

let cleanups: Array<() => void> = []
afterEach(() => {
  // 用例中途断言失败会跳过它自己的 unmount()，且卸载本身也可能抛错 —— 两者都会让
  // 残留 DOM 污染下一条用例（实测：某条失败会让后续用例的 querySelector 查不到元素，
  // 冒出无关的「假失败」）。故逐条 try 包裹 + 兜底清空 body。
  for (const fn of cleanups) {
    try { fn() } catch { /* 忽略卸载异常 */ }
  }
  cleanups = []
  document.body.innerHTML = ''
  vi.restoreAllMocks()   // 兜底：Math.random 的 spy 不能泄漏到下一条用例
})

function mount(overrides: Partial<Record<string, unknown>> = {}) {
  const handlers = {
    onIsScaleKeyRandomChange: vi.fn(),
    onScaleKeyChange: vi.fn(),
    onSelectedScaleCategoryChange: vi.fn(),
    onSelectedScaleChange: vi.fn(),
    onScaleDirectionChange: vi.fn(),
    onScaleRootMovementChange: vi.fn(),
    onShowScaleFretboardChange: vi.fn(),
    onShowScaleKeyboardChange: vi.fn(),
    onShowScaleStructureChange: vi.fn(),
    onScalePracticeSequenceChange: vi.fn(),
    onSelectedScalesChange: vi.fn(),
    onThreeNpsPositionChange: vi.fn(),
  }
  const p = {
    t: tZh,
    language: 'zh-CN',
    isScaleKeyRandom: false,
    scaleKey: 'C',
    selectedScaleCategory: 'pentatonic' as keyof typeof SCALE_MODES,
    selectedScale: PENTA[0],
    scaleDirection: 'up',
    scaleRootMovement: 'static',
    showScaleFretboard: true,
    showScaleKeyboard: false,
    showScaleStructure: false,
    scalePracticeSequence: '1to1',
    selectedScales: [PENTA[0]] as typeof PENTA,
    // 一弦三音（3NPS）：默认关闭，避免影响原有用例
    threeNpsActive: false,
    threeNpsPositions: [] as { index: number; position: number }[],
    threeNpsSelectedIndex: 0,
    threeNpsShortestScaleNoteCount: 5,
    ...overrides,
    ...handlers,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(ScaleControls as never, p as never)) })

  const buttons = () => [...container.querySelectorAll('button')] as HTMLElement[]
  const byText = (text: string) => buttons().find((b) => b.textContent?.trim() === text)
  const text = () => container.textContent ?? ''
  /** 三个下拉的顺序：0 调性 / 1 调式分类 / 2 根音移动（选项列表 portal 到 body，故查 document） */
  const combos = () => [...document.querySelectorAll('[role="combobox"]')] as HTMLElement[]
  /** 展开第 idx 个 Select，返回选项元素（radix 要 pointerdown **再** click 才展开） */
  const openSelect = (idx: number) => {
    const c = combos()[idx]
    expect(c, `第 ${idx} 个 combobox 应存在`).toBeTruthy()
    act(() => {
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    return [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
  }
  const pickOption = (idx: number, label: string) => {
    const opts = openSelect(idx)
    const opt = opts.find((o) => o.textContent === label)
    if (!opt) {
      throw new Error(`找不到选项「${label}」；实际有：${opts.map((o) => o.textContent).join(' | ')}`)
    }
    act(() => { opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  /**
   * 分类标题是 15 处**内联**三元链（源码 252-266），不走 i18n ⇒ i18n 护栏管不到。
   * 各标题还互为子串（「其他音阶」⊂「其他音阶(旧)」），用 contains 会假通过，
   * 故取「标题 + (多选提示)」的**完整**文本做精确比对。
   */
  const categoryTitle = () => {
    const hintSpan = [...container.querySelectorAll('span')].find((s) => s.className.includes('ml-1'))
    return hintSpan?.parentElement?.textContent ?? ''
  }
  let done = false
  const unmount = () => {
    if (done) return   // 幂等：用例卸过之后 afterEach 再调一次不能炸
    done = true
    act(() => root.unmount())
    container.remove()
  }
  cleanups.push(unmount)   // 断言失败会跳过用例自己的 unmount() ⇒ 交给 afterEach 兜底
  return {
    container,
    ...handlers,
    buttons,
    byText,
    text,
    switches: () => [...container.querySelectorAll('[role="switch"]')] as HTMLElement[],
    click(el: HTMLElement | null | undefined) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    combos,
    openSelect,
    pickOption,
    categoryTitle,
    unmount,
  }
}

describe('文案（全部走 t()）', () => {
  it('六个区块标题都来自 t()', () => {
    const p = mount()
    for (const k of [
      'scale_key', 'scale_mode', 'scale_direction', 'root_movement',
      'display_options', 'scale_practice_sequence',
    ]) {
      expect(p.text(), `缺少标题 ${k}`).toContain(tZh(k))
    }
    p.unmount()
  })

  it('英文界面下没有汉字', () => {
    const p = mount({ t: tEn, language: 'en' })
    // 分类标题区（14 类内联译文）在 en 下应是英文
    expect(p.text()).toContain('Pentatonic Scales')
    expect(p.text()).not.toMatch(CJK)
    p.unmount()
  })

  it('调式分类标题随 selectedScaleCategory 变化', () => {
    const p = mount({ selectedScaleCategory: 'majorScaleModes', selectedScale: MAJOR_MODES[0] })
    expect(p.text()).toContain('大调音阶模式')
    expect(p.text()).not.toContain('五声音阶')
    p.unmount()
  })
})

describe('方向（单选按钮组）', () => {
  it('四个方向按钮文案走 t()', () => {
    const p = mount()
    expect(p.byText(tZh('order_ascending'))).toBeTruthy()
    expect(p.byText(tZh('order_descending'))).toBeTruthy()
    expect(p.byText(tZh('order_asc_desc'))).toBeTruthy()
    expect(p.byText(tZh('order_random'))).toBeTruthy()
    p.unmount()
  })

  it('只有当前方向是选中态（bg-primary），其余不是', () => {
    const p = mount({ scaleDirection: 'down' })
    expect(p.byText(tZh('order_descending'))!.className).toContain('bg-primary')
    expect(p.byText(tZh('order_ascending'))!.className).not.toContain('bg-primary')
    expect(p.byText(tZh('order_asc_desc'))!.className).not.toContain('bg-primary')
    expect(p.byText(tZh('order_random'))!.className).not.toContain('bg-primary')
    p.unmount()
  })

  it('点击方向按钮回传对应 id', () => {
    const p = mount()
    p.click(p.byText(tZh('order_random')))
    expect(p.onScaleDirectionChange).toHaveBeenCalledWith('random')
    p.unmount()
  })
})

describe('显示选项开关', () => {
  it('三个 Switch 的 checked 与 props 一致，且与 Label 的 htmlFor 对应', () => {
    const p = mount({ showScaleFretboard: true, showScaleKeyboard: false, showScaleStructure: true })
    const sw = p.switches()
    expect(sw).toHaveLength(3)

    const state = (id: string) => {
      const wrap = p.container.querySelector(`#${id}`) as HTMLElement
      expect(wrap, `找不到 #${id}`).toBeTruthy()
      return { id, checked: wrap.getAttribute('aria-checked') ?? wrap.getAttribute('data-state') }
    }
    expect(state('showScaleFretboard').checked).toMatch(/true/)
    expect(state('showScaleKeyboard').checked).toMatch(/false/)
    expect(state('showScaleStructure').checked).toMatch(/true/)

    // Label 必须指向真实存在的控件 id
    const labels = [...p.container.querySelectorAll('label')] as HTMLLabelElement[]
    for (const l of labels) {
      const forId = l.getAttribute('for')
      expect(forId, 'Label 缺少 for').toBeTruthy()
      expect(p.container.querySelector(`#${forId}`), `Label[for=${forId}] 指向不存在的元素`).toBeTruthy()
    }
    p.unmount()
  })
})

describe('练习序列（单选）', () => {
  it('按钮数量 = SCALE_PRACTICE_SEQUENCES，random 项显示 t(random)', () => {
    const p = mount()
    for (const seq of SCALE_PRACTICE_SEQUENCES) {
      const label = seq.id === 'random' ? tZh('random') : seq.name
      expect(p.byText(label), `缺少序列按钮 ${label}`).toBeTruthy()
    }
    p.unmount()
  })

  it('只有当前序列是选中态', () => {
    const p = mount({ scalePracticeSequence: '3to3' })
    expect(p.byText('3→3')!.className).toContain('bg-primary')
    expect(p.byText('1→1')!.className).not.toContain('bg-primary')
    p.unmount()
  })

  it('点击序列按钮回传 id', () => {
    const p = mount()
    p.click(p.byText('5→5'))
    expect(p.onScalePracticeSequenceChange).toHaveBeenCalledWith('5to5')
    p.unmount()
  })
})

describe('音阶多选', () => {
  const scaleLabel = (name: string, lang: 'chinese' | 'english' = 'chinese') =>
    getScaleDisplayName(name, lang)

  it('按钮数量 = 当前分类下的音阶数，名字走 getScaleDisplayName', () => {
    const p = mount({ selectedScaleCategory: 'pentatonic', selectedScale: PENTA[0] })
    for (const s of PENTA) {
      expect(p.byText(scaleLabel(s.name)), `缺少音阶按钮 ${s.name}`).toBeTruthy()
    }
    p.unmount()
  })

  it('英文界面用英文音阶名', () => {
    const p = mount({ t: tEn, language: 'en', selectedScaleCategory: 'pentatonic', selectedScale: PENTA[0] })
    expect(p.byText(scaleLabel(PENTA[0].name, 'english'))).toBeTruthy()
    p.unmount()
  })

  it('点未选中的音阶 → 追加进 selectedScales 并把它设为当前', () => {
    const p = mount({ selectedScales: [PENTA[0]], selectedScale: PENTA[0] })
    p.click(p.byText(scaleLabel(PENTA[2].name)))
    expect(p.onSelectedScalesChange).toHaveBeenCalledTimes(1)
    expect(p.onSelectedScalesChange.mock.calls[0][0]).toEqual([PENTA[0], PENTA[2]])
    expect(p.onSelectedScaleChange).toHaveBeenCalledWith(PENTA[2])
    p.unmount()
  })

  it('点已选中（且还剩多于一个）→ 移除，并把剩余的设为当前', () => {
    const p = mount({ selectedScales: [PENTA[0], PENTA[1]], selectedScale: PENTA[0] })
    p.click(p.byText(scaleLabel(PENTA[0].name)))
    expect(p.onSelectedScalesChange).toHaveBeenCalledTimes(1)
    expect(p.onSelectedScalesChange.mock.calls[0][0]).toEqual([PENTA[1]])
    expect(p.onSelectedScaleChange).toHaveBeenCalledWith(PENTA[1])
    p.unmount()
  })

  it('只剩一个时点它 → 不触发任何回调（至少保留一个）', () => {
    const p = mount({ selectedScales: [PENTA[0]], selectedScale: PENTA[0] })
    p.click(p.byText(scaleLabel(PENTA[0].name)))
    expect(p.onSelectedScalesChange).not.toHaveBeenCalled()
    expect(p.onSelectedScaleChange).not.toHaveBeenCalled()
    p.unmount()
  })

  it('选中项是选中态（bg-primary），未选中不是', () => {
    const p = mount({ selectedScales: [PENTA[0]], selectedScale: PENTA[0] })
    expect(p.byText(scaleLabel(PENTA[0].name))!.className).toContain('bg-primary')
    expect(p.byText(scaleLabel(PENTA[1].name))!.className).not.toContain('bg-primary')
    p.unmount()
  })
})

describe('下拉框：三个 Select 的 onValueChange（此前零覆盖）', () => {
  it('调性 / 调式分类 / 根音移动三个 combobox 都存在且初始为关闭态', () => {
    const p = mount()
    expect(p.combos()).toHaveLength(3)
    expect(p.combos().every((c) => c.getAttribute('aria-expanded') === 'false')).toBe(true)
    p.unmount()
  })

  it('调性选具体音 → isScaleKeyRandom=false 且回传该音（两者必须同时，否则开关与值漂移）', () => {
    const p = mount({ scaleKey: 'C', isScaleKeyRandom: false })
    p.pickOption(0, 'D♯')
    expect(p.onIsScaleKeyRandomChange).toHaveBeenCalledWith(false)
    expect(p.onScaleKeyChange).toHaveBeenCalledWith('D♯')
    p.unmount()
  })

  it('调性选「随机调」→ isScaleKeyRandom=true 且回传**随机下标**对应的合法音名（下端）', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const p = mount({ scaleKey: 'C', isScaleKeyRandom: false })
    p.pickOption(0, tZh('random_key'))
    expect(p.onIsScaleKeyRandomChange).toHaveBeenCalledWith(true)
    expect(p.onScaleKeyChange).toHaveBeenCalledWith(NOTES[0])   // floor(0*12)=0
    spy.mockRestore()
    p.unmount()
  })

  it('调性选「随机调」→ 下标随 Math.random 变化（上端不会越界成 undefined）', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const p = mount({ scaleKey: 'C', isScaleKeyRandom: false })
    p.pickOption(0, tZh('random_key'))
    // floor(0.999*12)=11 → NOTES[11]；若实现写成 round 会取到 12（越界 undefined）
    expect(p.onScaleKeyChange).toHaveBeenCalledWith(NOTES[11])
    spy.mockRestore()
    p.unmount()
  })

  it('调式分类：改分类**联动**把当前音阶重置为该分类第一项（否则会拿旧分类的音阶练新分类）', () => {
    const p = mount({ selectedScaleCategory: 'pentatonic', selectedScale: PENTA[0] })
    p.pickOption(1, '大调模式')
    expect(p.onSelectedScaleCategoryChange).toHaveBeenCalledWith('majorScaleModes')
    expect(p.onSelectedScaleChange).toHaveBeenCalledWith(MAJOR_MODES[0])
    p.unmount()
  })

  it('根音移动：原样回传 id', () => {
    const p = mount({ scaleRootMovement: 'static' })
    p.pickOption(2, tZh('root_movement_circle_of_fifths'))
    expect(p.onScaleRootMovementChange).toHaveBeenCalledWith('circleOfFifths')
    p.unmount()
  })

  it('isScaleKeyRandom=true 时调性下拉显示「随机调」而不是当前音名', () => {
    const p = mount({ isScaleKeyRandom: true, scaleKey: 'C' })
    expect(p.combos()[0].textContent).toContain(tZh('random_key'))
    expect(p.combos()[0].textContent).not.toContain('C')
    p.unmount()
  })
})

/**
 * 分类标题与下拉选项名是 **30 处内联三元**（不走 i18n）：i18n 护栏管不到，
 * 写错一个字在 UI 上只是「标题不对」，没人会报 bug。且多条互为子串，
 * ⇒ 用「完整文本精确相等」比对，contains 会让「其他音阶(旧)」冒充「其他音阶」。
 */
describe('内联译文矩阵（分类标题 + 下拉选项名）', () => {
  const TITLES: Array<[keyof typeof SCALE_MODES, string, string]> = [
    ['pentatonic', '五声音阶', 'Pentatonic Scales'],
    ['majorScaleModes', '大调音阶模式', 'Major Scale Modes'],
    ['melodicMinorScaleModes', '旋律小调模式', 'Melodic Minor Scale Modes'],
    ['harmonicMinorScaleModes', '和声小调模式', 'Harmonic Minor Scale Modes'],
    ['harmonicMajorScaleModes', '和声大调模式', 'Harmonic Major Scale Modes'],
    ['otherScales', '其他音阶', 'Other Scales'],
    ['bebopScales', 'Bebop音阶', 'Bebop Scales'],
    ['basic', '基础音阶', 'Basic Scales'],
    ['church', '教会调式', 'Church Modes'],
    ['minor', '小调变体', 'Minor Variants'],
    ['bebop', 'Bebop音阶(旧)', 'Bebop Scales(Old)'],
    ['jazz', '爵士音阶', 'Jazz Scales'],
    ['exotic', '异域音阶', 'Exotic Scales'],
    ['symmetrical', '对称音阶', 'Symmetrical Scales'],
    ['other', '其他音阶(旧)', 'Other Scales(Old)'],   // 落到三元链的 else 分支
  ]

  it('矩阵本身覆盖 SCALE_MODES 的全部 key（新增分类时本例会失败，提醒补译文）', () => {
    expect(TITLES).toHaveLength(Object.keys(SCALE_MODES).length)
    expect(new Set(TITLES.map((c) => c[0]))).toEqual(new Set(Object.keys(SCALE_MODES)))
  })

  for (const [key, zhTitle, enTitle] of TITLES) {
    it(`标题 ${key}：中文「${zhTitle}」/ 英文「${enTitle}」`, () => {
      for (const [lang, t, want] of [
        ['zh-CN', tZh, zhTitle],
        ['en', tEn, enTitle],
      ] as const) {
        const p = mount({
          language: lang,
          t,
          selectedScaleCategory: key,
          selectedScale: SCALE_MODES[key][0],
        })
        expect(p.categoryTitle(), `${key} @ ${lang}`).toBe(`${want}(${t('multi_select_hint')})`)
        p.unmount()
      }
    })
  }

  const OPT_ZH = ['五声音阶', '大调模式', '旋律小调模式', '和声小调模式', '和声大调模式', '其他音阶',
    'Bebop音阶', '异域音阶', '对称音阶', '基础', '教会调式', '小调变体', 'Bebop(旧)', '爵士', '其他(旧)']
  const OPT_EN = ['Pentatonic', 'Major Modes', 'Melodic Minor Modes', 'Harmonic Minor Modes',
    'Harmonic Major Modes', 'Other Scales', 'Bebop Scales', 'Exotic', 'Symmetrical', 'Basic',
    'Church', 'Minor', 'Bebop(Old)', 'Jazz', 'Other(Old)']

  it('调式分类下拉的 15 个选项名按顺序与语言一致（顺序错/文案错都会挂）', () => {
    for (const [lang, t, want] of [['zh-CN', tZh, OPT_ZH], ['en', tEn, OPT_EN]] as const) {
      const p = mount({ language: lang, t })
      expect(p.openSelect(1).map((o) => o.textContent)).toEqual(want)
      p.unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// 一弦三音（3NPS）把位选择器
//
// 这段 UI 只在「练习序列 = 3nps」时出现，成对的坑有三个：
//  ① 选了 3nps 但已选音阶全都是五声/六声 ⇒ **必须给出提示**，否则用户看到控件却怎么点都没反应；
//  ② 方向按钮在 3NPS 下是无意义的（序列自带上行 + 下行）⇒ 必须置灰，不能静默忽略；
//  ③ 回传给父组件的是**数组下标**，按钮上显示的是**把位号** —— 两者在「品数太小剔除个别把位」时
//     会不一样；把它们当成同一个数，选 P5 就会加载到别的把位。
// ---------------------------------------------------------------------------
describe('一弦三音把位选择器', () => {
  /** 常规：7 个可用把位，下标 == 把位号 - 1 */
  const SEVEN_POSITIONS = Array.from({ length: 7 }, (_, i) => ({ index: i, position: i + 1 }))

  it('未选 3nps 时整块不出现（不占位、也不渲染任何 P 按钮）', () => {
    const p = mount({ scalePracticeSequence: '1to1' })
    expect(p.container.querySelector('[data-testid="three-nps-positions"]')).toBeNull()
    expect(p.text()).not.toContain(tZh('three_nps_position_hint'))
    p.unmount()
  })

  it('七声音阶可用：渲染 P1..P7，当前把位是选中态（bg-primary）', () => {
    const p = mount({
      scalePracticeSequence: '3nps',
      threeNpsActive: true,
      threeNpsPositions: SEVEN_POSITIONS,
      threeNpsSelectedIndex: 3,
    })
    expect(p.container.querySelector('[data-testid="three-nps-positions"]')).toBeTruthy()
    for (let i = 1; i <= 7; i++) expect(p.byText('P' + i), '缺少 P' + i).toBeTruthy()
    expect(p.byText('P4')!.className).toContain('bg-primary')
    expect(p.byText('P1')!.className).not.toContain('bg-primary')
    expect(p.byText('P7')!.className).not.toContain('bg-primary')
    expect(p.text()).toContain(tZh('three_nps_marathon_start'))
    p.unmount()
  })

  it('🚨 点击回传的是数组下标（不是按钮上的把位号）', () => {
    const p = mount({
      scalePracticeSequence: '3nps',
      threeNpsActive: true,
      threeNpsPositions: SEVEN_POSITIONS,
      threeNpsSelectedIndex: 0,
    })
    p.click(p.byText('P4'))
    expect(p.onThreeNpsPositionChange).toHaveBeenCalledWith(3)
    p.unmount()
  })

  it('把位跳号时按钮文案与回传下标分离（品数太小剔除了中间把位）', () => {
    // 实际只剩「把位 1 / 4 / 7」三个可用
    const p = mount({
      scalePracticeSequence: '3nps',
      threeNpsActive: true,
      threeNpsPositions: [
        { index: 0, position: 1 },
        { index: 3, position: 4 },
        { index: 6, position: 7 },
      ],
      threeNpsSelectedIndex: 3,
    })
    expect(p.byText('P1')).toBeTruthy()
    expect(p.byText('P3')).toBeUndefined() // 跳号，不能凭空补一个 P3 出来
    expect(p.byText('P4')!.className).toContain('bg-primary')
    p.click(p.byText('P7'))
    expect(p.onThreeNpsPositionChange).toHaveBeenCalledWith(6)
    p.unmount()
  })

  it('已选音阶里没有七声时：给出提示（含当前音阶音数），且不渲染把位按钮', () => {
    const p = mount({
      scalePracticeSequence: '3nps',
      threeNpsActive: false,
      threeNpsPositions: [],
      threeNpsShortestScaleNoteCount: 5,
    })
    expect(p.text()).toContain(tZh('three_nps_not_eligible').replace('{count}', '5'))
    expect(p.byText('P1')).toBeUndefined()
    p.unmount()
  })

  it('3NPS 生效时方向按钮置灰（序列自带上行 + 下行，方向无意义）', () => {
    const p = mount({
      scalePracticeSequence: '3nps',
      threeNpsActive: true,
      threeNpsPositions: SEVEN_POSITIONS,
    })
    for (const k of ['order_ascending', 'order_descending', 'order_asc_desc', 'order_random']) {
      expect(p.byText(tZh(k))!.hasAttribute('disabled'), k + ' 应被禁用').toBe(true)
    }
    p.unmount()

    // 对照：普通模式下方向按钮必须可用
    const normal = mount({ scalePracticeSequence: '1to1', threeNpsActive: false })
    expect(normal.byText(tZh('order_ascending'))!.hasAttribute('disabled')).toBe(false)
    normal.unmount()
  })

  it('练习序列按钮上的「一弦3音」走 t()，不是写死的中文', () => {
    const zh = mount({ scalePracticeSequence: '1to1' })
    expect(zh.byText(tZh('scale_seq_3nps'))).toBeTruthy()
    zh.unmount()

    const en = mount({ t: tEn, language: 'en', scalePracticeSequence: '1to1' })
    expect(en.byText(tEn('scale_seq_3nps'))).toBeTruthy()
    expect(en.text()).not.toContain('一弦3音')
    en.unmount()
  })

  it('英文界面下把位区文案与 aria-label 都是英文', () => {
    const p = mount({
      t: tEn,
      language: 'en',
      scalePracticeSequence: '3nps',
      threeNpsActive: true,
      threeNpsPositions: SEVEN_POSITIONS,
    })
    expect(p.text()).toContain(tEn('three_nps_position'))
    expect(p.byText(tEn('scale_seq_3nps'))).toBeTruthy()
    const p1 = p.byText('P1')!
    expect(p1.getAttribute('aria-label')).toBe(tEn('three_nps_position') + ' 1')
    expect(p.text()).not.toContain('把位')
    p.unmount()
  })

  it('阻止提示与把位按钮在同一块 UI 内二选一，且提示是 aria-live 区', () => {
    const blocked = mount({
      scalePracticeSequence: '3nps',
      threeNpsActive: false,
      threeNpsPositions: [],
      threeNpsShortestScaleNoteCount: 6,
    })
    const box = blocked.container.querySelector('[data-testid="three-nps-positions"]')!
    expect(box).toBeTruthy()
    expect(box.querySelectorAll('[role="status"]')).toHaveLength(1)
    // 提示态下这块里一个按钮都不该有（不能既提示不可用、又摆一排点不动的 P 按钮）
    expect(box.querySelectorAll('button')).toHaveLength(0)
    blocked.unmount()
  })
})

