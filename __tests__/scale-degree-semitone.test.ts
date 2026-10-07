/**
 * 音阶练习的「音级标签 → 半音数」解析（`lib/page-theory-functions.ts`）契约测试。
 *
 * ## 为什么单独一个文件
 * 这段逻辑原先**内联在 `app/page.tsx` 的 `processPracticeMatch` 里**（巨石组件、不可单测），
 * 而且是「手写兜底表优先」的错误顺序。它的失效方式是**静默**的：
 *  - 查不到 ⇒ `semitone === undefined` ⇒ `break` ⇒ 当前题永远不推进、不报错；
 *  - 查错 ⇒ 判定要求弹另一个音，练习照常推进。
 * 两种都不会有异常、不会有日志（第二种连日志都没有），只能靠断言穷举把洞钉出来。
 *
 * ## 本文件的三层断言
 *  ① **两处实测缺口**（`#2` 缺失 / `#6` 记错）——直接、可读的回归钉子；
 *  ② **穷举不变量**：全部 76 个音阶 × 每个音级，解析结果必须等于该音阶 `notes[i]`；
 *  ③ **盲区清单**：断言兜底表与对齐表不一致的位置**恰好只有** `#2`/`#6`。
 *     这一条是给未来的人看的：往 `SCALE_MODES` 里加音阶、或改兜底表，都会让它挂，
 *     于是必须回来重读这两处注释、判断是「顺手修好」还是「确实需要这个盲区」。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveScaleDegreeSemitone,
  SCALE_DEGREE_SEMITONE_FALLBACK,
  degreeToSemitone,
} from '@/lib/page-theory-functions'
import { SCALE_MODES } from '@/lib/page-theory-data'

type ScaleLike = { name: string; cat: string; intervals: string[]; notes: number[] }

/** 摊平所有分类下的音阶（同一音阶可能出现在多个分类里，这里不去重） */
const ALL_SCALES: ScaleLike[] = Object.entries(SCALE_MODES).flatMap(([cat, arr]) =>
  (arr as { name: string; intervals: string[]; notes: number[] }[]).map((s) => ({
    name: s.name,
    cat,
    intervals: s.intervals,
    notes: s.notes,
  }))
)

if (ALL_SCALES.length === 0) throw new Error('SCALE_MODES 摊平后为空 —— 数据源结构被改了')

describe('resolveScaleDegreeSemitone —— 实测缺口（这两条就是当初的 bug）', () => {
  const altered = SCALE_MODES.melodicMinorScaleModes.find((s) => s.name === 'Altered')!
  const wholeTone = SCALE_MODES.otherScales.find((s) => s.name === 'Whole Tone')!

  it('数据源没改名（Altered / Whole Tone 是我们钉的两个样本）', () => {
    expect(altered, 'melodicMinorScaleModes 里找不到 Altered').toBeTruthy()
    expect(wholeTone, 'otherScales 里找不到 Whole Tone').toBeTruthy()
    expect(altered.intervals).toContain('#2')
    expect(wholeTone.intervals).toContain('#6')
  })

  it('🚨 缺口①：`#2` 兜底表里根本没有 ⇒ 旧实现返回 undefined ⇒ 题目永不推进', () => {
    // 旧实现在这里就是 undefined，然后 break —— 于是 Altered 这个音阶的练习一题都过不去
    expect(SCALE_DEGREE_SEMITONE_FALLBACK['#2']).toBeUndefined()
    // 新实现走对齐表，拿得到
    expect(resolveScaleDegreeSemitone(altered, '#2')).toBe(3)
    expect(altered.notes[altered.intervals.indexOf('#2')]).toBe(3)
  })

  it('🚨 缺口②：`#6` 兜底表记成 9，Whole Tone 里实际是 10 ⇒ 旧实现要求弹低半音的音', () => {
    expect(SCALE_DEGREE_SEMITONE_FALLBACK['#6']).toBe(9)
    expect(resolveScaleDegreeSemitone(wholeTone, '#6')).toBe(10)
    expect(wholeTone.notes[wholeTone.intervals.indexOf('#6')]).toBe(10)
  })

  it('含 `#2` 的可选音阶不止一个（Altered / Lydian #9 / Lydian Augmented #2 / Diminished Half Whole / Augmented Scale）', () => {
    const names = [...new Set(ALL_SCALES.filter((s) => s.intervals.includes('#2')).map((s) => s.name))].sort()
    expect(names).toEqual([
      'Altered',
      'Augmented Scale',
      'Diminished Half Whole',
      'Lydian #9',
      'Lydian Augmented #2',
    ])
    // 这些音阶逐个都能解析出 #2（而不是 undefined）
    for (const s of ALL_SCALES.filter((x) => x.intervals.includes('#2'))) {
      const i = s.intervals.indexOf('#2')
      expect(resolveScaleDegreeSemitone(s, '#2'), `${s.cat}/${s.name}`).toBe(s.notes[i])
    }
  })
})

describe('resolveScaleDegreeSemitone —— 穷举不变量', () => {
  it('76 个音阶 × 每个音级：解析结果恒等于该音阶对齐表里的 notes[i]', () => {
    let compared = 0
    for (const s of ALL_SCALES) {
      s.intervals.forEach((iv, i) => {
        expect(resolveScaleDegreeSemitone(s, iv), `${s.cat}/${s.name} 的 ${iv}`).toBe(s.notes[i])
        compared++
      })
    }
    // 防止循环被写空（"恒真的护栏"）
    expect(compared).toBeGreaterThan(400)
    expect(new Set(ALL_SCALES.map((s) => s.name)).size).toBeGreaterThanOrEqual(60)
  })

  it('所有音阶的 notes 都在 0..11（这是"查表得到的就是 mod 12 半音数"的前提）', () => {
    const bad: string[] = []
    for (const s of ALL_SCALES) {
      for (const n of s.notes) {
        if (!Number.isInteger(n) || n < 0 || n > 11) bad.push(`${s.cat}/${s.name}: ${n}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('兜底表与对齐表不一致的位置**恰好只有** `#2` 与 `#6`（盲区清单，故意钉住）', () => {
    const disagree = new Set<string>()
    for (const s of ALL_SCALES) {
      s.intervals.forEach((iv, i) => {
        if (SCALE_DEGREE_SEMITONE_FALLBACK[iv] !== s.notes[i]) disagree.add(iv)
      })
    }
    expect([...disagree].sort()).toEqual(['#2', '#6'])
  })
})

describe('resolveScaleDegreeSemitone —— 兜底路径与边界', () => {
  it('音阶 intervals 为空时（generateScaleSequence 会合成 b5/b6 这类标签）走兜底表', () => {
    const synthetic = { intervals: [] as string[], notes: [0, 2, 4, 5, 7, 9, 11] }
    expect(resolveScaleDegreeSemitone(synthetic, '1')).toBe(0)
    expect(resolveScaleDegreeSemitone(synthetic, 'b5')).toBe(6)
    expect(resolveScaleDegreeSemitone(synthetic, 'b6')).toBe(8)
    expect(resolveScaleDegreeSemitone(synthetic, 'b7')).toBe(10)
  })

  it('标签不在音阶里、但兜底表认识 ⇒ 用兜底值（音阶表不能"吃掉"扩展音级）', () => {
    const ionian = SCALE_MODES.basic.find((s) => s.name === 'Major')!
    expect(ionian.intervals).toContain('7')
    expect(ionian.intervals).not.toContain('b7')
    expect(resolveScaleDegreeSemitone(ionian, 'b7')).toBe(10)
    expect(resolveScaleDegreeSemitone(ionian, '#4')).toBe(6)
  })

  it('两边都不认识 ⇒ undefined（调用方据此 break + 告警，绝不能当 0 用）', () => {
    const ionian = SCALE_MODES.basic.find((s) => s.name === 'Major')!
    expect(resolveScaleDegreeSemitone(ionian, 'bb7')).toBeUndefined()
    expect(resolveScaleDegreeSemitone(ionian, '')).toBeUndefined()
    expect(resolveScaleDegreeSemitone(ionian, '不存在的音级')).toBeUndefined()
  })

  it('notes 比 intervals 短时退回兜底而不是越界取 undefined', () => {
    const short = { intervals: ['1', '2', '3'], notes: [0] }
    expect(resolveScaleDegreeSemitone(short, '1')).toBe(0)
    expect(resolveScaleDegreeSemitone(short, '2')).toBe(2) // 兜底表的值
    expect(resolveScaleDegreeSemitone(short, '3')).toBe(4)
  })

  it('畸形输入不抛异常（音阶对象缺字段 / null）', () => {
    expect(resolveScaleDegreeSemitone({}, '1')).toBe(0)
    expect(resolveScaleDegreeSemitone({ intervals: null, notes: null }, '1')).toBe(0)
    expect(
      resolveScaleDegreeSemitone({ intervals: null, notes: null } as never, '1')
    ).toBe(0)
  })
})

describe('与和弦用的 degreeToSemitone 语义不同（防止两张表被合并）', () => {
  it('`9`/`11`/`13` 在本函数是 mod 12 半音，在 degreeToSemitone 里是复合音程', () => {
    const ionian = SCALE_MODES.basic.find((s) => s.name === 'Major')!
    expect(resolveScaleDegreeSemitone(ionian, '9')).toBe(2)
    expect(resolveScaleDegreeSemitone(ionian, '13')).toBe(9)
    // 和弦侧：复合音程，比 mod 12 的值大一个八度
    expect(degreeToSemitone('9')).toBe(14)
    expect(degreeToSemitone('13')).toBe(21)
    expect(degreeToSemitone('9')! - resolveScaleDegreeSemitone(ionian, '9')!).toBe(12)
  })
})

// =====================================================================================
// 接线护栏：上面的测试只能证明**函数**是对的，证明不了**页面真的在用它**。
// 而这次的 bug 现场恰恰在页面里（内联表 + 手写表优先）。所以扫源码钉住接线。
// 自测（见下）保证这条护栏不是恒真：把源码里的调用删掉，判定必须变 false。
// =====================================================================================

/** 从 page.tsx 源码里切出 `case "scale":` 这一段（到 `case "chord_exercise":` 为止） */
function extractScaleCase(src: string): string {
  const start = src.indexOf('case "scale":')
  if (start < 0) return ''
  const end = src.indexOf('case "chord_exercise":', start)
  return end < 0 ? src.slice(start) : src.slice(start, end)
}

/** 该分支是否走了 lib 的音级解析 */
function usesResolveHelper(block: string): boolean {
  return /resolveScaleDegreeSemitone\s*\(/.test(block)
}

describe('接线：app/page.tsx 的音阶分支必须走 lib 的音级解析', () => {
  const pageSrc = fs.readFileSync(path.join(process.cwd(), 'app', 'page.tsx'), 'utf8')
  const scaleCase = extractScaleCase(pageSrc)

  it('自测：抽取器与判定不是恒真的（拿掉调用就判 false）', () => {
    expect(scaleCase.length).toBeGreaterThan(200)
    expect(scaleCase).toContain('scaleExerciseCurrentStep')
    expect(usesResolveHelper(scaleCase)).toBe(true)
    // 负样本：只有函数定义、没有调用 ⇒ 不算接线
    expect(usesResolveHelper('const x = resolveScaleDegreeSemitone // 注释里提一句')).toBe(false)
    expect(usesResolveHelper('const semitone = degreeToSemitoneOfScale[deg]')).toBe(false)
    // 负样本：把真源码里的调用换掉后必须变 false
    expect(
      usesResolveHelper(scaleCase.replace(/resolveScaleDegreeSemitone\s*\(/g, 'legacyLookup('))
    ).toBe(false)
  })

  it('音阶分支用 resolveScaleDegreeSemitone(selectedScale, currentDegree) 取半音', () => {
    expect(scaleCase).toContain('resolveScaleDegreeSemitone(selectedScale, currentDegree)')
  })

  it('页面里不再有第二个真相源（内联的 mod-12 手写表）', () => {
    expect(scaleCase).not.toContain('degreeToSemitoneOfScale')
    // 整份源码里也不该再有这个名字（表已搬进 lib）
    expect(pageSrc).not.toContain('degreeToSemitoneOfScale')
  })

  it('未知音级仍然拒绝推进并告警（不是当成 0 继续跑）', () => {
    expect(scaleCase).toContain('semitone === undefined')
    expect(scaleCase).toMatch(/logger\.warn\(\s*'\[scale\]/)
    expect(scaleCase).toContain('break')
  })
})
