/**
 * useAudioDeviceEnumeration（从 app/page.tsx 搬出 hooks/ 后的回归网）。
 *
 * 这个函数是 38 行 I/O 编排：枚举 → 与已有列表比对 → 有变化才写回 →
 * 顺带纠正"当前选中设备已失效"。此前藏在组件里、零测试覆盖，
 * 而它决定「麦克风列表与默认设备」是否正确 —— 抽成 hook 后可以打桩 navigator 来测。
 *
 * 打桩方式说明：__tests__/setup.ts 用 `Object.defineProperty(navigator, 'mediaDevices', ...)`
 * （未开 configurable）装了全局 mock，因此**不能**再重新定义 navigator.mediaDevices；
 * 但那个 mock 上的 enumerateDevices 是普通属性，可以直接 mockResolvedValue 改写。
 *
 * 「navigator.mediaDevices 不存在」那条分支：属性删不掉，但可以**整体替换 navigator**
 * （`vi.stubGlobal('navigator', { mediaDevices: undefined })`），已在下面覆盖。
 * （旧注释写「无法覆盖」，是只想到了改属性这一条路。）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { useAudioDeviceEnumeration } from '@/hooks/use-audio-device-enumeration'
import { useAppStore } from '@/lib/store'
import { logger } from '@/lib/logger'
import { renderHook, unmountAllHooks } from './helpers/render-hook'

const dev = (deviceId: string, label = ''): MediaDeviceInfo =>
  ({ deviceId, label, kind: 'audioinput', groupId: '', toJSON: () => ({}) }) as unknown as MediaDeviceInfo

/** setup.ts 装的 mock 上的 enumerateDevices（可直接改返回值） */
const enumerateMock = navigator.mediaDevices.enumerateDevices as unknown as ReturnType<typeof vi.fn>

const setEnumerated = (devices: MediaDeviceInfo[]) => enumerateMock.mockResolvedValue(devices)

const store = () => useAppStore.getState()

const seedStore = (devices: MediaDeviceInfo[], selectedAudioDevice: string) => {
  act(() => {
    useAppStore.setState({
      audioDevice: { devices, initializing: false, error: null },
      audio: { ...store().audio, selectedAudioDevice },
    })
  })
}

const run = async (showNotification = false) => {
  const hook = renderHook(() => useAudioDeviceEnumeration())
  await act(async () => {
    await hook.current.enumerateAudioDevices(showNotification)
  })
  return hook
}

beforeEach(() => {
  enumerateMock.mockReset()
  seedStore([], '')
})

afterEach(() => {
  unmountAllHooks()
})

describe('useAudioDeviceEnumeration', () => {
  it('store 还没有设备列表时：写入列表并自动选中第一个', async () => {
    setEnumerated([dev('d1', '内置麦克风'), dev('d2', 'USB 麦克风')])
    await run()

    expect(store().audioDevice.devices.map((d) => d.deviceId)).toEqual(['d1', 'd2'])
    expect(store().audio.selectedAudioDevice).toBe('d1')
  })

  it('设备列表没变时不再写回（避免无谓更新触发重渲染）', async () => {
    seedStore([dev('d1')], 'd1')
    setEnumerated([dev('d1')])

    const devicesRef = store().audioDevice.devices
    await run()

    expect(store().audioDevice.devices).toBe(devicesRef) // 引用未变 = 没写回
    expect(store().audio.selectedAudioDevice).toBe('d1')
  })

  it('设备列表顺序变化不算变化（两侧都先排序再比对）', async () => {
    // 关键：store 里存的顺序必须**不是字典序**，否则"排不排序"结果一样，
    // 这条断言会变成空断言（我第一版就是这么写的，变异测试直接漏掉了 m5）。
    seedStore([dev('d2'), dev('d1')], 'd1')
    setEnumerated([dev('d2'), dev('d1')])

    const before = store().audioDevice.devices
    await run()
    expect(store().audioDevice.devices).toBe(before) // 引用未变 = 没写回
  })

  it('设备列表变化时写回', async () => {
    seedStore([dev('d1')], 'd1')
    setEnumerated([dev('d1'), dev('d2')])

    await run()
    expect(store().audioDevice.devices.map((d) => d.deviceId)).toEqual(['d1', 'd2'])
  })

  it('当前选中设备已消失 → 自动切到列表第一个', async () => {
    seedStore([dev('d1')], 'gone')
    setEnumerated([dev('d1'), dev('d2')])

    await run()
    expect(store().audio.selectedAudioDevice).toBe('d1')
  })

  it('当前选中设备仍在 → 不改变选择', async () => {
    seedStore([dev('d1'), dev('d2')], 'd2')
    setEnumerated([dev('d1'), dev('d2')])

    await run()
    expect(store().audio.selectedAudioDevice).toBe('d2')
  })

  it('过滤掉非 audioinput 与没有 deviceId 的条目', async () => {
    setEnumerated([
      dev('d1'),
      { deviceId: 'v1', kind: 'videoinput', label: '', groupId: '', toJSON: () => ({}) } as unknown as MediaDeviceInfo,
      dev('', '空 id'),
    ])

    await run()
    expect(store().audioDevice.devices.map((d) => d.deviceId)).toEqual(['d1'])
  })

  it('枚举结果为空：写入空列表，但不会自动选设备', async () => {
    seedStore([dev('d1')], 'd1')
    setEnumerated([])

    await run()
    expect(store().audioDevice.devices).toEqual([])
    expect(store().audio.selectedAudioDevice).toBe('d1') // 保持原值，不写空
  })

  it('枚举抛错时不向外抛（内部 catch）', async () => {
    enumerateMock.mockRejectedValue(new Error('permission denied'))
    await expect(run()).resolves.toBeDefined()
  })

  it('showNotification = true 也不改变行为（只多打日志）', async () => {
    seedStore([dev('d1')], 'd1')
    setEnumerated([dev('d1'), dev('d2')])

    await run(true)
    expect(store().audioDevice.devices.map((d) => d.deviceId)).toEqual(['d1', 'd2'])
  })

  it('showNotification = true 且设备被移除时：多打一条「移除了 N 个」日志', async () => {
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => { /* 静音 */ })
    seedStore([dev('d1'), dev('d2')], 'd1')
    setEnumerated([dev('d1')])   // d2 消失 ⇒ removedCount = 1

    await run(true)
    expect(store().audioDevice.devices.map((d) => d.deviceId)).toEqual(['d1'])
    const logged = debug.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).toContain('移除了 1 个音频设备')
    expect(logged).not.toContain('检测到 1 个新音频设备')   // 是「移除」不是「新增」
    debug.mockRestore()
  })

  it('navigator 上没有 mediaDevices → 直接返回，不枚举也不写 store', async () => {
    // 真机降级场景：老浏览器 / 非安全上下文里压根没有这个 API。
    // setup 装的 mediaDevices 是 configurable:false ⇒ 改属性这条路是死的，整体换 navigator。
    //
    // ⚠️ 不能只断言 `enumerateMock 未被调用`：enumerateMock 绑在**旧** navigator 对象上，
    //    整体替换 navigator 之后它必然没被调用 —— 哪怕守卫被删掉、代码改用新 navigator
    //    去访问 undefined.enumerateDevices 抛 TypeError（那条断言仍会过）。
    //    真正能咬住守卫的是「连异常都没有」：删掉守卫后必抛，被内部 catch 记 console.error。
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    vi.stubGlobal('navigator', { mediaDevices: undefined, userAgent: 'jsdom' })
    try {
      seedStore([dev('keep')], 'keep')
      setEnumerated([dev('d9', '不该被枚举到')])

      const hook = renderHook(() => useAudioDeviceEnumeration())
      await act(async () => { await hook.current.enumerateAudioDevices(true) })

      expect(consoleErr).not.toHaveBeenCalled()
      expect(enumerateMock).not.toHaveBeenCalled()
      expect(store().audioDevice.devices.map((d) => d.deviceId)).toEqual(['keep'])
      expect(store().audio.selectedAudioDevice).toBe('keep')
    } finally {
      vi.unstubAllGlobals()
      consoleErr.mockRestore()
    }
  })
})
