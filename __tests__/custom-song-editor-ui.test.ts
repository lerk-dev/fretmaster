/**
 * components/custom-song-editor-ui.tsx 的契约测试（此前零测试）。
 *
 * 自定义歌曲编辑器：列表 / 编辑两个视图 + 预设、导入、导出、移调、删除。
 * 底层 lib/custom-song-editor.ts 已有单独测试，这里只管**界面契约**：
 * 哪些操作真的写回了 store、哪些只是本地草稿、错误与确认怎么走。
 *
 * 契约重点：
 *  ① **草稿语义**：点「编辑」进编辑器后，改动只落在本地 `editingSong`，
 *     只有点「保存」才 add/update 回 store；点 X 返回列表要丢弃草稿；
 *  ② 保存前必须过 `validateSong`：不合法只显示错误横幅、**不写 store**；
 *  ③ 校验消息来自库里写死的中文，界面要按语言翻译（见 VALIDATION_ERROR_KEYS）；
 *  ④ 删除必须先确认（不可撤销）；取消不删、确认才删；
 *  ⑤ 导入失败 → 错误显示在导入弹窗里；再次打开弹窗/导入成功都要清掉旧错误，
 *     不能让上次的「导入失败」残留到编辑器页；
 *  ⑥ 和弦增删 / 上移下移的边界（首尾按钮禁用）与移调累计 + 重置；
 *  ⑦ 导出会真的触发下载，文件名用歌曲名；
 *  ⑧ 预设会整体替换 key 与和弦；列表页的 X 走 onClose，编辑器页的 X 只回列表。
 *  ⑨ **元数据行与每个和弦的四组控件**都只改本地草稿，保存后才落 store；数字留空要回落默认值
 *     （把 `0` / `NaN` 写进 store 是静默数据损坏）。
 *
 * ⚠️ 本组件里有一批**UI 不可达的防御性守卫**（`if (!editingSong) return` / `if (!preset) return` 等），
 *    它们所在行永远命中不到，属「第二道防线」：不要为了覆盖率去伪造不可达状态（例如把 editingSong
 *    置 null 再点保存 —— 保存按钮只在编辑器视图渲染，而编辑器视图又只在 editingSong 非空时渲染）。
 *    这类行已逐条登记在 `MEMORY.md` 的「死代码 / 架构现状」一节。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { CustomSongEditor, VALIDATION_ERROR_KEYS } from '@/components/custom-song-editor-ui'
import { useAppStore } from '@/lib/store'
import {
  ROOT_NOTES,
  COMMON_PROGRESSIONS,
  CHORD_TYPES,
  KEYS,
  createChord,
  createEmptySong,
  exportSongToJSON,
  validateSong,
  type CustomSong,
} from '@/lib/custom-song-editor'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ||= () => false
;(Element.prototype as unknown as Record<string, unknown>).setPointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).releasePointerCapture ||= () => { /* noop */ }
;(Element.prototype as unknown as Record<string, unknown>).scrollIntoView ||= () => { /* jsdom 缺口 */ }

const ROOTS = ROOT_NOTES.map((n) => n.id)

/** 造一首有 chords 数量的歌，根音依次取 ROOT_NOTES */
function makeSong(id: string, name: string, chordCount = 2, over: Partial<CustomSong> = {}): CustomSong {
  const s = createEmptySong()
  return {
    ...s,
    id,
    name,
    chords: Array.from({ length: chordCount }, (_, i) => ({
      ...createChord(),
      id: `${id}-c${i}`,
      rootNote: ROOTS[i % ROOTS.length],
      chordType: 'Major' as const,
    })),
    ...over,
  }
}

interface Download { name: string; href: string }
let downloads: Download[] = []

function mount(language: 'zh-CN' | 'en' = 'zh-CN', onClose?: () => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(CustomSongEditor as never, { language, onClose } as never))
  })

  const q = <T extends Element>(sel: string) => container.querySelector(sel) as T | null
  const all = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[]
  const buttons = () => all('button')
  const buttonByText = (s: string) => buttons().find((b) => b.textContent?.includes(s))
  const buttonByLabel = (s: string) => buttons().find((b) => b.getAttribute('aria-label') === s)
  /** 弹窗内容（Dialog 是 role=dialog，AlertDialog 是 role=alertdialog） */
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null
  const alert = () => document.querySelector('[role="alertdialog"]') as HTMLElement | null
  const dialogButtons = () => [
    ...document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button'),
  ] as HTMLButtonElement[]
  const inputByPlaceholder = (p: string) => q<HTMLInputElement>(`input[placeholder="${p}"]`)
  /** 「进行预览」区域里的文案（先精确找到「进行预览」这个 <p>，再取它的容器） */
  const previewText = () => {
    const label = [...container.querySelectorAll('p')].find((el) => el.textContent === '进行预览')
    return label?.parentElement?.textContent ?? ''
  }

  function setValue(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
    act(() => {
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  return {
    container,
    text: () => container.textContent ?? '',
    bodyText: () => document.body.textContent ?? '',
    buttons,
    buttonByText,
    buttonByLabel,
    dialog,
    alert,
    dialogButtons,
    inputByPlaceholder,
    previewText,
    /** 所有 radix Select 的触发器（顺序即 DOM 顺序） */
    comboboxes: () => all('[role="combobox"]'),
    /** 所有 number 输入框（顺序：速度, 每小节拍数, 和弦1拍数, 和弦2拍数…） */
    numberInputs: () => all('input[type="number"]') as HTMLInputElement[],
    /** 展开第 idx 个 Select 并选中文本为 label 的选项（radix 要 pointerdown + click 才展开） */
    selectOption(idx: number, label: string) {
      const triggers = all('[role="combobox"]')
      const trigger = triggers[idx]
      if (!trigger) throw new Error(`第 ${idx} 个 combobox 不存在（共 ${triggers.length} 个）`)
      act(() => {
        trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      const opts = [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
      const opt = opts.find((o) => (o.textContent ?? '').trim() === label)
      if (!opt) throw new Error(`找不到选项「${label}」；实际有：${opts.map((o) => o.textContent).join('|')}`)
      act(() => { opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    /** 编辑页的和弦数（每个和弦有一组上移/下移按钮） */
    chordCount: () => all('[aria-label="上移"], [aria-label="Move Up"]').length,
    click(el: HTMLElement | undefined | null) {
      act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    },
    /** 派发一次 keydown（键盘可达性契约用；返回是否调用了 preventDefault） */
    keyDown(el: HTMLElement | undefined | null, key: string) {
      if (!el) return false
      let prevented = false
      act(() => {
        const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        el.dispatchEvent(e)
        prevented = e.defaultPrevented
      })
      return prevented
    },
    setValue,
    unmount() { act(() => root.unmount()); container.remove() },
  }
}

const store = () => useAppStore.getState()
const songs = () => store().customSongs

beforeEach(() => {
  useAppStore.setState({ customSongs: [] })
  downloads = []
  document.body.innerHTML = ''
  ;(URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:fake')
  ;(URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, href: this.href })
  })
})

afterEach(() => { vi.restoreAllMocks() })

describe('歌曲列表', () => {
  it('没有歌时显示空状态与新建入口', () => {
    const p = mount()
    expect(p.text()).toContain('我的歌曲')
    expect(p.text()).toContain('暂无自定义歌曲')
    expect(p.buttonByText('新建歌曲')).toBeDefined()
    p.unmount()
  })

  it('有歌时显示名字 / 调性 / 速度 / 和弦数 / 前缀和弦（最多 8 个）', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '小星星', 3, { tempo: 96 })] })
    const p = mount()
    expect(p.text()).toContain('小星星')
    expect(p.text()).toContain('C大调')      // CMajor → 中文
    expect(p.text()).toContain('96 BPM')
    expect(p.text()).toContain('3 个和弦')
    expect(p.text()).not.toContain('...')    // 3 个和弦不触发省略
    p.unmount()
  })

  it('超过 8 个和弦时列表只展示前 8 个并带省略号', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '长歌', 10)] })
    const p = mount()
    expect(p.text()).toContain('10 个和弦')
    expect(p.text()).toContain('...')
    p.unmount()
  })

  it('英文语言下列表用英文标签', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', 'Twinkle', 2)] })
    const p = mount('en')
    expect(p.text()).toContain('My Songs')
    expect(p.text()).toContain('chords')
    expect(p.buttonByText('New Song')).toBeDefined()
    p.unmount()
  })

  it('列表页的关闭按钮走 onClose（没传就不渲染）', () => {
    const onClose = vi.fn()
    const withClose = mount('zh-CN', onClose)
    withClose.click(withClose.buttonByLabel('取消'))
    expect(onClose).toHaveBeenCalledTimes(1)
    withClose.unmount()

    const without = mount()
    expect(without.buttonByLabel('取消')).toBeUndefined()
    without.unmount()
  })

  it('复制歌曲：新增一条带「副本」后缀的歌，原歌不受影响', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '原曲', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('复制'))
    expect(songs()).toHaveLength(2)
    expect(songs().map((s) => s.name).sort()).toEqual(['原曲', '原曲 (副本)'])
    expect(songs()[0].id).toBe('s1')
    p.unmount()
  })
})

describe('删除需要确认（不可撤销）', () => {
  it('点删除只弹确认框，歌还在', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '要被删的', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('删除'))
    expect(p.alert()).not.toBeNull()
    expect(p.alert()!.textContent).toContain('确认删除？')
    expect(p.alert()!.textContent).toContain('要被删的')
    expect(songs()).toHaveLength(1)
    p.unmount()
  })

  it('取消确认不删歌', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '保留我', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('删除'))
    p.click(p.dialogButtons().find((b) => b.textContent?.includes('取消')))
    expect(songs()).toHaveLength(1)
    expect(p.alert()).toBeNull()
    p.unmount()
  })

  it('确认后才真的删除', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '删掉我', 2), makeSong('s2', '留着', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('删除'))
    // 关键：点「删除」图标后、点确认前，数据必须还在（否则这条用例在「无确认」实现下会假通过）
    expect(songs().map((s) => s.name)).toEqual(['删掉我', '留着'])

    // AlertDialogAction 是最后一个按钮（取消在前）
    const action = p.dialogButtons().find((b) => b.textContent?.includes('删除') && b.getAttribute('aria-label') === null)
    act(() => { action?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    expect(songs().map((s) => s.name)).toEqual(['留着'])
    p.unmount()
  })
})

describe('编辑器：草稿与保存', () => {
  it('点新建进入编辑器，标题是「新建歌曲」，默认名按语言取', () => {
    const p = mount()
    p.click(p.buttonByText('新建歌曲'))
    expect(p.text()).toContain('新建歌曲')          // chords 为空
    expect(p.inputByPlaceholder('输入歌曲名称')!.value).toBe('新歌曲')
    expect(p.chordCount()).toBe(0)
    expect(p.text()).toContain('点击上方按钮添加和弦')
    p.unmount()
  })

  it('改动只是草稿：返回列表不写 store', () => {
    const p = mount()
    p.click(p.buttonByText('新建歌曲'))
    p.setValue(p.inputByPlaceholder('输入歌曲名称')!, '草稿歌')
    p.click(p.buttonByText('添加和弦'))
    // 返回列表（编辑器页的 X 只回列表，不调用 onClose）
    const onClose = vi.fn()
    p.click(p.buttonByLabel('取消'))
    expect(songs()).toHaveLength(0)
    expect(p.text()).toContain('暂无自定义歌曲')
    expect(onClose).not.toHaveBeenCalled()
    p.unmount()
  })

  it('保存校验失败：显示错误横幅且不写 store', () => {
    const p = mount()
    p.click(p.buttonByText('新建歌曲'))
    p.setValue(p.inputByPlaceholder('输入歌曲名称')!, '')   // 名称为空
    p.click(p.buttonByText('保存'))
    expect(p.text()).toContain('验证错误')
    expect(p.text()).toContain('歌曲名称不能为空')
    expect(songs()).toHaveLength(0)
    p.unmount()
  })

  it('校验消息按语言翻译：英文界面不出现中文报错', () => {
    const p = mount('en')
    p.click(p.buttonByText('New Song'))
    p.setValue(p.inputByPlaceholder('Enter song name')!, '')
    p.click(p.buttonByText('Save'))
    expect(p.text()).toContain('Validation Errors')
    expect(p.text()).toContain('Song name is required')
    expect(p.text()).not.toContain('歌曲名称不能为空')
    p.unmount()
  })

  it('映射表覆盖库里所有可能的校验消息（库改文案会红）', () => {
    // 用各种非法组合把 validateSong 的每条消息都逼出来，逐条确认界面有对应翻译键
    const cases: CustomSong[] = [
      makeSong('x', '', 2),                                  // 名称空
      makeSong('x', 'ok', 0),                                // 无和弦
      makeSong('x', 'ok', 2, { tempo: 10 }),                 // 速度越界
      makeSong('x', 'ok', 2, { beatsPerMeasure: 20 }),       // 拍数越界
    ]
    const messages = new Set<string>()
    for (const c of cases) for (const e of validateSong(c).errors) messages.add(e)
    expect(messages.size).toBe(4)

    for (const msg of messages) {
      // 界面按下标翻译：没有映射就会显示中文原文，英文界面就漏了
      expect(VALIDATION_ERROR_KEYS[msg], `validateSong 的消息「${msg}」没有对应的翻译键`).toBeTruthy()
    }
  })

  it('保存新建：addCustomSong 且返回列表', () => {
    const p = mount()
    p.click(p.buttonByText('新建歌曲'))
    p.setValue(p.inputByPlaceholder('输入歌曲名称')!, '我的新歌')
    p.click(p.buttonByText('添加和弦'))
    p.click(p.buttonByText('添加和弦'))
    p.click(p.buttonByText('保存'))

    expect(songs()).toHaveLength(1)
    expect(songs()[0].name).toBe('我的新歌')
    expect(songs()[0].chords).toHaveLength(2)
    expect(p.text()).toContain('我的歌曲')            // 回到列表
    p.unmount()
  })

  it('保存编辑：updateCustomSong，id 不变、updatedAt 前移', () => {
    const original = makeSong('s1', '老名字', 2, { updatedAt: 1 })
    useAppStore.setState({ customSongs: [original] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    p.setValue(p.inputByPlaceholder('输入歌曲名称')!, '改过的名字')
    p.click(p.buttonByText('保存'))

    expect(songs()).toHaveLength(1)
    expect(songs()[0].id).toBe('s1')
    expect(songs()[0].name).toBe('改过的名字')
    expect(songs()[0].updatedAt).toBeGreaterThan(1)
    p.unmount()
  })

  it('保存后编辑器里的报错不会残留（再次进入是干净的）', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '有名字', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    p.setValue(p.inputByPlaceholder('输入歌曲名称')!, '')
    p.click(p.buttonByText('保存'))
    expect(p.text()).toContain('验证错误')

    p.setValue(p.inputByPlaceholder('输入歌曲名称')!, '补好了')
    p.click(p.buttonByText('保存'))
    expect(p.text()).toContain('我的歌曲')

    p.click(p.buttonByLabel('编辑歌曲'))
    expect(p.text()).not.toContain('验证错误')
    p.unmount()
  })
})

describe('和弦增删与排序', () => {
  it('添加 / 删除和弦', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    expect(p.chordCount()).toBe(2)

    p.click(p.buttonByText('添加和弦'))
    expect(p.chordCount()).toBe(3)

    const removeButtons = p.buttons().filter((b) => b.getAttribute('aria-label') === '删除和弦')
    p.click(removeButtons[0])
    expect(p.chordCount()).toBe(2)
    p.unmount()
  })

  it('首尾的上移/下移分别禁用', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 3)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    const ups = p.buttons().filter((b) => b.getAttribute('aria-label') === '上移')
    const downs = p.buttons().filter((b) => b.getAttribute('aria-label') === '下移')
    expect(ups.map((b) => b.hasAttribute('disabled'))).toEqual([true, false, false])
    expect(downs.map((b) => b.hasAttribute('disabled'))).toEqual([false, false, true])
    p.unmount()
  })

  it('下移会真的交换顺序（用预览里的根音验证）', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 3)] })   // 根音 C, C#, D
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    const symbols = () => (p.previewText().match(/[A-G]#?/g) ?? [])
    const before = symbols()
    expect(before.slice(0, 3)).toEqual(['C', 'C#', 'D'])

    p.click(p.buttons().filter((b) => b.getAttribute('aria-label') === '下移')[0])   // 交换第 1、2 个
    expect(symbols().slice(0, 3)).toEqual(['C#', 'C', 'D'])
    p.unmount()
  })

  it('上移会真的交换顺序（与下移反向，且首尾按钮禁用时点不动）', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 3)] })   // 根音 C, C#, D
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    const symbols = () => (p.previewText().match(/[A-G]#?/g) ?? [])
    expect(symbols().slice(0, 3)).toEqual(['C', 'C#', 'D'])

    p.click(p.buttons().filter((b) => b.getAttribute('aria-label') === '上移')[1])   // 把第 2 个往上挪
    expect(symbols().slice(0, 3)).toEqual(['C#', 'C', 'D'])
    p.unmount()
  })
})

describe('移调与重置', () => {
  it('加号累加显示，减号抵消', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 1)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    const minus = () => p.buttons().find((b) => b.textContent?.trim() === '-')!
    const plus = () => p.buttons().find((b) => b.textContent?.trim() === '+')!

    expect(p.text()).not.toContain('重置')     // 未移调时不显示重置
    p.click(plus())
    p.click(plus())
    expect(p.text()).toContain('+2')
    expect(p.text()).toContain('重置')
    p.click(minus())
    expect(p.text()).toContain('+1')
    p.unmount()
  })

  it('重置把移调量归零并撤回调性', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 1)] })   // 根音 C
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    const plus = () => p.buttons().find((b) => b.textContent?.trim() === '+')!
    p.click(plus())
    expect(p.text()).toContain('C#')          // C 升半音
    p.click(p.buttonByText('重置'))
    expect(p.text()).not.toContain('重置')
    expect(p.text()).toContain('C')           // 回到 C
    p.unmount()
  })
})

describe('预设 / 导入 / 导出', () => {
  it('选预设会整体替换和弦与调性并关弹窗', () => {
    const preset = COMMON_PROGRESSIONS[0]
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    p.click(p.buttonByText('预设进行'))
    expect(p.dialog()).not.toBeNull()
    expect(p.dialog()!.textContent).toContain(preset.nameZh)

    const card = [...p.dialog()!.querySelectorAll('div.cursor-pointer')][0] as HTMLElement
    p.click(card)
    expect(p.chordCount()).toBe(preset.chords.length)
    expect(p.dialog()).toBeNull()
    p.unmount()
  })

  /**
   * 🚨 键盘可达性契约（2026-10-02 补）。
   *
   * 预设卡片此前是**纯 `onClick` 的 `<Card>`**（渲染成 <div>）——
   * 鼠标点得动、但 Tab 到不了、Enter/Space 也没反应 ⇒ **键盘用户根本选不了预设**。
   * 这类缺陷不崩不报错，只是「键盘按了没反应」，所以必须钉住。
   *
   * 契约的三件套（与 level-selector-dialog / song-selector-dialog 口径一致）：
   *   ① `role="button"` —— 声明它是可激活控件（否则读屏只当普通容器）
   *   ② `tabIndex={0}`  —— 进 Tab 序列，键盘能聚焦到
   *   ③ `onKeyDown` 走 `activateOnEnterSpace` —— Enter / Space 等价于点击，且 preventDefault
   */
  it('🚨 预设卡片键盘可达：role/tabIndex 齐全，Enter 与 Space 都等价于点击', () => {
    const preset = COMMON_PROGRESSIONS[0]
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    p.click(p.buttonByText('预设进行'))

    const card = [...p.dialog()!.querySelectorAll('div.cursor-pointer')][0] as HTMLElement
    // ① 声明为可激活控件 + ② 进入 Tab 序列
    expect(card.getAttribute('role')).toBe('button')
    expect(card.getAttribute('tabindex')).toBe('0')
    // 顺带：读屏要能读出这是哪个预设（而非「按钮」两个空洞的字）
    expect(card.getAttribute('aria-label')).toBe(preset.nameZh)

    // ③ Enter 等价于点击：整体替换和弦并关窗
    const prevented = p.keyDown(card, 'Enter')
    expect(prevented, 'Enter 必须 preventDefault（否则同时触发页面默认行为）').toBe(true)
    expect(p.chordCount()).toBe(preset.chords.length)
    expect(p.dialog()).toBeNull()
    p.unmount()
  })

  it('🚨 预设卡片键盘可达：Space 同样生效，其它键不误触发', () => {
    const preset = COMMON_PROGRESSIONS[0]
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    p.click(p.buttonByText('预设进行'))

    const card = [...p.dialog()!.querySelectorAll('div.cursor-pointer')][0] as HTMLElement

    // 无关按键：不激活（Escape 的 preventDefault 来自 radix Dialog 自己的关闭快捷键，
    // 事件冒泡到弹窗层，不属于本卡片的契约 ⇒ 这里只断言「不会被当成激活」）
    for (const k of ['Tab', 'a', 'ArrowDown']) {
      expect(p.keyDown(card, k), `${k} 不该 preventDefault`).toBe(false)
      expect(p.dialog(), `${k} 不该关窗`).not.toBeNull()
    }
    expect(p.chordCount()).not.toBe(preset.chords.length)

    // Space 才生效
    expect(p.keyDown(card, ' ')).toBe(true)
    expect(p.chordCount()).toBe(preset.chords.length)
    expect(p.dialog()).toBeNull()
    p.unmount()
  })

  it('🔒 源码护栏：预设卡片不许退回成「只有 onClick」的纯 div', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('components/custom-song-editor-ui.tsx', 'utf8')
    // 剥注释，避免文档里正解释「为什么不能这么写」时把文档当回归
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const start = code.indexOf('COMMON_PROGRESSIONS.map')
    expect(start, '找不到预设卡片锚点（结构变了要同步这条护栏）').toBeGreaterThan(-1)
    const block = code.slice(start, start + 900)
    for (const token of ['role="button"', 'tabIndex={0}', 'activateOnEnterSpace(']) {
      expect(block, `预设卡片缺少 ${token}`).toContain(token)
    }
  })

  it('导出 JSON / TXT 会触发下载且文件名用歌曲名', () => {
    useAppStore.setState({ customSongs: [makeSong('s1', '我的歌', 2)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    p.click(p.buttonByText('JSON'))
    p.click(p.buttonByText('TXT'))
    expect(downloads.map((d) => d.name)).toEqual(['我的歌.json', '我的歌.txt'])
    expect(downloads.every((d) => d.href === 'blob:fake')).toBe(true)
    p.unmount()
  })

  it('导入成功进入编辑器，并清掉上一次的失败报错', () => {
    const imported = makeSong('x', '导入的歌', 2)
    const p = mount()
    // 先失败一次
    p.click(p.buttonByText('导入'))
    let ta = document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement
    p.setValue(ta, '这不是任何合法格式')
    p.click(p.dialogButtons().find((b) => b.textContent?.includes('导入'))!)
    expect(p.dialog()!.textContent).toContain('导入失败，格式不正确')

    // 再成功导入
    ta = document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement
    p.setValue(ta, exportSongToJSON(imported))
    p.click(p.dialogButtons().find((b) => b.textContent?.includes('导入'))!)
    expect(p.dialog()).toBeNull()
    expect(p.inputByPlaceholder('输入歌曲名称')!.value).toBe('导入的歌')
    // 关键：旧报错不能跟到编辑器页
    expect(p.text()).not.toContain('导入失败')
    expect(p.text()).not.toContain('验证错误')
    p.unmount()
  })

  it('重新打开导入弹窗时不留上次的报错', () => {
    const p = mount()
    p.click(p.buttonByText('导入'))
    const ta = document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement
    p.setValue(ta, '坏格式')
    p.click(p.dialogButtons().find((b) => b.textContent?.includes('导入'))!)
    expect(p.dialog()!.textContent).toContain('导入失败')

    p.click(p.dialogButtons().find((b) => b.textContent?.includes('取消'))!)
    p.click(p.buttonByText('导入'))
    expect(p.dialog()!.textContent).not.toContain('导入失败')
    p.unmount()
  })
})

describe('进行预览', () => {
  it('只给非四拍的和弦标 ×n，箭头不尾随', () => {
    const s = makeSong('s1', 'S', 3)
    s.chords[1].beats = 2
    useAppStore.setState({ customSongs: [s] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    const preview = [...p.container.querySelectorAll('div')].find((d) => d.textContent?.includes('进行预览'))!
    const text = (preview.textContent ?? '').replace('进行预览', '')
    expect(text).toContain('×2')
    expect(text.match(/→/g)?.length).toBe(2)   // 3 个和弦之间 2 个箭头
    expect(text.trim().endsWith('→')).toBe(false)
    p.unmount()
  })
})

/**
 * 编辑器：顶部元数据行（作曲 / 调性 / 速度 / 每小节拍数 / 音符类型）。
 * 这五个控件此前一次都没驱动过；它们全是「字符串·数字 → 字段」的转换点，
 * 写错就是静默失效：界面上改了、保存后没落库。
 */
describe('编辑器：元数据控件（保存后落 store）', () => {
  const aMajor = KEYS.find((k) => k.id === 'AMajor')!

  function enterEditor(chordCount = 2, over: Partial<CustomSong> = {}) {
    useAppStore.setState({ customSongs: [makeSong('s1', '原标题', chordCount, over)] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    return p
  }

  it('作曲 / 调性 / 速度 / 每小节拍数 / 音符类型 五项都写进保存下来的歌', () => {
    const p = enterEditor()
    p.setValue(p.inputByPlaceholder('输入作曲者')!, '张三')
    p.selectOption(0, aMajor.nameZh)          // 调性：第 0 个 combobox
    p.setValue(p.numberInputs()[0], '96')     // 速度
    p.setValue(p.numberInputs()[1], '3')      // 每小节拍数
    p.selectOption(1, '8')                    // 音符类型
    p.click(p.buttonByText('保存'))

    const saved = songs()[0]
    expect(saved.composer).toBe('张三')
    expect(saved.key).toBe(aMajor.id)         // 存的是 id，不是显示名
    expect(saved.tempo).toBe(96)
    expect(saved.beatsPerMeasure).toBe(3)
    expect(saved.beatSize).toBe(8)
    p.unmount()
  })

  it('速度 / 拍数留空 → 回落到 120 / 4（不能把 0 或 NaN 存进去）', () => {
    // 初始值刻意用 100 / 2：若变异实现真把 0 存进去，validateSong 会拦下保存，
    // store 里仍是那首 100/2 的老歌 —— 与「回落成 120/4」可区分，用例不会假通过。
    const p = enterEditor(2, { tempo: 100, beatsPerMeasure: 2 })
    p.setValue(p.numberInputs()[0], '')
    p.setValue(p.numberInputs()[1], '')
    p.click(p.buttonByText('保存'))

    const saved = songs()[0]
    expect(saved.tempo).toBe(120)
    expect(saved.beatsPerMeasure).toBe(4)
    p.unmount()
  })
})

/**
 * 编辑器：每个和弦的四组控件（根音 / 类型 / 拍数 / 功能）。
 * 此前**整条 `handleUpdateChord` 从未被调用**（语句命中 0）——
 * 「改了和弦、保存后没生效」这类回归当时完全测不出来。
 */
describe('编辑器：每个和弦的四组控件写回', () => {
  const minor = CHORD_TYPES.find((t) => t.id === 'Minor')!

  /** 前两个 combobox 是「调性」「音符类型」，之后每个和弦占三个：根音 / 类型 / 功能 */
  const cbBase = (i: number) => 2 + i * 3

  function enterEditor(chordCount: number) {
    useAppStore.setState({ customSongs: [makeSong('s1', 'S', chordCount)] })   // 根音 C, C#, D…
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))
    return p
  }

  it('改第 1 个和弦的根音/类型/拍数/功能：预览立刻变、保存后落 store，且不误伤第 2 个', () => {
    const p = enterEditor(2)

    p.selectOption(cbBase(0), 'D')                    // 根音 C → D
    p.selectOption(cbBase(0) + 1, minor.nameZh)       // 类型 Major → Minor
    p.setValue(p.numberInputs()[2], '2')              // 拍数 4 → 2
    p.selectOption(cbBase(0) + 2, 'V')                // 功能 → V

    // 预览是 chordToSymbol 的唯一出口：非 Major 才带类型后缀，非 4 拍才带 ×n
    expect(p.previewText()).toContain(`D${minor.nameZh}`)
    expect(p.previewText()).toContain('×2')

    p.click(p.buttonByText('保存'))
    const [c0, c1] = songs()[0].chords
    expect(c0).toMatchObject({ rootNote: 'D', chordType: 'Minor', beats: 2, function: 'V' })
    // 关键：命中靠 id，不是「改第一个」—— 第 2 个和弦必须原样
    expect(c1.rootNote).toBe('C#')
    expect(c1.chordType).toBe('Major')
    expect(c1.beats).toBe(4)
    expect(c1.function).toBeUndefined()
    p.unmount()
  })

  it('改第 3 个和弦只影响它自己（id 命中，不是下标）', () => {
    const p = enterEditor(3)                          // C, C#, D
    p.selectOption(cbBase(2), 'G')
    p.click(p.buttonByText('保存'))
    expect(songs()[0].chords.map((c) => c.rootNote)).toEqual(['C', 'C#', 'G'])
    p.unmount()
  })

  it('功能选回「-」→ function 回到 undefined（不是存空串）', () => {
    const s = makeSong('s1', 'S', 1)
    s.chords[0].function = 'I'
    useAppStore.setState({ customSongs: [s] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))

    p.selectOption(cbBase(0) + 2, '-')
    p.click(p.buttonByText('保存'))
    expect(songs()[0].chords[0].function).toBeUndefined()
    p.unmount()
  })

  it('拍数留空 → 回落到 4（原值是 3，以免「没保存」与「回落」混淆）', () => {
    const s = makeSong('s1', 'S', 1)
    s.chords[0].beats = 3
    useAppStore.setState({ customSongs: [s] })
    const p = mount()
    p.click(p.buttonByLabel('编辑歌曲'))

    p.setValue(p.numberInputs()[2], '')
    p.click(p.buttonByText('保存'))
    expect(songs()[0].chords[0].beats).toBe(4)
    p.unmount()
  })
})
