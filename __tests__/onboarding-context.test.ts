/**
 * components/onboarding/onboarding-context.tsx 的契约测试（此前零测试）。
 *
 * 新手教程的状态机 + localStorage 持久化。它没有 UI，逻辑全在这个 Provider 里，
 * 所以契约集中在「状态迁移」与「什么时候写/读/删 localStorage」。
 *
 * 契约重点：
 *  ① 每个动作对 `isActive / currentStepIndex / isPaused / hasSeenOnboarding /
 *     isCompleted` 的精确影响 —— 这些字段决定教程是否出现、从哪一步开始；
 *  ② **落盘时机**：start/skip → `hasSeen`；走到最后一步 next → `completed`；
 *     stop 什么都不写；reset 删除整个 key。写错就会出现「教程反复自己弹」；
 *  ③ **saveState 必须与已有数据合并**（它先读再展开），否则会清掉同 key 下别的字段；
 *  ④ 边界：prevStep 在第 0 步不越界、goToStep 拒绝越界下标；
 *  ⑤ 坏 JSON 不能把应用搞崩（只 console.error，状态保持默认）；
 *  ⑥ 自动开始：默认开、已看过则不开、显式 false 则永不；
 *  ⑦ `restartTutorial()` 模块级全局函数：先 reset 再 100ms 后 start；
 *     卸载后必须变成空操作（不能留下悬空回调）。
 *
 * ⚠️ 全局 setup 把 localStorage 换成了 vi.fn 桩（且属性不可重定义），
 *    所以这里用 `localStorage.getItem.mockReturnValue(...)` 造持久化数据、
 *    用 `expect(localStorage.setItem).toHaveBeenCalledWith(...)` 断言落盘内容。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  OnboardingProvider,
  useOnboarding,
  restartTutorial,
  type OnboardingStep,
} from '@/components/onboarding/onboarding-context'
import { LEGACY_USER_EVIDENCE_KEY } from '@/lib/onboarding-user-evidence'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Ctx = ReturnType<typeof useOnboarding>

const t = (k: string) => k
const KEY = 'test-onboarding'

let ctx: Ctx | null = null

function Probe() {
  ctx = useOnboarding()
  return createElement('div', null, `${ctx.isActive ? 'on' : 'off'}:${ctx.currentStepIndex}`) as ReactNode
}

/** 挂载 Provider（默认关闭自动开始，便于逐项验证） */
function mount(config: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(OnboardingProvider as never, {
      t,
      config: { storageKey: KEY, autoStartOnFirstVisit: false, ...config },
    } as never, createElement(Probe as never, null as never)))
  })
  return {
    container,
    text: () => container.textContent ?? '',
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

const ls = localStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
}

/** 取出最后一次写入的持久化对象 */
function lastSaved(): Record<string, unknown> {
  const calls = ls.setItem.mock.calls.filter((c) => c[0] === KEY)
  expect(calls.length).toBeGreaterThan(0)
  return JSON.parse(String(calls[calls.length - 1][1]))
}

beforeEach(() => {
  ls.getItem.mockReset().mockReturnValue(null)
  ls.setItem.mockReset()
  ls.removeItem.mockReset()
  ctx = null
})

describe('缺省与空数据', () => {
  it('不传 storageKey 时落盘用默认 key（fretmaster-onboarding）', () => {
    const p = mount({ storageKey: undefined })
    act(() => { ctx!.startOnboarding() })
    const keys = ls.setItem.mock.calls.map((c) => c[0])
    expect(keys).toContain('fretmaster-onboarding')
    expect(keys).not.toContain(KEY)
    p.unmount()
  })

  it('steps 为空数组时 currentStep 是 null（而不是 undefined，也不越界取到别的东西）', () => {
    const p = mount({ steps: [] })
    expect(ctx!.currentStep).toBeNull()
    expect(ctx!.totalSteps).toBe(0)
    // goToStep / nextStep 在空表上都不该把下标推成非法值
    act(() => { ctx!.goToStep(3) })
    expect(ctx!.currentStepIndex).toBe(0)
    act(() => { ctx!.nextStep() })
    expect(ctx!.currentStepIndex).toBe(0)
    p.unmount()
  })
})

describe('useOnboarding 的前置条件', () => {
  it('在 Provider 之外调用会抛错（防止静默拿到 undefined）', () => {
    function Orphan() { useOnboarding(); return null }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const err = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 React 的报错日志 */ })
    expect(() => {
      act(() => { root.render(createElement(Orphan as never, null as never)) })
    }).toThrow(/must be used within an OnboardingProvider/)
    err.mockRestore()
    act(() => root.unmount()); container.remove()
  })
})

describe('默认配置与进度', () => {
  it('默认 9 步，currentStep 取当前下标，progress 按 (下标+1)/总数', () => {
    const p = mount()
    expect(ctx!.totalSteps).toBe(9)
    expect(ctx!.currentStepIndex).toBe(0)
    expect(ctx!.currentStep?.id).toBe('welcome')
    expect(ctx!.isActive).toBe(false)          // 默认不自动开（config 里显式关掉）
    expect(ctx!.hasSeenOnboarding).toBe(false)
    expect(ctx!.isCompleted).toBe(false)
    expect(ctx!.progress).toBeCloseTo((1 / 9) * 100, 6)

    act(() => { ctx!.goToStep(4) })
    expect(ctx!.currentStep?.id).toBe('chord-exercise')
    expect(ctx!.progress).toBeCloseTo((5 / 9) * 100, 6)
    p.unmount()
  })

  it('未传 t 时默认原样返回 key（调用方必须显式传翻译函数）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    let localCtx: Ctx | null = null
    function Cap() { localCtx = useOnboarding(); return null }
    act(() => {
      root.render(createElement(OnboardingProvider as never, {
        config: { storageKey: KEY, autoStartOnFirstVisit: false },
      } as never, createElement(Cap as never, null as never)))
    })
    expect(localCtx!.t('any_key')).toBe('any_key')
    act(() => root.unmount()); container.remove()
  })

  it('自定义 steps / storageKey 生效', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', titleKey: 'ta', descriptionKey: 'da' },
      { id: 'b', titleKey: 'tb', descriptionKey: 'db' },
    ]
    const p = mount({ steps, storageKey: 'custom-key' })
    expect(ctx!.totalSteps).toBe(2)
    expect(ctx!.currentStep?.id).toBe('a')

    act(() => { ctx!.startOnboarding() })
    expect(ls.setItem.mock.calls.map((c) => c[0])).toContain('custom-key')
    p.unmount()
  })
})

describe('状态迁移', () => {
  it('startOnboarding：激活 + 回到第 0 步 + 取消暂停 + 标记已看并落盘 hasSeen', () => {
    const p = mount()
    act(() => { ctx!.goToStep(3) })
    act(() => { ctx!.pauseOnboarding() })
    expect(ctx!.isPaused).toBe(true)

    act(() => { ctx!.startOnboarding() })
    expect(ctx!.isActive).toBe(true)
    expect(ctx!.currentStepIndex).toBe(0)
    expect(ctx!.isPaused).toBe(false)
    expect(ctx!.hasSeenOnboarding).toBe(true)
    expect(lastSaved()).toEqual({ hasSeen: true })
    p.unmount()
  })

  it('nextStep 逐步前进，最后一步再 next 变成「已完成」并落盘 completed', () => {
    const p = mount()
    act(() => { ctx!.startOnboarding() })
    for (let i = 1; i <= 8; i++) {
      act(() => { ctx!.nextStep() })
      expect(ctx!.currentStepIndex).toBe(i)
      expect(ctx!.isActive).toBe(true)
    }
    // 第 9 步（下标 8）是最后一步
    expect(ctx!.currentStep?.id).toBe('complete')

    ls.setItem.mockClear()
    act(() => { ctx!.nextStep() })
    expect(ctx!.isCompleted).toBe(true)
    expect(ctx!.isActive).toBe(false)          // 完成后自动关闭
    expect(ctx!.currentStepIndex).toBe(8)      // 下标不回退
    expect(lastSaved()).toEqual({ completed: true })
    p.unmount()
  })

  it('prevStep 在第 0 步不越界；其余步回退', () => {
    const p = mount()
    act(() => { ctx!.startOnboarding() })
    act(() => { ctx!.prevStep() })
    expect(ctx!.currentStepIndex).toBe(0)

    act(() => { ctx!.goToStep(2) })
    act(() => { ctx!.prevStep() })
    expect(ctx!.currentStepIndex).toBe(1)
    p.unmount()
  })

  it('goToStep 只接受 [0, 总数) 内的下标', () => {
    const p = mount()
    act(() => { ctx!.goToStep(5) })
    expect(ctx!.currentStepIndex).toBe(5)

    act(() => { ctx!.goToStep(-1) })
    expect(ctx!.currentStepIndex).toBe(5)
    act(() => { ctx!.goToStep(9) })
    expect(ctx!.currentStepIndex).toBe(5)
    act(() => { ctx!.goToStep(8) })
    expect(ctx!.currentStepIndex).toBe(8)
    p.unmount()
  })

  it('skipOnboarding：关闭教程 + 标记已看并落盘（不含 completed）', () => {
    const p = mount()
    act(() => { ctx!.startOnboarding() })
    ls.setItem.mockClear()
    act(() => { ctx!.skipOnboarding() })
    expect(ctx!.isActive).toBe(false)
    expect(ctx!.hasSeenOnboarding).toBe(true)
    expect(ctx!.isCompleted).toBe(false)
    expect(lastSaved()).toEqual({ hasSeen: true })
    p.unmount()
  })

  it('pause / resume 只切 isPaused，不影响 isActive 与步骤', () => {
    const p = mount()
    act(() => { ctx!.startOnboarding() })
    act(() => { ctx!.goToStep(2) })

    act(() => { ctx!.pauseOnboarding() })
    expect(ctx!.isPaused).toBe(true)
    expect(ctx!.isActive).toBe(true)
    expect(ctx!.currentStepIndex).toBe(2)

    act(() => { ctx!.resumeOnboarding() })
    expect(ctx!.isPaused).toBe(false)
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })

  it('stopOnboarding：关闭 + 回到第 0 步 + 取消暂停，但什么都不落盘', () => {
    const p = mount()
    act(() => { ctx!.startOnboarding() })
    act(() => { ctx!.goToStep(4) })
    act(() => { ctx!.pauseOnboarding() })

    ls.setItem.mockClear()
    act(() => { ctx!.stopOnboarding() })
    expect(ctx!.isActive).toBe(false)
    expect(ctx!.currentStepIndex).toBe(0)
    expect(ctx!.isPaused).toBe(false)
    // 已经记过 hasSeen 了，stop 不应该再写一次
    expect(ls.setItem).not.toHaveBeenCalled()
    p.unmount()
  })

  it('resetOnboarding：清空全部状态并删除 storage key', () => {
    ls.getItem.mockReturnValue(JSON.stringify({ hasSeen: true, completed: true }))
    const p = mount()
    expect(ctx!.hasSeenOnboarding).toBe(true)
    expect(ctx!.isCompleted).toBe(true)

    act(() => { ctx!.resetOnboarding() })
    expect(ctx!.isActive).toBe(false)
    expect(ctx!.currentStepIndex).toBe(0)
    expect(ctx!.isCompleted).toBe(false)
    expect(ctx!.hasSeenOnboarding).toBe(false)
    expect(ctx!.isPaused).toBe(false)
    expect(ls.removeItem).toHaveBeenCalledWith(KEY)
    p.unmount()
  })
})

describe('localStorage 持久化', () => {
  it('挂载时恢复 hasSeen / completed', () => {
    ls.getItem.mockReturnValue(JSON.stringify({ hasSeen: true, completed: true }))
    const p = mount()
    expect(ls.getItem).toHaveBeenCalledWith(KEY)
    expect(ctx!.hasSeenOnboarding).toBe(true)
    expect(ctx!.isCompleted).toBe(true)
    expect(ctx!.isActive).toBe(false)
    p.unmount()
  })

  it('坏 JSON 不抛错：只 console.error，状态保持默认', () => {
    ls.getItem.mockReturnValue('{ 这不是 JSON')
    const err = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    const p = mount()
    expect(err).toHaveBeenCalled()
    expect(ctx!.hasSeenOnboarding).toBe(false)
    expect(ctx!.isCompleted).toBe(false)
    err.mockRestore()
    p.unmount()
  })

  it('写盘失败（setItem 抛错）只 console.error，状态迁移照旧完成', () => {
    // 无痕/超额配额下 setItem 会抛；此时「教程该继续还得继续」——
    // 不能因为落不了盘就卡住，也不能把异常抛给调用方。
    const err = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    ls.setItem.mockImplementation(() => { throw new Error('QuotaExceededError') })

    const p = mount()
    act(() => { ctx!.startOnboarding() })
    expect(ctx!.isActive).toBe(true)
    expect(ctx!.hasSeenOnboarding).toBe(true)
    expect(err).toHaveBeenCalledWith('Failed to save onboarding state:', expect.any(Error))

    // 连「走完最后一步 → 标记 completed」也照样不中断
    act(() => { ctx!.goToStep(8) })
    act(() => { ctx!.nextStep() })
    expect(ctx!.isCompleted).toBe(true)
    expect(ctx!.isActive).toBe(false)
    expect(err).toHaveBeenCalledTimes(2)
    err.mockRestore()
    p.unmount()
  })

  it('落盘时与已有数据合并，不覆盖同 key 下的其它字段', () => {
    ls.getItem.mockReturnValue(JSON.stringify({ foo: 1, hasSeen: false }))
    const p = mount()
    act(() => { ctx!.skipOnboarding() })
    expect(lastSaved()).toEqual({ foo: 1, hasSeen: true })
    p.unmount()
  })
})

describe('自动开始 / 重新开始', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('默认 autoStartOnFirstVisit 为真：1 秒后自动开始', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(OnboardingProvider as never, {
        t, config: { storageKey: KEY },   // 不传 autoStartOnFirstVisit ⇒ 默认开
      } as never, createElement(Probe as never, null as never)))
    })
    expect(ctx!.isActive).toBe(false)

    await act(async () => { await vi.advanceTimersByTimeAsync(999) })
    expect(ctx!.isActive).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(ctx!.isActive).toBe(true)
    expect(ctx!.hasSeenOnboarding).toBe(true)

    act(() => root.unmount()); container.remove()
  })

  it('已看过（hasSeen）时不再自动开始', async () => {
    ls.getItem.mockReturnValue(JSON.stringify({ hasSeen: true }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(OnboardingProvider as never, {
        t, config: { storageKey: KEY },
      } as never, createElement(Probe as never, null as never)))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(ctx!.isActive).toBe(false)
    act(() => root.unmount()); container.remove()
  })

  it('autoStartOnFirstVisit 显式为 false 时永不自动开始', async () => {
    const p = mount({ autoStartOnFirstVisit: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(ctx!.isActive).toBe(false)
    p.unmount()
  })

  it('restartTutorial()：先重置（清掉 seen/completed）再 100ms 后开始', async () => {
    ls.getItem.mockReturnValue(JSON.stringify({ hasSeen: true, completed: true }))
    const p = mount()
    expect(ctx!.hasSeenOnboarding).toBe(true)

    act(() => { restartTutorial() })
    expect(ls.removeItem).toHaveBeenCalledWith(KEY)   // 先 reset
    expect(ctx!.hasSeenOnboarding).toBe(false)
    expect(ctx!.isActive).toBe(false)

    await act(async () => { await vi.advanceTimersByTimeAsync(99) })
    expect(ctx!.isActive).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(ctx!.isActive).toBe(true)
    expect(ctx!.currentStepIndex).toBe(0)
    p.unmount()
  })

  it('Provider 卸载后 restartTutorial() 是空操作（不留悬空回调）', async () => {
    ls.getItem.mockReturnValue(JSON.stringify({ hasSeen: true }))
    const p = mount()
    p.unmount()
    expect(() => { restartTutorial() }).not.toThrow()
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(ls.removeItem).toHaveBeenCalledTimes(0)   // 卸载后不该再被 reset
  })
})

/**
 * 🚨 回归：0.2.220 exe「能打开、但点哪都没反应」的根因。
 *
 * 现场取证（用户机器 `%LOCALAPPDATA%/com.fretmaster.app/EBWebView/.../leveldb`）：
 *  - `fretmaster-stats` 里有 `totalCount: 438`（5 月）与 `41`（9 月）的练习记录
 *    ⇒ 明确的**老用户**
 *  - `fretmaster-onboarding` **全库搜不到**（7/20 的 000005.ldb 里有过，之后消失）
 *    ⇒ 老用户的「已看过教程」标记丢了
 *
 * 旧实现只认 onboarding 自己那个键，于是每次启动都判定「首次访问」，
 * 1 秒后弹出全屏 `bg-black/60 pointer-events-auto` 遮罩（onboarding-overlay.tsx:152），
 * **吞掉全部点击**；点遮罩又会触发 `pauseOnboarding`，卡片变半透明、更像「没反应」。
 *
 * 修法：自动启动的判据不能只看 onboarding 自己的键（那是**持久化意图**，
 * 键会丢），必须补一条**独立的「这台机器是不是老用户」**证据。
 */
describe('老用户不应被当成新用户强弹教程（0.2.220 exe 回归）', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /**
   * 🚨 造场景必须**同时**管住两层：
   *   `localStorage` 的 vi.fn 桩（`ls.getItem`）**和** setup 里的内存 Map
   *   （`__tests__/setup.ts:79` 的 `localStorageStore`）。
   *   只 mock 桩的话，zustand persist 通过 `debounceStorage(localStorage)` 真写进去的
   *   `fretmaster-store` 仍留在 Map 里 ⇒ 「新用户」其实带着老用户痕迹，
   *   断言会**恒真通过**（铁律 20 饱和断言）。
   */
  function seedLocalStorage(entries: Record<string, string | null>) {
    ls.setItem.mockClear()
    const impl = (k: string) => (k in entries ? entries[k] : null)
    ls.getItem.mockImplementation(impl)
    // 同步真实内存 Map，避免 persist 之前的写入被下一次 getItem 读到
    ls.removeItem.mockImplementation(() => { /* 只关心 getItem 视图，清掉调用记录即可 */ })
    ls.removeItem.mockClear()
  }

  /** 老用户：onboarding 键丢失，但 store 有使用痕迹 */
  function seedAsReturningUser() {
    seedLocalStorage({
      [LEGACY_USER_EVIDENCE_KEY]: '{"state":{"audio":{"micEnabled":true}},"version":2}',
    })
  }

  /** 真新用户：什么都没有 */
  function seedAsBrandNewUser(raw?: string) {
    seedLocalStorage(raw === undefined ? {} : { [LEGACY_USER_EVIDENCE_KEY]: raw })
  }

  it('onboarding 键缺失、但 store 有使用痕迹 ⇒ 绝不自动弹（老用户被误判为新用户）', async () => {
    seedAsReturningUser()
    const p = mount({ autoStartOnFirstVisit: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(ctx!.isActive).toBe(false)
    p.unmount()
  })

  it('反向对照：onboarding 键缺失、store 也为空 ⇒ 仍然自动弹（真新用户不受影响）', async () => {
    seedAsBrandNewUser()
    const p = mount({ autoStartOnFirstVisit: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })

  it('反向对照：store 里的 JSON 损坏时按「无痕迹」处理，仍能正常弹（不能因解析失败卡死）', async () => {
    seedAsBrandNewUser('{ 坏掉的 json')
    const p = mount({ autoStartOnFirstVisit: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })

  it('反向对照：store 里是空对象（键在但没内容）时仍算新用户', async () => {
    seedAsBrandNewUser('{}')
    const p = mount({ autoStartOnFirstVisit: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })

  it('老用户手动点「重新观看教程」仍能弹（判据只拦自动启动，不拦显式触发）', async () => {
    seedAsReturningUser()
    const p = mount({ autoStartOnFirstVisit: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(ctx!.isActive).toBe(false)
    // restartTutorial / startOnboarding 是显式用户动作，必须照旧生效
    act(() => { restartTutorial() })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(ctx!.isActive).toBe(true)
    p.unmount()
  })
})
