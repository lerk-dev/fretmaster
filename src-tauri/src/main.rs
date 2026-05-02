#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fretmaster::AppState;

fn main() {
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
