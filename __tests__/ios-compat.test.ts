/**
 * lib/ios-compat.ts 的契约测试（此前零测试）。
 *
 * 消费者只有 app/page.tsx:1936（动态 import needsUserInteractionForAudio / handleIOSAudioUnlock）。
 * 本模块做两件事：① 用 UA 判断「是否需要用户交互才能启动音频」；② 提供两个有状态的单例
 * （IOSAudioUnlocker / IOSAudioContextManager）来处理 iOS/Safari 的音频解锁。
 *
 * 本次为**纯护栏**：探针体检未发现真 bug，故只加断言、不改源码。
 * （一处边缘观察：isSafari() 对 iOS 上的 Chrome（CriOS，UA 不含 'chrome'）会返回 true，
 *  但该场景 isIOS() 已为 true，needsUserInteractionForAudio() 结果不受影响，故不处理。）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isIOS,
  isSafari,
  needsUserInteractionForAudio,
  supportsWebAudio,
  getAudioContextClass,
  IOSAudioUnlocker,
  IOSAudioContextManager,
  iosAudioUnlocker,
  iosAudioContextManager,
  handleIOSAudioUnlock,
  showIOSAudioUnlockPrompt,
} from '@/lib/ios-compat'
import { logger } from '@/lib/logger'

const UA = {
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipod: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  android:
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
} as const

function setUA(ua: string, platform = '', maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true })
}

const orig = {
  ua: navigator.userAgent,
  platform: navigator.platform,
  maxTouch: navigator.maxTouchPoints,
  AudioContext: window.AudioContext,
}

/** 一个可控 state 的 AudioContext 替身 */
function makeCtx(initialState: 'running' | 'suspended' = 'running') {
  const ctx = {
    state: initialState as string,
    currentTime: 0,
    destination: {},
    createOscillator: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
    createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
    resume: vi.fn(async () => { ctx.state = 'running' }),
    close: vi.fn(async () => { ctx.state = 'closed' }),
  }
  return ctx
}

beforeEach(() => {
  setUA('Mozilla/5.0', '', 0)
})

afterEach(async () => {
  // 先关掉模块级单例：它是**跨用例共享**的，留着 context 会污染后面「没有已创建上下文」的用例
  await iosAudioContextManager.close()
  setUA(orig.ua, orig.platform, orig.maxTouch)
  Object.defineProperty(window, 'AudioContext', { value: orig.AudioContext, configurable: true, writable: true })
  iosAudioUnlocker.reset()
  document.getElementById('ios-audio-unlock-overlay')?.remove()
})

// --------------------------------------------------------- UA 检测

describe('isIOS / isSafari / needsUserInteractionForAudio', () => {
  it('识别 iPhone / iPad / iPod', () => {
    for (const ua of [UA.iphone, UA.ipad, UA.ipod]) {
      setUA(ua)
      expect(isIOS(), ua.slice(0, 30)).toBe(true)
    }
  })

  it('识别 iPadOS 的伪装（MacIntel + 多点触控）', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)
    expect(isIOS()).toBe(true)
  })

  it('MacIntel 但无多点触控不是 iOS', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)
    expect(isIOS()).toBe(false)
  })

  it('桌面 Chrome / Android 都不是 iOS 也不是 Safari', () => {
    for (const ua of [UA.desktopChrome, UA.android]) {
      setUA(ua)
      expect(isIOS(), ua.slice(0, 30)).toBe(false)
      expect(isSafari(), ua.slice(0, 30)).toBe(false)
      expect(needsUserInteractionForAudio()).toBe(false)
    }
  })

  it('桌面 Safari 需要用户交互', () => {
    setUA(UA.desktopSafari)
    expect(isSafari()).toBe(true)
    expect(needsUserInteractionForAudio()).toBe(true)
  })

  it('needsUserInteractionForAudio == isIOS() || isSafari()', () => {
    for (const ua of Object.values(UA)) {
      setUA(ua)
      expect(needsUserInteractionForAudio(), ua.slice(0, 30)).toBe(isIOS() || isSafari())
    }
  })
})

describe('supportsWebAudio / getAudioContextClass', () => {
  it('jsdom 提供了 AudioContext，故支持 Web Audio', () => {
    expect(supportsWebAudio()).toBe(true)
    expect(getAudioContextClass()).not.toBeNull()
  })

  it('全局既无 AudioContext 也无 webkit 前缀版 → 判定不支持', () => {
    // setup 里 `global.AudioContext = MockAudioContext` 是普通赋值（可写），整体替换即可
    vi.stubGlobal('AudioContext', undefined)
    try {
      expect(supportsWebAudio()).toBe(false)
      // ⚠️ getAudioContextClass 会返回 **undefined**（不是 null）——两侧类型不一致，
      //    调用方必须用 falsy 判断而不是 `=== null`
      expect(getAudioContextClass()).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('不支持 Web Audio 时 createContext 直接返回 null 并记 warn', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => { /* 静音 */ })
    vi.stubGlobal('AudioContext', undefined)
    try {
      const m = new IOSAudioContextManager()
      expect(await m.createContext()).toBeNull()
      expect(m.getContext()).toBeNull()
      expect(m.isReady()).toBe(false)
      expect(warn).toHaveBeenCalledWith('Web Audio API not supported')
    } finally {
      vi.unstubAllGlobals()
      warn.mockRestore()
    }
  })
})

// -------------------------------------------------- IOSAudioUnlocker

describe('IOSAudioUnlocker：解锁状态机', () => {
  it('初始未解锁', () => {
    expect(new IOSAudioUnlocker().isUnlocked()).toBe(false)
  })

  it('未解锁时注册的回调入队、不立即执行；解锁时统一触发并清空', async () => {
    const u = new IOSAudioUnlocker()
    const fired: string[] = []
    u.onUnlock(() => fired.push('a'))
    u.onUnlock(() => fired.push('b'))
    expect(fired).toEqual([])

    expect(await u.unlock(makeCtx() as never)).toBe(true)
    expect(u.isUnlocked()).toBe(true)
    expect(fired).toEqual(['a', 'b'])

    // 队列已清空：再来一次解锁不会重复触发
    u.reset()
    await u.unlock(makeCtx() as never)
    expect(fired).toEqual(['a', 'b'])
  })

  it('已解锁后注册的回调立即执行', async () => {
    const u = new IOSAudioUnlocker()
    await u.unlock(makeCtx() as never)
    const fired: string[] = []
    u.onUnlock(() => fired.push('c'))
    expect(fired).toEqual(['c'])
  })

  it('重复 unlock 幂等（返回 true）', async () => {
    const u = new IOSAudioUnlocker()
    const ctx = makeCtx()
    expect(await u.unlock(ctx as never)).toBe(true)
    expect(await u.unlock(ctx as never)).toBe(true)
  })

  it('解锁失败返回 false、不置解锁、回调保留待下次重试', async () => {
    const u = new IOSAudioUnlocker()
    const fired: string[] = []
    u.onUnlock(() => fired.push('a'))
    const bad = { createOscillator: () => { throw new Error('boom') } } as never
    expect(await u.unlock(bad)).toBe(false)
    expect(u.isUnlocked()).toBe(false)
    expect(fired).toEqual([]) // 失败不触发

    // 下次成功时仍会触发之前注册的回调
    expect(await u.unlock(makeCtx() as never)).toBe(true)
    expect(fired).toEqual(['a'])
  })

  it('suspended 上下文：解锁前先 resume（iOS 上这一步才是真正解锁）', async () => {
    const u = new IOSAudioUnlocker()
    const ctx = makeCtx('suspended')
    expect(await u.unlock(ctx as never)).toBe(true)
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.state).toBe('running')
    expect(u.isUnlocked()).toBe(true)
  })

  it('running 上下文：不调用 resume（省一次无谓的调度）', async () => {
    const u = new IOSAudioUnlocker()
    const ctx = makeCtx('running')
    expect(await u.unlock(ctx as never)).toBe(true)
    expect(ctx.resume).not.toHaveBeenCalled()
  })
})

// ------------------------------------------- IOSAudioContextManager

describe('IOSAudioContextManager：上下文生命周期', () => {
  it('未创建时 getContext 为 null、isReady 为 false', async () => {
    const m = new IOSAudioContextManager()
    expect(m.getContext()).toBeNull()
    expect(m.isReady()).toBe(false)
    await expect(m.unlock()).resolves.toBe(false) // 无 context
  })

  it('非 iOS/Safari：创建后即就绪（running）', async () => {
    const m = new IOSAudioContextManager()
    const ctx = await m.createContext()
    expect(ctx).not.toBeNull()
    expect(m.getContext()).toBe(ctx)
    expect(m.isReady()).toBe(true)
    // running 状态下 unlock 直接返回 true
    expect(await m.unlock()).toBe(true)
  })

  it('iOS + suspended：创建后不就绪，unlock 会 resume 并置为就绪', async () => {
    setUA(UA.iphone)
    // 替换全局 AudioContext 为一个「初始 suspended」的替身（箭头函数不能 new，故用 class）
    class SuspendedAudioContext {
      state = 'suspended'
      currentTime = 0
      destination = {}
      createOscillator = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() })
      createGain = () => ({ gain: { value: 0 }, connect: vi.fn() })
      resume = vi.fn(async () => { this.state = 'running' })
      close = vi.fn(async () => { this.state = 'closed' })
    }
    Object.defineProperty(window, 'AudioContext', { value: SuspendedAudioContext, configurable: true, writable: true })

    const m = new IOSAudioContextManager()
    const ctx = await m.createContext()
    expect(ctx?.state).toBe('suspended')
    expect(m.isReady()).toBe(false)

    expect(await m.unlock()).toBe(true)
    expect(ctx?.state).toBe('running')
    expect(m.isReady()).toBe(true)
  })

  it('close 后清空上下文', async () => {
    const m = new IOSAudioContextManager()
    await m.createContext()
    expect(m.getContext()).not.toBeNull()
    await m.close()
    expect(m.getContext()).toBeNull()
    expect(m.isReady()).toBe(false)
  })

  it('iOS 但上下文已经是 running → 创建后立即就绪（不必等用户交互）', async () => {
    setUA(UA.iphone)
    const m = new IOSAudioContextManager()
    await m.createContext()
    expect(m.isReady()).toBe(true)
  })

  it('AudioContext 构造函数抛错 → 记 error 并返回 null，不把异常抛给调用方', async () => {
    const err = vi.spyOn(logger, 'error').mockImplementation(() => { /* 静音 */ })
    class ThrowingAudioContext {
      constructor() { throw new Error('ctor boom') }
    }
    Object.defineProperty(window, 'AudioContext', { value: ThrowingAudioContext, configurable: true, writable: true })

    const m = new IOSAudioContextManager()
    await expect(m.createContext()).resolves.toBeNull()
    expect(m.getContext()).toBeNull()
    expect(m.isReady()).toBe(false)
    expect(err).toHaveBeenCalledWith('Failed to create audio context:', expect.any(Error))
    err.mockRestore()
  })

  it('unlock 时 resume 失败 → 返回 false 且不置为就绪（可下次重试）', async () => {
    const err = vi.spyOn(logger, 'error').mockImplementation(() => { /* 静音 */ })
    setUA(UA.iphone)
    class RejectResume {
      state = 'suspended'
      currentTime = 0
      destination = {}
      createOscillator = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() })
      createGain = () => ({ gain: { value: 0 }, connect: vi.fn() })
      resume = vi.fn(async () => { throw new Error('resume boom') })
      close = vi.fn(async () => { /* noop */ })
    }
    Object.defineProperty(window, 'AudioContext', { value: RejectResume, configurable: true, writable: true })

    const m = new IOSAudioContextManager()
    await m.createContext()
    expect(await m.unlock()).toBe(false)
    expect(m.isReady()).toBe(false)
    expect(err).toHaveBeenCalledWith('Failed to unlock audio context:', expect.any(Error))
    err.mockRestore()
  })

  it('close 抛错也只是记 error，上下文仍被清空', async () => {
    const err = vi.spyOn(logger, 'error').mockImplementation(() => { /* 静音 */ })
    class BadClose {
      state = 'running'
      currentTime = 0
      destination = {}
      createOscillator = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() })
      createGain = () => ({ gain: { value: 0 }, connect: vi.fn() })
      resume = vi.fn(async () => { /* noop */ })
      close = vi.fn(async () => { throw new Error('close boom') })
    }
    Object.defineProperty(window, 'AudioContext', { value: BadClose, configurable: true, writable: true })

    const m = new IOSAudioContextManager()
    await m.createContext()
    await expect(m.close()).resolves.toBeUndefined()   // 不外抛
    expect(m.getContext()).toBeNull()
    expect(m.isReady()).toBe(false)
    expect(err).toHaveBeenCalledWith('Failed to close audio context:', expect.any(Error))
    err.mockRestore()
  })
})

// ------------------------------------------- handleIOSAudioUnlock

describe('handleIOSAudioUnlock', () => {
  it('非 iOS/Safari 环境直接返回 true', async () => {
    setUA(UA.desktopChrome)
    expect(await handleIOSAudioUnlock()).toBe(true)
  })

  it('iOS 但没有已创建的上下文时返回 false', async () => {
    setUA(UA.iphone)
    expect(await handleIOSAudioUnlock()).toBe(false)
  })

  it('iOS 且上下文 suspended：先弹遮罩，点击后 resume 并返回就绪', async () => {
    setUA(UA.iphone)
    class SuspendedAudioContext {
      state = 'suspended'
      currentTime = 0
      destination = {}
      createOscillator = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() })
      createGain = () => ({ gain: { value: 0 }, connect: vi.fn() })
      resume = vi.fn(async () => { this.state = 'running' })
      close = vi.fn(async () => { this.state = 'closed' })
    }
    Object.defineProperty(window, 'AudioContext', { value: SuspendedAudioContext, configurable: true, writable: true })

    // 走模块级单例（handleIOSAudioUnlock 只认单例）；afterEach 会把它关掉
    await iosAudioContextManager.createContext()
    expect(iosAudioContextManager.getContext()?.state).toBe('suspended')

    const p = handleIOSAudioUnlock()
    const overlay = document.getElementById('ios-audio-unlock-overlay')
    expect(overlay, 'suspended 时必须先弹遮罩等用户点').not.toBeNull()
    overlay!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(await p).toBe(true)
    expect(iosAudioContextManager.isReady()).toBe(true)
    expect(document.getElementById('ios-audio-unlock-overlay')).toBeNull()
  })

  it('iOS 且上下文已 running：不弹遮罩，直接返回是否就绪', async () => {
    setUA(UA.iphone)
    await iosAudioContextManager.createContext()
    expect(await handleIOSAudioUnlock()).toBe(true)
    expect(document.getElementById('ios-audio-unlock-overlay')).toBeNull()
  })
})

// --------------------------------------- showIOSAudioUnlockPrompt

describe('showIOSAudioUnlockPrompt', () => {
  it('插入遮罩层，点击后移除并 resolve', async () => {
    const p = showIOSAudioUnlockPrompt()
    const overlay = document.getElementById('ios-audio-unlock-overlay')
    expect(overlay).not.toBeNull()
    expect(overlay!.innerHTML).toContain('点击屏幕开始')

    overlay!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await p
    expect(document.getElementById('ios-audio-unlock-overlay')).toBeNull()
  })

  it('touchstart 同样能解锁', async () => {
    const p = showIOSAudioUnlockPrompt()
    document
      .getElementById('ios-audio-unlock-overlay')!
      .dispatchEvent(new Event('touchstart', { bubbles: true }))
    await p
    expect(document.getElementById('ios-audio-unlock-overlay')).toBeNull()
  })
})
