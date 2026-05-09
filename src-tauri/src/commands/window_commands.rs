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
#[tauri::command]
pub async fn set_true_fullscreen<R: Runtime>(window: tauri::Window<R>, enable: bool) -> Result<(), String> {
    if enable {
        if TRUE_FULLSCREEN_ACTIVE.load(Ordering::SeqCst) {
            return Ok(());
        }

        window.set_fullscreen(true).map_err(|e| e.to_string())?;

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd_handle = hwnd.0 as windows_sys::Win32::Foundation::HWND;

        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_FRAMECHANGED,
            };

            SetWindowPos(
                hwnd_handle,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED,
            );
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
                SetWindowPos, HWND_NOTOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_FRAMECHANGED,
            };

            SetWindowPos(
                hwnd_handle,
                HWND_NOTOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED,
            );
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
