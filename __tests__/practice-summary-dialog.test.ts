/**
 * PracticeSummaryDialog —— 练习总结弹窗契约测试
 *
 * 受控 Dialog（open / data / 回调来自 props，内容 portal 到 document.body）。
 * 两块契约最容易写错：
 *  ① **分档是「含下界」比较**：`>= 0.8` 才 🎉/「优秀」，`>= 0.5` 才 👍/「不错」，否则 💪/「继续加油」
 *  ② **「再练一次」先关弹窗、再触发回调**（顺序反了会导致回调在弹窗仍打开时执行）
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PracticeSummaryDialog, type PracticeSummaryData } from '@/components/practice-summary-dialog'
import { TRANSLATIONS } from '@/lib/i18n'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const tZh = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k
const tEn = (k: string) => (TRANSLATIONS['en'] as Record<string, string>)[k] ?? k

type Props = Record<string, unknown>
let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(props: Props = {}) {
  const seq: string[] = []
  const data: PracticeSummaryData = { correct: 8, total: 10, duration: 125 }
  const base: Props = {
    open: true,
    onOpenChange: () => seq.push('close'),
    data,
    onPracticeAgain: () => seq.push('again'),
    t: tZh,
    ...props,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(PracticeSummaryDialog as never, base as never))
  })
  const text = () => document.body.textContent ?? ''
  /**
   * 统计卡片所在网格：**不能用 `div.grid`** —— radix 的 DialogContent 自身也带 `grid` 类，
   * 会一起命中（实测 `div.grid > div` 返回 8 个）。用 `grid-cols-2` 唯一定位。
   * 每个卡片内部恰好 2 个 div：[0] 数值、[1] 标签。
   */
  const statCells = () =>
    [...(document.body.querySelector('div.grid-cols-2')?.children ?? [])] as HTMLElement[]
  const statValues = () => statCells().map((cell) => cell.children[0].textContent)
  const statLabels = () => statCells().map((cell) => cell.children[1].textContent)
  /** 表情：`[aria-hidden]` 会命中 radix 给外部内容加的一堆，改按内容匹配 */
  const emoji = () =>
    [...document.body.querySelectorAll('div')]
      .map((d) => d.textContent ?? '')
      .find((v) => /^(🎉|👍|💪)$/.test(v))
  const buttons = () => [...document.body.querySelectorAll('button')] as HTMLButtonElement[]
  const btn = (label: string) => buttons().find((b) => b.textContent?.trim() === label)
  const click = (el: HTMLElement | undefined) => {
    expect(el, '待点击元素应存在').toBeTruthy()
    act(() => {
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { seq, text, statValues, statLabels, emoji, buttons, btn, click, unmount }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('PracticeSummaryDialog', () => {
  describe('显隐与文案', () => {
    it('open=false 时不渲染内容', () => {
      const p = mount({ open: false })
      expect(p.text()).not.toContain(tZh('practice_summary_title'))
      p.unmount()
    })

    it('标题走 t()，中英各验', () => {
      const zh = mount()
      expect(zh.text()).toContain(tZh('practice_summary_title'))
      zh.unmount()
      const en = mount({ t: tEn })
      expect(en.text()).toContain(tEn('practice_summary_title'))
      en.unmount()
    })

    it('四个统计卡片标签齐全且顺序固定（正确/错误/正确率/时长）', () => {
      const p = mount()
      expect(p.statLabels()).toEqual([
        tZh('practice_summary_correct'),
        tZh('practice_summary_wrong'),
        tZh('practice_summary_accuracy'),
        tZh('practice_summary_duration'),
      ])
      p.unmount()
    })
  })

  describe('分档（含下界比较）', () => {
    const tier = (correct: number, total: number) => {
      const p = mount({ data: { correct, total, duration: 0 } })
      const out = { emoji: p.emoji(), text: p.text() }
      p.unmount()
      return out
    }

    it('≥80% → 🎉 + 优秀（边界 0.8 含）', () => {
      expect(tier(8, 10).emoji).toBe('🎉')
      expect(tier(8, 10).text).toContain(tZh('practice_summary_excellent'))
      expect(tier(10, 10).emoji).toBe('🎉')
      // 79% 落入下一档
      expect(tier(79, 100).emoji).toBe('👍')
    })

    it('≥50% 且 <80% → 👍 + 不错（边界 0.5 含）', () => {
      expect(tier(5, 10).emoji).toBe('👍')
      expect(tier(5, 10).text).toContain(tZh('practice_summary_good'))
      expect(tier(79, 100).text).toContain(tZh('practice_summary_good'))
      // 49% 落入最后一档
      expect(tier(49, 100).emoji).toBe('💪')
    })

    it('<50% → 💪 + 继续加油', () => {
      expect(tier(4, 10).emoji).toBe('💪')
      expect(tier(4, 10).text).toContain(tZh('practice_summary_keep'))
      expect(tier(0, 10).emoji).toBe('💪')
    })

    it('total=0 → 💪 + 继续加油（不出现除零）', () => {
      const p = mount({ data: { correct: 0, total: 0, duration: 0 } })
      expect(p.emoji()).toBe('💪')
      expect(p.text()).toContain(tZh('practice_summary_keep'))
      p.unmount()
    })
  })

  describe('四项数值', () => {
    it('正确数 / 错误数 = total - correct', () => {
      const p = mount({ data: { correct: 7, total: 10, duration: 0 } })
      const [correct, wrong] = p.statValues()
      expect(correct).toBe('7')
      expect(wrong).toBe('3')
      p.unmount()
    })

    it('正确率取整（四舍五入），total=0 时为 0%', () => {
      const p1 = mount({ data: { correct: 1, total: 3, duration: 0 } })
      expect(p1.statValues()[2]).toBe('33%')
      p1.unmount()
      const p2 = mount({ data: { correct: 2, total: 3, duration: 0 } })
      expect(p2.statValues()[2]).toBe('67%')
      p2.unmount()
      const p3 = mount({ data: { correct: 0, total: 0, duration: 0 } })
      expect(p3.statValues()[2]).toBe('0%')
      p3.unmount()
    })

    it('时长格式化为 M:SS（秒位补零）', () => {
      const cases: [number, string][] = [
        [0, '0:00'],
        [59, '0:59'],
        [60, '1:00'],
        [125, '2:05'],
        [3661, '61:01'],
      ]
      for (const [duration, expected] of cases) {
        const p = mount({ data: { correct: 1, total: 1, duration } })
        expect(p.statValues()[3], `duration=${duration}`).toBe(expected)
        p.unmount()
      }
    })
  })

  describe('两个按钮', () => {
    it('「关闭」只回传 onOpenChange(false)', () => {
      const p = mount()
      p.click(p.btn(tZh('practice_summary_close')))
      expect(p.seq).toEqual(['close'])
      p.unmount()
    })

    it('「再练一次」**先关弹窗、再触发回调**', () => {
      const p = mount()
      p.click(p.btn(tZh('practice_summary_again')))
      expect(p.seq).toEqual(['close', 'again'])
      p.unmount()
    })

    it('英文模式下两个按钮文案取英文', () => {
      const p = mount({ t: tEn })
      expect(p.btn(tEn('practice_summary_close'))).toBeTruthy()
      expect(p.btn(tEn('practice_summary_again'))).toBeTruthy()
      p.unmount()
    })
  })
})
