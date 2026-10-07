# FretMaster 全面审查报告 v2

审查日期：2026-09-10
适用版本：v0.2.166（package.json）
审查范围：核心算法、音高检测、React 状态与生命周期、UI/i18n/a11y、数据持久化、统计、导出、CGI 后端、构建健康度
验证方式：静态代码走查 + 真实运行单元测试（`npm run test:run`）

> 本报告取代 2026-07-28 的 `codebase-audit-report.md`。旧报告中标记为已修复的项**未在本报告重复列出**，仅保留仍未修复或新发现的问题。

---

## 摘要

| 级别 | 数量 | 说明 |
|------|------|------|
| **P0 致命** | 3 | 默认音高算法失效、和弦解析错误、单体巨石文件 |
| **P1 严重** | 11 | 内存泄漏、暂停失效、数据丢失、CGI 安全漏洞 |
| **P2 一般** | 15 | 算法正确性、i18n、a11y、快捷键冲突 |
| **P3 优化** | 8 | 性能、死代码、架构 |
| **功能建议** | 12 | 见最后一节 |

**当前测试状态（客观证据）**：`Test Files 1 failed | 2 passed`，`Tests 4 failed | 132 passed | 14 skipped`。
失败的 4 个全部指向和弦解析 bug；跳过的 14 个全部指向 SOLO 音高算法 bug。

---

## P0 致命问题

### P0-1. SOLO YIN 算法的 FFT 实现错误，且被设为默认算法

**位置**：`lib/pitch-detection.ts:99-117`（FFT）、`:130-137`（IFFT）、`:312-338`（自相关）；默认值 `lib/store.ts:450`

**问题**：`FloatFFT.complexForward` 中，旋转因子 `wr/wi` 被声明在 `j` 循环**内部**：

```ts
for (let j = 0; j < le2; j++) {
  let wr = ur, wi = ui            // ← 每轮重置为 (1,0)
  for (let i = j; i < n; i += le) { /* 使用恒为 (1,0) 的 wr/wi */ }
  const temp = wr * sr - wi * si  // 更新结果在下一轮 j 被丢弃
  wi = wr * si + wi * sr
  wr = temp
}
```

旋转因子恒为 `(1,0)`，蝶形运算退化为纯加减，**这不是 DFT**。以 N=8、输入 δ[n-1] 为例，本实现输出 `(1,0)(1,0)(1,0)(1,0)(-1,0)(-1,0)(-1,0)(-1,0)`，正确 DFT 应为 `(1,0)(.71,-.71)(0,-1)…`。

`difference()` 用该 FFT 做自相关（`:312`、`:321`、`:333`），因此 `yinBuffer` 的 CMNDF 全部错误。此外 `complexInverse`（`:130-133`）对**实部也取负**，标准 IFFT 只应对虚部取共轭两次，此处导致结果整体符号翻转。

**为什么是 P0**：
- **这是默认算法**。`lib/store.ts:450` `pitchAlgorithm: 'solo', // 默认使用SOLO算法`。
- **开发者已知但误判**。`__tests__/tuner-pitch-detection.test.ts:227-231` 写着：
  > "SOLO (FFT加速版) 在 Node.js 测试环境中存在已知问题：FFT 自相关计算不稳定，总是返回 F#。……这里跳过 SOLO 测试。"

  但这是**与环境无关的数学错误**——不是 Node 特有现象，浏览器中同样错。开发者跳过了测试而非修复。
- **调用路径活跃**：`app/page.tsx:6561/6593/8022/8055` 通过 `getSOLOYinAnalyser` 调用，且 `:6560` 判断 `currentAlgorithm === 'solo'` 时走此路径。
- **用户影响**：默认配置下，调音器与练习模式的音高检测结果不可信（表现为"总是返回 F#"或随机音名）。

**修复**：将 `wr/wi` 提升到 `l` 循环内、`j` 循环外并持续递推；`complexInverse` 只对虚部取负。修复后**务必启用**被 skip 的 14 个测试，并考虑将默认算法改回 `'standard'`（标准 YIN 已验证正确）。

---

### P0-2. 和弦解析：小写 `m` 被当作大写的错误

**位置**：`lib/chord-theory.ts:738, 802-812`

**问题**：`nextToken` 在 `:738` 执行 `const firstChar = str[0].toUpperCase()`，抹掉了 `m`（小调）与 `M`（大调）的大小写区别。随后 `:802`：

```ts
if (firstChar === 'M' && str.length > 1 && /^[0-9]/.test(str.slice(1))) {
  return { token: ChordToken.MAJOR, remaining: str.slice(1) }   // → majorSeven
}
```

输入 `m7` 时 `firstChar='M'`、`str.slice(1)='7'` 命中数字分支 → 返回 MAJOR。`str[0] === 'm'` 的判定必须在 `toUpperCase()` **之前**完成。

**客观证据（真实测试结果）**：
```
FAIL __tests__/chord-theory.test.ts > 应该正确解析 Cm 小三和弦
  expected 'majorTriad' to be 'minorTriad'
FAIL __tests__/chord-theory.test.ts > 应该正确解析 F#m7
  expected 'majorSeven' to be 'minorSeven'
FAIL __tests__/chord-theory.test.ts > 应该标记为 MINOR（带变音根音）
  expected [ 'F','SHARP','MAJOR','SEVEN' ] to include 'MINOR'
```

**影响范围**：**所有小调和弦**。`Cm`→majorTriad、`Cm7`→majorSeven、`Cm9`→majorNine；`Cm6/Cm11` 无匹配则静默退回 majorTriad（`:930-934`）。这直接破坏和弦练习、和弦进行、Voice Leading 全部依赖小调的场景。

**修复**：`nextToken` 中先取 `const raw = str[0]`，用 `raw === 'm'` 判定小调，`raw === 'M'` 判定大调，再走后续分支。

---

### P0-3. `app/page.tsx` 是 689KB / 约 14000 行的单体巨石文件

**位置**：`app/page.tsx`（689,192 字节）

**问题**：单个组件文件承担了全部业务逻辑：53+ 个 `useState`、音频采集与检测、6 种练习模式、统计、全屏、主题、快捷键、i18n 调度、弹窗……且：
- 仅 11 处 `useMemo`、**0 处 `React.memo`**；
- `:5187` `const store = useAppStore()`（无 selector，订阅整个 store）→ 任何 store 变化触发全页重渲染；
- 无法单元测试（除纯算法库外），是本次审查中绝大多数 bug 的共同土壤。

**影响**：不可维护、不可测试、渲染性能差、每次改动都易引入回归。**这是架构层面的 P0**。

**修复**：按功能域拆分为 `hooks/`（`useAudioEngine`、`usePracticeSession`、`useStatsPersistence`、`useKeyboardShortcuts`、`useTheme`）+ 各练习模式子组件，逐步迁移而非一次性重写。

---

## P1 严重问题

### 音频生命周期

| # | 位置 | 问题 | 后果 |
|---|------|------|------|
| P1-1 | `page.tsx:5713-5720, 6517-6538, 6666-6698` | 调音器的 `MediaStream`/`AudioContext`/`requestAnimationFrame` 只在 `stopTuner` 释放，**无 unmount cleanup** | 切路由/HMR 后麦克风持续占用（录音灯常亮）、AudioContext 泄漏 |
| P1-2 | `page.tsx:7163, 7166-7234, 7544-7586` | 主音频链路同样无 unmount 清理 | 同上 |
| P1-3 | `page.tsx:6492-6495, 6655-6657, 6705` | `startTuner` 返回的 cleanup 被丢弃；`isActive` 是局部变量恒为 `true` | Tauri 分支的 `stopAudioCapture()` 永不执行；连点可并存两条 rAF 检测链 |
| P1-4 | `page.tsx:7883-7933` | Tauri 50ms 轮询：`startPolling` 是 async，`intervalId` 在 await 后才赋值；cleanup 时可能仍为 `null` | 产生**永久存活的孤儿 interval**，每 50ms 空转 IPC |

### 练习会话正确性

| # | 位置 | 问题 | 后果 |
|---|------|------|------|
| P1-5 | `page.tsx:6821-6843, 7878-7934, 6201-6242` | **暂停功能整体失效**：`isPracticePaused` 不在任何 effect 的依赖数组中 | 暂停后倒计时继续走、Tauri 仍能判分、会话时长把暂停时间计入 |
| P1-6 | `page.tsx:6827, 6843` | 练习总结时长 `practiceTime - (timeLeft - 1)`，effect 依赖组不含 `timeLeft`，闭包值恒等于 `practiceTime` | 总结面板显示的时长**永远是 0:01** |
| P1-7 | `page.tsx:6824-6837, 6913-6923` | 在 `setState(prev => …)` updater 内调用 `setIsPlaying`/`setPracticeSummaryData`/`generateIntervalExerciseRef.current?.()` | updater 必须纯函数；并发渲染下会重复执行副作用 |
| P1-8 | `page.tsx:6161-6175` | `setPracticeStats` updater 内用 `queueMicrotask` 落库+上报 | updater 重复执行 → 重复 `saveToServer`、重复累加 localStorage（`deduplicateStats` 要清理的脏数据来源） |
| P1-9 | `page.tsx:5818 vs 5833-5839` | `scoreRef.current = score` 但依赖数组缺 `score` | `recordPractice` 可能读到旧分数 |
| P1-10 | `page.tsx:5518/6185/5519` | 会话计时存在双真相源：`practiceSessionStartTime` 与 `sessionStartRef`；`pausePractice` 只累加 `practiceElapsedTime`，`sessionStartRef` 从不参与暂停 | `duration` 把暂停时间计入，与 `recordPractice` 口径不一致 |

### 数据持久化与丢失

| # | 位置 | 问题 | 后果 |
|---|------|------|------|
| P1-11 | `page.tsx:6161-6174` | `localStorage.setItem` 无 try-catch，且在 `saveToServer` **之前** | 配额超限时抛异常中断微任务 → 该次记录**既不入本地也不上传**，静默丢失 |
| P1-12 | `lib/stats-api.ts:305-325` | 同步前先 `setItem(LOCAL_BACKUP_KEY, '[]')` 清空备份，逐条 `fetch` 失败只打日志；且不检查 `response.ok` | 弱网下记录**永久丢失**；服务器返回 HTTP 200 + `{"status":"error"}` 也被当作成功 |
| P1-13 | `lib/position-stats.ts:122-135, 205-212` | flush 时用内存 `cache` 全量重建并覆盖写 | 未在本会话加载的**其它乐器掌握度数据被清空** |
| P1-14 | `lib/position-stats.ts:97-99, 178` | `dirtyKeys.clear()` 在写盘**之前**执行 | 写入失败即丢失增量；`clearPositionStats` 会连带丢弃其它乐器待写增量 |
| P1-15 | `page.tsx:6055-6068` | 崩溃恢复逻辑**反了**：30 分钟内（唯一有效）的快照被 `removeItem`，过期数据反而保留；且全项目无任何恢复读取代码 | 崩溃/刷新恢复功能**实际不存在** |
| P1-16 | `lib/store.ts:776, 836` | 持久化 `version: 1` 从不递增；zustand 默认浅合并 | 老用户新增的嵌套字段恒为 `undefined`（如 `fretZoneSize` → `Math.min(undefined)` = NaN 写回） |

### 安全漏洞（CGI 后端）

> `scripts/cgi-stats-fixed.sh`（仓库根目录为 `cgi-stats-fixed.sh`）是一个**直接处理外部 HTTP 输入的 bash CGI 脚本**，部署在路由器上。

| # | 位置 | 问题 | 攻击载荷 / 后果 |
|---|------|------|----------------|
| P1-17 | `cgi:8` + `scripts/deploy_router.py:11` | SQLite 库文件位于 Web 静态根目录下：`DB_FILE="/www/fretmaster/data/practice.db"`，`REMOTE_DIR="/www/fretmaster/"` | `curl http://<router>/fretmaster/data/practice.db -o db` → **全量练习记录 + 所有用户 `client_ip` 泄露** |
| P1-18 | `cgi:167-171, 259-320` | **完全无鉴权**；DELETE 仅校验 id 为数字、无归属校验；GET 无 device_id 时返回全部记录；`Access-Control-Allow-Origin: *` 且 OPTIONS 放行 DELETE | `for i in $(seq 1 5000); do curl -X DELETE …/stats -d "{\"id\":$i}"; done` **清空整个库**；任意第三方网页可跨域 CSRF 删库/伪造记录（`device_id` 前端硬编码 `fretmaster_user`） |
| P1-19 | `cgi:224` | `.param set :notes '$NOTES'` —— sqlite3 shell 的 `.parameter set` 将值以 `%s` **原样拼入 SQL 求值**（非绑定参数） | 无需引号即可注入：`"(SELECT group_concat(client_ip) FROM practice_records)"` 可**外带他人 IP**；`"(WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT sum(x) FROM c)"` 可 **CPU/内存耗尽路由器** |
| P1-20 | `cgi:219-243` + `stats-api.ts:106` | `sqlite3` CLI 默认 `busy_timeout=0`，无 `flock`；出错时脚本仍返回 HTTP 200 + `{"status":"error"}`，客户端只判断 `response.ok` | 多设备并发写触发 `SQLITE_BUSY`，上层误判成功 → 记录丢失 |

**修复建议**：DB 移出 web root；加最小鉴权（device token）与归属校验；改用参数化写入（或改用 Python/Node 脚本，避免 sqlite3 shell 的 `.param set` 求值语义）；`PRAGMA busy_timeout=5000` + `flock`；错误返回 5xx；收紧 CORS。

---

## P2 一般问题

### 算法正确性

| # | 位置 | 问题 |
|---|------|------|
| P2-1 | `chord-theory.ts:279`（fretboard-positions）| **CAGED 指型图全部错误**：`const fret = o.offset + thirdShift` 漏加 `rootFret`，相对偏移被当成绝对品。C 根音 E 型（`rootFret=8`）会画出开放 E 和弦 0-2-2-1-0-0；C 型含负偏移全被 `fret<0` 丢弃。应为 `rootFret + o.offset + shift`。（`fretboard-positions.ts:169` 注释明确 offsets 是"相对根音品的偏移"） |
| P2-2 | `chord-theory.ts:494-563` | 和弦名显示用链式 `.replace`，短名先替换导致长名永不匹配：`minorSevenFlatFive`→`m7FlatFive`、`dominantSevenAlt`→`7Alt`、`majorSevenSharpEleven`→`Maj7SharpEleven` 等 20+ 个（`theory-panel.tsx:28` 使用，用户可见）。应改为精确查表 |
| P2-3 | `chord-theory.ts:649/662/696` | 和弦音程结构音乐性错误：`dominantSevenAlt` 同时含 ♭13(8) 与自然 13(21)；`dominantThirteenFlatNine`、`thirteenSusFourFlatNine` 同时含 ♭9(13) 与 ♮9(14) → `getChordNotes` 会同时给出 D♭ 与 D |
| P2-4 | `chord-theory.ts:196-198` | 降号调永远显示升号：`keyName` 取自 `sharpName`（恒不含 `'Bb'`），列表里 `Bb/Eb/…` 是死条件 |
| P2-5 | `scale-theory.ts:68/175` | `lydianSharp9` 实际为 1-2-3-♯4-5-♯6-7，**不含 ♯9**；而它是 `majorSevenSharpNine`（含 ♯9）唯一推荐音阶 |
| P2-6 | `music-theory.ts:197-200`, `scale-theory.ts:260-262` | 重降号永不生成：`.replace(/b/g,'♭')` 先执行，`bb` 被拆成 `♭♭`，`𝄫` 分支是死代码。应先替换双变音号 |
| P2-7 | `music-theory.ts:62, 86, 329` | 负数取模未处理：`Math.round(midi) % 12` 对负值返回负索引 → `NOTE_NAMES[-8]` 为 `undefined`（签名却是 `string`） |
| P2-8 | `practice-levels.ts:1534/1560` | 减音阶级别定义错误：`sus: [1,2,4,5,5,6,7,8]` 含重复 5、缺 3；`diminishedDominant` 在 8 音减音阶上索引到 9（越界） |
| P2-9 | `pitch-detection.ts:590` | `YINDetector` 工厂硬编码 `48000`（`page.tsx:8109` 调用），仅在死路径 `runPitchDetectionOld` 中——一旦启用即出错 |
| P2-10 | `pitch-detection.ts:226/500` | 八度修正用整数 tau 未做抛物线插值，48kHz 下相邻 bin 差约 74 音分 |

### UI / i18n / a11y

| # | 位置 | 问题 |
|---|------|------|
| P2-11 | `page.tsx:9597-9760` | 全局快捷键未排除 `ctrlKey/metaKey/altKey` → **劫持 Ctrl+P/F/M/S** 等系统快捷键并触发应用功能 |
| P2-12 | `focus-mode.tsx:146-165` | 空格键 `preventDefault` 未排除输入控件 → 键盘用户在设置面板**无法用空格勾选复选框**（`250/259/268`） |
| P2-13 | `page.tsx:10880` | `t('language')` 缺失 key（zh-CN/en 均无定义）→ 设置面板显示裸字符串 **`language`** |
| P2-14 | `feedback-dialog.tsx`（约 31 处）、`onboarding-trigger.tsx:61/77/103`、`layout-shell.tsx:56`（`<ErrorBoundary language="zh-CN">` 写死） | 完全未国际化，英文模式仍显示中文 |
| P2-15 | `page.tsx:10181/10195/10267/12244/12535/12603/12766/12866` 等 | `aria-label` 硬编码中文，英文模式读屏读中文 |
| P2-16 | `page.tsx:13934/14146/14207/…/14691`、`custom-song-editor-ui.tsx:762`、`theory-panel.tsx:274/304` | 可点击 `div`/SVG `<g onClick>` 无 `role`/`tabIndex`/`onKeyDown`，键盘完全不可达 |
| P2-17 | `course-panel.tsx:304-313` | `<span role="button" tabIndex={-1}>` 嵌套在 `<button>` 内，违反 HTML 规范且不可聚焦（**已失效**：该文件 2026-10-06 随引导课程一并移除） |
| P2-18 | `page.tsx` 17 个 `size="icon"` 按钮 | 图标按钮无 `aria-label`（收藏星标 13977、信息 13992、暂停/关闭等） |
| P2-19 | `page.tsx:13503-13524` | 底部导航 8 项各 `min-w-[3rem]`（≥384px），无 `overflow-x-auto`，360–375px 手机横向溢出 |
| P2-20 | `page.tsx:13544`、`fretboard-reference-diagram.tsx:136`（**后者已失效**：该文件 2026-10-06 随引导课程一并移除） | `min-w-[400px]` / `min-w-[380px]` + 父级 `overflow-hidden` → 窄屏内容被裁且无法滚动 |

---

## P3 优化与死代码

| # | 位置 | 问题 |
|---|------|------|
| P3-1 | `page.tsx:5187` | `useAppStore()` 无 selector 全量订阅 → 每次 store 变化全页重渲染。应 `useShallow` 选择所需字段 |
| P3-2 | 全局 | 仅 11 处 `useMemo`、0 处 `React.memo`；指板 6×15 网格每次点击高亮都全量重建 |
| P3-3 | `page.tsx:7891-7922` vs `lib/native-audio.ts:295/327` | 已有 `startPitchStream`+`listenPitchDetected` 事件流，却仍用 50ms 轮询（20 次/秒 IPC）；`native-audio-manager.ts` 在 `app/`、`components/` 中零引用（死代码） |
| P3-4 | `lib/store.ts:8-33` | `debounceStorage` 延迟 300ms 且无 `flush()`、未监听 `pagehide` → 300ms 内关闭页面丢失自定义歌曲/收藏 |
| P3-5 | `app/page.tsx.corrupted`（417KB） | 遗留的损坏源文件，应删除 |
| P3-6 | `page.tsx:8101-8116` | `runPitchDetectionOld` 定义后从未调用（死代码，含 P2-9） |
| P3-7 | `components/stats-panel.tsx`、`components/virtual-list.tsx` | 无引用死组件，且含大量硬编码中文 |
| P3-8 | `app/layout.tsx:63-64, 71-72` | 全局错误处理**刻意忽略 Hydration 错误** + `suppressHydrationWarning`，属掩盖而非修复 |

---

## 功能增强建议

**音频与实时反馈**
1. 支持 ASIO / WASAPI 独占模式，进一步降低桌面版延迟。
2. 和弦听辨训练（Ear Training）模块：播放和弦让用户辨识类型/转位，补齐"听"的训练闭环。
3. 节拍器增强：可编程节奏型、重音、渐快（accel.）练习。
4. 实时频谱/音分曲线可视化，帮助用户理解音准偏差趋势。

**练习与学习**
5. 间隔重复（SRS）题库：根据历史正确率安排复习，弱项优先。
6. 每日目标与连续打卡（streak）、周报/月报。
7. 自定义练习编排（Workout）：把多个练习级别串联成一次训练流程。
8. 练习回放/时间轴，标注每次答错的音符位置。

**数据与同步**
9. 云端账号 + 多设备同步（当前 device_id 硬编码，无法区分用户）。
10. 完整的备份/恢复（导出全部设置与统计为单一文件），修复当前"崩溃恢复形同虚设"的问题。
11. 数据完整性校验与 schema 迁移机制。

**教学与内容**
12. 导入 Guitar Pro / MusicXML 曲谱，扩充内置曲库；结合已有的 iReal Pro 导入形成统一入口。

**无障碍**
13. 完整的键盘导航 + 屏幕阅读器支持 + 高对比度主题（当前 a11y 缺口较大）。

---

## 建议修复顺序

1. **立即（P0）**：修复 FFT 实现 → 启用被 skip 的 SOLO 测试；修复和弦 `m` 解析 → 让 4 个失败测试通过。这两项直接决定核心功能是否可用。
2. **本周（P1 音频/会话）**：补音频 unmount cleanup、修复孤儿 interval、修复暂停失效与时长为 1 秒、消除 updater 副作用。
3. **本周（P1 安全）**：CGI 后端加固（移出 web root、鉴权、参数化写入、busy_timeout/flock、5xx）。**这是唯一涉及真实安全风险的项，优先级最高。**
4. **随后（P1 数据）**：修复 localStorage/备份/位置统计的数据丢失路径，修正崩溃恢复逻辑。
5. **然后（P2）**：算法正确性（CAGED、和弦名、音程结构、降号调）+ i18n 补 key + 快捷键冲突。
6. **持续（P3 + 架构）**：拆分 `app/page.tsx`，引入 memo/selector，恢复事件驱动音频。

---

*本报告基于 2026-09-10 的代码快照，所有标记为"确证"的问题均经过源码核对或真实测试验证。*

---

## 修复状态（2026-09-10 同日完成）

已按报告完成修复，验证结果：`npm run test:run` → **150 passed**（修复前为 4 failed + 14 skipped）；`npx tsc --noEmit` → 无错误；`npm run build` → 成功。

| 项 | 状态 |
|----|------|
| P0-1 FFT 算法、P0-2 和弦 m/M 解析 | ✅ 已修复，跳过的 14 个 SOLO 测试已恢复并通过 |
| P0-3 巨石文件拆分 | ⏸ 未做（高风险重构，建议单独立项） |
| P1 音频泄漏 / 孤儿 interval / 暂停失效 / 时长恒 1 秒 / updater 副作用 / scoreRef / 计时双源 | ✅ 已修复 |
| P1 数据丢失（localStorage / stats-api / position-stats / 崩溃快照 / store 深合并） | ✅ 已修复 |
| P1 CGI 安全（DB 位置 / 鉴权 / 注入 / 并发锁）与部署脚本删库 bug | ✅ 已修复（脚本结构重写） |
| P2 算法（CAGED / 和弦名 / 音程 / 降号调 / lydianSharp9 / 负数取模 / 减音阶） | ✅ 已修复 |
| P2 i18n / 快捷键 / a11y / 响应式 | ✅ 主要项已修复 |
| P3 死代码清理、debounce flush、hydration 豁免 | ✅ 已处理 |
| P3 store 精确订阅 / memo / 事件驱动音频 | ⏸ 未做（与巨石文件重构耦合） |
| 剩余 a11y 细节（部分图标按钮 aria-label、可点击 div 键盘化） | ⏸ 未做 |

未完成项均属"需要结构性重构才能有效解决"的类型，已在上方单独标注，建议作为后续架构任务推进。
