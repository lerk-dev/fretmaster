/**
 * hooks/use-global-shortcuts.ts 的契约测试（此前零行为测试，只有「page.tsx 有没有接线」）。
 *
 * 这个 hook 是全仓唯一的 window keydown。它最容易出的错不是「快捷键不生效」，
 * 而是**抢走别人的按键**：window 监听器在冒泡末端，却照样 `preventDefault()`，
 * 于是焦点所在的按钮被取消激活、同时题目又被推进（审计 2026-10-31 第 3 项）。
 *
 * 这里钉住三条边界：
 *   ① 组件自己 preventDefault 过的按键 ⇒ 全局必须放行（defaultPrevented 守卫）
 *   ② select / 下拉浮层里的 Enter、空格属于控件自己 ⇒ 全局必须放行
 *   ③ 没人认领时 ⇒ 全局照旧干活（否则就是修过头，快捷键全废）
 *
 * 测法沿用项目既有模式：`createRoot` + React 原生 `act`（`@testing-library/dom` 未安装，
 * 不能用 renderHook）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useGlobalShortcuts, type UseGlobalShortcutsOptions } from '@/hooks/use-global-shortcuts'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<() => void> = []

function mount(options: UseGlobalShortcutsOptions) {
  function Probe() {
    useGlobalShortcuts(options)
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  const unmount = () => {
    try { act(() => root.unmount()) } catch { /* 已拆过 */ }
    container.remove()
  }
  mounted.push(unmount)
  return { unmount }
}

afterEach(() => {
  for (const u of mounted.splice(0)) { try { u() } catch { /* 已拆过 */ } }
  document.body.innerHTML = ''
})

/** 一份「练习中」的最小 options；断言只关心被调用的那几项 */
function makeOptions(overrides: Partial<UseGlobalShortcutsOptions> = {}): UseGlobalShortcutsOptions {
  return {
    activeTab: 'practice',
    isFullscreen: false,
    setFullscreenMode: vi.fn(),
    isPlaying: true,
    setIsPlaying: vi.fn(),
    setHighlightedFrets: vi.fn(),
    setHighlightedTargetPosition: vi.fn(),
    setShowAllNotes: vi.fn(),
    togglePractice: vi.fn(),
    isTauri: false,
    setMicUserPreference: vi.fn(),
    setShowShortcutsHelp: vi.fn(),
    setSettingsOpen: vi.fn(),
    handleTabChange: vi.fn(),
    setTabFretboardFlag: vi.fn(),
    generateNewTarget: vi.fn(),
    generateIntervalExerciseRef: { current: null },
    nextChordExercise: vi.fn(),
    nextScaleExercise: vi.fn(),
    nextChord: vi.fn(),
    focusModeEnabled: false,
    ...overrides,
  }
}

/** 从一个元素上派发 keydown（冒泡到 window，与真实按键同一条路径） */
function pressKey(target: Element | Window, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

// --------------------------------------------------------- ③ 基线：没人认领时照旧干活

describe('基线：普通页面按 Enter / 空格仍然「下一题」', () => {
  it('Enter 推进下一题', () => {
    const opts = makeOptions()
    mount(opts)
    pressKey(document.body, 'Enter')
    expect(opts.generateNewTarget).toHaveBeenCalledTimes(1)
  })

  it('空格推进下一题', () => {
    const opts = makeOptions()
    mount(opts)
    pressKey(document.body, ' ')
    expect(opts.generateNewTarget).toHaveBeenCalledTimes(1)
  })
})

// --------------------------------------------------------- ① defaultPrevented 守卫

describe('🚨 已被组件认领的按键必须放行（defaultPrevented 守卫）', () => {
  it('元素自己 preventDefault 后，全局不再推进下一题', () => {
    const opts = makeOptions()
    mount(opts)

    // 模拟 lib/a11y.ts 的 activateOnEnterSpace：先 preventDefault 再执行动作
    const row = document.createElement('div')
    row.setAttribute('role', 'button')
    row.tabIndex = 0
    let rowActivated = 0
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        rowActivated += 1
      }
    })
    document.body.appendChild(row)

    pressKey(row, 'Enter')

    expect(rowActivated, '控件自己的动作应当执行').toBe(1)
    expect(opts.generateNewTarget, '全局不许再顺手换一题').not.toHaveBeenCalled()
  })

  it('空格同样受保护（不是只保护 Enter）', () => {
    const opts = makeOptions()
    mount(opts)

    const row = document.createElement('div')
    row.addEventListener('keydown', (e) => e.preventDefault())
    document.body.appendChild(row)

    pressKey(row, ' ')
    expect(opts.generateNewTarget).not.toHaveBeenCalled()
  })

  it('守卫在分支最前面：即使 Esc（退出全屏）也不抢已被认领的按键', () => {
    const opts = makeOptions({ isFullscreen: true })
    mount(opts)

    const dialog = document.createElement('div')
    dialog.addEventListener('keydown', (e) => e.preventDefault())
    document.body.appendChild(dialog)

    pressKey(dialog, 'Escape')
    expect(opts.setFullscreenMode).not.toHaveBeenCalled()
  })
})

// --------------------------------------------------------- ② select / 下拉浮层

describe('select 与下拉浮层里的 Enter / 空格归控件所有', () => {
  it('原生 <select> 上按 Enter 不换题', () => {
    const opts = makeOptions()
    mount(opts)

    const select = document.createElement('select')
    const option = document.createElement('option')
    select.appendChild(option)
    document.body.appendChild(select)

    // 原生 select 靠浏览器默认行为展开，没有 JS handler 会 preventDefault
    pressKey(select, 'Enter')
    pressKey(option, 'Enter')
    expect(opts.generateNewTarget).not.toHaveBeenCalled()
  })

  it('role="combobox" 内部按空格不换题', () => {
    const opts = makeOptions()
    mount(opts)

    const combo = document.createElement('div')
    combo.setAttribute('role', 'combobox')
    const item = document.createElement('span')
    combo.appendChild(item)
    document.body.appendChild(combo)

    pressKey(item, ' ')
    expect(opts.generateNewTarget).not.toHaveBeenCalled()
  })

  it('role="listbox" / role="menu" 同理', () => {
    const opts = makeOptions()
    mount(opts)

    for (const role of ['listbox', 'menu']) {
      const box = document.createElement('div')
      box.setAttribute('role', role)
      document.body.appendChild(box)
      pressKey(box, 'Enter')
    }
    expect(opts.generateNewTarget).not.toHaveBeenCalled()
  })
})

// --------------------------------------------------------- 回归：原有的输入框排除

describe('回归：输入框里的按键不触发全局动作', () => {
  it('input / textarea / contenteditable 都跳过', () => {
    const opts = makeOptions()
    mount(opts)

    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // jsdom 的 contentEditable 不反射到 isContentEditable，显式打桩才测的是真实分支
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    document.body.append(input, textarea, editable)

    pressKey(input, 'Enter')
    pressKey(textarea, 'Enter')
    pressKey(editable, 'Enter')
    expect(opts.generateNewTarget).not.toHaveBeenCalled()
  })

  it('带 Ctrl 的组合放行给浏览器', () => {
    const opts = makeOptions()
    mount(opts)
    pressKey(document.body, 'p', { ctrlKey: true })
    expect(opts.togglePractice).not.toHaveBeenCalled()
  })
})

// --------------------------------------------------------- 源码护栏

describe('源码护栏：新增的按键分支必须写在守卫之后', () => {
  it('defaultPrevented 守卫出现在第一个 event.preventDefault() 之前', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('hooks/use-global-shortcuts.ts', 'utf8')
    const body = src.slice(src.indexOf('const handleKeyDown'))
    const guardAt = body.indexOf('event.defaultPrevented')
    const firstAction = body.indexOf('event.preventDefault()')

    expect(guardAt, '找不到 defaultPrevented 守卫 —— 是不是被重构掉了？').toBeGreaterThan(-1)
    expect(firstAction).toBeGreaterThan(-1)
    expect(guardAt, '守卫必须在任何 preventDefault() 之前执行，否则又会出现「抢键」').toBeLessThan(firstAction)
  })
})
