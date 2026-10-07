/**
 * lib/export-utils.ts 的**文件落盘链路**契约测试（导出 CSV/JSON/HTML/PDF 时会跑的
 * `downloadFileWeb` / `saveFileTauri` / `exportPracticeData` / `exportToPDF`）。
 *
 * 同目录的 export-utils.test.ts 只覆盖了纯字符串生成（CSV/HTML 转义、JSON 结构），
 * 那正是本文件覆盖率长期停在 56% 的原因 —— 而真正「用户点了按钮没反应」的失败面
 * 全在这条链路上，且**几乎全是静默的**：
 *
 *   ① Web 下载：Blob / `<a download>` / revokeObjectURL 任一环节写错 → 点了不下载、无报错。
 *   ② Tauri 保存：`plugin-dialog.save` 的参数形状（defaultPath/filters）、用户取消必须
 *      返回 `cancelled`（UI 靠它区分「取消」与「失败」）、内容必须是 Uint8Array。
 *   ③ PDF：iframe 渲染 → 等字体 → html2canvas 截图 → jsPDF 按 A4 分页 → 保存，
 *      **finally 必须摘掉 iframe**（否则每导出一次泄漏一个 794px 的离屏 iframe）。
 *
 * 本文件落地时抓出两个真 bug（见 lib/export-utils.ts 内注释）：
 *   - 等字体那一步只写了 `.then(() => resolve())`：`fonts.ready` **reject 或永不 settle**
 *     时 Promise 永不落定 → PDF 导出**永久挂起**（转圈、无 toast、无日志），reject 还会
 *     额外抛 unhandled rejection。实测改前 1.2s 仍未 settle，改后一律 resolve 并加 1s 上限。
 *   - CSV 单元格里裸 `\r` 未被替换成空格（正则只写 `\r?\n`）→ 行被截断、后续列错位。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => {
  type PdfInstance = {
    opts: unknown
    addImage: ReturnType<typeof vi.fn>
    addPage: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
    output: ReturnType<typeof vi.fn>
  }
  const pdfInstances: PdfInstance[] = []
  class FakeJsPDF {
    addImage = vi.fn()
    addPage = vi.fn()
    save = vi.fn()
    /** jsPDF 的 output('arraybuffer') 返回 ArrayBuffer（类型定义 types/index.d.ts:838 如此）。 */
    output = vi.fn(() => new ArrayBuffer(8))
    constructor(opts: unknown) {
      pdfInstances.push({ opts, addImage: this.addImage, addPage: this.addPage, save: this.save, output: this.output })
    }
  }
  return {
    pdfInstances,
    FakeJsPDF,
    save: vi.fn(),
    writeFile: vi.fn(),
    html2canvas: vi.fn(),
  }
})

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }))
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mocks.writeFile }))
vi.mock('html2canvas', () => ({ default: mocks.html2canvas }))
vi.mock('jspdf', () => ({ jsPDF: mocks.FakeJsPDF }))

import * as ex from '@/lib/export-utils'
import type { PracticeStats } from '@/lib/stats-api'

const winLike = window as unknown as { __TAURI__?: boolean }

/** 必须在任何 spy 之前抓原始实现（否则 bind 到的是 spy 自身 → 无限递归）。 */
const origCreateElement = document.createElement.bind(document)

const TODAY = new Date().toISOString().split('T')[0]

/**
 * jsdom 与 Node 是两个 realm：`TextEncoder`（Node 全局）产出的 Uint8Array 与测试文件里
 * 的 `Uint8Array` 构造器不同，`toBeInstanceOf` 会失败。用结构判定。
 */
function isUint8Array(v: unknown): boolean {
  return ArrayBuffer.isView(v) && (v as object).constructor.name === 'Uint8Array'
}

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

/** 假 iframe 文档：只想拿到 write 内容、fonts.ready 与 body.scrollHeight。 */
const fakeDoc = {
  open: vi.fn(),
  write: vi.fn(),
  close: vi.fn(),
  fonts: { ready: Promise.resolve() } as { ready: Promise<unknown> } | undefined,
  body: { scrollHeight: 4200 },
}

let capturedIframe: HTMLIFrameElement | null = null
let written: HTMLAnchorElement[] = []

/** 把 `document.createElement('iframe')` 的 contentDocument 换成假文档，同时抓 iframe 本体。 */
function stubCreateElement(): void {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
    const el = origCreateElement(tag, opts)
    if (tag === 'iframe') {
      Object.defineProperty(el, 'contentDocument', { get: () => fakeDoc, configurable: true })
      capturedIframe = el as HTMLIFrameElement
    }
    if (tag === 'a') written.push(el as HTMLAnchorElement)
    return el
  })
}

beforeEach(() => {
  capturedIframe = null
  written = []
  fakeDoc.open.mockReset()
  fakeDoc.write.mockReset()
  fakeDoc.close.mockReset()
  fakeDoc.fonts = { ready: Promise.resolve() }
  fakeDoc.body = { scrollHeight: 4200 }

  mocks.save.mockReset().mockResolvedValue('/home/u/report.csv')
  mocks.writeFile.mockReset().mockResolvedValue(undefined)
  mocks.html2canvas.mockReset().mockResolvedValue({
    width: 794,
    height: 2000,
    toDataURL: () => 'data:image/jpeg;base64,AAAA',
  })
  mocks.pdfInstances.length = 0

  stubCreateElement()
  // jsdom 真的会走一遍导航逻辑并打印 "Not implemented: navigation"，这里整体替换掉：
  // 既消掉噪音，又能断言「确实触发了 a.click()」。
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  delete winLike.__TAURI__
})

afterEach(() => {
  try { vi.restoreAllMocks() } catch { /* 逐条兜底，避免失败用例污染下一条 */ }
  delete winLike.__TAURI__
  document.body.innerHTML = ''
})

// ───────────────────────────── Web 下载 ─────────────────────────────

describe('downloadFileWeb：Web 环境的 Blob + <a download> 下载', () => {
  it('createObjectURL 收到 Blob（含正确 mimeType），a.download 带扩展名，click 后立即 revoke', async () => {
    const blobs: Blob[] = []
    const created: string[] = []
    const revoked: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      const b = obj as Blob
      blobs.push(b)
      const u = `blob:test/${created.length}`
      created.push(u)
      return u
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => { revoked.push(u) })

    const r = await ex.exportPracticeData([stat()], { format: 'csv', language: 'zh-CN' })

    expect(r).toEqual({ success: true, path: `fretmaster-practice-${TODAY}.csv` })
    expect(created).toEqual(['blob:test/0'])
    expect(revoked).toEqual(['blob:test/0'])
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('text/csv;charset=utf-8')
    expect(blobs[0].size).toBeGreaterThan(0)

    expect(written).toHaveLength(1)
    const a = written[0]
    expect(a.download).toBe(`fretmaster-practice-${TODAY}.csv`)
    expect(a.href).toContain('blob:test/0')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    // 临时 <a> 必须摘掉，不能留在 DOM 里
    expect(a.parentNode).toBeNull()
  })

  it('csv / json / html 三种格式各自带对的文件名与 mimeType', async () => {
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      blobs.push(obj as Blob)
      return 'blob:x'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    for (const [format, ext, mime] of [
      ['csv', 'csv', 'text/csv;charset=utf-8'],
      ['json', 'json', 'application/json;charset=utf-8'],
      ['html', 'html', 'text/html;charset=utf-8'],
    ] as const) {
      const r = await ex.exportPracticeData([stat()], { format, language: 'en' })
      expect(r.success).toBe(true)
      expect(r.path).toBe(`fretmaster-practice-${TODAY}.${ext}`)
      expect(blobs[blobs.length - 1].type).toBe(mime)
    }
  })
})

// ───────────────────────────── Tauri 保存 ─────────────────────────────

describe('saveFileTauri：Tauri 环境的系统保存对话框', () => {
  beforeEach(() => { winLike.__TAURI__ = true })

  it('save 拿到 defaultPath + filters；writeFile 拿到路径与 Uint8Array 内容', async () => {
    const r = await ex.exportPracticeData([stat()], { format: 'json', language: 'en' })

    expect(r).toEqual({ success: true, path: '/home/u/report.csv' })
    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: `fretmaster-practice-${TODAY}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }],
    })
    const [path, data] = mocks.writeFile.mock.calls[0]
    expect(path).toBe('/home/u/report.csv')
    expect(isUint8Array(data), `writeFile 收到的不是 Uint8Array：${String(data)}`).toBe(true)
    // 写进去的必须是导出的真实内容（TS 侧编码成 UTF-8 字节）；generatedAt 是实时时间戳，
    // 所以逐字段比对而不是整串比对。
    const decoded = new TextDecoder().decode(data)
    const writtenReport = JSON.parse(decoded)
    const expected = JSON.parse(ex.exportToJSON([stat()], { format: 'json', language: 'en' }))
    expect(writtenReport.title).toBe(expected.title)
    expect(writtenReport.summary).toEqual(expected.summary)
    expect(writtenReport.records).toEqual(expected.records)
    // 走系统对话框时不该再触发浏览器下载
    expect(written).toHaveLength(0)
  })

  it('用户取消（save 返回 null）→ {success:false,error:"cancelled"} 且不写文件', async () => {
    mocks.save.mockResolvedValue(null)
    const r = await ex.exportPracticeData([stat()], { format: 'csv', language: 'zh-CN' })
    expect(r).toEqual({ success: false, error: 'cancelled' })
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('save 抛错（对话框失败）→ 上抛成 success:false + 原因，不能静默吞掉', async () => {
    mocks.save.mockRejectedValue(new Error('dialog boom'))
    const r = await ex.exportPracticeData([stat()], { format: 'csv', language: 'zh-CN' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('dialog boom')
  })

  it('writeFile 抛错（磁盘满/无权限）→ 同样如实上报', async () => {
    mocks.writeFile.mockRejectedValue(new Error('QuotaExceededError'))
    const r = await ex.exportPracticeData([stat()], { format: 'csv', language: 'zh-CN' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('QuotaExceededError')
  })

  it('csv / json / html 三种格式各自的 filters 扩展名', async () => {
    for (const [format, ext] of [['csv', 'csv'], ['json', 'json'], ['html', 'html']] as const) {
      mocks.save.mockClear()
      await ex.exportPracticeData([stat()], { format, language: 'en' })
      const arg = mocks.save.mock.calls[0][0] as { defaultPath: string; filters: { name: string }[] }
      expect(arg.defaultPath).toBe(`fretmaster-practice-${TODAY}.${ext}`)
      expect(arg.filters[0].name).toBe(ext.toUpperCase())
    }
  })
})

describe('exportPracticeData：非法格式', () => {
  it('未知 format 直接抛错（由调用方 toast 兜住），不产出半成品文件', async () => {
    await expect(
      ex.exportPracticeData([stat()], { format: 'xml' as never, language: 'en' })
    ).rejects.toThrow('Unsupported format: xml')
  })
})

// ───────────────────────────── PDF（Web） ─────────────────────────────

describe('exportToPDF：Web 分支', () => {
  it('把 HTML 写进离屏 iframe、注入白底打印样式、截图后按 A4 分页并 pdf.save', async () => {
    const r = await ex.exportPracticeData([stat()], { format: 'pdf', language: 'zh-CN' })

    expect(r).toEqual({ success: true, path: `fretmaster-practice-${TODAY}.pdf` })

    // iframe 写入的是完整 HTML（含 </head>），且打印样式被插在 </head> 之前（覆盖深色主题）
    expect(fakeDoc.open).toHaveBeenCalledTimes(1)
    expect(fakeDoc.close).toHaveBeenCalledTimes(1)
    const html = fakeDoc.write.mock.calls[0][0] as string
    expect(html).toContain('<!DOCTYPE html>')
    expect(html.indexOf('PDF 导出专用')).toBeGreaterThan(-1)
    expect(html.indexOf('PDF 导出专用')).toBeLessThan(html.indexOf('</head>'))

    // html2canvas：2x 清晰度 + 宽 794（A4 内容宽）+ 高取 iframe body 的 scrollHeight
    expect(mocks.html2canvas).toHaveBeenCalledTimes(1)
    expect(mocks.html2canvas.mock.calls[0][1]).toEqual({
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: 794,
      width: 794,
      height: 4200,
      logging: false,
    })
    // iframe 高度被撑到内容高（否则截图会被截断）
    expect(capturedIframe?.style.height).toBe('4200px')

    // jsPDF：a4 + mm，图片等比缩到内容宽 190mm
    const pdf = mocks.pdfInstances[0]
    expect(pdf.opts).toEqual({ unit: 'mm', format: 'a4' })
    expect(pdf.addImage).toHaveBeenCalledTimes(2) // 内容 478.6mm > 277mm/页 → 2 页
    expect(pdf.addPage).toHaveBeenCalledTimes(1)
    expect(pdf.addImage.mock.calls[0]).toEqual(['data:image/jpeg;base64,AAAA', 'JPEG', 10, 10, 190, expect.closeTo(478.59, 1)])
    // 第 2 页把同一张图整体上移一页高度：10 - 478.59… + 201.59… = -267
    expect(pdf.addImage.mock.calls[1][3]).toBeCloseTo(-267, 0)
    expect(pdf.save).toHaveBeenCalledWith(`fretmaster-practice-${TODAY}.pdf`)

    // finally 必须摘掉 iframe —— 否则每导出一次泄漏一个 794px 的离屏 iframe
    expect(capturedIframe?.parentNode).toBeNull()
  })

  it('内容不足一页时只 addImage 一次、不 addPage', async () => {
    mocks.html2canvas.mockResolvedValue({ width: 794, height: 800, toDataURL: () => 'data:image/jpeg;base64,BB' })
    await ex.exportPracticeData([stat()], { format: 'pdf', language: 'en' })
    const pdf = mocks.pdfInstances[0]
    expect(pdf.addImage).toHaveBeenCalledTimes(1)
    expect(pdf.addPage).not.toHaveBeenCalled()
    // 191.4mm < 277mm/页
    expect(pdf.addImage.mock.calls[0][5]).toBeCloseTo(191.44, 1)
  })
})

// ───────────────────────────── PDF（Tauri） ─────────────────────────────

describe('exportToPDF：Tauri 分支', () => {
  beforeEach(() => { winLike.__TAURI__ = true })

  it('把 pdf.output("arraybuffer") 包成 Uint8Array 交给 writeFile；filters 是 PDF', async () => {
    const r = await ex.exportPracticeData([stat()], { format: 'pdf', language: 'en' })
    expect(r).toEqual({ success: true, path: '/home/u/report.csv' })

    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: `fretmaster-practice-${TODAY}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }, { name: 'All Files', extensions: ['*'] }],
    })
    const [, data] = mocks.writeFile.mock.calls[0]
    expect(isUint8Array(data), 'pdf 字节没包成 Uint8Array').toBe(true)
    expect(data).toHaveLength(8)
    // Tauri 分支不该再触发浏览器下载
    expect(mocks.pdfInstances[0].save).not.toHaveBeenCalled()
  })

  it('用户取消 → cancelled，且 iframe 已清理', async () => {
    mocks.save.mockResolvedValue(null)
    const r = await ex.exportPracticeData([stat()], { format: 'pdf', language: 'en' })
    expect(r).toEqual({ success: false, error: 'cancelled' })
    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(capturedIframe?.parentNode).toBeNull()
  })
})

// ───────────────────────────── PDF 失败路径 ─────────────────────────────

describe('exportToPDF：失败路径', () => {
  it('取不到 iframe document → success:false 而不是抛出去，且 iframe 仍被清理', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
      const el = origCreateElement(tag, opts)
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentDocument', { get: () => null, configurable: true })
        Object.defineProperty(el, 'contentWindow', { get: () => null, configurable: true })
        capturedIframe = el as HTMLIFrameElement
      }
      return el
    })

    const r = await ex.exportPracticeData([stat()], { format: 'pdf', language: 'zh-CN' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('无法获取 iframe document')
    expect(capturedIframe?.parentNode).toBeNull()
  })

  it('html2canvas 抛错 → success:false，pdf 不上屏也不落盘，iframe 仍被清理', async () => {
    mocks.html2canvas.mockRejectedValue(new Error('canvas boom'))
    const r = await ex.exportPracticeData([stat()], { format: 'pdf', language: 'zh-CN' })
    expect(r).toEqual({ success: false, error: 'Error: canvas boom' })
    expect(mocks.pdfInstances).toHaveLength(0)
    expect(capturedIframe?.parentNode).toBeNull()
  })

  it('没有 FontFaceSet 的浏览器 → 退回到 setTimeout(200) 兜底而不是干等', async () => {
    fakeDoc.fonts = undefined
    const t0 = Date.now()
    const r = await ex.exportPracticeData([stat()], { format: 'pdf', language: 'en' })
    expect(r.success).toBe(true)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200)
    expect(mocks.html2canvas).toHaveBeenCalledTimes(1)
  })
})

// ───────────────────── PDF 等待字体的挂起风险（真 bug 回归） ─────────────────────

describe('exportToPDF：等待 iframe 字体的超时兜底', () => {
  it('fonts.ready 永不 settle → 1s 上限兜底完成导出，不会永久挂起', async () => {
    fakeDoc.fonts = { ready: new Promise(() => { /* 永远不 settle */ }) }
    const r = await Promise.race([
      ex.exportPracticeData([stat()], { format: 'pdf', language: 'zh-CN' }),
      new Promise((res) => setTimeout(() => res('HANG'), 2500)),
    ])
    expect(r, 'fonts.ready 不 settle 时导出永久挂起（改前实测 1.2s 仍未落定）').not.toBe('HANG')
    expect((r as { success: boolean }).success).toBe(true)
  })

  it('fonts.ready reject → 既完成导出，也不产生 unhandled rejection', async () => {
    const unhandled: unknown[] = []
    const onNode = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', onNode)
    try {
      fakeDoc.fonts = { ready: Promise.reject(new Error('font boom')) }
      const r = await Promise.race([
        ex.exportPracticeData([stat()], { format: 'pdf', language: 'zh-CN' }),
        new Promise((res) => setTimeout(() => res('HANG'), 1500)),
      ])
      await new Promise((res) => setTimeout(res, 40)) // 留出 rejection 被上报的时机
      expect(r, 'fonts.ready reject 让导出永久挂起').not.toBe('HANG')
      expect((r as { success: boolean }).success).toBe(true)
      expect(unhandled, 'reject 被吞成 unhandled rejection').toEqual([])
    } finally {
      process.off('unhandledRejection', onNode)
    }
  })
})

// ───────────────────── 去重 / 聚合的补充分支 ─────────────────────

describe('deduplicateStats / 聚合的补充分支', () => {
  it('有 id 的记录额外按 id 去重', () => {
    const a = stat({ id: 7, notes: '练习项目: A' })
    const b = stat({ id: 7, notes: '练习项目: A', created_at: '2026-01-02 03:04:06' })
    expect(ex.deduplicateStats([a, b])).toHaveLength(1)
  })

  it('相邻同类型同详情、时间差小于较短那条的 duration → 视为重复', () => {
    const newer = stat({ notes: '练习项目: X', created_at: '2026-01-02 03:01:00', duration: 60 })
    const older = stat({ notes: '练习项目: X', created_at: '2026-01-02 03:00:30', duration: 60 })
    expect(ex.deduplicateStats([newer, older])).toHaveLength(1)
    // 时间差 = 60s ≥ min(duration) → 两条独立的合法记录，都要留下
    const far = stat({ notes: '练习项目: X', created_at: '2026-01-02 03:00:00', duration: 60 })
    expect(ex.deduplicateStats([newer, far])).toHaveLength(2)
  })

  it('找音练习豁免 duration 时间窗（每答对一题记一次，duration 是会话累计值）', () => {
    const newer = stat({ exercise_type: '找音练习', notes: '练习项目: X', created_at: '2026-01-02 03:01:00', duration: 600 })
    const older = stat({ exercise_type: '找音练习', notes: '练习项目: X', created_at: '2026-01-02 03:00:30', duration: 600 })
    expect(ex.deduplicateStats([newer, older])).toHaveLength(2)
  })

  it('空练习类型回落到「练习类型」这一列名，而不是空字符串', () => {
    const html = ex.exportToHTML([stat({ exercise_type: '' })], { format: 'html', language: 'zh-CN' })
    expect(html).toContain('练习类型')
  })

  it('每日汇总按日期倒序（新的在前），并给出条数', () => {
    const html = ex.exportToHTML(
      [stat({ created_at: '2026-01-01 10:00:00', notes: 'A' }), stat({ created_at: '2026-01-03 10:00:00', notes: 'B' })],
      { format: 'html', language: 'en' }
    )
    expect(html.indexOf('2026-01-03')).toBeLessThan(html.indexOf('2026-01-01'))
    expect(html).toContain('2 days')
  })
})

describe('CSV 单元格行分隔符（真 bug 回归）', () => {
  it('裸 \\r 与 \\n 一样被替换成空格 —— 否则会把这一行截断、后续列错位', () => {
    const bareCr = ex.exportToCSV([stat({ notes: 'a\rb' })], { format: 'csv', language: 'en' })
    // 数据区只该有 1 行（表头 + 1 条记录），单元格里的 \r 不能变成新的一行
    expect(bareCr.replace('\uFEFF', '').split('\n')).toHaveLength(2)
    expect(bareCr).toContain('"a b"')

    const crlf = ex.exportToCSV([stat({ notes: 'a\r\nb' })], { format: 'csv', language: 'en' })
    expect(crlf.replace('\uFEFF', '').split('\n')).toHaveLength(2)
    expect(crlf).toContain('"a b"')
  })
})

describe('空数据与全 0 值记录', () => {
  const ZH = { format: 'csv' as const, language: 'zh-CN' as const }

  it('没有练习记录时：CSV 只有表头、HTML 显示「暂无练习记录」、JSON 汇总全 0', () => {
    expect(ex.exportToCSV([], ZH).replace('\uFEFF', '').split('\n')).toHaveLength(1)

    const html = ex.exportToHTML([], ZH)
    expect(html).toContain('暂无练习记录')
    // 空数据时不该渲染「每日汇总」「详细记录」两张空表
    expect(html).not.toContain('条记录（已去重）')
    expect(html).not.toContain('每日汇总')

    const json = JSON.parse(ex.exportToJSON([], { format: 'json', language: 'zh-CN' }))
    expect(json.summary).toEqual({ totalSessions: 0, totalDuration: 0, averageScore: 0, averageAccuracy: 0 })
    expect(json.dailySummary).toEqual([])
    expect(json.dateRange).toBeNull()
  })

  it('score / duration 为 0 的记录仍被保留并如实计入（0 不等于缺失）', () => {
    const zero = stat({ score: 0, duration: 0, notes: '练习项目: Z' })
    expect(ex.exportToCSV([zero], ZH)).toContain('"Z"')
    const json = JSON.parse(ex.exportToJSON([zero], { format: 'json', language: 'en' }))
    expect(json.summary.totalDuration).toBe(0)
    expect(json.summary.averageScore).toBe(0)
    expect(json.records).toHaveLength(1)
  })

  it('exportToJSON 回显传入的 dateRange（ISO 串）', () => {
    const json = JSON.parse(ex.exportToJSON([stat()], {
      format: 'json',
      language: 'en',
      dateRange: { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-02-01T00:00:00Z') },
    }))
    expect(json.dateRange).toEqual({ start: '2026-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z' })
    expect(json.records).toHaveLength(1)
  })
})

describe('字段名兼容：旧记录可能只有 date / exerciseType', () => {
  /** 早于 `created_at`/`exercise_type` 这两个字段名之前落库的记录。 */
  const legacy = {
    exerciseType: 'scale',
    score: 80,
    duration: 30,
    accuracy: 1,
    date: '2026-01-05 08:00:00',
    notes: '练习项目: L',
  } as unknown as PracticeStats

  it('只有 date 字段时仍能解析出日期与时间戳', () => {
    const json = JSON.parse(ex.exportToJSON([legacy], { format: 'json', language: 'en' }))
    expect(json.summary.totalSessions).toBe(1)
    expect(json.records[0].date).toBe('2026-01-05')
    expect(json.records[0].timestamp.startsWith('2026-01-05')).toBe(true)
    expect(json.records[0].exerciseType).toBe('scale')
    expect(json.records[0].exerciseTypeName).toBe('Scale Practice')
  })

  it('只有 exerciseType 字段时仍能按内部 key 过滤', () => {
    const csv = ex.exportToCSV([legacy], { format: 'csv', language: 'en', exerciseTypes: ['scale'] })
    expect(csv).toContain('L')
    const dropped = ex.exportToCSV([legacy], { format: 'csv', language: 'en', exerciseTypes: ['interval'] })
    expect(dropped).not.toContain('L')
  })
})

describe('非法 language 的回落（调用方必须只传 zh-CN / en）', () => {
  it('语言不在译文表里时输出的是键名本身 —— 这是 i18n 的已知陷阱，不是异常', () => {
    const csv = ex.exportToCSV([stat()], { format: 'csv', language: 'ja' as never })
    expect(csv).toContain('type_scale')
  })
})

// ───────────────────── 动态 import 的按需加载（放最后） ─────────────────────

describe('html2canvas / jsPDF 的按需加载', () => {
  /**
   * 注意：模块内的 `html2canvasPromise` / `jspdfPromise` 只是为了「同一份 promise 只建一次」，
   * 它**不可观测** —— ESM 模块注册表本身就会缓存 `import()` 结果，去掉该缓存不会有任何行为差异
   * （实测：把 `if (!html2canvasPromise)` 改成 `if (true)`，所有用例照样通过）。
   * 真正可观测、且真的会出事的是**加载时机**：这两个包加起来几百 KB，
   * 一旦被提成模块顶层 import，导出 CSV 也会把它们拉进 bundle。
   */
  it('只在导出 PDF 时才动态 import html2canvas / jsPDF（导出 CSV 不该带上它们）', async () => {
    vi.resetModules()
    let h2cLoads = 0
    let jspdfLoads = 0
    vi.doMock('html2canvas', () => {
      h2cLoads += 1
      return { default: vi.fn(async () => ({ width: 794, height: 800, toDataURL: () => 'data:image/jpeg;base64,CC' })) }
    })
    vi.doMock('jspdf', () => {
      jspdfLoads += 1
      return { jsPDF: mocks.FakeJsPDF }
    })

    const fresh = await import('@/lib/export-utils')
    // 动态 import 的模块解析是异步的；若有人把它提到模块顶层，这里要留出落地时间才能观察到
    const settle = () => new Promise((r) => setTimeout(r, 50))
    await settle()
    expect([h2cLoads, jspdfLoads], '模块一被 import 就把 PDF 依赖加载了').toEqual([0, 0])

    await fresh.exportPracticeData([stat()], { format: 'csv', language: 'en' })
    await settle()
    expect([h2cLoads, jspdfLoads], '导出 CSV 也把 html2canvas/jsPDF 拉起来了').toEqual([0, 0])

    await fresh.exportPracticeData([stat()], { format: 'pdf', language: 'en' })
    expect([h2cLoads, jspdfLoads]).toEqual([1, 1])
  })
})
