// 统计数据 API 模块
// Web 版本使用 CGI API，Windows 版本使用 SQLite
//
// ============================================================================
// 2026-10-18 审计复核：本模块有 5 个导出**当前零业务调用方**。
// 结论是**保留**（不是遗忘的死代码），理由与「要删时该改什么」一并记在这里：
//
//   getMyPracticeStats / getStatsSummary / getRecentStats / getStatsByExerciseType
//     · 服务器侧聚合查询。UI 现在用 getAllPracticeStats 一次拉全量再本地聚合，
//       所以确实没人调。
//     · **保留理由**：它们是 __tests__/native-invoke-contract.test.ts 的**跨语言契约载体**
//       —— 那 8 条用例用它们验证「前端 invoke 的命令名 / 参数键与 Rust 形参一致」
//       （get_recent_stats 的 days、get_stats_summary 的透传字段、get_stats_by_exercise_type 的分组）。
//       删函数 = 连带删掉这层护栏，Rust 侧那 5 条命令就再没有任何前端契约校验。
//     · 若确认永不使用：删实现时**必须同步**删 native-invoke-contract.test.ts 里对应用例，
//       并在 main.rs 摘掉命令 —— 三处一起删，别只删一处留下悬空的护栏。
//
//   syncLocalBackupToServer
//     · 🚨 曾经**不可直接接线**（2026-10-18 复核发现的隐患）：
//       `savePracticeStats` 在**成功**路径也会把记录写进同一份本地备份，
//       而该函数把备份当成「待上传队列」整批重发 ⇒ 真接上会让已上传的记录重复入库。
//       历史版本的备份里更是混着大量成功记录，上线即翻倍。
//     · 2026-10-19 已修（见 BackupRecord 与函数内注释）：备份记录带 `_synced` 标记
//       （成功 true / 失败 false / 历史缺失按 true 处理），补传只处理未确认的，
//       且补传成功的记录**留在备份里**当离线镜像。⇒「要不要接线」现在是产品决策
//       （弱网补传有价值），不再是数据安全禁忌。
// ============================================================================

import { logger } from './logger'
import { isTauriEnv, parseDbTimestamp, normalizeAccuracy } from './utils'
import { STATS_STORAGE_KEYS } from './stats-storage-keys'

const API_BASE_URL = '/cgi-bin';

/**
 * 是否「只有本地存储、没有 CGI 后端」。
 *
 * 🚨 2026-10-22 修：原判据是「hostname 为 localhost / 127.0.0.1，或以 192.168. 、10. 、172. 开头」。
 * **静态导出的生产站点本来就可能部署在内网**（路由器 192.168.123.2）⇒ 生产被判成 dev
 * ⇒ `savePracticeStats` / `getAllPracticeStats` / `deletePracticeStat` /
 * `clearAllPracticeStats` 四个分支全部只读写本地，CGI 一次都没被调用过。
 * 实测（headless Chrome 打开线上地址切到统计页）：`/cgi-bin` 请求数 = **0**，
 * 而同一时刻 `curl /cgi-bin/stats` 明明返回着服务器上的记录。
 * 后果是「多设备共享统计」静默失效：每台设备只看得到自己浏览器里的那份，
 * 清缓存/换设备即丢数据，而界面没有任何提示。
 *
 * 判据只认**本地回环**：`next dev` 与 `python -m http.server` 静态预览都在这些地址上，
 * 它们背后确实没有 CGI。其余地址（含内网 IP、局域网域名）一律**假定有后端** ——
 * 真用内网 IP 去访问 `next dev` 时请求会 404，`getAllPracticeStats` 本来就会回落到
 * 本地备份、`savePracticeStats` 会把记录标成待补传（`_synced: false`），功能不丢。
 */
const isLocalPreview = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '::1' ||
  window.location.hostname === '[::1]'
);

// 检查是否在 Tauri 环境（Windows 桌面版）
const isTauri = isTauriEnv();

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
  client_ip?: string;
  created_at?: string;
  date?: string;
  exerciseType?: string;
}

/**
 * 本地备份里的记录 = PracticeStats + 内部同步标记。
 *
 * `_synced` **只存在于 localStorage**，不进服务器请求体（syncLocalBackupToServer
 * 的 POST 显式挑字段）。它把备份从「纯队列」升级为「队列 + 离线镜像」的并集：
 *   · `true`  = 已确认上传成功（开发模式的记录没有服务器，也记 true）⇒ 只作离线
 *     镜像（getAllPracticeStats 的 fallback 数据源），补传时**跳过**
 *   · `false` = 上传失败，待下次补传
 *   · 缺失   = 2026-10-19 之前写入的历史记录，一律按 `true` 处理
 *     （重复入库会永久污染服务器聚合且不可逆；少传最多丢有界的本地记录）
 */
export type BackupRecord = PracticeStats & { _synced?: boolean }

function normalizeStatsFields(stats: PracticeStats): PracticeStats {
  const exerciseType = stats.exercise_type || stats.exerciseType || '未知练习'
  return {
    ...stats,
    exercise_type: exerciseType,
    exerciseType: exerciseType,
    date: stats.date || stats.created_at,
    created_at: stats.created_at || stats.date,
  }
}

// 保存练习数据
export async function savePracticeStats(
  stats: Omit<PracticeStats, 'id' | 'created_at' | 'device_id'>
): Promise<{ status: string; message: string; id?: number }> {
  const validatedScore = typeof stats.score === 'number' && isFinite(stats.score) ? Math.max(0, Math.round(stats.score)) : 0
  const validatedDuration = typeof stats.duration === 'number' && isFinite(stats.duration) ? Math.max(0, Math.round(stats.duration)) : 0
  const validatedAccuracy = typeof stats.accuracy === 'number' && isFinite(stats.accuracy) ? Math.max(0, Math.min(100, stats.accuracy)) : 0
  const validatedExerciseType = (stats.exercise_type || stats.exerciseType || '').toString().slice(0, 100) || '未知练习'
  const validatedNotes = (stats.notes || '').toString().slice(0, 1000)

  // Windows 版本使用 SQLite
  if (isTauri) {
    const { savePracticeStats: nativeSave } = await import('./native-stats');
    return nativeSave({
      exercise_type: validatedExerciseType,
      score: validatedScore,
      duration: validatedDuration,
      accuracy: validatedAccuracy,
      notes: validatedNotes,
    });
  }
  
  const userId = getUserId();
  
  const data = {
    device_id: userId,
    exercise_type: validatedExerciseType,
    score: validatedScore,
    duration: validatedDuration,
    accuracy: validatedAccuracy,
    notes: validatedNotes,
  };

  // 本地预览（`next dev` / 静态目录预览）没有 CGI：只保存到本地备份
  if (isLocalPreview) {
    const backupData: PracticeStats = normalizeStatsFields({
      ...data,
      created_at: new Date().toISOString(),
    });
    // 没有服务器可传 ⇒ 记 true（补传时跳过，别把本地预览记录当真失败队列）
    saveToLocalBackup({ ...backupData, _synced: true });
    return { status: 'success', message: '已保存到本地（本地预览模式）', id: Date.now() };
  }

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
    
    // 同时保存到本地备份（离线镜像；已确认入库 ⇒ _synced: true，补传时跳过）
    const backupData: PracticeStats = normalizeStatsFields({
      ...data,
      id: result.id,
      created_at: new Date().toISOString(),
    });
    saveToLocalBackup({ ...backupData, _synced: true });

    return result;
  } catch (error) {
    logger.error('保存统计数据失败:', error);
    // 如果网络请求失败，保存到本地 LocalStorage 作为备份
    const backupData: PracticeStats = normalizeStatsFields({
      ...data,
      created_at: new Date().toISOString(),
    });
    // 未确认入库 ⇒ _synced: false，下次 syncLocalBackupToServer 会补传
    saveToLocalBackup({ ...backupData, _synced: false });
    throw error;
  }
}

// 从路由器获取所有练习数据（所有设备共享）
export async function getAllPracticeStats(): Promise<PracticeStats[]> {
  // Windows 版本使用 SQLite
  if (isTauri) {
    const { getAllPracticeStats: nativeGetAll } = await import('./native-stats');
    return nativeGetAll();
  }
  
  // 本地预览（无 CGI）直接返回本地备份
  if (isLocalPreview) {
    return getLocalBackup();
  }

  try {
    const response = await fetch(`${API_BASE_URL}/stats`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // 转换字段名以兼容前端显示
    const formatted = Array.isArray(data) ? data.map((item: PracticeStats) => normalizeStatsFields(item)) : [];
    
    return mergeRecordsMissingOnServer(formatted);
  } catch (error) {
    logger.error('获取统计数据失败:', error);
    // 如果网络请求失败，返回本地备份数据
    return getLocalBackup();
  }
}

/**
 * 把「服务器上还没有」的本地记录并进返回结果。
 *
 * 为什么必须合并（两个真实场景，都会让用户以为「我的统计没了」）：
 *  1. **上传失败的记录**（`_synced: false`）：弱网/离线时练习完，服务器没收到，
 *     但本地备份留着。只返回服务器数据 ⇒ 统计页当场少一截，用户以为丢数据。
 *  2. **历史遗留**：2026-10-22 之前内网 IP 被判成「开发环境」（见 isLocalPreview 注释），
 *     路由器部署版的记录**从没上传过**（`_synced: true` 但 id 是本地时间戳）。
 *     只返回服务器数据 ⇒ 一升级，用户在这台设备上练过的全部记录从界面消失。
 *
 * 去重判据用 **id 是否在服务器的 id 集合里**：成功保存的记录两侧 id 相同
 * （服务器自增 id），会被正确过滤掉；本地生成的 id（`Date.now()`）或缺失 id 的记录则保留。
 */
function mergeRecordsMissingOnServer(serverRows: PracticeStats[]): PracticeStats[] {
  const serverIds = new Set(
    serverRows.map((r) => r.id).filter((id): id is number => typeof id === 'number')
  );
  const localOnly = getLocalBackup().filter((r) => r.id === undefined || !serverIds.has(r.id));
  if (localOnly.length === 0) return serverRows;

  // 服务器/CGI 按时间倒序返回，本地记录插在末尾会打乱「近期练习」的阅读顺序 ⇒ 重排。
  // parseDbTimestamp 同时吃 SQLite 的 "YYYY-MM-DD HH:MM:SS" 与 ISO；解析失败按 0 排到最后。
  const ts = (r: PracticeStats) => {
    const raw = r.created_at || r.date;
    return raw ? parseDbTimestamp(raw).getTime() || 0 : 0;
  };
  return [...serverRows, ...localOnly].sort((a, b) => ts(b) - ts(a));
}

// 获取当前用户的练习数据（所有设备共享）
export async function getMyPracticeStats(): Promise<PracticeStats[]> {
  // Windows 版本使用 SQLite
  if (isTauri) {
    const { getMyPracticeStats: nativeGetMy } = await import('./native-stats');
    return nativeGetMy();
  }
  
  // 获取所有记录，因为所有设备使用相同的用户标识
  return getAllPracticeStats();
}

// 获取统计数据摘要
export async function getStatsSummary() {
  // Windows 版本使用 SQLite
  if (isTauri) {
    const { getStatsSummary: nativeGetSummary } = await import('./native-stats');
    const nativeSummary = await nativeGetSummary();
    // 转换 snake_case 到 camelCase
    return {
      totalSessions: nativeSummary.total_sessions,
      totalDuration: nativeSummary.total_duration,
      averageScore: nativeSummary.average_score,
      averageAccuracy: nativeSummary.average_accuracy,
      lastPractice: nativeSummary.last_practice ?? null,
    };
  }
  
  const stats = await getAllPracticeStats();
  
  if (stats.length === 0) {
    return {
      totalSessions: 0,
      totalDuration: 0,
      averageScore: 0,
      averageAccuracy: 0,
      lastPractice: null as string | null,
    };
  }

  const totalSessions = stats.length;
  const totalDuration = stats.reduce((sum, s) => sum + (s.duration || 0), 0);
  const averageScore = stats.reduce((sum, s) => sum + (s.score || 0), 0) / totalSessions;
  const averageAccuracy = stats.reduce((sum, s) => sum + normalizeAccuracy(s.accuracy), 0) / totalSessions;
  const lastPractice = stats[0]?.created_at || stats[0]?.date || null;

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
  // Windows 版本使用 SQLite
  if (isTauri) {
    const { getRecentStats: nativeGetRecent } = await import('./native-stats');
    return nativeGetRecent(days);
  }

  const stats = await getAllPracticeStats();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return stats.filter(s => {
    // 使用 parseDbTimestamp 正确解析 SQLite/ISO 时间戳为 UTC
    // 避免将 UTC 时间错误地解析为本地时间导致过滤偏差
    const recordDate = parseDbTimestamp(s.created_at || s.date);
    return recordDate >= cutoffDate;
  });
}

// 按练习类型分组统计
export async function getStatsByExerciseType() {
  // Windows 版本使用 SQLite
  if (isTauri) {
    const { getStatsByExerciseType: nativeGetByType } = await import('./native-stats');
    return nativeGetByType();
  }
  
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
// P3-11：键名统一走真相源 lib/stats-storage-keys.ts（禁止在此手写字面量）
const LOCAL_BACKUP_KEY = STATS_STORAGE_KEYS.backup;

function saveToLocalBackup(stats: BackupRecord) {
  try {
    const existing: BackupRecord[] = JSON.parse(localStorage.getItem(LOCAL_BACKUP_KEY) || '[]');
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

function getLocalBackup(): BackupRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BACKUP_KEY) || '[]');
  } catch {
    return [];
  }
}

// 同步本地备份到服务器
/**
 * 把本地备份里**未确认上传成功**的记录补传到服务器。
 *
 * 语义（2026-10-19 重修；重修前有两个隐患，见文末）：
 *
 * · 备份 = 「离线镜像」与「待补传队列」的**并集**，用 `_synced` 区分：
 *     - `true`  = 已确认上传成功 ⇒ 只作离线镜像，**不补传**
 *     - `false` = 上传失败，待重试
 *     - 缺失   = 历史记录，按 `true` 处理（宁可少传也不重复入库：
 *               重复会永久污染服务器聚合且不可逆，少传最多丢有界的本地记录）
 * · 补传成功的记录**留在备份里**并标记 `_synced: true` —— 备份同时是
 *   `getAllPracticeStats` 的离线 fallback 数据源，不是用完即清的队列。
 * · 内部标记 `_synced` **不进请求体**（POST 显式挑字段）。
 *
 * 重修前隐患：
 *   ① 重复入库：把整个备份当队列重发，已成功的记录再传一遍；
 *   ② 镜像被清：回写时只写失败记录，成功的那批镜像一起没了 ⇒ 离线 fallback 秃了。
 *
 * 已知残余窗口：补传成功后若整份回写 localStorage 失败（配额），盘上仍是
 * `_synced: false` ⇒ 下次会重传（重复）。选择「一次写整份」而非「每条一写」，
 * 是把失败面从 N 次降到 1 次；要彻底消除得先解决备份配额本身（上限 100 条）。
 */
export async function syncLocalBackupToServer(): Promise<number> {
  if (isTauri) {
    const { syncLocalBackupToServer: nativeSync } = await import('./native-stats');
    return nativeSync();
  }

  const localData = getLocalBackup();
  // 只补传**确认失败**的记录。缺失 _synced 的历史记录按已同步跳过（宁少传不重复）。
  // 注意不能写成 `!== true` —— 那会把漏档历史记录也当成待传，正是本轮要消除的翻倍源。
  const pending = localData.filter((r) => r._synced === false);
  if (pending.length === 0) return 0;

  let syncedCount = 0;
  for (const record of pending) {
    try {
      const res = await fetch(`${API_BASE_URL}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise_type: record.exercise_type || record.exerciseType || '未知练习',
          score: record.score,
          duration: record.duration,
          accuracy: record.accuracy,
          notes: record.notes,
        }),
      });
      // 服务器可能以非 2xx 表示失败，必须显式校验，否则会把失败当成功丢进备份
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 就地标记（记录对象来自本次 JSON.parse，mutate 安全）；留在备份里当离线镜像
      record._synced = true;
      syncedCount++;
    } catch (e) {
      logger.error('同步记录失败，保留待下次重试:', e);
    }
  }

  // 回写**整个**备份：补传成功的转为已同步镜像，失败的保持待重试。
  // 原实现只写回失败记录 —— 那正是「镜像被清」隐患。
  try {
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(localData));
  } catch (e) {
    logger.error('回写本地备份失败:', e);
  }

  return syncedCount;
}

// 清空所有练习记录（Tauri 环境调用 SQLite，Web 环境清空 localStorage 备份）
/**
 * 删除**单条**练习记录。
 *
 * · 桌面版：走 Rust 的 `delete_practice_stat`（SQLite）。
 * · Web 版：走 CGI 的 `DELETE /cgi-bin/stats` —— `cgi-stats-fixed.sh` 早已实现
 *   （`DELETE FROM practice_records WHERE id = $RECORD_ID`），只是前端从来没调过。
 *
 * ⚠️ CGI 的 DELETE 用原始 body 读 id（`grep -o '"id"[^,}]*'`），所以 body 必须是
 * 紧凑 JSON，不能带额外字段把它们隔开语义化 —— 保持 `{ id: number }` 单字段。
 */
export async function deletePracticeStat(id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`deletePracticeStat: id 必须是正整数，收到 ${id}`)
  }
  if (isTauri) {
    const { deletePracticeStat: nativeDelete } = await import('./native-stats');
    return nativeDelete(id);
  }
  if (isLocalPreview) {
    // 本地预览没有 CGI：只从本地备份里摘掉，保持与线上行为一致（记录消失）
    const backup = getLocalBackup().filter((r) => r.id !== id);
    try {
      localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(backup));
    } catch (e) {
      logger.error('删除本地备份记录失败（可能超出配额）:', e);
      throw e;
    }
    return;
  }
  const response = await fetch(`${API_BASE_URL}/stats`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    // 本地独有记录（从没上传成功：弱网失败的那条，或 isLocalPreview 时代只写了本地的历史记录）
    // 在服务器上根本不存在 ⇒ DELETE 必然失败。用户要删的是「界面上看得见的这条」，
    // 所以删掉本地副本就算完成。**只认本地生成的 id**；服务器 id 删除失败必须上抛，
    // 否则界面显示删了、刷新又回来（2026-10-18 修过一个同型 bug）。
    if (isLocallyIssuedId(id) && removeLocalBackupRecord(id)) return;
    throw new Error(`删除记录失败：HTTP ${response.status}`);
  }
  // 服务器删成功后同步清理本地镜像 —— 不清理的话，`mergeRecordsMissingOnServer`
  // 下次会把这条当成「服务器没有的本地记录」又合并回来，表现为「删了又出现」。
  pruneLocalMirror(id);
}

/**
 * 这个 id 是**本地生成**的吗（服务器上不存在这条记录）。
 *
 * 服务器 id 是 SQLite 自增行号（个位/十位）；本地生成的是 `Date.now()` 毫秒时间戳（13 位）。
 * 因此 > 1e9 可判定为本地 id —— 服务器不可能存过十亿条练习记录。
 * 只在「DELETE 失败」的兜底路径使用，不会误伤正常删除。
 */
function isLocallyIssuedId(id: number): boolean {
  return id > 1_000_000_000;
}

/** 从本地备份里删一条；删到了返回 true（配额满会抛，调用方决定要不要吞）。 */
function removeLocalBackupRecord(id: number): boolean {
  const backup = getLocalBackup();
  const next = backup.filter((r) => r.id !== id);
  if (next.length === backup.length) return false;
  try {
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(next));
  } catch (e) {
    logger.error('删除本地备份记录失败（可能超出配额）:', e);
    return false;
  }
  return true;
}

/** 服务器已经删成功之后清理本地镜像：静默失败（镜像清不掉不该让用户以为删除失败）。 */
function pruneLocalMirror(id: number): void {
  try {
    if (removeLocalBackupRecord(id)) return;
    // 本地本来就没有这条（正常：成功保存的记录也可能只在服务器上）
  } catch (e) {
    logger.error('清理本地备份镜像失败:', e);
  }
}

/**
 * 清空**全部**练习记录。
 *
 * · 桌面版：Rust `clear_all_practice_stats`（SQLite）。
 * · Web 版：`DELETE /cgi-bin/stats` + `{ all: true }`。
 *
 * 🚨 2026-10-18 修：此前 Web 分支**只清 localStorage、从来不发请求** ——
 *    界面当下看着清空了，刷新后 `getAllPracticeStats` 又从服务器把记录全拉回来
 *    （用户侧表现为「清空按钮没用」）。CGI 当时也没有清空接口（只有按 id 删单条），
 *    两边一起补：CGI 的 DELETE 现在认 `{"all":true}`（**必须显式传**，不做「缺 id 就清空」的推断）。
 */
export async function clearAllPracticeStats(): Promise<void> {
  if (isTauri) {
    const { clearAllPracticeStats: nativeClear } = await import('./native-stats');
    return nativeClear();
  }

  // 本地备份/缓存在任何情况下都要清 —— 否则网络失败时界面还会显示旧数据
  try {
    localStorage.setItem(LOCAL_BACKUP_KEY, '[]');
    localStorage.removeItem(STATS_STORAGE_KEYS.stats);
  } catch (e) {
    logger.error('清空本地备份失败:', e);
  }

  // 本地预览没有 CGI，本地清空即视为完成
  if (isLocalPreview) return;

  const response = await fetch(`${API_BASE_URL}/stats`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true }),
  });
  if (!response.ok) {
    throw new Error(`清空统计失败：HTTP ${response.status}`);
  }
}
