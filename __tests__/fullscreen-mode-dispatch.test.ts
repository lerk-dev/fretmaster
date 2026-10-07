/**
 * 全屏「模式分派」契约（2026-10-03）。
 *
 * 语义**二次拍板**（用户原文）：
 *   「我说的窗口全屏，是当前窗口全屏，而不是最大化留任务栏，当前窗口的大小保持不变，
 *     内容填满当前窗口」
 * ⇒ **窗口全屏 = 窗口一律不动**（尺寸/位置/窗口样式全部保持当前值）；
 *   「内容铺满当前窗口」是**应用层**的事（`components/layout-shell.tsx` 在 `isFullscreen`
 *   时隐藏自带标题栏，内容区自然长满客户区）。
 *   真全屏 = 手工 Win32 全屏，**客户区**铺满整块显示器（含任务栏）。
 *
 * 🚨 第一版语义（同一个会话早些时候，已被用户否掉）把「窗口全屏」实现成
 * `window.maximize()` + 一个新原生命令 `set_windowed_fullscreen`。教训：
 * **只要原生侧存在一条「窗口全屏」路径，就一定会有人往里塞几何操作** ⇒ 本文件改为钉住
 * 「这条路径必须不存在」，比原来「钉住它必须调 maximize」更强。
 *
 * 本文件只管**源码形态**；运行时「到底发了哪几条命令」由
 * `native-invoke-contract.test.ts` 覆盖（那条断言现在会因为命令不存在而必然红灯）。
 * 真全屏的几何细节由 `fullscreen-client-area-parity.test.ts` 覆盖，此处不重复（⛔ 铁律 14）。
 *
 * 每条判据都自带**反向对照**（旧写法必须判为不合格），防饱和断言（⛔ 铁律 20）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const WIN_CMD_REL = path.join('src-tauri', 'src', 'commands', 'window_commands.rs')
const MAIN_REL = path.join('src-tauri', 'src', 'main.rs')
const NATIVE_WINDOW_REL = path.join('lib', 'native-window.ts')
const HOOK_REL = path.join('hooks', 'use-fullscreen.ts')

/**
 * 剥掉行注释与块注释。
 * 🚨 必须剥干净：本仓的**墓碑注释**里逐字写着 `set_windowed_fullscreen`
 * （`window_commands.rs` 里那段「别再把它加回来」），不剥注释的 `toContain`
 * 会把「注释里提了一嘴」当成「命令还在」（⛔ 铁律 20 的假通过形态）。
 * ⚠️ tsconfig target = ES6 ⇒ 禁用 `/s` 标志，用 `[\s\S]`（⛔ 铁律 23）。
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => {
      const i = l.indexOf('//')
      return i >= 0 ? l.slice(0, i) : l
    })
    .join('\n')
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ==================================================== ① 原生侧不许有「窗口全屏」命令

/** 「还存在一条会动窗口的窗口全屏路径」的判据（命令名 / TS 包装名，任一出现即算）。 */
function hasWindowedFullscreenNativePath(src: string): boolean {
  return /set_windowed_fullscreen|setWindowedFullscreen/.test(src)
}

/** 第一版实现（已被用户否掉）：窗口全屏 = `window.maximize()`。 */
const LEGACY_WINDOWED_CMD_SNIPPET = `
#[tauri::command]
pub async fn set_windowed_fullscreen<R: Runtime>(window: tauri::Window<R>, enable: bool) -> Result<(), String> {
    if enable {
        window.maximize().map_err(|e| e.to_string())
    } else {
        window.unmaximize().map_err(|e| e.to_string())
    }
}
`

/** 第一版的 TS 包装（同样不许复活）。 */
const LEGACY_WINDOWED_WRAPPER_SNIPPET = `
export async function setWindowedFullscreen(enable: boolean): Promise<void> {
  if (!isTauri()) return
  const invoke = await getInvoke()
  await invoke('set_windowed_fullscreen', { enable })
}
`

describe('窗口全屏＝窗口一律不动 ⇒ 原生侧不许存在「窗口全屏命令」', () => {
  it('判据本身有分辨力：第一版的 Rust 命令 / TS 包装都必须判为「存在」', () => {
    // 🔑 反向对照。任一条失败 ⇒ 下面的正向断言是恒真的（饱和断言）。
    expect(hasWindowedFullscreenNativePath(LEGACY_WINDOWED_CMD_SNIPPET)).toBe(true)
    expect(hasWindowedFullscreenNativePath(LEGACY_WINDOWED_WRAPPER_SNIPPET)).toBe(true)
  })

  it('window_commands.rs 里没有窗口全屏命令（剥注释后），只剩墓碑注释', () => {
    const code = stripComments(read(WIN_CMD_REL))
    expect(hasWindowedFullscreenNativePath(code)).toBe(false)
    // 反向自证：注释确实还在（即「被剥掉的只是注释」这个前提成立，不是文件被清空了）
    expect(read(WIN_CMD_REL)).toContain('set_windowed_fullscreen')
  })

  it('main.rs 的 generate_handler! 里没有注册窗口全屏命令', () => {
    const code = stripComments(read(MAIN_REL))
    expect(hasWindowedFullscreenNativePath(code)).toBe(false)
    // 反向自证：处理器列表还在，且窗口类命令仍注册（排除「整段被删」这种假绿）
    expect(code).toContain('set_true_fullscreen')
    expect(code).toContain('maximize_window')
  })

  it('lib/native-window.ts 既不发这条命令、也不再导出同名函数（含运行时导出表）', async () => {
    expect(hasWindowedFullscreenNativePath(stripComments(read(NATIVE_WINDOW_REL)))).toBe(false)
    // 静态源码可能被注释糊过去，导出表是运行时事实 ⇒ 两条都要过
    const mod = await import('@/lib/native-window')
    expect(Object.keys(mod)).not.toContain('setWindowedFullscreen')
    expect(Object.keys(mod)).toContain('applyFullscreen')
  })
})

// ==================================================== ② hook 按设置分派

/**
 * 「hook 按设置分派」的判据，四项全中才算：
 *   ① 真的调了 `applyFullscreen(newState, fullscreenMode)`（具体实参形态）；
 *   ② **不再**直接调 `setTrueFullscreen(`（那正是「全屏类型是装饰品」时代的 bug）；
 *   ③ 模式来自响应式订阅 `useAppStore((s) => s.focusMode.fullscreenMode)`；
 *   ④ `fullscreenMode` 出现在 `useCallback` 的依赖数组里。
 */
function hookDispatchesByMode(src: string): boolean {
  const code = stripComments(src)
  const deps = code.match(/const handleToggleFullscreen = useCallback\([\s\S]*?\},\s*\[([^\]]*)\]\)/)
  return (
    /applyFullscreen\s*\(\s*newState\s*,\s*fullscreenMode\s*\)/.test(code) &&
    !/setTrueFullscreen\s*\(/.test(code) &&
    /useAppStore\(\(s\)\s*=>\s*s\.focusMode\.fullscreenMode\)/.test(code) &&
    !!deps &&
    /\bfullscreenMode\b/.test(deps[1])
  )
}

/** 反面：更早的 hook（无条件走真全屏、依赖数组里没有模式）。 */
const LEGACY_HOOK_SNIPPET = `
export function useFullscreen(isTauri: boolean) {
  const store = useAppStore.getState()
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const handleToggleFullscreen = useCallback(async (enable?: boolean) => {
    const newState = enable !== undefined ? enable : !isFullscreen
    if (isTauri) {
      const { setTrueFullscreen } = await import('@/lib/native-window')
      await setTrueFullscreen(newState)
    }
    setFullscreenState(newState)
  }, [isFullscreen, toggleFullscreenState, setFullscreenState, isTauri])
  return { isFullscreen, handleToggleFullscreen }
}
`

describe('全屏入口必须按设置分派（不许无条件走真全屏）', () => {
  it('判据有分辨力：修复前的 hook 必须判为不合格', () => {
    // 🔑 反向对照
    expect(hookDispatchesByMode(LEGACY_HOOK_SNIPPET)).toBe(false)
  })

  it('use-fullscreen.ts：调 applyFullscreen(newState, fullscreenMode)、不再直接调 setTrueFullscreen', () => {
    expect(hookDispatchesByMode(read(HOOK_REL))).toBe(true)
  })
})
