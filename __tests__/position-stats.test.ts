/**
 * 逐位置掌握度统计（lib/position-stats.ts）的契约测试。
 *
 * 该模块此前零测试，而它管着两件「错了不会崩、只会静默出错」的事：
 *  1. getPositionWeight 的加权公式 —— 找音练习的出题权重，算错会一直出简单位置
 *  2. 持久化的「按乐器合并写入」与「写盘失败不丢数据」—— 源码注释里记着两个已修的历史 bug
 *
 * 模块级状态（cache / loadedInstruments / dirtyKeys）用 vi.resetModules() + 动态 import
 * 隔离；localStorage 是 setup.ts 里的 vi.fn() mock，这里注入内存实现。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type Mod = typeof import('@/lib/position-stats')
type Rec = { stringIndex: number; fret: number; total: number; correct: number }

const WEB_KEY = 'fretmaster-position-stats'
const GUITAR = 'six_string_guitar'
const BASS = 'four_string_bass'

let store: Map<string, string>

beforeEach(() => {
  vi.useFakeTimers()
  store = new Map()
  const ls = window.localStorage as unknown as {
    getItem: ReturnType<typeof vi.fn>
    setItem: ReturnType<typeof vi.fn>
  }
  ls.getItem.mockReset().mockImplementation((k: string) => store.get(k) ?? null)
  ls.setItem.mockReset().mockImplementation((k: string, v: string) => {
    store.set(k, String(v))
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function fresh(): Promise<Mod> {
  vi.resetModules()
  return await import('@/lib/position-stats')
}

function readStore(): Record<string, Record<string, Rec>> {
  return JSON.parse(store.get(WEB_KEY) ?? '{}')
}

function seedStore(data: Record<string, Record<string, Rec>>) {
  store.set(WEB_KEY, JSON.stringify(data))
}

describe('recordPositionResult / getPositionStat', () => {
  it('累加 total 与 correct，且按乐器隔离（同一位置不同乐器互不干扰）', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 2, 5, true)
    m.recordPositionResult(GUITAR, 2, 5, false)
    m.recordPositionResult(BASS, 2, 5, true)

    expect(m.getPositionStat(GUITAR, 2, 5)).toMatchObject({ stringIndex: 2, fret: 5, total: 2, correct: 1 })
    expect(m.getPositionStat(BASS, 2, 5)).toMatchObject({ stringIndex: 2, fret: 5, total: 1, correct: 1 })
    expect(m.getPositionStat(GUITAR, 9, 9)).toBeNull()
  })
})

describe('getPositionWeight', () => {
  it('样本不足 3 次时一律返回 1（不加权）', async () => {
    const m = await fresh()
    expect(m.getPositionWeight(GUITAR, 0, 0)).toBe(1)
    m.recordPositionResult(GUITAR, 0, 0, false)
    m.recordPositionResult(GUITAR, 0, 0, false)
    expect(m.getPositionWeight(GUITAR, 0, 0)).toBe(1)
  })

  it('满 3 次后按 1 + 2.5 × (1 − 准确率)：全错 3.5、全对 1、半对 2.25', async () => {
    const m = await fresh()
    // 全错
    for (let i = 0; i < 3; i++) m.recordPositionResult(GUITAR, 0, 0, false)
    expect(m.getPositionWeight(GUITAR, 0, 0)).toBeCloseTo(3.5)
    // 全对
    for (let i = 0; i < 3; i++) m.recordPositionResult(GUITAR, 1, 1, true)
    expect(m.getPositionWeight(GUITAR, 1, 1)).toBe(1)
    // 半对（4 次里 2 次对）
    m.recordPositionResult(GUITAR, 2, 2, true)
    m.recordPositionResult(GUITAR, 2, 2, true)
    m.recordPositionResult(GUITAR, 2, 2, false)
    m.recordPositionResult(GUITAR, 2, 2, false)
    expect(m.getPositionWeight(GUITAR, 2, 2)).toBeCloseTo(2.25)
  })

  it('准确率越低权重越高，且恒在 [1, 3.5] 内', async () => {
    const m = await fresh()
    let prev = -Infinity // 准确率从高到低遍历，权重应逐轮变大
    for (let correctCount = 4; correctCount >= 0; correctCount--) {
      for (let i = 0; i < 4; i++) m.recordPositionResult(GUITAR, correctCount, 0, i < correctCount)
      const w = m.getPositionWeight(GUITAR, correctCount, 0)
      expect(w).toBeGreaterThanOrEqual(1)
      expect(w).toBeLessThanOrEqual(3.5)
      expect(w, `correct=${correctCount}/4（准确率更低）的权重应不低于上一轮`).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = w
    }
  })
})

describe('subscribePositionStats', () => {
  it('每次记录都通知一次；取消订阅后不再通知', async () => {
    const m = await fresh()
    let count = 0
    const unsub = m.subscribePositionStats(() => { count += 1 })
    m.recordPositionResult(GUITAR, 0, 0, true)
    expect(count).toBe(1)
    m.recordPositionResult(GUITAR, 0, 1, true)
    expect(count).toBe(2)
    unsub()
    m.recordPositionResult(GUITAR, 0, 2, true)
    expect(count).toBe(2)
  })

  it('某个 listener 抛错不会影响其它 listener', async () => {
    const m = await fresh()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let ok = 0
    m.subscribePositionStats(() => { throw new Error('boom') })
    m.subscribePositionStats(() => { ok += 1 })
    expect(() => m.recordPositionResult(GUITAR, 0, 0, true)).not.toThrow()
    expect(ok).toBe(1)
    errSpy.mockRestore()
  })
})

describe('loadPositionStats', () => {
  it('读取后 getPositionStat 能拿到数据，且重复调用是幂等的（只读一次存储）', async () => {
    seedStore({ [GUITAR]: { '3-7': { stringIndex: 3, fret: 7, total: 4, correct: 3 } } })
    const m = await fresh()
    await m.loadPositionStats(GUITAR)
    expect(m.getPositionStat(GUITAR, 3, 7)).toMatchObject({ total: 4, correct: 3 })

    const ls = window.localStorage as unknown as { getItem: ReturnType<typeof vi.fn> }
    const callsAfterFirst = ls.getItem.mock.calls.length
    await m.loadPositionStats(GUITAR)
    expect(ls.getItem.mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('flushPositionStats（Web 分支）', () => {
  it('只合并本次涉及的乐器，不覆盖其它乐器已存数据（历史 bug 的护栏）', async () => {
    seedStore({
      [GUITAR]: { '0-0': { stringIndex: 0, fret: 0, total: 5, correct: 5 } },
      [BASS]: { '1-3': { stringIndex: 1, fret: 3, total: 2, correct: 1 } },
    })
    const m = await fresh()
    await m.loadPositionStats(GUITAR)
    m.recordPositionResult(GUITAR, 2, 5, true)
    await m.flushPositionStats()

    const s = readStore()
    expect(s[GUITAR]['0-0']).toEqual({ stringIndex: 0, fret: 0, total: 5, correct: 5 })
    expect(s[GUITAR]['2-5']).toMatchObject({ stringIndex: 2, fret: 5, total: 1, correct: 1 })
    expect(s[BASS]['1-3']).toEqual({ stringIndex: 1, fret: 3, total: 2, correct: 1 })
  })

  it('同一批 flush 里跨乐器的脏键会各自写进对应乐器', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    m.recordPositionResult(BASS, 1, 3, false)
    await m.flushPositionStats()

    const s = readStore()
    expect(s[GUITAR]['0-0']).toMatchObject({ total: 1, correct: 1 })
    expect(s[BASS]['1-3']).toMatchObject({ total: 1, correct: 0 })
  })

  it('写盘失败时保留脏键，恢复后重试仍能写进去（不丢数据）', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 4, 2, true)

    const ls = window.localStorage as unknown as { setItem: ReturnType<typeof vi.fn> }
    const good = ls.setItem.getMockImplementation()!
    ls.setItem.mockImplementation(() => { throw new Error('QuotaExceededError') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await m.flushPositionStats()
    expect(ls.setItem).toHaveBeenCalled()
    errSpy.mockRestore()

    // 恢复写入能力后重试 —— 脏键还在，数据应当补写上
    ls.setItem.mockImplementation(good)
    await m.flushPositionStats()
    expect(readStore()[GUITAR]['4-2']).toMatchObject({ total: 1, correct: 1 })
  })

  it('clear 之后 flush 不会把已清空的乐器写回（脏键被 clear 一并清掉 ⇒ 走「无脏键」早退）', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    await m.clearPositionStats(GUITAR) // 清缓存 + 清脏键
    store.delete(WEB_KEY) // 把 clear 的写盘结果也清掉，便于观察后续是否还有写入

    await m.flushPositionStats()
    expect(store.has(WEB_KEY)).toBe(false)
    // ⚠️ 这里走的是第 88 行的「dirtyKeys.size === 0」早退；89-93 那条
    //    「脏键还在、缓存已空」在公开 API 下不可达（写脏键必同时写缓存，清缓存必同时清脏键）。
  })

  it('脏键为空时不做任何写入', async () => {
    const m = await fresh()
    await m.flushPositionStats()
    expect(store.has(WEB_KEY)).toBe(false)
  })
})

describe('clearPositionStats', () => {
  it('只清指定乐器：缓存与存储里其它乐器都不受影响', async () => {
    seedStore({
      [GUITAR]: { '0-0': { stringIndex: 0, fret: 0, total: 1, correct: 1 } },
      [BASS]: { '1-3': { stringIndex: 1, fret: 3, total: 2, correct: 1 } },
    })
    const m = await fresh()
    await m.loadPositionStats(GUITAR)
    await m.loadPositionStats(BASS)

    await m.clearPositionStats(GUITAR)

    expect(m.getPositionStat(GUITAR, 0, 0)).toBeNull()
    expect(m.getPositionStat(BASS, 1, 3)).toMatchObject({ total: 2, correct: 1 })
    const s = readStore()
    expect(s[GUITAR]).toBeUndefined()
    expect(s[BASS]['1-3']).toMatchObject({ total: 2 })
  })

  it('清空某乐器不会连带丢弃其它乐器待写的增量', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    m.recordPositionResult(BASS, 1, 3, true)

    await m.clearPositionStats(GUITAR)
    await m.flushPositionStats()

    const s = readStore()
    expect(s[GUITAR]).toBeUndefined()
    expect(s[BASS]['1-3']).toMatchObject({ total: 1, correct: 1 })
  })
})
