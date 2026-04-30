use tauri::State;
use crate::audio::{AudioCapture, PitchDetector, PitchResult, AudioDeviceInfo, AudioPreprocessor, device, preprocessor};
use parking_lot::Mutex;
use std::sync::Arc;

pub struct AppState {
    pub audio_capture: Arc<Mutex<AudioCapture>>,
    pub pitch_detector: Arc<Mutex<PitchDetector>>,
    pub preprocessor: Arc<Mutex<AudioPreprocessor>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            audio_capture: Arc::new(Mutex::new(AudioCapture::new())),
            pitch_detector: Arc::new(Mutex::new(PitchDetector::default())),
            preprocessor: Arc::new(Mutex::new(AudioPreprocessor::new(48000))),
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
    let mut capture = state.inner().audio_capture.lock();
    capture.start(device_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_audio_capture_with_sample_rate(
    state: State<'_, AppState>,
    device_name: Option<String>,
    sample_rate: Option<u32>,
) -> Result<(), String> {
    let mut capture = state.inner().audio_capture.lock();
    capture.start_with_sample_rate(device_name, sample_rate).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_audio_capture(state: State<'_, AppState>) -> Result<(), String> {
    let mut capture = state.inner().audio_capture.lock();
    capture.stop();
    Ok(())
}

#[tauri::command]
pub async fn is_capturing(state: State<'_, AppState>) -> Result<bool, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.is_capturing())
}

#[tauri::command]
pub async fn detect_pitch(state: State<'_, AppState>) -> Result<Option<PitchResult>, String> {
    let (buffer, sample_rate, calibration_offset) = {
        let capture = state.inner().audio_capture.lock();
        if !capture.is_capturing() {
            return Ok(None);
        }
        (capture.get_buffer(), capture.get_sample_rate(), capture.get_calibration_offset())
    };

    let processed = {
        let mut pp = state.inner().preprocessor.lock();
        pp.set_sample_rate(sample_rate);
        pp.process(&buffer)
    };

    let mut detector = state.inner().pitch_detector.lock();
    detector.set_sample_rate(sample_rate);
    detector.set_calibration_offset(calibration_offset);

    Ok(detector.detect(&processed))
}

#[tauri::command]
pub async fn get_sample_rate(state: State<'_, AppState>) -> Result<u32, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.get_sample_rate())
}

#[tauri::command]
pub async fn set_sample_rate(
    state: State<'_, AppState>,
    sample_rate: u32,
) -> Result<(), String> {
    let mut capture = state.inner().audio_capture.lock();
    capture.set_sample_rate(sample_rate).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_supported_sample_rates(state: State<'_, AppState>) -> Result<Vec<u32>, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.get_supported_sample_rates())
}

#[tauri::command]
pub async fn get_buffer_size(state: State<'_, AppState>) -> Result<usize, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.get_buffer_size())
}

#[tauri::command]
pub async fn clear_buffer(state: State<'_, AppState>) -> Result<(), String> {
    let capture = state.inner().audio_capture.lock();
    capture.clear_buffer();
    Ok(())
}

#[tauri::command]
pub async fn set_pitch_threshold(
    state: State<'_, AppState>,
    threshold: f32,
) -> Result<(), String> {
    let mut detector = state.inner().pitch_detector.lock();
    detector.set_threshold(threshold);
    Ok(())
}

#[tauri::command]
pub async fn get_audio_level(state: State<'_, AppState>) -> Result<AudioLevelInfo, String> {
    let (buffer, is_capturing) = {
        let capture = state.inner().audio_capture.lock();
        (capture.get_buffer(), capture.is_capturing())
    };

    if !is_capturing {
        return Ok(AudioLevelInfo {
            rms: 0.0,
            db_spl: -96.0,
            peak: 0.0,
            is_voiced: false,
            noise_floor: 0.0,
            snr_db: 0.0,
        });
    }

    let rms: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>() / buffer.len() as f64;
    let rms = rms.sqrt();

    let db_spl = if rms > 0.0 {
        20.0 * rms.log10() + 94.0
    } else {
        -96.0
    };

    let peak = buffer.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);

    let noise_est = {
        let pp = state.inner().preprocessor.lock();
        pp.estimate_noise(&buffer)
    };

    Ok(AudioLevelInfo {
        rms,
        db_spl,
        peak,
        is_voiced: rms as f32 > noise_est.noise_floor * 2.0,
        noise_floor: noise_est.noise_floor,
        snr_db: noise_est.snr_db,
    })
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioLevelInfo {
    pub rms: f64,
    pub db_spl: f64,
    pub peak: f32,
    pub is_voiced: bool,
    pub noise_floor: f32,
    pub snr_db: f32,
}

#[tauri::command]
pub async fn set_gain(
    state: State<'_, AppState>,
    gain: f32,
) -> Result<(), String> {
    let mut capture = state.inner().audio_capture.lock();
    capture.set_gain(gain);
    Ok(())
}

#[tauri::command]
pub async fn get_gain(state: State<'_, AppState>) -> Result<f32, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.get_gain())
}

#[tauri::command]
pub async fn calibrate(
    state: State<'_, AppState>,
    reference_frequency: f32,
    detected_frequency: f32,
) -> Result<f32, String> {
    let mut capture = state.inner().audio_capture.lock();
    Ok(capture.calibrate(reference_frequency, detected_frequency))
}

#[tauri::command]
pub async fn set_calibration_offset(
    state: State<'_, AppState>,
    offset: f32,
) -> Result<(), String> {
    let mut capture = state.inner().audio_capture.lock();
    capture.set_calibration_offset(offset);
    Ok(())
}

#[tauri::command]
pub async fn get_calibration_offset(state: State<'_, AppState>) -> Result<f32, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.get_calibration_offset())
}

#[tauri::command]
pub async fn get_latency_ms(state: State<'_, AppState>) -> Result<f32, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.get_latency_ms())
}

#[tauri::command]
pub async fn get_buffer_frame_size(state: State<'_, AppState>) -> Result<usize, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(capture.get_buffer_frame_size())
}

#[tauri::command]
pub async fn set_preprocessor_config(
    state: State<'_, AppState>,
    config: preprocessor::AudioPreprocessorConfig,
) -> Result<(), String> {
    let mut pp = state.inner().preprocessor.lock();
    pp.set_config(config);
    Ok(())
}

#[tauri::command]
pub async fn get_noise_estimate(state: State<'_, AppState>) -> Result<preprocessor::NoiseEstimate, String> {
    let (buffer, is_capturing) = {
        let capture = state.inner().audio_capture.lock();
        (capture.get_buffer(), capture.is_capturing())
    };

    if !is_capturing {
        return Ok(preprocessor::NoiseEstimate {
            noise_floor: 0.0,
            noise_floor_db: -96.0,
            snr: 0.0,
            snr_db: 0.0,
            signal_rms: 0.0,
            signal_db: -96.0,
        });
    }

    let pp = state.inner().preprocessor.lock();
    Ok(pp.estimate_noise(&buffer))
}

#[tauri::command]
pub async fn reset_preprocessor(state: State<'_, AppState>) -> Result<(), String> {
    let mut pp = state.inner().preprocessor.lock();
    pp.reset();
    Ok(())
}

// 新增命令 - 用于前端设置界面

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioStatus {
    pub is_capturing: bool,
    pub latency_ms: f32,
    pub buffer_size: usize,
    pub sample_rate: u32,
}

#[tauri::command]
pub async fn get_audio_status(state: State<'_, AppState>) -> Result<AudioStatus, String> {
    let capture = state.inner().audio_capture.lock();
    Ok(AudioStatus {
        is_capturing: capture.is_capturing(),
        latency_ms: capture.get_latency_ms(),
        buffer_size: capture.get_buffer_size(),
        sample_rate: capture.get_sample_rate(),
    })
}

#[tauri::command]
pub async fn set_buffer_size(
    state: State<'_, AppState>,
    size: usize,
) -> Result<(), String> {
    let mut capture = state.inner().audio_capture.lock();
    capture.set_buffer_size(size).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_noise_suppression(
    state: State<'_, AppState>,
    level: f32,
) -> Result<(), String> {
    let mut pp = state.inner().preprocessor.lock();
    pp.set_noise_suppression_level(level);
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
    let mut pp = state.inner().preprocessor.lock();
    
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
