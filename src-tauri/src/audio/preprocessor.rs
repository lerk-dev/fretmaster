use serde::{Deserialize, Serialize};

/// 🚨 噪声门的**唯一真相源**（跨实现，2026-10-03 修）。
///
/// 这两个常数必须与 Web worklet `public/js/audio-worklet-processor.js` 的
/// `adaptiveThreshold` **完全一致**：
///   `const adaptiveThreshold = Math.max(0.0008, this.noiseFloor * 1.5)`
///
/// 为什么必须是同一个值：用户报「必须较重的弹才能答对题，稍微轻一点就没有反应」。
/// 实测（底噪 0.0005，`cargo test --release` 探针）：
///   修复前 Rust 门限 0.016（≈-36dBFS）⇒ 轻拨 RMS 0.002 被衰减 **-36.2dB**（压死）；
///   worklet 门限 0.0008（≈-62dBFS）⇒ 同一信号几乎无损。
/// 两者差 **45.5dB**。worklet 那边早就修过（那边的注释原话：「×2.5 时…轻于 -24dBFS
/// 就检不出（用户表现为『要弹得比较响才有反应』）」），Rust 侧却从未同步。
///
/// ⚠️ 改这里之前先看 `__tests__/noise-gate-parity.test.ts`（跨实现护栏会红）。
pub const GATE_FLOOR: f32 = 0.0008;
pub const GATE_NOISE_RATIO: f32 = 1.5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPreprocessorConfig {
    pub high_pass_freq: f32,
    pub low_pass_freq: f32,
    pub notch_freq_50: f32,
    pub notch_freq_60: f32,
    pub notch_q: f32,
    pub noise_gate_threshold: f32,
    pub enable_high_pass: bool,
    pub enable_low_pass: bool,
    pub enable_notch_50: bool,
    pub enable_notch_60: bool,
    pub enable_noise_gate: bool,
}

impl Default for AudioPreprocessorConfig {
    fn default() -> Self {
        Self {
            high_pass_freq: 35.0,
            low_pass_freq: 4500.0,
            notch_freq_50: 50.0,
            notch_freq_60: 60.0,
            notch_q: 15.0,
            noise_gate_threshold: 0.008,
            enable_high_pass: true,
            enable_low_pass: true,
            enable_notch_50: true,
            enable_notch_60: true,
            enable_noise_gate: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoiseEstimate {
    pub noise_floor: f32,
    pub noise_floor_db: f32,
    pub snr: f32,
    pub snr_db: f32,
    pub signal_rms: f32,
    pub signal_db: f32,
}

struct BiquadFilter {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadFilter {
    fn _new() -> Self {
        Self { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn high_pass(sample_rate: f32, freq: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let b0 = (1.0 + cos_w0) / 2.0;
        let b1 = -(1.0 + cos_w0);
        let b2 = (1.0 + cos_w0) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        Self { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn low_pass(sample_rate: f32, freq: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let b0 = (1.0 - cos_w0) / 2.0;
        let b1 = 1.0 - cos_w0;
        let b2 = (1.0 - cos_w0) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        Self { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn notch(sample_rate: f32, freq: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let b0 = 1.0;
        let b1 = -2.0 * cos_w0;
        let b2 = 1.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        Self { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    fn process(&mut self, x0: f32) -> f32 {
        let y0 = self.b0 * x0 + self.b1 * self.x1 + self.b2 * self.x2
                 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x0;
        self.y2 = self.y1;
        self.y1 = y0;
        y0
    }

    fn reset(&mut self) {
        self.x1 = 0.0; self.x2 = 0.0; self.y1 = 0.0; self.y2 = 0.0;
    }
}

pub struct AudioPreprocessor {
    config: AudioPreprocessorConfig,
    sample_rate: f32,
    hp_filter: BiquadFilter,
    lp_filter: BiquadFilter,
    notch_50: BiquadFilter,
    notch_60: BiquadFilter,
    noise_floor_est: f32,
    /// 「噪音抑制」滑块映射出的**门限相对底噪的倍数**。
    /// 默认 = `GATE_NOISE_RATIO`（与 worklet 同源）；只有用户拖过滑块才变。
    gate_noise_ratio: f32,
}

impl AudioPreprocessor {
    pub fn new(sample_rate: u32) -> Self {
        let config = AudioPreprocessorConfig::default();
        let sr = sample_rate as f32;
        Self {
            hp_filter: BiquadFilter::high_pass(sr, config.high_pass_freq, 0.707),
            lp_filter: BiquadFilter::low_pass(sr, config.low_pass_freq, 0.707),
            notch_50: BiquadFilter::notch(sr, config.notch_freq_50, config.notch_q),
            notch_60: BiquadFilter::notch(sr, config.notch_freq_60, config.notch_q),
            noise_floor_est: 0.01,
            gate_noise_ratio: GATE_NOISE_RATIO,
            config,
            sample_rate: sr,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.sample_rate = sample_rate as f32;
        self.rebuild_filters();
    }

    /// 当前生效的噪声门限（RMS）—— **唯一真相源**。
    ///
    /// 🚨 口径必须与 Web worklet 一致：`max(GATE_FLOOR, 底噪 × GATE_NOISE_RATIO)`。
    /// 详见文件顶部两个常量的注释（含「轻拨被压死 -36.2dB」的实测数据）。
    ///
    /// 修复前这里是 `max(config.noise_gate_threshold * 2.0, 底噪 * 3.0)`
    /// ⇒ 底噪低时约 0.016，比 worklet 高 45.5dB，轻拨弦直接被压没。
    /// 旧的 `config.noise_gate_threshold` 已不再参与门限计算（滑块另走
    /// `set_noise_suppression_level`，见下方说明）。
    pub fn gate(&self) -> f32 {
        (self.noise_floor_est * self.gate_noise_ratio).max(GATE_FLOOR)
    }

    pub fn set_config(&mut self, config: AudioPreprocessorConfig) {
        self.config = config;
        self.rebuild_filters();
    }

    fn rebuild_filters(&mut self) {
        let sr = self.sample_rate;
        self.hp_filter = BiquadFilter::high_pass(sr, self.config.high_pass_freq, 0.707);
        self.lp_filter = BiquadFilter::low_pass(sr, self.config.low_pass_freq, 0.707);
        self.notch_50 = BiquadFilter::notch(sr, self.config.notch_freq_50, self.config.notch_q);
        self.notch_60 = BiquadFilter::notch(sr, self.config.notch_freq_60, self.config.notch_q);
    }

    pub fn process(&mut self, buffer: &[f32]) -> Vec<f32> {
        let mut output = buffer.to_vec();

        if self.config.enable_high_pass {
            for sample in output.iter_mut() {
                *sample = self.hp_filter.process(*sample);
            }
        }

        if self.config.enable_low_pass {
            for sample in output.iter_mut() {
                *sample = self.lp_filter.process(*sample);
            }
        }

        if self.config.enable_notch_50 {
            for sample in output.iter_mut() {
                *sample = self.notch_50.process(*sample);
            }
        }

        if self.config.enable_notch_60 {
            for sample in output.iter_mut() {
                *sample = self.notch_60.process(*sample);
            }
        }

        let signal_rms = Self::compute_rms(&output);
        // 非对称噪声底跟踪：能量低于当前噪声底时较快跟随（静音/噪声段），
        // 高于时极慢上升（避免持续弹奏把噪声底抬高，进而被 noise gate 当成噪声把弱信号切掉）。
        // 原实现用 signal_rms.min(prev_signal_rms) 配固定 alpha，持续信号会拉高噪声底。
        let alpha = if signal_rms < self.noise_floor_est { 0.2 } else { 0.0005 };
        self.noise_floor_est += (signal_rms - self.noise_floor_est) * alpha;
        self.noise_floor_est = self.noise_floor_est.max(1e-6);

        if self.config.enable_noise_gate {
            let gate = self.gate();
            if signal_rms < gate {
                let gain = if gate > 0.0 {
                    (signal_rms / gate).min(1.0)
                } else {
                    0.0
                };
                let smooth_gain = gain * gain;
                for sample in output.iter_mut() {
                    *sample *= smooth_gain;
                }
            }
        }

        output
    }

    pub fn estimate_noise(&self, buffer: &[f32]) -> NoiseEstimate {
        let signal_rms = Self::compute_rms(buffer);
        let noise_floor = self.noise_floor_est;
        let snr = if noise_floor > 0.0 { signal_rms / noise_floor } else { 1000.0 };
        let signal_db = if signal_rms > 0.0 { 20.0 * signal_rms.log10() } else { -96.0 };
        let noise_db = if noise_floor > 0.0 { 20.0 * noise_floor.log10() } else { -96.0 };

        NoiseEstimate {
            noise_floor,
            noise_floor_db: noise_db,
            snr,
            snr_db: if snr > 0.0 { 20.0 * snr.log10() } else { 0.0 },
            signal_rms,
            signal_db,
        }
    }

    /// 设置页显示的诊断门限。
    ///
    /// 🚨 修复前这里返回 `0.15 + 底噪×3`（约 0.15），而 `process()` 实际用的是
    /// `0.016` —— 两个值毫无关系，于是**用户在设置页看到的「门限」是假的**
    /// （调它没有任何效果，因为设置页那个滑块改的是 `noise_gate_threshold`，
    /// 而它当时只在 `process()` 里以 `×2.0` 的形式出现）。
    /// 现在两者同源：这个方法只做转发，**不允许再出现第二份公式**。
    pub fn get_adaptive_threshold(&self) -> f32 {
        self.gate()
    }

    pub fn reset(&mut self) {
        self.hp_filter.reset();
        self.lp_filter.reset();
        self.notch_50.reset();
        self.notch_60.reset();
        self.noise_floor_est = 0.01;
    }

    fn compute_rms(buffer: &[f32]) -> f32 {
        let sum: f32 = buffer.iter().map(|&x| x * x).sum();
        (sum / buffer.len() as f32).sqrt()
    }

    // 新增方法 - 用于前端设置界面

    pub fn set_high_pass_filter(&mut self, enabled: bool) {
        self.config.enable_high_pass = enabled;
    }

    pub fn set_low_pass_filter(&mut self, enabled: bool) {
        self.config.enable_low_pass = enabled;
    }

    pub fn set_notch_filter_50hz(&mut self, enabled: bool) {
        self.config.enable_notch_50 = enabled;
    }

    pub fn set_notch_filter_60hz(&mut self, enabled: bool) {
        self.config.enable_notch_60 = enabled;
    }

    /// 设置「噪音抑制」滑块（0-100）。
    ///
    /// 🚨 修复前它写的是 `config.noise_gate_threshold`，而 `process()` 里的门限
    /// 是 `max(noise_gate_threshold × 2.0, 底噪 × 3.0)` —— 换算下来
    /// 「降噪 70」⇒ 门限 0.1412（≈**-17dBFS**），比 worklet 高 45dB 以上，
    /// 轻拨弦必被压死；而且**这个滑块在前端根本没有调用方**（见
    /// `lib/native-audio.ts` 的 `setNoiseSuppression` 无引用），
    /// 也就是说用户拖滑块时 Rust 侧压根没收到，滑块是**死的**。
    ///
    /// 现在的语义：**抑制强度 = 门限相对底噪的倍数**，而不是绝对 RMS 阈值。
    /// 这样无论滑块在哪一档，都不会把「轻拨」整段砍掉（底噪以下才压），
    /// 且与 worklet 的 `底噪 × 1.5` 同一形态。0 档 = 几乎不压制（倍数 1.0），
    /// 100 档 = 倍数 3.0。
    pub fn set_noise_suppression_level(&mut self, level: f32) {
        let normalized = level.clamp(0.0, 100.0) / 100.0;
        self.gate_noise_ratio = 1.0 + 2.0 * normalized;
        self.config.enable_noise_gate = level > 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 48000;
    const N: usize = 4096;

    /// 指定 RMS 的正弦（模拟某次拨弦的稳态段）
    fn sine(rms: f32, freq: f32) -> Vec<f32> {
        let peak = rms * 2.0f32.sqrt();
        (0..N)
            .map(|i| peak * (2.0 * std::f32::consts::PI * freq * i as f32 / SR as f32).sin())
            .collect()
    }

    fn rms_of(x: &[f32]) -> f32 {
        (x.iter().map(|&v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    /// 造一个底噪已收敛的预处理器
    fn primed(floor_rms: f32) -> AudioPreprocessor {
        let mut p = AudioPreprocessor::new(SR);
        let noise = sine(floor_rms, 60.0);
        for _ in 0..30 {
            let _ = p.process(&noise);
        }
        p
    }

    #[test]
    fn 门限与worklet同源_绝对下限是0_0008() {
        let p = AudioPreprocessor::new(SR);
        // 底噪初值 0.01 ⇒ 0.01×1.5=0.015 > 下限
        assert!((p.gate() - 0.015).abs() < 1e-6, "gate()={}", p.gate());
        // 底噪压到极低后必须落到绝对下限 0.0008（-62dBFS），而不是继续往下掉
        let q = primed(0.0001);
        assert!((q.gate() - GATE_FLOOR).abs() < 1e-9, "gate()={}", q.gate());
    }

    #[test]
    fn 轻拨弦不再被压死_这是用户报的那个bug() {
        let mut p = primed(0.0005);
        let light = sine(0.002, 220.0);
        let out = p.process(&light);
        let kept = rms_of(&out) / rms_of(&light);
        // 修复前是 1.6%（-36.2dB）；现在要求保留 70% 以上
        assert!(kept > 0.7, "轻拨弦只保留 {:.1}%（衰减 {:.1}dB）", kept * 100.0, 20.0 * kept.log10());
    }

    #[test]
    fn 中拨与重拨几乎无损_防门限无脑归零() {
        let mut p = primed(0.0005);
        for rms in [0.03f32, 0.12] {
            let out = p.process(&sine(rms, 220.0));
            let kept = rms_of(&out) / rms;
            assert!(kept > 0.99, "RMS {rms} 只保留 {:.1}%", kept * 100.0);
        }
    }

    #[test]
    fn 环境底噪仍被压制_防误检() {
        let mut p = primed(0.0005);
        // 与上面同一段底噪（0.0005）再走一次，门限 0.0008 ⇒ 应被明显压制
        let out = p.process(&sine(0.0005, 60.0));
        let kept = rms_of(&out) / 0.0005;
        assert!(kept < 0.7, "底噪只被压到 {:.1}%，会有误检风险", kept * 100.0);
    }

    #[test]
    fn 诊断接口与实际门限同源_设置页不能显示假值() {
        let p = primed(0.0005);
        assert_eq!(
            p.get_adaptive_threshold(),
            p.gate(),
            "get_adaptive_threshold 报的数和 process() 用的不是一回事 ⇒ 设置页显示的是假值"
        );
    }

    #[test]
    fn 降噪滑块映射到门限倍数而不是绝对阈值() {
        let mut p = primed(0.0005);
        let base = p.gate();

        p.set_noise_suppression_level(0.0);
        assert!(!p.config.enable_noise_gate, "0 档应完全关掉噪声门");
        // 关掉后 process 不再压制
        let light = sine(0.002, 220.0);
        let kept = rms_of(&p.process(&light)) / rms_of(&light);
        assert!(kept > 0.99, "0 档不该压制任何信号，实际保留 {:.1}%", kept * 100.0);

        p.set_noise_suppression_level(100.0);
        assert!(p.config.enable_noise_gate);
        assert!(p.gate() > base, "100 档的倍数应高于默认 1.5，实际 {} vs {}", p.gate(), base);
        // 即便最强档，轻拨弦也不能被压死（倍数 3.0 × 底噪 0.0005 = 0.0015 < 0.002）
        let kept = rms_of(&p.process(&sine(0.002, 220.0))) / 0.002;
        assert!(kept > 0.5, "100 档把轻拨弦压到只剩 {:.1}%", kept * 100.0);
    }

    #[test]
    fn 门限公式里不再出现旧的乘2与乘3() {
        // 源码级护栏：把这两行改回去（等于退回修复前）时必须失败
        let src = include_str!("preprocessor.rs");
        let gate_fn = src
            .split("pub fn gate(&self)")
            .nth(1)
            .and_then(|s| s.split('}').next())
            .expect("找不到 gate()");
        assert!(
            !gate_fn.contains("noise_gate_threshold * 2.0"),
            "gate() 里复活了 noise_gate_threshold * 2.0"
        );
        assert!(
            !gate_fn.contains("noise_floor_est * 3.0"),
            "gate() 里复活了 noise_floor_est * 3.0"
        );
    }
}
