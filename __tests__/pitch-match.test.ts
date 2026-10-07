/**
 * 练习匹配的纯决策逻辑（lib/pitch-match.ts，从 app/page.tsx 的 processPracticeMatch 抽出）。
 *
 * 重点是 **行为等价矩阵**：下面 `old*` 开头的几个函数是 app/page.tsx 里
 * 被复制了 5 遍的旧写法（逐字抄来当基准），然后用网格枚举
 * （频率 × 音级 × 灵敏度 × 置信度）逐一比对，证明抽出后判定结果逐点相同。
 * 没有这层证明，把 core 判定逻辑从页面里搬走就只能靠"看起来一样"。
 *
 * 边界测试的做法：音分侧是 `adjustedCents <= threshold`（含等号），但通过
 * evaluatePitchMatch **无法确定性**构造出"音分差恰好等于门限"的输入
 * （`1200*log2(2^(x/1200))` 有 ~1e-13 浮点抖动）——实测把 `<=` 改成 `<`，
 * 整个等价矩阵抓不住。所以把判定抽成 `isWithinTolerance` 谓词，直接测边界。
 */
import { describe, it, expect } from 'vitest'
import {
  semitoneToFrequency,
  targetSemitoneOf,
  matchThresholdCents,
  evaluatePitchMatch,
  isWithinTolerance,
  findBestIntervalMatch,
} from '@/lib/pitch-match'
import { getAdjustedCents } from '@/lib/pitch-detection'
import { intervalToSemitones, noteToSemitones } from '@/lib/page-theory-functions'

// ============ 旧实现（逐字抄自 app/page.tsx，作为等价基准）============
const oldTargetFrequency = (targetSemitone: number) => 440 * Math.pow(2, (targetSemitone - 9) / 12)

/** 找音练习的旧门限：没有"根音/其他音级"之分 */
const oldThresholdPitchFinding = (frequency: number, sensitivity: number) =>
  (frequency < 110 ? 35 : 25) * (2 - sensitivity)

/** 音程/音阶/和弦练习的旧门限：根音 25，其他音级 15 */
const oldThresholdWithDegree = (frequency: number, degree: string, sensitivity: number) =>
  (frequency < 110 ? 35 : degree === '1' ? 25 : 15) * (2 - sensitivity)

/** 音程练习的旧"候选里挑最准"循环（逐字抄，仅把 ref 改成显式入参） */
const oldFindBestIntervalMatch = (input: {
  frequency: number
  probability: number
  rootSemitone: number
  degrees: string[]
  completedIndexes: number[]
  findRootFirst: boolean
  sensitivity: number
  confidenceThreshold: number
}) => {
  const intervals = input.degrees
  let matchedIndex: number | null = null
  let minCents = Infinity
  for (let idx = 0; idx < intervals.length; idx++) {
    const interval = intervals[idx]
    if (input.completedIndexes.includes(idx)) continue
    const rootCompleted = intervals.some((intv, i) => intv === '1' && input.completedIndexes.includes(i))
    if (input.findRootFirst && !rootCompleted && interval !== '1') continue

    const intervalSemitone = intervalToSemitones[interval]
    if (intervalSemitone === undefined) continue

    const targetSemitone = (input.rootSemitone + intervalSemitone) % 12
    const targetFrequency = oldTargetFrequency(targetSemitone)
    const adjustedCents = getAdjustedCents(input.frequency, targetFrequency)
    const baseThreshold = input.frequency < 110 ? 35 : interval === '1' ? 25 : 15
    const matchThreshold = baseThreshold * (2 - input.sensitivity)

    if (
      adjustedCents <= matchThreshold &&
      adjustedCents < minCents &&
      input.probability > input.confidenceThreshold
    ) {
      minCents = adjustedCents
      matchedIndex = idx
    }
  }
  return { matchedIndex, bestCents: minCents }
}

const FREQS = [60, 80, 100, 109.9, 110, 110.1, 150, 196, 293.66, 440, 880, 1000]
const DEGREES = ['1', '3', '5', 'b7', '#4']
const SENSITIVITIES = [0, 0.3, 0.5, 0.7, 1]
const PROBABILITIES = [0.5, 0.79, 0.8, 0.81, 0.95]
const CONFIDENCE_THRESHOLDS = [0.5, 0.8, 0.9]

describe('semitoneToFrequency', () => {
  it('A4（音级 9）为 440Hz，C4（音级 0）为 261.63Hz', () => {
    expect(semitoneToFrequency(9)).toBeCloseTo(440, 9)
    expect(semitoneToFrequency(0)).toBeCloseTo(261.6256, 3)
  })

  it('与页面里 5 处内联写法逐点相同', () => {
    for (let st = 0; st < 12; st++) {
      expect(semitoneToFrequency(st)).toBe(oldTargetFrequency(st))
    }
  })
})

describe('targetSemitoneOf', () => {
  it('根音 + 音级回绕到一个八度内', () => {
    expect(targetSemitoneOf(0, 0)).toBe(0)
    expect(targetSemitoneOf(0, 7)).toBe(7)
    expect(targetSemitoneOf(9, 7)).toBe(4) // A + 纯五度 → E
    expect(targetSemitoneOf(11, 1)).toBe(0) // B + 半音 → C
  })
})

describe('matchThresholdCents', () => {
  it('低频（<110Hz）一律 35 音分基准', () => {
    for (const sens of SENSITIVITIES) {
      expect(matchThresholdCents(109.9, '3', sens)).toBeCloseTo(35 * (2 - sens), 9)
      expect(matchThresholdCents(80, null, sens)).toBeCloseTo(35 * (2 - sens), 9)
    }
  })

  it('110Hz 及以上：根音 25、其他音级 15', () => {
    expect(matchThresholdCents(110, '1', 1)).toBe(25)
    expect(matchThresholdCents(110, '3', 1)).toBe(15)
    expect(matchThresholdCents(440, '1', 1)).toBe(25)
    expect(matchThresholdCents(440, 'b7', 1)).toBe(15)
  })

  it('degree = null（找音练习）按 25 处理', () => {
    for (const freq of [110, 150, 440, 1000]) {
      expect(matchThresholdCents(freq, null, 1)).toBe(25)
    }
  })

  describe('等价矩阵：与页面里两套旧写法逐点相同', () => {
    it('找音练习的口径（degree = null）', () => {
      for (const freq of FREQS) {
        for (const sens of SENSITIVITIES) {
          expect(matchThresholdCents(freq, null, sens)).toBeCloseTo(
            oldThresholdPitchFinding(freq, sens),
            9
          )
        }
      }
    })

    it('音程/音阶/和弦练习的口径（带音级）', () => {
      for (const freq of FREQS) {
        for (const degree of DEGREES) {
          for (const sens of SENSITIVITIES) {
            expect(matchThresholdCents(freq, degree, sens)).toBeCloseTo(
              oldThresholdWithDegree(freq, degree, sens),
              9
            )
          }
        }
      }
    })
  })

  it('灵敏度 0 / 0.5 / 1 分别对应 ×2 / ×1.5 / ×1', () => {
    expect(matchThresholdCents(440, '1', 0)).toBe(50)
    expect(matchThresholdCents(440, '1', 0.5)).toBe(37.5)
    expect(matchThresholdCents(440, '1', 1)).toBe(25)
  })
})

describe('isWithinTolerance（判定谓词：两个边界的严格性不同）', () => {
  it('音分差恰好等于门限 → 命中（含等号）', () => {
    expect(isWithinTolerance(15, 15, 0.9, 0.8)).toBe(true)
    expect(isWithinTolerance(0, 25, 0.9, 0.8)).toBe(true)
    expect(isWithinTolerance(35, 35, 0.9, 0.8)).toBe(true)
  })

  it('音分差略超门限 → 不命中', () => {
    expect(isWithinTolerance(15.0000001, 15, 0.9, 0.8)).toBe(false)
    expect(isWithinTolerance(15.1, 15, 0.9, 0.8)).toBe(false)
  })

  it('置信度恰好等于阈值 → 不命中（严格大于）', () => {
    expect(isWithinTolerance(0, 25, 0.8, 0.8)).toBe(false)
    expect(isWithinTolerance(0, 25, 0.8000001, 0.8)).toBe(true)
  })

  it('两个条件必须同时满足', () => {
    expect(isWithinTolerance(15.1, 15, 0.99, 0.8)).toBe(false) // 音分超
    expect(isWithinTolerance(15, 15, 0.79, 0.8)).toBe(false) // 置信度不足
    expect(isWithinTolerance(15, 15, 0.81, 0.8)).toBe(true)
  })
})

describe('evaluatePitchMatch', () => {
  it('等价矩阵：与页面旧写法逐点相同（含音级口径与找音口径）', () => {
    let checked = 0
    for (const frequency of FREQS) {
      for (const degree of DEGREES) {
        for (const sensitivity of SENSITIVITIES) {
          for (const probability of PROBABILITIES) {
            for (const confidenceThreshold of CONFIDENCE_THRESHOLDS) {
              for (const targetSemitone of [0, 4, 7, 11]) {
                const oldThreshold = oldThresholdWithDegree(frequency, degree, sensitivity)
                const oldTarget = oldTargetFrequency(targetSemitone)
                const oldCents = getAdjustedCents(frequency, oldTarget)
                const oldMatched = oldCents <= oldThreshold && probability > confidenceThreshold

                const r = evaluatePitchMatch({
                  frequency,
                  probability,
                  targetSemitone,
                  degree,
                  sensitivity,
                  confidenceThreshold,
                })

                expect(r.adjustedCents).toBe(oldCents)
                expect(r.matchThreshold).toBeCloseTo(oldThreshold, 9)
                expect(r.targetFrequency).toBe(oldTarget)
                expect(r.matched).toBe(oldMatched)
                checked++
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(3000) // 确认网格真的跑满了
  })

  it('找音练习口径（degree = null）也逐点等价', () => {
    for (const frequency of FREQS) {
      for (const sensitivity of SENSITIVITIES) {
        for (const probability of PROBABILITIES) {
          const oldThreshold = oldThresholdPitchFinding(frequency, sensitivity)
          const oldCents = getAdjustedCents(frequency, oldTargetFrequency(7))
          const oldMatched = oldCents <= oldThreshold && probability > 0.8

          const r = evaluatePitchMatch({
            frequency,
            probability,
            targetSemitone: 7,
            degree: null,
            sensitivity,
            confidenceThreshold: 0.8,
          })
          expect(r.matched).toBe(oldMatched)
        }
      }
    }
  })

  it('命中同一音级：音分差为 0 → 命中', () => {
    const target = semitoneToFrequency(4) // E
    const r = evaluatePitchMatch({
      frequency: target,
      probability: 0.9,
      targetSemitone: 4,
      degree: '3',
      sensitivity: 0.5,
      confidenceThreshold: 0.8,
    })
    expect(r.adjustedCents).toBe(0)
    expect(r.matched).toBe(true)
  })

  it('差一个八度也算命中（判定的是音级，不是绝对音高）', () => {
    const target = semitoneToFrequency(4)
    const r = evaluatePitchMatch({
      frequency: target * 2,
      probability: 0.9,
      targetSemitone: 4,
      degree: '3',
      sensitivity: 0.5,
      confidenceThreshold: 0.8,
    })
    expect(r.adjustedCents).toBe(0)
    expect(r.matched).toBe(true)
  })

  it('音分超出门限（非根音、灵敏度 1）不命中', () => {
    const target = semitoneToFrequency(4)
    const off = target * Math.pow(2, 15.6 / 1200) // 约 15.6 音分，超过 15
    const r = evaluatePitchMatch({
      frequency: off,
      probability: 0.99,
      targetSemitone: 4,
      degree: '3',
      sensitivity: 1,
      confidenceThreshold: 0.8,
    })
    expect(r.matchThreshold).toBe(15)
    expect(r.adjustedCents).toBeGreaterThan(15)
    expect(r.matched).toBe(false)
  })

  it('同一音分差下：根音比非根音更容易命中（25 vs 15 音分）', () => {
    const target = semitoneToFrequency(4)
    const off = target * Math.pow(2, 20 / 1200) // 20 音分
    const base = {
      frequency: off,
      probability: 0.99,
      targetSemitone: 4,
      sensitivity: 1,
      confidenceThreshold: 0.8,
    }
    expect(evaluatePitchMatch({ ...base, degree: '3' }).matched).toBe(false)
    expect(evaluatePitchMatch({ ...base, degree: '1' }).matched).toBe(true)
  })

  it('置信度是严格大于：恰好等于阈值不算命中', () => {
    const target = semitoneToFrequency(4)
    const base = {
      frequency: target,
      targetSemitone: 4,
      degree: '3',
      sensitivity: 0.5,
      confidenceThreshold: 0.8,
    }
    expect(evaluatePitchMatch({ ...base, probability: 0.8 }).matched).toBe(false)
    expect(evaluatePitchMatch({ ...base, probability: 0.8000001 }).matched).toBe(true)
  })

  it('低频时同一个偏差更容易命中（门限 35 而不是 15）', () => {
    const lowTarget = semitoneToFrequency(4) / 4 // ~82Hz
    const off = lowTarget * Math.pow(2, 30 / 1200) // 30 音分
    const r = evaluatePitchMatch({
      frequency: off,
      probability: 0.99,
      targetSemitone: 4,
      degree: '3',
      sensitivity: 1,
      confidenceThreshold: 0.8,
    })
    expect(r.matchThreshold).toBe(35)
    expect(r.matched).toBe(true)
  })
})

describe('findBestIntervalMatch', () => {
  const baseInput = {
    probability: 0.99,
    rootSemitone: 0, // 根音 C
    completedIndexes: [] as number[],
    findRootFirst: false,
    sensitivity: 0.5,
    confidenceThreshold: 0.8,
  }

  it('在候选里挑音分差最小的那个', () => {
    // 目标音级 ['1','3','5'] → C(0), E(4), G(7)；弹一个略高于 E 的音
    const e = semitoneToFrequency(4)
    const r = findBestIntervalMatch({
      ...baseInput,
      frequency: e * Math.pow(2, 5 / 1200), // 偏 5 音分
      degrees: ['1', '3', '5'],
    })
    expect(r.matchedIndex).toBe(1)
    expect(r.bestCents).toBeCloseTo(5, 0)
  })

  it('跳过已完成的索引', () => {
    const c = semitoneToFrequency(0)
    const r = findBestIntervalMatch({
      ...baseInput,
      frequency: c,
      degrees: ['1', '3'],
      completedIndexes: [0], // 根音已完成 → 只剩 '3'
    })
    expect(r.matchedIndex).toBeNull()
  })

  it('先找根音模式：根音未完成时只接受根音', () => {
    const e = semitoneToFrequency(4)
    const r = findBestIntervalMatch({
      ...baseInput,
      frequency: e,
      degrees: ['1', '3'],
      findRootFirst: true,
    })
    expect(r.matchedIndex).toBeNull() // 根音未完成，'3' 被跳过

    const c = semitoneToFrequency(0)
    const r2 = findBestIntervalMatch({
      ...baseInput,
      frequency: c,
      degrees: ['1', '3'],
      findRootFirst: true,
    })
    expect(r2.matchedIndex).toBe(0)
  })

  it('根音已完成后再弹其他音级就能命中', () => {
    const e = semitoneToFrequency(4)
    const r = findBestIntervalMatch({
      ...baseInput,
      frequency: e,
      degrees: ['1', '3'],
      completedIndexes: [0],
      findRootFirst: true,
    })
    expect(r.matchedIndex).toBe(1)
  })

  it('置信度不足时不命中', () => {
    const c = semitoneToFrequency(0)
    const r = findBestIntervalMatch({
      ...baseInput,
      frequency: c,
      degrees: ['1', '3'],
      probability: 0.8, // 严格大于才算
    })
    expect(r.matchedIndex).toBeNull()
    expect(r.bestCents).toBe(Infinity)
  })

  it('音级表里不存在的 token 被跳过（不抛异常）', () => {
    const c = semitoneToFrequency(0)
    const r = findBestIntervalMatch({
      ...baseInput,
      frequency: c,
      degrees: ['??', '1'],
    })
    expect(r.matchedIndex).toBe(1)
  })

  it('等价矩阵：与页面里的旧循环逐点相同', () => {
    const degreeSets = [
      ['1', '3', '5'],
      ['1', 'b3', '5', 'b7'],
      ['3', '5'],
    ]
    const completedSets = [[], [0], [0, 1]]
    let checked = 0
    for (const degrees of degreeSets) {
      for (const completedIndexes of completedSets) {
        for (const findRootFirst of [false, true]) {
          for (const sensitivity of [0, 0.5, 1]) {
            for (const probability of [0.7, 0.85]) {
              for (const freq of [80, 130.81, 164.81, 196, 246.94, 293.66, 329.63, 392]) {
                const input = {
                  frequency: freq,
                  probability,
                  rootSemitone: 0,
                  degrees,
                  completedIndexes,
                  findRootFirst,
                  sensitivity,
                  confidenceThreshold: 0.8,
                }
                const oldR = oldFindBestIntervalMatch(input)
                const newR = findBestIntervalMatch(input)
                expect(newR.matchedIndex).toBe(oldR.matchedIndex)
                expect(newR.bestCents).toBe(oldR.bestCents)
                checked++
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('noteToSemitones 能解析根音（抽出的函数依赖它）', () => {
    expect(noteToSemitones['C']).toBe(0)
    expect(noteToSemitones['A']).toBe(9)
  })
})
