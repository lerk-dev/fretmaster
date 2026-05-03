use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPreprocessorConfig {
    pub high_pass_freq: f32,
    pub low_pass_freq: f32,
    pub notch_freq_50: f32,
    pub notch_freq_60: f32,
    pub notch_q: f32,
    pub noise_gate_threshold: f32,
    pub enable_high_pass: bool,
    pub enable_low_pass: bool,
    pub enable_notch_50: bool,
    pub enable_notch_60: bool,
    pub enable_noise_gate: bool,
}

impl Default for AudioPreprocessorConfig {
    fn default() -> Self {
        Self {
            high_pass_freq: 35.0,
            low_pass_freq: 4500.0,
            notch_freq_50: 50.0,
            notch_freq_60: 60.0,
            notch_q: 15.0,
            noise_gate_threshold: 0.008,
            enable_high_pass: true,
            enable_low_pass: true,
            enable_notch_50: true,
            enable_notch_60: true,
            enable_noise_gate: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoiseEstimate {
    pub noise_floor: f32,
    pub noise_floor_db: f32,
    pub snr: f32,
    pub snr_db: f32,
    pub signal_rms: f32,
    pub signal_db: f32,
}

struct BiquadFilter {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadFilter {
    fn _new() -> Self {
        Self { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn high_pass(sample_rate: f32, freq: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let b0 = (1.0 + cos_w0) / 2.0;
        let b1 = -(1.0 + cos_w0);
        let b2 = (1.0 + cos_w0) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        Self { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn low_pass(sample_rate: f32, freq: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let b0 = (1.0 - cos_w0) / 2.0;
        let b1 = 1.0 - cos_w0;
        let b2 = (1.0 - cos_w0) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        Self { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn notch(sample_rate: f32, freq: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let b0 = 1.0;
        let b1 = -2.0 * cos_w0;
        let b2 = 1.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        Self { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn process(&mut self, x0: f32) -> f32 {
        let y0 = self.b0 * x0 + self.b1 * self.x1 + self.b2 * self.x2
                 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x0;
        self.y2 = self.y1;
        self.y1 = y0;
        y0
    }

    fn reset(&mut self) {
        self.x1 = 0.0; self.x2 = 0.0; self.y1 = 0.0; self.y2 = 0.0;
    }
}

pub struct AudioPreprocessor {
    config: AudioPreprocessorConfig,
    sample_rate: f32,
    hp_filter: BiquadFilter,
    lp_filter: BiquadFilter,
    notch_50: BiquadFilter,
    notch_60: BiquadFilter,
    noise_floor_est: f32,
    noise_alpha: f32,
    prev_signal_rms: f32,
}

impl AudioPreprocessor {
    pub fn new(sample_rate: u32) -> Self {
        let config = AudioPreprocessorConfig::default();
        let sr = sample_rate as f32;
        Self {
            hp_filter: BiquadFilter::high_pass(sr, config.high_pass_freq, 0.707),
            lp_filter: BiquadFilter::low_pass(sr, config.low_pass_freq, 0.707),
            notch_50: BiquadFilter::notch(sr, config.notch_freq_50, config.notch_q),
            notch_60: BiquadFilter::notch(sr, config.notch_freq_60, config.notch_q),
            noise_floor_est: 0.01,
            noise_alpha: 0.995,
            prev_signal_rms: 0.0,
            config,
            sample_rate: sr,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.sample_rate = sample_rate as f32;
        self.rebuild_filters();
    }

    pub fn set_config(&mut self, config: AudioPreprocessorConfig) {
        self.config = config;
        self.rebuild_filters();
    }

    fn rebuild_filters(&mut self) {
        let sr = self.sample_rate;
        self.hp_filter = BiquadFilter::high_pass(sr, self.config.high_pass_freq, 0.707);
        self.lp_filter = BiquadFilter::low_pass(sr, self.config.low_pass_freq, 0.707);
        self.notch_50 = BiquadFilter::notch(sr, self.config.notch_freq_50, self.config.notch_q);
        self.notch_60 = BiquadFilter::notch(sr, self.config.notch_freq_60, self.config.notch_q);
    }

    pub fn process(&mut self, buffer: &[f32]) -> Vec<f32> {
        let mut output = buffer.to_vec();

        if self.config.enable_high_pass {
            for sample in output.iter_mut() {
                *sample = self.hp_filter.process(*sample);
            }
        }

        if self.config.enable_low_pass {
            for sample in output.iter_mut() {
                *sample = self.lp_filter.process(*sample);
            }
        }

        if self.config.enable_notch_50 {
            for sample in output.iter_mut() {
                *sample = self.notch_50.process(*sample);
            }
        }

        if self.config.enable_notch_60 {
            for sample in output.iter_mut() {
                *sample = self.notch_60.process(*sample);
            }
        }

        let signal_rms = Self::compute_rms(&output);
        self.noise_floor_est = self.noise_alpha * self.noise_floor_est
            + (1.0 - self.noise_alpha) * signal_rms.min(self.prev_signal_rms);
        self.prev_signal_rms = signal_rms;

        if self.config.enable_noise_gate {
            let adaptive_threshold = (self.config.noise_gate_threshold * 2.0).max(self.noise_floor_est * 3.0);
            if signal_rms < adaptive_threshold {
                let gain = if adaptive_threshold > 0.0 {
                    (signal_rms / adaptive_threshold).min(1.0)
                } else {
                    0.0
                };
                let smooth_gain = gain * gain;
                for sample in output.iter_mut() {
                    *sample *= smooth_gain;
                }
            }
        }

        output
    }

    pub fn estimate_noise(&self, buffer: &[f32]) -> NoiseEstimate {
        let signal_rms = Self::compute_rms(buffer);
        let noise_floor = self.noise_floor_est;
        let snr = if noise_floor > 0.0 { signal_rms / noise_floor } else { 1000.0 };
        let signal_db = if signal_rms > 0.0 { 20.0 * signal_rms.log10() } else { -96.0 };
        let noise_db = if noise_floor > 0.0 { 20.0 * noise_floor.log10() } else { -96.0 };

        NoiseEstimate {
            noise_floor,
            noise_floor_db: noise_db,
            snr,
            snr_db: if snr > 0.0 { 20.0 * snr.log10() } else { 0.0 },
            signal_rms,
            signal_db,
        }
    }

    pub fn get_adaptive_threshold(&self) -> f32 {
        let base = 0.15;
        let noise_contribution = self.noise_floor_est * 3.0;
        (base + noise_contribution).min(0.5)
    }

    pub fn reset(&mut self) {
        self.hp_filter.reset();
        self.lp_filter.reset();
        self.notch_50.reset();
        self.notch_60.reset();
        self.noise_floor_est = 0.01;
        self.prev_signal_rms = 0.0;
    }

    fn compute_rms(buffer: &[f32]) -> f32 {
        let sum: f32 = buffer.iter().map(|&x| x * x).sum();
        (sum / buffer.len() as f32).sqrt()
    }

    // 新增方法 - 用于前端设置界面

    pub fn set_high_pass_filter(&mut self, enabled: bool) {
        self.config.enable_high_pass = enabled;
    }

    pub fn set_low_pass_filter(&mut self, enabled: bool) {
        self.config.enable_low_pass = enabled;
    }

    pub fn set_notch_filter_50hz(&mut self, enabled: bool) {
        self.config.enable_notch_50 = enabled;
    }

    pub fn set_notch_filter_60hz(&mut self, enabled: bool) {
        self.config.enable_notch_60 = enabled;
    }

    pub fn set_noise_suppression_level(&mut self, level: f32) {
        // level: 0.0 - 100.0, 映射到 noise_gate_threshold
        // level 越高，threshold 越低（更敏感）
        let normalized = level / 100.0;
        self.config.noise_gate_threshold = 0.1 * (1.0 - normalized);
        self.config.enable_noise_gate = level > 0.0;
    }
}
