/**
 * components/stats-panel.tsx 的**导出按钮**契约测试（补充 `stats-panel.test.ts`）。
 *
 * 上面那份测试盖住了数据渲染（时间范围、明细降序、近期记录映射、空态），
 * 但四个导出按钮（CSV / PDF / JSON / HTML）的 onClick **一次都没被点过** ——
 * 于是「点了没反应 / 文案不对 / 取消也弹报错」这三类问题全在盲区里。
 *
 * 每个按钮是一段复制的 async 闭包：动态 import `getAllPracticeStats` + `exportPracticeData`，
 * 然后按 `result` 分四路：
 *  ① `success && path`  → toast.success(`{export_success} {path}`)
 *  ② `success && !path` → toast.success(`{export_success}`)
 *  ③ `!success && error !== 'cancelled'` → toast.error(`{export_failed}`)
 *  ④ `!success && error === 'cancelled'` → **静默**（用户自己点的取消，不该报错）
 *  ⑤ 整个 try 抛异常（例如动态 import 失败） → toast.error(`{export_failed}`)
 *
 * 契约：四个按钮把**各自的 format** 与**当前语言**传下去；四种结果各归各路。
 * 「取消静默」这条尤其容易被复制粘贴时漏掉，所以单独钉。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StatsPanel } from '@/components/stats-panel'
import { useAppStore } from '@/lib/store'
import type { PracticeDetail, PracticeType } from '@/lib/page-stats-types'

// vi.mock 提升到文件顶 → 工厂里引用的桩必须一起提升
const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastSpies, Toaster: () => null }))

const apiSpies = vi.hoisted(() => ({ getAll: vi.fn() }))
vi.mock('@/lib/stats-api', () => ({ getAllPracticeStats: apiSpies.getAll }))

const exportSpies = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('@/lib/export-utils', () => ({ exportPracticeData: exportSpies.fn }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const t = (k: string) => `[${k}]`
/** 服务端记录（导出时原样透传，内容不是本测试的重点） */
const SERVER_STATS = [{ id: 's1', date: '2026-09-20', duration: 60 }]

const TYPES: PracticeType[] = ['pitch_finding', 'scale', 'chord_exercise', 'interval', 'chord_progression']

/** 已挂载的实例：用例中途断言失败会跳过它自己的 unmount()，必须由 afterEach 统一拆树 */
const mounted: Array<{ unmount: () => void }> = []

function render(language: 'zh-CN' | 'en' = 'zh-CN', records: Record<string, unknown>[] = []) {
  const state = useAppStore.getState()
  useAppStore.setState({ user: { ...state.user, language } })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    const byType = Object.fromEntries(TYPES.map((x) => [x, 0])) as Record<PracticeType, number>
    const byDetail = Object.fromEntries(TYPES.map((x) => [x, [] as PracticeDetail[]])) as Record<PracticeType, PracticeDetail[]>
    root.render(createElement(StatsPanel as never, {
      t,
      statsTimeRange: 'total',
      onStatsTimeRangeChange: () => { /* noop */ },
      getStatsByTimeRange: () => ({ count: 0, byType, byDetail }),
      recentRecords: records,
    } as never))
  })

  const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[]
  /** 四个导出按钮就是最后 4 个（顺序 CSV / PDF / JSON / HTML） */
  const exportButton = (fmt: 'csv' | 'pdf' | 'json' | 'html') =>
    buttons()[4 + (['csv', 'pdf', 'json', 'html'] as const).indexOf(fmt)]
  /** 点击要等动态 import + await 全部落定 */
  const clickExport = async (fmt: 'csv' | 'pdf' | 'json' | 'html') => {
    await act(async () => {
      exportButton(fmt).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }

  let unmounted = false
  const api = {
    container,
    buttons,
    exportButton,
    clickExport,
    /** 每行记录的时间戳单元格（每行一个 tabular-nums 的 span） */
    rowTimeCells: () => [...container.querySelectorAll('span.tabular-nums')] as HTMLElement[],
    text: () => container.textContent ?? '',
    unmount() {
      if (unmounted) return
      unmounted = true
      act(() => root.unmount())
      container.remove()
    },
  }
  mounted.push(api)
  return api
}

beforeEach(() => {
  vi.clearAllMocks()
  apiSpies.getAll.mockResolvedValue(SERVER_STATS)
  exportSpies.fn.mockResolvedValue({ success: true })
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const m of mounted.splice(0)) {
    try { m.unmount() } catch { /* 拆树失败不掩盖真实断言 */ }
  }
  document.body.innerHTML = ''
})

const FORMATS = ['csv', 'pdf', 'json', 'html'] as const

describe('四个按钮各自传递 format', () => {
  for (const fmt of FORMATS) {
    it(`${fmt.toUpperCase()} 按钮 → format:'${fmt}'，并带上 store 里的语言`, async () => {
      const p = render('en')
      await p.clickExport(fmt)
      expect(apiSpies.getAll).toHaveBeenCalledTimes(1)
      expect(exportSpies.fn).toHaveBeenCalledWith(SERVER_STATS, { format: fmt, language: 'en' })
      p.unmount()
    })
  }

  it('四个按钮都能点，且互不串台（各点一次 = 各调一次对应 format）', async () => {
    const p = render()
    for (const fmt of FORMATS) await p.clickExport(fmt)
    expect(exportSpies.fn.mock.calls.map((c) => c[1].format)).toEqual([...FORMATS])
    p.unmount()
  })
})

/**
 * 四个按钮的闭包是**复制粘贴**出来的，所以每个按钮都要独立跑完 5 条结果路径 ——
 * 只测「CSV 的成功 + HTML 的取消」会漏掉「HTML 的报错分支被漏写」这类错误。
 */
const OUTCOMES: Array<{
  name: string
  arrange: () => void
  expectSuccess?: string[]
  expectError?: boolean
}> = [
  {
    name: '成功且带路径 → success 里拼路径',
    arrange: () => exportSpies.fn.mockResolvedValue({ success: true, path: '/tmp/out.ext' }),
    expectSuccess: ['[export_success] /tmp/out.ext'],
  },
  {
    name: '成功但无路径 → 只有成功文案',
    arrange: () => exportSpies.fn.mockResolvedValue({ success: true }),
    expectSuccess: ['[export_success]'],
  },
  {
    name: '失败（非取消）→ error',
    arrange: () => exportSpies.fn.mockResolvedValue({ success: false, error: 'disk full' }),
    expectError: true,
  },
  {
    name: '用户取消 → 两个 toast 都不弹',
    arrange: () => exportSpies.fn.mockResolvedValue({ success: false, error: 'cancelled' }),
  },
  {
    name: '抛异常（如动态 import 失败）→ error 兜底，不冒泡',
    arrange: () => exportSpies.fn.mockRejectedValue(new Error('boom')),
    expectError: true,
  },
]

describe('导出结果 → toast：4 个按钮 与 5 种结果全矩阵', () => {
  for (const fmt of FORMATS) {
    for (const outcome of OUTCOMES) {
      it(`${fmt.toUpperCase()} · ${outcome.name}`, async () => {
        outcome.arrange()
        const p = render()
        await p.clickExport(fmt)

        if (outcome.expectSuccess) {
          expect(toastSpies.success).toHaveBeenCalledWith(...outcome.expectSuccess)
          expect(toastSpies.error).not.toHaveBeenCalled()
        } else if (outcome.expectError) {
          expect(toastSpies.error).toHaveBeenCalledWith('[export_failed]')
          expect(toastSpies.success).not.toHaveBeenCalled()
        } else {
          expect(toastSpies.success).not.toHaveBeenCalled()
          expect(toastSpies.error).not.toHaveBeenCalled()
        }
        p.unmount()
      })
    }
  }

  it('取数据那步就失败（getAllPracticeStats 抛）：不调导出，只报「导出失败」', async () => {
    apiSpies.getAll.mockRejectedValue(new Error('network down'))
    const p = render()
    await p.clickExport('csv')
    expect(exportSpies.fn).not.toHaveBeenCalled()
    expect(toastSpies.error).toHaveBeenCalledWith('[export_failed]')
    p.unmount()
  })
})

/**
 * 近期记录是「老数据兼容」的重灾区：字段名有 `exercise_type`/`exerciseType` 两套，
 * 时间戳有 `created_at`/`date` 两套，还可能干脆没有 `id`。这些兜底都是 `||`，
 * 走不到就永远不知道写错没有。
 */
describe('近期记录的字段兜底', () => {
  it('缺 created_at 时退回 date 字段', () => {
    const p = render('zh-CN', [{ id: 'a', date: '2026-09-20 14:05:00', exercise_type: 'scale' }])
    expect(p.rowTimeCells()).toHaveLength(1)
    expect(p.rowTimeCells()[0].textContent).toContain('2026-09-20')
    p.unmount()
  })

  it('时间戳是无效 Date 实例时两处都显示 -（而不是 Invalid Date）', () => {
    // ⚠️ 必须传**无效的 Date 实例**才能走到这个兜底：
    // parseDbTimestamp 对字符串输入永远返回有效 Date（解析失败会退回 new Date()），
    // 只有 `value instanceof Date` 那条早返回会把 Invalid Date 原样带出来。
    // ⇒ 组件里 isNaN(dt.getTime()) 的 '-' 分支对「服务端 JSON 字符串」是不可达的（已记录）。
    const p = render('zh-CN', [{ id: 'a', created_at: new Date('garbage'), exercise_type: 'scale' }])
    expect(p.rowTimeCells()[0].textContent).toBe('- -')
    p.unmount()
  })

  it('时间戳是解析不了的字符串时退回「当前时间」而不是 -（钉住 parseDbTimestamp 的实际语义）', () => {
    const p = render('zh-CN', [{ id: 'a', created_at: 'not-a-date', exercise_type: 'scale' }])
    expect(p.rowTimeCells()[0].textContent).not.toBe('- -')
    expect(p.rowTimeCells()[0].textContent).toMatch(/\d{4}-\d{2}-\d{2}/)
    p.unmount()
  })

  it('没有 exercise_type / exerciseType 时类型显示 -', () => {
    const p = render('zh-CN', [{ id: 'a', created_at: '2026-09-20T14:05:00Z' }])
    expect(p.text()).toContain('-')
    p.unmount()
  })

  it('没有 id 时用下标当 key，不触发 React 的「缺少 key」告警', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ })
    const p = render('zh-CN', [
      { exercise_type: 'scale', notes: 'a', created_at: '2026-09-20 14:05:00' },
      { exercise_type: 'scale', notes: 'b', created_at: '2026-09-20 14:05:00' },
    ])
    expect(p.rowTimeCells()).toHaveLength(2)
    const keyWarnings = errSpy.mock.calls.filter((c) => String(c[0]).includes('unique "key"'))
    expect(keyWarnings, '用 rec.id ?? idx 才不会有 key 告警').toEqual([])
    errSpy.mockRestore()
    p.unmount()
  })
})
