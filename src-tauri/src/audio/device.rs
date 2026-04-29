use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub name: String,
    pub is_default: bool,
    pub channels: u16,
    pub sample_rate: u32,
}

pub fn list_input_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let default_device = host.default_input_device();
    let default_name = default_device.as_ref().and_then(|d| d.name().ok());
    
    let mut devices = Vec::new();
    
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices.flatten() {
            let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
            let is_default = default_name.as_ref().map(|n| n == &name).unwrap_or(false);
            
            let (channels, sample_rate) = device
                .default_input_config()
                .map(|config| (config.channels, config.sample_rate.0))
                .unwrap_or((1, 48000));
            
            devices.push(AudioDeviceInfo {
                name,
                is_default,
                channels,
                sample_rate,
            });
        }
    }
    
    devices
}

pub fn get_default_input_device() -> Option<AudioDeviceInfo> {
    let host = cpal::default_host();
    let device = host.default_input_device()?;
    let name = device.name().ok()?;
    
    let (channels, sample_rate) = device
        .default_input_config()
        .map(|config| (config.channels, config.sample_rate.0))
        .unwrap_or((1, 48000));
    
    Some(AudioDeviceInfo {
        name,
        is_default: true,
        channels,
        sample_rate,
    })
}
