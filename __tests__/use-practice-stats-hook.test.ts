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
import { STATS_STORAGE_KEYS } from '@/lib/stats-storage-keys'
import { savePracticeStats, getAllPracticeStats } from '@/lib/stats-api'
import type { PracticeStats } from '@/lib/page-stats-types'
import { renderHook, unmountAllHooks } from './helpers/render-hook'

/**
 * 🚨 C6（2026-10-16）：把 stats-api 换成替身。
 *
 * 「从服务器加载」与「落库」两段 effect 原本在 `app/page.tsx`，本文件挂不到它们；
 * 现在它们并进了 hook ⇒ 每次 mount 都会真的走到这里：
 *   · `getAllPracticeStats()` 在 jsdom 下因 hostname=localhost 走 `getLocalBackup()`，
 *     本来就不发请求，但返回值不可控 ⇒ 换成确定性的 `[]`；
 *   · `savePracticeStats()` 会 `fetch('/cgi-bin/stats')` ⇒ **真会打网络**，必须替身。
 *
 * 顺带的好处：落库参数变成**可断言**的 —— 断言「送进后端的载荷」比断言
 * 「内部 ref 里的中间态」更贴近真实契约（后者正是本轮 9 条用例要改口径的原因）。
 */
vi.mock('@/lib/stats-api', () => ({
  savePracticeStats: vi.fn(() => Promise.resolve({ status: 'ok', message: '' })),
  getAllPracticeStats: vi.fn(() => Promise.resolve([])),
}))

/** 固定“现在”，让 duration 可精确断言 */
const NOW = new Date(2026, 8, 28, 10, 0, 0).getTime()

/**
 * 2026-10-16（C6）：hook 的入参从「无参」变为 `{ isTauri }` —— 加载/持久化两段 effect
 * 从 `app/page.tsx` 并了进来，它们都要按环境选读写路径。
 * 本文件一律传 `isTauri: false`（jsdom 走 Web 分支；且 hostname 是 localhost ⇒
 * `getAllPracticeStats()` 直接读本地备份，**不会真的发请求**）。
 */
const mount = (strict = false) => renderHook(() => usePracticeStats({ isTauri: false }), { strict })

/** Tauri 分支：验证「SQLite 是唯一真相源」（不读也不写 localStorage 统计缓存） */
const mountTauri = () => renderHook(() => usePracticeStats({ isTauri: true }))

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
  // mockClear 只清「调用记录」，不动 mock 实现（默认仍是 resolve 空值）
  vi.mocked(savePracticeStats).mockClear()
  vi.mocked(getAllPracticeStats).mockClear()
  localStorage.clear()
  act(() => {
    useAppStore.setState({ score: { correct: 0, total: 0 } })
  })
})

afterEach(() => {
  unmountAllHooks()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  document.body.innerHTML = ''
})

/** 取「最近一次送进后端的载荷」—— 原实现断言的是内部 ref，现在改断言真实落库出口 */
const lastSaved = () => {
  const calls = vi.mocked(savePracticeStats).mock.calls
  expect(calls.length, '没有任何一次落库调用').toBeGreaterThan(0)
  return calls[calls.length - 1][0]
}

describe('usePracticeStats：初始状态与返回面', () => {
  it('统计从全 0 起、会话计时未开始、且挂载本身不触发落库', () => {
    const h = mount()

    expect(h.current.practiceStats.total.count).toBe(0)
    expectRecord(h.current.practiceStats)
    expect(h.current.practiceStats.daily).toEqual([])

    expect(h.current.practiceSessionStartTime).toBeNull()
    expect(h.current.practiceElapsedTime).toBe(0)

    // 落库只由 recordPractice 写 pendingSaveRef 触发；单纯挂载不该产生任何后端写入
    expect(vi.mocked(savePracticeStats), '挂载就落库 ⇒ 会凭空多记录').not.toHaveBeenCalled()
    // 反向钉子：加载路径**必须**被调用过（否则本用例对「挂载不落库」的保证毫无意义）
    expect(vi.mocked(getAllPracticeStats), '挂载时没走加载路径 —— 加载 effect 被删了？').toHaveBeenCalled()
  })

  it('scoreRef 初值镜像 store 里的 score', () => {
    act(() => {
      useAppStore.setState({ score: { correct: 2, total: 5 } })
    })
    const h = mount()
    expect(h.current.scoreRef.current).toEqual({ correct: 2, total: 5 })
  })

  it('返回面完整：页面解构的 8 个键一个都不能少', () => {
    const h = mount()
    expect(Object.keys(h.current).sort()).toEqual(
      [
        'practiceElapsedTime',
        'practiceSessionStartTime',
        'practiceStats',
        'recentRecords',
        'recordPractice',
        'scoreRef',
        'setPracticeElapsedTime',
        'setPracticeSessionStartTime',
      ].sort()
    )
  })

  it('🚨 不暴露「写」出口：加载与落库都在 hook 内完成，页面拿不到第二条写路径', () => {
    // C6 之前页面需要 `setPracticeStats`（自己加载服务器数据）与 `pendingSaveRef`（自己落库），
    // 现在两件事都在 hook 里 ⇒ 这两个出口已无消费者，**刻意不再返回**：
    // 多一个写出口就多一种「统计被另一条路径覆盖」的坏法（与 C4 的会话域同一原则）。
    const keys = Object.keys(mount().current) as string[]
    expect(keys, 'setPracticeStats 又暴露出来了 —— 页面会绕过 hook 直接覆盖统计').not.toContain('setPracticeStats')
    expect(keys, 'pendingSaveRef 又暴露出来了 —— 落库路径会被劈成两条').not.toContain('pendingSaveRef')
  })

  it('从服务器加载的结果会灌进 practiceStats，近期记录也一并接回', async () => {
    // createdAt 的时区口径由 dbTimestampToLocalDate 负责（SQLite 里是 UTC 的 "YYYY-MM-DD HH:MM:SS"）
    vi.mocked(getAllPracticeStats).mockResolvedValueOnce([
      {
        exercise_type: '音阶练习',
        score: 80,
        duration: 60,
        accuracy: 80,
        notes: '练习项目: A',
        created_at: '2026-09-28 02:00:00',
      },
    ])

    const h = mount()
    // 加载 effect 是 async（await getAllPracticeStats）⇒ 必须把微任务 flush 掉
    await act(async () => {})

    expect(h.current.practiceStats.total.count).toBe(1)
    expect(h.current.practiceStats.total.byType.scale).toBe(1)
    expect(h.current.practiceStats.total.byDetail.scale).toEqual([{ name: 'A', count: 1 }])
    expect(h.current.practiceStats.daily[0].totalCount).toBe(1)
    // recentRecords 是页面传给统计面板的那一条链
    expect(h.current.recentRecords).toHaveLength(1)
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

    // 断言的是「真的送进后端的那一笔」（C6 起落库 effect 在 hook 内部）
    expect(lastSaved()).toEqual({
      exercise_type: 'C 大调音阶',
      score: 75,
      duration: 60,
      accuracy: 75,
      notes: '练习项目: C 大调音阶',
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

    expect(lastSaved()).toMatchObject({ score: 0, accuracy: 0 })
  })

  it('score 四舍五入到整数（1/3 → 33）', () => {
    const h = mount()
    act(() => {
      h.current.scoreRef.current = { correct: 1, total: 3 }
    })
    act(() => {
      h.current.recordPractice('scale', 'A')
    })
    expect(lastSaved().score).toBe(33)
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
    expect(lastSaved().duration).toBe(7)
  })

  it('duration 下限为 1 秒（刚开始就结束不会记 0）', () => {
    const h = mount()
    act(() => {
      h.current.setPracticeSessionStartTime(NOW)
    })
    act(() => {
      h.current.recordPractice('scale', 'A')
    })
    expect(lastSaved().duration).toBe(1)
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

    expect(lastSaved()).toMatchObject({
      exercise_type: '进行 X',
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
    expect(lastSaved()).toMatchObject({
      exercise_type: 'A',
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

  it('每次 recordPractice 都独立落库一次（单槽载荷被取走后仍能再写）', () => {
    // 原用例断言的「payload 覆盖上一笔」是内部 ref 的中间态；C6 起落库 effect 就在 hook 里
    // 同步把载荷取走并清空 ⇒ 直接断言「三次记录 = 三次后端写入、顺序与内容各自正确」，
    // 它覆盖了原来那条用例的全部价值（取走即清空 ⇒ 下一次必须重新写入），且更贴近真实契约。
    const h = mount()
    act(() => {
      h.current.recordPractice('scale', '第一次')
    })
    act(() => {
      h.current.recordPractice('interval', '第二次')
    })
    act(() => {
      h.current.recordPractice('interval', '第三次')
    })

    const calls = vi.mocked(savePracticeStats).mock.calls.map((c) => c[0]!)
    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.exercise_type)).toEqual(['第一次', '第二次', '第三次'])
    expect(calls.every((c) => c.notes?.startsWith('练习项目: ') === true)).toBe(true)
  })

  it('Web 落库时顺带写 localStorage；Tauri 不写（SQLite 是唯一真相源）', () => {
    localStorage.clear()
    const web = mount()
    act(() => {
      web.current.recordPractice('scale', 'A')
    })
    expect(localStorage.getItem(STATS_STORAGE_KEYS.stats), 'Web 分支没写 localStorage ⇒ 刷新后统计丢失').not.toBeNull()

    localStorage.clear()
    const desktop = mountTauri()
    act(() => {
      desktop.current.recordPractice('scale', 'A')
    })
    expect(
      localStorage.getItem(STATS_STORAGE_KEYS.stats),
      'Tauri 分支写了 localStorage ⇒ 历史脏数据会在下次启动被读回（「没练习却有记录」的来源）',
    ).toBeNull()
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
