# Windows 版本音频设置更新

## 概述

本次更新为 FretMaster Windows 版本添加了专门的音频设置界面，与 Web 版本的 AudioWorklet/ScriptProcessor 设置完全区分。

## 主要更改

### 1. 前端设置界面 (app/page.tsx)

- 使用条件渲染区分 Web 和 Windows 版本的音频设置
- Windows 版本使用新的 `WindowsAudioSettings` 组件
- Web 版本保留原有的 AudioWorklet/ScriptProcessor 设置

### 2. Windows 音频设置组件 (components/windows-audio-settings.tsx)

新增组件提供以下功能：

#### 设备选择
- 音频输入设备列表
- 刷新设备按钮
- 默认设备标记

#### 音频控制
- 启用/停止音频输入
- 实时延迟显示
- 音高检测结果显示（音符、八度、置信度、音量）

#### 性能设置
- **缓冲区大小**: 512/1024/2048/4096 选项
  - 512: 低延迟
  - 1024: 推荐
  - 2048: 平衡
  - 4096: 稳定
- **采样率**: 44.1kHz/48kHz/96kHz/192kHz

#### 滤波器设置
- **噪音抑制**: 0-100% 滑块
- **高通滤波**: 开关
- **低通滤波**: 开关
- **50Hz 陷波**: 开关（适用于欧洲/亚洲电源频率）
- **60Hz 陷波**: 开关（适用于北美电源频率）

#### 输入增益
- 0-200% 滑块控制

### 3. 原生音频 API (lib/native-audio.ts)

提供 Tauri 命令封装：

```typescript
// 设备管理
getAudioDevices(): Promise<AudioDeviceInfo[]>

// 音频捕获
startAudioCapture(deviceName?: string): Promise<void>
startAudioCaptureWithSampleRate(deviceName?: string, sampleRate?: number): Promise<void>
stopAudioCapture(): Promise<void>

// 音高检测
detectPitch(): Promise<PitchResult | null>

// 状态查询
getLatencyMs(): Promise<number>
getAudioStatus(): Promise<AudioStatus>

// 设置
setBufferSize(size: number): Promise<void>
setSampleRate(rate: number): Promise<void>
setNoiseSuppression(level: number): Promise<void>
setFilters(filters: FilterConfig): Promise<void>
```

### 4. Store 更新 (lib/store.ts)

添加 Windows 版本专用音频设置：

```typescript
interface AudioSettings {
  // ... 原有设置
  // Windows 版本专用
  bufferSize?: number
  sampleRate?: number
  noiseSuppression?: number
  enableHighPass?: boolean
  enableLowPass?: boolean
  enableNotch50?: boolean
  enableNotch60?: boolean
}
```

### 5. Tauri 后端命令 (src-tauri/src/commands/audio_commands.rs)

新增命令：

```rust
get_audio_status() -> AudioStatus
set_buffer_size(size: usize)
set_noise_suppression(level: f32)
set_audio_filters(filters: FilterConfig)
```

### 6. 预处理器更新 (src-tauri/src/audio/preprocessor.rs)

添加设置方法：

```rust
set_high_pass_filter(enabled: bool)
set_low_pass_filter(enabled: bool)
set_notch_filter_50hz(enabled: bool)
set_notch_filter_60hz(enabled: bool)
set_noise_suppression_level(level: f32)
```

### 7. 音频捕获更新 (src-tauri/src/audio/capture.rs)

添加缓冲区大小设置：

```rust
set_buffer_size(size: usize) -> Result<()>
```

## 与 SOLO 的对比

| 功能 | FretMaster Windows | SOLO |
|------|-------------------|------|
| 缓冲区大小 | 512-4096 可选 | 动态调整 |
| 采样率 | 44.1-192kHz 可选 | 通常固定 48kHz |
| 延迟显示 | 实时显示 | 实时显示 |
| 噪音抑制 | 可调级别 | 自适应 |
| 陷波滤波 | 50/60Hz 可选 | 通常自动 |
| 高通/低通 | 可开关 | 固定启用 |

## 使用建议

### 低延迟设置
- 缓冲区大小: 512 或 1024
- 采样率: 48kHz
- 关闭不必要的滤波器

### 高准确度设置
- 缓冲区大小: 2048 或 4096
- 采样率: 96kHz 或 192kHz
- 启用所有滤波器
- 噪音抑制: 50-70%

### 电源干扰处理
- 欧洲/亚洲用户: 启用 50Hz 陷波
- 北美用户: 启用 60Hz 陷波

## 技术实现

- **平台检测**: 使用 `isTauri()` 函数检测运行环境
- **条件渲染**: Web 和 Windows 版本显示不同设置界面
- **状态管理**: 使用 Zustand store 统一管理设置
- **后端通信**: 通过 Tauri invoke 调用 Rust 命令
- **实时更新**: 音高检测和延迟显示实时更新

## 后续优化方向

1. **动态缓冲区**: 根据系统负载自动调整缓冲区大小
2. **ASIO 支持**: 添加专业音频接口的 ASIO 驱动支持
3. **延迟优化**: 实现 WASAPI 独占模式进一步降低延迟
4. **预设配置**: 提供"低延迟"/"高准确度"等预设配置
5. **音频可视化**: 添加实时波形和频谱显示
