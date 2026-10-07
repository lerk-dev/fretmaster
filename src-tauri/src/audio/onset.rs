//! 起音（onset）检测 —— 判定某一帧是否是一次**新的拨弦**。
//!
//! 这是同一条规则的**三处实现**之一，改动必须三处同步：
//!   - Rust：本文件（Tauri 桌面版）
//!   - Web：`public/js/audio-worklet-processor.js` 的 `_detectAmplitudeDiff()`
//!   - Web 回退：`lib/note-confirm.ts` 的 `detectOnset()`（附 TS 侧完整契约测试）
//!
//! 前端拿它做什么：`lib/note-confirm.ts` 的 `confirmNote()` 在收到起音时**清空**
//! 多帧一致的确认记忆（连续帧计数 + 已放行标记），否则同一个音在长按期间无法被第二次计分。
//!
//! ## 原实现的两个错
//!
//! 改造前是 `diff > amplitude_diff_threshold`（0.15）配 EMA 基线：
//!
//! 1. **0.15 这个量级正常拨弦根本达不到**。它是绝对 RMS 差，0.15 RMS ≈ −16 dBFS；
//!    正常拨弦的帧间增量在 0.01 量级。结果是 `is_note_onset` 恒为 false ——
//!    这条信号虽然一路发到了前端，但实际上永远是假的。
//! 2. **EMA 基线在稳态长音下会慢慢追上当前电平**，于是每过一个不应期就重新满足
//!    `rms > baseline * 1.45` ⇒ 持音被反复判成起音。
//!
//! 现在改成：「相对**上一帧原始 RMS** 1.45 倍」+「绝对增量 ≥ 门限 × 0.5」双条件 + 不应期。
//!
//! ## 为什么不照抄竞品的 0.004
//!
//! 竞品 GuitarRun 的绝对增量写死 0.004（见根目录 `guitarrun-pitch-analysis.md` §3.4），
//! 那配的是它自己的门限 `clamp(底噪 × 3.2, 0.007, 0.045)`（最低 0.007 ≈ −43 dBFS）。
//! 我们的门限下限低得多（worklet 侧 `max(0.0008, 底噪 × 1.5)`，最低 0.0008 ≈ −62 dBFS），
//! 直接搬 0.004 会让轻弹（RMS 0.001~0.003）永远判不出起音。改成「门限 × 0.5」后自动缩放。

use std::time::{Duration, Instant};

/// 起音检测器。
///
/// 门限由内部跟踪的噪声底导出，与 worklet 侧规则一致（下降快、上升极慢），
/// 所以同一台设备上 Web 与桌面版的门限行为一致。
#[derive(Debug)]
pub struct OnsetDetector {
    /// 上一帧的**原始** RMS。`None` 表示还没有上一帧（首帧永不可能是起音）。
    prev_rms: Option<f32>,
    /// 噪声底（RMS）
    noise_floor: f32,
    noise_floor_primed: bool,
    /// 上次判定为起音的时刻（秒，单调时钟）
    last_onset_at: Option<f64>,
    /// 相对条件：本帧 RMS 需超过上一帧的这个倍数
    relative_ratio: f32,
    /// 绝对增量下限 = 门限 × 这个系数
    gate_delta_ratio: f32,
    /// 不应期：一次拨弦的上升沿可能跨若干帧，防它被拆成多次起音
    refractory: Duration,
}

impl Default for OnsetDetector {
    fn default() -> Self {
        Self {
            prev_rms: None,
            noise_floor: 0.0005,
            noise_floor_primed: false,
            last_onset_at: None,
            // 与 lib/note-confirm.ts 的 ONSET_DEFAULTS、worklet 的 processorOptions 默认值一致
            relative_ratio: 1.45,
            gate_delta_ratio: 0.5,
            refractory: Duration::from_millis(75),
        }
    }
}

impl OnsetDetector {
    pub fn new() -> Self {
        Self::default()
    }

    /// 清空全部状态（停止采集时调用，避免把上一次会话的电平/时刻带进新会话）。
    pub fn reset(&mut self) {
        self.prev_rms = None;
        self.noise_floor = 0.0005;
        self.noise_floor_primed = false;
        self.last_onset_at = None;
    }

    /// 当前门限（RMS）。仅供诊断，判定走 [`Self::update`]。
    pub fn gate(&self) -> f32 {
        (self.noise_floor * 1.5).max(0.0008)
    }

    /// 判定这一帧是否为一次新的起音。
    ///
    /// @param rms       本帧 RMS（**原始**输入，不要用 AGC / 预处理之后的电平）
    /// @param now_secs  单调时钟读出的当前时刻（秒），与上次调用同源
    pub fn update(&mut self, rms: f32, now_secs: f64) -> bool {
        // 噪声底跟踪：下降快（0.05）、上升极慢（0.0005）。
        // 上升慢是刻意的 —— 否则持续弹奏会把底噪抬到信号电平、门限随之失效。
        if self.noise_floor_primed {
            let alpha = if rms < self.noise_floor { 0.05 } else { 0.0005 };
            self.noise_floor += (rms - self.noise_floor) * alpha;
        } else {
            self.noise_floor = rms;
            self.noise_floor_primed = true;
        }

        let gate = self.gate();
        let min_delta = gate * self.gate_delta_ratio;
        let refractory_secs = self.refractory.as_secs_f64();

        let is_onset = match self.prev_rms {
            None => false,
            Some(prev) => {
                rms >= gate
                    && rms > prev * self.relative_ratio
                    && rms - prev > min_delta
                    && self
                        .last_onset_at
                        .is_none_or(|last| now_secs - last >= refractory_secs)
            }
        };

        self.prev_rms = Some(rms);
        if is_onset {
            self.last_onset_at = Some(now_secs);
        }
        is_onset
    }
}

/// 供 `AudioPipeline` 用的带单调时钟包装：把 `Instant` 折算成秒后交给 [`OnsetDetector`]。
#[derive(Debug)]
pub struct ClockedOnsetDetector {
    detector: OnsetDetector,
    start: Instant,
}

impl Default for ClockedOnsetDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl ClockedOnsetDetector {
    pub fn new() -> Self {
        Self {
            detector: OnsetDetector::new(),
            start: Instant::now(),
        }
    }

    pub fn reset(&mut self) {
        self.detector.reset();
    }

    pub fn gate(&self) -> f32 {
        self.detector.gate()
    }

    pub fn update(&mut self, rms: f32) -> bool {
        let now = self.start.elapsed().as_secs_f64();
        self.detector.update(rms, now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 与 lib/note-confirm.test.ts / worklet 探针同构的驱动：显式给时刻，不依赖真实时钟
    fn drive(d: &mut OnsetDetector, samples: &[(f32, f64)]) -> Vec<bool> {
        samples.iter().map(|&(rms, t)| d.update(rms, t)).collect()
    }

    #[test]
    fn 首帧永不判定为起音() {
        let mut d = OnsetDetector::new();
        let out = drive(&mut d, &[(0.05, 0.0)]);
        assert_eq!(out, vec![false]);
    }

    #[test]
    fn 静音到强信号判为起音() {
        let mut d = OnsetDetector::new();
        let out = drive(&mut d, &[(0.0002, 0.0), (0.01, 0.0107)]);
        assert_eq!(out, vec![false, true]);
    }

    /// 🚨 稳态长音只能起音一次。EMA 基线实现会在这里挂掉。
    #[test]
    fn 稳态长音跨过不应期也不再起音() {
        let mut d = OnsetDetector::new();
        let mut samples = vec![(0.0002_f32, 0.0_f64)];
        samples.push((0.01, 0.0107));
        // 持续 2 秒、每 10.67ms 一帧、电平完全稳定
        for i in 0..188 {
            samples.push((0.01, 0.0107 + (i as f64 + 1.0) * 0.01067));
        }

        let out = drive(&mut d, &samples);
        assert!(out[1], "拨弦那一帧应为起音");
        assert_eq!(
            out[2..].iter().filter(|&&x| x).count(),
            0,
            "稳态期不得再报起音"
        );
    }

    #[test]
    fn 不应期内的第二次上升沿被抑制() {
        let mut d = OnsetDetector::new();
        let out = drive(
            &mut d,
            &[
                (0.0002, 0.0),
                (0.01, 0.100),  // 第 1 次上升沿
                (0.0002, 0.120), // 回落
                (0.01, 0.150),  // +50ms，仍在 75ms 不应期内
            ],
        );
        assert_eq!(out, vec![false, true, false, false]);
    }

    #[test]
    fn 超出不应期后重新判为起音() {
        let mut d = OnsetDetector::new();
        let out = drive(
            &mut d,
            &[
                (0.0002, 0.0),
                (0.01, 0.100),
                (0.0002, 0.150),
                (0.01, 0.200), // +100ms，已过不应期
            ],
        );
        assert_eq!(out, vec![false, true, false, true]);
    }

    #[test]
    fn 低于噪声门时即使相对涨幅很大也不算起音() {
        let mut d = OnsetDetector::new();
        // 0.0006 是 0.0001 的 6 倍，但仍在门限 0.0008 之下
        let out = drive(&mut d, &[(0.0001, 0.0), (0.0006, 0.0107)]);
        assert_eq!(out, vec![false, false]);
        assert!(d.gate() >= 0.0008);
    }

    #[test]
    fn 缓变渐强每帧一成不算起音() {
        let mut d = OnsetDetector::new();
        let mut rms = 0.001_f32;
        let mut samples = vec![(rms, 0.0_f64)];
        for i in 0..40 {
            rms *= 1.1;
            samples.push((rms, (i as f64 + 1.0) * 0.01067));
        }
        let out = drive(&mut d, &samples);
        assert_eq!(out.iter().filter(|&&x| x).count(), 0);
    }

    /// 绝对增量下限必须跟着门限缩放：门限被环境底噪抬起后，
    /// 同样幅度的上升沿不该再被判成起音（否则底噪大的房间里处处是「起音」）。
    #[test]
    fn 绝对增量下限跟着噪声底缩放() {
        let mut quiet = OnsetDetector::new();
        quiet.update(0.0002, 0.0);
        assert!(quiet.update(0.003, 0.0107), "安静环境：增量 0.0028 应判起音");

        let mut loud = OnsetDetector::new();
        loud.noise_floor = 0.02; // 模拟已被环境底噪抬起的门限
        loud.noise_floor_primed = true;
        loud.update(0.02, 0.0);
        assert!(
            !loud.update(0.03, 0.0107),
            "嘈杂环境：门限 0.03、增量下限 0.015 ⇒ 增量 0.01 不该判起音"
        );
    }

    #[test]
    fn reset清空全部状态() {
        let mut d = OnsetDetector::new();
        d.update(0.0002, 0.0);
        d.update(0.02, 0.0107);
        assert!(d.prev_rms.is_some());
        assert!(d.last_onset_at.is_some());

        d.reset();
        assert!(d.prev_rms.is_none());
        assert!(d.last_onset_at.is_none());
        assert!(!d.noise_floor_primed);
        // 重置后的首帧依然不是起音
        assert!(!d.update(0.5, 100.0));
    }

    #[test]
    fn 默认参数与另外两处实现一致() {
        let d = OnsetDetector::new();
        assert_eq!(d.relative_ratio, 1.45);
        assert_eq!(d.gate_delta_ratio, 0.5);
        assert_eq!(d.refractory, Duration::from_millis(75));
    }

    #[test]
    fn 带时钟包装器正常工作() {
        let mut c = ClockedOnsetDetector::new();
        assert!(!c.update(0.0002));
        assert!(c.update(0.02));
        // 紧接着的同等电平不会再触发（相对条件 + 不应期双保险）
        assert!(!c.update(0.02));
        assert!(c.gate() > 0.0);
        c.reset();
        assert!(!c.update(0.9));
    }
}
