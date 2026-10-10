/**
 * P3-11 护栏：统计 localStorage 键名的唯一真相源。
 *
 * 历史问题：`fretmaster-stats`（连字符）与 `fretmaster_stats_backup`（下划线）
 * 混用、清理逻辑在 `app/page.tsx` 与 `lib/stats-api.ts` 多处硬编码 ⇒ 漏清一处
 * 就留脏数据（用户看到「未练习却有记录」）。
 *
 * 三层判据：
 *   ① 键值锁定 —— 防止有人「顺手统一命名」而丢掉老用户既有统计；
 *   ② 源码级 —— 除真相源文件外，任何目录不得再出现这三个键名字面量；
 *   ③ 行为级 —— `clearStatsStorage()` 必须恰好移除**两个数据键**（不含 version）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  STATS_STORAGE_KEYS,
  STATS_DATA_KEYS,
  clearStatsStorage,
} from '@/lib/stats-storage-keys'

const TRUTH_SOURCE = 'lib/stats-storage-keys.ts'

describe('P3-11：统计 localStorage 键名唯一真相源', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('① 键值锁定：三个键的字符串值不得改动（改了等于丢弃老用户数据）', () => {
    expect(STATS_STORAGE_KEYS).toEqual({
      stats: 'fretmaster-stats',
      version: 'fretmaster-stats-version',
      backup: 'fretmaster_stats_backup',
    })
  })

  it('① `STATS_DATA_KEYS` 恰为「主数据 + 备份」两个（version 是元数据，不算数据键）', () => {
    expect([...STATS_DATA_KEYS]).toEqual([
      'fretmaster-stats',
      'fretmaster_stats_backup',
    ])
    expect(STATS_DATA_KEYS).not.toContain(STATS_STORAGE_KEYS.version)
  })

  it('② 源码级：除真相源外，不得再出现这三个键名的字面量', () => {
    const LITERALS = [
      'fretmaster-stats',
      'fretmaster-stats-version',
      'fretmaster_stats_backup',
    ]
    const dirs = ['app', 'lib', 'components', 'hooks']
    const files: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue
          walk(`${d}/${e.name}`)
        } else if (/\.tsx?$/.test(e.name)) {
          files.push(`${d}/${e.name}`)
        }
      }
    }
    for (const d of dirs) walk(d)

    const offenders: string[] = []
    for (const file of files) {
      if (file.endsWith(TRUTH_SOURCE)) continue
      // 剥注释（否则文档注释里提到键名会误报）
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      for (const lit of LITERALS) {
        if (src.includes(`'${lit}'`) || src.includes(`"${lit}"`) || src.includes(`\`${lit}\``)) {
          offenders.push(`${file} 硬编码了键名「${lit}」，应改走 STATS_STORAGE_KEYS`)
        }
      }
    }
    expect(offenders, `\n${offenders.join('\n')}`).toEqual([])
  })

  it('③ 行为级：clearStatsStorage() 恰好移除两个数据键', () => {
    const removed: string[] = []
    vi.stubGlobal('localStorage', {
      removeItem: (k: string) => {
        removed.push(k)
      },
    })
    clearStatsStorage()
    expect([...removed].sort()).toEqual(
      ['fretmaster-stats', 'fretmaster_stats_backup'].sort()
    )
    vi.unstubAllGlobals()
  })

  it('③ localStorage 抛异常时静默（隐私模式/配额不应崩主流程）', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('SecurityError: localStorage is not available')
      },
    })
    expect(() => clearStatsStorage()).not.toThrow()
    vi.unstubAllGlobals()
  })
})
