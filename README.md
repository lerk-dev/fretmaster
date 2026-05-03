# 🎸 FretMaster

<div align="center">

**专业吉他指板视觉化练习工具 | Professional Guitar Fretboard Visualization Practice Tool**

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1.0-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.1.69-orange.svg)](https://github.com/lerk-dev/fretmaster)

[在线演示](#) | [功能特点](#-功能特点) | [快速开始](#-快速开始) | [练习指南](#-练习指南) | [部署](#-部署指南)

</div>

---

## 📖 目录

- [应用概述](#-应用概述)
- [功能特点](#-功能特点)
- [技术栈](#-技术栈)
- [版本说明](#-版本说明)
- [环境要求](#-环境要求)
- [快速开始](#-快速开始)
- [详细使用说明](#-详细使用说明)
- [练习指南](#-练习指南)
- [练习模式系统](#-练习模式系统)
- [注意事项](#-注意事项)
- [故障排除](#-故障排除)
- [部署指南](#-部署指南)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)
- [联系方式](#-联系方式)

---

## 🎯 应用概述

FretMaster 是一款专为吉他手设计的指板视觉化练习工具，基于 SOLO Guitar Trainer 的设计理念，采用现代 Web 技术构建。通过系统化的练习模式和实时音频反馈，帮助吉他手提高指板熟悉度、音程识别能力和和弦演奏技巧。

### 核心特性

- 🎵 **实时音高检测** - 基于 YIN 算法的高精度音高识别
- 🎸 **完整指板可视化** - 支持6/7弦吉他、4/5弦贝斯
- 📊 **50+ 练习模式** - 从基础到高级的完整练习体系
- 🎯 **智能练习建议** - 根据乐器类型提供个性化建议
- 🌙 **Focus 模式** - 沉浸式练习体验
- 📱 **响应式设计** - 支持桌面端和移动端
- 🌍 **多语言支持** - 中文/英文双语界面

---

## 🌟 功能特点

### 🎵 调音器 (Tuner)

- 实时麦克风输入检测
- 支持标准调音和多种替代调音
- 精确的音分偏差显示
- 可调节灵敏度和置信度阈值

### 🎹 指板可视化

- 完整的吉他指板展示（支持6-24品）
- 多种显示模式：
  - 中文音名（C, C#, D...）
  - 英文音名（Do, Di, Re...）
  - 简写模式（1, b2, 2...）
  - 爵士记谱（1, #1, 2...）
- 支持显示/隐藏特定音符
- 左手/右手模式切换

### 🎼 音程练习 (Interval Training)

- 识别和演奏各种音程（小二度到纯八度及以上）
- 支持12种音程类型
- 可调节练习难度
- 实时反馈和评分系统

### 🎸 和弦练习 (Chord Training)

- 支持50+练习模式
- 多种和弦类型：
  - 大三和弦、小三和弦
  - 属七和弦、大七和弦、小七和弦
  - 减和弦、增和弦
  - 挂留和弦、六和弦
- Voice Leading 练习
- 经过音练习

### 🎶 音阶练习 (Scale Training)

- 多种音阶类型：
  - 五声音阶（大调/小调）
  - 自然大调/小调
  - 调式音阶（Ionian, Dorian, Phrygian等）
  - 布鲁斯音阶
  - Bebop音阶
  - 全音阶、减音阶
- 多种练习模式：
  - 上行/下行/随机
  - 根音移动（静态/随机/半音/五度圈）
  - 旋律序列（1→1, 3→3, 5→5, 7→7, 随机）

### 🎯 找音练习 (Note Finding)

- 提高对指板的熟悉程度
- 随机音符生成
- 计时挑战模式

### 🎵 和弦进行 (Chord Progressions)

- 内置经典歌曲和弦进行
- 支持自定义和弦序列
- 导入/导出功能
- 智能练习建议

### 📊 练习统计

- 每日练习记录
- 分类统计（按练习类型）
- 进度追踪
- 数据导出

---

## 📦 版本说明

FretMaster 提供两种版本，满足不同使用场景的需求：

| 版本 | 适用场景 | 特点 |
|------|----------|------|
| **Web 版** | 在线使用、路由器部署 | 无需安装，浏览器即开即用 |
| **桌面版 (EXE)** | Windows 本地使用 | 独立运行，更好的音频性能 |

### Web 版

Web 版是 FretMaster 的基础版本，基于 Next.js 构建，支持部署到任何静态文件服务器。

**访问方式**：
- GitHub Pages: `https://lerk-dev.github.io/fretmaster/`
- 路由器本地部署: `http://192.168.123.2/fretmaster/`

### 桌面版 (EXE)

桌面版基于 [Tauri 2.0](https://tauri.app/) 构建，将 Web 技术与原生桌面应用相结合，提供更佳的用户体验。

#### 功能特性

- **独立运行** - 无需浏览器，双击即可启动
- **原生音频接口** - 直接访问系统音频设备，延迟更低
- **离线使用** - 无需网络连接，随时随地练习
- **系统集成** - 支持系统托盘、开机自启（计划中）
- **自动更新** - 支持在线检查更新（计划中）
- **数据持久化** - 使用 SQLite 本地数据库，数据更安全

#### 系统环境要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| **操作系统** | Windows 10 (1809+) | Windows 11 |
| **架构** | x86_64 (64位) | x86_64 (64位) |
| **内存** | 4 GB | 8 GB |
| **存储空间** | 200 MB | 500 MB |
| **音频设备** | 内置声卡 | 外置音频接口 |
| **麦克风** | 内置麦克风 | 外置电容麦克风 |

#### 安装步骤

##### 方法一：安装包安装（推荐）

1. **下载安装包**
   - 从 [GitHub Releases](https://github.com/lerk-dev/fretmaster/releases) 下载最新版本的 `FretMaster_x64-setup.exe`

2. **运行安装程序**
   - 双击下载的 `.exe` 文件
   - 按照安装向导提示完成安装
   - 安装程序会自动安装所需的 WebView2 运行时（如未安装）

3. **启动应用**
   - 安装完成后，桌面会生成快捷方式
   - 双击快捷方式即可启动 FretMaster

##### 方法二：便携版使用

1. **下载便携版**
   - 从 [GitHub Releases](https://github.com/lerk-dev/fretmaster/releases) 下载 `FretMaster_x64.exe`

2. **直接运行**
   - 将 `.exe` 文件复制到任意位置
   - 双击即可运行，无需安装

#### 使用方法

##### 首次启动

1. 启动应用后，会显示主界面
2. 首次使用需要允许麦克风权限
3. 建议先进入「设置」进行个性化配置：
   - 选择乐器类型（吉他/贝斯）
   - 设置调音标准
   - 调整音频输入设备

##### 日常使用

```
1. 启动 FretMaster
2. 选择练习模式（调音器/找音/音程/和弦/音阶/进行）
3. 根据需要调整练习设置
4. 点击「开始练习」
5. 练习过程中实时查看反馈
6. 练习结束后查看统计数据
```

##### 音频设备设置

桌面版支持更精细的音频设备控制：

1. 点击右上角的「设置」按钮
2. 选择「音频设置」标签页
3. 选择输入设备（麦克风）
4. 调整采样率和缓冲区大小
5. 测试音频输入

#### 常见问题解决

##### 1. 启动时提示缺少 WebView2

**问题描述**：运行应用时弹出错误提示，要求安装 WebView2

**解决方案**：
- 安装包版本会自动安装 WebView2，如失败请手动下载：
  - 访问 [WebView2 运行时下载页](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
  - 下载「Evergreen Standalone Installer」
  - 安装后重新启动 FretMaster

##### 2. 麦克风无法识别

**问题描述**：应用中无法检测到麦克风输入

**解决方案**：
1. 检查系统隐私设置：
   - 打开「设置」→「隐私」→「麦克风」
   - 确保「允许应用访问麦克风」已开启
2. 检查应用内音频设置：
   - 进入「设置」→「音频设置」
   - 确认已选择正确的输入设备
3. 测试麦克风：
   - 使用系统自带的「声音设置」测试麦克风
   - 确认麦克风硬件正常工作

##### 3. 音高检测延迟高

**问题描述**：弹奏后，音高显示有明显延迟

**解决方案**：
1. 降低缓冲区大小：
   - 进入「设置」→「音频设置」
   - 将「缓冲区大小」从 2048 改为 512 或 256
2. 关闭其他占用音频的应用
3. 使用 ASIO 驱动（专业声卡）

##### 4. 应用闪退或卡顿

**问题描述**：应用运行过程中突然关闭或卡顿

**解决方案**：
1. 检查系统资源：
   - 关闭其他占用内存的应用
   - 确保系统内存 >= 4GB
2. 更新显卡驱动
3. 以管理员身份运行应用
4. 检查 Windows 更新

##### 5. 数据丢失

**问题描述**：练习数据或设置丢失

**解决方案**：
1. 数据存储位置：
   - 数据库文件：`%APPDATA%\com.fretmaster.app\fretmaster.db`
   - 配置文件：`%APPDATA%\com.fretmaster.app\config.json`
2. 定期备份上述文件
3. 避免直接删除应用数据文件夹

#### 版本更新日志

##### v0.2.x (当前版本)

- **新增** 桌面版应用（Tauri 构建）
- **新增** 原生音频接口支持
- **新增** SQLite 本地数据持久化
- **新增** Windows 音频设备选择
- **优化** 音高检测算法（YIN + FFT）
- **优化** 指板渲染性能
- **修复** 多个 Hydration 错误
- **修复** 音频设备切换问题

##### v0.1.x

- **新增** 基础 Web 版应用
- **新增** 调音器、找音、音程、和弦、音阶练习
- **新增** 50+ 练习模式
- **新增** 练习统计功能
- **新增** 多语言支持（中/英文）

#### 与其他版本的差异说明

| 功能特性 | Web 版 | 桌面版 (EXE) |
|----------|--------|--------------|
| **安装方式** | 无需安装 | 安装包/便携版 |
| **网络依赖** | 需要网络 | 完全离线 |
| **音频延迟** | 较高（浏览器限制） | 较低（原生接口） |
| **音频设备** | 浏览器默认设备 | 可选择系统所有设备 |
| **数据存储** | localStorage/IndexedDB | SQLite 数据库 |
| **数据安全** | 受浏览器清理影响 | 独立存储，更安全 |
| **系统托盘** | 不支持 | 支持（计划中） |
| **开机自启** | 不支持 | 支持（计划中） |
| **自动更新** | 刷新页面即可 | 支持在线检查（计划中） |
| **跨平台** | 任何设备 | 仅 Windows |

#### 构建桌面版

如需自行构建桌面版，请参考以下步骤：

```bash
# 1. 确保已安装 Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 安装 Tauri CLI
cargo install tauri-cli

# 3. 构建前端
npm run build

# 4. 构建桌面版
cargo tauri build

# 5. 输出文件位置
# src-tauri/target/release/bundle/nsis/FretMaster_x64-setup.exe
# src-tauri/target/release/bundle/msi/FretMaster_x64.msi
```

---

## 🛠️ 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| **框架** | Next.js | 16.1.6 |
| **UI库** | React | 19.1.0 |
| **语言** | TypeScript | 5.8 |
| **样式** | Tailwind CSS | 3.4 |
| **组件** | shadcn/ui + Radix UI | Latest |
| **状态管理** | Zustand | 5.0.12 |
| **音频处理** | Web Audio API + YIN算法 | - |
| **图表** | Recharts | 2.15.2 |
| **动画** | Framer Motion | 12.38.0 |

---

## 💻 环境要求

### 开发环境

- **Node.js**: >= 18.17.0 (推荐 20.x)
- **npm**: >= 9.0.0 或 **pnpm**: >= 8.0.0
- **浏览器**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

### 运行环境

- 现代浏览器（支持 Web Audio API）
- 麦克风权限（用于音高检测）
- HTTPS 连接（生产环境必需，用于麦克风访问）

### 部署环境

- **路由器部署**: OpenWrt/Padavan 等 Linux 路由器
- **服务器部署**: Node.js 环境 或 静态文件服务器
- **云部署**: Vercel, Netlify, Cloudflare Pages 等

---

## 🚀 快速开始

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/lerk-dev/fretmaster.git
cd fretmaster

# 2. 安装依赖
npm install
# 或使用 pnpm
pnpm install

# 3. 启动开发服务器
npm run dev

# 4. 打开浏览器访问
# http://localhost:3000
```

### 生产构建

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm run start
```

### HTTPS 开发模式

```bash
# 启动 HTTPS 开发服务器（用于麦克风测试）
npm run dev:https
```

---

## 📖 详细使用说明

### 界面导航

```
┌─────────────────────────────────────────────────────────────┐
│  🎸 FretMaster          [设置] [主题] [语言] [全屏]         │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────────────────────────────────────────┐ │
│ │         │ │                                             │ │
│ │  侧边栏  │ │              主练习区域                      │ │
│ │         │ │                                             │ │
│ │ • 调音器 │ │   ┌─────────────────────────────────────┐   │ │
│ │ • 找音   │ │   │                                     │   │ │
│ │ • 音程   │ │   │         指板可视化                   │   │ │
│ │ • 和弦   │ │   │                                     │   │ │
│ │ • 音阶   │ │   └─────────────────────────────────────┘   │ │
│ │ • 进行   │ │                                             │ │
│ │         │ │   ┌─────────────────────────────────────┐   │ │
│ │         │ │   │         练习控制面板                 │   │ │
│ │         │ │   └─────────────────────────────────────┘   │ │
│ └─────────┘ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  [调音器] [找音] [音程] [和弦] [音阶] [进行]     底部导航   │
└─────────────────────────────────────────────────────────────┘
```

### 核心功能操作流程

#### 1. 调音器使用

```
1. 点击侧边栏的"调音器"或底部导航
2. 允许麦克风权限
3. 弹奏吉他弦
4. 观察音高指示器：
   - 绿色：音准正确
   - 红色左：音偏低
   - 红色右：音偏高
5. 调整弦钮直到指示器居中
```

#### 2. 音程练习流程

```
1. 选择"音程"标签页
2. 选择要练习的音程类型
3. 设置练习选项：
   - 显示指板：开/关
   - 自动下一题：开/关
   - 延迟时间：0-5秒
4. 点击"开始练习"
5. 根据提示弹奏目标音程
6. 系统自动检测并反馈结果
```

#### 3. 和弦练习流程

```
1. 选择"和弦"标签页
2. 选择练习模式（1-50级）
3. 选择和弦类型
4. 设置 Voice Leading 选项（可选）
5. 点击"开始练习"
6. 按提示弹奏和弦音
7. 完成后显示评分和正确率
```

#### 4. 音阶练习流程

```
1. 选择"音阶"标签页
2. 选择音阶类型和调性
3. 设置练习选项：
   - 方向：上行/下行/随机
   - 根音移动：静态/半音/五度圈
   - 旋律序列：1→1, 3→3, 5→5, 7→7, 随机
4. 点击"开始练习"
5. 按顺序弹奏音阶音符
```

### 键盘快捷键

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `ESC` | 停止练习 | 退出全屏或停止当前练习 |
| `1` | 调音器 | 切换到调音器标签页 |
| `2` | 找音练习 | 切换到找音标签页 |
| `3` | 音程练习 | 切换到音程标签页 |
| `4` | 和弦练习 | 切换到和弦标签页 |
| `5` | 音阶练习 | 切换到音阶标签页 |
| `F` | 全屏模式 | 切换全屏显示 |
| `M` | 麦克风开关 | 开启/关闭麦克风 |
| `S` | 设置面板 | 打开设置对话框 |
| `P` | 开始/停止 | 开始或停止练习 |
| `H` | 帮助 | 显示快捷键帮助 |
| `空格` / `→` | 下一题 | 跳到下一个练习 |
| `↑` | 显示指板 | 显示指板提示 |
| `↓` | 隐藏指板 | 隐藏指板提示 |

---

## 🎓 练习指南

### 推荐练习场景

#### 初学者（0-6个月）

```
第1-2周：找音练习 + 调音器
  - 熟悉指板上各位置的音名
  - 养成调音习惯

第3-4周：音程练习（小二度、大二度）
  - 练习模式：1-5
  - 重点：根音和三音

第2个月：和弦练习（单和弦音）
  - 练习模式：1-4
  - 和弦类型：Major, Minor

第3-6个月：音阶练习（五声音阶）
  - 大调五声音阶
  - 小调五声音阶
```

#### 进阶者（6个月-2年）

```
音程练习：所有音程类型
  - 练习模式：全部
  - 增加速度要求

和弦练习：双和弦音 + 三和弦音
  - 练习模式：5-15
  - Voice Leading 基础

音阶练习：调式音阶
  - Ionian, Dorian, Mixolydian
  - 练习旋律序列
```

#### 高级者（2年以上）

```
和弦练习：Voice Led + 经过音
  - 练习模式：30-50
  - 所有和弦类型

音阶练习：Bebop + 变化音阶
  - Bebop Major, Dorian, Mixolydian
  - Altered, Half-Whole Diminished

和弦进行：标准爵士曲目
  - ii-V-I 练习
  - Rhythm Changes
```

### 进阶技巧

#### 1. Voice Leading 练习

Voice Leading 是指在和弦转换时，各声部以最小移动距离进行连接。练习要点：

- 识别共同音（两个和弦共有的音）
- 找到最近的非共同音
- 练习模式：Voice Led Structures (等级 30-34)

#### 2. 经过音练习

经过音是在和弦音之间添加的非和弦音，用于创造更流畅的旋律线：

- Bebop 音阶中的经过音
- 练习模式：Passing Note Chord Scales (等级 45-49)

#### 3. Focus 模式

Focus 模式提供沉浸式练习体验：

- 全屏显示
- 屏幕常亮（Wake Lock）
- 隐藏干扰元素
- 计时功能

---

## 📊 练习模式系统

### 等级分组

| 组别 | 等级范围 | 描述 | 难度 |
|------|----------|------|------|
| **Single Chord Tones** | 1-4 | 单和弦音：根音、三音、五音、七音 | ⭐ |
| **Two Chord Tones** | 5-10 | 双和弦音组合 | ⭐⭐ |
| **Three Chord Tones** | 11-13 | 三和弦音及转位 | ⭐⭐ |
| **Four Chord Tones** | 14-21 | 四和弦音及转位 | ⭐⭐⭐ |
| **Melodic Structures (Root-5th)** | 22-26 | 旋律结构：根音到五音 | ⭐⭐⭐ |
| **Melodic Structures (5th-9th)** | 27-31 | 旋律结构：五音到九音 | ⭐⭐⭐⭐ |
| **Voice Led Structures** | 32-36 | Voice Led 声部连接 | ⭐⭐⭐⭐ |
| **Suspended Structures** | 37-38 | 挂留结构 | ⭐⭐⭐⭐ |
| **Chord Scales** | 39-44 | 和弦音阶 | ⭐⭐⭐⭐⭐ |
| **Passing Note Chord Scales** | 45-49 | 经过音和弦音阶 | ⭐⭐⭐⭐⭐ |

### 和弦类型支持

| 类别 | 和弦类型 |
|------|----------|
| **基础** | Major, Minor, Dim, Aug |
| **七和弦** | 7, Maj7, m7, m7b5, dim7, mMaj7 |
| **六和弦** | 6, m6 |
| **挂留** | sus2, sus4, 7sus4 |
| **九和弦** | 9, Maj9, m9, 7b9, 7#9 |
| **十一和弦** | 11, m11, 9#11 |
| **十三和弦** | 13, 13b9, 13#11 |
| **变化** | 7b5, 7#5, aug7, maj7#5 |

---

## ⚠️ 注意事项

### 常见问题

#### 1. 麦克风无法使用

**原因**：浏览器安全策略要求 HTTPS 连接

**解决方案**：
- 本地开发：使用 `npm run dev:https`
- 生产环境：确保使用 HTTPS
- 检查浏览器麦克风权限设置

#### 2. 音高检测不准确

**可能原因**：
- 环境噪音过大
- 麦克风灵敏度设置不当
- 演奏音量过低

**解决方案**：
- 在安静环境练习
- 调整设置中的灵敏度和置信度阈值
- 尝试使用外接麦克风

#### 3. 移动端显示问题

**解决方案**：
- 使用最新版 Chrome 或 Safari
- 确保屏幕旋转锁定关闭
- 刷新页面重新加载

### 限制条件

1. **浏览器兼容性**
   - 不支持 IE 浏览器
   - iOS Safari 需要用户交互才能播放音频

2. **音频输入**
   - 需要 HTTPS 环境
   - 需要用户授权麦克风权限

3. **性能要求**
   - 建议使用现代设备
   - 低端设备可能存在延迟

### 安全提示

1. **数据安全**
   - 所有练习数据存储在本地
   - 不会上传到服务器

2. **隐私保护**
   - 麦克风音频仅用于音高检测
   - 不会录制或存储音频

---

## 🔧 故障排除

### 开发环境问题

#### Node.js 版本不兼容

```bash
# 检查 Node.js 版本
node -v

# 推荐使用 nvm 管理版本
nvm install 20
nvm use 20
```

#### 依赖安装失败

```bash
# 清除缓存重新安装
rm -rf node_modules package-lock.json
npm install

# 或使用 pnpm
pnpm install --force
```

### 运行时问题

#### 白屏问题

```bash
# 清除构建缓存
rm -rf .next dist
npm run build
```

#### 音频工作问题

```javascript
// 检查浏览器支持
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  console.log('支持麦克风访问')
}

if (window.AudioContext || window.webkitAudioContext) {
  console.log('支持 Web Audio API')
}
```

### 部署问题

#### 路由器部署

```bash
# 检查磁盘空间
df -h

# 检查 uhttpd 配置
cat /etc/config/uhttpd

# 重启服务
/etc/init.d/uhttpd restart
```

---

## 🚀 部署指南

### GitHub Pages 部署

```bash
# 1. 构建静态版本
npm run build

# 2. 部署到 GitHub Pages
# 在 GitHub 仓库设置中启用 Pages，选择分支 + /dist 目录
```

### Vercel 部署

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 部署
vercel

# 3. 生产部署
vercel --prod
```

### 路由器部署

#### 环境要求

- OpenWrt / Padavan / 其他 Linux 路由器
- 可用存储空间 >= 50MB
- uhttpd 或其他 Web 服务器

#### 部署步骤

```bash
# 1. 构建静态文件
npm run build

# 2. 压缩 dist 目录
cd dist && tar -czvf ../fretmaster.tar.gz .

# 3. 上传到路由器
scp fretmaster.tar.gz root@192.168.1.1:/tmp/

# 4. SSH 登录路由器
ssh root@192.168.1.1

# 5. 解压到 Web 目录
mkdir -p /www/fretmaster
cd /www/fretmaster
tar -xzvf /tmp/fretmaster.tar.gz

# 6. 配置 uhttpd
# 编辑 /etc/config/uhttpd，添加：
# option home '/www/fretmaster'

# 7. 重启服务
/etc/init.d/uhttpd restart

# 8. 访问 http://192.168.1.1/fretmaster
```

#### 自动部署脚本

```powershell
# Windows PowerShell
# deploy-to-router.ps1

$routerIP = "192.168.1.1"
$routerUser = "root"
$deployPath = "/www/fretmaster"

# 构建项目
npm run build

# 创建部署包
Compress-Archive -Path dist/* -DestinationPath fretmaster.zip

# 上传到路由器
scp fretmaster.zip "${routerUser}@${routerIP}:/tmp/"

# SSH 执行部署命令
ssh "${routerUser}@${routerIP}" "cd $deployPath && unzip -o /tmp/fretmaster.zip"
```

### Docker 部署

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
# 构建镜像
docker build -t fretmaster .

# 运行容器
docker run -d -p 80:80 fretmaster
```

---

## 🤝 贡献指南

### 开发流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

### 代码规范

- 使用 TypeScript 编写代码
- 遵循 ESLint 规则
- 组件使用函数式组件 + Hooks
- 样式使用 Tailwind CSS

### 提交信息规范

```
feat: 新功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建/工具相关
```

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 📞 联系方式

- **GitHub Issues**: [https://github.com/lerk-dev/fretmaster/issues](https://github.com/lerk-dev/fretmaster/issues)
- **项目主页**: [https://github.com/lerk-dev/fretmaster](https://github.com/lerk-dev/fretmaster)

---

## 🙏 致谢

- [SOLO Guitar Trainer](https://play.google.com/store/apps/details?id=app.solotrainer.solo) - 设计理念来源
- [shadcn/ui](https://ui.shadcn.com/) - UI 组件库
- [Radix UI](https://www.radix-ui.com/) - 无障碍组件基础
- [Tailwind CSS](https://tailwindcss.com/) - 样式框架

---

<div align="center">

**Made with ❤️ by [lerk-dev](https://github.com/lerk-dev)**

**如果这个项目对你有帮助，请给一个 ⭐ Star 支持一下！**

</div>
