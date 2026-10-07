/**
 * 「显示指板」是**辅助**开关（铁律 18：先用它辅助、再关掉凭记忆找音）
 * ⇒ 绝不能跨会话记住；一旦记住，下次进来答案就摆在眼前。
 *
 * 2026-10-02 真机确证（裸 CDP，全新 profile + 端到端对照：`进 tab → 开始练习 → ↑ 显示指板
 * → **不点停止** → reload → 再看开关`）：
 *
 *   | tab      | ↑ 后      | reload 后   | 判定 |
 *   |----------|-----------|-------------|------|
 *   | 音程练习 | `checked` | **`checked`** | ✗ 指板自动显示（被记住） |
 *   | 和弦转换 | `checked` | **`checked`** | ✗ 指板自动显示（被记住） |
 *   | 音阶练习 | `checked` | `unchecked` | ✓ 对照（不记忆） |
 *
 * 机制是一条**自激环**（5 个同语义开关里只有 2 个走这条路，其余 3 个硬编码 `false`）：
 *
 *   `useState(store.intervalPractice.showFretboard)`  ← 初值来自持久化 store
 *          ↑                                                    ↓
 *   `localStorage` 落盘  ←──  `setIntervalPracticeSettings({ showFretboard })`（页面 effect 写回）
 *
 * 修法：辅助开关一律硬编码 `useState(false)`，且**不得**出现在 settings 写回对象里。
 * 设置类字段（rootNote / 时长 / 方向…）仍然取自 store —— 那是「用户偏好」，与辅助开关不同。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useIntervalExercise } from '@/hooks/use-interval-exercise'
import { useChordExercise } from '@/hooks/use-chord-exercise'
import { useAppStore, storePartialize } from '@/lib/store'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** 递归收集 app/ hooks/ components/ 下的 ts/tsx 源文件（排除 ui/ 脚手架与测试） */
function collectSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name === 'ui' || name === 'node_modules') continue
        walk(p)
      } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p)
    }
  }
  for (const d of ['app', 'hooks', 'components']) walk(join(ROOT, d))
  return out
}

// ---------------------------------------------------------------- 行为级

const mounted: Array<() => void> = []
let intervalApi: ReturnType<typeof useIntervalExercise> | null = null
let chordApi: ReturnType<typeof useChordExercise> | null = null

function ProbeInterval() { intervalApi = useIntervalExercise(); return null }
function ProbeChord() { chordApi = useChordExercise(); return null }

function mountComponent(Comp: () => null) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Comp)) })
  mounted.push(() => { try { act(() => root.unmount()) } catch { /* 已拆过 */ } container.remove() })
}

afterEach(() => {
  for (const u of mounted.splice(0)) { try { u() } catch { /* 已拆过 */ } }
  intervalApi = null
  chordApi = null
})

describe('辅助开关的初值不得继承持久化值', () => {
  beforeEach(() => {
    // 构造「上次会话按过 ↑ 且 persist 落盘」的现场
    const s = useAppStore.getState()
    useAppStore.setState({
      intervalPractice: { ...s.intervalPractice, showFretboard: true },
      chordProgression: { ...s.chordProgression, showFretboard: true },
    } as never)
  })

  it('音程练习：store 里 showFretboard=true 时，挂载后仍是 false（不继承）', () => {
    mountComponent(ProbeInterval)
    expect(
      intervalApi!.showIntervalFretboard,
      '辅助开关若是从 store 取初值 ⇒ 上次会话的 true 会被恢复 ⇒ 进来就看见答案',
    ).toBe(false)
  })

  it('和弦练习：同样是「挂载即隐藏」（此路已是对的，钉住防回归）', () => {
    mountComponent(ProbeChord)
    expect(chordApi!.showChordExerciseFretboard).toBe(false)
  })

  it('反向证伪：同一 hook 里的**设置类**字段仍取自 store（不是把 store 初值一刀切）', () => {
    const s = useAppStore.getState()
    useAppStore.setState({
      intervalPractice: { ...s.intervalPractice, rootNote: 'D', practiceDuration: 9, showFretboard: true },
    } as never)
    mountComponent(ProbeInterval)
    expect(intervalApi!.rootNote).toBe('D')
    expect(intervalApi!.intervalPracticeDuration).toBe(9)
    // 只有辅助开关例外
    expect(intervalApi!.showIntervalFretboard).toBe(false)
  })
})

// ---------------------------------------------------------------- 源码级

describe('源码护栏：辅助开关的初值策略必须全仓一致', () => {
  it('全仓不得再有 `useState(store.<slice>.show*)`（扫目录，不扫单文件）', () => {
    const offenders = collectSources().filter((p) =>
      /useState\s*\(\s*store\.[A-Za-z]+\.show[A-Za-z]*\s*\)/.test(readFileSync(p, 'utf8')),
    )
    expect(offenders, `辅助开关不得从持久化 store 取初值：${offenders.join(', ')}`).toEqual([])
  })

  it('穷举：练习页那 3 个文件里**所有** show* 开关都硬编码 useState(false)', () => {
    const bad: string[] = []
    for (const f of ['app/page.tsx', 'hooks/use-interval-exercise.ts', 'hooks/use-chord-exercise.ts']) {
      for (const m of read(f).matchAll(
        /const\s+\[(show[A-Za-z]*)\s*,\s*set[A-Za-z]+\]\s*=\s*useState\(([^)]*)\)/g,
      )) {
        if (m[2].trim() !== 'false') bad.push(`${f}: ${m[1]} = useState(${m[2]})`)
      }
    }
    expect(bad, `辅助开关的初值必须统一为 false（不得继承 store / props）：\n${bad.join('\n')}`).toEqual([])
  })

  it('settings 写回对象里不得出现任何 show* 字段（辅助开关不进持久化）', () => {
    const page = read('app/page.tsx')
    const names = ['setIntervalPracticeSettings', 'setChordProgressionSettings']
    for (const fn of names) {
      const m = page.match(new RegExp(`${fn}\\(\\s*\\{([\\s\\S]*?)\\}\\)`))
      expect(m, `找不到 ${fn} 的调用块 —— 护栏锚点丢了，改结构后必须同步这里`).not.toBeNull()
      expect(m![1], `${fn} 写回了辅助开关`).not.toMatch(/\bshow[A-Za-z]*\s*:/)
    }
  })

  it('缝隙证明：这两个 slice 确实在持久化白名单里 ⇒ 旧实现必然把 true 恢复成初值', () => {
    // 行为级求证（不用正则猜源码）：白名单真的会带上这两个 slice
    const persisted = storePartialize(useAppStore.getState() as never) as Record<string, unknown>
    expect(Object.keys(persisted), '这两个 slice 若不在白名单，「初值继承」这条缝隙就不成立').toEqual(
      expect.arrayContaining(['intervalPractice', 'chordProgression']),
    )
    // 且它们内部确实带着辅助开关字段（可被写、可被恢复）
    expect(persisted.intervalPractice).toHaveProperty('showFretboard')
    expect(persisted.chordProgression).toHaveProperty('showFretboard')
  })
})
