import { PracticeStats } from './stats-api'
import { jsPDF } from 'jspdf'

const isTauri = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__
}

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
      'export_success': '导出成功',
      'export_cancelled': '导出已取消',
      'export_failed': '导出失败',
      'file_saved_to': '文件已保存到',
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
      'export_success': 'Export Successful',
      'export_cancelled': 'Export Cancelled',
      'export_failed': 'Export Failed',
      'file_saved_to': 'File saved to',
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
    (stat.notes || '').replace(/"/g, '""').replace(/\r?\n/g, ' '),
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

export function generatePDF(stats: PracticeStats[], options: ExportOptions): jsPDF {
  const { language } = options
  const doc = new jsPDF()

  const totalDuration = stats.reduce((sum, s) => sum + (s.duration || 0), 0)
  const avgScore = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + (s.score || 0), 0) / stats.length)
    : 0
  const avgAccuracy = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + (s.accuracy || 0), 0) / stats.length)
    : 0

  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(20)
  doc.setTextColor(37, 99, 235)
  doc.text(t('practice_report', language), pageWidth / 2, 20, { align: 'center' })

  doc.setDrawColor(37, 99, 235)
  doc.setLineWidth(0.5)
  doc.line(14, 24, pageWidth - 14, 24)

  doc.setFontSize(10)
  doc.setTextColor(102, 102, 102)
  doc.text(`${t('generated_at', language)}: ${new Date().toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'en-US')}`, 14, 32)

  const summaryY = 40
  const cardWidth = (pageWidth - 14 * 2 - 12) / 4
  const summaryItems = [
    { value: String(stats.length), label: t('total_sessions', language) },
    { value: String(Math.round(totalDuration / 60)), label: `${t('total_duration', language)}(${t('minutes', language)})` },
    { value: String(avgScore), label: t('average_score', language) },
    { value: `${avgAccuracy}%`, label: t('average_accuracy', language) },
  ]

  summaryItems.forEach((item, i) => {
    const x = 14 + i * (cardWidth + 4)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, summaryY, cardWidth, 24, 2, 2, 'F')
    doc.setFontSize(16)
    doc.setTextColor(37, 99, 235)
    doc.text(item.value, x + cardWidth / 2, summaryY + 10, { align: 'center' })
    doc.setFontSize(8)
    doc.setTextColor(102, 102, 102)
    doc.text(item.label, x + cardWidth / 2, summaryY + 18, { align: 'center' })
  })

  const tableY = summaryY + 34
  const headers = [
    t('date', language),
    t('exercise_type', language),
    t('score', language),
    t('duration', language),
    t('accuracy', language),
  ]
  const colWidths = [36, 40, 28, 36, 36]
  let currentX = 14

  doc.setFillColor(248, 250, 252)
  doc.rect(14, tableY, pageWidth - 28, 10, 'F')
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.rect(14, tableY, pageWidth - 28, 10)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 26, 26)
  currentX = 14
  headers.forEach((header, i) => {
    doc.text(header, currentX + 2, tableY + 7)
    currentX += colWidths[i]
  })

  let rowY = tableY + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  const rowsPerPage = Math.floor((doc.internal.pageSize.getHeight() - rowY - 20) / 8)

  stats.forEach((stat, index) => {
    if (rowY > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage()
      rowY = 20

      doc.setFillColor(248, 250, 252)
      doc.rect(14, rowY - 10, pageWidth - 28, 10, 'F')
      doc.setDrawColor(229, 231, 235)
      doc.rect(14, rowY - 10, pageWidth - 28, 10)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(26, 26, 26)
      currentX = 14
      headers.forEach((header, i) => {
        doc.text(header, currentX + 2, rowY - 3)
        currentX += colWidths[i]
      })
      rowY += 0
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
    }

    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251)
      doc.rect(14, rowY, pageWidth - 28, 8, 'F')
    }
    doc.setDrawColor(229, 231, 235)
    doc.rect(14, rowY, pageWidth - 28, 8)

    doc.setTextColor(26, 26, 26)
    currentX = 14
    const rowData = [
      (stat.created_at || stat.date || '-').substring(0, 10),
      getExerciseTypeName(stat.exercise_type || stat.exerciseType || '', language),
      String(stat.score || 0),
      `${Math.round((stat.duration || 0) / 60)} ${t('minutes', language)}`,
      `${stat.accuracy || 0}%`,
    ]
    rowData.forEach((cell, i) => {
      doc.text(cell, currentX + 2, rowY + 6)
      currentX += colWidths[i]
    })

    rowY += 8
  })

  const footerY = doc.internal.pageSize.getHeight() - 10
  doc.setFontSize(8)
  doc.setTextColor(102, 102, 102)
  doc.text(`Generated by FretMaster · ${new Date().getFullYear()}`, pageWidth / 2, footerY, { align: 'center' })

  return doc
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

function downloadBlobWeb(data: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType })
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

async function saveBinaryFileTauri(data: Uint8Array, defaultFilename: string, filters: { name: string; extensions: string[] }[]): Promise<{ success: boolean; path?: string; error?: string }> {
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
    const doc = generatePDF(stats, options)
    const pdfData = new Uint8Array(doc.output('arraybuffer'))
    const filename = `fretmaster-practice-${timestamp}.pdf`
    const filters = [{ name: 'PDF', extensions: ['pdf'] }, { name: 'All Files', extensions: ['*'] }]

    if (isTauri()) {
      return await saveBinaryFileTauri(pdfData, filename, filters)
    } else {
      downloadBlobWeb(pdfData, filename, 'application/pdf')
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
  const doc = generatePDF(stats, options)
  const pdfBlob = doc.output('blob')
  const url = URL.createObjectURL(pdfBlob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.print()
  }
}
