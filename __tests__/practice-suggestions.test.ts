/**
 * 练习建议数据（PRACTICE_SUGGESTIONS）的契约测试。
 *
 * 2026-09-24 起这份数据从「零消费者」变为真正接线：app/page.tsx 的 togglePractice
 * 按 user.instrument 取池、按 language 取 text / textZh 后显示。
 * 此前页面用的是另一份 25 条中文通用建议，对管乐器 / 音乐会音高用户全是
 * 「弦 / 指板 / 把位」话术 —— 本文件最后一条断言正是钉住这个已修的问题。
 */
import { describe, it, expect } from 'vitest'
import { INSTRUMENT_CONFIG, PRACTICE_SUGGESTIONS, type InstrumentType } from '@/lib/practice-suggestions'

const INSTRUMENTS = Object.keys(INSTRUMENT_CONFIG) as InstrumentType[]
const CATEGORIES = new Set(['technique', 'theory', 'ear_training', 'creativity'])

/** 非指板类乐器：建议里不该出现吉他/贝斯专属术语 */
const NON_FRETBOARD: InstrumentType[] = [
  'b_flat_horn',
  'e_flat_horn',
  'concert_pitch',
  'concert_pitch_minus_one',
]
// ⚠️ 不能用裸「弦」：中文「和弦」也含这个字，但它是和声概念、不是指板概念
//    （如「练习转调后的和弦音识别」），故后顾排除「和」。
const FRETBOARD_JARGON = /fretboard|\bfret\b|\bstrings?\b|指板|把位|(?<!和)弦/i

describe('PRACTICE_SUGGESTIONS', () => {
  it('每种乐器都有非空建议池', () => {
    for (const inst of INSTRUMENTS) {
      const pool = PRACTICE_SUGGESTIONS[inst]
      expect(pool, inst).toBeDefined()
      expect(pool.length, inst).toBeGreaterThan(0)
    }
  })

  it('每条建议的中英文案都非空、中文版含汉字、分类合法', () => {
    for (const inst of INSTRUMENTS) {
      for (const s of PRACTICE_SUGGESTIONS[inst]) {
        expect(s.id, inst).toBeTruthy()
        expect(s.text.trim().length, `${inst}/${s.id} 的 text 为空`).toBeGreaterThan(0)
        expect(s.textZh.trim().length, `${inst}/${s.id} 的 textZh 为空`).toBeGreaterThan(0)
        expect(s.textZh, `${inst}/${s.id} 的 textZh 不像中文: ${s.textZh}`).toMatch(/[\u4e00-\u9fff]/)
        expect(CATEGORIES.has(s.category), `${inst}/${s.id} 分类非法: ${s.category}`).toBe(true)
      }
    }
  })

  it('建议 id 跨乐器全局唯一', () => {
    const seen = new Map<string, InstrumentType>()
    for (const inst of INSTRUMENTS) {
      for (const s of PRACTICE_SUGGESTIONS[inst]) {
        expect(seen.has(s.id), `id=${s.id} 同时出现在 ${seen.get(s.id)} 与 ${inst}`).toBe(false)
        seen.set(s.id, inst)
      }
    }
  })

  it('每种乐器至少覆盖 2 个分类', () => {
    for (const inst of INSTRUMENTS) {
      const cats = new Set(PRACTICE_SUGGESTIONS[inst].map(s => s.category))
      expect(cats.size, `${inst} 只覆盖 ${[...cats].join(' / ')}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('非指板乐器（管乐 / 音乐会音高）的建议不含吉他指板术语', () => {
    for (const inst of NON_FRETBOARD) {
      for (const s of PRACTICE_SUGGESTIONS[inst]) {
        expect(
          FRETBOARD_JARGON.test(s.text),
          `${inst}/${s.id} 的英文建议出现指板术语: ${s.text}`,
        ).toBe(false)
        expect(
          FRETBOARD_JARGON.test(s.textZh),
          `${inst}/${s.id} 的中文建议出现指板术语: ${s.textZh}`,
        ).toBe(false)
      }
    }
  })
})
