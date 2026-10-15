/**
 * 调音器启动的**源码级**契约：必须防「并发重入」。
 *
 * 2026-10-10 全仓审查（P2-5）：
 *   `startTuner` 里有多个 `await`（`stopAudioInput` / `getUserMedia` / 动态 import /
 *   `startAudioCapture`），而所有守卫资源（`tunerStreamRef` / `tunerAudioContextRef` /
 *   `tunerAnimationRef` / `tunerUnlistenRef`）都要等到这些 await **之后**才写入。
 *   ⇒ 快速双击（或触屏抖动）能并发进入两条启动链：后完成的那条把前一条的句柄**全部
 *   覆盖**，于是 `stopTuner` 只能拆掉最后一条，另一条的 rAF 循环 / MediaStream 永久
 *   泄漏：表针还在跳、麦克风常亮、CPU 空转。
 *
 *   另外，Web 路径末尾的 `return () => { isActive = false }` 写在一个 async 函数里，
 *   返回值无人接收 —— 是**死代码**，本意的兜底完全失效。
 *
 * 为什么只能靠源码断言：调音器无法单独渲染（依赖真实 getUserMedia / Rust 事件流）；
 * 这属于「接线」层面的缺陷，组件级测试看不到。
 *
 * 2026-10-15：调音器域（约 360 行）已从 `app/page.tsx` 抽到 `hooks/use-tuner.ts`。
 * 本护栏改为读**两个文件的拼接** —— 代码搬家后锚点照样能找到，护栏不会静默空转。
 *
 * 本护栏锁死三条不变量：
 *   ① 互斥 ref 的置位发生在**第一个 await 之前**（否则 await 窗口仍可重入）；
 *   ② 释放互斥放在 `finally`（否则失败路径把调音器永久锁死）；
 *   ③ 不再有「async 函数里 return 一个清理函数」的死代码兜底，
 *      存活标志改由 ref 持有、由 `stopTuner` 翻转。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// 🚨 调音器代码横跨这两个文件（2026-10-15 拆分）。少读任何一个都会让下面的锚点
//    自检报「找不到」—— 那正是我们想要的失败，而不是静默跳过。
const TUNER_SRC = [
  readFileSync('app/page.tsx', 'utf8'),
  readFileSync('hooks/use-tuner.ts', 'utf8'),
].join('\n')

/** 剥注释：说明性注释里会写 `await` 等字样，不剥会误判顺序 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const SRC = stripComments(TUNER_SRC)

/** 取一个 `const <name> = useCallback(` 段（到下一个 `}, [...])` 收尾） */
function sliceCallback(name: string): string {
  const start = SRC.indexOf(`const ${name} = useCallback(`)
  expect(start, `hooks/use-tuner.ts 里找不到 ${name} —— 护栏会静默空转`).toBeGreaterThan(-1)
  const end = SRC.indexOf('\n  }, [', start)
  expect(end, `${name} 的 useCallback 收尾没找到`).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('调音器启动的并发重入防护（P2-5）', () => {
  it('锚点自检：startTuner / stopTuner / tunerStartingRef 都还在（改名即失败）', () => {
    expect(/\bconst startTuner = useCallback\s*\(/.test(SRC), 'startTuner 消失或改名').toBe(true)
    expect(/\bconst stopTuner = useCallback\s*\(/.test(SRC), 'stopTuner 消失或改名').toBe(true)
    expect(
      /const tunerStartingRef = useRef\s*\(/.test(SRC),
      'tunerStartingRef 消失或改名 —— 没有同步互斥，双击可并发两条启动链'
    ).toBe(true)
    expect(
      /const tunerActiveRef = useRef\s*\(/.test(SRC),
      'tunerActiveRef 消失或改名 —— Web rAF 存活标志失去持有者'
    ).toBe(true)
  })

  it('互斥 ref 的置位必须早于 startTuner 里的第一个 await', () => {
    const body = sliceCallback('startTuner')
    const setIdx = body.indexOf('tunerStartingRef.current = true')
    expect(
      setIdx,
      'startTuner 里没有 `tunerStartingRef.current = true` —— 重入守卫缺失'
    ).toBeGreaterThan(-1)

    const firstAwait = body.indexOf('await ')
    expect(firstAwait, 'startTuner 里居然一个 await 都没有？护栏需要复核').toBeGreaterThan(-1)
    expect(
      setIdx < firstAwait,
      `互斥 ref 在第一个 await **之后**才置位（ref 偏移 ${setIdx}，首个 await 偏移 ${firstAwait}）` +
        ` ⇒ await 期间第二次点击仍能重入，句柄互相覆盖、资源泄漏`
    ).toBe(true)
  })

  it('startTuner 入口必须真的「先查再置」（有 early-return，不是只置位不检查）', () => {
    const body = sliceCallback('startTuner')
    const setIdx = body.indexOf('tunerStartingRef.current = true')
    const before = body.slice(0, setIdx)
    // 置位之前必须有一次「已置位就返回」的检查
    expect(
      /if\s*\(\s*tunerStartingRef\.current\s*\)\s*return/.test(before),
      'tunerStartingRef 只被置位、从不检查 ⇒ 形同虚设，重入照旧'
    ).toBe(true)
  })

  it('互斥释放必须在 finally 里（失败路径不能把调音器永久锁死）', () => {
    const body = sliceCallback('startTuner')
    const finallyIdx = body.lastIndexOf('} finally {')
    expect(finallyIdx, 'startTuner 没有 finally 块 —— 失败路径会永久占用互斥锁').toBeGreaterThan(-1)
    const after = body.slice(finallyIdx)
    expect(
      /tunerStartingRef\.current = false/.test(after),
      'finally 块里没有释放 tunerStartingRef ⇒ 一次失败后调音器就再也起不来'
    ).toBe(true)
  })

  it('不得再有「async 函数里 return 清理函数」的死代码兜底', () => {
    const body = sliceCallback('startTuner')
    // 典型坏味道：return () => { isActive = false }
    expect(
      /return\s*\(\s*\)\s*=>\s*\{[\s\S]{0,80}isActive\s*=\s*false/.test(body),
      'startTuner 里又出现了 `return () => { isActive = false }` ——' +
        ' 在 async 函数里返回值无人接收，是死代码，兜底失效'
    ).toBe(false)
    // 也不该再有裸的局部 isActive 变量（应统一走 tunerActiveRef）
    expect(
      /\blet\s+isActive\s*=/.test(body),
      'startTuner 里又出现了局部 `let isActive` —— 存活标志必须由 tunerActiveRef 持有'
    ).toBe(false)
  })

  it('Web rAF 链的存活判定必须读 tunerActiveRef（而非局部变量）', () => {
    const body = sliceCallback('startTuner')
    expect(
      /if\s*\(\s*!tunerActiveRef\.current\s*\|\|/.test(body),
      'detectPitch 的存活判定没有读 tunerActiveRef —— 停止后 rAF 链会自续命'
    ).toBe(true)
  })

  it('停止调音器必须翻转存活标志，且早于 cancelAnimationFrame', () => {
    // 2026-10-15：`stopTuner` 改为委托 `disposeTunerChain()`（后者同时服务
    // `stopAudioInput` 的跨域清理）。所以不变量现在由 **disposeTunerChain** 承载 ——
    // 这里必须看进它，否则「stopTuner 看起来没问题、实际顺序被颠倒」会静默通过。
    // （拆分当天就真的把这个顺序写反过一次，是这条用例抓出来的。）
    const body = sliceCallback('disposeTunerChain')
    const flipIdx = body.indexOf('tunerActiveRef.current = false')
    expect(
      flipIdx,
      'disposeTunerChain 没有翻转 tunerActiveRef —— 正在执行的那一帧会在末尾再排一次 rAF，自续命'
    ).toBeGreaterThan(-1)
    const cancelIdx = body.indexOf('cancelAnimationFrame')
    expect(cancelIdx, 'disposeTunerChain 里没有 cancelAnimationFrame？护栏需要复核').toBeGreaterThan(-1)
    expect(
      flipIdx < cancelIdx,
      `先 cancelAnimationFrame 再翻转标志（翻转偏移 ${flipIdx}，cancel 偏移 ${cancelIdx}）——` +
        ` 顺序反了：当前帧仍会自续命`
    ).toBe(true)

    // 反向锚点：stopTuner 必须真的委托过去（不能是两个各写一遍的实现）。
    const stop = sliceCallback('stopTuner')
    expect(
      /disposeTunerChain\(\)/.test(stop),
      'stopTuner 没有调用 disposeTunerChain —— 停止逻辑出现了第二份实现，会各自腐烂'
    ).toBe(true)
  })
})
