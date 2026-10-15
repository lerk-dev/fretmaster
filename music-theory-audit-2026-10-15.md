# 乐理知识模块审查报告 — 可执行改进清单

- **日期**：2026-10-15
- **审查范围**：乐理核心（音名/音程/音阶/调式/和弦/转位/移调）+ 节拍节奏 + 乐理面板 UI
- **基线**：HEAD `6deb557cf`（工作区干净）
- **方法**：每个条目都回源读过代码，附 `文件:行号`；跨文件数据用脚本做过穷举比对（`SCALE_MODES` 76 条 / `DISPLAY_NAMES` 四段 / 三张度数表）。**未经验证的推断没有写进来。**
- **严重程度**：阻断 > 功能错误 > 体验优化

---

## 0. 结论速览（按严重程度排序）

| # | 问题 | 类别 | 位置 |
|---|---|---|---|
| 1 | 扩展音（9/11/13/♭9/♯9/♯11/♭13）在和弦判定中恒判错、指板不显示 | 功能错误 | `page-theory-functions.ts:791` 等 3 处 |
| 2 | 五度圈「小调」侧用**大调根音**算音阶 ⇒ `Am` 位置显示 C 小调音集 | 乐理/功能 | `theory-panel.tsx:273-279` |
| 3 | 转位低音旋转只认自然 `3/5/7` ⇒ 小调/属七/减和弦转位全部失效 | 功能错误 | `page-theory-functions.ts:952-955` |
| 4 | BPM 无任何钳制 ⇒ `bpm<=0`/`NaN` 让节拍器变 ~1ms 高频循环 | 功能错误 | `store.ts:901`、`app/page.tsx:1758` |
| 5 | `CIRCLE_MINOR_NAMES` 末 4 项不是关系小调（且丢 2 个音级） | 乐理 | `theory-panel.tsx:90` |
| 6 | `7alt` 数据缺 ♯11，且 ♯5 与 ♭13 是同一音高重复 | 乐理 | `page-theory-data.ts:51` |
| 7 | `getScaleForChord` 两处返回的音阶不含该和弦特征音 | 乐理 | `page-theory-functions.ts:437,443` |
| 8 | `extendedChordMap` 凭空补出和弦定义里没有的音（`13` 加 11、`7#11` 加 9） | 乐理/功能 | `page-theory-functions.ts:677-679` |
| 9 | 同一音阶在多分组重复定义且标签漂移（`Bebop Dorian` 音高集合都不同） | 乐理/质量 | `page-theory-data.ts:145-252` |
| 10 | `DISPLAY_NAMES` 四段键集合不一致；`"Diminished"` 无键 ⇒ 中文界面漏英文 | 功能/UI | `page-theory-data.ts`、`page-theory-functions.ts:105` |
| 11 | 和弦下拉第一项（大三和弦）标签为空白 | UI | `theory-panel.tsx:604` |
| 12 | CAGED 分图里小调三音标成 `3`（应为 `♭3`） | 乐理/UI | `theory-panel.tsx:795` |
| 13 | `transposeChord` 恒用升号 ⇒ 转入降号调拼写非法 | 乐理 | `page-theory-functions.ts:205,216` |
| 14 | 节拍器无拍号/重音（第一拍不强）；声音与视觉两个独立时钟会漂移 | 质量/体验 | `app/page.tsx:1759`、`metronome-visualizer.tsx:35-49` |
| 15 | 三张「度数→半音」表并存，其中一张 `#6` 值错（已被测试钉住） | 质量 | `page-theory-functions.ts:885` |
| 16 | `getScaleNotes` 的 `_preferFlat` 参数完全无效（拼写恒定） | 质量 | `scale-theory.ts:219`、`chord-theory.ts:242` |
| 17 | 音阶显示名体系分裂（「大调」vs「大调音阶」），减音阶 4 种措辞 | UI | `scale-theory.ts:75` vs `page-theory-data.ts:341` |
| 18 | 乐理面板信息层级/密度问题（公式与音级重复、标题层级不一、toggle 缺 `aria-pressed`、全角标点漏进英文） | UI | `theory-panel.tsx:559/725/739/753/857/885/910/935/1002` |
| 19 | 节拍器可视化计数器在拍号变化时不复位；`beatsPerMeasure=0` 渲染 `NaN` | 质量 | `metronome-visualizer.tsx:38,83` |
| 20 | i18n 死键（有译文、无消费端） | 质量 | `i18n.ts:126/172/179/184` |

---

## 一、功能错误（最高优先级）

### 【1】扩展音在和弦判定里恒判错、指板不显示

**问题**
`CHORD_TYPES` 把 9/11/13 族存成**复合音程**（`9`→14、`11`→17、`13`→21、`7b9`→13、`7#9`→15、`7#11`→18、`7b13`→20），但凡「这个音在和弦里吗」的判定，都是先取 `(noteIdx - rootIdx + 12) % 12`（结果恒 0..11）再 `intervals.includes(...)`：

- `lib/page-theory-functions.ts:791`、`:794`（`getNoteDegreeInChord`）
- `lib/fretboard-note-button-color.ts:187`、`:189`（chord_exercise）与 `:317`、`:319`（chord）
- `app/page.tsx:3959`、`:3960`（点击判定）

**数字证据**：`9` 的 intervals = `[0,4,7,10,14]`（`page-theory-data.ts:54`）。C9 的九音 D 半音值 = 2，`[0,4,7,10,14].includes(2)` = **false**。
→ 用户**永远看不到扩展音**（不亮、无音级标签，`fretboard-cell-role.ts:276` 走同一函数），点击扩展音被判**答错**（`app/page.tsx:3960`）。
而 MIDI/弹奏路径用的是另一张**正确的**度数→半音表（`app/page.tsx:3735`），于是「点击」与「弹奏」对同一题判定相反。同仓 `lib/chord-theory.ts:1691 getChordNotes` 用 `noteFromToneId` 取模，是对的——说明这是 page 体系特有的口径错误。现有测试只覆盖 `Major`/`m7`（`__tests__/degree-system.test.ts:130-136`），未覆盖扩展音。

**影响**
所有含 9/11/13 的和弦（属九/属十三/加九/大九…）在指板练习里**特征音不可见且判错**。这是本报告最严重的功能缺陷。

**修改建议**（最小改动，一处收敛）
把「取模后的音程」与「取模后的和弦音集合」比较，而不是与原始数组比：

```ts
// lib/page-theory-functions.ts:791-794
const interval = (noteIdx - rootIdx + 12) % 12
const inChord = chordTypeData.intervals.some(i => i % 12 === interval)
if (!inChord) return null
return semitonesToDegree(interval, chordType)
```

`lib/fretboard-note-button-color.ts:189/319` 与 `app/page.tsx:3960` 同样改为 `.some(i => i % 12 === interval)`。
**并补护栏**：加一条「对每个 `CHORD_TYPES`，其 intervals 取模后必须能匹配到自身每个音」的穷举测试，防止再次漂移。

---

### 【3】转位低音旋转只认自然 `3/5/7`

**问题**
`lib/page-theory-functions.ts:952-955`：
```ts
const bassDegreeMap = { "3rd": "3", "5th": "5", "7th": "7", "b3": "b3", "b5": "b5", "bb7": "bb7", "#5": "#5" }
```
但序列音级来自「和弦对应音阶」（`getScaleForChord`）：小调和弦走 `dorian`（三音是 `b3`）、属七走 `mixolydian`（七音是 `b7`）、减/半减走 `locrian`（无 `3/5/7`）。于是 `sequence.indexOf('3')` = **-1**，旋转不生效。
UI 确实暴露这些选项：`components/chord-exercise-controls.tsx:110-114`（3rd/5th/7th/random），`hooks/use-chord-exercise.ts:62` 随机源也只用 `["root","3rd","5th","7th"]`。

**影响**
`generateChordSequence('C','Minor',... ,'3rd')` 返回 `['1','b3','5']`（原位）而非 `['b3','5','1']`（第一转位）；属七选 `7th` 同理。**用户选了转位却听到原位。** 现有测试只覆盖大三和弦（`__tests__/page-theory-functions.test.ts:536-538`）。

**修改建议**
按当前和弦类型解析目标音级，而不是固定字面量：小调 `3rd→b3`、属七 `7th→b7`、减三 `5th→b5`；或直接改成**按半音值**匹配后旋转。补一条覆盖小调/属七/减和弦转位的用例。

---

### 【4】BPM 无钳制 ⇒ 节拍器变 ~1ms 高频循环

**问题**
- 声音路径无守卫：`app/page.tsx:1758` `const interval = 60000 / metronomeBpm`，`:1759` 直接 `setInterval(fn, interval)`。
- store setter 直写不钳制：`lib/store.ts:901` `setMetronomeBpm: (bpm) => set(...{ bpm })`。
- 导入设置只校验「有限数」：`app/page.tsx:1689-1690` 的 `num()` 接受任意有限数，`app/page.tsx:1703` `setMetronomeBpm(num(settings.metronomeBpm, 80))` ⇒ 负数/0 完全放行。
- 对比：可视化组件有守卫 `metronome-visualizer.tsx:27`（`bpm <= 0` 不建定时器），**声音路径没有**。

**数字证据**（与 `60000 / metronomeBpm` 同表达式实测）：
```
bpm=0    → Infinity → setInterval 实际间隔 ≈ 0.98ms
bpm=-80  → -750     → 实际间隔 ≈ 0.93ms
bpm=NaN  → 0        → 实际间隔 ≈ 1.10ms
```

**影响**
导入一份 `metronomeBpm: -80`（或 localStorage 被改坏）的设置后，节拍器每毫秒 `createOscillator` ⇒ CPU/音频线程过载、界面卡死、爆音；且可视化不动、声音狂响，两者行为矛盾。

**修改建议**
在 `setMetronomeBpm`（`store.ts:901`）、导入（`app/page.tsx:1703`）、迁移/rehydrate 三处统一 `clamp(bpm, 20, 300)`；并在 `app/page.tsx:1757` 加 `metronomeBpm > 0` 守卫（与可视化对齐）。同轮给 `metronome` 嵌套字段在迁移函数里补默认值（`lib/store.ts:745-759` 的注释已自承该风险，但只补了 `user`/`audio`）。

---

## 二、乐理正确性

### 【2】五度圈「小调」侧用大调根音算音阶

**问题**
`components/theory-panel.tsx:272-287`：
```ts
const pc = CIRCLE_MAJOR_PC[circleIndex]          // 273：恒取大调根音
const minorName = CIRCLE_MINOR_NAMES[circleIndex] // 276：标签写 Am
const scaleType = circleMode === 'major' ? ScaleType.major : ScaleType.naturalMinor
const scale = getScaleNotes(pc as Note, scaleType) // 279：仍用大调 pc
```

**影响**
`circleIndex=0` 时标签是 `Am`，但渲染的是 `C` 自然小调。按升号表输出即 `C D D♯ F G G♯ A♯`，而正确的 A 自然小调是 `A B C D E F G`。**这是直接把乐理教错**，且 `__tests__/theory-panel.test.ts:265-273` 只断言了标签与徽标，没断言音集，所以一直没被发现。

**修改建议**
小调根音用关系小调：`((CIRCLE_MAJOR_PC[circleIndex] - 3) % 12 + 12) % 12`；或新增 `CIRCLE_MINOR_PC` 表与 `CIRCLE_MINOR_NAMES` 同源，避免两处各算一遍导致再次分叉。补一条断言 `Am` 位置音集 = `['A','B','C','D','E','F','G']`。

---

### 【5】`CIRCLE_MINOR_NAMES` 末 4 项不是关系小调

**问题**
`components/theory-panel.tsx:90`：
```ts
const CIRCLE_MINOR_NAMES = ['Am','Em','Bm','F♯m','C♯m','G♯m','D♯m','B♭m','G♭m','E♭m','Cm','Gm']
```
逐位核对（关系小调 = 大调下小三度）：

| index | 外圈大调 | 应有关系小调 | 实际写的 | 判定 |
|---|---|---|---|---|
| 0–7 | C…D♭ | Am…B♭m | Am…B♭m | ✅ |
| 8 | A♭ | **Fm** | G♭m | ❌ |
| 9 | E♭ | **Cm** | E♭m | ❌ |
| 10 | B♭ | **Gm** | Cm | ❌ |
| 11 | F | **Dm** | Gm | ❌ |

且 `G♭m`(pc6) 与 `F♯m`(pc6)、`E♭m`(pc3) 与 `D♯m`(pc3) **重复**，pc 5(F)、pc 2(D) **缺失**。

**影响**
看内圈 `A♭/E♭/B♭/F` 节点，或详情区「关系小调」一行（`:547-549`），显示的是错误调名。`__tests__/theory-panel.test.ts:221-223` 原样钉住了这个数组，修复须同步改测试。

**修改建议**
`'G♭m'→'Fm'`、`'E♭m'→'Cm'`、`'Cm'→'Gm'`、`'Gm'→'Dm'`，并更新测试断言。

---

### 【6】`7alt` 数据缺 ♯11，且 ♯5 与 ♭13 同音重复

**问题**
- `lib/page-theory-data.ts:51`：`7alt` = `[0,4,8,10,13,15,20]`
- `lib/chord-theory.ts:933-942`（同一概念的权威实现 + 注释）：
  `// 7alt = 1 3 ♭7 ♭9 ♯9 ♯11 ♭13。原值 [0,4,8,10,13,15,18,21] 同时含 ♭13(8) 与自然 13(21)，自相矛盾。`
  实现为 `[0,4,10,13,15,18,20]`

**数字证据**：page 版含 `8`(#5) 与 `20`(♭13)，而 `8 % 12 == 20 % 12 == 8` ⇒ **同一音高写了两次**；同时缺 `18`(♯11/b5)。

**影响**
`getChordDegrees('7alt')`（无 level 路径，`page-theory-functions.ts:686`）会输出含 `#5` 和 `b13` 的重复音级且缺 ♯11；与 theory-panel 用的 `CHORD_INTERVALS`（chord-theory）**显示不一致**。

**修改建议**
把 `page-theory-data.ts:51` 改为 `[0,4,10,13,15,18,20]`（与 `chord-theory.ts` 一致），或明确二者选一作为唯一真相源。

---

### 【7】`getScaleForChord` 返回的音阶不含该和弦特征音

**问题**（`lib/page-theory-functions.ts`）
- `:437`：`m7b6` → `'dorian'`。`m7b6` 构成含 ♭6（`page-theory-data.ts:94` `[0,3,7,10,8]`），而 dorian = `1 2 b3 4 5 6 b7` 只有自然 6。同仓 `lib/scale-theory.ts:191` 却把 `minorSevenFlatSix` 映射到 `aeolian`（含 ♭6）。
  （注：`:437` 有注释 `// Solo: line 298-300 (不是 aeolian)`，是刻意镜像上游 Solo 的行为——但乐理上确实矛盾。）
- `:443`：`dimMaj7` → `'harmonicMinor'`（自然 5），而 `dimMaj7` 是 `[0,3,6,11]` = 1 ♭3 ♭5 7；同仓 `lib/scale-theory.ts:150` 给 `diminishedMajorSeven` 的是 `diminishedWholeHalf`（含 ♭5）。

**影响**
带 level 的和弦练习经 `sequenceNumbersToDegrees`（`:561`）取音级，`m7b6` **永远弹不出特征音 ♭6**（实际练成了 m7）；`dimMaj7` 给出自然 5 而非 ♭5。而「无 level」路径（`:686`）又会列出 ♭6/♭5，两条路径结论打架。

**修改建议**
`:437` 改 `'aeolian'`、`:443` 改 `'diminishedWholeHalf'`，与 `scale-theory.CHORD_SCALE_OPTIONS` 对齐；同步更新钉旧行为的测试。

---

### 【8】`extendedChordMap` 凭空补出和弦定义里没有的音

**问题**（`lib/page-theory-functions.ts:669-680`）
- `:677` `'7#11': ['1','3','5','b7','9','#11']` 含 `9`，而 `7#11` intervals = `[0,4,7,10,18]`（`page-theory-data.ts:44`）**无 9**。
- `:678` `'13': [...,'9','11','13']` 含 `11`，而 `13` = `[0,4,7,10,14,21]`（`:67`）**无 11**。
- `:679` `'m13'` 同上。

**影响**
`getChordDegrees('13')`（`app/page.tsx:5122` 显示）列出 7 个音，与实际和弦音（6 个）+ 指板高亮（受【1】影响只会更少）三方不一致。

**修改建议**
让 `extendedChordMap` 由 `CHORD_TYPES[].intervals` 推导（`intervals.map(semitonesToDegree)`），删掉硬编码的额外 9/11。

---

### 【9】同一音阶在多分组重复定义且标签漂移

**问题**（`lib/page-theory-data.ts:145-252`，穷举比对结论：76 条 / 15 组）

**同名分叉**：
- `Bebop Dorian` 两处**音高集合都不同**：`bebopScales:202` = `[0,2,3,5,7,9,10,11]`（正确）vs `bebop:240` = `[0,2,3,4,5,7,9,10]`
- `Altered` 两套标签：`melodicMinorScaleModes:168` `1 b2 #2 3 b5 #5 b7` vs `jazz:246` `1 b2 b3 3 b5 b6 b7`

**同音高、不同标签**：
- Diminished H/W 三处：`otherScales:192`(#2,#4/b5)、`other:236`(b3,#4)、`jazz:247`(b3,#4)
- Whole Tone 末音：`SCALE_MODES` 用 `#6`，而 `scale-theory.ts:128 SCALE_INTERVAL_DISPLAY` 用 `b7`
- Augmented：`otherScales:194` `1 #2 3 5 #5 7` vs `symmetrical:213` `1 b3 3 5 b6 7`
- Lydian #9：`scale-theory.ts:135` 标签是 `#9`，`SCALE_MODES:176` 是 `#2`（同音高；音阶语境应写 `#2`）

**影响**
`components/scale-controls.tsx:161-169` **同时**把新分组（otherScales/bebopScales/symmetrical/jazz）与旧分组（Bebop(旧)/其他(旧)）暴露给用户 ⇒ 同一中文名下不同音集/音级，练习内容与指板自相矛盾。这类「第二真相源」正是项目铁律 12 针对的场景。

**修改建议**
以「新」分组为唯一真相源，给旧分组项（`bebop`/`other`/`symmetrical.Augmented`/`jazz.Altered`）加 `legacy` 标注或从下拉隐藏；`SCALE_INTERVAL_DISPLAY` 与 `SCALE_MODES` 的标签统一（Whole Tone 统一取 `#6`、Lydian #9 统一取 `#2`）。**加一条穷举护栏**：同名音阶的 `notes`/`intervals` 必须完全一致。

---

### 【12】CAGED 分图里小调三音标成 `3`

**问题**
`components/theory-panel.tsx:795`：
```ts
label: ct.role === 'root' ? 'R' : ct.role === 'third' ? '3' : '5'
```
与 `cagedQuality`（`:753-762` 可切 minor）无关。i18n 已有 `theory_role_root/third/fifth` 但从未使用。

**影响**
切到「小三」时，小三度音被标成 `3`，与大三和弦无从区分。

**修改建议**
按性质取标签：`cagedQuality === 'minor' ? '♭3' : '3'`（复用 `formatDegree`）；同时用 `t('theory_role_third')` 替换字面量，消灭死键。

---

### 【13】`transposeChord` 恒用升号 ⇒ 转入降号调拼写非法

**问题**
`lib/page-theory-functions.ts:205` 与 `:216` 都只用 `NOTES`（全升号表）。
数字证据：`transposeChord('F','C','Bb')` → `newRootIndex=(5+10)%12=3` → `NOTES[3]='D#'`，而 B♭ 大调的 IV 级应记作 **E♭**；`transposeChord('F','C','F')` → `NOTES[10]='A#'`，F 大调 IV 应为 **B♭**。

**影响**
凡目标调含降号（F/B♭/E♭/A♭/D♭/G♭）的转调，界面/导出会出现 `A#`、`D#` 这类非法调内拼写，对乐理教学是错误示范。现有测试只覆盖 C→D（`__tests__/song-chords.test.ts:39-44`）。

**修改建议**
依目标调 `toKey` 选表：`toKey ∈ {F,Bb,Eb,Ab,Db,Gb}` 时用 `NOTES_FLAT`，根音与低音统一；注意 `getKeyNote` 当前把降号调归一成升号，需一并评估。

---

## 三、性能与代码质量

### 【14】节拍器：`setInterval` 驱动发声 + 视觉/声音双时钟

**问题**
- 声音用 `setInterval` 当发声时钟，且以「当前时刻」立即排程（无提前量）：`app/page.tsx:1759`、`:1776-1779`（`gainNode.gain.setValueAtTime(0.3, ctx.currentTime)` / `oscillator.start(ctx.currentTime)`）；全仓无 lookahead。
- 可视化为**另一个独立** `setInterval`：`components/metronome-visualizer.tsx:35-49`。

**影响**
`setInterval` 不补偿回调耗时与主线程阻塞，误差逐拍累积；且两个定时器启动时刻与漂移速率都不同 ⇒ 圆点与「咔哒」逐渐错开，无法作为可信的视听一致节拍。切 `metronomeSound`/`metronomeFlash` 会重建声音 interval（`app/page.tsx:1804`），导致相位跳变。

**修改建议**
改为基于 `AudioContext.currentTime` 的 lookahead 调度（`setInterval` 只负责排程、不负责出声），由**单一调度器**广播 beat 事件同时驱动声音与可视化。

> 备注：题目自动推进走独立的 1s 倒计时（`app/page.tsx:1808-1831`），与 BPM **不耦合**，无越界风险——这一维度**未发现问题**。

### 【15】三张「度数→半音」表并存，其中一张 `#6` 值错

**问题**
- `page-theory-functions.ts:885` `SCALE_DEGREE_SEMITONE_FALLBACK` 里 `'#6': 9`
- 同文件 `:116`、`:863` 以及 `page-theory-data.ts:9` 都是 `'#6': 10`

`#6`（升六度）正确值是 **10** 半音，`9` 是 ♮6。该偏差**已被 `__tests__/scale-degree-semitone.test.ts:62` 主动钉住**并配有「盲区清单」测试（`:108-116`），属**已文档化的设计取舍**（对齐表优先，兜底表只兜极端情况）。

**影响**
当前对真实音阶无影响（走对齐表）。但兜底表在 `intervals` 为空时确实会被使用（测试 `:120-126` 确认），若有合成标签走 `#6` 会判低半音。属**潜在**缺陷。

**修改建议**（低优先）
把 `'#6'` 改为 `10`、`'#2': 3` 与 `'bb7': 9` 补齐，同步更新盲区清单断言，让三张表收敛为一张。若维持现状，建议在表上方注明「本表 `#6` 故意保留旧值」以免后人误改。

### 【16】`getScaleNotes` 的 `_preferFlat` 参数无效

**问题**
`lib/scale-theory.ts:219` 为 `getScaleNotes` 恒传 `false`；而 `lib/chord-theory.ts:242-245` 的 `noteFromToneId(toneId, _preferFlat)` **根本不使用**该参数（只做 `%12` 归一化）。

**影响**
函数签名暗示可按调性选择升降拼写，实际不会。调用方（`theory-panel.tsx:279/304`）只能事后用 `pcName(n, preferFlat)` 补救，且补救依据是「根音偏好」而非「音阶自身的正确拼写」⇒ F 大调可能显示 `A♯`。

**修改建议**
要么删掉无效参数（消除误导），要么让 `getScaleNotes` 接受 `preferFlat` 并在调用方按目标调传入。改签名前先 grep 调用方（共 2 个文件）。

### 【19】节拍器可视化计数器不复位 / `%0` 产生 `NaN`

**问题**
`components/metronome-visualizer.tsx:38` `beatCountRef.current = (beatCountRef.current + 1) % beatsPerMeasure`。依赖数组含 `beatsPerMeasure`（`:57`）会重建 interval，但**不复位** `beatCountRef`（仅 `isPlaying` 变化时复位，`:59-65`）。`beatsPerMeasure = 0` 时 `x % 0 === NaN`，`:83` 渲染 `NaN` 且圆点永不命中。

**影响**
运行中改拍号会跳拍/错位；传 0 显示 `NaN`。（当前页面固定传 4，属潜在缺陷。）

**修改建议**
`beatsPerMeasure` 变化时 `beatCountRef.current %= beatsPerMeasure`；对 `<= 0` 守卫退回默认 4。

### 【20】i18n 死键

**问题**：`i18n.ts:126 theory_caged_shape`、`:172 theory_quality`、`:179 theory_degree`、`:184 theory_notes`（含英文对位）全仓无引用。

**影响**：误导维护者以为已有译文可接。**建议**：删除，或在对应控件接入（如 CAGED「指型」标题用 `theory_caged_shape`）。

---

## 四、乐理知识 UI

### 【10】`DISPLAY_NAMES` 四段键集合不一致；`"Diminished"` 无键

**问题**（脚本穷举结论）
- `chinese` 的 `scaleTypes` **60** 键；`english`/`english_short`/`jazz` 各 **57** 键。三者缺 `Bebop Tonic Minor Melodic`、`Bebop Mixolydian`、`Bebop Minor`。
- 四段**都缺** `SCALE_MODES.other:236` 的 `"Diminished"` 键。
- `lib/page-theory-functions.ts:103-105`：`return scaleTypes[scaleName] || scaleName` —— **缺键即回退键名**（项目铁律 1 的实例），且 `as Record<string,string>` 强转让 TS 抓不到。
- `components/scale-controls.tsx:323` 用 `'chinese' | 'english'` ⇒ 中文界面选到「其他(旧) → Diminished」会显示英文 `Diminished`。

**影响**
中文界面漏出英文键名；`jazz`/`english_short` 显示模式下三个 Bebop 音阶退回全名。现有测试只校验了 `chordTypes` 键集合（`__tests__/chord-type-registry.test.ts:34-41`），`scaleTypes` 无护栏。

**修改建议**
四段同步补齐那 3 个键，并为 `"Diminished"` 在四段补译本（如中文「减音阶(半全)」）；新增一条 `四段 scaleTypes 键集合完全一致` 的断言。

### 【11】和弦下拉第一项（大三和弦）标签空白

**问题**
`components/theory-panel.tsx:604` 用 `getChordTypeUnicodeDisplayString(ct)` 作 `SelectItem` 文本；`COMMON_CHORD_TYPES[0]`（`:98`）是 `majorTriad`，其映射在 `lib/chord-theory.ts:776` 为 `''`，`getChordTypeUnicodeDisplayString`（`:844-846`）原样返回空串。

**影响**
「和弦音阶」tab 的和弦下拉首行为空白，`SelectValue`（`:598`）随之空白，用户以为控件坏了。

**修改建议**
`{getChordTypeUnicodeDisplayString(ct) || t('theory_chord_major')}`（或复用已有的 `theory_quality_major`），保持 `text-xs` 样式不变。

### 【17】音阶显示名体系分裂

**问题**
- `scale-theory.ts:75/79/81/82`：`大调 / 多利亚 / 利底亚 / 混合利底亚`
- `page-theory-data.ts:341-349`：`大调音阶 / 多利亚调式 / …`
把位 tab（`theory-panel.tsx:677`）用前者、调式 tab（`:326`）与音阶练习（`scale-controls.tsx:323`）用后者。
- `page-theory-data.ts:373-374`：`"Augmented"` 与 `"Augmented Scale"` **都译作「增音阶」**，但两者音级标签不同。
- 减音阶并存 4 种措辞：`半全减音阶 / 全半减音阶 / 减音阶半全 / 减音阶全半`。

**影响**：不同 tab 间对照同一音阶时对不上名，产生「是不是两种东西」的困惑。

**修改建议**：确立单一「音阶显示名」真相源（`scale-theory.SCALE_DISPLAY_NAMES` 或 `DISPLAY_NAMES.*.scaleTypes` 二选一），统一后缀；`Augmented` 两条改名区分或合并；减音阶统一一种措辞。

### 【18】乐理面板信息层级与密度

**问题**
1. **标题层级不统一**：「把位教学」用 `<h4>`（`:687/:732`），「和弦音阶/调式图鉴」用 `div.text-xs`（`:637/:856`）。
2. **信息重复**：调式图鉴里 `:955` 展示 `formatDegree(modeScaleDef.formula)`，而 `:938-980` 的整指板每格又用 `modeScaleDef.intervals[idx]` 标出同一组音级。
3. **`aria-pressed` 不一致**：split/merged（`:739`）有，但 family（`:857-867`）、quality（`:753-762`）、拼写（`:885-905`/`:910-927`）、调式（`:935-947`）、显示（`:1002-1019`）全靠背景色 `bg-primary` 表意，读屏/键盘用户无法感知选中态。
4. **全角标点漏进英文界面**：`:559` `{t('scale_notes')}（{...}）` 用了全角 `（）`；`:959` 硬编码 `：`；`:725` 指法说明用内联三元 `lang === 'en' ? 'index' : '食指'`，未走 `t()`。

**影响**：同一信息两处呈现、密度偏高；语义层级混乱；英文界面出现 `Scale Notes（Major）`、`Usage：…`；中文字面量散落组件内，违背同文件 `:153` 注释的既定约定。

**修改建议**
- 各 tab 小节统一用一致的 `<h4 className="text-sm font-medium text-muted-foreground">`；
- formula 改为名称旁的 `Badge variant="outline"` 或折进 `title`/`Popover`，与指板二选一突出；
- 所有 segmented toggle 补 `aria-pressed={isActive}`，class 逻辑不变；
- 括号/冒号并入 i18n 文案键，指法说明改为 `t('theory_fingering_hint')` 一整个键。

---

## 五、验证方法与已知边界

**已逐一回源核实的条目**：1、2、3、4、5、6、7、8、9、10、11、12、13、14、15、16、19、20（读源码 + 行号 + 数字对照）。
**用脚本穷举得出的结论**：`SCALE_MODES` 76 条 / 15 组的重复与漂移；`DISPLAY_NAMES` 四段键集合差异（60 vs 57）；三张度数表的 `#6` 取值冲突。

**刻意未重复报告**（项目已知问题清单 `.workbuddy/memory/KNOWN-ISSUES.md` 已登记）：`theory-panel` 的下标兜底死分支、`metronome-visualizer` 的定时器清理不可达、`chord-theory.ts` 的死码清理、`song-chords.ts:270-271` 的纵深两道守卫。

**未纳入本轮**（能力缺口，非缺陷）：节拍器**完全没有拍号/重音模型**（全仓无 `timeSignature`，`app/page.tsx:5510` 硬编码 `beatsPerMeasure={4}`，声音首拍与其余拍同频同增益 `:1774-1776`）。这是「功能缺失」而非「实现错误」，如需 4/4、3/4 强拍需单独立项。

**修复顺序建议**
1. 先修【1】【4】——前者影响一整类和弦的判定，后者可致卡死；
2. 再修【2】【5】【6】【7】【8】【12】——纯数据/映射错误，改动小、风险低；
3. 【3】【13】需同步改测试，建议成组处理；
4. 【9】【10】【17】属「收敛真相源」，建议一次做透并补穷举护栏；
5. 【14】【11】【18】为体验优化，可排最后。
