use crate::audio::{AudioCapture, PitchDetector, PitchResult, AudioPreprocessor, preprocessor};
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use tauri::Emitter;

pub struct AudioPipeline {
    capture: AudioCapture,
    preprocessor: AudioPreprocessor,
    detector: PitchDetector,
    agc_enabled: bool,
    agc_target_level: f32,
    agc_max_gain: f32,
    agc_current_gain: f32,
    agc_attack: f32,
    agc_release: f32,
    last_amplitude: f32,
    amplitude_diff_threshold: f32,
    last_pitch_result: Option<PitchResult>,
}

impl AudioPipeline {
    pub fn new() -> Self {
        let sample_rate = 48000u32;
        Self {
            capture: AudioCapture::new(),
            preprocessor: AudioPreprocessor::new(sample_rate),
            detector: PitchDetector::default(),
            agc_enabled: true,
            agc_target_level: 0.15,
            agc_max_gain: 10.0,
            agc_current_gain: 1.0,
            agc_attack: 0.01,
            agc_release: 0.001,
            last_amplitude: 0.0,
            amplitude_diff_threshold: 0.15,
            last_pitch_result: None,
        }
    }

    pub fn start_capture(&mut self, device_name: Option<String>, sample_rate: Option<u32>) -> Result<(), String> {
        self.capture.start_with_sample_rate(device_name, sample_rate).map_err(|e| e.to_string())
    }

    pub fn stop_capture(&mut self) {
        self.capture.stop();
        self.agc_current_gain = 1.0;
        self.last_amplitude = 0.0;
        self.last_pitch_result = None;
    }

    pub fn is_capturing(&self) -> bool {
        self.capture.is_capturing()
    }

    pub fn detect_pitch(&mut self) -> Option<PitchResult> {
        if !self.capture.is_capturing() {
            return None;
        }

        let buffer_size = self.capture.get_buffer_frame_size();
        let buffer = self.capture.get_latest_samples(buffer_size);

        if buffer.len() < buffer_size {
            return None;
        }

        let sample_rate = self.capture.get_sample_rate();
        let calibration_offset = self.capture.get_calibration_offset();

        let processed = if self.agc_enabled {
            let agc_buffer = self.apply_agc(&buffer);
            self.preprocessor.set_sample_rate(sample_rate);
            self.preprocessor.process(&agc_buffer)
        } else {
            self.preprocessor.set_sample_rate(sample_rate);
            self.preprocessor.process(&buffer)
        };

        self.detector.set_sample_rate(sample_rate);
        self.detector.set_calibration_offset(calibration_offset);
        let result = self.detector.detect(&processed);

        if let Some(ref pitch) = result {
            self.last_pitch_result = Some(pitch.clone());
        }

        result
    }

    fn apply_agc(&mut self, buffer: &[f32]) -> Vec<f32> {
        let rms: f32 = (buffer.iter().map(|&x| x * x).sum::<f32>() / buffer.len() as f32).sqrt();

        if rms > 0.0001 {
            let ratio = self.agc_target_level / rms;
            let target_gain = ratio.min(self.agc_max_gain).max(0.1);

            if target_gain > self.agc_current_gain {
                self.agc_current_gain += (target_gain - self.agc_current_gain) * self.agc_attack;
            } else {
                self.agc_current_gain += (target_gain - self.agc_current_gain) * self.agc_release;
            }

            self.agc_current_gain = self.agc_current_gain.max(0.05);
        }

        buffer.iter().map(|&x| (x * self.agc_current_gain).clamp(-1.0, 1.0)).collect()
    }

    pub fn detect_amplitude_diff(&mut self) -> bool {
        if !self.capture.is_capturing() {
            return false;
        }

        let buffer_size = self.capture.get_buffer_frame_size();
        let buffer = self.capture.get_latest_samples(buffer_size);

        if buffer.is_empty() {
            return false;
        }

        let rms: f32 = (buffer.iter().map(|&x| x * x).sum::<f32>() / buffer.len() as f32).sqrt();
        let diff = rms - self.last_amplitude;
        self.last_amplitude = self.last_amplitude * 0.9 + rms * 0.1;
        diff > self.amplitude_diff_threshold
    }

    pub fn set_agc_enabled(&mut self, enabled: bool) {
        self.agc_enabled = enabled;
        if !enabled {
            self.agc_current_gain = 1.0;
        }
    }

    pub fn is_agc_enabled(&self) -> bool {
        self.agc_enabled
    }

    pub fn set_agc_target_level(&mut self, level: f32) {
        self.agc_target_level = level.clamp(0.01, 0.5);
    }

    pub fn get_agc_gain(&self) -> f32 {
        self.agc_current_gain
    }

    pub fn get_audio_level(&mut self) -> AudioLevelInfo {
        if !self.capture.is_capturing() {
            return AudioLevelInfo {
                rms: 0.0,
                db_spl: -96.0,
                peak: 0.0,
                is_voiced: false,
                noise_floor: 0.0,
                snr_db: 0.0,
            };
        }

        let buffer_size = self.capture.get_buffer_frame_size();
        let buffer = self.capture.get_latest_samples(buffer_size);

        if buffer.is_empty() {
            return AudioLevelInfo {
                rms: 0.0,
                db_spl: -96.0,
                peak: 0.0,
                is_voiced: false,
                noise_floor: 0.0,
                snr_db: 0.0,
            };
        }

        let rms: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>() / buffer.len() as f64;
        let rms = rms.sqrt();

        let db_spl = if rms > 0.0 {
            20.0 * rms.log10() + 94.0
        } else {
            -96.0
        };

        let peak = buffer.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);

        let noise_est = self.preprocessor.estimate_noise(&buffer);

        AudioLevelInfo {
            rms,
            db_spl,
            peak,
            is_voiced: rms as f32 > noise_est.noise_floor * 2.0,
            noise_floor: noise_est.noise_floor,
            snr_db: noise_est.snr_db,
        }
    }

    pub fn get_noise_estimate(&mut self) -> preprocessor::NoiseEstimate {
        if !self.capture.is_capturing() {
            return preprocessor::NoiseEstimate {
                noise_floor: 0.0,
                noise_floor_db: -96.0,
                snr: 0.0,
                snr_db: 0.0,
                signal_rms: 0.0,
                signal_db: -96.0,
            };
        }

        let buffer_size = self.capture.get_buffer_frame_size();
        let buffer = self.capture.get_latest_samples(buffer_size);
        self.preprocessor.estimate_noise(&buffer)
    }

    pub fn get_capture(&self) -> &AudioCapture {
        &self.capture
    }

    pub fn get_capture_mut(&mut self) -> &mut AudioCapture {
        &mut self.capture
    }

    pub fn get_preprocessor_mut(&mut self) -> &mut AudioPreprocessor {
        &mut self.preprocessor
    }

    pub fn get_detector_mut(&mut self) -> &mut PitchDetector {
        &mut self.detector
    }
}

impl Default for AudioPipeline {
    fn default() -> Self {
        Self::new()
    }
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

pub struct AppState {
    pub pipeline: Arc<Mutex<AudioPipeline>>,
    pub device_monitor: Arc<Mutex<crate::audio::DeviceMonitor>>,
    pub pitch_stream_running: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pipeline: Arc::new(Mutex::new(AudioPipeline::new())),
            device_monitor: Arc::new(Mutex::new(crate::audio::DeviceMonitor::new())),
            pitch_stream_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub fn start_pitch_stream(
    app: AppHandle,
    pipeline: Arc<Mutex<AudioPipeline>>,
    running: Arc<AtomicBool>,
    interval_ms: u64,
) {
    if running.swap(true, Ordering::SeqCst) {
        return;
    }

    let interval = if interval_ms == 0 { 50 } else { interval_ms };

    std::thread::spawn(move || {
        log::info!("Pitch stream started with interval {}ms", interval);

        while running.load(Ordering::SeqCst) {
            let result = {
                let mut pipeline = pipeline.lock();
                if !pipeline.is_capturing() {
                    None
                } else {
                    let is_note_onset = pipeline.detect_amplitude_diff();
                    let pitch = pipeline.detect_pitch();
                    pitch.map(|p| (p, is_note_onset, pipeline.get_agc_gain()))
                }
            };

            if let Some((pitch, is_note_onset, agc_gain)) = result {
                let _ = app.emit("pitch-detected", &PitchStreamEvent {
                    pitch,
                    is_note_onset,
                    agc_gain,
                });
            } else if running.load(Ordering::SeqCst) {
                let _ = app.emit("pitch-detected", &PitchStreamEvent {
                    pitch: PitchResult {
                        frequency: 0.0,
                        note: String::new(),
                        octave: 0,
                        cents: 0.0,
                        probability: 0.0,
                        clarity: 0.0,
                        volume_rms: 0.0,
                        volume_db_spl: -96.0,
                        max_amplitude: 0.0,
                        timestamp: 0,
                        is_voiced: false,
                        confidence: crate::audio::PitchConfidence {
                            yin_probability: 0.0,
                            harmonic_score: 0.0,
                            temporal_consistency: 0.0,
                            overall: 0.0,
                        },
                        calibration_offset: 0.0,
                    },
                    is_note_onset: false,
                    agc_gain: 1.0,
                });
            }

            std::thread::sleep(std::time::Duration::from_millis(interval));
        }

        log::info!("Pitch stream stopped");
    });
}

pub fn stop_pitch_stream(running: &Arc<AtomicBool>) {
    running.store(false, Ordering::SeqCst);
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PitchStreamEvent {
    pub pitch: PitchResult,
    pub is_note_onset: bool,
    pub agc_gain: f32,
}
