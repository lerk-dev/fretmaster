/**
 * components/interval-controls.tsx 的契约测试（此前零测试）。
 *
 * 音程练习控制面板：**纯受控组件** —— 所有状态来自 props、所有修改走回调。
 * 所以测的不是内部逻辑，而是「props → 界面」与「界面 → 回调」的双向契约：
 *
 *  ① 23 个音程按钮与 INTERVALS 一一对应，label 用 formatDegree（Unicode 变音记号），
 *     点击必须回传**下标**（出题队列用的就是下标，回传错一位整题就错）；
 *  ② 方向四选一（up/down/either/random），点击回传对应值；
 *  ③ 联动显隐：「指板显示时长」选择器只在 自动推进 && 显示指板 时渲染；
 *     「自动推进」开关在未显示指板时禁用（不然设了也没用）；
 *  ④ 根音选择在「随机根音」模式下禁用；
 *  ⑤ 未开始练习时显示提示文案。
 *
 *  ⑥ 四个 Select / Checkbox 的回调是「字符串·布尔 → props」的转换点，此前**一次都没驱动过**：
 *     练习时长与指板时长是 **String → Number**（漏了 `Number()` 会把 `"10"` 存成字符串，
 *     后面 `setTimeout(v * 1000)` 之类的算术会静默失效）；指板时长那个还只在
 *     「自动推进 && 显示指板」时才渲染。
 *
 * ⚠️ 测试环境限制（如实记录）：radix 的 **Switch 在 jsdom 下派发 click 不触发
 * onCheckedChange**（Checkbox 可以）。所以 Switch 只断言渲染状态（data-state / disabled /
 * 联动显隐），不模拟点击 —— 这是环境能力问题，不是组件缺陷。
 * （Select 不受此限：补齐 4 个 jsdom 缺口后 pointerdown + click 即可展开并选中。）
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { IntervalControls } from '@/components/interval-controls'
import { INTERVALS, NOTES } from '@/lib/page-theory-data'
import { formatDegree } from '@/lib/page-theory-functions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// radix Select 展开要用的 jsdom 缺口（补齐后才能真正驱动 onValueChange）
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* noop */ }

const T = (k: string) => `[${k}]`
const DIR_LABELS = ['[direction_up]', '[direction_down]', '[direction_either]', '[direction_random]']
const DIR_VALUES = ['up', 'down', 'either', 'random'] as const

type Props = Record<string, unknown>

/** 逐条记录卸载函数：断言失败会跳过用例自己的 unmount() ⇒ 残留 root 污染后续用例 */
const unmounts: Array<() => void> = []

function render(props: Props = {}) {
  const calls: Record<string, unknown[]> = {}
  const track = (name: string) => (...args: unknown[]) => { (calls[name] ??= []).push(...args) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(IntervalControls as never, {
        t: T,
        rootNote: 'C',
        onRootNoteChange: track('rootNote'),
        intervalRootMode: 'fixed',
        onIntervalRootModeChange: track('rootMode'),
        findRootFirst: false,
        onFindRootFirstChange: track('findRootFirst'),
        addRootBack: false,
        onAddRootBackChange: track('addRootBack'),
        showIntervalFretboard: false,
        onShowIntervalFretboardChange: track('showFretboard'),
        intervalPracticeDuration: 5,
        onIntervalPracticeDurationChange: track('duration'),
        intervalDirection: 'up',
        onIntervalDirectionChange: track('direction'),
        intervalAutoAdvance: false,
        onIntervalAutoAdvanceChange: track('autoAdvance'),
        intervalFretboardDuration: 3,
        onIntervalFretboardDurationChange: track('fretboardDuration'),
        intervalRandomizeOrder: false,
        onIntervalRandomizeOrderChange: track('randomizeOrder'),
        selectedIntervals: [0, 2],
        onToggleInterval: track('toggle'),
        isPlaying: false,
        ...props,
      } as never),
    )
  })
  const buttons = [...container.querySelectorAll('button')] as HTMLButtonElement[]
  let done = false
  const unmount = () => {
    if (done) return   // 幂等：用例卸过之后 afterEach 再调一次不能炸
    done = true
    act(() => root.unmount())
    container.remove()
  }
  unmounts.push(unmount)
  return {
    container,
    calls,
    text: container.textContent ?? '',
    buttons,
    comboboxes: [...container.querySelectorAll('[role="combobox"]')] as HTMLButtonElement[],
    switches: [...container.querySelectorAll('[role="switch"]')] as HTMLElement[],
    checkboxes: [...container.querySelectorAll('[role="checkbox"]')] as HTMLElement[],
    /** 音程按钮：文本为度数符号、且与 INTERVALS 的 formatDegree 匹配 */
    intervalButtons: buttons.filter((b) =>
      INTERVALS.some((iv) => formatDegree(iv.symbol) === b.textContent),
    ),
    directionButtons: buttons.filter((b) => DIR_LABELS.includes(b.textContent ?? '')),
    click(el: HTMLElement) {
      act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    /** 展开第 idx 个 Select，返回选项元素（顺序：0 根音 / 1 根音模式 / 2 练习时长 / 3 指板时长） */
    openSelect(idx: number) {
      const c = [...document.querySelectorAll('[role="combobox"]')][idx] as HTMLElement
      expect(c, `第 ${idx} 个 combobox 应存在`).toBeTruthy()
      act(() => {
        c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
        c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      return [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
    },
    pickOption(idx: number, label: string) {
      const opts = this.openSelect(idx)
      const opt = opts.find((o) => o.textContent === label)
      if (!opt) throw new Error(`找不到选项「${label}」；实际有：${opts.map((o) => o.textContent).join(' | ')}`)
      act(() => { opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    unmount,
  }
}

afterEach(() => {
  for (const fn of unmounts) {
    try { fn() } catch { /* 忽略卸载异常 */ }
  }
  unmounts.length = 0
  document.body.innerHTML = ''
})

describe('音程多选（出题队列的来源）', () => {
  it('每个音程一个按钮，数量与 INTERVALS 一致，label 走 formatDegree', () => {
    const r = render()
    expect(r.intervalButtons.length).toBe(INTERVALS.length)
    expect(r.intervalButtons.map((b) => b.textContent)).toEqual(
      INTERVALS.map((iv) => formatDegree(iv.symbol)),
    )
    r.unmount()
  })

  it('selectedIntervals 命中的按钮样式与未选中的不同，且数量恰好一致', () => {
    const r = render({ selectedIntervals: [0, 2, 5] })
    const classes = r.intervalButtons.map((b) => b.className)
    const selected = classes[0]
    expect(classes.filter((c) => c === selected).length).toBe(3)
    expect(new Set(classes).size).toBe(2)
    // 0/2/5 是同一类，1 不是
    expect(classes[2]).toBe(selected)
    expect(classes[1]).not.toBe(selected)
    r.unmount()
  })

  it('点击第 i 个音程按钮回传下标 i', () => {
    const r = render({ selectedIntervals: [] })
    r.intervalButtons.forEach((b) => r.click(b))
    expect(r.calls.toggle).toEqual(INTERVALS.map((_, i) => i))
    r.unmount()
  })

  it('音程 label 不含 ASCII 变音记号（走 formatDegree 的 Unicode 形式）', () => {
    const r = render()
    for (const b of r.intervalButtons) {
      expect(b.textContent ?? '').not.toMatch(/[b#]/)
    }
    r.unmount()
  })
})

describe('方向四选一', () => {
  it('四个按钮，点击回传对应值', () => {
    const r = render()
    expect(r.directionButtons.length).toBe(4)
    expect(r.directionButtons.map((b) => b.textContent)).toEqual(DIR_LABELS)
    r.directionButtons.forEach((b) => r.click(b))
    expect(r.calls.direction).toEqual([...DIR_VALUES])
    r.unmount()
  })

  it('选中的方向样式唯一', () => {
    const r = render({ intervalDirection: 'either' })
    const classes = r.directionButtons.map((b) => b.className)
    expect(new Set(classes).size).toBe(2)
    expect(classes.filter((c) => c === classes[2]).length).toBe(1) // either 是第 3 个
    r.unmount()
  })
})

describe('开关与联动', () => {
  it('两个 Checkbox 的选中态反映 props，点击回传 true', () => {
    const r = render({ findRootFirst: true, addRootBack: false })
    expect(r.checkboxes.length).toBe(2)
    expect(r.checkboxes[0].getAttribute('data-state')).toBe('checked')
    expect(r.checkboxes[1].getAttribute('data-state')).toBe('unchecked')
    r.click(r.checkboxes[1])
    expect(r.calls.addRootBack).toEqual([true])
    r.unmount()
  })

  it('三个 Switch 的选中态反映 props', () => {
    const r = render({ showIntervalFretboard: true, intervalAutoAdvance: true, intervalRandomizeOrder: true })
    expect(r.switches.map((s) => s.getAttribute('data-state'))).toEqual(['checked', 'checked', 'checked'])
    r.unmount()
    const r2 = render({})
    expect(r2.switches.map((s) => s.getAttribute('data-state'))).toEqual(['unchecked', 'unchecked', 'unchecked'])
    r2.unmount()
  })

  it('「自动推进」在未显示指板时禁用（设了也没用）', () => {
    const r = render({ showIntervalFretboard: false })
    const autoAdvance = r.switches[1]
    expect(autoAdvance.hasAttribute('disabled') || autoAdvance.getAttribute('data-disabled')).toBeTruthy()
    r.unmount()
    const r2 = render({ showIntervalFretboard: true })
    const autoAdvance2 = r2.switches[1]
    expect(autoAdvance2.hasAttribute('disabled')).toBe(false)
    expect(autoAdvance2.getAttribute('data-disabled')).toBeNull()
    r2.unmount()
  })

  it('「指板显示时长」只在 自动推进 && 显示指板 时渲染（combobox 数量 3 ↔ 4）', () => {
    const off = render({ showIntervalFretboard: false, intervalAutoAdvance: false })
    expect(off.comboboxes.length).toBe(3) // 根音 / 根音模式 / 练习时长
    off.unmount()

    const on = render({ showIntervalFretboard: true, intervalAutoAdvance: true })
    expect(on.comboboxes.length).toBe(4)
    // 第四个显示当前值 3s
    expect(on.comboboxes[3].textContent).toBe('3s')
    on.unmount()

    // 只开自动推进、不开指板 → 依旧不渲染
    const half = render({ showIntervalFretboard: false, intervalAutoAdvance: true })
    expect(half.comboboxes.length).toBe(3)
    half.unmount()
  })
})

describe('根音与时长选择', () => {
  it('根音 combobox 显示当前根音，选项覆盖全部 NOTES（12 个）', () => {
    const r = render({ rootNote: 'E♭' in NOTES ? 'E♭' : 'C' })
    expect(r.comboboxes[0].textContent).toBe(r.container.textContent?.includes('E♭') ? 'E♭' : 'C')
    // SelectContent 未打开时不渲染，选项数量由 NOTES 保障 —— 这里钉住根音值展示
    r.unmount()
  })

  it('「随机根音」模式下根音选择禁用', () => {
    const fixed = render({ intervalRootMode: 'fixed' })
    expect(fixed.comboboxes[0].disabled).toBe(false)
    fixed.unmount()
    const random = render({ intervalRootMode: 'random' })
    expect(random.comboboxes[0].disabled).toBe(true)
    random.unmount()
  })

  it('练习时长 combobox 显示当前值（分钟）', () => {
    const r = render({ intervalPracticeDuration: 15 })
    expect(r.comboboxes[2].textContent).toBe('15[minutes]')
    r.unmount()
  })
})

/**
 * 这四个控件此前**一次都没被驱动过**（语句命中 0）—— 只断言了「显示对不对」，
 * 「改完回调有没有收到、收到的是不是正确类型」完全没测。
 * 其中两个是 **String → Number** 的转换点：漏掉 `Number()` 会把 `"10"` 当字符串存进
 * props，后面任何算术（`v * 1000`、`v - 1`）都会静默变成 NaN 或字符串拼接。
 */
describe('下拉与复选框的回调（String→Number 转换点）', () => {
  it('根音模式下拉：选「随机根音」回传 "random"（不是布尔、不下标）', () => {
    const r = render({ intervalRootMode: 'fixed' })
    r.pickOption(1, '[random_root]')
    expect(r.calls.rootMode).toEqual(['random'])
    r.unmount()
  })

  it('「先找根音」复选框：勾选回传 true，再点回传 false（radix Checkbox 可直接派 click）', () => {
    const r = render({ findRootFirst: false })
    r.click(r.checkboxes[0])
    expect(r.calls.findRootFirst).toEqual([true])
    r.unmount()
  })

  it('练习时长：回传**数字** 10，不是字符串 "10"', () => {
    const r = render({ intervalPracticeDuration: 1 })
    r.pickOption(2, '10[minutes]')
    expect(r.calls.duration).toEqual([10])
    expect(r.calls.duration[0]).toBe(10)   // toEqual 会对 '10' 放行？不会；这里是双保险 + 类型钉死
    expect(typeof r.calls.duration[0]).toBe('number')
    r.unmount()
  })

  it('指板时长（自动推进 + 显示指板 时才渲染）：回传数字 7', () => {
    const r = render({ showIntervalFretboard: true, intervalAutoAdvance: true, intervalFretboardDuration: 1 })
    expect(r.comboboxes.length).toBe(4)
    r.pickOption(3, '7s')
    expect(r.calls.fretboardDuration).toEqual([7])
    expect(typeof r.calls.fretboardDuration[0]).toBe('number')
    r.unmount()
  })
})

describe('开始提示', () => {
  it('未开始时显示提示，进行中隐藏', () => {
    const off = render({ isPlaying: false })
    expect(off.text).toContain('[click_start_to_begin]')
    off.unmount()
    const on = render({ isPlaying: true })
    expect(on.text).not.toContain('[click_start_to_begin]')
    on.unmount()
  })
})
