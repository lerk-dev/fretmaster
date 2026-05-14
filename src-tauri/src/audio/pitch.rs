use serde::{Deserialize, Serialize};
use rustfft::{FftPlanner, num_complex::Complex, Fft};
use std::sync::Arc;

const MIN_FREQUENCY: f32 = 27.5;
const MAX_FREQUENCY: f32 = 4186.0;
const DEFAULT_THRESHOLD: f32 = 0.12;
const PROBABILITY_CLIFF: f32 = 0.1;
const SMOOTHING_FACTOR: f32 = 0.85;
const MAX_HISTORY: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PitchResult {
    pub frequency: f32,
    pub note: String,
    pub octave: i32,
    pub cents: f32,
    pub probability: f32,
    pub clarity: f32,
    pub volume_rms: f64,
    pub volume_db_spl: f64,
    pub max_amplitude: f32,
    pub timestamp: u64,
    pub is_voiced: bool,
    pub confidence: PitchConfidence,
    pub calibration_offset: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PitchConfidence {
    pub yin_probability: f32,
    pub harmonic_score: f32,
    pub temporal_consistency: f32,
    pub overall: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarmonicAnalysis {
    pub harmonics: Vec<(u32, f32)>,
    pub fundamental_strength: f32,
    pub harmonic_ratio: f32,
    pub inharmonicity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PitchDetectorConfig {
    pub threshold: f32,
    pub probability_cliff: f32,
    pub sample_rate: u32,
    pub buffer_size: usize,
    pub enable_temporal_smoothing: bool,
    pub enable_harmonic_check: bool,
    pub calibration_offset: f32,
    pub enable_adaptive_buffer: bool,
}

impl Default for PitchDetectorConfig {
    fn default() -> Self {
        Self {
            threshold: DEFAULT_THRESHOLD,
            probability_cliff: PROBABILITY_CLIFF,
            sample_rate: 48000,
            buffer_size: 8192,
            enable_temporal_smoothing: true,
            enable_harmonic_check: true,
            calibration_offset: 0.0,
            enable_adaptive_buffer: true,
        }
    }
}

pub struct PitchDetector {
    config: PitchDetectorConfig,
    yin_buffer: Vec<f32>,
    frequency_history: Vec<f32>,
    smoothed_frequency: Option<f32>,
    adaptive_threshold: f32,
    noise_floor: f32,
    adaptive_buffer_size: usize,
    cached_fft_size: usize,
    cached_fft_forward: Option<Arc<dyn Fft<f32>>>,
    cached_fft_inverse: Option<Arc<dyn Fft<f32>>>,
}

impl PitchDetector {
    pub fn new(config: PitchDetectorConfig) -> Self {
        let half_size = config.buffer_size / 2;
        Self {
            yin_buffer: vec![0.0; half_size],
            adaptive_buffer_size: config.buffer_size,
            config,
            frequency_history: Vec::with_capacity(MAX_HISTORY),
            smoothed_frequency: None,
            adaptive_threshold: DEFAULT_THRESHOLD,
            noise_floor: 0.0,
            cached_fft_size: 0,
            cached_fft_forward: None,
            cached_fft_inverse: None,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.config.sample_rate = sample_rate;
    }

    pub fn get_sample_rate(&self) -> u32 {
        self.config.sample_rate
    }

    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.config.buffer_size = buffer_size;
        let half_size = buffer_size / 2;
        self.yin_buffer.resize(half_size, 0.0);
    }

    pub fn set_threshold(&mut self, threshold: f32) {
        self.config.threshold = threshold.clamp(0.05, 0.5);
        self.adaptive_threshold = self.config.threshold;
    }

    pub fn set_calibration_offset(&mut self, offset: f32) {
        self.config.calibration_offset = offset;
    }

    pub fn update_noise_floor(&mut self, rms: f32) {
        self.noise_floor = self.noise_floor * 0.98 + rms * 0.02;
        self.adaptive_threshold = (self.config.threshold + self.noise_floor * 1.5).min(0.5);
    }

    pub fn detect(&mut self, buffer: &[f32]) -> Option<PitchResult> {
        if buffer.len() < self.config.buffer_size {
            return None;
        }

        let effective_buffer_size = if self.config.enable_adaptive_buffer {
            self.calculate_adaptive_buffer_size(buffer.len())
        } else {
            self.config.buffer_size
        };

        let half_size = effective_buffer_size / 2;
        if self.yin_buffer.len() < half_size {
            self.yin_buffer.resize(half_size, 0.0);
        }

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let volume_rms = Self::compute_rms(buffer);
        let volume_db_spl = Self::compute_db_spl(buffer);
        let max_amplitude = Self::compute_max_amplitude(buffer);

        self.update_noise_floor(volume_rms as f32);

        let is_voiced = volume_rms as f32 > self.noise_floor * 2.0;

        if !is_voiced {
            self.frequency_history.clear();
            self.smoothed_frequency = None;
            return None;
        }

        let half_size = effective_buffer_size / 2;

        self.compute_difference_function(buffer, half_size);
        self.cumulative_mean_normalized(half_size);

        let tau = self.find_fundamental(half_size)?;
        let refined_tau = self.parabolic_interpolation(tau);

        let frequency = self.config.sample_rate as f32 / refined_tau;

        // P0 Fix: Enhanced low-frequency stability check
        if frequency < MIN_FREQUENCY * 0.95 || frequency > MAX_FREQUENCY * 1.05 {
            return None;
        }

        if frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY {
            return None;
        }

        // P0 Fix: Reject unstable low-frequency detections (< 80Hz)
        if frequency < 80.0 {
            let harmonic_check = self.check_harmonics(frequency, half_size);
            if harmonic_check < 0.6 {
                return None;
            }
        }

        let yin_probability = 1.0 - self.yin_buffer[tau];

        if yin_probability < PROBABILITY_CLIFF {
            return None;
        }

        let harmonic_score = if self.config.enable_harmonic_check {
            self.enhanced_harmonic_check(frequency, half_size)
        } else {
            1.0
        };

        let temporal_consistency = self.compute_temporal_consistency(frequency);

        let overall_confidence = yin_probability * 0.5
            + harmonic_score * 0.25
            + temporal_consistency * 0.25;

        let final_frequency = if self.config.enable_temporal_smoothing {
            self.apply_temporal_smoothing(frequency, yin_probability)
        } else {
            frequency
        };

        let calibrated_frequency = self.apply_calibration(final_frequency);

        let (note, octave, cents) = frequency_to_note(calibrated_frequency);

        let clarity = yin_probability * harmonic_score;

        Some(PitchResult {
            frequency: calibrated_frequency,
            note,
            octave,
            cents,
            probability: yin_probability,
            clarity,
            volume_rms,
            volume_db_spl,
            max_amplitude,
            timestamp,
            is_voiced,
            confidence: PitchConfidence {
                yin_probability,
                harmonic_score,
                temporal_consistency,
                overall: overall_confidence,
            },
            calibration_offset: self.config.calibration_offset,
        })
    }

    fn calculate_adaptive_buffer_size(&self, buffer_len: usize) -> usize {
        let desired_size = if let Some(prev_freq) = self.smoothed_frequency {
            if prev_freq > 600.0 || prev_freq < 150.0 {
                (self.config.buffer_size * 2).min(16384)
            } else {
                self.config.buffer_size
            }
        } else {
            self.config.buffer_size
        };
        
        desired_size.min(buffer_len)
    }

    fn compute_difference_function(&mut self, buffer: &[f32], half_size: usize) {
        self.yin_buffer[0] = 1.0;

        let n = buffer.len();
        let fft_size = n.next_power_of_two();

        if self.cached_fft_size != fft_size {
            let mut planner = FftPlanner::new();
            self.cached_fft_forward = Some(planner.plan_fft_forward(fft_size));
            self.cached_fft_inverse = Some(planner.plan_fft_inverse(fft_size));
            self.cached_fft_size = fft_size;
        }

        let fft = self.cached_fft_forward.as_ref().unwrap();
        let ifft = self.cached_fft_inverse.as_ref().unwrap();

        let mut signal: Vec<Complex<f32>> = buffer.iter()
            .map(|&x| Complex { re: x, im: 0.0 })
            .chain(std::iter::repeat(Complex { re: 0.0, im: 0.0 }))
            .take(fft_size)
            .collect();

        let mut reversed: Vec<Complex<f32>> = buffer.iter().rev()
            .map(|&x| Complex { re: x, im: 0.0 })
            .chain(std::iter::repeat(Complex { re: 0.0, im: 0.0 }))
            .take(fft_size)
            .collect();

        fft.process(&mut signal);
        fft.process(&mut reversed);

        let mut product: Vec<Complex<f32>> = signal.iter().zip(reversed.iter())
            .map(|(a, b)| a * b)
            .collect();

        ifft.process(&mut product);

        let scale = 1.0 / fft_size as f32;
        let acf: Vec<f32> = product.iter().take(half_size)
            .map(|c| c.re * scale)
            .collect();

        let energy: Vec<f32> = {
            let mut e = vec![0.0f32; half_size];
            e[0] = buffer.iter().take(half_size).map(|x| x * x).sum();
            for tau in 1..half_size {
                e[tau] = e[tau - 1] - buffer[tau - 1] * buffer[tau - 1]
                    + buffer[tau + half_size - 1] * buffer[tau + half_size - 1];
            }
            e
        };

        for tau in 1..half_size {
            self.yin_buffer[tau] = energy[0] + energy[tau] - 2.0 * acf[tau];
        }
    }

    fn cumulative_mean_normalized(&mut self, half_size: usize) {
        let mut running_sum = 0.0f32;

        for tau in 1..half_size {
            running_sum += self.yin_buffer[tau];
            if running_sum > 0.0 {
                self.yin_buffer[tau] = self.yin_buffer[tau] * tau as f32 / running_sum;
            } else {
                self.yin_buffer[tau] = 1.0;
            }
        }
    }

    fn find_fundamental(&self, half_size: usize) -> Option<usize> {
        let min_tau = ((self.config.sample_rate as f32 / MAX_FREQUENCY) as usize).max(2);
        let max_tau = ((self.config.sample_rate as f32 / MIN_FREQUENCY) as usize).min(half_size - 1);

        let mut best_tau = 0usize;
        let mut best_val = 1.0f32;

        for tau in min_tau..max_tau {
            let val = self.yin_buffer[tau];
            
            if val < self.adaptive_threshold && val < best_val {
                best_tau = tau;
                best_val = val;
                
                while best_tau + 1 < max_tau && self.yin_buffer[best_tau + 1] < best_val {
                    best_tau += 1;
                    best_val = self.yin_buffer[best_tau];
                }
                
                if best_val < self.adaptive_threshold * 0.5 {
                    if let Some(octave_tau) = self.check_octave_candidate(best_tau, min_tau, max_tau) {
                        return Some(octave_tau);
                    }
                    return Some(best_tau);
                }
            }
        }

        if best_val < self.adaptive_threshold {
            if let Some(octave_tau) = self.check_octave_candidate(best_tau, min_tau, max_tau) {
                return Some(octave_tau);
            }
            return Some(best_tau);
        }

        let min_val_tau = (min_tau..max_tau)
            .min_by(|&a, &b| self.yin_buffer[a].partial_cmp(&self.yin_buffer[b]).unwrap())?;

        if self.yin_buffer[min_val_tau] < 0.5 {
            Some(min_val_tau)
        } else {
            None
        }
    }

    fn check_octave_candidate(&self, tau: usize, min_tau: usize, max_tau: usize) -> Option<usize> {
        if tau < min_tau * 2 {
            return None;
        }
        
        let octave_tau = tau / 2;
        
        if octave_tau < min_tau || octave_tau >= max_tau {
            return None;
        }
        
        let octave_val = self.yin_buffer[octave_tau];
        
        if octave_val < self.adaptive_threshold * 0.8 {
            if self.verify_octave_relationship(tau, octave_tau) {
                return Some(octave_tau);
            }
        }
        
        None
    }

    fn verify_octave_relationship(&self, tau: usize, octave_tau: usize) -> bool {
        if (octave_tau * 2).abs_diff(tau) <= 2 {
            let tau_val = self.yin_buffer[tau];
            let octave_val = self.yin_buffer[octave_tau];
            
            octave_val <= tau_val * 1.2
        } else {
            false
        }
    }

    fn parabolic_interpolation(&self, tau: usize) -> f32 {
        if tau == 0 || tau >= self.yin_buffer.len() - 1 {
            return tau as f32;
        }

        let s0 = self.yin_buffer[tau - 1] as f64;
        let s1 = self.yin_buffer[tau] as f64;
        let s2 = self.yin_buffer[tau + 1] as f64;

        let denom = 2.0 * s1 - s2 - s0;
        if denom.abs() < 1e-10 {
            return tau as f32;
        }

        let adjustment = (s2 - s0) / (2.0 * denom);
        
        if adjustment.is_finite() && adjustment.abs() < 1.0 {
            let refined_tau = tau as f64 + adjustment;
            
            if refined_tau > 0.0 && refined_tau < self.yin_buffer.len() as f64 {
                return refined_tau as f32;
            }
        }
        
        tau as f32
    }

    fn check_harmonics(&self, frequency: f32, half_size: usize) -> f32 {
        let mut score = 0.0f32;
        let mut count = 0;

        for harmonic in [2.0f32, 3.0, 4.0, 5.0] {
            let harmonic_freq = frequency * harmonic;
            if harmonic_freq > MAX_FREQUENCY {
                break;
            }

            let harmonic_tau = (self.config.sample_rate as f32 / harmonic_freq) as usize;
            if harmonic_tau > 0 && harmonic_tau < half_size {
                let val = self.yin_buffer[harmonic_tau];
                if val < 0.5 {
                    score += 1.0 - val;
                }
                count += 1;
            }
        }

        if count > 0 { score / count as f32 } else { 0.5 }
    }

    fn check_subharmonics(&self, frequency: f32, half_size: usize) -> f32 {
        let mut score = 0.0f32;
        let mut count = 0;

        for sub_harmonic in [2.0f32, 3.0] {
            let sub_freq = frequency / sub_harmonic;
            if sub_freq < MIN_FREQUENCY {
                continue;
            }

            let sub_tau = (self.config.sample_rate as f32 / sub_freq) as usize;
            if sub_tau > 0 && sub_tau < half_size {
                let val = self.yin_buffer[sub_tau];
                if val < 0.3 {
                    score += 0.5;
                }
                count += 1;
            }
        }

        if count > 0 { 1.0 - (score / count as f32) } else { 1.0 }
    }

    fn analyze_harmonic_spectrum(&self, frequency: f32, half_size: usize) -> HarmonicAnalysis {
        let mut harmonics_found = Vec::new();
        let total_energy = 0.0f32;
        let mut harmonic_energy = 0.0f32;

        for harmonic in 1..=8 {
            let harmonic_freq = frequency * harmonic as f32;
            if harmonic_freq > MAX_FREQUENCY {
                break;
            }

            let harmonic_tau = (self.config.sample_rate as f32 / harmonic_freq) as usize;
            if harmonic_tau > 0 && harmonic_tau < half_size {
                let val = self.yin_buffer[harmonic_tau];
                let strength = if val < 0.5 { 1.0 - val } else { 0.0 };
                harmonics_found.push((harmonic, strength));
                if harmonic <= 5 {
                    harmonic_energy += strength;
                }
            }
        }

        let fundamental_strength = harmonics_found.first().map(|&(_, s)| s).unwrap_or(0.0);
        let harmonic_ratio = if total_energy > 0.0 {
            harmonic_energy / total_energy
        } else {
            0.0
        };

        HarmonicAnalysis {
            harmonics: harmonics_found,
            fundamental_strength,
            harmonic_ratio,
            inharmonicity: 1.0 - harmonic_ratio,
        }
    }

    fn enhanced_harmonic_check(&self, frequency: f32, half_size: usize) -> f32 {
        let basic_score = self.check_harmonics(frequency, half_size);
        let sub_score = self.check_subharmonics(frequency, half_size);
        let analysis = self.analyze_harmonic_spectrum(frequency, half_size);

        let harmonic_confidence = basic_score * 0.5 + sub_score * 0.3 + analysis.fundamental_strength * 0.2;

        harmonic_confidence.clamp(0.0, 1.0)
    }

    fn compute_temporal_consistency(&mut self, frequency: f32) -> f32 {
        if self.frequency_history.is_empty() {
            self.frequency_history.push(frequency);
            return 0.5;
        }

        self.frequency_history.push(frequency);
        if self.frequency_history.len() > MAX_HISTORY {
            self.frequency_history.remove(0);
        }

        if self.frequency_history.len() < 2 {
            return 0.5;
        }

        let mut consistent = 0;
        for i in 1..self.frequency_history.len() {
            let ratio = self.frequency_history[i] / self.frequency_history[i - 1];
            let cents_diff = (ratio.log2() * 1200.0).abs();
            if cents_diff < 50.0 {
                consistent += 1;
            }
        }

        consistent as f32 / (self.frequency_history.len() - 1) as f32
    }

    fn apply_temporal_smoothing(&mut self, frequency: f32, _probability: f32) -> f32 {
        match self.smoothed_frequency {
            Some(prev) => {
                let ratio = frequency / prev;
                let cents_diff = (ratio.log2() * 1200.0).abs();

                let alpha = if cents_diff < 20.0 {
                    SMOOTHING_FACTOR
                } else if cents_diff < 100.0 {
                    0.5
                } else {
                    0.1
                };

                let smoothed = prev * alpha + frequency * (1.0 - alpha);
                self.smoothed_frequency = Some(smoothed);
                smoothed
            }
            None => {
                self.smoothed_frequency = Some(frequency);
                frequency
            }
        }
    }

    fn apply_calibration(&self, frequency: f32) -> f32 {
        if self.config.calibration_offset.abs() < 0.01 {
            return frequency;
        }
        frequency * (2.0f32.powf(self.config.calibration_offset / 1200.0))
    }

    fn compute_rms(buffer: &[f32]) -> f64 {
        let sum: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum();
        (sum / buffer.len() as f64).sqrt()
    }

    fn compute_db_spl(buffer: &[f32]) -> f64 {
        let rms = Self::compute_rms(buffer);
        if rms > 0.0 { 20.0 * rms.log10() + 94.0 } else { -96.0 }
    }

    fn compute_max_amplitude(buffer: &[f32]) -> f32 {
        buffer.iter().map(|&x| x.abs()).fold(0.0f32, f32::max)
    }
}

impl Default for PitchDetector {
    fn default() -> Self {
        Self::new(PitchDetectorConfig::default())
    }
}

fn frequency_to_note(frequency: f32) -> (String, i32, f32) {
    let note_names = ["C", "C\u{266F}", "D", "D\u{266F}", "E", "F", "F\u{266F}", "G", "G\u{266F}", "A", "A\u{266F}", "B"];

    let a4 = 440.0;
    let a4_midi = 69;

    let midi_note = 12.0 * (frequency / a4).log2() + a4_midi as f32;
    let midi_rounded = midi_note.round() as i32;

    let note_index = midi_rounded % 12;
    let note_index = if note_index < 0 { note_index + 12 } else { note_index } as usize;
    let octave = (midi_rounded / 12) - 1;

    let cents = (midi_note - midi_rounded as f32) * 100.0;

    (note_names[note_index].to_string(), octave, cents)
}

#[cfg(test)]
#[path = "pitch_tests.rs"]
mod pitch_tests;
