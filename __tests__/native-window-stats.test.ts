/**
 * lib/native-window.ts 与 lib/native-stats.ts 的降级契约测试（此前零测试）。
 *
 * 两个模块都是 Tauri（Windows 桌面版）封装，同样以 `if (!isTauri())` 开头降级 ——
 * 同一份前端也跑在 Web 上。jsdom 下 isTauri() 恒为 false，所以这里覆盖「Web 环境」支。
 *
 * native-window：窗口控制，降级一律「静默无操作 / 查询返回 false」。
 * native-stats：SQLite 统计读写，降级时 save 抛错、查询返回空。
 */
import { describe, it, expect } from 'vitest'
import * as win from '@/lib/native-window'
import * as stats from '@/lib/native-stats'

const NOT_TAURI = 'Not in Tauri environment'

// ---------------------------------------------------- 窗口控制

describe('native-window：非 Tauri 时静默无操作', () => {
  it('操作类全部安全返回（不抛）', async () => {
    const ops: Array<[string, () => Promise<unknown>]> = [
      ['minimizeWindow', () => win.minimizeWindow()],
      ['maximizeWindow', () => win.maximizeWindow()],
      ['closeWindow', () => win.closeWindow()],
      ['startDragging', () => win.startDragging()],
      ['setFullscreen', () => win.setFullscreen(true)],
      // 🚨 已无 setWindowedFullscreen：窗口全屏不许改窗口，原生侧没有对应命令
      ['setTrueFullscreen', () => win.setTrueFullscreen(false)],
      ['applyFullscreen(windowed)', () => win.applyFullscreen(true, 'windowed')],
      ['applyFullscreen(fullscreen)', () => win.applyFullscreen(true, 'fullscreen')],
      ['setWebViewBackgroundColor', () => win.setWebViewBackgroundColor('#000000')],
    ]
    for (const [name, fn] of ops) {
      await expect(fn(), name).resolves.toBeUndefined()
    }
  })

  it('查询类一律返回 false', async () => {
    expect(await win.isWindowMaximized()).toBe(false)
    expect(await win.isFullscreen()).toBe(false)
    expect(await win.isTrueFullscreen()).toBe(false)
  })
})

// ---------------------------------------------------- 统计读写（SQLite）

describe('native-stats：非 Tauri 时的降级', () => {
  it('savePracticeStats 抛 Not in Tauri environment', async () => {
    await expect(stats.savePracticeStats({
      exercise_type: 'pitch_finding',
      score: 1,
      duration: 1,
    })).rejects.toThrow(NOT_TAURI)
  })

  it('查询类返回空集合 / 零值摘要', async () => {
    expect(await stats.getAllPracticeStats()).toEqual([])
    expect(await stats.getMyPracticeStats()).toEqual([]) // 间接走 getAllPracticeStats
    expect(await stats.getRecentStats(7)).toEqual([])
    expect(await stats.getStatsByExerciseType()).toEqual({})
    expect(await stats.getStatsSummary()).toEqual({
      total_sessions: 0,
      total_duration: 0,
      average_score: 0,
      average_accuracy: 0,
      last_practice: null,
    })
  })

  it('clearAllPracticeStats 静默返回；syncLocalBackupToServer 返回 0（无可同步）', async () => {
    await expect(stats.clearAllPracticeStats()).resolves.toBeUndefined()
    // 非 Tauri 分支直接 return 0（不读本地备份、不发起网络请求）
    expect(await stats.syncLocalBackupToServer()).toBe(0)
  })
})
