/**
 * hooks/use-toast.ts 的契约测试（此前零测试）。
 *
 * 这是 shadcn/ui 的 toast 状态机：`reducer`（导出、纯函数）+ 模块级单例
 * （`memoryState` / `listeners` / `count`）+ `toast()` / `useToast()`。
 * 值得钉住的三条：
 *
 *  ① **TOAST_LIMIT = 1** —— 新 toast 前插后 `.slice(0, 1)`，同时只能有一条。
 *     改成 n 或去掉 slice 会静默改变「后一条顶掉前一条」的既有行为。
 *  ② **DISMISS ≠ REMOVE** —— DISMISS 只把 `open` 置 false，真正的移除由
 *     `addToRemoveQueue` 在 TOAST_REMOVE_DELAY（1000000ms，约 16 分钟）后触发。
 *     所以「关闭」后 toast 仍留在列表里，只是不可见。
 *  ③ **单例在模块级** —— 用例之间必须用 `vi.resetModules()` + 动态 import 隔离，
 *     否则上一轮的 memoryState 会污染下一轮。
 *
 * 消费链现状（如实记录）：components/ui/toaster.tsx 用 `useToast()`，
 * 但 Toaster 本身当前没有消费者（页面实际用的是 sonner 的 toast）。
 * 所以本文件是「这套状态机仍被打包、将来接线时别静默出错」的护栏。
 */
import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Mod = typeof import('@/hooks/use-toast')
type ToastItem = { id: string; title?: string; open?: boolean; onOpenChange?: (open: boolean) => void }

// TOAST_REMOVE_DELAY 未导出，按源码硬编码（1000000ms）
const REMOVE_DELAY = 1000000

let mod: Mod
let api: ReturnType<Mod['useToast']> | null = null
let root: Root | null = null

function Probe() {
  api = mod.useToast()
  return null
}

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(createElement(Probe)) })
  return {
    unmount() {
      if (!root) return
      act(() => { root!.unmount() })
      root = null
      container.remove()
    },
  }
}

/** 每个用例取一份干净的模块实例（memoryState / listeners / count 都是模块级） */
async function fresh(): Promise<Mod> {
  vi.resetModules()
  mod = await import('@/hooks/use-toast')
  api = null
  return mod
}

const mk = (id: string, extra: Record<string, unknown> = {}): ToastItem =>
  ({ id, title: 't' + id, open: true, ...extra }) as ToastItem

afterEach(() => {
  if (root) {
    act(() => { root!.unmount() })
    root = null
  }
})

afterAll(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------- reducer（纯函数）

describe('reducer', () => {
  beforeEach(async () => { await fresh() })

  it('ADD_TOAST 前插（新的在前），且 LIMIT=1 只留最新', () => {
    let s = mod.reducer({ toasts: [] }, { type: 'ADD_TOAST', toast: mk('1') } as never)
    expect(s.toasts.map((t) => t.id)).toEqual(['1'])
    s = mod.reducer(s, { type: 'ADD_TOAST', toast: mk('2') } as never)
    // 若是「追加」则这里会是 ['1']（旧的被留下）；前插 + slice(0,1) 才会是 ['2']
    expect(s.toasts.map((t) => t.id)).toEqual(['2'])
  })

  it('不改入参（返回新对象）', () => {
    const before = { toasts: [mk('a')] }
    const after = mod.reducer(before, { type: 'ADD_TOAST', toast: mk('c') } as never)
    expect(after).not.toBe(before)
    expect(before.toasts).toHaveLength(1)
    expect(after.toasts[0].id).toBe('c')
  })

  it('UPDATE_TOAST 按 id 合并，其它条目不受影响', () => {
    const s = mod.reducer(
      { toasts: [mk('a'), mk('b')] },
      { type: 'UPDATE_TOAST', toast: { id: 'b', title: 'NEW' } } as never,
    )
    expect(s.toasts.map((t) => [t.id, t.title])).toEqual([
      ['a', 'ta'],
      ['b', 'NEW'],
    ])
  })

  it('UPDATE_TOAST 对不存在的 id 无操作', () => {
    const s = mod.reducer(
      { toasts: [mk('a')] },
      { type: 'UPDATE_TOAST', toast: { id: 'zzz', title: 'X' } } as never,
    )
    expect(s.toasts.map((t) => [t.id, t.title])).toEqual([['a', 'ta']])
  })

  it('DISMISS_TOAST 指定 id：只把该条 open 置 false', () => {
    const s = mod.reducer(
      { toasts: [mk('a'), mk('b')] },
      { type: 'DISMISS_TOAST', toastId: 'a' } as never,
    )
    expect(s.toasts.map((t) => [t.id, t.open])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  it('DISMISS_TOAST 不带 id：全部置 false（且不移除）', () => {
    const s = mod.reducer({ toasts: [mk('a'), mk('b')] }, { type: 'DISMISS_TOAST' } as never)
    expect(s.toasts).toHaveLength(2)
    expect(s.toasts.every((t) => t.open === false)).toBe(true)
  })

  it('REMOVE_TOAST 指定 id：只移除该条', () => {
    const s = mod.reducer(
      { toasts: [mk('a'), mk('b')] },
      { type: 'REMOVE_TOAST', toastId: 'a' } as never,
    )
    expect(s.toasts.map((t) => t.id)).toEqual(['b'])
  })

  it('REMOVE_TOAST 不带 id：清空', () => {
    const s = mod.reducer({ toasts: [mk('a'), mk('b')] }, { type: 'REMOVE_TOAST' } as never)
    expect(s.toasts).toEqual([])
  })

  it('DISMISS 后再 REMOVE 才为空（两步，不是一步）', () => {
    let s = mod.reducer({ toasts: [mk('a')] }, { type: 'DISMISS_TOAST' } as never)
    expect(s.toasts).toHaveLength(1) // 还在
    s = mod.reducer(s, { type: 'REMOVE_TOAST', toastId: 'a' } as never)
    expect(s.toasts).toEqual([])
  })
})

// ---------------------------------------------------------------- toast() / useToast()

describe('toast() 与 useToast()', () => {
  beforeEach(async () => { await fresh() })

  it('toast() 返回 id / dismiss / update，且入队时 open=true 带 onOpenChange', () => {
    const h = mount()
    let handle: ReturnType<Mod['toast']> | null = null
    act(() => { handle = mod.toast({ title: 'hello' }) })

    expect(typeof handle!.id).toBe('string')
    expect(typeof handle!.dismiss).toBe('function')
    expect(typeof handle!.update).toBe('function')

    const t = api!.toasts[0]
    expect(t.id).toBe(handle!.id)
    expect(t.title).toBe('hello')
    expect(t.open).toBe(true)
    expect(typeof t.onOpenChange).toBe('function')
    h.unmount()
  })

  it('TOAST_LIMIT=1：连发两条只留最新那条', () => {
    const h = mount()
    act(() => { mod.toast({ title: 'first' }) })
    act(() => { mod.toast({ title: 'second' }) })
    expect(api!.toasts).toHaveLength(1)
    expect(api!.toasts[0].title).toBe('second')
    h.unmount()
  })

  it('update() 合并字段且不动 id', () => {
    const h = mount()
    let handle: ReturnType<Mod['toast']> | null = null
    act(() => { handle = mod.toast({ title: 'old' }) })
    act(() => { handle!.update({ id: handle!.id, title: 'new', description: 'd' } as never) })
    expect(api!.toasts[0]).toMatchObject({ id: handle!.id, title: 'new', description: 'd' })
    h.unmount()
  })

  it('dismiss() 只把 open 置 false，条目仍在列表里', () => {
    const h = mount()
    let handle: ReturnType<Mod['toast']> | null = null
    act(() => { handle = mod.toast({ title: 'x' }) })
    act(() => { handle!.dismiss() })
    expect(api!.toasts).toHaveLength(1)
    expect(api!.toasts[0].open).toBe(false)
    h.unmount()
  })

  it('onOpenChange(false) 触发 dismiss（onOpenChange(true) 不触发）', () => {
    const h = mount()
    act(() => { mod.toast({ title: 'x' }) })

    act(() => { api!.toasts[0].onOpenChange!(true) })
    expect(api!.toasts[0].open).toBe(true)

    act(() => { api!.toasts[0].onOpenChange!(false) })
    expect(api!.toasts[0].open).toBe(false)
    h.unmount()
  })

  it('id 单调递增且不重复', () => {
    const h = mount()
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      let id = ''
      act(() => { id = mod.toast({ title: 't' + i }).id })
      ids.push(id)
    }
    expect(new Set(ids).size).toBe(5)
    h.unmount()
  })

  it('useToast 订阅：卸载后不再跟随 dispatch 更新', () => {
    const h = mount()
    act(() => { mod.toast({ title: 'a' }) })
    expect(api!.toasts).toHaveLength(1)

    h.unmount()
    // 卸载后再发，组件 state 不应再变
    const snapshot = api!.toasts
    act(() => { mod.toast({ title: 'b' }) })
    expect(api!.toasts).toBe(snapshot)
  })

  it('dismiss 后经 TOAST_REMOVE_DELAY 才真正移除；同一 id 只排一个定时器', () => {
    vi.useFakeTimers()
    try {
      const h = mount()
      let handle: ReturnType<Mod['toast']> | null = null
      act(() => { handle = mod.toast({ title: 'x' }) })

      const timerSpy = vi.spyOn(globalThis, 'setTimeout')
      act(() => { handle!.dismiss() })
      act(() => { handle!.dismiss() }) // 重复调用不应再排一个
      expect(timerSpy).toHaveBeenCalledTimes(1)

      expect(api!.toasts).toHaveLength(1) // 还没到时间
      act(() => { vi.advanceTimersByTime(REMOVE_DELAY) })
      expect(api!.toasts).toHaveLength(0)

      timerSpy.mockRestore()
      h.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
