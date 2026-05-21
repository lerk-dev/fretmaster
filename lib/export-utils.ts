import { PracticeStats } from './stats-api'
import { isTauriEnv } from './utils'

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
    'practice_report': 'FretMaster Practice Report',
    'practice_report_zh': 'FretMaster 练习报告',
    'generated_at': 'Generated',
    'total_sessions': 'Sessions',
    'total_duration': 'Duration(min)',
    'average_score': 'Avg Score',
    'average_accuracy': 'Avg Accuracy',
    'exercise_type': 'Type',
    'score': 'Score',
    'duration': 'Duration',
    'accuracy': 'Accuracy',
    'date': 'Date',
    'notes': 'Notes',
    'minutes': 'min',
    'seconds': 'sec',
    'find_note': 'Find Note',
    'chord_progression': 'Chord Prog.',
    'scale': 'Scale',
    'interval': 'Interval',
    'chord_exercise': 'Chord Exer.',
    'rhythm': 'Rhythm',
    'export_success': '导出成功',
    'export_cancelled': '导出已取消',
    'export_failed': '导出失败',
    'file_saved_to': '文件已保存到',
  },
  'en': {
    'practice_report': 'FretMaster Practice Report',
    'practice_report_zh': '',
    'generated_at': 'Generated',
    'total_sessions': 'Sessions',
    'total_duration': 'Duration(min)',
    'average_score': 'Avg Score',
    'average_accuracy': 'Avg Accuracy',
    'exercise_type': 'Type',
    'score': 'Score',
    'duration': 'Duration',
    'accuracy': 'Accuracy',
    'date': 'Date',
    'notes': 'Notes',
    'minutes': 'min',
    'seconds': 'sec',
    'find_note': 'Find Note',
    'chord_progression': 'Chord Prog.',
    'scale': 'Scale',
    'interval': 'Interval',
    'chord_exercise': 'Chord Exer.',
    'rhythm': 'Rhythm',
    'export_success': 'Export Successful',
    'export_cancelled': 'Export Cancelled',
    'export_failed': 'Export Failed',
    'file_saved_to': 'File saved to',
  },
}

const t = (key: string, language: 'zh-CN' | 'en'): string => {
  return translations[language]?.[key] || key
}

const getExerciseTypeName = (type: string, language: 'zh-CN' | 'en'): string => {
  const typeMap: Record<string, string> = {
    'find_note': t('find_note', language),
    'chord_progression': t('chord_progression', language),
    'scale': t('scale', language),
    'interval': t('interval', language),
    'chord_exercise': t('chord_exercise', language),
    'rhythm': t('rhythm', language),
  }
  return typeMap[type] || type
}

export function exportToCSV(stats: PracticeStats[], options: ExportOptions): string {
  const { language } = options

  const zhTranslations: Record<string, string> = {
    'Date': '日期',
    'Type': '练习类型',
    'Score': '得分',
    'Duration(min)': '时长(分钟)',
    'Accuracy': '准确率',
    'Notes': '备注',
    'Find Note': '找音练习',
    'Chord Prog.': '和弦进行',
    'Scale': '音阶练习',
    'Interval': '音程练习',
    'Chord Exer.': '和弦练习',
    'Rhythm': '节奏练习',
  }

  const headers = language === 'zh-CN'
    ? ['日期', '练习类型', '得分', '时长(分钟)', '准确率', '备注']
    : ['Date', 'Type', 'Score', 'Duration(min)', 'Accuracy', 'Notes']

  const sanitizeCsvCell = (value: string): string => {
    let sanitized = value.replace(/"/g, '""').replace(/\r?\n/g, ' ')
    if (/^[=+\-@\t\r]/.test(sanitized)) {
      sanitized = "'" + sanitized
    }
    return sanitized
  }

  const rows = stats.map(stat => [
    stat.created_at || stat.date || '',
    language === 'zh-CN'
      ? (zhTranslations[getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', 'en')] || getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', 'en'))
      : getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language),
    String(stat.score || 0),
    String(Math.round((stat.duration || 0) / 60)),
    `${stat.accuracy || 0}%`,
    sanitizeCsvCell(stat.notes || ''),
  ])

  const BOM = '\uFEFF'
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}

export function exportToJSON(stats: PracticeStats[], options: ExportOptions): string {
  const { language, dateRange } = options

  const report = {
    title: language === 'zh-CN' ? 'FretMaster 练习报告' : 'FretMaster Practice Report',
    generatedAt: new Date().toISOString(),
    dateRange: dateRange ? {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    } : null,
    summary: {
      totalSessions: stats.length,
      totalDuration: stats.reduce((sum, s) => sum + (s.duration || 0), 0),
      averageScore: stats.length > 0
        ? Math.round(stats.reduce((sum, s) => sum + (s.score || 0), 0) / stats.length)
        : 0,
      averageAccuracy: stats.length > 0
        ? Math.round(stats.reduce((sum, s) => sum + (s.accuracy || 0), 0) / stats.length)
        : 0,
    },
    records: stats.map(stat => ({
      date: stat.created_at || stat.date,
      exerciseType: stat.exercise_type || stat.exerciseType,
      exerciseTypeName: getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language),
      score: stat.score,
      duration: stat.duration,
      accuracy: stat.accuracy,
      notes: stat.notes,
    })),
  }

  return JSON.stringify(report, null, 2)
}

export function exportToHTML(stats: PracticeStats[], options: ExportOptions): string {
  const { language } = options
  const isZh = language === 'zh-CN'

  const totalDuration = stats.reduce((sum, s) => sum + (s.duration || 0), 0)
  const avgScore = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + (s.score || 0), 0) / stats.length)
    : 0
  const avgAccuracy = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + (s.accuracy || 0), 0) / stats.length)
    : 0

  const title = isZh ? 'FretMaster 练习报告' : 'FretMaster Practice Report'
  const generatedAt = isZh ? '生成时间' : 'Generated At'
  const totalSessions = isZh ? '练习次数' : 'Total Sessions'
  const totalDurationLabel = isZh ? '总时长(分钟)' : 'Total Duration(min)'
  const avgScoreLabel = isZh ? '平均得分' : 'Average Score'
  const avgAccuracyLabel = isZh ? '平均准确率' : 'Average Accuracy'
  const dateLabel = isZh ? '日期' : 'Date'
  const typeLabel = isZh ? '练习类型' : 'Type'
  const scoreLabel = isZh ? '得分' : 'Score'
  const durationLabel = isZh ? '时长(秒)' : 'Duration(sec)'
  const accuracyLabel = isZh ? '准确率' : 'Accuracy'

  const rows = stats.map(stat => `
    <tr>
      <td>${(stat.created_at || stat.date || '-').substring(0, 10)}</td>
      <td>${getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language)}</td>
      <td>${stat.score || 0}</td>
      <td>${stat.duration || 0}</td>
      <td>${stat.accuracy || 0}%</td>
    </tr>
  `).join('')

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
      max-width: 900px;
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
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    th {
      background: rgba(59, 130, 246, 0.2);
      color: #e2e8f0;
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
    }
    td {
      padding: 12px 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      font-size: 13px;
    }
    tr:nth-child(even) {
      background: rgba(30, 41, 59, 0.5);
    }
    tr:hover {
      background: rgba(59, 130, 246, 0.1);
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      color: #64748b;
      font-size: 12px;
    }
    @media print {
      body { background: #fff; color: #1a1a2e; }
      .container { box-shadow: none; background: #fff; }
      .summary-card { background: #f1f5f9; border-color: #cbd5e1; }
      .summary-value { color: #2563eb; }
      th { background: #e2e8f0; color: #1a1a2e; }
      td { border-color: #e2e8f0; }
      tr:nth-child(even) { background: #f8fafc; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p class="subtitle">${generatedAt}: ${new Date().toLocaleString(language)}</p>
    
    <div class="summary">
      <div class="summary-card">
        <div class="summary-value">${stats.length}</div>
        <div class="summary-label">${totalSessions}</div>
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
    
    <table>
      <thead>
        <tr>
          <th>${dateLabel}</th>
          <th>${typeLabel}</th>
          <th>${scoreLabel}</th>
          <th>${durationLabel}</th>
          <th>${accuracyLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    
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
