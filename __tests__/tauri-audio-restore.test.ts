/**
 * `app/page.tsx` 的**源码级**契约：Tauri 启动时的「恢复音频输入」effect。
 *
 * 两层契约：
 *
 * 【A 层】判据必须是**真实运行状态**，不能只看 `micEnabled` 这个持久化意图。
 *   2026-10-02 用户实测报障（桌面 exe）：
 *     「启用音频输入后，点开始练习，弹任何音都没有反应，调音也无效」
 *   根因（旧实现）：`if (micEnabled) return` 把两层当成一层 ——
 *     · `micEnabled`      = 持久化的用户意图（storePartialize 含 audio ⇒ 跨会话保留）
 *     · Rust 采集是否在跑 = 进程级运行时状态（每次启动归零）
 *   用户开过一次音频 → micEnabled=true 落盘 → 下次启动直接 return ⇒
 *   **采集从未启动**，但练习检测 effect 照常 startPitchStream ⇒
 *   Rust `pipeline.rs` 的 `if !pipeline.is_capturing()` 守卫让检测线程静默空转。
 *
 * 【B 层】产品语义（2026-10-02 用户确认「跨会话记住」）：**默认开** ——
 *   「应该直接启用音频输入，不需要我每次开启，关闭才需要每次关闭」。
 *   ⇒ 有效意图 = `micEnabled || micUserDisabled !== true`
 *   （`micUserDisabled` 只在用户显式关（设置页/M 键走 setMicUserPreference）时为 true；
 *     从没碰过开关 = 默认开。显式关了才跨会话记住关。）
 *
 * 为什么只能靠源码断言：`app/page.tsx` 是 5000+ 行巨石、无法单独渲染；
 * 而 bug 的本质是 effect 的**接线顺序**（先问状态还是先看意图），
 * 且 vitest 环境里没有 Tauri 运行时。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PAGE_SRC = readFileSync('app/page.tsx', 'utf8')

/** 剥注释：说明性注释里会大段引用旧实现（含 `if (micEnabled) return`），不剥会误判 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const SRC = stripComments(PAGE_SRC)

/**
 * 取出「Tauri 启动恢复音频」那个 effect 的函数体。
 * 两个语义锚点：起点 `const restoreAudio = async () => {`，终点依赖数组 `}, [isTauri])`。
 * 任一锚点找不到必须**当场失败**，否则改结构后本护栏会静默空转。
 */
function sliceRestoreEffect(): string {
  const startAnchor = 'const restoreAudio = async () => {'
  const start = SRC.indexOf(startAnchor)
  expect(
    start,
    `page.tsx 里找不到 \`${startAnchor}\` —— 恢复音频的 effect 被改名/重构，` +
      `本护栏会静默空转，请同步更新锚点`
  ).toBeGreaterThan(-1)

  const endAnchor = '}, [isTauri])'
  const end = SRC.indexOf(endAnchor, start)
  expect(end, `恢复音频 effect 的依赖数组 \`${endAnchor}\` 没找到（可能被改了依赖）`).toBeGreaterThan(
    start
  )
  return SRC.slice(start, end + endAnchor.length)
}

describe('Tauri 启动恢复音频（A 层）：判据必须是真实运行状态', () => {
  it('锚点自检：effect 骨架与关键调用都还在（改名即失败）', () => {
    const body = sliceRestoreEffect()
    expect(/getAudioStatus\s*\(/.test(body), 'effect 里不再调用 getAudioStatus()').toBe(true)
    expect(/\.isCapturing/.test(body), 'effect 里不再读 .isCapturing').toBe(true)
    expect(
      /ensureCaptureRunning\s*\(/.test(body),
      'effect 里不再调用 ensureCaptureRunning()（恢复采集的逻辑被删空了？）'
    ).toBe(true)
  })

  it('① 先读真实状态：getAudioStatus() 必须发生在任何决定之前', () => {
    const body = sliceRestoreEffect()

    const statusIdx = body.indexOf('getAudioStatus(')
    const startIdx = body.indexOf('ensureCaptureRunning(')
    const branchIdx = body.indexOf('micWanted')
    const stopIdx = body.indexOf('stopAudioCapture()')

    expect(statusIdx, 'effect 里没有读真实运行状态').toBeGreaterThan(-1)
    expect(startIdx, 'effect 里没有启动采集').toBeGreaterThan(-1)

    expect(
      statusIdx < startIdx,
      'getAudioStatus() 在 ensureCaptureRunning() 之后 —— 判据顺序反了，读了个寂寞'
    ).toBe(true)
    if (branchIdx > -1) {
      expect(
        statusIdx < branchIdx,
        'getAudioStatus() 在「按意图分支」之后才调用 ⇒ 判据顺序反了'
      ).toBe(true)
    }
    if (stopIdx > -1) {
      expect(
        statusIdx < stopIdx,
        'getAudioStatus() 在 stopAudioCapture() 之后 —— 没读状态就停采集，可能停掉刚恢复的'
      ).toBe(true)
    }
  })

  it('🔴 回归哨兵：不得只凭 micEnabled 就直接 return（旧实现必须被判红）', () => {
    const body = sliceRestoreEffect()

    // 旧实现的确切形状：`if (micEnabled) return ...` —— 不看运行时状态就早退。
    const bareIntentEarlyReturn = /if\s*\(\s*micEnabled\s*\)\s*\{?\s*return\b/.test(body)
    expect(
      bareIntentEarlyReturn,
      '🔴 effect 又在「只看 micEnabled 意图」时早退了 —— 这就是「启用音频后弹音没反应」的根因：' +
        'micEnabled 是持久化意图，Rust 采集是进程级状态（每次启动归零）⇒ 采集永不启动、' +
        '检测线程静默空转。必须先 getAudioStatus() 读真实状态再决定。'
    ).toBe(false)

    // 判据没被顺手删掉
    expect(/getAudioStatus\s*\(/.test(body), 'effect 里没有 getAudioStatus() ⇒ 判据退化成了意图标志').toBe(true)
  })
})

describe('Tauri 启动恢复音频（B 层）：默认开 + 显式关跨会话记住', () => {
  it('② 默认开语义：有效意图必须是 `micEnabled || micUserDisabled !== true`', () => {
    const body = sliceRestoreEffect()

    const m = body.match(/const\s+micWanted\s*=\s*([^\n]+)/)
    expect(m, 'effect 里找不到 micWanted 的计算 ⇒ 默认开/记住关语义丢失').toBeTruthy()
    const expr = m![1]
    expect(
      /micEnabled/.test(expr) && /micUserDisabled\s*!==\s*true/.test(expr) && /\|\|/.test(expr),
      `micWanted 表达式形状不对（${JSON.stringify(expr.trim())}）：必须是 ` +
        `'micEnabled || audioSettings.micUserDisabled !== true' 的等价形式 —— ` +
        `少了 micUserDisabled 判据 ⇒ 用户显式关掉的会被默认开顶回去；` +
        `少了 micEnabled ⇒ 显式开过的反而被当成没开`
    ).toBe(true)
  })

  it('②' + "'" + ' 首次默认开生效时要把 UI 开关对齐成「开」（setMicEnabled(true)）', () => {
    const body = sliceRestoreEffect()
    const wantedIdx = body.indexOf('micWanted')
    const alignIdx = body.indexOf('setMicEnabled(true)')
    expect(alignIdx, '默认开生效时没有 store.setMicEnabled(true) ⇒ 界面开关显示「关」但采集在跑').toBeGreaterThan(-1)
    expect(
      alignIdx > wantedIdx,
      'setMicEnabled(true) 出现在 micWanted 计算之前 ⇒ 对齐逻辑脱离了默认开判断'
    ).toBe(true)
  })

  it('③ 意图为「关」（用户显式关过）⇒ 与 Rust 真实状态对齐（停掉遗留采集）', () => {
    const body = sliceRestoreEffect()
    const offIdx = body.indexOf('if (!micWanted)')
    expect(
      offIdx,
      'effect 里找不到「有效意图为关」的分支 ⇒ 用户显式关掉的，重启后会被默认开顶回去'
    ).toBeGreaterThan(-1)

    // 该分支内必须能 stopAudioCapture（与 Rust 真实状态对齐），而不是什么都不做
    const after = body.slice(offIdx, body.indexOf('ensureCaptureRunning', offIdx))
    expect(
      /stopAudioCapture\s*\(/.test(after),
      '「意图为关」的分支里没有 stopAudioCapture() ⇒ 无法与遗留的 Rust 采集状态对齐'
    ).toBe(true)
  })

  it('④ 设备挑选收敛在 ensureCaptureRunning（effect 里不得内联挑选逻辑）', () => {
    const body = sliceRestoreEffect()
    expect(
      /getAudioDevices\s*\(/.test(body),
      'effect 里又直接调 getAudioDevices() ⇒ 设备挑选逻辑出现第二份（铁律 14），会与 helper 静默漂移'
    ).toBe(false)
    expect(
      /deviceList\.find|isDefault/.test(body),
      'effect 里又内联了「已保存 → 默认 → 第一个」的挑选逻辑 ⇒ 与 lib/native-audio.ts 的 ensureCaptureRunning 漂移'
    ).toBe(false)
  })

  it('M 快捷键同样落偏好 + 运行时对齐（不得退回只翻标志）', () => {
    // 锚点用**代码**而不是注释（stripComments 会把注释剥掉）
    const start = SRC.indexOf("if (event.key === 'm' || event.key === 'M')")
    expect(start, "M 快捷键分支找不到了（event.key === 'm' 被删/被改）").toBeGreaterThan(-1)
    const seg = SRC.slice(start, start + 1600)

    expect(
      /setMicUserPreference\(/.test(seg),
      'M 快捷键还在直接 setMicEnabled(!micEnabled) ⇒ 只翻标志：偏好不落盘（关不被记住）'
    ).toBe(true)
    expect(
      /ensureCaptureRunning\s*\(/.test(seg) && /stopAudioCapture\s*\(/.test(seg),
      'M 快捷键（Tauri 分支）没有运行时对齐：开 ⇒ ensureCaptureRunning，关 ⇒ stopAudioCapture。' +
        '只翻标志不碰 Rust 就是「以为开了其实没开」的另一个门'
    ).toBe(true)
  })
})

/**
 * 【C 层】落盘音频设置 → 后端的启动同步（2026-10-04 接线；同日补 bufferSize）。
 *
 * preprocessor / capture gain / 缓冲区都是**进程级状态**：Rust 每次启动回到编译期默认值
 * （60Hz 陷波默认**开**、噪声门倍数 1.5、缓冲区 DEFAULT_BUFFER_SIZE），而设置页显示的是
 * store 落盘值（默认 60Hz 陷波**关**）。不同步 ⇒「界面显示 A、后端实际跑 B」，
 * 用户拖过一次控件才偶然一致。
 *
 * 结构契约（本文件风格：靠锚点钉源码形态，锚点找不到必须当场失败）：
 *   ① 四连同步都必须调用（降噪 / 滤波器 / 增益 / **缓冲区大小**）；
 *   ② 兜底必须走 `getEffectiveAudioSettings`（唯一真相源，不许各自 ?? 默认值）；
 *   ③ 同步发生在「按意图分支」**之前**（「关」分支会 return，放后面就被跳过）；
 *   ④ 同步失败不得中断采集恢复（独立 try/catch）。
 */
describe('Tauri 启动恢复音频（C 层）：落盘设置同步到后端', () => {
  it('锚点自检：四连同步与唯一真相源都在（删块/改名即失败）', () => {
    const body = sliceRestoreEffect()
    expect(/setNoiseSuppression\s*\(/.test(body), 'effect 里不再同步降噪设置').toBe(true)
    expect(/setFilters\s*\(/.test(body), 'effect 里不再同步滤波器开关').toBe(true)
    expect(/setGain\s*\(/.test(body), 'effect 里不再同步输入增益').toBe(true)
    expect(
      /setBufferSize\s*\(/.test(body),
      'effect 里不再同步缓冲区大小 —— Rust 每次启动回到 DEFAULT_BUFFER_SIZE，' +
        '用户选过的值会丢失（真机实测过「设 4096、流用 1024」）'
    ).toBe(true)
    expect(
      /getEffectiveAudioSettings\s*\(/.test(body),
      '同步没有走 getEffectiveAudioSettings（唯一真相源）——各自 ?? 默认值会与设置页分叉'
    ).toBe(true)
  })

  it('bufferSize 同步同样在「按意图分支」之前（与其余三连同一位置）', () => {
    const body = sliceRestoreEffect()
    const syncIdx = body.indexOf('setBufferSize(')
    const branchIdx = body.indexOf('micWanted')
    expect(syncIdx, '找不到 bufferSize 同步调用（setBufferSize）').toBeGreaterThan(-1)
    expect(
      syncIdx < branchIdx,
      'bufferSize 同步在意图分支之后 —— 「用户显式关过」的分支会 return，同步被跳过'
    ).toBe(true)
  })

  it('同步发生在「按意图分支」之前（意图为「关」时也要同步：下次开采集设置才是对的）', () => {
    const body = sliceRestoreEffect()
    const syncIdx = body.indexOf('setNoiseSuppression(')
    const branchIdx = body.indexOf('micWanted')
    expect(syncIdx, '找不到同步块（setNoiseSuppression 调用）').toBeGreaterThan(-1)
    expect(branchIdx, '找不到意图分支（micWanted）').toBeGreaterThan(-1)
    expect(
      syncIdx < branchIdx,
      '设置同步在意图分支之后 —— 「用户显式关过」的分支会 return，同步被跳过'
    ).toBe(true)
  })

  it('同步在「读真实状态」之后（顺序：先问 Rust → 再对齐设置）', () => {
    const body = sliceRestoreEffect()
    const statusIdx = body.indexOf('getAudioStatus(')
    const syncIdx = body.indexOf('setNoiseSuppression(')
    expect(statusIdx < syncIdx, '同步抢在 getAudioStatus 之前 —— 打乱了「先读状态再决定」的顺序').toBe(true)
  })

  it('同步失败不得中断采集恢复：独立 catch（syncErr），与主 catch 分开', () => {
    const body = sliceRestoreEffect()
    expect(
      /catch\s*\(\s*syncErr\s*\)/.test(body),
      '同步块没有独立 catch ⇒ 同步失败会冒泡到主 catch，把采集恢复一起陪葬'
    ).toBe(true)
  })
})

/**
 * D 层：桌面端 YIN 门限按乐器同步（2026-10-04 · 「setPitchThreshold 零调用」补线）。
 *
 * 为什么只能靠源码断言：接线点藏在 `app/page.tsx` 的「乐器变化 effect」里（巨石、无法单独渲染），
 * 而 bug 的形态是「调用缺失 / 实参错误」——vitest 环境里也没有 Tauri 运行时，跑不到真实 invoke。
 *
 * 契约：
 *   ① 门限必须由 `resolveYinThreshold(instrumentConfig.lowestStringHz)` 解析
 *      （与 web 三条路径同源：<75Hz 的低频乐器放宽到 0.2，否则 0.15）；
 *   ② 不得写死 0.15/0.2，也不得直接传 Hz 数值（Rust 侧 clamp(0.05, 0.5) 会把它抬到 0.5，误检暴增）；
 *   ③ 本 effect 是**唯一同步点**：挂载 + 每次换乐器都跑，所以 deps 必须含
 *      `instrumentConfig.lowestStringHz` 与 `isTauri`（后者 false→true 时要补一次同步）。
 *
 * 历史：`setPitchThreshold`（TS）/ `set_pitch_threshold`（Rust，0.05-0.5 校验）此前**零调用方**，
 * Rust detector 恒为编译期默认 0.15 —— 与 web 侧自动解析分叉（低频乐器拿不到 0.2）。
 */
function sliceInstrumentEffect(): string {
  const startAnchor = 'const floor = detectFloorForLowestHz(instrumentConfig.lowestStringHz)'
  const start = SRC.indexOf(startAnchor)
  expect(
    start,
    `page.tsx 里找不到 \`${startAnchor}\` —— 乐器 effect 被改名/重构，本护栏会静默空转，请同步更新锚点`
  ).toBeGreaterThan(-1)

  const endAnchor = '}, [instrumentConfig.lowestStringHz, user.instrument, isTauri])'
  const end = SRC.indexOf(endAnchor, start)
  expect(
    end,
    `乐器 effect 的依赖数组 \`${endAnchor}\` 没找到（可能被改了依赖）—— ` +
      `isTauri 从 false→true 时不再补同步，或换乐器不再触发同步`
  ).toBeGreaterThan(start)
  return SRC.slice(start, end + endAnchor.length)
}

describe('Tauri 桌面端 YIN 门限按乐器同步（D 层）：setPitchThreshold 接线', () => {
  it('锚点自检：乐器 effect 骨架与动态 import 都还在（删块/改名即失败）', () => {
    const body = sliceInstrumentEffect()
    expect(/setMinDetectFreq\s*\(/.test(body), 'effect 里不再设置音高检测下限').toBe(true)
    expect(
      /import\(['"]@\/lib\/native-audio['"]\)/.test(body),
      'effect 里没有动态 import native-audio —— 接线被删？'
    ).toBe(true)
  })

  it('门限解析必须与 web 同源：完整实参 resolveYinThreshold(instrumentConfig.lowestStringHz)', () => {
    const body = sliceInstrumentEffect()
    expect(
      body.includes('setPitchThreshold(resolveYinThreshold(instrumentConfig.lowestStringHz))'),
      '乐器 effect 里没有 `setPitchThreshold(resolveYinThreshold(instrumentConfig.lowestStringHz))` —— ' +
        'Rust detector 会退回默认 0.15，贝斯/七弦低 B 拿不到放宽后的 0.2（与 web 三条路径分叉）'
    ).toBe(true)
  })

  it('不得写死门限：0.15/0.2 字面量出现在实参即回归', () => {
    const body = sliceInstrumentEffect()
    expect(
      /setPitchThreshold\s*\(\s*0\.(15|2)\s*\)/.test(body),
      '把 YIN 门限写死成 0.15/0.2 —— 换乐器不再更新，贝斯/吉他互相切换后门限错误'
    ).toBe(false)
  })
})
