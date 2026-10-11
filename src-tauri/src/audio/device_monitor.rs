use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use crate::audio::device::{self, AudioDeviceInfo};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceChangeEvent {
    pub added: Vec<AudioDeviceInfo>,
    pub removed: Vec<String>,
    pub devices: Vec<AudioDeviceInfo>,
    /// 🚨 **启动快照** 标记（默认 false，老前端不受影响）。
    ///
    /// 监控线程起步时会把「当前全部设备」当作一次事件发出去，好让前端立刻拿到列表。
    /// 但那**不是**一次真实的插入：若前端把它当 added 弹「检测到新设备」，
    /// 每次应用启动都会误报 N 个设备（N = 当前设备数）。
    /// 区分手段就是这个字段 —— 真变化恒为 false，只有启动快照才是 true。
    #[serde(default)]
    pub is_initial: bool,
}

pub struct DeviceMonitor {
    running: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
    /// 常驻模式：`.setup()` 里启动的监控不接受 `stop_device_monitor` 的停止请求。
    ///
    /// 为什么需要它：设备热插拔检测必须**与设置面板的开合解耦**（2026-10-11 实测：
    /// `WindowsAudioSettings` 挂在 Radix `SheetContent` 下，抽屉一关子树就卸载，
    /// 其 cleanup 里的 `unlistenDeviceChanges()` 会把这里也停掉 ⇒ 关掉设置后
    /// 插拔声卡永远无人察觉）。前端仍会调 stop（它并不知道自己是常驻的），
    /// 所以由 Rust 侧判定：常驻监控只允许「进程退出」结束。
    resident: bool,
}

impl DeviceMonitor {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            handle: None,
            resident: false,
        }
    }

    pub fn start(&mut self, app: AppHandle, interval_ms: u64) {
        self.start_inner(app, interval_ms, false)
    }

    /// 常驻启动（`.setup()` 用）：此后 `stop()` 不会真的停掉它。
    pub fn start_resident(&mut self, app: AppHandle, interval_ms: u64) {
        self.start_inner(app, interval_ms, true)
    }

    fn start_inner(&mut self, app: AppHandle, interval_ms: u64, resident: bool) {
        if self.running.load(Ordering::SeqCst) {
            // 已经在跑：常驻启动不降级（先来的普通启动可能已被前端 stop 掉，
            // 但那时 running=false 走不到这里）；这里只把 resident 抬上去，
            // 防止「先常驻、后普通 start」把它意外变回可停。
            if resident {
                self.resident = true;
            }
            return;
        }
        self.running.store(true, Ordering::SeqCst);
        if resident {
            self.resident = true;
        }
        let running = self.running.clone();

        let handle = thread::Builder::new()
            .name("device-monitor".to_string())
            .spawn(move || {
                let mut last_devices: Vec<AudioDeviceInfo> = device::list_input_devices();
                
                // 启动快照：`is_initial: true` 让前端知道这不是真实插入，
                // 只用来填充设备列表、不弹「检测到新设备」。
                let _ = app.emit("audio-device-changed", DeviceChangeEvent {
                    added: last_devices.clone(),
                    removed: vec![],
                    devices: last_devices.clone(),
                    is_initial: true,
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
                            is_initial: false,
                        });
                    }

                    last_devices = new_devices;
                }
            });

        match handle {
            Ok(h) => {
                self.handle = Some(h);
            }
            Err(e) => {
                log::error!("Failed to spawn device monitor thread: {}", e);
                self.running.store(false, Ordering::SeqCst);
            }
        }
    }

    pub fn stop(&mut self) {
        if self.resident {
            // 常驻监控不因前端的 stop 请求而结束 —— 见 `resident` 字段的注释。
            // 热插拔检测只在进程退出时终止。
            log::debug!("Ignoring stop_device_monitor: monitor is resident");
            return;
        }
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
