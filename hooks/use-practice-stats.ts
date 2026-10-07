import { useCallback, useRef, useState } from 'react'
import { getLocalDateString, getLocalDaysAgoStart } from '@/lib/utils'
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
 * usePracticeStats
 *
 * 练习统计：状态、会话计时与「记录一次练习」逻辑。
 * 
 * 从 app/page.tsx 原样搬出，逐行搬运、逻辑未改动：
 * - practiceStats：统计聚合状态（总数/按类型/按明细/按天）
 * - practiceSessionStartTime / practiceElapsedTime：会话计时（开始时刻 + 已累计暂停秒数）
 * - scoreRef：score 的镜像 ref，供音高/MIDI 回调读取最新值
 * - pendingSaveRef：待落库载荷（由页面里 [practiceStats] 的 effect 统一落库，
 *   使 recordPractice 的 state updater 保持纯函数）
 * - recordPractice：算分、聚合统计、写 pendingSaveRef
 * 
 * ⚠️ 唯一有意改动：剔除依赖数组里的遗留项 isTauri —— 原 deps 是
 * [practiceSessionStartTime, practiceElapsedTime, isTauri]，但函数体内从未使用 isTauri。
 * 除此之外逐行未改（校验器已把该替换作为「有意修改」归一化，逐行比对结果一致）。
 * 页面通过解构接回同名变量，因此页面正文一行都不用改。
 */
export function usePracticeStats() {
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

  return {
    practiceStats,
    setPracticeStats,
    practiceSessionStartTime,
    setPracticeSessionStartTime,
    practiceElapsedTime,
    setPracticeElapsedTime,
    scoreRef,
    pendingSaveRef,
    recordPractice,
  }
}
