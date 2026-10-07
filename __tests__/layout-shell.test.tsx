import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// 只关心外壳的编排，标题栏与调试面板各自已有契约测试
vi.mock('@/components/title-bar', () => ({
  TitleBar: () => <div data-testid="title-bar" />,
}))
vi.mock('@/components/debug-panel', () => ({
  DebugPanel: () => <div data-testid="debug-panel" />,
}))

import { LayoutShell } from '@/components/layout-shell'
import { useAppStore } from '@/lib/store'

const setShell = (over: { isFullscreen?: boolean; language?: 'zh-CN' | 'en' } = {}) => {
  useAppStore.setState({
    isFullscreen: over.isFullscreen ?? false,
    user: { ...useAppStore.getState().user, language: over.language ?? 'zh-CN' },
  })
}

const containers: HTMLElement[] = []
const roots: Root[] = []

async function mount(children?: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(
      createElement(LayoutShell as never, {
        children: children ?? createElement('div', { 'data-testid': 'page' }, 'PAGE'),
      } as never),
    )
  })
  return container
}

const q = (tid: string) => document.querySelector(`[data-testid="${tid}"]`)

beforeEach(() => {
  setShell()
  document.documentElement.classList.remove('fullscreen-mode')
  document.documentElement.lang = ''
  document.body.removeAttribute('style')
})

afterEach(() => {
  act(() => {
    roots.forEach((r) => r.unmount())
  })
  roots.length = 0
  containers.forEach((c) => c.remove())
  containers.length = 0
})

describe('LayoutShell — 结构', () => {
  it('渲染 children', async () => {
    await mount()
    expect(q('page')).not.toBeNull()
  })

  it('非全屏时挂载标题栏与调试面板', async () => {
    await mount()
    expect(q('title-bar')).not.toBeNull()
    expect(q('debug-panel')).not.toBeNull()
  })

  it('全屏时移出标题栏与调试面板', async () => {
    setShell({ isFullscreen: true })
    await mount()
    expect(q('title-bar')).toBeNull()
    expect(q('debug-panel')).toBeNull()
    expect(q('page')).not.toBeNull()
  })

  it('同时渲染 children 与 sonner 通知挂载点（Toaster 组件已在树中）', async () => {
    await mount()
    // sonner 在没有任何 toast 时不会渲染 [data-sonner-toaster]，只验证外壳未崩溃且 children 在位
    expect(q('page')).not.toBeNull()
  })
})

describe('LayoutShell — 文档标题与语言标注', () => {
  it('中文：标题与 <html lang> 同步为中文', async () => {
    setShell({ language: 'zh-CN' })
    await mount()
    expect(document.title).toBe('FretMaster - 吉他指板练习工具')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('英文：标题与 <html lang> 同步为英文', async () => {
    setShell({ language: 'en' })
    await mount()
    expect(document.title).toBe('FretMaster - Guitar Fretboard Practice Tool')
    expect(document.documentElement.lang).toBe('en')
  })

  it('语言切换后标题与标注跟着变', async () => {
    await mount()
    expect(document.documentElement.lang).toBe('zh-CN')
    act(() => setShell({ language: 'en' }))
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toContain('Guitar Fretboard Practice Tool')
  })
})

describe('LayoutShell — 全屏样式同步', () => {
  it('进入全屏：html 加 fullscreen-mode，body 固定铺满', async () => {
    setShell({ isFullscreen: true })
    await mount()
    expect(document.documentElement.classList.contains('fullscreen-mode')).toBe(true)
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.width).toBe('100vw')
    expect(document.body.style.height).toBe('100vh')
    expect(document.body.style.margin).toBe('0px')
  })

  it('退出全屏：移除样式类并清空 body 内联样式', async () => {
    setShell({ isFullscreen: true })
    await mount()
    act(() => setShell({ isFullscreen: false }))
    expect(document.documentElement.classList.contains('fullscreen-mode')).toBe(false)
    expect(document.body.style.position).toBe('')
    expect(document.body.style.width).toBe('')
    expect(document.body.style.height).toBe('')
  })

  it('非全屏挂载时不加 fullscreen-mode', async () => {
    await mount()
    expect(document.documentElement.classList.contains('fullscreen-mode')).toBe(false)
    expect(document.body.style.position).toBe('')
  })
})
