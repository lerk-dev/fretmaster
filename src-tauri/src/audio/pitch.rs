use rustfft::{FftPlanner, FftDirection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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
}

#[derive(Debug, Clone)]
pub struct PitchDetectorConfig {
    pub threshold: f32,
    pub probability_cliff: f32,
    pub sample_rate: u32,
    pub buffer_size: usize,
}

impl Default for PitchDetectorConfig {
    fn default() -> Self {
        Self {
            threshold: 0.20,
            probability_cliff: 0.1,
            sample_rate: 48000,
            buffer_size: 2048,
        }
    }
}

pub struct FFTYinAnalyser {
    sample_rate: u32,
    buffer_size: usize,
    half_size: usize,
    yin_buffer: Vec<f32>,
    audio_buffer_fft: Vec<f32>,
    kernel: Vec<f32>,
    yin_style_acf: Vec<f32>,
    threshold: f32,
    fft_planner: FftPlanner<f32>,
    fft_size: usize,
}

impl FFTYinAnalyser {
    pub fn new(sample_rate: u32, buffer_size: usize) -> Self {
        let half_size = buffer_size / 2;
        let fft_size = buffer_size;
        
        Self {
            sample_rate,
            buffer_size,
            half_size,
            yin_buffer: vec![0.0; half_size],
            audio_buffer_fft: vec![0.0; fft_size * 2],
            kernel: vec![0.0; fft_size * 2],
            yin_style_acf: vec![0.0; half_size],
            threshold: 0.20,
            fft_planner: FftPlanner::new(),
            fft_size,
        }
    }
    
    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.sample_rate = sample_rate;
    }
    
    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate
    }
    
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.buffer_size = buffer_size;
        self.half_size = buffer_size / 2;
        self.fft_size = buffer_size;
        self.yin_buffer.resize(self.half_size, 0.0);
        self.audio_buffer_fft.resize(self.fft_size * 2, 0.0);
        self.kernel.resize(self.fft_size * 2, 0.0);
        self.yin_style_acf.resize(self.half_size, 0.0);
    }
    
    pub fn analyze(&mut self, buffer: &[f32]) -> Option<PitchResult> {
        if buffer.len() < self.buffer_size {
            return None;
        }
        
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        
        let volume_rms = self.calculate_rms(buffer);
        let volume_db_spl = self.calculate_db_spl(buffer);
        let max_amplitude = self.calculate_max_amplitude(buffer);
        
        self.difference_fft(buffer);
        self.cumulative_mean_normalized_difference();
        
        let tau = self.absolute_threshold()?;
        let better_tau = self.parabolic_interpolation(tau);
        
        let frequency = self.sample_rate as f32 / better_tau;
        
        if frequency < 60.0 || frequency > 2000.0 {
            return None;
        }
        
        let probability = 1.0 - self.yin_buffer[tau];
        
        if probability < 0.1 {
            return None;
        }
        
        let (note, octave, cents) = frequency_to_note(frequency);
        let clarity = probability;
        
        Some(PitchResult {
            frequency,
            note,
            octave,
            cents,
            probability,
            clarity,
            volume_rms,
            volume_db_spl,
            max_amplitude,
            timestamp,
        })
    }
    
    fn difference_fft(&mut self, buffer: &[f32]) {
        let half_size = self.half_size;
        
        for i in 0..half_size {
            let val = buffer[i] * buffer[i];
            self.kernel[i * 2] = val;
            self.kernel[i * 2 + 1] = 0.0;
        }
        
        for i in 0..self.buffer_size {
            self.audio_buffer_fft[i * 2] = buffer[i];
            self.audio_buffer_fft[i * 2 + 1] = 0.0;
        }
        
        let fft = self.fft_planner.plan_fft_forward(self.fft_size);
        let mut kernel_fft = self.kernel.clone();
        let mut audio_fft = self.audio_buffer_fft.clone();
        
        fft.process(&mut kernel_fft);
        fft.process(&mut audio_fft);
        
        for i in 0..self.fft_size {
            let kr = kernel_fft[i * 2];
            let ki = kernel_fft[i * 2 + 1];
            let ar = audio_fft[i * 2];
            let ai = audio_fft[i * 2 + 1];
            
            let real = kr * ar - ki * ai;
            let imag = kr * ai + ki * ar;
            
            self.kernel[i * 2] = real;
            self.kernel[i * 2 + 1] = imag;
        }
        
        let ifft = self.fft_planner.plan_fft_inverse(self.fft_size);
        ifft.process(&mut self.kernel);
        
        let scale = 1.0 / self.fft_size as f32;
        
        self.yin_buffer[0] = 0.0;
        for tau in 1..half_size {
            let mut sum = 0.0f32;
            for j in 0..half_size {
                let delta = buffer[j] - buffer[j + tau];
                sum += delta * delta;
            }
            self.yin_buffer[tau] = sum;
        }
    }
    
    fn cumulative_mean_normalized_difference(&mut self) {
        let mut running_sum = 0.0f32;
        
        for tau in 1..self.half_size {
            running_sum += self.yin_buffer[tau];
            self.yin_style_acf[tau] = self.yin_buffer[tau] * tau as f32 / running_sum;
            self.yin_buffer[tau] = self.yin_style_acf[tau];
        }
    }
    
    fn absolute_threshold(&self) -> Option<usize> {
        let threshold = self.threshold;
        
        for tau in 2..self.half_size {
            if self.yin_buffer[tau] < threshold {
                let mut best_tau = tau;
                while best_tau + 1 < self.half_size 
                    && self.yin_buffer[best_tau + 1] < self.yin_buffer[best_tau] 
                {
                    best_tau += 1;
                }
                return Some(best_tau);
            }
        }
        
        let min_tau = (2..self.half_size)
            .min_by(|&a, &b| self.yin_buffer[a].partial_cmp(&self.yin_buffer[b]).unwrap())?;
        
        if self.yin_buffer[min_tau] < 0.5 {
            Some(min_tau)
        } else {
            None
        }
    }
    
    fn parabolic_interpolation(&self, tau: usize) -> f32 {
        if tau == 0 || tau >= self.yin_buffer.len() - 1 {
            return tau as f32;
        }
        
        let s0 = self.yin_buffer[tau - 1];
        let s1 = self.yin_buffer[tau];
        let s2 = self.yin_buffer[tau + 1];
        
        let adjustment = (s2 - s0) / (2.0 * (2.0 * s1 - s2 - s0));
        
        if adjustment.is_finite() {
            tau as f32 + adjustment
        } else {
            tau as f32
        }
    }
    
    fn calculate_rms(&self, buffer: &[f32]) -> f64 {
        let sum: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum();
        (sum / buffer.len() as f64).sqrt()
    }
    
    fn calculate_db_spl(&self, buffer: &[f32]) -> f64 {
        let sum: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum();
        let rms = (sum / buffer.len() as f64).sqrt();
        
        if rms > 0.0 {
            20.0 * rms.log10() + 94.0
        } else {
            -96.0
        }
    }
    
    fn calculate_max_amplitude(&self, buffer: &[f32]) -> f32 {
        buffer.iter().map(|&x| x.abs()).fold(0.0f32, f32::max)
    }
}

pub struct PitchDetector {
    config: PitchDetectorConfig,
    analyser: FFTYinAnalyser,
}

impl PitchDetector {
    pub fn new(config: PitchDetectorConfig) -> Self {
        let analyser = FFTYinAnalyser::new(config.sample_rate, config.buffer_size);
        Self { config, analyser }
    }
    
    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.config.sample_rate = sample_rate;
        self.analyser.set_sample_rate(sample_rate);
    }
    
    pub fn get_sample_rate(&self) -> u32 {
        self.config.sample_rate
    }
    
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.config.buffer_size = buffer_size;
        self.analyser.set_buffer_size(buffer_size);
    }
    
    pub fn detect(&mut self, buffer: &[f32]) -> Option<PitchResult> {
        self.analyser.analyze(buffer)
    }
}

impl Default for PitchDetector {
    fn default() -> Self {
        Self::new(PitchDetectorConfig::default())
    }
}

fn frequency_to_note(frequency: f32) -> (String, i32, f32) {
    let note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
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

pub struct SOLOYinAnalyser {
    sample_rate: u32,
    buffer_size: usize,
    yin_buffer: Vec<f32>,
    yin_style_acf: Vec<f32>,
    threshold: f32,
    audio_buffer_fft: Vec<f32>,
    kernel: Vec<f32>,
    fft_size: usize,
}

impl SOLOYinAnalyser {
    pub fn new(sample_rate: u32, buffer_size: usize) -> Self {
        let half_size = buffer_size / 2;
        let fft_size = buffer_size;
        Self {
            sample_rate,
            buffer_size,
            yin_buffer: vec![0.0; half_size],
            yin_style_acf: vec![0.0; half_size],
            threshold: 0.20,
            audio_buffer_fft: vec![0.0; fft_size * 2],
            kernel: vec![0.0; fft_size * 2],
            fft_size,
        }
    }
    
    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.sample_rate = sample_rate;
    }
    
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.buffer_size = buffer_size;
        let half_size = buffer_size / 2;
        self.fft_size = buffer_size;
        self.yin_buffer.resize(half_size, 0.0);
        self.yin_style_acf.resize(half_size, 0.0);
        self.audio_buffer_fft.resize(self.fft_size * 2, 0.0);
        self.kernel.resize(self.fft_size * 2, 0.0);
    }
    
    pub fn analyze(&mut self, buffer: &[f32]) -> Option<PitchResult> {
        if buffer.len() < self.buffer_size {
            return None;
        }
        
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        
        let volume_rms = self.calculate_rms(buffer);
        let volume_db_spl = self.calculate_db_spl(buffer);
        let max_amplitude = self.calculate_max_amplitude(buffer);
        
        let half_size = self.buffer_size / 2;
        
        self.compute_yin_style_acf(buffer, half_size);
        
        let tau = self.find_fundamental(half_size)?;
        let better_tau = self.parabolic_interpolation(tau);
        
        let frequency = self.sample_rate as f32 / better_tau;
        
        if frequency < 60.0 || frequency > 2000.0 {
            return None;
        }
        
        let tau_idx = tau.min(self.yin_buffer.len() - 1);
        let probability = 1.0 - self.yin_buffer[tau_idx];
        
        if probability < 0.1 {
            return None;
        }
        
        let (note, octave, cents) = frequency_to_note(frequency);
        
        Some(PitchResult {
            frequency,
            note,
            octave,
            cents,
            probability,
            clarity: probability,
            volume_rms,
            volume_db_spl,
            max_amplitude,
            timestamp,
        })
    }
    
    fn compute_yin_style_acf(&mut self, buffer: &[f32], half_size: usize) {
        for tau in 0..half_size {
            let mut sum = 0.0f32;
            for j in 0..half_size {
                let diff = buffer[j] - buffer[j + tau];
                sum += diff * diff;
            }
            self.yin_buffer[tau] = sum;
        }
        
        let mut cum_sum = 0.0f32;
        for tau in 1..half_size {
            cum_sum += self.yin_buffer[tau];
            self.yin_style_acf[tau] = self.yin_buffer[tau] * tau as f32 / cum_sum;
            self.yin_buffer[tau] = self.yin_style_acf[tau];
        }
    }
    
    fn find_fundamental(&self, half_size: usize) -> Option<usize> {
        for tau in 2..half_size {
            if self.yin_style_acf[tau] < self.threshold {
                let mut best_tau = tau;
                while best_tau + 1 < half_size 
                    && self.yin_style_acf[best_tau + 1] < self.yin_style_acf[best_tau] 
                {
                    best_tau += 1;
                }
                
                return Some(best_tau);
            }
        }
        None
    }
    
    fn parabolic_interpolation(&self, tau: usize) -> f32 {
        if tau == 0 || tau >= self.yin_style_acf.len() - 1 {
            return tau as f32;
        }
        
        let s0 = self.yin_style_acf[tau - 1];
        let s1 = self.yin_style_acf[tau];
        let s2 = self.yin_style_acf[tau + 1];
        
        let adjustment = (s2 - s0) / (2.0 * (2.0 * s1 - s2 - s0));
        
        if adjustment.is_finite() {
            tau as f32 + adjustment
        } else {
            tau as f32
        }
    }
    
    fn calculate_rms(&self, buffer: &[f32]) -> f64 {
        let sum: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum();
        (sum / buffer.len() as f64).sqrt()
    }
    
    fn calculate_db_spl(&self, buffer: &[f32]) -> f64 {
        let sum: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum();
        let rms = (sum / buffer.len() as f64).sqrt();
        
        if rms > 0.0 {
            20.0 * rms.log10() + 94.0
        } else {
            -96.0
        }
    }
    
    fn calculate_max_amplitude(&self, buffer: &[f32]) -> f32 {
        buffer.iter().map(|&x| x.abs()).fold(0.0f32, f32::max)
    }
}
