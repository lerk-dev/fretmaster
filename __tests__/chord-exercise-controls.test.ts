/**
 * components/chord-exercise-controls.tsx 的契约测试（此前零测试）。
 *
 * 和弦练习控制面板：纯受控组件（状态在 props、修改走回调）。与 interval-controls
 * 同模式，但多两块有分量的逻辑：
 *
 *  ① **和弦类型按分组渲染**：CHORD_TYPES 按 group 归组，组标题中文界面用 groupZh、
 *     英文用 groupName（或 name）；类型按钮 65 个，label = symbol，
 *     **Major 的 symbol 是空串** → 回退：中文界面用中文术语（大三和弦）、英文用 name；
 *  ② **多选 toggle**：点已选中的从数组移除、点未选中的追加；「全选/清空」直接回传
 *     全部 name / 空数组。
 *
 * ⚠️ radix Switch 在 jsdom 下 click 不触发 onCheckedChange（同 interval-controls 的
 * 环境限制），只断言 data-state。
 */
import { describe, it, expect } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ChordExerciseControls } from '@/components/chord-exercise-controls'
import { CHORD_TYPES } from '@/lib/page-theory-data'
import { getChordDisplayName } from '@/lib/page-theory-functions'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

function render(props: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[]> = {}
  const track = (name: string) => (...args: unknown[]) => { (calls[name] ??= []).push(...args) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(ChordExerciseControls as never, {
        t,
        language: 'zh-CN',
        root: 'random',
        onRootChange: track('root'),
        level: ALL_PRACTICE_LEVELS[0].id,
        onOpenLevelSelector: track('openLevel'),
        bass: 'root',
        onBassChange: track('bass'),
        chordOrder: 'asc',
        onChordOrderChange: track('order'),
        showFretboard: true,
        onShowFretboardChange: track('showFretboard'),
        showKeyboard: false,
        onShowKeyboardChange: track('showKeyboard'),
        showStructure: false,
        onShowStructureChange: track('showStructure'),
        selectedTypes: ['Major', 'm7'],
        onSelectedTypesChange: track('types'),
        ...props,
      } as never),
    )
  }
  )
  const buttons = [...container.querySelectorAll('button')] as HTMLButtonElement[]
  return {
    container,
    calls,
    text: container.textContent ?? '',
    buttons,
    comboboxes: [...container.querySelectorAll('[role="combobox"]')] as HTMLButtonElement[],
    switches: [...container.querySelectorAll('[role="switch"]')] as HTMLElement[],
    /** 类型按钮：label 是 symbol 或中文名，数量应与 CHORD_TYPES 一致 */
    typeButtons: buttons.filter((b) =>
      CHORD_TYPES.some((ct) => (ct.symbol || getChordDisplayName(ct.name, 'chinese')) === b.textContent),
    ),
    click(el: HTMLElement) {
      act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

describe('和弦类型多选', () => {
  it('每个和弦类型一个按钮（按分组渲染，总数与 CHORD_TYPES 一致）', () => {
    const r = render()
    expect(r.typeButtons.length).toBe(CHORD_TYPES.length)
    r.unmount()
  })

  it('分组标题数 = 唯一 group 数，中文界面显示 groupZh', () => {
    const r = render()
    const groups = [...new Set(CHORD_TYPES.map((ct) => ct.group))]
    const groupHeaders = groups.map((g) => {
      const ct = CHORD_TYPES.find((x) => x.group === g)!
      return ct.groupZh || '其他'
    })
    for (const h of groupHeaders) expect(r.text).toContain(h)
    r.unmount()
  })

  it('Major 的 symbol 为空串 → 中文界面回退为中文术语「大三和弦」', () => {
    const r = render()
    const major = CHORD_TYPES.find((ct) => ct.name === 'Major')!
    expect(major.symbol).toBe('')
    expect(r.text).toContain(getChordDisplayName('Major', 'chinese'))
    r.unmount()
  })

  it('已选中的类型按钮样式与未选中的不同', () => {
    const r = render({ selectedTypes: ['Major'] })
    const majorBtn = r.typeButtons.find((b) => b.textContent === getChordDisplayName('Major', 'chinese'))!
    const other = r.typeButtons.find((b) => b !== majorBtn)!
    expect(majorBtn.className).not.toBe(other.className)
    r.unmount()
  })

  it('点击未选中的类型 → 回传「追加后的新数组」；点击已选中的 → 回传「移除后的新数组」', () => {
    const r = render({ selectedTypes: ['Major'] })
    const m7Btn = r.typeButtons.find((b) => b.textContent === 'm7')!
    r.click(m7Btn)
    expect(r.calls.types).toEqual([['Major', 'm7']])

    const majorBtn = r.typeButtons.find((b) => b.textContent === getChordDisplayName('Major', 'chinese'))!
    r.click(majorBtn)
    expect(r.calls.types).toEqual([['Major', 'm7'], []])
    r.unmount()
  })

  it('全选：回传全部类型名；清空：回传空数组', () => {
    const r = render({ selectedTypes: [] })
    r.click(r.buttons.find((b) => b.textContent === t('select_all'))!)
    expect(r.calls.types).toEqual([CHORD_TYPES.map((ct) => ct.name)])
    r.click(r.buttons.find((b) => b.textContent === t('clear_all'))!)
    expect(r.calls.types).toEqual([CHORD_TYPES.map((ct) => ct.name), []])
    r.unmount()
  })
})

describe('根音 / 低音 / 顺序 / 等级', () => {
  it('根音 combobox 显示当前值（random / 具体音名）', () => {
    const r = render({ root: 'random' })
    expect(r.comboboxes[0].textContent).toBe(t('random'))
    r.unmount()
    const r2 = render({ root: 'C' })
    expect(r2.comboboxes[0].textContent).toBe('C')
    r2.unmount()
  })

  it('低音 combobox 显示当前值', () => {
    for (const [v, label] of [['root', t('chord_bass_root')], ['5th', t('chord_bass_5th')], ['random', t('chord_bass_random')]] as const) {
      const r = render({ bass: v })
      expect(r.comboboxes[1].textContent).toBe(label)
      r.unmount()
    }
  })

  it('演奏顺序三选一：点击回传对应值，选中样式唯一', () => {
    const r = render({ chordOrder: 'desc' })
    const labels = [t('order_ascending'), t('order_descending'), t('order_random')]
    const orderBtns = r.buttons.filter((b) => labels.includes(b.textContent ?? '') && b.getAttribute('role') !== 'combobox')
    expect(orderBtns.length).toBe(3)
    orderBtns.forEach((b) => r.click(b))
    expect(r.calls.order).toEqual(['asc', 'desc', 'random'])

    const classes = orderBtns.map((b) => b.className)
    expect(new Set(classes).size).toBe(2)
    expect(classes.filter((c) => c === classes[1]).length).toBe(1) // desc 选中
    r.unmount()
  })

  it('等级按钮显示当前等级的 nameKey 文案，点击回传 onOpenLevelSelector', () => {
    const lvl = ALL_PRACTICE_LEVELS[0]
    const r = render({ level: lvl.id })
    const lvlBtn = r.buttons.find((b) => b.textContent === t(lvl.nameKey) && b.getAttribute('role') !== 'combobox')
    expect(lvlBtn, `等级按钮应显示 ${t(lvl.nameKey)}`).toBeTruthy()
    r.click(lvlBtn!)
    // onOpenLevelSelector 无参调用，扁平 push 后长度仍为 0 —— 断言「调用过」即可
    expect('openLevel' in r.calls).toBe(true)
    r.unmount()
  })
})

describe('显示选项开关', () => {
  it('三个 Switch 的选中态反映 props', () => {
    const r = render({ showFretboard: true, showKeyboard: false, showStructure: true })
    expect(r.switches.map((s) => s.getAttribute('data-state'))).toEqual(['checked', 'unchecked', 'checked'])
    r.unmount()
  })
})
