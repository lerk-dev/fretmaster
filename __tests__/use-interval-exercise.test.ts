/**
 * hooks/use-interval-exercise.ts 的契约测试（此前零测试）。
 *
 * 它是「音程练习」的页面级 state 容器 + 出题逻辑（从 app/page.tsx 原样搬出）：
 *   - `generateIntervalExerciseQueue`：把「选中音程 + 方向 + 是否先找根音 + 是否打乱」
 *     编译成一条**出题队列**（数组元素是 INTERVALS 的下标）
 *   - `generateIntervalExercise`：从队列取下一题，算目标音、拼显示串、步进索引
 *   - `toggleInterval`：勾选/取消音程
 *
 * 这两条最要紧：
 *  ① 队列为空时练习界面会完全没有动静（静默 return），所以「什么时候会空」必须钉住；
 *  ② 出题依赖 `INTERVALS` 的下标语义（不是半音值），下标错一位整题就错。
 *
 * 测法沿用项目既有模式：`createRoot` + React 原生 `act`（不引入 @testing-library/react
 * 的 renderHook，因为 @testing-library/dom 未安装）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useIntervalExercise } from '@/hooks/use-interval-exercise'
import { useAppStore } from '@/lib/store'
import { NOTES, INTERVALS } from '@/lib/page-theory-data'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Api = ReturnType<typeof useIntervalExercise>
let api: Api | null

function Probe() {
  api = useIntervalExercise()
  return null
}

/** 所有挂过的树（断言失败时也保证拆干净，避免残留 root 污染后续用例） */
const mounted: Array<() => void> = []

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  const unmount = () => {
    try { act(() => root.unmount()) } catch { /* 已拆过 */ }
    container.remove()
    api = null
  }
  mounted.push(unmount)
  return { unmount }
}

afterEach(() => {
  for (const u of mounted.splice(0)) { try { u() } catch { /* 已拆过 */ } }
})

/** 下标常量（INTERVALS 的语义下标） */
const ROOT = 0 // '1'
const THIRD = 5 // '3'（4 半音）
const FIFTH = 9 // '5'（7 半音）

/** 把 INTERVALS 下标换回半音数，便于断言「下行」映射 */
const semitonesOf = (index: number) => INTERVALS[index].semitones

beforeEach(() => {
  useAppStore.setState({
    intervalPractice: {
      ...useAppStore.getState().intervalPractice,
      rootNote: 'C',
      selectedIntervals: [THIRD, FIFTH],
      rootMode: 'fixed',
      findRootFirst: false,
      addRootBack: false,
      randomizeOrder: false,
      direction: 'up',
    },
  } as never)
})

// ---------------------------------------------------- 初值

describe('初值来自 store.intervalPractice', () => {
  it('rootNote / selectedIntervals / rootMode / findRootFirst / direction / 时长 都取自 store', () => {
    useAppStore.setState({
      intervalPractice: {
        ...useAppStore.getState().intervalPractice,
        rootNote: 'Db', // 会被 normalizeNoteName 转成 'D♭'
        selectedIntervals: [THIRD],
        rootMode: 'random',
        findRootFirst: true,
        addRootBack: true,
        practiceDuration: 12,
        randomizeOrder: true,
        direction: 'either',
      },
    } as never)

    const h = mount()
    expect(api!.rootNote).toBe('D♭') // normalizeNoteName 把 b 变成 ♭（它不做大小写转换）
    expect(api!.selectedIntervals).toEqual([THIRD])
    expect(api!.intervalRootMode).toBe('random')
    expect(api!.findRootFirst).toBe(true)
    expect(api!.addRootBack).toBe(true)
    expect(api!.intervalPracticeDuration).toBe(12)
    expect(api!.intervalRandomizeOrder).toBe(true)
    expect(api!.intervalDirection).toBe('either')
    // 题目与队列初始为空
    expect(api!.currentIntervalExercise).toBeNull()
    expect(api!.intervalExerciseQueue).toEqual([])
    expect(api!.intervalCurrentQueueIndex).toBe(0)
    h.unmount()
  })
})

// ---------------------------------------------------- toggleInterval

describe('toggleInterval', () => {
  it('未选中则加入、已选中则移除', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([]) })
    act(() => { api!.toggleInterval(THIRD) })
    expect(api!.selectedIntervals).toEqual([THIRD])
    act(() => { api!.toggleInterval(FIFTH) })
    expect(api!.selectedIntervals).toEqual([THIRD, FIFTH])
    act(() => { api!.toggleInterval(THIRD) })
    expect(api!.selectedIntervals).toEqual([FIFTH])
    h.unmount()
  })
})

// ---------------------------------------------------- 队列生成

describe('generateIntervalExerciseQueue', () => {
  it('没选任何音程 → 空队列（练习会静默无反应）', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([]) })
    expect(api!.generateIntervalExerciseQueue()).toEqual([])
    h.unmount()
  })

  it('up：队列就是选中的下标本身', () => {
    const h = mount()
    expect(api!.generateIntervalExerciseQueue()).toEqual([THIRD, FIFTH])
    h.unmount()
  })

  it('down：每一项换成「下行等音程」的下标', () => {
    const h = mount()
    act(() => { api!.setIntervalDirection('down') })
    const q = api!.generateIntervalExerciseQueue()
    expect(q).toHaveLength(2)
    // 每一项的半音数应等于原音程的下行补数 (12 - s) % 12
    expect(semitonesOf(q[0])).toBe((12 - semitonesOf(THIRD)) % 12)
    expect(semitonesOf(q[1])).toBe((12 - semitonesOf(FIFTH)) % 12)
    h.unmount()
  })

  it('random：逐项按 Math.random() > 0.5 决定是否换成下行（两条分支各走一次）', () => {
    const h = mount()
    act(() => { api!.setIntervalDirection('random') })
    const spy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)   // 第一项 > 0.5 ⇒ 换下行
      .mockReturnValueOnce(0.1)   // 第二项 ≤ 0.5 ⇒ 保持原样
    const q = api!.generateIntervalExerciseQueue()
    spy.mockRestore()

    expect(q).toHaveLength(2)
    expect(semitonesOf(q[0])).toBe((12 - semitonesOf(THIRD)) % 12)
    expect(q[1]).toBe(FIFTH)   // 原样返回，不是「换成它自己」
    h.unmount()
  })

  it('either：上行与下行都入队，长度翻倍且交替成对', () => {
    const h = mount()
    act(() => { api!.setIntervalDirection('either') })
    const q = api!.generateIntervalExerciseQueue()
    expect(q).toHaveLength(4)
    // 每个原音程产生 [上行, 下行] 两项
    expect(q[0]).toBe(THIRD)
    expect(semitonesOf(q[1])).toBe((12 - semitonesOf(THIRD)) % 12)
    expect(q[2]).toBe(FIFTH)
    expect(semitonesOf(q[3])).toBe((12 - semitonesOf(FIFTH)) % 12)
    h.unmount()
  })

  it('扩展音程（九度以上）没有下行等价项 → 原样保留该项，不产生 undefined', () => {
    // INTERVALS 里的 9/b9/#9/11/#11/13/b13 半音数 ≥ 13，(12 - s) % 12 在 JS 里是负数，
    // 查不到对应的下行音程 ⇒ downIndex === -1 ⇒ 必须回落到原下标。
    const EXT = INTERVALS.findIndex((i) => i.semitones === 14)   // nine
    expect(EXT).toBeGreaterThanOrEqual(0)

    const h = mount()
    act(() => { api!.setSelectedIntervals([EXT]) })

    act(() => { api!.setIntervalDirection('down') })
    expect(api!.generateIntervalExerciseQueue()).toEqual([EXT])

    act(() => { api!.setIntervalDirection('either') })
    expect(api!.generateIntervalExerciseQueue()).toEqual([EXT, EXT])

    act(() => { api!.setIntervalDirection('random') })
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.9)   // 强制走「换下行」那一支
    const q = api!.generateIntervalExerciseQueue()
    spy.mockRestore()
    expect(q).toEqual([EXT])
    h.unmount()
  })

  it('findRootFirst：把根音（下标 0）从队列里剔除', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([ROOT, THIRD]) })
    act(() => { api!.setFindRootFirst(true) })
    expect(api!.generateIntervalExerciseQueue()).toEqual([THIRD])
    h.unmount()
  })

  it('findRootFirst 且只选了根音 → 空队列', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([ROOT]) })
    act(() => { api!.setFindRootFirst(true) })
    expect(api!.generateIntervalExerciseQueue()).toEqual([])
    h.unmount()
  })

  it('randomizeOrder：只改变顺序，不改变元素集合', () => {
    const h = mount()
    act(() => { api!.setIntervalDirection('either') })
    act(() => { api!.setIntervalRandomizeOrder(true) })
    const downOf = (i: number) =>
      INTERVALS.findIndex(x => x.semitones === (12 - INTERVALS[i].semitones) % 12)
    const q = api!.generateIntervalExerciseQueue()
    expect(q).toHaveLength(4)
    expect([...q].sort((a, b) => a - b))
      .toEqual([THIRD, FIFTH, downOf(THIRD), downOf(FIFTH)].sort((a, b) => a - b))
    h.unmount()
  })
})

// ---------------------------------------------------- 出题

describe('generateIntervalExercise', () => {
  it('没选音程时不生成题目', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([]) })
    act(() => { api!.generateIntervalExercise() })
    expect(api!.currentIntervalExercise).toBeNull()
    h.unmount()
  })

  it('选了音程但队列装不出东西（findRootFirst + 只剩根音）→ 不生成题目', () => {
    // 与上一条不同：这里 selectedIntervals **非空**，是「队列生成后为空」那条早退。
    // 曾经只看 selectedIntervals 判断，就会把 INTERVALS[undefined] 塞进题目里。
    const h = mount()
    act(() => { api!.setSelectedIntervals([ROOT]) })
    act(() => { api!.setFindRootFirst(true) })
    act(() => { api!.generateIntervalExercise() })
    expect(api!.currentIntervalExercise).toBeNull()
    expect(api!.intervalCurrentQueueIndex).toBe(0)   // 索引也不该被推进
    h.unmount()
  })

  it('固定根音 C + 大三度：题目含正确目标音与显示串，并步进队列索引', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([THIRD]) })
    act(() => { api!.generateIntervalExercise() })

    const q = api!.currentIntervalExercise!
    expect(q).not.toBeNull()
    expect(q.rootNote).toBe('C')
    expect(q.interval).toEqual(INTERVALS[THIRD])
    expect(q.targetNote).toBe('E') // C(0) + 4 半音
    expect(q.currentIntervalDisplay).toBe('3') // 不先找根音时只显示音程
    expect(q.answered).toBe(false)
    expect(q.completedIntervals).toEqual([])
    expect(api!.intervalExerciseQueue).toEqual([THIRD])
    expect(api!.intervalCurrentQueueIndex).toBe(1)
    expect(api!.intervalPracticeStep).toBe('root')
    h.unmount()
  })

  it('findRootFirst 时显示「1 X」；addRootBack 再补「 X 1」', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([THIRD]) })
    act(() => { api!.setFindRootFirst(true) })
    act(() => { api!.generateIntervalExercise() })
    expect(api!.currentIntervalExercise!.currentIntervalDisplay).toBe('1 3')

    act(() => { api!.setAddRootBack(true) })
    act(() => { api!.setIntervalExerciseQueue([]) })
    act(() => { api!.generateIntervalExercise() })
    expect(api!.currentIntervalExercise!.currentIntervalDisplay).toBe('1 3 3 1')
    h.unmount()
  })

  it('随机根音模式：根音变成 NOTES 里的某个音（并写回 state）', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([THIRD]) })
    act(() => { api!.setIntervalRootMode('random') })
    act(() => { api!.generateIntervalExercise() })
    expect(NOTES).toContain(api!.rootNote)
    expect(api!.currentIntervalExercise!.rootNote).toBe(api!.rootNote)
    h.unmount()
  })

  it('队列里还有没出的题 → 直接用当前索引那道，不重新生成队列', () => {
    // 对应 `queue.length === 0 || nextIndex >= queue.length` 为 **false** 的那一支
    const h = mount()
    act(() => { api!.setSelectedIntervals([THIRD, FIFTH]) })
    act(() => { api!.setIntervalExerciseQueue([THIRD, FIFTH]) })
    act(() => { api!.setIntervalCurrentQueueIndex(0) })
    act(() => { api!.generateIntervalExercise() })

    expect(api!.currentIntervalExercise!.interval).toEqual(INTERVALS[THIRD])
    expect(api!.intervalExerciseQueue).toEqual([THIRD, FIFTH])   // 原样保留，没重新生成
    expect(api!.intervalCurrentQueueIndex).toBe(1)
    h.unmount()
  })

  it('队列耗尽后自动重新生成并从头出题', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([THIRD]) })
    // 先把队列状态设成「已遍历完」
    act(() => { api!.setIntervalExerciseQueue([THIRD]) })
    act(() => { api!.setIntervalCurrentQueueIndex(1) })
    act(() => { api!.generateIntervalExercise() })

    expect(api!.currentIntervalExercise).not.toBeNull()
    expect(api!.intervalExerciseQueue).toEqual([THIRD]) // 重新生成了
    expect(api!.intervalCurrentQueueIndex).toBe(1) // 已步进到下一项
    h.unmount()
  })

  it('目标音随根音移动（D + 大三度 = F#）', () => {
    const h = mount()
    act(() => { api!.setSelectedIntervals([THIRD]) })
    act(() => { api!.setRootNote('D') })
    act(() => { api!.generateIntervalExercise() })
    expect(api!.currentIntervalExercise!.targetNote).toBe('F♯') // D(2) + 4 = 6（NOTES 用 Unicode ♯）
    h.unmount()
  })
})
