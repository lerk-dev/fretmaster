/**
 * 「单音全指板」练习的纯逻辑：枚举某音名在一个品域内的全部落点、生成巡游顺序、
 * 一轮结束后挑选下一个目标音。
 *
 * 这里不依赖 React / store，便于穷举测试。页面只负责持有时序状态
 * （当前下标、已找到集合），所有「哪些位置 / 下一个是谁」的判定都走本模块。
 */
import { getNoteAtPosition } from '@/lib/page-theory-functions'
import { NOTES } from '@/lib/page-theory-data'

/** 指板上的一个位置（弦下标 0 = 最高音弦，品 0 = 空弦） */
export interface CellPos {
  stringIndex: number
  fret: number
}

/** 巡游顺序：逐把位（横向）/ 逐弦（纵向）/ 就近（连线最顺）/ 八度梯子 / 随机 */
export type TourOrder = 'byPosition' | 'byString' | 'nearest' | 'octave' | 'random'

export interface EnumerateOptions {
  /** 目标音名（NOTES 里的写法，如 'E'、'C♯'） */
  targetNote: string
  /** 最大品数（含） */
  maxFret: number
  /** 允许的弦下标（0 起） */
  allowedStringIndexes: number[]
  /** 调弦（高音弦 → 低音弦的半音值）；不传走全局调弦 */
  tuning?: number[]
}

/** 位置的稳定键，用于 Set / Map（`3-5` = 弦下标 3、5 品） */
export function cellKey(pos: CellPos): string {
  return `${pos.stringIndex}-${pos.fret}`
}

/**
 * 枚举目标音在给定品域 / 弦集合内的全部位置。
 *
 * 结果按「弦下标升序 → 品升序」排列（= 从高音弦往低音弦，每根弦从空弦到高把位）。
 * 同一个 (弦, 品) 不会重复；`maxFret` 为负或弦集合为空时返回空数组。
 */
export function enumerateTargetPositions({
  targetNote,
  maxFret,
  allowedStringIndexes,
  tuning,
}: EnumerateOptions): CellPos[] {
  if (!targetNote || maxFret < 0) return []
  const out: CellPos[] = []
  for (const stringIndex of allowedStringIndexes) {
    for (let fret = 0; fret <= maxFret; fret++) {
      const note = tuning
        ? getNoteAtPosition(stringIndex, fret, tuning)
        : getNoteAtPosition(stringIndex, fret)
      if (note === targetNote) out.push({ stringIndex, fret })
    }
  }
  return out
}

/** 逐把位：品升序，同品内弦下标升序（横向扫过指板） */
function orderByPosition(positions: CellPos[]): CellPos[] {
  return [...positions].sort((a, b) => a.fret - b.fret || a.stringIndex - b.stringIndex)
}

/** 逐弦：弦下标升序，同弦内品升序（纵向练一根弦） */
function orderByString(positions: CellPos[]): CellPos[] {
  return [...positions].sort((a, b) => a.stringIndex - b.stringIndex || a.fret - b.fret)
}

/**
 * 就近：贪心最近邻。
 *
 * 距离把「跨弦」折算得比「走品」贵（同样一格，跨弦要换手型，走品只需移动手指），
 * 因此连线看起来像一条真实的移动路径，而不是来回跳。
 * 起点取「最靠近琴枕、最靠高音弦」的位置；并列时按品、弦稳定排序，结果可复现。
 */
function orderByNearest(positions: CellPos[]): CellPos[] {
  if (positions.length <= 1) return [...positions]
  const remaining = [...positions].sort(
    (a, b) => a.fret - b.fret || a.stringIndex - b.stringIndex,
  )
  const out: CellPos[] = [remaining.shift()!]
  while (remaining.length > 0) {
    const last = out[out.length - 1]
    let bestIdx = 0
    let bestScore = Number.POSITIVE_INFINITY
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]
      const score = Math.abs(cand.fret - last.fret) + Math.abs(cand.stringIndex - last.stringIndex) * 3
      if (score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    out.push(remaining.splice(bestIdx, 1)[0])
  }
  return out
}

/**
 * 八度梯子：按「同一个音在指板上的八度形状」从低把位往高把位走，而不是最短路径。
 *
 * 目标形态（以 E 为例，弦号 1 = 最细）：
 *   1弦0 ↔ 6弦0 → 4弦2 → 2弦5 → 5弦7 → 3弦9 → 1弦12 → 6弦12 → 4弦14 → …
 *
 * 三条规则：
 *   ① **起点 = 这个音出现的最低品**，不再固定从空弦 / 最低弦起步：
 *      C 的最低把位是 2弦1品，就从 2弦1品开始往上走；E 的最低品是 0
 *      （1弦0 与 6弦0 同品），于是两根空弦先互联再往上。
 *      同一个最低品落在多根弦上时，按弦下标升序把它们连起来；
 *   ② 之后固定按弦序「最低弦、隔一根、再隔一根……然后回到次低弦那串」
 *      （6 弦 = 6,4,2,5,3,1），每根弦取**不小于上一个品的最小未访问位置**
 *      （这根弦确实没有更高的位置了才回头取最近的），所以整条线只往高把位走；
 *   ③ 这个弦序 + 递增的品就是吉他上的八度形状，连线是一条连续的八度链。
 *
 * 弦序由实际出现的最粗弦推导（`maxStringIndex`），不写死 6 弦，四弦贝斯 / 七弦同理。
 */
function orderByOctaveLadder(positions: CellPos[]): CellPos[] {
  if (positions.length <= 1) return [...positions]

  const fretsByString = new Map<number, number[]>()
  for (const pos of positions) {
    const frets = fretsByString.get(pos.stringIndex)
    if (frets) frets.push(pos.fret)
    else fretsByString.set(pos.stringIndex, [pos.fret])
  }
  for (const frets of fretsByString.values()) frets.sort((a, b) => a - b)

  const maxStringIndex = Math.max(...fretsByString.keys())
  const stringCycle: number[] = []
  for (let s = maxStringIndex; s >= 0; s -= 2) stringCycle.push(s)
  for (let s = maxStringIndex - 1; s >= 0; s -= 2) stringCycle.push(s)

  const out: CellPos[] = []
  const used = new Set<string>()

  // ① 起点 = 这个音出现的最低品（同一品落在多根弦上时按弦下标升序连起来）
  const minFret = Math.min(...positions.map((pos) => pos.fret))
  const seeds = positions
    .filter((pos) => pos.fret === minFret)
    .sort((a, b) => a.stringIndex - b.stringIndex)
  for (const pos of seeds) {
    out.push(pos)
    used.add(cellKey(pos))
  }
  /** 梯子已经走到哪个品（「只往高把位走」的基准） */
  let lastFret = minFret
  // 梯子从最后一个起点所在弦的下一位继续；没有起点之外的位置时循环会自然退出
  let cursor = stringCycle.indexOf(seeds[seeds.length - 1].stringIndex) + 1

  let staleSteps = 0
  while (out.length < positions.length && staleSteps < stringCycle.length) {
    const stringIndex = stringCycle[cursor % stringCycle.length]
    const frets = fretsByString.get(stringIndex) ?? []
    // 优先取「不比上一个品低」的最小未访问位置；这根弦没有更高的了才回头取最近的
    let above: number | null = null
    let nearestBelow: number | null = null
    let nearestBelowDistance = Number.POSITIVE_INFINITY
    for (const fret of frets) {
      if (used.has(cellKey({ stringIndex, fret }))) continue
      if (fret >= lastFret) {
        if (above === null || fret < above) above = fret
      } else if (lastFret - fret < nearestBelowDistance) {
        nearestBelowDistance = lastFret - fret
        nearestBelow = fret
      }
    }
    const pick = above ?? nearestBelow
    if (pick === null) {
      // 这根弦已经没有可用位置：跳过它，整圈都没得取就说明走完了
      staleSteps += 1
    } else {
      out.push({ stringIndex, fret: pick })
      used.add(cellKey({ stringIndex, fret: pick }))
      lastFret = pick
      staleSteps = 0
    }
    cursor += 1
  }

  return out
}

/** Fisher-Yates（不用 `sort(() => Math.random() - 0.5)`：分布不均匀） */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 生成巡游顺序（不改动入参） */
export function buildTour(
  positions: CellPos[],
  mode: TourOrder,
  rng: () => number = Math.random,
): CellPos[] {
  switch (mode) {
    case 'byString':
      return orderByString(positions)
    case 'nearest':
      return orderByNearest(positions)
    case 'octave':
      return orderByOctaveLadder(positions)
    case 'random':
      return shuffle(positions, rng)
    case 'byPosition':
    default:
      return orderByPosition(positions)
  }
}

/**
 * 一轮结束后取下一个目标音。
 *
 * - `random=false`：按 NOTES 的固定顺序取下一个（12 个音循环）；
 * - `random=true`：在 `seen` 之外随机取一个；全部见过则清空重来（返回随机一个）。
 *
 * `current` 不在 NOTES 里时按第一个音处理。
 */
export function nextTargetNote(
  current: string,
  seen: string[],
  random: boolean,
  rng: () => number = Math.random,
): string {
  const idx = NOTES.indexOf(current)
  if (!random) {
    return NOTES[(idx + 1 + NOTES.length) % NOTES.length]
  }
  const seenSet = new Set(seen)
  const pool = NOTES.filter(n => !seenSet.has(n))
  const source = pool.length > 0 ? pool : NOTES
  return source[Math.floor(rng() * source.length)]
}

export interface AttributeHitInput {
  /** 本轮巡游（已按顺序排好） */
  tour: ReadonlyArray<CellPos>
  /** 本轮已找到的位置 */
  found: ReadonlyArray<CellPos>
  /** 本轮已跳过的位置 */
  skipped: ReadonlyArray<CellPos>
  /** 位置提示方式 */
  prompt: 'none' | 'exact'
  /** 当前提示位置（'none' 下恒为 null） */
  promptPos: CellPos | null
  /** 点击命中带真实位置；音频命中没有 */
  position?: CellPos
  /** 音频命中的绝对八度（E2 = 2） */
  octave?: number
  /** 位置 → 八度（页面注入，避免本模块耦合调弦/音高实现） */
  octaveOf: (pos: CellPos) => number | null
}

/**
 * 命中落点归属：把「弹对了」换算成指板上的某个格子。
 *
 * 麦克风只能拿到音名 + 八度，拿不到弦品，所以这里唯一的一步是「猜」：
 *
 * - **点击**：位置是真的，直接用；但如果它不在本轮巡游内（超出品数），返回 undefined ——
 *   记进去会点亮圈外格子、并把覆盖数虚增一个导致提前结束一轮。
 * - **无提示（'none'）**：没有「当前目标」可推断，用八度在本轮剩余位置里找一个。
 *   🚨 不能因为「猜不准」就什么都不记：那样弹对了指板上毫无反应，用户会以为没识别到。
 *   同八度的多个位置按巡游顺序依次点亮。
 * - **精确提示（'exact'）**：提示位置八度对上 ⇒ 记提示位置；对不上 ⇒ 找同八度未去过的位置；
 *   再找不到 ⇒ 退回提示位置（宁可记错也不卡住进度，八度本身也可能判错）。
 */
export function attributeHit({
  tour,
  found,
  skipped,
  prompt,
  promptPos,
  position,
  octave,
  octaveOf,
}: AttributeHitInput): CellPos | undefined {
  if (position) {
    return tour.some((p) => cellKey(p) === cellKey(position)) ? position : undefined
  }

  const foundKeys = new Set(found.map(cellKey))
  const skippedKeys = new Set(skipped.map(cellKey))
  const free = tour.filter((p) => !foundKeys.has(cellKey(p)) && !skippedKeys.has(cellKey(p)))

  if (prompt === 'none') {
    if (octave === undefined) return undefined
    const same = free.find((p) => octaveOf(p) === octave)
    if (same) return same
    // 该八度在本轮已经没有空位 ⇒ 退到相邻八度猜一手：
    // YIN 在低音区常把 E2/A2 判成高八度的谐波，实际弹的位置往往比检测值低一个八度，
    // 所以先试 -1 再试 +1。宁可落到相邻八度，也别让「弹对了毫无反应」。
    return (
      free.find((p) => octaveOf(p) === octave - 1) ??
      free.find((p) => octaveOf(p) === octave + 1)
    )
  }

  const promptMatchesOctave =
    !!promptPos && octave !== undefined && octaveOf(promptPos) === octave
  if (promptPos && (octave === undefined || promptMatchesOctave)) return promptPos
  if (octave !== undefined) {
    const sameOctave = free.find((p) => octaveOf(p) === octave)
    if (sameOctave) return sameOctave
  }
  return promptPos ?? undefined
}
