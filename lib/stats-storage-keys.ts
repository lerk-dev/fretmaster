/**
 * 统计相关 localStorage 键名的**唯一真相源**（P3-11）。
 *
 * 历史问题：同一语义域里键名混用了连字符与下划线
 * （`fretmaster-stats` vs `fretmaster_stats_backup`），清理逻辑在 `app/page.tsx`
 * 与 `lib/stats-api.ts` 多处硬编码 ⇒ 改一处漏一处、留下脏数据，
 * 用户侧表现为「明明没练习却显示练习记录」（历史上已出现过一次）。
 *
 * 🚨 键名的**字符串值不得修改**：改了等于丢弃所有老用户的既有统计。
 *    要改名必须另写一次性迁移（读旧键 → 写新键 → 删旧键），不能直接改字面量。
 *
 * 护栏：`__tests__/stats-storage-keys.test.ts`（键值锁定 + 禁止散落硬编码）。
 */

export const STATS_STORAGE_KEYS = {
  /** 页面练习统计缓存（主数据） */
  stats: 'fretmaster-stats',
  /** 统计缓存的结构版本号，用于失效重建（元数据，清理时不删，由版本比对自愈） */
  version: 'fretmaster-stats-version',
  /** 网络不可用时的本地待同步备份队列 */
  backup: 'fretmaster_stats_backup',
} as const

/**
 * Web 端「统计数据」的全部键（**不含 `version`**：它是元数据，清理时不删，
 * 留着由 `CACHE_VERSION` 比对自愈；删了也无害，但保持一致避免行为漂移）。
 *
 * 所有「清空统计」的入口一律遍历本数组，禁止再手写键名。
 */
export const STATS_DATA_KEYS: readonly string[] = [
  STATS_STORAGE_KEYS.stats,
  STATS_STORAGE_KEYS.backup,
]

/**
 * 移除统计相关的全部 localStorage 数据键。
 * 隐私模式 / 配额超限时 `removeItem` 也会抛 ⇒ 静默吞掉（清理失败不影响主流程）。
 */
export function clearStatsStorage(): void {
  try {
    for (const key of STATS_DATA_KEYS) {
      localStorage.removeItem(key)
    }
  } catch (e) {
    console.warn('Failed to clear stats storage:', e)
  }
}
