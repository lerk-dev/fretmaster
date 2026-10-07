/**
 * `lib/audio-settings-effective.ts` —— 音频设置「有效值」的**唯一真相源**。
 *
 * 背景（为什么需要这个 helper）：`lib/store.ts` 的 persist 是浅合并（`audio`
 * 对象整体替换）⇒ 旧版本落盘的数据可能缺字段；而「读音频设置」有三个消费方
 * （设置页显示 / 设置页控件推送 / 启动时同步到后端），三处各自 `?? 默认值`
 * 就会分叉 ⇒ 「界面显示 A、后端收到 B」的静默 bug。
 *
 * 本文件的**第一条**断言是「唯一真相源守卫」：兜底值必须与 store 初值逐字段一致
 * —— 谁改了 `lib/store.ts` 的 audio 初值而忘了 helper，这里立刻红。
 */
import { describe, it, expect } from 'vitest'
import { getEffectiveAudioSettings } from '@/lib/audio-settings-effective'
import { useAppStore } from '@/lib/store'

describe('getEffectiveAudioSettings — 音频设置有效值（唯一真相源）', () => {
  it('🚨 兜底值必须与 store 的 audio 初值逐字段一致（改初值忘了 helper = 界面/后端静默分叉）', () => {
    // 必须是本文件第一条：此刻 store 尚未被任何测试改动（vitest 文件级模块隔离）
    const init = useAppStore.getState().audio
    const eff = getEffectiveAudioSettings(undefined)
    expect(eff.noiseSuppression).toBe(init.noiseSuppression)
    expect(eff.highPass).toBe(init.enableHighPass)
    expect(eff.lowPass).toBe(init.enableLowPass)
    expect(eff.notch50).toBe(init.enableNotch50)
    expect(eff.notch60).toBe(init.enableNotch60)
    expect(eff.inputGain).toBe(init.inputGain)
    expect(eff.bufferSize).toBe(init.bufferSize)
  })

  it('undefined（store 未恢复）→ 返回全套产品默认值', () => {
    expect(getEffectiveAudioSettings(undefined)).toEqual({
      noiseSuppression: 70,
      highPass: true,
      lowPass: true,
      notch50: true,
      notch60: false,
      inputGain: 1,
      bufferSize: 2048,
    })
  })

  it('partial 混合：缺的兜底、有的保留（旧持久化数据）', () => {
    const eff = getEffectiveAudioSettings({
      ...useAppStore.getState().audio,
      noiseSuppression: 0, // falsy-0 必须原样保留（`||` 会把它吃掉——本仓吃过这个亏）
      enableHighPass: false,
      enableNotch60: undefined as unknown as boolean,
      inputGain: 1.5,
    })
    expect(eff.noiseSuppression).toBe(0)
    expect(eff.highPass).toBe(false)
    expect(eff.notch60).toBe(false)
    expect(eff.inputGain).toBe(1.5)
  })

  it('bufferSize：合法值原样保留，undefined / 非法值（旧盘绕过白名单）一律回落 2048', () => {
    const base = useAppStore.getState().audio
    expect(getEffectiveAudioSettings({ ...base, bufferSize: 256 }).bufferSize).toBe(256)
    expect(getEffectiveAudioSettings({ ...base, bufferSize: 4096 }).bufferSize).toBe(4096)
    expect(getEffectiveAudioSettings({ ...base, bufferSize: undefined as unknown as number }).bufferSize).toBe(2048)
    // 999 不在合法集里：不能让 invoke 带着 999 去撞 Rust 的校验（报错被吞、设置静默失效）
    expect(getEffectiveAudioSettings({ ...base, bufferSize: 999 as unknown as number }).bufferSize).toBe(2048)
  })

  it('完整对象原样返回（不篡改任何值）', () => {
    const full = {
      ...useAppStore.getState().audio,
      noiseSuppression: 30,
      enableHighPass: false,
      enableLowPass: true,
      enableNotch50: false,
      enableNotch60: true,
      inputGain: 0.5,
      bufferSize: 1024,
    }
    expect(getEffectiveAudioSettings(full)).toEqual({
      noiseSuppression: 30,
      highPass: false,
      lowPass: true,
      notch50: false,
      notch60: true,
      inputGain: 0.5,
      bufferSize: 1024,
    })
  })
})
