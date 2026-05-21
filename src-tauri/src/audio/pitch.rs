use serde::{Deserialize, Serialize};

const MIN_FREQUENCY: f32 = 27.5;
const MAX_FREQUENCY: f32 = 4186.0;
const A4_FREQUENCY: f64 = 440.0;
const A4_MIDI: i32 = 69;
const NOTE_START: i32 = 23;
const MAX_HISTORY: usize = 8;
const PITCH_QUEUE_SIZE: usize = 3;
const PITCH_MAJOR_QUEUE_SIZE: usize = 7;
const CONFUSION_TTL_MILLIS: u64 = 3000;
const SMOOTHING_RATIO: f64 = 0.75;
const SIMILAR_THRESHOLD: f64 = 0.05;
const VOLUME_DECAY: f64 = 0.97;
const CONFUSION_DECAY: f64 = 0.95;
const BOX_FILTER_ROUNDS: usize = 4;

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
            threshold: 0.12,
            probability_cliff: 0.1,
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
    note_frequencies: Vec<f64>,
    note_id_to_frame: Vec<i32>,
    smoothed_buffer: Vec<f64>,
    ac_results: Vec<f64>,
    diff_func: Vec<f64>,
    cmndf: Vec<f64>,
    frequency_history: Vec<f32>,
    smoothed_frequency: Option<f64>,
    pitch_queue: Vec<i32>,
    pitch_major_queue: Vec<i32>,
    last_major: f64,
    confused: bool,
    confusion_level: f64,
    last_stable_time: u64,
    base_volume: f64,
    latest_pitch: f64,
}

impl PitchDetector {
    pub fn new(config: PitchDetectorConfig) -> Self {
        let note_frequencies = Self::create_note_frequencies(A4_FREQUENCY);
        let note_id_to_frame = Self::build_note_id_to_frame(&note_frequencies, config.sample_rate);
        let freq_count = note_frequencies.len();

        Self {
            config,
            note_frequencies,
            note_id_to_frame,
            smoothed_buffer: Vec::new(),
            ac_results: vec![0.0; freq_count],
            diff_func: Vec::new(),
            cmndf: Vec::new(),
            frequency_history: Vec::with_capacity(MAX_HISTORY),
            smoothed_frequency: None,
            pitch_queue: Vec::with_capacity(PITCH_QUEUE_SIZE),
            pitch_major_queue: Vec::with_capacity(PITCH_MAJOR_QUEUE_SIZE),
            last_major: 0.0,
            confused: false,
            confusion_level: -1.0,
            last_stable_time: 0,
            base_volume: -1.99,
            latest_pitch: 0.0,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        if self.config.sample_rate != sample_rate {
            self.config.sample_rate = sample_rate;
            self.note_id_to_frame = Self::build_note_id_to_frame(&self.note_frequencies, sample_rate);
        }
    }

    pub fn get_sample_rate(&self) -> u32 {
        self.config.sample_rate
    }

    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.config.buffer_size = buffer_size;
    }

    pub fn set_threshold(&mut self, threshold: f32) {
        self.config.threshold = threshold.clamp(0.05, 0.5);
    }

    pub fn set_calibration_offset(&mut self, offset: f32) {
        self.config.calibration_offset = offset;
    }

    pub fn update_noise_floor(&mut self, _rms: f32) {}

    pub fn detect(&mut self, buffer: &[f32]) -> Option<PitchResult> {
        if buffer.len() < self.config.buffer_size {
            return None;
        }

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let volume_rms = Self::compute_rms(buffer);
        let volume_db_spl = Self::compute_db_spl(buffer);
        let max_amplitude = Self::compute_max_amplitude(buffer);

        let peak_volume = self.get_volume(buffer);

        if peak_volume < 0.1 || peak_volume < self.base_volume * 0.3 {
            self.frequency_history.clear();
            self.smoothed_frequency = None;
            self.pitch_queue.clear();
            self.pitch_major_queue.clear();
            self.confused = false;
            self.confusion_level = -1.0;
            return None;
        }

        let double_buffer: Vec<f64> = buffer.iter().map(|&x| x as f64).collect();

        let filtered = self.box_filter(&double_buffer, BOX_FILTER_ROUNDS);

        let pitch_result = self.get_pitch(&filtered, &double_buffer);

        let (detected_freq, ac_confidence, _) = match pitch_result {
            Some(r) => r,
            None => return None,
        };

        if detected_freq >= 99999.0 {
            return None;
        }

        let frequency = detected_freq as f32;

        if frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY {
            return None;
        }

        let closest_note_idx = self.closest_note(frequency as f64);

        let yin_probability = (1.0 - ac_confidence.clamp(0.0, 1.0)) as f32;

        if yin_probability < self.config.probability_cliff {
            return None;
        }

        let harmonic_score = if self.config.enable_harmonic_check {
            self.compute_harmonic_score(frequency as f64, &self.smoothed_buffer)
        } else {
            1.0
        };

        let temporal_consistency = self.compute_temporal_consistency(frequency);

        let overall_confidence = yin_probability * 0.5
            + harmonic_score * 0.25
            + temporal_consistency * 0.25;

        let final_frequency = self.apply_confusion_smoothing(frequency as f64, closest_note_idx);

        let final_frequency = if self.config.enable_temporal_smoothing {
            self.apply_smoothing(final_frequency)
        } else {
            final_frequency
        } as f32;

        let calibrated_final = self.apply_calibration(final_frequency);

        let (note, octave, cents) = frequency_to_note(calibrated_final);

        let clarity = yin_probability * harmonic_score;

        Some(PitchResult {
            frequency: calibrated_final,
            note,
            octave,
            cents,
            probability: yin_probability,
            clarity,
            volume_rms,
            volume_db_spl,
            max_amplitude,
            timestamp,
            is_voiced: true,
            confidence: PitchConfidence {
                yin_probability,
                harmonic_score,
                temporal_consistency,
                overall: overall_confidence,
            },
            calibration_offset: self.config.calibration_offset,
        })
    }

    fn create_note_frequencies(a4_freq: f64) -> Vec<f64> {
        let a4_index = (A4_MIDI - NOTE_START) as i32;
        let min_octave = NOTE_START / 12 - 1;
        let max_octave = 6;
        let freq_to_note_offset = NOTE_START % 12;
        let range = ((max_octave - min_octave + 1) * 12 - freq_to_note_offset + 1) as usize;

        (0..range)
            .map(|i| {
                let freq = a4_freq * 2.0_f64.powf((i as f64 - a4_index as f64) / 12.0);
                (freq * 100.0).round() / 100.0
            })
            .collect()
    }

    fn build_note_id_to_frame(note_frequencies: &[f64], sample_rate: u32) -> Vec<i32> {
        note_frequencies
            .iter()
            .map(|&freq| (sample_rate as f64 / freq + 0.5) as i32)
            .collect()
    }

    fn box_filter(&mut self, buffer: &[f64], rounds: usize) -> Vec<f64> {
        let mut current = buffer.to_vec();
        let mut window = 1;
        for _ in 0..rounds {
            current = self.smooth(&current, window);
            window <<= 1;
        }
        self.smoothed_buffer = current.clone();
        current
    }

    fn smooth(&self, buffer: &[f64], window: usize) -> Vec<f64> {
        if window == 0 || window >= buffer.len() {
            return buffer.to_vec();
        }
        let len = buffer.len();
        let mut result = Vec::with_capacity(len);
        for i in 0..len {
            if i + window < len {
                result.push((buffer[i] + buffer[i + window]) * 0.5);
            } else {
                result.push(buffer[i]);
            }
        }
        result
    }

    fn auto_correlation(&self, buffer: &[f64], frame: i32) -> f64 {
        let frame = frame as usize;
        if frame == 0 || frame >= buffer.len() {
            return 0.0;
        }
        let length = buffer.len() - frame;
        let sum: f64 = (0..length).map(|i| buffer[i] * buffer[i + frame]).sum();
        sum / length as f64
    }

    fn difference_function(&self, buffer: &[f64], frame: i32) -> f64 {
        let frame = frame as usize;
        if frame == 0 || frame >= buffer.len() {
            return 1e10;
        }
        let length = buffer.len() - frame;
        let sum: f64 = (0..length).map(|i| {
            let diff = buffer[i] - buffer[i + frame];
            diff * diff
        }).sum();
        sum / length as f64
    }

    fn get_pitch(&mut self, buffer: &[f64], raw_buffer: &[f64]) -> Option<(f64, f64, &[f64])> {
        let note_count = self.note_id_to_frame.len();
        if self.ac_results.len() < note_count {
            self.ac_results.resize(note_count, 0.0);
        }

        let half_len = buffer.len() / 2;

        let max_frame = *self.note_id_to_frame.iter().filter(|&&f| f > 0 && (f as usize) < half_len).max().unwrap_or(&0);
        if max_frame == 0 {
            return None;
        }
        let max_frame_usize = max_frame as usize;

        if self.diff_func.len() <= max_frame_usize {
            self.diff_func.resize(max_frame_usize + 1, 0.0);
        }
        if self.cmndf.len() <= max_frame_usize {
            self.cmndf.resize(max_frame_usize + 1, 1e10);
        }

        for tau in 1..=max_frame_usize {
            let length = raw_buffer.len() - tau;
            let sum: f64 = (0..length).map(|i| {
                let diff = raw_buffer[i] - raw_buffer[i + tau];
                diff * diff
            }).sum();
            self.diff_func[tau] = sum / length as f64;
        }

        if self.diff_func.len() > 1 && self.diff_func[1] < 1e-10 {
            return None;
        }

        let mut running_sum = 0.0f64;
        for tau in 1..=max_frame_usize {
            running_sum += self.diff_func[tau];
            self.cmndf[tau] = if running_sum > 1e-10 {
                self.diff_func[tau] * tau as f64 / running_sum
            } else {
                1e10
            };
        }

        let threshold = self.config.threshold as f64;

        let min_note_frame = *self.note_id_to_frame.iter()
            .filter(|&&f| f > 0)
            .min()
            .unwrap_or(&1) as usize;
        let max_note_frame = *self.note_id_to_frame.iter()
            .filter(|&&f| f > 0 && (f as usize) < raw_buffer.len() / 2)
            .max()
            .unwrap_or(&1) as usize;

        let mut first_below_tau: usize = 0;
        for tau in min_note_frame..=max_note_frame {
            if self.cmndf[tau] < threshold {
                first_below_tau = tau;
                break;
            }
        }

        let best_tau = if first_below_tau > 0 {
            let mut local_min_tau = first_below_tau;
            let mut local_min_val = self.cmndf[first_below_tau];
            let mut rising_count = 0;
            for tau in (first_below_tau + 1)..=max_note_frame {
                if self.cmndf[tau] < local_min_val {
                    local_min_val = self.cmndf[tau];
                    local_min_tau = tau;
                    rising_count = 0;
                } else {
                    rising_count += 1;
                    if self.cmndf[tau] > local_min_val * 5.0 || rising_count > 8 {
                        break;
                    }
                }
            }
            local_min_tau
        } else {
            let mut min_val: f64 = 1e10;
            let mut min_tau: usize = 0;
            for tau in min_note_frame..=max_note_frame {
                if self.cmndf[tau] < min_val {
                    min_val = self.cmndf[tau];
                    min_tau = tau;
                }
            }
            min_tau
        };

        if best_tau == 0 || self.cmndf[best_tau] > 1.0 {
            return None;
        }

        let best_freq = self.config.sample_rate as f64 / best_tau as f64;

        if best_freq > MAX_FREQUENCY as f64 || best_freq < MIN_FREQUENCY as f64 {
            return None;
        }

        for i in 0..note_count {
            let frame = self.note_id_to_frame[i] as usize;
            if frame > 0 && frame <= max_frame_usize {
                self.ac_results[i] = self.auto_correlation(raw_buffer, frame as i32);
            }
        }

        let (final_frame, _) = self.range_search_diff(raw_buffer, best_tau as i32);
        let fine_freq = self.fine_tune_diff(raw_buffer, final_frame);
        let best_cmndf = self.cmndf[best_tau];

        Some((fine_freq, best_cmndf, &self.ac_results))
    }

    fn range_search_diff(&self, buffer: &[f64], center_frame: i32) -> (i32, f64) {
        let step = if center_frame > 2080 {
            32
        } else if center_frame > 1040 {
            16
        } else if center_frame > 520 {
            8
        } else if center_frame > 260 {
            4
        } else if center_frame > 130 {
            2
        } else {
            1
        };

        let range = if center_frame > 33 { 4 } else { 2 };

        let mut best_frame = center_frame;
        let mut best_diff = self.difference_function(buffer, center_frame);

        let start = center_frame - range * step;
        let end = center_frame + range * step;

        for offset in (start..=end).step_by(step as usize) {
            if offset <= 0 || offset as usize >= buffer.len() {
                continue;
            }
            let diff = self.difference_function(buffer, offset);
            if diff < best_diff {
                best_diff = diff;
                best_frame = offset;
            }
        }

        (best_frame, best_diff)
    }

    fn fine_tune_diff(&self, buffer: &[f64], frame: i32) -> f64 {
        if frame <= 1 || frame as usize >= buffer.len() - 1 {
            return self.frame_to_freq(frame as f64);
        }

        let d_prev = self.difference_function(buffer, frame - 1);
        let d_curr = self.difference_function(buffer, frame);
        let d_next = self.difference_function(buffer, frame + 1);

        let denom = 2.0 * d_curr - d_prev - d_next;
        let adjustment = if denom.abs() > 1e-10 {
            let adj = (d_next - d_prev) / (2.0 * denom);
            adj.clamp(-1.0, 1.0)
        } else {
            0.0
        };

        self.frame_to_freq(frame as f64 + adjustment)
    }

    fn frame_to_freq(&self, frame: f64) -> f64 {
        if frame > 0.0 {
            self.config.sample_rate as f64 / frame
        } else {
            0.0
        }
    }

    fn closest_note(&self, frequency: f64) -> usize {
        if frequency.is_nan() {
            return self.note_frequencies.len() / 2;
        }

        let clamped = frequency
            .clamp(self.note_frequencies[0], self.note_frequencies[self.note_frequencies.len() - 1]);

        let mut best_idx = 0;
        let mut best_diff = f64::MAX;

        for (i, &note_freq) in self.note_frequencies.iter().enumerate() {
            let diff = (note_freq - clamped).abs();
            if diff < best_diff {
                best_diff = diff;
                best_idx = i;
            }
        }

        best_idx
    }

    fn get_volume(&mut self, buffer: &[f32]) -> f64 {
        let len = buffer.len();
        let check_len = if len < 1000 { len } else { 1000 };
        let step = if len < 500 { 1 } else { 2 };
        let mut peak: f64 = -1000.0;
        for i in (0..check_len).step_by(step) {
            let abs_val = buffer[i].abs() as f64;
            if abs_val > peak {
                peak = abs_val;
            }
        }
        let volume = peak * 100.0;

        if self.base_volume <= 0.0 {
            self.base_volume += 1.0;
        } else {
            let effective = volume.max(self.base_volume);
            self.base_volume = effective * VOLUME_DECAY;
        }

        volume
    }

    fn apply_confusion_smoothing(&mut self, frequency: f64, note_idx: usize) -> f64 {
        if let Some(prev) = self.smoothed_frequency {
            let ratio = frequency / prev;
            if ratio < 0.94 || ratio > 1.06 {
                self.pitch_queue.clear();
                self.pitch_major_queue.clear();
                self.confused = false;
                self.confusion_level = -1.0;
            }
        }

        self.pitch_queue.push(note_idx as i32);
        if self.pitch_queue.len() > PITCH_QUEUE_SIZE {
            self.pitch_queue.remove(0);
        }

        self.pitch_major_queue.push(note_idx as i32);
        if self.pitch_major_queue.len() > PITCH_MAJOR_QUEUE_SIZE {
            self.pitch_major_queue.remove(0);
        }

        let all_same_major = self.pitch_major_queue.iter().all(|&n| n == self.pitch_major_queue[0]);
        if all_same_major {
            self.last_major = frequency;
        }

        let unique_notes: std::collections::HashSet<i32> = self.pitch_queue.iter().copied().collect();
        let new_confused = self.confused || unique_notes.len() > 2;

        if !new_confused {
            self.last_stable_time = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
        }

        let not_confused = unique_notes.len() == 1;
        self.confused = new_confused && !not_confused;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let timeout = self.last_stable_time + CONFUSION_TTL_MILLIS < now;

        let result = if !self.confused || timeout {
            frequency
        } else {
            let ratio = frequency / self.last_major;
            if ratio > 0.94 && ratio < 1.06 {
                self.last_major
            } else {
                frequency
            }
        };

        self.latest_pitch = result;

        if self.confusion_level >= 0.0 {
            self.confusion_level = if self.confused {
                (1.0 - CONFUSION_DECAY) + self.confusion_level * CONFUSION_DECAY
            } else {
                self.confusion_level * CONFUSION_DECAY
            };
        } else if self.confused {
            self.confusion_level = 1.0;
        }

        result
    }

    fn apply_smoothing(&mut self, frequency: f64) -> f64 {
        match self.smoothed_frequency {
            Some(prev) => {
                let ratio = frequency / prev;
                let is_same_note = ratio > 0.94 && ratio < 1.06;

                if !is_same_note {
                    self.smoothed_frequency = Some(frequency);
                    return frequency;
                }

                let diff = (frequency - prev).abs();
                let threshold = frequency * SIMILAR_THRESHOLD;

                let smoothed = if diff < threshold {
                    frequency * (1.0 - SMOOTHING_RATIO) + prev * SMOOTHING_RATIO
                } else {
                    frequency * 0.5 + prev * 0.5
                };

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

    fn compute_harmonic_score(&self, frequency: f64, buffer: &[f64]) -> f32 {
        let fundamental_frame = (self.config.sample_rate as f64 / frequency) as i32;
        if fundamental_frame <= 0 || fundamental_frame as usize >= buffer.len() {
            return 0.5;
        }

        let fundamental_ac = self.auto_correlation(buffer, fundamental_frame);
        if fundamental_ac.abs() < 1e-10 {
            return 0.5;
        }

        let ac_at_zero = {
            let sum: f64 = buffer.iter().map(|&x| x * x).sum();
            sum / buffer.len() as f64
        };
        if ac_at_zero.abs() < 1e-10 {
            return 0.5;
        }

        let normalized_fundamental = (fundamental_ac / ac_at_zero).abs();

        let mut score = 0.0f32;
        let mut count = 0;

        for harmonic in [2.0f64, 3.0, 4.0, 5.0] {
            let harmonic_freq = frequency * harmonic;
            if harmonic_freq > MAX_FREQUENCY as f64 {
                break;
            }

            let harmonic_frame = (self.config.sample_rate as f64 / harmonic_freq) as i32;
            if harmonic_frame > 0 && (harmonic_frame as usize) < buffer.len() {
                let harmonic_ac = self.auto_correlation(buffer, harmonic_frame);
                let normalized_harmonic = (harmonic_ac / ac_at_zero).abs();
                let ratio = normalized_harmonic / normalized_fundamental;
                score += if ratio < 1.0 { ratio as f32 } else { 1.0 };
                count += 1;
            }
        }

        if count > 0 {
            (score / count as f32).clamp(0.0, 1.0)
        } else {
            0.5
        }
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
