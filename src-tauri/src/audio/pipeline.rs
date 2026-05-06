use crate::audio::{AudioCapture, PitchDetector, PitchResult, AudioPreprocessor, preprocessor};
use parking_lot::Mutex;
use std::sync::Arc;

pub struct AudioPipeline {
    capture: AudioCapture,
    preprocessor: AudioPreprocessor,
    detector: PitchDetector,
}

impl AudioPipeline {
    pub fn new() -> Self {
        let sample_rate = 48000u32;
        Self {
            capture: AudioCapture::new(),
            preprocessor: AudioPreprocessor::new(sample_rate),
            detector: PitchDetector::default(),
        }
    }

    pub fn start_capture(&mut self, device_name: Option<String>, sample_rate: Option<u32>) -> Result<(), String> {
        self.capture.start_with_sample_rate(device_name, sample_rate).map_err(|e| e.to_string())
    }

    pub fn stop_capture(&mut self) {
        self.capture.stop();
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

        self.preprocessor.set_sample_rate(sample_rate);
        let processed = self.preprocessor.process(&buffer);

        self.detector.set_sample_rate(sample_rate);
        self.detector.set_calibration_offset(calibration_offset);
        self.detector.detect(&processed)
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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pipeline: Arc::new(Mutex::new(AudioPipeline::new())),
            device_monitor: Arc::new(Mutex::new(crate::audio::DeviceMonitor::new())),
        }
    }
}
