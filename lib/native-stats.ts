// Windows 版本使用 SQLite 数据库的统计 API
import { invoke } from '@tauri-apps/api/core'
import { logger } from './logger'

export interface PracticeStats {
  id?: number
  exercise_type: string
  exercise_detail?: string
  score: number
  duration: number
  accuracy?: number
  notes?: string
  created_at?: string
  // 兼容旧版本的字段
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

// 保存练习统计数据
export async function savePracticeStats(
  stats: Omit<PracticeStats, 'id' | 'created_at'>
): Promise<{ status: string; message: string; id?: number }> {
  try {
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

// 获取所有练习统计数据
export async function getAllPracticeStats(): Promise<PracticeStats[]> {
  try {
    const stats = await invoke<PracticeStats[]>('get_all_practice_stats')
    // 转换字段名以兼容前端显示
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

// 获取当前用户的练习数据
export async function getMyPracticeStats(): Promise<PracticeStats[]> {
  return getAllPracticeStats()
}

// 获取统计数据摘要
export async function getStatsSummary(): Promise<StatsSummary> {
  try {
    return await invoke<StatsSummary>('get_practice_stats_summary')
  } catch (error) {
    logger.error('获取统计摘要失败:', error)
    return {
      total_sessions: 0,
      total_duration: 0,
      average_score: 0,
      average_accuracy: 0,
      last_practice: null,
    }
  }
}

// 获取最近 N 天的练习数据
export async function getRecentStats(days: number = 7): Promise<PracticeStats[]> {
  try {
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

// 按练习类型分组统计
export async function getStatsByExerciseType(): Promise<Record<string, { count: number; avgScore: number; totalDuration: number }>> {
  try {
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

// 删除单条统计记录
export async function deletePracticeStat(id: number): Promise<void> {
  try {
    await invoke('delete_practice_stat', { id })
  } catch (error) {
    logger.error('删除统计数据失败:', error)
    throw error
  }
}

// 清空所有统计数据
export async function clearAllPracticeStats(): Promise<void> {
  try {
    await invoke('clear_all_practice_stats')
  } catch (error) {
    logger.error('清空统计数据失败:', error)
    throw error
  }
}

// 获取用户 ID（Windows 版本返回固定值）
export function getCurrentUserId(): string {
  return 'local_user'
}

// 同步本地备份到服务器（Windows 版本不需要）
export async function syncLocalBackupToServer(): Promise<number> {
  return 0
}
