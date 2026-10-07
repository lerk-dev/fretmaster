/**
 * hooks/use-structure-window-drag.ts 的契约测试（此前零测试）。
 *
 * 浮动窗口拖动（和弦进行 / 音阶 / 和弦练习三个结构窗）。逻辑要点：
 *   - `handleDragStart` 记录「起点 + 该窗口的初始位移」到 dragRef
 *   - `handleDragMove` 算 newX/newY = initial + delta，写入 pendingPositionRef，
 *     并用 **requestAnimationFrame 节流**（同一帧内多次 move 只调度一次）
 *   - `updatePosition`（rAF 回调）才真正 setState —— 这是「跟手但不卡」的关键
 *   - `handleDragEnd` 收尾：复位 dragRef、取消未执行的 rAF、丢弃 pending
 *
 * 鼠标与触摸共用（靠 `'touches' in e` 区分）。探针体检未发现真 bug —— 纯护栏。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useStructureWindowDrag } from '@/hooks/use-structure-window-drag'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Api = ReturnType<typeof useStructureWindowDrag>
let api: Api | null
function Probe() { api = useStructureWindowDrag(); return null }
function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  return {
    unmount() { act(() => root.unmount()); container.remove(); api = null },
  }
}

/** 手动驱动的 rAF 桩 */
let rafQueue: FrameRequestCallback[]
let rafCalls: number
let cancelSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  rafQueue = []
  rafCalls = 0
  cancelSpy = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCalls++
    rafQueue.push(cb)
    return rafCalls
  })
  vi.stubGlobal('cancelAnimationFrame', cancelSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const mouse = (clientX: number, clientY: number) => ({ clientX, clientY })
const touch = (clientX: number, clientY: number) => ({ touches: [{ clientX, clientY }] })

// ---------------------------------------------------- 初值

describe('初值', () => {
  it('三个窗口位移都是 (0,0)，拖拽会话未开始', () => {
    const h = mount()
    expect(api!.chordStructurePosition).toEqual({ x: 0, y: 0 })
    expect(api!.scaleStructurePosition).toEqual({ x: 0, y: 0 })
    expect(api!.chordExerciseStructurePosition).toEqual({ x: 0, y: 0 })
    expect(api!.dragRef.current.isDragging).toBe(false)
    expect(api!.dragRef.current.target).toBeNull()
    h.unmount()
  })
})

// ---------------------------------------------------- 拖拽会话

describe('handleDragStart', () => {
  it('记录起点与「该窗口的当前位移」，并标记正在拖拽', () => {
    const h = mount()
    act(() => { api!.setChordStructurePosition({ x: 40, y: -10 }) })
    act(() => { api!.handleDragStart(mouse(100, 200) as never, 'chord') })

    const d = api!.dragRef.current
    expect(d.isDragging).toBe(true)
    expect(d.target).toBe('chord')
    expect(d.startX).toBe(100)
    expect(d.startY).toBe(200)
    expect(d.initialX).toBe(40)
    expect(d.initialY).toBe(-10)
    h.unmount()
  })

  it('不同 target 取各自的当前位移', () => {
    const h = mount()
    act(() => { api!.setScaleStructurePosition({ x: 1, y: 2 }) })
    act(() => { api!.setChordExerciseStructurePosition({ x: 3, y: 4 }) })

    act(() => { api!.handleDragStart(mouse(0, 0) as never, 'scale') })
    expect([api!.dragRef.current.initialX, api!.dragRef.current.initialY]).toEqual([1, 2])

    act(() => { api!.handleDragStart(mouse(0, 0) as never, 'chordExercise') })
    expect([api!.dragRef.current.initialX, api!.dragRef.current.initialY]).toEqual([3, 4])
    h.unmount()
  })

  it('触摸事件取 touches[0]', () => {
    const h = mount()
    act(() => { api!.handleDragStart(touch(11, 22) as never, 'chord') })
    expect(api!.dragRef.current.startX).toBe(11)
    expect(api!.dragRef.current.startY).toBe(22)
    h.unmount()
  })
})

describe('handleDragMove + updatePosition（rAF 节流）', () => {
  it('未开始拖拽时完全无操作', () => {
    const h = mount()
    act(() => { api!.handleDragMove(mouse(50, 50) as never) })
    expect(rafCalls).toBe(0)
    expect(api!.pendingPositionRef.current).toBeNull()
    expect(api!.chordStructurePosition).toEqual({ x: 0, y: 0 })
    h.unmount()
  })

  it('位移 = 初始位移 + 指针位移；同一帧内多次 move 只调度一次 rAF', () => {
    const h = mount()
    act(() => { api!.setChordStructurePosition({ x: 10, y: 20 }) })
    act(() => { api!.handleDragStart(mouse(100, 100) as never, 'chord') })

    act(() => { api!.handleDragMove(mouse(130, 90) as never) })
    expect(rafCalls).toBe(1)
    expect(api!.pendingPositionRef.current).toEqual({ x: 40, y: 10, target: 'chord' })

    // 同一帧内再移动：只更新 pending，不再调度 rAF
    act(() => { api!.handleDragMove(mouse(150, 80) as never) })
    expect(rafCalls).toBe(1)
    expect(api!.pendingPositionRef.current).toEqual({ x: 60, y: 0, target: 'chord' })

    // 此时 state 还没变（要等 rAF 回调）
    expect(api!.chordStructurePosition).toEqual({ x: 10, y: 20 })
    h.unmount()
  })

  it('rAF 回调执行后才写入 state，并清空 pending 与 rafRef', () => {
    const h = mount()
    act(() => { api!.handleDragStart(mouse(0, 0) as never, 'scale') })
    act(() => { api!.handleDragMove(mouse(25, -5) as never) })

    act(() => { rafQueue[0](0) })

    expect(api!.scaleStructurePosition).toEqual({ x: 25, y: -5 })
    expect(api!.pendingPositionRef.current).toBeNull()
    expect(api!.rafRef.current).toBeNull()
    h.unmount()
  })

  it('rAF 回调后可以再次调度（节流是按帧的，不是一次性的）', () => {
    const h = mount()
    act(() => { api!.handleDragStart(mouse(0, 0) as never, 'chord') })
    act(() => { api!.handleDragMove(mouse(10, 0) as never) })
    act(() => { rafQueue[0](0) })
    expect(rafCalls).toBe(1)

    act(() => { api!.handleDragMove(mouse(20, 0) as never) })
    expect(rafCalls).toBe(2)
    h.unmount()
  })

  it('三个窗口各自独立：只更新被拖拽的那个', () => {
    const h = mount()
    act(() => { api!.setChordStructurePosition({ x: 5, y: 5 }) })
    act(() => { api!.setScaleStructurePosition({ x: 6, y: 6 }) })
    act(() => { api!.handleDragStart(mouse(0, 0) as never, 'scale') })
    act(() => { api!.handleDragMove(mouse(100, 200) as never) })
    act(() => { rafQueue[0](0) })

    expect(api!.scaleStructurePosition).toEqual({ x: 106, y: 206 })
    expect(api!.chordStructurePosition).toEqual({ x: 5, y: 5 })
    expect(api!.chordExerciseStructurePosition).toEqual({ x: 0, y: 0 })
    h.unmount()
  })
})

describe('handleDragEnd', () => {
  it('结束拖拽：取消未执行的 rAF、丢弃 pending、复位会话', () => {
    const h = mount()
    act(() => { api!.handleDragStart(mouse(0, 0) as never, 'chord') })
    act(() => { api!.handleDragMove(mouse(30, 30) as never) })
    const rafId = api!.rafRef.current

    act(() => { api!.handleDragEnd() })

    expect(cancelSpy).toHaveBeenCalledWith(rafId)
    expect(api!.rafRef.current).toBeNull()
    expect(api!.pendingPositionRef.current).toBeNull()
    expect(api!.dragRef.current.isDragging).toBe(false)
    expect(api!.dragRef.current.target).toBeNull()
    // 未执行的位移不会落到 state 上
    expect(api!.chordStructurePosition).toEqual({ x: 0, y: 0 })
    h.unmount()
  })

  it('没有挂起的 rAF 时也能安全结束', () => {
    const h = mount()
    expect(() => act(() => { api!.handleDragEnd() })).not.toThrow()
    expect(cancelSpy).not.toHaveBeenCalled()
    h.unmount()
  })

  it('结束拖拽后 move 不再生效', () => {
    const h = mount()
    act(() => { api!.handleDragStart(mouse(0, 0) as never, 'chord') })
    act(() => { api!.handleDragEnd() })
    act(() => { api!.handleDragMove(mouse(50, 50) as never) })
    expect(rafCalls).toBe(0)
    expect(api!.pendingPositionRef.current).toBeNull()
    h.unmount()
  })
})
