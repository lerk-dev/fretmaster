//! WASAPI 独占模式采集（Windows，默认采集设备）。
//!
//! cpal 0.15 只暴露 WASAPI 共享模式，无法进一步降低延迟。本模块直接用
//! COM 调用 IAudioClient 的 AUDCLNT_SHAREMODE_EXCLUSIVE，绕过共享混音与
//! 系统重采样，获得更低的采集延迟。
//!
//! 实现说明：
//! - windows-sys 并未为所有 WASAPI 接口生成 `Iface_Method` 形式的辅助函数，
//!   因此这里统一通过接口 vtable 调用，只依赖 GUID / 常量，不依赖生成符号。
//! - COM 接口不具备 Send，所有 WASAPI 调用都在专用线程内完成，
//!   初始化结果（实际采样率/通道数）通过 mpsc 回传给调用方。
//! - 当前面向系统默认采集设备（独占模式本就是"整块设备独占"的语义）。

#![cfg(target_os = "windows")]

use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use windows_sys::core::GUID;
use windows_sys::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
};

// ==================== GUID ====================
const CLSID_MMDEVICE_ENUMERATOR: GUID = GUID::from_u128(0xBCDE0395_E52F_467C_8E3D_C4579291692E);
const IID_IMMDEVICE_ENUMERATOR: GUID = GUID::from_u128(0xA95664D2_9614_4F35_A746_DE8DB63617E6);
const IID_IAUDIO_CLIENT: GUID = GUID::from_u128(0x1CB9AD4C_DBFA_4C32_B178_C2F568A703B2);
const IID_IAUDIO_CAPTURE_CLIENT: GUID = GUID::from_u128(0xC8ADBD64_E71E_48A0_A4DE_185C395CD317);

// ==================== 常量 ====================
const CLSCTX_ALL: u32 = 23;
const COINIT_MULTITHREADED: u32 = 0;
const E_CAPTURE: i32 = 1;
const E_CONSOLE: i32 = 0;
const AUDCLNT_SHAREMODE_EXCLUSIVE: i32 = 1;
const AUDCLNT_BUFFERFLAGS_SILENT: u32 = 0x2;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 0x0003;
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;

// vtable 槽位（IUnknown 占 0..=2）
const SLOT_RELEASE: usize = 2;
const SLOT_ENUM_GET_DEFAULT_ENDPOINT: usize = 4; // IMMDeviceEnumerator
const SLOT_DEVICE_ACTIVATE: usize = 3; // IMMDevice
const SLOT_CLIENT_INITIALIZE: usize = 3; // IAudioClient
const SLOT_CLIENT_GET_BUFFER_SIZE: usize = 4; // IAudioClient
const SLOT_CLIENT_IS_FORMAT_SUPPORTED: usize = 7; // IAudioClient
const SLOT_CLIENT_GET_MIX_FORMAT: usize = 8; // IAudioClient
const SLOT_CLIENT_START: usize = 10; // IAudioClient
const SLOT_CLIENT_STOP: usize = 11; // IAudioClient
const SLOT_CLIENT_GET_SERVICE: usize = 14; // IAudioClient
const SLOT_CAPTURE_GET_BUFFER: usize = 3; // IAudioCaptureClient
const SLOT_CAPTURE_RELEASE_BUFFER: usize = 4; // IAudioCaptureClient

/// 独占模式缓冲区时长的**默认值**（100ns 单位，= 100ms）。
/// 设置里指定了缓冲区帧数时，会按帧数 ÷ 采样率换算覆盖此值。
const BUFFER_DURATION_100NS: i64 = 1_000_000;

#[repr(C)]
#[derive(Clone, Copy)]
struct WaveFormatEx {
    format_tag: u16,
    channels: u16,
    samples_per_sec: u32,
    avg_bytes_per_sec: u32,
    block_align: u16,
    bits_per_sample: u16,
    cb_size: u16,
}

// ==================== vtable 调用助手 ====================

unsafe fn vtbl_slot<T>(this: *mut c_void, slot: usize) -> T {
    let vtbl = *(this as *mut *const usize);
    std::mem::transmute_copy::<usize, T>(&*vtbl.add(slot))
}

unsafe fn com_release(this: *mut c_void) {
    if this.is_null() {
        return;
    }
    let release: unsafe extern "system" fn(*mut c_void) -> u32 = vtbl_slot(this, SLOT_RELEASE);
    release(this);
}

// ==================== 对外接口 ====================

pub struct WasapiExclusiveCapture {
    running: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl WasapiExclusiveCapture {
    /// 启动独占采集，返回 (句柄, 实际采样率, 通道数)。
    ///
    /// `buffer_size_frames`：设置里的缓冲区帧数。独占模式据此换算缓冲时长
    /// （帧数 ÷ 协商后采样率），下限 10ms、上限 500ms；None 或 0 时用默认 100ms。
    pub(crate) fn start(
        ring: Arc<Mutex<crate::audio::capture::RingBuffer>>,
        buffer_size_frames: Option<usize>,
    ) -> Result<(Self, u32, u16, u32)> {
        let running = Arc::new(AtomicBool::new(true));
        let running_thread = running.clone();
        let (tx, rx) = mpsc::channel::<Result<(u32, u16, u32), String>>();

        let handle = std::thread::Builder::new()
            .name("wasapi-exclusive".into())
            .spawn(move || {
                if let Err(e) = run_capture_loop(ring, running_thread.clone(), &tx, buffer_size_frames) {
                    let _ = tx.send(Err(e.to_string()));
                    log::error!("WASAPI 独占采集线程退出: {}", e);
                }
                running_thread.store(false, Ordering::SeqCst);
            })
            .map_err(|e| anyhow!("无法创建 WASAPI 采集线程: {}", e))?;

        match rx.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(Ok((sr, ch, frames))) => Ok((
                Self {
                    running,
                    thread: Some(handle),
                },
                sr,
                ch,
                frames,
            )),
            Ok(Err(msg)) => Err(anyhow!(msg)),
            Err(_) => Err(anyhow!("WASAPI 独占模式初始化超时")),
        }
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(h) = self.thread.take() {
            let _ = h.join();
        }
    }
}

impl Drop for WasapiExclusiveCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

// ==================== 采集线程 ====================

fn run_capture_loop(
    ring: Arc<Mutex<crate::audio::capture::RingBuffer>>,
    running: Arc<AtomicBool>,
    tx: &mpsc::Sender<Result<(u32, u16, u32), String>>,
    buffer_size_frames: Option<usize>,
) -> Result<()> {
    unsafe {
        let hr = CoInitializeEx(std::ptr::null(), COINIT_MULTITHREADED);
        // RPC_E_CHANGED_MODE(0x80010106)：线程已处于其它套间模式，仍可继续
        if hr < 0 && hr != 0x80010106u32 as i32 {
            return Err(anyhow!("CoInitializeEx 失败: 0x{:08X}", hr));
        }
        let _com_guard = ComGuard;

        // 1) 设备枚举器
        let mut enumerator: *mut c_void = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &CLSID_MMDEVICE_ENUMERATOR,
            std::ptr::null_mut(),
            CLSCTX_ALL,
            &IID_IMMDEVICE_ENUMERATOR,
            &mut enumerator,
        );
        if hr < 0 || enumerator.is_null() {
            return Err(anyhow!("创建 MMDeviceEnumerator 失败: 0x{:08X}", hr));
        }
        let _enumerator_guard = ComPtr(enumerator);

        // 2) 默认采集端点
        let mut device: *mut c_void = std::ptr::null_mut();
        let get_default: unsafe extern "system" fn(*mut c_void, i32, i32, *mut *mut c_void) -> i32 =
            vtbl_slot(enumerator, SLOT_ENUM_GET_DEFAULT_ENDPOINT);
        let hr = get_default(enumerator, E_CAPTURE, E_CONSOLE, &mut device);
        if hr < 0 || device.is_null() {
            return Err(anyhow!("获取默认采集设备失败: 0x{:08X}", hr));
        }
        let _device_guard = ComPtr(device);

        // 3) 激活 IAudioClient
        let mut audio_client: *mut c_void = std::ptr::null_mut();
        let activate: unsafe extern "system" fn(
            *mut c_void,
            *const GUID,
            u32,
            *const c_void,
            *mut *mut c_void,
        ) -> i32 = vtbl_slot(device, SLOT_DEVICE_ACTIVATE);
        let hr = activate(
            device,
            &IID_IAUDIO_CLIENT,
            CLSCTX_ALL,
            std::ptr::null(),
            &mut audio_client,
        );
        if hr < 0 || audio_client.is_null() {
            return Err(anyhow!("激活 IAudioClient 失败: 0x{:08X}", hr));
        }
        let _client_guard = ComPtr(audio_client);

        // 4) 设备混音格式 + 独占格式协商
        //    独占模式下设备往往不接受系统混音格式，必须先 IsFormatSupported，
        //    不支持时改用其返回的 closest match，否则 Initialize 会直接失败。
        let mut mix_format: *mut WaveFormatEx = std::ptr::null_mut();
        let get_mix_format: unsafe extern "system" fn(*mut c_void, *mut *mut WaveFormatEx) -> i32 =
            vtbl_slot(audio_client, SLOT_CLIENT_GET_MIX_FORMAT);
        let hr = get_mix_format(audio_client, &mut mix_format);
        if hr < 0 || mix_format.is_null() {
            return Err(anyhow!("GetMixFormat 失败: 0x{:08X}", hr));
        }

        let is_format_supported: unsafe extern "system" fn(
            *mut c_void,
            i32,
            *const WaveFormatEx,
            *mut *mut WaveFormatEx,
        ) -> i32 = vtbl_slot(audio_client, SLOT_CLIENT_IS_FORMAT_SUPPORTED);
        let mut closest: *mut WaveFormatEx = std::ptr::null_mut();
        let hres = is_format_supported(
            audio_client,
            AUDCLNT_SHAREMODE_EXCLUSIVE,
            mix_format,
            &mut closest,
        );

        // S_OK(0)：混音格式可直接用于独占；S_FALSE(1)：需改用 closest match。
        let format_ptr: *mut WaveFormatEx = if hres == 0 {
            mix_format
        } else if hres == 1 && !closest.is_null() {
            CoTaskMemFree(mix_format as *mut c_void);
            log::info!("系统混音格式不支持独占模式，改用最接近的格式");
            closest
        } else {
            CoTaskMemFree(mix_format as *mut c_void);
            if !closest.is_null() {
                CoTaskMemFree(closest as *mut c_void);
            }
            return Err(anyhow!("设备不支持 WASAPI 独占模式格式: 0x{:08X}", hres));
        };
        let _format_guard = FormatPtr(format_ptr);

        let sample_rate = (*format_ptr).samples_per_sec;
        let channels = (*format_ptr).channels;
        let is_float =
            (*format_ptr).format_tag == WAVE_FORMAT_IEEE_FLOAT || is_extensible_float(format_ptr);

        // 5) 独占模式初始化
        // 缓冲时长与设置里的缓冲区帧数联动：帧数 ÷ 协商后采样率。
        // 独占模式的实际周期由驱动决定，这里只是请求值上限；
        // 下限 10ms（太小驱动拒绝/占满 CPU），上限 500ms（再大延迟失去意义）。
        let buffer_duration_100ns = match buffer_size_frames {
            Some(frames) if frames > 0 => {
                ((frames as i64) * 10_000_000 / sample_rate as i64)
                    .clamp(100_000, 5_000_000)
            }
            _ => BUFFER_DURATION_100NS,
        };
        let initialize: unsafe extern "system" fn(
            *mut c_void,
            i32,
            u32,
            i64,
            i64,
            *const WaveFormatEx,
            *const GUID,
        ) -> i32 = vtbl_slot(audio_client, SLOT_CLIENT_INITIALIZE);
        let hr = initialize(
            audio_client,
            AUDCLNT_SHAREMODE_EXCLUSIVE,
            0,
            buffer_duration_100ns,
            0,
            format_ptr,
            std::ptr::null(),
        );
        if hr < 0 {
            return Err(anyhow!(
                "独占模式初始化失败: 0x{:08X}（设备可能不支持该格式，或已被其它独占程序占用）",
                hr
            ));
        }

        // 5b) 设备实际分配的缓冲区帧数（用于计算真实延迟）
        let get_buffer_size: unsafe extern "system" fn(*mut c_void, *mut u32) -> i32 =
            vtbl_slot(audio_client, SLOT_CLIENT_GET_BUFFER_SIZE);
        let mut buffer_frames: u32 = 0;
        let hr = get_buffer_size(audio_client, &mut buffer_frames);
        if hr < 0 {
            log::warn!("GetBufferSize 失败: 0x{:08X}，延迟将按 0 计", hr);
        }

        // 6) 采集客户端
        let mut capture_client: *mut c_void = std::ptr::null_mut();
        let get_service: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32 =
            vtbl_slot(audio_client, SLOT_CLIENT_GET_SERVICE);
        let hr = get_service(
            audio_client,
            &IID_IAUDIO_CAPTURE_CLIENT,
            &mut capture_client,
        );
        if hr < 0 || capture_client.is_null() {
            return Err(anyhow!("获取 IAudioCaptureClient 失败: 0x{:08X}", hr));
        }
        let _capture_guard = ComPtr(capture_client);

        // 7) 启动
        let start: unsafe extern "system" fn(*mut c_void) -> i32 =
            vtbl_slot(audio_client, SLOT_CLIENT_START);
        let hr = start(audio_client);
        if hr < 0 {
            return Err(anyhow!("启动独占采集失败: 0x{:08X}", hr));
        }

        if tx.send(Ok((sample_rate, channels, buffer_frames))).is_err() {
            let stop: unsafe extern "system" fn(*mut c_void) -> i32 =
                vtbl_slot(audio_client, SLOT_CLIENT_STOP);
            let _ = stop(audio_client);
            return Ok(());
        }

        log::info!(
            "WASAPI 独占采集已启动: sample_rate={}, channels={}, buffer_frames={}, float={}",
            sample_rate,
            channels,
            buffer_frames,
            is_float
        );

        // 8) 取帧循环
        let ch = channels.max(1) as usize;
        let get_buffer: unsafe extern "system" fn(
            *mut c_void,
            *mut *mut u8,
            *mut u32,
            *mut u32,
            *mut u64,
            *mut u64,
        ) -> i32 = vtbl_slot(capture_client, SLOT_CAPTURE_GET_BUFFER);
        let release_buffer: unsafe extern "system" fn(*mut c_void, u32) -> i32 =
            vtbl_slot(capture_client, SLOT_CAPTURE_RELEASE_BUFFER);

        while running.load(Ordering::SeqCst) {
            let mut data: *mut u8 = std::ptr::null_mut();
            let mut frames: u32 = 0;
            let mut flags: u32 = 0;
            let hr = get_buffer(
                capture_client,
                &mut data,
                &mut frames,
                &mut flags,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );

            if hr < 0 || frames == 0 {
                std::thread::sleep(std::time::Duration::from_millis(2));
                continue;
            }

            if flags & AUDCLNT_BUFFERFLAGS_SILENT != 0 || data.is_null() {
                let zeros = vec![0.0f32; frames as usize * ch];
                ring.lock().write(&zeros);
            } else if is_float {
                let total = frames as usize * ch;
                let slice = std::slice::from_raw_parts(data as *const f32, total);
                write_mono(&ring, slice, ch);
            } else if (*format_ptr).bits_per_sample == 16 {
                let total = frames as usize * ch;
                let slice = std::slice::from_raw_parts(data as *const i16, total);
                let converted: Vec<f32> = slice.iter().map(|&s| s as f32 / 32768.0).collect();
                write_mono(&ring, &converted, ch);
            } else {
                log::warn!(
                    "WASAPI 独占采集遇到未支持的位深 {}，跳过该帧",
                    (*format_ptr).bits_per_sample
                );
            }

            let _ = release_buffer(capture_client, frames);
        }

        let stop: unsafe extern "system" fn(*mut c_void) -> i32 =
            vtbl_slot(audio_client, SLOT_CLIENT_STOP);
        let _ = stop(audio_client);
        log::info!("WASAPI 独占采集已停止");
        Ok(())
    }
}

/// 多声道交错样本 → 单声道，写入环形缓冲区。
fn write_mono(ring: &Arc<Mutex<crate::audio::capture::RingBuffer>>, samples: &[f32], ch: usize) {
    if ch <= 1 {
        ring.lock().write(samples);
        return;
    }
    let frames = samples.len() / ch;
    let mut mono = Vec::with_capacity(frames);
    for f in 0..frames {
        let base = f * ch;
        let mut sum = 0.0f32;
        for c in 0..ch {
            sum += samples[base + c];
        }
        mono.push(sum / ch as f32);
    }
    ring.lock().write(&mono);
}

/// WAVEFORMATEXTENSIBLE 的 SubFormat 是否为 IEEE float。
unsafe fn is_extensible_float(format_ptr: *const WaveFormatEx) -> bool {
    if (*format_ptr).format_tag != WAVE_FORMAT_EXTENSIBLE {
        return false;
    }
    let base = std::mem::size_of::<WaveFormatEx>();
    if (*format_ptr).cb_size as usize >= 22 {
        let sub_format = (format_ptr as *const u8).add(base + 6) as *const GUID;
        return ((*sub_format).data1 & 0xFFFF) == WAVE_FORMAT_IEEE_FLOAT as u32;
    }
    false
}

struct ComPtr(*mut c_void);
impl Drop for ComPtr {
    fn drop(&mut self) {
        unsafe { com_release(self.0) };
    }
}

struct FormatPtr(*mut WaveFormatEx);
impl Drop for FormatPtr {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CoTaskMemFree(self.0 as *mut c_void) };
        }
    }
}

struct ComGuard;
impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}
