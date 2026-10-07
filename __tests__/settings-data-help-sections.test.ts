/**
 * components/settings-data-help-sections.tsx 的契约测试（此前零测试）。
 *
 * 设置抽屉的「设置管理」与「帮助」两个折叠段。
 *
 * 契约重点：
 *  ① 四个按钮的接线（保存 / 重置 / 导出 / 导入）—— 点错按钮会删档；
 *  ② **「导入设置」必须真的能打开文件选择器**：原实现把 `<button>` 包在 `<label>` 里靠
 *     label 转发点击，但 `<button>` 属于 HTML 的 interactive content，规范规定 label 的
 *     激活行为对 interactive content 后代「什么都不做」⇒ 真实浏览器里点了没反应。
 *     现在改为按钮 `onClick` 显式调用 hidden input 的 `click()`；
 *  ③ **同名文件可重复导入**：file input 只在 value 变化时触发 change，
 *     导入后必须把 `value` 清空，否则第二次选同一个文件静默失效；
 *  ④ file input 的 `accept=".json"`（用户只能选 JSON）；
 *  ⑤ 帮助段的「重新开始教程」动态 import `@/components/onboarding` 并调用 `restartTutorial()`；
 *  ⑥ 段标题按 language 切换中英（项目既有约定：设置段标题内联 `language === 'zh-CN'` 分支）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Accordion } from '@/components/ui/accordion'
import { SettingsDataSection, SettingsHelpSection } from '@/components/settings-data-help-sections'
import { TRANSLATIONS } from '@/lib/i18n'

const restartTutorialSpy = vi.fn()
vi.mock('@/components/onboarding', () => ({
  restartTutorial: (...args: unknown[]) => restartTutorialSpy(...args),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

function mount(ui: ReactNode, value: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Accordion as never, { type: 'multiple', defaultValue: [value] } as never, ui))
  })
  return {
    container,
    root,
    text: () => container.textContent ?? '',
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    button: (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!,
    fileInput: () => container.querySelector('input[type="file"]') as HTMLInputElement,
    /** 派发一个会冒泡的鼠标点击（模拟真实用户点击） */
    click(el: HTMLElement) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }) },
    /** 模拟用户在系统选择器里选中文件 */
    pick(file: File) {
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(input, 'files', { value: [file], configurable: true, writable: true })
      act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    },
    /**
     * 记录对 input.value 的显式赋值。
     * jsdom 里 file input 的 value 恒读回 ''，光断言读取值区分不出「有没有清空」，
     * 所以在实例上装一层 setter 观测真实写入。
     */
    trackValueWrites() {
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const writes: unknown[] = []
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: () => desc.get!.call(input),
        set: (v) => { writes.push(v); desc.set!.call(input, v) },
      })
      return writes
    },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

function mountData(over: Record<string, unknown> = {}) {
  const handlers = { onSave: vi.fn(), onReset: vi.fn(), onExport: vi.fn(), onImport: vi.fn() }
  const p = mount(
    createElement(SettingsDataSection as never, { t, ...handlers, ...over } as never) as ReactNode,
    'data',
  )
  return { ...p, ...handlers }
}

function mountHelp(language = 'zh-CN') {
  const p = mount(
    createElement(SettingsHelpSection as never, { t, language } as never) as ReactNode,
    'help',
  )
  return p
}

beforeEach(() => { restartTutorialSpy.mockClear() })

describe('设置管理段：折叠与按钮接线', () => {
  it('展开后渲染 4 个操作按钮与提示文案', () => {
    const p = mountData()
    expect(p.text()).toContain(t('reset_settings_hint'))
    const labels = p.buttons().map((b) => b.textContent)
    expect(labels.some((l) => l?.includes(t('btn_save')))).toBe(true)
    expect(labels.some((l) => l?.includes(t('btn_reset')))).toBe(true)
    expect(labels.some((l) => l?.includes(t('export_settings')))).toBe(true)
    expect(labels.some((l) => l?.includes(t('import_settings')))).toBe(true)
    p.unmount()
  })

  it('三个按钮分别触发 onSave / onReset / onExport，且互不串台', () => {
    const p = mountData()
    p.click(p.button(t('btn_save')))
    expect(p.onSave).toHaveBeenCalledTimes(1)
    expect(p.onReset).not.toHaveBeenCalled()
    expect(p.onExport).not.toHaveBeenCalled()

    p.click(p.button(t('btn_reset')))
    expect(p.onReset).toHaveBeenCalledTimes(1)
    expect(p.onExport).not.toHaveBeenCalled()

    p.click(p.button(t('export_settings')))
    expect(p.onExport).toHaveBeenCalledTimes(1)
    p.unmount()
  })
})

describe('导入设置：必须真的能打开文件选择器', () => {
  it('file input 的 accept 是 .json', () => {
    const p = mountData()
    expect(p.fileInput().getAttribute('accept')).toBe('.json')
    expect(p.fileInput().type).toBe('file')
    p.unmount()
  })

  it('按钮不在 <label> 内（不再依赖 label 转发点击）', () => {
    const p = mountData()
    // <button> 是 interactive content，label 对它的激活行为是「什么都不做」，
    // 因此导入按钮绝不能靠 label 包裹来触发，必须显式 click()。
    expect(p.button(t('import_settings')).closest('label')).toBeNull()
    p.unmount()
  })

  it('点击「导入设置」会触发隐藏 input 的 click（即打开系统文件选择器）', () => {
    const p = mountData()
    const input = p.fileInput()
    const inputClick = vi.fn((e: Event) => e.preventDefault())
    input.addEventListener('click', inputClick)

    p.click(p.button(t('import_settings')))

    expect(inputClick).toHaveBeenCalledTimes(1)
    p.unmount()
  })

  it('选中文件后调用 onImport 一次，并把 value 显式清空（保证同名文件可重复导入）', () => {
    const p = mountData()
    const writes = p.trackValueWrites()
    const file = new File(['{"a":1}'], 'settings.json', { type: 'application/json' })

    p.pick(file)
    expect(p.onImport).toHaveBeenCalledTimes(1)
    expect(p.onImport.mock.calls[0][0]).toBe(file)

    // 关键：浏览器只在 value 变化时触发 change。导入后必须把 value 清空，
    // 否则第二次选同一个文件时 change 不再触发，导入静默失效。
    expect(writes).toContain('')

    p.pick(file)
    expect(p.onImport).toHaveBeenCalledTimes(2)
    p.unmount()
  })

  it('没有 files 时（用户取消选择）不调用 onImport', () => {
    const p = mountData()
    const input = p.fileInput()
    Object.defineProperty(input, 'files', { value: null, configurable: true })
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(p.onImport).not.toHaveBeenCalled()
    p.unmount()
  })
})

describe('帮助段', () => {
  it('标题按 language 切换（zh-CN → 帮助 / en → Help）', () => {
    const zh = mountHelp('zh-CN')
    expect(zh.text()).toContain('帮助')
    zh.unmount()

    const en = mountHelp('en')
    expect(en.text()).toContain('Help')
    en.unmount()
  })

  it('点击「重新开始教程」动态引入 onboarding 并调用 restartTutorial()', async () => {
    const p = mountHelp()
    const btn = p.button(t('restart_tutorial'))
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      // 处理内部 `await import(...)` 的微任务
      await Promise.resolve()
    })
    expect(restartTutorialSpy).toHaveBeenCalledTimes(1)
    p.unmount()
  })
})
