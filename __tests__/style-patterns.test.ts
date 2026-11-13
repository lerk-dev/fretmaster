/**
 * lib/style-patterns.ts 的契约测试（#5 风格 pattern 引擎的数据层）。
 *
 * 这一层的错误**不会报错，只会听上去不对**（少一拍、贝斯跑到高音区、摇摆没摇摆），
 * 所以用不变量把整张表钉住：
 *  ① 网格合法：beat ∈ 0..3、sub ∈ 0..3、velocity ∈ (0,1]、lengthSubs ≥ 1；
 *  ② 摇摆风格只用 sub 0/2 —— sub 1/3 在 2:1 位移下没有定义，写了就是「听感歪掉」的隐患；
 *  ③ 每个风格每小节都有鼓和贝斯，且同一 (beat,sub,乐器) 不重复（重复=白排一遍）；
 *  ④ 风格名的中英文案都存在（漏 key 会让界面显示 `style_xxx`）；
 *  ⑤ 摇摆位移：后半拍从 1/2 推迟到 2/3；直音风格保持 1/2；
 *  ⑥ 贝斯音高：落在低音区、七音缺失时回落、非法根音返回 null。
 */
import { describe, it, expect } from 'vitest'
import {
  STYLE_PATTERNS,
  ACCOMPANIMENT_STYLE_IDS,
  getStylePattern,
  isAccompanimentStyleId,
  drumHitsAtBeat,
  bassHitsAtBeat,
  hitOffsetSeconds,
  bassMidiForChord,
  BASS_BASE_MIDI,
} from '@/lib/style-patterns'
import { TRANSLATIONS } from '@/lib/i18n'

describe('风格表不变量', () => {
  it('id 唯一且都在白名单里', () => {
    const ids = STYLE_PATTERNS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(ACCOMPANIMENT_STYLE_IDS).toContain(id)
  })

  it('所有 hit 都落在合法网格与力度范围', () => {
    for (const style of STYLE_PATTERNS) {
      for (const hit of style.drum) {
        expect(hit.beat, `${style.id} 鼓点 beat 越界`).toBeGreaterThanOrEqual(0)
        expect(hit.beat, `${style.id} 鼓点 beat 越界`).toBeLessThanOrEqual(3)
        expect(hit.sub, `${style.id} 鼓点 sub 越界`).toBeGreaterThanOrEqual(0)
        expect(hit.sub, `${style.id} 鼓点 sub 越界`).toBeLessThanOrEqual(3)
        expect(hit.velocity, `${style.id} 鼓点力度`).toBeGreaterThan(0)
        expect(hit.velocity, `${style.id} 鼓点力度`).toBeLessThanOrEqual(1)
      }
      for (const hit of style.bass) {
        expect(hit.beat).toBeGreaterThanOrEqual(0)
        expect(hit.beat).toBeLessThanOrEqual(3)
        expect(hit.sub).toBeGreaterThanOrEqual(0)
        expect(hit.sub).toBeLessThanOrEqual(3)
        expect(hit.velocity).toBeGreaterThan(0)
        expect(hit.velocity).toBeLessThanOrEqual(1)
        expect(hit.lengthSubs, `${style.id} 贝斯时值`).toBeGreaterThanOrEqual(1)
        expect(hit.octave).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('摇摆风格只用 sub 0/2（sub 1/3 在 2:1 位移下没有定义）', () => {
    for (const style of STYLE_PATTERNS.filter((p) => p.swing)) {
      for (const hit of [...style.drum, ...style.bass]) {
        expect([0, 2], `${style.id} 摇摆风格不应使用 sub ${hit.sub}`).toContain(hit.sub)
      }
    }
  })

  it('每个风格每小节都有鼓和贝斯，且同位置同乐器不重复', () => {
    for (const style of STYLE_PATTERNS) {
      expect(style.drum.length, `${style.id} 没有鼓`).toBeGreaterThan(0)
      expect(style.bass.length, `${style.id} 没有贝斯`).toBeGreaterThan(0)
      const drumKeys = style.drum.map((h) => `${h.instrument}@${h.beat}:${h.sub}`)
      expect(new Set(drumKeys).size, `${style.id} 有重复鼓点`).toBe(drumKeys.length)
      const bassKeys = style.bass.map((h) => `${h.tone}@${h.beat}:${h.sub}`)
      expect(new Set(bassKeys).size, `${style.id} 有重复贝斯点`).toBe(bassKeys.length)
    }
  })

  it('风格名在中英文里都有文案（漏 key 会让界面显示 style_xxx）', () => {
    for (const style of STYLE_PATTERNS) {
      expect((TRANSLATIONS['zh-CN'] as Record<string, string>)[style.nameKey]).toBeTruthy()
      expect((TRANSLATIONS['en'] as Record<string, string>)[style.nameKey]).toBeTruthy()
    }
  })
})

describe('查找与兜底', () => {
  it('getStylePattern 命中已知 id', () => {
    expect(getStylePattern('bossa').id).toBe('bossa')
  })

  it('未知 / 空 id 回落到第一项（而不是静音）', () => {
    expect(getStylePattern('nope').id).toBe(STYLE_PATTERNS[0].id)
    expect(getStylePattern(null).id).toBe(STYLE_PATTERNS[0].id)
    expect(getStylePattern(undefined).id).toBe(STYLE_PATTERNS[0].id)
  })

  it('isAccompanimentStyleId 只认白名单', () => {
    expect(isAccompanimentStyleId('swing')).toBe(true)
    expect(isAccompanimentStyleId('jazz')).toBe(false)
    expect(isAccompanimentStyleId(null)).toBe(false)
    expect(isAccompanimentStyleId(3)).toBe(false)
  })

  it('drumHitsAtBeat / bassHitsAtBeat 只返回该拍', () => {
    const rock = getStylePattern('rock')
    expect(drumHitsAtBeat(rock, 1).every((h) => h.beat === 1)).toBe(true)
    expect(drumHitsAtBeat(rock, 1).length).toBeGreaterThan(0)
    // 拍号 6/8 时第 5、6 拍（index 4、5）没有 hit，留白
    expect(drumHitsAtBeat(rock, 4)).toEqual([])
    expect(bassHitsAtBeat(rock, 4)).toEqual([])
  })
})

describe('hitOffsetSeconds', () => {
  const beat = 0.5 // 120 BPM

  it('拍头偏移为 0', () => {
    expect(hitOffsetSeconds(0, beat, true)).toBe(0)
  })

  it('直音：sub 2 是半拍、sub 1 是 1/4 拍', () => {
    expect(hitOffsetSeconds(1, beat, false)).toBeCloseTo(beat / 4)
    expect(hitOffsetSeconds(2, beat, false)).toBeCloseTo(beat / 2)
    expect(hitOffsetSeconds(3, beat, false)).toBeCloseTo((beat * 3) / 4)
  })

  it('摇摆：后半拍从 1/2 推迟到 2/3（三连音感）', () => {
    expect(hitOffsetSeconds(2, beat, true)).toBeCloseTo((beat * 2) / 3)
    // 与直音的差值正是 swing 的听感来源
    expect(hitOffsetSeconds(2, beat, true) - hitOffsetSeconds(2, beat, false)).toBeCloseTo(beat / 6)
  })

  it('越界 sub 被夹到 0..3', () => {
    expect(hitOffsetSeconds(-1, beat, false)).toBe(0)
    expect(hitOffsetSeconds(9, beat, false)).toBeCloseTo((beat * 3) / 4)
  })
})

describe('bassMidiForChord', () => {
  it('根音落在低音区 C2..B2', () => {
    expect(bassMidiForChord({ root: 'C', type: 'Major' }, 'root')).toBe(BASS_BASE_MIDI)
    expect(bassMidiForChord({ root: 'B', type: 'Major' }, 'root')).toBe(BASS_BASE_MIDI + 11)
    expect(bassMidiForChord({ root: 'B♭', type: 'Major' }, 'root')).toBe(BASS_BASE_MIDI + 10)
    expect(bassMidiForChord({ root: 'C♯', type: 'Major' }, 'root')).toBe(BASS_BASE_MIDI + 1)
  })

  it('三音 / 五音按和弦音程叠加', () => {
    expect(bassMidiForChord({ root: 'C', type: 'Major' }, 'third')).toBe(BASS_BASE_MIDI + 4)
    expect(bassMidiForChord({ root: 'C', type: 'Major' }, 'fifth')).toBe(BASS_BASE_MIDI + 7)
    expect(bassMidiForChord({ root: 'C', type: 'm7' }, 'third')).toBe(BASS_BASE_MIDI + 3)
    expect(bassMidiForChord({ root: 'C', type: 'm7' }, 'seventh')).toBe(BASS_BASE_MIDI + 10)
  })

  it('三和弦没有七音时回落成最后一个音（避免整拍静音）', () => {
    expect(bassMidiForChord({ root: 'C', type: 'Major' }, 'seventh')).toBe(BASS_BASE_MIDI + 7)
  })

  it('类型大小写 / 别名会被归一（Maj7 与 maj7 等价）', () => {
    expect(bassMidiForChord({ root: 'C', type: 'Maj7' }, 'seventh'))
      .toBe(bassMidiForChord({ root: 'C', type: 'maj7' }, 'seventh'))
  })

  it('octave 偏移抬八度', () => {
    expect(bassMidiForChord({ root: 'C', type: 'Major' }, 'root', 1)).toBe(BASS_BASE_MIDI + 12)
  })

  it('非法根音返回 null（排程侧据此跳过该音）', () => {
    expect(bassMidiForChord({ root: 'H', type: 'Major' }, 'root')).toBeNull()
    expect(bassMidiForChord({ root: '', type: 'Major' }, 'root')).toBeNull()
  })
})
