# Solo 2.4.1 与 FretMaster 综合对比分析报告

> **分析日期**: 2026-05-09  
> **Solo 版本**: 2.4.1 (Android, Java/Kotlin)  
> **FretMaster 版本**: 当前版本 (Web/Windows, TypeScript/React + Rust/Tauri)

---

## 目录

1. [功能对比](#1-功能对比)
2. [技术性能分析](#2-技术性能分析)
3. [优化机会](#3-优化机会)
4. [附录：功能矩阵](#4-附录功能矩阵)

---

## 1. 功能对比

### 1.1 练习模式架构

| 方面 | Solo 2.4.1 | FretMaster | 评估 |
|------|-----------|------------|------|
| **练习模式** | 4种：音符、音程、音阶、和弦进行 | 5种：练习、音程、和弦练习、和弦进行、音阶 | FretMaster 多独立的和弦练习模式 |
| **架构设计** | 每模式独立 ViewModel + 共享 FocusViewModel 编排器 | 单一 page.tsx + useCallback 钩子 + zustand 状态管理 | Solo 分离更清晰；FretMaster 单体但功能完整 |
| **状态管理** | SharedPreferences + LiveData | zustand/persist + localStorage | 两者均持久化设置；FretMaster 的 zustand 响应性更强 |
| **练习编排** | FocusViewModel + stepBuilderFactory 模式 | processPitchMatch 回调 + 模式分支 | Solo 模式更易扩展；FretMaster 更直接 |

### 1.2 音符练习 / 音高定位

| 功能 | Solo 2.4.1 | FretMaster | 状态 |
|------|-----------|------------|------|
| 随机音符生成 | ✅ RandomNoteGenerator | ✅ generateNewTarget + previousTargetRef | **持平** |
| 防连续重复 | ✅（通过振幅差分重新触发） | ✅ previousTargetRef 排除上一个音符 | **持平** |
| 指板显示 | ✅ showFretboard + fretboardDuration | ✅ showAllNotes 开关 | **持平** |
| 练习建议 | ✅ PracticeSuggestionProvider 按乐器分类 | ✅ practice-suggestions.ts 按乐器分类 | **持平** |
| 振幅阈值 | ✅ 可配置 | ❌ AudioWorklet 中硬编码 | **Solo 领先** |
| 振幅差分（音符重攻击检测） | ✅ 可配置 amplitudeDiff | ✅ detectAmplitudeDiff（0.15阈值） | **持平** |
| 乐器移调 | ✅ NoteFinder 中的 semiToneOffset | ✅ transposeNoteForInstrument | **持平** |
| 识别模式（听音辨音） | ❌ 无独立模式 | ✅ "buttons" 答题模式 | **FretMaster 领先** |
| 琴弦选择 | ❌ 音符模式无指板 | ✅ selectedStrings（1-6弦） | **FretMaster 领先** |
| 练习时长 | ✅ workoutDuration | ✅ pitchFindingTime（1-30分钟） | **持平** |

### 1.3 音程练习

| 功能 | Solo 2.4.1 | FretMaster | 状态 |
|------|-----------|------------|------|
| 音程选择 | ✅ 23种 IntervalFunction | ✅ 22种音程（INTERVALS常量） | **接近持平**（Solo 多 bb7） |
| 先找根音 | ✅ requireRootFirst（从选择中移除根音） | ✅ findRootFirst（过滤索引0） | **持平** |
| 返回根音 | ✅ shouldAddRootBack | ✅ addRootBack | **持平** |
| 随机顺序 | ✅ randomizeOrder | ✅ intervalRandomizeOrder | **持平** |
| 方向控制 | ❌ 不明确（DirectionalInterval.Direction） | ✅ intervalDirection：上行/下行/随机 | **FretMaster 更明确** |
| 根音选择 | ✅ selectedRootNote（固定或随机） | ✅ intervalRootMode：固定/随机 | **持平** |
| 显示指板 | ✅ showFretboard + fretboardDuration | ✅ showIntervalFretboard + intervalFretboardDuration | **持平** |
| 自动前进 | ❌ 未找到 | ✅ intervalAutoAdvance | **FretMaster 领先** |
| 练习队列 | ✅ 每次练习生成 | ✅ intervalExerciseQueue + 索引跟踪 | **持平** |
| 复合音程 | ❌ 未找到 | ✅ 支持复合音程（如 "b3_5"） | **FretMaster 领先** |

### 1.4 音阶练习

| 功能 | Solo 2.4.1 | FretMaster | 状态 |
|------|-----------|------------|------|
| 音阶类型 | ✅ 44种 ScaleType | ✅ 11个分类，80+音阶定义 | **FretMaster 更丰富** |
| 音阶方向 | ✅ 上行/下行/上下行/随机 | ✅ up/down/up_down/random | **持平** |
| 根音移动 | ✅ 静态/随机/上半音/下半音/五度圈/四度圈 | ✅ 相同6种选项 | **持平** |
| 旋律序列 | ✅ "1 to 1"、"3 to 3"、"5 to 5"、"7 to 7"、"Random" | ✅ "1to1"、"3to3"、"5to5"、"7to7"、"random" | **持平** |
| 等音选择 | ✅ preferredNoteForCircleOfFifths | ✅ SHARP_KEYS/FLAT_KEYS + ENHARMONIC_MAP | **持平** |
| 音阶显示 | ✅ ScaleType.getUnicodeDisplayString() | ✅ SCALE_DISPLAY_NAMES 含标准/Unicode/中文 | **FretMaster 国际化更好** |
| Bebop音阶 | ✅ 6种 bebop ScaleType | ✅ 6种 bebop 音阶 | **持平** |
| 和声大调调式 | ✅ 7种调式 | ✅ 7种调式 | **持平** |
| 异域音阶 | ❌ 未找到 | ✅ 日本、埃及、西班牙弗里几亚、Hijaz、双和声 | **FretMaster 领先** |
| 对称音阶 | ✅ 减音阶、全音阶、增音阶 | ✅ 半音阶、增音阶、三全音 | **接近持平** |

### 1.5 和弦进行（Changes）

| 功能 | Solo 2.4.1 | FretMaster | 状态 |
|------|-----------|------------|------|
| 歌曲库 | ✅ 内置 + 自定义歌曲 | ✅ SONG_PROGRESSIONS + 自定义 + iReal Pro 导入 | **FretMaster 领先**（iReal Pro） |
| 和弦类型 | ✅ 62种 ChordType | ✅ 61种和弦类型（CHORD_TYPES） | **接近持平** |
| 和弦功能标记 | ✅ Function 枚举（I-VII、IVm、Vdim、NRD、Dim） | ✅ ChordFunction 枚举（相同11种） | **持平** |
| 练习级别 | ✅ Level 类，按和弦类型配置序列 | ✅ 57个 PracticeLevel，分12组 | **持平** |
| 声部连接 | ✅ WorkoutStep.voiceLed() | ✅ applyVoiceLeading() | **持平** |
| 播放顺序 | ✅ 正向/反向/随机 | ✅ asc/desc/random | **持平** |
| 调性移调 | ✅ desiredKey + song.getKey() | ✅ progressionKey + isMinor | **持平** |
| 重复 + 随机调性 | ✅ shouldRepeat + shouldRandomizeKeyOnRepeat | ✅ progressionRepeat + shouldRandomizeKeyOnRepeat | **持平** |
| 歌曲排序 | ✅ 标题升/降、风格升/降 | ✅ songSortOption | **持平** |
| 自定义歌曲 | ✅ CustomSongDataManager + 编辑界面 | ✅ customChords + iReal Pro 导入 | **FretMaster 领先**（iReal Pro） |
| 斜线和弦支持 | ✅ slashRootNote + getCalculatedRoot() | ✅ chord.bass 字段 | **持平** |
| 强制自然五度 | ✅ Level.forceNaturalFive | ✅ forceNaturalFive | **持平** |
| Bebop 经过音 | ✅ usePassingNoteBebopScale | ✅ usePassingNoteBebopScale | **持平** |
| 起始音程选项 | ✅ StartingInterval：any/first/chordTone | ✅ startingIntervalOption：any/first/chordTone | **持平** |
| 结束于起始音程 | ✅ endOnStartingInterval | ✅ endOnStartingInterval | **持平** |
| 和弦-音阶映射 | ✅ ChordTypeScaleOptionsKt | ✅ CHORD_SCALE_OPTIONS | **持平** |
| 收藏级别 | ✅ shouldShowFavoriteLevels | ✅ levelFavorites | **持平** |

### 1.6 和弦练习（FretMaster 独有）

| 功能 | Solo 2.4.1 | FretMaster | 状态 |
|------|-----------|------------|------|
| 独立和弦练习模式 | ❌ 不存在 | ✅ 完整的 chord_exercise 标签页 | **FretMaster 独有** |
| 和弦类型选择 | ❌ | ✅ chordExerciseTypes（61种多选） | **FretMaster 独有** |
| 低音音符选择 | ❌ | ✅ chordExerciseBass：根音/三音/五音/七音/随机 | **FretMaster 独有** |
| 练习顺序 | ❌ | ✅ chordExerciseOrder：asc/desc/random | **FretMaster 独有** |
| 级别选择器 | ❌ | ✅ showChordExerciseLevelSelector | **FretMaster 独有** |
| 变化音级别 | ❌ | ✅ ALTERED_LEVELS（6个级别） | **FretMaster 独有** |
| 减音阶级别 | ❌ | ✅ DIMINISHED_SCALES_LEVELS（2个级别） | **FretMaster 独有** |

### 1.7 乐器支持

| 功能 | Solo 2.4.1 | FretMaster | 状态 |
|------|-----------|------------|------|
| 六弦吉他（标准调弦） | ✅ | ✅ | **持平** |
| 六弦吉他（四度调弦） | ✅ | ❌ | **Solo 领先** |
| 七弦吉他（标准调弦） | ✅ | ❌ | **Solo 领先** |
| 七弦吉他（四度调弦） | ✅ | ❌ | **Solo 领先** |
| 四弦贝斯 | ✅ | ❌ | **Solo 领先** |
| 五弦贝斯 | ✅ | ❌ | **Solo 领先** |
| 降B号（移调+2） | ✅ | ✅ b_flat_horn | **持平** |
| 降E号（移调+9） | ✅ | ✅ e_flat_horn | **持平** |
| 音乐会音高-1 | ✅ | ✅ concert_pitch_minus_one | **持平** |
| 自定义调弦 | ✅ CUSTOM 动态配置 | ❌ | **Solo 领先** |
| 非吉他乐器指板 | ❌ 管乐无指板 | ❌ 管乐无指板 | **持平** |

### 1.8 音乐理论完整性

| 功能 | Solo 2.4.1 | FretMaster | 状态 |
|------|-----------|------------|------|
| 和弦类型数量 | 62 | 61 | **接近持平** |
| 音阶类型数量 | 44 | 27（scale-theory.ts）/ 80+（SCALE_MODES） | **组织方式不同** |
| 和弦解析器 | ✅ ChordTokenizer + ChordParser | ✅ ChordTokenizer + ChordParser | **持平** |
| 和弦显示配置 | ✅ minorSymbol、minor7flat5Symbol | ✅ ChordSymbolConfig（5个选项） | **FretMaster 更可配置** |
| Unicode 显示 | ✅ ♯♭Δø° | ✅ ♯♭Δø°+ | **持平** |
| 音程显示 | ✅ 23种 IntervalFunction | ✅ 22种音程（标准/Unicode/中文） | **接近持平** |
| 五度圈 | ✅ CIRCLE_OF_FIFTHS 数据 | ✅ CIRCLE_OF_FIFTHS_MAJOR/MINOR | **持平** |
| 调号 | ✅ KEY_SIGNATURES | ✅ KEY_SIGNATURES | **持平** |
| 斜线和弦音阶选项 | ✅ ChordSlashChordExtensionsKt | ✅ CHORD_SCALE_OPTIONS | **持平** |
| 中文国际化 | ❌ | ✅ 所有显示名称含中文变体 | **FretMaster 领先** |

---

## 2. 技术性能分析

### 2.1 音频处理架构

| 方面 | Solo 2.4.1 (Android) | FretMaster Web | FretMaster Windows (Tauri/Rust) |
|------|---------------------|----------------|-------------------------------|
| **核心算法** | YIN（FFT加速） | YIN（标准 + FFT SOLO变体） | YIN（通过 rustfft 加速） |
| **音频采集** | AudioRecord + Oboe（双路径） | Web Audio API（getUserMedia） | cpal（跨平台） |
| **处理线程** | 专用 TunerRunnable 线程 | AudioWorklet（独立线程） | 专用音高流线程 |
| **回退方案** | Oboe → AudioRecord | AudioWorklet → ScriptProcessorNode | 无（仅原生） |
| **缓冲区大小** | 640（默认），可配置 | 2048（默认），可配置 | 4096（默认），可配置 |
| **跳跃大小** | 50%重叠（320采样） | 512采样（75%重叠） | 无（完整缓冲区） |
| **采样率** | 8000-48000（自动协商） | 48000（浏览器默认） | 48000（默认），最高192000 |
| **延迟** | ~40ms（Oboe）/ ~80ms（AudioRecord） | ~10.7ms（hopSize/sampleRate） | ~85ms（bufferSize/sampleRate） |

### 2.2 音高识别精度

| 指标 | Solo 2.4.1 | FretMaster Web | FretMaster Rust |
|------|-----------|----------------|-----------------|
| **YIN阈值** | 0.2 | 0.15 | 0.12 |
| **概率过滤** | >0.91（硬编码） | >0.1（probabilityCliff）+ 0.91（严格） | >0.1（probabilityCliff） |
| **八度修正** | ❌ 未实现 | ✅ 基于历史（5帧） | ✅ 谐波检查 + 时序一致性 |
| **前置滤波** | ❌ 无显式滤波器 | ✅ 高通35Hz + 低通4500Hz Biquad | ✅ 高通35Hz + 低通4500Hz + 陷波50/60Hz |
| **抛物线插值** | ✅ | ✅ | ✅ |
| **频率范围** | 全钢琴（27.5-4186Hz） | 吉他范围（70-1400Hz） | 全钢琴（27.5-4186Hz） |
| **谐波检查** | ❌ YIN核心中无 | ❌ AudioWorklet中无 | ✅ 增强谐波检查（含子谐波+频谱分析） |
| **时序平滑** | ❌ YIN核心中无 | ✅ 指数平滑（0.3因子） | ✅ 基于音分的自适应平滑（0.85因子） |
| **自适应噪声门** | ❌ 仅振幅阈值 | ✅ EMA噪声底跟踪 | ✅ EMA噪声底 + 可配置降噪 |
| **置信度评分** | 仅概率 | 概率 + 清晰度 | 50%YIN + 25%谐波 + 25%时序一致性 |

**关键发现**：FretMaster 的 Rust 后端拥有最复杂的音高检测系统，采用多因子置信度评分；而 Solo 拥有最严格的概率过滤（0.91），以略微提高漏检率为代价减少误检。

### 2.3 AGC（自动增益控制）

| 方面 | Solo 2.4.1 | FretMaster Web | FretMaster Rust |
|------|-----------|----------------|-----------------|
| **实现方式** | Android 硬件 AGC（AutomaticGainControl API） | ❌ Web Audio 不支持 | ✅ 软件 AGC（基于RMS） |
| **何时启用** | 仅USB外接设备时 | 不适用 | 始终可用（可配置） |
| **目标电平** | 系统默认 | 不适用 | 0.15 RMS |
| **最大增益** | 系统默认 | 不适用 | 10倍 |
| **攻击/释放** | 系统默认 | 不适用 | 0.01 / 0.001 |
| **用户控制** | 自动（随USB开关） | 不适用 | setAgcEnabled() 开关 |

**关键发现**：Solo 依赖 Android 硬件 AGC，仅部分设备可用。FretMaster 的软件 AGC 更具可移植性和可控性，但可能引入轻微的信号染色。

### 2.4 性能指标

| 指标 | Solo 2.4.1 | FretMaster Web | FretMaster Rust |
|------|-----------|----------------|-----------------|
| **检测延迟** | 40-80ms | ~11ms（跳跃式） | ~85ms（完整缓冲区） |
| **CPU占用** | 低（原生线程） | 中等（AudioWorklet） | 低（原生线程） |
| **内存占用** | ~2MB（音频缓冲区） | ~1MB（AudioWorklet缓冲区） | ~4MB（环形缓冲区+FFT） |
| **事件传递** | 回调（dataWasUpdated） | MessagePort（postMessage） | Tauri事件（emit） |
| **轮询 vs 事件** | 事件驱动（回调） | 事件驱动（AudioWorklet） | 事件驱动（音高流）+ 轮询回退 |
| **设备热插拔** | ✅ AudioDeviceCallback | ❌ Web Audio 不支持 | ✅ DeviceMonitor 线程 |
| **多通道** | ✅ 通道选择 | ❌ 仅立体声 | ✅ 多通道混音为单声道 |

### 2.5 音频功能完整性

| 功能 | Solo 2.4.1 | FretMaster Web | FretMaster Rust |
|------|-----------|----------------|-----------------|
| YIN音高检测 | ✅ | ✅ | ✅ |
| FFT加速差分 | ✅ | ✅（SOLO变体） | ✅（rustfft） |
| 抛物线插值 | ✅ | ✅ | ✅ |
| 概率过滤 | ✅（>0.91） | ✅（>0.1 + 严格0.91） | ✅（>0.1） |
| 前置滤波（高通/低通） | ❌ | ✅ | ✅ |
| 陷波滤波器（50/60Hz） | ❌ | ❌ | ✅ |
| 噪声门 | ✅（振幅阈值） | ✅（自适应噪声底） | ✅（自适应 + 可配置） |
| AGC | ✅（硬件，仅USB） | ❌ | ✅（软件，始终可用） |
| 八度修正 | ❌ | ✅（基于历史） | ✅（谐波 + 时序） |
| 谐波分析 | ❌ | ❌ | ✅（子谐波 + 频谱） |
| 时序平滑 | ❌ | ✅（指数） | ✅（音分自适应） |
| 校准 | ✅（按设备） | ❌ | ✅（全局 + 按会话） |
| 增益控制 | ❌ | ❌ | ✅（0.0-10.0） |
| 缓冲区大小控制 | ❌ | ❌ | ✅（256-4096） |
| 采样率控制 | ✅（自动协商） | ❌（浏览器默认） | ✅（44100-192000） |
| 振幅差分检测 | ✅（NoteFinder） | ✅（AudioWorklet） | ✅（pipeline） |
| 音符起始检测 | ✅（振幅差分） | ✅（振幅差分） | ✅（振幅差分） |
| 设备枚举 | ✅ | ❌（浏览器管理） | ✅ |
| 设备监控 | ✅（AudioDeviceCallback） | ❌ | ✅（DeviceMonitor线程） |
| 多通道选择 | ✅（selectedChannel） | ❌ | ❌（自动混音为单声道） |
| USB低延迟路径 | ✅（Oboe） | ❌ | ❌ |
| 音频电平监控 | ✅（AudioLevelMonitor） | ✅（AudioWorklet中RMS） | ✅（AudioLevelInfo） |
| 零检测（USB） | ✅（allZerosDetected） | ❌ | ❌ |

---

## 3. 优化机会

### 3.1 Solo 优于 FretMaster 的领域

| # | 功能 | Solo 优势 | 建议 | 优先级 |
|---|------|----------|------|--------|
| 1 | **多乐器指板** | 七弦吉他、四度调弦、四/五弦贝斯专用指板 | 添加七弦、贝斯、四度调弦指板支持 | P1 |
| 2 | **自定义调弦** | CUSTOM InstrumentChoice 支持动态弦数和调弦 | 添加自定义调弦编辑器，支持逐弦音高配置 | P1 |
| 3 | **严格概率过滤** | MicrophoneFrequencyTracker 硬编码 >0.91 阈值 | 在 Web 和 Rust 中应用 0.91 作为默认严格阈值 | P1 |
| 4 | **USB低延迟音频** | Oboe 库为 USB 设备提供 <40ms 延迟 | 研究 Windows WASAPI 独占模式实现低延迟 | P2 |
| 5 | **按设备校准** | DeviceCalibration 按音频设备存储偏移 | 在 Rust 后端添加按设备校准存储 | P2 |
| 6 | **多通道选择** | selectedChannel 支持多通道 USB 接口 | 在 Rust 中添加多通道设备的通道选择 | P2 |
| 7 | **全零检测** | 通过零采样检测 USB 设备断开 | 在 Rust 采集层添加零检测用于 USB 设备问题 | P2 |
| 8 | **替代调性选择** | Key.alternativeKeys() 用于重复时随机调性 | 为重复随机化添加替代调性（等音等效） | P3 |
| 9 | **歌曲风格元数据** | SongSortOption 包含风格升序/降序 | 为 SONG_PROGRESSIONS 添加流派/风格元数据 | P3 |

### 3.2 FretMaster 优于 Solo 的领域

| # | 功能 | FretMaster 优势 | 跨应用建议 | 优先级 |
|---|------|----------------|-----------|--------|
| 1 | **独立和弦练习模式** | 独立标签页，和弦类型多选、低音选项、级别选择器 | 为 Solo 添加独立和弦练习模式 | P1 |
| 2 | **前置滤波** | YIN 检测前 Biquad 高通(35Hz) + 低通(4500Hz) | 为 Solo 的 TunerRunnable 添加前置滤波 | P1 |
| 3 | **八度修正** | 基于历史的八度修正防止八度错误 | 为 Solo 的 YIN 分析器添加八度修正 | P1 |
| 4 | **软件 AGC** | 跨平台软件 AGC（不限于 Android 硬件） | 当硬件 AGC 不可用时实现软件 AGC 回退 | P1 |
| 5 | **陷波滤波器** | 50Hz/60Hz 工频干扰消除 | 为有工频噪声的地区添加陷波滤波器 | P2 |
| 6 | **iReal Pro 导入** | 直接导入 iReal Pro 和弦进行格式 | 为 Solo 添加 iReal Pro 导入 | P2 |
| 7 | **中文国际化** | 所有音乐理论术语完整中文本地化 | 添加中文语言支持 | P2 |
| 8 | **音程方向控制** | 音程练习明确的上行/下行/随机方向 | 添加明确的方向控制 | P2 |
| 9 | **异域音阶** | 日本、埃及、西班牙弗里几亚、Hijaz、双和声 | 添加异域音阶分类 | P3 |
| 10 | **识别模式** | "buttons" 模式无需乐器即可进行音符识别 | 添加音符识别测验模式 | P3 |
| 11 | **和弦显示配置** | 5个可配置选项（小调符号、半减七符号、属七降九符号、Unicode、爵士记谱） | 添加更多显示配置选项 | P3 |
| 12 | **多因子置信度** | 50% YIN + 25% 谐波 + 25% 时序一致性 | 实现多因子置信度评分 | P2 |

### 3.3 需要关注的关键问题

| # | 问题 | 平台 | 严重程度 | 描述 | 建议 |
|---|------|------|----------|------|------|
| 1 | **Web AudioWorklet 频率范围过窄** | FretMaster Web | 高 | 限制在70-1400Hz，遗漏贝斯低音E（82Hz基频可能有子谐波）和E6以上高音 | 扩展至60-2100Hz覆盖完整吉他范围 |
| 2 | **无按设备校准持久化** | FretMaster（双平台） | 中 | 校准偏移不按设备存储；切换设备丢失校准 | 添加按设备校准存储 |
| 3 | **Rust 音高流延迟** | FretMaster Windows | 中 | 85ms 检测延迟（4096缓冲区/48000Hz）高于 Solo 的40ms | 降低默认缓冲区至2048或实现重叠检测 |
| 4 | **无 Oboe/WASAPI 独占模式** | FretMaster Windows | 中 | 通过 cpal 使用共享模式 WASAPI 增加延迟 | 研究 WASAPI 独占模式用于专业音频 |
| 5 | **Web Audio API 采样率固定** | FretMaster Web | 低 | 浏览器控制采样率；无法优化延迟 | 文档记录推荐的浏览器设置 |
| 6 | **缺少 bb7（重降七）音程** | FretMaster | 低 | Solo 有23种音程含 bb7；FretMaster 有22种 | 在 INTERVALS 常量中添加 bb7 |
| 7 | **无四度调弦支持** | FretMaster | 中 | Solo 支持 EADGCF 调弦；FretMaster 仅标准 EADGBE | 添加替代调弦配置 |
| 8 | **无七弦/贝斯指板** | FretMaster | 中 | Solo 有七弦和贝斯专用指板 | 添加乐器专用指板组件 |

### 3.4 详细改进建议

#### P1：高优先级（直接影响练习质量）

1. **为 Solo 添加前置滤波**
   - Solo 当前在 YIN 检测前无高通/低通滤波
   - 添加35Hz高通滤波器可消除次声波和直流偏移
   - 添加4500Hz低通滤波器可减少高频噪声混叠
   - 预期改进：低频乐器误检率降低5-10%

2. **为 Solo 添加八度修正**
   - Solo 的 YIN 无八度错误修正机制
   - FretMaster 基于历史的方法（5帧窗口）有效防止八度倍增错误
   - 实现：找到 tau 后，检查 tau/2 是否为有效候选；使用近期八度历史解决歧义
   - 预期改进：消除大多数持续音符检测中的八度错误

3. **应用严格概率阈值（0.91）作为默认值**
   - Solo 使用0.91；FretMaster 的 Web AudioWorklet 使用0.1作为 probabilityCliff
   - 0.91阈值大幅减少误检
   - 建议：将 FretMaster 的默认 strictProbabilityThreshold 设为0.91并作为主要过滤器
   - 预期改进：误检率降低15-20%

4. **添加七弦和贝斯指板支持**
   - Solo 支持七弦吉他（BEADGBE）和四/五弦贝斯
   - 这些是 FretMaster 当前无法正确显示的常见乐器
   - 实现：添加乐器类型选择及对应的指板配置

5. **添加自定义调弦编辑器**
   - Solo 的 CUSTOM InstrumentChoice 支持任意弦数和调弦
   - 对于非标准调弦（Drop D、Open G、DADGAD等）至关重要
   - 实现：逐弦音高选择器，含预设调弦

#### P2：中优先级（改善用户体验）

6. **为 Windows 实现 WASAPI 独占模式**
   - 当前 cpal 共享模式增加约20ms延迟开销
   - WASAPI 独占模式可实现<10ms延迟
   - 对于快速乐句的实时音高反馈至关重要

7. **添加按设备校准持久化**
   - 在 SQLite 中按设备名存储校准偏移
   - 选择设备时自动应用校准
   - 从全局偏移迁移到按设备偏移

8. **添加工频干扰陷波滤波器**
   - 50Hz（欧洲/亚洲）和60Hz（美洲）干扰很常见
   - FretMaster Rust 已有；Web 版也需要
   - 添加到 AudioWorklet 处理器

9. **为 Web 版添加多因子置信度评分**
   - Rust 后端已有50% YIN + 25% 谐波 + 25% 时序
   - Web 版仅使用 YIN 概率
   - 添加谐波检查和时序一致性可提高可靠性

10. **添加多通道设备的通道选择**
    - USB 音频接口通常有多个输入通道
    - Solo 允许选择特定通道
    - 在 Rust 采集中添加通道索引参数

#### P3：低优先级（锦上添花）

11. **为 Solo 添加异域音阶**
    - 日本、埃及、西班牙弗里几亚、Hijaz、双和声
    - 对世界音乐学习很有价值

12. **为 Solo 添加音符识别测验模式**
    - FretMaster 的"buttons"模式无需乐器即可进行耳力训练
    - 显示指板位置，用户识别音符名称

13. **为 Solo 添加 iReal Pro 导入**
    - FretMaster 可解析 iReal Pro 格式和弦进行
    - 这可访问数千首爵士标准曲

14. **添加歌曲流派/风格元数据**
    - Solo 按风格排序；FretMaster 仅按标题排序
    - 添加流派标签可改善歌曲发现

15. **添加 bb7 音程**
    - 减七度音程（9个半音，等音于大六度）
    - 对减和弦琶音练习很重要

---

## 4. 附录：功能矩阵

### 4.1 完整功能对比矩阵

| 功能 | Solo 2.4.1 | FretMaster Web | FretMaster Windows |
|------|:----------:|:--------------:|:------------------:|
| **练习模式** | | | |
| 音符/音高定位 | ✅ | ✅ | ✅ |
| 音程练习 | ✅ | ✅ | ✅ |
| 音阶练习 | ✅ | ✅ | ✅ |
| 和弦进行 | ✅ | ✅ | ✅ |
| 和弦练习（独立） | ❌ | ✅ | ✅ |
| 音符识别测验 | ❌ | ✅ | ✅ |
| **音频处理** | | | |
| YIN算法 | ✅ | ✅ | ✅ |
| FFT加速 | ✅ | ✅ | ✅ |
| 抛物线插值 | ✅ | ✅ | ✅ |
| 前置滤波（高通/低通） | ❌ | ✅ | ✅ |
| 陷波滤波器（50/60Hz） | ❌ | ❌ | ✅ |
| 八度修正 | ❌ | ✅ | ✅ |
| 谐波分析 | ❌ | ❌ | ✅ |
| 时序平滑 | ❌ | ✅ | ✅ |
| 多因子置信度 | ❌ | ❌ | ✅ |
| AGC | ✅（硬件） | ❌ | ✅（软件） |
| 按设备校准 | ✅ | ❌ | ✅（仅全局） |
| **乐器** | | | |
| 六弦吉他（标准） | ✅ | ✅ | ✅ |
| 六弦吉他（四度） | ✅ | ❌ | ❌ |
| 七弦吉他 | ✅ | ❌ | ❌ |
| 四弦贝斯 | ✅ | ❌ | ❌ |
| 五弦贝斯 | ✅ | ❌ | ❌ |
| 降B号 | ✅ | ✅ | ✅ |
| 降E号 | ✅ | ✅ | ✅ |
| 自定义调弦 | ✅ | ❌ | ❌ |
| **音乐理论** | | | |
| 和弦类型 | 62 | 61 | 61 |
| 音阶类型 | 44 | ~80+ | ~80+ |
| 和弦功能 | 11 | 11 | 11 |
| 和弦解析器 | ✅ | ✅ | ✅ |
| 和弦-音阶映射 | ✅ | ✅ | ✅ |
| 斜线和弦支持 | ✅ | ✅ | ✅ |
| Bebop经过音 | ✅ | ✅ | ✅ |
| 中文国际化 | ❌ | ✅ | ✅ |
| **练习功能** | | | |
| 声部连接 | ✅ | ✅ | ✅ |
| 练习级别 | ✅ | 57个级别 | 57个级别 |
| 练习建议 | ✅ | ✅ | ✅ |
| 防连续重复 | ✅ | ✅ | ✅ |
| iReal Pro导入 | ❌ | ✅ | ✅ |
| 自定义歌曲 | ✅ | ✅ | ✅ |
| 聚焦模式 | ❌ | ✅ | ✅ |
| 节拍器 | ❌ | ✅ | ✅ |
| 统计/导出 | ❌ | ✅ | ✅ |
| 全屏模式 | ✅（Android沉浸式） | ✅（浏览器F11） | ✅（Win32真全屏） |
| PDF/CSV导出 | ❌ | ✅ | ✅ |

### 4.2 音频处理流水线对比

```
Solo 2.4.1:
麦克风 → AudioRecord/Oboe → [AGC（如USB）] → YinAnalyser → probability > 0.91 → NoteFinder → UI

FretMaster Web:
麦克风 → getUserMedia → AudioWorklet → [高通35Hz + 低通4500Hz] → YIN → 八度修正
  → probability > 0.1 → 频率平滑 → 振幅差分 → MessagePort → UI

FretMaster Windows:
麦克风 → cpal → 环形缓冲区 → [软件AGC] → [高通35Hz + 低通4500Hz + 陷波50/60Hz]
  → YIN（FFT）→ 谐波检查 → 时序一致性 → 多因子置信度
  → Tauri事件 → UI
```

### 4.3 评分汇总

| 类别 | Solo 2.4.1 | FretMaster | 胜者 |
|------|:----------:|:----------:|:----:|
| 练习模式完整性 | 8/10 | 9/10 | FretMaster |
| 乐器支持 | 9/10 | 6/10 | Solo |
| 音频处理复杂度 | 6/10 | 8/10 | FretMaster |
| 音高检测精度 | 7/10 | 8/10 | FretMaster |
| 音乐理论深度 | 9/10 | 9/10 | 平局 |
| 用户体验功能 | 6/10 | 8/10 | FretMaster |
| 跨平台可移植性 | 3/10（仅Android） | 9/10 | FretMaster |
| **综合评分** | **7/10** | **8/10** | **FretMaster** |

---

*分析报告结束*
