/**
 * ChordStructureWindow —— 和弦进行信息浮动窗契约测试
 *
 * memo 的受控展示组件：显示内容来自 props，位移与拖拽状态由父层持有
 * （`chordStructurePosition` + `dragRef`），拖拽入口回调 `handleDragStart`。
 *
 * 除了展示契约，本轮还修了一个 a11y 缺陷（与本会话更早的调音器同类）：
 * 关闭按钮的 `aria-label` 此前是**硬编码中文**，英文界面下屏幕阅读器仍念中文。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChordStructureWindow } from '@/components/chord-structure-window'
import { formatChordName } from '@/lib/page-theory-functions'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const tZh = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k
const tEn = (k: string) => (TRANSLATIONS['en'] as Record<string, string>)[k] ?? k

type Song = (typeof SONG_PROGRESSIONS)[number]
type DragState = {
  isDragging: boolean
  startX: number
  startY: number
  initialX: number
  initialY: number
  target: 'chord' | 'scale' | 'chordExercise' | null
}

const SONG: Song = { name: 'Autumn Leaves', key: 'Gm', chords: [] } as unknown as Song

type Props = Record<string, unknown>
let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(props: Props = {}) {
  const calls: Record<string, unknown[]> = {}
  const track = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args.length > 1 ? args : args[0])
  }
  const dragRef = { current: { isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0, target: null } as DragState }
  const base: Props = {
    t: tZh,
    language: 'zh-CN',
    showChordStructure: true,
    onShowChordStructureChange: track('showChange'),
    chordStructurePosition: { x: 0, y: 0 },
    onChordStructurePositionChange: vi.fn(),
    dragRef,
    handleDragStart: track('dragStart'),
    progressionKey: 'G',
    isMinor: true,
    selectedSong: SONG,
    transposedChords: [
      { root: 'C', type: 'm7' },
      { root: 'F', type: '7' },
      { root: 'Bb', type: 'Maj7' },
    ],
    currentChordIndex: 1,
    ...props,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(ChordStructureWindow as never, base as never))
  })
  const text = () => container!.textContent ?? ''
  const badges = () => [...container!.querySelectorAll('[data-slot="badge"]')] as HTMLElement[]
  const dragHandle = () =>
    container!.querySelector('[role="button"]') as HTMLElement
  const closeBtn = () =>
    [...container!.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') !== null && b.querySelector('svg'),
    ) as HTMLButtonElement
  const outer = () => container!.firstElementChild as HTMLElement
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { rootEl: () => container!, dragRef, calls, text, badges, dragHandle, closeBtn, outer, unmount }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ChordStructureWindow', () => {
  describe('基本信息', () => {
    it('标题、调性、歌曲三行的标签走 t()', () => {
      const p = mount()
      expect(p.text()).toContain(tZh('chord_progression_info'))
      expect(p.text()).toContain(tZh('select_key'))
      expect(p.text()).toContain(tZh('select_song'))
      expect(p.text()).toContain(tZh('chord_progression'))
      p.unmount()
    })

    it('调性 = 调 + 大调/小调，语言与 isMinor 双维', () => {
      const zhMinor = mount({ isMinor: true, progressionKey: 'G' })
      expect(zhMinor.text()).toContain('G小调')
      zhMinor.unmount()
      const zhMajor = mount({ isMinor: false, progressionKey: 'C' })
      expect(zhMajor.text()).toContain('C大调')
      zhMajor.unmount()
      const enMinor = mount({ language: 'en', t: tEn, isMinor: true })
      expect(enMinor.text()).toContain('G minor')
      enMinor.unmount()
      const enMajor = mount({ language: 'en', t: tEn, isMinor: false })
      expect(enMajor.text()).toContain('G Major')
      enMajor.unmount()
    })

    it('选中歌曲显示名字；__custom__ 显示自定义占位', () => {
      const named = mount()
      expect(named.text()).toContain('Autumn Leaves')
      named.unmount()
      const custom = mount({ selectedSong: { ...SONG, name: '__custom__' } as Song })
      expect(custom.text()).toContain(tZh('chord_custom'))
      expect(custom.text()).not.toContain('__custom__')
      custom.unmount()
    })
  })

  describe('和弦序列', () => {
    it('每个和弦一个徽章，用 formatChordName 渲染（含 slash 低音）', () => {
      const chords = [
        { root: 'C', type: 'Major', bass: 'G' },
        { root: 'A', type: 'm7' },
        { root: 'F#', type: '7b9' },
      ]
      const p = mount({ transposedChords: chords })
      const b = p.badges()
      expect(b).toHaveLength(3)
      expect(b.map((x) => x.textContent)).toEqual(chords.map((c) => formatChordName(c, tZh)))
      expect(b[0].textContent).toBe('C/G')
      expect(b[2].textContent).toContain('♯')
      p.unmount()
    })

    it('当前和弦（currentChordIndex）是选中态 bg-primary，其余 secondary', () => {
      const p = mount({ currentChordIndex: 1 })
      const b = p.badges()
      expect(b[1].className).toContain('bg-primary')
      expect(b[0].className).not.toContain('bg-primary')
      expect(b[2].className).not.toContain('bg-primary')
      p.unmount()
    })

    it('下标越界时没有任何徽章是选中态', () => {
      const p = mount({ currentChordIndex: 99 })
      expect(p.badges().every((b) => !b.className.includes('bg-primary'))).toBe(true)
      p.unmount()
    })

    it('空序列時不渲染徽章', () => {
      const p = mount({ transposedChords: [] })
      expect(p.badges()).toHaveLength(0)
      p.unmount()
    })
  })

  describe('关闭按钮', () => {
    it('点击回传 onShowChordStructureChange(false)', () => {
      const p = mount()
      act(() => {
        p.closeBtn().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      expect(p.calls.showChange).toEqual([false])
      p.unmount()
    })

    it('**aria-label 走 t() 并跟随语言**（钉住本次修复：此前硬编码中文）', () => {
      const zh = mount()
      expect(zh.closeBtn().getAttribute('aria-label')).toBe(tZh('chord_structure_close_label'))
      expect(zh.closeBtn().getAttribute('aria-label')).toBe('关闭和弦进行信息')
      zh.unmount()
      const en = mount({ language: 'en', t: tEn })
      expect(en.closeBtn().getAttribute('aria-label')).toBe('Close chord progression info')
      en.unmount()
    })
  })

  describe('拖拽手柄', () => {
    it('是 role=button + tabIndex=0，aria-label 走 t()', () => {
      const p = mount()
      const h = p.dragHandle()
      expect(h.getAttribute('role')).toBe('button')
      expect(h.getAttribute('tabindex')).toBe('0')
      expect(h.getAttribute('aria-label')).toBe(tZh('chord_structure_drag_hint'))
      p.unmount()
    })

    it('mousedown / touchstart 都以 chord 为目标调用 handleDragStart', () => {
      const p = mount()
      act(() => {
        p.dragHandle().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      })
      expect(p.calls.dragStart).toHaveLength(1)
      // track 对多参数回调记录整个 args 数组 → 取第二个参数（target）
      expect((p.calls.dragStart[0] as unknown[])[1]).toBe('chord')
      p.unmount()
      // 触摸同理
      const t2 = mount()
      act(() => {
        t2.dragHandle().dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }))
      })
      expect(t2.calls.dragStart).toHaveLength(1)
      expect((t2.calls.dragStart[0] as unknown[])[1]).toBe('chord')
      t2.unmount()
    })
  })

  describe('键盘移动', () => {
    function press(p: ReturnType<typeof mount>, key: string, shift = false) {
      const ev = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true })
      act(() => {
        p.dragHandle().dispatchEvent(ev)
      })
      return ev
    }

    it('四个方向与步长（含 Shift）', () => {
      const pos = { x: 100, y: 100 }
      const onPos = vi.fn((updater: (q: { x: number; y: number }) => { x: number; y: number }) => updater(pos))
      const p = mount({ onChordStructurePositionChange: onPos, chordStructurePosition: pos })

      press(p, 'ArrowLeft')
      expect(onPos).toHaveBeenLastCalledWith(expect.any(Function))
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: 95, y: 100 })
      press(p, 'ArrowRight')
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: 105, y: 100 })
      press(p, 'ArrowUp')
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: 100, y: 95 })
      press(p, 'ArrowDown')
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: 100, y: 105 })
      p.unmount()
    })

    it('Shift + 方向键步长为 20px', () => {
      const pos = { x: 0, y: 0 }
      const onPos = vi.fn((updater: (q: { x: number; y: number }) => { x: number; y: number }) => updater(pos))
      const p = mount({ onChordStructurePositionChange: onPos, chordStructurePosition: pos })
      press(p, 'ArrowRight', true)
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: 20, y: 0 })
      press(p, 'ArrowDown', true)
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: 0, y: 20 })
      p.unmount()
    })

    it('方向键会 preventDefault；其它键不移动也不阻止默认', () => {
      const onPos = vi.fn()
      const p = mount({ onChordStructurePositionChange: onPos })
      expect(press(p, 'ArrowLeft').defaultPrevented).toBe(true)
      expect(press(p, 'a').defaultPrevented).toBe(false)
      expect(press(p, 'Tab').defaultPrevented).toBe(false)
      expect(onPos).toHaveBeenCalledTimes(1)
      p.unmount()
    })

    it('向上/向左可为负位移（面板自由移动，不夹取）', () => {
      const pos = { x: 0, y: 0 }
      const onPos = vi.fn((updater: (q: { x: number; y: number }) => { x: number; y: number }) => updater(pos))
      const p = mount({ onChordStructurePositionChange: onPos, chordStructurePosition: pos })
      press(p, 'ArrowLeft', true)
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: -20, y: 0 })
      press(p, 'ArrowUp', true)
      expect(onPos.mock.results.at(-1)!.value).toEqual({ x: 0, y: -20 })
      p.unmount()
    })
  })

  describe('位移与光标', () => {
    it('外层 transform 用当前位移；光标在拖拽 chord 时变 grabbing', () => {
      const p = mount({ chordStructurePosition: { x: 12, y: -34 } })
      expect(p.outer().style.transform).toBe('translate(12px, -34px)')
      expect(p.outer().style.cursor).toBe('default')
      p.dragRef.current.isDragging = true
      p.dragRef.current.target = 'chord'
      act(() => {
        root!.render(
          createElement(ChordStructureWindow as never, {
            t: tZh,
            language: 'zh-CN',
            showChordStructure: true,
            onShowChordStructureChange: () => {},
            chordStructurePosition: { x: 12, y: -34 },
            onChordStructurePositionChange: () => {},
            dragRef: p.dragRef,
            handleDragStart: () => {},
            progressionKey: 'G',
            isMinor: true,
            selectedSong: SONG,
            transposedChords: [],
            currentChordIndex: 0,
          } as never),
        )
      })
      expect(p.outer().style.cursor).toBe('grabbing')
      p.unmount()
    })

    it('拖的是别的窗口时不显示 grabbing', () => {
      const p = mount()
      p.dragRef.current.isDragging = true
      p.dragRef.current.target = 'scale'
      act(() => {
        root!.render(
          createElement(ChordStructureWindow as never, {
            t: tZh,
            language: 'zh-CN',
            showChordStructure: true,
            onShowChordStructureChange: () => {},
            chordStructurePosition: { x: 0, y: 0 },
            onChordStructurePositionChange: () => {},
            dragRef: p.dragRef,
            handleDragStart: () => {},
            progressionKey: 'G',
            isMinor: true,
            selectedSong: SONG,
            transposedChords: [],
            currentChordIndex: 0,
          } as never),
        )
      })
      expect(p.outer().style.cursor).toBe('default')
      p.unmount()
    })
  })
})
