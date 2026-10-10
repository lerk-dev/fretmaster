use serde::{Deserialize, Serialize};
use cpal::traits::{HostTrait, DeviceTrait};

/// 输入设备信息（跨 Tauri 边界发给前端）。
///
/// 🚨 `rename_all = "camelCase"` **必须保留**：Tauri 只把命令的顶层参数名转 camelCase，
/// 返回值结构体字段由 serde 原样序列化 ⇒ 没有这行时线上发 `is_default`，而前端
/// `AudioDeviceInfo.isDefault` 恒 undefined，「系统默认设备」语义静默失效
/// （2026-10-10 全仓审查 P1-2）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
        for device in input_devices {
            let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
            let is_default = default_name.as_ref().map(|n| n == &name).unwrap_or(false);
            
            let (channels, sample_rate) = device
                .default_input_config()
                .map(|config| (config.channels(), config.sample_rate().0))
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
        .map(|config| (config.channels(), config.sample_rate().0))
        .unwrap_or((1, 48000));
    
    Some(AudioDeviceInfo {
        name,
        is_default: true,
        channels,
        sample_rate,
    })
}
