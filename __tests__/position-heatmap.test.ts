/**
 * components/position-heatmap.tsx 的契约测试（此前零测试）。
 *
 * 指板掌握度热力图：把「找音练习」的逐位置（弦 × 品）正确率画成红→绿的颜色网格。
 * 数据来自 lib/position-stats（模块级缓存 + 订阅），所以测试直接在真实模块上
 * recordPositionResult 造数据，再断言渲染结果 —— 探针未发现真 bug。
 *
 * 契约重点：
 *  ① **颜色是红→绿插值**（hue 0→145）：0% 偏红、100% 偏绿、50% 落在中间；
 *  ② **格子的 title 是给用户看的明细**：弦号 **1-based**、品号、正确率、正确/总数；
 *  ③ **汇总正确率按次数加权**（correctSum / totalSum），不是各格正确率的平均；
 *  ④ **订阅**：记录/清空后无需手动 rerender 就刷新；
 *  ⑤ **乐器隔离**：只显示当前乐器的数据；
 *  ⑥ 清空必须先过 window.confirm。
 *
 * ⚠️ 识别"热力格"要按 `title` 属性筛（图例那条渐变 div 也带 style.background，
 * 会被 backgroundColor 过滤器误抓 —— 探针第一版就多算了一个）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PositionHeatmap } from '@/components/position-heatmap'
import * as ps from '@/lib/position-stats'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const GUITAR = 'six_string_guitar'
const BASS = 'four_string_bass'

function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(PositionHeatmap as never, {
      instrument: GUITAR, fretCount: 12, language: 'zh-CN', ...props,
    } as never))
  })
  /** 热力格 = 带 title 且背景是具体颜色的格子（排除无数据的 muted 格与图例） */
  const cells = () => [...container.querySelectorAll('div')]
    .filter((d) => {
      const bg = (d as HTMLElement).style.backgroundColor
      return Boolean(d.getAttribute('title')) && Boolean(bg) && bg !== 'transparent'
    }) as HTMLElement[]
  return {
    container,
    text: () => container.textContent ?? '',
    cells,
    /** 无数据格（有 title 但没有具体背景色） */
    emptyCells: () => [...container.querySelectorAll('div')]
      .filter((d) => {
        const bg = (d as HTMLElement).style.backgroundColor
        return Boolean(d.getAttribute('title')) && (!bg || bg === 'transparent')
      }) as HTMLElement[],
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    click(el: HTMLElement) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }) },
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

/** 把 rgb(...) 拆成 [r,g,b] */
const rgb = (el: HTMLElement) => (el.style.backgroundColor.match(/[\d.]+/g) ?? []).map(Number)

/** 造数据：位置 (s,f) 记录 total 次、其中 correct 次正确 */
function seed(s: number, f: number, total: number, correct: number) {
  for (let i = 0; i < total; i++) {
    ps.recordPositionResult(GUITAR, s, f, i < correct)
  }
}

beforeEach(async () => {
  const store = new Map<string, string>()
  const ls = window.localStorage as unknown as {
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
    removeItem: (k: string) => void
  }
  ls.getItem = (k) => store.get(k) ?? null
  ls.setItem = (k, v) => { store.set(k, v) }
  ls.removeItem = (k) => { store.delete(k) }
  await ps.clearPositionStats(GUITAR)
  await ps.clearPositionStats(BASS)
})

afterEach(async () => {
  await ps.clearPositionStats(GUITAR)
  await ps.clearPositionStats(BASS)
})

describe('无数据态', () => {
  it('显示说明与空提示，无清空按钮、无热力格', () => {
    const p = mount()
    expect(p.text()).toContain('指板掌握度热力图')
    expect(p.text()).toContain('颜色越红代表该位置正确率越低')
    expect(p.text()).toContain('暂无位置数据')
    expect(p.cells()).toHaveLength(0)
    expect(p.buttons().find((b) => b.textContent?.includes('清空'))).toBeUndefined()
    p.unmount()
  })
})

describe('热力格', () => {
  it('每个有数据的位置渲染一个格子，title 含 1-based 弦号/品号/正确率/分数', () => {
    seed(0, 0, 3, 3)   // 弦 1 品 0 → 100%
    seed(2, 5, 2, 1)   // 弦 3 品 5 → 50%
    seed(1, 3, 4, 0)   // 弦 2 品 3 → 0%

    const p = mount()
    const cells = p.cells()
    expect(cells).toHaveLength(3)

    const titles = cells.map((c) => c.getAttribute('title')!)
    expect(titles).toContain('1 指板 0: 正确率 100% (3/3)')
    expect(titles).toContain('3 指板 5: 正确率 50% (1/2)')
    expect(titles).toContain('2 指板 3: 正确率 0% (0/4)')
    p.unmount()
  })

  it('格子里的数字是整数百分比', () => {
    seed(0, 0, 3, 1)  // 33%
    const p = mount()
    expect(p.cells()[0].textContent).toBe('33')
    p.unmount()
  })

  it('有数据的格子不再是无数据底色的空提示', () => {
    seed(0, 0, 1, 1)
    const p = mount()
    expect(p.emptyCells().some((c) => c.getAttribute('title') === '1 指板 0: 暂无数据')).toBe(false)
    p.unmount()
  })

  it('无数据的位置仍渲染中性格（title 标注"无数据"）', () => {
    seed(0, 0, 1, 1)
    const p = mount()
    const empties = p.emptyCells()
    expect(empties.length).toBeGreaterThan(0)
    expect(empties.some((c) => c.getAttribute('title') === '2 指板 0: 暂无数据')).toBe(true)
    p.unmount()
  })
})

describe('颜色是红→绿插值（hue 0 → 145）', () => {
  it('0% 偏红、100% 偏绿、50% 落在中间', () => {
    seed(0, 0, 4, 0)   // 0%
    seed(0, 1, 4, 4)   // 100%
    seed(0, 2, 4, 2)   // 50%

    const p = mount()
    const byPct = (pct: number) => p.cells()
      .find((c) => c.getAttribute('title')!.includes(`正确率 ${pct}%`))!
    const red = rgb(byPct(0))
    const green = rgb(byPct(100))
    const mid = rgb(byPct(50))

    // 0% → 红分量最大；100% → 绿分量最大
    expect(red[0], '0% 应偏红（r > g）').toBeGreaterThan(red[1])
    expect(green[1], '100% 应偏绿（g > r）').toBeGreaterThan(green[0])
    // 中间档用**红分量**判单调（hsl 固定饱和度下 60°~180° 的绿分量恒为最大值，
    // 50% 与 100% 的 g 相同，不能拿 g 判单调）
    expect(mid[0], '50% 的红分量应低于 0%').toBeLessThan(red[0])
    expect(mid[0], '50% 的红分量应高于 100%').toBeGreaterThan(green[0])
    p.unmount()
  })

  it('正确率越高颜色越绿（单调性，0/25/50/75/100 五档）', () => {
    for (let i = 0; i <= 4; i++) seed(0, i, 4, i)
    const p = mount()
    const sorted = p.cells()
      .map((c) => ({ pct: Number(c.textContent), g: rgb(c)[1] }))
      .sort((a, b) => a.pct - b.pct)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].g, `${sorted[i - 1].pct}% → ${sorted[i].pct}% 的绿分量应递增`)
        .toBeGreaterThanOrEqual(sorted[i - 1].g)
    }
    p.unmount()
  })
})

describe('汇总', () => {
  it('总次数 = 各格 total 之和；正确率**按次数加权**而非各格平均', () => {
    // 位置 A：1/1 = 100%（1 次）；位置 B：0/9 = 0%（9 次）
    // 加权 = 1/10 = 10%；若按各格正确率平均则是 50%
    seed(0, 0, 1, 1)
    seed(0, 1, 9, 0)
    const p = mount()
    expect(p.text()).toContain('次数: 10')
    expect(p.text()).toContain('正确率: 10%')
    expect(p.text()).not.toContain('正确率: 50%')
    p.unmount()
  })

  it('全部答对时正确率 100%', () => {
    seed(0, 0, 5, 5)
    seed(1, 2, 3, 3)
    const p = mount()
    expect(p.text()).toContain('正确率: 100%')
    expect(p.text()).toContain('次数: 8')
    p.unmount()
  })
})

describe('订阅与乐器隔离', () => {
  it('记录新位置后自动刷新（无需手动 rerender）', () => {
    seed(0, 0, 1, 1)
    const p = mount()
    expect(p.cells()).toHaveLength(1)
    act(() => { ps.recordPositionResult(GUITAR, 4, 7, true) })
    expect(p.cells()).toHaveLength(2)
    expect(p.text()).toContain('次数: 2')
    p.unmount()
  })

  it('只显示当前乐器的数据', () => {
    seed(0, 0, 1, 1)
    act(() => { ps.recordPositionResult(BASS, 3, 9, true) })

    const guitar = mount()
    expect(guitar.cells()).toHaveLength(1)
    expect(guitar.text()).not.toContain('4 指板 9')
    guitar.unmount()

    const bass = mount({ instrument: BASS, fretCount: 12 })
    expect(bass.cells()).toHaveLength(1)
    expect(bass.cells()[0].getAttribute('title')).toContain('4 指板 9')
    bass.unmount()
  })

  it('fretCount 决定列数：表头品号 0..fretCount（且不含下一品）', () => {
    seed(0, 3, 1, 1)
    const p = mount({ fretCount: 5 })
    // 品号在表头那一行（mb-1 的 flex 容器），其第一个子元素是左侧占位
    const headerRow = p.container.querySelector('div.mb-1.flex')!
    const nums = [...headerRow.children]
      .slice(1)
      .map((d) => Number(d.textContent))
    expect(nums).toEqual([0, 1, 2, 3, 4, 5])
    p.unmount()
  })
})

describe('清空', () => {
  it('confirm 确认后清空并回到无数据态', async () => {
    seed(0, 0, 1, 1)
    const p = mount()
    expect(p.cells()).toHaveLength(1)

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    p.click(p.buttons()[0])
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()

    // clearPositionStats 是异步的，等一拍
    await act(async () => { await Promise.resolve() })
    expect(p.cells()).toHaveLength(0)
    expect(p.text()).toContain('暂无位置数据')
    p.unmount()
  })

  it('confirm 取消则不清空', async () => {
    seed(0, 0, 1, 1)
    const p = mount()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    p.click(p.buttons()[0])
    confirmSpy.mockRestore()
    await act(async () => { await Promise.resolve() })
    expect(p.cells()).toHaveLength(1)
    p.unmount()
  })
})

describe('图例', () => {
  it('有数据时显示"薄弱 → 熟练"渐变条', () => {
    seed(0, 0, 1, 1)
    const p = mount()
    expect(p.text()).toContain('薄弱')
    expect(p.text()).toContain('熟练')
    const grad = [...p.container.querySelectorAll('div')]
      .find((d) => (d as HTMLElement).style.background?.includes('linear-gradient'))
    expect(grad, '应有渐变图例条').toBeTruthy()
    p.unmount()
  })
})
