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
  // Tauri 2 macOS/Linux: 卐议为 tauri://localhost
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
 */
export function getLocalMonthsAgoStart(months: number, from: Date = new Date()): Date {
  const start = getLocalDayStart(from)
  start.setMonth(start.getMonth() - months)
  return start
}

/**
 * 规范化准确率到 0-100 范围。
 * 兼容两种存储方式：0-1 (例如 1.0 = 100%) 和 0-100 (例如 100 = 100%)。
 */
export function normalizeAccuracy(value: number | undefined | null): number {
  if (typeof value !== 'number' || !isFinite(value)) return 0
  if (value <= 1) return value * 100
  if (value > 100) return 100
  return value
}
