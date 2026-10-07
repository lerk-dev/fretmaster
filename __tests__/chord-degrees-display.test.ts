/**
 * ChordDegreesDisplay —— 和弦进行度数展示契约测试
 *
 * memo 的展示组件：题目数据由 3 个回调式 props 提供（getCurrentChordDisplay /
 * getNextChordDisplay / getLevelOptions），显示偏好取自 store（useUser / useChordSymbols）。
 *
 * 本轮同时把「下一题和弦名」的内联拼装改为调用 `formatChordShape` ——
 * 后者在 `lib/page-theory-functions.ts:85-100` 的文档里被明确声明为
 * **唯一真相源**（注释还专门记了「曾经两处各写一份、导出那份漏了归一化」的历史），
 * 而本文件里又存在**第三份逐字等价的内联实现**。行为完全等价（本次用断言钉住）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChordDegreesDisplay } from '@/components/chord-degrees-display'
import { formatChordShape, getChordDegrees } from '@/lib/page-theory-functions'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

type Chord = { root: string; type: string; bass?: string }
type NextChord = { index: number; root: string; type: string; bass?: string; degrees: string[] } | null

type Props = Record<string, unknown>
let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(props: Props = {}) {
  const base: Props = {
    t,
    transposedChords: [
      { root: 'C', type: 'Major' },
      { root: 'A', type: 'minor' },
    ] as Chord[],
    currentChordIndex: 0,
    practiceLevel: 'single_chord_tones_root',
    chordDegreeCurrentStep: 0,
    getLevelOptions: () => ({}),
    getCurrentChordDisplay: () => 'C',
    getNextChordDisplay: (): NextChord => null,
    nextChord: vi.fn(),
    ...props,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(ChordDegreesDisplay as never, base as never))
  })
  const text = () => container!.textContent ?? ''
  const badges = () => [...container!.querySelectorAll('[data-slot="badge"]')] as HTMLElement[]
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { rootEl: () => container!, text, badges, unmount }
}

beforeEach(() => {
  // ⚠️ chordScaleDisplay 在 store 的 `user` 下（不是顶层）—— 设错位置组件读不到
  useAppStore.setState({ user: { ...useAppStore.getState().user, chordScaleDisplay: 'chinese' } })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ChordDegreesDisplay', () => {
  describe('当前和弦', () => {
    it('标题直接用 getCurrentChordDisplay() 的返回值', () => {
      const p = mount({ getCurrentChordDisplay: () => '标记串·当前和弦' })
      expect(p.text()).toContain('标记串·当前和弦')
      p.unmount()
    })

    it('音级徽章来自 getChordDegrees(当前和弦.type, level, options)', () => {
      const options = { forceNaturalFive: true }
      const getLevelOptions = vi.fn(() => options)
      const p = mount({
        getLevelOptions,
        transposedChords: [{ root: 'C', type: 'Major' }, { root: 'A', type: 'minor' }],
        currentChordIndex: 0,
      })
      expect(getLevelOptions).toHaveBeenCalled()
      const expected = getChordDegrees('Major', 'single_chord_tones_root', options)
      expect(p.badges().map((b) => b.textContent)).toEqual(expected.map((d) => d.replace(/#/g, '♯').replace(/b/g, '♭')))
      p.unmount()
    })

    it('徽章用第 2 个和弦（由 currentChordIndex 决定）', () => {
      const p = mount({ currentChordIndex: 1 })
      const expected = getChordDegrees('minor', 'single_chord_tones_root', {})
      expect(p.badges()).toHaveLength(expected.length)
      p.unmount()
    })

    it('当前步的徽章是选中态（bg-primary）且不加 opacity-50', () => {
      // single_chord_tones_root 只有 ['1']，要用三音级的 level 才能验「第几步」
      const p = mount({ practiceLevel: 'three_chord_tones_root_3rd_5th', chordDegreeCurrentStep: 1 })
      const b = p.badges()
      expect(b).toHaveLength(3)
      expect(b[1].className).toContain('bg-primary')
      expect(b[1].className).not.toContain('opacity-50')
      p.unmount()
    })

    it('已走过的徽章加 opacity-50，未到的不加', () => {
      const p = mount({ practiceLevel: 'three_chord_tones_root_3rd_5th', chordDegreeCurrentStep: 2 })
      const b = p.badges()
      expect(b).toHaveLength(3)
      expect(b[0].className).toContain('opacity-50')
      expect(b[1].className).toContain('opacity-50')
      expect(b[2].className).not.toContain('opacity-50')
      expect(b[2].className).toContain('bg-primary')
      p.unmount()
    })

    it('下标越界（transposedChords 为空）时不渲染徽章，标题仍在', () => {
      const p = mount({ transposedChords: [], getCurrentChordDisplay: () => '空' })
      expect(p.badges()).toHaveLength(0)
      expect(p.text()).toContain('空')
      p.unmount()
    })
  })

  describe('下一题预览', () => {
    const next = (over: Partial<NonNullable<NextChord>> = {}): NextChord =>
      ({ index: 1, root: 'A', type: 'minor', degrees: ['1', 'b3', '5'], ...over }) as NextChord

    it('getNextChordDisplay() 返回 null 时整块不渲染', () => {
      const p = mount({ getNextChordDisplay: () => null })
      expect(p.text()).not.toContain(t('next_chord'))
      p.unmount()
    })

    it('有预览时显示「下一和弦」标签、和弦名与音级串', () => {
      const p = mount({ getNextChordDisplay: () => next({ degrees: ['1', 'b3', '5'] }) })
      expect(p.text()).toContain(t('next_chord'))
      expect(p.text()).toContain('1 ♭3 5')
      p.unmount()
    })

    it('**和弦名与 formatChordShape 完全一致**（钉住「唯一真相源」）', () => {
      const cases: NonNullable<NextChord>[] = [
        { index: 0, root: 'C', type: 'Major', degrees: ['1'] },
        { index: 1, root: 'A', type: 'minor', degrees: ['1'] },
        { index: 2, root: 'F#', type: 'm7b5', degrees: ['1'] },
        { index: 3, root: 'Db', type: '7b9', degrees: ['1'] },
        { index: 4, root: 'C', type: 'Major', bass: 'G', degrees: ['1'] },
        { index: 5, root: 'Bb', type: 'Minor', bass: 'F', degrees: ['1'] },
      ]
      for (const c of cases) {
        const p = mount({ getNextChordDisplay: () => c })
        const expected = formatChordShape(
          { root: c.root, type: c.type, bass: c.bass },
          useAppStore.getState().user.chordScaleDisplay,
          useAppStore.getState().chordSymbols,
        )
        expect(p.text(), `${c.root}${c.type}`).toContain(expected)
        p.unmount()
      }
    })

    it('大三和弦不带后缀；非大三带后缀（含 Unicode 归一化）', () => {
      const major = mount({ getNextChordDisplay: () => next({ root: 'C', type: 'Major' }) })
      expect(major.text()).toContain('C')
      major.unmount()
      // Db 的次要和弦 → 根音归一为 D♭
      const minor = mount({ getNextChordDisplay: () => next({ root: 'Db', type: 'minor' }) })
      expect(minor.text()).toContain('D♭')
      expect(minor.text()).not.toContain('Db')
      minor.unmount()
    })

    it('slash 低音跟在斜杠后', () => {
      const p = mount({ getNextChordDisplay: () => next({ root: 'C', type: 'Major', bass: 'G' }) })
      expect(p.text()).toContain('C/G')
      p.unmount()
    })

    it('音级串每个都过 formatDegree 并用空格连接', () => {
      const p = mount({ getNextChordDisplay: () => next({ degrees: ['1', 'b3', 'b5', '#11'] }) })
      expect(p.text()).toContain('1 ♭3 ♭5 ♯11')
      p.unmount()
    })

    it('和弦名跟随 store 的显示模式（jazz / english 与 chinese 不同）', () => {
      const zh = mount({ getNextChordDisplay: () => next({ root: 'C', type: 'm7b5' }) })
      const zhName = formatChordShape({ root: 'C', type: 'm7b5' }, 'chinese', useAppStore.getState().chordSymbols)
      expect(zh.text()).toContain(zhName)
      zh.unmount()

      act(() => {
        useAppStore.setState({ user: { ...useAppStore.getState().user, chordScaleDisplay: 'jazz' } })
      })
      const jazz = mount({ getNextChordDisplay: () => next({ root: 'C', type: 'm7b5' }) })
      const jazzName = formatChordShape({ root: 'C', type: 'm7b5' }, 'jazz', useAppStore.getState().chordSymbols)
      expect(jazz.text()).toContain(jazzName)
      expect(jazzName).not.toBe(zhName)
      jazz.unmount()
    })
  })
})
