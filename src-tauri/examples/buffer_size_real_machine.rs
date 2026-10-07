//! 真机验证：设置页的「缓冲区大小」是否真正到达了音频流。
//!
//! 背景：设置页的下拉（256..4096）曾是**全程装饰品** ——
//!   ① 前端只写 store、从未调用 `set_buffer_size` 命令；
//!   ② 即便调了，`start_with_host` 也会用「10ms 目标自动值」（48k → 1024）
//!      把用户设置覆盖掉（`calculate_optimal_buffer_size`）。
//! 本 example 直连生产代码 `AudioCapture`，不经任何前端，给出
//! 「设置值 vs 流实际帧数」的硬对比。
//!
//! 运行（复用打包用的 release + asio feature 缓存）：
//!   cd src-tauri
//!   LIBCLANG_PATH="C:/Program Files/LLVM/bin" \
//!   CPAL_ASIO_DIR="$PWD/vendor/asiosdk" \
//!   cargo run --release --features asio --example buffer_size_real_machine
//!
//! 判读：
//!   FRAME_SIZE_STREAM == FRAME_SIZE_SET ⇒ 用户设置生效（修复后应有的样子）。
//!   FRAME_SIZE_STREAM == 1024（48kHz 的旧自动值）⇒ 设置被丢弃（缺陷态）。
//!   若设备拒绝固定缓冲，`start_with_host` 会回退 BufferSize::Default，
//!   此时 stream 帧数是设备默认值并在日志给出警告 —— 属设备侧限制，不是本缺陷。

use fretmaster::audio::capture::AudioBackend;
use fretmaster::audio::AudioCapture;

fn main() {
    println!("=== 「缓冲区大小」设置真机验证（直接走生产代码路径）===");

    let mut cap = AudioCapture::new();

    // 1) 模拟用户在设置页选了 4096（「稳定」档）——与前端调用的是同一个方法
    const SET_TO: usize = 4096;
    match cap.set_buffer_size(SET_TO) {
        Ok(()) => println!("[1] set_buffer_size({SET_TO}) → Ok"),
        Err(e) => {
            println!("[1] set_buffer_size({SET_TO}) → Err: {e}");
            std::process::exit(1);
        }
    }

    // 2) 起流（共享模式：不打扰其它程序；独占/ASIO 是另外的路径）
    match cap.start_with_backend(None, Some(48000), AudioBackend::WasapiShared) {
        Ok(()) => println!("[2] start_with_backend(WasapiShared, 48k) → Ok"),
        Err(e) => {
            println!("[2] 起流失败: {e}");
            std::process::exit(1);
        }
    }

    // 3) 读「流实际用的固定帧数」与延迟
    let frames = cap.get_buffer_frame_size();
    let latency = cap.get_latency_ms();
    let sr = cap.get_sample_rate();

    println!("SAMPLE_RATE={sr}");
    println!("FRAME_SIZE_SET={SET_TO}");
    println!("FRAME_SIZE_STREAM={frames}");
    println!("LATENCY_MS={latency:.2}");

    let pass = frames == SET_TO;
    println!(
        "VERDICT={}",
        if pass {
            "PASS（用户设置生效）"
        } else {
            "FAIL（用户设置被丢弃）"
        }
    );

    cap.stop();
    if !pass {
        std::process::exit(2);
    }
}
