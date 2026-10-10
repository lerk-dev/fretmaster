use crate::audio::{AudioCapture, PitchDetector, PitchResult, AudioPreprocessor, ClockedOnsetDetector, preprocessor};
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use tauri::Emitter;

pub struct AudioPipeline {
    capture: AudioCapture,
    preprocessor: AudioPreprocessor,
    detector: PitchDetector,
    agc_enabled: bool,
    agc_target_level: f32,
    agc_max_gain: f32,
    agc_current_gain: f32,
    agc_attack: f32,
    agc_release: f32,
    /// 起音检测（原 last_amplitude / amplitude_diff_threshold 两个字段已并入其中）
    onset: ClockedOnsetDetector,
    last_pitch_result: Option<PitchResult>,
}

impl AudioPipeline {
    pub fn new() -> Self {
        let sample_rate = 48000u32;
        Self {
            capture: AudioCapture::new(),
            preprocessor: AudioPreprocessor::new(sample_rate),
            detector: PitchDetector::default(),
            agc_enabled: true,
            agc_target_level: 0.15,
            agc_max_gain: 10.0,
            agc_current_gain: 1.0,
            agc_attack: 0.01,
            agc_release: 0.001,
            onset: ClockedOnsetDetector::new(),
            last_pitch_result: None,
        }
    }

    pub fn start_capture(&mut self, device_name: Option<String>, sample_rate: Option<u32>) -> Result<(), String> {
        self.capture.start_with_sample_rate(device_name, sample_rate).map_err(|e| e.to_string())
    }

    /// 按指定音频后端启动采集（共享 / WASAPI 独占 / ASIO）。
    pub fn start_capture_with_backend(
        &mut self,
        device_name: Option<String>,
        sample_rate: Option<u32>,
        backend: crate::audio::capture::AudioBackend,
    ) -> Result<(), String> {
        self.capture
            .start_with_backend(device_name, sample_rate, backend)
            .map_err(|e| e.to_string())
    }

    pub fn stop_capture(&mut self) {
        self.capture.stop();
        self.agc_current_gain = 1.0;
        self.onset.reset();
        self.last_pitch_result = None;
    }

    pub fn is_capturing(&self) -> bool {
        self.capture.is_capturing()
    }

    pub fn detect_pitch(&mut self) -> Option<PitchResult> {
        if !self.capture.is_capturing() {
            return None;
        }

        // 音高检测需要足够大的样本数：
        // - 最低音 E2 ≈ 82Hz，周期 ≈ 586 samples @ 48kHz
        // - YIN/autocorrelation 至少需要 2-3 个周期，约 1200-1800 samples
        // - capture.get_buffer_frame_size() 仅 1024（用于 latency），不足以检测低音
        //   （auto_correlation 检查 frame >= buffer.len() 会返回 0，detect 必然 None）
        // - ring buffer 容量 16384，取 4096 samples（85ms @ 48kHz）覆盖到 ~60Hz 低音
        const PITCH_BUFFER_SIZE: usize = 4096;
        let buffer = self.capture.get_latest_samples(PITCH_BUFFER_SIZE);

        if buffer.len() < PITCH_BUFFER_SIZE {
            return None;
        }

        let sample_rate = self.capture.get_sample_rate();
        let calibration_offset = self.capture.get_calibration_offset();

        // 同步 detector 配置（与传入 buffer 大小一致，使 detect 入口检查通过）
        self.detector.set_buffer_size(PITCH_BUFFER_SIZE);

        // 先 noise gate 再 AGC：避免 AGC 先把噪声放大到 0.15 RMS 导致 noise gate 失效
        let processed = {
            self.preprocessor.set_sample_rate(sample_rate);
            let gated = self.preprocessor.process(&buffer);
            if self.agc_enabled {
                self.apply_agc(&gated)
            } else {
                gated
            }
        };

        self.detector.set_sample_rate(sample_rate);
        self.detector.set_calibration_offset(calibration_offset);
        let result = self.detector.detect(&processed);

        if let Some(ref pitch) = result {
            self.last_pitch_result = Some(pitch.clone());
        }

        result
    }

    fn apply_agc(&mut self, buffer: &[f32]) -> Vec<f32> {
        let rms: f32 = (buffer.iter().map(|&x| x * x).sum::<f32>() / buffer.len() as f32).sqrt();

        if rms > 0.0001 {
            let ratio = self.agc_target_level / rms;
            let target_gain = ratio.min(self.agc_max_gain).max(0.1);

            if target_gain > self.agc_current_gain {
                self.agc_current_gain += (target_gain - self.agc_current_gain) * self.agc_attack;
            } else {
                self.agc_current_gain += (target_gain - self.agc_current_gain) * self.agc_release;
            }

            self.agc_current_gain = self.agc_current_gain.max(0.05);
        }

        // 软限幅 (tanh) 替代硬 clipping，避免引入奇次谐波干扰 YIN 基频检测
        buffer.iter().map(|&x| (x * self.agc_current_gain).tanh()).collect()
    }

    /// 起音检测：本帧是否是一次**新的拨弦**。
    ///
    /// 判定规则全部在 crate::audio::onset::OnsetDetector 里（附完整单测），
    /// 本方法只负责取一帧原始音频、算出 RMS 再交给它。
    ///
    /// ⚠️ 用**原始** buffer（不走 preprocessor / AGC）：预处理会改变电平包络，
    /// 而 AGC 更是会把「拨弦的陡升」直接抹平成缓慢渐强，起音就再也检不出来了。
    /// worklet 侧同样取 prefilter 之前的 energy，两边口径一致。
    ///
    /// 原实现在这里内联了 `diff > 0.15` 配 EMA 基线，两个错都写在 onset.rs 的模块注释里。
    pub fn detect_amplitude_diff(&mut self) -> bool {
        if !self.capture.is_capturing() {
            return false;
        }

        let buffer_size = self.capture.get_buffer_frame_size();
        let buffer = self.capture.get_latest_samples(buffer_size);

        if buffer.is_empty() {
            return false;
        }

        let rms: f32 = (buffer.iter().map(|&x| x * x).sum::<f32>() / buffer.len() as f32).sqrt();
        self.onset.update(rms)
    }

    pub fn set_agc_enabled(&mut self, enabled: bool) {
        self.agc_enabled = enabled;
        if !enabled {
            self.agc_current_gain = 1.0;
        }
    }

    pub fn is_agc_enabled(&self) -> bool {
        self.agc_enabled
    }

    pub fn set_agc_target_level(&mut self, level: f32) {
        self.agc_target_level = level.clamp(0.01, 0.5);
    }

    pub fn get_agc_gain(&self) -> f32 {
        self.agc_current_gain
    }

    pub fn get_audio_level(&mut self) -> AudioLevelInfo {
        if !self.capture.is_capturing() {
            return AudioLevelInfo {
                rms: 0.0,
                db_spl: -96.0,
                peak: 0.0,
                is_voiced: false,
                noise_floor: 0.0,
                snr_db: 0.0,
            };
        }

        let buffer_size = self.capture.get_buffer_frame_size();
        let buffer = self.capture.get_latest_samples(buffer_size);

        if buffer.is_empty() {
            return AudioLevelInfo {
                rms: 0.0,
                db_spl: -96.0,
                peak: 0.0,
                is_voiced: false,
                noise_floor: 0.0,
                snr_db: 0.0,
            };
        }

        let rms: f64 = buffer.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>() / buffer.len() as f64;
        let rms = rms.sqrt();

        let db_spl = if rms > 0.0 {
            20.0 * rms.log10() + 94.0
        } else {
            -96.0
        };

        let peak = buffer.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);

        let noise_est = self.preprocessor.estimate_noise(&buffer);

        AudioLevelInfo {
            rms,
            db_spl,
            peak,
            is_voiced: rms as f32 > noise_est.noise_floor * 2.0,
            noise_floor: noise_est.noise_floor,
            snr_db: noise_est.snr_db,
        }
    }

    pub fn get_noise_estimate(&mut self) -> preprocessor::NoiseEstimate {
        if !self.capture.is_capturing() {
            return preprocessor::NoiseEstimate {
                noise_floor: 0.0,
                noise_floor_db: -96.0,
                snr: 0.0,
                snr_db: 0.0,
                signal_rms: 0.0,
                signal_db: -96.0,
            };
        }

        let buffer_size = self.capture.get_buffer_frame_size();
        let buffer = self.capture.get_latest_samples(buffer_size);
        self.preprocessor.estimate_noise(&buffer)
    }

    pub fn get_capture(&self) -> &AudioCapture {
        &self.capture
    }

    pub fn get_capture_mut(&mut self) -> &mut AudioCapture {
        &mut self.capture
    }

    pub fn get_preprocessor_mut(&mut self) -> &mut AudioPreprocessor {
        &mut self.preprocessor
    }

    pub fn get_detector_mut(&mut self) -> &mut PitchDetector {
        &mut self.detector
    }
}

impl Default for AudioPipeline {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioLevelInfo {
    pub rms: f64,
    pub db_spl: f64,
    pub peak: f32,
    pub is_voiced: bool,
    pub noise_floor: f32,
    pub snr_db: f32,
}

pub struct AppState {
    pub pipeline: Arc<Mutex<AudioPipeline>>,
    pub device_monitor: Arc<Mutex<crate::audio::DeviceMonitor>>,
    /// 音高检测线程（句柄 + 运行标志）——见 `PitchStream` 的注释。
    pub pitch_stream: Arc<Mutex<PitchStream>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pipeline: Arc::new(Mutex::new(AudioPipeline::new())),
            device_monitor: Arc::new(Mutex::new(crate::audio::DeviceMonitor::new())),
            pitch_stream: Arc::new(Mutex::new(PitchStream::new())),
        }
    }
}

/// 音高检测线程的句柄持有者。
///
/// 🚨 **不能只用一个 `AtomicBool` 当守卫**：`stop` 只是把标志置 false，线程还要
/// 等一个完整的 `sleep(interval)`（默认 50ms）才会退出；在这段窗口里紧接
/// `start`，`swap(true)` 会成功并 spawn 出**第二条**线程，而旧线程醒来看到
/// 标志又是 true，就继续跑 ⇒ 两个线程同时 `emit("pitch-detected")`。
/// 用户侧表现是「练习同一拨弦计分两次」；调音表侧表现是数值抖动加倍。
/// 所以这里比照 `DeviceMonitor`（`audio/device_monitor.rs`）的做法**保存
/// `JoinHandle`，在 start 前 join 旧线程**，并在 stop 时 join，保证同一时刻
/// 至多一条检测线程存活。
pub struct PitchStream {
    running: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl PitchStream {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            handle: None,
        }
    }

    pub fn running_flag(&self) -> Arc<AtomicBool> {
        self.running.clone()
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// 先停旧线程并 join，再启动新线程 —— 杜绝「stop → start」窗口内的双线程。
    pub fn start(
        &mut self,
        app: AppHandle,
        pipeline: Arc<Mutex<AudioPipeline>>,
        interval_ms: u64,
    ) {
        // 即便调用方漏了 stop，也能在这里自愈：先把上一代收干净。
        self.stop();

        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        let interval = if interval_ms == 0 { 50 } else { interval_ms };

        let spawned = std::thread::Builder::new()
            .name("pitch-stream".to_string())
            .spawn(move || {
                log::info!("Pitch stream started with interval {}ms", interval);

                while running.load(Ordering::SeqCst) {
                    let result = {
                        let mut pipeline = pipeline.lock();
                        if !pipeline.is_capturing() {
                            None
                        } else {
                            let is_note_onset = pipeline.detect_amplitude_diff();
                            let pitch = pipeline.detect_pitch();
                            pitch.map(|p| (p, is_note_onset, pipeline.get_agc_gain()))
                        }
                    };

                    if let Some((pitch, is_note_onset, agc_gain)) = result {
                        let _ = app.emit("pitch-detected", &PitchStreamEvent {
                            pitch,
                            is_note_onset,
                            agc_gain,
                        });
                    } else if running.load(Ordering::SeqCst) {
                        let _ = app.emit("pitch-detected", &PitchStreamEvent {
                            pitch: PitchResult {
                                frequency: 0.0,
                                note: String::new(),
                                octave: 0,
                                cents: 0.0,
                                probability: 0.0,
                                clarity: 0.0,
                                volume_rms: 0.0,
                                volume_db_spl: -96.0,
                                max_amplitude: 0.0,
                                timestamp: 0,
                                is_voiced: false,
                                confidence: crate::audio::PitchConfidence {
                                    yin_probability: 0.0,
                                    harmonic_score: 0.0,
                                    temporal_consistency: 0.0,
                                    overall: 0.0,
                                },
                                calibration_offset: 0.0,
                            },
                            is_note_onset: false,
                            agc_gain: 1.0,
                        });
                    }

                    std::thread::sleep(std::time::Duration::from_millis(interval));
                }

                log::info!("Pitch stream stopped");
            });

        match spawned {
            Ok(handle) => self.handle = Some(handle),
            Err(e) => {
                log::error!("Failed to spawn pitch stream thread: {}", e);
                self.running.store(false, Ordering::SeqCst);
            }
        }
    }

    /// 停线程并 **join**：返回后保证检测线程已真正退出（不再 emit）。
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }

    /// 仅供测试：不依赖 `AppHandle`/`AudioPipeline` 的启动入口 —— 直接喂一个会被
    /// 循环调用的闭包。语义与 `start` 完全一致（先 stop+join 旧线程，再 spawn）。
    /// 生产代码不调用它；它的存在只是为了让「stop → start 不产生双线程」这个
    /// 不变量能被单测直接验证（`#[cfg(test)]` 之外的可见性由 `pub(crate)` 限制）。
    #[cfg(test)]
    pub(crate) fn start_with<F>(&mut self, interval_ms: u64, mut tick: F)
    where
        F: FnMut() + Send + 'static,
    {
        self.stop();

        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        let interval = if interval_ms == 0 { 50 } else { interval_ms };

        let spawned = std::thread::Builder::new()
            .name("pitch-stream-test".to_string())
            .spawn(move || {
                while running.load(Ordering::SeqCst) {
                    tick();
                    std::thread::sleep(std::time::Duration::from_millis(interval));
                }
            });

        match spawned {
            Ok(handle) => self.handle = Some(handle),
            Err(_) => self.running.store(false, Ordering::SeqCst),
        }
    }
}

impl Default for PitchStream {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PitchStreamEvent {
    pub pitch: PitchResult,
    pub is_note_onset: bool,
    pub agc_gain: f32,
}

#[cfg(test)]
mod pitch_stream_tests {
    use super::PitchStream;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    /// 🚨 **回归：连续 start（中间没有显式 stop，或 stop→start 紧邻）不得留下两条线程**。
    ///
    /// 旧实现（只用一个 `AtomicBool` + 丢弃 `JoinHandle`，`start` 靠 `swap(true)`
    /// 早退）在「旧线程还活着时再次 start」会怎样，取决于守卫写法：
    ///   - 若 `start` 只是 `swap` 早退：第二次 start 直接返回，`running` 仍为 true，
    ///     于是**旧线程继续跑**——看起来没双线程，但配的 interval / 闭包都是旧的，
    ///     语义错位；且 stop→start 时旧线程「标志又被置回 true」⇒ 真双线程。
    ///
    /// 本用例直接把「两代共享同一个并发计数器」作为判据：每个 tick 进入 +1、退出 −1，
    /// 取峰值。只要同一时刻有两条线程在 tick，峰值就会到 2。修好后恒为 1。
    fn overlap_peak(second_is_stop_then_start: bool) -> usize {
        let mut stream = PitchStream::new();
        let concurrent = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));

        let make_tick = |c: Arc<AtomicUsize>, p: Arc<AtomicUsize>| {
            move || {
                let now = c.fetch_add(1, Ordering::SeqCst) + 1;
                p.fetch_max(now, Ordering::SeqCst);
                // 放大「同时在跑」的窗口：没 sleep 的话两线程可能刚好错开，抓不到
                std::thread::sleep(Duration::from_millis(8));
                c.fetch_sub(1, Ordering::SeqCst);
            }
        };

        stream.start_with(1, make_tick(concurrent.clone(), peak.clone()));
        // 让第一代真正进入 tick 并停在 8ms 的 sleep 里
        std::thread::sleep(Duration::from_millis(4));

        if second_is_stop_then_start {
            // 旧线程此刻正卡在 sleep(8ms) 中，stop 的 join 会等它出来。
            // 若 join 缺失，旧线程会在 sleep 结束后看到 running==true（被 start 重新置位）
            // 而**继续跑** ⇒ 与新一代重叠。
            stream.stop();
        }
        stream.start_with(1, make_tick(concurrent.clone(), peak.clone()));

        std::thread::sleep(Duration::from_millis(60));
        stream.stop();
        peak.load(Ordering::SeqCst)
    }

    #[test]
    fn start_twice_without_stop_never_overlaps() {
        assert_eq!(
            overlap_peak(false),
            1,
            "两次 start（中间无 stop）出现并发 tick —— 旧线程没被 start 内部收干净"
        );
    }

    #[test]
    fn stop_then_start_never_overlaps() {
        assert_eq!(
            overlap_peak(true),
            1,
            "stop→start 紧邻调用出现并发 tick —— 检测线程被复制（练习同一拨弦会计分两次）"
        );
    }

    /// `stop` 返回后线程必须**已经退出**（join 生效）。
    ///
    /// 判据设计：把 interval 设得较长（40ms），stop 之后**立刻**采样一次 tick 数，
    /// 再等远超一个 interval 的时间后采样第二次。若 join 缺失，未 join 的线程会在
    /// stop 返回后的这段等待里又 tick 至少一次（它要等 sleep 走完才发现 running=false），
    /// 两次采样就会不相等。
    #[test]
    fn stop_joins_so_no_tick_after_return() {
        let mut stream = PitchStream::new();
        let ticks = Arc::new(AtomicUsize::new(0));

        let t = ticks.clone();
        stream.start_with(40, move || {
            t.fetch_add(1, Ordering::SeqCst);
        });

        // 至少让它 tick 一次
        std::thread::sleep(Duration::from_millis(50));
        stream.stop();

        let after_stop = ticks.load(Ordering::SeqCst);
        // 远超一个 interval：未 join 的线程必在此期间再 tick
        std::thread::sleep(Duration::from_millis(120));
        assert_eq!(
            ticks.load(Ordering::SeqCst),
            after_stop,
            "stop() 返回后线程仍在 tick —— join 没有生效（停止不是同步的）"
        );
    }

    #[test]
    fn start_is_idempotent_without_stop() {
        let mut stream = PitchStream::new();
        assert!(!stream.is_running());

        stream.start_with(5, || {});
        assert!(stream.is_running());

        // 未 stop 直接再 start：旧线程被 start 内部 self.stop() 收干净，不叠加
        stream.start_with(5, || {});
        assert!(stream.is_running());

        let peak_flag = stream.running_flag();
        stream.stop();
        assert!(!peak_flag.load(Ordering::SeqCst));
        assert!(!stream.is_running());
    }
}
