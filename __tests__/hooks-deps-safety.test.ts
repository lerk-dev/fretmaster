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
import { readFileSync } from 'fs'

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
  it('page.tsx：stopAudioInput 不得进任何 deps 数组，且必须保留 TDZ 说明 + disable', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    const bad = depsLines(src).filter((l) => /\bstopAudioInput\b/.test(l))
    expect(bad, 'stopAudioInput 声明在 startTuner 之后，deps 立即求值 ⇒ 会抛 TDZ').toEqual([])
    expect(src).toContain('stopAudioInput 声明在本 hook 之后（TDZ）')
  })

  it('page.tsx：startPitchDetectionWithNodes 不得进任何 deps 数组，且必须保留 TDZ 说明', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    const bad = depsLines(src).filter((l) => /\bstartPitchDetectionWithNodes\b/.test(l))
    expect(bad, 'startPitchDetectionWithNodes 声明在 hook 之后，deps 立即求值 ⇒ 会抛 TDZ').toEqual([])
    expect(src).toContain('startPitchDetectionWithNodes 声明在本 hook 之后（TDZ）')
  })

  it('page.tsx：deps 数组不得含裸 store（getState 快照引用会变）', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    const bad = depsLines(src).filter((l) => /\bstore\b/.test(l))
    expect(bad, '请改为单取 action：const setX = useAppStore((s) => s.setX)').toEqual([])
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
})
