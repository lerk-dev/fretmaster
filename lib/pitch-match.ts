// 练习匹配的纯决策逻辑（从 app/page.tsx 的 processPracticeMatch 抽出）。
//
// 抽出来的原因：五个练习分支（找音 / 音程 / 音阶 / 和弦练习 / 和弦转换）各自重复了
// 同一套「目标频率 → 音分差 → 门限 → 是否命中」，而门限策略有**微妙的差异**
// （找音练习没有"根音 vs 其他音级"之分，一律 25 音分），此前完全无法单测。
// 抽出后：页面只保留"命中之后做什么"（副作用），判定本身变成可测的纯函数。
//
// 注意 getAdjustedCents 是**按八度回绕**的（0~600）：目标音差一个八度也算命中，
// 因为判定的是音级（pitch class）而不是绝对音高。这是有意的行为，不要"顺手修正"。

import { getAdjustedCents } from '@/lib/pitch-detection'
import { intervalToSemitones } from '@/lib/page-theory-functions'

/** 十二平均律：音级半音数（相对 C=0 的 0~11）→ 频率（A4 = 440Hz） */
export function semitoneToFrequency(semitone: number): number {
  return 440 * Math.pow(2, (semitone - 9) / 12)
}

/** 根音 + 音级半音数 → 目标音级半音数（回绕到一个八度内） */
export function targetSemitoneOf(rootSemitone: number, intervalSemitones: number): number {
  return (rootSemitone + intervalSemitones) % 12
}

/**
 * 匹配门限（音分）。**这是被复制了 5 遍的策略，改动必须同步复核所有练习模式。**
 *
 *   - frequency < 110Hz：一律放宽到 35 音分（低音区更难按准）
 *   - degree === '1'（根音）或 degree === null（找音练习，没有音级概念）：25 音分
 *   - 其他音级：15 音分（更严格，避免"糊过去"）
 *   - 最后按用户灵敏度缩放：sensitivity 0 → ×2 最宽松、0.5 → ×1.5、1 → ×1 最严格
 */
export function matchThresholdCents(
  frequency: number,
  degree: string | null,
  sensitivity: number
): number {
  const baseCents = frequency < 110 ? 35 : degree === null || degree === '1' ? 25 : 15
  return baseCents * (2 - sensitivity)
}

export interface PitchMatchInput {
  /** 检测到的频率（Hz） */
  frequency: number
  /** YIN 置信度（0~1） */
  probability: number
  /** 目标音级半音数（0~11） */
  targetSemitone: number
  /** 目标音级字符串（'1' 为根音）；找音练习没有音级概念，传 null */
  degree: string | null
  /** 用户灵敏度（0~1，越大越严格） */
  sensitivity: number
  /** 置信度阈值（概率必须**严格大于**它） */
  confidenceThreshold: number
}

export interface PitchMatchResult {
  matched: boolean
  /** 检测频率与目标频率的音分差（按八度回绕，0~600） */
  adjustedCents: number
  targetFrequency: number
  matchThreshold: number
}

/**
 * 判定是否命中。**两个比较运算符的严格性是有意不同的**：
 *   - 音分差 `<=` 门限：恰好等于门限算命中
 *   - 置信度 `>` 阈值：恰好等于阈值**不算**命中
 *
 * 单独把它抽出来是为了让这两个边界能被**精确测试**：通过 evaluatePitchMatch
 * 无法确定性地构造出"音分差恰好等于门限"的输入（`1200*log2(2^(x/1200))` 有 ~1e-13
 * 浮点抖动），实测把这里的 `<=` 改成 `<`，整个等价矩阵**抓不住**（网格永远落不到那个点）。
 * 直接测这个谓词就钉住了（见 __tests__/pitch-match.test.ts）。
 */
export function isWithinTolerance(
  adjustedCents: number,
  matchThreshold: number,
  probability: number,
  confidenceThreshold: number
): boolean {
  return adjustedCents <= matchThreshold && probability > confidenceThreshold
}

/**
 * 判定「检测到的音高是否命中目标音级」。
 */
export function evaluatePitchMatch(input: PitchMatchInput): PitchMatchResult {
  const targetFrequency = semitoneToFrequency(input.targetSemitone)
  const adjustedCents = getAdjustedCents(input.frequency, targetFrequency)
  const matchThreshold = matchThresholdCents(input.frequency, input.degree, input.sensitivity)
  const matched = isWithinTolerance(
    adjustedCents,
    matchThreshold,
    input.probability,
    input.confidenceThreshold
  )
  return { matched, adjustedCents, targetFrequency, matchThreshold }
}

export interface IntervalMatchInput {
  frequency: number
  probability: number
  /** 根音的音级半音数 */
  rootSemitone: number
  /** 候选音级（来自 intervalDisplay.split(' ')），索引即"完成的第几个音" */
  degrees: string[]
  /** 已完成的索引集合 */
  completedIndexes: number[]
  /** 先找根音模式：根音未完成时只接受根音 */
  findRootFirst: boolean
  sensitivity: number
  confidenceThreshold: number
}

export interface IntervalMatchResult {
  /** 命中的候选索引；null 表示没有命中 */
  matchedIndex: number | null
  /** 命中时的最小音分差；未命中为 Infinity */
  bestCents: number
}

/**
 * 音程练习的"候选里挑最准的一个"。
 *
 * 与原实现的差异仅一处**可证等价**的整理：`rootCompleted` 原本写在循环体内，
 * 但它只依赖 degrees 与 completedIndexes（循环中都不变），故提到循环外。
 */
export function findBestIntervalMatch(input: IntervalMatchInput): IntervalMatchResult {
  const { degrees, completedIndexes } = input
  const rootCompleted = degrees.some((d, i) => d === '1' && completedIndexes.includes(i))

  let matchedIndex: number | null = null
  let bestCents = Infinity

  for (let idx = 0; idx < degrees.length; idx++) {
    const degree = degrees[idx]
    if (completedIndexes.includes(idx)) continue
    if (input.findRootFirst && !rootCompleted && degree !== '1') continue

    const intervalSemitone = intervalToSemitones[degree]
    if (intervalSemitone === undefined) continue

    const targetSemitone = targetSemitoneOf(input.rootSemitone, intervalSemitone)
    const targetFrequency = semitoneToFrequency(targetSemitone)
    const adjustedCents = getAdjustedCents(input.frequency, targetFrequency)
    const matchThreshold = matchThresholdCents(input.frequency, degree, input.sensitivity)

    if (
      adjustedCents <= matchThreshold &&
      adjustedCents < bestCents &&
      input.probability > input.confidenceThreshold
    ) {
      bestCents = adjustedCents
      matchedIndex = idx
    }
  }

  return { matchedIndex, bestCents }
}
