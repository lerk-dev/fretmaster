/**
 * 音程「方向」映射的**唯一真相源**：把「上行音程下标」映射成「下行音程下标」。
 *
 * ## 🚨 背景（2026-10-10 全仓审查 P1-1）
 *
 * 音程练习的「方向」有 up / down / random / either 四档。「down」并不是简单地
 * 「把音往下弹」——它要求**换成另一个音程条目**：练习队列里存的是 `INTERVALS` 的
 * 下标，而一个「大三度下行」听到的其实是「六度」（4 半音下行 = 8 半音上行）。
 * 所以 down 档必须为每个选中音程找一条**互补音程**。
 *
 * 旧实现有**两处独立缺陷**，且代码在 `hooks/use-interval-exercise.ts` 与
 * `app/page.tsx` 各抄了一份（抄完各自腐烂）：
 *
 * 1. **负数取模**：`(12 - semitones) % 12` 在 JS 里对 13~21 半音的复合音程
 *    （`9`/`b9`/`#9`/`11`/`#11`/`13`/`b13`）返回**负数**，`findIndex` 恒 -1
 *    ⇒ 「下行」静默按**上行**出题；「双向」模式更是把同一题 push 两次（队列出现重复题）。
 * 2. **异名同音反查**：`findIndex(i => i.semitones === target)` 是项目铁律禁止的
 *    「半音数 → 符号」反查。`INTERVALS` 里异名同音靠前者胜出 ⇒ 选 `b5` 练成 `#4`、
 *    选 `b3` 练成 `#2`、选 `b6` 练成 `#5`、选 `bb7` 练成 `6`
 *    —— **用户没选过的符号出现在练习里**。
 *
 * ## 本模块的口径
 *
 * - 一律**按符号正向匹配**：显式互补表 `COMPLEMENT_SYMBOL`，不碰半音数反查。
 * - 复合音程（≥ 13 半音）**没有下行等价项**（下行超过八度在单指板上无意义，且
 *   项目既有测试明确钉住「原样保留」行为）⇒ `resolveDownIndex` 返回入参本身。
 * - 取模仍做 `((12 - s) % 12 + 12) % 12` 双重保护，只用于**复合音程判定**，
 *   不用于查表。
 *
 * @see __tests__/interval-direction.test.ts
 */

import { INTERVALS } from '@/lib/page-theory-data'

/**
 * 下行互补音程的**符号**映射（显式表，异名同音各归其位）。
 *
 * 取值口径（三条，均由 `__tests__/interval-direction.test.ts` 穷举锁死）：
 * - **半音数必须满足** `(12 - s) % 12`（否则"下行"就不是真的下行）。
 * - **异名同音取"同一音级族"那一侧**：`b3`→`6`、`b6`→`3`、`b7`→`2`、
 *   `#2`→`6`、`#5`→`3`、`bb7`→`b3`。
 * - **三全音自补**：`#4`→`#4`、`b5`→`b5`（音高相同，不换边）。
 * - 未列出的符号（如 `1`）下行为其本身。
 */
const COMPLEMENT_SYMBOL: Record<string, string> = {
  '1': '1',
  b2: '7',
  '2': 'b7',
  '#2': '6',
  b3: '6',
  '3': 'b6',
  '4': '5',
  '#4': '#4',
  b5: 'b5',
  '5': '4',
  '#5': '3',
  b6: '3',
  '6': 'b3',
  bb7: 'b3',
  b7: '2',
  '7': 'b2',
}

/** 半音数 ≥ 该值的音程视为「复合音程」（超过一个八度），无下行等价项。 */
const COMPOUND_MIN_SEMITONES = 12

/**
 * 单个音程下标 → 其**下行互补音程**的下标。
 *
 * - 复合音程（≥ 12 半音）⇒ 返回入参本身（无下行等价项）。
 * - 互补符号在 `INTERVALS` 里找不到 ⇒ 返回入参本身（宁可不换，也不换错）。
 *
 * @param index `INTERVALS` 的下标；越界时原样返回。
 */
export function resolveDownIndex(index: number): number {
  const interval = INTERVALS[index]
  if (!interval) return index
  if (interval.semitones >= COMPOUND_MIN_SEMITONES) return index

  const target = COMPLEMENT_SYMBOL[interval.symbol]
  if (!target) return index

  const found = INTERVALS.findIndex((i) => i.symbol === target)
  return found !== -1 ? found : index
}

/** 方向档位（与 store 的 `IntervalPracticeSettings.direction` 一致）。 */
export type IntervalDirection = 'up' | 'down' | 'random' | 'either'

/**
 * 把「选中的音程下标」按方向编译成**出题队列**。
 *
 * @param selected  选中的 `INTERVALS` 下标（顺序随意）
 * @param direction 方向档位
 * @param random    注入的随机源（0~1），便于测试；默认 `Math.random`
 */
export function buildDirectionalQueue(
  selected: readonly number[],
  direction: IntervalDirection,
  random: () => number = Math.random
): number[] {
  const base = [...selected]

  if (direction === 'up') return base

  if (direction === 'down') {
    return base.map(resolveDownIndex)
  }

  if (direction === 'random') {
    return base.map((idx) => (random() > 0.5 ? resolveDownIndex(idx) : idx))
  }

  // either：上行与下行**同时**入队，每个音程产生两个条目
  const expanded: number[] = []
  for (const idx of base) {
    expanded.push(idx)
    expanded.push(resolveDownIndex(idx))
  }
  return expanded
}

/**
 * Fisher-Yates 均匀洗牌（不改原数组）。
 *
 * 替换旧代码里的 `arr.sort(() => Math.random() - 0.5)`——那种写法不是均匀洗牌，
 * 部分排列的概率系统性偏高，且结果依赖引擎排序实现。
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------- 显示层

/**
 * 方向 → 显示符号（**界面唯一来源**）。
 *
 * ## 为什么放在这个文件
 *
 * 这份映射原先内联写在 `components/interval-question.tsx` 的一个三元表达式里。
 * 全屏模式（`components/fullscreen-overlay.tsx`）是同一道题的另一套版式，
 * 但它**完全没有**方向信息 ⇒ 进全屏后不知道该往上还是往下按
 * （`either` 两个方向都对、`random` 每题随机，界面上一点提示都没有）。
 *
 * 补的时候如果照抄一份三元表达式，两处就会各自演化（`🔀` 与 `↕` 只差一个字符，
 * 很容易抄错，而且错了没人看得出来）。所以符号与方向的映射统一放这里 ——
 * 与上面「方向 → 队列」的映射同处一个模块，语义也刚好完整：
 * 一个方向既有「怎么出题」，也有「怎么显示」。
 *
 * 护栏：`__tests__/interval-direction.test.ts` 钉住四个符号；
 * `__tests__/source-hygiene.test.ts` 钉住两个组件都必须调
 * `intervalDirectionSymbol()`（不许再内联三元）。
 */
export const INTERVAL_DIRECTION_SYMBOLS: Record<IntervalDirection, string> = {
  /** 只往上（根音 → 更高的音） */
  up: '↑',
  /** 只往下 */
  down: '↓',
  /** 上下都行（队列里上下交替） */
  either: '↕',
  /** 每道题随机 */
  random: '🔀',
}

/**
 * 取方向的显示符号。
 *
 * ⚠️ 入参来自 store / 设置导入，可能被手改过（`"sideways"` 之类）。未知值**不抛错**
 * 也不返回 `undefined`（那会让 React 真的渲染出 `undefined` 字样），按「随机」显示 ——
 * 这是最保守的语义：不暗示方向。
 */
export function intervalDirectionSymbol(direction: string | null | undefined): string {
  if (direction && direction in INTERVAL_DIRECTION_SYMBOLS) {
    return INTERVAL_DIRECTION_SYMBOLS[direction as IntervalDirection]
  }
  return INTERVAL_DIRECTION_SYMBOLS.random
}
