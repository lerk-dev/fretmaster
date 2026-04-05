// SQLite 版本统计数据 API 模块
// 用于与路由器上的 CGI API 交互，支持多设备共享

import { logger } from './logger'

const API_BASE_URL = '/cgi-bin';

// 使用统一的用户标识，所有设备共享同一个用户数据
const USER_ID = 'fretmaster_user';

// 获取用户标识（所有设备使用相同的标识）
function getUserId(): string {
  return USER_ID;
}

export interface PracticeStats {
  id?: number;
  device_id?: string;
  exercise_type: string;
  score: number;
  duration: number;
  accuracy?: number;
  notes?: string;
  created_at?: string;
  // 兼容旧版本的字段
  date?: string;
  exerciseType?: string;
}

// 保存练习数据到路由器
export async function savePracticeStats(
  stats: Omit<PracticeStats, 'id' | 'created_at' | 'device_id'>
): Promise<{ status: string; message: string; id?: number }> {
  const userId = getUserId();
  
  // 转换字段名以匹配 API 期望的格式
  const data = {
    device_id: userId,  // 所有设备使用相同的用户标识
    exercise_type: stats.exercise_type || stats.exerciseType || '未知练习',
    score: stats.score,
    duration: stats.duration,
    accuracy: stats.accuracy,
    notes: stats.notes || '',
  };

  try {
    const response = await fetch(`${API_BASE_URL}/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    // 同时保存到本地备份
    const backupData: PracticeStats = {
      ...data,
      id: result.id,
      created_at: new Date().toISOString(),
      date: new Date().toISOString(),
      exerciseType: data.exercise_type,
    };
    saveToLocalBackup(backupData);
    
    return result;
  } catch (error) {
    logger.error('保存统计数据失败:', error);
    // 如果网络请求失败，保存到本地 LocalStorage 作为备份
    const backupData: PracticeStats = {
      ...data,
      created_at: new Date().toISOString(),
      date: new Date().toISOString(),
      exerciseType: data.exercise_type,
    };
    saveToLocalBackup(backupData);
    throw error;
  }
}

// 从路由器获取所有练习数据（所有设备共享）
export async function getAllPracticeStats(): Promise<PracticeStats[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/stats`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // 转换字段名以兼容前端显示
    const formatted = Array.isArray(data) ? data.map(item => ({
      ...item,
      date: item.created_at,
      exerciseType: item.exercise_type,
    })) : [];
    
    return formatted;
  } catch (error) {
    logger.error('获取统计数据失败:', error);
    // 如果网络请求失败，返回本地备份数据
    return getLocalBackup();
  }
}

// 获取当前用户的练习数据（所有设备共享）
export async function getMyPracticeStats(): Promise<PracticeStats[]> {
  // 获取所有记录，因为所有设备使用相同的用户标识
  return getAllPracticeStats();
}

// 获取统计数据摘要
export async function getStatsSummary() {
  const stats = await getAllPracticeStats();
  
  if (stats.length === 0) {
    return {
      totalSessions: 0,
      totalDuration: 0,
      averageScore: 0,
      averageAccuracy: 0,
      lastPractice: null,
    };
  }

  const totalSessions = stats.length;
  const totalDuration = stats.reduce((sum, s) => sum + (s.duration || 0), 0);
  const averageScore = stats.reduce((sum, s) => sum + (s.score || 0), 0) / totalSessions;
  const averageAccuracy = stats.reduce((sum, s) => sum + (s.accuracy || 0), 0) / totalSessions;
  const lastPractice = stats[0]?.created_at || stats[0]?.date;

  return {
    totalSessions,
    totalDuration,
    averageScore: Math.round(averageScore * 100) / 100,
    averageAccuracy: Math.round(averageAccuracy * 100) / 100,
    lastPractice,
  };
}

// 获取最近 N 天的练习数据
export async function getRecentStats(days: number = 7): Promise<PracticeStats[]> {
  const stats = await getAllPracticeStats();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return stats.filter(s => {
    const recordDate = new Date(s.created_at || s.date || '');
    return recordDate >= cutoffDate;
  });
}

// 按练习类型分组统计
export async function getStatsByExerciseType() {
  const stats = await getAllPracticeStats();
  const grouped: Record<string, { count: number; avgScore: number; totalDuration: number }> = {};
  
  stats.forEach(s => {
    const type = s.exercise_type || s.exerciseType || 'unknown';
    if (!grouped[type]) {
      grouped[type] = { count: 0, avgScore: 0, totalDuration: 0 };
    }
    grouped[type].count++;
    grouped[type].avgScore += s.score || 0;
    grouped[type].totalDuration += s.duration || 0;
  });

  // 计算平均值
  Object.keys(grouped).forEach(type => {
    grouped[type].avgScore = Math.round((grouped[type].avgScore / grouped[type].count) * 100) / 100;
  });

  return grouped;
}

// 本地备份（当网络不可用时使用）
const LOCAL_BACKUP_KEY = 'fretmaster_stats_backup';

function saveToLocalBackup(stats: PracticeStats) {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_BACKUP_KEY) || '[]');
    existing.push(stats);
    // 只保留最近 100 条记录
    if (existing.length > 100) {
      existing.shift();
    }
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(existing));
  } catch (e) {
    logger.error('本地备份失败:', e);
  }
}

function getLocalBackup(): PracticeStats[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BACKUP_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

// 同步本地备份到服务器
export async function syncLocalBackupToServer(): Promise<number> {
  const localData = getLocalBackup();
  if (localData.length === 0) return 0;

  let syncedCount = 0;
  for (const record of localData) {
    try {
      await savePracticeStats({
        exercise_type: record.exercise_type || record.exerciseType || '未知练习',
        score: record.score,
        duration: record.duration,
        accuracy: record.accuracy,
        notes: record.notes,
      });
      syncedCount++;
    } catch (e) {
      logger.error('同步记录失败:', e);
    }
  }
  
  // 清空本地备份
  localStorage.setItem(LOCAL_BACKUP_KEY, '[]');
  
  return syncedCount;
}

// 获取用户 ID（用于调试）
export function getCurrentUserId(): string {
  return getUserId();
}
