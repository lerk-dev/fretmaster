import { PracticeStats } from './stats-api'
import { isTauriEnv, parseDbTimestamp, dbTimestampToLocalDate, normalizeAccuracy } from './utils'

const isTauri = (): boolean => {
  return isTauriEnv()
}

export interface ExportOptions {
  format: 'csv' | 'pdf' | 'json' | 'html'
  language: 'zh-CN' | 'en'
  dateRange?: {
    start: Date
    end: Date
  }
  exerciseTypes?: string[]
}

const translations: Record<string, Record<string, string>> = {
  'zh-CN': {
    'practice_report': 'FretMaster 练习报告',
    'generated_at': '生成时间',
    'total_sessions': '练习次数',
    'total_duration': '总时长(分钟)',
    'average_score': '平均得分',
    'average_accuracy': '平均准确率',
    'exercise_type': '练习类型',
    'score': '得分',
    'duration': '时长',
    'duration_sec': '时长(秒)',
    'duration_min': '时长(分钟)',
    'accuracy': '准确率',
    'date': '日期',
    'time': '时间',
    'notes': '备注',
    'minutes': '分钟',
    'seconds': '秒',
    'detail': '练习项目',
    'daily_summary': '每日汇总',
    'records': '详细记录',
    'no_data': '暂无练习记录',
    'export_success': '导出成功',
    'export_cancelled': '导出已取消',
    'export_failed': '导出失败',
    'file_saved_to': '文件已保存到',
    // 练习类型中文名 → 显示名（中文环境下原样显示）
    'type_pitch_finding': '找音练习',
    'type_scale': '音阶练习',
    'type_chord_exercise': '和弦练习',
    'type_interval': '音程练习',
    'type_chord_progression': '和弦进行',
  },
  'en': {
    'practice_report': 'FretMaster Practice Report',
    'generated_at': 'Generated',
    'total_sessions': 'Sessions',
    'total_duration': 'Duration(min)',
    'average_score': 'Avg Score',
    'average_accuracy': 'Avg Accuracy',
    'exercise_type': 'Type',
    'score': 'Score',
    'duration': 'Duration',
    'duration_sec': 'Duration(sec)',
    'duration_min': 'Duration(min)',
    'accuracy': 'Accuracy',
    'date': 'Date',
    'time': 'Time',
    'notes': 'Notes',
    'minutes': 'min',
    'seconds': 'sec',
    'detail': 'Detail',
    'daily_summary': 'Daily Summary',
    'records': 'Records',
    'no_data': 'No practice records',
    'export_success': 'Export Successful',
    'export_cancelled': 'Export Cancelled',
    'export_failed': 'Export Failed',
    'file_saved_to': 'File saved to',
    'type_pitch_finding': 'Note Practice',
    'type_scale': 'Scale Practice',
    'type_chord_exercise': 'Chord Practice',
    'type_interval': 'Interval Practice',
    'type_chord_progression': 'Chord Progression',
  },
}

const t = (key: string, language: 'zh-CN' | 'en'): string => {
  return translations[language]?.[key] || key
}

// 练习类型映射：统一识别存储的各种格式
// 数据库中可能存储的值：
//  - 中文: '音高识别', '音阶练习', '和弦练习', '音程练习', '和弦进行'
//  - 英文 key: 'pitch_finding', 'find_note', 'scale', 'chord_exercise', 'interval', 'chord_progression'
const EXERCISE_TYPE_MAP: Record<string, string> = {
  // 中文 → 内部 key
  '音高识别': 'pitch_finding',
  '找音练习': 'pitch_finding',
  '音阶练习': 'scale',
  '和弦练习': 'chord_exercise',
  '音程练习': 'interval',
  '和弦进行': 'chord_progression',
  '和弦转换': 'chord_progression',
  // 英文 key → 内部 key
  'pitch_finding': 'pitch_finding',
  'find_note': 'pitch_finding',
  'scale': 'scale',
  'chord_exercise': 'chord_exercise',
  'interval': 'interval',
  'chord_progression': 'chord_progression',
  'rhythm': 'rhythm',
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  'pitch_finding': 'type_pitch_finding',
  'scale': 'type_scale',
  'chord_exercise': 'type_chord_exercise',
  'interval': 'type_interval',
  'chord_progression': 'type_chord_progression',
  'rhythm': 'type_pitch_finding', // fallback
}

/**
 * 获取练习类型的本地化显示名
 */
const getExerciseTypeName = (type: string, language: 'zh-CN' | 'en'): string => {
  const normalized = (type || '').trim()
  if (!normalized) return t('exercise_type', language)
  const internalKey = EXERCISE_TYPE_MAP[normalized]
  if (internalKey && TYPE_LABEL_KEYS[internalKey]) {
    return t(TYPE_LABEL_KEYS[internalKey], language)
  }
  // 未知类型原样返回
  return normalized
}

/**
 * 获取练习类型的内部 key（用于过滤）
 */
const getExerciseTypeKey = (type: string): string => {
  const normalized = (type || '').trim()
  return EXERCISE_TYPE_MAP[normalized] || normalized || 'unknown'
}

/**
 * 从 notes 字段提取练习项目名称
 */
const getDetailName = (stat: PracticeStats): string => {
  const notes = stat.notes || ''
  // 兼容旧格式 "练习项目: xxx"
  const match = notes.match(/练习项目[:：]\s*(.+)/)
  if (match) return match[1].trim()
  return notes.trim() || '-'
}

/**
 * 规范化并去重统计数据。
 * 1. 按 id 去重（如果有 id）
 * 2. 按 (时间戳+类型+详情) 去重（防止重复保存）
 * 3. 按时间倒序排序
 * 4. 应用日期范围和类型过滤
 */
function normalizeAndDeduplicate(
  stats: PracticeStats[],
  options: ExportOptions
): PracticeStats[] {
  // 应用类型过滤
  let filtered = stats
  if (options.exerciseTypes && options.exerciseTypes.length > 0) {
    filtered = stats.filter(s => {
      const key = getExerciseTypeKey(s.exercise_type || s.exerciseType || '')
      return options.exerciseTypes!.includes(key)
    })
  }

  // 应用日期范围过滤
  if (options.dateRange) {
    const startMs = options.dateRange.start.getTime()
    const endMs = options.dateRange.end.getTime()
    filtered = filtered.filter(s => {
      const d = parseDbTimestamp(s.created_at || s.date)
      const t = d.getTime()
      return t >= startMs && t <= endMs
    })
  }

  // 去重：按 id 或 (时间戳+类型+详情)
  const seen = new Set<string>()
  const deduped: PracticeStats[] = []
  for (const stat of filtered) {
    const ts = parseDbTimestamp(stat.created_at || stat.date).getTime()
    const type = stat.exercise_type || stat.exerciseType || ''
    const detail = getDetailName(stat)
    const key = stat.id != null
      ? `id:${stat.id}`
      : `t:${ts}|type:${type}|detail:${detail}`
    if (seen.has(key)) continue
    // 防止同一秒内同类型同详情的重复记录（无 id 情况）
    const fuzzyKey = `t:${ts}|type:${type}|detail:${detail}`
    if (!stat.id && seen.has(fuzzyKey)) continue
    seen.add(key)
    seen.add(fuzzyKey)
    deduped.push(stat)
  }

  // 按时间倒序排序（最新的在前）
  deduped.sort((a, b) => {
    const ta = parseDbTimestamp(a.created_at || a.date).getTime()
    const tb = parseDbTimestamp(b.created_at || b.date).getTime()
    return tb - ta
  })

  return deduped
}

/**
 * 按日汇总统计
 */
interface DailyAgg {
  date: string
  count: number
  totalDuration: number
  totalScore: number
  byType: Record<string, number>
}

function aggregateByDay(stats: PracticeStats[]): DailyAgg[] {
  const map: Record<string, DailyAgg> = {}
  for (const s of stats) {
    const date = dbTimestampToLocalDate(s.created_at || s.date)
    if (!map[date]) {
      map[date] = { date, count: 0, totalDuration: 0, totalScore: 0, byType: {} }
    }
    const agg = map[date]
    agg.count += 1
    agg.totalDuration += s.duration || 0
    agg.totalScore += s.score || 0
    const typeKey = getExerciseTypeKey(s.exercise_type || s.exerciseType || '')
    agg.byType[typeKey] = (agg.byType[typeKey] || 0) + 1
  }
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
}

export function exportToCSV(stats: PracticeStats[], options: ExportOptions): string {
  const { language } = options
  const isZh = language === 'zh-CN'

  const clean = normalizeAndDeduplicate(stats, options)

  const headers = isZh
    ? ['日期', '时间', '练习类型', '练习项目', '得分', '时长(秒)', '准确率(%)', '备注']
    : ['Date', 'Time', 'Type', 'Detail', 'Score', 'Duration(sec)', 'Accuracy(%)', 'Notes']

  const sanitizeCsvCell = (value: string): string => {
    let sanitized = value.replace(/"/g, '""').replace(/\r?\n/g, ' ')
    if (/^[=+\-@\t\r]/.test(sanitized)) {
      sanitized = "'" + sanitized
    }
    return sanitized
  }

  const rows = clean.map(stat => {
    const dt = parseDbTimestamp(stat.created_at || stat.date)
    const dateStr = isNaN(dt.getTime()) ? '-' : dbTimestampToLocalDate(stat.created_at || stat.date)
    const timeStr = isNaN(dt.getTime()) ? '-' : dt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return [
      dateStr,
      timeStr,
      getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language),
      getDetailName(stat),
      String(stat.score || 0),
      String(stat.duration || 0),
      String(Math.round(normalizeAccuracy(stat.accuracy))),
      sanitizeCsvCell(stat.notes || ''),
    ]
  })

  const BOM = '\uFEFF'
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}

export function exportToJSON(stats: PracticeStats[], options: ExportOptions): string {
  const { language, dateRange } = options
  const clean = normalizeAndDeduplicate(stats, options)

  const totalDuration = clean.reduce((sum, s) => sum + (s.duration || 0), 0)
  const avgScore = clean.length > 0
    ? Math.round(clean.reduce((sum, s) => sum + (s.score || 0), 0) / clean.length)
    : 0
  const avgAccuracy = clean.length > 0
    ? Math.round(clean.reduce((sum, s) => sum + normalizeAccuracy(s.accuracy), 0) / clean.length)
    : 0

  const dailyAgg = aggregateByDay(clean)

  const report = {
    title: language === 'zh-CN' ? 'FretMaster 练习报告' : 'FretMaster Practice Report',
    generatedAt: new Date().toISOString(),
    dateRange: dateRange ? {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    } : null,
    summary: {
      totalSessions: clean.length,
      totalDuration,
      averageScore: avgScore,
      averageAccuracy: avgAccuracy,
    },
    dailySummary: dailyAgg.map(d => ({
      date: d.date,
      count: d.count,
      totalDuration: d.totalDuration,
      averageScore: d.count > 0 ? Math.round(d.totalScore / d.count) : 0,
      byType: d.byType,
    })),
    records: clean.map(stat => ({
      date: dbTimestampToLocalDate(stat.created_at || stat.date),
      timestamp: parseDbTimestamp(stat.created_at || stat.date).toISOString(),
      exerciseType: getExerciseTypeKey(stat.exercise_type || stat.exerciseType || ''),
      exerciseTypeName: getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language),
      detail: getDetailName(stat),
      score: stat.score,
      duration: stat.duration,
      accuracy: Math.round(normalizeAccuracy(stat.accuracy)),
      notes: stat.notes,
    })),
  }

  return JSON.stringify(report, null, 2)
}

export function exportToHTML(stats: PracticeStats[], options: ExportOptions): string {
  const { language } = options
  const isZh = language === 'zh-CN'

  const clean = normalizeAndDeduplicate(stats, options)

  const totalDuration = clean.reduce((sum, s) => sum + (s.duration || 0), 0)
  const avgScore = clean.length > 0
    ? Math.round(clean.reduce((sum, s) => sum + (s.score || 0), 0) / clean.length)
    : 0
  const avgAccuracy = clean.length > 0
    ? Math.round(clean.reduce((sum, s) => sum + normalizeAccuracy(s.accuracy), 0) / clean.length)
    : 0

  const title = t('practice_report', language)
  const generatedAtLabel = t('generated_at', language)
  const totalSessionsLabel = t('total_sessions', language)
  const totalDurationLabel = t('total_duration', language)
  const avgScoreLabel = t('average_score', language)
  const avgAccuracyLabel = t('average_accuracy', language)
  const dateLabel = t('date', language)
  const timeLabel = t('time', language)
  const typeLabel = t('exercise_type', language)
  const detailLabel = t('detail', language)
  const scoreLabel = t('score', language)
  const durationLabel = t('duration_sec', language)
  const accuracyLabel = t('accuracy', language)
  const notesLabel = t('notes', language)
  const dailySummaryLabel = t('daily_summary', language)
  const recordsLabel = t('records', language)

  // 每日汇总行
  const dailyAgg = aggregateByDay(clean)
  const dailyRows = dailyAgg.map(d => {
    const typeBreakdown = Object.entries(d.byType)
      .map(([k, v]) => `${getExerciseTypeName(k, language)}: ${v}`)
      .join('、')
    return `
      <tr>
        <td>${d.date}</td>
        <td>${d.count}</td>
        <td>${Math.round(d.totalDuration / 60)} ${t('minutes', language)} (${d.totalDuration} ${t('seconds', language)})</td>
        <td>${d.count > 0 ? Math.round(d.totalScore / d.count) : 0}</td>
        <td>${typeBreakdown || '-'}</td>
      </tr>
    `
  }).join('')

  // 详细记录行
  const rows = clean.map(stat => {
    const dt = parseDbTimestamp(stat.created_at || stat.date)
    const dateStr = isNaN(dt.getTime()) ? '-' : dbTimestampToLocalDate(stat.created_at || stat.date)
    const timeStr = isNaN(dt.getTime()) ? '-' : dt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const accuracy = Math.round(normalizeAccuracy(stat.accuracy))
    const detail = getDetailName(stat)
    const escapedNotes = (stat.notes || '').replace(/[<>&"']/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    }[c] || c))
    return `
    <tr>
      <td>${dateStr}</td>
      <td>${timeStr}</td>
      <td>${getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language)}</td>
      <td>${detail}</td>
      <td>${stat.score || 0}</td>
      <td>${stat.duration || 0}</td>
      <td>${accuracy}%</td>
      <td>${escapedNotes || '-'}</td>
    </tr>
  `
  }).join('')

  const noDataHtml = clean.length === 0
    ? `<div class="no-data">${t('no_data', language)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      padding: 40px 20px;
      color: #e2e8f0;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      background: rgba(30, 41, 59, 0.8);
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    h1 {
      text-align: center;
      color: #60a5fa;
      margin-bottom: 8px;
      font-size: 28px;
    }
    .subtitle {
      text-align: center;
      color: #94a3b8;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .summary-card {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    .summary-value {
      font-size: 28px;
      font-weight: bold;
      color: #60a5fa;
    }
    .summary-label {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .section-title {
      color: #60a5fa;
      font-size: 18px;
      margin: 24px 0 12px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(59, 130, 246, 0.3);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      margin-bottom: 16px;
    }
    th {
      background: rgba(59, 130, 246, 0.2);
      color: #e2e8f0;
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
    }
    td {
      padding: 10px 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      font-size: 13px;
      vertical-align: top;
    }
    tr:nth-child(even) {
      background: rgba(30, 41, 59, 0.5);
    }
    tr:hover {
      background: rgba(59, 130, 246, 0.1);
    }
    .no-data {
      text-align: center;
      padding: 48px;
      color: #94a3b8;
      font-size: 16px;
    }
    .notes-cell {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #94a3b8;
      font-size: 12px;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      color: #64748b;
      font-size: 12px;
    }
    .record-count {
      color: #94a3b8;
      font-size: 12px;
      margin-bottom: 8px;
    }
    @media print {
      body { background: #fff; color: #1a1a2e; }
      .container { box-shadow: none; background: #fff; }
      .summary-card { background: #f1f5f9; border-color: #cbd5e1; }
      .summary-value { color: #2563eb; }
      .section-title { color: #1e40af; border-color: #cbd5e1; }
      th { background: #e2e8f0; color: #1a1a2e; }
      td { border-color: #e2e8f0; }
      tr:nth-child(even) { background: #f8fafc; }
      .notes-cell { color: #475569; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p class="subtitle">${generatedAtLabel}: ${new Date().toLocaleString(language)}</p>

    <div class="summary">
      <div class="summary-card">
        <div class="summary-value">${clean.length}</div>
        <div class="summary-label">${totalSessionsLabel}</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${Math.round(totalDuration / 60)}</div>
        <div class="summary-label">${totalDurationLabel}</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${avgScore}</div>
        <div class="summary-label">${avgScoreLabel}</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${avgAccuracy}%</div>
        <div class="summary-label">${avgAccuracyLabel}</div>
      </div>
    </div>

    ${noDataHtml}

    ${dailyAgg.length > 0 ? `
    <h2 class="section-title">${dailySummaryLabel}</h2>
    <p class="record-count">${dailyAgg.length} ${isZh ? '天' : 'days'}</p>
    <table>
      <thead>
        <tr>
          <th>${dateLabel}</th>
          <th>${totalSessionsLabel}</th>
          <th>${totalDurationLabel}</th>
          <th>${avgScoreLabel}</th>
          <th>${typeLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${dailyRows}
      </tbody>
    </table>
    ` : ''}

    ${clean.length > 0 ? `
    <h2 class="section-title">${recordsLabel}</h2>
    <p class="record-count">${clean.length} ${isZh ? '条记录（已去重）' : 'records (deduplicated)'}</p>
    <table>
      <thead>
        <tr>
          <th>${dateLabel}</th>
          <th>${timeLabel}</th>
          <th>${typeLabel}</th>
          <th>${detailLabel}</th>
          <th>${scoreLabel}</th>
          <th>${durationLabel}</th>
          <th>${accuracyLabel}</th>
          <th>${notesLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ` : ''}

    <p class="footer">Generated by FretMaster · ${new Date().getFullYear()}</p>
  </div>
</body>
</html>`
}

function downloadFileWeb(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function saveFileTauri(content: string, defaultFilename: string, filters: { name: string; extensions: string[] }[]): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')

    const filePath = await save({
      defaultPath: defaultFilename,
      filters: filters,
    })

    if (!filePath) {
      return { success: false, error: 'cancelled' }
    }

    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    await writeFile(filePath, data)

    return { success: true, path: filePath }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function exportPracticeData(
  stats: PracticeStats[],
  options: ExportOptions
): Promise<{ success: boolean; path?: string; error?: string }> {
  const timestamp = new Date().toISOString().split('T')[0]

  if (options.format === 'pdf') {
    const htmlContent = exportToHTML(stats, options)
    const filename = `fretmaster-practice-${timestamp}.html`
    const filters = [{ name: 'HTML', extensions: ['html'] }, { name: 'All Files', extensions: ['*'] }]

    if (isTauri()) {
      const result = await saveFileTauri(htmlContent, filename, filters)
      if (result.success && result.path) {
        return { success: true, path: result.path }
      }
      return result
    } else {
      downloadFileWeb(htmlContent, filename, 'text/html;charset=utf-8')
      return { success: true, path: filename }
    }
  }

  let content: string
  let filename: string
  let mimeType: string
  let filters: { name: string; extensions: string[] }[]

  switch (options.format) {
    case 'csv':
      content = exportToCSV(stats, options)
      filename = `fretmaster-practice-${timestamp}.csv`
      mimeType = 'text/csv;charset=utf-8'
      filters = [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }]
      break
    case 'json':
      content = exportToJSON(stats, options)
      filename = `fretmaster-practice-${timestamp}.json`
      mimeType = 'application/json;charset=utf-8'
      filters = [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
      break
    case 'html':
      content = exportToHTML(stats, options)
      filename = `fretmaster-practice-${timestamp}.html`
      mimeType = 'text/html;charset=utf-8'
      filters = [{ name: 'HTML', extensions: ['html'] }, { name: 'All Files', extensions: ['*'] }]
      break
    default:
      throw new Error(`Unsupported format: ${options.format}`)
  }

  if (isTauri()) {
    return await saveFileTauri(content, filename, filters)
  } else {
    downloadFileWeb(content, filename, mimeType)
    return { success: true, path: filename }
  }
}

export function printPDFReport(stats: PracticeStats[], options: ExportOptions): void {
  const htmlContent = exportToHTML(stats, options)
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print()
    }
  }
}
