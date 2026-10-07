/**
 * lib/stats-api.ts 的**非默认分支**契约测试。
 *
 * 已有 __tests__/stats-api.test.ts 只覆盖了「Web + 开发模式」这一条路（hostname=localhost ⇒
 * isDev=true），也就是本地 LocalStorage 备份分支。剩下两条路此前零覆盖：
 *   A. `isTauri === true`：8 个函数**全部**转交 ./native-stats（动态 import，走 SQLite）；
 *   B. `isDev === false`：真正发 fetch 到 /cgi-bin/stats（成功 / 非 2xx / 抛异常回退）。
 *
 * 为什么值得测：`isTauri` 与 `isDev` 都是**模块级常量**，在 import 时就定死。
 * 一旦这两处的判定或转交写错，桌面版会静默走到 Web 分支（或反过来），
 * 表现为「练习记录不见了」，且没有任何报错。测试靠 `vi.resetModules()` 重建模块来切档。
 *
 * ⚠️ 环境切换的坑：`window.location` 在 jsdom 里是 configurable 的，可以整体替换，
 * 但**必须在 afterEach 里还原**，否则同文件后续用例与其它文件都会读到假的 hostname。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// native-stats 的桩：用 vi.hoisted 才能在提升后的 vi.mock 工厂里引用
const native = vi.hoisted(() => ({
  savePracticeStats: vi.fn(async () => ({ status: 'success', message: 'native ok', id: 7 })),
  getAllPracticeStats: vi.fn(async () => [{ exercise_type: 'native-all', score: 1, duration: 2 }]),
  getMyPracticeStats: vi.fn(async () => [{ exercise_type: 'native-mine', score: 3, duration: 4 }]),
  getStatsSummary: vi.fn(async () => ({
    total_sessions: 3,
    total_duration: 300,
    average_score: 70,
    average_accuracy: 80,
    last_practice: '2026-09-01 10:00:00',
  })),
  getRecentStats: vi.fn(async () => [{ exercise_type: 'native-recent', score: 1, duration: 1 }]),
  getStatsByExerciseType: vi.fn(async () => ({ scale: { count: 1, avgScore: 88, totalDuration: 12 } })),
  clearAllPracticeStats: vi.fn(async () => undefined),
  syncLocalBackupToServer: vi.fn(async () => 5),
}))

vi.mock('@/lib/native-stats', () => native)

type TauriWindowLike = { __TAURI__?: boolean }
const win = window as unknown as TauriWindowLike
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')

const BACKUP_KEY = 'fretmaster_stats_backup'

/** jsdom 的 location 可整体替换（与 __tests__/utils-core.test.ts 同一手法） */
function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { protocol: 'https:', hostname },
    writable: true,
    configurable: true,
  })
}

/** 按目标环境重建模块（isTauri / isDev 是 import 时求值的模块级常量） */
async function loadStatsApi(opts: { tauri: boolean; hostname?: string }) {
  vi.resetModules()
  if (opts.tauri) win.__TAURI__ = true
  else delete win.__TAURI__
  setHostname(opts.hostname ?? 'example.com')
  return await import('@/lib/stats-api')
}

const readBackup = () => JSON.parse(window.localStorage.getItem(BACKUP_KEY) || '[]')

beforeEach(() => {
  window.localStorage.clear()
  for (const fn of Object.values(native)) fn.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (typeof window !== 'undefined') {
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
    delete win.__TAURI__
  }
})

// ============================================================ A. Tauri 分支

describe('isTauri=true：8 个函数全部转交 native-stats（不碰 localStorage / 不发 fetch）', () => {
  it('savePracticeStats：脏输入先归一，再交给 native；返回 native 的结果', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: true })

    const res = await mod.savePracticeStats({
      exercise_type: 'x'.repeat(200),
      score: -5.6,
      duration: NaN,
      accuracy: 150,
      notes: 'n'.repeat(2000),
    } as never)

    expect(native.savePracticeStats).toHaveBeenCalledTimes(1)
    expect(native.savePracticeStats).toHaveBeenCalledWith({
      exercise_type: 'x'.repeat(100),
      score: 0,
      duration: 0,
      accuracy: 100,
      notes: 'n'.repeat(1000),
    })
    expect(res).toEqual({ status: 'success', message: 'native ok', id: 7 })
    // Tauri 侧写 SQLite，不写 localStorage 备份；也不该走 HTTP
    expect(readBackup()).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('savePracticeStats：空 exercise_type 兜底「未知练习」', async () => {
    const mod = await loadStatsApi({ tauri: true })
    await mod.savePracticeStats({ exercise_type: '', score: 1, duration: 1 } as never)
    expect(native.savePracticeStats).toHaveBeenCalledWith(expect.objectContaining({ exercise_type: '未知练习' }))
  })

  it('getAllPracticeStats → native.getAllPracticeStats', async () => {
    const mod = await loadStatsApi({ tauri: true })
    expect(await mod.getAllPracticeStats()).toEqual([{ exercise_type: 'native-all', score: 1, duration: 2 }])
    expect(native.getAllPracticeStats).toHaveBeenCalledTimes(1)
  })

  it('getMyPracticeStats → native.getMyPracticeStats（不是 getAll）', async () => {
    const mod = await loadStatsApi({ tauri: true })
    expect(await mod.getMyPracticeStats()).toEqual([{ exercise_type: 'native-mine', score: 3, duration: 4 }])
    expect(native.getMyPracticeStats).toHaveBeenCalledTimes(1)
    expect(native.getAllPracticeStats).not.toHaveBeenCalled()
  })

  it('getStatsSummary：snake_case → camelCase 映射', async () => {
    const mod = await loadStatsApi({ tauri: true })
    expect(await mod.getStatsSummary()).toEqual({
      totalSessions: 3,
      totalDuration: 300,
      averageScore: 70,
      averageAccuracy: 80,
      lastPractice: '2026-09-01 10:00:00',
    })
  })

  it('getStatsSummary：last_practice 缺失时补 null（不是 undefined）', async () => {
    native.getStatsSummary.mockResolvedValueOnce({
      total_sessions: 0, total_duration: 0, average_score: 0, average_accuracy: 0,
    } as never)
    const mod = await loadStatsApi({ tauri: true })
    const s = await mod.getStatsSummary()
    expect(s.lastPractice).toBeNull()
  })

  it('getRecentStats(days) 把天数透传给 native', async () => {
    const mod = await loadStatsApi({ tauri: true })
    expect(await mod.getRecentStats(30)).toEqual([{ exercise_type: 'native-recent', score: 1, duration: 1 }])
    expect(native.getRecentStats).toHaveBeenCalledWith(30)
  })

  it('getStatsByExerciseType → native', async () => {
    const mod = await loadStatsApi({ tauri: true })
    expect(await mod.getStatsByExerciseType()).toEqual({ scale: { count: 1, avgScore: 88, totalDuration: 12 } })
  })

  it('syncLocalBackupToServer → native 的同步条数（不读 Web 的本地备份）', async () => {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify([{ exercise_type: 'web-only' }]))
    const mod = await loadStatsApi({ tauri: true })

    expect(await mod.syncLocalBackupToServer()).toBe(5)
    expect(native.syncLocalBackupToServer).toHaveBeenCalledTimes(1)
    // Web 备份原样不动（Tauri 不该碰它）
    expect(readBackup()).toEqual([{ exercise_type: 'web-only' }])
  })

  it('clearAllPracticeStats → native 清库（Web 备份键也不动）', async () => {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify([{ exercise_type: 'web-only' }]))
    const mod = await loadStatsApi({ tauri: true })

    await mod.clearAllPracticeStats()
    expect(native.clearAllPracticeStats).toHaveBeenCalledTimes(1)
    expect(readBackup()).toEqual([{ exercise_type: 'web-only' }])
  })
})

// ======================================================== B. 生产 Web 分支

describe('isDev=false（非 Tauri）：走 fetch /cgi-bin/stats', () => {
  it('savePracticeStats 成功：POST 正确的 URL/方法/载荷，返回服务器结果并写本地备份', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 42, status: 'ok', message: 'saved' }),
    }))
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    const res = await mod.savePracticeStats({ exercise_type: 'C 大调音阶', score: 88, duration: 120, accuracy: 90 } as never)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }]
    expect(url).toBe('/cgi-bin/stats')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      device_id: 'fretmaster_user',       // 固定用户标识：所有设备共享同一份数据
      exercise_type: 'C 大调音阶',
      score: 88,
      duration: 120,
      accuracy: 90,
      notes: '',
    })
    expect(res).toEqual({ id: 42, status: 'ok', message: 'saved' })

    // 同时留一份本地备份（带服务器返回的 id）
    const backup = readBackup()
    expect(backup).toHaveLength(1)
    expect(backup[0].id).toBe(42)
    expect(backup[0].exercise_type).toBe('C 大调音阶')
  })

  it('savePracticeStats：HTTP 非 2xx 时抛错，但记录仍落进本地备份（弱网不丢数据）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await expect(
      mod.savePracticeStats({ exercise_type: 'a', score: 1, duration: 1 } as never)
    ).rejects.toThrow('HTTP error! status: 500')

    expect(readBackup()).toHaveLength(1)
    expect(readBackup()[0].exercise_type).toBe('a')
  })

  it('savePracticeStats：网络异常（fetch 抛）同样抛错并落备份', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await expect(
      mod.savePracticeStats({ exercise_type: 'b', score: 1, duration: 1 } as never)
    ).rejects.toThrow('network down')

    expect(readBackup()[0].exercise_type).toBe('b')
  })

  it('getAllPracticeStats：数组结果逐条归一化字段（exercise_type / exerciseType / date / created_at）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ exerciseType: '驼峰', created_at: '2026-09-01 10:00:00' }],
    })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    const all = await mod.getAllPracticeStats()
    expect(all[0].exercise_type).toBe('驼峰')
    expect(all[0].exerciseType).toBe('驼峰')
    expect(all[0].created_at).toBe('2026-09-01 10:00:00')
    expect(all[0].date).toBe('2026-09-01 10:00:00')
  })

  it('getAllPracticeStats：服务器返回非数组时给空数组（不把对象当列表用）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: 'x' }) })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })
    expect(await mod.getAllPracticeStats()).toEqual([])
  })

  it('getAllPracticeStats：请求失败时回退本地备份（不让统计面板空掉）', async () => {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify([{ exercise_type: 'cached', score: 1, duration: 1 }]))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    const all = await mod.getAllPracticeStats()
    expect(all.map((r: { exercise_type?: string }) => r.exercise_type)).toEqual(['cached'])
  })

  it('getStatsSummary：服务器端没有记录时返回全 0（且不做除零）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })
    expect(await mod.getStatsSummary()).toEqual({
      totalSessions: 0, totalDuration: 0, averageScore: 0, averageAccuracy: 0, lastPractice: null,
    })
  })

  it('getMyPracticeStats：Web 生产模式下所有设备共享同一份数据 → 等价于 getAllPracticeStats', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ exercise_type: 'shared' }] }))
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    expect((await mod.getMyPracticeStats()).map((r: { exercise_type?: string }) => r.exercise_type)).toEqual(['shared'])
    expect(fetchSpy).toHaveBeenCalledWith('/cgi-bin/stats')
  })

  it('saveToLocalBackup：localStorage 写不进去时只记日志，不影响保存主流程', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 1 }) })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })
    const setItem = window.localStorage.setItem as unknown as ReturnType<typeof vi.fn>
    setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })

    await expect(
      mod.savePracticeStats({ exercise_type: 'a', score: 1, duration: 1 } as never)
    ).resolves.toEqual({ id: 1 })

    errSpy.mockRestore()
  })

  it('syncLocalBackupToServer：回写备份失败时记日志，但仍返回已同步条数', async () => {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify([{ exercise_type: 'a', score: 1, duration: 1 }]))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })
    const setItem = window.localStorage.setItem as unknown as ReturnType<typeof vi.fn>
    setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })

    expect(await mod.syncLocalBackupToServer()).toBe(1)

    errSpy.mockRestore()
  })

  it('clearAllPracticeStats：localStorage 抛错时记日志但不上抛', async () => {
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })
    const setItem = window.localStorage.setItem as unknown as ReturnType<typeof vi.fn>
    setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })

    await expect(mod.clearAllPracticeStats()).resolves.toBeUndefined()

    errSpy.mockRestore()
  })
})
