/**
 * 源码级护栏：exhaustive-deps 修复的防回退锁（2026-10-06 lint 清零批次）。
 *
 * 背景：把 47 条 react-hooks/exhaustive-deps 收敛到 0 的过程中，踩到两个
 * **不能靠「照抄 ESLint 建议」解决**的坑，故意留了偏离建议的写法，用本测试钉住：
 *
 *   1) TDZ —— `stopAudioInput` / `startPitchDetectionWithNodes` 的**声明**在引用它们的
 *      hook 之后。ESLint 要求把它们加进 deps，但 **deps 数组是立即求值的**，写进去会在
 *      渲染期直接抛 "Block-scoped variable used before its declaration"。
 *      这两个 hook 的函数体是延迟执行的（点麦/点调音器才跑），省略依赖是安全的。
 *      ⇒ 必须保留 eslint-disable + 说明注释，且 deps 里绝不能出现这两个名字。
 *
 *   2) 整体 store —— page.tsx 的 `const store = useAppStore.getState()` 是**非订阅快照**，
 *      windows-audio-settings 的 `const store = useAppStore()` 每次 state 变化都换新对象。
 *      把裸 `store` 放进 deps 会让 effect 在每个 state 变化时重跑（甚至自激）。
 *      ⇒ 必须改成单取 action `useAppStore((s) => s.setXxx)` 后再入 deps。
 *      （已用探针验证：zustand action 在 set 之后引用恒定。）
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'

/** 抽出文件里所有 deps 数组所在的「行」（覆盖单行 `}, [...]` 与多行 `[a, b` 两种形态）。 */
function depsLines(src: string): string[] {
  return src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim()
      return t.startsWith('}, [') || t.startsWith('], [') || /^\[[A-Za-z_$]/.test(t)
    })
}

describe('hooks deps 安全：TDZ 与整体 store（不得照抄 ESLint 建议的两处）', () => {
  it('两条收音域的装配顺序：稳定壳 → useTuner → useAudioInput → 壳落值', () => {
    // 2026-10-16（C2）：`use-tuner` 与 `use-audio-input` 互相需要对方的一个函数 ——
    //   - 调音器开播前要 `stopAudioInput`（先停练习收音，两者抢同一个麦克风）
    //   - 收音域开麦前要 `stopTuner` / `tunerActive` / `disposeTunerChain`
    //   而 **options 对象是立即求值的** ⇒ 直接互传必然有一侧 TDZ。
    // 采用的解法是「单向壳 + 反向正常传」：
    //   1. 先声明 `stopAudioInputRef`（初值空实现）与壳 `stopPracticeAudio`（函数体只读 ref）
    //   2. `useTuner` 拿壳 —— 此刻 ref 里还是空实现，但调音器只会在用户**点开时**延迟调用它
    //   3. `useAudioInput` 拿真实的 `tunerActive` / `stopTuner` / `tunerDisposeChain`
    //   4. `useAudioInput` 之后把 ref 指向真实的 `stopAudioInput`
    // 顺序错了有两种坏法：TDZ 直接崩，或**静默失效**（壳永远停在空实现 ⇒ 开调音器停不掉
    // 练习收音，两个 AudioContext 抢麦）。本用例把这条装配顺序钉死。
    const src = readFileSync('app/page.tsx', 'utf8')
    const at = (needle: string, label: string) => {
      const i = src.indexOf(needle)
      expect(i, `page.tsx 里找不到：${label}`).toBeGreaterThan(-1)
      return i
    }
    const refDecl = at('const stopAudioInputRef = useRef<() => void>(() => {})', 'stopAudioInputRef 声明')
    const shellDecl = at('const stopPracticeAudio = useCallback(() => stopAudioInputRef.current(), [])', 'stopPracticeAudio 壳')
    const tunerCall = at('const tuner = useTuner(', 'useTuner 调用')
    const audioCall = at('= useAudioInput({', 'useAudioInput 调用')
    const shellAssign = at('stopAudioInputRef.current = stopAudioInput', '壳落值')

    expect(refDecl, '壳闭包读 `stopAudioInputRef` ⇒ ref 必须在壳之前声明').toBeLessThan(shellDecl)
    expect(shellDecl, 'useTuner 的 options 立即求值 ⇒ 壳必须在调用点之前声明').toBeLessThan(tunerCall)
    expect(tunerCall, 'useAudioInput 立即求值 tunerActive/stopTuner ⇒ useTuner 必须在前').toBeLessThan(audioCall)
    expect(audioCall, '壳只能在 `stopAudioInput` 存在之后才指向它（否则拿到 undefined）').toBeLessThan(shellAssign)

    // 壳必须真的被当成 `stopAudioInput` 传进去 —— 传裸函数就把 TDZ 又绕回来了
    expect(src, 'useTuner 必须拿「壳」而不是裸函数').toContain('stopAudioInput: stopPracticeAudio,')
  })

  it('startTuner 的 deps 里必须有 stopAudioInput（它确实在函数体里被 await）', () => {
    // 与上一条配套：调用点既然在声明之后，exhaustive-deps 就**要求**它进场 ——
    // 否则改了设置后 `startTuner` 仍在用旧的 `stopAudioInput` 闭包。
    // （拆分前这里是「deps 里绝不能出现」，因为那时调用点在声明之前。）
    const src = readFileSync('hooks/use-tuner.ts', 'utf8')
    const start = src.indexOf('const startTuner = useCallback(')
    expect(start, 'hooks/use-tuner.ts 里找不到 startTuner').toBeGreaterThan(-1)
    const end = src.indexOf('\n  }, [', start)
    const body = src.slice(start, end)
    expect(/\bstopAudioInput\b/.test(body), 'startTuner 函数体没有 await stopAudioInput？').toBe(true)
    // `end` 指向收尾行前的那个换行符，故从 end + 1 起取才是 deps 行本身
    const depsLine = src.slice(end + 1, src.indexOf('\n', end + 1))
    expect(
      /\bstopAudioInput\b/.test(depsLine),
      `startTuner 的 deps 里没有 stopAudioInput（deps 行：${depsLine.trim()}）`
    ).toBe(true)
  })

  it('page.tsx 不得再引用收音链路内部符号；hook 里它必须声明在 startAudioInput 之前', () => {
    // 2026-10-16（C2）：音频输入域整块搬进 hooks/use-audio-input.ts，页面**不再**声明
    // `startPitchDetectionWithNodes`。历史约束是「deps 里不得出现它（TDZ）」，搬完之后
    // 退化成更强的一条：页面里连名字都不该有（连注释也别留 —— 留着会指向已不存在的声明）。
    const src = readFileSync('app/page.tsx', 'utf8')
    expect(
      src.includes('startPitchDetectionWithNodes'),
      '该函数已随收音域搬到 hooks/use-audio-input.ts，页面不应再提到它'
    ).toBe(false)

    // 在 hook 里它必须**声明在** `startAudioInput` 的 deps 之前：deps 数组立即求值，
    // 写在后声明的位置会在渲染期抛 TDZ。搬进 hook 时特地把函数挪到了前面，
    // 于是原来那条 eslint-disable 也可以删掉（依赖照实写全）。
    const hook = readFileSync('hooks/use-audio-input.ts', 'utf8')
    const declIdx = hook.indexOf('const startPitchDetectionWithNodes = useCallback(')
    const depsIdx = hook.indexOf('startPitchDetectionWithNodes, tunerActive, stopTuner]')
    expect(declIdx, 'hook 里找不到 startPitchDetectionWithNodes 声明').toBeGreaterThan(-1)
    expect(depsIdx, 'hook 里 startAudioInput 的 deps 没有把它写全（应含 startPitchDetectionWithNodes）').toBeGreaterThan(-1)
    expect(
      declIdx,
      'startAudioInput 的 deps 立即求值 ⇒ 必须先声明 startPitchDetectionWithNodes'
    ).toBeLessThan(depsIdx)
  })

  // ==================== 练习会话域（hooks/use-practice-session.ts）的两条不变量 ====================
  // 2026-10-16（C4）。会话域与收音域踩的是**同一个坑**：options 对象立即求值。
  it('练习会话域的装配顺序：调用点必须在它引用的页面级声明**之后**', () => {
    // `usePracticeSession({ generateNewTarget, generateScaleExercise, clearFretClickTimers, … })`
    // 的 options 对象是**渲染期立即求值**的 —— 调用点若摆在这些 `const` 声明之前，
    // 拿到的是 TDZ 绑定（不是 undefined，而是直接抛 "Cannot access before initialization"）。
    // 拆出来时路径依赖长得吓人（出题动作由各练习域 hook 提供、且分散在页面各处），
    // 所以把「调用点晚于谁」钉死，别指望下一个人记得。
    const src = readFileSync('app/page.tsx', 'utf8')
    const call = src.indexOf('= usePracticeSession({')
    expect(call, 'page.tsx 里找不到 usePracticeSession 调用（被改名/搬走了？护栏会静默空转）').toBeGreaterThan(-1)

    const deps: Array<[string, string]> = [
      ['const [practiceSummaryData, setPracticeSummaryData] = useState', 'setPracticeSummaryData'],
      ['const clearFretClickTimers = useCallback(', 'clearFretClickTimers'],
      ['const generateNewTarget = useCallback(', 'generateNewTarget'],
      // 2026-10-18（C7）：`generateScaleExercise` 已随「音阶练习域」搬进 hooks/use-scale-exercise.ts，
      // 现在来自 hook 解构（解构本身就是声明）⇒ 顺序风险消失，锚点从本列表移除。
      // 它「必须真的被解构出来」由下方的「音阶域已整体搬出页面」用例负责。
    ]
    for (const [needle, label] of deps) {
      const at = src.indexOf(needle)
      expect(at, `page.tsx 里找不到 ${label} 的声明 —— 锚点失效，请同步更新本用例`).toBeGreaterThan(-1)
      expect(at, `usePracticeSession 的 options 立即求值 ⇒ 调用点必须在 ${label} 声明之后`).toBeLessThan(call)
    }
  })

  it('练习会话域已整体搬出页面：页面不得再「声明」其中任何一个符号', () => {
    // 与 C2 的 `startPitchDetectionWithNodes` 那条同型。
    // 页面允许**使用** `togglePractice` / `resetPractice` / `isPracticePaused`（解构自 hook），
    // 但不允许再**声明**它们 —— 一旦有人把它拷回去一半，就会出现两份 `isPracticePaused`
    //（一份在 hook、一份在页面），且页面那份永远不会被 hook 的倒计时 effect 读到。
    const src = readFileSync('app/page.tsx', 'utf8')
    const forbidden = [
      'const togglePractice = useCallback(',
      'const resetPractice = useCallback(',
      'const pausePractice = useCallback(',
      'const resumePractice = useCallback(',
      'const togglePausePractice = useCallback(',
      'const savePracticeState = useCallback(',
      'const [timeLeft, setTimeLeft] = useState(',
      'const [isPracticePaused, setIsPracticePaused] = useState(',
      'const sessionStartRef = useRef',
      'const timerRef = useRef',
      'const wakeLockRef = useRef',
      'const tabToPracticeType = (',
      'fretmaster-practice-state',
    ]
    const leftovers = forbidden.filter((f) => src.includes(f))
    expect(leftovers, `页面里又出现了会话域符号的声明：\n  ${leftovers.join('\n  ')}`).toEqual([])

    // 反向自检：这些符号必须确实活在 hook 里（否则本用例就是「断言空气」）
    const hook = readFileSync('hooks/use-practice-session.ts', 'utf8')
    for (const f of forbidden) {
      expect(hook.includes(f), `hooks/use-practice-session.ts 里没有 ${f} —— 锚点失效，请同步更新本用例`).toBe(true)
    }
  })

  // ==================== 全局快捷键域（hooks/use-global-shortcuts.ts）的装配顺序 ====================
  // 2026-10-16（C5）。第三个踩「options 对象渲染期立即求值」的域（前两个：收音域 C2、会话域 C4）。
  it('全局快捷键域的装配顺序：调用点必须在它引用的页面级声明**之后**', () => {
    // options 立即求值 ⇒ 调用点摆在某个 `const` 声明之前，拿到的是 TDZ 绑定
    //（不是 undefined，而是渲染期直接抛 "Cannot access before initialization"）。
    // 页面上这一段被 5 个不同练习域的出题动作包围，谁挪一下都可能踩到，所以钉死。
    const src = readFileSync('app/page.tsx', 'utf8')
    const call = src.indexOf('useGlobalShortcuts({')
    expect(call, 'page.tsx 里找不到 useGlobalShortcuts 调用 —— 锚点失效，或快捷键域被抽走却没接回来').toBeGreaterThan(-1)

    const deps: Array<[string, string]> = [
      ['const [showAllNotes, setShowAllNotes] = useState(', 'setShowAllNotes'],
      ['const generateNewTarget = useCallback(', 'generateNewTarget'],
      // 2026-10-18（C7）：`nextScaleExercise` 已随「音阶练习域」搬进 hooks/use-scale-exercise.ts，
      // 现在来自 hook 解构 ⇒ 顺序风险消失，锚点从本列表移除（同 C4 的说明）。
      ['const setTabFretboardFlag = useCallback(', 'setTabFretboardFlag'],
      ['const handleTabChange = useCallback(', 'handleTabChange'],
      ['const nextChord = useCallback(', 'nextChord'],
    ]
    for (const [needle, label] of deps) {
      const at = src.indexOf(needle)
      expect(at, `page.tsx 里找不到 ${label} 的声明 —— 锚点失效，请同步更新本用例`).toBeGreaterThan(-1)
      expect(at, `useGlobalShortcuts 的 options 立即求值 ⇒ 调用点必须在 ${label} 声明之后`).toBeLessThan(call)
    }

    // 反向自检：handleKeyDown 本体必须真的在 hook 里（否则上面的顺序检查毫无意义）
    const hook = readFileSync('hooks/use-global-shortcuts.ts', 'utf8')
    expect(hook.includes('const handleKeyDown'), 'hook 里没有 handleKeyDown —— 实现没搬过去').toBe(true)
    expect(
      hook.includes("window.addEventListener('keydown', handleKeyDown)"),
      'hook 里没有 window 级监听 —— 快捷键不会生效'
    ).toBe(true)
  })

  // ==================== 练习统计域：整域必须在一个文件里 ====================
  // 2026-10-16（C6）。这个域原先被**劈成两半**：state 与 recordPractice 在
  // `hooks/use-practice-stats.ts`，而「从服务器加载」「落 localStorage」「把载荷送后端」
  // 散在 `app/page.tsx` —— pendingSaveRef 由 hook 写、由页面 effect 读，改任一侧都要同时看另一侧。
  // 现在三段 effect 与 recentRecords 都并进了 hook。本用例禁止它再被劈回去。
  it('练习统计域已整体并入 hook：页面不得再直接读服务器 / 落库', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    const forbidden = [
      'getAllPracticeStats',
      'savePracticeStats',
      'saveToServer',
      'pendingSaveRef',
      'STATS_STORAGE_KEYS',
      'clearStatsStorage',
      'deduplicateStats',
    ]
    const leftovers = forbidden.filter((f) => src.includes(f))
    expect(
      leftovers,
      `页面里又出现了统计域的符号（应追加到 hooks/use-practice-stats.ts，别在页面里另起一套）：\n  ${leftovers.join('\n  ')}`
    ).toEqual([])

    // 反向自检：这些符号必须确实活在 hook 里（否则本用例就是在断言空气）
    const hook = readFileSync('hooks/use-practice-stats.ts', 'utf8')
    for (const f of forbidden) {
      expect(hook.includes(f), `hooks/use-practice-stats.ts 里没有 ${f} —— 锚点失效，请同步更新本用例`).toBe(true)
    }
    // 页面必须真的把 isTauri 传进去（不传 ⇒ 桌面版会去写 localStorage 统计缓存）
    expect(src, 'usePracticeStats 调用点没传 isTauri').toContain('usePracticeStats({ isTauri })')
  })

  // ==================== 音阶练习域（hooks/use-scale-exercise.ts）：整域必须在一个文件里 ====================
  // 2026-10-18（C7）。这是第三个练习域 hook（与 use-interval-exercise / use-chord-exercise 对齐）。
  // 域里的 refs 是三条判定路径（音频 / MIDI / 点击）读「最新音阶状态」的唯一通道 ——
  // 判定回调不能依赖 state（换音阶会重建回调、打断正在跑的音频处理循环）。
  it('音阶练习域已整体搬出页面：页面不得再声明其 state / ref / 出题函数', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    const forbidden = [
      'const [scaleKey, setScaleKey] = useState(',
      'const [selectedScale, setSelectedScale] = useState(',
      // 🚨 下面三项在原文里是 `useState<泛型>(...)` —— 判据不能写死成 `useState(`，
      //    否则反向自检（hook 侧必须存在）会当场红（本轮就是这么被抓的）。
      'const [selectedScales, setSelectedScales] = useState',
      'const [scaleExerciseSequence, setScaleExerciseSequence] = useState',
      'const [scaleCombo, setScaleCombo] = useState(',
      'const [nextScaleExerciseInfo, setNextScaleExerciseInfo] = useState',
      'const nextScaleExerciseRef = useRef',
      'const scaleKeyRef = useRef(',
      'const scaleComboRef = useRef(0)',
      'const generateScaleExercise = useCallback(',
      'const nextScaleExercise = useCallback(',
      'const computeNextScaleExerciseInfo = useCallback(',
      'const applyThreeNpsPosition = useCallback(',
      'const isThreeNpsMode =',
      'const THREE_NPS_SEQUENCE_ID',
    ]
    const leftovers = forbidden.filter((f) => src.includes(f))
    expect(
      leftovers,
      `页面里又出现了音阶域符号的声明（应追加到 hooks/use-scale-exercise.ts，别在页面里另起一套）：\n  ${leftovers.join('\n  ')}`
    ).toEqual([])

    // 反向自检：这些符号必须确实活在 hook 里（否则本用例就是在断言空气）
    const hook = readFileSync('hooks/use-scale-exercise.ts', 'utf8')
    for (const f of forbidden) {
      expect(hook.includes(f), `hooks/use-scale-exercise.ts 里没有 ${f} —— 锚点失效，请同步更新本用例`).toBe(true)
    }
    // 判定路径的 refs 必须仍从 hook 解构（少一个 ⇒ 判定回调读到旧值或直接编译错）。
    // 🚨 必须在**解构块内**查：页面别处（记账代码 / usePracticeSession 的 options）也会出现
    //    这些名字，全文件 toContain 是无效断言（变异验证抓到过：删掉解构项它照样绿）。
    const declStart = src.indexOf('  const {', src.indexOf('==== 音阶练习域'))
    const declEnd = src.indexOf('= useScaleExercise({', declStart)
    expect(declStart, '找不到 useScaleExercise 的解构块起点').toBeGreaterThan(-1)
    expect(declEnd, '找不到 useScaleExercise 调用').toBeGreaterThan(declStart)
    const destructure = src.slice(declStart, declEnd)
    for (const ref of ['nextScaleExerciseRef', 'scaleKeyRef', 'scaleExerciseSequenceRef', 'scaleExerciseCurrentStepRef', 'selectedScaleRef', 'scaleComboRef', 'scaleMaxComboRef']) {
      expect(destructure, `页面没有从 useScaleExercise 解构 ${ref} —— 判定路径断了`).toContain(ref)
    }
    // 页面必须真的调用 hook（抽走却没接上 ⇒ 全部音阶功能静默失效）
    expect(src, 'page.tsx 里找不到 useScaleExercise 调用').toContain('= useScaleExercise({')
  })

  // ==================== 音频答题域（hooks/use-practice-match.ts）：整域必须在一个文件里 ====================
  // 2026-10-18（C8）。processPracticeMatch 是五模式判定 + 计分/连击/推进 + 冷却的音频侧实现，
  // 判定口径由 lib/answer-judge.ts / lib/pitch-match.ts 钉死（护栏 answer-judge.test.ts）。
  it('音频答题域已整体搬出页面：页面不得再声明 processPracticeMatch 的实现', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    const forbidden = [
      'const processPracticeMatch = useCallback(',
    ]
    const leftovers = forbidden.filter((f) => src.includes(f))
    expect(
      leftovers,
      `页面里又出现了音频答题的实现 —— 应追加到 hooks/use-practice-match.ts。\n` +
        `判定口径有护栏（answer-judge.test.ts），在页面里另写一份 = 两套口径各自腐烂：\n  ${leftovers.join('\n  ')}`
    ).toEqual([])

    // 反向自检：实现必须真的在 hook 里
    const hook = readFileSync('hooks/use-practice-match.ts', 'utf8')
    for (const f of forbidden) {
      expect(hook.includes(f), `hooks/use-practice-match.ts 里没有 ${f} —— 锚点失效，请同步更新本用例`).toBe(true)
    }
    // 且 hook 的实现里不得再出现 deps 豁免（C8 把历史豁免改成 deps 写全，别退回去）
    const implAt = hook.indexOf('const processPracticeMatch = useCallback(')
    const implEnd = hook.indexOf('\n  }, [', implAt)
    const implBody = hook.slice(implAt, implEnd)
    expect(
      implBody.includes('eslint-disable'),
      'processPracticeMatch 里又出现了 deps 豁免 —— C8 已把 deps 照实写全，别退回「半份 deps + disable」'
    ).toBe(false)
  })

  it('page.tsx：deps 数组不得含裸 store（getState 快照引用会变）', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    const bad = depsLines(src).filter((l) => /\bstore\b/.test(l))
    expect(bad, '请改为单取 action：const setX = useAppStore((s) => s.setX)').toEqual([])
  })

  // ==================== 收音域（hooks/use-audio-input.ts）内部的两条不变量 ====================
  // 2026-10-16（C2 搬迁时补）。搬进 hook 时新文件的头部注释一度写着「这两条都有护栏」，
  // 实际一条都没有 —— 补上，让说明与事实一致。
  it('卸载清理 effect：必须经 tunerDisposeChainRef 拆调音器链路，deps 保持 []', () => {
    // 卸载时要连调音器那条独立检测链一起拆（否则页面切换/HMR 后它继续占着麦克风）。
    // 但 `tunerDisposeChain` 的身份每帧都可能变 ⇒ 写进 deps 会让这个「只跑一次」的
    // 清理 effect 变成每帧重跑（反复拆链、关掉刚建好的 AudioContext）。
    // 所以经 ref 调用：ref 在渲染期跟新（不受 deps 管辖）。
    const src = readFileSync('hooks/use-audio-input.ts', 'utf8')
    const call = src.indexOf('tunerDisposeChainRef.current()')
    expect(call, '找不到 tunerDisposeChainRef.current() —— 卸载清理不再拆调音器链路？').toBeGreaterThan(-1)

    const depsStart = src.indexOf('\n  }, [', call)
    expect(depsStart, '找不到该清理 effect 的 deps 收尾').toBeGreaterThan(call)
    const depsLine = src.slice(depsStart + 1, src.indexOf('\n', depsStart + 1)).trim()
    expect(
      depsLine,
      `卸载清理 effect 的 deps 应为空数组（现在 ${JSON.stringify(depsLine)}）—— ` +
        `写进 tunerDisposeChain 会让它每帧重跑`
    ).toBe('}, [])')
  })

  it('stopAudioInput 必须中止正在跑的噪声校准（否则会报一个假的「环境很安静」）', () => {
    // 校准采的是 `analyser` 上的帧；关麦会把那条链路拆掉 ⇒ 不中止的话它会静默采到
    // 一堆「读不到帧」的无效样本，最后给出一个「底噪很低」的结论。
    const src = readFileSync('hooks/use-audio-input.ts', 'utf8')
    const declStart = src.indexOf('const stopAudioInput = useCallback(')
    expect(declStart, '找不到 stopAudioInput 声明').toBeGreaterThan(-1)
    const bodyEnd = src.indexOf('\n  }, [', declStart)
    expect(bodyEnd, '找不到 stopAudioInput 的 deps 收尾').toBeGreaterThan(declStart)
    const body = src.slice(declStart, bodyEnd)
    expect(
      /noiseCalibrationAbortRef\.current\s*=\s*true/.test(body),
      'stopAudioInput 没有把 noiseCalibrationAbortRef 置 true —— 关麦后校准会在静默中采到无效样本'
    ).toBe(true)
  })

  it('windows-audio-settings.tsx：deps 不得含裸 store，且两个 hook 必须用单取 setMicUserPreference', () => {
    const src = readFileSync('components/windows-audio-settings.tsx', 'utf8')
    const bad = depsLines(src).filter((l) => /\bstore\b/.test(l))
    expect(bad, '`useAppStore()` 订阅整个 store，每次 state 变化都换新对象').toEqual([])
    expect(src).toContain('const setMicUserPreference = useAppStore((s) => s.setMicUserPreference)')
    // startAudio / stopAudio 两个 useCallback 的 deps 都要带上它
    const n = src.split('setMicUserPreference]').length - 1
    expect(n, 'startAudio 与 stopAudio 两处 deps 都应含 setMicUserPreference').toBe(2)
  })

  // 🚨 P3-10：`focus-mode.tsx` 是渲染最敏感的面板 —— 它挂在练习主界面上方，
  //    而练习中音高检测每 ~20Hz 更新一次 store state。若这里 `useAppStore()` 全量订阅，
  //    面板会跟着 20Hz 重渲染，且 keydown 监听器（deps 含 store）会同频反复 remove/add。
  it('focus-mode.tsx：不得 `useAppStore()` 全量订阅，且 keydown 的 deps 不得含裸 store', () => {
    const src = readFileSync('components/focus-mode.tsx', 'utf8')
    expect(
      /const\s+\w+\s*=\s*useAppStore\(\s*\)/.test(src),
      '禁止 `useAppStore()` 全量订阅（每次 state 变化都换新对象 ⇒ 20Hz 重渲染）；请单取字段'
    ).toBe(false)
    const bad = depsLines(src).filter((l) => /\bstore\b/.test(l))
    expect(bad, 'keydown effect 的 deps 不得含裸 store（会随 20Hz state 反复 remove/add）').toEqual([])
    // 精确订阅的两个字段必须存在（防止有人「顺手」把订阅整段删掉而不再读 focusMode）
    expect(src).toContain('useAppStore((s) => s.focusMode)')
    expect(src).toContain('useAppStore((s) => s.setFocusModeSettings)')
  })

  it('全仓：组件/hooks 层不得 `useAppStore()` 全量订阅（只允许精确 selector 或 getState）', () => {
    // 说明：`useAppStore.getState()`（非订阅）与 `useAppStore((s) => ...)`（精确订阅）都是允许的；
    // 只有无参数的 `useAppStore()` 才会把整个 store 变成依赖。
    const root = ['app', 'components', 'hooks']
    const skip = new Set<string>()
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${dir}/${e.name}`)
        else if (/\.tsx?$/.test(e.name)) files.push(`${dir}/${e.name}`)
      }
    }
    root.forEach(walk)
    // 🚨 必须剥注释：修复说明里大量出现「原来 `useAppStore()`」这样的**解释性文字**，
    //    不剥就会把注释当代码、永远红（本轮实测踩到）。
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    const offenders = files
      .filter((f) => !skip.has(f))
      .filter((f) => /useAppStore\(\s*\)/.test(stripComments(readFileSync(f, 'utf8'))))
    expect(offenders, `以下文件仍在使用 \`useAppStore()\` 全量订阅：\n${offenders.join('\n')}`).toEqual([])
  })
})
