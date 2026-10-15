/**
 * 节拍器时钟 —— 声音与可视化的**唯一**拍源（#14）。
 *
 * ## 为什么要单独一个模块，而不用 store / props
 * ① 一拍一次 `setState` 会让 `app/page.tsx`（5500+ 行）每拍整树 reconcile，
 *    240BPM 下每秒 4 次；主线程抖动反过来又会砸到音频排程上（正是本 bug 的成因之一）；
 * ② 可视化组件挂在抽屉/浮层里，其挂载与卸载**不应该**影响时钟本身；
 * ③ 订阅式广播让「谁想画就订阅」，不必在 page.tsx 与可视化组件之间凿一条 props 链。
 * （与本仓铁律 39 同源：全局能力与 UI 组件生命周期解耦。）
 *
 * ## 职责边界（重要）
 * 本模块**不含任何定时器**，只做两件事：保存「当前拍到哪」+ 广播给订阅者。
 * 真正的排程（lookahead、音频时钟、重音）在 `hooks/use-metronome-scheduler.ts`，
 * 那里是 `setInterval` 唯一的用途是**轮询排程**，不是出声 —— 出声交给
 * `AudioContext` 的采样级时间轴（见该文件的注释）。
 */
import { logger } from '@/lib/logger'

export interface MetronomeBeat {
  /**
   * 单调递增的序号（全局唯一、绝不复用）。
   * 用途：订阅者据此判断「这是新的一拍」。**不要**用它算小节位置：
   * 时钟跨练习会话不归零，`seq % beatsPerMeasure` 会得到错的小节位置。
   */
  seq: number
  /** 小节内的 0-based 位置：`0` 即第一拍（重音拍）。小节位置是**排程器算出来的**。 */
  index: number
  /** 是否重音拍（等价于 `index === 0`，预先算好省得订阅者各写一遍） */
  accent: boolean
}

type BeatListener = (beat: MetronomeBeat) => void

const listeners = new Set<BeatListener>()

/**
 * 初始快照 = 「第 1 拍、尚未开始」。订阅者首次挂载（练习中途打开可视化）会先拿到它，
 * 随即被下一次广播覆盖 —— 这样不需要任何「先 mount 再手动拉一次」的补充逻辑。
 */
let snapshot: MetronomeBeat = { seq: 0, index: 0, accent: true }

/**
 * 订阅拍事件。返回退订函数（供 `useSyncExternalStore` 直接使用）。
 * 退订是幂等的：重复调用不会报错。
 */
export function subscribeMetronomeBeat(listener: BeatListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 读取最近一次广播的快照。同一拍内引用稳定 ⇒ 可直接喂给 `useSyncExternalStore`。 */
export function getMetronomeBeat(): MetronomeBeat {
  return snapshot
}

/**
 * 广播一拍。**仅排程器可调用**。
 * 每次调用都会生成一个**新的**快照对象（`Object.is` 才会变 ⇒ 订阅者才会重渲染）。
 */
export function publishMetronomeBeat(index: number): void {
  snapshot = { seq: snapshot.seq + 1, index, accent: index === 0 }
  // 复制一份再遍历：监听者在回调里退订（组件卸载）不得影响本轮其他监听者。
  for (const listener of [...listeners]) {
    // 单个订阅者抛错不许拖垮时钟（否则一个画错的可视化组件会连带停掉发声）。
    try {
      listener(snapshot)
    } catch (error) {
      logger.debug('节拍订阅者抛出异常（已忽略）', error)
    }
  }
}

/**
 * 把时钟归零（`seq` 也归零，并**立即广播**一次）。
 * 只给测试用 —— 生产代码不需要归零：小节位置由排程器计算，
 * 跨会话继续用同一个 `seq` 不会影响显示。
 */
export function resetMetronomeClock(): void {
  snapshot = { seq: 0, index: 0, accent: true }
  for (const listener of [...listeners]) {
    try {
      listener(snapshot)
    } catch (error) {
      logger.debug('节拍订阅者抛出异常（已忽略）', error)
    }
  }
}
