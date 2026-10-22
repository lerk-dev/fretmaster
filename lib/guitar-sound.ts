/**
 * 指板点击的反馈音：**真实钢弦木吉他采样** + 一层很薄的采样播放器。
 *
 * ## 为什么不用合成音
 *
 * 之前是 880Hz 正弦（对）/ 220Hz 锯齿（错）两个振荡器。它们只是「提示音」，
 * 和吉他没关系；而点击指板这个动作本身就该听到吉他。
 *
 * ## 素材（CC0，可商用、无需署名）
 *
 * - 源：`ferrosintesis-samples-orchestral` v0.1.0 的 `samples/steel_*.wav`
 * - 原始录音：Discord SFZ GM Bank `026-Acoustic Guitar (steel)`，
 *   2017 Martin HD28 Vintage Series，作者 Jeff Learman，**CC0 / 公有领域**
 *   （许可证写在乐器 .sfz 的头注释里，仓库级 LICENSE 不适用）
 *   https://github.com/kinwie/Discord-SFZ-GM-Bank
 * - 裁切脚本：`scripts/build-guitar-samples.py`（单声道 32kHz、0.7s、峰值 −3dBFS；
 *   按仓库策略**未入库**——`.gitignore` 统一排除 `*.py`，与 deploy_router.py 同待遇）
 * - 产物：`public/sounds/guitar/steel_<音名>.wav`，8 个音共约 350KB
 *   🚨 文件名不能带 `#`（A#2/A#3 一律写成等音 Bb2/Bb3）：URL 里 `#` 是片段分隔符，
 *      浏览器会把 `steel_A#2.wav` 请求成 `steel_A` ⇒ 404 ⇒ 整批加载失败退回合成音。
 *      实测踩过：6 个 200 + 2 个 404，界面听感直接退回提示音。
 *
 * ## 为什么是 8 个采样而不是 1 个
 *
 * 用 `playbackRate` 改音高，偏得越多越像「放慢的磁带」。8 个采样按 6 个半音
 * 一个间隔铺满 E2–B5（吉他常用音域），最近邻取样的移调量不超过 ±3 个半音
 * （速率 0.84–1.19），听感上没有明显失真。
 *
 * ## 为什么要自己写播放器
 *
 * 只是「一次性触发一个采样」，Tone.js 那类框架（200KB+）在这里完全是负担；
 * 现有的 AudioContext 是共享的（见 use-feedback-sound 的注释），
 * 这里只多做三件事：取最近采样、算播放速率、加一个包络/低通。
 *
 * ## 加载失败必须能退回合成音
 *
 * 采样是**可选增强**：Tauri `file://`、路由器的缓存、广告拦截都可能让 fetch 失败。
 * `ensureGuitarSamples()` 永不 reject（失败记成空表并只告警一次），
 * `playGuitarPluck()` 同步返回 false ⇒ 调用方退回原来的振荡器提示音，
 * 绝不出现「点了没声音」。
 */

import { getStringTuning } from '@/lib/string-tuning'

/** 单个采样的下载超时：44KB 的文件，6 秒已经极宽，超了就当这份采样不可用 */
const SAMPLE_FETCH_TIMEOUT_MS = 6_000
import { logger } from '@/lib/logger'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

/** 采样清单：文件名 + 该采样的 MIDI 音高（C4 = 60）。 */
export const GUITAR_SAMPLES = [
  { file: 'steel_E2.wav', midi: 40 },
  { file: 'steel_Bb2.wav', midi: 46 },
  { file: 'steel_E3.wav', midi: 52 },
  { file: 'steel_Bb3.wav', midi: 58 },
  { file: 'steel_E4.wav', midi: 64 },
  { file: 'steel_B4.wav', midi: 71 },
  { file: 'steel_F5.wav', midi: 77 },
  { file: 'steel_B5.wav', midi: 83 },
] as const

/**
 * 采样目录（**相对路径**）。
 *
 * 🚨 不能写绝对路径 `/sounds/...`：`next.config.mjs` 设了 `assetPrefix: './'`，
 * 桌面版（Tauri）与路由器部署各自有不同的基路径，绝对路径会 404。
 */
export const GUITAR_SOUND_DIR = 'sounds/guitar/'

/** 已解码的采样：按 AudioContext 缓存（同一个 ctx 只解码一次）。 */
const loadedByCtx = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>()
/** 加载中的 promise：并发调用只发一轮请求。 */
const loadingByCtx = new WeakMap<BaseAudioContext, Promise<void>>()
let warnedFailure = false

/**
 * 取**最近**的采样与播放速率。
 *
 * @param midi 目标音高（C4 = 60）
 * @returns `rate = 2^(Δ/12)`；Δ 超过 ±6 个半音才可能发生（音域外）
 */
export function pickGuitarSample(midi: number): { file: string; rootMidi: number; rate: number } {
  let best: { file: string; midi: number } = GUITAR_SAMPLES[0]
  let bestDistance = Math.abs(midi - best.midi)
  for (const sample of GUITAR_SAMPLES) {
    const distance = Math.abs(midi - sample.midi)
    if (distance < bestDistance) {
      best = sample
      bestDistance = distance
    }
  }
  return { file: best.file, rootMidi: best.midi, rate: Math.pow(2, (midi - best.midi) / 12) }
}

/** 标准六弦（高音弦 → 低音弦）的空弦 MIDI：E4 B3 G3 D3 A2 E2。 */
const OPEN_STRING_MIDI = [64, 59, 55, 50, 45, 40] as const

/**
 * 「第几根弦 + 第几品」→ MIDI 音高。
 *
 * 只拿到音级（`getNoteAtPosition` 返回 `"C♯"` 不带八度）没法确定音高，
 * 而点击反馈音要听起来像「刚才点的那个音」⇒ 用弦号定位八度：
 * 以标准调弦的空弦 MIDI 为基准，按**当前调弦的音级**修正到最近的那个八度
 * （drop-D 的低音弦会自动落到 D2 而不是 E2）。
 *
 * @param stringIndex 0 = 最高音弦
 * @param fret        品（0 = 空弦）
 * @param tuning      各弦空弦音级（不传则用全局调弦）
 */
export function guitarPositionToMidi(stringIndex: number, fret: number, tuning?: readonly number[]): number | null {
  if (!Number.isFinite(stringIndex) || !Number.isFinite(fret) || fret < 0) return null
  // 与 `getNoteAtPosition()` 同源：不传调弦就用全局调弦（用户在设置里改过调弦时也一致）
  const table = tuning ?? getStringTuning()
  const pitchClass = table[stringIndex]
  if (pitchClass === undefined) return null
  // 超出六弦的乐器（7/8 弦）以低音 E 继续向下推算，避免直接放弃
  const nominal = OPEN_STRING_MIDI[stringIndex] ?? 40 - 5 * (stringIndex - 5)
  let delta = ((pitchClass - nominal) % 12 + 12) % 12
  if (delta > 6) delta -= 12
  return nominal + delta + Math.round(fret)
}

/** 该 ctx 上已解码好的采样（没加载过 / 加载失败都返回 null）。 */
export function getGuitarSamples(ctx: BaseAudioContext): Map<string, AudioBuffer> | null {
  const map = loadedByCtx.get(ctx)
  return map && map.size > 0 ? map : null
}

/**
 * 载入并解码全部采样（同一 ctx 只做一次，**永不 reject**）。
 *
 * 失败时把空表记进缓存：避免每次点击都重试一轮 8 个请求。
 */
export function ensureGuitarSamples(ctx: BaseAudioContext): Promise<void> {
  const done = loadingByCtx.get(ctx)
  if (done) return done

  const run = (async () => {
    const map = new Map<string, AudioBuffer>()
    const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
    await Promise.all(
      GUITAR_SAMPLES.map(async ({ file }) => {
        const url = new URL(GUITAR_SOUND_DIR + file, base).toString()
        const res = await fetchWithTimeout(url, {}, SAMPLE_FETCH_TIMEOUT_MS)
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
        const bytes = await res.arrayBuffer()
        const buffer = await ctx.decodeAudioData(bytes)
        map.set(file, buffer)
      })
    )
    loadedByCtx.set(ctx, map)
  })().catch((e) => {
    loadedByCtx.set(ctx, new Map())
    if (!warnedFailure) {
      warnedFailure = true
      // 只记一次：这是可选增强，失败要退回合成音而不是刷屏（logger.debug 在非 dev 下静默）
      logger.debug('吉他采样加载失败，反馈音退回合成提示音：', e)
    }
  })

  loadingByCtx.set(ctx, run)
  return run
}

export interface PlayPluckOptions {
  /** 目标音高（C4 = 60）；缺省用 A3（220Hz 附近），保证有声音 */
  midi?: number
  /** 闷音：给「答错」用，低通 + 快速衰减 */
  muted?: boolean
  /** 0–1，默认正确音 0.45 / 闷音 0.3（采样峰值已归一化到 −3dBFS，这里再压一档） */
  volume?: number
}

/**
 * 播放一次吉他拨弦（**同步**：采样已就绪就直接播，否则返回 false）。
 *
 * 返回 false 的两种情形（调用方应退回合成音）：
 *   - 采样还没加载完（首帧）；
 *   - 加载失败（该 ctx 上已记为空表）。
 */
export function playGuitarPluck(ctx: BaseAudioContext, options: PlayPluckOptions = {}): boolean {
  const buffers = getGuitarSamples(ctx)
  if (!buffers) return false

  const { midi = 57, muted = false, volume } = options
  const { file, rate } = pickGuitarSample(midi)
  const buffer = buffers.get(file)
  if (!buffer) return false

  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate

    const gain = ctx.createGain()
    const now = ctx.currentTime
    const peak = volume ?? (muted ? 0.3 : 0.45)

    // 短促的起音 + 指数衰减：采样本身带自然衰减，闷音时人为掐短
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(peak, now + 0.006)
    const release = muted ? 0.18 : Math.min(buffer.duration / Math.max(rate, 0.01), 0.65)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + release)

    if (muted) {
      // 掌闷音：砍掉高频、只留「噗」的一下
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(700, now)
      filter.Q.setValueAtTime(0.7, now)
      source.connect(filter)
      filter.connect(gain)
    } else {
      source.connect(gain)
    }
    gain.connect(ctx.destination)

    source.start(now)
    source.stop(now + release + 0.02)
    return true
  } catch (e) {
    logger.debug('播放吉他采样失败，退回合成提示音：', e)
    return false
  }
}

/** 仅供测试：清掉某 ctx 的缓存（生产代码不该调用）。 */
export function __resetGuitarSamplesForTest(ctx?: BaseAudioContext): void {
  if (ctx) {
    loadedByCtx.delete(ctx)
    loadingByCtx.delete(ctx)
  }
  warnedFailure = false
}
