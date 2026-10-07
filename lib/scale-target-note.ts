import { getNoteIndex, resolveScaleDegreeSemitone } from '@/lib/page-theory-functions'

/**
 * 音阶练习：把「当前该弹的音级标签」解析成**绝对音名下标**（0..11，0 = C）。
 *
 * 这是音阶练习判定（点击指板 / MIDI 输入 / 麦克风三条路径）的**唯一真相源**：
 * 音级标签 → 半音数 → 加上主音 → 目标音名下标。调用方只需把自己拿到的音名下标
 * 与返回值比较。
 *
 * 🚨 为什么必须走「标签 → 半音」这个方向，而不能反过来（半音 → 标签）：
 * 音级标签是**异名同音**的（`b5`/`#4`、`b6`/`#5`、`b3`/`#2`…），一张「半音 → 标签」
 * 的反查表只能表达其中一侧，另一侧就永远比不上 —— 弹对了判错，且不报任何错。
 *
 * 历史上 `app/page.tsx` 的点击路径就是这么写的（硬编码降号侧反查表），实测 76 个音阶里
 * **22 个**受影响，包括最常用的 Lydian（`#4` 被反查成 `b5`）、Blues（`#4`）、
 * Whole Tone（`#4`/`#5`/`#6` 三个音全错）、melodicMinor 的 Altered（`#2`/`#5`）。
 * 正向比较从根上不需要「选哪一侧」，因为标签本身已经携带了正确的拼写。
 *
 * @returns 目标音名下标；`undefined` = 这个标签两边都认不出（调用方应拒绝推进并告警，
 *          而不是当 0 处理 —— 当 0 会「弹主音就推进」，比不推进更难发现）。
 */
export function resolveScaleTargetNoteIndex(
  scale: { name?: string; intervals?: readonly string[] | null; notes?: readonly number[] | null },
  degree: string,
  keyNote: string
): number | undefined {
  const semitone = resolveScaleDegreeSemitone(scale, degree)
  if (semitone === undefined) return undefined
  return (getNoteIndex(keyNote) + semitone) % 12
}
