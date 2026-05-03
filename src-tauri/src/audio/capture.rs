use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::sync::Arc;
use anyhow::Result;

const MIN_BUFFER_SIZE: usize = 1024;
const MAX_BUFFER_SIZE: usize = 8192;
const DEFAULT_BUFFER_SIZE: usize = 4096;
const RING_BUFFER_CAPACITY: usize = 16384;

struct StreamHolder {
    stream: Option<cpal::Stream>,
}

unsafe impl Send for StreamHolder {}
unsafe impl Sync for StreamHolder {}

struct RingBuffer {
    data: Vec<f32>,
    write_pos: usize,
    len: usize,
    capacity: usize,
}

impl RingBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            data: vec![0.0; capacity],
            write_pos: 0,
            len: 0,
            capacity,
        }
    }

    fn write(&mut self, samples: &[f32]) {
        for &sample in samples {
            self.data[self.write_pos] = sample;
            self.write_pos = (self.write_pos + 1) % self.capacity;
            if self.len < self.capacity {
                self.len += 1;
            }
        }
    }

    fn write_with_gain(&mut self, samples: &[f32], gain: f32) {
        for &sample in samples {
            self.data[self.write_pos] = sample * gain;
            self.write_pos = (self.write_pos + 1) % self.capacity;
            if self.len < self.capacity {
                self.len += 1;
            }
        }
    }

    fn len(&self) -> usize {
        self.len
    }

    fn read_latest(&self, count: usize) -> Vec<f32> {
        let read_count = count.min(self.len);
        if read_count == 0 {
            return Vec::new();
        }
        let mut result = Vec::with_capacity(read_count);
        let start = if self.len >= count {
            (self.write_pos + self.capacity - count) % self.capacity
        } else {
            (self.write_pos + self.capacity - self.len) % self.capacity
        };
        for i in 0..read_count {
            let idx = (start + i) % self.capacity;
            result.push(self.data[idx]);
        }
        result
    }

    fn clear(&mut self) {
        self.write_pos = 0;
        self.len = 0;
    }
}

pub struct AudioCapture {
    stream: Arc<Mutex<StreamHolder>>,
    sample_rate: u32,
    ring: Arc<Mutex<RingBuffer>>,
    is_capturing: Arc<Mutex<bool>>,
    device_name: Option<String>,
    target_sample_rate: Option<u32>,
    buffer_size: usize,
    latency_ms: f32,
    calibration_offset: f32,
    gain: f32,
}

impl AudioCapture {
    pub fn new() -> Self {
        Self {
            stream: Arc::new(Mutex::new(StreamHolder { stream: None })),
            sample_rate: 48000,
            ring: Arc::new(Mutex::new(RingBuffer::new(RING_BUFFER_CAPACITY))),
            is_capturing: Arc::new(Mutex::new(false)),
            device_name: None,
            target_sample_rate: None,
            buffer_size: DEFAULT_BUFFER_SIZE,
            latency_ms: 0.0,
            calibration_offset: 0.0,
            gain: 1.0,
        }
    }

    pub fn start(&mut self, device_name: Option<String>) -> Result<()> {
        self.start_with_sample_rate(device_name, None)
    }

    pub fn start_with_sample_rate(&mut self, device_name: Option<String>, target_sample_rate: Option<u32>) -> Result<()> {
        let host = cpal::default_host();

        let device = if let Some(ref name) = device_name {
            host.input_devices()?
                .find(|d| d.name().as_ref().map(|n| n == name).unwrap_or(false))
                .ok_or_else(|| anyhow::anyhow!("Device not found: {}", name))?
        } else {
            host.default_input_device()
                .ok_or_else(|| anyhow::anyhow!("No default input device found"))?
        };

        let supported_config = device.default_input_config()?;
        let default_channels = supported_config.channels();
        let default_sample_rate = supported_config.sample_rate().0;

        let sample_rate = if let Some(target_sr) = target_sample_rate {
            let supported = device.supported_input_configs()?
                .any(|c| {
                    let min = c.min_sample_rate().0;
                    let max = c.max_sample_rate().0;
                    target_sr >= min && target_sr <= max
                });
            if supported { target_sr } else {
                log::warn!("Target sample rate {} not supported, using default {}", target_sr, default_sample_rate);
                default_sample_rate
            }
        } else {
            default_sample_rate
        };

        self.sample_rate = sample_rate;
        self.target_sample_rate = target_sample_rate;

        let optimal_buffer_size = self.calculate_optimal_buffer_size(sample_rate);

        let config = cpal::StreamConfig {
            channels: default_channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        self.buffer_size = optimal_buffer_size;
        self.latency_ms = (optimal_buffer_size as f32 / sample_rate as f32) * 1000.0;

        let ring_clone = self.ring.clone();
        let is_capturing_clone = self.is_capturing.clone();
        let gain = self.gain;
        let channels = default_channels;

        *self.is_capturing.lock() = true;

        let stream = device.build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !*is_capturing_clone.lock() {
                    return;
                }
                let mut ring = ring_clone.lock();
                if channels > 1 {
                    let mono: Vec<f32> = data.chunks(channels as usize)
                        .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                        .collect();
                    if gain != 1.0 {
                        ring.write_with_gain(&mono, gain);
                    } else {
                        ring.write(&mono);
                    }
                } else {
                    if gain != 1.0 {
                        ring.write_with_gain(data, gain);
                    } else {
                        ring.write(data);
                    }
                }
            },
            |err| {
                log::error!("Audio stream error: {}", err);
            },
            None,
        )?;

        stream.play()?;
        self.stream.lock().stream = Some(stream);
        self.device_name = device_name;

        log::info!(
            "Audio capture started: sample_rate={}, channels={}, buffer_size={}, latency={:.1}ms",
            self.sample_rate, default_channels, self.buffer_size, self.latency_ms
        );
        Ok(())
    }

    fn calculate_optimal_buffer_size(&self, sample_rate: u32) -> usize {
        let target_latency_ms = 10.0;
        let ideal_size = (sample_rate as f32 * target_latency_ms / 1000.0) as usize;
        let power_of_2 = ideal_size.next_power_of_two();
        power_of_2.clamp(MIN_BUFFER_SIZE, MAX_BUFFER_SIZE)
    }

    pub fn stop(&mut self) {
        *self.is_capturing.lock() = false;
        self.stream.lock().stream = None;
        self.ring.lock().clear();
        self.device_name = None;
        self.target_sample_rate = None;
        log::info!("Audio capture stopped");
    }

    pub fn get_latest_samples(&self, count: usize) -> Vec<f32> {
        self.ring.lock().read_latest(count)
    }

    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn is_capturing(&self) -> bool {
        *self.is_capturing.lock()
    }

    pub fn get_device_name(&self) -> Option<&str> {
        self.device_name.as_deref()
    }

    pub fn clear_buffer(&self) {
        self.ring.lock().clear();
    }

    pub fn get_buffer_size(&self) -> usize {
        self.ring.lock().len()
    }

    pub fn get_buffer_frame_size(&self) -> usize {
        self.buffer_size
    }

    pub fn get_latency_ms(&self) -> f32 {
        self.latency_ms
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) -> Result<()> {
        if self.is_capturing() {
            let device_name = self.device_name.clone();
            self.stop();
            self.start_with_sample_rate(device_name, Some(sample_rate))?;
        } else {
            self.target_sample_rate = Some(sample_rate);
        }
        Ok(())
    }

    pub fn get_supported_sample_rates(&self) -> Vec<u32> {
        let host = cpal::default_host();

        let device = if let Some(ref name) = self.device_name {
            host.input_devices().ok()
                .and_then(|mut devices| devices.find(|d| d.name().as_ref().map(|n| n == name).unwrap_or(false)))
        } else {
            host.default_input_device()
        };

        match device {
            Some(dev) => {
                let mut rates = std::collections::HashSet::new();
                if let Ok(configs) = dev.supported_input_configs() {
                    for config in configs {
                        rates.insert(config.min_sample_rate().0);
                        rates.insert(config.max_sample_rate().0);
                        for r in [22050u32, 44100, 48000, 96000, 192000] {
                            if r >= config.min_sample_rate().0 && r <= config.max_sample_rate().0 {
                                rates.insert(r);
                            }
                        }
                    }
                }
                let mut rates: Vec<u32> = rates.into_iter().collect();
                rates.sort();
                rates
            }
            None => vec![44100, 48000, 96000]
        }
    }

    pub fn set_gain(&mut self, gain: f32) {
        self.gain = gain.max(0.0).min(10.0);
    }

    pub fn get_gain(&self) -> f32 {
        self.gain
    }

    pub fn set_calibration_offset(&mut self, offset: f32) {
        self.calibration_offset = offset;
    }

    pub fn get_calibration_offset(&self) -> f32 {
        self.calibration_offset
    }

    pub fn calibrate(&mut self, reference_frequency: f32, detected_frequency: f32) -> f32 {
        if detected_frequency > 0.0 {
            let cents_offset = 1200.0 * (reference_frequency / detected_frequency).log2();
            self.calibration_offset = cents_offset;
            log::info!("Calibration: ref={}Hz, detected={}Hz, offset={:.1}cents", reference_frequency, detected_frequency, cents_offset);
        }
        self.calibration_offset
    }

    pub fn set_buffer_size(&mut self, size: usize) -> Result<()> {
        let valid_sizes = [256usize, 512, 1024, 2048, 4096];
        if !valid_sizes.contains(&size) {
            return Err(anyhow::anyhow!("Invalid buffer size. Valid sizes: {:?}", valid_sizes));
        }

        if self.is_capturing() {
            let device_name = self.device_name.clone();
            let sample_rate = self.sample_rate;
            self.stop();
            self.buffer_size = size;
            self.start_with_sample_rate(device_name, Some(sample_rate))?;
        } else {
            self.buffer_size = size;
        }
        Ok(())
    }
}

impl Default for AudioCapture {
    fn default() -> Self {
        Self::new()
    }
}
