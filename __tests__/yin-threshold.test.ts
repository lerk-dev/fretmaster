/**
 * YIN 接受门限的一致性契约
 *
 * 背景（本次修复的核心）：收音路径历史上各用各的门限 ——
 *   worklet 由页面推 0.1 · TS-YIN 默认 0.15 但页面传 0.1 · TS-SOLO 类内硬编码 0.2
 *   （页面推不进去）· Rust 0.12     → 同一段音频结论不同。
 * 更糟的是页面侧的「低频目标」判定（computeLowFrequencyTarget）恒为 false，
 * 且即便生效方向也反了：它给低频下发 **0.05**，而 YIN 的 threshold 是 CMND 上限、
 * **越小越严格** —— 低频反而更难检出（已删除该函数）。
 *
 * 实测依据（.workbuddy/tools/scan-yin-threshold.cjs，峰值 0.05 吉他式谐波）：
 *   七弦低 B 61.74Hz：0.05→71% · 0.1→84% · 0.15→89% · 0.2→89%
 *   贝斯 E1  41.20Hz：0.05→79% · 0.1→84% · 0.15→89% · 0.2→89%
 *   吉他 E2  82.41Hz：0.15 已达 100%
 *   纯白噪误检率在所有门限下均为 0%
 */
import { describe, it, expect } from 'vitest'
import { resolveYinThreshold, LOW_RANGE_STRING_HZ } from '@/lib/pitch-detection'
import { INSTRUMENT_CONFIG } from '@/lib/practice-suggestions'

describe('YIN 门限按乐器音域统一解析', () => {
  it('低频乐器（最低空弦 < 75Hz）放宽到 0.2', () => {
    expect(resolveYinThreshold(30.87)).toBe(0.2) // 五弦贝斯 B0
    expect(resolveYinThreshold(41.2)).toBe(0.2) // 四弦贝斯 E1
    expect(resolveYinThreshold(61.74)).toBe(0.2) // 七弦低 B
  })

  it('吉他等在 75Hz 以上的乐器用 0.15', () => {
    expect(resolveYinThreshold(82.41)).toBe(0.15) // 吉他 E2
    expect(resolveYinThreshold(87.31)).toBe(0.15)
    expect(resolveYinThreshold(196)).toBe(0.15)
  })

  it('方向契约：音域越低，门限越宽松（数值越大）—— 防止再次写反', () => {
    // threshold 是 CMND 上限，越小越严格；低频需要更宽松，故数值必须更大
    expect(resolveYinThreshold(41.2)).toBeGreaterThan(resolveYinThreshold(82.41))
    expect(resolveYinThreshold(61.74)).toBeGreaterThan(resolveYinThreshold(196))
  })

  it('分界点两侧行为与常量一致', () => {
    expect(resolveYinThreshold(LOW_RANGE_STRING_HZ - 0.01)).toBe(0.2)
    expect(resolveYinThreshold(LOW_RANGE_STRING_HZ)).toBe(0.15)
  })

  it('所有已配置乐器都能解析出门限（不会落到 undefined）', () => {
    const seen = new Set<number>()
    for (const cfg of Object.values(INSTRUMENT_CONFIG)) {
      const th = resolveYinThreshold(cfg.lowestStringHz)
      expect([0.15, 0.2]).toContain(th)
      seen.add(th)
    }
    // 至少要覆盖到两类，否则分界逻辑形同虚设
    expect(seen.size).toBe(2)
  })
})
