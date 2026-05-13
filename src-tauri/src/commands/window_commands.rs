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
struct SavedWindowRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
    style: isize,
}

#[cfg(target_os = "windows")]
use once_cell::sync::Lazy;

#[cfg(target_os = "windows")]
static SAVED_WINDOW_RECT: Lazy<Mutex<Option<SavedWindowRect>>> = Lazy::new(|| Mutex::new(None));

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn set_true_fullscreen<R: Runtime>(window: tauri::Window<R>, enable: bool) -> Result<(), String> {
    if enable {
        if TRUE_FULLSCREEN_ACTIVE.load(Ordering::SeqCst) {
            return Ok(());
        }

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd_handle = hwnd.0 as windows_sys::Win32::Foundation::HWND;

        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, SetWindowLongPtrW, GetWindowLongPtrW,
                GetWindowRect, HWND_TOPMOST, SWP_FRAMECHANGED,
                GWL_STYLE, WS_CAPTION, WS_SYSMENU,
                WS_THICKFRAME, WS_MINIMIZEBOX, WS_MAXIMIZEBOX,
            };
            use windows_sys::Win32::Graphics::Gdi::{MonitorFromWindow, GetMonitorInfoW, MONITOR_DEFAULTTONEAREST};
            use windows_sys::Win32::Foundation::RECT;

            let mut window_rect: RECT = std::mem::zeroed();
            GetWindowRect(hwnd_handle, &mut window_rect);

            let current_style = GetWindowLongPtrW(hwnd_handle, GWL_STYLE);

            if let Ok(mut saved) = SAVED_WINDOW_RECT.lock() {
                *saved = Some(SavedWindowRect {
                    left: window_rect.left,
                    top: window_rect.top,
                    right: window_rect.right,
                    bottom: window_rect.bottom,
                    style: current_style,
                });
            }

            let monitor = MonitorFromWindow(hwnd_handle, MONITOR_DEFAULTTONEAREST);

            #[repr(C)]
            #[allow(non_snake_case)]
            struct MonitorInfoExW {
                monitorInfo: windows_sys::Win32::Graphics::Gdi::MONITORINFO,
                deviceName: [u16; 32],
            }

            let mut monitor_info: MonitorInfoExW = std::mem::zeroed();
            monitor_info.monitorInfo.cbSize = std::mem::size_of::<MonitorInfoExW>() as u32;
            let result = GetMonitorInfoW(
                monitor,
                &mut monitor_info as *mut MonitorInfoExW as *mut _,
            );
            if result == 0 {
                return Err("Failed to get monitor info".to_string());
            }

            let monitor_rect = monitor_info.monitorInfo.rcMonitor;
            let screen_x = monitor_rect.left;
            let screen_y = monitor_rect.top;
            let screen_w = monitor_rect.right - monitor_rect.left;
            let screen_h = monitor_rect.bottom - monitor_rect.top;

            let new_style = current_style
                & !(WS_CAPTION as isize | WS_THICKFRAME as isize | WS_SYSMENU as isize | WS_MINIMIZEBOX as isize | WS_MAXIMIZEBOX as isize);
            SetWindowLongPtrW(hwnd_handle, GWL_STYLE, new_style);

            SetWindowPos(
                hwnd_handle,
                HWND_TOPMOST,
                screen_x,
                screen_y,
                screen_w,
                screen_h,
                SWP_FRAMECHANGED,
            );

            window.set_fullscreen(true).map_err(|e| e.to_string())?;
        }

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
                SetWindowPos, HWND_NOTOPMOST, SWP_FRAMECHANGED,
                GWL_STYLE, WS_OVERLAPPED, WS_CAPTION, WS_SYSMENU,
                WS_THICKFRAME, WS_MINIMIZEBOX, WS_MAXIMIZEBOX,
            };

            let saved_rect = SAVED_WINDOW_RECT.lock().ok().and_then(|s| s.clone());

            let restored_style = if let Some(ref saved) = saved_rect {
                saved.style
            } else {
                let current_style = GetWindowLongPtrW(hwnd_handle, GWL_STYLE);
                current_style
                    | WS_OVERLAPPED as isize | WS_CAPTION as isize | WS_SYSMENU as isize
                    | WS_THICKFRAME as isize | WS_MINIMIZEBOX as isize | WS_MAXIMIZEBOX as isize
            };
            SetWindowLongPtrW(hwnd_handle, GWL_STYLE, restored_style);

            if let Some(saved) = saved_rect {
                let w = saved.right - saved.left;
                let h = saved.bottom - saved.top;
                SetWindowPos(
                    hwnd_handle,
                    HWND_NOTOPMOST,
                    saved.left,
                    saved.top,
                    w,
                    h,
                    SWP_FRAMECHANGED,
                );
            } else {
                SetWindowPos(
                    hwnd_handle,
                    HWND_NOTOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_FRAMECHANGED,
                );
            }

            if let Ok(mut saved) = SAVED_WINDOW_RECT.lock() {
                *saved = None;
            }
        }

        window.set_fullscreen(false).map_err(|e| e.to_string())?;

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
