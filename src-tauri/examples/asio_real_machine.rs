//! 真机验证：ASIO 后端能否真的启动采集（不使用任何桩件）。
//!
//! 背景：源码护栏只能证明「代码形状对」，证明不了「在这台机器的真实驱动上真的能建流」。
//! 本 example 直接调用生产代码路径 `AudioCapture::start_with_backend(..., Asio)`，
//! 打印：
//!   - 请求的后端 vs `backend()` 实际生效的后端（能立刻看出是否发生回退）
//!   - 采样率 / 延迟
//!   - 环形缓冲区里是否真的收到了非零样本（证明数据链路通了，而不是只有 stream 对象）
//!
//! 运行：
//!   cargo run --release --features asio --example asio_real_machine
//!
//! 判读：
//!   `backend() == Asio` + `非零样本 > 0` ⇒ 修复生效。
//!   若 `backend() == WasapiShared` ⇒ 仍在回退，日志里会有 warn 说明原因。

use fretmaster::audio::capture::AudioBackend;
use fretmaster::audio::AudioCapture;
use std::thread::sleep;
use std::time::Duration;

fn main() {
    println!("=== ASIO 真机验证（直接走生产代码路径）===");
    // 复现用户设置页的默认场景：目标采样率 48000（设备实际只支持 44100）。
    let target_sr = Some(48000u32);

    let mut cap = AudioCapture::new();
    let started = cap.start_with_backend(None, target_sr, AudioBackend::Asio);

    match &started {
        Ok(()) => println!("start_with_backend(Asio) → Ok"),
        Err(e) => println!("start_with_backend(Asio) → Err: {e}"),
    }

    // 🚨 关键判据：**实际生效的后端**。回退会把 backend 改写成 WasapiShared。
    let effective = cap.get_backend();
    println!(
        "请求后端 = Asio / 实际生效 = {:?} {}",
        effective,
        if effective == AudioBackend::Asio {
            "✅ 未回退"
        } else {
            "❌ 发生了回退（修复未生效）"
        }
    );

    if started.is_ok() {
        println!("sample_rate = {}", cap.get_sample_rate());
        println!("latency_ms  = {:.2}", cap.get_latency_ms());

        // 采 600ms，看环形缓冲区是否真的有非零数据（证明回调在跑且写入正确）
        let mut max_abs = 0.0f32;
        let mut non_zero_frames = 0usize;
        for _ in 0..30 {
            sleep(Duration::from_millis(20));
            let buf = cap.get_latest_samples(512);
            if !buf.is_empty() {
                let m = buf.iter().fold(0.0f32, |a, &b| a.max(b.abs()));
                if m > 1e-6 {
                    non_zero_frames += 1;
                }
                if m > max_abs {
                    max_abs = m;
                }
            }
        }
        println!(
            "采样 600ms：非零帧批次 = {}/30，峰值 |sample| = {:.6}",
            non_zero_frames, max_abs
        );
        if non_zero_frames > 0 {
            println!("✅ 回调确实在往环形缓冲区写数据");
        } else {
            // 静音环境下峰值可能就是 0，这不算失败，但要说明清楚。
            println!("⚠️ 未采到非零样本（若麦克风静音属正常；若持续为 0 需排查回调）");
        }
    }

    cap.stop();
    println!("=== 验证结束 ===");
}
