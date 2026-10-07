# FretMaster 代码全面审查报告

审查日期：2026-07-28
审查范围：音高识别、练习模式逻辑、统计记录、i18n、主题系统、快捷键、全屏模式

共发现 **40+ 个问题**，按优先级分类如下。

---

## P0 严重问题（直接影响核心功能）

### A. 音高识别（exe 卡死/不准的根因）

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | **YIN 采样率硬编码 48000** | `app/page.tsx:7863, 7895` | 改为 `sampleRate`（7793 行已取） |
| 2 | **AGC 硬 clipping 引入奇次谐波** | `src-tauri/src/audio/pipeline.rs:117` | `(x*gain).clamp` → `tanh(x*gain)` |
| 3 | **base_volume 初始值负数，前两次检测失效** | `src-tauri/src/audio/pitch.rs:123` | 改 `0.0`，首次直接赋值 |
| 4 | **Tauri 路径 processPracticeMatch 缺反馈/冷却/lastChordNote** | `app/page.tsx:7458-7662` | 补齐 `triggerCorrectFeedback`/`isCoolingDownRef`/`lastChordNoteRef` |
| 5 | **Voice-led 仅 Web Audio 路径工作** | MIDI/指板点击/Tauri 路径未设 `lastChordNoteRef` | 多处补 `lastChordNoteRef.current = note` |

#### 详细分析

**Bug 1: YIN 算法采样率硬编码 48000**
- 位置: `app/page.tsx:7863` 和 `app/page.tsx:7895`
- 7853 行的 SOLO 路径正确使用 `sampleRate`，但标准 YIN 路径硬编码 48000
- Tauri WebView2 中，若 Windows 默认录音设备只支持 44100Hz，`audioContext.sampleRate` 实际是 44100
- YIN 用 48000 解释 44100 采样的数据，计算频率 = 实际频率 × (48000/44100) ≈ 实际频率 × 1.088，**偏高约 1.46 半音**
- 修复: 将 7863 和 7895 行的 `48000` 改为 `sampleRate`

**Bug 2: AGC 硬 clipping 引入谐波失真**
- 位置: `src-tauri/src/audio/pipeline.rs:117`
- `agc_max_gain = 10.0`，AGC 可能放大 10 倍
- 当信号较大时，`x * gain` 超过 1.0 会被硬 clipping 到 1.0
- 硬 clipping 引入奇次谐波（3rd, 5th, ...），干扰 YIN 的基频检测
- 修复: `x * gain / (1.0 + (x * gain).abs())` 或 `tanh(x * gain)`

**Bug 3: base_volume 初始值负数**
- 位置: `src-tauri/src/audio/pitch.rs:123, 544-549`
- 初始值 `base_volume: -1.99`
- 首次调用: -1.99+1=-0.99（仍 ≤0），跳过阈值检查
- 第二次: -0.99+1=0.01，才开始正常逻辑
- 应用启动后**前两次 detect_pitch（约 200ms）不会建立 noise floor 基线**，可能将环境噪声误判为信号
- 修复: 初始值改 `0.0`，首次调用直接 `self.base_volume = volume`

**Bug 4: Tauri 路径 processPracticeMatch 缺关键逻辑**
- 位置: `app/page.tsx:7458-7662`
- 对比 `processPitchMatch`（7138 行，Web 路径）：
  - Tauri 路径不调用 `triggerCorrectFeedback` → **无视觉反馈**
  - Tauri 路径不设置 `isCoolingDownRef` → **可能重复匹配**
  - Tauri 路径不设置 `lastChordNoteRef` → **voice-led 失效**
- 修复: 补齐所有分支的关键逻辑

**Bug 5: Voice-led 仅在 Web Audio 路径工作**
- `lastChordNoteRef.current` 仅在 7342 行（processPitchMatch chord 分支）被赋值
- 未赋值的路径：
  - `processPracticeMatch`（Tauri）的 chord 分支（7621-7658）
  - `handleMIDINoteInput`（MIDI 输入）的 chord 分支（8691-8725）
  - `handleFretClick`（指板点击）→ 调用 handleMIDINoteInput
- 在这三种场景下，voice-led 永远不会触发
- 修复: 在所有 chord 分支答对时补充 `lastChordNoteRef.current = note`

### B. 统计记录错误

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 6 | **切 Tab 时 score 记为 0** | `app/page.tsx:6101` | 显式传 `score: accuracy` |
| 7 | **CGI 白名单不匹配，Web 端类型全丢** | `cgi-stats-fixed.sh:142` | 补全中文全称 |
| 8 | **saveToServer 写在 state updater 内（重复保存）** | `app/page.tsx:5949-6040` | 移出 updater |

#### 详细分析

**Bug 6: 切 Tab 时 score 记为 0**
- 位置: `app/page.tsx:6101`
- 会话结束 useEffect 在 `isPlaying` true→false 时触发，调用 `recordPractice` 时只传 `{ duration, accuracy }`
- `recordPractice` 内部回退到 `realScore = Math.round((scoreRef.current.correct / scoreRef.current.total) * 100)`
- 但 `scoreRef` 更新 effect（5665-5694 行）依赖数组**不包含 `score`**
- 切 Tab 时 `handleTabChange` → `resetPractice()` → 批量触发 `setIsPlaying(false)` + `setScore({0,0})` + `setActiveTab(newTab)`
- React 按声明顺序执行 effects：先更新 scoreRef 为 {0,0}，再执行会话结束 effect 读 scoreRef = {0,0} → realScore = 0
- 影响: 练习中切 Tab 的会话 score 全部记为 0，但 accuracy 正确
- 修复: 第 6101 行显式传入 `score: accuracy`

**Bug 7: CGI 练习类型白名单与前端发送值不匹配**
- 位置: `cgi-stats-fixed.sh:138-154`
- 前端发送中文全称: `'音高识别'`、`'音阶练习'`、`'和弦练习'`、`'音程练习'`、`'和弦进行'`
- CGI 白名单只有短词: `pitch_finding interval scale chord_exercise chord_progression 练习 音程 音阶 和弦 找音`
- 精确匹配失败 → 所有 Web 端记录 fallback 为 "练习" → 加载时再 fallback 为 `pitch_finding`
- **Web 端所有统计的类型信息全部丢失，被错误归类为"找音练习"**
- Tauri 端不受影响（db_commands.rs 不做白名单校验）
- 修复: 将前端发送的中文全称加入白名单，或改用英文 key

**Bug 8: saveToServer 副作用写在 state updater 内**
- 位置: `app/page.tsx:5949-6040`
- React state updater 必须是纯函数，但代码在 updater 内调用 `localStorage.setItem` 和 `saveToServer`
- React StrictMode 下 updater 会被调用**两次**，导致 `saveToServer` 被调用两次
- 制造"重复记录"——正是 `deduplicateStats` 试图清理的那类脏数据的来源
- 修复: 先计算 newStats，再 `setPracticeStats(newStats)`，再调用 `saveToServer`

### C. 主题颜色跳变

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 9 | **非深色主题加载时颜色跳变** | `app/layout.tsx:21, 50` | 加 pre-hydration 内联脚本读 localStorage |
| 10 | **html/body inline 背景永不更新** | 同上 | 主题切换时同步更新 |

#### 详细分析

**Bug 9: 非深色主题加载时颜色跳变**
- 位置: `app/layout.tsx:21, 50`
- `<html className="dark" style={{ backgroundColor: '#101317' }}>` 和 `<body style={{ backgroundColor: '#101317' }}>` 是**静态硬编码的深色**
- 真正的主题类只在 React 挂载后由 `page.tsx:5175` 的 `useEffect` 应用
- 对于**非深色主题用户**（如选择了 `light`、`ocean-dark`、`rose-light` 等），加载时会出现：第一帧深色 `#101317` → hydration 后跳变为目标主题色
- 修复: 在 `app/layout.tsx` 的 `<head>` 中增加 pre-hydration 内联脚本，读取 localStorage 的持久化主题，在首绘前设置 `<html>` 类名与背景色

**Bug 10: html/body inline 背景永不更新**
- 位置: `app/layout.tsx:21, 50`
- 没有任何代码在主题变化时更新 `html.style.backgroundColor` 或 `body.style.backgroundColor`
- `<body>` 的 `@apply bg-background` 被 inline `style.backgroundColor: '#101317'` 覆盖
- `<body>` 背景永远是 `#101317`（深色），导致 overscroll、滚动边界、加载间隙可见深色底
- 修复: 在主题 useEffect 中同步更新 html/body 的 inline 背景色，或移除 inline 改用 CSS 变量

---

## P1 重要问题

### D. 音频路径

| # | 问题 | 位置 |
|---|------|------|
| 11 | **双重轮询**: page.tsx:7722 + windows-audio-settings.tsx:141 同时 50ms 轮询 Rust detect_pitch | - |
| 12 | **自动启动音频竞态**: effect 依赖缺 `micEnabled` | `app/page.tsx:7670-7705` |
| 13 | **startAudioInput 缺 Tauri 守卫**: 可能触发 WebView2 权限弹窗 | `app/page.tsx:7444-7455` |
| 14 | **bufferSize 设置不生效**: 硬编码 PITCH_BUFFER_SIZE=4096 | `src-tauri/src/audio/pipeline.rs:79` |
| 15 | **AGC 与 noise gate 顺序反**: AGC 先放大噪声到 0.15 RMS，noise gate 阈值 0.016 永远不触发 | `pipeline.rs:81-88` |
| 16 | **noise_suppression_level 语义反**: level 越高实际越宽松 | `preprocessor.rs:272-278` |
| 17 | **set_sample_rate 未采集时存储但不使用**: start() 不读 target_sample_rate | `capture.rs:257-266` |

### E. i18n 缺失

| # | 问题 | 位置 |
|---|------|------|
| 18 | **5 个中文 chord key 缺失**: chord_diminished7, chord_dominant9, chord_major9, chord_minor9, chord_dominant7sharp9 | `lib/i18n.ts` zh-CN 段 |
| 19 | **8 个 altered/diminished level_desc key 缺失** | `lib/i18n.ts` |
| 20 | **2 个 level_group key 缺失**: altered, diminished | `lib/i18n.ts` |
| 21 | **和弦练习选择器描述硬编码英文**: 未走 t() | `app/page.tsx:14178` |
| 22 | **altered/diminished 级别渲染绕过 t()** | `app/page.tsx:13911-13913, 13954-13956` |
| 23 | **音阶分类约 30 处硬编码** | `app/page.tsx:11813-11827, 11936-11950` |
| 24 | **设置面板约 20 处硬编码文本** | `app/page.tsx:10236-10747` |
| 25 | **t() 回退返回裸 key，无 console.warn**: 所有 6 处 t() 定义 | 多个文件 |

### F. 统计约定违反

| # | 问题 | 位置 |
|---|------|------|
| 26 | **Tauri 仍写 localStorage**: 缺 `!isTauri` 守卫 | `app/page.tsx:6014` |
| 27 | **首次运行清理每次启动执行**: effect 依赖 `[isTauri]` | `app/page.tsx:5733-5740` |
| 28 | **deduplicateStats duration 窗口误杀背靠背会话** | `lib/export-utils.ts:240-265` |
| 29 | **Tauri save_practice_stats 校验范围过宽**: 允许 0-10000 而非 0-100 | `db_commands.rs:24` |
| 30 | **practice_sessions 表死代码**: UTC 日期且从未查询 | `src-tauri/src/db/stats.rs:56-72` |
| 31 | **exercise_detail 列未使用，Web/Tauri schema 不一致** | `db/mod.rs:31` vs `cgi-stats-fixed.sh:18-28` |
| 32 | **loadStatsFromServer 在 Tauri 中运行两次**: isTauri state 变化触发 | `app/page.tsx:5728-5882` |
| 33 | **scoreRef 依赖数组缺 score** | `app/page.tsx:5690-5694` |
| 34 | **practiceSessionStartTime 与 sessionStartRef 双重真相源**: pause/resume 后分歧 | `app/page.tsx:5374, 6047, 9057-9062` |

### G. 练习模式

| # | 问题 | 位置 |
|---|------|------|
| 35 | **buttons 模式按钮标签未用 formatNoteByAccidentalSetting** | `app/page.tsx:11060` |
| 36 | **buttons 模式用字符串比较而非 isEquivalentNote** | `app/page.tsx:11038, 8923` |
| 37 | **LOCAL_PRACTICE_MODE_GROUPS 与 lib 重复定义** | `app/page.tsx:4007` vs `lib/practice-levels.ts:1590` |
| 38 | **非全屏 0 品用 flex-[0.8] 与全屏不一致** | `app/page.tsx:12253, 12379` |

### H. 快捷键

| # | 问题 | 位置 |
|---|------|------|
| 39 | **↓ 键描述与实现不符**: 说"下一题"但只隐藏指板 | `lib/i18n.ts:341` vs `app/page.tsx:9455-9470` |
| 40 | **F 键描述"全局"但仅 isPlaying 时生效** | `lib/i18n.ts:326` vs `app/page.tsx:9382` |

---

## P2 次要问题

| # | 问题 | 位置 |
|---|------|------|
| 41 | **版本号不一致**: version.ts(0.2.156) vs tauri.conf.json(0.2.152) | 多文件 |
| 42 | **死代码**: ThemeProvider、sonner.tsx、本地 savePracticeStats | 多文件 |
| 43 | **全屏指板分隔线硬编码 oklch 不随主题** | `app/page.tsx:13173-13177` |
| 44 | **`:root` 与 `.dark` 定义依赖源码顺序** | `app/globals.css:5-27 vs 56-77` |
| 45 | **全屏类管理三重重复**: LayoutShell + page.tsx + globals.css | 多文件 |

---

## P3 微小问题

| # | 问题 | 位置 |
|---|------|------|
| 46 | **isTauriEnv 注释错字**: "卐议" → "协议" | `lib/utils.ts:23` |
| 47 | **快捷键输入框守卫缺 contenteditable** | `app/page.tsx:9357` |
| 48 | **preferFlat/preferSharp 用原始 note 做 includes 检查** | `app/page.tsx:8477, 8483` |
| 49 | **PitchDetectorConfig 默认 buffer_size=8192 与实际使用 4096 不一致** | `src-tauri/src/audio/pitch.rs:73` |
| 50 | **Tauri CSP 缺 blob: 协议** | `src-tauri/tauri.conf.json:29` |

---

## 建议修复顺序

1. **立即修复**（P0 #1-3）：音高识别三连击（采样率/clipping/base_volume）— 1-3 行修改
2. **批量修复**（P0 #4-5 + P1 D）：统一 Tauri 路径与 Web 一致，移除重复轮询
3. **统计修复**（P0 #6-8）：切 Tab 丢分 + CGI 白名单 + updater 副作用
4. **翻译补齐**（P1 E）：一次补全所有缺失 key
5. **约定修复**（P1 F-G）：localStorage 守卫、isEquivalentNote
6. **主题优化**（P0 #9-10 + P2）：pre-hydration 脚本
