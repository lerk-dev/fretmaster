#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fretmaster::{audio, commands::AppState};

fn main() {
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
