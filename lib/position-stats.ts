// 逐位置掌握度统计
// 记录找音练习中每个指板位置（弦 × 品）的答对/答错次数
// - Web 环境：localStorage 持久化
// - Tauri 环境：SQLite（唯一数据源，遵守项目约定），防抖批量写入
//
// 数据按乐器分键存储（不同乐器调弦不同，同一位置含义不同）

import { logger } from "@/lib/logger"
import { isTauriEnv } from "@/lib/utils"

/** 单个指板位置的掌握度记录 */
export interface PositionStatRecord {
  stringIndex: number
  fret: number
  /** 总答题次数 */
  total: number
  /** 答对次数 */
  correct: number
}

const WEB_STORAGE_KEY = 'fretmaster-position-stats'
const FLUSH_DELAY_MS = 3000

// ==================== 内存缓存 ====================
// key: `${instrument}|${stringIndex}|${fret}`
const cache = new Map<string, PositionStatRecord>()
const loadedInstruments = new Set<string>()
const dirtyKeys = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

export function subscribePositionStats(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyChange() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch (e) {
      logger.error('position-stats listener error', e)
    }
  })
}

function keyOf(instrument: string, stringIndex: number, fret: number): string {
  return `${instrument}|${stringIndex}|${fret}`
}

export function getPositionStat(instrument: string, stringIndex: number, fret: number): PositionStatRecord | null {
  return cache.get(keyOf(instrument, stringIndex, fret)) ?? null
}

export function getPositionWeight(instrument: string, stringIndex: number, fret: number): number {
  const stat = cache.get(keyOf(instrument, stringIndex, fret))
  if (!stat || stat.total < 3) return 1
  const accuracy = stat.correct / stat.total
  return 1 + 2.5 * (1 - accuracy)
}

export function recordPositionResult(instrument: string, stringIndex: number, fret: number, correct: boolean) {
  const key = keyOf(instrument, stringIndex, fret)
  const existing = cache.get(key) ?? {
    stringIndex,
    fret,
    total: 0,
    correct: 0,
  }
  existing.total += 1
  if (correct) existing.correct += 1
  cache.set(key, existing)
  dirtyKeys.add(key)
  scheduleFlush()
  notifyChange()
}

// ==================== 持久化 ====================
function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPositionStats().catch((e) => logger.error('position-stats flush failed', e))
  }, FLUSH_DELAY_MS)
}

export async function flushPositionStats(): Promise<void> {
  if (dirtyKeys.size === 0) return
  const keys = [...dirtyKeys]
  if (keys.every((k) => cache.get(k) === undefined)) {
    // 缓存中已无对应记录（例如刚被清空），丢弃这批脏键
    keys.forEach((k) => dirtyKeys.delete(k))
    return
  }

  if (isTauriEnv()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // 按 instrument 分组（脏键可能跨乐器，切换乐器瞬间）
      const byInstrument = new Map<string, PositionStatRecord[]>()
      keys.forEach((k) => {
        const rec = cache.get(k)
        if (!rec) return
        const instrument = k.split('|')[0]
        const arr = byInstrument.get(instrument) ?? []
        arr.push(rec)
        byInstrument.set(instrument, arr)
      })
      for (const [instrument, list] of byInstrument) {
        await invoke('upsert_position_stats', { instrument, entries: list })
      }
      // 成功后才清除脏标记；失败则保留，下次 flush 重试（原实现在写盘前就清空，失败即丢数据）
      keys.forEach((k) => dirtyKeys.delete(k))
    } catch (e) {
      logger.error('SQLite 位置统计写入失败', e)
    }
  } else {
    try {
      // Web: 先读旧数据再按乐器合并，只更新本次涉及的乐器。
      // 原实现用内存 cache 全量重建后整体覆盖，会把本次未加载的乐器数据清空。
      const grouped = JSON.parse(localStorage.getItem(WEB_STORAGE_KEY) || '{}')
      keys.forEach((k) => {
        const rec = cache.get(k)
        if (!rec) return
        const instrument = k.split('|')[0]
        if (!grouped[instrument]) grouped[instrument] = {}
        grouped[instrument][`${rec.stringIndex}-${rec.fret}`] = rec
      })
      localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(grouped))
      keys.forEach((k) => dirtyKeys.delete(k))
    } catch (e) {
      logger.error('localStorage 位置统计写入失败', e)
    }
  }
}

export async function loadPositionStats(instrument: string): Promise<void> {
  if (loadedInstruments.has(instrument)) return
  // 先占位是为了合并并发调用（切乐器时 effect 可能同拍调两次）。
  // 但失败必须把它撤掉：否则一次瞬时失败（DB 尚未就绪等）会把该乐器永久标成「已加载」，
  // 后续整会话都不再重试 —— 查询类降级成空值可以接受，「永久读不到」不行。
  loadedInstruments.add(instrument)

  if (isTauriEnv()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const rows = await invoke<PositionStatRecord[]>('get_position_stats', { instrument })
      rows.forEach((r) => {
        cache.set(keyOf(instrument, r.stringIndex, r.fret), r)
      })
      notifyChange()
    } catch (e) {
      loadedInstruments.delete(instrument) // 允许下次重试
      logger.error('SQLite 位置统计读取失败', e)
    }
  } else {
    try {
      const grouped = JSON.parse(localStorage.getItem(WEB_STORAGE_KEY) || '{}')
      const recs: Record<string, PositionStatRecord> = grouped[instrument] || {}
      Object.values(recs).forEach((r) => {
        cache.set(keyOf(instrument, r.stringIndex, r.fret), r)
      })
      notifyChange()
    } catch (e) {
      loadedInstruments.delete(instrument) // 允许下次重试
      logger.error('localStorage 位置统计读取失败', e)
    }
  }
}

export async function clearPositionStats(instrument: string): Promise<void> {
  const prefix = `${instrument}|`
  const toDelete: string[] = []
  cache.forEach((_, k) => {
    if (k.startsWith(prefix)) toDelete.push(k)
  })
  toDelete.forEach((k) => {
    cache.delete(k)
    // 只清除该乐器的脏键，避免连带丢弃其它乐器待写的增量
    dirtyKeys.delete(k)
  })

  if (isTauriEnv()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('clear_position_stats', { instrument })
    } catch (e) {
      logger.error('SQLite 位置统计清空失败', e)
    }
  } else {
    try {
      const grouped = JSON.parse(localStorage.getItem(WEB_STORAGE_KEY) || '{}')
      delete grouped[instrument]
      localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(grouped))
    } catch (e) {
      logger.error('localStorage 位置统计清空失败', e)
    }
  }

  notifyChange()
}

// 页面卸载前强制写盘，避免防抖窗口内丢数据
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flushPositionStats()
  })
}
