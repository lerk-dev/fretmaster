/**
 * 「音级 → 半音」单一真相源的契约。
 *
 * ## 背景
 *
 * 2026-10-15 全仓盘点时发现同一份映射存在**六份字面量**（mod-12 语义五份 +
 * 复合音程语义一份），各有各的洞：
 *
 *   ① `lib/page-theory-functions.ts` 的 `intervalToSemitones`
 *   ② `lib/page-theory-data.ts` 的 `DEGREE_TO_SEMITONE`
 *   ③ `lib/page-theory-functions.ts` 的 `SCALE_DEGREE_SEMITONE_FALLBACK`
 *   ④ `lib/page-theory-functions.ts` 的 `degreeToSemitone()`（函数体内联）
 *   ⑤ `app/page.tsx` 的和弦练习点击判定（内联 Record）
 *   ⑥ `app/page.tsx` 的和弦练习 MIDI 判定（内联 Record）
 *
 * 洞的分布：`#2` 只有 ②③④ 有、`b4` 只有 ④ 补了、`bb7` ②③④⑤⑥ 有、
 * `maj7` ②④⑤⑥ 有、双变音记号（`bb4`/`##5`/`##1`）**一份都没有** ——
 * 而 `getScaleNoteNames` 的正则却认得它们，于是「解析得了、查不到半音」⇒ 静默返回空音名。
 *
 * 现已全部收敛到 `lib/degree-semitone.ts` 的**一张**字面量表。
 *
 * ## 本护栏钉住
 *
 * ① 三种 mod-12 出口必须是**同一个对象引用**（不是「值恰好相等」）；
 * ② 复合语义 = 同名单八度 + 12（只对那 7 个复合度数成立）；
 * ③ 源码里不许再出现手写的 `degreeToSemitone` 局部 Record（第六份复活的迹象）；
 * ④ 键集必须覆盖所有已知拼写，且每个值都在 0..11。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEGREE_SEMITONE_MOD12,
  degreeSemitoneMod12,
  degreeToSemitone,
  isCompoundDegree,
} from '@/lib/degree-semitone'
import { intervalToSemitones } from '@/lib/page-theory-functions'
import { DEGREE_TO_SEMITONE } from '@/lib/page-theory-data'
import { SCALE_DEGREE_SEMITONE_FALLBACK } from '@/lib/page-theory-functions'

describe('音级 → 半音：单一真相源', () => {
  it('三种 mod-12 出口是同一个对象引用（不是值恰好相等）', () => {
    expect(intervalToSemitones).toBe(DEGREE_SEMITONE_MOD12)
    expect(DEGREE_TO_SEMITONE).toBe(DEGREE_SEMITONE_MOD12)
    expect(SCALE_DEGREE_SEMITONE_FALLBACK).toBe(DEGREE_SEMITONE_MOD12)
  })

  it('复合语义 = 同名单八度 + 12，且只对那 7 个复合度数成立', () => {
    for (const [deg, mod12] of Object.entries(DEGREE_SEMITONE_MOD12)) {
      const compound = degreeToSemitone(deg)
      expect(compound, `${deg} 在复合语义里查不到`).toBeDefined()
      if (isCompoundDegree(deg)) {
        expect(compound, `${deg} 是复合度数，应等于 mod-12 值 +12`).toBe(mod12 + 12)
      } else {
        expect(compound, `${deg} 不是复合度数，两种语义应同值`).toBe(mod12)
      }
    }
    // 复合度数集合必须恰好是这 7 个（多一个少一个都红）
    const compound = Object.keys(DEGREE_SEMITONE_MOD12).filter(isCompoundDegree).sort()
    expect(compound).toEqual(['#11', '#9', '11', '13', '9', 'b13', 'b9'])
  })

  it('两个查表函数对未知音级都返回 undefined（而不是 0 —— 0 是根音，会静默答对）', () => {
    for (const junk of ['', '?', 'b3b3', 'b#3', '8', 'bb', 'X']) {
      expect(degreeSemitoneMod12(junk), `mod-12 对 ${junk}`).toBeUndefined()
      expect(degreeToSemitone(junk), `复合语义对 ${junk}`).toBeUndefined()
    }
  })

  it('键集覆盖所有已知拼写（含异名同音与双变音记号）', () => {
    const keys = Object.keys(DEGREE_SEMITONE_MOD12).sort()
    // 缺任何一个都会让某个消费方静默拿到 undefined。
    // 顺序按 JS 默认 sort（UTF-16 码元）：`#`(35) < 数字(48+) < 字母(97+)，
    // 且 `##x` 的第二字符也是 `#` ⇒ 排在 `#1x` 之前。
    expect(keys).toEqual([
      '##1', '##5', '#11', '#2', '#4', '#5', '#6', '#9',
      '1', '11', '13', '2', '3', '4', '5', '6', '7', '9',
      'b13', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b9',
      'bb4', 'bb7', 'maj7',
    ])
    expect(keys).toHaveLength(29)
  })

  it('所有值都在 0..11（mod-12 表的定义域）', () => {
    for (const [deg, v] of Object.entries(DEGREE_SEMITONE_MOD12)) {
      expect(Number.isInteger(v) && v >= 0 && v <= 11, `${deg} = ${v} 越界`).toBe(true)
    }
  })

  it('异名同音的取值正确（同一音高的不同拼写必须同值）', () => {
    // 这些是音乐上等音、字典里必须同值的对子
    const equalPairs: [string, string][] = [
      ['b3', '#2'],
      ['b5', '#4'],
      ['b6', '#5'],
      ['b7', '#6'],
      ['bb7', '6'],
      ['b9', 'b2'],
      ['9', '2'],
      ['#9', 'b3'],
      ['11', '4'],
      ['#11', 'b5'],
      ['b13', 'b6'],
      ['13', '6'],
      ['maj7', '7'],
      ['b4', '3'],
      ['bb4', 'b3'],
      ['##5', '6'],
      ['##1', '2'],
    ]
    for (const [a, b] of equalPairs) {
      expect(degreeSemitoneMod12(a), `${a} vs ${b}`).toBe(degreeSemitoneMod12(b))
    }
  })

  it('🚨 源码里不许再出现手写的 degreeToSemitone 局部 Record（第六份复活的迹象）', () => {
    // 判据：形如 `const degreeToSemitone: Record<string, number> = {` 的内联表。
    // 历史上 app/page.tsx 里有两份（和弦练习的点击判定与 MIDI 判定）。
    const files = ['app/page.tsx', 'components/scale-keyboard.tsx', 'components/chord-exercise-keyboard.tsx']
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(
        /const\s+degreeToSemitone\s*:\s*Record<\s*string\s*,\s*number\s*>\s*=/.test(src),
        `${f} 里又出现了内联的「音级 → 半音」表 —— 请改用 lib/degree-semitone.ts 的单一真相源`
      ).toBe(false)
    }
  })
})
