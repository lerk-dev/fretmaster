/**
 * MetronomeVisualizer —— 节拍可视化契约测试
 *
 * 🚨 本文件在 #14 后**重写**了驱动方式：组件不再自己起定时器
 * （修前它和声音各有一个 `setInterval`，启动时刻与漂移速率都不同 ⇒ 圆点与「咔哒」
 * 逐渐错开）。现在拍事件来自 `lib/metronome-clock.ts`，由
 * `hooks/use-metronome-scheduler.ts` 在音频时钟上排程后广播。
 *
 * 因此测试不再用 `vi.advanceTimersByTime` 推进拍子，而是直接 `publishMetronomeBeat(index)`
 * —— 这反而更贴近契约：**组件只负责「给定拍事件，画出什么」**，
 * 拍子什么时候来、小节怎么数，都是排程器的事（在 hooks/use-metronome-scheduler 侧覆盖）。
 * fake timers 仍需要，但只用于组件内部的「脉冲 100ms 后还原」。
 *
 * 断言的都是用户真正看到的东西：拍号数字、圆点高亮、历史柱。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MetronomeVisualizer } from '@/components/metronome-visualizer'
import { publishMetronomeBeat, resetMetronomeClock } from '@/lib/metronome-clock'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Props = Record<string, unknown>
let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(props: Props = {}) {
  const base: Props = { bpm: 60, enabled: true, isPlaying: true, beatsPerMeasure: 4, ...props }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(MetronomeVisualizer as never, base as never))
  })
  const rootEl = () => container!
  /** 拍号大字（唯一一个 font-bold 的 span） */
  const beatText = () => {
    const spans = [...rootEl().querySelectorAll('span.font-bold')] as HTMLElement[]
    expect(spans, '拍号 span 应唯一').toHaveLength(1)
    return spans[0].textContent
  }
  /** 节拍圆点行 */
  const dots = () =>
    [...rootEl().querySelectorAll('div')].filter((d) => {
      const c = (d as HTMLElement).className
      return c.includes('w-2 h-2') && c.includes('rounded-full')
    }) as HTMLElement[]
  /** 历史柱 */
  const bars = () =>
    [...rootEl().querySelectorAll('div')].filter((d) =>
      (d as HTMLElement).className.includes('w-1 bg-primary/60'),
    ) as HTMLElement[]
  /** 脉冲外圈（有 animationDuration 的那个） */
  const pinger = () => {
    const el = [...rootEl().querySelectorAll('div')].find(
      (d) => (d as HTMLElement).style.animationDuration !== '',
    ) as HTMLElement
    expect(el, '脉冲外圈应存在').toBeTruthy()
    return el
  }
  const pulseWrapper = () => {
    const el = [...rootEl().querySelectorAll('div')].find((d) =>
      (d as HTMLElement).style.transform.startsWith('scale('),
    ) as HTMLElement
    expect(el, '脉冲包裹层应存在').toBeTruthy()
    return el
  }
  /** 广播一拍（模拟排程器）；`index` 是小节内 0-based 位置，0 即第一拍 */
  const beat = (index: number) => {
    act(() => {
      publishMetronomeBeat(index)
    })
  }
  const rerender = (next: Props) => {
    act(() => {
      root!.render(createElement(MetronomeVisualizer as never, { ...base, ...next } as never))
    })
  }
  const advance = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { rootEl, beatText, dots, bars, pinger, pulseWrapper, beat, rerender, advance, unmount }
}

beforeEach(() => {
  vi.useFakeTimers()
  // 时钟是模块级单例：不归零的话上一个用例留下的 seq 会让「是否新拍」的判定串味。
  act(() => resetMetronomeClock())
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('MetronomeVisualizer', () => {
  describe('显隐', () => {
    it('enabled=false 不渲染任何内容', () => {
      const p = mount({ enabled: false })
      expect(p.rootEl().children).toHaveLength(0)
      p.unmount()
    })

    it('isPlaying=false 不渲染任何内容', () => {
      const p = mount({ isPlaying: false })
      expect(p.rootEl().children).toHaveLength(0)
      p.unmount()
    })

    it('bpm<=0 不渲染（与声音路径口径一致：非正 bpm 本来就不出声）', () => {
      // 🚨 这是 #14 实施时**有意收紧**的行为变更（原用例断言「仍渲染、只是不推进」）。
      // 修前 `60 / 0` = Infinity 会写进 `style.animationDuration`（非法 CSS，静默失效），
      // 且 bpm 在 store 里已被 `clampMetronomeBpm` 钳到 [40,240] ⇒ 只要走到这里
      // 就一定是 store 之外来的脏值。声音路径对同一条件（`Number.isFinite && > 0`）是
      // **不出声**，可视化若仍渲染就会「画面在动、没有声音」，两边互相矛盾。
      for (const bad of [0, -60, Number.NaN, Number.POSITIVE_INFINITY]) {
        const p = mount({ bpm: bad })
        expect(p.rootEl().children, `bpm=${bad} 不应渲染`).toHaveLength(0)
        p.unmount()
      }
    })
  })

  describe('拍号显示（位置由排程器给出，组件不自己取模）', () => {
    it('index=0 显示第 1 拍（1-based），逐拍递增', () => {
      const p = mount({ bpm: 60 })
      expect(p.beatText(), '初始快照即第 1 拍').toBe('1')
      p.beat(1)
      expect(p.beatText()).toBe('2')
      p.beat(2)
      expect(p.beatText()).toBe('3')
      p.beat(3)
      expect(p.beatText()).toBe('4')
      p.beat(0)
      expect(p.beatText(), '排程器回到重音拍').toBe('1')
      p.unmount()
    })

    it('index 超出当前拍号时被夹住（拍号刚改小、下一拍还没来）', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 3 })
      p.beat(3) // 4 拍制的第 4 拍位置，但现在是 3 拍制
      expect(p.beatText(), '不能显示第 4 拍（圆点只有 3 个）').toBe('3')
      expect(p.dots()).toHaveLength(3)
      p.unmount()
    })
  })

  describe('圆点高亮', () => {
    it('当前拍高亮（scale-150）、已过拍暗、未到拍最暗', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.beat(2) // 第 3 拍
      const d = p.dots()
      expect(d[2].className).toContain('scale-150')
      expect(d[0].className).toContain('bg-primary/40')
      expect(d[1].className).toContain('bg-primary/40')
      expect(d[3].className).toContain('bg-muted-foreground/30')
      p.unmount()
    })

    it('回到第 1 拍时没有「已过」圆点', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.beat(3)
      p.beat(0)
      const d = p.dots()
      expect(d[0].className).toContain('scale-150')
      for (const i of [1, 2, 3]) {
        expect(d[i].className).toContain('bg-muted-foreground/30')
      }
      p.unmount()
    })
  })

  describe('脉冲动画', () => {
    it('外圈 animationDuration = 一拍毫秒数', () => {
      const a = mount({ bpm: 60 })
      expect(a.pinger().style.animationDuration).toBe('1000ms')
      a.unmount()
      const b = mount({ bpm: 120 })
      expect(b.pinger().style.animationDuration).toBe('500ms')
      b.unmount()
      const c = mount({ bpm: 90 })
      expect(c.pinger().style.animationDuration).toBe('666.6666666666666ms')
      c.unmount()
    })

    it('每来一拍放大到 1.3，100ms 后回到 1', () => {
      const p = mount({ bpm: 60 })
      p.beat(1)
      expect(p.pulseWrapper().style.transform).toBe('scale(1.3)')
      p.advance(100)
      expect(p.pulseWrapper().style.transform).toBe('scale(1)')
      p.unmount()
    })

    it('重复广播同一小节位置仍算「新的一拍」（判据是 seq 而不是 index）', () => {
      const p = mount({ bpm: 60 })
      p.beat(1)
      p.advance(100)
      expect(p.pulseWrapper().style.transform).toBe('scale(1)')
      // 再广播一次同一 index：seq 变了 ⇒ 算新拍（这正是「一拍一脉冲」的判据）
      p.beat(1)
      expect(p.pulseWrapper().style.transform).toBe('scale(1.3)')
      p.unmount()
    })
  })

  describe('节拍历史柱', () => {
    it('每来一拍多一根柱子，高度 = (位置+1)*4 px（第 1 拍最矮）', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.beat(1) // 高度 (1+1)*4 = 8
      expect(p.bars()).toHaveLength(1)
      expect(p.bars()[0].style.height).toBe('8px')
      p.beat(2) // 12
      expect(p.bars()[1].style.height).toBe('12px')
      p.beat(3) // 16
      expect(p.bars()[2].style.height).toBe('16px')
      p.beat(0) // 重音拍 → (0+1)*4 = 4
      expect(p.bars()[3].style.height).toBe('4px')
      p.unmount()
    })

    it('最多保留 16 根（丢最早的）', () => {
      const p = mount({ bpm: 60 })
      for (let i = 0; i < 20; i++) p.beat(i % 4)
      expect(p.bars()).toHaveLength(16)
      p.unmount()
    })

    it('越新的柱子越不透明', () => {
      const p = mount({ bpm: 60 })
      p.beat(0)
      p.beat(1)
      p.beat(2)
      const ops = p.bars().map((b) => Number(b.style.opacity))
      expect(ops).toHaveLength(3)
      expect(ops[0]).toBeLessThan(ops[1])
      expect(ops[1]).toBeLessThan(ops[2])
      p.unmount()
    })

    it('练习中途挂载不补历史柱（只记挂载之后新来的拍）', () => {
      // 先让时钟跑起来（模拟「已经在练习中」），再挂载可视化
      act(() => {
        publishMetronomeBeat(0)
        publishMetronomeBeat(1)
      })
      const p = mount({ bpm: 60 })
      expect(p.beatText(), '挂载即同步到当前拍').toBe('2')
      expect(p.bars(), '挂载不应凭空补历史柱').toHaveLength(0)
      p.beat(2)
      expect(p.bars()).toHaveLength(1)
      p.unmount()
    })
  })

  describe('拍号健壮性', () => {
    it('beatsPerMeasure <= 0 / NaN 时回落 4', () => {
      // 🚨 `x % 0` 是 **NaN**（旧实现据此算圆点计数，会渲染出 "NaN"、且永不命中任何圆点）；
      // `Array.from({length: NaN})` 还会得到空数组。这里断言圆点恰好 4 个。
      for (const bad of [0, -3, Number.NaN]) {
        const p = mount({ bpm: 60, beatsPerMeasure: bad })
        expect(p.dots(), `beatsPerMeasure=${bad} 应回落 4 个圆点`).toHaveLength(4)
        expect(p.beatText(), '应显示第 1 拍而非 NaN').toBe('1')
        expect(p.dots()[0].className).toContain('scale-150')
        p.unmount()
      }
    })

    it('运行中改拍号：圆点数跟着变，当前位置被夹在范围内（不越界）', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.beat(3) // 第 4 拍
      expect(p.beatText()).toBe('4')
      expect(p.dots()).toHaveLength(4)
      // 4 → 3：位置夹到 2（第 3 拍），不再是 "4"
      p.rerender({ beatsPerMeasure: 3 })
      expect(p.dots()).toHaveLength(3)
      expect(p.beatText()).toBe('3')
      // 排程器下一拍会给出 0（重音拍）→ 回到第 1 拍
      p.beat(0)
      expect(p.beatText()).toBe('1')
      p.unmount()
    })
  })

  describe('停止与重播', () => {
    it('isPlaying 变 false → 内容消失、历史清空；重新开始从第 1 拍起', () => {
      const p = mount({ bpm: 60 })
      p.beat(1)
      p.beat(2)
      expect(p.beatText()).toBe('3')
      expect(p.bars()).toHaveLength(2)

      p.rerender({ isPlaying: false })
      expect(p.rootEl().children).toHaveLength(0)

      // 重新开始：排程器会重新从重音拍数起（index=0）⇒ 显示第 1 拍、历史只有新的那根
      p.rerender({ isPlaying: true })
      p.beat(0)
      expect(p.beatText()).toBe('1')
      expect(p.bars(), '停止时已清空，只留下重启后的第一拍').toHaveLength(1)
      p.unmount()
    })

    it('停止时脉冲还原（不残留 scale(1.3)）', () => {
      const p = mount({ bpm: 60 })
      p.beat(1)
      expect(p.pulseWrapper().style.transform).toBe('scale(1.3)')
      p.rerender({ isPlaying: false })
      // 内容消失，但重新开始后不应带着上一轮的放大态
      p.rerender({ isPlaying: true })
      expect(p.pulseWrapper().style.transform).toBe('scale(1)')
      p.unmount()
    })
  })
})
