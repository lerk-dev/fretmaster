/**
 * TunerSheet —— 调音器侧栏契约测试
 *
 * 受控组件（open / 检测数据 / 参考频率全来自 props）。传 open={true} 即渲染内容
 * （Sheet 内容走 portal 到 document.body）。
 *
 * 重点契约：
 *  ① in-tune 判定 = `detectedFrequency > 0 && |cents| <= 5`（两个条件缺一不可）
 *  ② 指示器水平位置 = 50 + clamp(cents, -50, 50)（百分比）
 *  ③ 指示器颜色三档：≤5 绿 / ≤20 琥珀 / 其它红
 *  ④ 状态文案：in-tune / 偏低 / 偏高，且**仅在检测到频率时**显示
 *  ⑤ 参考频率滑块 430..450 step 1；吉他六弦参考频率是标准调弦值
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TunerSheet } from '@/components/tuner-sheet'
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

/** 标准六弦吉他参考频率（E2 A2 D3 G3 B3 E4） */
const STD_STRING_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63]

type Props = Record<string, unknown>

let root: Root | null = null

function mount(props: Props = {}) {
  const calls: Record<string, unknown[]> = {}
  const track = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args.length > 1 ? args : args[0])
  }
  const base: Props = {
    open: true,
    onOpenChange: track('openChange'),
    detectedNote: '--',
    detectedFrequency: 0,
    cents: 0,
    tunerActive: false,
    onToggleTuner: track('toggle'),
    referenceFrequency: 440,
    onReferenceFrequencyChange: track('refFreq'),
    t: tZh,
    ...props,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(TunerSheet as never, base as never))
  })
  // Sheet 内容在 portal 里 → 查 document.body
  const docText = () => document.body.textContent ?? ''
  const allButtons = () => [...document.body.querySelectorAll('button')] as HTMLButtonElement[]
  const click = (el: HTMLElement | undefined) => {
    expect(el, '待点击元素应存在').toBeTruthy()
    act(() => {
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }
  const unmount = () => {
    act(() => root?.unmount())
    container.remove()
    root = null
  }
  return { container, calls, docText, allButtons, click, unmount }
}

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TunerSheet', () => {
  describe('触发器与标题', () => {
    it('触发器带 nav_tuner 标题与 aria-label、data-onboarding="tuner"', () => {
      const p = mount({ open: false })
      const trigger = p.allButtons().find((b) => b.getAttribute('aria-label') === tZh('nav_tuner'))
      expect(trigger).toBeTruthy()
      expect(trigger!.getAttribute('title')).toBe(tZh('nav_tuner'))
      expect(trigger!.closest('[data-onboarding]')?.getAttribute('data-onboarding')).toBe('tuner')
      p.unmount()
    })

    it('open=false 时不渲染侧栏内容；open=true 时标题出现', () => {
      const closed = mount({ open: false })
      expect(closed.docText()).not.toContain(tZh('tuner_title'))
      closed.unmount()
      const open = mount({ open: true })
      expect(open.docText()).toContain(tZh('tuner_title'))
      open.unmount()
    })

    it('英文模式下标题取英文（t 走 en）', () => {
      const p = mount({ t: tEn })
      expect(p.docText()).toContain(tEn('tuner_title'))
      p.unmount()
    })
  })

  describe('音高与频率显示', () => {
    it('检测到音高时显示音名与频率', () => {
      const p = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 0 })
      expect(p.docText()).toContain('A')
      expect(p.docText()).toContain('440 Hz')
      p.unmount()
    })

    it('未检测到（frequency=0）时频率位显示 --', () => {
      const p = mount({ detectedNote: '--', detectedFrequency: 0, cents: 0 })
      // 只在主显示区内断言频率：外面参考频率行恒定显示 `440 Hz`，
      // 且「440 Hz」里含子串「0 Hz」，全文 not.toContain 会被击穿。
      const block = document.body.querySelector('[role="status"]') as HTMLElement
      const inner = block.textContent ?? ''
      expect(inner).toContain('--')
      expect(/\d[\d.]*\s*Hz/.test(inner), `不应出现频率：${inner}`).toBe(false)
      p.unmount()
    })

    it('音分文本带符号：正数带 +，负数带 -，0 不带', () => {
      const pos = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 12 })
      expect(pos.docText()).toContain('+12¢')
      pos.unmount()
      const neg = mount({ detectedNote: 'A', detectedFrequency: 440, cents: -12 })
      expect(neg.docText()).toContain('-12¢')
      neg.unmount()
      const zero = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 0 })
      expect(zero.docText()).toContain('0¢')
      zero.unmount()
    })

    it('两端刻度 -50¢ / +50¢ 恒定显示', () => {
      const p = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 30 })
      expect(p.docText()).toContain('-50¢')
      expect(p.docText()).toContain('+50¢')
      p.unmount()
    })
  })

  describe('in-tune 判定（两个条件缺一不可）', () => {
    const isGreen = () => {
      const block = document.body.querySelector('[role="status"]') as HTMLElement
      expect(block, '主显示区应存在').toBeTruthy()
      return block.className.includes('border-green-500/60')
    }

    it('频率 > 0 且 |cents| <= 5 → 整块闪绿', () => {
      const p = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 5 })
      expect(isGreen()).toBe(true)
      p.unmount()
    })

    it('|cents| = 6（刚出界）→ 不闪绿', () => {
      const p = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 6 })
      expect(isGreen()).toBe(false)
      p.unmount()
    })

    it('**频率 = 0 时即使 cents=0 也不闪绿**（未检测到不算准）', () => {
      const p = mount({ detectedNote: '--', detectedFrequency: 0, cents: 0 })
      expect(isGreen()).toBe(false)
      p.unmount()
    })
  })

  describe('音分指示器', () => {
    function indicator(): HTMLElement {
      const rows = [...document.body.querySelectorAll('div')].filter(
        (d) => (d as HTMLElement).style.transform === 'translateX(-50%)',
      ) as HTMLElement[]
      expect(rows, '指示器应唯一').toHaveLength(1)
      return rows[0]
    }

    it('位置 = 50 + clamp(cents, -50, 50) %', () => {
      const cases: [number, string][] = [
        [0, '50%'],
        [20, '70%'],
        [-20, '30%'],
        [50, '100%'],
        [-50, '0%'],
      ]
      for (const [cents, left] of cases) {
        const p = mount({ detectedNote: 'A', detectedFrequency: 440, cents })
        expect(indicator().style.left, `cents=${cents}`).toBe(left)
        p.unmount()
      }
    })

    it('超界被夹取（+80 → 100%、-80 → 0%）', () => {
      const hi = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 80 })
      expect(indicator().style.left).toBe('100%')
      hi.unmount()
      const lo = mount({ detectedNote: 'A', detectedFrequency: 440, cents: -80 })
      expect(indicator().style.left).toBe('0%')
      lo.unmount()
    })

    it('颜色三档：≤5 绿 / ≤20 琥珀 / 其它红', () => {
      const colorAt = (cents: number) => {
        const p = mount({ detectedNote: 'A', detectedFrequency: 440, cents })
        const c = indicator().style.backgroundColor
        p.unmount()
        return c
      }
      expect(colorAt(5)).toBe('rgb(34, 197, 94)') // #22c55e
      expect(colorAt(6)).toBe('rgb(245, 158, 11)') // #f59e0b
      expect(colorAt(20)).toBe('rgb(245, 158, 11)')
      expect(colorAt(21)).toBe('rgb(239, 68, 68)') // #ef4444
    })
  })

  describe('状态文案', () => {
    it('准 / 偏低 / 偏高 三态', () => {
      const ok = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 2 })
      expect(ok.docText()).toContain(tZh('tuner_in_tune'))
      ok.unmount()
      const low = mount({ detectedNote: 'A', detectedFrequency: 440, cents: -30 })
      expect(low.docText()).toContain(tZh('tuner_too_low'))
      low.unmount()
      const high = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 30 })
      expect(high.docText()).toContain(tZh('tuner_too_high'))
      high.unmount()
    })

    it('未检测到频率时三态文案都不显示', () => {
      const p = mount({ detectedNote: '--', detectedFrequency: 0, cents: 0 })
      expect(p.docText()).not.toContain(tZh('tuner_in_tune'))
      expect(p.docText()).not.toContain(tZh('tuner_too_low'))
      expect(p.docText()).not.toContain(tZh('tuner_too_high'))
      p.unmount()
    })
  })

  describe('开关按钮', () => {
    it('未激活时显示「开始」、激活时显示「停止」', () => {
      const off = mount({ tunerActive: false })
      expect(off.docText()).toContain(tZh('tuner_start'))
      expect(off.docText()).not.toContain(tZh('tuner_stop'))
      off.unmount()
      const on = mount({ tunerActive: true })
      expect(on.docText()).toContain(tZh('tuner_stop'))
      on.unmount()
    })

    it('点击回传 onToggleTuner', () => {
      const p = mount({ tunerActive: false })
      const btn = p.allButtons().find((b) => b.textContent?.includes(tZh('tuner_start')))
      p.click(btn)
      expect(p.calls.toggle).toHaveLength(1)
      p.unmount()
    })
  })

  describe('参考频率', () => {
    it('滑块 range 430..450 step 1，当前值 = referenceFrequency', () => {
      const p = mount({ referenceFrequency: 442 })
      const s = document.body.querySelector('[role="slider"]') as HTMLElement
      expect(s.getAttribute('aria-valuemin')).toBe('430')
      expect(s.getAttribute('aria-valuemax')).toBe('450')
      expect(s.getAttribute('aria-valuenow')).toBe('442')
      expect(p.docText()).toContain('442 Hz')
      p.unmount()
    })

    it('拖动回传数组（原样透传，不拆解）', () => {
      const p = mount({ referenceFrequency: 440 })
      const s = document.body.querySelector('[role="slider"]') as HTMLElement
      act(() => {
        s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      })
      expect(p.calls.refFreq).toEqual([[441]])
      p.unmount()
    })
  })

  describe('吉他标准音参考', () => {
    it('六个弦名与标准调弦频率一一对应', () => {
      const p = mount()
      const labels = ['tuner_e6', 'tuner_a5', 'tuner_d4', 'tuner_g3', 'tuner_b2', 'tuner_e1']
      expect(p.docText()).toContain(tZh('tuner_strings'))
      labels.forEach((k, i) => {
        expect(p.docText(), `${k} 名应显示`).toContain(tZh(k))
        expect(p.docText(), `${k} 频率应显示`).toContain(`${STD_STRING_FREQS[i]} Hz`)
      })
      p.unmount()
    })
  })

  describe('无障碍（如实记录现状）', () => {
    it('主显示区是 role=status + aria-live=polite', () => {
      const p = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 0 })
      const block = document.body.querySelector('[role="status"]') as HTMLElement
      expect(block.getAttribute('aria-live')).toBe('polite')
      p.unmount()
    })

    it('aria-label 走 t() 并跟随语言（中英各验一次）', () => {
      // 中文界面
      const zh = mount({ detectedNote: 'A', detectedFrequency: 440, cents: 3 })
      expect(
        (document.body.querySelector('[role="status"]') as HTMLElement).getAttribute('aria-label'),
      ).toBe('检测到 A，偏差 3 音分')
      zh.unmount()
      // 英文界面：占位符 {note} / {cents} 都被替换
      const en = mount({ t: tEn, detectedNote: 'A', detectedFrequency: 440, cents: -3 })
      const label = (document.body.querySelector('[role="status"]') as HTMLElement).getAttribute('aria-label')!
      expect(label).toBe('Detected A, -3 cents off')
      expect(label).not.toContain('{')
      en.unmount()
    })

    it('未检测到时的 aria-label 也跟随语言', () => {
      const zh = mount({ detectedNote: '--', detectedFrequency: 0, cents: 0 })
      expect(
        (document.body.querySelector('[role="status"]') as HTMLElement).getAttribute('aria-label'),
      ).toBe(tZh('tuner_no_pitch_label'))
      zh.unmount()
      const en = mount({ t: tEn, detectedNote: '--', detectedFrequency: 0, cents: 0 })
      expect(
        (document.body.querySelector('[role="status"]') as HTMLElement).getAttribute('aria-label'),
      ).toBe(tEn('tuner_no_pitch_label'))
      en.unmount()
    })
  })
})
