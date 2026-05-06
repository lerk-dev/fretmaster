use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use crate::audio::device::{self, AudioDeviceInfo};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceChangeEvent {
    pub added: Vec<AudioDeviceInfo>,
    pub removed: Vec<String>,
    pub devices: Vec<AudioDeviceInfo>,
}

pub struct DeviceMonitor {
    running: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

impl DeviceMonitor {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            handle: None,
        }
    }

    pub fn start(&mut self, app: AppHandle, interval_ms: u64) {
        if self.running.load(Ordering::SeqCst) {
            return;
        }
        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();

        let handle = thread::Builder::new()
            .name("device-monitor".to_string())
            .spawn(move || {
                let mut last_devices: Vec<AudioDeviceInfo> = device::list_input_devices();
                
                // 启动时发送一次当前设备列表
                let _ = app.emit("audio-device-changed", DeviceChangeEvent {
                    added: last_devices.clone(),
                    removed: vec![],
                    devices: last_devices.clone(),
                });

                while running.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(interval_ms));

                    if !running.load(Ordering::SeqCst) {
                        break;
                    }

                    let new_devices = device::list_input_devices();

                    let added: Vec<AudioDeviceInfo> = new_devices
                        .iter()
                        .filter(|d| !last_devices.iter().any(|ld| ld.name == d.name))
                        .cloned()
                        .collect();

                    let removed: Vec<String> = last_devices
                        .iter()
                        .filter(|d| !new_devices.iter().any(|nd| nd.name == d.name))
                        .map(|d| d.name.clone())
                        .collect();

                    if !added.is_empty() || !removed.is_empty() {
                        log::info!(
                            "Device change detected: +{} -{}",
                            added.len(),
                            removed.len()
                        );
                        let _ = app.emit("audio-device-changed", DeviceChangeEvent {
                            added,
                            removed,
                            devices: new_devices.clone(),
                        });
                    }

                    last_devices = new_devices;
                }
            })
            .expect("Failed to spawn device monitor thread");

        self.handle = Some(handle);
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

impl Default for DeviceMonitor {
    fn default() -> Self {
        Self::new()
    }
}
