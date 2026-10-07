/**
 * lib/utils.ts 核心工具契约测试（非日期部分 + DB 时间戳解析）。
 *
 * 日期工具的「本地午夜 / 跨月回退 / 月末夹取」已在 local-date-utils.test.ts 钉死，
 * 这里补的是同一文件里**没人测**的那一半：
 *
 *   - `isTauriEnv()`：决定「要不要拿麦克风」。判错会走两条错路之一 ——
 *     ① web 下误判成 Tauri 就去调 `__TAURI__` → 抛错；② Tauri 下误判成 web 就
 *     直接 `getUserMedia` 触发系统权限弹窗（源码注释点名过这个后果）。
 *   - `getAudioContextClass()`：webkit 前缀兜底，拿错类名 = 整个音频链路起不来。
 *   - `parseDbTimestamp()` / `dbTimestampToLocalDate()`：SQLite 的
 *     `CURRENT_TIMESTAMP` 是 **UTC**，JS 的 `new Date("YYYY-MM-DD HH:MM:SS")`
 *     却按**本地**解析。这条正是本项目踩过两次时区坑的源头。
 *   - `normalizeAccuracy()`：兼容 0-1 与 0-100 两种存储；本轮修了「负数输出负数」。
 *   - `cn()`：tailwind-merge 冲突消解（后面覆盖前面）。
 *
 * 时区敏感的断言统一用 `skipIf` 锁 UTC+8（本仓库/CI 所在时区），避免在别的时区假失败。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  isTauriEnv,
  getAudioContextClass,
  parseDbTimestamp,
  dbTimestampToLocalDate,
  normalizeAccuracy,
  cn,
} from '@/lib/utils'

type TauriWindowLike = { __TAURI__?: boolean; webkitAudioContext?: typeof AudioContext }
const win = window as unknown as TauriWindowLike

const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')

/** jsdom 的 location 是 configurable 的，可以整体换掉（已实测）。 */
function setLocation(protocol: string, hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { protocol, hostname },
    writable: true,
    configurable: true,
  })
}

/** 断言 Date 是「此刻」——用于验证空值/非法值的兜底路径（不用精确相等）。 */
function isNow(d: Date, toleranceMs = 5000) {
  return Math.abs(d.getTime() - Date.now()) < toleranceMs
}

afterEach(() => {
  // 必须**先**恢复被 stub 掉的全局（SSR 用例把 window 设成了 undefined），
  // 否则下一行对 `window` 的操作会在 undefined 上抛错，且清场中断会污染
  // 后续所有用例（实测：漏掉这一步会连带伪造 27 条无关失败）。
  vi.unstubAllGlobals()
  if (typeof window !== 'undefined') {
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
    delete win.__TAURI__
    delete win.webkitAudioContext
  }
})

describe('isTauriEnv —— 环境判定（判错会误调 getUserMedia 弹权限窗）', () => {
  it('普通 web（http://localhost）判为否', () => {
    setLocation('http:', 'localhost')
    expect(isTauriEnv()).toBe(false)
  })

  it('https://tauri.localhost 判为是（Tauri 2 Windows 的默认协议/主机）', () => {
    setLocation('https:', 'tauri.localhost')
    expect(isTauriEnv()).toBe(true)
  })

  it('tauri: 协议判为是（Tauri 2 macOS/Linux）', () => {
    setLocation('tauri:', 'localhost')
    expect(isTauriEnv()).toBe(true)
  })

  it('注入标志 __TAURI__ 优先，即使 location 是普通 web 也判为是', () => {
    setLocation('http:', 'localhost') // 故意给一个「web 长相」的 location
    win.__TAURI__ = true
    expect(isTauriEnv()).toBe(true)
  })

  it('__TAURI__ = false 时不靠它判定，仍看 location', () => {
    setLocation('http:', 'localhost')
    win.__TAURI__ = false
    expect(isTauriEnv()).toBe(false)
    setLocation('tauri:', 'localhost')
    expect(isTauriEnv()).toBe(true)
  })

  it('SSR（无 window）判为否，且不抛错', () => {
    vi.stubGlobal('window', undefined)
    expect(isTauriEnv()).toBe(false)
  })
})

describe('getAudioContextClass —— webkit 前缀兜底', () => {
  it('有 window.webkitAudioContext 时返回它（老 Safari/WebKit）', () => {
    class FakeWebkit {}
    win.webkitAudioContext = FakeWebkit as unknown as typeof AudioContext
    expect(getAudioContextClass()).toBe(FakeWebkit)
  })

  it('没有 webkit 前缀时返回标准 AudioContext', () => {
    expect(getAudioContextClass()).toBe(AudioContext)
  })

  it('SSR（无 window）时返回全局 AudioContext 而不抛错', () => {
    vi.stubGlobal('window', undefined)
    expect(getAudioContextClass()).toBe(AudioContext)
  })
})

describe('parseDbTimestamp —— SQLite 的 UTC 时间戳必须按 UTC 解析', () => {
  it('SQLite 格式 "YYYY-MM-DD HH:MM:SS" 按 UTC 解析（不是本地！）', () => {
    // 关键断言：等价的 UTC 时刻精确等于 15:30Z。若哪天被改成按本地解析，
    // 在 UTC+8 下这里会变成 07:30Z，断言立刻失败。
    expect(parseDbTimestamp('2026-07-15 15:30:00').toISOString()).toBe('2026-07-15T15:30:00.000Z')
  })

  it('SQLite 格式带毫秒也按 UTC 解析', () => {
    expect(parseDbTimestamp('2026-07-15 15:30:00.500').toISOString()).toBe('2026-07-15T15:30:00.500Z')
  })

  it('已有 Z 后缀的 ISO 串原样尊重', () => {
    expect(parseDbTimestamp('2026-07-15T15:30:00.000Z').toISOString()).toBe('2026-07-15T15:30:00.000Z')
  })

  it('显式时区偏移被尊重（不再补 Z）', () => {
    // +08:00 的 15:30 == 07:30Z
    expect(parseDbTimestamp('2026-07-15T15:30:00+08:00').toISOString()).toBe('2026-07-15T07:30:00.000Z')
  })

  it('无冒号的偏移（+0800）同样被识别', () => {
    expect(parseDbTimestamp('2026-07-15T15:30:00+0800').toISOString()).toBe('2026-07-15T07:30:00.000Z')
  })

  it('纯日期串按 UTC 午夜解析', () => {
    expect(parseDbTimestamp('2026-07-15').toISOString()).toBe('2026-07-15T00:00:00.000Z')
  })

  it('首尾空白被 trim 后再解析', () => {
    expect(parseDbTimestamp('  2026-07-15 15:30:00  ').toISOString()).toBe('2026-07-15T15:30:00.000Z')
  })

  it('传入 Date 实例时原样返回（同一引用，不做拷贝）', () => {
    const d = new Date('2026-07-15T15:30:00Z')
    expect(parseDbTimestamp(d)).toBe(d)
  })

  it('空串 / null / undefined 兜底为「此刻」（不抛错、不返回 Invalid Date）', () => {
    expect(isNow(parseDbTimestamp(''))).toBe(true)
    expect(isNow(parseDbTimestamp(null))).toBe(true)
    expect(isNow(parseDbTimestamp(undefined))).toBe(true)
    expect(isNow(parseDbTimestamp('   '))).toBe(true)
  })

  it('无法解析的字符串兜底为「此刻」（而非 Invalid Date）', () => {
    const d = parseDbTimestamp('not-a-date')
    expect(Number.isNaN(d.getTime())).toBe(false)
    expect(isNow(d)).toBe(true)
  })
})

describe('dbTimestampToLocalDate —— 按本地时区归日', () => {
  // 本仓库/CI 在 UTC+8。UTC 20:00 已是本地次日 04:00，是能真正咬住
  // 「误用 toISOString().split("T")[0] 取 UTC 日期」的样本。
  const utcPlus8 = new Date().getTimezoneOffset() === -480
  it.skipIf(!utcPlus8)('UTC 20:00（本地次日 04:00）归到本地次日', () => {
    expect(dbTimestampToLocalDate('2026-07-15 20:00:00')).toBe('2026-07-16')
  })

  it('与 parseDbTimestamp 的本地字段保持一致（顺带防「换实现」）', () => {
    const src = '2026-07-15 20:00:00'
    const d = parseDbTimestamp(src)
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(dbTimestampToLocalDate(src)).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    )
  })

  it('空值兜底为今天的本地日期', () => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    expect(dbTimestampToLocalDate('')).toBe(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    )
  })
})

describe('normalizeAccuracy —— 输出恒在 0-100', () => {
  it('0-1 制：小数写法 ×100（0.9 → 90，0.5 → 50，1 → 100）', () => {
    expect(normalizeAccuracy(0.9)).toBe(90)
    expect(normalizeAccuracy(0.5)).toBe(50)
    expect(normalizeAccuracy(1)).toBe(100)
  })

  it('0-100 制：整数写法原样返回（90 → 90，100 → 100）', () => {
    expect(normalizeAccuracy(90)).toBe(90)
    expect(normalizeAccuracy(100)).toBe(100)
  })

  it('大于 100 夹到 100', () => {
    expect(normalizeAccuracy(150)).toBe(100)
    expect(normalizeAccuracy(1e9)).toBe(100)
  })

  it('0 与负数都归 0（负数是本次修复点：旧实现 -0.5 会输出 -50）', () => {
    expect(normalizeAccuracy(0)).toBe(0)
    expect(normalizeAccuracy(-0.5)).toBe(0)
    expect(normalizeAccuracy(-1)).toBe(0)
    expect(normalizeAccuracy(-80)).toBe(0)
  })

  it('非数字 / NaN / Infinity / 字符串都归 0', () => {
    expect(normalizeAccuracy(undefined)).toBe(0)
    expect(normalizeAccuracy(null)).toBe(0)
    expect(normalizeAccuracy(NaN)).toBe(0)
    expect(normalizeAccuracy(Infinity)).toBe(0)
    expect(normalizeAccuracy(-Infinity)).toBe(0)
    expect(normalizeAccuracy('90' as unknown as number)).toBe(0)
  })

  it('属性：任意输入的输出都落在 [0, 100]（含负数脏数据）', () => {
    const samples = [-1e6, -100, -1, -0.5, 0, 0.001, 0.5, 1, 1.5, 50, 99.9, 100, 100.1, 1e6]
    for (const v of samples) {
      const out = normalizeAccuracy(v)
      expect(out, `输入 ${v} 的输出 ${out} 越界`).toBeGreaterThanOrEqual(0)
      expect(out, `输入 ${v} 的输出 ${out} 越界`).toBeLessThanOrEqual(100)
    }
    for (const bad of [undefined, null, NaN, Infinity]) {
      expect(normalizeAccuracy(bad)).toBeGreaterThanOrEqual(0)
      expect(normalizeAccuracy(bad)).toBeLessThanOrEqual(100)
    }
  })
})

describe('cn —— 类名合并', () => {
  it('剔除 falsy 条件类名', () => {
    // 用变量承载条件（真实用法即变量条件）——内联 `false && 'b'` 会被
    // no-constant-binary-expression 判为恒假常量表达式
    const isActive = false
    expect(cn('a', isActive && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('tailwind 冲突时后者覆盖前者', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('支持数组与对象两种 clsx 语法', () => {
    expect(cn(['x', { y: true, z: false }])).toBe('x y')
  })

  it('无参数返回空串', () => {
    expect(cn()).toBe('')
  })
})
