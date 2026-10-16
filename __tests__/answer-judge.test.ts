import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildIntervalExpectation,
  buildSingleTargetExpectation,
  buildChordMembershipExpectation,
  judgeExpectation,
  noteNameToPitchClass,
  scoreDeltaFor,
} from '@/lib/answer-judge'

/**
 * `lib/answer-judge.ts` 的护栏。
 *
 * 背景见该文件头注释：「答对没有」此前有四份独立实现（音频 / MIDI / 点击显示 /
 * 音程候选匹配），算法互不相同，已产生用户可感知的分叉。本文件的作用是把**正确语义**
 * 钉死，并在 page.tsx 有人绕过本模块手写判定时报警。
 */

const PAGE_SRC = readFileSync(
  path.join(process.cwd(), 'app', 'page.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// 一、最核心的分叉：「音程回弹根音」
// ---------------------------------------------------------------------------

describe('音程回弹根音：不接受「序列里靠后但还没轮到」的候选', () => {
  /**
   * display = "b3 1"（不先找根音 + 回弹根音）：
   *   step 0 该弹 b3，step 1 该弹根音 1。
   *
   * 抽取前 `handleMIDINoteInput` 用 `for ... break` 遍历**全部**未完成候选，
   * 于是 step 0 时弹根音也能命中 index=1 并推进 —— 而点击路径的
   * `resolveExpectedIntervalDegree` 判它是错的 ⇒ **点了显示红色、练习却前进了一步**。
   */
  const ctx = {
    display: 'b3 1',
    completedIndexes: [] as number[],
    findRootFirst: false,
    rootSemitone: 9, // A
    strictOrder: true,
    allIntervals: [
      { symbol: 'b3', semitones: 3 },
      { symbol: '1', semitones: 0 },
    ],
  }

  it('step 0：弹 b3（C）命中 index 0', () => {
    const expectation = buildIntervalExpectation(ctx)
    // A(9) + 3 = 12 → 0 = C
    expect(judgeExpectation(expectation, 0)).toEqual({
      hit: true,
      matchedIndex: 0,
      matchedLabel: 'b3',
    })
  })

  it('step 0：弹根音 A 不算命中（抽取前 MIDI 路径会误判为命中 index 1）', () => {
    const expectation = buildIntervalExpectation(ctx)
    expect(judgeExpectation(expectation, 9).hit).toBe(false)
  })

  it('step 0 完成后：根音才成为唯一活跃候选', () => {
    const expectation = buildIntervalExpectation({ ...ctx, completedIndexes: [0] })
    expect(expectation.activeIndexes).toEqual([1])
    expect(judgeExpectation(expectation, 9)).toEqual({
      hit: true,
      matchedIndex: 1,
      matchedLabel: '1',
    })
  })

  it('反向钉子：activeIndexes 只含**第一个**未完成项，不是全部未完成项', () => {
    // 若哪天有人把 activeIndexes 改回「全部未完成」，上面那条「弹根音不算命中」会一起变绿 ⇒ 假通过。
    // 这里直接断言集合本身，绕不过去。
    expect(buildIntervalExpectation(ctx).activeIndexes).toEqual([0])
  })
})

// ---------------------------------------------------------------------------
// 二、先找根音 / 退化 / 已完成
// ---------------------------------------------------------------------------

describe('音程：先找根音与退化', () => {
  const allIntervals = [
    { symbol: '1', semitones: 0 },
    { symbol: 'b3', semitones: 3 },
    { symbol: '5', semitones: 7 },
  ]

  it('先找根音：根音未完成前只认根音', () => {
    const expectation = buildIntervalExpectation({
      display: '1 b3 5',
      completedIndexes: [],
      findRootFirst: true,
      rootSemitone: 0,
      strictOrder: true,
      allIntervals,
    })
    expect(expectation.activeIndexes).toEqual([0])
    expect(judgeExpectation(expectation, 0).hit).toBe(true) // 根音
    expect(judgeExpectation(expectation, 3).hit).toBe(false) // b3 还没轮到
  })

  it('先找根音且串里**没有**根音 ⇒ 退化为顺序推进（否则永远只认根音 ⇒ 无法推进）', () => {
    const expectation = buildIntervalExpectation({
      display: 'b3 5',
      completedIndexes: [],
      findRootFirst: true,
      rootSemitone: 0,
      strictOrder: true,
      allIntervals,
    })
    expect(expectation.activeIndexes).toEqual([0])
    expect(judgeExpectation(expectation, 3).hit).toBe(true)
  })

  it('已完成的下标不进 activeIndexes（不能重复弹同一个音刷分）', () => {
    const expectation = buildIntervalExpectation({
      display: '1 b3 5',
      completedIndexes: [0, 1],
      findRootFirst: false,
      rootSemitone: 0,
      strictOrder: true,
      allIntervals,
    })
    expect(expectation.activeIndexes).toEqual([2])
    expect(judgeExpectation(expectation, 0).hit).toBe(false)
    expect(judgeExpectation(expectation, 3).hit).toBe(false)
    expect(judgeExpectation(expectation, 7).hit).toBe(true)
  })

  it('全部完成 ⇒ activeIndexes 为空，任何输入都不命中', () => {
    const expectation = buildIntervalExpectation({
      display: '1 b3',
      completedIndexes: [0, 1],
      findRootFirst: false,
      rootSemitone: 0,
      strictOrder: true,
      allIntervals,
    })
    expect(expectation.activeIndexes).toEqual([])
    for (let s = 0; s < 12; s++) expect(judgeExpectation(expectation, s).hit).toBe(false)
  })

  it('strictOrder=false（音频路径）：全部未完成候选都在 activeIndexes 里', () => {
    // 音频路径要先算出所有候选的音分差、再挑最准的那个，所以它必须拿到**全部**候选。
    // 这里「抢跑」不是问题：抢跑的音本来就不会是音分差最小的。
    const expectation = buildIntervalExpectation({
      display: 'b3 1',
      completedIndexes: [],
      findRootFirst: false,
      rootSemitone: 9,
      strictOrder: false,
      allIntervals: [
        { symbol: 'b3', semitones: 3 },
        { symbol: '1', semitones: 0 },
      ],
    })
    expect(expectation.activeIndexes).toEqual([0, 1])
    // 但 judgeExpectation 仍然只回答「弹的是不是其中之一」，挑最准由调用方（pitch-match）负责
    expect(judgeExpectation(expectation, 9).hit).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 三、半音取模：抽取前 MIDI 路径**没有**取模
// ---------------------------------------------------------------------------

describe('音程：半音一律取模 12（抽取前 MIDI 路径漏了取模）', () => {
  it('题目自带复合音程（semitones=14，即 9 度）⇒ 与 2 度同音名判定', () => {
    const expectation = buildIntervalExpectation({
      display: '9',
      completedIndexes: [],
      findRootFirst: false,
      rootSemitone: 0, // C
      strictOrder: true,
      allIntervals: [{ symbol: '9', semitones: 14 }],
    })
    expect(expectation.candidates[0].semitone).toBe(2) // 14 % 12
    expect(judgeExpectation(expectation, 2).hit).toBe(true)
    // 未取模的话这里会是 14，与 2 比不上 ⇒ 弹 D 判错
    expect(judgeExpectation(expectation, 14).hit).toBe(true) // 调用方传 14 也要认
  })

  it('根音 + 复合音程跨八度后仍落在 0..11', () => {
    const expectation = buildIntervalExpectation({
      display: '13',
      completedIndexes: [],
      findRootFirst: false,
      rootSemitone: 10, // A#
      strictOrder: true,
      allIntervals: [{ symbol: '13', semitones: 21 }],
    })
    expect(expectation.candidates[0].semitone).toBe(7) // (10 + 21) % 12
  })

  it('负半音也归到 0..11（异名同音降号侧可能给负值）', () => {
    const expectation = buildIntervalExpectation({
      display: 'b3',
      completedIndexes: [],
      findRootFirst: false,
      rootSemitone: 0,
      strictOrder: true,
      allIntervals: [{ symbol: 'b3', semitones: -9 }],
    })
    expect(expectation.candidates[0].semitone).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// 四、查不到半音的标签
// ---------------------------------------------------------------------------

describe('解析不了的标签：不进候选，但不拖垮其余候选', () => {
  it('未知标签被跳过，其余候选照常可用', () => {
    const expectation = buildIntervalExpectation({
      display: 'b3 zz9',
      completedIndexes: [],
      findRootFirst: false,
      rootSemitone: 0,
      strictOrder: true,
      allIntervals: [{ symbol: 'b3', semitones: 3 }],
    })
    expect(expectation.candidates.map((c) => c.label)).toEqual(['b3'])
    expect(expectation.activeIndexes).toEqual([0])
  })

  it('`1` 恒为 0 半音，不依赖 allIntervals 是否含它', () => {
    const expectation = buildIntervalExpectation({
      display: '1',
      completedIndexes: [],
      findRootFirst: false,
      rootSemitone: 7,
      strictOrder: true,
      allIntervals: [],
    })
    expect(expectation.candidates).toEqual([{ index: 0, label: '1', semitone: 7 }])
  })

  it('fallbackSemitoneOf：题目自带表查不到时兜底（如 `bb7` 等双变音记号）', () => {
    const expectation = buildIntervalExpectation({
      display: 'bb7',
      completedIndexes: [],
      findRootFirst: false,
      rootSemitone: 0,
      strictOrder: true,
      allIntervals: [],
      fallbackSemitoneOf: (label) => (label === 'bb7' ? 9 : undefined),
    })
    expect(expectation.candidates).toEqual([{ index: 0, label: 'bb7', semitone: 9 }])
  })
})

// ---------------------------------------------------------------------------
// 五、单目标模式（音阶 / 和弦练习 / 找音）
// ---------------------------------------------------------------------------

describe('单目标模式（音阶 / chord_exercise / practice）', () => {
  it('命中 / 未命中', () => {
    const expectation = buildSingleTargetExpectation({ label: '#4', targetSemitone: 6 })
    expect(judgeExpectation(expectation, 6)).toEqual({
      hit: true,
      matchedIndex: 0,
      matchedLabel: '#4',
    })
    expect(judgeExpectation(expectation, 5).hit).toBe(false)
  })

  it('locked（本题已 answered）⇒ 任何输入都不命中', () => {
    const expectation = buildSingleTargetExpectation({
      label: 'b7',
      targetSemitone: 10,
      locked: true,
    })
    expect(expectation.activeIndexes).toEqual([])
    expect(judgeExpectation(expectation, 10).hit).toBe(false)
  })

  it('targetSemitone 超 11 也归一（调用方可能直接传绝对半音）', () => {
    const expectation = buildSingleTargetExpectation({ label: 'x', targetSemitone: 25 })
    expect(expectation.candidates[0].semitone).toBe(1)
    expect(judgeExpectation(expectation, 1).hit).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 六、和弦内音一次性判定
// ---------------------------------------------------------------------------

describe('和弦内音：复合音程必须各自取模 + 去重', () => {
  it('9/11/13 这类复合音程与同名单八度音等价', () => {
    // Cmaj13 = [0, 4, 7, 11, 14, 18, 21]；root = C(0)
    // 各自 mod12 ⇒ 命中集 {0, 4, 7, 11, 2, 6, 9}
    //   （注意「11」这个**半音值** mod12 仍是 11，别和「11 度音程 = 18 半音 → 6」搞混）
    const expectation = buildChordMembershipExpectation({
      rootSemitone: 0,
      intervals: [0, 4, 7, 11, 14, 18, 21],
    })
    for (const s of [0, 4, 7, 11, 2, 6, 9]) {
      expect(judgeExpectation(expectation, s).hit, `半音 ${s} 应在和弦内`).toBe(true)
    }
    for (const s of [1, 3, 5, 8, 10]) {
      expect(judgeExpectation(expectation, s).hit, `半音 ${s} 不应在和弦内`).toBe(false)
    }
  })

  it('八度重复音去重（C + [0, 12] 只应有一个候选）', () => {
    const expectation = buildChordMembershipExpectation({
      rootSemitone: 0,
      intervals: [0, 4, 7, 12],
    })
    expect(expectation.candidates).toHaveLength(3)
    expect(expectation.candidates.map((c) => c.semitone)).toEqual([0, 4, 7])
  })

  it('根音非 0 时整体平移', () => {
    const expectation = buildChordMembershipExpectation({
      rootSemitone: 9, // A
      intervals: [0, 4, 7],
    })
    expect(expectation.candidates.map((c) => c.semitone)).toEqual([9, 1, 4])
  })
})

// ---------------------------------------------------------------------------
// 七、弹奏音名解析
// ---------------------------------------------------------------------------

describe('noteNameToPitchClass：吃八度后缀，异名同音同值', () => {
  it('纯音名', () => {
    expect(noteNameToPitchClass('C')).toBe(0)
    expect(noteNameToPitchClass('A')).toBe(9)
    expect(noteNameToPitchClass('B')).toBe(11)
  })

  it('带八度后缀（MIDI 输入常见形态）', () => {
    // 🚨 `getNoteIndex` 走 `NOTES.indexOf(串)` ⇒ `C4` 必然落空返回 -1。
    // MIDI 与旧 `isEquivalentNote` 的语义都允许八度，故判定必须用本函数。
    expect(noteNameToPitchClass('C4')).toBe(0)
    expect(noteNameToPitchClass('A4')).toBe(9)
    expect(noteNameToPitchClass('E2')).toBe(4)
  })

  it('异名同音取同值', () => {
    expect(noteNameToPitchClass('C#')).toBe(1)
    expect(noteNameToPitchClass('Db')).toBe(1)
    expect(noteNameToPitchClass('F#')).toBe(6)
    expect(noteNameToPitchClass('Gb')).toBe(6)
  })

  it('unicode 变音记号与 ASCII 等价', () => {
    expect(noteNameToPitchClass('C♯')).toBe(1)
    expect(noteNameToPitchClass('B♭')).toBe(10)
  })

  it('带宽度的变音记号与八度组合', () => {
    expect(noteNameToPitchClass('C#4')).toBe(1)
    expect(noteNameToPitchClass('B♭3')).toBe(10)
  })

  it('解析不了的输入返回 -1（调用方据此跳过，不要静默判错）', () => {
    for (const bad of ['', '  ', 'H', 'zz', 'b3', '##']) {
      expect(noteNameToPitchClass(bad), `"${bad}" 应解析失败`).toBe(-1)
    }
  })
})

// ---------------------------------------------------------------------------
// 八、计分口径
// ---------------------------------------------------------------------------

describe('计分口径：答错也要计 total（与 store 一致）', () => {
  it('命中 ⇒ correct+1 total+1；未命中 ⇒ correct+0 total+1', () => {
    expect(scoreDeltaFor(true)).toEqual({ correct: 1, total: 1 })
    expect(scoreDeltaFor(false)).toEqual({ correct: 0, total: 1 })
  })

  it('反向钉子：不存在「答错不计分」的返回值', () => {
    // 抽取前音频路径五个模式都是 `if (matched) {...}` 无 else ⇒ 答错完全不记账
    // ⇒ 用麦克风练习时正确率虚高，且该 accuracy 会持久化。这里钉死口径。
    for (const hit of [true, false]) {
      const delta = scoreDeltaFor(hit)
      expect(delta.total, `hit=${hit} 时 total 必须为 1`).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// 九、源码护栏：三条路径不许再手写判定
// ---------------------------------------------------------------------------

describe('源码护栏：page.tsx 必须走本模块，不许再手写候选循环', () => {
  const body = PAGE_SRC
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n')

  it('page.tsx 已 import answer-judge', () => {
    expect(body).toMatch(/from ["']@\/lib\/answer-judge["']/)
  })

  it('音程判定不再手写 `exercise.allIntervals.find` 循环（应改用 buildIntervalExpectation）', () => {
    expect(body).not.toMatch(/allIntervals\.find\(/)
  })

  it('音程判定不再手写「根音是否已完成」的候选过滤', () => {
    // 抽取前 MIDI 与音频两条路径都自己算 `rootCompleted` 再决定跳过谁；
    // 现在统一由 buildExpectationFromLabels 负责。page.tsx 里不该再有这个变量。
    expect(body).not.toMatch(/rootCompleted/)
  })

  it('和弦内音判定不再直接 `intervalToSemitones\[` 手动比对', () => {
    // 抽取前 chord 模式用 `degrees.map(d => intervalToSemitones[d])` + `includes`
    expect(body).not.toMatch(/validSemitones/)
  })

  it('弹奏音一律走 noteNameToPitchClass，不许自己 getNoteIndex(note)', () => {
    // `getNoteIndex` 不剥八度 ⇒ MIDI 传来的 `C4` 会静默返回 -1 ⇒ 判定恒 false
    expect(body).not.toMatch(/getNoteIndex\(note\)/)
    expect(body).not.toMatch(/getNoteIndex\(clickedNote\)/)
    expect(body).toMatch(/noteNameToPitchClass\(/)
  })

  it('按钮答题模式也走同一真相源（不许再用 isEquivalentNote 自算一份）', () => {
    const controlsBody = readFileSync(
      path.join(process.cwd(), 'components', 'practice-mode-controls.tsx'),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n')
    expect(controlsBody).toMatch(/judgeExpectation\(/)
    expect(controlsBody).not.toMatch(/isEquivalentNote/)
  })
})
