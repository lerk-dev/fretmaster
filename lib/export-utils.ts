import { PracticeStats } from './stats-api'

export interface ExportOptions {
  format: 'csv' | 'pdf' | 'json'
  language: 'zh-CN' | 'en'
  dateRange?: {
    start: Date
    end: Date
  }
  exerciseTypes?: string[]
}

const t = (key: string, language: 'zh-CN' | 'en'): string => {
  const translations: Record<string, Record<string, string>> = {
    'zh-CN': {
      'practice_report': 'FretMaster 练习报告',
      'generated_at': '生成时间',
      'total_sessions': '总练习次数',
      'total_duration': '总练习时长',
      'average_score': '平均得分',
      'average_accuracy': '平均准确率',
      'exercise_type': '练习类型',
      'score': '得分',
      'duration': '时长(分钟)',
      'accuracy': '准确率',
      'date': '日期',
      'notes': '备注',
      'minutes': '分钟',
      'seconds': '秒',
      'find_note': '找音练习',
      'chord_progression': '和弦进行',
      'scale': '音阶练习',
      'interval': '音程练习',
      'chord_exercise': '和弦练习',
      'rhythm': '节奏练习',
    },
    'en': {
      'practice_report': 'FretMaster Practice Report',
      'generated_at': 'Generated At',
      'total_sessions': 'Total Sessions',
      'total_duration': 'Total Duration',
      'average_score': 'Average Score',
      'average_accuracy': 'Average Accuracy',
      'exercise_type': 'Exercise Type',
      'score': 'Score',
      'duration': 'Duration(min)',
      'accuracy': 'Accuracy',
      'date': 'Date',
      'notes': 'Notes',
      'minutes': 'min',
      'seconds': 'sec',
      'find_note': 'Find Note',
      'chord_progression': 'Chord Progression',
      'scale': 'Scale Practice',
      'interval': 'Interval Practice',
      'chord_exercise': 'Chord Exercise',
      'rhythm': 'Rhythm Practice',
    },
  }
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
  const headers = [
    t('date', language),
    t('exercise_type', language),
    t('score', language),
    t('duration', language),
    t('accuracy', language),
    t('notes', language),
  ]

  const rows = stats.map(stat => [
    stat.created_at || stat.date || '',
    getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language),
    String(stat.score || 0),
    String(Math.round((stat.duration || 0) / 60)),
    `${stat.accuracy || 0}%`,
    (stat.notes || '').replace(/"/g, '""'),
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}

export function exportToJSON(stats: PracticeStats[], options: ExportOptions): string {
  const { language, dateRange } = options

  const report = {
    title: t('practice_report', language),
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

export function generatePDFContent(stats: PracticeStats[], options: ExportOptions): string {
  const { language } = options
  const totalDuration = stats.reduce((sum, s) => sum + (s.duration || 0), 0)
  const avgScore = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + (s.score || 0), 0) / stats.length)
    : 0
  const avgAccuracy = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + (s.accuracy || 0), 0) / stats.length)
    : 0

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${t('practice_report', language)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1a1a1a;
    }
    h1 {
      color: #2563eb;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 10px;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #f8fafc;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .summary-card .value {
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
    }
    .summary-card .label {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #f9fafb;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    @media print {
      body { padding: 20px; }
      .summary { grid-template-columns: repeat(4, 1fr); }
    }
  </style>
</head>
<body>
  <h1>🎸 ${t('practice_report', language)}</h1>
  <div class="meta">
    ${t('generated_at', language)}: ${new Date().toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'en-US')}
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="value">${stats.length}</div>
      <div class="label">${t('total_sessions', language)}</div>
    </div>
    <div class="summary-card">
      <div class="value">${Math.round(totalDuration / 60)}</div>
      <div class="label">${t('total_duration', language)}(${t('minutes', language)})</div>
    </div>
    <div class="summary-card">
      <div class="value">${avgScore}</div>
      <div class="label">${t('average_score', language)}</div>
    </div>
    <div class="summary-card">
      <div class="value">${avgAccuracy}%</div>
      <div class="label">${t('average_accuracy', language)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${t('date', language)}</th>
        <th>${t('exercise_type', language)}</th>
        <th>${t('score', language)}</th>
        <th>${t('duration', language)}</th>
        <th>${t('accuracy', language)}</th>
      </tr>
    </thead>
    <tbody>
      ${stats.map(stat => `
        <tr>
          <td>${stat.created_at || stat.date || '-'}</td>
          <td>${getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language)}</td>
          <td>${stat.score || 0}</td>
          <td>${Math.round((stat.duration || 0) / 60)} ${t('minutes', language)}</td>
          <td>${stat.accuracy || 0}%</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated by FretMaster · ${new Date().getFullYear()}
  </div>
</body>
</html>
  `

  return html
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
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

export function exportPracticeData(
  stats: PracticeStats[],
  options: ExportOptions
): void {
  const timestamp = new Date().toISOString().split('T')[0]
  let content: string
  let filename: string
  let mimeType: string

  switch (options.format) {
    case 'csv':
      content = exportToCSV(stats, options)
      filename = `fretmaster-practice-${timestamp}.csv`
      mimeType = 'text/csv;charset=utf-8'
      break
    case 'pdf':
      content = generatePDFContent(stats, options)
      filename = `fretmaster-practice-${timestamp}.html`
      mimeType = 'text/html;charset=utf-8'
      break
    case 'json':
      content = exportToJSON(stats, options)
      filename = `fretmaster-practice-${timestamp}.json`
      mimeType = 'application/json;charset=utf-8'
      break
    default:
      throw new Error(`Unsupported format: ${options.format}`)
  }

  downloadFile(content, filename, mimeType)
}

export function printPDFReport(stats: PracticeStats[], options: ExportOptions): void {
  const html = generatePDFContent(stats, options)
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.print()
  }
}
