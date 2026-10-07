/**
 * lib/fretboard-note-button-color.ts 的契约测试（经典皮肤的**配色层**）。
 *
 * 配色的 bug 不会崩、只会「看着不对」，所以这里钉三类东西：
 *   ① **共享口径表** `requiresPlaying` —— 各 tab 的题目高亮是否只在练习中生效；
 *   ② **缝隙证明** —— 未开始练习时，配色层必须与真相源（GuitarRun 皮肤的依据）、
 *      以及经典皮肤自己的文字层给出同一结论。改前这里三缺一：
 *      配色亮着蓝/绿、真相源说 role='root'、而文字层因为 isPlaying 门禁什么都不显示
 *      ⇒ 同一块指板上「有颜色、没音级」；
 *   ③ **优先级** —— 反馈要压过门禁（未开始时的对错反馈仍要看得见）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  getNoteButtonColor,
  PREVIEW_CLASS,
  type NoteButtonColorContext,
} from '@/lib/fretboard-note-button-color'
import {
  requiresPlaying,
  TAB_REQUIRES_PLAYING,
  resolveFretCellRole,
  type FretCellRole,
  type FretboardRoleContext,
  type ThreeNpsPreviewKind,
} from '@/lib/fretboard-cell-role'
import { getNoteAtPosition } from '@/lib/page-theory-functions'
import { INTERVALS, SCALE_MODES } from '@/lib/page-theory-data'

const FRET_COUNT = 15
const STRING_COUNT = 6

/**
 * 配色分类。
 *
 * ⚠️ 只分「上色 / 不上色」两档，因为**不上色有两种长相**、且都是合法落点：
 *   · `hover:bg-muted(/50)` —— 普通兜底；
 *   · `opacity-20 cursor-not-allowed hover:bg-transparent` —— 限制品区把区外压暗
 *     （配色层是**无条件**压的，连 role=none 的格子也压；真相源的 muted 只标记题目内的格子。
 *     两者视觉结果都是「不亮」，所以这里不把品区差异当作分叉 —— 它是独立的视觉口径。）
 *   · `opacity-30 hover:bg-muted/50` —— 一弦三音把位外压暗。
 *
 * 预览三档（青 / 酸黄 / 橙）**算上色** —— 它们就是「该看得见」的那一类。
 */
const TINT_RE = /bg-(green|red|primary|blue|emerald|amber|cyan|lime|orange)(-|\/)/
const isLit = (cls: string) => TINT_RE.test(cls)

const C_MAJOR = { root: 'C', type: 'Major' }
const C_MAJOR_SEQ = [{ root: 'C', type: 'Major' }]
const C_MAJOR_SCALE = SCALE_MODES.basic[0] as { notes: number[]; intervals?: string[] }

function makeCtx(patch: Partial<NoteButtonColorContext> = {}): NoteButtonColorContext {
  return {
    activeTab: 'chord',
    isPlaying: false,
    showAllNotes: false,
    targetNote: '',
    practiceAnswerMode: 'buttons',
    highlightedTargetPosition: null,
    highlightedFrets: new Map<string, boolean>(),
    fretZoneEnabled: false,
    fretZoneStart: 1,
    fretZoneSize: 5,
    fretCount: FRET_COUNT,
    chordExerciseTargetChord: null,
    rootNote: 'E',
    selectedIntervals: [],
    scaleKey: 'E',
    selectedScale: SCALE_MODES.pentatonic[0] as { notes: number[]; intervals?: string[] },
    scaleExerciseSequence: [],
    transposedChords: [],
    currentChordIndex: 0,
    threeNpsTarget: null,
    threeNpsCellKeys: new Map<string, unknown>(),
    nextThreeNpsCells: new Map<string, ThreeNpsPreviewKind>(),
    ...patch,
  }
}

/** 与 GuitarRunFretboard 里那份映射同义（和弦来源按 tab 选；调弦两边都走默认全局） */
function roleCtxOf(c: NoteButtonColorContext): FretboardRoleContext {
  return {
    activeTab: c.activeTab,
    isPlaying: c.isPlaying,
    practiceAnswerMode: c.practiceAnswerMode,
    highlightedTargetPosition: c.highlightedTargetPosition,
    targetNote: c.targetNote,
    showAllNotes: c.showAllNotes,
    highlightedFrets: c.highlightedFrets,
    fretZoneEnabled: c.fretZoneEnabled,
    fretZoneStart: c.fretZoneStart,
    fretZoneSize: c.fretZoneSize,
    fretCount: c.fretCount,
    chordTarget:
      c.activeTab === 'chord'
        ? (c.transposedChords[c.currentChordIndex] ?? null)
        : c.chordExerciseTargetChord,
    rootNote: c.rootNote,
    selectedIntervals: c.selectedIntervals,
    scaleKey: c.scaleKey,
    selectedScale: c.selectedScale,
    scaleExerciseSequence: c.scaleExerciseSequence,
    threeNpsTarget: c.threeNpsTarget,
    threeNpsCellKeys: c.threeNpsCellKeys,
    nextThreeNpsCells: c.nextThreeNpsCells,
  }
}

const colorAt = (c: NoteButtonColorContext, s: number, f: number) =>
  getNoteButtonColor(c, getNoteAtPosition(s, f), s, f)

const roleAt = (c: NoteButtonColorContext, s: number, f: number) =>
  resolveFretCellRole(roleCtxOf(c), s, f).role

/** 在某个上下文里找第一个「上色」的格子（探针自检用：证明不是全无色导致的假通过） */
function firstLitCell(c: NoteButtonColorContext): { s: number; f: number } | null {
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      if (isLit(colorAt(c, s, f))) return { s, f }
    }
  }
  return null
}

describe('① 共享口径表 TAB_REQUIRES_PLAYING', () => {
  it('practice 例外（提示在未开始时也要亮），其余四个 tab 都要求练习中', () => {
    expect(TAB_REQUIRES_PLAYING.practice).toBe(false)
    for (const tab of ['chord', 'chord_exercise', 'interval', 'scale']) {
      expect(TAB_REQUIRES_PLAYING[tab], `${tab} 应要求练习中`).toBe(true)
    }
  })

  it('未知 tab 不要求（否则新加 tab 会被静默门禁掉）', () => {
    expect(requiresPlaying('stats')).toBe(false)
    expect(requiresPlaying('theory')).toBe(false)
    expect(requiresPlaying('')).toBe(false)
  })
})

describe('② 缝隙证明：未开始练习时 chord 不再「有颜色、没音级」', () => {
  it('chord + 未开始 + 和弦目标已就位 —— 配色必须无色（改前是 bg-blue-400/60）', () => {
    const c = makeCtx({ activeTab: 'chord', isPlaying: false, transposedChords: C_MAJOR_SEQ })
    // 6 弦 8 品 = C = 根音
    expect(colorAt(c, 5, 8), '未开始练习却给根音上了色 ⇒ 与文字层（不显示音级）打架').toBe(
      'hover:bg-muted/50',
    )
    // 同一条用例里把「文字层会显示什么」的依据也固定下来：真相源此刻也是 none
    expect(roleAt(c, 5, 8)).toBe('none')
  })

  it('对照：同一个格子，练习中就照常上色（别把门禁做成「永远不亮」）', () => {
    const c = makeCtx({ activeTab: 'chord', isPlaying: true, transposedChords: C_MAJOR_SEQ })
    expect(isLit(colorAt(c, 5, 8)), '开始练习后根音必须亮').toBe(true)
    expect(colorAt(c, 5, 8)).toBe('bg-blue-400/60 text-white')
  })

  it('四个要求练习中的 tab，未开始时全盘无色（穷举格子）', () => {
    const cases: NoteButtonColorContext[] = [
      makeCtx({ activeTab: 'chord', isPlaying: false, transposedChords: C_MAJOR_SEQ }),
      makeCtx({ activeTab: 'chord_exercise', isPlaying: false, chordExerciseTargetChord: C_MAJOR }),
      makeCtx({ activeTab: 'interval', isPlaying: false, rootNote: 'C', selectedIntervals: [0, 4, 7] }),
      makeCtx({
        activeTab: 'scale',
        isPlaying: false,
        scaleKey: 'C',
        scaleExerciseSequence: ['1'],
        selectedScale: SCALE_MODES.basic[0] as { notes: number[]; intervals?: string[] },
      }),
    ]
    let checked = 0
    for (const c of cases) {
      for (let s = 0; s < STRING_COUNT; s++) {
        for (let f = 0; f <= FRET_COUNT; f++) {
          const cls = colorAt(c, s, f)
          checked++
          expect(
            isLit(cls),
            `${c.activeTab} 未开始练习，弦${s + 1} 品${f} 却拿到了题目色 '${cls}'`,
          ).toBe(false)
        }
      }
    }
    expect(checked).toBe(4 * STRING_COUNT * (FRET_COUNT + 1))
  })
})

describe('③ 优先级：反馈与品区压过门禁', () => {
  it('未开始练习 + 点了格子 ⇒ 对错反馈仍然可见（门禁不能吃掉反馈）', () => {
    const right = makeCtx({
      activeTab: 'chord',
      isPlaying: false,
      transposedChords: C_MAJOR_SEQ,
      highlightedFrets: new Map([['5-8', true]]),
    })
    expect(colorAt(right, 5, 8)).toBe('bg-green-500 text-white fret-feedback-correct')

    const wrong = makeCtx({
      activeTab: 'chord',
      isPlaying: false,
      transposedChords: C_MAJOR_SEQ,
      highlightedFrets: new Map([['5-9', false]]),
    })
    expect(colorAt(wrong, 5, 9)).toBe('bg-red-500 text-white fret-feedback-wrong')
  })

  it('练习中 + 限制品区 ⇒ 区外压暗（与真相源的 muted 同义）', () => {
    const c = makeCtx({
      activeTab: 'chord',
      isPlaying: true,
      transposedChords: C_MAJOR_SEQ,
      fretZoneEnabled: true,
      fretZoneStart: 3,
      fretZoneSize: 3, // 品区 = 3..5
    })
    // 6 弦 8 品 = C（根音）但在品区外 ⇒ 压暗
    expect(colorAt(c, 5, 8)).toBe('opacity-20 cursor-not-allowed hover:bg-transparent')
    // 6 弦 3 品 = G（C 和弦的 5 音）且在品区内 ⇒ 照常上色
    expect(isLit(colorAt(c, 5, 3))).toBe(true)
  })

  it('scale 练习中但音级序列还空 ⇒ 不上色（这条不能被 tab 级门禁盖过去）', () => {
    const c = makeCtx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: [],
      selectedScale: SCALE_MODES.basic[0] as { notes: number[]; intervals?: string[] },
    })
    for (let s = 0; s < STRING_COUNT; s++) {
      for (let f = 0; f <= FRET_COUNT; f++) {
        expect(isLit(colorAt(c, s, f)), `弦${s + 1} 品${f}`).toBe(false)
      }
    }
  })

  it('chord_exercise 练习中但没有目标和弦 ⇒ 不上色', () => {
    const c = makeCtx({ activeTab: 'chord_exercise', isPlaying: true, chordExerciseTargetChord: null })
    for (let s = 0; s < STRING_COUNT; s++) {
      for (let f = 0; f <= FRET_COUNT; f++) {
        expect(isLit(colorAt(c, s, f)), `弦${s + 1} 品${f}`).toBe(false)
      }
    }
  })
})

describe('④ 落点：各 tab 的色板没被门禁改动（抽样钉住）', () => {
  it('练习中：chord_exercise / interval / scale 的音仍按「根音蓝、其他绿」上色', () => {
    const ex = makeCtx({ activeTab: 'chord_exercise', isPlaying: true, chordExerciseTargetChord: C_MAJOR })
    expect(colorAt(ex, 5, 8)).toBe('bg-blue-400/60 text-white') // 6 弦 8 品 = C = 根音
    expect(colorAt(ex, 5, 3)).toBe('bg-emerald-400/50 text-white') // 6 弦 3 品 = G = 5 音

    const iv = makeCtx({ activeTab: 'interval', isPlaying: true, rootNote: 'C', selectedIntervals: [0] })
    expect(colorAt(iv, 5, 8)).toBe('bg-blue-400/60 text-white')

    const pl = makeCtx({
      activeTab: 'practice',
      isPlaying: true,
      showAllNotes: true,
      targetNote: 'C',
    })
    expect(colorAt(pl, 5, 8)).toBe('bg-primary/80 text-primary-foreground')
  })

  it('practice 未开始：返回 hover:bg-muted（注意与其它 tab 的 /50 不同，这是既有口径）', () => {
    const c = makeCtx({ activeTab: 'practice', isPlaying: false })
    expect(colorAt(c, 5, 8)).toBe('hover:bg-muted')
  })
})

describe('⑤ 与真相源的角色分类一致（跨层护栏）', () => {
  it('role ⇒ 配色分类：none 无色 / muted 压暗 / 其余上色', () => {
    const contexts: NoteButtonColorContext[] = [
      makeCtx({ activeTab: 'practice', isPlaying: true, showAllNotes: true, targetNote: 'C' }),
      makeCtx({ activeTab: 'chord', isPlaying: true, transposedChords: C_MAJOR_SEQ }),
      makeCtx({ activeTab: 'chord_exercise', isPlaying: true, chordExerciseTargetChord: C_MAJOR }),
      makeCtx({ activeTab: 'interval', isPlaying: true, rootNote: 'C', selectedIntervals: [0, 4, 7] }),
      makeCtx({
        activeTab: 'scale',
        isPlaying: true,
        scaleKey: 'C',
        scaleExerciseSequence: ['1'],
        selectedScale: SCALE_MODES.basic[0] as { notes: number[]; intervals?: string[] },
      }),
      // 练习中 + 品区：同一次遍历里覆盖到 muted
      makeCtx({
        activeTab: 'scale',
        isPlaying: true,
        scaleKey: 'C',
        scaleExerciseSequence: ['1'],
        selectedScale: SCALE_MODES.basic[0] as { notes: number[]; intervals?: string[] },
        fretZoneEnabled: true,
        fretZoneStart: 5,
        fretZoneSize: 3,
      }),
    ]

    let litPairs = 0
    let unlitPairs = 0
    for (const c of contexts) {
      for (let s = 0; s < STRING_COUNT; s++) {
        for (let f = 0; f <= FRET_COUNT; f++) {
          const role = roleAt(c, s, f)
          const cls = colorAt(c, s, f)
          const where = `${c.activeTab} 弦${s + 1} 品${f}（role=${role}）`
          if (role === 'none' || role === 'muted') {
            unlitPairs++
            expect(isLit(cls), `${where} 真相源说没有信息，配色却给了 '${cls}'`).toBe(false)
          } else {
            litPairs++
            expect(isLit(cls), `${where} 真相源说该亮，配色却给了 '${cls}'`).toBe(true)
          }
        }
      }
    }
    // 探针自检：两侧都要有样本，否则这条「一致性」可能在全无色下空转
    expect(litPairs).toBeGreaterThan(50)
    expect(unlitPairs).toBeGreaterThan(0)
  })

  it('探针自检：确实存在会上色的格子（firstLitCell 真的能找到）', () => {
    const c = makeCtx({ activeTab: 'chord', isPlaying: true, transposedChords: C_MAJOR_SEQ })
    expect(firstLitCell(c)).not.toBeNull()
  })
})

describe('⑥ selectedIntervals 含越界下标（配色层此前缺守卫，会抛 TypeError）', () => {
  it('越界索引被忽略，不抛异常（真相源与文字层都有这道守卫）', () => {
    const c = makeCtx({
      activeTab: 'interval',
      isPlaying: true,
      rootNote: 'C',
      selectedIntervals: [9999],
    })
    expect(() => colorAt(c, 5, 9)).not.toThrow()
    // 越界项不匹配任何音程 ⇒ 非根音格子不上色
    expect(isLit(colorAt(c, 5, 9))).toBe(false)
  })

  it('混入越界项时，合法的音程仍然照常上色', () => {
    // ⚠️ `selectedIntervals` 存的是 **INTERVALS 的下标**，不是半音数 —— 别按下标猜音程，
    //    必须按 (symbol, semitones) 反查（同一个半音可能有两条，如 #2 与 b3）。
    const fifthIdx = INTERVALS.findIndex((iv) => iv.symbol === '5' && iv.semitones === 7)
    expect(fifthIdx, 'INTERVALS 里应存在纯五度').toBeGreaterThanOrEqual(0)
    const c = makeCtx({
      activeTab: 'interval',
      isPlaying: true,
      rootNote: 'C',
      selectedIntervals: [9999, fifthIdx],
    })
    expect(isLit(colorAt(c, 5, 3))).toBe(true) // 6 弦 3 品 = G
  })
})

describe('⑦ 一弦三音「下一把位预览」：两套皮肤同一口径（2026-10-01 修）', () => {
  /**
   * 修前的两个独立缺陷，叠在一起让这个提示**一次都没显示过**（两套皮肤都没有 ——
   * 之前登记成「只有 GuitarRun 有」是错的）：
   *   ① 真相源把预览判定写在 `if (threeNpsTarget)` **里面**，而产出侧
   *      `app/page.tsx:nextThreeNpsCells` 只在 `threeNpsTarget === null` 时才填数据 ⇒ 互斥；
   *   ② 经典皮肤的配色层压根没有 preview 这一档，格子会退回「把位外压暗」——
   *      就算①修好了，提示也会长得跟「这个音不在这把位」一样。
   *
   * 判定只认 `threeNpsTarget === null`（当前把位跑完、界面停在等「下一题」），
   * 依据是产出侧那段有理由的注释（「其余时刻显示会干扰对当前把位的辨认」）。
   */
  const KINDS: [ThreeNpsPreviewKind, FretCellRole][] = [
    ['note', 'preview'],
    ['root', 'previewRoot'],
    ['start', 'previewStart'],
  ]
  /** 6 弦 8 品 = C（C 大调根音）；scale 练习中、当前把位已跑完 ⇒ 预览生效 */
  const previewCtx = (kind: ThreeNpsPreviewKind) =>
    makeCtx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      selectedScale: C_MAJOR_SCALE,
      threeNpsTarget: null,
      nextThreeNpsCells: new Map<string, ThreeNpsPreviewKind>([['5-8', kind]]),
    })

  it('缝隙证明：三种强调级别都真的会显示出来（改前这里是「把位外压暗」，等于没提示）', () => {
    for (const [kind, role] of KINDS) {
      const c = previewCtx(kind)
      expect(roleAt(c, 5, 8), `${kind} 的角色`).toBe(role)
      expect(colorAt(c, 5, 8), `${kind} 的配色`).toBe(PREVIEW_CLASS[kind])
      expect(isLit(colorAt(c, 5, 8)), `${kind} 必须看得见`).toBe(true)
    }
    expect(new Set(KINDS.map(([k]) => PREVIEW_CLASS[k])).size, '三档配色必须互不相同').toBe(3)
  })

  it('与「一弦三音把位外压暗」明确不同（否则提示等于没提示）', () => {
    const muted = makeCtx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      selectedScale: C_MAJOR_SCALE,
      threeNpsTarget: { stringIndex: 0, fret: 8 }, // 把位在别处 ⇒ 6 弦 8 品被压暗
      threeNpsCellKeys: new Map<string, unknown>(),
    })
    expect(colorAt(muted, 5, 8)).toBe('opacity-30 hover:bg-muted/50')
    expect(isLit(colorAt(muted, 5, 8))).toBe(false)
    for (const [kind] of KINDS) {
      expect(colorAt(previewCtx(kind), 5, 8)).not.toBe(colorAt(muted, 5, 8))
    }
  })

  it('当前把位进行中不读预览表（与真相源、与产出侧**三方同一时机**）', () => {
    const c = makeCtx({
      activeTab: 'scale',
      isPlaying: true,
      scaleKey: 'C',
      scaleExerciseSequence: ['1'],
      selectedScale: C_MAJOR_SCALE,
      threeNpsTarget: { stringIndex: 5, fret: 3 },
      threeNpsCellKeys: new Map<string, unknown>([['5-3', 1]]),
      nextThreeNpsCells: new Map<string, ThreeNpsPreviewKind>([['5-8', 'start']]),
    })
    expect(roleAt(c, 5, 8)).toBe('muted')
    expect(colorAt(c, 5, 8)).toBe('opacity-30 hover:bg-muted/50')
  })

  it('跨皮肤色族一致：青 / 酸黄 / 橙 —— 从 globals.css 的 GuitarRun 规则解析后比对', () => {
    // 铁律：跨实现的一致性要从**对方源码**解析出来，不能凭记忆写死形状。
    const css = readFileSync('app/globals.css', 'utf8')
    const ruleBody = (sel: string) => {
      const at = css.indexOf(sel)
      expect(at, `globals.css 里应存在 ${sel}`).toBeGreaterThanOrEqual(0)
      return css.slice(at, css.indexOf('}', at))
    }
    expect(ruleBody('.gr-cell--next .gr-note-dot')).toContain('--gr-cyan')
    expect(ruleBody('.gr-cell--next-root .gr-note-dot')).toContain('--gr-acid')
    expect(ruleBody('.gr-cell--next-start .gr-note-dot')).toContain('--gr-orange')
    // 本侧（经典皮肤）用同族色 + 同一个 keyframes（避免两套皮肤两种节奏）
    expect(PREVIEW_CLASS.note).toMatch(/\bbg-cyan-/)
    expect(PREVIEW_CLASS.root).toMatch(/\bbg-lime-/)
    expect(PREVIEW_CLASS.start).toMatch(/\bbg-orange-/)
    expect(PREVIEW_CLASS.note).toContain('fret-next-blink')
    expect(ruleBody('.fret-next-blink')).toContain('gr-next-blink')
  })
})
