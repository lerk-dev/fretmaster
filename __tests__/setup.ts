import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Web Audio API
class MockAudioContext {
  sampleRate = 48000
  state = 'running'
  createAnalyser = vi.fn(() => ({
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    connect: vi.fn(),
  }))
  createScriptProcessor = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null,
  }))
  createGain = vi.fn(() => ({
    gain: { value: 1 },
    connect: vi.fn(),
  }))
  createOscillator = vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { value: 440 },
  }))
  createBiquadFilter = vi.fn(() => ({
    connect: vi.fn(),
    type: 'lowpass',
    frequency: { value: 1000 },
  }))
  destination = {}
  close = vi.fn()
  resume = vi.fn()
  suspend = vi.fn()
}

// Mock AudioWorkletNode
class MockAudioWorkletNode {
  port = {
    onmessage: null,
    postMessage: vi.fn(),
  }
  connect = vi.fn()
  disconnect = vi.fn()
}

global.AudioContext = MockAudioContext as any
global.AudioWorkletNode = MockAudioWorkletNode as any

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve({
      getTracks: () => [{ stop: vi.fn() }],
    })),
    enumerateDevices: vi.fn(() => Promise.resolve([
      { deviceId: 'default', kind: 'audioinput', label: 'Default Microphone' },
    ])),
  },
})

// Mock localStorage
//
// ⚠️ 必须是**完整可用的 Storage**（含 key / length），不能只给几个 vi.fn()：
// zustand 的 persist 在建 store 时会执行 `createJSONStorage(() => debounceStorage(localStorage))`，
// 而 debounceStorage 里要 `storage.key.bind(storage)`；早先的桩没有 key →
// `undefined.bind` 抛 TypeError → createJSONStorage 静默 return undefined →
// persist 打印 "given storage is currently unavailable" 并**整条写入链路停用**：
// 于是「store 落盘」在所有测试里都是空转，覆盖率也永远到不了 debounceStorage。
//
// 仍保留 vi.fn() 包装（多个测试靠 `localStorage.getItem.mockImplementation(...)` 造数据、
// 靠 `expect(localStorage.setItem).toHaveBeenCalledWith(...)` 断言落盘内容），
// 只是给它们补上「内存实现」作为默认行为，使 persist 真正跑起来。
const localStorageStore = new Map<string, string>()
const readLocal = (k: string) => (localStorageStore.has(k) ? localStorageStore.get(k)! : null)
const localStorageMock = {
  getItem: vi.fn((k: string) => readLocal(k)),
  setItem: vi.fn((k: string, v: string) => { localStorageStore.set(k, String(v)) }),
  removeItem: vi.fn((k: string) => { localStorageStore.delete(k) }),
  clear: vi.fn(() => { localStorageStore.clear() }),
  key: vi.fn((i: number) => Array.from(localStorageStore.keys())[i] ?? null),
  get length() { return localStorageStore.size },
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
