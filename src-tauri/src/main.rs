#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fretmaster::AppState;
use tauri::Manager;

fn main() {
    #[cfg(target_os = "windows")]
    {
        std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF0B0F14");
    }
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::webview::Color;
                
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_background_color(Some(Color(11, 15, 20, 255)));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Audio commands
            fretmaster::commands::get_audio_devices,
            fretmaster::commands::get_default_audio_device,
            fretmaster::commands::start_audio_capture,
            fretmaster::commands::start_audio_capture_with_sample_rate,
            fretmaster::commands::stop_audio_capture,
            fretmaster::commands::is_capturing,
            fretmaster::commands::detect_pitch,
            fretmaster::commands::get_sample_rate,
            fretmaster::commands::set_sample_rate,
            fretmaster::commands::get_supported_sample_rates,
            fretmaster::commands::get_buffer_size,
            fretmaster::commands::clear_buffer,
            fretmaster::commands::set_pitch_threshold,
            fretmaster::commands::get_audio_level,
            fretmaster::commands::set_gain,
            fretmaster::commands::get_gain,
            fretmaster::commands::calibrate,
            fretmaster::commands::set_calibration_offset,
            fretmaster::commands::get_calibration_offset,
            fretmaster::commands::get_latency_ms,
            fretmaster::commands::get_buffer_frame_size,
            fretmaster::commands::set_preprocessor_config,
            fretmaster::commands::get_noise_estimate,
            fretmaster::commands::reset_preprocessor,
            // 新增音频命令
            fretmaster::commands::get_audio_status,
            fretmaster::commands::set_buffer_size,
            fretmaster::commands::set_noise_suppression,
            fretmaster::commands::set_audio_filters,
            // Device monitor commands
            fretmaster::commands::start_device_monitor,
            fretmaster::commands::stop_device_monitor,
            fretmaster::commands::is_device_monitor_running,
            // Pitch stream commands
            fretmaster::commands::start_pitch_stream,
            fretmaster::commands::stop_pitch_stream,
            fretmaster::commands::is_pitch_stream_running,
            // AGC commands
            fretmaster::commands::set_agc_enabled,
            fretmaster::commands::is_agc_enabled,
            fretmaster::commands::get_agc_gain,
            // Database commands
            fretmaster::commands::save_practice_stats,
            fretmaster::commands::get_all_practice_stats,
            fretmaster::commands::get_recent_practice_stats,
            fretmaster::commands::get_practice_stats_summary,
            fretmaster::commands::get_stats_by_exercise_type,
            fretmaster::commands::delete_practice_stat,
            fretmaster::commands::clear_all_practice_stats,
            // Window commands
            fretmaster::commands::minimize_window,
            fretmaster::commands::maximize_window,
            fretmaster::commands::close_window,
            fretmaster::commands::is_window_maximized,
            fretmaster::commands::start_dragging,
            fretmaster::commands::set_fullscreen,
            fretmaster::commands::is_fullscreen,
            fretmaster::commands::set_windowed_fullscreen,
            fretmaster::commands::set_true_fullscreen,
            fretmaster::commands::is_true_fullscreen,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
