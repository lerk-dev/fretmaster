/**
 * 指板标记「唯一真相源」护栏（2026-10-01）。
 *
 * 背景：`components/practice-fretboard.tsx` 是从巨石抽出来的指板标记实现（弦分隔线 +
 * 空弦/各品按钮 + 品数行），但 `components/fullscreen-overlay.tsx` 当时**自带第二份内联复制**，
 * 并且已经漂移 5 处 —— 全是「不报错、只在全屏里画错」：
 *
 *   | 维度 | 共享组件 | 全屏副本（已删） |
 *   |---|---|---|
 *   | 列最小宽 | `min-w-[20px] sm:min-w-[28px]` | `min-w-[24px] sm:min-w-[32px]` |
 *   | 空弦列宽 | `flex-[0.8]` | `flex-1` |
 *   | 格字号 | `text-[8px] sm:text-[10px]` | `text-[10px] sm:text-xs` |
 *   | `data-role` | 每格都有 | **一个都没有** |
 *   | 格子文字 | 音级（题目格）/ 音名 | 恒音名，**不显示音级** |
 *
 * 后果实测（无头 Chrome + CDP，360px 视口）：16 列 × 24px = 384px，而全屏宽列可用 326px
 * ⇒ 被 `overflow-hidden` 裁掉右侧约 2 个品（品号到 13 就断）。桌面 430px 以上才刚好够。
 *
 * 本文件干两件事：
 *  ① **源码护栏**：全屏必须复用共享组件，且不得再出现任何「自带指板标记」的特征物；
 *  ② **行为护栏**：`embedded` 只给指板主体（不套 `Card` / 不落 `data-onboarding`），默认模式带外壳。
 *
 * 逐格差分（全屏 ≡ 主指板）在 `__tests__/fullscreen-overlay.test.ts`。
 *
 * ⚠️ 负向断言扫源码前**必须剥注释**：本文件与源码里的说明性注释就会提到这些特征物
 * （在解释「为什么不能这么写」），不剥注释会把文档当成回归（本仓已踩过同一个坑）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PracticeFretboard } from '@/components/practice-fretboard'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'
import { SCALE_MODES } from '@/lib/page-theory-data'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const tZh = (k: string) => zh[k] ?? k

const FS_SRC = readFileSync('components/fullscreen-overlay.tsx', 'utf8')
const BOARD_SRC = readFileSync('components/practice-fretboard.tsx', 'utf8')

/** 去掉 JSX 注释 / 块注释 / 行注释 —— 否则「解释为什么不能这么写」的文档会被当成缺陷 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* … */
    .replace(/^\s*\/\/.*$/gm, '') // // …
}

/**
 * 返回「这份源码自带了一份指板标记」的违规描述；空数组 = 干净。
 *
 * 判据取自旧副本的可辨认特征物（每一条都对应上表里的一个漂移维度），而不是「像不像」。
 * 抽成函数是为了给它写**自测** —— 用旧副本原文喂进去必须逐条报出来，
 * 否则这些 `.not.toContain` 可能只是恒真断言（本仓踩过护栏恒真的坑）。
 */
function boardCopyDefects(src: string): string[] {
  const clean = stripComments(src)
  const bad: string[] = []
  if (/min-w-\[\d+px\]/.test(clean)) bad.push('自带格子最小列宽 `min-w-[…]`')
  if (/fretboard_position_label/.test(clean)) bad.push('自己拼指板 aria-label（`fretboard_position_label`）')
  if (/relative rounded-lg overflow-hidden/.test(clean)) bad.push('自带指板外壳（`relative rounded-lg overflow-hidden`）')
  if (/flex-1 flex\b/.test(clean)) bad.push('自带「空弦 + 各品」按钮行（`flex-1 flex`）')
  return bad
}

const mounted: Array<{ unmount: () => void }> = []

afterEach(() => {
  for (const m of mounted.splice(0)) {
    try { m.unmount() } catch { /* 拆树失败不掩盖真实断言 */ }
  }
  document.body.innerHTML = ''
})

/**
 * `embedded` 传 `undefined` = **省略该 prop**（走组件默认值）—— 主区 `app/page.tsx` 就是这条路。
 * 🚨 必须覆盖：早先这个函数永远显式传 `embedded`，于是把默认值改成 `true` 也没人发现
 * （变异 M2 咬 0），而真改坏了主指板会多套一层 Card。
 */
function mountBoard(embedded?: boolean) {
  const state = useAppStore.getState()
  act(() => {
    useAppStore.setState({
      activeTab: 'chord',
      isPlaying: true,
      practice: { ...state.practice, fretCount: 15 },
      user: { ...state.user, instrument: 'six_string_guitar', fretboardStyle: 'classic' },
    })
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const props: Record<string, unknown> = {
    t: tZh,
    formatNoteByAccidentalSetting: (n: string) => n,
    handleFretClick: () => {},
    getNoteButtonColor: () => '',
    showAllNotes: false,
    highlightedFrets: new Map<string, boolean>(),
    selectedStrings: [] as number[],
    rootNote: 'E',
    selectedIntervals: [] as number[],
    scaleKey: 'E',
    selectedScale: SCALE_MODES.pentatonic[0],
    scaleExerciseSequence: [] as string[],
    transposedChords: [{ root: 'C', type: 'Major' }],
    currentChordIndex: 0,
    chordExerciseTargetChord: null,
    targetNote: 'E',
    practiceAnswerMode: 'fretboard',
    highlightedTargetPosition: null,
    threeNpsTarget: null,
    threeNpsCellKeys: new Map<string, unknown>(),
    showChordFretboard: true,
    showScaleFretboard: false,
    showIntervalFretboard: false,
    showChordExerciseFretboard: false,
    FRET_MARKERS: [3, 5, 7, 9, 12, 15],
  }
  if (embedded !== undefined) props.embedded = embedded
  act(() => { root.render(createElement(PracticeFretboard as never, props as never)) })
  mounted.push({ unmount: () => { act(() => root.unmount()); host.remove() } })
  return host
}

describe('源码护栏：指板标记只有一个实现（2026-10-01 去重）', () => {
  it('全屏覆盖层复用共享组件（`PracticeFretboard embedded`）', () => {
    expect(FS_SRC, '要 import 共享组件').toContain("from '@/components/practice-fretboard'")
    expect(FS_SRC, '经典皮肤分支要渲染 <PracticeFretboard>').toContain('<PracticeFretboard')
    // ⚠️ 收紧到「简写 `embedded` 后面跟空白/`>`」：`\s+embedded` 这种松散写法连
    // `embedded={false}`（＝又套回 Card 外壳）都能匹配上 ⇒ 变异能溜过去。实测确认过。
    expect(FS_SRC, '必须走无外壳模式（全屏自带宽列，不要再套一层 Card）').toMatch(/<PracticeFretboard\s+embedded(?=[\s>])/)
    // GuitarRun 皮肤先例：两个分支都复用组件，而不是各写一份
    expect(FS_SRC, 'GuitarRun 皮肤也早就复用了组件').toContain('<GuitarRunFretboard')
  })

  it('全屏覆盖层里**不再**有任何「自带指板标记」的特征物', () => {
    expect(boardCopyDefects(FS_SRC), '全屏自带第二份指板标记').toEqual([])
  })

  it('护栏自测：把旧副本原文喂进去必须逐条报出来（否则上面那条是恒真）', () => {
    // 取自被删掉的那段真实代码（每个特征物一条）
    const oldCopy = `
      <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
        <div className="flex-1 flex">
          <button
            aria-label={t('fretboard_position_label').replace('{string}', String(stringIndex + 1))}
            className={cn("flex-1 h-8 sm:h-10 text-[10px] sm:text-xs min-w-[24px] sm:min-w-[32px]")}
          >
            <span>{formatNoteByAccidentalSetting(note)}</span>
          </button>
        </div>
      </div>`
    const defects = boardCopyDefects(oldCopy)
    expect(defects.length, '四个特征物都要被报出来').toBe(4)
    expect(defects.join(' / ')).toContain('min-w-[…]')
    expect(defects.join(' / ')).toContain('fretboard_position_label')
    expect(defects.join(' / ')).toContain('relative rounded-lg overflow-hidden')
    expect(defects.join(' / ')).toContain('flex-1 flex')
  })

  it('护栏自测：剥注释这一步真的在起作用（注释里提到特征物不算缺陷）', () => {
    expect(boardCopyDefects('// 这里不能再写 min-w-[24px] 那种副本\nconst a = 1')).toEqual([])
    expect(boardCopyDefects('/* 也不能写 relative rounded-lg overflow-hidden */\nconst a = 1')).toEqual([])
    expect(boardCopyDefects('{/* 注释里的 fretboard_position_label */}\nconst a = 1')).toEqual([])
    // 反例：注释剥掉后真代码里还有 ⇒ 必须报
    expect(boardCopyDefects('// 说明\nconst x = "min-w-[24px]"').length).toBe(1)
  })

  it('共享组件自己当然要有这些特征物（证明判据指向的是「第二份」而不是「不许有」）', () => {
    const defects = boardCopyDefects(BOARD_SRC)
    expect(defects.length, '共享组件正是这些特征物的唯一合法持有者').toBeGreaterThanOrEqual(3)
  })
})

describe('行为护栏：embedded 只给指板主体', () => {
  it('embedded 模式不套 Card、不落 data-onboarding；默认模式两者都在', () => {
    const bare = mountBoard(true)
    expect(bare.querySelector('[data-onboarding="fretboard"]'), 'embedded 不该带 onboarding 锚点').toBeNull()
    expect(bare.querySelectorAll('button').length, '但指板本体要在').toBe(6 * 16)

    const wrapped = mountBoard(false)
    expect(wrapped.querySelector('[data-onboarding="fretboard"]'), '默认模式仍带 Card 外壳').not.toBeNull()
    expect(wrapped.querySelectorAll('button').length).toBe(6 * 16)

    // 🚨 **省略 prop**（主区 `app/page.tsx` 的真实用法）也必须走「带外壳」那条 ——
    // 不显式传时靠的是组件默认值 `embedded = false`。早先这里只测显式 true/false，
    // 把默认值改成 true 也没人发现（变异 M2 咬 0）。
    const defaulted = mountBoard()
    expect(defaulted.querySelector('[data-onboarding="fretboard"]'), '省略 embedded ⇒ 必须等同于 embedded=false').not.toBeNull()
    expect(defaulted.querySelectorAll('button').length).toBe(6 * 16)
  })

  it('两种模式渲染的格子完全一致（外壳不同，指板不能不同）', () => {
    const read = (scope: ParentNode) =>
      [...scope.querySelectorAll('button')].map((b) => {
        const span = b.querySelector('span') as HTMLElement | null
        return {
          text: (span?.textContent ?? '').trim(),
          visible: (span?.className ?? '').split(/\s+/).includes('opacity-100'),
          role: b.getAttribute('data-role'),
        }
      })
    const bare = read(mountBoard(true))
    const wrapped = read(mountBoard(false))
    expect(bare.length).toBe(96)
    expect(bare).toEqual(wrapped)
    expect(new Set(bare.map((c) => c.visible)).size, '非空转：两态都有').toBe(2)
  })
})
