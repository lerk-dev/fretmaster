/**
 * ShortcutsHelpDialog —— 快捷键帮助弹窗契约测试
 *
 * 两部分：
 *  ① **渲染契约**：两个分组、10 行、每行 kbd 与说明都来自 `t()`；关闭按钮回传 false
 *  ② **文档与实现交叉校验**（本文件的主要价值）：帮助里承诺的每个按键，
 *     都必须在 `hooks/use-global-shortcuts.ts` 的 `handleKeyDown` 里有对应的 `event.key` 分支，
 *     且 `app/page.tsx` 必须真的把该 hook 接上（2026-10-16 C5 起实现横跨这两个文件）。
 *
 * 这类「帮助文档说能做、实际没接线」的缺陷用户一旦遇到就会怀疑是自己按错，
 * 且**不会报错**——必须靠交叉校验才能持续守住。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ShortcutsHelpDialog } from '@/components/shortcuts-help-dialog'
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

/** 文档里的分组与行（顺序即渲染顺序），与组件源码一一对应 */
const GLOBAL_ROWS = ['esc', 'number', 'f', 'm', 's', 'p', 'h'] as const
const PRACTICE_ROWS = ['space', 'up', 'down'] as const

/** 帮助文案里的按键记号 → 源码里应出现的代码片段（扫 hook + page，见下方 SRC） */
const TOKEN_TO_CODE: Record<string, string> = {
  ESC: "event.key === 'Escape'",
  F: "event.key === 'f'",
  M: "event.key === 'm'",
  S: "event.key === 's'",
  P: "event.key === 'p'",
  H: "event.key === 'h'",
  空格: "event.key === ' '",
  Space: "event.key === ' '", // 英文文案里写作 Space
  '→': "event.key === 'ArrowRight'",
  '↑': "event.key === 'ArrowUp'",
  '↓': "event.key === 'ArrowDown'",
  PageDown: "event.key === 'PageDown'",
  PageUp: "event.key === 'PageUp'",
  // 1-5 不是逐键比较，而是白名单数组
  '1-5': "['1', '2', '3', '4', '5']",
}

type Props = Record<string, unknown>
let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(props: Props = {}) {
  const calls: Record<string, unknown[]> = {}
  const base: Props = {
    open: true,
    onOpenChange: (...a: unknown[]) => {
      ;(calls.openChange ??= []).push(a[0])
    },
    t: tZh,
    ...props,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(ShortcutsHelpDialog as never, base as never))
  })
  const docText = () => document.body.textContent ?? ''
  const kbd = () => [...document.body.querySelectorAll('kbd')].map((e) => e.textContent)
  const buttons = () => [...document.body.querySelectorAll('button')] as HTMLButtonElement[]
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { calls, docText, kbd, buttons, unmount }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ShortcutsHelpDialog', () => {
  describe('渲染契约', () => {
    it('open=false 时不渲染内容', () => {
      const p = mount({ open: false })
      expect(p.docText()).not.toContain(tZh('shortcuts_title'))
      p.unmount()
    })

    it('标题与 sr-only 描述都用 t(shortcuts_title)', () => {
      const p = mount()
      expect(p.docText()).toContain(tZh('shortcuts_title'))
      p.unmount()
    })

    it('两个分组标题分别来自 t(shortcuts_global) / t(shortcuts_practice)', () => {
      const p = mount()
      expect(p.docText()).toContain(tZh('shortcuts_global'))
      expect(p.docText()).toContain(tZh('shortcuts_practice'))
      p.unmount()
    })

    it('恰好 10 个 kbd：全局 7 + 练习 3，顺序与文档一致', () => {
      const p = mount()
      const expectedOrder = [...GLOBAL_ROWS, ...PRACTICE_ROWS].map((k) => tZh(`shortcuts_${k}`))
      expect(p.kbd()).toEqual(expectedOrder)
      p.unmount()
    })

    it('每行说明都来自 t()（逐行核对，防止「kbd 对但描述串行」）', () => {
      const p = mount()
      const text = p.docText()
      for (const k of [...GLOBAL_ROWS, ...PRACTICE_ROWS]) {
        expect(text, `${k} 的说明应显示`).toContain(tZh(`shortcuts_${k}_desc`))
        // 说明不能是原始 key（t() 缺键时会返回键名本身）
        expect(text).not.toContain(`shortcuts_${k}_desc`)
        expect(text).not.toContain(`shortcuts_${k}\``)
      }
      p.unmount()
    })

    it('英文模式下标题与所有行文案都取英文', () => {
      const p = mount({ t: tEn })
      const text = p.docText()
      expect(text).toContain(tEn('shortcuts_title'))
      for (const k of [...GLOBAL_ROWS, ...PRACTICE_ROWS]) {
        expect(text).toContain(tEn(`shortcuts_${k}`))
        expect(text).toContain(tEn(`shortcuts_${k}_desc`))
      }
      p.unmount()
    })

    it('关闭按钮回传 onOpenChange(false)', () => {
      const p = mount()
      const btn = p.buttons().find((b) => b.textContent?.trim() === tZh('shortcuts_close'))
      expect(btn, '关闭按钮应存在').toBeTruthy()
      act(() => {
        btn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      expect(p.calls.openChange).toEqual([false])
      p.unmount()
    })
  })

  describe('文档与实现交叉校验', () => {
    // 🚨 实现横跨两个文件（2026-10-16 C5 拆分「全局快捷键域」后）：
    //   · hooks/use-global-shortcuts.ts —— handleKeyDown 本体与 window 级监听
    //   · app/page.tsx                 —— 必须**真的调用** useGlobalShortcuts（否则 hook 白写、
    //                                     而下面的「按键都有分支」会因为扫的是 hook 而照样全绿）
    // 少读任何一个，这节的校验都会失真，所以合并成 SRC 再扫。
    const HOOK_SRC = readFileSync(join(__dirname, '..', 'hooks', 'use-global-shortcuts.ts'), 'utf8')
    const PAGE_SRC = readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf8')
    const SRC = HOOK_SRC + '\n' + PAGE_SRC

    it('本测试的映射表覆盖了文档里出现的所有按键记号（新增记号会提醒补表）', () => {
      const tokens = new Set<string>()
      for (const lang of ['zh-CN', 'en'] as const) {
        for (const k of [...GLOBAL_ROWS, ...PRACTICE_ROWS]) {
          const value = (TRANSLATIONS[lang] as Record<string, string>)[`shortcuts_${k}`]
          expect(value, `shortcuts_${k} 在 ${lang} 应有值`).toBeTruthy()
          for (const token of value.split(' / ')) tokens.add(token.trim())
        }
      }
      const unmapped = [...tokens].filter((tok) => TOKEN_TO_CODE[tok] === undefined)
      expect(
        unmapped,
        `文档里出现未映射的按键记号：${unmapped.join(', ')}（请在 TOKEN_TO_CODE 补上，并确认 page.tsx 有对应处理）`,
      ).toEqual([])
    })

    it('帮助里承诺的每个按键，键盘处理里都有对应分支', () => {
      const missing: string[] = []
      for (const k of [...GLOBAL_ROWS, ...PRACTICE_ROWS]) {
        const value = (TRANSLATIONS['zh-CN'] as Record<string, string>)[`shortcuts_${k}`]
        for (const token of value.split(' / ')) {
          const needle = TOKEN_TO_CODE[token.trim()]
          if (needle && !SRC.includes(needle)) {
            missing.push(`${k}（${token.trim()}）→ 期望源码含 \`${needle}\``)
          }
        }
      }
      expect(missing, `\n帮助文档承诺但源码里找不到处理的按键：\n${missing.join('\n')}`).toEqual([])
    })

    it('hook 里确实存在 handleKeyDown 与 window 级监听（防止把校验指向错误的文件）', () => {
      expect(HOOK_SRC).toContain('const handleKeyDown')
      expect(HOOK_SRC).toContain("window.addEventListener('keydown', handleKeyDown)")
      expect(HOOK_SRC).toContain("window.removeEventListener('keydown', handleKeyDown)")
      // 带修饰键的组合应让给浏览器（Ctrl+P 打印 / Ctrl+F 查找等）
      expect(HOOK_SRC).toContain('event.ctrlKey || event.metaKey || event.altKey')
    })

    it('🚨 page.tsx 必须真的调用 useGlobalShortcuts（hook 写了但没接线 = 全部快捷键失效）', () => {
      // 本条是上一条的「反向钉子」：光看 hook 会全绿，而用户按键毫无反应。
      expect(PAGE_SRC, 'page.tsx 里找不到 useGlobalShortcuts 调用 —— 快捷键域被抽走却没接回来').toContain(
        'useGlobalShortcuts({',
      )
      // 页面侧不许再留一份 window keydown（否则两个监听器打架）
      expect(PAGE_SRC, 'page.tsx 里又出现了 window 级 keydown 监听').not.toContain(
        "window.addEventListener('keydown'",
      )
    })

    it('如实记录：实现里有但帮助未列出的按键（Enter → 下一题）', () => {
      // Enter 也会「下一题」，但 shortcuts 文档里没有对应行。
      // 本轮未加（新增一行属产品口径），仅用断言钉住现状，避免将来无声漂移。
      expect(SRC).toContain("event.key === 'Enter'")
      const documented = [...GLOBAL_ROWS, ...PRACTICE_ROWS]
        .map((k) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[`shortcuts_${k}`])
        .join(' ')
      expect(documented).not.toContain('Enter')
    })
  })
})
