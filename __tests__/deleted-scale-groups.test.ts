/**
 * 旧分组（church / minor / other / bebop / jazz）已删除的数据契约。
 *
 * ## 背景
 *
 * 这五个分组与「新分组」逐条重复，是典型的「第二真相源」—— 用户在两个分组里选到
 * 同一音阶却看到不同音级。2026-10-15 连同数据一起删除（此前只从 UI 下线）。
 *
 * 删除前用探针逐条比对音高集合，证明 **19 条全部**能在新分组找到对应（零孤儿）：
 *   church 7 / minor 2 / bebop 2 / other 3 / jazz 5。
 *
 * ## 本护栏钉住两件事
 *
 * ① 这五个键**不许回来**（回来就是第二真相源复活）；
 * ② 反过来：新分组的音高集合必须是那 19 条的**超集** —— 防止有人删新分组里的音阶时
 *    把「本来由旧分组覆盖」的那一条也带走，造成静默的信息损失。
 */
import { describe, it, expect } from 'vitest'
import { SCALE_MODES } from '@/lib/page-theory-data'

/** 已删除的旧分组键。写在这里 ⇒ 它们一旦在 SCALE_MODES 里复活，第一条用例立刻红。 */
const DELETED_GROUPS = ['church', 'minor', 'bebop', 'other', 'jazz'] as const

/**
 * 旧分组 19 条的音高集合基线（升序序列化）。
 *
 * 🚨 这是**删除前**从旧分组逐条抄下来的。若新分组有人删音阶，超集用例会红 ——
 * 那说明删掉的这条原本只有旧分组覆盖，属于信息损失，必须先把新分组补回来。
 */
const OLD_GROUP_PITCH_SETS: readonly string[] = [
  // church（7）—— 与 majorScaleModes / basic 重复
  '[0,2,4,5,7,9,11]', // Ionian
  '[0,2,3,5,7,9,10]', // Dorian
  '[0,1,3,5,7,8,10]', // Phrygian
  '[0,2,4,6,7,9,11]', // Lydian
  '[0,2,4,5,7,9,10]', // Mixolydian
  '[0,2,3,5,7,8,10]', // Aeolian
  '[0,1,3,5,6,8,10]', // Locrian
  // minor（2）
  '[0,2,3,5,7,8,11]', // Harmonic Minor
  '[0,2,3,5,7,9,11]', // Melodic Minor
  // bebop（2）
  '[0,2,4,5,7,8,9,11]', // Bebop Major
  '[0,2,3,4,5,7,9,10]', // Bebop Dorian
  // other（3）
  '[0,3,5,6,7,10]',    // Blues
  '[0,2,4,6,8,10]',    // Whole Tone
  '[0,1,3,4,6,7,9,10]', // Diminished（= Half-Whole Diminished）
  // jazz（5）
  '[0,2,4,6,7,9,10]',  // Lydian Dominant
  '[0,1,3,4,6,8,10]',  // Altered
  '[0,1,3,4,6,7,9,10]', // Half-Whole Diminished
  '[0,2,3,5,6,8,9,11]', // Whole-Half Diminished
  '[0,2,4,5,7,8,11]',  // Harmonic Major
]

const pitchKey = (notes: number[]): string => JSON.stringify([...notes].sort((a, b) => a - b))

describe('已删除的旧分组（church / minor / other / bebop / jazz）', () => {
  it('这五个键不许在 SCALE_MODES 里复活（回来 = 第二真相源复活）', () => {
    const revived = DELETED_GROUPS.filter((g) => g in SCALE_MODES)
    expect(revived, `这些已删除的分组又回来了：${revived.join(', ')}`).toEqual([])
  })

  it('新分组的音高集合必须是旧分组 19 条的超集（防删亏）', () => {
    const liveSets = new Set(
      Object.values(SCALE_MODES).flatMap((list) => (list as { notes: number[] }[]).map((e) => pitchKey(e.notes)))
    )
    const missing = OLD_GROUP_PITCH_SETS.filter((k) => !liveSets.has(k))
    expect(
      missing,
      `这些音高集合原本只由旧分组覆盖，现已无任何分组提供 ⇒ 信息损失：\n${missing.join('\n')}`
    ).toEqual([])
  })

  it('基线自检：19 条、去重后 18 个唯一集合（Diminished 与 Half-Whole Diminished 同音高）', () => {
    expect(OLD_GROUP_PITCH_SETS).toHaveLength(19)
    // 唯一重复：`other/Diminished` 与 `jazz/Half-Whole Diminished` 是同一串音
    // （半全减音阶）—— 两个旧分组各存了一份，正是「第二真相源」的活证。
    expect(new Set(OLD_GROUP_PITCH_SETS).size).toBe(18)
  })
})
