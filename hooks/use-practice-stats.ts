import { useCallback, useEffect, useRef, useState } from 'react'
import { getLocalDateString, getLocalDaysAgoStart, dbTimestampToLocalDate } from '@/lib/utils'
import { STATS_STORAGE_KEYS, clearStatsStorage } from '@/lib/stats-storage-keys'
import { savePracticeStats as saveToServer, getAllPracticeStats, deletePracticeStat, PracticeStats as ServerPracticeStats } from '@/lib/stats-api'
import { deduplicateStats } from '@/lib/export-utils'
import { logger } from '@/lib/logger'
import type { PracticeType, PracticeStats } from '@/lib/page-stats-types'
import { useScore } from '@/lib/store'

const EMPTY_BY_TYPE: Record<PracticeType, number> = {
  pitch_finding: 0,
  scale: 0,
  chord_exercise: 0,
  interval: 0,
  chord_progression: 0,
}

const EMPTY_BY_DETAIL: PracticeStats['total']['byDetail'] = {
  pitch_finding: [],
  scale: [],
  chord_exercise: [],
  interval: [],
  chord_progression: [],
}

/** 复制 byDetail：把每个类型下的明细数组与条目都拷成新对象（避免与旧 state 共享引用） */
function cloneByDetail(byDetail: PracticeStats['total']['byDetail']): PracticeStats['total']['byDetail'] {
  return {
    pitch_finding: byDetail.pitch_finding.map(d => ({ ...d })),
    scale: byDetail.scale.map(d => ({ ...d })),
    chord_exercise: byDetail.chord_exercise.map(d => ({ ...d })),
    interval: byDetail.interval.map(d => ({ ...d })),
    chord_progression: byDetail.chord_progression.map(d => ({ ...d })),
  }
}

/** 在某个类型的明细列表里给该详情 +1（返回新数组，不改原数组） */
function bumpDetail(list: PracticeStats['total']['byDetail'][PracticeType], name: string) {
  const idx = list.findIndex(d => d.name === name)
  if (idx < 0) return [...list, { name, count: 1 }]
  return list.map((d, i) => (i === idx ? { name: d.name, count: d.count + 1 } : d))
}

/**
 * 把「记录一次练习」合并进统计（**纯函数**：不改动 prevStats 的任何层级，返回全新对象）。
 *
 * 必须是纯函数的原因有两条，二者都会因为「浅拷贝后直接改嵌套对象」而失效：
 *  1. React 在 StrictMode 下会双调用 updater 来检测纯度 —— 若 updater 改写了传入的旧 state，
 *     第二次调用会读到已被改过的对象，同一次练习被计两次；
 *  2. 被复用的嵌套对象（如某天的条目）身份不变，按它做 memo 的子树不会更新。
 *
 * 抽成模块级纯函数还有一个好处：聚合逻辑可以脱离 React 直接单测
 * （见 __tests__/practice-stats-aggregate.test.ts）。
 */
export function applyPracticeRecord(
  prevStats: PracticeStats,
  input: { type: PracticeType; detailName: string; today: string }
): PracticeStats {
  const { type, detailName, today } = input

  const total = {
    ...prevStats.total,
    byType: { ...prevStats.total.byType },
    byDetail: cloneByDetail(prevStats.total.byDetail),
  }
  total.count += 1
  total.byType[type] = (total.byType[type] || 0) + 1
  total.byDetail[type] = bumpDetail(total.byDetail[type] || [], detailName)

  // daily 里每个条目都换成新对象（日期条目本身与其 byType/byDetail 都要独立）
  const daily = prevStats.daily.map(d => ({
    ...d,
    byType: { ...d.byType },
    byDetail: cloneByDetail(d.byDetail),
  }))

  let todayStats = daily.find(d => d.date === today)
  if (!todayStats) {
    todayStats = {
      date: today,
      totalCount: 0,
      byType: { ...EMPTY_BY_TYPE },
      byDetail: cloneByDetail(EMPTY_BY_DETAIL),
    }
    daily.push(todayStats)
  }
  todayStats.totalCount += 1
  todayStats.byType[type] = (todayStats.byType[type] || 0) + 1
  todayStats.byDetail[type] = bumpDetail(todayStats.byDetail[type] || [], detailName)

  // 只保留最近90天（按本地时区解析日期，避免 UTC 偏移误删）
  const ninetyDaysAgo = getLocalDaysAgoStart(90)
  const filteredDaily = daily
    .filter(d => {
      const parts = d.date.split('-')
      if (parts.length !== 3) return false
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
      return date >= ninetyDaysAgo
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  return { total, daily: filteredDaily }
}

/**
 * usePracticeStats —— 「练习统计域」的**唯一真相源**。
 *
 * 这个域曾经被劈成两半（state 在这里、加载与落库在 `app/page.tsx`），2026-10-16（C6）
 * 合并回一个文件。必须合并的理由很具体：`pendingSaveRef` 由 `recordPractice` 写、
 * 由落库 effect 读并清空 —— 分开时改任一侧都要同时看另一侧。
 * （铁律 12：同一「量」不许两份判定；换成「同一个域的两处代码」同理。）
 *
 * 装的东西：
 * - practiceStats / recentRecords：聚合状态 + 近期记录（页面把它传给统计面板）
 * - practiceSessionStartTime / practiceElapsedTime：会话计时（开始时刻 + 已累计暂停秒数）
 * - scoreRef：score 的镜像 ref，供音高/MIDI 回调读取最新值
 * - recordPractice：算分、聚合统计、写 pendingSaveRef
 * - pendingSaveRef：**内部**单槽载荷，落库 effect 取走即清空（**不对外暴露**）
 * - 三段 effect：localStorage 缓存版本迁移、从服务器/SQLite 加载、把载荷送后端
 *
 * 🚨 **只暴露「读」，不暴露「写」**：`setPracticeStats` 与 `pendingSaveRef` 都刻意不在返回里 ——
 *    加载与落库都在本 hook 内完成，于是页面不需要第二条写路径。
 *    多一个写出口 = 多一种「统计被另一条路径覆盖」的坏法（与 C4 会话域的同一原则）。
 *
 * 🚨 **`isTauri` 决定两条路径**：
 *    · 加载：Tauri 走 SQLite；Web 走 `getAllPracticeStats()`（失败回落 localStorage 备份）
 *    · 落库：Web 额外写 localStorage 统计缓存；**Tauri 一律不写**（SQLite 是唯一真相源，
 *      写了就会在下次启动被读回 ⇒ 「没练习却有记录」）
 *
 * ⚠️ 历史：旧版搬迁曾剔掉 `recordPractice` deps 里的遗留项 `isTauri`（当时函数体从未使用）；
 *    C6 起 `isTauri` 成为**真正的**入参，用于上面两条路径。
 */
/** 入参：全仓只有 isTauri 一项 —— 它决定统计缓存的读写路径（见文件头）。 */
export interface UsePracticeStatsOptions {
  /** Tauri 环境以 SQLite 为唯一真相源 ⇒ 不读也不写 localStorage 统计缓存 */
  isTauri: boolean
}

export function usePracticeStats(options: UsePracticeStatsOptions) {
  const { isTauri } = options
  const score = useScore()

  const [practiceStats, setPracticeStats] = useState<PracticeStats>({
    daily: [],
    total: {
      count: 0,
      byType: { ...EMPTY_BY_TYPE },
      byDetail: cloneByDetail(EMPTY_BY_DETAIL)
    }
  })
  const [practiceSessionStartTime, setPracticeSessionStartTime] = useState<number | null>(null)
  const [practiceElapsedTime, setPracticeElapsedTime] = useState(0)
  const scoreRef = useRef(score)
  const pendingSaveRef = useRef<{ detailName: string; score: number; duration: number; accuracy: number } | null>(null)
  // 记录练习统计
  // 所有练习 tab 统一为"会话级"记录：会话结束时调用一次，score/duration/accuracy 全部基于真实数据
  // - score: 本次会话得分（0-100），= round(correct/total * 100)，未答题时记 0
  // - duration: 本次会话耗时（秒），= 会话开始至今的时间
  // - accuracy: 准确率（0-100），与 score 同源
  const recordPractice = useCallback((type: PracticeType, detailName: string, opts?: { score?: number; duration?: number; accuracy?: number }) => {
    // 使用本地时区日期，避免 UTC+8 凌晨 0-8 点时今天被记为昨天
    const today = getLocalDateString(new Date())
    
    // 计算真实数据（若未显式传入）
    const currentScore = scoreRef.current
    // score 与 accuracy 同源：答对率 * 100。未答题（total=0）记 0 分，不再硬编码 100
    const realScore = currentScore.total > 0
      ? Math.round((currentScore.correct / currentScore.total) * 100)
      : 0
    const realAccuracy = realScore
    const realDuration = practiceSessionStartTime
      ? Math.max(1, Math.round((Date.now() - practiceSessionStartTime + practiceElapsedTime * 1000) / 1000))
      : 60
    const finalScore = opts?.score ?? realScore
    const finalDuration = opts?.duration ?? realDuration
    const finalAccuracy = opts?.accuracy ?? realAccuracy

    // 记录本次需要持久化的载荷；真正的落库由 [practiceStats] 的 effect 完成
    pendingSaveRef.current = {
      detailName,
      score: finalScore,
      duration: finalDuration,
      accuracy: finalAccuracy,
    }

    // 先计算 newStats（updater 必须是纯函数，副作用移出以避免并发渲染下重复保存）
    setPracticeStats(prevStats => applyPracticeRecord(prevStats, { type, detailName, today }))
  }, [practiceSessionStartTime, practiceElapsedTime])

  // 近期练习记录（从服务器加载，用于统计页展示）
  const [recentRecords, setRecentRecords] = useState<ServerPracticeStats[]>([])

  // 统计数据缓存版本：升级此版本号会自动清除旧的 localStorage 统计缓存
  // 用于修复历史脏数据（如重复记录、错误时区数据等）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const CACHE_VERSION = 'v3-20260716'  // v3: 清除路由器清理后残留的本地缓存
    // P3-3：隐私模式 / 配额超限时 localStorage 读写会抛异常，而 error boundary 拦不住
    // effect 内抛出的异常 ⇒ 整条 effect 崩掉、后续初始化静默不执行。必须整体包 try/catch。
    try {
      const stored = localStorage.getItem(STATS_STORAGE_KEYS.version)
      if (stored !== CACHE_VERSION) {
        localStorage.removeItem(STATS_STORAGE_KEYS.stats)
        localStorage.setItem(STATS_STORAGE_KEYS.version, CACHE_VERSION)
        logger.info('已清除旧的统计数据缓存', { from: stored, to: CACHE_VERSION })
      }
    } catch (e) {
      console.warn('Failed to migrate stats cache version:', e)
    }
  }, [])

  /**
   * 从服务器 / SQLite 重新加载并重算聚合（daily / total / byType / byDetail）。
   *
   * 原先这段只活在挂载 effect 体内 ⇒ 删除单条记录后无法重算（聚合全部由记录派生）。
   * 提成 useCallback 后：挂载 effect 与 deleteRecord 共用同一份实现。
   */
  const reloadStats = useCallback(async () => {
    try {
      const serverStats = await getAllPracticeStats()
      
      const newStats: PracticeStats = {
        daily: [],
        total: {
          count: 0,
          byType: {
            pitch_finding: 0,
            scale: 0,
            chord_exercise: 0,
            interval: 0,
            chord_progression: 0
          },
          byDetail: {
            pitch_finding: [],
            scale: [],
            chord_exercise: [],
            interval: [],
            chord_progression: []
          }
        }
      }
      
      const typeMapping: Record<string, PracticeType> = {
        '音高识别': 'pitch_finding',
        '音阶练习': 'scale',
        '和弦练习': 'chord_exercise',
        '音程练习': 'interval',
        '和弦进行': 'chord_progression'
      }
      
      // 先对服务器返回的数据去重，避免旧版本 bug 产生的脏数据
      // （同一秒内多条同类型记录、或时间差小于 duration 的重复记录）
      // 导致统计虚高（例如"今天没练习却显示练习了"）
      const dedupedServerStats = deduplicateStats(serverStats as ServerPracticeStats[])
      
      dedupedServerStats.forEach((record: ServerPracticeStats) => {
        // 使用 dbTimestampToLocalDate 正确解析 SQLite/ISO 时间戳为本地日期
        // 避免 SQLite 的 "YYYY-MM-DD HH:MM:SS" (UTC) 被错误解析为本地时间
        const date = record.created_at
          ? dbTimestampToLocalDate(record.created_at)
          : getLocalDateString(new Date())
        const type = typeMapping[record.exercise_type] || 'pitch_finding'
        const detailName = record.notes?.replace('练习项目: ', '') || record.exercise_type
        
        newStats.total.count += 1
        newStats.total.byType[type] = (newStats.total.byType[type] || 0) + 1
        
        const detailList = newStats.total.byDetail[type] || []
        const existingDetail = detailList.find(d => d.name === detailName)
        if (existingDetail) {
          existingDetail.count += 1
        } else {
          detailList.push({ name: detailName, count: 1 })
        }
        newStats.total.byDetail[type] = detailList
        
        let todayStats = newStats.daily.find(d => d.date === date)
        if (!todayStats) {
          todayStats = {
            date: date,
            totalCount: 0,
            byType: {
              pitch_finding: 0,
              scale: 0,
              chord_exercise: 0,
              interval: 0,
              chord_progression: 0
            },
            byDetail: {
              pitch_finding: [],
              scale: [],
              chord_exercise: [],
              interval: [],
              chord_progression: []
            }
          }
          newStats.daily.push(todayStats)
        }
        
        todayStats.totalCount += 1
        todayStats.byType[type] = (todayStats.byType[type] || 0) + 1
        
        const todayDetailList = todayStats.byDetail[type] || []
        const todayExistingDetail = todayDetailList.find(d => d.name === detailName)
        if (todayExistingDetail) {
          todayExistingDetail.count += 1
        } else {
          todayDetailList.push({ name: detailName, count: 1 })
        }
        todayStats.byDetail[type] = todayDetailList
      })
      
      // 只保留最近90天的数据
      newStats.daily = newStats.daily
        .filter(d => {
          // 使用本地时区解析日期，避免 UTC 偏移导致数据被误删
          const parts = d.date.split('-')
          if (parts.length !== 3) return false
          const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
          const ninetyDaysAgo = getLocalDaysAgoStart(90)
          return date >= ninetyDaysAgo
        })
        .sort((a, b) => b.date.localeCompare(a.date))
      
      setPracticeStats(newStats)
      
      // 保存去重后的近期记录（最多 50 条，按时间倒序），供统计页展示
      setRecentRecords(dedupedServerStats.slice(0, 50))

      // Tauri 环境以 SQLite 为唯一真相源，不写入 localStorage，避免历史脏数据污染
      if (!isTauri) {
        // 服务器记录为 0 时（例如管理员清空了数据库），同步清空 localStorage 旧缓存
        if (dedupedServerStats.length === 0) {
          clearStatsStorage()
        } else {
          localStorage.setItem(STATS_STORAGE_KEYS.stats, JSON.stringify(newStats))
        }
      }
    } catch (e) {
      console.error('Failed to load stats:', e)
      // Tauri 环境失败时返回空统计，不读 localStorage 备份（避免历史脏数据导致"未练习却有记录"）
      if (!isTauri) {
        const savedStats = localStorage.getItem(STATS_STORAGE_KEYS.stats)
        if (savedStats) {
          try {
            const stats = JSON.parse(savedStats)
            setPracticeStats(stats)
          } catch (e) {
            console.error('Failed to load stats from localStorage:', e)
          }
        }
      }
    }
  }, [isTauri])

  // 从服务器/SQLite加载统计数据
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Tauri 环境首次运行：清理历史 localStorage 备份，避免从 Web 版迁移或早期版本遗留的脏数据
    // 被错误加载（导致"未使用却显示练习记录"）
    // 仅首次运行执行（用 CLEANED_FLAG 标记），避免每次启动都清掉当次未保存的会话
    const CLEANED_FLAG = 'fretmaster-tauri-localstorage-cleaned'
    if (isTauri && !localStorage.getItem(CLEANED_FLAG)) {
      try {
        // P3-11：两个键名统一由 clearStatsStorage() 清理（历史上此处漏过一个键 ⇒ 留脏数据）
        clearStatsStorage()
        localStorage.setItem(CLEANED_FLAG, '1')
      } catch (e) {
        console.warn('Failed to clean legacy localStorage stats:', e)
      }
    }

    
    reloadStats()
  }, [isTauri, reloadStats])

  /**
   * 删除**单条**练习记录，然后重算聚合。
   *
   * 顺序要紧：先等后端删除成功，再 reloadStats —— 反过来会让「刚删的记录」在重算里复活。
   * 失败时把错误抛给调用方（面板负责提示），不在这里吞掉。
   */
  const deleteRecord = useCallback(async (id: number) => {
    await deletePracticeStat(id)
    await reloadStats()
  }, [reloadStats])


  // 待持久化的统计载荷。放在 ref 中，由 [practiceStats] 的 effect 统一落库，
  // 使 recordPractice 的 state updater 保持纯函数（并发渲染下不会重复保存）。

  // 练习统计持久化（副作用集中在此 effect）：
  // - 移出 state updater，避免并发渲染下 updater 重复执行导致重复保存
  // - localStorage 写入加 try-catch，避免配额超限抛异常中断后续的 saveToServer
  useEffect(() => {
    const payload = pendingSaveRef.current
    if (!payload || typeof window === 'undefined') return
    pendingSaveRef.current = null

    if (!isTauri) {
      try {
        localStorage.setItem(STATS_STORAGE_KEYS.stats, JSON.stringify(practiceStats))
      } catch (e) {
        logger.error('保存练习统计到 localStorage 失败（可能超出配额）:', e)
      }
    }

    saveToServer({
      exercise_type: payload.detailName,
      score: payload.score,
      duration: payload.duration,
      accuracy: payload.accuracy,
      notes: `练习项目: ${payload.detailName}`
    }).catch(err => console.error('保存到服务器失败:', err))
  }, [practiceStats, isTauri, pendingSaveRef])

  return {
    practiceStats,
    deleteRecord,
    recentRecords,
    practiceSessionStartTime,
    setPracticeSessionStartTime,
    practiceElapsedTime,
    setPracticeElapsedTime,
    scoreRef,
    recordPractice,
  }
}
