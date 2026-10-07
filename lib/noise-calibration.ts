// 环境噪声校准 —— 让用户**主动量一次**房间底噪，而不是只依赖运行时自适应。
//
// ## 为什么要做
//
// worklet 侧的 noiseFloor 是纯 EMA 自动跟踪（下降快、上升极慢），好坏完全取决于用户环境；
// 而且门限系数（底噪 × 1.5）是当初扫矩阵调出来的，却始终没有一个「量出来的初值」。
// 最典型的痛点：换到一个嘈杂房间后的头十几秒里，底噪还没爬上来，门限偏低 ⇒ 误检。
//
// 竞品 GuitarRun 的做法值得借鉴（见根目录 guitarrun-pitch-analysis.md §3.1）：
// 倒计时 → 采样 1 秒 → 取 85 百分位 → 持久化。本模块实现它的**测量部分**。
//
// ## ⚠️ 只借测量口径，不借门限公式
//
// 它用 `clamp(底噪 × 3.2, 0.007, 0.045)`；我们用 `max(0.0008, 底噪 × 1.5)`。
// 后者是本项目扫过「底噪 × 信号幅度 → 检出率 + 误检率」矩阵后定下的
// （依据写在 public/js/audio-worklet-processor.js 的门限注释里）。
// 照抄它的 ×3.2 会把门限抬高约 10dB，把轻弹直接挡在门外 —— 那正是本项目
// 之前专门修过的问题。所以这里只复用它的**测量方法**，门限仍走本项目自己的公式。

/** 取第 85 百分位：对偶发噪声（咳嗽、键盘、椅子响）比取最大值稳健得多 */
export const NOISE_FLOOR_PERCENTILE = 0.85

/**
 * 校准结果的许可区间（RMS）。
 * 下界 0.0015 ≈ −56 dBFS：低于这个值说明「房间极安静」，再往下压没有意义，
 * 反而会让门限低于信号自身的最低有效电平。
 * 上界 0.025 ≈ −32 dBFS：高于它说明环境噪声已经大到没法练琴，钳住以免门限
 * 被抬到正常拨弦都过不去（用户会表现为「怎么弹都没反应」）。
 *
 * 与 GuitarRun 的两个边界（0.0015 / 0.025）一致 —— 这两个数是关于**物理环境**的，
 * 与算法无关，可以照搬。
 */
export const NOISE_FLOOR_MIN = 0.0015
export const NOISE_FLOOR_MAX = 0.025

/** 倒计时秒数：给用户「别出声」的准备时间 */
export const CALIBRATION_COUNTDOWN_SECONDS = 3

/** 采样时长（ms） */
export const CALIBRATION_SAMPLE_MS = 1000

/** 采样间隔（ms）：20ms ⇒ 1 秒约 50 个样本 */
export const CALIBRATION_SAMPLE_INTERVAL_MS = 20

/** 采样轮数：1 秒 / 20ms ≈ 50 个样本（与 GuitarRun 的 1 秒采样时长对齐） */
export const CALIBRATION_SAMPLE_ROUNDS = Math.max(
  1,
  Math.floor(CALIBRATION_SAMPLE_MS / CALIBRATION_SAMPLE_INTERVAL_MS)
)

/**
 * 样本太少就不出结果。
 * 触发场景：用户在采样途中关掉了麦克风、或音频链路被中断。
 * 这时安静返回 null 让 UI 提示重试，而不是拿 3 个样本算出一个不可信的值。
 */
export const MIN_CALIBRATION_SAMPLES = 10

/** 把任意输入钳到许可区间；非有限值回落到下界 */
export function clampNoiseFloor(value: number): number {
  if (!Number.isFinite(value)) return NOISE_FLOOR_MIN
  return Math.min(NOISE_FLOOR_MAX, Math.max(NOISE_FLOOR_MIN, value))
}

/**
 * 取升序数组的第 `p` 分位（p ∈ [0,1]）。
 *
 * 用**最近秩**口径：索引 = round((n-1) * p)，不做线性插值。
 * 对 1 秒 / 50 个样本的规模，插值与最近秩的差别远小于「哪一秒采的」带来的差别，
 * 取更简单的那个即可（也更好写测试）。
 *
 * @returns 空数组或含非有限值时返回 null
 */
export function percentile(samples: number[], p: number): number | null {
  const clean = samples.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return null

  const sorted = [...clean].sort((a, b) => a - b)
  const clampedP = Math.min(1, Math.max(0, p))
  const index = Math.round((sorted.length - 1) * clampedP)
  return sorted[index]
}

export interface NoiseFloorResult {
  /** 已钳到许可区间的结果，可直接下发给 worklet */
  noiseFloor: number
  /** 钳制前的原始分位值，用于在 UI 上区分「房间就是这样」与「被钳住了」 */
  raw: number
  /** 参与计算的样本数 */
  sampleCount: number
}

/**
 * 从一串 RMS 采样算出环境噪声底。
 *
 * @returns 样本不足（< MIN_CALIBRATION_SAMPLES）或全为非有限值时返回 null
 */
export function computeNoiseFloor(samples: number[]): NoiseFloorResult | null {
  const clean = samples.filter((v) => Number.isFinite(v))
  if (clean.length < MIN_CALIBRATION_SAMPLES) return null

  const raw = percentile(clean, NOISE_FLOOR_PERCENTILE)
  if (raw === null) return null

  return {
    noiseFloor: clampNoiseFloor(raw),
    raw,
    sampleCount: clean.length,
  }
}

/**
 * 噪声底 → 检测门限（RMS）。
 *
 * **与本项目 worklet 的门限公式必须保持一致**：`max(0.0008, 底噪 × 1.5)`
 * （public/js/audio-worklet-processor.js 的 process()，以及 lib/pitch-detection.ts 的
 * adaptiveThreshold 口径）。改动必须同步三处。
 *
 * 注意这是「推导出来的展示值」——真正的门限由 worklet 内部实时计算，
 * 这里只为让用户看到「现在这间屋子大概要多大声音才触发」。
 */
export function onsetGateFromNoiseFloor(noiseFloor: number): number {
  return Math.max(0.0008, noiseFloor * 1.5)
}

/** RMS → 百分比文案（GuitarRun 用的也是百分号，比 −56 dBFS 直观） */
export function formatNoisePercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

// ---------------------------------------------------------------- 时间维度：把「等一秒」抽象掉

/**
 * 校准流程的外部依赖。**全部注入**，这样时序逻辑可以在 vitest 里用假时钟跑，
 * 不需要真麦克风、也不需要真等 4 秒。
 */
export interface CalibrationRunOptions {
  /**
   * 读一帧并返回它的 RMS；返回 null 表示这一帧拿不到
   * （分析节点还没建好、音频链路被中断）—— 会被记成无效样本而不是 0。
   * ⚠️ 不能把「读不到」当成 0：那会让分位数被一堆假静音拉低，量出的底噪偏小。
   */
  readFrame: () => number | null
  /** 等待 ms 毫秒。生产用 setTimeout，测试注入假实现以便瞬时推进 */
  sleep: (ms: number) => Promise<void>
  /** 倒计时回调：先依次报 COUNTDOWN_SECONDS..1，进入采样阶段报一次 0 */
  onCountdown?: (secondsLeft: number) => void
  /** 采样进度回调（已采样轮数, 总轮数），供 UI 显示「采样中 12/50」 */
  onProgress?: (sampled: number, total: number) => void
  /** 返回 true 表示用户中止（中途关掉麦克风 / 关掉面板）⇒ 提前退出并返回 null */
  isCancelled?: () => boolean
}

/**
 * 走完「倒计时 → 采样 → 算分位」全流程。
 *
 * 时序口径（与 GuitarRun 一致）：
 *   1) 倒计时 `CALIBRATION_COUNTDOWN_SECONDS`(3) 秒，每秒回调一次 3 / 2 / 1；
 *   2) 第 4 秒整开始采样，共 `CALIBRATION_SAMPLE_ROUNDS`(50) 轮、轮间 `20ms`。
 * 采样循环是**先取样本再等待**，所以最后一轮不会白等 20ms（总时长 ≈ 1000ms 而不是 1020ms）。
 *
 * @returns
 *   - `null` —— 用户中止 / 有效样本不足 `MIN_CALIBRATION_SAMPLES` / 全是无效值。
 *     调用方应提示「重试」，**不要**把 null 当成「用默认值」：那会让用户以为量准了。
 *   - 否则返回 `NoiseFloorResult`（含钳制前后两个值，UI 可区分「房间就这样」与「被钳住」）。
 */
export async function runNoiseFloorCalibration(
  options: CalibrationRunOptions
): Promise<NoiseFloorResult | null> {
  const { readFrame, sleep, onCountdown, onProgress, isCancelled } = options
  const cancelled = () => isCancelled?.() === true

  if (cancelled()) return null

  for (let s = CALIBRATION_COUNTDOWN_SECONDS; s >= 1; s--) {
    onCountdown?.(s)
    await sleep(1000)
    if (cancelled()) return null
  }
  onCountdown?.(0)

  const samples: number[] = []
  for (let i = 0; i < CALIBRATION_SAMPLE_ROUNDS; i++) {
    const value = readFrame()
    if (typeof value === 'number') samples.push(value)
    onProgress?.(i + 1, CALIBRATION_SAMPLE_ROUNDS)
    if (i < CALIBRATION_SAMPLE_ROUNDS - 1) {
      await sleep(CALIBRATION_SAMPLE_INTERVAL_MS)
      if (cancelled()) return null
    }
  }

  return computeNoiseFloor(samples)
}
