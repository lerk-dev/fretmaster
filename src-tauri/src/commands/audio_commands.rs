use tauri::State;
use crate::audio::{AudioCapture, PitchDetector, PitchResult, AudioDeviceInfo, device};
use parking_lot::Mutex;
use std::sync::Arc;

pub struct AppState {
    pub audio_capture: Arc<Mutex<AudioCapture>>,
    pub pitch_detector: Arc<Mutex<PitchDetector>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            audio_capture: Arc::new(Mutex::new(AudioCapture::new())),
            pitch_detector: Arc::new(Mutex::new(PitchDetector::default())),
        }
    }
}

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
    let mut capture = state.audio_capture.lock();
    capture.start(device_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_audio_capture_with_sample_rate(
    state: State<'_, AppState>,
    device_name: Option<String>,
    sample_rate: Option<u32>,
) -> Result<(), String> {
    let mut capture = state.audio_capture.lock();
    capture.start_with_sample_rate(device_name, sample_rate).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_audio_capture(state: State<'_, AppState>) -> Result<(), String> {
    let mut capture = state.audio_capture.lock();
    capture.stop();
    Ok(())
}

#[tauri::command]
pub async fn is_capturing(state: State<'_, AppState>) -> Result<bool, String> {
    let capture = state.audio_capture.lock();
    Ok(capture.is_capturing())
}

#[tauri::command]
pub async fn detect_pitch(state: State<'_, AppState>) -> Result<Option<PitchResult>, String> {
    let capture = state.audio_capture.lock();
    
    if !capture.is_capturing() {
        return Ok(None);
    }
    
    let buffer = capture.get_buffer();
    let sample_rate = capture.get_sample_rate();
    
    drop(capture);
    
    let mut detector = state.pitch_detector.lock();
    detector.set_sample_rate(sample_rate);
    
    Ok(detector.detect(&buffer))
}

#[tauri::command]
pub async fn get_sample_rate(state: State<'_, AppState>) -> Result<u32, String> {
    let capture = state.audio_capture.lock();
    Ok(capture.get_sample_rate())
}

#[tauri::command]
pub async fn set_sample_rate(
    state: State<'_, AppState>,
    sample_rate: u32,
) -> Result<(), String> {
    let mut capture = state.audio_capture.lock();
    capture.set_sample_rate(sample_rate).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_supported_sample_rates(state: State<'_, AppState>) -> Result<Vec<u32>, String> {
    let capture = state.audio_capture.lock();
    Ok(capture.get_supported_sample_rates())
}

#[tauri::command]
pub async fn get_buffer_size(state: State<'_, AppState>) -> Result<usize, String> {
    let capture = state.audio_capture.lock();
    Ok(capture.get_buffer_size())
}

#[tauri::command]
pub async fn clear_buffer(state: State<'_, AppState>) -> Result<(), String> {
    let capture = state.audio_capture.lock();
    capture.clear_buffer();
    Ok(())
}

#[tauri::command]
pub async fn set_pitch_threshold(
    state: State<'_, AppState>,
    threshold: f32,
) -> Result<(), String> {
    let mut detector = state.pitch_detector.lock();
    let config = crate::audio::pitch::PitchDetectorConfig {
        threshold,
        ..Default::default()
    };
    *detector = crate::audio::pitch::PitchDetector::new(config);
    Ok(())
}

#[tauri::command]
pub async fn get_audio_level(state: State<'_, AppState>) -> Result<AudioLevelInfo, String> {
    let capture = state.audio_capture.lock();
    
    if !capture.is_capturing() {
        return Ok(AudioLevelInfo {
            rms: 0.0,
            db_spl: -96.0,
            peak: 0.0,
        });
    }
    
    let buffer = capture.get_buffer();
    
    let rms: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>() / buffer.len() as f64;
    let rms = rms.sqrt();
    
    let db_spl = if rms > 0.0 {
        20.0 * rms.log10() + 94.0
    } else {
        -96.0
    };
    
    let peak = buffer.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);
    
    Ok(AudioLevelInfo {
        rms,
        db_spl,
        peak,
    })
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioLevelInfo {
    pub rms: f64,
    pub db_spl: f64,
    pub peak: f32,
}
