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
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
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
