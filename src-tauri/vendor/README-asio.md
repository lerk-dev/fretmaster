# 启用 ASIO 支持（本地构建用）

> ⚠️ **本目录下的 `asiosdk/` 不会被提交**（见根目录 `.gitignore` 的 `src-tauri/vendor/asiosdk/`）。
> 本文档说明如何在本机自行准备它。

## 为什么不能把 SDK 提交进仓库

Steinberg ASIO SDK 是**专有许可**（`Steinberg ASIO 2.3.3 Licensing Agreement V2.0.3 - 2023.pdf`），要点：

- 未经商业授权，**不得再分发** SDK 或含其代码的产物；
- 该许可**与 GPLv3 不兼容**。

本项目是 **MIT + 公开仓库**（`github.com/lerk-dev/fretmaster`），把 SDK 提交上去会引入法律风险。
因此 SDK 只放本地、被 `.gitignore` 忽略。这是**刻意的**，不要"顺手"把它加进版本控制。

> 参考：Debian 的 `wsjtx` 打包文档明确写道——
> *"the Steinberg ASIO SDK license prevents redistribution of drivers or hosting applications
> without a commercial license agreement, nor is the Steinberg ASIO SDK license compatible
> with the GPL v3 license."*

---

## 一、准备 SDK

1. 下载官方 SDK（2019-06-14 版，Steinberg 于 2023 年更新过许可协议内容）：

   ```
   https://download.steinberg.net/sdk_downloads/asiosdk_2.3.3_2019-06-14.zip
   ```
   备用入口：`https://www.steinberg.net/asiosdk`

2. **校验完整性**（务必做，避免拿到被篡改的包）：

   ```
   sha512 = d74c0bc09162640a377aaab2f2ce716f9ee7a6ef8d1aa1aa6bc223a4748c60fa900cc77b1cf6db66f8a4064a074b31a71d75cccc7de3634347865238d9c039af
   ```
   校验命令（Git Bash）：
   ```bash
   sha512sum asiosdk_2.3.3_2019-06-14.zip
   ```
   > 注：网上流传的 2019 年 **sha256** `80f5bf27…` 已失效——Steinberg 在 2023 年更换了许可协议文件，
   > 导致整个 zip 的哈希变化。请以 **sha512** 为准。

3. 解压，并把顶层目录放到本目录下、**重命名为 `asiosdk`**：

   ```
   src-tauri/vendor/asiosdk/
     ├── common/        ← 必须有（asio.h / asio.cpp …）
     ├── host/          ← 必须有（asiodrivers.cpp …）
     ├── driver/        ← 样例驱动，可留可删
     └── asio/          ← 样例宿主
   ```
   `cpal` 只要求 `common/` 与 `host/` 存在且结构正确。

## 二、设置环境变量

`CPAL_ASIO_DIR` 必须指向**上面那个 `asiosdk` 目录本身**（不是它的父级）。
用**绝对 Windows 路径**（反斜杠）：

```bash
# Git Bash（仅当前会话）
export CPAL_ASIO_DIR='E:\fretmasterui\b_WXSxmM0U95a-1773316568068\src-tauri\vendor\asiosdk'

# PowerShell（仅当前会话）
$env:CPAL_ASIO_DIR = 'E:\fretmasterui\b_WXSxmM0U95a-1773316568068\src-tauri\vendor\asiosdk'

# 永久（用户级）
setx CPAL_ASIO_DIR 'E:\fretmasterui\b_WXSxmM0U95a-1773316568068\src-tauri\vendor\asiosdk'
```

> ⚠️ 改了 `CPAL_ASIO_DIR` 后必须让 **cargo 重新编译 `asio-sys`**，
> 否则旧的 build script 结果会被缓存。稳妥做法：
> `cargo clean -p asio-sys` 后再构建。

## 三、构建

```bash
cd src-tauri

# 只验证能否编译
cargo check --features asio

# 出安装包（ASIO 版）
npx tauri build --features asio
# 或走 npm 脚本
npm run tauri:build:asio
```

产物同样落在 `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`。

> 🚨 **ASIO 版的安装包不要对外分发**——它静态链接了 ASIO SDK 代码。
> 自用没问题；若要分发，需要先取得 Steinberg 的商业授权。

---

## 四、构建出来的东西行为如何

### ASIO 不可用时会自动回退

用户在后端选择里挑 "ASIO" 时，只要**任一环节不可用**，`start_with_backend`
（`src-tauri/src/audio/capture.rs`）都会记一条 warn 日志并**回退到 WASAPI 共享模式**，
而不是直接失败。前端 `windows-audio-settings.tsx` 会读取 `get_audio_status` 的
`backend` 字段，在界面上显示**实际生效的后端**，所以回退对用户是可见的。

可能触发回退的情形：
- 本次构建**未启用** `asio` feature（即普通 `--features` 为默认的构建）；
- `CPAL_ASIO_DIR` 未设 / SDK 结构不对，导致 `cpal::host_from_id(HostId::Asio)` 失败；
- 本机**没有安装任何 ASIO 驱动**（纯板载声卡通常就是这种情况）；
- ASIO 设备被其他程序独占。

### 常见误区

- **普通构建选 ASIO 不会报错**，只是静默回退到共享。要确认真的用上了 ASIO，
  请去音频设置页看"实际生效的后端"是不是 `asio`。
- ASIO **不经过 Windows 音量混音器**，系统音量滑块对它无效（这是 ASIO 的设计，不是 bug）。
- ASIO 的设备名与 WASAPI 完全不同。`start_asio` 里已经做了兼容：
  前端传来的 WASAPI 名称在 ASIO host 下找不到时，会改用 **ASIO 默认设备**并记 warn 日志。
