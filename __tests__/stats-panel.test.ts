/**
 * components/stats-panel.tsx 的契约测试（此前零测试）。
 *
 * 统计面板（4 个时间范围 + 4 种导出 + 总次数/分类计数 + 明细分布 + 近期记录）。
 * 它自己几乎不存状态，全部数据来自 props：`getStatsByTimeRange` 的聚合结果与
 * `recentRecords`。所以**它最容易出的问题不是算错，而是「动了不该动的东西」**：
 *
 *  ① 明细要按次数降序展示 —— 原实现直接 `details.sort(...)`，**原地改写传入的数组**。
 *     而 lib/stats-range.ts 对 range='total' 是直接返回 `stats.total`（同一对象引用，
 *     它自己的测试就断言了这点），那个数组属于 store 且会被持久化到 localStorage。
 *     于是「渲染一次」就把 store 里明细的顺序改掉了 —— 屏幕上看不出差别，但脏了共享数据。
 *     修法：`[...details].sort(...)`。
 *
 *  ② 近期记录里的若干细节是**纯展示契约**，改错不会报错、只会显示错：
 *     · accuracy <= 1 视为小数比例，×100 再显示（0.9 → 90%）
 *     · duration 为 0 时不显示时长
 *     · 项目名从 notes 的「练习项目: xxx」里抽取；抽不到就退回 notes 原文；都没有显示 '-'
 *     · 类型名要同时认英文 key 与中文写法（历史数据两种都有）
 *
 * 如实记录（未改）：面板的类型名表只覆盖 5 个 PracticeType。若聚合结果里出现未收录的键
 * （例如 stats-api 把空类型存成「未知练习」），会渲染出「有数字、但标签为空」的卡片。
 * 本轮只把 5 个已知类型的标签钉住，未扩大处理范围。
 */
import { describe, it, expect } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StatsPanel } from '@/components/stats-panel'
import type { PracticeDetail, PracticeType, StatsTimeRange } from '@/lib/page-stats-types'
import type { PracticeStats as ServerStats } from '@/lib/stats-api'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

/** 翻译桩：直接回显 key，便于断言「用了哪个文案」 */
const T = (k: string) => `[${k}]`

const TYPES: PracticeType[] = ['pitch_finding', 'scale', 'chord_exercise', 'interval', 'chord_progression']
const TYPE_LABEL: Record<PracticeType, string> = {
  pitch_finding: '[nav_practice]',
  scale: '[nav_scale]',
  chord_exercise: '[nav_chord_exercise]',
  interval: '[nav_interval]',
  chord_progression: '[nav_chord]',
}

function agg(over: {
  count?: number
  byType?: Partial<Record<PracticeType, number>>
  byDetail?: Partial<Record<PracticeType, PracticeDetail[]>>
} = {}) {
  const byType = Object.fromEntries(TYPES.map((t) => [t, 0])) as Record<PracticeType, number>
  Object.assign(byType, over.byType ?? {})
  const byDetail = Object.fromEntries(TYPES.map((t) => [t, []])) as Record<string, PracticeDetail[]>
  Object.assign(byDetail, over.byDetail ?? {})
  return { count: over.count ?? 0, byType, byDetail: byDetail as Record<PracticeType, PracticeDetail[]> }
}

function render(opts: {
  range?: StatsTimeRange
  data?: ReturnType<typeof agg>
  records?: Record<string, unknown>[]
} = {}) {
  const calls: StatsTimeRange[] = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(StatsPanel as never, {
        t: T,
        statsTimeRange: opts.range ?? 'total',
        onStatsTimeRangeChange: (v: StatsTimeRange) => calls.push(v),
        getStatsByTimeRange: () => opts.data ?? agg(),
        recentRecords: (opts.records ?? []) as unknown as ServerStats[],
      } as never),
    )
  })
  return {
    container,
    calls,
    text: container.textContent ?? '',
    buttons: [...container.querySelectorAll('button')] as HTMLButtonElement[],
    /** 明细 chip：每个「项目名 + 次数」的圆角标签 */
    chips: [...container.querySelectorAll('span')]
      .filter((s) => s.className.includes('rounded-full'))
      .map((s) => s.textContent ?? ''),
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

describe('明细分布', () => {
  it('按次数降序展示', () => {
    const r = render({
      data: agg({
        count: 15,
        byDetail: {
          chord_exercise: [
            { name: 'A少', count: 1 },
            { name: 'B多', count: 9 },
            { name: 'C中', count: 5 },
          ],
        },
      }),
    })
    expect(r.chips).toEqual(['B多9', 'C中5', 'A少1'])
    r.unmount()
  })

  it('不修改传入的数组（钉住本轮修复：原来是原地 sort）', () => {
    const details: PracticeDetail[] = [
      { name: 'A少', count: 1 },
      { name: 'B多', count: 9 },
      { name: 'C中', count: 5 },
    ]
    const data = agg({ count: 15, byDetail: { chord_exercise: details } })
    const r = render({ data })

    expect(r.chips).toEqual(['B多9', 'C中5', 'A少1'])
    // 入参顺序必须原封不动 —— range='total' 时这个数组就是 store 里会被持久化的数据
    expect(details.map((d) => d.name)).toEqual(['A少', 'B多', 'C中'])
    expect(data.byDetail.chord_exercise).toBe(details)
    r.unmount()
  })

  it('找音（pitch_finding）与音程（interval）不显示明细分组', () => {
    const r = render({
      data: agg({
        byDetail: {
          pitch_finding: [{ name: 'X', count: 3 }],
          interval: [{ name: 'Y', count: 4 }],
          scale: [{ name: '多里安', count: 2 }],
        },
      }),
    })
    expect(r.chips).toEqual(['多里安2'])
    r.unmount()
  })

  it('空明细的分组整块不渲染', () => {
    const r = render({ data: agg({ byDetail: { scale: [], chord_exercise: [{ name: 'Z', count: 1 }] } }) })
    expect(r.chips).toEqual(['Z1'])
    r.unmount()
  })
})

describe('总次数与分类计数', () => {
  it('5 个类型各一张卡，标签取自传入的翻译函数', () => {
    const r = render({ data: agg({ count: 12, byType: { scale: 7 } }) })
    expect(r.text).toContain('12[stats_total_practices]')
    for (const t of TYPES) expect(r.text).toContain(TYPE_LABEL[t])
    expect(r.text).toContain('7[nav_scale]')
    r.unmount()
  })

  it('计数为 0 的类型也显示（用 || 0 兜底）', () => {
    const r = render({ data: agg({ count: 0 }) })
    expect(r.text).toContain('0[stats_total_practices]')
    r.unmount()
  })
})

describe('近期练习记录', () => {
  it('accuracy <= 1 视为比例，×100 显示；已经是百分比则原样', () => {
    const r = render({
      records: [
        { id: 'a', exercise_type: 'scale', accuracy: 0.9, duration: 60, created_at: '2026-09-20 14:05:00' },
        { id: 'b', exercise_type: 'scale', accuracy: 85, duration: 60, created_at: '2026-09-20 14:05:00' },
      ],
    })
    expect(r.text).toContain('90%')
    expect(r.text).toContain('85%')
    r.unmount()
  })

  it('duration 为 0 时不显示时长；有则带秒单位', () => {
    const r = render({
      records: [
        { id: 'a', exercise_type: 'scale', duration: 0, created_at: '2026-09-20 14:05:00' },
        { id: 'b', exercise_type: 'scale', duration: 120, created_at: '2026-09-20 14:05:00' },
      ],
    })
    expect(r.text).toContain('120[stats_duration_sec]')
    // 时长为 0 的行不该出现 —— 注意不能只判 not.toContain('0[stats_duration_sec]')，
    // 因为 "120[stats_duration_sec]" 本身就含这个子串
    expect(r.text.split('[stats_duration_sec]').length - 1, '只应有 1 处时长').toBe(1)
    r.unmount()
  })

  it('项目名从 notes 的「练习项目: xxx」抽取', () => {
    const r = render({
      records: [
        { id: 'a', exercise_type: 'chord_exercise', notes: '练习项目: 大七和弦', created_at: '2026-09-20 14:05:00' },
        { id: 'b', exercise_type: 'chord_exercise', notes: '练习项目： 属七和弦 ', created_at: '2026-09-20 14:05:00' },
      ],
    })
    expect(r.text).toContain('大七和弦')
    expect(r.text).toContain('属七和弦')
    r.unmount()
  })

  it('没有「练习项目:」前缀时退回 notes 原文；notes 也空则显示 -', () => {
    const r = render({
      records: [
        { id: 'a', exercise_type: 'scale', notes: '多里安音阶', created_at: '2026-09-20 14:05:00' },
        { id: 'b', exercise_type: 'scale', notes: '', created_at: '2026-09-20 14:05:00' },
      ],
    })
    expect(r.text).toContain('多里安音阶')
    expect(r.text).toContain('-')
    r.unmount()
  })

  it('类型名同时认英文 key 与中文写法（历史数据两种都有）', () => {
    const cases: Array<[string, string]> = [
      ['chord_exercise', '[nav_chord_exercise]'],
      ['和弦练习', '[nav_chord_exercise]'],
      ['scale', '[nav_scale]'],
      ['音阶练习', '[nav_scale]'],
      ['pitch_finding', '[nav_practice]'],
      ['找音练习', '[nav_practice]'],
      ['interval', '[nav_interval]'],
      ['chord_progression', '[nav_chord]'],
    ]
    const r = render({
      records: cases.map(([et], i) => ({
        id: `r${i}`, exercise_type: et, notes: `练习项目: item${i}`, created_at: '2026-09-20 14:05:00',
      })),
    })
    for (const [, label] of cases) expect(r.text).toContain(label)
    r.unmount()
  })

  it('无记录时显示空提示', () => {
    const r = render({ records: [] })
    expect(r.text).toContain('[stats_recent_empty]')
    r.unmount()
  })
})

describe('空态与时间范围', () => {
  it('count 为 0 时显示无数据占位', () => {
    const r = render({ data: agg({ count: 0 }), records: [] })
    expect(r.text).toContain('[stats_no_data]')
    expect(r.text).toContain('[stats_start_practicing]')
    r.unmount()
  })

  it('8 个按钮：4 个时间范围 + CSV/PDF/JSON/HTML', () => {
    const r = render({})
    expect(r.buttons.map((b) => b.textContent)).toEqual([
      '[stats_today]', '[stats_week]', '[stats_month]', '[stats_total]',
      'CSV', 'PDF', 'JSON', 'HTML',
    ])
    r.unmount()
  })

  it('点击时间范围按钮回传对应值', () => {
    const r = render({})
    const expectRange: StatsTimeRange[] = ['today', 'week', 'month', 'total']
    expectRange.forEach((want, i) => {
      act(() => { r.buttons[i].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    })
    expect(r.calls).toEqual(expectRange)
    r.unmount()
  })

  it('当前选中的范围按钮样式与其它几个不同（且只有一个）', () => {
    const r = render({ range: 'week' })
    const classes = r.buttons.slice(0, 4).map((b) => b.className)
    expect(new Set(classes).size, '应有「选中 / 未选中」两种样式').toBe(2)
    const selected = classes[1] // week 是第 2 个
    expect(classes.filter((c) => c === selected).length).toBe(1)
    r.unmount()
  })
})
