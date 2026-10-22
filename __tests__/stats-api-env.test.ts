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
  deletePracticeStat: vi.fn(async () => undefined),
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
    // 第二个参数现在会带 signal（fetchWithTimeout 注入超时用），所以只断言 URL
    expect((fetchSpy.mock.calls[0] as unknown as [string])[0]).toBe('/cgi-bin/stats')
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

  it('savePracticeStats 成功：备份记录带 _synced: true（补传时跳过，防统计翻倍）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 42, status: 'ok' }) })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await mod.savePracticeStats({ exercise_type: 'a', score: 1, duration: 1 } as never)

    const backup = readBackup()
    expect(backup).toHaveLength(1)
    expect(backup[0]._synced).toBe(true)
  })

  it('savePracticeStats 失败：备份记录带 _synced: false（待 syncLocalBackupToServer 补传）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await expect(
      mod.savePracticeStats({ exercise_type: 'b', score: 1, duration: 1 } as never)
    ).rejects.toThrow('network down')

    expect(readBackup()[0]._synced).toBe(false)
  })

  it('syncLocalBackupToServer：回写备份失败时记日志，但仍返回已同步条数', async () => {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify([
      { exercise_type: 'a', score: 1, duration: 1, _synced: false },
    ]))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })
    const setItem = window.localStorage.setItem as unknown as ReturnType<typeof vi.fn>
    setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })

    expect(await mod.syncLocalBackupToServer()).toBe(1)

    errSpy.mockRestore()
  })

  it('clearAllPracticeStats：localStorage 抛错时记日志但不上抛，且**仍然清后端**', async () => {
    // 2026-10-18：clearAll 现在会发 DELETE ⇒ 必须 stub fetch，否则 jsdom 报 parse URL 失败。
    // 语义也顺势加强：本地备份写失败不能阻断清后端（否则「本地满了 = 永远清不掉」）。
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })
    const setItem = window.localStorage.setItem as unknown as ReturnType<typeof vi.fn>
    setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })

    await expect(mod.clearAllPracticeStats()).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    errSpy.mockRestore()
  })
})

// ==================================== B2. 内网 IP ≠ 开发环境（2026-10-22 修）

describe('内网 IP 不是「开发环境」：必须走后端', () => {
  /**
   * 回归背景（真机实测的静默失效）：
   *
   * 原判据是「hostname 为 localhost / 127.0.0.1，或以 192.168. 、10. 、172. 开头 ⇒ isDev」。
   * 但**静态导出的生产站点本来就部署在内网**（路由器 192.168.123.2）⇒ 生产被判成 dev
   * ⇒ savePracticeStats / getAllPracticeStats / deletePracticeStat / clearAllPracticeStats
   * 四条分支全部只读写 localStorage，`/cgi-bin` 一次都没被调用。
   *
   * 实测证据：headless Chrome 打开线上站点切到「统计」页，`/cgi-bin` 请求数 = **0**；
   * 同一时刻 `curl /cgi-bin/stats` 返回着服务器上的记录。用户可见后果：
   * 多设备共享统计静默失效（手机练的电脑上永远看不到）、换设备/清缓存即丢数据，
   * 界面不报任何错。判据因此改为「只认本地回环」。
   */
  const lanHosts = ['192.168.123.2', '10.0.0.5', '172.16.3.4']

  it.each(lanHosts)('%s：savePracticeStats 发 POST /cgi-bin/stats（而不是只写本地）', async (hostname) => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 9, status: 'ok', message: 'saved' }),
    }))
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname })

    const res = await mod.savePracticeStats({ exercise_type: '找音练习', score: 80, duration: 60, accuracy: 80 } as never)

    expect(fetchSpy, `${hostname} 被判成开发环境 ⇒ 记录只留在本机浏览器里`).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { method: string }]
    expect(url).toBe('/cgi-bin/stats')
    expect(init.method).toBe('POST')
    expect(res).toEqual({ id: 9, status: 'ok', message: 'saved' })
  })

  it('192.168.x：getAllPracticeStats 走 GET（能读到其它设备的数据）', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 1, exercise_type: '音阶练习', score: 70, duration: 30 }],
    }))
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    const rows = await mod.getAllPracticeStats()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect((fetchSpy.mock.calls[0] as unknown as [string])[0]).toBe('/cgi-bin/stats')
    expect(rows).toHaveLength(1)
  })

  it.each(['localhost', '127.0.0.1', '::1'])('%s：仍然只写本地（本地 dev / 静态目录预览没有 CGI）', async (hostname) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname })

    await mod.savePracticeStats({ exercise_type: '找音练习', score: 80, duration: 60, accuracy: 80 } as never)

    expect(fetchSpy, `${hostname} 属于本地回环，不该去请求 CGI`).not.toHaveBeenCalled()
    expect(readBackup()).toHaveLength(1)
  })
})

// ============================== B3. 服务器没有的本地记录必须并进来（2026-10-22）

describe('getAllPracticeStats：服务器上还没有的本地记录要合并（否则统计页看着「清零」）', () => {
  /**
   * 两个真实来源：
   *  ① 上传失败（`_synced: false`）—— 弱网练完，服务器没收到，本地备份还在；
   *  ② 历史遗留 —— 内网 IP 被判成开发环境时代（见 isLocalPreview 注释），
   *     路由器部署版的记录从没上传过。
   * 只返回服务器数据的话，用户升级那一刻会看到"我的记录全没了"。
   */
  const writeBackup = (rows: unknown[]) =>
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(rows))

  it('本地独有（无服务器 id）的记录并入结果', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 1, exercise_type: '音阶练习', score: 60, duration: 30, created_at: '2026-10-01 10:00:00' }],
    }))
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([
      { id: 1, exercise_type: '音阶练习', score: 60, duration: 30, created_at: '2026-10-01 10:00:00', _synced: true },
      { exercise_type: '找音练习', score: 90, duration: 90, created_at: '2026-10-02 10:00:00', _synced: false },
    ])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    const rows = await mod.getAllPracticeStats()

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.exercise_type).sort()).toEqual(['找音练习', '音阶练习'])
  })

  it('本地记录与服务器同 id ⇒ 不重复（成功保存时两边 id 相同）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 7, exercise_type: '和弦练习', score: 80, duration: 40, created_at: '2026-10-03 10:00:00' }],
    })))
    writeBackup([{ id: 7, exercise_type: '和弦练习', score: 80, duration: 40, created_at: '2026-10-03 10:00:00', _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect(await mod.getAllPracticeStats()).toHaveLength(1)
  })

  it('合并后按时间倒序（本地记录插到末尾会打乱「近期练习」的阅读顺序）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 1, exercise_type: '旧', score: 1, duration: 1, created_at: '2026-09-01 10:00:00' }],
    })))
    writeBackup([{ exercise_type: '新', score: 1, duration: 1, created_at: '2026-10-10 10:00:00', _synced: false }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect((await mod.getAllPracticeStats()).map((r) => r.exercise_type)).toEqual(['新', '旧'])
  })

  it('本地没有独有记录时原样返回（不重排、不增删）', async () => {
    const server = [
      { id: 2, exercise_type: 'B', score: 1, duration: 1, created_at: '2026-10-01 10:00:00' },
      { id: 1, exercise_type: 'A', score: 1, duration: 1, created_at: '2026-09-01 10:00:00' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => server })))
    writeBackup([{ id: 1, exercise_type: 'A', score: 1, duration: 1, _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect((await mod.getAllPracticeStats()).map((r) => r.id)).toEqual([2, 1])
  })
})

describe('deletePracticeStat：本地独有记录（服务器上没有）也能删掉', () => {
  const writeBackup = (rows: unknown[]) =>
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(rows))

  it('本地生成的 id（>1e9）+ 服务器 404 ⇒ 只删本地副本，不抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    const localId = Date.now()   // isLocalPreview 时代写入的 id
    writeBackup([{ id: localId, exercise_type: '找音练习', score: 1, duration: 1, _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    await expect(mod.deletePracticeStat(localId)).resolves.toBeUndefined()
    expect(readBackup()).toEqual([])
  })

  it('服务器 id 删除失败必须上抛（不能把失败当成删掉了，否则刷新又回来）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    writeBackup([{ id: 5, exercise_type: '音阶练习', score: 1, duration: 1, _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    await expect(mod.deletePracticeStat(5)).rejects.toThrow(/删除记录失败/)
    expect(readBackup(), '删除失败时不许动本地镜像').toHaveLength(1)
  })

  it('服务器删成功后本地镜像也要摘掉（否则合并逻辑会把它加回来 = 删不掉）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })))
    writeBackup([{ id: 5, exercise_type: '音阶练习', score: 1, duration: 1, _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    await mod.deletePracticeStat(5)
    expect(readBackup()).toEqual([])
  })
})

// ============================================================ C. deletePracticeStat（P3-16）

/**
 * 2026-10-18（P3-16）：Rust 的 `delete_practice_stat` 注册了很久但前端零调用 ⇒
 * 统计面板没有「删掉那条错记录」的入口。这三条钉住补上的桥接：
 * 桌面转交 native、Web 发 CGI DELETE、非法 id 在**发出请求之前**就拒绝。
 */
describe('deletePracticeStat：桌面走 SQLite、Web 走 CGI DELETE', () => {
  it('isTauri=true → 转交 native.deletePracticeStat(id)，不发 fetch、不碰 localStorage', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: true })

    await mod.deletePracticeStat(5)

    expect(native.deletePracticeStat).toHaveBeenCalledTimes(1)
    expect(native.deletePracticeStat).toHaveBeenCalledWith(5)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('isDev=false → DELETE /cgi-bin/stats，body 是紧凑的 { id }（CGI 用正则抠 id）', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await mod.deletePracticeStat(42)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/cgi-bin/stats')
    expect(init.method).toBe('DELETE')
    // 🚨 CGI 侧用 `grep -o '"id"[^,}]*'` 抠 id ⇒ body 必须能让这条正则命中
    expect(init.body).toBe(JSON.stringify({ id: 42 }))
    expect(native.deletePracticeStat).not.toHaveBeenCalled()
  })

  it('isDev=false → 非 2xx 必须抛错（不能把失败当成删掉了）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await expect(mod.deletePracticeStat(7)).rejects.toThrow(/HTTP 500/)
  })

  it('🚨 非法 id（0 / 负数 / 非整数）在**发出请求之前**就拒绝', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await expect(mod.deletePracticeStat(0)).rejects.toThrow(/正整数/)
    await expect(mod.deletePracticeStat(-3)).rejects.toThrow(/正整数/)
    await expect(mod.deletePracticeStat(1.5)).rejects.toThrow(/正整数/)
    // 一次请求都不该发出去 —— 否则会在后端跑一条 WHERE id = 0 的空删
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ============================================================ D. clearAllPracticeStats（2026-10-18 修）

/**
 * 历史缺陷：Web 分支**只清 localStorage、从来不发请求** ⇒ 界面看着清空了，刷新后
 * `getAllPracticeStats` 又从服务器拉回全部记录（用户侧表现为「清空按钮没用」）。
 * 现在 Web 版必须发 `DELETE { all: true }`，且 CGI 只认显式的 all（不做「缺 id 就清空」的推断）。
 */
describe('clearAllPracticeStats：Web 版必须清后端', () => {
  it('isDev=false → DELETE /cgi-bin/stats，body 是显式的 { all: true }', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await mod.clearAllPracticeStats()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/cgi-bin/stats')
    expect(init.method).toBe('DELETE')
    // 🚨 必须是 `{"all":true}`：CGI 用 grep 找 '"all":true' 才清空，缺 id 不会被当成清空
    expect(init.body).toBe(JSON.stringify({ all: true }))
    // 本地备份同样要清
    expect(readBackup()).toEqual([])
  })

  it('isDev=false → 非 2xx 抛错（不能把失败当成清空了）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response))
    const mod = await loadStatsApi({ tauri: false, hostname: 'fretmaster.example.com' })

    await expect(mod.clearAllPracticeStats()).rejects.toThrow(/HTTP 503/)
    // 但本地备份已经清了（网络失败也不该继续显示旧数据）
    expect(readBackup()).toEqual([])
  })

  it('isTauri=true → 转交 native，不发 fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const mod = await loadStatsApi({ tauri: true })

    await mod.clearAllPracticeStats()

    expect(native.clearAllPracticeStats).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ====================== E. migrateLegacyLocalRecords（2026-10-22 一次性补传）

describe('migrateLegacyLocalRecords：把「从没上传过」的历史记录补进服务器', () => {
  /**
   * 判据必须与 syncLocalBackupToServer **互斥**：
   *   · 本函数：`_synced === true` 且没有服务器 id（本地预览时代写的，从没到过服务器）
   *   · sync：`_synced === false`（明确失败）
   * 一旦重叠，同一条会被两条路径各传一次 ⇒ 统计翻倍（且不可逆）。
   */
  const writeBackup = (rows: unknown[]) =>
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(rows))
  const readBackupRaw = () => JSON.parse(window.localStorage.getItem(BACKUP_KEY) || '[]')

  const okFetch = (id = 101) =>
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', id }) }))

  it('历史记录（_synced: true、无 id）被 POST，且带上原 created_at', async () => {
    const fetchSpy = okFetch(101)
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([
      { exercise_type: '音阶练习', score: 88, duration: 120, accuracy: 90, created_at: '2026-05-04T08:09:10.000Z', _synced: true },
    ])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect(await mod.migrateLegacyLocalRecords()).toBe(1)

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { method: string; body: string }]
    expect(url).toBe('/cgi-bin/stats')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.exercise_type).toBe('音阶练习')
    expect(body.device_id).toBe('fretmaster_user')
    // 🚨 不带 created_at 的话，几十条历史会全落成「今天」，今天/本周/本月全部失真
    expect(body.created_at).toBe('2026-05-04T08:09:10.000Z')
  })

  it('成功后回写服务器 id ⇒ 再调一次不重复上传（幂等）', async () => {
    const fetchSpy = okFetch(101)
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([{ exercise_type: '找音练习', score: 70, duration: 60, created_at: '2026-05-01T00:00:00.000Z', _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect(await mod.migrateLegacyLocalRecords()).toBe(1)
    expect(readBackupRaw()[0].id).toBe(101)

    expect(await mod.migrateLegacyLocalRecords(), '第二次必须 0 条 —— 否则统计翻倍').toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('已有服务器 id 的记录不动（那是已上传，再传就是重复入库）', async () => {
    const fetchSpy = okFetch(5)
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([{ id: 5, exercise_type: '和弦练习', score: 60, duration: 30, _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect(await mod.migrateLegacyLocalRecords()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('_synced: false 的记录不归本函数管（避免与 syncLocalBackupToServer 双传）', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([{ exercise_type: '音程练习', score: 50, duration: 20, _synced: false }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect(await mod.migrateLegacyLocalRecords()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('上传失败：返回 0，记录原样保留（下次重试）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    writeBackup([{ exercise_type: '音阶练习', score: 80, duration: 60, _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect(await mod.migrateLegacyLocalRecords()).toBe(0)
    expect(readBackupRaw()[0].id, '失败时不许写 id（否则下次跳过 = 数据丢了）').toBeUndefined()
  })

  it('部分成功：成功的写 id，失败的仍无 id（下次只重传失败那条）', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 201 }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([
      { exercise_type: '找音练习', score: 90, duration: 60, created_at: '2026-05-01T00:00:00.000Z', _synced: true },
      { exercise_type: '音阶练习', score: 40, duration: 30, created_at: '2026-04-01T00:00:00.000Z', _synced: true },
    ])
    const mod = await loadStatsApi({ tauri: false, hostname: '192.168.123.2' })

    expect(await mod.migrateLegacyLocalRecords()).toBe(1)
    const backup = readBackupRaw()
    expect(backup[0].id).toBe(201)
    expect(backup[1].id).toBeUndefined()
  })

  it('本地预览（localhost）不发请求：那里根本没有 CGI', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([{ exercise_type: '音阶练习', score: 80, duration: 60, _synced: true }])
    const mod = await loadStatsApi({ tauri: false, hostname: 'localhost' })

    expect(await mod.migrateLegacyLocalRecords()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('Tauri 版不发请求：SQLite 是唯一真相源', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    writeBackup([{ exercise_type: '音阶练习', score: 80, duration: 60, _synced: true }])
    const mod = await loadStatsApi({ tauri: true })

    expect(await mod.migrateLegacyLocalRecords()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
