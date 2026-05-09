import { logger } from './logger'

const isTauri = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__
}

async function getInvoke() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke
}

export interface PracticeStats {
  id?: number
  exercise_type: string
  exercise_detail?: string
  score: number
  duration: number
  accuracy?: number
  notes?: string
  created_at?: string
  date?: string
  exerciseType?: string
}

export interface StatsSummary {
  total_sessions: number
  total_duration: number
  average_score: number
  average_accuracy: number
  last_practice: string | null
}

export interface ExerciseTypeStats {
  exercise_type: string
  count: number
  avg_score: number
  total_duration: number
}

export async function savePracticeStats(
  stats: Omit<PracticeStats, 'id' | 'created_at'>
): Promise<{ status: string; message: string; id?: number }> {
  if (!isTauri()) {
    throw new Error('Not in Tauri environment')
  }
  try {
    const invoke = await getInvoke()
    const id = await invoke<number>('save_practice_stats', {
      exerciseType: stats.exercise_type || stats.exerciseType || '未知练习',
      exerciseDetail: stats.exercise_detail,
      score: stats.score,
      duration: stats.duration,
      accuracy: stats.accuracy,
      notes: stats.notes,
    })
    
    return { status: 'success', message: '已保存到本地数据库', id: Number(id) }
  } catch (error) {
    logger.error('保存统计数据失败:', error)
    throw error
  }
}

export async function getAllPracticeStats(): Promise<PracticeStats[]> {
  if (!isTauri()) return []
  try {
    const invoke = await getInvoke()
    const stats = await invoke<PracticeStats[]>('get_all_practice_stats')
    return stats.map(item => ({
      ...item,
      date: item.created_at,
      exerciseType: item.exercise_type,
    }))
  } catch (error) {
    logger.error('获取统计数据失败:', error)
    return []
  }
}

export async function getMyPracticeStats(): Promise<PracticeStats[]> {
  return getAllPracticeStats()
}

export async function getStatsSummary(): Promise<StatsSummary> {
  if (!isTauri()) {
    return { total_sessions: 0, total_duration: 0, average_score: 0, average_accuracy: 0, last_practice: null }
  }
  try {
    const invoke = await getInvoke()
    return await invoke<StatsSummary>('get_practice_stats_summary')
  } catch (error) {
    logger.error('获取统计摘要失败:', error)
    return { total_sessions: 0, total_duration: 0, average_score: 0, average_accuracy: 0, last_practice: null }
  }
}

export async function getRecentStats(days: number = 7): Promise<PracticeStats[]> {
  if (!isTauri()) return []
  try {
    const invoke = await getInvoke()
    const stats = await invoke<PracticeStats[]>('get_recent_practice_stats', { days })
    return stats.map(item => ({
      ...item,
      date: item.created_at,
      exerciseType: item.exercise_type,
    }))
  } catch (error) {
    logger.error('获取最近统计数据失败:', error)
    return []
  }
}

export async function getStatsByExerciseType(): Promise<Record<string, { count: number; avgScore: number; totalDuration: number }>> {
  if (!isTauri()) return {}
  try {
    const invoke = await getInvoke()
    const stats = await invoke<ExerciseTypeStats[]>('get_stats_by_exercise_type')
    const grouped: Record<string, { count: number; avgScore: number; totalDuration: number }> = {}
    
    stats.forEach(s => {
      grouped[s.exercise_type] = {
        count: s.count,
        avgScore: Math.round(s.avg_score * 100) / 100,
        totalDuration: s.total_duration,
      }
    })
    
    return grouped
  } catch (error) {
    logger.error('获取分类统计失败:', error)
    return {}
  }
}

export async function deletePracticeStat(id: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('delete_practice_stat', { id })
  } catch (error) {
    logger.error('删除统计数据失败:', error)
    throw error
  }
}

export async function clearAllPracticeStats(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('clear_all_practice_stats')
  } catch (error) {
    logger.error('清空统计数据失败:', error)
    throw error
  }
}

export function getCurrentUserId(): string {
  return 'local_user'
}

export async function syncLocalBackupToServer(): Promise<number> {
  return 0
}
