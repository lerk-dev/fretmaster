use tauri::Runtime;

#[tauri::command]
pub async fn minimize_window<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn maximize_window<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn close_window<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_window_maximized<R: Runtime>(window: tauri::Window<R>) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_dragging<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_fullscreen<R: Runtime>(window: tauri::Window<R>, fullscreen: bool) -> Result<(), String> {
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_fullscreen<R: Runtime>(window: tauri::Window<R>) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}

// 🚨 这里原本有 `set_windowed_fullscreen`（实现是 `window.maximize()/unmaximize()`），
// 2026-10-03 已**删除** —— 语义被用户否掉。
//
// 用户拍板（原文）：「我说的窗口全屏，是当前窗口全屏，而不是最大化留任务栏，
// 当前窗口的大小保持不变，内容填满当前窗口」。
// ⇒ 「窗口全屏」= 窗口几何/位置/样式**一律不动**，「内容铺满」是应用层的事
//   （`components/layout-shell.tsx` 在 `isFullscreen` 时隐藏自带标题栏，内容区自然长满客户区）；
//   原生侧对窗口全屏**没有任何事要做**，唯一需要保证的是「没有停在真全屏形态」——
//   那由 `set_true_fullscreen(false)` 负责（见 `lib/native-window.ts::applyFullscreen`）。
//
// ⛔ 别再把它加回来：一个「窗口全屏」原生命令只要动了几何，就一定是错的方向。
// 唯一允许改窗口几何的全屏命令是下面的 `set_true_fullscreen`。

#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "windows")]
static TRUE_FULLSCREEN_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
use std::sync::Mutex;

#[cfg(target_os = "windows")]
#[derive(Clone)]
#[allow(dead_code)]
struct SavedWindowState {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
    style: isize,
    ex_style: isize,
    show_cmd: u32,
}

#[cfg(target_os = "windows")]
use once_cell::sync::Lazy;

#[cfg(target_os = "windows")]
static SAVED_WINDOW_STATE: Lazy<Mutex<Option<SavedWindowState>>> = Lazy::new(|| Mutex::new(None));

/// 量出「窗口矩形 − 客户区」的四边内缩量（物理像素）。
///
/// 🚨 **为什么必须实测而不是写死**：tao（Tauri 的窗口层）对「无边框 + 阴影」窗口在
/// `WM_NCCALCSIZE` 里把客户区按 `SM_CXSIZEFRAME + SM_CXPADDEDBORDER` 内缩一圈
/// （Win11 上顶部再 +1），见 `tao-0.35.2/src/platform_impl/windows/event_loop.rs:2164`
/// 与 `util.rs:calculate_insets_for_dpi`。该分支的条件是
/// `MARKER_UNDECORATED_SHADOW && !is_fullscreen`，而这里的 `is_fullscreen` 指
/// **tao 自己的** `window_state.fullscreen` —— 本文件这条手工全屏路径是自己改 Win32
/// 样式，从不设置 tao 的全屏状态 ⇒ tao 永远认为「不是全屏」⇒ 永远内缩。
/// 内缩量随 DPI 变（`GetSystemMetricsForDpi`），所以只能实测，写死 7/1/6/7 会在
/// 别的缩放下静默分叉（⛔ 铁律 13）。
#[cfg(target_os = "windows")]
unsafe fn measure_nc_insets(
    hwnd: windows_sys::Win32::Foundation::HWND,
) -> (i32, i32, i32, i32) {
    use windows_sys::Win32::Foundation::{POINT, RECT};
    use windows_sys::Win32::Graphics::Gdi::ClientToScreen;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClientRect, GetWindowRect};

    let mut wr: RECT = std::mem::zeroed();
    GetWindowRect(hwnd, &mut wr);
    let mut cr: RECT = std::mem::zeroed();
    GetClientRect(hwnd, &mut cr);
    let mut origin = POINT { x: 0, y: 0 };
    ClientToScreen(hwnd, &mut origin);
    (
        origin.x - wr.left,
        origin.y - wr.top,
        wr.right - (origin.x + cr.right),
        wr.bottom - (origin.y + cr.bottom),
    )
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn set_true_fullscreen<R: Runtime>(window: tauri::WebviewWindow<R>, enable: bool) -> Result<(), String> {
    if enable {
        if TRUE_FULLSCREEN_ACTIVE.load(Ordering::SeqCst) {
            return Ok(());
        }

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd_handle = hwnd.0 as windows_sys::Win32::Foundation::HWND;

        let (screen_w, screen_h) = unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, SetWindowLongPtrW, GetWindowLongPtrW,
                GetWindowRect, GetWindowPlacement, ShowWindow, SetForegroundWindow,
                HWND_TOPMOST,
                SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW,
                GWL_STYLE, GWL_EXSTYLE,
                WS_POPUP, WS_CAPTION, WS_SYSMENU, WS_VISIBLE,
                WS_THICKFRAME, WS_MINIMIZEBOX, WS_MAXIMIZEBOX,
                WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
                SW_SHOW, SW_RESTORE,
            };
            use windows_sys::Win32::Graphics::Gdi::{
                MonitorFromWindow, GetMonitorInfoW, MONITOR_DEFAULTTONEAREST,
            };
            use windows_sys::Win32::Foundation::RECT;

            let mut window_rect: RECT = std::mem::zeroed();
            GetWindowRect(hwnd_handle, &mut window_rect);

            let current_style = GetWindowLongPtrW(hwnd_handle, GWL_STYLE);
            let current_ex_style = GetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE);

            let mut placement: windows_sys::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT = std::mem::zeroed();
            placement.length = std::mem::size_of::<windows_sys::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT>() as u32;
            GetWindowPlacement(hwnd_handle, &mut placement);

            if let Ok(mut saved) = SAVED_WINDOW_STATE.lock() {
                *saved = Some(SavedWindowState {
                    left: window_rect.left,
                    top: window_rect.top,
                    width: window_rect.right - window_rect.left,
                    height: window_rect.bottom - window_rect.top,
                    style: current_style,
                    ex_style: current_ex_style,
                    show_cmd: placement.showCmd,
                });
            }

            let monitor = MonitorFromWindow(hwnd_handle, MONITOR_DEFAULTTONEAREST);

            let mut monitor_info: windows_sys::Win32::Graphics::Gdi::MONITORINFO = std::mem::zeroed();
            monitor_info.cbSize = std::mem::size_of::<windows_sys::Win32::Graphics::Gdi::MONITORINFO>() as u32;
            let result = GetMonitorInfoW(monitor, &mut monitor_info);
            if result == 0 {
                return Err("Failed to get monitor info".to_string());
            }

            let monitor_rect = monitor_info.rcMonitor;
            let sx = monitor_rect.left;
            let sy = monitor_rect.top;
            let sw = monitor_rect.right - monitor_rect.left;
            let sh = monitor_rect.bottom - monitor_rect.top;

            let chrome_mask = WS_CAPTION as isize | WS_SYSMENU as isize
                | WS_THICKFRAME as isize | WS_MINIMIZEBOX as isize | WS_MAXIMIZEBOX as isize;
            let new_style = (current_style & !chrome_mask) | WS_POPUP as isize | WS_VISIBLE as isize;
            SetWindowLongPtrW(hwnd_handle, GWL_STYLE, new_style);

            let new_ex_style = (current_ex_style & !(WS_EX_APPWINDOW as isize)) | WS_EX_TOOLWINDOW as isize;
            SetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE, new_ex_style);

            SetWindowPos(
                hwnd_handle,
                HWND_TOPMOST,
                sx,
                sy,
                sw,
                sh,
                SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );

            ShowWindow(hwnd_handle, SW_RESTORE);
            SetForegroundWindow(hwnd_handle);
            ShowWindow(hwnd_handle, SW_SHOW);

            // 🚨 **真全屏必须让「客户区」而不是「窗口矩形」对齐显示器。**
            //
            // 上面那步只把**窗口矩形**摆成显示器矩形；但客户区被 tao 内缩了一圈
            // （见 `measure_nc_insets` 的文档），于是屏幕上会裸露一圈像素：
            // 真机实测（1280x800，客户区 (7,1) 1267x792）——
            //   左边 x=0..10 全部 `rgb(0,0,0)` 纯黑；
            //   上边 y=0..1  `rgb(255,255,255)` 纯白；
            // 而应用自身底色是 `rgb(15,17,20)`。这一圈由 DWM 按窗口边框/阴影绘制，
            // 颜色随系统主题走 ⇒ 用户看到的现象就是「要么有白边要么有黑边」，
            // 且**黑边白边可以同屏同时出现**（左黑上白）。
            //
            // 修法：按实测内缩量把窗口**外扩**同样大小，把隐形非客户区推到屏幕外，
            // 使客户区正好等于显示器矩形 ⇒ 屏幕上不再有任何裸露像素。
            // 实测验证（examples/win_fullscreen_probe.rs --fix）：四边采样全部由
            // (0,0,0)/(255,255,255) 变成 (15,17,20)，边消失。
            //
            // 退出全屏时用进入前保存的原始窗口矩形恢复（上面的 `SAVED_WINDOW_STATE`），
            // 客户区自然回到原尺寸，无需反向补偿。
            let (ins_l, ins_t, ins_r, ins_b) = measure_nc_insets(hwnd_handle);
            SetWindowPos(
                hwnd_handle,
                HWND_TOPMOST,
                sx - ins_l,
                sy - ins_t,
                sw + ins_l + ins_r,
                sh + ins_t + ins_b,
                SWP_NOACTIVATE | SWP_NOZORDER,
            );

            (sw, sh)
        };

        let _ = window.set_background_color(Some(tauri::webview::Color(11, 15, 20, 255)));

        use tauri::Webview;
        let webview: &Webview<R> = window.as_ref();
        let _ = webview.set_bounds(tauri::Rect {
            position: tauri::Position::Physical(tauri::PhysicalPosition::new(0, 0)),
            size: tauri::Size::Physical(tauri::PhysicalSize::new(screen_w as u32, screen_h as u32)),
        });

        TRUE_FULLSCREEN_ACTIVE.store(true, Ordering::SeqCst);
    } else {
        if !TRUE_FULLSCREEN_ACTIVE.load(Ordering::SeqCst) {
            return Ok(());
        }

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd_handle = hwnd.0 as windows_sys::Win32::Foundation::HWND;

        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SetWindowLongPtrW, GetWindowLongPtrW,
                SetWindowPos, ShowWindow, SetForegroundWindow,
                HWND_NOTOPMOST,
                SWP_FRAMECHANGED, SWP_NOZORDER, SWP_NOACTIVATE,
                GWL_STYLE, GWL_EXSTYLE,
                WS_POPUP, WS_CAPTION, WS_SYSMENU, WS_VISIBLE,
                WS_THICKFRAME, WS_MINIMIZEBOX, WS_MAXIMIZEBOX,
                WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
                SW_SHOW,
            };

            let saved_state = SAVED_WINDOW_STATE.lock().ok().and_then(|s| s.clone());

            if let Some(ref saved) = saved_state {
                let current_style = GetWindowLongPtrW(hwnd_handle, GWL_STYLE);
                let restored_style = (current_style & !(WS_POPUP as isize))
                    | (saved.style & (WS_CAPTION as isize | WS_SYSMENU as isize | WS_THICKFRAME as isize | WS_MINIMIZEBOX as isize | WS_MAXIMIZEBOX as isize))
                    | WS_VISIBLE as isize;
                SetWindowLongPtrW(hwnd_handle, GWL_STYLE, restored_style);

                let current_ex_style = GetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE);
                let restored_ex_style = (current_ex_style & !(WS_EX_TOOLWINDOW as isize)) | WS_EX_APPWINDOW as isize;
                SetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE, restored_ex_style);

                SetWindowPos(
                    hwnd_handle,
                    HWND_NOTOPMOST,
                    saved.left,
                    saved.top,
                    saved.width,
                    saved.height,
                    SWP_FRAMECHANGED | SWP_NOZORDER | SWP_NOACTIVATE,
                );

                ShowWindow(hwnd_handle, SW_SHOW);
                SetForegroundWindow(hwnd_handle);
            } else {
                let current_style = GetWindowLongPtrW(hwnd_handle, GWL_STYLE);
                let restored_style = (current_style & !(WS_POPUP as isize))
                    | WS_CAPTION as isize | WS_SYSMENU as isize
                    | WS_THICKFRAME as isize | WS_MINIMIZEBOX as isize | WS_MAXIMIZEBOX as isize
                    | WS_VISIBLE as isize;
                SetWindowLongPtrW(hwnd_handle, GWL_STYLE, restored_style);

                let current_ex_style = GetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE);
                let restored_ex_style = (current_ex_style & !(WS_EX_TOOLWINDOW as isize)) | WS_EX_APPWINDOW as isize;
                SetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE, restored_ex_style);

                SetWindowPos(
                    hwnd_handle,
                    HWND_NOTOPMOST,
                    0, 0, 0, 0,
                    SWP_FRAMECHANGED | SWP_NOZORDER | SWP_NOACTIVATE,
                );

                SetWindowPos(
                    hwnd_handle,
                    HWND_NOTOPMOST,
                    100, 100, 1200, 800,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                );

                ShowWindow(hwnd_handle, SW_SHOW);
                SetForegroundWindow(hwnd_handle);
            }

            if let Ok(mut saved) = SAVED_WINDOW_STATE.lock() {
                *saved = None;
            }
        }

        TRUE_FULLSCREEN_ACTIVE.store(false, Ordering::SeqCst);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn set_true_fullscreen<R: Runtime>(window: tauri::Window<R>, enable: bool) -> Result<(), String> {
    window.set_fullscreen(enable).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn is_true_fullscreen<R: Runtime>(_window: tauri::Window<R>) -> Result<bool, String> {
    Ok(TRUE_FULLSCREEN_ACTIVE.load(Ordering::SeqCst))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn is_true_fullscreen<R: Runtime>(window: tauri::Window<R>) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}
