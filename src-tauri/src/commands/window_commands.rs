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

#[tauri::command]
pub async fn set_windowed_fullscreen<R: Runtime>(window: tauri::Window<R>, enable: bool) -> Result<(), String> {
    if enable {
        window.maximize().map_err(|e| e.to_string())
    } else {
        window.unmaximize().map_err(|e| e.to_string())
    }
}

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
                SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_SHOWWINDOW,
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
