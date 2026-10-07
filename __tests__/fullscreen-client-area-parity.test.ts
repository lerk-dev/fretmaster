/**
 * 真全屏几何契约：**客户区**必须对齐显示器，而不是「窗口矩形」。
 *
 * 背景（2026-10-03，用户报「练习时全屏无法实现真正全屏，要么有白边要么有黑边」）：
 *
 * `window_commands.rs::set_true_fullscreen` 是手工 Win32 改造（摘边框 + WS_POPUP + TOPMOST），
 * 它只把**窗口矩形**摆成 `rcMonitor`。但 tao（Tauri 窗口层）对「无边框 + 阴影」窗口在
 * `WM_NCCALCSIZE` 里会把客户区**内缩**一圈
 * （`tao-0.35.2/src/platform_impl/windows/event_loop.rs:2164` +
 *  `util.rs::calculate_insets_for_dpi` = `SM_CXSIZEFRAME + SM_CXPADDEDBORDER`，Win11 顶部再 +1），
 * 该分支条件是 `MARKER_UNDECORATED_SHADOW && !is_fullscreen`，而 `is_fullscreen` 指的是
 * **tao 自己的** `window_state.fullscreen` —— 这条手工路径从不设置它 ⇒ tao 永远认为「不是全屏」
 * ⇒ 客户区恒比窗口小一圈 ⇒ **真全屏时屏幕上裸露一圈 DWM 画的窗口边框**。
 *
 * 真机实测（`examples/win_fullscreen_probe.rs`，1280x800 显示器，窗口矩形 = rcMonitor）：
 *   客户区 = (7,1) 1267x792，隐形非客户区 = 左 7 / 上 1 / 右 6 / 下 7
 *   左边 x=0..10 采样 = `rgb(0,0,0)` **纯黑**；上边 y=0..1 采样 = `rgb(255,255,255)` **纯白**
 *   应用自身底色 = `rgb(15,17,20)`
 * ⇒ 黑边与白边**同屏同时存在**，这就是「要么有白边要么有黑边」。
 *
 * 修法：按**实测**内缩量把窗口外扩同样大小，把隐形非客户区推到屏幕外，
 * 使客户区正好等于显示器矩形。补偿后同一探针采样四边全部为 `rgb(15,17,20)`，边消失。
 *
 * 本文件是**源码级护栏**（Rust 侧几何无法在 jsdom 里跑）：内缩量必须实测、外扩补偿必须存在、
 * 且位置必须在样式改完之后。自带反向对照（legacy 片段必须判为「无补偿」），防止断言恒真。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const WIN_CMD_REL = path.join('src-tauri', 'src', 'commands', 'window_commands.rs')

/** 剥掉行注释再断言（否则注释里的示例代码会喂出假通过）。本文件无字符串内含 `//` 的情况。 */
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((l) => {
      const i = l.indexOf('//')
      return i >= 0 ? l.slice(0, i) : l
    })
    .join('\n')
}

/** 取出 windows 版 `set_true_fullscreen` 的 enable / disable 两个分支（已剥注释）。 */
function slices(): { enable: string; disable: string } {
  const src = stripLineComments(fs.readFileSync(path.join(ROOT, WIN_CMD_REL), 'utf8'))
  const start = src.indexOf('pub async fn set_true_fullscreen')
  expect(start, '未找到 windows 版 set_true_fullscreen').toBeGreaterThan(-1)
  const end = src.indexOf('#[cfg(not(target_os = "windows"))]', start)
  expect(end, '未找到非 windows 版 set_true_fullscreen 分界').toBeGreaterThan(start)
  const body = src.slice(start, end)

  const elseAt = body.indexOf('\n    } else {')
  expect(elseAt, '未找到 enable/disable 分界').toBeGreaterThan(-1)
  return { enable: body.slice(0, elseAt), disable: body.slice(elseAt) }
}

/**
 * 「客户区对齐显示器」的判据：存在一处 SetWindowPos，用**实测内缩量**把窗口四个方向外扩。
 * 只有同时满足这 6 个具体实参形态才算 —— 少任何一个都不算（防止强度不足的断言）。
 */
function hasClientAreaAlignment(src: string): boolean {
  return (
    /sx\s*-\s*ins_l/.test(src) &&
    /sy\s*-\s*ins_t/.test(src) &&
    /sw\s*\+\s*ins_l\s*\+\s*ins_r/.test(src) &&
    /sh\s*\+\s*ins_t\s*\+\s*ins_b/.test(src) &&
    /measure_nc_insets\s*\(/.test(src) &&
    /SetWindowPos/.test(src)
  )
}

/** 修复前的写法：只把窗口矩形摆成 rcMonitor，没有任何外扩补偿。 */
const LEGACY_ENABLE_SNIPPET = `
    SetWindowPos(
        hwnd_handle,
        HWND_TOPMOST,
        sx,
        sy,
        sw,
        sh,
        SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW,
    );
`

describe('真全屏几何：客户区必须对齐显示器', () => {
  it('判据本身有分辨力：修复前的写法必须被判为「无补偿」', () => {
    // 🔑 反向对照。若这条失败，说明下面的正向断言是恒真的（饱和断言）。
    expect(hasClientAreaAlignment(LEGACY_ENABLE_SNIPPET)).toBe(false)
  })

  it('enable 分支存在「按实测内缩量外扩窗口」的补偿', () => {
    const { enable } = slices()
    expect(hasClientAreaAlignment(enable)).toBe(true)
  })

  it('内缩量是**实测**的（GetWindowRect / GetClientRect / ClientToScreen 三件套齐），不是写死的常量', () => {
    const src = stripLineComments(fs.readFileSync(path.join(ROOT, WIN_CMD_REL), 'utf8'))
    const fnAt = src.indexOf('unsafe fn measure_nc_insets')
    expect(fnAt, '未找到 measure_nc_insets').toBeGreaterThan(-1)
    const fnBody = src.slice(fnAt, src.indexOf('\n}', fnAt))

    // 🚨 必须剥掉 `use ...;` 行再断言：函数体内有
    // `use windows_sys::...::ClientToScreen;` ⇒ 直接 toContain('ClientToScreen')
    // 会命中**导入行**而不是**调用**，把调用整行删掉也照样绿（实测的假通过形态）。
    const noUse = fnBody
      .split('\n')
      .filter((l) => !l.trim().startsWith('use '))
      .join('\n')

    // 必须真的去问系统要几何（断言调用形态，不是名字出现过）
    expect(noUse).toContain('GetWindowRect(hwnd, &mut wr)')
    expect(noUse).toContain('GetClientRect(hwnd, &mut cr)')
    expect(noUse).toContain('ClientToScreen(hwnd, &mut origin)')
    // 返回的四个量必须由这三个来源做差得出（写死 7/1/6/7 会让这些差值表达式消失）
    expect(noUse).toContain('origin.x - wr.left')
    expect(noUse).toContain('origin.y - wr.top')
    expect(noUse).toContain('wr.right - (origin.x + cr.right)')
    expect(noUse).toContain('wr.bottom - (origin.y + cr.bottom)')
  })

  it('measure_nc_insets 必须被真的调用（调用点 ≥ 1，不是只定义不用）', () => {
    const src = stripLineComments(fs.readFileSync(path.join(ROOT, WIN_CMD_REL), 'utf8'))
    const matches = src.match(/measure_nc_insets\s*\(/g) ?? []
    // 定义处 1 次（`unsafe fn measure_nc_insets(`），其余是调用点
    expect(matches.length - 1).toBeGreaterThanOrEqual(1)
  })

  it('补偿必须发生在样式改完之后（否则 NCCALCSIZE 读的是旧样式，内缩量会错）', () => {
    const { enable } = slices()
    const styleAt = enable.indexOf('SetWindowLongPtrW(hwnd_handle, GWL_STYLE, new_style)')
    const fixAt = enable.search(/sx\s*-\s*ins_l/)
    expect(styleAt, '未找到 GWL_STYLE 改写').toBeGreaterThan(-1)
    expect(fixAt, '未找到外扩补偿').toBeGreaterThan(-1)
    expect(fixAt).toBeGreaterThan(styleAt)
  })

  it('退出全屏按进入前保存的原始窗口矩形恢复（不需要反向补偿，也不能漏恢复）', () => {
    const { disable } = slices()
    expect(disable).toMatch(/saved\.left/)
    expect(disable).toMatch(/saved\.top/)
    expect(disable).toMatch(/saved\.width/)
    expect(disable).toMatch(/saved\.height/)
  })
})
