//! 诊断探针：测量 FretMaster 主窗口的真实几何，用于定位「全屏后仍有白边/黑边」。
//!
//! 关键量（全部为**物理像素**）：
//!   窗口矩形 GetWindowRect         —— 窗口在屏幕上占多大
//!   客户区矩形 GetClientRect+ClientToScreen —— 子窗口（WebView2）最多只能覆盖到这里
//!   显示器矩形 rcMonitor           —— 真全屏应该达到的目标
//!
//! 判定：**客户区 != 显示器矩形**的那部分，任何子窗口都盖不住 ⟹ 就是用户看到的那圈边。
//!
//! 用法（可组合）：
//!   win_fullscreen_probe                 只测量
//!   win_fullscreen_probe --press-f       先激活窗口敲一次 F（应用里 F = 切全屏）再测量
//!   win_fullscreen_probe --sample        沿屏幕四边采样像素（看那圈边到底是什么颜色）
//!   win_fullscreen_probe --fix           把窗口外扩「窗口矩形−客户区」的量，使**客户区**正好
//!                                        等于显示器矩形（验证修法，不改应用代码）

#![cfg(windows)]

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;

use windows_sys::Win32::Foundation::{HWND, LPARAM, POINT, RECT, TRUE, BOOL};
use windows_sys::Win32::Graphics::Gdi::{
    ClientToScreen, GetDC, GetDeviceCaps, GetMonitorInfoW, GetPixel, MonitorFromWindow, ReleaseDC,
    LOGPIXELSX, MONITOR_DEFAULTTONEAREST, MONITORINFO,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, mouse_event, KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, GetAncestor, GetClassNameW, GetClientRect, GetForegroundWindow,
    GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, IsIconic,
    IsWindowVisible, IsZoomed, SetCursorPos, SetForegroundWindow, SetWindowPos, ShowWindow,
    WindowFromPoint, GA_ROOT, GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOZORDER,
    SW_MAXIMIZE, SW_RESTORE,
};

const VK_MENU: u8 = 0x12;
const VK_F: u8 = 0x46;
const WS_POPUP_BIT: u32 = 0x8000_0000;

fn is_popup(h: HWND) -> bool {
    (unsafe { GetWindowLongPtrW(h, GWL_STYLE) } as u32) & WS_POPUP_BIT != 0
}

fn click_at(x: i32, y: i32) {
    unsafe {
        SetCursorPos(x, y);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }
    std::thread::sleep(std::time::Duration::from_millis(250));
}

fn focus_and_press_f(h: HWND) {
    unsafe {
        // 经典手法：先敲一下 Alt，本进程才拿到「最近一次输入」，SetForegroundWindow 不被拒
        keybd_event(VK_MENU, 0, 0, 0);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
        let ok = SetForegroundWindow(h);
        std::thread::sleep(std::time::Duration::from_millis(400));

        // 🚨 只有 SetForegroundWindow 成功**不代表 WebView2 拿到了键盘焦点**
        //（实测返回 1 但按键仍落到别处、或整串合成按键被丢掉）。补一次合成左键点击，
        // 把焦点真正交给页面。**点哪里**是分情况的：
        //
        // ① 非全屏：点窗口内左上角的标题栏空白区（避开按钮）。
        //
        // ② 全屏：**绝不能点空白处** —— 全屏遮罩外层的 onClick 就是「退出全屏」
        //   （`fullscreen-overlay.tsx`），点了会与随后的 F 互相抵消，看起来像「退不出去」。
        //   但遮罩**居中的内容 div 有 `stopPropagation`**，点它不退出 ⇒ 点客户区正中。
        //   ⚠️ 判据不能只看 `WS_POPUP`：真全屏是 POPUP，而「窗口全屏」（= 最大化）不是。
        let zoomed = IsZoomed(h) != 0;
        if !is_popup(h) && !zoomed {
            let wr = window_rect(h);
            click_at(wr.left + 40, wr.top + 10);
        } else {
            let cr = client_rect_screen(h);
            click_at((cr.left + cr.right) / 2, (cr.top + cr.bottom) / 2);
        }

        keybd_event(VK_F, 0, 0, 0);
        keybd_event(VK_F, 0, KEYEVENTF_KEYUP, 0);
        let fg = GetForegroundWindow();
        println!(
            "[press-f] SetForegroundWindow={ok} 前台窗口==目标: {}",
            fg == h
        );
    }
}

/// 反复按 F 直到窗口样式变成 WS_POPUP（最多 5 次）。按键偶发丢失，靠「看样式」收敛。
fn enter_fullscreen(h: HWND) {
    for i in 1..=5 {
        if is_popup(h) {
            return;
        }
        focus_and_press_f(h);
        std::thread::sleep(std::time::Duration::from_millis(1200));
        println!("[enter] 第 {i} 次按键后 POPUP={}", is_popup(h));
        if is_popup(h) {
            return;
        }
    }
    println!("[enter] ⚠️ 5 次尝试后仍未进入全屏");
}

/// 退出全屏：点遮罩**空白处**（避开居中的内容 div —— 它 `stopPropagation`，
/// 点它不会退出）。这是遮罩的既定交互（「点击任意处退出全屏」），不需要按键。
fn exit_fullscreen(h: HWND) {
    let m = match mon_info(h) {
        Some(mi) => mi.rcMonitor,
        None => return,
    };
    let (mw, _mh) = size(&m);
    let spots = [
        (m.left + mw / 2, m.top + 20),          // 顶部空白带
        (m.left + mw / 2, m.bottom - 20),       // 底部空白带
        (m.left + 20, m.top + 20),              // 左上角
    ];
    for (idx, (x, y)) in spots.iter().enumerate() {
        if !is_popup(h) {
            return;
        }
        unsafe {
            SetCursorPos(*x, *y);
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        }
        std::thread::sleep(std::time::Duration::from_millis(1200));
        println!("[exit] 点 ({x},{y}) 后 POPUP={}", is_popup(h));
        let _ = idx;
    }
}

/// 「窗口全屏」＝最大化：等价于 `window.maximize()`（tao 的 max 走 `SW_MAXIMIZE`）。
///
/// 🚨 为什么必须是真的最大化而不是手工 `SetWindowPos` 到工作区：
/// tao 在 `WM_NCCALCSIZE` 里对**已最大化**的无边框窗口有专门分支
/// （`tao-0.35.2/src/platform_impl/windows/event_loop.rs:2131`「adjust the maximized
/// borderless window so it doesn't cover the taskbar」）→ 直接把客户区设为 `rcWork`；
/// 这个分支的前提是 `util::is_maximized` → **`IsZoomed(hwnd)`**。
/// 手工摆放不会让 `IsZoomed` 为真 ⇒ 落到 `MARKER_UNDECORATED_SHADOW` 的内缩分支
/// ⇒ 客户区再被内缩一圈 ⇒ 「白边/黑边」原地复发。所以这里用 `ShowWindow(SW_MAXIMIZE)` 复现，
/// 并**以 `IsZoomed` 为收敛判据**（不是看窗口矩形大小）。
fn enter_windowed(h: HWND) {
    for i in 1..=5 {
        if unsafe { IsZoomed(h) } != 0 {
            return;
        }
        unsafe { ShowWindow(h, SW_MAXIMIZE) };
        std::thread::sleep(std::time::Duration::from_millis(800));
        println!("[windowed] 第 {i} 次 SW_MAXIMIZE 后 zoomed={}", unsafe { IsZoomed(h) } != 0);
    }
}

fn exit_windowed(h: HWND) {
    unsafe { ShowWindow(h, SW_RESTORE) };
    std::thread::sleep(std::time::Duration::from_millis(600));
    println!("[windowed] SW_RESTORE 后 zoomed={}", unsafe { IsZoomed(h) } != 0);
}

/// 「屏幕最上面那个窗口是谁」——比 `GetPixel` 可靠得多。
///
/// `GetPixel(GetDC(NULL), …)` 在 DWM 下会拿到**最后一次绘制**的内容，不一定是合成后的桌面
/// （实测：窗口客户区明明只到 y=752，y=780 却读到应用的底色，导致误判「盖住了任务栏」）。
/// `WindowFromPoint` 是**命中测试**，按当前 Z 序返回真正接受该点输入的那个窗口 ⇒
/// 想知道「任务栏还在不在」，就看工作区以下的点属于 `Shell_TrayWnd` 还是我们的窗口。
fn whois(points: &[(i32, i32)]) {
    for (x, y) in points {
        let pt = POINT { x: *x, y: *y };
        let h = unsafe { WindowFromPoint(pt) };
        let root = unsafe { GetAncestor(h, GA_ROOT) };
        println!(
            "    [whois] ({:>4},{:>4}) -> class={:<26} root_class={:<24} root==我们的窗口: {}",
            x,
            y,
            class_name(h),
            class_name(root),
            root == find_tops().first().map(|t| t.hwnd).unwrap_or(std::ptr::null_mut())
        );
    }
}

/// 反复按 F 直到「最大化状态」翻转（最多 5 次），用于验证「窗口全屏」的进出。
///
/// 🚨 **为什么必须重试**：全屏时探针**不能点击**（点遮罩 = 退出全屏），而
/// 没有点击时 WebView2 的子窗口（`Chrome_RenderWidgetHostHWND`）不一定拿到键盘焦点
/// ⇒ 合成按键会**偶发丢失**（实测：连着按到第 3 次才生效）。
/// 所以判据是「状态有没有翻」，不是「按了几次」。
fn toggle_windowed(h: HWND) {
    let before = unsafe { IsZoomed(h) } != 0;
    for i in 1..=5 {
        focus_and_press_f(h);
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let now = unsafe { IsZoomed(h) } != 0;
        println!("[toggle] 第 {i} 次按 F 后 zoomed={now}（目标 {}）", !before);
        if now != before {
            return;
        }
    }
    println!("[toggle] ⚠️ 5 次后 zoomed 仍未翻转");
}

fn wide_to_string(w: &[u16]) -> String {
    let end = w.iter().position(|&c| c == 0).unwrap_or(w.len());
    OsString::from_wide(&w[..end]).to_string_lossy().into_owned()
}

fn window_text(h: HWND) -> String {
    let len = unsafe { GetWindowTextLengthW(h) };
    if len <= 0 {
        return String::new();
    }
    let mut buf = vec![0u16; len as usize + 1];
    let n = unsafe { GetWindowTextW(h, buf.as_mut_ptr(), buf.len() as i32) };
    wide_to_string(&buf[..n.max(0) as usize])
}

fn class_name(h: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(h, buf.as_mut_ptr(), buf.len() as i32) };
    wide_to_string(&buf[..n.max(0) as usize])
}

fn window_rect(h: HWND) -> RECT {
    let mut r: RECT = unsafe { std::mem::zeroed() };
    unsafe { GetWindowRect(h, &mut r) };
    r
}

/// 客户区在**屏幕坐标**下的矩形（GetClientRect 只给尺寸，顶点要 ClientToScreen）
fn client_rect_screen(h: HWND) -> RECT {
    let mut r: RECT = unsafe { std::mem::zeroed() };
    unsafe { GetClientRect(h, &mut r) };
    let mut pt = POINT { x: 0, y: 0 };
    unsafe { ClientToScreen(h, &mut pt) };
    RECT {
        left: pt.x,
        top: pt.y,
        right: pt.x + r.right,
        bottom: pt.y + r.bottom,
    }
}

fn mon_info(h: HWND) -> Option<MONITORINFO> {
    let mon = unsafe { MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) };
    let mut mi: MONITORINFO = unsafe { std::mem::zeroed() };
    mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if unsafe { GetMonitorInfoW(mon, &mut mi) } != 0 {
        Some(mi)
    } else {
        None
    }
}

fn size(r: &RECT) -> (i32, i32) {
    (r.right - r.left, r.bottom - r.top)
}

struct Top {
    hwnd: HWND,
    title: String,
    class: String,
}

extern "system" fn enum_top(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let out = unsafe { &mut *(lparam as *mut Vec<Top>) };
    if unsafe { IsWindowVisible(hwnd) } == 0 {
        return TRUE;
    }
    let title = window_text(hwnd);
    let class = class_name(hwnd);
    if title.contains("FretMaster") || class.contains("Tauri") {
        out.push(Top {
            hwnd,
            title,
            class,
        });
    }
    TRUE
}

struct Child {
    class: String,
    rect: RECT,
}

extern "system" fn enum_child(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let out = unsafe { &mut *(lparam as *mut Vec<Child>) };
    out.push(Child {
        class: class_name(hwnd),
        rect: window_rect(hwnd),
    });
    TRUE
}

fn find_tops() -> Vec<Top> {
    let mut v: Vec<Top> = Vec::new();
    unsafe { EnumWindows(Some(enum_top), &mut v as *mut Vec<Top> as LPARAM) };
    v
}

/// 沿**工作区**（rcWork，已排除任务栏）四边采样。
/// 「窗口全屏」的正确形态是 **客户区 == rcWork**，所以要看的是工作区边缘有没有
/// 一圈 DWM 画出来的边框色（=同样形态的「白边/黑边」，只是这次在任务栏上方）。
fn sample_work_edges(work: &RECT) {
    let (ww, wh) = size(work);
    let cx = work.left + ww / 2;
    let cy = work.top + wh / 2;
    let hdc = unsafe { GetDC(std::ptr::null_mut()) };
    let px = |x: i32, y: i32| -> (u8, u8, u8) {
        let c = unsafe { GetPixel(hdc, x, y) };
        ((c & 0xFF) as u8, ((c >> 8) & 0xFF) as u8, ((c >> 16) & 0xFF) as u8)
    };
    println!("    [采样-工作区] 参考点 中心({cx},{cy}) = rgb{:?}", px(cx, cy));
    print!("    [采样-工作区] 上边 y=work.top+0..10 @x={cx} :");
    for y in 0..11 {
        print!(" {:?}", px(cx, work.top + y));
    }
    println!();
    print!("    [采样-工作区] 下边 y=work.bottom-11..-1 @x={cx} :");
    for y in work.bottom - 11..work.bottom {
        print!(" {:?}", px(cx, y));
    }
    println!();
    print!("    [采样-工作区] 左边 x=work.left+0..10 @y={cy} :");
    for x in 0..11 {
        print!(" {:?}", px(work.left + x, cy));
    }
    println!();
    print!("    [采样-工作区] 右边 x=work.right-11..-1 @y={cy} :");
    for x in work.right - 11..work.right {
        print!(" {:?}", px(x, cy));
    }
    println!();
    unsafe { ReleaseDC(std::ptr::null_mut(), hdc) };
}

/// 沿屏幕四边采样像素，看「客户区之外」那圈到底是什么颜色
fn sample_edges(mon: &RECT) {
    let (mw, mh) = size(mon);
    let cx = mon.left + mw / 2;
    let cy = mon.top + mh / 2;
    let hdc = unsafe { GetDC(std::ptr::null_mut()) };
    let px = |x: i32, y: i32| -> (u8, u8, u8) {
        let c = unsafe { GetPixel(hdc, x, y) };
        // COLORREF: 0x00BBGGRR
        ((c & 0xFF) as u8, ((c >> 8) & 0xFF) as u8, ((c >> 16) & 0xFF) as u8)
    };
    println!("    [采样] 参考点 屏幕中心({cx},{cy}) = rgb{:?}", px(cx, cy));
    print!("    [采样] 上边 y=0..10 @x={cx} :");
    for y in 0..11 {
        print!(" {:?}", px(cx, mon.top + y));
    }
    println!();
    print!("    [采样] 下边 y=H-11..H-1 @x={cx} :");
    for y in mon.bottom - 11..mon.bottom {
        print!(" {:?}", px(cx, y));
    }
    println!();
    print!("    [采样] 左边 x=0..10 @y={cy} :");
    for x in 0..11 {
        print!(" {:?}", px(mon.left + x, cy));
    }
    println!();
    print!("    [采样] 右边 x=W-11..W-1 @y={cy} :");
    for x in mon.right - 11..mon.right {
        print!(" {:?}", px(x, cy));
    }
    println!();
    unsafe { ReleaseDC(std::ptr::null_mut(), hdc) };
}

fn dump(t: &Top) {
    let wr = window_rect(t.hwnd);
    let cr = client_rect_screen(t.hwnd);
    let (ww, wh) = size(&wr);
    let (cw, ch) = size(&cr);

    let style = unsafe { GetWindowLongPtrW(t.hwnd, GWL_STYLE) } as u32;
    let ex_style = unsafe { GetWindowLongPtrW(t.hwnd, GWL_EXSTYLE) } as u32;

    println!();
    println!("--- hwnd={:?} class={:?}", t.hwnd, t.class);
    println!("    title = {:?}", t.title);
    println!(
        "    style=0x{style:08X} [POPUP={} CAPTION={} THICKFRAME={}]  exstyle=0x{ex_style:08X} [TOPMOST={} TOOLWINDOW={}]",
        style & 0x8000_0000 != 0,
        style & 0x00C0_0000 != 0,
        style & 0x0004_0000 != 0,
        ex_style & 0x0000_0008 != 0,
        ex_style & 0x0000_0080 != 0
    );
    println!(
        "    zoomed={} iconic={}",
        unsafe { IsZoomed(t.hwnd) } != 0,
        unsafe { IsIconic(t.hwnd) } != 0
    );
    println!("    [1] 窗口矩形 = ({}, {}) {}x{}", wr.left, wr.top, ww, wh);
    println!(
        "    [2] 客户区   = ({}, {}) {}x{}   (客户区=子窗口能覆盖的最大范围)",
        cr.left, cr.top, cw, ch
    );

    let ins_l = cr.left - wr.left;
    let ins_t = cr.top - wr.top;
    let ins_r = wr.right - cr.right;
    let ins_b = wr.bottom - cr.bottom;
    println!("    [2b] 隐形非客户区(左/上/右/下) = {ins_l}/{ins_t}/{ins_r}/{ins_b}");

    if let Some(mi) = mon_info(t.hwnd) {
        let m = mi.rcMonitor;
        let (mw, mh) = size(&m);
        println!(
            "    [3] 显示器   = ({}, {}) {}x{}   work=({}, {}) {}x{}",
            m.left,
            m.top,
            mw,
            mh,
            mi.rcWork.left,
            mi.rcWork.top,
            size(&mi.rcWork).0,
            size(&mi.rcWork).1
        );
        println!(
            "    [4] 客户区 vs 显示器：左露 {} / 上露 {} / 右露 {} / 下露 {}  ⟵ 这些像素裸露",
            cr.left - m.left,
            cr.top - m.top,
            m.right - cr.right,
            m.bottom - cr.bottom
        );
        println!(
            "    [4b] 客户区 vs 工作区：左差 {} / 上差 {} / 右差 {} / 下差 {}  ⟵ 「窗口全屏」应全为 0",
            cr.left - mi.rcWork.left,
            cr.top - mi.rcWork.top,
            mi.rcWork.right - cr.right,
            mi.rcWork.bottom - cr.bottom
        );
    }

    let mut children: Vec<Child> = Vec::new();
    unsafe {
        EnumChildWindows(t.hwnd, Some(enum_child), &mut children as *mut Vec<Child> as LPARAM);
    }
    println!("    [5] 子窗口 {} 个：", children.len());
    for c in &children {
        let (w, h) = size(&c.rect);
        println!(
            "        class={:<28} ({:>6}, {:>6}) {}x{}",
            c.class, c.rect.left, c.rect.top, w, h
        );
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let has = |s: &str| args.iter().any(|a| a == s);

    let sys_dpi = unsafe {
        let hdc = GetDC(std::ptr::null_mut());
        let dpi = GetDeviceCaps(hdc, LOGPIXELSX as i32);
        ReleaseDC(std::ptr::null_mut(), hdc);
        dpi
    };
    println!("=== FretMaster 全屏几何探针 ===");
    println!("系统 DPI = {sys_dpi} (96=100%, 144=150%)");

    let mut tops = find_tops();
    if tops.is_empty() {
        println!("!! 没找到 FretMaster 窗口（应用没在运行？）");
        return;
    }

    // `--front`：采样前把应用窗口置前。
    // 🚨 必需：`--sample*` 用 `GetPixel` 读屏幕，读到的是**最上面**那个窗口。
    // 从 bash 里跑探针时控制台就在最上面 ⇒ 不置前会读到一堆控制台像素（实测踩过）。
    // （真全屏时窗口是 TOPMOST，天然盖住控制台，所以以前不需要。）
    // 🚨 必须用「先敲一下 Alt」的经典手法：裸调 SetForegroundWindow 会被系统拒绝
    //（调用方不是前台进程）—— 实测返回后被拒、采样结果前后一模一样，正是漏了这一步。
    if has("--front") {
        if let Some(t) = tops.first() {
            unsafe {
                keybd_event(VK_MENU, 0, 0, 0);
                keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
                let ok = SetForegroundWindow(t.hwnd);
                std::thread::sleep(std::time::Duration::from_millis(400));
                println!(
                    "[front] SetForegroundWindow={ok} 前台==目标: {}",
                    GetForegroundWindow() == t.hwnd
                );
            }
        }
    }

    // `--enter-windowed` / `--exit-windowed`：**历史遗留**，只用来手工比较
    // 「已最大化的无边框窗口」长什么样（`--toggle-windowed` 同理）。
    // ⚠️ 2026-10-03 语义修正后，应用里**已经没有**「窗口全屏＝最大化」这条路径了
    // （见 commands/window_commands.rs 的墓碑注释）：窗口全屏 = 窗口一律不动。
    // 想看现在的「窗口全屏」，**什么都不做**即可；判任务栏在不在用 `--whois`。
    if has("--enter-windowed") {
        if let Some(t) = tops.first() {
            enter_windowed(t.hwnd);
        }
        std::thread::sleep(std::time::Duration::from_millis(600));
        tops = find_tops();
    } else if has("--exit-windowed") {
        if let Some(t) = tops.first() {
            exit_windowed(t.hwnd);
        }
        std::thread::sleep(std::time::Duration::from_millis(600));
        tops = find_tops();
    }

    // `--enter-fullscreen`：反复按 F 直到真的进全屏（按键偶发丢失，靠样式收敛）
    // `--press-f`：只按一次（用来验证「退出全屏」这类单次动作）
    // `--exit-fullscreen`：退出全屏（按键失效时退回点遮罩）
    if has("--enter-fullscreen") {
        if let Some(t) = tops.first() {
            enter_fullscreen(t.hwnd);
        }
        std::thread::sleep(std::time::Duration::from_millis(600));
        tops = find_tops();
    } else if has("--toggle-windowed") {
        // 历史遗留：用 F 键把「已最大化的无边框窗口」来回切（见上面 --enter-windowed 的说明）
        if let Some(t) = tops.first() {
            toggle_windowed(t.hwnd);
        }
        std::thread::sleep(std::time::Duration::from_millis(600));
        tops = find_tops();
    } else if has("--press-f") {
        if let Some(t) = tops.first() {
            focus_and_press_f(t.hwnd);
        }
        std::thread::sleep(std::time::Duration::from_millis(1500));
        tops = find_tops();
    }
    if has("--exit-fullscreen") {
        if let Some(t) = tops.first() {
            exit_fullscreen(t.hwnd);
        }
        std::thread::sleep(std::time::Duration::from_millis(600));
        tops = find_tops();
    }

    for t in &tops {
        dump(t);

        if has("--whois") {
            // 工作区底边（752）以下到显示器底边（800）就是任务栏的地盘：
            // 这些点归 Shell_TrayWnd ⟹ 任务栏可见（「窗口全屏」的正确形态）
            whois(&[
                (640, 2),
                (640, 400),
                (2, 400),
                (1278, 400),
                (640, 748),
                (640, 760),
                (640, 776),
                (640, 798),
            ]);
        }

        if has("--sample") {
            if let Some(mi) = mon_info(t.hwnd) {
                sample_edges(&mi.rcMonitor);
            }
        }

        if has("--sample-work") {
            if let Some(mi) = mon_info(t.hwnd) {
                sample_work_edges(&mi.rcWork);
            }
        }

        if has("--fix") {
            // 把窗口外扩「窗口矩形 − 客户区」的量，使**客户区**正好等于显示器矩形。
            // 隐形非客户区被推到屏幕外，屏幕上不再有任何裸露像素。
            let wr = window_rect(t.hwnd);
            let cr = client_rect_screen(t.hwnd);
            let ins_l = cr.left - wr.left;
            let ins_t = cr.top - wr.top;
            let ins_r = wr.right - cr.right;
            let ins_b = wr.bottom - cr.bottom;
            if let Some(mi) = mon_info(t.hwnd) {
                let m = mi.rcMonitor;
                let (mw, mh) = size(&m);
                let nx = m.left - ins_l;
                let ny = m.top - ins_t;
                let nw = mw + ins_l + ins_r;
                let nh = mh + ins_t + ins_b;
                let ok = unsafe {
                    SetWindowPos(
                        t.hwnd,
                        HWND_TOPMOST,
                        nx,
                        ny,
                        nw,
                        nh,
                        SWP_NOACTIVATE | SWP_NOZORDER,
                    )
                };
                println!("[fix] SetWindowPos({nx},{ny},{nw}x{nh}) -> {ok}");
                std::thread::sleep(std::time::Duration::from_millis(800));
                println!("[fix] 修正后：");
                let wr2 = window_rect(t.hwnd);
                let cr2 = client_rect_screen(t.hwnd);
                println!(
                    "      窗口=({}, {}) {}x{}   客户区=({}, {}) {}x{}",
                    wr2.left,
                    wr2.top,
                    size(&wr2).0,
                    size(&wr2).1,
                    cr2.left,
                    cr2.top,
                    size(&cr2).0,
                    size(&cr2).1
                );
                println!(
                    "      客户区 vs 显示器：左露 {} / 上露 {} / 右露 {} / 下露 {}",
                    cr2.left - m.left,
                    cr2.top - m.top,
                    m.right - cr2.right,
                    m.bottom - cr2.bottom
                );
            }
        }
    }
}
