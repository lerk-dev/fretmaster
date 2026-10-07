/**
 * MetronomeVisualizer —— 节拍可视化契约测试
 *
 * 内部状态（currentBeat / pulseScale / beatHistory）+ 定时器驱动，无 props 回调。
 * 用 fake timers 推进节拍，断言用户真正看到的东西：拍号数字、圆点高亮、历史柱。
 *
 * 本轮同时清理了该文件里三处死代码（见提交说明）：
 *  ① `useAppStore` import 从未使用
 *  ② 组件内的 `t`（含一份内联 translations 字典）从未被调用
 *  ③ 导出的 `MetronomePulse` 全仓零引用
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MetronomeVisualizer } from '@/components/metronome-visualizer'

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
  const tick = (ms: number) => {
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
  return { rootEl, beatText, dots, bars, pinger, pulseWrapper, tick, unmount }
}

beforeEach(() => {
  vi.useFakeTimers()
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

    it('bpm<=0 时仍渲染（只是不推进节拍）', () => {
      const p = mount({ bpm: 0 })
      expect(p.beatText()).toBe('1')
      p.tick(5000)
      expect(p.beatText(), 'bpm<=0 不应推进').toBe('1')
      expect(p.bars()).toHaveLength(0)
      p.unmount()
    })
  })

  describe('节拍推进', () => {
    it('初始显示第 1 拍、所有圆点尚未走过、无历史柱', () => {
      const p = mount({ bpm: 60 })
      expect(p.beatText()).toBe('1')
      expect(p.dots()).toHaveLength(4)
      expect(p.bars()).toHaveLength(0)
      expect(p.dots()[0].className).toContain('scale-150')
      p.unmount()
    })

    it('每过一个拍间隔推进一拍，数字为 1-based', () => {
      const p = mount({ bpm: 60 }) // 一拍 = 1000ms
      p.tick(1000)
      expect(p.beatText()).toBe('2')
      p.tick(1000)
      expect(p.beatText()).toBe('3')
      p.tick(1000)
      expect(p.beatText()).toBe('4')
      p.unmount()
    })

    it('到 beatsPerMeasure 后回到第 1 拍（循环）', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.tick(4000)
      expect(p.beatText(), '第 5 次推进应回到 1').toBe('1')
      p.tick(1000)
      expect(p.beatText()).toBe('2')
      p.unmount()
    })

    it('beatsPerMeasure=3 时每 3 拍循环，圆点数也是 3', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 3 })
      expect(p.dots()).toHaveLength(3)
      p.tick(3000)
      expect(p.beatText()).toBe('1')
      p.unmount()
    })

    it('拍间隔由 bpm 决定（bpm=120 → 500ms 一拍）', () => {
      const p = mount({ bpm: 120 })
      p.tick(499)
      expect(p.beatText(), '不到一拍不应推进').toBe('1')
      p.tick(1)
      expect(p.beatText()).toBe('2')
      p.unmount()
    })
  })

  describe('圆点高亮', () => {
    it('当前拍高亮（scale-150）、已过拍暗、未到拍最暗', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.tick(2000) // 第 3 拍（currentBeat=2）
      const d = p.dots()
      expect(d[2].className).toContain('scale-150')
      expect(d[0].className).toContain('bg-primary/40')
      expect(d[1].className).toContain('bg-primary/40')
      expect(d[3].className).toContain('bg-muted-foreground/30')
      p.unmount()
    })

    it('回到第 1 拍时没有「已过」圆点', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.tick(4000)
      const d = p.dots()
      expect(d[0].className).toContain('scale-150')
      expect(d[1].className).toContain('bg-muted-foreground/30')
      expect(d[2].className).toContain('bg-muted-foreground/30')
      expect(d[3].className).toContain('bg-muted-foreground/30')
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

    it('推进一拍照例放大到 1.3，100ms 后回到 1', () => {
      const p = mount({ bpm: 60 })
      p.tick(1000)
      expect(p.pulseWrapper().style.transform).toBe('scale(1.3)')
      p.tick(100)
      expect(p.pulseWrapper().style.transform).toBe('scale(1)')
      p.unmount()
    })
  })

  describe('节拍历史柱', () => {
    it('每推进一拍多一根柱子，高度 = max(4, (拍号+1)*4) px', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.tick(1000) // 第 2 拍 → height (1+1)*4 = 8
      expect(p.bars()).toHaveLength(1)
      expect(p.bars()[0].style.height).toBe('8px')
      p.tick(1000) // 第 3 拍 → 12
      expect(p.bars()[1].style.height).toBe('12px')
      p.tick(1000) // 第 4 拍 → 16
      expect(p.bars()[2].style.height).toBe('16px')
      p.tick(1000) // 回到第 1 拍 → (0+1)*4 = 4
      expect(p.bars()[3].style.height).toBe('4px')
      p.unmount()
    })

    it('最多保留 16 根（丢最早的）', () => {
      const p = mount({ bpm: 60 })
      p.tick(60_000)
      expect(p.bars()).toHaveLength(16)
      p.unmount()
    })

    it('越新的柱子越不透明', () => {
      const p = mount({ bpm: 60 })
      p.tick(3000)
      const ops = p.bars().map((b) => Number(b.style.opacity))
      expect(ops).toHaveLength(3)
      expect(ops[0]).toBeLessThan(ops[1])
      expect(ops[1]).toBeLessThan(ops[2])
      p.unmount()
    })
  })

  describe('停止与重播', () => {
    it('isPlaying 变 false → 内容消失且计数复位', () => {
      const p = mount({ bpm: 60 })
      p.tick(2000)
      expect(p.beatText()).toBe('3')
      act(() => {
        root!.render(
          createElement(MetronomeVisualizer as never, {
            bpm: 60,
            enabled: true,
            isPlaying: false,
            beatsPerMeasure: 4,
          } as never),
        )
      })
      expect(p.rootEl().children).toHaveLength(0)
      // 重新开始 → 从第 1 拍、无历史
      act(() => {
        root!.render(
          createElement(MetronomeVisualizer as never, {
            bpm: 60,
            enabled: true,
            isPlaying: true,
            beatsPerMeasure: 4,
          } as never),
        )
      })
      expect(p.beatText()).toBe('1')
      expect(p.bars()).toHaveLength(0)
      p.unmount()
    })

    it('仅关掉 enabled 时定时器真的停了（停用期间不后台累加）', () => {
      const p = mount({ bpm: 60 })
      p.tick(1000) // 推进到第 2 拍
      expect(p.beatText()).toBe('2')

      act(() => {
        root!.render(
          createElement(MetronomeVisualizer as never, {
            bpm: 60,
            enabled: false,
            isPlaying: true,
            beatsPerMeasure: 4,
          } as never),
        )
      })
      // 长时间停用：若定时器没被清掉，这里会多累加 5 拍
      p.tick(5000)

      act(() => {
        root!.render(
          createElement(MetronomeVisualizer as never, {
            bpm: 60,
            enabled: true,
            isPlaying: true,
            beatsPerMeasure: 4,
          } as never),
        )
      })
      // 说明：此时 isPlaying 始终为 true，所以第二段 effect 不会复位计数
      // —— 重新开启后从**停用前那一拍**继续（这是既有设计，不是重启）
      expect(p.beatText()).toBe('2')
      // 停用前那一拍的历史柱仍在（历史不清空），但停用的 5 秒里**没有新增**
      expect(p.bars(), '停用期间不应新增历史柱').toHaveLength(1)
      p.unmount()
    })
  })
})
