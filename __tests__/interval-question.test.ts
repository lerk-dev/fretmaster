/**
 * IntervalQuestion —— 音程练习题目展示契约测试
 *
 * 纯展示的受控组件（数据全来自 props，无回调），memo 包裹。
 * 用户在做音程练习时全靠它知道「现在是第几题、要弹什么、哪些音已经弹过」。
 *
 * 本轮验证的两处「像 bug 其实不是」：
 *  ① 顶部进度 `index/length` 看着像 0-based —— 追进 `useIntervalExercise` 后确认：
 *     `setIntervalCurrentQueueIndex(nextIndex + 1)` 是在生成题目**之后**执行的，
 *     所以首题渲染时已是 1，语义是「已生成数」，显示 1/N … N/N，正确。
 *  ② `completedIntervals` 存的是 `currentIntervalDisplay.split(' ')` 的下标，
 *     组件用同一个 split 的 idx 去 includes —— 两处对齐，无 off-by-one。
 *
 * ⚠️ 另发现（未改，仅记录）：props 里的 `rootNote` / `targetNote` **完全没被使用** ——
 * 组件显示的是 `currentIntervalExercise.rootNote / .targetNote`（题目自己的快照）。
 * 这个选择其实更正确（答题中途改根音设置不该改掉当前题目），但两个 props 是死参数，
 * 而 app/page.tsx:4879-4880 仍在传。删字段会改公开 props，故本轮只加断言钉住。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React, { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { IntervalQuestion } from '@/components/interval-question'
import { INTERVALS } from '@/lib/page-theory-data'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** 直接取自组件 props，避免与 hook 的内联类型漂移 */
type Exercise = React.ComponentProps<typeof IntervalQuestion>['currentIntervalExercise']

function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    rootNote: 'C',
    interval: { name: 'Major Third', symbol: '3', semitones: 4 },
    targetNote: 'E',
    allIntervals: [
      { name: 'Major Third', symbol: '3', semitones: 4 },
      { name: 'Perfect Fifth', symbol: '5', semitones: 7 },
    ],
    currentIntervalDisplay: '3',
    completedIntervals: [],
    answered: false,
    ...over,
  } as Exercise
}

type Props = Record<string, unknown>
let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(props: Props = {}) {
  const base: Props = {
    t,
    currentIntervalExercise: exercise(),
    rootNote: 'C',
    targetNote: 'E',
    intervalDirection: 'up',
    intervalExerciseQueue: [4, 7, 9, 11],
    intervalCurrentQueueIndex: 1,
    timeLeft: 125,
    formatTime: fmtTime,
    ...props,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(IntervalQuestion as never, base as never))
  })
  const text = () => container!.textContent ?? ''
  /** 大号根音（text-6xl） */
  const rootBig = () => {
    const el = [...container!.querySelectorAll('div')].find((d) =>
      (d as HTMLElement).className.includes('text-6xl'),
    ) as HTMLElement
    expect(el, '根音大字应存在').toBeTruthy()
    return el.textContent
  }
  /** 当前题目那行（text-4xl）里的 span 列表 */
  const questionSpans = () => {
    const el = [...container!.querySelectorAll('div')].find((d) =>
      (d as HTMLElement).className.includes('text-4xl'),
    ) as HTMLElement
    expect(el, '题目行应存在').toBeTruthy()
    return [...el.querySelectorAll('span')] as HTMLElement[]
  }
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { rootEl: () => container!, text, rootBig, questionSpans, unmount }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('IntervalQuestion', () => {
  describe('顶部信息栏', () => {
    it('显示格式化后的剩余时间', () => {
      const p = mount({ timeLeft: 125 })
      expect(p.text()).toContain('2:05')
      p.unmount()
    })

    it('方向箭头：up ↑ / down ↓ / either ↕ / random 🔀', () => {
      const cases: [string, string][] = [
        ['up', '↑'],
        ['down', '↓'],
        ['either', '↕'],
        ['random', '🔀'],
      ]
      for (const [dir, arrow] of cases) {
        const p = mount({ intervalDirection: dir })
        expect(p.text(), `direction=${dir}`).toContain(`${t('direction')}: ${arrow}`)
        p.unmount()
      }
    })

    it('未知方向值落到 🔀 兜底', () => {
      const p = mount({ intervalDirection: 'weird' })
      expect(p.text()).toContain('🔀')
      p.unmount()
    })

    it('队列进度显示 index/length（下标语义是「已生成数」，首题为 1/N）', () => {
      const p = mount({ intervalCurrentQueueIndex: 1, intervalExerciseQueue: [4, 7, 9, 11] })
      expect(p.text()).toContain('1/4')
      p.unmount()
      const last = mount({ intervalCurrentQueueIndex: 4, intervalExerciseQueue: [4, 7, 9, 11] })
      expect(last.text()).toContain('4/4')
      last.unmount()
    })
  })

  describe('根音与音程', () => {
    it('根音经 normalizeNoteName（Db → D♭）', () => {
      const p = mount({ currentIntervalExercise: exercise({ rootNote: 'Db' }) })
      expect(p.rootBig()).toBe('D♭')
      p.unmount()
    })

    it('「所有已选音程」一行按 formatDegree 渲染并用空格连接', () => {
      const p = mount({
        currentIntervalExercise: exercise({
          allIntervals: [
            { name: 'Minor Third', symbol: 'b3', semitones: 3 },
            { name: 'Perfect Fifth', symbol: '5', semitones: 7 },
            { name: 'Major Seventh', symbol: '7', semitones: 11 },
          ],
        }),
      })
      expect(p.text()).toContain('♭3 5 7')
      p.unmount()
    })

    it('当前题目串按空格拆成多个 span，每个都过 formatDegree', () => {
      const p = mount({
        currentIntervalExercise: exercise({ currentIntervalDisplay: '1 b3' }),
      })
      const spans = p.questionSpans()
      expect(spans.map((s) => s.textContent)).toEqual(['1', '♭3'])
      p.unmount()
    })

    it('findRootFirst + addRootBack 的 "1 3 3 1" 会渲染成 4 个 span', () => {
      const p = mount({
        currentIntervalExercise: exercise({ currentIntervalDisplay: '1 3 3 1' }),
      })
      expect(p.questionSpans()).toHaveLength(4)
      p.unmount()
    })
  })

  describe('已完成音程标记', () => {
    it('completedIntervals 里的下标加删除线并变暗，其余不加', () => {
      const p = mount({
        currentIntervalExercise: exercise({
          currentIntervalDisplay: '1 3 3 1',
          completedIntervals: [0, 3],
        }),
      })
      const [s0, s1, s2, s3] = p.questionSpans()
      expect(s0.className).toContain('line-through')
      expect(s0.className).toContain('text-muted-foreground')
      expect(s1.className).not.toContain('line-through')
      expect(s2.className).not.toContain('line-through')
      expect(s3.className).toContain('line-through')
      p.unmount()
    })

    it('completedIntervals 为空时没有任何删除线', () => {
      const p = mount({
        currentIntervalExercise: exercise({ currentIntervalDisplay: '1 3 3 1', completedIntervals: [] }),
      })
      expect(p.questionSpans().every((s) => !s.className.includes('line-through'))).toBe(true)
      p.unmount()
    })

    it('越界下标不会误标（只按 span 实际数量生效）', () => {
      const p = mount({
        currentIntervalExercise: exercise({ currentIntervalDisplay: '3', completedIntervals: [9] }),
      })
      expect(p.questionSpans()).toHaveLength(1)
      expect(p.questionSpans()[0].className).not.toContain('line-through')
      p.unmount()
    })
  })

  describe('答案提示', () => {
    it('未作答时不显示目标音', () => {
      const p = mount({ currentIntervalExercise: exercise({ answered: false, targetNote: 'E' }) })
      const spans = p.rootEl().querySelectorAll('.text-green-600')
      expect(spans).toHaveLength(0)
      p.unmount()
    })

    it('作答后显示题目自己的 targetNote（原样，不过 normalizeNoteName）', () => {
      const p = mount({ currentIntervalExercise: exercise({ answered: true, targetNote: 'E' }) })
      const el = p.rootEl().querySelector('.text-green-600')
      expect(el?.textContent).toBe('E')
      p.unmount()
    })
  })

  describe('钉住「未被使用的 props」', () => {
    it('顶层 rootNote / targetNote 是死参数：显示的是题目自己的快照', () => {
      const p = mount({
        currentIntervalExercise: exercise({ rootNote: 'G', targetNote: 'B', answered: true }),
        // 故意传无关值
        rootNote: 'ZZZ',
        targetNote: 'QQQ',
      })
      expect(p.text()).not.toContain('ZZZ')
      expect(p.text()).not.toContain('QQQ')
      expect(p.rootBig()).toBe('G')
      expect(p.rootEl().querySelector('.text-green-600')?.textContent).toBe('B')
      p.unmount()
    })
  })

  describe('真实音程表抽样', () => {
    it('用 INTERVALS 里的真实 symbol 渲染不出 ASCII 变音记号', () => {
      const p = mount({
        currentIntervalExercise: exercise({
          allIntervals: INTERVALS.slice(0, 12),
          currentIntervalDisplay: INTERVALS.slice(0, 12).map((i) => i.symbol).join(' '),
        }),
      })
      const all = p.text()
      // 有变音的音程应显示 ♭/♯ 而非 b/#
      const symbols = INTERVALS.slice(0, 12).map((i) => i.symbol)
      expect(symbols.some((s) => /[b#]/.test(s))).toBe(true)
      expect(all).not.toMatch(/[0-9][b#][0-9]/)
      p.unmount()
    })
  })
})
