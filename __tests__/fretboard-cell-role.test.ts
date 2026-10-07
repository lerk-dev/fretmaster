/**
 * lib/fretboard-cell-role.ts 的契约测试。
 *
 * 这个模块是「一个格子在当前题目下是什么角色」的**唯一真相源** —— 经典皮肤
 * （components/practice-fretboard.tsx）与 GuitarRun 皮肤（components/guitarrun-fretboard.tsx）
 * 都靠它。它错了，两套皮肤会一起错；它只错了优先级，两套皮肤会**各自**错得不一样。
 *
 * 因此这里重点钉两类东西：
 *   ① **落点矩阵**：每种练习类型下，哪些格子是什么角色；
 *   ② **优先级**：多个条件同时成立时谁赢（点错 > 根音、品区限制 > 题目高亮 …）。
 *      也就是「缝隙证明」—— 每条优先级用例都构造出「两个条件同时为真」的格子，
 *      删掉任何一半判定，用例都会挂。随手写的单条件断言是咬不住回归的。
 *
 * ⚠️ 定位格子一律用**半音序号**（`getNoteIndex`），不要用音名字符串比较 ——
 * `getNoteAtPosition` 的写法（♯ / ♭）不由本模块决定，拿 'C#' 去比会静默找不到格子。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  resolveFretCellRole,
  scaleDegreeLabel,
  SCALE_SEMITONE_DEGREE_FALLBACK,
  type FretboardRoleContext,
  type ThreeNpsPreviewKind,
} from '@/lib/fretboard-cell-role'
import { getNoteIndex } from '@/lib/page-theory-functions'
import { INTERVALS, SCALE_MODES } from '@/lib/page-theory-data'

type ScaleEntry = { name: string; notes: number[]; intervals: string[] }

const ALL_SCALES = Object.values(SCALE_MODES).flat() as unknown as ScaleEntry[]
const MAJOR = SCALE_MODES.basic.find((s) => s.name === 'Major') as unknown as ScaleEntry

/** 标准调弦（高→低）E B G D A E；弦索引 0 = 最高音弦 */
const STANDARD = [4, 11, 7, 2, 9, 4]

const pc = (note: string) => getNoteIndex(note)
/** 相对根音的半音（0..11） */
const relPc = (note: string, key: string) => ((pc(note) - pc(key)) % 12 + 12) % 12

function ctx(patch: Partial<FretboardRoleContext> = {}): FretboardRoleContext {
  return {
    activeTab: 'chord',
    isPlaying: false,
    showAllNotes: false,
    highlightedFrets: new Map<string, boolean>(),
    fretZoneEnabled: false,
    fretZoneStart: 0,
    fretZoneSize: 5,
    fretCount: 15,
    rootNote: 'E',
    selectedIntervals: [],
    scaleKey: 'C',
    selectedScale: { notes: [...MAJOR.notes], intervals: [...MAJOR.intervals] },
    scaleExerciseSequence: [],
    ...patch,
  }
}

const at = (c: FretboardRoleContext, s: number, f: number) => resolveFretCellRole(c, s, f)
const roleAt = (c: FretboardRoleContext, s: number, f: number) => resolveFretCellRole(c, s, f).role

/** 在指定弦上找「相对调性半音 = want」的品号 */
const fretOfPc = (c: FretboardRoleContext, s: number, want: number) =>
  [...Array(16).keys()].find((f) => relPc(at(c, s, f).note, c.scaleKey) === ((want % 12) + 12) % 12)

describe('0. 锚点：格子音名来自 getNoteAtPosition', () => {
  it('弦索引 0 = 最高音弦（第 1 弦）、索引 5 = 最低音弦（第 6 弦）', () => {
    expect(pc(at(ctx(), 0, 0).note)).toBe(4) // 第 1 弦空弦 = 高 E
    expect(at(ctx(), 0, 1).note).toBe('F')
    expect(pc(at(ctx(), 5, 0).note)).toBe(4) // 第 6 弦空弦 = 低 E
    expect(STANDARD).toHaveLength(6)
    // 第 6 弦（索引 5）的 C 在 8 品 —— 一弦三音 P1 的起点，也是后面多条用例的锚点
    expect(fretOfPc(ctx(), 5, 0)).toBe(8)
    // 第 5 弦（索引 4，A 弦）的 C 在 3 品
    expect(fretOfPc(ctx(), 4, 0)).toBe(3)
  })
})

describe('1. 点击反馈压过一切（最高优先级）', () => {
  const fbCtx = (correct: boolean) =>
    ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'E',
      scaleExerciseSequence: ['1', '2'],
      highlightedFrets: new Map([['5-0', correct]]),
    })

  it('同一格既是根音又刚点错 ⇒ 返回 wrong（不是 root）', () => {
    // 先证明缝隙真实存在：不带反馈时它是 root
    const withoutFeedback = ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'E',
      scaleExerciseSequence: ['1', '2'],
    })
    expect(at(withoutFeedback, 5, 0).note).toBe('E') // 5 弦空弦 = E = 根音
    expect(roleAt(withoutFeedback, 5, 0)).toBe('root')
    // 加上反馈后必须变成 wrong
    expect(roleAt(fbCtx(false), 5, 0)).toBe('wrong')
  })

  it('刚点对 ⇒ matched（同格）', () => {
    expect(roleAt(fbCtx(true), 5, 0)).toBe('matched')
  })

  it('反馈格子的 showText 恒为 true，且不带音级（显示音名）', () => {
    const r = at(fbCtx(false), 5, 0)
    expect(r.showText).toBe(true)
    expect(r.degree).toBe('')
  })
})

describe('2. 限制品区压过题目高亮', () => {
  it('品区外的音阶根音被压暗（不是 root）', () => {
    const c = ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'E',
      scaleExerciseSequence: ['1', '2'],
      fretZoneEnabled: true,
      fretZoneStart: 5,
      fretZoneSize: 3,
    })
    expect(relPc(at(c, 5, 0).note, 'E')).toBe(0) // 确实是根音
    expect(roleAt(c, 5, 0)).toBe('muted')
    expect(roleAt(c, 5, 7)).not.toBe('muted')
  })

  it('品区上界 = fretZoneStart + size - 1（含端点），且被 fretCount 夹住', () => {
    const c = ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      fretZoneEnabled: true,
      fretZoneStart: 13,
      fretZoneSize: 5,
      fretCount: 15,
    })
    // 第 1 弦 13 品 = F、15 品 = G，都在 C 大调里且在 [13, min(15,17)] 内
    expect(roleAt(c, 0, 13)).not.toBe('muted')
    expect(roleAt(c, 0, 15)).not.toBe('muted')
    // 17 品 = A（也在 C 大调里），但 fretCount = 15 ⇒ 被夹在品区外
    expect(roleAt(c, 0, 17)).toBe('muted')
  })

  it('品区限制只压暗、**不藏文字**（与经典皮肤同口径：那边也是颜色管压暗、文字管显隐）', () => {
    const c = ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'E',
      scaleExerciseSequence: ['1'],
      fretZoneEnabled: true,
      fretZoneStart: 5,
      fretZoneSize: 3,
    })
    const r = at(c, 5, 0) // 第 6 弦空弦 E = 根音，在品区外
    expect(r.role).toBe('muted')
    expect(r.showText).toBe(true)
    expect(r.degree).not.toBe('')
  })

  it('品区外的**非音阶音**仍是 none（压暗只针对题目内的格子）', () => {
    const c = ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      fretZoneEnabled: true,
      fretZoneStart: 13,
      fretZoneSize: 3,
    })
    // 第 1 弦 12 品 = E（音阶内）⇒ 压暗；16 品 = G#（音阶外）⇒ none
    expect(roleAt(c, 0, 12)).toBe('muted')
    expect(roleAt(c, 0, 16)).toBe('none')
  })

  it('未开始练习时品区限制不生效', () => {
    const c = ctx({
      activeTab: 'scale',
      isPlaying: false,
      fretZoneEnabled: true,
      fretZoneStart: 5,
      fretZoneSize: 3,
    })
    expect(roleAt(c, 5, 0)).toBe('none')
  })
})

describe('3. 找音练习（activeTab = practice）', () => {
  it('未开始 ⇒ 全部 none（且不该显示文字；空弦列除外，见弦标签用例）', () => {
    const r = at(ctx({ activeTab: 'practice', isPlaying: false }), 0, 1)
    expect(r.role).toBe('none')
    expect(r.showText).toBe(false)
  })

  it('按钮答题模式：只有目标格是 target', () => {
    const c = ctx({
      activeTab: 'practice',
      isPlaying: true,
      practiceAnswerMode: 'buttons',
      highlightedTargetPosition: { stringIndex: 2, fret: 3 },
    })
    expect(roleAt(c, 2, 3)).toBe('target')
    expect(roleAt(c, 0, 0)).toBe('none')
  })

  it('🚨 按钮答题模式：目标格**只亮位置、不写音名**（屏上的音名就是答案）', () => {
    const c = ctx({
      activeTab: 'practice',
      isPlaying: true,
      practiceAnswerMode: 'buttons',
      highlightedTargetPosition: { stringIndex: 2, fret: 3 },
    })
    const hit = at(c, 2, 3)
    expect(hit.role).toBe('target')
    expect(hit.degree).toBe('') // 既不是音级、也不该退回音名
    // 可见性必须为 false ⇒ 经典皮肤 opacity-0、GuitarRun `data-visible="0"`
    expect(hit.showText).toBe(false)
  })

  it('🚨 按钮答题模式：**空弦目标**（0 品）同样要藏 —— 「弦标签恒显」对这一格不成立', () => {
    const c = ctx({
      activeTab: 'practice',
      isPlaying: true,
      practiceAnswerMode: 'buttons',
      highlightedTargetPosition: { stringIndex: 0, fret: 0 },
    })
    expect(at(c, 0, 0).role).toBe('target')
    expect(at(c, 0, 0).showText).toBe(false)
    // 对照：同一列里的**非目标**空弦格仍是弦标签（恒显）——
    // 证明上面藏掉的是「目标格」而不是整列空弦，否则用户又会反馈「空弦音都不显示了」。
    expect(at(c, 1, 0).role).toBe('none')
    expect(at(c, 1, 0).showText).toBe(true)
  })

  it('buttons 模式但目标为 null ⇒ 没有 target', () => {
    const c = ctx({
      activeTab: 'practice',
      isPlaying: true,
      practiceAnswerMode: 'buttons',
      highlightedTargetPosition: null,
    })
    expect(roleAt(c, 0, 0)).toBe('none')
  })

  it('showAllNotes 且音名等于目标音 ⇒ target（且显示音名、不带音级）', () => {
    const c = ctx({ activeTab: 'practice', isPlaying: true, showAllNotes: true, targetNote: 'G' })
    const gFret = [...Array(16).keys()].find((f) => pc(at(c, 0, f).note) === 7)!
    const hit = at(c, 0, gFret)
    expect(hit.role).toBe('target')
    expect(hit.degree).toBe('')
    const other = at(c, 0, 0) // 空弦 E ≠ G
    expect(other.role).toBe('none')
    // 「显示全部音符」时**所有**格子都亮出音名（与经典皮肤同义），非目标格只是不高亮
    expect(other.showText).toBe(true)
  })

  it('showAllNotes = false 时不给 target（藏答案）', () => {
    const c = ctx({ activeTab: 'practice', isPlaying: true, showAllNotes: false, targetNote: 'G' })
    const gFret = [...Array(16).keys()].find((f) => pc(at(c, 0, f).note) === 7)!
    expect(roleAt(c, 0, gFret)).toBe('none')
  })

  it('非 buttons 模式下 highlightedTargetPosition 被忽略', () => {
    const c = ctx({
      activeTab: 'practice',
      isPlaying: true,
      practiceAnswerMode: 'fretboard',
      highlightedTargetPosition: { stringIndex: 0, fret: 0 },
    })
    expect(roleAt(c, 0, 0)).toBe('none')
  })
})

describe('4. 和弦练习 / 和弦转换练习', () => {
  const C_MAJOR = { root: 'C', type: 'Major' }

  it('和弦练习：根音 = root、其他和弦音 = tone、和弦外音 = none', () => {
    const c = ctx({ activeTab: 'chord_exercise', isPlaying: true, chordTarget: C_MAJOR })
    const rootCell = fretOfPc(c, 5, 0)! // C
    const thirdCell = fretOfPc(c, 5, 4)! // E
    const outsideCell = fretOfPc(c, 5, 11)! // B，不在 C 大三和弦里
    expect(roleAt(c, 5, rootCell)).toBe('root')
    expect(roleAt(c, 5, thirdCell)).toBe('tone')
    expect(roleAt(c, 5, outsideCell)).toBe('none')
  })

  it('和弦练习：没开始练习就没有高亮（即使目标和弦已就位）', () => {
    const c = ctx({ activeTab: 'chord_exercise', isPlaying: false, chordTarget: C_MAJOR })
    expect(roleAt(c, 5, fretOfPc(c, 5, 0)!)).toBe('none')
  })

  it('和弦练习：目标和弦为 null ⇒ 全 none', () => {
    const c = ctx({ activeTab: 'chord_exercise', isPlaying: true, chordTarget: null })
    expect(roleAt(c, 0, 0)).toBe('none')
  })

  it('和弦转换练习（chord）未开始练习 ⇒ 不亮；开始 ⇒ 亮（2026-10-01 口径变更）', () => {
    // 改前这里断言 'root'，注释写的是「与页面的颜色函数一致」——那个「一致」只覆盖了
    // 颜色函数。经典皮肤的**文字层**另有自己的 isPlaying 门禁 ⇒ 同一个界面「有颜色、没音级」。
    // 口径统一为「未开始不亮」（TAB_REQUIRES_PLAYING.chord = true）后三方才真正一致。
    const before = ctx({ activeTab: 'chord', isPlaying: false, chordTarget: C_MAJOR })
    expect(roleAt(before, 5, fretOfPc(before, 5, 0)!)).toBe('none')

    const playing = ctx({ activeTab: 'chord', isPlaying: true, chordTarget: C_MAJOR })
    expect(roleAt(playing, 5, fretOfPc(playing, 5, 0)!)).toBe('root')
  })

  it('和弦音带音级符号（degree 非空）', () => {
    const c = ctx({ activeTab: 'chord', isPlaying: true, chordTarget: C_MAJOR })
    expect(at(c, 5, fretOfPc(c, 5, 0)!).degree).not.toBe('')
  })
})

describe('5. 音程练习', () => {
  it('未开始 ⇒ none', () => {
    const c = ctx({ activeTab: 'interval', isPlaying: false, rootNote: 'C', selectedIntervals: [0] })
    expect(roleAt(c, 5, fretOfPc(c, 5, 0)!)).toBe('none')
  })

  it('根音 = root，选中音程内的音 = tone（带音程符号），其余 = none', () => {
    // INTERVALS 里同一个半音可能有两条（如 #2 与 b3 都是 3 半音）⇒ 按 symbol 定位，别按下标猜
    const fifthIdx = INTERVALS.findIndex((iv) => iv.symbol === '5' && iv.semitones === 7)
    expect(fifthIdx, 'INTERVALS 里应存在纯五度').toBeGreaterThanOrEqual(0)
    const c = ctx({
      activeTab: 'interval',
      isPlaying: true,
      scaleKey: 'C',
      rootNote: 'C',
      selectedIntervals: [fifthIdx],
    })
    expect(roleAt(c, 5, fretOfPc(c, 5, 0)!)).toBe('root')
    const fifth = at(c, 5, fretOfPc(c, 5, 7)!)
    expect(fifth.role).toBe('tone')
    expect(fifth.degree).toBe('5')
    expect(roleAt(c, 5, fretOfPc(c, 5, 2)!)).toBe('none') // 大二度不在选中音程里
  })
})

describe('6. 音阶练习', () => {
  const scaleCtx = (patch: Partial<FretboardRoleContext> = {}) =>
    ctx({ activeTab: 'scale', isPlaying: true, scaleKey: 'C', scaleExerciseSequence: ['1'], ...patch })

  it('序列为空（还没出题）⇒ 全 none', () => {
    expect(roleAt(scaleCtx({ scaleExerciseSequence: [] }), 0, 0)).toBe('none')
  })

  it('非音阶音 = none，根音 = root，其余音阶音 = tone', () => {
    const c = scaleCtx()
    expect(roleAt(c, 5, fretOfPc(c, 5, 0)!)).toBe('root') // C
    expect(roleAt(c, 5, fretOfPc(c, 5, 2)!)).toBe('tone') // D
    expect(roleAt(c, 5, fretOfPc(c, 5, 1)!)).toBe('none') // C#/Db 不在 C 大调里
  })

  it('音级符号**优先取音阶自己的对齐表**，不是手写兜底表', () => {
    // 含 #2 的音阶里，该半音的实际音级是 #2，而手写兜底表给的是 b3 ⇒ 两者不同，构成缝隙
    const withSharp2 = ALL_SCALES.find((s) => s.intervals.includes('#2'))
    expect(withSharp2, '数据源里应存在含 #2 的音阶').toBeTruthy()
    const idx = withSharp2!.intervals.indexOf('#2')
    const semitone = withSharp2!.notes[idx]
    expect(SCALE_SEMITONE_DEGREE_FALLBACK[semitone]).toBe('b3') // 兜底表给的是 b3
    expect(scaleDegreeLabel(withSharp2!, semitone)).toBe('#2') // 对齐表给的才是 #2
  })

  it('对齐表缺位时退回兜底表（不返回空串）', () => {
    expect(scaleDegreeLabel({ notes: [0, 1], intervals: [] }, 1)).toBe(
      SCALE_SEMITONE_DEGREE_FALLBACK[1],
    )
    expect(scaleDegreeLabel({ notes: [0, 99] }, 99)).toBe('')
  })

  it('用真实音阶穷举：任何音阶音都能拿到非空音级符号（含 Altered 系列的 #2）', () => {
    let combos = 0
    for (const scale of ALL_SCALES) {
      for (const half of scale.notes) {
        expect(scaleDegreeLabel(scale, half), `${scale.name} 的半音 ${half}`).not.toBe('')
        combos++
      }
    }
    expect(combos).toBeGreaterThan(300) // 防止循环被写空
  })
})

describe('7. 一弦三音（把位 + 目标 + 压暗 + 预览）', () => {
  const threeNpsCellKeys = new Map<string, unknown>([
    ['5-8', 1],
    ['5-10', 1],
    ['4-8', 1],
  ])
  const npsCtx = (patch: Partial<FretboardRoleContext> = {}) =>
    ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: ['1', '2'],
      threeNpsTarget: { stringIndex: 5, fret: 8 },
      threeNpsCellKeys,
      ...patch,
    })

  it('目标格 = target（不是普通音阶音）', () => {
    expect(roleAt(npsCtx(), 5, 8)).toBe('target')
  })

  it('把位内的音 = tone（弦 5 品 10 / 弦 4 品 8）', () => {
    const c = npsCtx()
    expect(roleAt(c, 5, 10)).toBe('tone')
    expect(roleAt(c, 4, 8)).toBe('tone')
  })

  it('把位外的音阶根音被压暗（muted）—— 证明把位判定压过根音', () => {
    const c = npsCtx()
    // 第 1 弦（索引 0）的 C 在 8 品，不在上面那张把位表里；它确实是 C 大调的根音
    const f = fretOfPc(c, 0, 0)!
    expect(relPc(at(c, 0, f).note, 'C')).toBe(0)
    expect(threeNpsCellKeys.has(`0-${f}`)).toBe(false)
    expect(roleAt(c, 0, f)).toBe('muted')
  })

  it('把位外的**非音阶音**仍是 none（压暗只针对音阶音）', () => {
    const c = npsCtx()
    const f = fretOfPc(c, 5, 1)! // C#/Db，不在 C 大调里
    expect(threeNpsCellKeys.has(`5-${f}`)).toBe(false)
    expect(roleAt(c, 5, f)).toBe('none')
  })

  it('目标格压过把位内判定与预览判定（三者同时命中）', () => {
    const c = npsCtx({ nextThreeNpsCells: new Map<string, ThreeNpsPreviewKind>([['5-8', 'start']]) })
    expect(roleAt(c, 5, 8)).toBe('target')
  })

  it('把位内的音压过预览判定（重叠音不给 preview）', () => {
    const c = npsCtx({ nextThreeNpsCells: new Map<string, ThreeNpsPreviewKind>([['5-10', 'note']]) })
    expect(roleAt(c, 5, 10)).toBe('tone')
  })

  /**
   * 下一把位预览的**时机**契约（2026-10-01 修）。
   *
   * 修前这里钉的是「`threeNpsTarget` 为空时把位表与预览都该被忽略」，而产出侧
   * `app/page.tsx:nextThreeNpsCells` 又只在 `threeNpsTarget` 为空时才填数据 ——
   * 两边互斥，这个提示**一次都没显示过**（两套皮肤都没有；登记为「只有 GuitarRun 有」是错的）。
   * 以产出侧那段有理由的注释为准（「只在当前把位跑完、界面停在等下一题时画」）：
   * 预览只在 `threeNpsTarget === null` 时生效，且此时把位表不再参与判定。
   */
  describe('下一把位预览：只在当前把位跑完（threeNpsTarget === null）时生效', () => {
    /** 第 1 弦的 C（8 品）：在 C 大调里、但不在上面那张把位表里 —— 预览用例的标准落点 */
    const previewCtx = (kind: ThreeNpsPreviewKind) =>
      npsCtx({
        threeNpsTarget: null,
        nextThreeNpsCells: new Map<string, ThreeNpsPreviewKind>([['0-8', kind]]),
      })

    it('三种强调级别各自映射', () => {
      const cases: [ThreeNpsPreviewKind, string][] = [
        ['note', 'preview'],
        ['root', 'previewRoot'],
        ['start', 'previewStart'],
      ]
      for (const [kind, expected] of cases) {
        const c = previewCtx(kind)
        expect(threeNpsCellKeys.has('0-8'), '该格不该在把位表里').toBe(false)
        expect(relPc(at(c, 0, 8).note, 'C'), '该格必须是 C 大调的根音').toBe(0)
        expect(roleAt(c, 0, 8), kind).toBe(expected)
      }
    })

    it('预览格与「把位外压暗」是两个角色（否则提示等于没提示）', () => {
      expect(roleAt(previewCtx('note'), 0, 8)).not.toBe('muted')
      // 同一格：把位进行中（有目标）⇒ 压暗；把位跑完（无目标）⇒ 预览
      expect(roleAt(npsCtx(), 0, 8)).toBe('muted')
    })

    it('当前把位进行中**不读**预览表（与产出侧同一时机，否则两边会各按各的时机画）', () => {
      const c = npsCtx({ nextThreeNpsCells: new Map<string, ThreeNpsPreviewKind>([['0-8', 'start']]) })
      expect(roleAt(c, 0, 8)).toBe('muted')
    })

    it('产出侧时机必须与消费侧一致 —— 从 `app/page.tsx` 源码解析那条守卫', () => {
      // 铁律：跨实现的一致性要从**对方源码**解析出来，不能凭记忆写死形状。
      // 这条护栏把「产出」与「消费」绑在一起：谁改时机，另一边必须跟着改。
      const src = readFileSync('app/page.tsx', 'utf8')
      const at = src.indexOf('const nextThreeNpsCells = useMemo(')
      expect(at, 'page.tsx 里应存在 nextThreeNpsCells 的 useMemo').toBeGreaterThanOrEqual(0)
      const body = src.slice(at, src.indexOf('}, [', at))
      expect(
        body,
        '产出侧只在「当前把位跑完」时给数据 ⇒ resolveBaseRole 的 ② 必须同样只在 threeNpsTarget 为空时读',
      ).toMatch(/if \(!isThreeNpsActive \|\| threeNpsTarget\) return map/)
    })

    it('预览表里没有的格子仍退回普通音阶判定（整块音阶照常亮）', () => {
      const c = npsCtx({ threeNpsTarget: null, nextThreeNpsCells: new Map() })
      expect(relPc(at(c, 5, 8).note, 'C')).toBe(0) // 第 6 弦 8 品 = C 大调的根音
      expect(roleAt(c, 5, 8)).toBe('root') // 第 6 弦 8 品 = C
      expect(roleAt(c, 5, 5)).toBe('tone') // 第 6 弦 5 品 = A ⇒ 6 级
    })
  })
})

describe('8. 其它 tab / 兜底', () => {
  it('stats / theory / course 等页面 ⇒ 全 none（不显示任何高亮）', () => {
    for (const tab of ['stats', 'theory', 'course', 'unknown']) {
      expect(roleAt(ctx({ activeTab: tab, isPlaying: true }), 0, 0), tab).toBe('none')
    }
  })

  it('默认返回的 showText 为 false（不会把答案亮出来；1 品起）', () => {
    expect(at(ctx({ activeTab: 'nope' }), 0, 1).showText).toBe(false)
  })
})

describe('8b. 空弦列 = 弦标签（音名恒显示，不参与藏答案）', () => {
  it('角色 none 时 0 品仍 showText = true（1 品对照为 false）', () => {
    const c = ctx({ activeTab: 'practice', isPlaying: false })
    expect(at(c, 3, 0).showText).toBe(true)
    expect(at(c, 3, 1).showText).toBe(false)
  })

  it('被品区压暗成 muted 的空弦也显示音名（压暗 ≠ 藏字）', () => {
    const c = ctx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      fretZoneEnabled: true,
      fretZoneStart: 5,
      fretZoneSize: 3,
    })
    const r = at(c, 5, 0) // 6 弦空弦 E：C 大调的 3 级，落在 5..7 品区之外 ⇒ muted
    expect(r.role).toBe('muted')
    expect(r.showText).toBe(true)
  })

  it('命中题目时空弦照常给音级和 root 角色（弦标签只兜可见性，不改判定）', () => {
    const c = ctx({ activeTab: 'chord', isPlaying: true, chordTarget: { root: 'E', type: 'Major' } })
    const r = at(c, 5, 0) // 6 弦空弦 E = E 大三和弦根音
    expect(r.role).toBe('root')
    expect(r.degree).toBe('1')
    expect(r.showText).toBe(true)
  })
})

describe('9. 数据源自检（防止测试写在不存在的音阶上）', () => {
  it('basic 里有七声的 Major，且存在含 #2 的音阶', () => {
    expect(MAJOR).toBeTruthy()
    expect(MAJOR.notes).toHaveLength(7)
    expect(MAJOR.intervals).toHaveLength(7)
    expect(ALL_SCALES.some((s) => s.intervals.includes('#2'))).toBe(true)
    expect(ALL_SCALES.length).toBeGreaterThan(50)
  })
})
