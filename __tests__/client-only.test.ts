/**
 * components/client-only.tsx 的契约测试（此前零测试，22 行但关系水合正确性）。
 *
 * 契约：
 *  ① 服务端渲染（无 effect）只出 `fallback`，**绝不能**出 children —— 否则两端 HTML 不一致；
 *  ② 客户端挂载后出 children、不再出 fallback；
 *  ③ `fallback` 默认值为 null（服务端渲染出空串）。
 *
 * 这个组件是全仓 hydration mismatch 的第一道防线（Tauri 标题栏、调试面板都靠它）。
 */
import { describe, it, expect } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClientOnly } from '@/components/client-only'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const ui = (props: Record<string, unknown>) =>
  createElement(ClientOnly as never, props as never)

function mount(props: Record<string, unknown>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(ui(props)) })
  return {
    html: () => container.innerHTML,
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

describe('服务端（首帧、无 effect）', () => {
  it('只渲染 fallback，不渲染 children', () => {
    const html = renderToStaticMarkup(
      ui({ fallback: createElement('span', null, 'FB'), children: createElement('span', null, 'CHILD') }),
    )
    expect(html).toContain('FB')
    expect(html).not.toContain('CHILD')
  })

  it('未给 fallback 时渲染为空', () => {
    const html = renderToStaticMarkup(ui({ children: createElement('span', null, 'CHILD') }))
    expect(html).toBe('')
  })
})

describe('客户端挂载后', () => {
  it('渲染 children，且不再渲染 fallback', () => {
    const p = mount({ fallback: createElement('span', null, 'FB'), children: createElement('span', null, 'CHILD') })
    expect(p.html()).toContain('CHILD')
    expect(p.html()).not.toContain('FB')
    p.unmount()
  })

  it('未给 fallback 时挂载后照常渲染 children', () => {
    const p = mount({ children: createElement('span', null, 'CHILD') })
    expect(p.html()).toContain('CHILD')
    p.unmount()
  })
})
