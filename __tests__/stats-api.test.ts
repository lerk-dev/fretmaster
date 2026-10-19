/**
 * lib/stats-api.ts 的契约测试（此前零测试）。
 *
 * 该模块在 jsdom（hostname=localhost）下 isDev=true，除 `syncLocalBackupToServer` 外
 * 全部走「本地 LocalStorage 备份」分支，不需要网络 —— 正好可测纯逻辑。
 *
 * 最有价值的两处：
 * ① `savePracticeStats` 的字段校验/截断（脏数据进库前必须归一）；
 * ② `syncLocalBackupToServer` 的「只补传未确认记录」—— 2026-10-19 重修：
 *    原实现把备份当纯队列整批重发（已成功的再传一遍 = 统计翻倍）且回写时只留
 *    失败记录（离线镜像被清空）。现在备份记录带 `_synced` 标记，本测试把它变成护栏。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  savePracticeStats,
  getAllPracticeStats,
  getStatsSummary,
  getStatsByExerciseType,
  getRecentStats,
  syncLocalBackupToServer,
  clearAllPracticeStats,
} from '@/lib/stats-api'
import type { BackupRecord } from '@/lib/stats-api'

const BACKUP_KEY = 'fretmaster_stats_backup'
const mem = new Map<string, string>()

type LsMock = {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
}
const ls = () => window.localStorage as unknown as LsMock

/** 直接写入本地备份（跳过 savePracticeStats，用于构造边界数据） */
function writeBackup(records: Array<Partial<BackupRecord>>) {
  mem.set(BACKUP_KEY, JSON.stringify(records))
}
function readBackup(): BackupRecord[] {
  return JSON.parse(mem.get(BACKUP_KEY) || '[]')
}
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

beforeEach(() => {
  mem.clear()
  ls().getItem.mockImplementation((k: string) => (mem.has(k) ? mem.get(k)! : null))
  ls().setItem.mockImplementation((k: string, v: string) => { mem.set(k, v) })
  ls().removeItem.mockImplementation((k: string) => { mem.delete(k) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ------------------------------------------------- savePracticeStats

describe('savePracticeStats：入库前的字段归一', () => {
  it('score / duration 取非负整数（负数→0、小数四舍五入、非有限→0）', async () => {
    await savePracticeStats({ exercise_type: 'a', score: -5.6, duration: 10.7 } as never)
    await savePracticeStats({ exercise_type: 'a', score: NaN, duration: Infinity } as never)
    const [r1, r2] = readBackup()
    expect([r1.score, r1.duration]).toEqual([0, 11])
    expect([r2.score, r2.duration]).toEqual([0, 0])
  })

  it('accuracy 夹到 [0, 100]', async () => {
    await savePracticeStats({ exercise_type: 'a', score: 1, duration: 1, accuracy: 150 } as never)
    await savePracticeStats({ exercise_type: 'a', score: 1, duration: 1, accuracy: -3 } as never)
    const [r1, r2] = readBackup()
    expect(r1.accuracy).toBe(100)
    expect(r2.accuracy).toBe(0)
  })

  it('exercise_type 截到 100 字、notes 截到 1000 字', async () => {
    await savePracticeStats({
      exercise_type: 'x'.repeat(200),
      score: 1,
      duration: 1,
      notes: 'y'.repeat(2000),
    } as never)
    const r = readBackup()[0]
    expect(r.exercise_type).toHaveLength(100)
    expect(r.notes).toHaveLength(1000)
  })

  it('空 exercise_type 兜底为「未知练习」', async () => {
    await savePracticeStats({ exercise_type: '', score: 1, duration: 1 } as never)
    expect(readBackup()[0].exercise_type).toBe('未知练习')
  })

  it('兼容 exerciseType（驼峰）写法，并补齐 date / created_at 冗余字段', async () => {
    await savePracticeStats({ exerciseType: '驼峰类型', score: 1, duration: 1 } as never)
    const r = readBackup()[0]
    expect(r.exercise_type).toBe('驼峰类型')
    expect(r.exerciseType).toBe('驼峰类型')
    expect(r.date).toBeTruthy()
    expect(r.created_at).toBeTruthy()
  })

  it('开发模式下返回本地保存结果、不发起网络请求', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await savePracticeStats({ exercise_type: 'a', score: 1, duration: 1 } as never)
    expect(res.status).toBe('success')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------- 本地备份

describe('本地备份', () => {
  it('getAllPracticeStats 读回已保存记录', async () => {
    await savePracticeStats({ exercise_type: 'a', score: 1, duration: 1 } as never)
    await savePracticeStats({ exercise_type: 'b', score: 2, duration: 2 } as never)
    const all = await getAllPracticeStats()
    expect(all.map((r) => r.exercise_type)).toEqual(['a', 'b'])
  })

  it('备份上限 100 条：超出丢最旧、保留最新', async () => {
    for (let i = 0; i < 105; i++) {
      await savePracticeStats({ exercise_type: `t${i}`, score: i, duration: 1 } as never)
    }
    const all = await getAllPracticeStats()
    expect(all).toHaveLength(100)
    expect(all[0].exercise_type).toBe('t5')
    expect(all[99].exercise_type).toBe('t104')
  })

  it('备份内容损坏时返回空数组（不抛）', async () => {
    mem.set(BACKUP_KEY, '{not json')
    expect(await getAllPracticeStats()).toEqual([])
  })
})

// -------------------------------------------------- getStatsSummary

describe('getStatsSummary', () => {
  it('无记录时返回全 0 与 lastPractice=null', async () => {
    expect(await getStatsSummary()).toEqual({
      totalSessions: 0,
      totalDuration: 0,
      averageScore: 0,
      averageAccuracy: 0,
      lastPractice: null,
    })
  })

  it('聚合会话数 / 总时长 / 平均分 / 平均准确率', async () => {
    await savePracticeStats({ exercise_type: 'a', score: 80, duration: 100, accuracy: 90 } as never)
    await savePracticeStats({ exercise_type: 'a', score: 60, duration: 200, accuracy: 70 } as never)
    await savePracticeStats({ exercise_type: 'b', score: 100, duration: 300, accuracy: 100 } as never)
    const s = await getStatsSummary()
    expect(s.totalSessions).toBe(3)
    expect(s.totalDuration).toBe(600)
    expect(s.averageScore).toBe(80) // (80+60+100)/3
    expect(s.averageAccuracy).toBeCloseTo(86.67, 2) // (90+70+100)/3
  })

  it('平均准确率会先把「<=1 的小数」归一成百分比', async () => {
    // 0.9 是「90% 的小数写法」，normalizeAccuracy 会 ×100 → 90
    await savePracticeStats({ exercise_type: 'a', score: 1, duration: 1, accuracy: 0.9 } as never)
    expect((await getStatsSummary()).averageAccuracy).toBe(90)
  })

  it('lastPractice 取备份数组的第一个元素（记录当前行为：备份为追加序，故为最旧一条）', async () => {
    // 目前无 UI 消费者；此处如实钉住行为，避免将来无意改变语义
    writeBackup([
      { exercise_type: 'old', score: 1, duration: 1, created_at: isoDaysAgo(30) },
      { exercise_type: 'new', score: 1, duration: 1, created_at: isoDaysAgo(1) },
    ])
    const s = await getStatsSummary()
    expect(new Date(s.lastPractice!).getTime()).toBeLessThan(Date.now() - 20 * 86400_000)
  })
})

// --------------------------------------------- getStatsByExerciseType

describe('getStatsByExerciseType', () => {
  it('按类型分组，给出条数 / 平均分 / 总时长', async () => {
    await savePracticeStats({ exercise_type: 'a', score: 80, duration: 100 } as never)
    await savePracticeStats({ exercise_type: 'a', score: 60, duration: 200 } as never)
    await savePracticeStats({ exercise_type: 'b', score: 100, duration: 300 } as never)
    const g = await getStatsByExerciseType()
    expect(g).toEqual({
      a: { count: 2, avgScore: 70, totalDuration: 300 },
      b: { count: 1, avgScore: 100, totalDuration: 300 },
    })
  })

  it('无类型的记录归入 unknown', async () => {
    writeBackup([{ score: 50, duration: 10 }])
    const g = await getStatsByExerciseType()
    expect(g.unknown).toEqual({ count: 1, avgScore: 50, totalDuration: 10 })
  })
})

// --------------------------------------------------- getRecentStats

describe('getRecentStats', () => {
  it('只保留 cutoff 之后的记录', async () => {
    writeBackup([
      { exercise_type: 'old', score: 1, duration: 1, created_at: isoDaysAgo(30) },
      { exercise_type: 'recent', score: 1, duration: 1, created_at: isoDaysAgo(2) },
    ])
    const recent = await getRecentStats(7)
    expect(recent.map((r) => r.exercise_type)).toEqual(['recent'])
  })

  it('days=0 时只保留「现在及以后」（基本为空）', async () => {
    writeBackup([{ exercise_type: 'past', score: 1, duration: 1, created_at: isoDaysAgo(1) }])
    expect(await getRecentStats(0)).toEqual([])
  })
})

// -------------------------------------------- syncLocalBackupToServer

describe('syncLocalBackupToServer', () => {
  it('无备份时返回 0、不发起请求', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await syncLocalBackupToServer()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('🚨 已成功上传的记录（_synced: true）不重传 —— 防「统计翻倍」的核心回归', async () => {
    writeBackup([
      { exercise_type: 'ok1', score: 1, duration: 1, _synced: true },
      { exercise_type: 'ok2', score: 1, duration: 1, _synced: true },
    ])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await syncLocalBackupToServer()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    // 镜像原样保留
    expect(readBackup().map((r) => r.exercise_type)).toEqual(['ok1', 'ok2'])
  })

  it('历史记录（无 _synced 字段）按已同步处理，不重传', async () => {
    // 2026-10-19 之前的备份无法区分来源；重复入库不可逆，宁可不传
    writeBackup([{ exercise_type: 'legacy', score: 1, duration: 1 }])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await syncLocalBackupToServer()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('只补传未确认的记录：成功的转标记留作镜像、失败的保持待重试', async () => {
    writeBackup([
      { exercise_type: 'ok', score: 1, duration: 1, _synced: true },
      { exercise_type: 'retry', score: 1, duration: 1, _synced: false },
    ])
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body)
      return body.exercise_type === 'retry'
        ? ({ ok: false, status: 500 } as Response)
        : ({ ok: true, status: 200 } as Response)
    }))

    const synced = await syncLocalBackupToServer()
    expect(synced).toBe(0) // retry 上传失败；ok 被跳过（不是重传）
    // 整份备份保留：ok 仍是镜像，retry 保持 _synced: false 待下次重试
    const backup = readBackup()
    expect(backup.map((r) => r.exercise_type)).toEqual(['ok', 'retry'])
    expect(backup.map((r) => r._synced)).toEqual([true, false])
  })

  it('补传成功后记录标记 _synced: true 且留在备份里（不当纯队列清掉）', async () => {
    writeBackup([
      { exercise_type: 'mirror', score: 1, duration: 1, _synced: true },
      { exercise_type: 'pending', score: 1, duration: 1, _synced: false },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 } as Response)))
    expect(await syncLocalBackupToServer()).toBe(1)
    const backup = readBackup()
    expect(backup.map((r) => r.exercise_type)).toEqual(['mirror', 'pending'])
    expect(backup.every((r) => r._synced === true)).toBe(true)
  })

  it('补传的 POST body 不带内部标记 _synced', async () => {
    writeBackup([{ exercise_type: 'a', score: 1, duration: 1, _synced: false }])
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 } as Response))
    vi.stubGlobal('fetch', fetchSpy)
    await syncLocalBackupToServer()
    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body).not.toHaveProperty('_synced')
  })

  it('网络异常（抛错）时待传记录保留 _synced: false，不丢失', async () => {
    writeBackup([{ exercise_type: 'a', score: 1, duration: 1, _synced: false }])
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    expect(await syncLocalBackupToServer()).toBe(0)
    const backup = readBackup()
    expect(backup.map((r) => r.exercise_type)).toEqual(['a'])
    expect(backup[0]._synced).toBe(false)
  })
})

// ------------------------------------------------ clearAllPracticeStats

describe('clearAllPracticeStats', () => {
  it('清空备份', async () => {
    await savePracticeStats({ exercise_type: 'a', score: 1, duration: 1 } as never)
    expect(readBackup()).toHaveLength(1)
    await clearAllPracticeStats()
    expect(readBackup()).toEqual([])
  })
})
