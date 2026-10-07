/**
 * 乐器配置（INSTRUMENT_CONFIG）的契约测试。
 *
 * 这份配置是活的，驱动两件用户可见的事：
 *  1. 指板渲染与把位/音阶计算 —— components/theory-panel.tsx:183
 *     取 config.tuning / stringCount 画指板，lib/fretboard-positions.ts 用它算把位
 *  2. 音高检测下限与 YIN 门限 —— app/page.tsx:1912 调 detectFloorForLowestHz(lowestStringHz)、
 *     :1920 调 resolveYinThreshold(lowestStringHz)
 *
 * 一旦 lowestStringHz 与最低弦音级不符（例如把贝斯误写成吉他的八度），检测下限会整体漂移，
 * 低音弦静默检不出 —— 属于"不抛异常、只是错"的一类，正是最该钉住的。
 */
import { describe, it, expect } from 'vitest'
import { INSTRUMENT_CONFIG, type InstrumentType } from '@/lib/practice-suggestions'
import { frequencyToNoteName, detectFloorForLowestHz } from '@/lib/pitch-detection'
import { noteFromString } from '@/lib/chord-theory'

const INSTRUMENTS = Object.keys(INSTRUMENT_CONFIG) as InstrumentType[]

describe('INSTRUMENT_CONFIG', () => {
  it('每个乐器都有配置，弦数与调弦长度一致', () => {
    expect(INSTRUMENTS.length).toBeGreaterThan(0)
    for (const inst of INSTRUMENTS) {
      const c = INSTRUMENT_CONFIG[inst]
      expect(c, inst).toBeDefined()
      expect(c.tuning.length, inst).toBe(c.stringCount)
      expect(c.stringCount, inst).toBeGreaterThan(0)
      expect(c.defaultFretCount, inst).toBeGreaterThan(0)
      expect(c.lowestStringHz, inst).toBeGreaterThan(0)
    }
  })

  it('调弦数组的每一项都是合法半音值（0..11 整数）', () => {
    for (const inst of INSTRUMENTS) {
      for (const pc of INSTRUMENT_CONFIG[inst].tuning) {
        expect(Number.isInteger(pc), `${inst} tuning 含非整数 ${pc}`).toBe(true)
        expect(pc, inst).toBeGreaterThanOrEqual(0)
        expect(pc, inst).toBeLessThanOrEqual(11)
      }
    }
  })

  it('lowestStringHz 的音级必须等于最低音弦（调弦数组末项）', () => {
    for (const inst of INSTRUMENTS) {
      const c = INSTRUMENT_CONFIG[inst]
      const lowestStringPC = c.tuning[c.tuning.length - 1]
      const name = frequencyToNoteName(c.lowestStringHz)
      expect(
        noteFromString(name),
        `${inst}: lowestStringHz=${c.lowestStringHz} → ${name}，但最低弦应是半音值 ${lowestStringPC}`,
      ).toBe(lowestStringPC)
    }
  })

  it('lowestStringHz 落在低音弦合理音区（挡住明显离谱的写法）', () => {
    // ⚠️ 局限：tuning 只存音级、不含八度，因此「相邻八度写错」（贝斯 E1 被写成吉他 E2）
    //    无法用现有数据交叉验证 —— 本条只能挡住差 2 个八度以上的值（如误填 E4=329.63Hz）。
    for (const inst of INSTRUMENTS) {
      const { lowestStringHz } = INSTRUMENT_CONFIG[inst]
      const midi = Math.round(69 + 12 * Math.log2(lowestStringHz / 440))
      // 实测区间：五弦贝斯 B0=23 … 六弦四度 F2=41；留 ±3 半音余量
      expect(midi, `${inst}: ${lowestStringHz}Hz → MIDI ${midi}，已越出低音弦合理区间`).toBeGreaterThanOrEqual(20)
      expect(midi, `${inst}: ${lowestStringHz}Hz → MIDI ${midi}，已越出低音弦合理区间`).toBeLessThanOrEqual(45)
    }
  })

  it('检测下限必须低于最低弦，否则最低弦永远检不出', () => {
    for (const inst of INSTRUMENTS) {
      const { lowestStringHz } = INSTRUMENT_CONFIG[inst]
      const floor = detectFloorForLowestHz(lowestStringHz)
      expect(floor, `${inst}: 检测下限 ${floor}Hz 未低于最低弦 ${lowestStringHz}Hz`).toBeLessThan(lowestStringHz)
    }
  })
})
