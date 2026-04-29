use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::sync::Arc;
use anyhow::Result;
use crate::audio::device::AudioDeviceInfo;

pub struct AudioCapture {
    stream: Option<cpal::Stream>,
    sample_rate: u32,
    buffer: Arc<Mutex<Vec<f32>>>,
    is_capturing: Arc<Mutex<bool>>,
    device_name: Option<String>,
    target_sample_rate: Option<u32>,
}

impl AudioCapture {
    pub fn new() -> Self {
        Self {
            stream: None,
            sample_rate: 48000,
            buffer: Arc::new(Mutex::new(Vec::with_capacity(8192))),
            is_capturing: Arc::new(Mutex::new(false)),
            device_name: None,
            target_sample_rate: None,
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
        
        let sample_rate = if let Some(target_sr) = target_sample_rate {
            let available_rates: Vec<u32> = device.supported_input_configs()?
                .filter_map(|c| {
                    let min = c.min_sample_rate().0;
                    let max = c.max_sample_rate().0;
                    if target_sr >= min && target_sr <= max {
                        Some(target_sr)
                    } else {
                        None
                    }
                })
                .collect();
            
            if available_rates.contains(&target_sr) {
                target_sr
            } else {
                log::warn!("Target sample rate {} not supported, using default", target_sr);
                supported_config.sample_rate.0
            }
        } else {
            supported_config.sample_rate.0
        };
        
        self.sample_rate = sample_rate;
        self.target_sample_rate = target_sample_rate;
        
        let config = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Fixed(2048),
        };
        
        let buffer_clone = self.buffer.clone();
        let is_capturing_clone = self.is_capturing.clone();
        
        *self.is_capturing.lock() = true;
        
        let stream = device.build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !*is_capturing_clone.lock() {
                    return;
                }
                
                let mut buf = buffer_clone.lock();
                buf.extend_from_slice(data);
                
                if buf.len() > 16384 {
                    let drain_count = buf.len() - 8192;
                    buf.drain(0..drain_count);
                }
            },
            |err| {
                log::error!("Audio stream error: {}", err);
            },
            None,
        )?;
        
        stream.play()?;
        self.stream = Some(stream);
        self.device_name = device_name;
        
        log::info!("Audio capture started, sample rate: {}", self.sample_rate);
        Ok(())
    }
    
    pub fn stop(&mut self) {
        *self.is_capturing.lock() = false;
        self.stream = None;
        self.buffer.lock().clear();
        self.device_name = None;
        self.target_sample_rate = None;
        log::info!("Audio capture stopped");
    }
    
    pub fn get_buffer(&self) -> Vec<f32> {
        self.buffer.lock().clone()
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
        self.buffer.lock().clear();
    }
    
    pub fn get_buffer_size(&self) -> usize {
        self.buffer.lock().len()
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
                        rates.insert(config.sample_rate().0);
                    }
                }
                let mut rates: Vec<u32> = rates.into_iter().collect();
                rates.sort();
                rates
            }
            None => vec![44100, 48000, 96000]
        }
    }
}

impl Default for AudioCapture {
    fn default() -> Self {
        Self::new()
    }
}
