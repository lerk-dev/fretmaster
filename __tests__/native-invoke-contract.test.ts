/**
 * Tauri 桥接层契约测试（lib/native-window.ts / lib/native-stats.ts 的 **Tauri 分支**）。
 *
 * 现有 native-window-stats.test.ts 只覆盖了「非 Tauri → 静默降级」那一半；
 * 真正干活的 `invoke('...')` 那半从未被执行过。而它恰恰是最容易静默出错的地方：
 *
 *   - **命令名拼错** → invoke 抛错 → 被各自的 catch 吞掉 → 功能悄无声息地失效
 *     （窗口按钮不响应、统计存不进去，界面上没有任何报错）。
 *   - **参数名/结构不对** → Tauri 反序列化失败，同样被吞。
 *   - **返回值处理**（补字段、聚合、出错降级）只在真机才看得到。
 *
 * 所以这里做两件事：
 *   ① mock 掉 `@tauri-apps/api/*` 与 __TAURI__ 标志，逐函数断言「调了哪个命令、带了什么参数、
 *      怎么处理返回值、出错时降级成什么」。
 *   ② 一条**跨语言护栏**：把前端所有 `invoke('x')` 的命令名与 Rust 端
 *      `main.rs` 里 `generate_handler!` 实际注册的命令名做集合比对。
 *      「定义了但没注册」和「前端拼错」都会让 invoke 在真机上失败，而单测环境看不出来。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  setFullscreen: vi.fn(),
  isFullscreen: vi.fn(),
  setBackgroundColor: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setFullscreen: mocks.setFullscreen,
    isFullscreen: mocks.isFullscreen,
  }),
}))
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ setBackgroundColor: mocks.setBackgroundColor }),
}))

import * as win from '@/lib/native-window'
import * as stats from '@/lib/native-stats'

const winLike = window as unknown as { __TAURI__?: boolean }

beforeEach(() => {
  // 桥接层的 catch 会 logger.error 打日志（错误路径用例必然触发）——
  // 静音掉，避免测试输出被几十行堆栈淹没。
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})

  winLike.__TAURI__ = true // 让模块内的 isTauri() 返回 true，走到 invoke 分支
  mocks.invoke.mockReset()
  mocks.setFullscreen.mockReset()
  mocks.isFullscreen.mockReset()
  mocks.setBackgroundColor.mockReset()
  mocks.invoke.mockResolvedValue(undefined)
  mocks.setFullscreen.mockResolvedValue(undefined)
  mocks.isFullscreen.mockResolvedValue(false)
  mocks.setBackgroundColor.mockResolvedValue(undefined)
})

afterEach(() => {
  delete winLike.__TAURI__
  vi.restoreAllMocks()
})

// ==================================================== native-window

describe('native-window：Tauri 分支真的把命令发给了后端', () => {
  it('无参命令：minimize / maximize / close / start_dragging 各发一条对应命令', async () => {
    await win.minimizeWindow()
    expect(mocks.invoke).toHaveBeenCalledWith('minimize_window')

    await win.maximizeWindow()
    expect(mocks.invoke).toHaveBeenCalledWith('maximize_window')

    await win.closeWindow()
    expect(mocks.invoke).toHaveBeenCalledWith('close_window')

    await win.startDragging()
    expect(mocks.invoke).toHaveBeenCalledWith('start_dragging')
  })

  it('isWindowMaximized 透传后端返回值', async () => {
    mocks.invoke.mockResolvedValue(true)
    expect(await win.isWindowMaximized()).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('is_window_maximized')
  })

  it('全屏走 @tauri-apps/api/window，不走 invoke（保持 API 语义）', async () => {
    await win.setFullscreen(true)
    expect(mocks.setFullscreen).toHaveBeenCalledWith(true)
    expect(mocks.invoke).not.toHaveBeenCalled()

    mocks.isFullscreen.mockResolvedValue(true)
    expect(await win.isFullscreen()).toBe(true)
  })

  it('真全屏走 invoke，参数名是 enable（窗口全屏已无原生命令 —— 它不许改窗口）', async () => {
    await win.setTrueFullscreen(false)
    expect(mocks.invoke).toHaveBeenCalledWith('set_true_fullscreen', { enable: false })
  })

  it('setTrueFullscreen 成功后连带把 WebView 背景刷成统一底色（避免白闪）', async () => {
    await win.setTrueFullscreen(true)
    expect(mocks.setBackgroundColor).toHaveBeenCalledWith('#0b0f14')
  })

  it('setWebViewBackgroundColor 走 getCurrentWebview().setBackgroundColor', async () => {
    await win.setWebViewBackgroundColor('#123456')
    expect(mocks.setBackgroundColor).toHaveBeenCalledWith('#123456')
  })

  it('isTrueFullscreen 透传后端返回值', async () => {
    mocks.invoke.mockResolvedValue(true)
    expect(await win.isTrueFullscreen()).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('is_true_fullscreen')
  })
})

describe('native-window：invoke 失败必须被吞掉（窗口按钮不能把页面搞崩）', () => {
  it('操作类失败不抛出', async () => {
    mocks.invoke.mockRejectedValue(new Error('boom'))
    await expect(win.minimizeWindow()).resolves.toBeUndefined()
    await expect(win.maximizeWindow()).resolves.toBeUndefined()
    await expect(win.closeWindow()).resolves.toBeUndefined()
    await expect(win.startDragging()).resolves.toBeUndefined()
    await expect(win.setTrueFullscreen(true)).resolves.toBeUndefined()
  })

  it('查询类失败降级为 false', async () => {
    mocks.invoke.mockRejectedValue(new Error('boom'))
    expect(await win.isWindowMaximized()).toBe(false)
    expect(await win.isTrueFullscreen()).toBe(false)

    mocks.setFullscreen.mockRejectedValue(new Error('boom'))
    await expect(win.setFullscreen(true)).resolves.toBeUndefined()

    mocks.isFullscreen.mockRejectedValue(new Error('boom'))
    expect(await win.isFullscreen()).toBe(false)

    mocks.setBackgroundColor.mockRejectedValue(new Error('boom'))
    await expect(win.setWebViewBackgroundColor('#000')).resolves.toBeUndefined()
  })

  it('setTrueFullscreen 中第一步失败时不再去刷背景色（catch 生效）', async () => {
    mocks.invoke.mockRejectedValue(new Error('boom'))
    await win.setTrueFullscreen(true)
    expect(mocks.setBackgroundColor).not.toHaveBeenCalled()
  })
})

// ==================================================== applyFullscreen（模式分派）

/**
 * 「全屏类型 → 原生调用」的唯一分派点。
 *
 * 语义（用户 2026-10-03 **二次**拍板，推翻了当天早些时候的第一版）：
 *   窗口全屏 = **窗口一律不动**（尺寸/位置/窗口样式全部保持当前值），
 *              「内容铺满当前窗口」由应用层完成（layout-shell 隐藏自带标题栏）
 *              ⇒ 原生侧只发一条「确保退出真全屏」= `set_true_fullscreen(false)`；
 *   真全屏   = 客户区铺满整个显示器（**含任务栏**）⇒ `set_true_fullscreen(true)`。
 *
 * 🚨 断言的是**完整调用序列**。第一版语义（发 `set_windowed_fullscreen`）现在会
 * **因为那个命令已从 Rust 侧删除**而必然红灯 —— 想「改回最大化」的人必须先删掉这些断言，
 * 删的时候一定会看到这段注释。
 */
describe('native-window.applyFullscreen：模式 → 原生调用', () => {
  const seq = () => mocks.invoke.mock.calls.map((c) => [c[0], (c[1] as { enable?: boolean } | undefined)?.enable])

  it('windowed（窗口全屏＝窗口不动）：只发一条「退出真全屏」', async () => {
    await win.applyFullscreen(true, 'windowed')
    expect(seq()).toEqual([['set_true_fullscreen', false]])
  })

  it('fullscreen（真全屏＝含任务栏）：发 set_true_fullscreen{enable:true}', async () => {
    await win.applyFullscreen(true, 'fullscreen')
    expect(seq()).toEqual([['set_true_fullscreen', true]])
  })

  it('退出（enable=false）：两种模式都只关真全屏（窗口本来就该保持原样）', async () => {
    await win.applyFullscreen(false, 'fullscreen')
    expect(seq()).toEqual([['set_true_fullscreen', false]])

    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue(undefined)
    await win.applyFullscreen(false, 'windowed')
    expect(seq()).toEqual([['set_true_fullscreen', false]])
  })

  it('未知/缺省模式兜底为 windowed（宁可不动窗口，也不要静默变全屏）', async () => {
    await win.applyFullscreen(true, undefined as unknown as 'windowed')
    expect(seq()).toEqual([['set_true_fullscreen', false]])
  })

  it('非 Tauri 环境一条命令都不发', async () => {
    delete winLike.__TAURI__
    await win.applyFullscreen(true, 'fullscreen')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

// ==================================================== native-stats

describe('native-stats：Tauri 分支的 SQLite 读写契约', () => {
  it('savePracticeStats 用 camelCase 参数名发命令，并回 success/id', async () => {
    mocks.invoke.mockResolvedValue(7)
    const res = await stats.savePracticeStats({
      exercise_type: 'scale',
      exercise_detail: 'C 大调',
      score: 88,
      duration: 120,
      accuracy: 0.9,
      notes: '还行',
    })
    expect(mocks.invoke).toHaveBeenCalledWith('save_practice_stats', {
      exerciseType: 'scale',
      exerciseDetail: 'C 大调',
      score: 88,
      duration: 120,
      accuracy: 0.9,
      notes: '还行',
    })
    expect(res).toEqual({ status: 'success', message: '已保存到本地数据库', id: 7 })
  })

  it('savePracticeStats：exercise_type 为空时退回 exerciseType，再退回「未知练习」', async () => {
    mocks.invoke.mockResolvedValue(1)
    await stats.savePracticeStats({
      exercise_type: '',
      exerciseType: 'chord',
      score: 1,
      duration: 1,
    } as unknown as Parameters<typeof stats.savePracticeStats>[0])
    expect(mocks.invoke.mock.calls[0][1]).toMatchObject({ exerciseType: 'chord' })

    mocks.invoke.mockClear()
    mocks.invoke.mockResolvedValue(1)
    await stats.savePracticeStats({ score: 1, duration: 1 } as unknown as Parameters<typeof stats.savePracticeStats>[0])
    expect(mocks.invoke.mock.calls[0][1]).toMatchObject({ exerciseType: '未知练习' })
  })

  it('savePracticeStats：后端返回字符串 id 也归一成 number', async () => {
    mocks.invoke.mockResolvedValue('42')
    const res = await stats.savePracticeStats({ exercise_type: 'scale', score: 1, duration: 1 })
    expect(res.id).toBe(42)
    expect(typeof res.id).toBe('number')
  })

  it('getAllPracticeStats 取数后补齐 date / exerciseType 两个前端别名', async () => {
    mocks.invoke.mockResolvedValue([
      { exercise_type: 'scale', score: 90, duration: 60, created_at: '2026-07-15 15:30:00' },
    ])
    const rows = await stats.getAllPracticeStats()
    expect(mocks.invoke).toHaveBeenCalledWith('get_all_practice_stats')
    expect(rows).toEqual([
      {
        exercise_type: 'scale',
        score: 90,
        duration: 60,
        created_at: '2026-07-15 15:30:00',
        date: '2026-07-15 15:30:00',
        exerciseType: 'scale',
      },
    ])
  })

  it('getRecentStats 把天数作为 days 参数传下去，并同样补别名', async () => {
    mocks.invoke.mockResolvedValue([
      { exercise_type: 'pitch_finding', score: 70, duration: 30, created_at: '2026-07-15 15:30:00' },
    ])
    await stats.getRecentStats(30)
    expect(mocks.invoke).toHaveBeenCalledWith('get_recent_practice_stats', { days: 30 })
  })

  it('getStatsSummary 透传后端摘要', async () => {
    const summary = {
      total_sessions: 5,
      total_duration: 600,
      average_score: 80,
      average_accuracy: 85,
      last_practice: '2026-07-15 15:30:00',
    }
    mocks.invoke.mockResolvedValue(summary)
    expect(await stats.getStatsSummary()).toEqual(summary)
    expect(mocks.invoke).toHaveBeenCalledWith('get_practice_stats_summary')
  })

  it('getStatsByExerciseType 按类型分组，平均分保留两位小数', async () => {
    mocks.invoke.mockResolvedValue([
      { exercise_type: 'scale', count: 3, avg_score: 85.6666, total_duration: 100 },
      { exercise_type: 'chord', count: 1, avg_score: 90, total_duration: 20 },
    ])
    expect(await stats.getStatsByExerciseType()).toEqual({
      scale: { count: 3, avgScore: 85.67, totalDuration: 100 },
      chord: { count: 1, avgScore: 90, totalDuration: 20 },
    })
  })

  it('clearAllPracticeStats 发对应命令', async () => {
    await stats.clearAllPracticeStats()
    expect(mocks.invoke).toHaveBeenCalledWith('clear_all_practice_stats')
  })

  it('syncLocalBackupToServer 在 Tauri 下是空实现（恒 0，不回写本地备份）', async () => {
    expect(await stats.syncLocalBackupToServer()).toBe(0)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

describe('native-stats：invoke 失败时的降级方向', () => {
  it('查询类降级为空集合 / 零值摘要（页面照常渲染，只是没数据）', async () => {
    mocks.invoke.mockRejectedValue(new Error('db locked'))
    expect(await stats.getAllPracticeStats()).toEqual([])
    expect(await stats.getRecentStats(7)).toEqual([])
    expect(await stats.getStatsByExerciseType()).toEqual({})
    expect(await stats.getStatsSummary()).toEqual({
      total_sessions: 0,
      total_duration: 0,
      average_score: 0,
      average_accuracy: 0,
      last_practice: null,
    })
  })

  it('写入类失败必须上抛（不能被当成「保存成功」，否则记录悄悄丢失）', async () => {
    mocks.invoke.mockRejectedValue(new Error('db locked'))
    await expect(
      stats.savePracticeStats({ exercise_type: 'scale', score: 1, duration: 1 })
    ).rejects.toThrow('db locked')
    await expect(stats.clearAllPracticeStats()).rejects.toThrow('db locked')
  })

  it('后端返回非数组时也不炸（map 抛错 → 降级为空）', async () => {
    mocks.invoke.mockResolvedValue(null)
    expect(await stats.getAllPracticeStats()).toEqual([])
    expect(await stats.getStatsByExerciseType()).toEqual({})
  })
})

// ==================================================== 跨语言护栏

describe('跨语言护栏：前端 invoke 的命令名必须在 Rust 端注册', () => {
  const ROOT = process.cwd()

  /** 前端所有可能 invoke 的文件（Tauri 桥接层）。 */
  const FE_FILES = [
    'lib/native-audio.ts',
    'lib/native-window.ts',
    'lib/native-stats.ts',
    'lib/position-stats.ts',
    'components/debug-panel.tsx',
  ]

  /**
   * 剥掉**整行**注释。
   *
   * 这步不是洁癖：变异验证时实测到，把 `generate_handler!` 里的一行注册注释掉
   * （`// fretmaster::commands::minimize_window,`），纯正则护栏**照样认为它已注册**，
   * 于是「漏注册」这个最危险的错误类型完全测不出来。必须先去注释。
   * （只处理整行注释；行尾注释在宏参数里不常见，暂不处理。）
   */
  function stripLineComments(text: string): string {
    return text
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n')
  }

  /** 从任意文本里抽出 `invoke('name')` / `invoke<T>('name')` 的命令名。 */
  function parseInvokedCommands(text: string): Set<string> {
    const names = new Set<string>()
    const re = /\binvoke\s*(?:<[^>()]*>)?\s*\(\s*'([a-z_0-9]+)'/g
    let m: RegExpExecArray | null
    while ((m = re.exec(stripLineComments(text)))) names.add(m[1])
    return names
  }

  /** 从任意文本的 `generate_handler!` 块里取注册的命令名（路径最后一段）。 */
  function parseRegisteredCommands(text: string): { names: Set<string>; found: boolean } {
    const start = text.indexOf('generate_handler!')
    if (start < 0) return { names: new Set(), found: false }
    const end = text.indexOf('])', start)
    const block = stripLineComments(text.slice(start, end < 0 ? undefined : end))
    const names = new Set<string>()
    const re = /[a-zA-Z_0-9]+::([a-z_0-9]+)\s*,/g
    let m: RegExpExecArray | null
    while ((m = re.exec(block))) names.add(m[1])
    return { names, found: true }
  }

  function collectFrontendCommands(): Map<string, string> {
    const found = new Map<string, string>()
    for (const rel of FE_FILES) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      for (const name of parseInvokedCommands(text)) {
        if (!found.has(name)) found.set(name, rel)
      }
    }
    return found
  }

  function collectRegisteredCommands(): Set<string> {
    const text = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8')
    const { names, found } = parseRegisteredCommands(text)
    expect(found, 'main.rs 里找不到 generate_handler!').toBe(true)
    return names
  }

  describe('护栏自测（防止护栏自己失效后恒真）', () => {
    it('被整行注释掉的注册行不算已注册', () => {
      const fake = [
        'tauri::generate_handler![',
        '    fretmaster::commands::a,',
        '    // fretmaster::commands::b,',
        '])',
      ].join('\n')
      expect([...parseRegisteredCommands(fake).names]).toEqual(['a'])
    })

    it('注释里的 invoke 不算调用', () => {
      const fake = [
        "await invoke('real_one')",
        "// await invoke('commented_out')",
        "const s = \"invoke('inside_string_still_counts')\"",
      ].join('\n')
      const names = [...parseInvokedCommands(fake)]
      expect(names).toContain('real_one')
      expect(names).not.toContain('commented_out')
    })

    it('找不到 generate_handler! 时显式返回 found=false（而不是静默给空集）', () => {
      expect(parseRegisteredCommands('fn main() {}').found).toBe(false)
    })
  })

  it('前端每个命令名都能在 Rust 的 generate_handler! 里找到（含命令名扫描下限，防恒真）', () => {
    const fe = collectFrontendCommands()
    const rust = collectRegisteredCommands()

    // 扫描下限：一旦抽取逻辑失效（正则被改坏），这两个数字会塌下来，测试立刻红，
    // 而不是「空集 ⊆ 空集」地假通过。
    expect(fe.size, '前端命令名抽取数量过少，扫描可能已失效').toBeGreaterThanOrEqual(35)
    expect(rust.size, 'Rust 注册命令抽取数量过少，扫描可能已失效').toBeGreaterThanOrEqual(50)

    const missing = [...fe.entries()]
      .filter(([name]) => !rust.has(name))
      .map(([name, file]) => `${file} 调用了未注册的命令 '${name}'`)

    expect(missing).toEqual([])
  })

  it('Rust 端每个 #[tauri::command] 定义都出现在注册列表里（防「定义了忘了注册」）', () => {
    const rustDir = path.join(ROOT, 'src-tauri', 'src')
    const defined = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.rs')) {
          const text = stripLineComments(fs.readFileSync(full, 'utf8'))
          const re = /#\[tauri::command\][\s\S]{0,300}?\bfn\s+([a-z_0-9]+)/g
          let m: RegExpExecArray | null
          while ((m = re.exec(text))) defined.add(m[1])
        }
      }
    }
    walk(rustDir)

    expect(defined.size, '#[tauri::command] 抽取数量过少，扫描可能已失效').toBeGreaterThanOrEqual(50)
    const unregistered = [...defined].filter((n) => !collectRegisteredCommands().has(n)).sort()
    expect(unregistered).toEqual([])
  })
})

// ==================================================== 跨语言字段名护栏

/**
 * 命令名对齐（上面那条）只保证「调得到」，**不保证读得到东西**。
 *
 * Tauri 只对命令的**顶层参数名**做 camelCase 转换；返回值/嵌套结构体的字段名由
 * serde 原样序列化。所以一个没有 `#[serde(rename_all = "camelCase")]` 的 Rust 结构体，
 * 线上发的是 snake_case，而前端 TS 接口按 camelCase 声明 ⇒ **字段全为 undefined，且不报错**。
 *
 * 本项目里两种命名口径是**并存**的：`db/stats.rs` 显式写了 camelCase，
 * `commands/audio_commands.rs` 的 `AudioStatus` 没有。所以不能靠「统一改成 camelCase」
 * 一次性解决，只能逐个结构体锁定。这条护栏锁 `AudioStatus`：
 *
 *   Rust 字段(snake) ⊆ 前端 Raw 接口字段      —— Rust 加字段而前端忘了收 ⇒ 红
 *   snake→camel(Rust 字段) === 前端 AudioStatus 字段 —— 任一侧重命名/漏字段 ⇒ 红
 *
 * 它咬住的就是 2026-10-07 修的那个真 bug：此前 `getAudioStatus()` 直接把返回值当
 * `AudioStatus` 用，`isCapturing` 恒 undefined ⇒ `ensureCaptureRunning` 幂等守卫失效。
 */
describe('跨语言字段名护栏：AudioStatus 的 Rust 字段与前端接口必须一一对上', () => {
  const ROOT = process.cwd()
  const RUST_FILE = 'src-tauri/src/commands/audio_commands.rs'
  const TS_FILE = 'lib/native-audio.ts'

  /** 抽 Rust struct 的 pub 字段名（原样，snake_case）。 */
  function parseRustStructFields(text: string, structName: string): string[] {
    const lines = text.split('\n')
    // 用 includes 而不是 `new RegExp('...\\s...')`：模板字符串里的 `\s` 会被 TS 当普通
    // `s` 吃掉（未知转义）⇒ 抽取恒为空集。上面那条「扫描下限」就是专门抓这个的。
    const start = lines.findIndex((l) => l.includes('pub struct ' + structName))
    if (start < 0) return []
    const fields: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*\}/.test(lines[i])) break
      const m = /^\s*pub\s+([a-z_][a-z_0-9]*)\s*:/.exec(lines[i])
      if (m) fields.push(m[1])
    }
    return fields
  }

  /** 抽 TS interface 的字段名（去掉可选标记 `?`），跳过注释行。 */
  function parseTsInterfaceFields(text: string, ifaceName: string): string[] {
    const lines = text.split('\n')
    const start = lines.findIndex((l) => l.includes('interface ' + ifaceName))
    if (start < 0) return []
    const fields: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*\}/.test(lines[i])) break
      if (/^\s*(\/\/|\/\*|\*)/.test(lines[i])) continue
      const m = /^\s*([A-Za-z_][A-Za-z_0-9]*)\??\s*:/.exec(lines[i])
      if (m) fields.push(m[1])
    }
    return fields
  }

  const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

  const rustText = fs.readFileSync(path.join(ROOT, RUST_FILE), 'utf8')
  const tsText = fs.readFileSync(path.join(ROOT, TS_FILE), 'utf8')
  const rustFields = parseRustStructFields(rustText, 'AudioStatus')
  const rawFields = parseTsInterfaceFields(tsText, 'RawAudioStatus')
  const outFields = parseTsInterfaceFields(tsText, 'AudioStatus')

  it('三处抽取都真的抽到了字段（扫描下限，防「空集恒通过」）', () => {
    expect(rustFields.length, 'Rust AudioStatus 字段抽取过少').toBeGreaterThanOrEqual(5)
    expect(rawFields.length, 'RawAudioStatus 字段抽取过少').toBeGreaterThanOrEqual(5)
    expect(outFields.length, 'AudioStatus 字段抽取过少').toBeGreaterThanOrEqual(5)
  })

  it('Rust 每个字段前端 Raw 接口都收下了（Rust 加字段而前端没收 ⇒ 静默 undefined）', () => {
    const missing = rustFields.filter((f) => !rawFields.includes(f))
    expect(missing, `${TS_FILE} 的 RawAudioStatus 缺少字段`).toEqual([])
  })

  it('Rust 字段转 camelCase 后与前端 AudioStatus 接口字段集合完全相等', () => {
    const expected = rustFields.map(snakeToCamel).sort()
    const actual = [...outFields].sort()
    const missing = expected.filter((f) => !actual.includes(f))
    const extra = actual.filter((f) => !expected.includes(f))
    expect(
      { missing, extra },
      'Rust 侧加减/重命名了 AudioStatus 字段，但前端 AudioStatus 接口没跟上',
    ).toEqual({ missing: [], extra: [] })
  })
})
