# FretMaster Native (Tauri)

这是 FretMaster 的原生 Windows/macOS/Linux 版本，使用 Tauri 2.0 构建。

## 系统要求

### Windows
- Windows 10 或更高版本
- Microsoft Visual Studio C++ Build Tools
- Rust 1.70 或更高版本

### macOS
- macOS 10.15 或更高版本
- Xcode Command Line Tools
- Rust 1.70 或更高版本

### Linux
- Ubuntu 18.04 或更高版本
- build-essential
- libgtk-3-dev
- libwebkit2gtk-4.0-dev
- libappindicator3-dev
- librsvg2-dev
- Rust 1.70 或更高版本

## 安装 Rust

```bash
# Windows (PowerShell)
winget install Rustlang.Rust.MSVC

# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri:dev

# 构建
npm run tauri:build
```

## 音频功能

原生版本使用 Rust 实现高性能音频处理：

- **cpal**: 跨平台音频 I/O
- **YIN 算法**: 高精度音高检测
- **低延迟**: 5-10ms 延迟

## API

前端通过 `lib/native-audio.ts` 访问原生音频功能：

```typescript
import { nativeAudio, isTauri } from '@/lib/native-audio'

if (isTauri()) {
  // 使用原生音频 API
  const devices = await nativeAudio.getAudioDevices()
  await nativeAudio.startAudioCapture()
  const pitch = await nativeAudio.detectPitch()
}
```

## 构建产物

构建完成后，安装包位于：
- Windows: `src-tauri/target/release/bundle/msi/`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/deb/`
