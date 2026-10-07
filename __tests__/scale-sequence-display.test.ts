/**
 * ScaleSequenceDisplay —— 音阶练习序列展示契约测试
 *
 * memo 的展示组件：数据来自 props，显示偏好来自 store（useUser 的 chordScaleDisplay / useIsPlaying）。
 * 是「指板隐藏时」用户看练习进度的唯一面板。
 *
 * 一条容易忘的硬契约：**只有 `isPlaying` 且序列非空才显示题目** —— 否则显示「点击开始按钮开始练习」。
 * 另外「下一题预览」要求 `isPlaying && info` 同时成立（停止时即使有预览信息也不显示）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScaleSequenceDisplay } from '@/components/scale-sequence-display'
import { getScaleDisplayName } from '@/lib/page-theory-functions'
import { SCALE_MODES } from '@/lib/page-theory-data'
import { useAppStore } from '@/lib/store'
import { TRANSLATIONS } from '@/lib/i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const t = (k: string) => (TRANSLATIONS['zh-CN'] as Record<string, string>)[k] ?? k

type Props = Record<string, unknown>
type Scale = React.ComponentProps<typeof ScaleSequenceDisplay>['selectedScale']

const SCALE: Scale = SCALE_MODES.pentatonic[0]

let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(props: Props = {}) {
  const base: Props = {
    t,
    scaleKey: 'C',
    selectedScale: SCALE,
    scaleExerciseSequence: ['1', '2', '3', '5', '6'],
    scaleExerciseCurrentStep: 0,
    nextScaleExerciseInfo: null,
    ...props,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(ScaleSequenceDisplay as never, base as never))
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

function setMode(mode: 'chinese' | 'english' | 'english_short' | 'jazz') {
  act(() => {
    useAppStore.setState({ user: { ...useAppStore.getState().user, chordScaleDisplay: mode } })
  })
}
function setPlaying(v: boolean) {
  act(() => {
    useAppStore.setState({ isPlaying: v })
  })
}

beforeEach(() => {
  useAppStore.setState({ user: { ...useAppStore.getState().user, chordScaleDisplay: 'chinese' }, isPlaying: true })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ScaleSequenceDisplay', () => {
  describe('未开始 / 空序列', () => {
    it('isPlaying=false 时显示「点击开始按钮开始练习」，不显示标题与徽章', () => {
      setPlaying(false)
      const p = mount()
      expect(p.text()).toContain(t('click_start_to_begin'))
      expect(p.badges()).toHaveLength(0)
      expect(p.text()).not.toContain(getScaleDisplayName(SCALE.name, 'chinese'))
      p.unmount()
    })

    it('isPlaying=true 但序列为空 → 同样显示占位提示', () => {
      const p = mount({ scaleExerciseSequence: [] })
      expect(p.text()).toContain(t('click_start_to_begin'))
      expect(p.badges()).toHaveLength(0)
      p.unmount()
    })

    it('isPlaying=false 时即使有序列也不显示徽章', () => {
      setPlaying(false)
      const p = mount({ scaleExerciseSequence: ['1', '3', '5'] })
      expect(p.badges()).toHaveLength(0)
      p.unmount()
    })
  })

  describe('当前音阶与序列', () => {
    it('标题 = normalizeNoteName(调性) + getScaleDisplayName(音阶名, 显示模式)', () => {
      const p = mount({ scaleKey: 'Db' })
      expect(p.text()).toContain('D♭')
      expect(p.text()).not.toContain('Db')
      expect(p.text()).toContain(getScaleDisplayName(SCALE.name, 'chinese'))
      p.unmount()
    })

    it('序列里每个音级渲染成一个徽章并过 formatDegree', () => {
      const p = mount({ scaleExerciseSequence: ['1', 'b3', '4', '#4', '5'] })
      const b = p.badges()
      expect(b).toHaveLength(5)
      expect(b.map((x) => x.textContent)).toEqual(['1', '♭3', '4', '♯4', '5'])
      p.unmount()
    })

    it('当前步的徽章是选中态（bg-primary）且不加 opacity-50', () => {
      const p = mount({ scaleExerciseCurrentStep: 2 })
      const b = p.badges()
      expect(b).toHaveLength(5)
      expect(b[2].className).toContain('bg-primary')
      expect(b[2].className).not.toContain('opacity-50')
      p.unmount()
    })

    it('已走过的徽章加 opacity-50，未到的不加', () => {
      const p = mount({ scaleExerciseCurrentStep: 3 })
      const b = p.badges()
      expect(b[0].className).toContain('opacity-50')
      expect(b[2].className).toContain('opacity-50')
      expect(b[3].className).not.toContain('opacity-50')
      expect(b[4].className).not.toContain('opacity-50')
      p.unmount()
    })

    it('当前步为 0 时没有任何走过态', () => {
      const p = mount({ scaleExerciseCurrentStep: 0 })
      expect(p.badges().every((b) => !b.className.includes('opacity-50'))).toBe(true)
      p.unmount()
    })
  })

  describe('下一题预览', () => {
    const INFO = { key: 'F#', scaleName: SCALE.name, sequence: ['1', 'b3', '5'] }

    it('无预览信息时不渲染该块', () => {
      const p = mount({ nextScaleExerciseInfo: null })
      expect(p.text()).not.toContain(t('next_chord'))
      p.unmount()
    })

    it('有预览时显示「下一个」标签、调性+音阶名、序列串', () => {
      const p = mount({ nextScaleExerciseInfo: INFO })
      expect(p.text()).toContain(t('next_chord'))
      expect(p.text()).toContain('F♯')
      expect(p.text()).toContain(getScaleDisplayName(INFO.scaleName, 'chinese'))
      expect(p.text()).toContain('1 ♭3 5')
      p.unmount()
    })

    it('**isPlaying=false 时即使有预览信息也不渲染**', () => {
      setPlaying(false)
      const p = mount({ nextScaleExerciseInfo: INFO })
      expect(p.text()).not.toContain(t('next_chord'))
      p.unmount()
    })

    it('预览序列每个都过 formatDegree', () => {
      const p = mount({ nextScaleExerciseInfo: { ...INFO, sequence: ['b3', '#4', 'b7'] } })
      expect(p.text()).toContain('♭3 ♯4 ♭7')
      p.unmount()
    })
  })

  describe('跟随 store 的显示模式', () => {
    it('chinese 与 jazz 下音阶名不同（当前标题与预览都跟随）', () => {
      const zhName = getScaleDisplayName(SCALE.name, 'chinese')
      const zh = mount({ nextScaleExerciseInfo: { key: 'C', scaleName: SCALE.name, sequence: [] } })
      expect(zh.text()).toContain(zhName)
      zh.unmount()

      setMode('jazz')
      const jazzName = getScaleDisplayName(SCALE.name, 'jazz')
      const jazz = mount({ nextScaleExerciseInfo: { key: 'C', scaleName: SCALE.name, sequence: [] } })
      expect(jazz.text()).toContain(jazzName)
      // 预览块与标题块各出现一次
      const occurrences = jazz.text().split(jazzName).length - 1
      expect(occurrences).toBeGreaterThanOrEqual(2)
      jazz.unmount()
    })
  })
})

// ---------------------------------------------------------------------------
// 一弦三音（3NPS）把位视图
//
// 3NPS 下**不再**渲染音符徽章行，而是「把位进度 + 方向/换把 + 目标音(弦/品) + 连击 + 9 步滑窗」。
// 三条容易静默写错的契约：
//  ① 35 步的音级徽章横排根本看不出当前位置 ⇒ 3NPS 下必须换掉，而不是两个都画；
//  ② 弦号按 **1 起**显示（内部索引 0 = 最高音弦 = 1 弦），直接拿索引当弦号会整体差 1；
//  ③ 换把提示只在「非首个把位的第一音」出现，其余步显示上行/下行。
// ---------------------------------------------------------------------------
const WIN = (currentIdx: number) =>
  Array.from({ length: 9 }, (_, i) => ({
    label: String((i % 7) + 1),
    done: i < currentIdx,
    current: i === currentIdx,
  }))

const NPS_VIEW = {
  position: 4,
  totalPositions: 7,
  combo: 12,
  maxCombo: 12,
  direction: 'up' as const,
  isShift: false,
  stepNow: 10,
  stepTotal: 35,
  target: { label: 'b7', note: 'A♯', stringIndex: 5, fret: 6, isRoot: false },
  window: WIN(3),
}

describe('一弦三音把位视图', () => {
  it('提供 threeNps 时换掉徽章行（不两个都画）', () => {
    const p = mount({ scaleExerciseSequence: ['1', '2', '3'], threeNps: NPS_VIEW })
    expect(p.badges()).toHaveLength(0)
    expect(p.text()).toContain(t('three_nps_ascending'))
    p.unmount()
  })

  it('把位进度 / 步号 的占位符都被替换（不留 {current} 这种原始占位符）', () => {
    const p = mount({ threeNps: NPS_VIEW })
    const expected = t('three_nps_position_progress')
      .replace('{current}', '4')
      .replace('{total}', '7')
    expect(p.text()).toContain(expected)
    expect(p.text()).not.toContain('{current}')
    expect(p.text()).not.toContain('{total}')
    expect(p.text()).toContain('10 / 35')
    p.unmount()
  })

  it('🚨 换把时显示 SHIFT → 把位 n；否则显示上行/下行', () => {
    const shift = mount({ threeNps: { ...NPS_VIEW, isShift: true, stepNow: 1, stepTotal: 35 } })
    expect(shift.text()).toContain(t('three_nps_shift').replace('{position}', '4'))
    expect(shift.text()).not.toContain(t('three_nps_ascending'))
    shift.unmount()

    const down = mount({ threeNps: { ...NPS_VIEW, direction: 'down' } })
    expect(down.text()).toContain(t('three_nps_descending'))
    expect(down.text()).not.toContain(t('three_nps_shift').replace('{position}', '4'))
    down.unmount()
  })

  it('连击文案带 comb×（占位符替换干净）', () => {
    const p = mount({ threeNps: { ...NPS_VIEW, combo: 7 } })
    expect(p.text()).toContain(t('three_nps_combo').replace('{combo}', '7'))
    expect(p.text()).not.toContain('{combo}')
    p.unmount()
  })

  it('目标音显示音名 + 弦/品，且音级过 formatDegree；弦号是 1 起的', () => {
    const p = mount({ threeNps: NPS_VIEW })
    expect(p.text()).toContain('♭7') // formatDegree('b7')
    expect(p.text()).toContain('A♯')
    // stringIndex 5 ⇒ 第 6 弦（不是第 5 弦）
    expect(p.text()).toContain(
      t('three_nps_target_location').replace('{string}', '6').replace('{fret}', '6')
    )
    expect(p.text()).not.toContain(
      t('three_nps_target_location').replace('{string}', '5').replace('{fret}', '6')
    )
    p.unmount()
  })

  it('目标音为 null 时不炸，只是不显示目标块', () => {
    const p = mount({ threeNps: { ...NPS_VIEW, target: null } })
    expect(p.text()).toContain(t('three_nps_ascending'))
    expect(p.text()).not.toContain('10 / 35')
    p.unmount()
  })

  it('9 步滑窗逐格渲染，只有 current 那格是选中态', () => {
    const p = mount({ threeNps: NPS_VIEW })
    const chips = [...p.rootEl().querySelectorAll('span.min-w-\\[26px\\]')] as HTMLElement[]
    expect(chips).toHaveLength(9)
    const current = chips.filter((c) => c.className.includes('bg-primary'))
    expect(current).toHaveLength(1)
    expect(chips.indexOf(current[0])).toBe(3)
    p.unmount()
  })

  it('nextThreeNps 存在时显示「下一把位 n」+ 起点弦/品，且**不**再显示普通预览', () => {
    const p = mount({
      threeNps: NPS_VIEW,
      nextThreeNps: { position: 5, totalPositions: 7, startStringIndex: 5, startFret: 3 },
      nextScaleExerciseInfo: { key: 'G', scaleName: SCALE.name, sequence: ['5', '6', '7'] },
    })
    expect(p.text()).toContain(t('three_nps_next_position').replace('{position}', '5'))
    expect(p.text()).toContain(
      t('three_nps_target_location').replace('{string}', '6').replace('{fret}', '3')
    )
    // 普通预览的「下一题」音级串不应出现
    expect(p.text()).not.toContain('5 6 7')
    p.unmount()
  })

  it('回归：threeNps 为 null 时仍是原来的徽章行 + 普通预览', () => {
    const p = mount({
      scaleExerciseSequence: ['1', 'b3', '5'],
      threeNps: null,
      nextScaleExerciseInfo: { key: 'G', scaleName: SCALE.name, sequence: ['5', '6', '7'] },
    })
    expect(p.badges()).toHaveLength(3)
    expect(p.text()).toContain('5 6 7')
    expect(p.text()).not.toContain(t('three_nps_position_progress').replace('{current}', '4').replace('{total}', '7'))
    p.unmount()
  })

  it('未开始时把位块也不显示（只显示「点击开始」占位）', () => {
    setPlaying(false)
    const p = mount({ threeNps: NPS_VIEW })
    expect(p.text()).toContain(t('click_start_to_begin'))
    expect(p.text()).not.toContain(t('three_nps_ascending'))
    p.unmount()
  })

  it('把位区所有文案都来自 t()：英文下不出现「把位 / 连击」这些汉字', () => {
    const en = TRANSLATIONS['en'] as Record<string, string>
    const tEn = (k: string) => en[k] ?? k
    const p = mount({ t: tEn, threeNps: NPS_VIEW })
    expect(p.text()).toContain(tEn('three_nps_position_progress').replace('{current}', '4').replace('{total}', '7'))
    expect(p.text()).toContain(tEn('three_nps_ascending'))
    expect(p.text()).not.toContain('把位')
    expect(p.text()).not.toContain('连击')
    expect(p.text()).not.toContain('上行')
    p.unmount()
  })

  it('把位进度是 aria-live 区（换把/连击一直在变，读屏要跟得上）', () => {
    const p = mount({ threeNps: NPS_VIEW })
    const live = [...p.rootEl().querySelectorAll('[aria-live]')] as HTMLElement[]
    expect(live.length).toBeGreaterThan(0)
    expect(live.some((e) => e.getAttribute('aria-live') === 'polite')).toBe(true)
    p.unmount()
  })
})
