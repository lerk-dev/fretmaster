import { describe, it, expect } from 'vitest'
import {
  getNoteIndex,
  frequencyToNoteName,
  noteNameToFrequency,
  getNoteAtPosition,
  getInterval,
  degreeToSemitone,
  getScaleNoteNames,
  calculateCentsDiff,
  normalizeCents,
  isWithinCentsThreshold,
  NOTE_NAMES,
  STANDARD_TUNING,
} from '../lib/music-theory'

describe('音乐理论工具函数', () => {
  describe('getNoteIndex', () => {
    it('应该正确返回 C 的索引 0', () => {
      expect(getNoteIndex('C')).toBe(0)
    })

    it('应该正确返回 A 的索引 9', () => {
      expect(getNoteIndex('A')).toBe(9)
    })

    it('应该正确处理升号音符', () => {
      expect(getNoteIndex('C#')).toBe(1)
      expect(getNoteIndex('F#')).toBe(6)
    })

    it('应该正确处理降号音符', () => {
      expect(getNoteIndex('Db')).toBe(1)
      expect(getNoteIndex('Bb')).toBe(10)
    })

    it('应该正确处理 Unicode 音符符号', () => {
      expect(getNoteIndex('C♯')).toBe(1)
      expect(getNoteIndex('D♭')).toBe(1)
    })

    it('应该对无效输入返回 -1', () => {
      expect(getNoteIndex('')).toBe(-1)
      expect(getNoteIndex('X')).toBe(-1)
    })
  })

  describe('frequencyToNoteName', () => {
    it('应该正确识别 A4 (440Hz)', () => {
      expect(frequencyToNoteName(440)).toBe('A')
    })

    it('应该正确识别 C4 (约 261.63Hz)', () => {
      expect(frequencyToNoteName(261.63)).toBe('C')
    })

    it('应该正确识别 E2 (约 82.41Hz)', () => {
      expect(frequencyToNoteName(82.41)).toBe('E')
    })

    it('应该对无效频率返回 null', () => {
      expect(frequencyToNoteName(0)).toBe(null)
      expect(frequencyToNoteName(-100)).toBe(null)
    })
  })

  describe('noteNameToFrequency', () => {
    it('应该正确计算 A4 的频率', () => {
      expect(noteNameToFrequency('A', 4)).toBeCloseTo(440, 1)
    })

    it('应该正确计算 C4 的频率', () => {
      expect(noteNameToFrequency('C', 4)).toBeCloseTo(261.63, 1)
    })

    it('应该正确计算 E2 的频率', () => {
      expect(noteNameToFrequency('E', 2)).toBeCloseTo(82.41, 1)
    })

    it('应该默认使用第 4 八度', () => {
      expect(noteNameToFrequency('A')).toBeCloseTo(440, 1)
    })
  })

  describe('getNoteAtPosition', () => {
    it('应该正确返回 1 弦 0 品的音符 (标准调弦)', () => {
      expect(getNoteAtPosition(0, 0)).toBe('E')
    })

    it('应该正确返回 1 弦 1 品的音符', () => {
      expect(getNoteAtPosition(0, 1)).toBe('F')
    })

    it('应该正确返回 2 弦 0 品的音符', () => {
      expect(getNoteAtPosition(1, 0)).toBe('B')
    })

    it('应该正确返回 6 弦 0 品的音符', () => {
      expect(getNoteAtPosition(5, 0)).toBe('E')
    })

    it('应该正确处理 12 品 (八度)', () => {
      expect(getNoteAtPosition(0, 12)).toBe('E')
    })

    it('应该对无效弦索引返回空字符串', () => {
      expect(getNoteAtPosition(-1, 0)).toBe('')
      expect(getNoteAtPosition(6, 0)).toBe('')
    })
  })

  describe('getInterval', () => {
    it('应该正确计算 C 到 E 的音程 (4 半音)', () => {
      expect(getInterval('C', 'E')).toBe(4)
    })

    it('应该正确计算 C 到 G 的音程 (7 半音)', () => {
      expect(getInterval('C', 'G')).toBe(7)
    })

    it('应该正确计算 E 到 C 的音程 (8 半音，下行)', () => {
      expect(getInterval('E', 'C')).toBe(8)
    })

    it('应该正确计算同音音程 (0 半音)', () => {
      expect(getInterval('C', 'C')).toBe(0)
    })

    it('应该对无效音符返回 -1', () => {
      expect(getInterval('X', 'C')).toBe(-1)
    })
  })

  describe('degreeToSemitone', () => {
    it('应该正确返回根音的半音数', () => {
      expect(degreeToSemitone('1')).toBe(0)
    })

    it('应该正确返回大三度的半音数', () => {
      expect(degreeToSemitone('3')).toBe(4)
    })

    it('应该正确返回纯五度的半音数', () => {
      expect(degreeToSemitone('5')).toBe(7)
    })

    it('应该正确返回小七度的半音数', () => {
      expect(degreeToSemitone('b7')).toBe(10)
    })

    it('应该对无效音级返回 undefined', () => {
      expect(degreeToSemitone('invalid')).toBeUndefined()
    })
  })

  describe('getScaleNoteNames', () => {
    it('应该正确生成 C 大调音阶的音名', () => {
      const intervals = ['1', '2', '3', '4', '5', '6', '7']
      const result = getScaleNoteNames('C', intervals)
      expect(result).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
    })

    it('应该正确生成 D Phrygian 音阶的音名', () => {
      const intervals = ['1', 'b2', 'b3', '4', '5', 'b6', 'b7']
      const result = getScaleNoteNames('D', intervals)
      expect(result).toEqual(['D', 'Eb', 'F', 'G', 'A', 'Bb', 'C'])
    })

    it('应该正确生成 G 大调音阶的音名', () => {
      const intervals = ['1', '2', '3', '4', '5', '6', '7']
      const result = getScaleNoteNames('G', intervals)
      expect(result).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#'])
    })
  })

  describe('calculateCentsDiff', () => {
    it('应该正确计算相同频率的音分差', () => {
      expect(calculateCentsDiff(440, 440)).toBe(0)
    })

    it('应该正确计算八度音分差', () => {
      expect(calculateCentsDiff(880, 440)).toBeCloseTo(1200, 1)
    })

    it('应该正确计算半音音分差', () => {
      // C 到 C# 约为 100 音分
      expect(calculateCentsDiff(261.63 * 1.0595, 261.63)).toBeCloseTo(100, 0)
    })
  })

  describe('normalizeCents', () => {
    it('应该将 0 音分保持不变', () => {
      expect(normalizeCents(0)).toBe(0)
    })

    it('应该将 100 音分保持不变', () => {
      expect(normalizeCents(100)).toBe(100)
    })

    it('应该将 1100 音分标准化为 100', () => {
      expect(normalizeCents(1100)).toBe(100)
    })

    it('应该将 1300 音分标准化为 100', () => {
      expect(normalizeCents(1300)).toBe(100)
    })
  })

  describe('isWithinCentsThreshold', () => {
    it('应该在音分差小于阈值时返回 true', () => {
      expect(isWithinCentsThreshold(20, 25)).toBe(true)
    })

    it('应该在音分差等于阈值时返回 true', () => {
      expect(isWithinCentsThreshold(25, 25)).toBe(true)
    })

    it('应该在音分差大于阈值时返回 false', () => {
      expect(isWithinCentsThreshold(30, 25)).toBe(false)
    })

    it('应该正确处理负音分差', () => {
      expect(isWithinCentsThreshold(-20, 25)).toBe(true)
    })
  })

  describe('常量', () => {
    it('NOTE_NAMES 应该包含 12 个音符', () => {
      expect(NOTE_NAMES).toHaveLength(12)
    })

    it('STANDARD_TUNING 应该包含 6 根弦', () => {
      expect(STANDARD_TUNING).toHaveLength(6)
    })

    it('STANDARD_TUNING 应该是 E-B-G-D-A-E', () => {
      expect(STANDARD_TUNING).toEqual(['E', 'B', 'G', 'D', 'A', 'E'])
    })
  })
})
