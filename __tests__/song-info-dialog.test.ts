/**
 * SongInfoDialog —— 乐曲信息弹窗契约测试
 *
 * 受控 Dialog（open / song / 回调全来自 props，内容 portal 到 document.body），memo 包裹。
 * 全部字段都是「有值显示原值、缺值显示兜底文案」的展示契约。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SongInfoDialog, type SongInfo } from '@/components/song-info-dialog'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'
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

function song(over: Partial<SongInfo> = {}): SongInfo {
  return {
    name: 'Autumn Leaves',
    composer: 'Joseph Kosma',
    year: '1945',
    style: 'Medium',
    tempo: 'Medium',
    key: 'Gm',
    chords: ['Cm7', 'F7', 'BbMaj7', 'EbMaj7'],
    ...over,
  } as SongInfo
}

type Props = Record<string, unknown>
let root: Root | null = null

function mount(props: Props = {}) {
  const calls: Record<string, unknown[]> = {}
  const track = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args.length > 1 ? args : args[0])
  }
  const base: Props = {
    open: true,
    onOpenChange: track('openChange'),
    song: song(),
    onConfirm: track('confirm'),
    t: tZh,
    ...props,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(SongInfoDialog as never, base as never))
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
  const unmount = () => {
    act(() => root?.unmount())
    container.remove()
    root = null
  }
  return { container, calls, docText, buttons, btn, click, unmount }
}

afterEach(() => {
  document.body.innerHTML = ''
})
beforeEach(() => {
  vi.clearAllMocks()
})

describe('SongInfoDialog', () => {
  describe('标题与字段标签', () => {
    it('标题与 sr-only 描述都是曲名', () => {
      const p = mount()
      expect(p.docText()).toContain('Autumn Leaves')
      p.unmount()
    })

    it('六个字段标签齐全', () => {
      const p = mount()
      for (const k of ['song_composer', 'song_year', 'song_style', 'song_tempo', 'song_key', 'chord_count']) {
        expect(p.docText(), `${k} 标签应显示`).toContain(tZh(k))
      }
      p.unmount()
    })

    it('英文模式下标签取英文', () => {
      const p = mount({ t: tEn })
      expect(p.docText()).toContain(tEn('song_composer'))
      expect(p.docText()).toContain(tEn('chord_progression'))
      p.unmount()
    })
  })

  describe('字段取值', () => {
    it('有值时显示原值', () => {
      const p = mount({ song: song({ composer: 'Jerome Kern', year: '1933', key: 'Eb' }) })
      expect(p.docText()).toContain('Jerome Kern')
      expect(p.docText()).toContain('1933')
      expect(p.docText()).toContain('Eb')
      p.unmount()
    })

    it('composer / year / tempo / key 为空时显示「未知」', () => {
      const p = mount({ song: song({ composer: '', year: '', tempo: '', key: '' }) })
      // 四处都应显示 unknown
      const count = p.docText().split(tZh('unknown')).length - 1
      expect(count).toBeGreaterThanOrEqual(4)
      p.unmount()
    })

    it('style 为空时显示「爵士标准曲」（不是「未知」）', () => {
      const p = mount({ song: song({ style: '' }) })
      expect(p.docText()).toContain(tZh('jazz_standard'))
      p.unmount()
    })

    it('和弦数 = chords.length，并带「和弦」量词', () => {
      const p = mount({ song: song({ chords: ['C', 'F', 'G'] }) })
      expect(p.docText()).toContain(`3 ${tZh('chords')}`)
      p.unmount()
    })

    it('和弦进行用 " - " 连接', () => {
      const p = mount({ song: song({ chords: ['Cm7', 'F7', 'BbMaj7'] }) })
      expect(p.docText()).toContain('Cm7 - F7 - BbMaj7')
      p.unmount()
    })

    it('chords 为空数组 → 和弦数 0 且进行显示「无和弦」', () => {
      const p = mount({ song: song({ chords: [] }) })
      expect(p.docText()).toContain(`0 ${tZh('chords')}`)
      expect(p.docText()).toContain(tZh('no_chords'))
      p.unmount()
    })
  })

  describe('song=null / open=false', () => {
    it('song=null：正文不渲染，页脚仍在', () => {
      const p = mount({ song: null })
      expect(p.docText()).not.toContain(tZh('song_composer'))
      expect(p.docText()).not.toContain(tZh('chord_progression'))
      expect(p.btn(tZh('select_this_song'))).toBeTruthy()
      expect(p.btn(tZh('btn_close'))).toBeTruthy()
      p.unmount()
    })

    it('open=false：不渲染正文', () => {
      const p = mount({ open: false })
      expect(p.docText()).not.toContain(tZh('song_composer'))
      p.unmount()
    })
  })

  describe('页脚按钮', () => {
    it('「选择此曲」→ 先 onConfirm(song)、再 onOpenChange(false)', () => {
      const s = song()
      const p = mount({ song: s })
      p.click(p.btn(tZh('select_this_song')))
      expect(p.calls.confirm).toEqual([s])
      expect(p.calls.openChange).toEqual([false])
      p.unmount()
    })

    it('song=null 时也回传 null（由调用方判空）', () => {
      const p = mount({ song: null })
      p.click(p.btn(tZh('select_this_song')))
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

  describe('真实曲库抽样', () => {
    it('任取 5 首真实曲目都能渲染出曲名与全部标签', () => {
      for (const s of SONG_PROGRESSIONS.slice(0, 5)) {
        const p = mount({ song: s as SongInfo })
        expect(p.docText()).toContain(s.name)
        expect(p.docText()).toContain(tZh('chord_progression'))
        expect(p.docText()).toContain(`${s.chords.length} ${tZh('chords')}`)
        p.unmount()
      }
    })
  })
})
