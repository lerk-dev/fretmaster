/**
 * 练习答题判定 —— **唯一真相源**。
 *
 * ## 为什么要抽这个模块
 *
 * 「答对没有」这件事此前有 **四份**互相独立的实现，分属三条输入路径：
 *
 * | # | 实现 | 位置（2026-10-15 抽取前） | 用途 |
 * |---|---|---|---|
 * | ① | `processPracticeMatch` | `app/page.tsx:2165` | 麦克风 / Tauri 原生音频 |
 * | ② | `handleMIDINoteInput` | `app/page.tsx:3151` | MIDI 键盘 **＋ 指板点击的推进** |
 * | ③ | `handleFretClick` 的 `isCorrect` | `app/page.tsx:3493` | 只用于点击后的红/绿**显示** |
 * | ④ | `findBestIntervalMatch` | `lib/pitch-match.ts:127` | ① 在音程模式下调用的候选匹配 |
 *
 * 四份实现各自算「这一步该弹哪个音」，且**算法不一样**，于是产生了用户能直接感知的分叉：
 *
 * - **音程「回弹根音」**：display `"b3 1"`（不先找根音），当前该弹 `b3`。
 *   ③ 用 `resolveExpectedIntervalDegree` ⇒ 期望 `b3`，弹了 `1` 判**错**（红）；
 *   ② 却遍历全部未完成候选 ⇒ 弹 `1` 也能 `break` 命中 ⇒ 判**对**并推进。
 *   ⇒ 点了显示红色、练习却悄悄前进了一步。
 * - **同一个音级查三张表**：①/④ 查 `intervalToSemitones`（真相源表），
 *   ② 查题目自带的 `allIntervals` **且不取模**，③ 查 `allIntervals` 并 `% 12`。
 * - **答错计不计分**：① 五个模式全都不计（`if (matched) {...}` 无 else）；
 *   ② 五个模式全都 `setScore(total + 1)`。而 `lib/store.ts::recordPositionStat`
 *   的口径是 **答错也计 total** ⇒ 用麦练习的正确率分母偏小（虚高），
 *   且这个 `accuracy` 会**持久化进统计库**。
 *
 * 本模块把「这一步期望哪些音」与「弹的是不是其中之一」抽成纯函数，
 * 三条路径共用；**计分 / 推进** 另见本文件尾部的 `AnswerOutcome`。
 *
 * ## 设计原则
 *
 * - **纯函数、无 React 依赖**：输入是 plain object，输出是 plain object ⇒ 可直接穷举测试。
 * - **不吞异常**：查不到半音就返回 `undefined`，由调用方决定是「忽略」还是「告警」。
 *   历史上多处 `if (semitone === undefined) return` 造成了「弹对了没反应且不报错」，
 *   那类静默失败只能靠穷举测试兜住，不能再靠 `return`。
 * - **半音一律 0..11**：跨八度的复合音程（9/11/13）在这里不保留八度信息，
 *   因为判定只关心音名（异名同音由调用方的音名表处理）。
 */

import { getNoteIndex } from '@/lib/page-theory-functions'

/** 候选：序列里的一个「可接受的音」 */
export interface AnswerCandidate {
  /** 候选在序列里的下标 —— 推进状态（completedIntervals 等）用这个记账 */
  index: number
  /** 候选标签：音程模式是音级字符串（`b3`/`1`），音阶/和弦模式是度数字符串 */
  label: string
  /** 目标半音，恒为 0..11 */
  semitone: number
}

/** 一步练习的期望：全部候选 + 当前可接受的下标 */
export interface AnswerExpectation {
  /** 全部候选，按序列顺序；**含已完成的**（调用方需自行排除或展示） */
  candidates: readonly AnswerCandidate[]
  /** 当前可接受的下标集合（已排除已完成、已应用「先找根音」约束） */
  activeIndexes: readonly number[]
}

/** 判定结果 */
export interface AnswerVerdict {
  /** 是否命中当前这一步 */
  hit: boolean
  /** 命中的候选下标；未命中为 `null` */
  matchedIndex: number | null
  /** 命中的候选标签；未命中为 `null` */
  matchedLabel: string | null
}

const mod12 = (semitones: number): number => ((semitones % 12) + 12) % 12

/**
 * 弹奏音名 → 半音下标（0..11）；解析失败返回 `-1`。
 *
 * 与 `lib/page-theory-functions.ts::getNoteIndex` 的差别只有一处：**允许八度后缀**
 * （`C4` / `C♯4` / `Db3`）。MIDI 输入与 `isEquivalentNote` 的历史语义都允许带八度，
 * 而 `getNoteIndex` 走的是 `NOTES.indexOf(归一化后的串)` ⇒ 带八度必然落空返回 `-1`
 * ⇒ 判定恒 false（且不报错，只是「弹对了没反应」）。
 *
 * 🚨 判定一律走本函数，不要各处自己 `getNoteIndex(note)`。
 */
export function noteNameToPitchClass(note: string): number {
  if (!note) return -1
  // 只取开头的音名部分：字母 + 至多两个变音记号（`##5`/`bb7` 这类双变音）
  const match = note.match(/^([A-Ga-g][#♯b♭]{0,2})/)
  const name = match ? match[1] : note
  const normalized = name.replace(/#/g, '♯').replace(/b/g, '♭')
  return getNoteIndex(normalized)
}

/**
 * 把「音级/度数标签序列」解析成候选集 —— 五个模式共用的底层。
 *
 * @param labels        序列（音程模式传 `currentIntervalDisplay.split(' ')`）
 * @param completed     已完成的下标（interval 模式有；其余模式传 `[]`）
 * @param findRootFirst 先找根音：根音未弹出前只认根音（仅 interval 模式用）
 * @param rootSemitone  根音半音（0..11）；其余模式的「根音」即题目根音
 * @param semitoneOf    标签 → 相对根音的半音数；返回 `undefined` 表示该标签解析不了
 * @param strictOrder   **只认序列里第一个未完成的候选**（点击 / MIDI 路径用）
 *
 * ### 为什么要有 `strictOrder` 这个开关
 *
 * 两条路径的输入性质不同，「多候选」的含义也不同：
 *
 * - **点击 / MIDI**：输入是一个**确定的音名**，没有歧义 ⇒ 必须只认「当前该弹的那一个」。
 *   抽取前 `handleMIDINoteInput` 遍历全部未完成候选并 `break` 命中第一个匹配上的，
 *   于是在 display `"b3 1"`（回弹根音）里，step 0 弹根音也会被判对 —— 而点击路径的
 *   `resolveExpectedIntervalDegree` 判它是错的 ⇒ **点了显示红色、练习却前进了一步**。
 * - **音频**：输入是频率，同一个音名可能有 ±30 音分的偏差，需要先算出全部候选的
 *   音分差再挑最准的那个（`findBestIntervalMatch`）⇒ 必须给它**全部**候选。
 *   这里不存在「抢跑」问题：它挑的是音分差最小的，抢跑的音本来就不会最接近。
 *
 * 两者共用同一套 `candidates`，只有 `activeIndexes` 的宽严不同 —— 差异被显式化，
 * 而不是像抽取前那样散在两份实现里各自为政。
 */
export function buildExpectationFromLabels(input: {
  labels: readonly string[]
  completed: readonly number[]
  findRootFirst: boolean
  rootSemitone: number
  semitoneOf: (label: string) => number | undefined
  strictOrder: boolean
}): AnswerExpectation {
  const { labels, completed, findRootFirst, rootSemitone, semitoneOf, strictOrder } = input

  // 「先找根音」且串里确实有根音 ⇒ 根音未完成前只认根音。
  // 🚨 必须要求串里有 `1`：否则「先找根音」开启而题目无根音时，activeIndexes 恒空
  // ⇒ 练习永远无法推进（历史 bug 家族，见 lib/interval-expected-degree.ts 注释）。
  const rootCompleted = labels.some((label, i) => label === '1' && completed.includes(i))
  const rootOnly = findRootFirst && labels.includes('1') && !rootCompleted

  const candidates: AnswerCandidate[] = []
  const pending: number[] = []

  for (let index = 0; index < labels.length; index++) {
    const label = labels[index]
    const relative = semitoneOf(label)
    if (relative === undefined) continue

    candidates.push({ index, label, semitone: mod12(rootSemitone + relative) })

    if (completed.includes(index)) continue
    if (rootOnly && label !== '1') continue
    pending.push(index)
  }

  const activeIndexes = strictOrder && pending.length > 0 ? [pending[0]] : pending

  return { candidates, activeIndexes }
}

/**
 * 判定：弹的半音是否命中当前这一步。
 *
 * 只与 `activeIndexes` 里的候选比对 —— 宽严由 builder 的 `strictOrder` 决定
 * （点击 / MIDI 路径严格，音频路径宽）。见 `buildExpectationFromLabels` 的注释。
 */
export function judgeExpectation(
  expectation: AnswerExpectation,
  playedSemitone: number,
): AnswerVerdict {
  const played = mod12(playedSemitone)
  for (const index of expectation.activeIndexes) {
    const candidate = expectation.candidates.find((c) => c.index === index)
    if (candidate && candidate.semitone === played) {
      return { hit: true, matchedIndex: index, matchedLabel: candidate.label }
    }
  }
  return { hit: false, matchedIndex: null, matchedLabel: null }
}

// ============================================================================
// 各模式的 builder —— 差异只在「标签从哪来」「半音怎么查」，判定逻辑完全共用
// ============================================================================

/**
 * 音程练习（`activeTab === 'interval'`）。
 *
 * @param allIntervals 题目自带的音级表（`{ symbol, semitones }`）。
 *   优先查它（题目自己的定义最权威），查不到再退回 `fallbackSemitoneOf`。
 *   🚨 一律 `mod12`：抽取前 MIDI 路径**没有取模**，若题目给出复合音程会与
 *   `targetSemitoneOf` 的结果错开一个八度。
 */
export function buildIntervalExpectation(input: {
  display: string
  completedIndexes: readonly number[]
  findRootFirst: boolean
  rootSemitone: number
  allIntervals: ReadonlyArray<{ symbol: string; semitones: number }>
  /** 点击 / MIDI = `true`；音频 = `false`（见 buildExpectationFromLabels 注释） */
  strictOrder: boolean
  fallbackSemitoneOf?: (label: string) => number | undefined
}): AnswerExpectation {
  const { display, allIntervals, fallbackSemitoneOf, strictOrder } = input
  return buildExpectationFromLabels({
    labels: display.split(' '),
    completed: input.completedIndexes,
    findRootFirst: input.findRootFirst,
    rootSemitone: input.rootSemitone,
    strictOrder,
    semitoneOf: (label) => {
      if (label === '1') return 0
      const own = allIntervals.find((i) => i.symbol === label)
      if (own) return own.semitones
      return fallbackSemitoneOf?.(label)
    },
  })
}

/**
 * 音阶练习（`activeTab === 'scale'`）。
 *
 * 单候选：`labels` 只放当前 step 那一个度数。
 * 半音由调用方经 `resolveScaleTargetNoteIndex` 之类的真相源算出后**直接给音名下标**，
 * 因为音阶的「标签 → 半音」依赖当前选中音阶自己的对齐表，不该在这里再查一次表
 * （详见 `lib/scale-target-note.ts` 头注释：反向反查表会踩异名同音的坑）。
 */
export function buildSingleTargetExpectation(input: {
  label: string
  targetSemitone: number
  /** 当步已完成（例如已 answered）⇒ 不接受任何输入 */
  locked?: boolean
}): AnswerExpectation {
  const candidates: AnswerCandidate[] = [
    { index: 0, label: input.label, semitone: mod12(input.targetSemitone) },
  ]
  return {
    candidates,
    activeIndexes: input.locked ? [] : [0],
  }
}

/**
 * 和弦转换练习（`activeTab === 'chord'`）**一次性判定**用。
 *
 * 🚨 这个模式在两条路径上的**玩法本来就不同**，本 builder 只统一「哪些音算和弦内音」
 * 这一件事，**不**统一玩法：
 *   - 音频路径：逐个音推进（`chordDegreeCurrentStep`），弹完整组和弦音才 +1；
 *   - MIDI / 点击路径：弹中任一和弦内音就 +1。
 * 差异由 `__tests__/answer-judge.test.ts` 钉住，改动前请先确认产品语义。
 *
 * @param intervals 和弦的音程数组，**含复合音程**（9→14、13→21…）⇒ 必须各自 `mod12`
 *    （记忆铁律：和弦音程含复合音程，禁 `includes(interval)` 直接比）。
 */
export function buildChordMembershipExpectation(input: {
  rootSemitone: number
  intervals: readonly number[]
}): AnswerExpectation {
  const seen = new Set<number>()
  const candidates: AnswerCandidate[] = []
  const activeIndexes: number[] = []

  input.intervals.forEach((raw, i) => {
    const semitone = mod12(input.rootSemitone + raw)
    if (seen.has(semitone)) return
    seen.add(semitone)
    candidates.push({ index: i, label: String(raw), semitone })
    activeIndexes.push(i)
  })

  return { candidates, activeIndexes }
}

/**
 * 和弦练习（`activeTab === 'chord_exercise'`）/ 找音练习（`practice`）：
 * 都是「当前这一步只要一个音」，与 `buildSingleTargetExpectation` 同构，
 * 这里给出语义化的包装，调用方一眼能看出属于哪个模式。
 */
export const buildChordExerciseExpectation = buildSingleTargetExpectation
export const buildPracticeExpectation = buildSingleTargetExpectation

// ============================================================================
// 计分口径 —— 同样要唯一
// ============================================================================

/**
 * 一次答题的计分口径。
 *
 * 🚨 **答错也要计 `total`**：`lib/store.ts::recordPositionStat` 的口径就是
 * `total + 1`（无条件），而正确率 = `score.correct / score.total`
 * （见 `components/app-header.tsx:218`、`components/focus-mode.tsx:227`），
 * 并会经会话统计**持久化进统计库**（`app/page.tsx:1220`）。
 *
 * 抽取前音频路径五个模式全部「答错不计」（`if (matched) {...}` 无 else），
 * ⇒ 用麦克风练习时正确率虚高（答错的不进分母），且与 MIDI 路径的统计不可比。
 */
export interface ScoreDelta {
  correct: 0 | 1
  total: 0 | 1
}

export function scoreDeltaFor(hit: boolean): ScoreDelta {
  return hit ? { correct: 1, total: 1 } : { correct: 0, total: 1 }
}
