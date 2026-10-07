/**
 * 环境噪声校准（lib/noise-calibration.ts）的契约测试。
 *
 * 这个模块的产出会**直接写进 worklet 的噪声门限**，算法错一格就等于把用户的
 * 可检出电平整体平移：钳制区间写错 → 门限被抬到正常拨弦都过不去（表现为「怎么弹都没反应」）；
 * 分位数口径写错 → 偶发噪声（咳嗽/键盘）把底噪抬起来。
 * 所以下面把「分位数口径」「钳制边界」「样本不足」三件事都逐点钉住。
 *
 * ⚠️ 门限公式这里**不照抄竞品**：GuitarRun 用 `clamp(底噪×3.2, 0.007, 0.045)`，
 * 本项目用 `max(0.0008, 底噪×1.5)`（依据见 worklet 的门限注释）。
 * 照着竞品改成 ×3.2 会让门限抬高约 10dB —— 下面「门限系数必须与 worklet 一致」
 * 一组用例会立刻变红。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  NOISE_FLOOR_PERCENTILE,
  NOISE_FLOOR_MIN,
  NOISE_FLOOR_MAX,
  CALIBRATION_COUNTDOWN_SECONDS,
  CALIBRATION_SAMPLE_MS,
  CALIBRATION_SAMPLE_INTERVAL_MS,
  CALIBRATION_SAMPLE_ROUNDS,
  MIN_CALIBRATION_SAMPLES,
  clampNoiseFloor,
  percentile,
  computeNoiseFloor,
  onsetGateFromNoiseFloor,
  formatNoisePercent,
  runNoiseFloorCalibration,
  type CalibrationRunOptions,
} from '@/lib/noise-calibration'

describe('常量', () => {
  it('分位数与区间边界是被钉住的值', () => {
    expect(NOISE_FLOOR_PERCENTILE).toBe(0.85)
    expect(NOISE_FLOOR_MIN).toBe(0.0015)
    expect(NOISE_FLOOR_MAX).toBe(0.025)
  })

  it('采样参数：3s 倒计时 + 1s 采样，采样间隔能凑够最小样本数', () => {
    expect(CALIBRATION_COUNTDOWN_SECONDS).toBe(3)
    expect(CALIBRATION_SAMPLE_MS).toBe(1000)
    expect(CALIBRATION_SAMPLE_INTERVAL_MS).toBe(20)
    expect(CALIBRATION_SAMPLE_MS / CALIBRATION_SAMPLE_INTERVAL_MS).toBeGreaterThan(
      MIN_CALIBRATION_SAMPLES * 2
    )
  })

  it('采样轮数 = 1 秒 / 20ms = 50（UI 上显示成「采样中 n/50」）', () => {
    expect(CALIBRATION_SAMPLE_ROUNDS).toBe(50)
    expect(CALIBRATION_SAMPLE_ROUNDS).toBe(CALIBRATION_SAMPLE_MS / CALIBRATION_SAMPLE_INTERVAL_MS)
  })
})

describe('percentile —— 最近秩口径', () => {
  it('空数组返回 null', () => {
    expect(percentile([], 0.85)).toBeNull()
  })

  it('单个样本：无论取哪一档都返回它', () => {
    expect(percentile([0.004], 0)).toBe(0.004)
    expect(percentile([0.004], 0.85)).toBe(0.004)
    expect(percentile([0.004], 1)).toBe(0.004)
  })

  it('p=0 取最小、p=1 取最大', () => {
    const s = [0.009, 0.001, 0.005, 0.003, 0.007]
    expect(percentile(s, 0)).toBe(0.001)
    expect(percentile(s, 1)).toBe(0.009)
  })

  it('输入顺序不影响结果（内部自己排序）', () => {
    const a = [0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01]
    const b = [...a].reverse()
    expect(percentile(a, 0.85)).toBe(percentile(b, 0.85))
  })

  it('10 个样本取 0.85 分位 → 索引 round(9*0.85)=8 → 第 9 个（次大）', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentile(s, 0.85)).toBe(9)
  })

  it('🚨 对偶发尖峰稳健：把咳嗽那一下换成最大值也不影响 0.85 分位', () => {
    const steady = Array.from({ length: 50 }, () => 0.004)
    const withSpike = [...steady]
    withSpike[17] = 0.5 // 一声咳嗽
    expect(percentile(steady, 0.85)).toBe(0.004)
    expect(percentile(withSpike, 0.85)).toBe(0.004)
  })

  it('非有限值被剔除，不被当成 0 或 NaN 参与排序', () => {
    expect(percentile([Number.NaN, Infinity, 0.004, 0.006], 0)).toBe(0.004)
    expect(percentile([Number.NaN, Infinity], 0.5)).toBeNull()
  })

  it('p 超出 [0,1] 会被钳住，不越界取到 undefined', () => {
    const s = [0.001, 0.005, 0.009]
    expect(percentile(s, 5)).toBe(0.009)
    expect(percentile(s, -3)).toBe(0.001)
  })
})

describe('clampNoiseFloor —— 钳制区间', () => {
  it('区间内原样返回', () => {
    expect(clampNoiseFloor(0.005)).toBe(0.005)
  })

  it('低于下界 → 抬到下界（房间太安静，再往下压没意义）', () => {
    expect(clampNoiseFloor(0.00001)).toBe(NOISE_FLOOR_MIN)
    expect(clampNoiseFloor(0)).toBe(NOISE_FLOOR_MIN)
  })

  it('高于上界 → 压到上界（否则门限会高到正常拨弦过不去）', () => {
    expect(clampNoiseFloor(0.5)).toBe(NOISE_FLOOR_MAX)
  })

  it('边界值本身是闭区间（恰好等于则原样返回）', () => {
    expect(clampNoiseFloor(NOISE_FLOOR_MIN)).toBe(NOISE_FLOOR_MIN)
    expect(clampNoiseFloor(NOISE_FLOOR_MAX)).toBe(NOISE_FLOOR_MAX)
  })

  it('非有限值回落到下界（不是 NaN，也不是上界）', () => {
    expect(clampNoiseFloor(Number.NaN)).toBe(NOISE_FLOOR_MIN)
    expect(clampNoiseFloor(Infinity)).toBe(NOISE_FLOOR_MIN)
    expect(clampNoiseFloor(-Infinity)).toBe(NOISE_FLOOR_MIN)
  })
})

describe('computeNoiseFloor', () => {
  const steady = (v: number, n = 50) => Array.from({ length: n }, () => v)

  it('安静房间：取到分位值并原样返回（未触边）', () => {
    const r = computeNoiseFloor(steady(0.005))
    expect(r).not.toBeNull()
    expect(r!.raw).toBe(0.005)
    expect(r!.noiseFloor).toBe(0.005)
    expect(r!.sampleCount).toBe(50)
  })

  it('极安静房间：raw 记录真实值，noiseFloor 被抬到下界', () => {
    const r = computeNoiseFloor(steady(0.0002))
    expect(r!.raw).toBe(0.0002)
    expect(r!.noiseFloor).toBe(NOISE_FLOOR_MIN)
  })

  it('嘈杂房间：raw 记录真实值，noiseFloor 被压到上界', () => {
    const r = computeNoiseFloor(steady(0.2))
    expect(r!.raw).toBe(0.2)
    expect(r!.noiseFloor).toBe(NOISE_FLOOR_MAX)
  })

  it('样本不足返回 null（用户中途关了麦克风）', () => {
    expect(computeNoiseFloor([])).toBeNull()
    expect(computeNoiseFloor(steady(0.005, MIN_CALIBRATION_SAMPLES - 1))).toBeNull()
    expect(computeNoiseFloor(steady(0.005, MIN_CALIBRATION_SAMPLES))).not.toBeNull()
  })

  it('样本里的非有限值被剔除后再判样本数', () => {
    const samples = [...steady(0.005, 5), Number.NaN, Infinity]
    // 有效样本只有 5 个，不足 10 → null
    expect(computeNoiseFloor(samples)).toBeNull()
  })

  it('sampleCount 只数有效样本', () => {
    const r = computeNoiseFloor([...steady(0.005, 50), Number.NaN, Number.NaN])
    expect(r!.sampleCount).toBe(50)
  })

  it('一声咳嗽不会抬高结果', () => {
    const samples = steady(0.006)
    samples[3] = 0.3
    expect(computeNoiseFloor(samples)!.noiseFloor).toBe(0.006)
  })
})

describe('onsetGateFromNoiseFloor —— 门限公式必须与 worklet 一致', () => {
  it('常规值：门限 = 底噪 × 1.5', () => {
    expect(onsetGateFromNoiseFloor(0.01)).toBeCloseTo(0.015, 12)
    expect(onsetGateFromNoiseFloor(0.004)).toBeCloseTo(0.006, 12)
  })

  it('底噪极低时落到绝对下限 0.0008（≈ −62 dBFS）', () => {
    expect(onsetGateFromNoiseFloor(0.0001)).toBe(0.0008)
    expect(onsetGateFromNoiseFloor(0)).toBe(0.0008)
  })

  it('下限的切换点：底噪 0.0008/1.5 ≈ 0.000533', () => {
    expect(onsetGateFromNoiseFloor(0.000533)).toBeCloseTo(0.0008, 5)
    expect(onsetGateFromNoiseFloor(0.000534)).toBeGreaterThan(0.0008)
  })

  it('🚨 不是竞品的 ×3.2 公式（照抄会让门限抬高约 10dB）', () => {
    // 若有人把公式改成 clamp(底噪*3.2, 0.007, 0.045)，这一组立刻挂
    expect(onsetGateFromNoiseFloor(0.004)).toBeCloseTo(0.006, 12)
    expect(onsetGateFromNoiseFloor(0.004)).not.toBeCloseTo(0.0128, 4)
  })

  it('两大常量推导出的门限都落在合理范围（不会把正常拨弦挡在门外）', () => {
    // 最安静的许可底噪 → 门限 ≈ 0.00225
    expect(onsetGateFromNoiseFloor(NOISE_FLOOR_MIN)).toBeCloseTo(0.00225, 6)
    // 最嘈杂的许可底噪 → 门限 ≈ 0.0375
    expect(onsetGateFromNoiseFloor(NOISE_FLOOR_MAX)).toBeCloseTo(0.0375, 6)
  })
})

describe('formatNoisePercent', () => {
  it('百分比两位小数', () => {
    expect(formatNoisePercent(0.004)).toBe('0.40%')
    expect(formatNoisePercent(0.0123)).toBe('1.23%')
    expect(formatNoisePercent(0)).toBe('0.00%')
  })
})

// ---------------------------------------------------------------------------
// 时间维度：倒计时 → 采样。用注入的假 sleep 瞬时跑完，不需要真麦克风也不需要真等 4 秒。
// ---------------------------------------------------------------------------

function fakeRunner(
  values: (number | null)[] = [0.004],
  onSleep?: (ms: number, ctl: { cancelled: boolean }) => void
) {
  const sleeps: number[] = []
  const countdown: number[] = []
  const progress: number[][] = []
  const ctl = { cancelled: false }
  let readCount = 0
  let idx = 0
  const options: CalibrationRunOptions = {
    readFrame: () => {
      readCount++
      return values.length > 0 ? values[idx++ % values.length] : 0.004
    },
    sleep: async (ms) => { sleeps.push(ms); onSleep?.(ms, ctl) },
    onCountdown: (s) => { countdown.push(s) },
    onProgress: (sampled, total) => { progress.push([sampled, total]) },
    isCancelled: () => ctl.cancelled,
  }
  return { sleeps, countdown, progress, ctl, options, readCount: () => readCount }
}

describe('runNoiseFloorCalibration —— 时序', () => {
  it('倒计时每秒回调一次 3/2/1，进入采样前再报一次 0', async () => {
    const r = fakeRunner()
    await runNoiseFloorCalibration(r.options)
    expect(r.countdown).toEqual([3, 2, 1, 0])
  })

  it('倒计时是 3 次 1000ms；采样 50 轮只有 49 次间隔（先取样本再等待，最后一轮不白等）', async () => {
    const r = fakeRunner()
    await runNoiseFloorCalibration(r.options)
    expect(r.sleeps.filter((m) => m === 1000)).toHaveLength(CALIBRATION_COUNTDOWN_SECONDS)
    expect(r.sleeps.filter((m) => m === CALIBRATION_SAMPLE_INTERVAL_MS))
      .toHaveLength(CALIBRATION_SAMPLE_ROUNDS - 1)
    expect(r.sleeps).toHaveLength(CALIBRATION_COUNTDOWN_SECONDS + CALIBRATION_SAMPLE_ROUNDS - 1)
    // 总耗时 ≈ 3s + 0.98s（不是 4.02s「每秒都等」的错误实现）
    expect(r.sleeps.reduce((a, b) => a + b, 0)).toBe(3000 + 49 * 20)
  })

  it('采样 50 轮、每轮取一帧；进度依次 1..50 且最后一格是 (50,50)', async () => {
    const r = fakeRunner()
    await runNoiseFloorCalibration(r.options)
    expect(r.readCount()).toBe(CALIBRATION_SAMPLE_ROUNDS)
    expect(r.progress).toHaveLength(CALIBRATION_SAMPLE_ROUNDS)
    expect(r.progress[0]).toEqual([1, CALIBRATION_SAMPLE_ROUNDS])
    expect(r.progress[r.progress.length - 1]).toEqual([CALIBRATION_SAMPLE_ROUNDS, CALIBRATION_SAMPLE_ROUNDS])
    expect(r.progress.map(([n]) => n)).toEqual(r.progress.map((_, i) => i + 1))
    expect(r.progress.every(([, total]) => total === CALIBRATION_SAMPLE_ROUNDS)).toBe(true)
  })
})

describe('runNoiseFloorCalibration —— 结果', () => {
  it('稳定底噪 0.004 → 结果就是 0.004，且样本数记满 50', async () => {
    const res = await runNoiseFloorCalibration(fakeRunner([0.004]).options)
    expect(res).not.toBeNull()
    expect(res!.noiseFloor).toBe(0.004)
    expect(res!.raw).toBe(0.004)
    expect(res!.sampleCount).toBe(CALIBRATION_SAMPLE_ROUNDS)
  })

  it('用的确实是「50 个样本的第 85 分位」——不是第一个、不是最后一个、不是均值', async () => {
    // 50 个递增样本，间隔 0.0002，起点 0.0015（全在钳制区间内，结果不被边界掩盖）
    const values = Array.from({ length: 50 }, (_, i) => 0.0015 + i * 0.0002)
    const res = await runNoiseFloorCalibration(fakeRunner(values).options)
    // 最近秩：round(49 * 0.85) = 42 ⇒ 升序第 43 个
    const expected = 0.0015 + 42 * 0.0002
    expect(res!.raw).toBeCloseTo(expected, 12)
    expect(res!.raw).not.toBeCloseTo(values[0], 9)               // 不是第一帧
    expect(res!.raw).not.toBeCloseTo(values[values.length - 1], 9) // 不是最后一帧
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    expect(res!.raw).not.toBeCloseTo(mean, 6)                     // 不是均值
  })

  it('偶发尖峰（咳嗽）不影响结果', async () => {
    const values = Array.from({ length: 50 }, () => 0.006)
    values[7] = 0.4
    const res = await runNoiseFloorCalibration(fakeRunner(values).options)
    expect(res!.noiseFloor).toBe(0.006)
  })

  it('readFrame 返回 null 的帧被跳过 —— 不能当 0，否则一堆假静音把底噪拉低', async () => {
    const values: (number | null)[] = [
      ...Array.from({ length: 45 }, () => null),
      ...Array.from({ length: 5 }, () => 0.006),
    ]
    const r = fakeRunner(values)
    const res = await runNoiseFloorCalibration(r.options)
    // 有效样本 5 < 10 ⇒ 拒绝出结果，而不是「算出一个很小的值」
    expect(res).toBeNull()
    // 但 50 轮都问过了（链路恢复后要继续能用）
    expect(r.readCount()).toBe(CALIBRATION_SAMPLE_ROUNDS)
  })

  it('恰好 10 个有效样本就能出结果（边界）', async () => {
    const values: (number | null)[] = [
      ...Array.from({ length: CALIBRATION_SAMPLE_ROUNDS - MIN_CALIBRATION_SAMPLES }, () => null),
      ...Array.from({ length: MIN_CALIBRATION_SAMPLES }, () => 0.006),
    ]
    const res = await runNoiseFloorCalibration(fakeRunner(values).options)
    expect(res).not.toBeNull()
    expect(res!.sampleCount).toBe(MIN_CALIBRATION_SAMPLES)
    expect(res!.noiseFloor).toBe(0.006)
  })

  it('一帧都读不到（音频链路已断）⇒ null', async () => {
    const res = await runNoiseFloorCalibration(fakeRunner([null]).options)
    expect(res).toBeNull()
  })
})

describe('runNoiseFloorCalibration —— 中止', () => {
  it('开始前已被取消 ⇒ 立刻返回 null，一次 sleep / readFrame / 倒计时回调都没有', async () => {
    const r = fakeRunner()
    r.ctl.cancelled = true
    const res = await runNoiseFloorCalibration(r.options)
    expect(res).toBeNull()
    expect(r.sleeps).toEqual([])
    expect(r.countdown).toEqual([])
    expect(r.readCount()).toBe(0)
  })

  it('倒计时途中被取消 ⇒ 停在当下，不进采样阶段', async () => {
    let n = 0
    const r = fakeRunner([0.004], (_ms, ctl) => { if (++n === 2) ctl.cancelled = true })
    const res = await runNoiseFloorCalibration(r.options)
    expect(res).toBeNull()
    // 报过 3、报过 2，然后就中止了 —— 不会白报一个 1
    expect(r.countdown).toEqual([3, 2])
    expect(r.sleeps).toEqual([1000, 1000])
    expect(r.readCount()).toBe(0)
  })

  it('采样途中被取消 ⇒ 返回 null（不能拿半截样本出一个「很安静」的假结果）', async () => {
    let n = 0
    const r = fakeRunner([0.0001], (ms, ctl) => {
      if (ms === CALIBRATION_SAMPLE_INTERVAL_MS && ++n === 3) ctl.cancelled = true
    })
    const res = await runNoiseFloorCalibration(r.options)
    expect(res).toBeNull()
    // 第 3 个间隔前共取了 3 帧，之后就 return 了
    expect(r.readCount()).toBe(3)
    expect(r.progress).toHaveLength(3)
  })
})

/**
 * 跨实现护栏：门限公式写在三处（本模块、worklet、lib/pitch-detection.ts），
 * 任何一处被改成都必须三处同步 —— 这里从源码里把系数抠出来比对。
 */
describe('跨实现护栏：门限系数与 worklet 源码一致', () => {
  const ROOT = process.cwd()
  const workletSrc = readFileSync(resolve(ROOT, 'public/js/audio-worklet-processor.js'), 'utf8')

  it('worklet 的门限仍是 max(0.0008, noiseFloor * 1.5)', () => {
    const m = workletSrc.match(/Math\.max\(([\d.]+),\s*this\.noiseFloor\s*\*\s*([\d.]+)\)/)
    expect(m, 'worklet 里找不到门限表达式 —— 被改写了吗？').not.toBeNull()
    expect(Number(m![1])).toBe(0.0008)
    expect(Number(m![2])).toBe(1.5)
  })

  it('护栏自测：把系数改成 3.2 时上面的解析能识别出来（否则护栏形同虚设）', () => {
    const fake = 'const adaptiveThreshold = Math.max(0.0008, this.noiseFloor * 3.2);'
    const m = fake.match(/Math\.max\(([\d.]+),\s*this\.noiseFloor\s*\*\s*([\d.]+)\)/)
    expect(m).not.toBeNull()
    expect(Number(m![2])).toBe(3.2)
    expect(Number(m![2])).not.toBe(1.5)
  })

  it('本模块推出的门限与 worklet 源码表达的公式逐点一致', () => {
    const m = workletSrc.match(/Math\.max\(([\d.]+),\s*this\.noiseFloor\s*\*\s*([\d.]+)\)/)!
    const floor = Number(m[1])
    const ratio = Number(m[2])
    for (const nf of [0.0001, 0.0005, 0.002, 0.004, 0.01, 0.025]) {
      expect(onsetGateFromNoiseFloor(nf)).toBeCloseTo(Math.max(floor, nf * ratio), 12)
    }
  })
})
