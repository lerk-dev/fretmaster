/**
 * lib/string-tuning.ts 的契约测试（此前零测试）。
 *
 * 它是**全局可变状态**：默认标准吉他调弦，由 app/page.tsx:473 `setStringTuning(instrumentConfig.tuning)`
 * 按乐器切换。指板渲染（practice-fretboard / fullscreen-overlay）与音名推算
 * （page-theory-functions.getStringTuning()[stringIndex]）都读它 ——
 * 一旦默认值或读写语义变了，整个指板会整体画错音。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { getStringTuning, setStringTuning } from '@/lib/string-tuning'

const STANDARD = [4, 11, 7, 2, 9, 4] // E B G D A E（高音弦 → 低音弦，半音值）

afterEach(() => {
  setStringTuning([...STANDARD])
})

describe('string-tuning', () => {
  it('默认是标准六弦吉他（E B G D A E，高→低）', () => {
    expect(getStringTuning()).toEqual(STANDARD)
    // 弦间音程校验（数组是高→低，故下标递增＝音高降低，差值需取模 12）：
    // 除 3→2 弦为大三度（4 半音）外，其余相邻弦都是纯四度（5 半音）。
    const step = (hi: number, lo: number) => (((hi - lo) % 12) + 12) % 12
    const t = getStringTuning()
    expect(step(t[0], t[1])).toBe(5) // E → B
    expect(step(t[1], t[2])).toBe(4) // B → G（大三度）
    expect(step(t[2], t[3])).toBe(5) // G → D
    expect(step(t[3], t[4])).toBe(5) // D → A
    expect(step(t[4], t[5])).toBe(5) // A → E
  })

  it('setStringTuning 切换后 getStringTuning 立即反映', () => {
    setStringTuning([7, 0, 5, 10, 2, 7])
    expect(getStringTuning()).toEqual([7, 0, 5, 10, 2, 7])
  })

  it('如实记录：getStringTuning 返回内部数组本身（非副本）', () => {
    // 调用方若原地修改返回值会**污染全局调弦**；同时 app/page.tsx:473 把
    // INSTRUMENT_CONFIG 里的数组直接交给 setter，两者会共享同一引用。
    // 当前所有消费点都是只读（.map / [i]），故无实际影响 —— 此处钉住行为避免无意改变。
    const a = getStringTuning()
    const b = getStringTuning()
    expect(a).toBe(b)
  })
})
