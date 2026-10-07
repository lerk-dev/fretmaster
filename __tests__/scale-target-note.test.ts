/**
 * 音阶练习判定真相源（`lib/scale-target-note.ts`）契约测试。
 *
 * ## 它锁的是什么
 * 音阶练习有两条输入路径 —— **点击指板**与 **MIDI/麦克风**。判定必须是同一个函数，
 * 否则「用鼠标点对了、用琴弹却判错」（或反之）。本文件把两条路径共用的
 * `resolveScaleTargetNoteIndex` 钉死，并**穷举**全部音阶 × 全部音级。
 *
 * ## 为什么要穷举（而不是钉几个例子）
 * 2026-10-07 修的那个 bug 是：点击路径用一张**硬编码「半音 → 音级标签」反查表**，
 * 表里只有降号侧（`b5`/`b6`/`b3`…）。而音级标签是**异名同音**的，升号侧
 * （`#4`/`#5`/`#2`…）永远比不上 ⇒ 弹对了判错，且不报任何错。
 * 实测 76 个音阶里 **22 个**受影响，含最常用的 Lydian 与 Blues。
 *
 * 例子钉不住这类 bug（补一个例子就能绿），只有穷举能：
 * 「对每个音阶，点它自己 `notes[i]` 那个音必须判对」覆盖了全部同音异名的组合。
 *
 * ## 反向钉子
 * 最后一条用「老反查表」的语义（`semitone → 降号侧标签`）复算，断言它在这些音阶上
 * **确实**会判错 —— 证明这条用例集有能力抓住原 bug，而不是恰好都通过。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { resolveScaleTargetNoteIndex } from '@/lib/scale-target-note'
import { getNoteIndex } from '@/lib/page-theory-functions'
import { SCALE_MODES } from '@/lib/page-theory-data'

type ScaleLike = { name: string; cat: string; intervals: string[]; notes: number[] }

const ALL_SCALES: ScaleLike[] = Object.entries(SCALE_MODES).flatMap(([cat, arr]) =>
  (arr as { name: string; intervals: string[]; notes: number[] }[]).map((s) => ({
    name: s.name,
    cat,
    intervals: s.intervals,
    notes: s.notes,
  }))
)

if (ALL_SCALES.length === 0) throw new Error('SCALE_MODES 摊平后为空 —— 数据源结构被改了')

/** 老 bug 的反查表（`app/page.tsx` 点击路径里曾硬编码的那一张，只有降号侧）。 */
const LEGACY_SEMITONE_TO_DEGREE: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
}

const KEY = 'C'

/** 用老反查表复算：点音阶自己的第 i 个音，会不会判对？ */
function legacyJudgesCorrect(s: { intervals: string[]; notes: number[] }, i: number): boolean {
  const clickedInterval = s.notes[i] % 12
  return LEGACY_SEMITONE_TO_DEGREE[clickedInterval] === s.intervals[i]
}

describe('resolveScaleTargetNoteIndex —— 穷举：点音阶自己的音必须判对', () => {
  it('全部音阶 × 全部音级：目标音名下标 === notes[i]（主音 C）', () => {
    const failures: string[] = []
    for (const s of ALL_SCALES) {
      for (let i = 0; i < s.intervals.length; i++) {
        const got = resolveScaleTargetNoteIndex(s, s.intervals[i], KEY)
        const want = (getNoteIndex(KEY) + s.notes[i]) % 12
        if (got !== want) {
          failures.push(`${s.cat}/${s.name} 第${i}音 ${s.intervals[i]}: got=${got} want=${want}`)
        }
      }
    }
    // 扫描下限：音阶数据/抽取被改坏 ⇒ 这个数会塌下来，而不是「空集恒通过」
    expect(ALL_SCALES.length, '音阶数量过少，数据源可能已变').toBeGreaterThanOrEqual(50)
    expect(failures).toEqual([])
  })

  it('主音非 C 时整体平移正确（F♯ 作主音，跨八度取模）', () => {
    // 取一个含 #4 的音阶（Lydian），用 F# 当主音 ⇒ 目标应落在 C（F#+6 = C）
    const lydian = SCALE_MODES.majorScaleModes.find((s) => s.name === 'Lydian')!
    expect(lydian.intervals).toContain('#4')
    const idx = lydian.intervals.indexOf('#4')
    const target = resolveScaleTargetNoteIndex(lydian, '#4', 'F#')
    expect(target).toBe((getNoteIndex('F#') + lydian.notes[idx]) % 12)
    // 落到具体音名上：F# 的 #4 = C
    expect(target).toBe(getNoteIndex('C'))
  })

  it('认不出的标签返回 undefined（而不是 0 —— 当 0 会「弹主音就推进」）', () => {
    const major = SCALE_MODES.majorScaleModes.find((s) => s.name === 'Ionian')!
    expect(resolveScaleTargetNoteIndex(major, '这个标签不存在', 'C')).toBeUndefined()
  })
})

describe('反向钉子：老反查表在这些音阶上确实会判错', () => {
  it('Lydian 的 #4 用老反查表必被判成 b5（最常用的音阶之一）', () => {
    const lydian = SCALE_MODES.majorScaleModes.find((s) => s.name === 'Lydian')!
    const i = lydian.intervals.indexOf('#4')
    expect(i).toBeGreaterThanOrEqual(0)
    // 老表把 6 半音一律叫 b5，而 Lydian 的第 i 个音叫 #4 ⇒ 比对失败
    expect(LEGACY_SEMITONE_TO_DEGREE[lydian.notes[i] % 12]).toBe('b5')
    expect(legacyJudgesCorrect(lydian, i)).toBe(false)
    // 新真相源必须判对
    expect(resolveScaleTargetNoteIndex(lydian, '#4', KEY)).toBe((getNoteIndex(KEY) + lydian.notes[i]) % 12)
  })

  it('受影响音阶数量与明细（回归哨兵：数字变小说明修好了，变大说明又退化）', () => {
    const broken: string[] = []
    for (const s of ALL_SCALES) {
      for (let i = 0; i < s.intervals.length; i++) {
        if (!legacyJudgesCorrect(s, i)) { broken.push(`${s.cat}/${s.name}:${s.intervals[i]}`); break }
      }
    }
    // 实测 76 个音阶里 22 个受影响（2026-10-07）。修好之后**不再有人走老表**，
    // 但这条断言留着：如果哪天有人把老表请回来，它立刻红。
    expect(broken.length, '受影响音阶数偏离基线 22 —— 数据源或被改').toBe(22)
    expect(broken).toContain('majorScaleModes/Lydian:#4')
    expect(broken).toContain('otherScales/Blues:#4')
    // Whole Tone 的 #4/#5/#6 三个音全错（break 只记第一个，故按前缀断言）
    expect(broken.some((b) => b.startsWith('otherScales/Whole Tone'))).toBe(true)
    // 同名音阶在不同分组里拼写不同（升号侧 / 降号侧），两组都得覆盖到 —— 只修一半的话会漏
    expect(broken.some((b) => b.startsWith('melodicMinorScaleModes/Altered'))).toBe(true)
  })
})

describe('源码级护栏：判定路径不许再出现「半音 → 音级标签」反查表', () => {
  // 上面的运行时断言再全，也拦不住有人在 `app/page.tsx` 里再手写一张反查表
  // （那正是 2026-10-07 修掉的 bug 的形态，而且它**能编译、能跑、只是判错**）。
  // 所以补一条文本级护栏：判定文件里不许再出现那张表的痕迹。
  const ROOT = process.cwd()

  it('app/page.tsx 里不再有 semitoneToDegree 反查表', () => {
    const body = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8')
    expect(body).not.toMatch(/semitoneToDegree/)
    // 那条降号侧反查表的指纹：`6: "b5"` 这类连续映射
    expect(body).not.toMatch(/6:\s*"b5"/)
  })

  it('三条判定路径都调用同一个真相源（调用点数量 = 2：点击 + MIDI）', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8')
    const calls = page.match(/resolveScaleTargetNoteIndex\s*\(/g) ?? []
    // 铁律 #20：数**调用点**、断言**具体数字**，不是 length >= 1
    expect(calls.length, 'app/page.tsx 里 resolveScaleTargetNoteIndex 的调用点数应为 2（点击 + MIDI）').toBe(2)
  })
})

describe('源码级护栏：麦克风（音阶）路径也必须走真相源', () => {
  // 点击/MIDI 两条路径都好测（有接线断言、可穷举）；**麦克风**路径藏在
  // `handlePitchDetected` 里，靠一堆 ref 取值，运行时几乎测不到 —— 而 2026-10-07
  // 修的正是这一处：它直接用 `intervalToSemitones`（缺 `#2`/`maj7`）解析音级标签，
  // 含 `#2` 的音阶解析出 undefined ⇒ `return` ⇒ **弹对了没反应、且不报错**。
  // 所以这里用文本级护栏把它钉住。
  const ROOT = process.cwd()

  /**
   * 切出 `handlePitchDetected` 里 `currentActiveTab === 'scale'` 这一支，并**剥掉整行注释**。
   *
   * 剥注释这步不是洁癖：分支里的注释**会提到** `intervalToSemitones`（就是在解释
   * 为什么不能用它），不剥的话「分支里不含 intervalToSemitones」这条断言会被自己的
   * 注释命中 —— 实测就是这么红的。
   */
  function extractMicScaleBranch(src: string): string {
    const start = src.indexOf("currentActiveTab === 'scale'")
    if (start < 0) return ''
    const end = src.indexOf('currentActiveTab ===', start + 30)
    const raw = end < 0 ? src.slice(start, start + 2000) : src.slice(start, end)
    return raw
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n')
  }

  it('音阶分支改用 resolveScaleDegreeSemitone(selectedScaleRef.current, ...)', () => {
    const branch = extractMicScaleBranch(fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8'))
    // 扫描下限：切不出来就说明结构变了，别让「空串不含 X」假通过
    expect(branch.length).toBeGreaterThan(200)
    expect(branch).toContain('scaleExerciseCurrentStepRef.current')
    expect(branch).toContain('resolveScaleDegreeSemitone(selectedScaleRef.current, currentDegree)')
    expect(branch).not.toContain('intervalToSemitones')
  })

  it('intervalToSemitones 只剩和弦三处（音阶那处已迁走）', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8')
    const uses = page.match(/intervalToSemitones\[/g) ?? []
    // 铁律 #20：断言**具体数字**。和弦三处（和弦序列 / 和弦音级 / 练习等级度数映射）
    // 经穷举确认**不含** `#2`/`maj7`，所以用 `intervalToSemitones` 是安全的；
    // 数字变 4 ⇒ 有人又在音阶处用了它。
    expect(uses.length, 'intervalToSemitones[ 的调用点数应为 3（全是和弦路径）').toBe(3)
  })
})
