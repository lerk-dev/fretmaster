use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::sync::Arc;
use anyhow::Result;

/// 前端（设置页「缓冲区大小」）从未同步过时的兜底帧数。
/// 与 `lib/store.ts` 的 `bufferSize` 默认值（2048）对齐 —— 任何路径都不该让
/// 「界面显示 2048、后端实际跑别的」再次发生（护栏见本文件单测）。
const DEFAULT_BUFFER_SIZE: usize = 2048;
const RING_BUFFER_CAPACITY: usize = 16384;

struct StreamHolder {
    stream: Option<cpal::Stream>,
}

unsafe impl Send for StreamHolder {}
unsafe impl Sync for StreamHolder {}

pub(crate) struct RingBuffer {
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

    pub(crate) fn write(&mut self, samples: &[f32]) {
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

/// 把一段**已归一化到 f32**的交错多声道样本混为单声道并写入环形缓冲区。
///
/// 抽成独立函数是刻意的：f32 便捷回调与 raw 回调（I32/I16/U16…）必须共用
/// **同一份**混音/增益/写环逻辑。若各写一份，两条路会各自漂移 ——
/// 例如只有一条处理了 gain、另一条忘了除以声道数，症状是「换个后端音量就不对」
/// 这种不报错、纯听感差异的问题。
fn write_mono_into_ring(
    ring: &Arc<Mutex<RingBuffer>>,
    data: &[f32],
    gain: f32,
    channels: u16,
) {
    let mut r = ring.lock();
    if channels > 1 {
        let mono: Vec<f32> = data
            .chunks(channels as usize)
            .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
            .collect();
        if gain != 1.0 {
            r.write_with_gain(&mono, gain);
        } else {
            r.write(&mono);
        }
    } else if gain != 1.0 {
        r.write_with_gain(data, gain);
    } else {
        r.write(data);
    }
}

/// 构造 cpal 输入回调：把多声道混为单声道后写入环形缓冲区。
/// 提取为独立函数，以便在“固定缓冲区失败 → 回退默认缓冲区”时复用同一份逻辑。
fn make_input_callback(
    ring: Arc<Mutex<RingBuffer>>,
    is_capturing: Arc<Mutex<bool>>,
    gain: f32,
    channels: u16,
) -> impl FnMut(&[f32], &cpal::InputCallbackInfo) + Send + 'static {
    move |data: &[f32], _: &cpal::InputCallbackInfo| {
        if !*is_capturing.lock() {
            return;
        }
        write_mono_into_ring(&ring, data, gain, channels);
    }
}

/// 把 I32 原始样本按 `i32::MAX` 归一化到 f32。
///
/// ASIO 后端**只**接受设备原生格式（实测 HOTONE 设备仅 I32），不接受 f32 转换
/// ⇒ 必须自己归一化。除数取 `i32::MAX`（而非 `1<<31`）是为了与 cpal 内部
/// 的 `Sample::from_sample` 一致：正样本满量程映射到恰好 1.0，避免正半轴
/// 轻微过冲被下游起音检测当作削波。
#[inline]
fn i32_to_f32(s: i32) -> f32 {
    s as f32 / i32::MAX as f32
}

/// 构造 raw 输入回调（显式样本格式）。
///
/// 🚨 存在的唯一理由：CPAL 的 **ASIO 后端不支持 f32 便捷封装**
/// （`build_input_stream(&cfg, |d: &[f32]| …)`）—— 实测在采样率、声道数
/// 都与设备能力**完全匹配**的情况下依然报
/// `The requested stream configuration is not supported by the device.`，
/// 换成 `build_input_stream_raw` + 设备原生 I32 立即成功。
/// 同机 WASAPI 用 f32 封装则正常，所以这不是设备/驱动问题，是后端能力差异。
///
/// 支持 U8/I16/I32/F32 四种（覆盖本项目可能遇到的全部后端）：
/// 非 f32 分支统一先归一化到 f32，再交给 `write_mono_into_ring`，
/// 保证混音/增益逻辑与 f32 回调**逐字相同**。
fn make_input_callback_raw(
    ring: Arc<Mutex<RingBuffer>>,
    is_capturing: Arc<Mutex<bool>>,
    gain: f32,
    channels: u16,
    format: cpal::SampleFormat,
) -> impl FnMut(&cpal::Data, &cpal::InputCallbackInfo) + Send + 'static {
    move |data: &cpal::Data, _: &cpal::InputCallbackInfo| {
        if !*is_capturing.lock() {
            return;
        }
        // 🚨 cpal 0.15 的 `Data::as_slice::<T>()` 返回 `Option<&[T]>`（格式不符时为 None）
        //    ⇒ 必须显式处理。用 `unwrap_or(&[])` 而不是 `unwrap()`：万一后端给的格式
        //    与我们声明的 format 不一致（极少见），宁可这一帧丢数据，也不要 panic
        //    把整个音频线程打死（`catch_unwind` 不在回调边界）。
        match format {
            cpal::SampleFormat::F32 => {
                let samples = data.as_slice::<f32>().unwrap_or(&[]);
                write_mono_into_ring(&ring, samples, gain, channels);
            }
            cpal::SampleFormat::I32 => {
                // ASIO 实测走这条分支
                let mono: Vec<f32> = data
                    .as_slice::<i32>()
                    .unwrap_or(&[])
                    .iter()
                    .map(|&s| i32_to_f32(s))
                    .collect();
                write_mono_into_ring(&ring, &mono, gain, channels);
            }
            cpal::SampleFormat::I16 => {
                let mono: Vec<f32> = data
                    .as_slice::<i16>()
                    .unwrap_or(&[])
                    .iter()
                    .map(|&s| s as f32 / i16::MAX as f32)
                    .collect();
                write_mono_into_ring(&ring, &mono, gain, channels);
            }
            cpal::SampleFormat::U8 => {
                // u8 是无符号偏移量：128 才是零点，必须先减偏置再归一化，
                // 否则整条波形带一个 DC 直流偏置，下游会看到恒定的"能量"。
                let mono: Vec<f32> = data
                    .as_slice::<u8>()
                    .unwrap_or(&[])
                    .iter()
                    .map(|&s| (s as f32 - 128.0) / 128.0)
                    .collect();
                write_mono_into_ring(&ring, &mono, gain, channels);
            }
            other => {
                log::error!(
                    "不支持的样本格式 {:?}，本次采集将不产生数据（请在 capture.rs 里补分支）",
                    other
                );
            }
        }
    }
}

/// 音频采集后端。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioBackend {
    /// cpal 默认后端（Windows 上为 WASAPI 共享模式）
    #[default]
    WasapiShared,
    /// Windows WASAPI 独占模式，绕过共享混音，延迟更低
    WasapiExclusive,
    /// ASIO（需以 `--features asio` 编译，且本机安装 ASIO 驱动）
    Asio,
}

impl AudioBackend {
    /// 稳定的字符串标识，供前端显示/判断回退是否发生。
    pub fn as_str(&self) -> &'static str {
        match self {
            AudioBackend::WasapiShared => "wasapi_shared",
            AudioBackend::WasapiExclusive => "wasapi_exclusive",
            AudioBackend::Asio => "asio",
        }
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
    backend: AudioBackend,
    #[cfg(target_os = "windows")]
    exclusive: Option<crate::audio::wasapi_exclusive::WasapiExclusiveCapture>,
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
            backend: AudioBackend::default(),
            #[cfg(target_os = "windows")]
            exclusive: None,
        }
    }

    pub fn start(&mut self, device_name: Option<String>) -> Result<()> {
        self.start_with_sample_rate(device_name, None)
    }

    pub fn start_with_sample_rate(&mut self, device_name: Option<String>, target_sample_rate: Option<u32>) -> Result<()> {
        self.start_with_host(cpal::default_host(), device_name, target_sample_rate)
    }

    /// 按指定后端启动采集。
    pub fn start_with_backend(
        &mut self,
        device_name: Option<String>,
        target_sample_rate: Option<u32>,
        backend: AudioBackend,
    ) -> Result<()> {
        self.backend = backend;
        match backend {
            AudioBackend::WasapiExclusive => match self.start_exclusive(device_name.clone()) {
                Ok(()) => Ok(()),
                Err(e) => {
                    // 独占失败（设备不支持 / 被占用）时回退到共享模式，保证仍有音频输入
                    log::warn!("WASAPI 独占模式启动失败（{}），回退到共享模式", e);
                    self.backend = AudioBackend::WasapiShared;
                    self.start_with_sample_rate(device_name, target_sample_rate)
                }
            },
            // ASIO 失败的形态比独占更多（未编译进 asio feature、SDK 缺失、驱动没装、
            // 设备被独占占用…），任何一种都不该让用户彻底没声音 ⇒ 与独占分支一样回退共享。
            // 前端 `windows-audio-settings.tsx` 会读 `get_audio_status` 的 backend
            // 显示「实际生效的后端」，所以回退对用户是可见的，不是静默降级。
            AudioBackend::Asio => match self.start_asio(device_name.clone(), target_sample_rate) {
                Ok(()) => Ok(()),
                Err(e) => {
                    log::warn!("ASIO 启动失败（{}），回退到 WASAPI 共享模式", e);
                    self.backend = AudioBackend::WasapiShared;
                    self.start_with_sample_rate(device_name, target_sample_rate)
                }
            },
            AudioBackend::WasapiShared => {
                self.start_with_sample_rate(device_name, target_sample_rate)
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn start_exclusive(&mut self, device_name: Option<String>) -> Result<()> {
        if device_name.is_some() {
            log::warn!(
                "WASAPI 独占模式面向系统默认采集设备，忽略指定设备 {:?}",
                device_name
            );
        }
        *self.is_capturing.lock() = true;
        // 把设置里的缓冲区帧数传给独占模式，用于换算缓冲时长（与用户 bufferSize 设置联动）
        match crate::audio::wasapi_exclusive::WasapiExclusiveCapture::start(
            self.ring.clone(),
            Some(self.buffer_size),
        ) {
            Ok((cap, sr, ch, frames)) => {
                self.sample_rate = sr;
                // 用设备实际分配的缓冲帧数计算延迟，而非设置里的默认值
                self.latency_ms = if sr > 0 {
                    (frames as f32 / sr as f32) * 1000.0
                } else {
                    0.0
                };
                self.exclusive = Some(cap);
                self.device_name = device_name;
                log::info!(
                    "Audio capture started (WASAPI exclusive): sample_rate={}, channels={}, buffer_frames={}, latency={:.1}ms",
                    sr,
                    ch,
                    frames,
                    self.latency_ms
                );
                Ok(())
            }
            Err(e) => {
                *self.is_capturing.lock() = false;
                Err(e)
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    fn start_exclusive(&mut self, _device_name: Option<String>) -> Result<()> {
        Err(anyhow::anyhow!("WASAPI 独占模式仅在 Windows 上可用"))
    }

    fn start_asio(
        &mut self,
        device_name: Option<String>,
        target_sample_rate: Option<u32>,
    ) -> Result<()> {
        #[cfg(feature = "asio")]
        {
            let host = cpal::host_from_id(cpal::HostId::Asio)
                .map_err(|e| anyhow::anyhow!("ASIO 主机不可用: {}", e))?;
            // ASIO 的设备名与 WASAPI 完全不同，前端传来的通常是 WASAPI 名称，
            // 在 ASIO host 下必然找不到。此时回退到 ASIO 默认设备，而不是直接报错。
            let name_exists = match device_name.as_ref() {
                Some(name) => host
                    .input_devices()
                    .map(|mut ds| {
                        ds.any(|d| d.name().as_ref().map(|n| n == name).unwrap_or(false))
                    })
                    .unwrap_or(false),
                None => false,
            };
            let effective = if device_name.is_some() && !name_exists {
                log::warn!(
                    "ASIO 下未找到设备 {:?}，改用 ASIO 默认设备",
                    device_name
                );
                None
            } else {
                device_name
            };
            self.start_with_host(host, effective, target_sample_rate)
        }
        #[cfg(not(feature = "asio"))]
        {
            let _ = (device_name, target_sample_rate);
            // 注意：这条 Err 不会直接呈现给用户 —— `start_with_backend` 会捕获它并
            // 回退到 WASAPI 共享模式（前端随后显示「实际生效的后端」）。
            // 因此文案写成便于排查的技术说明，而不是给终端用户的指令。
            Err(anyhow::anyhow!(
                "本次构建未启用 ASIO（需 `cargo build --features asio` + 本机 ASIO SDK / CPAL_ASIO_DIR）"
            ))
        }
    }

    fn start_with_host(&mut self, host: cpal::Host, device_name: Option<String>, target_sample_rate: Option<u32>) -> Result<()> {
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
        // 🚨 必须先取出**设备默认的原生样本格式**、而不是写死 f32。
        //    ASIO 后端只接受设备原生格式（HOTONE 实测仅 I32）⇒ 用 f32 建流必失败。
        let default_sample_format = supported_config.sample_format();

        // 在设备实际对外宣称的 (声道数, 采样率范围, 样本格式) 三元组里，
        // 选出一个**自洽**的组合。
        //
        // 旧实现的两个缺陷（都会让建流静默失败、然后被上层回退到 WASAPI 共享，
        // 用户只看到「所选后端不可用，已回退」）：
        //   1. 采样率只按「范围包含」判断，**完全忽略声道数与样本格式** ⇒
        //      可能选出 (ch=2, 44100, f32) 这种设备根本不支持的组合；
        //   2. 样本格式根本没参与选择，直接走 f32 便捷封装。
        // 现在改成：以「优先用户设定的采样率、优先设备默认声道数」为权重，
        // 在真实 ranges 里挑最贴合的那一条，并把它的格式一并带出来。
        let target_sr = target_sample_rate.unwrap_or(default_sample_rate);
        let mut best: Option<(cpal::SupportedStreamConfigRange, i32)> = None;
        for range in device.supported_input_configs()? {
            let min = range.min_sample_rate().0;
            let max = range.max_sample_rate().0;
            if target_sr < min || target_sr > max {
                continue;
            }
            // 打分：越小越好。采样率是否贴合优先，其次声道数是否等于默认声道数，
            // 最后偏好 f32（多数下游处理按 f32 设计；此处仅为相同时的偏好）。
            let mut score = 0i32;
            if target_sr != default_sample_rate {
                score += 1;
            }
            if range.channels() != default_channels {
                score += 10;
            }
            if range.sample_format() != cpal::SampleFormat::F32 {
                score += 100;
            }
            if best.as_ref().map(|(_, s)| score < *s).unwrap_or(true) {
                best = Some((range, score));
            }
        }

        // 兜底：设备没报任何 ranges（部分后端会这样）时，沿用默认配置。
        let (channels, sample_format) = match &best {
            Some((range, _)) => (range.channels(), range.sample_format()),
            None => (default_channels, default_sample_format),
        };

        let sample_rate = match &best {
            Some((range, _)) => {
                let min = range.min_sample_rate().0;
                let max = range.max_sample_rate().0;
                // 在选定 range 的区间内，优先用目标采样率；否则退到设备默认（并夹进区间）。
                if target_sr >= min && target_sr <= max {
                    target_sr
                } else {
                    default_sample_rate.clamp(min, max)
                }
            }
            None => {
                log::warn!(
                    "设备未上报任何受支持的输入配置，沿用默认 (ch={}, sr={}, fmt={:?})",
                    default_channels,
                    default_sample_rate,
                    default_sample_format
                );
                default_sample_rate
            }
        };

        if sample_rate != target_sr {
            log::warn!(
                "目标采样率 {} 不被设备支持，使用 {}（设备区间 {:?}）",
                target_sr,
                sample_rate,
                best.as_ref()
                    .map(|(r, _)| (r.min_sample_rate().0, r.max_sample_rate().0))
            );
        }

        self.sample_rate = sample_rate;
        self.target_sample_rate = target_sample_rate;

        // 起流帧数 = 用户设置（`set_buffer_size` 已校验 256..4096 后落进 self.buffer_size）。
        // 🚨 这里曾调用 `calculate_optimal_buffer_size`（「10ms 目标」自动值，48k → 1024）
        // 并把 self.buffer_size 覆盖掉 —— 设置页选什么都一样，成了装饰品；真机 example
        // `buffer_size_real_machine` 实测过「设 4096、流用 1024」。不得再引入任何换算。
        let fixed_buffer_frames = stream_buffer_frames(self.buffer_size);

        // 使用固定缓冲区大小，让用户在设置中选择的缓冲/延迟参数真正生效。
        // 原实现只把它存进字段、却始终传 BufferSize::Default，设置形同虚设。
        let config = cpal::StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Fixed(fixed_buffer_frames),
        };

        self.latency_ms = (fixed_buffer_frames as f32 / sample_rate as f32) * 1000.0;

        let ring_clone = self.ring.clone();
        let is_capturing_clone = self.is_capturing.clone();
        let gain = self.gain;

        *self.is_capturing.lock() = true;

        let err_fn = |err| log::error!("Audio stream error: {}", err);

        // 建流优先用 raw + 显式样本格式（ASIO 必需），失败再回退到 f32 便捷封装
        // （极少数后端可能拒绝 raw 路径）。两条路共享同一份混音逻辑。
        //
        // 🚨 这里刻意**不再**做「固定缓冲区失败 → BufferSize::Default」的单独一级嵌套 match，
        //    而是把全部候选并进同一张表：写成嵌套 match 会让每个失败分支都要各自回滚
        //    is_capturing，极易漏掉一处（铁律 6：失败路径必须回滚）。
        //    统一成循环后，「全部失败才回滚」只写在一处。
        let attempts: Vec<(bool, bool, &'static str)> = if sample_format == cpal::SampleFormat::F32 {
            // F32 时 raw 与便捷封装等价，没必要重复试同一件事。
            vec![(true, true, "raw(f32) + Fixed"), (true, false, "raw(f32) + Default")]
        } else {
            vec![
                (true, true, "raw + Fixed"),
                (true, false, "raw + Default"),
                // 最后兜底：少数后端可能不认 raw 路径，试一次便捷封装。
                (false, false, "f32 + Default"),
            ]
        };

        let mut built: Option<cpal::Stream> = None;
        let mut last_err: Option<String> = None;
        for (use_raw, fixed, label) in attempts {
            let attempt_config = cpal::StreamConfig {
                buffer_size: if fixed {
                    cpal::BufferSize::Fixed(fixed_buffer_frames)
                } else {
                    cpal::BufferSize::Default
                },
                ..config.clone()
            };
            let result = if use_raw {
                device.build_input_stream_raw(
                    &attempt_config,
                    sample_format,
                    make_input_callback_raw(
                        ring_clone.clone(),
                        is_capturing_clone.clone(),
                        gain,
                        channels,
                        sample_format,
                    ),
                    err_fn,
                    None,
                )
            } else {
                device.build_input_stream(
                    &attempt_config,
                    make_input_callback(
                        ring_clone.clone(),
                        is_capturing_clone.clone(),
                        gain,
                        channels,
                    ),
                    err_fn,
                    None,
                )
            };
            match result {
                Ok(s) => {
                    log::info!("输入流建立成功：{}（fmt={:?}）", label, sample_format);
                    built = Some(s);
                    break;
                }
                Err(e) => {
                    log::warn!("输入流建立失败（{}）：{}", label, e);
                    last_err = Some(e.to_string());
                }
            }
        }

        let stream = match built {
            Some(s) => s,
            None => {
                // 🚨 全部尝试失败：必须回滚标志位，否则留下「永久 true」
                // ⇒ pipeline.rs 的 `if !is_capturing()` 守卫误判为正在采集
                //   ⇒ 后续采集/检测操作全部静默空转（不报错，只是没反应）。
                *self.is_capturing.lock() = false;
                return Err(anyhow::anyhow!(
                    "无法建立输入流（ch={}, sr={}, fmt={:?}）：{}",
                    channels,
                    sample_rate,
                    sample_format,
                    last_err.unwrap_or_else(|| "未知错误".into())
                ));
            }
        };

        if let Err(e) = stream.play() {
            // 同理：play() 失败也要回滚，否则标志位泄漏。
            *self.is_capturing.lock() = false;
            return Err(anyhow::anyhow!("{}", e));
        }
        self.stream.lock().stream = Some(stream);
        self.device_name = device_name;

        log::info!(
            "Audio capture started: sample_rate={}, channels={}, fmt={:?}, buffer_size={}, latency={:.1}ms",
            self.sample_rate, channels, sample_format, self.buffer_size, self.latency_ms
        );
        Ok(())
    }

    pub fn stop(&mut self) {
        *self.is_capturing.lock() = false;
        self.stream.lock().stream = None;
        #[cfg(target_os = "windows")]
        if let Some(mut cap) = self.exclusive.take() {
            cap.stop();
        }
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

    /// 当前实际生效的后端（若独占启动失败回退，这里会反映共享模式）。
    pub fn get_backend(&self) -> AudioBackend {
        self.backend
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) -> Result<()> {
        if self.is_capturing() {
            let device_name = self.device_name.clone();
            let backend = self.backend;
            self.stop();
            // 保持当前后端：独占/ASIO 下改采样率不应被静默切回共享模式
            self.start_with_backend(device_name, Some(sample_rate), backend)?;
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
        // ⚠️ 刻意不用 `gain.clamp(0.0, 10.0)`：两者对 NaN 语义不同 ——
        //    `f32::max(NaN, 0.0)` 返回 0.0（把异常值钳成静音），而 `clamp` 会把 NaN
        //    原样传下去（下游全变 NaN）。这里是音频增益，现状更安全。
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
            let backend = self.backend;
            self.stop();
            self.buffer_size = size;
            // 保持当前后端，避免改缓冲尺寸时丢失独占/ASIO
            self.start_with_backend(device_name, Some(sample_rate), backend)?;
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

/// 起流时使用的固定缓冲帧数 —— **唯一决策点**。
///
/// 契约：忠实透传用户在设置页选择的「缓冲区大小」（256..4096）。
/// 历史：此处曾按「10ms 目标」算自动值（48k → 1024）并覆盖用户设置 ——
/// 设置页成了装饰品。抽成独立函数是为了让单测钉住「不得换算」这条契约
/// （`start_with_host` 需要真实音频设备，单测碰不到它本体）。
fn stream_buffer_frames(user_buffer_size: usize) -> u32 {
    user_buffer_size as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 契约：起流帧数 = 用户设置原样透传（不允许任何换算）。
    #[test]
    fn stream_buffer_frames_passthrough() {
        for n in [256usize, 512, 1024, 2048, 4096] {
            assert_eq!(stream_buffer_frames(n), n as u32);
        }
    }

    /// 反向对照：48kHz 的旧「10ms 自动值」是 1024 —— 用户设 2048/4096 时绝不能得到它。
    #[test]
    fn stream_buffer_frames_not_auto_10ms_value() {
        assert_ne!(stream_buffer_frames(2048), 1024);
        assert_ne!(stream_buffer_frames(4096), 1024);
    }

    /// 默认值必须与前端 store 的默认（2048）一致：任何「前端从未同步」的兜底路径
    /// 都不该让「显示 2048、实际用别的」再次发生。
    #[test]
    fn default_buffer_size_matches_frontend_default() {
        assert_eq!(DEFAULT_BUFFER_SIZE, 2048);
    }

    /// 未采集时 set_buffer_size 只改配置字段（真机测量由 example 负责，这里钉契约）。
    #[test]
    fn set_buffer_size_stores_user_choice_and_rejects_invalid() {
        let mut cap = AudioCapture::new();
        cap.set_buffer_size(4096).unwrap();
        assert_eq!(cap.get_buffer_frame_size(), 4096);
        // 非法值被拒（与前端 store 校验的 5 个合法值一致）
        assert!(cap.set_buffer_size(999).is_err());
        // 拒绝后不得污染原值
        assert_eq!(cap.get_buffer_frame_size(), 4096);
    }
}
