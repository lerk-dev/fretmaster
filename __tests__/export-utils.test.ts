/**
 * 导出工具（lib/export-utils.ts）的转义与结构契约测试。
 *
 * 重点：CSV 与 HTML 两条路径都必须对**所有数据列**转义。
 * 2026-09-24 修的问题：CSV 的 sanitizeCsvCell 与 HTML 的 escapedNotes 当时只作用于
 * notes 列，其余列（练习项目名、类型名）是未转义插值 —— CSV 会被引号破坏、被表格软件
 * 当公式执行；HTML 则是注入面（打开报告即执行）。
 */
import { describe, it, expect } from 'vitest'
import { exportToCSV, exportToHTML, exportToJSON } from '@/lib/export-utils'
import type { PracticeStats } from '@/lib/stats-api'

function stat(partial: Partial<PracticeStats> = {}): PracticeStats {
  return {
    exercise_type: '音阶练习',
    score: 90,
    duration: 60,
    accuracy: 0.8,
    created_at: '2026-01-02 03:04:05',
    notes: '',
    ...partial,
  }
}

const ZH = { format: 'csv' as const, language: 'zh-CN' as const }

describe('exportToCSV 的转义', () => {
  it('notes 里的引号被双写、换行被替换为空格', () => {
    const csv = exportToCSV([stat({ notes: 'Say "Hi"\nnext' })], ZH)
    expect(csv).toContain('"Say ""Hi"" next"')
  })

  it('公式前缀（= + - @）会加单引号，防表格软件执行', () => {
    const csv = exportToCSV([stat({ notes: '=1+1' }), stat({ notes: '@cmd', created_at: '2026-01-02 03:04:06' })], ZH)
    expect(csv).toContain(`"'=1+1"`)
    expect(csv).toContain(`"'@cmd"`)
  })

  it('从 notes 提取的「练习项目」列也走转义 —— 此前只有 notes 列做了转义', () => {
    const csv = exportToCSV([stat({ notes: '练习项目: Say "Hi"' })], ZH)
    expect(csv).toContain('Say ""Hi""')
  })

  it('未知练习类型（原样透传）也会被转义', () => {
    const csv = exportToCSV([stat({ exercise_type: 'a"b' })], ZH)
    expect(csv).toContain('a""b')
  })

  it('带 UTF-8 BOM，表头与每格都被引号包裹，列数固定为 8', () => {
    const csv = exportToCSV([stat({ notes: 'n1' })], ZH)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.replace('\uFEFF', '').split('\n')
    expect(lines).toHaveLength(2) // 表头 + 1 行
    expect(lines[0].split(',')).toHaveLength(8)
    // 表头是固定字面量（不含逗号 / 引号），因此不加引号包裹 —— 与数据行不同
    expect(lines[0]).toContain('日期')
    expect(lines[0]).toContain('备注')
    expect(lines[1].split(',').length).toBeGreaterThanOrEqual(8)
  })

  it('英文环境用英文表头', () => {
    const csv = exportToCSV([stat()], { format: 'csv', language: 'en' })
    expect(csv).toContain('Date,Time,Type,Detail,Score')
    expect(csv).toContain('Notes')
  })

  it('导出前会去重（同一秒同类型同详情只留一条）', () => {
    const csv = exportToCSV([stat({ notes: '练习项目: X' }), stat({ notes: '练习项目: X' })], ZH)
    expect(csv.replace('\uFEFF', '').split('\n')).toHaveLength(2)
  })

  it('按日期范围过滤（用备注标记，避开时区差异）', () => {
    const data = [
      stat({ created_at: '2026-03-15 12:00:00', notes: 'IN' }),
      stat({ created_at: '2025-01-15 12:00:00', notes: 'OUT' }),
    ]
    const csv = exportToCSV(data, {
      ...ZH,
      dateRange: { start: new Date('2026-02-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') },
    })
    expect(csv).toContain('IN')
    expect(csv).not.toContain('OUT')
  })

  it('按练习类型过滤（内部 key 匹配中文存储值）', () => {
    const data = [
      stat({ exercise_type: '音阶练习', notes: 'S' }),
      stat({ exercise_type: '找音练习', notes: 'P' }),
    ]
    const csv = exportToCSV(data, { ...ZH, exerciseTypes: ['scale'] })
    expect(csv).toContain('S')
    expect(csv).not.toContain('P')
  })
})

describe('exportToHTML 的转义', () => {
  it('notes 里的标签被转义', () => {
    const html = exportToHTML([stat({ notes: '<script>alert(1)</script>' })], ZH)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert(1)')
  })

  it('「练习项目」列同样被转义 —— 此前只有 notes 被转', () => {
    const html = exportToHTML([stat({ notes: '练习项目: <img src=x onerror=alert(1)>' })], ZH)
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })

  it('未知练习类型列同样被转义', () => {
    const html = exportToHTML([stat({ exercise_type: '<b>x</b>' })], ZH)
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>x</b>')
  })

  it('引号与 & 也被转义', () => {
    const html = exportToHTML([stat({ notes: '"q" & <a>' })], ZH)
    expect(html).toContain('&quot;q&quot; &amp; &lt;a&gt;')
  })
})

describe('exportToJSON', () => {
  it('产出可解析的结构', () => {
    const json = exportToJSON([stat({ notes: 'x' })], { format: 'json', language: 'zh-CN' })
    const parsed = JSON.parse(json)
    expect(parsed.summary.totalSessions).toBe(1)
    expect(parsed.summary.totalDuration).toBe(60)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].exerciseType).toBe('scale')
  })

  it('时间戳为空 / 非法时不抛异常（parseDbTimestamp 会兜底）', () => {
    expect(() => exportToJSON([stat({ created_at: '', date: '' })], { format: 'json', language: 'zh-CN' })).not.toThrow()
    expect(() => exportToJSON([stat({ created_at: '不是时间', date: '也不是' })], { format: 'json', language: 'zh-CN' })).not.toThrow()
  })

  it('中文与英文报告的标题不同', () => {
    const zh = JSON.parse(exportToJSON([stat()], { format: 'json', language: 'zh-CN' }))
    const en = JSON.parse(exportToJSON([stat()], { format: 'json', language: 'en' }))
    expect(zh.title).toContain('练习报告')
    expect(en.title).toContain('Practice Report')
  })
})
