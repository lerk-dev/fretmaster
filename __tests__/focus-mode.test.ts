/**
 * components/focus-mode.tsx 的契约测试（此前零测试）。
 *
 * 专注模式浮窗：番茄钟（工作/休息相位 + 计数）+ 练习进度/正确率 + 设置面板 +
 * 键盘快捷键。本轮修掉一个**只在 StrictMode 下发作**的真 bug：
 *
 *   原实现把相位切换写在 `setPomodoroTime(prev => { ...setPomodoroCount(c => c + 1)... })`
 *   的 updater 里。updater 必须是**纯函数**，而 React StrictMode 会双重调用它来
 *   检测副作用 —— `setPomodoroCount(c => c + 1)` 不幂等，于是番茄计数翻倍。
 *   实测：非 StrictMode 跑满一个专注相位 = 1；StrictMode = **2**。
 *   Next.js 默认 `reactStrictMode: true`（本仓 next.config.mjs 未关闭），
 *   所以开发模式下用户会看到计数虚高。修法：把相位切换移到 updater 之外，
 *   用 ref 读取当前秒数（与文件里既有的 phaseDurationRef/phaseRef 同风格）。
 *
 * ⚠️ 因此本文件必须**同时**在「有 StrictMode」与「无 StrictMode」两种包裹下跑
 * 同一条相位切换断言 —— 只测一种会漏掉这个 bug（原实现无 StrictMode 时是正确的）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FocusMode } from '@/components/focus-mode'
import { useAppStore } from '@/lib/store'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const DEFAULT_FOCUS = {
  enabled: true,
  enableWakeLock: false,   // 关掉，避免依赖 navigator.wakeLock
  enableFullscreen: true,
  fullscreenMode: 'windowed' as const,
  showTimer: true,
  showProgress: true,
  dimBackground: true,
  hideDistractions: true,
  targetDuration: 5,       // 5 分钟 ⇒ 300 秒，测试跑满相位最快
}

/**
 * 🚨 模块级兜底拆树：断言失败会跳过该用例自己的 `unmount()`，残留 root 上的
 * 番茄钟定时器会继续触发 setState → 后续用例冒出大量 act 警告，把 `console.error`
 * 断言污染成假失败。故一律登记后由 afterEach 统一卸载。
 */
const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = []

function mount(props: Record<string, unknown> = {}, strict = false, focusOverride: Record<string, unknown> = {}) {
  // ⚠️ focusMode 由 mount 统一重置 —— 想改设置必须走 focusOverride，
  // 在 mount 之前调 setFocusModeSettings 会被这里覆盖掉。
  useAppStore.setState({ focusMode: { ...DEFAULT_FOCUS, ...focusOverride } as never })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const el = createElement(FocusMode as never, {
    language: 'zh-CN',
    isPlaying: false,
    score: { correct: 0, total: 0 },
    timeLeft: 0,
    practiceTime: 0,
    onClose: () => {},
    ...props,
  } as never)
  act(() => { root.render(strict ? createElement(StrictMode, null, el) : el) })
  mounted.push({ root, container })
  return {
    container,
    text: () => container.textContent ?? '',
    buttons: () => [...container.querySelectorAll('button')] as HTMLButtonElement[],
    inputs: () => [...container.querySelectorAll('input')] as HTMLInputElement[],
    /** 按 aria-label 找按钮 */
    byLabel: (label: string) => [...container.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement | undefined,
    rerender(next: Record<string, unknown>) {
      const el2 = createElement(FocusMode as never, {
        language: 'zh-CN', isPlaying: false, score: { correct: 0, total: 0 },
        timeLeft: 0, practiceTime: 0, onClose: () => {}, ...next,
      } as never)
      act(() => { root.render(strict ? createElement(StrictMode, null, el2) : el2) })
    },
    click(el2: HTMLElement) { act(() => { el2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }) },
    tick(seconds: number) { act(() => { vi.advanceTimersByTime(seconds * 1000) }) },
    /** 从「N 已完成番茄」里取计数 */
    pomodoroCount: () => {
      const m = (container.textContent ?? '').match(/(\d+)\s*已完成番茄/)
      return m ? Number(m[1]) : null
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
      const i = mounted.findIndex((m) => m.root === root)
      if (i >= 0) mounted.splice(i, 1)
    },
  }
}

/** 番茄钟是否在跑：跑时按钮 aria-label = 暂停 */
const isRunning = (p: ReturnType<typeof mount>) => Boolean(p.byLabel('暂停'))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  for (const m of mounted.splice(0)) {
    try { act(() => m.root.unmount()) } catch { /* 已卸载 */ }
    m.container.remove()
  }
  vi.useRealTimers()
  useAppStore.setState({ focusMode: { ...DEFAULT_FOCUS } as never })
})

describe('番茄钟计时', () => {
  it('初始：工作相位、剩余 = 设定的专注时长、计数 0', () => {
    const p = mount()
    expect(p.text()).toContain('专注中')
    expect(p.text()).toContain('05:00')
    expect(p.pomodoroCount()).toBe(0)
    expect(isRunning(p)).toBe(false) // 未跑时 aria-label 是「继续」
    p.unmount()
  })

  it('开始后每秒递减剩余时间', () => {
    const p = mount()
    p.click(p.byLabel('继续')!)
    expect(isRunning(p)).toBe(true)
    p.tick(1)
    expect(p.text()).toContain('04:59')
    p.tick(59)
    expect(p.text()).toContain('04:00')
    p.unmount()
  })

  it('暂停后不再走', () => {
    const p = mount()
    p.click(p.byLabel('继续')!)
    p.tick(10)
    p.click(p.byLabel('暂停')!)
    expect(isRunning(p)).toBe(false)
    const t = p.text()
    p.tick(30)
    expect(p.text()).toBe(t)
    p.unmount()
  })

  it('跑满工作相位 → 切到休息、计数 +1、时间归零到休息时长', () => {
    const p = mount()
    p.click(p.byLabel('继续')!)
    p.tick(5 * 60) // 300 秒
    expect(p.text()).toContain('休息中')
    expect(p.pomodoroCount()).toBe(1)
    expect(p.text()).toContain('05:00') // 休息固定 5 分钟
    p.unmount()
  })

  // ★ 本轮修复的核心：只有 StrictMode 会暴露计数翻倍
  it('★ StrictMode 下跑满一个工作相位，计数仍是 1（钉住本轮修复）', () => {
    const p = mount({}, true)
    p.click(p.byLabel('继续')!)
    p.tick(5 * 60)
    expect(p.text()).toContain('休息中')
    expect(p.pomodoroCount(), 'updater 里做副作用会让 StrictMode 双调用、计数翻倍').toBe(1)
    p.unmount()
  })

  it('跑满休息相位 → 切回工作、计数不变', () => {
    const p = mount()
    p.click(p.byLabel('继续')!)
    p.tick(5 * 60)          // 工作 → 休息，计数 1
    expect(p.pomodoroCount()).toBe(1)
    p.tick(5 * 60)          // 休息 → 工作
    expect(p.text()).toContain('专注中')
    expect(p.pomodoroCount()).toBe(1)
    p.unmount()
  })

  it('重置：时间归零、相位回工作（已完成计数保留）', () => {
    const p = mount()
    p.click(p.byLabel('继续')!)
    p.tick(5 * 60)          // 完成 1 个番茄，进入休息
    p.click(p.byLabel('重置')!)
    expect(isRunning(p)).toBe(false)
    expect(p.text()).toContain('专注中')
    expect(p.text()).toContain('05:00')
    expect(p.pomodoroCount(), '重置不清已完成计数').toBe(1)
    p.unmount()
  })

  it('专注时长改大后，相位时长随之变化', () => {
    const p = mount()
    act(() => { useAppStore.getState().setFocusModeSettings({ targetDuration: 10 }) })
    expect(p.text()).toContain('10:00')
    p.unmount()
  })
})

describe('练习进度与正确率', () => {
  it('正确率 = correct/total，分档边界 80 / 50', () => {
    const cases: Array<[number, number, string]> = [[8, 10, '80%'], [5, 10, '50%'], [4, 10, '40%']]
    for (const [c, tot, want] of cases) {
      const p = mount({ isPlaying: true, score: { correct: c, total: tot } })
      expect(p.text()).toContain(want)
      expect(p.text()).toContain(`${c}/${tot}`)
      p.unmount()
    }
  })

  it('total=0 时正确率显示 0%', () => {
    const p = mount({ isPlaying: true, score: { correct: 0, total: 0 } })
    expect(p.text()).toContain('0%')
    p.unmount()
  })

  it('练习进度 = (总时长 - 剩余) / 总时长，单位均为**秒**，且夹到 100%', () => {
    // 🚨 practiceTime 与 timeLeft 的单位都是**秒**（store 默认 300；
    //    page.tsx 直接 setTimeLeft(practiceTime)，计时器每秒 −1）。
    //    旧实现把 practiceTime 当分钟（分母 ×60）⇒ 300s 的练习在 150s 时显示
    //    (300*60-150)/(300*60)=99%，全程卡在 98%~100%。本用例钉死「秒对秒」的口径。
    const p = mount({ isPlaying: true, practiceTime: 300, timeLeft: 150 })
    expect(p.text()).toContain('50%') // (300-150)/300
    p.unmount()
    // 与 page.tsx 的实际口径一致：5 分钟 = 300 秒的练习，剩 150 秒 ⇒ 50%（不是 99%）
    const pMinutes = mount({ isPlaying: true, practiceTime: 5 * 60, timeLeft: 150 })
    expect(pMinutes.text()).toContain('50%')
    pMinutes.unmount()
    // 剩余为负（超出）时夹到 100%
    const p2 = mount({ isPlaying: true, practiceTime: 300, timeLeft: -60 })
    const pcts = (p2.text().match(/(\d+)%/g) ?? [])
    expect(pcts).toContain('100%')
    p2.unmount()
    // 刚开始（剩余==总时长）时进度为 0%，绝不能是「已接近 100%」的假象
    const p3 = mount({ isPlaying: true, practiceTime: 300, timeLeft: 300 })
    expect(p3.text()).toContain('0%')
    p3.unmount()
  })

  it('practiceTime=0（不限时）时进度为 0%', () => {
    const p = mount({ isPlaying: true, practiceTime: 0, timeLeft: 100 })
    expect(p.text()).toContain('0%')
    p.unmount()
  })

  it('未练习时不显示进度块', () => {
    const p = mount({ isPlaying: false })
    expect(p.text()).not.toContain('练习得分')
    p.unmount()
  })

  it('showProgress=false 时不显示进度块（即使正在练习）', () => {
    const p = mount({ isPlaying: true, score: { correct: 1, total: 2 } }, false, { showProgress: false })
    expect(p.text()).not.toContain('练习得分')
    p.unmount()
  })

  it('showTimer=false 时不显示计时环（但顶部相位仍在）', () => {
    // 注意不能数 svg 总数 —— lucide 图标（眼睛/收起/退出）也是 svg；
    // 计时环的特征是两个 r=90 的 circle。
    const on = mount()
    expect(on.container.querySelectorAll('circle[r="90"]').length, '默认应渲染计时环').toBe(2)
    on.unmount()

    const p = mount({}, false, { showTimer: false })
    expect(p.container.querySelectorAll('circle[r="90"]').length).toBe(0)
    expect(p.text()).toContain('专注中')
    p.unmount()
  })
})

describe('收起 / 展开 / 退出', () => {
  it('收起后只显示小条（含剩余时间），点击可展开', () => {
    const p = mount()
    const collapseBtn = [...p.buttons()].find((b) => b.getAttribute('title') === '收起')!
    p.click(collapseBtn)
    expect(p.text()).not.toContain('专注模式 ·')
    expect(p.text()).toContain('05:00')
    // 小条里的按钮可以展开
    p.click(p.buttons()[0])
    expect(p.text()).toContain('专注模式 ·')
    p.unmount()
  })

  it('退出按钮：关掉 store 的 enabled 并回调 onClose', () => {
    const onClose = vi.fn()
    const p = mount({ onClose })
    p.click([...p.buttons()].find((b) => b.getAttribute('title') === '退出专注模式')!)
    expect(useAppStore.getState().focusMode.enabled).toBe(false)
    expect(onClose).toHaveBeenCalled()
    p.unmount()
  })
})

describe('设置面板', () => {
  function openSettings(p: ReturnType<typeof mount>) {
    p.click([...p.buttons()].find((b) => b.getAttribute('title') === '设置')!)
  }

  /**
   * 复选框是**复制粘贴的多份**（2026-10-04 后共 6 个），原测试只点了第 3 个。
   * 前两个各自写 `showTimer` / `showProgress`：若哪份把字段名抄串（比如都写成 showTimer），
   * 界面上勾「显示进度」却改的是「显示计时器」，只测一个根本看不出来。
   */
  it('「显示计时器」「显示进度」各自只写自己那个字段（不串台）', () => {
    const p = mount()
    openSettings(p)
    const boxes = p.inputs().filter((i) => i.type === 'checkbox')
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, true, true, true])

    act(() => { boxes[0].click() })                       // 取消「显示计时器」
    expect(useAppStore.getState().focusMode.showTimer).toBe(false)
    expect(useAppStore.getState().focusMode.showProgress, '不该动 showProgress').toBe(true)

    act(() => { boxes[1].click() })                       // 取消「显示进度」
    expect(useAppStore.getState().focusMode.showProgress).toBe(false)
    expect(useAppStore.getState().focusMode.showTimer, '不该动 showTimer').toBe(false)
    p.unmount()
  })

  it('取消「显示计时器」后读数真的从界面消失（开关要落地，不能只是写 store）', () => {
    const p = mount({ practiceTime: 5, timeLeft: 200 })
    expect(p.text()).toMatch(/\d{2}:\d{2}/)
    openSettings(p)
    const boxes = p.inputs().filter((i) => i.type === 'checkbox')
    act(() => { boxes[0].click() })
    expect(p.text()).not.toMatch(/\d{2}:\d{2}/)
    p.unmount()
  })

  it('六个开关反映 store，勾选后回写', () => {
    const p = mount()
    openSettings(p)
    const boxes = p.inputs().filter((i) => i.type === 'checkbox')
    expect(boxes.length).toBe(6)
    // 顺序：显示计时器 / 显示进度 / 保持屏幕常亮（夹具 false）/
    //       专注时自动全屏 / 背景调暗 / 隐藏干扰元素
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, true, true, true])
    act(() => { boxes[2].click() }) // 勾选「保持屏幕常亮」
    expect(useAppStore.getState().focusMode.enableWakeLock).toBe(true)
    p.unmount()
  })

  /**
   * 复选框都是 `focusMode.xxx ?? true`。
   * 老版本持久化的 blob 里可能**没有**这些后加的字段，此时必须默认**勾选**
   * （而不是 `undefined` → 未勾选，那等于用户什么都没改就丢了计时器和进度条）。
   * 2026-10-04 起把 enableFullscreen / dimBackground / hideDistractions 一并纳入。
   */
  it('store 里缺这些字段时复选框默认勾选（老数据兼容，不能显示成未勾选）', () => {
    const p = mount({}, false, {
      showTimer: undefined, showProgress: undefined, enableWakeLock: undefined,
      enableFullscreen: undefined, dimBackground: undefined, hideDistractions: undefined,
    })
    openSettings(p)
    const boxes = p.inputs().filter((i) => i.type === 'checkbox')
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true, true, true, true])
    p.unmount()
  })

  /** 源码 40：`focusMode.targetDuration || 25` —— 0 / 缺失都回落到 25，否则会出现「0 分钟番茄钟」 */
  it('targetDuration 为 0 时回落到 25 分钟（不是 00:00）', () => {
    const p = mount({}, false, { targetDuration: 0 })
    expect(p.text()).toContain('25')
    expect(p.text()).not.toMatch(/\b00:00\b/)
    p.unmount()
  })

  it('专注时长滑块回写 targetDuration', () => {
    const p = mount()
    openSettings(p)
    const range = p.inputs().find((i) => i.type === 'range')!
    expect(range.min).toBe('5')
    expect(range.max).toBe('60')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(range, '30')
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(useAppStore.getState().focusMode.targetDuration).toBe(30)
    p.unmount()
  })

  /**
   * 2026-10-04「三字段接线」：enableFullscreen / dimBackground / hideDistractions
   * 此前零消费（前者连 UI 都没有；后二者的文案与字段在 a3815f9a2 重构后被悬空）。
   * 本组钉「勾选 → 落 store」与「开关真的改变渲染/文档状态」两个环节。
   * （enableFullscreen 的页面级接线是源码级契约，见 focus-mode-autostart.test.ts。）
   */
  it('三个新开关（索引 3/4/5）各自只写自己那个字段，默认勾选', () => {
    const p = mount()
    openSettings(p)
    const boxes = p.inputs().filter((i) => i.type === 'checkbox')
    expect(boxes.slice(3).map((b) => b.checked), '默认应全勾选').toEqual([true, true, true])

    act(() => { boxes[3].click() }) // 取消「专注时自动全屏」
    expect(useAppStore.getState().focusMode.enableFullscreen).toBe(false)
    expect(useAppStore.getState().focusMode.dimBackground).toBe(true)

    act(() => { boxes[4].click() }) // 取消「背景调暗」
    expect(useAppStore.getState().focusMode.dimBackground).toBe(false)
    expect(useAppStore.getState().focusMode.hideDistractions).toBe(true)

    act(() => { boxes[5].click() }) // 取消「隐藏干扰元素」
    expect(useAppStore.getState().focusMode.hideDistractions).toBe(false)
    p.unmount()
  })

  it('「背景调暗」：暗纱随开关挂/收（收起态与显式关闭都不渲染）', () => {
    const dim = (p: ReturnType<typeof mount>) => p.container.querySelector('[data-focus-dim]')

    const off = mount({}, false, { dimBackground: false })
    expect(dim(off), '显式关掉 ⇒ 不应渲染暗纱').toBeNull()
    off.unmount()

    // 老 persist 数据缺字段 ⇒ 默认渲染（与勾选框 `?? true` 一致）
    const legacy = mount({}, false, { dimBackground: undefined })
    expect(dim(legacy), '缺字段按默认开处理').not.toBeNull()
    legacy.unmount()

    const on = mount()
    expect(dim(on), 'dimBackground 默认开 ⇒ 应渲染暗纱').not.toBeNull()

    // 收起态（轻量小条）必须无暗纱
    const collapseBtn = [...on.buttons()].find((b) => b.getAttribute('title') === '收起')!
    on.click(collapseBtn)
    expect(dim(on), '收起态应保持轻量（无暗纱）').toBeNull()
    on.unmount()
  })

  it('「隐藏干扰元素」：html.focus-clean 随挂载态挂/摘（含卸载清理与 StrictMode 幂等）', () => {
    const html = document.documentElement

    const p = mount()
    expect(html.classList.contains('focus-clean'), '默认应给 <html> 打标').toBe(true)
    p.unmount()
    expect(html.classList.contains('focus-clean'), '卸载（退出专注）后必须摘掉').toBe(false)

    const off = mount({}, false, { hideDistractions: false })
    expect(html.classList.contains('focus-clean'), '关掉开关 ⇒ 不得打标').toBe(false)
    off.unmount()

    const strict = mount({}, true)
    expect(html.classList.contains('focus-clean'), 'StrictMode 双挂载后仍在位（幂等）').toBe(true)
    strict.unmount()
    expect(html.classList.contains('focus-clean'), 'StrictMode 卸载后必须摘掉').toBe(false)
  })
})

/**
 * 屏幕常亮（Wake Lock）整条链路此前**一次都没跑过**：夹具里 `enableWakeLock: false`
 * 是被"刻意关掉以避开 navigator.wakeLock"，于是 effect 里的 request / release / 竞态
 * 三个分支全是零覆盖 —— 真机上「开着常亮却秒熄」这类问题测不出来。
 */
describe('折叠态', () => {
  const collapseBtn = (p: ReturnType<typeof mount>) =>
    [...p.buttons()].find((b) => b.getAttribute('title') === '收起')!

  /** 源码 219 在 `if (collapsed)` 的早返回里 —— 不折叠永远走不到 */
  it('折叠后只留指示灯与倒计时；工作相位是红灯、休息相位是绿灯', () => {
    const p = mount()
    // ⚠️ 折叠视图里只有「指示灯 + 倒计时 + 展开」三个元素，没有播放/暂停按钮
    //    —— 必须先启动番茄钟再折叠，否则点不到「继续」。
    p.click(p.byLabel('继续')!)
    p.click(collapseBtn(p))
    const dot = () => p.container.querySelector('div.w-2.h-2.rounded-full')!
    expect(dot(), '折叠态应有相位指示灯').toBeTruthy()
    expect(dot().className, '工作相位应为红点').toContain('bg-red-500')

    p.tick(5 * 60)                                   // 工作跑满 → 进入休息
    expect(dot().className, '休息相位应为绿点').toContain('bg-green-500')
    expect(dot().className).not.toContain('bg-red-500')
    p.unmount()
  })

  it('折叠态不再显示完整面板的进度/计数区', () => {
    const p = mount({ practiceTime: 5, timeLeft: 200 })
    p.click(collapseBtn(p))
    expect(p.text()).toMatch(/\d{2}:\d{2}/)
    expect(p.text()).not.toContain('已完成番茄')
    expect(p.text()).not.toContain('专注模式 ·')
    p.unmount()
  })
})

describe('屏幕常亮（Wake Lock）', () => {
  type Lock = { release: ReturnType<typeof vi.fn> }
  function stubWakeLock(impl?: () => Promise<Lock>) {
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockImplementation(impl ?? (() => Promise.resolve({ release })))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true, writable: true })
    return { request, release }
  }
  function clearWakeLock() {
    delete (navigator as unknown as Record<string, unknown>).wakeLock
  }
  const flush = () => act(async () => { await Promise.resolve() })

  it('开启常亮：请求 screen 锁并持有；卸载时释放', async () => {
    const { request, release } = stubWakeLock()
    const p = mount({}, false, { enableWakeLock: true })
    await flush()
    expect(request).toHaveBeenCalledWith('screen')
    expect(release, '持有期间不该释放').not.toHaveBeenCalled()

    p.unmount()
    await flush()
    expect(release, '卸载必须释放，否则屏幕永远不熄').toHaveBeenCalledTimes(1)
    clearWakeLock()
  })

  it('竞态：卸载**早于** request resolve → 拿到锁后立刻释放（不能泄漏）', async () => {
    let settle: ((lock: Lock) => void) | null = null
    const release = vi.fn().mockResolvedValue(undefined)
    const { request } = stubWakeLock(() => new Promise<Lock>((r) => { settle = r }))

    const p = mount({}, false, { enableWakeLock: true })
    expect(request).toHaveBeenCalledWith('screen')
    p.unmount()                                   // cancelled = true
    expect(release).not.toHaveBeenCalled()

    await act(async () => { settle!({ release }); await Promise.resolve() })
    expect(release, '已卸载仍收到锁 → 必须立即释放').toHaveBeenCalledTimes(1)
    clearWakeLock()
  })

  it('卸载时 release() 失败 → 静默兜底（页面已在卸载，不该冒未处理拒绝）', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { request } = stubWakeLock(() =>
      Promise.resolve({ release: vi.fn().mockRejectedValue(new Error('already released')) }))
    const p = mount({}, false, { enableWakeLock: true })
    await flush()
    expect(request).toHaveBeenCalled()
    expect(() => p.unmount()).not.toThrow()
    await flush()
    expect(consoleErr).not.toHaveBeenCalled()
    consoleErr.mockRestore()
    clearWakeLock()
  })

  it('request 被拒绝（权限/不支持）→ 静默兜底，不崩、不影响其它逻辑', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { request } = stubWakeLock(() => Promise.reject(new Error('not allowed')))
    const p = mount({}, false, { enableWakeLock: true })
    await flush()
    expect(request).toHaveBeenCalled()
    expect(consoleErr, '失败应被 .catch 吞掉，不该冒到控制台').not.toHaveBeenCalled()
    expect(p.text()).toContain('专注模式')
    consoleErr.mockRestore()
    p.unmount()
    clearWakeLock()
  })

  it('未开启常亮：完全不碰 navigator.wakeLock', async () => {
    const { request } = stubWakeLock()
    const p = mount({}, false, { enableWakeLock: false })
    await flush()
    expect(request).not.toHaveBeenCalled()
    p.unmount()
    clearWakeLock()
  })

  it('navigator 没有 wakeLock（桌面浏览器）：不开也不报错', async () => {
    clearWakeLock()
    expect('wakeLock' in navigator).toBe(false)
    const p = mount({}, false, { enableWakeLock: true })
    await flush()
    expect(p.text()).toContain('专注模式')
    p.unmount()
  })
})

describe('键盘快捷键', () => {
  const key = (k: string, target: HTMLElement = document.body) =>
    act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })

  it('空格开始/暂停番茄钟', () => {
    const p = mount()
    key(' ')
    expect(isRunning(p)).toBe(true)
    key(' ')
    expect(isRunning(p)).toBe(false)
    p.unmount()
  })

  it('Escape 退出专注模式并回调 onClose', () => {
    const onClose = vi.fn()
    const p = mount({ onClose })
    key('Escape')
    expect(useAppStore.getState().focusMode.enabled).toBe(false)
    expect(onClose).toHaveBeenCalled()
    p.unmount()
  })

  it('焦点在输入控件上时按键交还给控件（不劫持空格/Escape）', () => {
    const onClose = vi.fn()
    const p = mount({ onClose })
    const input = document.createElement('input')
    p.container.appendChild(input)
    key(' ', input)
    expect(isRunning(p), '空格不应触发番茄钟').toBe(false)
    key('Escape', input)
    expect(onClose, 'Escape 不应触发退出').not.toHaveBeenCalled()
    p.unmount()
  })
})
