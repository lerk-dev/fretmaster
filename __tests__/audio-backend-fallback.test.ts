/**
 * 音频后端回退契约（Rust 侧源码护栏）
 *
 * 背景：`AudioBackend` 的三个后端里，`WasapiExclusive` 与 `Asio` 都属于
 * 「需要特定硬件/编译条件、失败概率高」的增强后端。产品承诺（写在前端文档注释里）是
 * **任一增强后端不可用时都回退到 WASAPI 共享**,而不是直接失败。
 *
 * 曾出现的问题：`Asio` 分支只透传 `Err`，没有回退 ⇒ 用户选中 ASIO 时
 * 直接吃报错、完全没声音；而前端三处文案都写着「会自动回退共享」。
 *
 * 本用例锁住两件事：
 *   ① 两个增强后端的**分支结构一致**（都有 `self.backend = WasapiShared` + 重试调用）
 *   ② `start_with_host` 里「置位 `is_capturing` 之后的失败路径」必须回滚标志位
 *
 * 为什么用源码断言而不是行为测试：`start_exclusive` / `start_asio` 都要碰真实
 * 音频设备与系统 API，vitest 跑不到；而这些是本仓库的核心约定，值得用源码钉死。
 * 断言前统一**剥掉注释**：否则「注释里写了 WasapiShared」会让用例假通过。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const CAPTURE_SRC = readFileSync('src-tauri/src/audio/capture.rs', 'utf8')

/** 剥掉 `//` 行注释与块注释（避免注释内容让断言假通过） */
function stripComments(src: string): string {
  const BLOCK = new RegExp('/\\*[\\s\\S]*?\\*/', 'g')
  const LINE = new RegExp('//.*$', 'gm')
  return src.replace(BLOCK, '').replace(LINE, '')
}

const SRC = stripComments(CAPTURE_SRC)

/**
 * 取「从函数签名处开始、到下一个**方法声明**之前」的切片。
 *
 * 🚨 边界必须同时认同 `fn` / `pub fn` / `pub(crate) fn`——只认裸 `fn` 时，
 * 紧随其后的私有辅助函数一旦被删/改名，边界就会一路滑到 `impl Default` 的
 * `fn default()`，把 stop() 里的回滚也算进上一个函数的账上
 * （2026-10-04 实测：删掉 calculate_optimal_buffer_size 后该护栏自己把自己咬红，2 → 3）。
 */
function sliceFromFn(sig: string): string {
  const start = SRC.indexOf(sig)
  expect(start, `找不到 ${sig}`).toBeGreaterThan(-1)
  const rest = SRC.slice(start)
  const m = /\n {4}(?:pub(?:\(crate\))? )?fn /.exec(rest.slice(1))
  const end = m ? m.index + 1 : -1
  return end > -1 ? rest.slice(0, end) : rest
}

/** 取 `start_with_backend` 函数体（从签名到下一个方法声明之前） */
function backendMatchArm(): string {
  return sliceFromFn('pub fn start_with_backend')
}

describe('音频后端回退契约（Rust 源码护栏）', () => {
  it('两个增强后端（独占 / ASIO）都必须有回退分支', () => {
    const body = backendMatchArm()

    // 两个分支各自出现一次 `AudioBackend::WasapiShared` 赋值（即回退动作）
    const fallbackAssigns = body.match(/self\.backend\s*=\s*AudioBackend::WasapiShared/g) ?? []
    expect(
      fallbackAssigns.length,
      `预期恰好 2 处回退赋值（独占 + ASIO），实际 ${fallbackAssigns.length} 处。\n` +
        '若为 1 处，说明某个增强后端又变成了「只透传 Err」。\n' +
        `分支体：\n${body}`,
    ).toBe(2)
  })

  it('ASIO 分支必须走 match + Err 回退，不能是裸的函数调用', () => {
    const body = backendMatchArm()

    // 反例（曾出现的写法）：`AudioBackend::Asio => self.start_asio(device_name, target_sample_rate),`
    const bareCall = /AudioBackend::Asio\s*=>\s*self\.start_asio\([^)]*\),\s*\n\s*AudioBackend::WasapiShared/
    expect(
      bareCall.test(body),
      'ASIO 分支退化成了裸调用（无 match / 无回退）。必须与独占分支同构：\n' +
        'match self.start_asio(...) { Ok(()) => Ok(()), Err(e) => { ...回退... } }',
    ).toBe(false)

    // 正向：ASIO 分支里确实出现了 match + 回退赋值
    // 🚨 边界要用「下一个分支的起始」而不是 `WasapiShared` 这个词 ——
    //    后者本身就出现在回退赋值语句里，用它截断会把要断言的内容切掉。
    const asioStart = body.indexOf('AudioBackend::Asio')
    // 下一个分支 = `AudioBackend::WasapiShared =>`（带箭头，才是分支而非赋值）
    const nextArm = body.indexOf('AudioBackend::WasapiShared =>', asioStart)
    expect(nextArm, 'ASIO 之后找不到 WasapiShared 分支（枚举顺序可能变了）').toBeGreaterThan(-1)
    const asioBody = body.slice(asioStart, nextArm)
    expect(asioBody, 'ASIO 分支里没有 match').toContain('match self.start_asio')
    expect(asioBody, 'ASIO 分支里没有回退赋值').toContain(
      'self.backend = AudioBackend::WasapiShared',
    )
  })

  it('回退时都要带 warn 日志（回退必须可观测，不能静默）', () => {
    const body = backendMatchArm()

    // 🚨 不能用 `warns.length >= 2` —— 那只保证「总数 ≥2」，
    //    单独删掉 ASIO 那条时，独占那条还在，断言仍成立（实测 ZERO）。
    //    正确做法：**分别在两个分支里**各查一次。
    const excStart = body.indexOf('AudioBackend::WasapiExclusive')
    const asioStart = body.indexOf('AudioBackend::Asio')
    const sharedStart = body.indexOf('AudioBackend::WasapiShared =>', asioStart)
    expect(excStart, '找不到 WasapiExclusive 分支').toBeGreaterThan(-1)
    expect(asioStart, '找不到 Asio 分支').toBeGreaterThan(-1)
    expect(sharedStart, '找不到 WasapiShared 分支').toBeGreaterThan(-1)

    const excBody = body.slice(excStart, asioStart)
    const asioBody = body.slice(asioStart, sharedStart)

    expect(excBody, 'WASAPI 独占回退没有 warn 日志（回退应当可观测）').toContain('log::warn!(')
    expect(asioBody, 'ASIO 回退没有 warn 日志（回退应当可观测）').toContain('log::warn!(')
  })

  it('🚨 is_capturing 置位点之后的失败路径必须回滚标志位', () => {
    // 定位 start_with_host 函数体（边界 = 下一个方法声明；`pub fn stop` 也算）
    const fnBody = sliceFromFn('fn start_with_host')
    // 边界自检：若切片伸进相邻函数，回滚计数会被污染（2 → 3，2026-10-04 实测）
    expect(
      /\bfn (?:stop|set_buffer_size|get_[a-z_]+)\s*\(/.test(fnBody),
      '切片边界跑偏：fnBody 伸进了相邻函数，回滚计数不可信',
    ).toBe(false)

    // 置位点
    const setIdx = fnBody.indexOf('*self.is_capturing.lock() = true')
    expect(setIdx, 'start_with_host 里找不到 is_capturing 置位点').toBeGreaterThan(-1)

    const after = fnBody.slice(setIdx)

    // 🚨 不能用 `rollbacks.length > 0` —— 那只保证「至少一处」，
    //    单独删掉 play() 那处时其它处还在，断言仍成立（实测 ZERO）。
    //    必须**逐条钉死每个失败出口**。
    const rollbackCount = (after.match(/\*self\.is_capturing\.lock\(\)\s*=\s*false/g) ?? []).length
    expect(
      rollbackCount,
      `置位点之后应有 2 处回滚（建流全部失败出口 + play()），实际 ${rollbackCount} 处 ⇒ ` +
        '失败时会留下 is_capturing 恒 true，让 pipeline 的 `if !is_capturing()` 守卫' +
        '误判为正在采集，后续操作全部静默空转。',
    ).toBe(2)

    // 具体守住 play() 那条路径（用 if let Err 而非 `?`）
    expect(
      /if let Err\(e\) = stream\.play\(\)/.test(after),
      'stream.play() 的失败必须显式处理并回滚 is_capturing，不能用 `?` 直接返回',
    ).toBe(true)
    const playIdx = after.indexOf('if let Err(e) = stream.play()')
    const playBody = after.slice(playIdx, playIdx + 260)
    expect(
      playBody,
      'play() 分支里没有回滚 is_capturing（删掉回滚语句即为回归）',
    ).toContain('*self.is_capturing.lock() = false')

    // 建流全部失败的那条出口。
    // 🚨 这里**不再**断言 `.map_err(` —— 该函数在 ASIO 修复（10-02）后重构为
    //    「候选表循环 + match built」，多层嵌套 match 会让每个失败分支都要各自
    //    回滚 is_capturing（极易漏一处），合并成一个出口后只回滚一次。
    //    断言改为钉那个出口本身，比锚定某种具体写法更稳。
    const builtFailIdx = after.indexOf('None => {')
    expect(builtFailIdx, '找不到「建流全部失败」的出口（结构可能又变了）').toBeGreaterThan(-1)
    const builtFailBody = after.slice(builtFailIdx, builtFailIdx + 400)
    expect(
      builtFailBody,
      '建流全部失败时没有回滚 is_capturing（标志位泄漏，后续检测全部静默空转）',
    ).toContain('*self.is_capturing.lock() = false')
  })

  it('负向：护栏锚点必须真实存在（防止改结构后静默空转）', () => {
    // 🚨 锚点检查必须用「词边界」而非裸子串 ——
    //    裸的 toContain('pub enum AudioBackend') 在把枚举改名成
    //    `AudioBackendX` 时**仍然成立**（子串匹配），实测该变异 ZERO。
    expect(
      /\bpub enum AudioBackend\s*\{/.test(SRC),
      'AudioBackend 枚举定义消失或改名（护栏会静默空转）',
    ).toBe(true)
    expect(/\bAsio,/.test(SRC), 'ASIO 变体消失').toBe(true)
    expect(/\bfn start_asio\s*\(/.test(SRC), 'start_asio 函数消失').toBe(true)
    expect(/\bfn start_with_host\s*\(/.test(SRC), 'start_with_host 函数消失').toBe(true)
    expect(/\bfn start_with_backend\s*\(/.test(SRC), 'start_with_backend 函数消失').toBe(true)
    expect(SRC, '未启用 asio 的 cfg 分支消失').toContain('feature = "asio"')
    expect(SRC, 'start_exclusive 函数消失（独占回退对照物）').toContain('fn start_exclusive')
  })
})
