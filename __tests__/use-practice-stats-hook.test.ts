/**
 * hooks/use-practice-stats.ts 的 **hook 层** 契约测试。
 *
 * 聚合纯函数 applyPracticeRecord 已由 __tests__/practice-stats-aggregate.test.ts 覆盖；
 * 本文件补的是它外面那层壳（原覆盖 58%，缺口是 120-169 行整段 hook 体从未挂载）：
 *
 * ① 初始状态与返回面（页面按同名解构使用，少返回一个字段就会静默 undefined）；
 * ② `recordPractice` 的**算分公式** —— 这是真正决定「落库里的 score/duration/accuracy
 *    是多少」的地方，此前零覆盖：
 *      score = round(correct/total*100)，未答题（total=0）记 0（不是 100）；
 *      accuracy 与 score 同源；
 *      duration = 会话已过秒数（无会话 → 60），且最小 1 秒；
 *      显式 opts 三项各自覆盖对应默认值；
 * ③ `pendingSaveRef` 载荷（页面 [practiceStats] effect 靠它落库，写错就是静默丢记录）；
 * ④ **StrictMode 下不得重复计数** —— updater 必须纯，这条只有 StrictMode 包裹才暴露。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { usePracticeStats } from '@/hooks/use-practice-stats'
import { useAppStore } from '@/lib/store'
import { getLocalDateString } from '@/lib/utils'
import type { PracticeStats } from '@/lib/page-stats-types'
import { renderHook, unmountAllHooks } from './helpers/render-hook'

/** 固定“现在”，让 duration 可精确断言 */
const NOW = new Date(2026, 8, 28, 10, 0, 0).getTime()

const mount = (strict = false) => renderHook(() => usePracticeStats(), { strict })

const expectRecord = (stats: PracticeStats) => {
  expect(Object.values(stats.total.byType)).toEqual([0, 0, 0, 0, 0])
  expect(Object.values(stats.total.byDetail)).toEqual([[], [], [], [], []])
}

beforeEach(() => {
  // 只伪造 Date（不动 setTimeout/queueMicrotask）：React 的调度与 store 的 300ms 防抖
  // 都依赖真实定时器，整体 useFakeTimers 会打乱它们。伪造 Date 是为了让
  // `Date.now()`（算时长）与 `new Date()`（算当天日期）落在同一个可控时刻。
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  act(() => {
    useAppStore.setState({ score: { correct: 0, total: 0 } })
  })
})

afterEach(() => {
  unmountAllHooks()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('usePracticeStats：初始状态与返回面', () => {
  it('统计从全 0 起、会话计时未开始、待落库载荷为空', () => {
    const h = mount()

    expect(h.current.practiceStats.total.count).toBe(0)
    expectRecord(h.current.practiceStats)
    expect(h.current.practiceStats.daily).toEqual([])

    expect(h.current.practiceSessionStartTime).toBeNull()
    expect(h.current.practiceElapsedTime).toBe(0)
    expect(h.current.pendingSaveRef.current).toBeNull()
  })

  it('scoreRef 初值镜像 store 里的 score', () => {
    act(() => {
      useAppStore.setState({ score: { correct: 2, total: 5 } })
    })
    const h = mount()
    expect(h.current.scoreRef.current).toEqual({ correct: 2, total: 5 })
  })

  it('返回面完整（页面解构的 9 个键一个都不能少）', () => {
    const h = mount()
    expect(Object.keys(h.current).sort()).toEqual(
      [
        'pendingSaveRef',
        'practiceElapsedTime',
        'practiceSessionStartTime',
        'practiceStats',
        'recordPractice',
        'scoreRef',
        'setPracticeElapsedTime',
        'setPracticeSessionStartTime',
        'setPracticeStats',
      ].sort()
    )
  })

  it('暴露的 setPracticeStats 可直接整体替换（页面加载服务器数据时用）', () => {
    const h = mount()
    const loaded: PracticeStats = {
      daily: [{ date: '2026-09-01', totalCount: 3, byType: { pitch_finding: 0, scale: 3, chord_exercise: 0, interval: 0, chord_progression: 0 }, byDetail: { pitch_finding: [], scale: [{ name: 'A', count: 3 }], chord_exercise: [], interval: [], chord_progression: [] } }],
      total: { count: 9, byType: { pitch_finding: 0, scale: 9, chord_exercise: 0, interval: 0, chord_progression: 0 }, byDetail: { pitch_finding: [], scale: [{ name: 'A', count: 9 }], chord_exercise: [], interval: [], chord_progression: [] } },
    }
    act(() => {
      h.current.setPracticeStats(loaded)
    })
    expect(h.current.practiceStats).toEqual(loaded)
  })
})

describe('recordPractice：算分与时长', () => {
  it('score = round(correct/total*100)，accuracy 与 score 同源；无会话时 duration=60', () => {
    const h = mount()
    act(() => {
      h.current.scoreRef.current = { correct: 3, total: 4 }
    })
    act(() => {
      h.current.recordPractice('scale', 'C 大调音阶')
    })

    expect(h.current.pendingSaveRef.current).toEqual({
      detailName: 'C 大调音阶',
      score: 75,
      duration: 60,
      accuracy: 75,
    })
  })

  it('未答题（total=0）记 0 分，不是“全对”的 100 分', () => {
    const h = mount()
    act(() => {
      h.current.scoreRef.current = { correct: 0, total: 0 }
    })
    act(() => {
      h.current.recordPractice('interval', '大三度')
    })

    expect(h.current.pendingSaveRef.current).toMatchObject({ score: 0, accuracy: 0 })
  })

  it('score 四舍五入到整数（1/3 → 33）', () => {
    const h = mount()
    act(() => {
      h.current.scoreRef.current = { correct: 1, total: 3 }
    })
    act(() => {
      h.current.recordPractice('scale', 'A')
    })
    expect(h.current.pendingSaveRef.current!.score).toBe(33)
  })

  it('已开始的会话：duration = 本段已过秒数 + 之前累计秒数', () => {
    const h = mount()
    act(() => {
      h.current.setPracticeSessionStartTime(NOW - 5000)
      h.current.setPracticeElapsedTime(2)
    })
    act(() => {
      h.current.recordPractice('scale', 'A')
    })
    // 5s（本段）+ 2s（已累计）= 7s
    expect(h.current.pendingSaveRef.current!.duration).toBe(7)
  })

  it('duration 下限为 1 秒（刚开始就结束不会记 0）', () => {
    const h = mount()
    act(() => {
      h.current.setPracticeSessionStartTime(NOW)
    })
    act(() => {
      h.current.recordPractice('scale', 'A')
    })
    expect(h.current.pendingSaveRef.current!.duration).toBe(1)
  })

  it('显式 opts 三项分别覆盖默认值（opts.duration 甚至能压过会话计时）', () => {
    const h = mount()
    act(() => {
      h.current.scoreRef.current = { correct: 10, total: 10 }
      h.current.setPracticeSessionStartTime(NOW - 9000)
    })
    act(() => {
      h.current.recordPractice('chord_progression', '进行 X', { score: 12, duration: 34, accuracy: 56 })
    })

    expect(h.current.pendingSaveRef.current).toEqual({
      detailName: '进行 X',
      score: 12,
      duration: 34,
      accuracy: 56,
    })
  })

  it('只给部分 opts 时，未给的那项仍走默认值', () => {
    const h = mount()
    act(() => {
      h.current.scoreRef.current = { correct: 4, total: 5 }
    })
    act(() => {
      h.current.recordPractice('scale', 'A', { duration: 99 })
    })
    expect(h.current.pendingSaveRef.current).toEqual({
      detailName: 'A',
      score: 80,
      duration: 99,
      accuracy: 80,
    })
  })
})

describe('recordPractice：写入统计与待落库载荷', () => {
  it('同一天同明细连记两次：总计 / 按类型 / 按明细 / 按天都累加', () => {
    const h = mount()
    act(() => {
      h.current.recordPractice('scale', 'C 大调音阶')
    })
    act(() => {
      h.current.recordPractice('scale', 'C 大调音阶')
    })

    const s = h.current.practiceStats
    expect(s.total.count).toBe(2)
    expect(s.total.byType.scale).toBe(2)
    expect(s.total.byDetail.scale).toEqual([{ name: 'C 大调音阶', count: 2 }])
    expect(s.daily).toHaveLength(1)
    expect(s.daily[0].totalCount).toBe(2)
    expect(s.daily[0].byDetail.scale).toEqual([{ name: 'C 大调音阶', count: 2 }])
  })

  it('按天分桶用的是**本地时区**日期（不是 UTC 的 toISOString）', () => {
    // 取本地凌晨 0:30 —— UTC+8 下它的 UTC 日期是「昨天」，正好把两种实现区分开
    const midnightish = new Date(2026, 8, 28, 0, 30)
    vi.setSystemTime(midnightish)
    const expected = getLocalDateString(midnightish)

    const h = mount()
    act(() => {
      h.current.recordPractice('scale', 'A')
    })

    expect(h.current.practiceStats.daily[0].date).toBe(expected)
    // 非 UTC 时区下，必须与 UTC 日期区分开 —— 否则 UTC+8 的凌晨 0-8 点会被记到昨天
    if (midnightish.getTimezoneOffset() !== 0) {
      expect(h.current.practiceStats.daily[0].date).not.toBe(midnightish.toISOString().slice(0, 10))
    }
  })

  it('载荷每次都覆盖上一笔（pendingSaveRef 是单槽，页面 effect 取走即清空）', () => {
    const h = mount()
    act(() => {
      h.current.recordPractice('scale', '第一次')
    })
    expect(h.current.pendingSaveRef.current!.detailName).toBe('第一次')

    act(() => {
      h.current.recordPractice('interval', '第二次')
    })
    expect(h.current.pendingSaveRef.current!.detailName).toBe('第二次')

    // 页面侧取走后自己置 null，下一次 recordPractice 必须重新写入
    h.current.pendingSaveRef.current = null
    act(() => {
      h.current.recordPractice('interval', '第三次')
    })
    expect(h.current.pendingSaveRef.current!.detailName).toBe('第三次')
  })

  it('五个练习类型的明细各自独立累计（含平时用不到的 pitch_finding）', () => {
    const h = mount()
    const types = ['pitch_finding', 'scale', 'chord_exercise', 'interval', 'chord_progression'] as const
    for (const t of types) {
      act(() => {
        h.current.recordPractice(t, `明细-${t}`)
      })
      act(() => {
        h.current.recordPractice(t, `明细-${t}`)
      })
    }

    const s = h.current.practiceStats
    expect(s.total.count).toBe(10)
    for (const t of types) {
      expect(s.total.byType[t], t).toBe(2)
      expect(s.total.byDetail[t], t).toEqual([{ name: `明细-${t}`, count: 2 }])
      expect(s.daily[0].byDetail[t], t).toEqual([{ name: `明细-${t}`, count: 2 }])
    }
    expect(s.daily[0].totalCount).toBe(10)
  })

  it('recordPractice 不碰 score（分数由答题侧负责）', () => {
    const h = mount()
    act(() => {
      useAppStore.setState({ score: { correct: 7, total: 8 } })
    })
    act(() => {
      h.current.recordPractice('scale', 'A')
    })
    expect(useAppStore.getState().score).toEqual({ correct: 7, total: 8 })
  })
})

describe('recordPractice：StrictMode 下的纯度', () => {
  it('StrictMode 包裹时，一次 recordPractice 只计一次', () => {
    const h = mount(true)
    act(() => {
      h.current.recordPractice('scale', 'C 大调音阶')
    })

    // updater 若改写传入的旧 state，StrictMode 双调用后会变成 2
    expect(h.current.practiceStats.total.count).toBe(1)
    expect(h.current.practiceStats.daily[0].totalCount).toBe(1)
    expect(h.current.practiceStats.total.byDetail.scale).toEqual([{ name: 'C 大调音阶', count: 1 }])
  })

  it('StrictMode 下连续三次仍是三次', () => {
    const h = mount(true)
    for (let i = 0; i < 3; i++) {
      act(() => {
        h.current.recordPractice('chord_exercise', '根音+三音')
      })
    }
    expect(h.current.practiceStats.total.count).toBe(3)
    expect(h.current.practiceStats.total.byType.chord_exercise).toBe(3)
    expect(h.current.practiceStats.daily[0].totalCount).toBe(3)
  })
})
