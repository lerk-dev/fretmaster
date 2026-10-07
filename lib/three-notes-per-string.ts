/**
 * 一弦三音（3NPS, Three Notes Per String）练习生成器
 *
 * 移植自 guitarrun.com 的「3NPS Marathon」练习模式，算法逐行见 `guitarrun-3nps-analysis.md`。
 * 本模块是**纯函数**：不碰 DOM、不碰 store、不依赖具体乐器，只吃「调 + 音阶 + 调弦 + 品数」。
 *
 * ## 弦索引约定
 * 与 `INSTRUMENT_CONFIG.tuning` 一致：**索引 0 = 最高音弦**（吉他 1 弦 / 高 E）。
 * 生成时按 **低弦 → 高弦** 分配音符（最低音弦吃第一个音），这与 GuitarRun 一致。
 *
 * ## 🚨 绝对音高：本模块刻意不用
 * GuitarRun 用绝对 MIDI（硬编码起点 40 = E2）算品号。照抄会把七弦吉他（低 B1）和贝斯（E1）
 * 整个顶到 20 品以上甚至全部越界剔除。本模块改用**以最低空弦音为 0 的相对半音坐标**
 * （`neckMidi`）—— 品号计算结果与 GuitarRun 在六弦吉他上**逐品相同**，但对任何调弦/乐器都成立，
 * 且不需要知道八度（`tuning` 里本来就只有音级、没有八度，猜八度是这类代码最常见的 bug 源）。
 *
 * ## 三个刻意保留的 GuitarRun 口径（都有测试钉住）
 * ① **每弦固定 3 个音**，总音数 = 3 × 弦数，全部来自「连续 3×弦数 个音阶音」。
 * ② **上行 + 下行时顶音不重复**：`[...notes, ...notes.slice(0,-1).reverse()]`
 *    ⇒ 单把位步数 = 2 × 3 × 弦数 − 1（六弦 = 35）。写成完整 reverse 会让顶音弹两次。
 * ③ **7 个把位 = 7 个音级起点**，把位号按音级序，**不是**「把位从低到高」。
 *    所以 C 大调的 P3 反而是开放把位（0 品起），P1/P2 才是最高的两个（8/10 品起）。
 */

/** 非负取模（半音级）。负数音级/负向偏移都能落回 0..11 */
function mod12(v: number): number {
  return ((v % 12) + 12) % 12
}

/** 非负取模（音阶下标，模数为音阶长度） */
function modIndex(v: number, len: number): number {
  // 不可达守卫（分支覆盖率上限就在这里）：调用方都先判过 `len === 0` 早退。
  // 留着是因为它是导出的公共生成器的最后一道防线，比 NaN 下标便宜。
  if (len <= 0) return 0
  return ((v % len) + len) % len
}

/** 每弦音数（3NPS 固定 3） */
export const NOTES_PER_STRING = 3

/** 只有七声音阶才有标准 7 把位一弦三音指型（GuitarRun 同样只允许 7 声音阶） */
export const THREE_NPS_REQUIRED_INTERVALS = 7

/** 练习序列滑窗大小（GuitarRun 的 `slice(e, e+9)`） */
export const THREE_NPS_WINDOW_SIZE = 9

/** 滑窗里当前步左侧保留的已完成步数（GuitarRun 把当前步固定在第 4 格） */
export const THREE_NPS_WINDOW_LEAD = 3

/** 音阶是否为七声（能否开一弦三音） */
export function isThreeNpsEligible(intervals: readonly number[] | undefined | null): boolean {
  return (intervals?.length ?? 0) === THREE_NPS_REQUIRED_INTERVALS
}

/** 六弦标准调弦下单个把位的步数：3×6 上行 + 17 下行 = 35 */
export function threeNpsStepsPerPosition(stringCount: number): number {
  return 2 * NOTES_PER_STRING * stringCount - 1
}

export interface ThreeNpsConfig {
  /** 主音音级（0 = C，11 = B） */
  rootPitchClass: number
  /** 音阶半音表（相对主音，升序）；长度必须为 7 才会生成 */
  intervals: readonly number[]
  /** 与 `intervals` **按下标一一对应**的音级标签（如 ['1','2','b3',…]），用于生成练习序列 */
  degreeLabels: readonly string[]
  /** 各弦空弦音的**音级**（0-11），索引 0 = 最高音弦 */
  tuning: readonly number[]
  /** 品数上限，越界音剔除 */
  maxFret: number
}

/** 指型上的一个音 */
export interface ThreeNpsNote {
  /** 弦索引：0 = 最高音弦（与 INSTRUMENT_CONFIG.tuning 一致） */
  stringIndex: number
  fret: number
  /** 以最低空弦音为 0 的半音坐标（同一乐器内可比音高高低；不含八度信息故不叫 midi） */
  neckMidi: number
  pitchClass: number
  /** 音阶内下标（0 起） */
  degreeIndex: number
  /** 音级（1 起） */
  degree: number
  /** 音级标签（来自 degreeLabels，与 intervals 同下标） */
  degreeLabel: string
  isRoot: boolean
}

/** 练习序列上的一步：指型音 + 把位/步号/方向/换把标记 */
export interface ThreeNpsStep extends ThreeNpsNote {
  /** 把位（1 起） */
  position: number
  /** 该把位内的步号（0 起） */
  step: number
  /** 换把提示：**非首个把位的第一音**才算（GuitarRun 的 `shift: l>0 && E===0`） */
  isShift: boolean
  direction: 'up' | 'down'
}

export interface ThreeNpsPosition {
  /** 把位（1 起）；等于起始音级的序号 */
  index: number
  /** 起始音级（1 起） */
  anchorDegree: number
  startFret: number
  endFret: number
  /** 指型音符（低弦 → 高弦，每弦至多 3 个，越界音已剔除） */
  notes: ThreeNpsNote[]
  /** 完整练习序列：上行 + 下行（顶音不重复） */
  steps: ThreeNpsStep[]
}

function degreeLabelAt(labels: readonly string[], idx: number): string {
  // `?? String(idx + 1)` 不可达：`degreeLabels` 与 `intervals` 恒同长
  // （`SCALE_MODES` 全部 76 个音阶都满足，见 `__tests__/scale-degree-semitone.test.ts` 的穷举）。
  // 兜底成序号而不是空字符串，是为了万一数据源被改坏时「显示 1/2/3」而不是「显示空白」。
  return labels[idx] ?? String(idx + 1)
}

/**
 * 各弦相对最低空弦音的半音偏移（索引 0 = 最高音弦）。
 *
 * 推导：`tuning` 只有音级没有八度，所以从最低弦往上，逐弦取「上一个音级在更高八度的最近位置」。
 * 六弦标准调弦 ⇒ `[24,19,15,10,5,0]`，与 GuitarRun 的 `dt=[64,59,55,50,45,40]` 减 40 完全一致。
 */
export function openStringOffsets(tuning: readonly number[]): number[] {
  const n = tuning.length
  const out = new Array<number>(n).fill(0)
  if (n === 0) return out
  const lowestPC = mod12(tuning[n - 1])
  out[n - 1] = 0
  for (let s = n - 2; s >= 0; s--) {
    let v = out[s + 1] + 1
    while (mod12(v + lowestPC) !== mod12(tuning[s])) v++
    out[s] = v
  }
  return out
}

/**
 * 生成某个把位的指型（不含下行）。
 *
 * 对应 GuitarRun 的闭包 `c(d)`，差别只有起点：它写死 `let v = 40`，我们等价地写成
 * 「最低空弦音 + `(起始音级 − 最低弦音级) mod 12`」—— 六弦吉他上数值完全相同。
 */
export function buildThreeNpsNotes(
  config: ThreeNpsConfig,
  positionIndex: number
): ThreeNpsNote[] {
  const { rootPitchClass, intervals, degreeLabels, tuning, maxFret } = config
  const len = intervals.length
  const stringCount = tuning.length
  if (len === 0 || stringCount === 0) return []

  const pos = modIndex(positionIndex, len)
  const offsets = openStringOffsets(tuning)
  const lowestPC = mod12(tuning[stringCount - 1])
  /** 相对坐标 → 绝对音级 */
  const relPC = (v: number) => mod12(v + lowestPC)

  // 起点：相对坐标下「≥ 0（即 ≥ 最低空弦音）且音级为起始音级」的最小值
  const firstPC = mod12(rootPitchClass + intervals[pos])
  let cursor = mod12(firstPC - lowestPC)

  const total = NOTES_PER_STRING * stringCount
  const rels: number[] = []
  for (let k = 0; k < total; k++) {
    const degreeIndex = modIndex(pos + k, len)
    const pc = mod12(rootPitchClass + intervals[degreeIndex])
    while (relPC(cursor) !== pc) cursor++
    rels.push(cursor)
    cursor++
  }

  const notes: ThreeNpsNote[] = []
  let i = 0
  for (let s = stringCount - 1; s >= 0; s--) {
    for (let k = 0; k < NOTES_PER_STRING; k++, i++) {
      const neckMidi = rels[i]
      const fret = neckMidi - offsets[s]
      // 越界音静默剔除（GuitarRun: `At>=0 && At<=17`）。
      // `neckMidi` 严格递增 ⇒ 剔除后 `notes` 仍保持音高递增；被剔除的是各弦组里
      // 品号超上限（高弦端）或小于下限（低弦端）的那些 —— 注意**不是**整串的前缀。
      if (fret < 0 || fret > maxFret) continue
      const degreeIndex = modIndex(pos + i, len)
      const pc = relPC(neckMidi)
      notes.push({
        stringIndex: s,
        fret,
        neckMidi,
        pitchClass: pc,
        degreeIndex,
        degree: degreeIndex + 1,
        degreeLabel: degreeLabelAt(degreeLabels, degreeIndex),
        isRoot: pc === mod12(rootPitchClass),
      })
    }
  }
  return notes
}

/**
 * 生成全部 7 个把位（每个把位 = 一个音级起点），并把每个把位展开成完整练习序列
 * （上行 + 顶音不重复的下行）。
 *
 * 非七声音阶返回 `[]`（调用方应回退到普通音阶练习）。
 */
export function buildThreeNpsPositions(config: ThreeNpsConfig): ThreeNpsPosition[] {
  const len = config.intervals.length
  if (len !== THREE_NPS_REQUIRED_INTERVALS) return []

  const positions: ThreeNpsPosition[] = []
  for (let idx = 0; idx < len; idx++) {
    const notes = buildThreeNpsNotes(config, idx)
    if (notes.length === 0) continue
    const descending = notes.slice(0, -1).reverse()
    const steps: ThreeNpsStep[] = [...notes, ...descending].map((note, step) => ({
      ...note,
      position: idx + 1,
      step,
      // 只有「非首个把位的第一音」才是换把点；首个把位的第一音不算
      isShift: idx > 0 && step === 0,
      direction: step < notes.length ? 'up' : 'down',
    }))
    positions.push({
      index: idx + 1,
      anchorDegree: idx + 1,
      startFret: Math.min(...notes.map((n) => n.fret)),
      endFret: Math.max(...notes.map((n) => n.fret)),
      notes,
      steps,
    })
  }
  return positions
}

/** 把 7 个把位首尾相接成一场 Marathon（六弦 = 7 × 35 = 245 步） */
export function flattenThreeNpsSteps(positions: readonly ThreeNpsPosition[]): ThreeNpsStep[] {
  return positions.flatMap((p) => p.steps)
}

/**
 * Marathon 的推进规则：跑完一个把位就往后走一格；已经是最后一个 ⇒ 返回 `null`，
 * 调用方据此换调/换音阶并把位归零（GuitarRun 的 `ye()` 也是跑到 P7 才收尾）。
 *
 * 抽成显式函数而不是内联 `if`：这是整场 Marathon 唯一的推进判据，
 * 「永远返回 0」「到最后一个还继续往后」这两类改错都会让练习原地循环或越界。
 */
export function nextThreeNpsPositionIndex(
  currentIndex: number,
  positionCount: number
): number | null {
  if (!Number.isFinite(currentIndex) || positionCount <= 0) return null
  const next = Math.max(0, Math.floor(currentIndex)) + 1
  return next < positionCount ? next : null
}

/** Marathon 的总步数（没有可用把位时为 0） */
export function marathonStepCount(stringCount: number, positionCount = THREE_NPS_REQUIRED_INTERVALS): number {
  return positionCount * threeNpsStepsPerPosition(stringCount)
}

export interface ThreeNpsWindowItem<T> {
  item: T
  /** 该步在整段序列里的下标 */
  index: number
  done: boolean
  current: boolean
}

export interface ThreeNpsWindow<T> {
  start: number
  items: ThreeNpsWindowItem<T>[]
}

/**
 * 练习序列滑窗：让当前步固定落在第 `THREE_NPS_WINDOW_LEAD + 1` 格（左边恒有 3 个已完成），
 * 末端贴边时整体左移 —— 逐字复刻 GuitarRun 的 `Math.max(0, Math.min(b-3, len-9))`。
 *
 * 为什么不能"整段 35 步全画出来"：35 个徽章里根本看不出当前位置。
 */
export function threeNpsWindow<T>(
  steps: readonly T[],
  currentStep: number,
  size: number = THREE_NPS_WINDOW_SIZE
): ThreeNpsWindow<T> {
  const len = steps.length
  if (len === 0 || size <= 0) return { start: 0, items: [] }
  const effectiveSize = Math.min(size, len)
  const cursor = Math.max(0, Math.min(currentStep, len - 1))
  const start = Math.max(0, Math.min(cursor - THREE_NPS_WINDOW_LEAD, len - effectiveSize))
  const items: ThreeNpsWindowItem<T>[] = []
  for (let i = start; i < start + effectiveSize; i++) {
    items.push({ item: steps[i], index: i, done: i < cursor, current: i === cursor })
  }
  return { start, items }
}

/** 当前把位的指型里，每个「弦-品」是否属于本把位（指板高亮的查表用） */
export function positionCellKeys(notes: readonly ThreeNpsNote[]): Map<string, ThreeNpsNote> {
  const map = new Map<string, ThreeNpsNote>()
  for (const n of notes) map.set(`${n.stringIndex}-${n.fret}`, n)
  return map
}
