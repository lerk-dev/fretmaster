/**
 * lib/store.ts 的**持久化链路**契约测试。
 *
 * 为什么单独一个文件：`debounceStorage` 是持久化的唯一落盘通道，而它此前
 * 在任何测试里都跑不到 —— 见 __tests__/setup.ts 里那段说明：全局 localStorage 桩
 * 少了 `key`，`storage.key.bind(storage)` 抛 TypeError，`createJSONStorage` 静默
 * 返回 undefined，zustand persist 于是打印 "given storage is currently unavailable"
 * 并**整条写入链路停用**。也就是说：以前所有 store 测试都运行在「持久化关闭」的环境里，
 * 「写得太频繁」与「写丢失」这两类问题不可能被发现。
 *
 * 本文件覆盖两层：
 *  A. `debounceStorage` 单元（自造 Storage，直接观察写入时机与合并语义）；
 *  B. 真实 localStorage 上的 persist 端到端（白名单 / version / migrate / rehydrate）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore, debounceStorage } from '@/lib/store'

const KEY = 'fretmaster-store'
const ls = () => window.localStorage

// ------------------------------------------------------------ 自造 Storage

function makeFakeStorage() {
  const data = new Map<string, string>()
  const log: string[] = []
  const fake: Storage = {
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { log.push(`set:${k}=${v}`); data.set(k, String(v)) },
    removeItem: (k) => { log.push(`rm:${k}`); data.delete(k) },
    clear: () => { log.push('clear'); data.clear() },
    key: (i) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size },
  }
  return { fake, data, log }
}

// -------------------------------------------------------- A. debounceStorage

describe('debounceStorage：300ms 写入合并', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('setItem 不立即落盘，300ms 后才落盘', () => {
    const { fake, data } = makeFakeStorage()
    const s = debounceStorage(fake)

    s.setItem('k', 'v')
    expect(data.has('k')).toBe(false)          // 防抖窗口内未写

    vi.advanceTimersByTime(299)
    expect(data.has('k')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(data.get('k')).toBe('v')
  })

  it('窗口内的多次写入只落最后一次（前几次被丢弃）', () => {
    const { fake, data, log } = makeFakeStorage()
    const s = debounceStorage(fake)

    s.setItem('k', 'a')
    vi.advanceTimersByTime(100)
    s.setItem('k', 'b')
    vi.advanceTimersByTime(100)
    s.setItem('k', 'c')
    vi.advanceTimersByTime(300)

    expect(log).toEqual(['set:k=c'])            // 只有最后一次真正落盘
    expect(data.get('k')).toBe('c')
  })

  it('⚠️ 只有单槽：窗口内写不同 key 会互相顶掉（先写的丢失）', () => {
    const { fake, data } = makeFakeStorage()
    const s = debounceStorage(fake)

    s.setItem('k1', 'a')
    s.setItem('k2', 'b')
    vi.advanceTimersByTime(300)

    expect(data.has('k1')).toBe(false)          // ← 单槽合并的直接后果
    expect(data.get('k2')).toBe('b')
    // 目前整个应用只有一个持久化 key，所以现状无害；新增持久化 key 前必须先改这里
  })

  it('落盘后定时器归零，可继续正常写入', () => {
    const { fake, data } = makeFakeStorage()
    const s = debounceStorage(fake)

    s.setItem('k', 'a')
    vi.advanceTimersByTime(300)
    expect(data.get('k')).toBe('a')

    s.setItem('k', 'b')
    vi.advanceTimersByTime(300)
    expect(data.get('k')).toBe('b')
  })

  it('防抖窗口内 getItem 读到的是**旧值**（读不经过队列）', () => {
    const { fake, data } = makeFakeStorage()
    const s = debounceStorage(fake)
    data.set('k', 'old')

    s.setItem('k', 'new')
    expect(s.getItem('k')).toBe('old')          // ← 待写值不可见

    vi.advanceTimersByTime(300)
    expect(s.getItem('k')).toBe('new')
  })

  it('定时器不泄漏：每次 setItem 都清掉上一个句柄，窗口内只留 1 个存活定时器', () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { fake } = makeFakeStorage()
    const s = debounceStorage(fake)

    s.setItem('k', 'a')
    s.setItem('k', 'b')
    s.setItem('k', 'c')

    // 句柄核算：创建的定时器数 − 显式清掉的数 = 存活数
    expect(setSpy.mock.calls.length - clearSpy.mock.calls.length).toBe(1)
    setSpy.mockRestore()
    clearSpy.mockRestore()
  })

  it('getItem / removeItem / clear / key / length 直接透传给底层 Storage', () => {
    const { fake, data } = makeFakeStorage()
    const s = debounceStorage(fake)
    data.set('x', '1')
    data.set('y', '2')

    expect(s.getItem('x')).toBe('1')
    expect(s.getItem('missing')).toBeNull()
    expect(s.length).toBe(2)
    expect(s.key(0)).toBe('x')

    s.removeItem('x')
    expect(data.has('x')).toBe(false)

    s.clear()
    expect(data.size).toBe(0)
  })

  it('透传方法不依赖调用方的 this（已 bind 到原 Storage）', () => {
    const data = new Map<string, string>([['k', 'v']])
    // 故意用「方法里访问 this」的实现，验证转发时 this 指向正确
    class SelfDependentStorage {
      private d = data
      getItem(k: string) { return this.d.get(k) ?? null }
      setItem(k: string, v: string) { this.d.set(k, v) }
      removeItem(k: string) { this.d.delete(k) }
      clear() { this.d.clear() }
      key(i: number) { return Array.from(this.d.keys())[i] ?? null }
      get length() { return this.d.size }
    }
    const selfDep = new SelfDependentStorage() as unknown as Storage

    const s = debounceStorage(selfDep)
    expect(s.getItem('k')).toBe('v')
    expect(s.length).toBe(1)
    expect(s.key(0)).toBe('k')
    s.removeItem('k')
    expect(data.size).toBe(0)
  })
})

// ------------------------------------------------- B. persist 端到端

describe('persist：真实 localStorage 上的落盘 / 白名单 / 版本迁移', () => {
  beforeEach(() => {
    ls().clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const rawBlob = (): { state: Record<string, unknown>; version: number } =>
    JSON.parse(ls().getItem(KEY)!)

  it('改一个可持久化 slice 后，300ms 落盘到 fretmaster-store（带 version:2）', () => {
    useAppStore.getState().setLanguage('en')
    expect(ls().getItem(KEY)).toBeNull()        // 还在防抖窗口内

    vi.advanceTimersByTime(300)

    const blob = rawBlob()
    expect(blob.version).toBe(2)
    expect((blob.state.user as { language: string }).language).toBe('en')
  })

  it('白名单：瞬时状态绝不落盘，可持久化 slice 才写', () => {
    useAppStore.getState().setActiveTab('stats')
    useAppStore.getState().setDetectedPitch('A4')
    useAppStore.getState().setMetronomeBpm(132)
    vi.advanceTimersByTime(300)

    const state = rawBlob().state
    expect(state).not.toHaveProperty('activeTab')
    expect(state).not.toHaveProperty('detectedPitch')
    expect(state).not.toHaveProperty('isPlaying')
    expect(state).not.toHaveProperty('score')
    expect((state.metronome as { bpm: number }).bpm).toBe(132)
  })

  it('环境噪声校准结果会落盘（audio slice 整块在白名单里）—— 否则每次刷新都要重量一次', () => {
    useAppStore.getState().setNoiseFloor(0.006)
    vi.advanceTimersByTime(300)

    const state = rawBlob().state
    expect((state.audio as { noiseFloor: number }).noiseFloor).toBe(0.006)

    // 清掉（null）时也必须落盘 —— 否则「重置后仍带着旧房间的底噪」
    useAppStore.getState().setNoiseFloor(null)
    vi.advanceTimersByTime(300)
    const cleared = (rawBlob().state.audio as { noiseFloor?: number }).noiseFloor
    expect(cleared === undefined || cleared === null).toBe(true)
  })

  it('rehydrate 能从已有 blob 恢复状态（写入 → 读回的闭环）', async () => {
    useAppStore.getState().setReferenceFrequency(442)
    vi.advanceTimersByTime(300)

    // 先把内存里的状态改掉，再从 blob 恢复
    useAppStore.getState().setReferenceFrequency(440)
    vi.advanceTimersByTime(300)
    expect(useAppStore.getState().practice.referenceFrequency).toBe(440)

    ls().setItem(KEY, JSON.stringify({
      state: { practice: { referenceFrequency: 442 } },
      version: 2,
    }))
    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().practice.referenceFrequency).toBe(442)
  })

  it('老版本 blob（version:1）在 rehydrate 时走 migrate：旧等级 id 被改写', async () => {
    ls().setItem(KEY, JSON.stringify({
      state: { chordProgression: { selectedLevelId: 'voice_led_voice_led_structure_1' } },
      version: 1,
    }))

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().chordProgression.selectedLevelId).toBe('voice_led_structure_1')
  })

  it('已合并掉的旧等级在 rehydrate 时回退默认等级（不留下失效 id）', async () => {
    ls().setItem(KEY, JSON.stringify({
      state: { chordProgression: { selectedLevelId: 'four_chord_tones_3rd_5th_7th_root_3rd' } },
      version: 1,
    }))

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().chordProgression.selectedLevelId).toBe('single_chord_tones_root')
  })

  it('blob 损坏时 rehydrate 不抛异常（走默认 state）', async () => {
    ls().setItem(KEY, '{not json')
    await expect(useAppStore.persist.rehydrate()).resolves.not.toThrow()
  })
})
