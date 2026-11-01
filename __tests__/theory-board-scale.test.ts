/**
 * 乐理页「图形大小」的契约测试 + 源码护栏。
 *
 * 这个特性最容易坏在两处，且都不报错：
 *  ① **倍率没真正作用到图上**（CSS 变量写了但 `--ft-row-h` 没乘 var ⇒ 拖了滑块没变化）；
 *  ② **只放大了容器没放大字**（圆点变大、音名还是 10px ⇒ 看起来更小）。
 * 所以除了纯函数，还要源码级钉住 CSS 与组件的连接点。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BOARD_SCALE_DEFAULT,
  BOARD_SCALE_MAX,
  BOARD_SCALE_MIN,
  BOARD_SCALE_STEP,
  BOARD_SCALE_STORAGE_KEY,
  normalizeBoardScale,
  stepBoardScale,
  readStoredBoardScale,
  writeStoredBoardScale,
} from '@/lib/theory-board-scale'
import { useTheoryBoardScale } from '@/hooks/use-theory-board-scale'

// 测法沿用项目既有模式：`createRoot` + React 原生 `act`
// （不引入 @testing-library/react 的 renderHook —— `@testing-library/dom` 未安装）。
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Api = ReturnType<typeof useTheoryBoardScale>
let api: Api | null

function Probe() {
  api = useTheoryBoardScale()
  return null
}

/** 所有挂过的树（断言失败时也保证拆干净，避免残留 root 污染后续用例） */
const mounted: Array<() => void> = []

function mountScale() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  const unmount = () => {
    try { act(() => root.unmount()) } catch { /* 已拆过 */ }
    container.remove()
    api = null
  }
  mounted.push(unmount)
  return { unmount }
}

afterEach(() => {
  for (const u of mounted.splice(0)) { try { u() } catch { /* 已拆过 */ } }
})

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** 假存储：可指定读/写抛异常（隐私模式、配额满） */
function fakeStorage(init?: Record<string, string>) {
  const map = new Map(Object.entries(init ?? {}))
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v) },
  }
}

describe('normalizeBoardScale：外部值一律收敛', () => {
  it('合法值原样返回', () => {
    expect(normalizeBoardScale(0.8)).toBe(0.8)
    expect(normalizeBoardScale(1)).toBe(1)
    expect(normalizeBoardScale(1.35)).toBe(1.35)
    expect(normalizeBoardScale(BOARD_SCALE_MAX)).toBe(BOARD_SCALE_MAX)
  })

  it('非法类型一概回落默认 1（localStorage 的 JSON 不保证类型）', () => {
    for (const bad of [NaN, Infinity, -Infinity, '1.5', null, undefined, {}, []]) {
      expect(normalizeBoardScale(bad), `收到 ${String(bad)}`).toBe(BOARD_SCALE_DEFAULT)
    }
  })

  it('越界回落默认值（不是钳制到边界 —— 钳制是 step 的语义）', () => {
    expect(normalizeBoardScale(0.5)).toBe(BOARD_SCALE_DEFAULT)
    expect(normalizeBoardScale(2.4)).toBe(BOARD_SCALE_DEFAULT)
    expect(normalizeBoardScale(0)).toBe(BOARD_SCALE_DEFAULT)
  })

  it('取整到 2 位小数，避免浮点尾巴进 DOM 样式', () => {
    expect(normalizeBoardScale(0.9000000000000001)).toBe(0.9)
    expect(normalizeBoardScale(1.234567)).toBe(1.23)
  })
})

describe('stepBoardScale：边界处停住，不越界', () => {
  it('每次步进 10%', () => {
    expect(stepBoardScale(1, BOARD_SCALE_STEP)).toBe(1.1)
    expect(stepBoardScale(1.1, BOARD_SCALE_STEP)).toBe(1.2)
    expect(stepBoardScale(1.2, -BOARD_SCALE_STEP)).toBe(1.1)
  })

  it('下限处不能再减、上限处不能再加', () => {
    expect(stepBoardScale(BOARD_SCALE_MIN, -BOARD_SCALE_STEP)).toBe(BOARD_SCALE_MIN)
    expect(stepBoardScale(BOARD_SCALE_MAX, BOARD_SCALE_STEP)).toBe(BOARD_SCALE_MAX)
  })

  it('浮点累积不会跑出区间（连按 20 次）', () => {
    let v = BOARD_SCALE_DEFAULT
    for (let i = 0; i < 20; i++) v = stepBoardScale(v, BOARD_SCALE_STEP)
    expect(v).toBe(BOARD_SCALE_MAX)
    for (let i = 0; i < 40; i++) v = stepBoardScale(v, -BOARD_SCALE_STEP)
    expect(v).toBe(BOARD_SCALE_MIN)
  })

  it('起点是非法值时先归一化再加', () => {
    expect(stepBoardScale(NaN, BOARD_SCALE_STEP)).toBe(1.1)
  })
})

describe('存储读写：坏数据不许让 UI 崩', () => {
  it('存进去能读回来', () => {
    const store = fakeStorage()
    writeStoredBoardScale(1.4, store)
    expect(store.map.get(BOARD_SCALE_STORAGE_KEY)).toBe('1.4')
    expect(readStoredBoardScale(store)).toBe(1.4)
  })

  it('没存过 ⇒ 默认 1', () => {
    expect(readStoredBoardScale(fakeStorage())).toBe(BOARD_SCALE_DEFAULT)
  })

  it('存的是垃圾（空串 / 非数字 / 越界）⇒ 默认 1', () => {
    for (const raw of ['', 'abc', '0', '99', 'NaN']) {
      expect(readStoredBoardScale(fakeStorage({ [BOARD_SCALE_STORAGE_KEY]: raw })), raw).toBe(BOARD_SCALE_DEFAULT)
    }
  })

  it('存储抛异常（隐私模式）⇒ 读到默认值、写入不抛', () => {
    const throwing = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
    }
    expect(readStoredBoardScale(throwing)).toBe(BOARD_SCALE_DEFAULT)
    expect(() => writeStoredBoardScale(1.5, throwing)).not.toThrow()
  })
})

describe('useTheoryBoardScale：读存储在挂载后，写存储在操作时', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('挂载后读到存储里的倍率（首帧恒为 1 —— 静态导出的 SSR 阶段没有 localStorage）', () => {
    window.localStorage.setItem(BOARD_SCALE_STORAGE_KEY, '1.3')
    mountScale()
    expect(api!.scale).toBe(1.3)
  })

  it('放大一档会写存储', () => {
    mountScale()
    act(() => api!.increase())
    expect(api!.scale).toBe(1.1)
    expect(window.localStorage.getItem(BOARD_SCALE_STORAGE_KEY)).toBe('1.1')
  })

  it('到上限后 canIncrease 为 false（按钮禁用）', () => {
    mountScale()
    act(() => api!.setScale(BOARD_SCALE_MAX))
    expect(api!.canIncrease).toBe(false)
    expect(api!.canDecrease).toBe(true)
  })

  it('reset 回到 100% 并落盘', () => {
    mountScale()
    act(() => api!.setScale(1.6))
    act(() => api!.reset())
    expect(api!.scale).toBe(1)
    expect(window.localStorage.getItem(BOARD_SCALE_STORAGE_KEY)).toBe('1')
  })

  it('setScale 传非法值也不会把界面搞坏', () => {
    mountScale()
    act(() => api!.setScale(Number.NaN))
    expect(api!.scale).toBe(1)
  })

  it('存储里是垃圾值时界面按 100% 渲染（不显示 NaN%）', () => {
    window.localStorage.setItem(BOARD_SCALE_STORAGE_KEY, 'oops')
    mountScale()
    expect(api!.scale).toBe(1)
  })
})

describe('源码护栏：倍率必须真的接到图上', () => {
  const css = stripComments(readFileSync('app/globals.css', 'utf8'))
  const panel = stripComments(readFileSync('components/theory-panel.tsx', 'utf8'))

  it('CAGED/Trainer 指板的四个尺寸变量都乘了 --board-scale', () => {
    for (const v of ['--ft-open-w', '--ft-row-h', '--ft-dot', '--ft-num-h']) {
      // 每个变量在「基础」与「≥640px」两处各有一份定义 ⇒ 必须都带 var()
      const re = new RegExp(`${v}: calc\\([^)]*var\\(--board-scale, 1\\)`, 'g')
      const hits = css.match(re) ?? []
      expect(hits.length, `${v} 没有乘 --board-scale（滑块对 CAGED 图无效）`).toBeGreaterThanOrEqual(2)
    }
  })

  it('圆点字号也乘了倍率（只放大容器 = 假修：圆点变大、音名还是小字）', () => {
    // ⚠️ 这里钉的是**具体数值**：2026-10-31 用户要求「指板音名 音级 再调大两号」⇒
    //    Trainer 皮肤圆点内字号 12px → 14px（小屏）、13px → 16px（≥640px）。
    //    意图不变：**字号必须跟着 --board-scale 一起缩放**（只放大圆点 = 假修）。
    expect(css).toMatch(/font-size: calc\(0\.875rem \* var\(--board-scale, 1\)\)/)
    expect(css).toMatch(/font-size: calc\(1rem \* var\(--board-scale, 1\)\)/)
  })

  it('mini 指板与五度圈的类带倍率，且组件里不再写死像素宽高', () => {
    expect(css).toMatch(/\.mini-cell \{[\s\S]*?var\(--board-scale, 1\)/)
    expect(css).toMatch(/\.theory-disc \{[\s\S]*?var\(--board-scale, 1\)/)
    expect(panel, '又出现了写死的 w-8 sm:w-9 —— 那会绕开倍率').not.toContain('w-8 sm:w-9')
    expect(panel).toContain('className="theory-disc"')
    expect(panel).toContain('mini-cell rounded-sm')
  })

  it('TheoryPanel 根节点下发 --board-scale（否则整条链路读到的都是默认 1）', () => {
    expect(panel).toContain("'--board-scale': String(boardScale.scale)")
  })
})
