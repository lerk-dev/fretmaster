use tauri::{AppHandle, State};
use crate::audio::{AudioDeviceInfo, AudioLevelInfo, device, preprocessor};
use crate::audio::pipeline::AppState;

#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    Ok(device::list_input_devices())
}

#[tauri::command]
pub async fn get_default_audio_device() -> Result<Option<AudioDeviceInfo>, String> {
    Ok(device::get_default_input_device())
}

#[tauri::command]
pub async fn start_audio_capture(
    state: State<'_, AppState>,
    device_name: Option<String>,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.start_capture(device_name, None)
}

#[tauri::command]
pub async fn start_audio_capture_with_sample_rate(
    state: State<'_, AppState>,
    device_name: Option<String>,
    sample_rate: Option<u32>,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.start_capture(device_name, sample_rate)
}

#[tauri::command]
pub async fn stop_audio_capture(state: State<'_, AppState>) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.stop_capture();
    Ok(())
}

#[tauri::command]
pub async fn is_capturing(state: State<'_, AppState>) -> Result<bool, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.is_capturing())
}

#[tauri::command]
pub async fn detect_pitch(state: State<'_, AppState>) -> Result<Option<crate::audio::PitchResult>, String> {
    let mut pipeline = state.inner().pipeline.lock();
    Ok(pipeline.detect_pitch())
}

#[tauri::command]
pub async fn get_sample_rate(state: State<'_, AppState>) -> Result<u32, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture().get_sample_rate())
}

#[tauri::command]
pub async fn set_sample_rate(
    state: State<'_, AppState>,
    sample_rate: u32,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_capture_mut().set_sample_rate(sample_rate).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_supported_sample_rates(state: State<'_, AppState>) -> Result<Vec<u32>, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture().get_supported_sample_rates())
}

#[tauri::command]
pub async fn get_buffer_size(state: State<'_, AppState>) -> Result<usize, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture().get_buffer_size())
}

#[tauri::command]
pub async fn clear_buffer(state: State<'_, AppState>) -> Result<(), String> {
    let pipeline = state.inner().pipeline.lock();
    pipeline.get_capture().clear_buffer();
    Ok(())
}

#[tauri::command]
pub async fn set_pitch_threshold(
    state: State<'_, AppState>,
    threshold: f32,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_detector_mut().set_threshold(threshold);
    Ok(())
}

#[tauri::command]
pub async fn get_audio_level(state: State<'_, AppState>) -> Result<AudioLevelInfo, String> {
    let mut pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_audio_level())
}

#[tauri::command]
pub async fn set_gain(
    state: State<'_, AppState>,
    gain: f32,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_capture_mut().set_gain(gain);
    Ok(())
}

#[tauri::command]
pub async fn get_gain(state: State<'_, AppState>) -> Result<f32, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture().get_gain())
}

#[tauri::command]
pub async fn calibrate(
    state: State<'_, AppState>,
    reference_frequency: f32,
    detected_frequency: f32,
) -> Result<f32, String> {
    let mut pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture_mut().calibrate(reference_frequency, detected_frequency))
}

#[tauri::command]
pub async fn set_calibration_offset(
    state: State<'_, AppState>,
    offset: f32,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_capture_mut().set_calibration_offset(offset);
    Ok(())
}

#[tauri::command]
pub async fn get_calibration_offset(state: State<'_, AppState>) -> Result<f32, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture().get_calibration_offset())
}

#[tauri::command]
pub async fn get_latency_ms(state: State<'_, AppState>) -> Result<f32, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture().get_latency_ms())
}

#[tauri::command]
pub async fn get_buffer_frame_size(state: State<'_, AppState>) -> Result<usize, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_capture().get_buffer_frame_size())
}

#[tauri::command]
pub async fn set_preprocessor_config(
    state: State<'_, AppState>,
    config: preprocessor::AudioPreprocessorConfig,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_preprocessor_mut().set_config(config);
    Ok(())
}

#[tauri::command]
pub async fn get_noise_estimate(state: State<'_, AppState>) -> Result<preprocessor::NoiseEstimate, String> {
    let mut pipeline = state.inner().pipeline.lock();
    Ok(pipeline.get_noise_estimate())
}

#[tauri::command]
pub async fn reset_preprocessor(state: State<'_, AppState>) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_preprocessor_mut().reset();
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioStatus {
    pub is_capturing: bool,
    pub latency_ms: f32,
    pub buffer_size: usize,
    pub sample_rate: u32,
}

#[tauri::command]
pub async fn get_audio_status(state: State<'_, AppState>) -> Result<AudioStatus, String> {
    let pipeline = state.inner().pipeline.lock();
    Ok(AudioStatus {
        is_capturing: pipeline.is_capturing(),
        latency_ms: pipeline.get_capture().get_latency_ms(),
        buffer_size: pipeline.get_capture().get_buffer_size(),
        sample_rate: pipeline.get_capture().get_sample_rate(),
    })
}

#[tauri::command]
pub async fn set_buffer_size(
    state: State<'_, AppState>,
    size: usize,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_capture_mut().set_buffer_size(size).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_noise_suppression(
    state: State<'_, AppState>,
    level: f32,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    pipeline.get_preprocessor_mut().set_noise_suppression_level(level);
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FilterConfig {
    pub high_pass: Option<bool>,
    pub low_pass: Option<bool>,
    pub notch50: Option<bool>,
    pub notch60: Option<bool>,
}

#[tauri::command]
pub async fn set_audio_filters(
    state: State<'_, AppState>,
    filters: FilterConfig,
) -> Result<(), String> {
    let mut pipeline = state.inner().pipeline.lock();
    let pp = pipeline.get_preprocessor_mut();

    if let Some(enabled) = filters.high_pass {
        pp.set_high_pass_filter(enabled);
    }
    if let Some(enabled) = filters.low_pass {
        pp.set_low_pass_filter(enabled);
    }
    if let Some(enabled) = filters.notch50 {
        pp.set_notch_filter_50hz(enabled);
    }
    if let Some(enabled) = filters.notch60 {
        pp.set_notch_filter_60hz(enabled);
    }

    Ok(())
}

#[tauri::command]
pub async fn start_device_monitor(
    app: AppHandle,
    state: State<'_, AppState>,
    interval_ms: Option<u64>,
) -> Result<(), String> {
    let mut monitor = state.inner().device_monitor.lock();
    let interval = interval_ms.unwrap_or(1500);
    monitor.start(app, interval);
    log::info!("Device monitor started with interval {}ms", interval);
    Ok(())
}

#[tauri::command]
pub async fn stop_device_monitor(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut monitor = state.inner().device_monitor.lock();
    monitor.stop();
    log::info!("Device monitor stopped");
    Ok(())
}

#[tauri::command]
pub async fn is_device_monitor_running(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let monitor = state.inner().device_monitor.lock();
    Ok(monitor.is_running())
}
