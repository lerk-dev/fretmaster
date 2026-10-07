/**
 * 音频设置的「有效值」—— **唯一真相源**（⛔ 铁律 14）。
 *
 * 为什么需要它：`lib/store.ts` 的 persist 是**浅合并**（`audio` 对象整体替换），
 * 旧版本落盘的数据可能缺字段（例如老 blob 没有 `enableNotch60`）。
 * 于是「读音频设置」必须兜底，而兜底值有**三个消费方**：
 *   ① 设置页显示（`components/windows-audio-settings.tsx`）；
 *   ② 设置页控件改动时**立即推送**给后端；
 *   ③ 应用启动时把落盘设置**同步**到后端（`app/page.tsx` 的 restoreAudio）。
 * 若三处各自写 `?? 默认值`，任何一处漏改就是「界面显示 A、后端收到 B」的静默 bug
 * —— 所以统一到这里（组件显示、组件推送、启动同步全部调用本函数）。
 *
 * 🚨 兜底值必须与 `lib/store.ts` 里 audio 切片的**初值**一致，
 * 有守卫测试从运行时 store 的初值反向核对（`__tests__/audio-settings-effective.test.ts`）。
 *
 * 字段名与 `lib/native-audio.ts` 的 `setFilters` 入参同形（`highPass` 而非 `enableHighPass`），
 * 消费方少一层映射、少一个抄错的机会。
 */
import type { AudioSettings } from './store'

export interface EffectiveAudioSettings {
  /** 噪音抑制强度（0-100）。Rust 侧映射为「噪声门相对底噪的倍数」：0→门关闭、70→2.4×、100→3.0× */
  noiseSuppression: number
  /** 高通滤波开关 */
  highPass: boolean
  /** 低通滤波开关 */
  lowPass: boolean
  /** 50Hz 陷波开关 */
  notch50: boolean
  /** 60Hz 陷波开关 */
  notch60: boolean
  /** 输入增益倍率（0.0-2.0，UI 是 0-200%） */
  inputGain: number
  /** 缓冲区大小（帧，合法值 256/512/1024/2048/4096）。Rust 起流时照此设置固定缓冲 */
  bufferSize: number
}

/** 缓冲区合法帧数（与 `lib/store.ts` 的 setBufferSize 校验、Rust `set_buffer_size` 命令三方一致） */
const VALID_BUFFER_SIZES = [256, 512, 1024, 2048, 4096]

/**
 * 把可能残缺的 `audio` 切片补齐成完整有效值。
 *
 * 兜底值（= store 初值，改初值必须同步这里，守卫测试会咬）：
 *   noiseSuppression 70 / highPass true / lowPass true / notch50 true / notch60 false / inputGain 1
 *   / bufferSize 2048（非法值也一律回落到它，与 store.setBufferSize 同口径）
 */
export function getEffectiveAudioSettings(
  audio: AudioSettings | undefined
): EffectiveAudioSettings {
  const rawBuffer = audio?.bufferSize
  return {
    noiseSuppression: audio?.noiseSuppression ?? 70,
    highPass: audio?.enableHighPass ?? true,
    lowPass: audio?.enableLowPass ?? true,
    notch50: audio?.enableNotch50 ?? true,
    notch60: audio?.enableNotch60 ?? false,
    inputGain: audio?.inputGain ?? 1,
    bufferSize:
      typeof rawBuffer === 'number' && VALID_BUFFER_SIZES.includes(rawBuffer)
        ? rawBuffer
        : 2048,
  }
}
