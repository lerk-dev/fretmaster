import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface TauriWindow {
  __TAURI__?: boolean
}

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

export function isTauriEnv(): boolean {
  if (typeof window === 'undefined') return false
  // 优先检查 Tauri 注入标志
  if ((window as TauriWindow).__TAURI__) return true
  // 兜底：在 Tauri 启动初期 __TAURI__ 可能尚未注入，用协议/主机名检测避免误调
  // getUserMedia 触发系统麦克风权限弹窗
  // Tauri 2 Windows: 协议为 http(s)://tauri.localhost 或 tauri://
  // Tauri 2 macOS/Linux: 协议为 tauri://localhost
  if (typeof window.location === 'object') {
    const { protocol, hostname } = window.location
    if (protocol === 'tauri:' || hostname === 'tauri.localhost') return true
  }
  return false
}

export function getAudioContextClass(): typeof AudioContext {
  if (typeof window === 'undefined') {
    return AudioContext
  }
  return (window as WebkitWindow).webkitAudioContext || AudioContext
}

// ==================== 日期/时间工具函数 ====================
// 这些函数用于统一处理统计数据的日期，避免时区错误。
// SQLite 的 CURRENT_TIMESTAMP 存储的是 UTC 时间，需要正确解析为本地时间。

/**
 * 获取本地日期字符串 (YYYY-MM-DD)，基于浏览器/系统本地时区。
 * 不要使用 new Date().toISOString().split('T')[0] —— 它返回 UTC 日期，
 * 在 UTC+8 时区下，凌晨 0-8 点会返回前一天的日期，导致"今天"判断错误。
 */
export function getLocalDateString(date: Date | string | number = new Date()): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 解析数据库时间戳为 Date 对象。
 * 兼容两种格式：
 *  - SQLite: "2026-07-15 15:30:00" (空格分隔，UTC)
 *  - ISO: "2026-07-15T15:30:00.000Z" 或 "2026-07-15T15:30:00"
 * 关键点：SQLite 的 CURRENT_TIMESTAMP 返回 UTC 时间，但 JS 的 new Date("YYYY-MM-DD HH:MM:SS")
 * 会被解析为本地时间，这是错误的。此函数会正确将其作为 UTC 解析。
 */
export function parseDbTimestamp(value: string | Date | undefined | null): Date {
  if (!value) return new Date()
  if (value instanceof Date) return value
  let str = String(value).trim()
  if (!str) return new Date()
  // SQLite 格式 "YYYY-MM-DD HH:MM:SS" → 转为 ISO "YYYY-MM-DDTHH:MM:SS"
  if (str.includes(' ')) {
    str = str.replace(' ', 'T')
  }
  // 如果没有时区标识，视为 UTC（因为 SQLite CURRENT_TIMESTAMP 是 UTC）
  if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) {
    str += 'Z'
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? new Date() : d
}

/**
 * 将数据库时间戳转换为本地日期字符串 (YYYY-MM-DD)。
 * 用于按日分组统计，确保"今天/昨天/本周"判断正确。
 */
export function dbTimestampToLocalDate(value: string | Date | undefined | null): string {
  return getLocalDateString(parseDbTimestamp(value))
}

/**
 * 获取指定日期在本地时区的起始时刻 (00:00:00.000)。
 * 用于范围过滤的起始边界。
 * 注意：如果传入 YYYY-MM-DD 字符串，会按本地时区解析（而非 UTC）。
 */
export function getLocalDayStart(date: Date | string = new Date()): Date {
  if (typeof date === 'string') {
    // 日期字符串 (YYYY-MM-DD) 需要按本地时区解析，否则 new Date("2026-07-16")
    // 会被当作 UTC 午夜，在 UTC- 时区会变成前一天
    const parts = date.split('-')
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0)
    }
  }
  const d = date as Date
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

/**
 * 获取 N 天前本地时区的起始时刻。
 */
export function getLocalDaysAgoStart(days: number, from: Date = new Date()): Date {
  const start = getLocalDayStart(from)
  start.setDate(start.getDate() - days)
  return start
}

/**
 * 获取 N 个月前本地时区的起始时刻。
 *
 * **不要改回 `start.setMonth(start.getMonth() - months)`**：setMonth 的溢出行为
 * 不是这里想要的。3/31 减 1 个月会被算成 3/3（2 月没有 31 日 → 2/31 溢出到 3/3），
 * 于是「本月」统计窗口凭空少几天 —— 3 月 31 日查「本月」，3/1、3/2 的记录会被漏掉。
 * 现在显式构造目标日期，溢出时**夹到目标月最后一天**（3/31 → 2/28，闰年 → 2/29）。
 */
export function getLocalMonthsAgoStart(months: number, from: Date = new Date()): Date {
  const start = getLocalDayStart(from)
  const targetMonth = start.getMonth() - months
  const result = new Date(start.getFullYear(), targetMonth, start.getDate(), 0, 0, 0, 0)
  // 目标月没有该日（如 2 月没有 31 日）时，`new Date` 会溢出到下个月；
  // 用「归一化后的目标月」与「实际落到哪个月」对比来识别这种情况。
  const normalizedTargetMonth = ((targetMonth % 12) + 12) % 12
  if (result.getMonth() !== normalizedTargetMonth) {
    // 目标月最后一天：下个月的第 0 天
    return new Date(start.getFullYear(), targetMonth + 1, 0, 0, 0, 0, 0)
  }
  return result
}

/**
 * 规范化准确率到 0-100 范围。
 * 兼容两种存储方式：0-1 (例如 1.0 = 100%) 和 0-100 (例如 100 = 100%)。
 *
 * 负数一律归 0：本函数承诺「输出落在 0-100」，但旧实现把负数送进
 * `value <= 1 → value * 100` 分支，`-0.5` 会输出 `-50`（导出报表里就成了
 * "-50%"）。脏数据（服务端/历史库里的负 accuracy）不该污染统计，
 * 归 0 比输出负数更安全；同时对所有 `>= 0` 的输入行为完全不变。
 */
export function normalizeAccuracy(value: number | undefined | null): number {
  if (typeof value !== 'number' || !isFinite(value)) return 0
  if (value <= 0) return 0
  if (value <= 1) return value * 100
  if (value > 100) return 100
  return value
}
