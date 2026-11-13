/**
 * 和弦指法图库（#4）。
 *
 * 数据表最容易「手滑写错一个品」—— 这种错不会抛异常，只会让用户按出一个不属于该和弦的音。
 * 所以这里不只测结果，还把 `isValidVoicing` 当作**全量不变量**跑遍所有根音 × 支持类型。
 *
 * 🚨 弦序：与全项目一致，下标 0 = 最高音弦（`frets` / `tuning` 都是「高 → 低」）。
 */
import { describe, it, expect } from 'vitest'
import { getChordVoicings, isValidVoicing } from '@/lib/chord-voicings'
import { NOTES } from '@/lib/page-theory-data'

/** 标准吉他调弦（下标 0 = 高音 E） */
const STANDARD_TUNING = [4, 11, 7, 2, 9, 4]
const FRETS = 24

describe('getChordVoicings：开放把位', () => {
  it('C 大三 = x32010（按项目弦序写成 [0,1,0,2,3,x]），且标记为开放把位', () => {
    const voicings = getChordVoicings('C', 'Major', STANDARD_TUNING, FRETS)
    const open = voicings.find((v) => v.kind === 'open')
    expect(open).toBeDefined()
    expect(open!.frets).toEqual([0, 1, 0, 2, 3, null])
    expect(open!.baseFret).toBe(0)
  })

  it('开放把位排在可移动型之前', () => {
    const voicings = getChordVoicings('E', 'Major', STANDARD_TUNING, FRETS)
    expect(voicings[0].kind).toBe('open')
    expect(voicings.slice(1).every((v) => v.baseFret > 0)).toBe(true)
  })

  it('不支持的类型返回空数组（不硬编一个错误指法）', () => {
    expect(getChordVoicings('C', 'Aug', STANDARD_TUNING, FRETS)).toEqual([])
    expect(getChordVoicings('C', 'NoSuchType', STANDARD_TUNING, FRETS)).toEqual([])
  })
})

describe('getChordVoicings：可移动型', () => {
  it('E 型大三：C 在 8 品（x,8,10,10,9,8 的低→高 → 高→低）', () => {
    const eShape = getChordVoicings('C', 'Major', STANDARD_TUNING, FRETS).find((v) => v.shape === 'E')
    expect(eShape).toBeDefined()
    expect(eShape!.baseFret).toBe(8)
    expect(eShape!.frets).toEqual([8, 8, 9, 10, 10, 8])
  })

  it('A 型大三：C 在 3 品 = x35553', () => {
    const aShape = getChordVoicings('C', 'Major', STANDARD_TUNING, FRETS).find((v) => v.shape === 'A')
    expect(aShape).toBeDefined()
    expect(aShape!.frets).toEqual([3, 5, 5, 5, 3, null])
  })

  it('同一类型下，不同根音的 E 型形状完全同构（整体平移）', () => {
    const c = getChordVoicings('C', 'Minor', STANDARD_TUNING, FRETS).find((v) => v.shape === 'E')!
    const d = getChordVoicings('D', 'Minor', STANDARD_TUNING, FRETS).find((v) => v.shape === 'E')!
    const relative = c.frets.map((f) => (f === null ? null : f - c.baseFret))
    const relativeD = d.frets.map((f) => (f === null ? null : f - d.baseFret))
    expect(relativeD).toEqual(relative)
  })
})

describe('getChordVoicings：全量不变量', () => {
  const TYPES = ['Major', 'Minor', '7', 'm7', 'Maj7', '6', 'm6', 'sus4', 'sus2', 'm7b5']

  it('每个生成的指法都只含和弦音、含根音、品号不越界', () => {
    for (const root of NOTES) {
      for (const type of TYPES) {
        const voicings = getChordVoicings(root, type, STANDARD_TUNING, FRETS)
        // 至少要有开放把位或 E/A 型之一（否则「图库」对这些常用和弦就是空的）
        expect(voicings.length, `${root} ${type} 没有任何指法`).toBeGreaterThan(0)
        for (const voicing of voicings) {
          expect(
            isValidVoicing(root, type, voicing.frets, STANDARD_TUNING),
            `${root} ${type} 的 ${voicing.id} 含非和弦音或缺根音`
          ).toBe(true)
          for (const fret of voicing.frets) {
            if (fret !== null) {
              expect(fret).toBeGreaterThanOrEqual(0)
              expect(fret).toBeLessThanOrEqual(FRETS)
            }
          }
        }
      }
    }
  })

  it('指法 id 不重复（切换变体时 key 稳定）', () => {
    for (const type of TYPES) {
      const ids = getChordVoicings('C', type, STANDARD_TUNING, FRETS).map((v) => v.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('品数限制生效：fretCount 很小时可移动型被丢弃，只剩开放把位', () => {
    const voicings = getChordVoicings('C', 'Major', STANDARD_TUNING, 3)
    expect(voicings.every((v) => v.frets.every((f) => f === null || f <= 3))).toBe(true)
    expect(voicings.some((v) => v.kind === 'open')).toBe(true)
  })

  it('非 6 弦调弦不会硬塞 6 弦指法（避免画出错位的图）', () => {
    const sevenString = [4, 11, 7, 2, 9, 4, 11]
    const voicings = getChordVoicings('C', 'Major', sevenString, FRETS)
    expect(voicings).toEqual([])
  })
})
