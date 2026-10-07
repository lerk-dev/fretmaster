/**
 * LevelInfoDialog —— 练习模式详细信息弹窗契约测试
 *
 * 受控 Dialog（open / level / 回调全来自 props，内容 portal 到 document.body）。
 * 组件用 memo 包裹（父组件重渲染时 props 不变则跳过）。
 *
 * 重点契约：
 *  ① 描述解析链：`level_desc_<id>` → （缺键时）回落到 level.description
 *     ⚠️ 项目的 t() 对缺键返回**键名本身**（真值），所以朴素的 `t(k) || fallback`
 *        永远命不中 fallback —— 必须显式比较 `t(k) === k`
 *  ② level 为 null 时只渲染空标题与页脚（正文整块不渲染）
 *  ③ 「选择此等级」先 onConfirm(level) 再 onOpenChange(false)；「关闭」只关不确认
 *  ④ 等级选项徽章：orderOption / randomOption / forceNaturalFive 二态文案 +
 *     startingIntervalOption / notesPerChord 原值；endOnStartingInterval 为 undefined 时整行不渲染
 *  ⑤ ~~「音程」「和弦类型音程」两块（原源码 62-108）~~ **已于 2026-10-04 整块删除**：
 *     触发字段 `intervals` / `chordTypes` 在 `PracticeLevel` 上根本不存在，组件靠 `as`
 *     断言绕过类型检查，两块永不渲染（改坏了 UI 上也看不出来）。清理后 `formatDegree`
 *     在本文件已无引用 ⇒ import 一并删；i18n 的 `intervals` / `chord_type_intervals`
 *     两键保留（删键属内容变更，且未来若「复活」成功能还要用）。
 *     `selectedLevelInfo` 类型是 `PracticeLevel`（`lib/practice-levels.ts:1-30`），该接口**没有**
 *     `intervals` / `chordTypes` 字段；唯一注入路径 `handleShowLevelInfo`（`app/page.tsx:4099`）
 *     也只接受 `typeof ALL_PRACTICE_LEVELS[0]`。组件用 `as` 断言绕过了类型检查。
 *     ⇒ 下面既有「钉住现状」的哨兵，也有「字段一旦被启用」时的渲染契约 ——
 *       `degreeMap` 是硬编码的 12 项映射表，写错在 UI 上完全看不出来。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LevelInfoDialog } from '@/components/level-info-dialog'
import { ALL_PRACTICE_LEVELS, type PracticeLevel } from '@/lib/practice-levels'
import { TRANSLATIONS } from '@/lib/i18n'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const tZh = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k
const tEn = (k: string) => (TRANSLATIONS['en'] as Record<string, string>)[k] ?? k

type Props = Record<string, unknown>
let root: Root | null = null
/** 逐条记录卸载函数：某条用例断言失败会跳过它自己的 unmount()，残留的 React root 会让
 *  后续用例冒出无关的「假失败」（实测会给变异结果掺进十来条误伤）⇒ afterEach 兜底拆树。 */
const unmounts: Array<() => void> = []

function mount(props: Props = {}) {
  const calls: Record<string, unknown[]> = {}
  const track = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args.length > 1 ? args : args[0])
  }
  const base: Props = {
    open: true,
    onOpenChange: track('openChange'),
    level: ALL_PRACTICE_LEVELS[0],
    onConfirm: track('confirm'),
    t: tZh,
    ...props,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(LevelInfoDialog as never, base as never))
  })
  const docText = () => document.body.textContent ?? ''
  const buttons = () => [...document.body.querySelectorAll('button')] as HTMLButtonElement[]
  const btn = (label: string) => buttons().find((b) => b.textContent?.trim() === label)
  const click = (el: HTMLElement | undefined) => {
    expect(el, '待点击元素应存在').toBeTruthy()
    act(() => {
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }
  let done = false
  const unmount = () => {
    if (done) return   // 幂等：用例自己卸过之后 afterEach 再调一次不能炸
    done = true
    act(() => root?.unmount())
    container.remove()
    root = null
  }
  unmounts.push(unmount)
  return { container, calls, docText, buttons, btn, click, unmount }
}

afterEach(() => {
  // 逐条 try 包裹：卸载本身抛错也不能带崩清理循环
  for (const fn of unmounts) {
    try { fn() } catch { /* 忽略卸载异常 */ }
  }
  unmounts.length = 0
  document.body.innerHTML = ''
})
beforeEach(() => {
  vi.clearAllMocks()
})

describe('LevelInfoDialog', () => {
  describe('标题与基本字段', () => {
    it('标题与 sr-only 描述都用 t(nameKey)', () => {
      const level = ALL_PRACTICE_LEVELS[0]
      const p = mount({ level })
      expect(p.docText()).toContain(tZh(level.nameKey))
      expect(p.docText()).toContain(tZh('practice_level'))
      p.unmount()
    })

    it('英文模式下标题取英文', () => {
      const level = ALL_PRACTICE_LEVELS[0]
      const p = mount({ level, t: tEn })
      expect(p.docText()).toContain(tEn(level.nameKey))
      expect(p.docText()).toContain(tEn('practice_level'))
      p.unmount()
    })

    it('level=null：正文整块不渲染，页脚仍在', () => {
      const p = mount({ level: null })
      expect(p.docText()).not.toContain(tZh('practice_level'))
      expect(p.docText()).not.toContain(tZh('description'))
      expect(p.btn(tZh('select_this_level'))).toBeTruthy()
      expect(p.btn(tZh('btn_close'))).toBeTruthy()
      p.unmount()
    })
  })

  describe('描述解析链', () => {
    it('显示 level_desc_<id> 的译文（而非 level.description 原文）', () => {
      const level = ALL_PRACTICE_LEVELS.find(
        (l) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[`level_desc_${l.id}`] !== undefined,
      )!
      const p = mount({ level })
      expect(p.docText()).toContain(tZh(`level_desc_${level.id}`))
      p.unmount()
    })

    it('**缺 level_desc 键时回落到 level.description**（钉住修复：t() 缺键返回键名本身）', () => {
      const fake = {
        ...ALL_PRACTICE_LEVELS[0],
        id: 'no_such_level_key_xyz',
        description: '这是数据库里的原始描述',
      } as PracticeLevel
      const p = mount({ level: fake })
      expect(p.docText()).toContain('这是数据库里的原始描述')
      expect(p.docText(), '不应把 i18n 键名当描述显示').not.toContain('level_desc_no_such_level_key_xyz')
      p.unmount()
    })
  })

  describe('等级选项徽章', () => {
    function findLevel(pred: (l: PracticeLevel) => boolean): PracticeLevel {
      const l = ALL_PRACTICE_LEVELS.find(pred)
      expect(l, '应能找到满足条件的等级').toBeTruthy()
      return l!
    }

    it('orderOption / randomOption / forceNaturalFive 用 启用-禁用 / 是-否 文案', () => {
      const level = findLevel((l) => l.orderOption && !l.randomOption && l.forceNaturalFive)
      const p = mount({ level })
      expect(p.docText()).toContain(tZh('level_options'))
      expect(p.docText()).toContain(tZh('level_order_option'))
      expect(p.docText()).toContain(tZh('level_random_option'))
      expect(p.docText()).toContain(tZh('level_force_natural_five'))
      expect(p.docText()).toContain(tZh('enabled'))
      expect(p.docText()).toContain(tZh('disabled'))
      expect(p.docText()).toContain(tZh('yes'))
      p.unmount()
    })

    it('startingIntervalOption 与 notesPerChord 显示原值', () => {
      const level = ALL_PRACTICE_LEVELS[0]
      const p = mount({ level })
      expect(p.docText()).toContain(level.startingIntervalOption)
      expect(p.docText()).toContain(String(level.notesPerChord))
      p.unmount()
    })

    it('endOnStartingInterval 有值时渲染该行', () => {
      const level = findLevel((l) => l.endOnStartingInterval !== undefined)
      const p = mount({ level })
      expect(p.docText()).toContain(tZh('level_end_on_starting'))
      p.unmount()
    })

    it('endOnStartingInterval 为 undefined 时整行不渲染', () => {
      const level = findLevel((l) => l.endOnStartingInterval === undefined)
      const p = mount({ level })
      expect(p.docText()).not.toContain(tZh('level_end_on_starting'))
      // 其它行仍在
      expect(p.docText()).toContain(tZh('level_notes_per_chord'))
      p.unmount()
    })

    it('endOnStartingInterval 为 false 时该行显示「否」而不是「禁用」', () => {
      // 真实 57 个等级里带该字段的都是 true，故构造一个 false —— 字段本身是合法 boolean
      const level = { ...ALL_PRACTICE_LEVELS[0], endOnStartingInterval: false }
      const p = mount({ level })
      const row = [...document.body.querySelectorAll('div')]
        .find((d) => d.textContent?.startsWith(tZh('level_end_on_starting')))
      expect(row, '应渲染 endOnStartingInterval 行').toBeTruthy()
      expect(row!.textContent, 'false 走 是/否 文案，不是 启用/禁用').toContain(tZh('no'))
      expect(row!.textContent).not.toContain(tZh('disabled'))
      p.unmount()
    })
  })

  describe('页脚按钮', () => {
    it('「选择此等级」→ 先 onConfirm(level)、再 onOpenChange(false)', () => {
      const level = ALL_PRACTICE_LEVELS[0]
      const p = mount({ level })
      p.click(p.btn(tZh('select_this_level')))
      expect(p.calls.confirm).toEqual([level])
      expect(p.calls.openChange).toEqual([false])
      p.unmount()
    })

    it('level=null 时「选择此等级」也回传 null（由调用方判空，与原逻辑一致）', () => {
      const p = mount({ level: null })
      p.click(p.btn(tZh('select_this_level')))
      expect(p.calls.confirm).toEqual([null])
      expect(p.calls.openChange).toEqual([false])
      p.unmount()
    })

    it('「关闭」只关弹窗、不触发确认', () => {
      const p = mount()
      p.click(p.btn(tZh('btn_close')))
      expect(p.calls.openChange).toEqual([false])
      expect(p.calls.confirm).toBeUndefined()
      p.unmount()
    })
  })

  /**
   * 2026-10-04 清理：原「音程 / 和弦类型音程」两块（源码原 62-108）是**死 UI** ——
   * 触发字段 `intervals` / `chordTypes` 在 `PracticeLevel` 上根本不存在，组件靠 `as`
   * 断言绕过类型检查，两块永远不渲染（改坏了 UI 上也完全看不出来）⇒ 已整块删除，
   * 对应的哨兵与 4 条渲染契约随之移除。
   *
   * 下面这条测的是**活代码**（第三块的 `return null`），不属于死 UI，保留。
   */
  describe('等级选项区块（第三块：SOLO 风格等级选项）', () => {
    /** 用 Label 的**完整文本**比对，避开「起始音程」等含「音程」二字的子串误判 */
    const labels = () => [...document.body.querySelectorAll('label')].map((l) => l.textContent?.trim())

    it('无 sequences 时「等级选项」整块不渲染（第三块的 return null），其余照常', () => {
      const level = { ...ALL_PRACTICE_LEVELS[0], sequences: undefined } as unknown as PracticeLevel
      const p = mount({ level })
      expect(labels()).not.toContain(tZh('level_options'))
      expect(labels(), '基本信息区块仍要渲染').toContain(tZh('description'))
      p.unmount()
    })
  })

  describe('open=false', () => {
    it('不渲染正文内容', () => {
      const p = mount({ open: false })
      expect(p.docText()).not.toContain(tZh('practice_level'))
      p.unmount()
    })
  })
})
