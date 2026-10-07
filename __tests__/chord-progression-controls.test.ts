/**
 * components/chord-progression-controls.tsx 的契约测试（此前零测试）。
 *
 * 和弦进行控制面板：纯受控组件 + radix Accordion 折叠区（自定义和弦）。
 * 测「props → 界面」与「界面 → 回调」的双向契约：
 *
 *  ① 歌曲按钮：普通歌显示歌名、__custom__ 显示「自定义和弦进行」，点击回传 true；
 *  ② 调性显示 = normalizeNoteName(调) + 大调/小调（isMinor 与语言双维）；
 *  ③ 开关联动：randomizeKey 只在「循环进行」时渲染（switch 5 ↔ 6）、
 *     声部连接在「随机顺序」下禁用（随机顺序下没有"下一个"，声部连接无从谈起）；
 *  ④ 「下一和弦」在未练习时禁用；
 *  ⑤ 自定义和弦区：默认折叠、点击展开；序列 badge 用 formatChordName 渲染
 *     （含 slash 低音）、删除按钮回传下标；保存/导出在无序列时禁用、清空按钮只在有序列时出现。
 *  ⑥ **调性 Select 的 onValueChange**：回传的是**音名原值**（`C♯`），不是界面上显示的
 *     `C♯ / D♭大调` —— 界面文案与回传值不同源，这是最容易写错的一处。
 *  ⑦ **顺序 Select 的 onValueChange**：回传 `asc`/`desc`/`random` 原值，且三个选项都要覆盖
 *     （只测一个的话，「把三个 SelectItem 的 value 都写成 asc」这种复制粘贴错测不出来）。
 *  ⑧ **自定义序列名输入框**：回传 `e.target.value`（String），不是 InputEvent。
 *
 * ⚠️ 测试手法注意：radix Accordion 展开后内容才挂载 —— 展开**之后**必须重新查询 DOM，
 * 不能用 render 时捕获的按钮快照（那会拿到"未渲染"的 undefined，像本组件探针第一版那样）。
 * ⚠️ radix Select 在 jsdom 下**可以**真展开并选中（本文件已验证）：补上
 *    `hasPointerCapture/setPointerCapture/releasePointerCapture/scrollIntoView` 四个 jsdom 缺口后，
 *    在 trigger 上派 `pointerdown` **再** `click`，随后点 `[role="option"]` 即可。
 *    ~~radix Switch 在 jsdom 下 click 不触发 onCheckedChange~~ → **该结论已被证伪**：
 *    radix Switch 的 root 是 `<button>`，React 19 会为 **disabled** 的 form 元素跳过 mouse 事件；
 *    enabled 时派发 click 是能触发的。本组件「随机顺序下声部连接禁用」正是 disabled 场景，
 *    所以那里只断 disabled 属性是对的，但理由不是「radix 打不开」。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ChordProgressionControls } from '@/components/chord-progression-controls'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import { TRANSLATIONS } from '@/lib/i18n'
import { NOTES, NOTES_FLAT } from '@/lib/page-theory-data'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// radix Select 展开需要的 jsdom 缺口
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }
const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k
const tEn = (k: string) => (TRANSLATIONS['en'] as Record<string, string>)[k] ?? k

type Chord = { root: string; type: string; bass?: string }

/**
 * 🚨 模块级兜底拆树：断言失败会跳过该用例自己的 `unmount()`，残留 React root 会污染
 * 后续用例（变异结果里会掺进大量误伤）。故一律登记到 mounted[] 由 afterEach 统一卸载。
 */
const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = []
afterEach(() => {
  for (const m of mounted.splice(0)) {
    try { act(() => m.root.unmount()) } catch { /* 已卸载 */ }
    m.container.remove()
  }
  document.body.innerHTML = ''
})

function render(props: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[][]> = {}
  const track = (name: string) => (...args: unknown[]) => { (calls[name] ??= []).push(args) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.push({ root, container })
  act(() => {
    root.render(createElement(ChordProgressionControls as never, {
      t,
      language: 'zh-CN',
      selectedSong: SONG_PROGRESSIONS[0],
      onShowSongSelectorChange: track('song'),
      progressionKey: 'C',
      onProgressionKeyChange: track('key'),
      isMinor: false,
      practiceLevel: ALL_PRACTICE_LEVELS[0].id,
      onShowLevelSelectorChange: track('level'),
      chordPlayOrder: 'asc',
      onChordPlayOrderChange: track('order'),
      progressionRepeat: false,
      onProgressionRepeatChange: track('repeat'),
      shouldVoiceLead: true,
      onShouldVoiceLeadChange: track('voiceLead'),
      shouldRandomizeKeyOnRepeat: false,
      onShouldRandomizeKeyOnRepeatChange: track('randomizeKey'),
      showChordFretboard: true,
      onShowChordFretboardChange: track('fretboard'),
      showChordStructure: false,
      onShowChordStructureChange: track('structure'),
      showChordKeyboard: false,
      onShowChordKeyboardChange: track('keyboard'),
      isPlaying: false,
      nextChord: track('nextChord'),
      newChordRoot: 'C',
      onNewChordRootChange: track('newRoot'),
      newChordType: 'm7',
      onNewChordTypeChange: track('newType'),
      addCustomChord: track('add'),
      irealInput: '',
      onIrealInputChange: track('irealInput'),
      importIrealPro: track('import'),
      customChords: [] as Chord[],
      removeCustomChord: track('remove'),
      customChordName: '',
      onCustomChordNameChange: track('name'),
      saveCustomChords: track('save'),
      loadCustomChords: track('load'),
      exportCustomChords: track('export'),
      clearCustomChords: track('clear'),
      ...props,
    } as never))
  })
  const snap = () => ({
    buttons: [...container.querySelectorAll('button')] as HTMLButtonElement[],
    comboboxes: [...container.querySelectorAll('[role="combobox"]')] as HTMLButtonElement[],
    switches: [...container.querySelectorAll('[role="switch"]')] as HTMLElement[],
    textareas: [...container.querySelectorAll('textarea')],
    inputs: [...container.querySelectorAll('input')] as HTMLInputElement[],
    text: container.textContent ?? '',
  })
  const click = (el: HTMLElement) =>
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })

  /**
   * 展开第 idx 个 Select 并选中文案完全等于 label 的选项
   * （radix 需要 trigger 上先 pointerdown 再 click；jsdom 缺口已在文件头补）。
   */
  const pickOption = (idx: number, label: string) => {
    const combo = snap().comboboxes[idx]
    expect(combo, `第 ${idx} 个 combobox 应存在`).toBeTruthy()
    act(() => {
      combo.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      combo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const opts = [...document.querySelectorAll('[role="option"]')]
    const opt = opts.find((o) => o.textContent === label)
    if (!opt) {
      throw new Error(`找不到选项「${label}」；实际有：${opts.map((o) => o.textContent).join(' | ')}`)
    }
    click(opt as HTMLElement)
  }

  /** 给 input 设值并派 input 事件（必须走原生 setter，否则 React 收不到 change） */
  const setInputValue = (el: HTMLInputElement, v: string) => {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  return {
    container, calls, click, snap, pickOption, setInputValue,
    /** 展开自定义和弦折叠区并返回展开后的快照 */
    openCustom() {
      const trigger = snap().buttons.find((b) => b.textContent === t('chord_custom'))
      expect(trigger, '找不到自定义和弦折叠触发器').toBeTruthy()
      click(trigger!)
      return snap()
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
      const i = mounted.findIndex((m) => m.root === root)
      if (i >= 0) mounted.splice(i, 1)
    },
  }
}

describe('歌曲 / 调性 / 等级 / 顺序', () => {
  it('歌曲按钮显示歌名，点击回传 true', () => {
    const r = render()
    expect(r.snap().buttons[0].textContent).toContain(SONG_PROGRESSIONS[0].name)
    r.click(r.snap().buttons[0])
    expect(r.calls.song).toEqual([[true]])
    r.unmount()
  })

  it('__custom__ 歌曲显示「自定义和弦进行」', () => {
    const r = render({ selectedSong: { name: '__custom__' } })
    expect(r.snap().buttons[0].textContent).toContain(t('chord_custom'))
    r.unmount()
  })

  it('调性显示 = 音名 + 大调/小调（isMinor 切换）', () => {
    const major = render({ progressionKey: 'C', isMinor: false })
    expect(major.snap().comboboxes[0].textContent).toBe('C大调')
    major.unmount()
    const minor = render({ progressionKey: 'A', isMinor: true })
    expect(minor.snap().comboboxes[0].textContent).toBe('A小调')
    minor.unmount()
  })

  it('调性显示随语言切换（en → minor / Major）', () => {
    const r = render({ progressionKey: 'A', isMinor: true, language: 'en', t: tEn })
    expect(r.snap().comboboxes[0].textContent).toBe('A minor')
    r.unmount()
  })

  /**
   * 大调/小调 × 中英文是**四个分支**（源码 157 / 164 / 165 各两组三元），
   * 只测对角两个会漏掉另外两个 —— 比如「大调 + 英文」被写成 "minor"。
   */
  it('调性显示：大调/小调 × 中/英 四个组合全覆盖', () => {
    const cases: Array<[boolean, 'zh-CN' | 'en', string]> = [
      [false, 'zh-CN', 'C大调'],
      [true, 'zh-CN', 'C小调'],
      [false, 'en', 'C Major'],
      [true, 'en', 'C minor'],
    ]
    for (const [isMinor, language, want] of cases) {
      const r = render({
        progressionKey: 'C', isMinor, language,
        t: language === 'en' ? tEn : t,
      })
      expect(r.snap().comboboxes[0].textContent, `isMinor=${isMinor} lang=${language}`).toBe(want)
      r.unmount()
    }
  })

  it('调性选项文案：大调/小调 × 中/英 四个组合（选项与触发器是两份独立文案）', () => {
    const cases: Array<[boolean, 'zh-CN' | 'en', string]> = [
      [false, 'zh-CN', 'C大调'],
      [true, 'zh-CN', 'C小调'],
      [false, 'en', 'C Major'],
      [true, 'en', 'C minor'],
    ]
    for (const [isMinor, language, want] of cases) {
      const r = render({
        progressionKey: 'D', isMinor, language,
        t: language === 'en' ? tEn : t,
      })
      r.pickOption(0, want)                 // 选项文案必须完全等于 want，否则找不到
      expect(r.calls.key).toEqual([['C']])
      r.unmount()
    }
  })

  it('等级 id 在 ALL_PRACTICE_LEVELS 里查不到 → 显示 id 本身（不能显示空白）', () => {
    const r = render({ practiceLevel: 'no_such_level_xyz' })
    const btn = r.snap().buttons.find((b) => b.getAttribute('role') !== 'combobox' && b.textContent === 'no_such_level_xyz')
    expect(btn, '查不到时应回退显示 id 本身').toBeTruthy()
    r.unmount()
  })

  it('等级按钮显示当前等级 nameKey 文案，点击回传 true', () => {
    const lvl = ALL_PRACTICE_LEVELS[0]
    const r = render({ practiceLevel: lvl.id })
    const btn = r.snap().buttons.find(
      (b) => b.textContent === t(lvl.nameKey) && b.getAttribute('role') !== 'combobox',
    )
    expect(btn, `等级按钮应显示 ${t(lvl.nameKey)}`).toBeTruthy()
    r.click(btn!)
    expect(r.calls.level).toEqual([[true]])
    r.unmount()
  })

  it('顺序 combobox 显示当前值', () => {
    for (const [v, label] of [
      ['asc', t('order_ordered')],
      ['desc', t('order_reverse')],
      ['random', t('order_random')],
    ] as const) {
      const r = render({ chordPlayOrder: v })
      expect(r.snap().comboboxes[1].textContent).toBe(label)
      r.unmount()
    }
  })
})

/**
 * 两个 Select 的 `onValueChange` 此前**一次都没被驱动过**（语句命中 0）
 * ⇒「改了下拉、父组件没收到」这类回归完全测不出来。
 */
describe('Select 回调：回传的是 value，不是界面文案', () => {
  /** 复刻源码的选项文案算法：同名的只显示一个，异名的显示「♯ / ♭」两种写法 */
  const keyOptionLabel = (i: number, isMinor: boolean, lang: 'zh-CN' | 'en') => {
    const suffix = isMinor
      ? (lang === 'zh-CN' ? '小调' : ' minor')
      : (lang === 'zh-CN' ? '大调' : ' Major')
    return NOTES[i] === NOTES_FLAT[i]
      ? NOTES[i] + suffix
      : `${NOTES[i]} / ${NOTES_FLAT[i]}` + suffix
  }

  it('调性：选中「C♯ / D♭大调」回传的是音名原值 C♯（不是界面文案）', () => {
    const r = render({ progressionKey: 'C', isMinor: false })
    const label = keyOptionLabel(1, false, 'zh-CN')     // NOTES[1]='C♯', NOTES_FLAT[1]='D♭'
    expect(label).toBe('C♯ / D♭大调')
    r.pickOption(0, label)
    expect(r.calls.key).toEqual([['C♯']])
    r.unmount()
  })

  it('调性：小调 + en 下同样回传原值（界面显示 minor，值仍是音名）', () => {
    const r = render({ progressionKey: 'C', isMinor: true, language: 'en', t: tEn })
    r.pickOption(0, keyOptionLabel(2, true, 'en'))      // NOTES[2]='D' → 'D minor'
    expect(r.calls.key).toEqual([['D']])
    r.unmount()
  })

  it('调性：换选一个不同的音（当前值之外的选项也要能选中，否则回传恒等于原值）', () => {
    const r = render({ progressionKey: 'C', isMinor: false })
    r.pickOption(0, keyOptionLabel(7, false, 'zh-CN'))  // 'G大调'
    expect(r.calls.key).toEqual([['G']])
    r.unmount()
  })

  // ⚠️ radix Select **不会**为「与当前值相同」的选项触发 onValueChange（内部去重）
  // ⇒ 每条都必须从一个**不同**的初值出发，否则回调压根不触发、断言恒为空。
  it('顺序：三个选项各自回传 asc / desc / random（防复制粘贴把 value 写死成同一个）', () => {
    for (const [v, label] of [
      ['asc', t('order_ordered')],
      ['desc', t('order_reverse')],
      ['random', t('order_random')],
    ] as const) {
      const from: 'asc' | 'desc' | 'random' = v === 'asc' ? 'desc' : 'asc'
      const r = render({ chordPlayOrder: from })
      r.pickOption(1, label)
      expect(r.calls.order, `从 ${from} 选「${label}」应回传 ${v}`).toEqual([[v]])
      r.unmount()
    }
  })

  it('顺序：选中与当前值相同的选项 → 不触发回调（radix 去重，避免无意义的重渲染）', () => {
    const r = render({ chordPlayOrder: 'random' })
    r.pickOption(1, t('order_random'))
    expect(r.calls.order, '重复选同一个值不该回调').toBeUndefined()
    r.unmount()
  })

  it('顺序：下拉与「声部连接禁用」是同一数据源的两个出口 —— 选 random 后声部连接变禁用', () => {
    const r = render({ chordPlayOrder: 'asc' })
    expect(r.snap().switches[1].hasAttribute('disabled')).toBe(false)
    r.pickOption(1, t('order_random'))
    expect(r.calls.order).toEqual([['random']])
    // 回调是给父组件的；本组件是受控的，界面不会自己变 —— 这条断言用来钉住「禁用只取决于 props」
    expect(r.snap().switches[1].hasAttribute('disabled')).toBe(false)
    r.unmount()
  })
})

describe('开关与联动', () => {
  it('progressionRepeat=false：5 个开关；true：6 个（多出「循环时随机调性」）', () => {
    const off = render({ progressionRepeat: false })
    expect(off.snap().switches.length).toBe(5)
    off.unmount()
    const on = render({ progressionRepeat: true })
    expect(on.snap().switches.length).toBe(6)
    on.unmount()
  })

  it('开关选中态反映 props', () => {
    const r = render({
      progressionRepeat: true, shouldVoiceLead: true, shouldRandomizeKeyOnRepeat: true,
      showChordFretboard: false, showChordStructure: true, showChordKeyboard: false,
    })
    expect(r.snap().switches.map((s) => s.getAttribute('data-state')))
      .toEqual(['checked', 'checked', 'checked', 'unchecked', 'checked', 'unchecked'])
    r.unmount()
  })

  it('随机顺序下「声部连接」禁用（随机顺序没有下一个，声部连接无从谈起）', () => {
    const random = render({ chordPlayOrder: 'random' })
    const vl = random.snap().switches[1]
    expect(vl.hasAttribute('disabled') || vl.getAttribute('data-disabled') !== null).toBe(true)
    random.unmount()
    const asc = render({ chordPlayOrder: 'asc' })
    const vl2 = asc.snap().switches[1]
    expect(vl2.hasAttribute('disabled')).toBe(false)
    expect(vl2.getAttribute('data-disabled')).toBeNull()
    asc.unmount()
  })

  it('「下一和弦」：未练习时禁用、练习中可用', () => {
    const off = render({ isPlaying: false })
    expect(off.snap().buttons.find((b) => b.textContent === t('btn_next'))!.disabled).toBe(true)
    off.unmount()
    const on = render({ isPlaying: true })
    const btn = on.snap().buttons.find((b) => b.textContent === t('btn_next'))!
    expect(btn.disabled).toBe(false)
    on.click(btn)
    // nextChord 直接作为 onClick 使用，回传的是 SyntheticEvent —— 断言「调用过」
    expect('nextChord' in on.calls).toBe(true)
    on.unmount()
  })
})

describe('自定义和弦折叠区', () => {
  it('默认折叠；展开后出现 iReal 导入区与 textarea', () => {
    const r = render()
    expect(r.snap().text).not.toContain(t('ireal_import_title'))
    const s = r.openCustom()
    expect(s.text).toContain(t('ireal_import_title'))
    expect(s.textareas.length).toBe(1)
    r.unmount()
  })

  it('无序列时：保存/导出禁用、无清空按钮；有序列时：全部可用', () => {
    const empty = render()
    const s0 = empty.openCustom()
    expect(s0.buttons.find((b) => b.textContent === t('custom_chord_save'))!.disabled).toBe(true)
    expect(s0.buttons.find((b) => b.textContent === t('custom_chord_export'))!.disabled).toBe(true)
    expect(s0.buttons.find((b) => b.textContent === t('custom_chord_clear'))).toBeUndefined()
    empty.unmount()

    const withChords = render({ customChords: [{ root: 'C', type: 'm7' }] })
    const s1 = withChords.openCustom()
    expect(s1.buttons.find((b) => b.textContent === t('custom_chord_save'))!.disabled).toBe(false)
    expect(s1.buttons.find((b) => b.textContent === t('custom_chord_export'))!.disabled).toBe(false)
    expect(s1.buttons.find((b) => b.textContent === t('custom_chord_clear'))).toBeTruthy()
    withChords.unmount()
  })

  it('序列 badge 用 formatChordName 渲染（含 slash 低音）', () => {
    const r = render({ customChords: [{ root: 'C', type: 'm7' }, { root: 'F', type: '7', bass: '3rd' }] })
    const s = r.openCustom()
    expect(s.text).toContain('Cm7')
    expect(s.text).toContain('F7/3rd')
    r.unmount()
  })

  it('删除按钮回传对应下标', () => {
    const r = render({ customChords: [{ root: 'C', type: 'm7' }, { root: 'F', type: '7' }] })
    const s = r.openCustom()
    const removeBtns = s.buttons.filter((b) => b.getAttribute('aria-label') === t('btn_remove_chord'))
    expect(removeBtns.length).toBe(2)
    r.click(removeBtns[1])
    expect(r.calls.remove).toEqual([[1]])
    r.unmount()
  })

  it('iReal textarea 输入回传新值；导入按钮回传调用', () => {
    const r = render()
    const s = r.openCustom()
    const ta = s.textareas[0]
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(ta, 'irealbook://Title=A=Style=C=n=')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(r.calls.irealInput).toEqual([['irealbook://Title=A=Style=C=n=']])
    r.click(s.buttons.find((b) => b.textContent === t('ireal_import_btn'))!)
    expect('import' in r.calls).toBe(true)
    r.unmount()
  })

  it('自定义序列名输入框：回传 e.target.value（String），且逐字符都回传', () => {
    const r = render({ customChordName: '' })
    const s = r.openCustom()
    const input = s.inputs.find((i) => i.getAttribute('placeholder') === t('custom_chord_sequence_name'))
    expect(input, '找不到自定义序列名输入框').toBeTruthy()
    r.setInputValue(input!, '我')
    r.setInputValue(input!, '我的')
    r.setInputValue(input!, '我的进行')
    expect(r.calls.name).toEqual([['我'], ['我的'], ['我的进行']])
    // 回传的是字符串本身：若实现误传 e.target（DOM 元素）这里立刻挂
    expect(typeof r.calls.name[0][0]).toBe('string')
    r.unmount()
  })

  it('自定义序列名输入框：placeholder 为字面量时也走同一个 input（不与 iReal 区混淆）', () => {
    const r = render()
    const s = r.openCustom()
    // 折叠区内只有一个 input（序列名），iReal 用的是 textarea —— 钉住这个结构
    expect(s.inputs).toHaveLength(1)
    expect(s.textareas).toHaveLength(1)
    r.unmount()
  })

  it('保存 / 载入 / 导出 / 清空 / 添加：点击均回调', () => {
    const r = render({ customChords: [{ root: 'C', type: 'm7' }] })
    const s = r.openCustom()
    r.click(s.buttons.find((b) => b.textContent === t('custom_chord_save'))!)
    r.click(s.buttons.find((b) => b.textContent === t('custom_chord_load'))!)
    r.click(s.buttons.find((b) => b.textContent === t('custom_chord_export'))!)
    r.click(s.buttons.find((b) => b.textContent === t('custom_chord_clear'))!)
    r.click(s.buttons.find((b) => b.textContent === t('custom_chord_add'))!)
    expect(Object.keys(r.calls).sort()).toEqual(
      ['add', 'clear', 'export', 'load', 'save'].sort(),
    )
    r.unmount()
  })
})
