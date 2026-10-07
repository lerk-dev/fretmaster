/**
 * ASIO 输入流建流契约（Rust 侧源码护栏）
 *
 * 背景（真实缺陷，2026-10-02 实测锁定）：
 *   用户选用 ASIO 后端后，界面显示「所选后端不可用，已回退到共享模式」，
 *   即 ASIO 永远启动不了、每次都静默回退到 WASAPI 共享。延迟因此停在 23ms 左右。
 *
 * 根因（**不是**「本机没装 ASIO 驱动」—— 这个结论是错的，已推翻）：
 *   本机**有** ASIO 驱动（`HOTONE AUDIO USB Audio Device`，2 in / 2 out，仅 44100Hz，
 *   仅 I32 格式）。真正的根因是 **CPAL 的 ASIO 后端不支持 f32 便捷封装**：
 *
 *     device.build_input_stream(&cfg, |d: &[f32]| …, …)   // ❌ ASIO 上必然失败
 *       => The requested stream configuration is not supported by the device.
 *     device.build_input_stream_raw(&cfg, SampleFormat::I32, …)  // ✅ 成功
 *
 *   跑探针（.workbuddy/tmp/asio-probe）得到的判决性对照：
 *     ASIO   f32  44100 2ch  → ❌（采样率、声道数都与设备能力**完全匹配**，仍失败）
 *     ASIO  raw I32 44100 2ch → ✅
 *     WASAPI f32  44100 2ch  → ✅（同一台机器，证明不是设备/驱动问题）
 *     WASAPI f32  48000 2ch  → ❌（设备只支持 44100 ⇒ 采样率失败是另一回事）
 *   ⇒ 唯一变量是**样本格式**：ASIO 只吃设备原生 I32，f32 转换不被支持。
 *
 * 旧实现还同时犯了第二个错：采样率只按「区间包含」判断，**完全忽略声道数与样本格式**，
 * 可能选出设备根本不支持的 (ch, sr, fmt) 组合。
 *
 * 本用例锁住三件事：
 *   ① ASIO 可走 raw 建流路径（`build_input_stream_raw` 存在且被调用）
 *   ② 选型必须从 `supported_input_configs()` 的三元组里挑**自洽**组合，而不是
 *      把 `default_input_config()` 的声道数 + 独立挑的采样率硬拼起来
 *   ③ raw 回调必须真的做样本格式归一化（I32 → f32），不能只是声明了格式却按 f32 读
 *
 * 为什么用源码断言：建流路径必须碰真实音频设备与 ASIO 驱动，vitest 跑不到。
 * 断言前统一剥注释，否则注释里提到的函数名会让用例假通过。
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

/** 取 `start_with_host` 函数体（从签名到下一个顶层 fn 之前） */
function startWithHostBody(): string {
  const start = SRC.indexOf('fn start_with_host')
  expect(start, '找不到 start_with_host（护栏会静默空转）').toBeGreaterThan(-1)
  const rest = SRC.slice(start)
  const nextFn = rest.indexOf('\n    fn ', 1)
  return nextFn > -1 ? rest.slice(0, nextFn) : rest
}

/** 取 `make_input_callback_raw` 函数体 */
function rawCallbackBody(): string {
  const start = SRC.indexOf('fn make_input_callback_raw')
  expect(start, '找不到 make_input_callback_raw（ASIO 需要的 raw 回调）').toBeGreaterThan(-1)
  const rest = SRC.slice(start)
  // 下一个顶层 fn
  const nextFn = rest.indexOf('\nfn ', 1)
  return nextFn > -1 ? rest.slice(0, nextFn) : rest
}

describe('ASIO 输入流建流契约（Rust 源码护栏）', () => {
  it('🚨 ASIO 路径必须走 build_input_stream_raw（f32 便捷封装在 ASIO 上必然失败）', () => {
    const body = startWithHostBody()

    // 正向：确实调用了 raw 建流
    expect(
      /device\.build_input_stream_raw\s*\(/.test(body),
      'start_with_host 里没有 build_input_stream_raw ⇒ ASIO 会退回 f32 便捷封装，' +
        '在 ASIO 后端必然报 "The requested stream configuration is not supported"，' +
        '然后被上层静默回退到 WASAPI 共享（就是用户看到的「所选后端不可用」）。',
    ).toBe(true)

    // 🚨 raw 调用的**第二个实参**必须是把选出来的 sample_format 传进去。
    //    不能写成「调用窗口里含 sample_format 字样」—— 回调实参里也有这个名字，
    //    实测把第二参硬编码成 `cpal::SampleFormat::F32` 时那种写法**恒真**（变异 ZERO）。
    //    正解：只截「第一个实参结束到第二个实参」这一小段，正好是把格式参数隔出来的位置。
    const rawIdx = body.indexOf('device.build_input_stream_raw(')
    const rawCall = body.slice(rawIdx)
    // 第一个换行后是 &attempt_config，再下一个逗号之后就是第二个实参
    const firstComma = rawCall.indexOf(',')
    const secondArg = rawCall
      .slice(firstComma + 1)
      .split(',')[0]
      .trim()
    expect(
      secondArg,
      `build_input_stream_raw 的第二个实参（样本格式）是 "${secondArg}"，` +
        '应为变量 sample_format —— 硬编码格式会让 ASIO 用错格式建流（设备的原生 I32 没被用上）。',
    ).toBe('sample_format')

    // 负向：不能只有 f32 便捷封装（那是修复前的形态）
    const rawCount = (body.match(/device\.build_input_stream_raw\s*\(/g) ?? []).length
    expect(rawCount, 'raw 建流调用点数量异常').toBeGreaterThanOrEqual(1)
  })

  it('🚨 选型必须从 supported_input_configs() 挑自洽三元组，不能硬拼声道数与采样率', () => {
    const body = startWithHostBody()

    // 必须遍历设备上报的 ranges
    expect(
      /supported_input_configs\s*\(\s*\)\s*\?/.test(body),
      '没有遍历 supported_input_configs ⇒ 选型无法保证 (ch, sr, fmt) 自洽',
    ).toBe(true)

    // 🚨 必须真的让 range 的 channels / sample_format **参与选型决策**。
    //    不能写成「函数里出现过 .channels() / .sample_format()」—— 这两个方法在
    //    start_with_host 里还有别的调用点（default_input_config()、
    //    取 (channels, sample_format) 元组），那种断言**恒真**（实测 M3/M4 变异 ZERO）。
    //    正解：直接钉住打分语句本身，删掉打分即失败。
    expect(
      /if\s+range\.channels\(\)\s*!=\s*default_channels\s*\{/.test(body),
      '选型打分里没有比较 range.channels() 与默认声道数 ⇒ 声道数不参与决策' +
        '（旧实现就是把默认声道数与独立挑的采样率硬拼，才选出设备不支持的组合）。',
    ).toBe(true)

    expect(
      /if\s+range\.sample_format\(\)\s*!=\s*cpal::SampleFormat::F32\s*\{/.test(body),
      '选型打分里没有比较 range.sample_format() ⇒ 样本格式不参与决策，' +
        '这正是本次缺陷的成因（ASIO 只支持 I32，却被按 f32 建流）。',
    ).toBe(true)
    // 打分权重里必须真的带上"格式不合就加分"（-分表示更差）
    expect(
      /score\s*\+=\s*100/.test(body),
      '样本格式不匹配没有体现在打分上（应 +100 ⇒ 优先选 f32 可用的那条）',
    ).toBe(true)

    // 反向：「默认声道数 + 独立挑的采样率」这种硬拼写法必须消失。
    // 旧实现是 `channels: default_channels` 直接进 StreamConfig。
    expect(
      /channels:\s*default_channels\s*,/.test(body),
      'StreamConfig 仍在直接用 default_channels 拼装 ⇒ 声道数未与样本格式/采样率一同选出',
    ).toBe(false)
  })

  it('🚨 raw 回调必须做 I32 → f32 归一化（声明了格式却不转换 = 静默出噪声）', () => {
    const body = rawCallbackBody()

    // 必须按声明格式分支
    expect(
      /cpal::SampleFormat::I32/.test(body),
      'raw 回调没有 I32 分支 ⇒ ASIO（唯一实测格式）的数据不会被正确归一化',
    ).toBe(true)

    // 必须有归一化除算，而不是把原始 i32 直接当 f32 用
    expect(
      /i32_to_f32\s*\(/.test(body),
      'raw 回调没有调用 i32_to_f32 ⇒ 原始 i32 幅值（±21 亿）会被当成 f32 采样值，' +
        '下游起音检测/音高识别全部失真或恒饱和',
    ).toBe(true)

    // I16 / U8 也要处理（覆盖其它后端），U8 必须减 128 偏置
    expect(/cpal::SampleFormat::I16/.test(body), 'raw 回调缺少 I16 分支').toBe(true)
    expect(/cpal::SampleFormat::U8/.test(body), 'raw 回调缺少 U8 分支').toBe(true)
    expect(/-\s*128\.0/.test(body), 'U8 分支没有减零点偏置 128（会引入 DC 直流偏置）').toBe(true)

    // 🚨 as_slice 在 cpal 0.15 返回 Option ⇒ 必须处理 None，不能 unwrap（会 panic 音频线程）
    expect(
      /unwrap_or\s*\(\s*&\s*\[\s*\]\s*\)/.test(body),
      'as_slice 没有用 unwrap_or 兜底 ⇒ 格式意外不符时会 unwrap panic，整个音频线程死掉',
    ).toBe(true)
    expect(
      /as_slice::<\w+>\s*\(\s*\)\s*\.unwrap\s*\(\s*\)/.test(body),
      'as_slice 出现了裸 unwrap（应改为 unwrap_or(&[])）',
    ).toBe(false)
  })

  it('🚨 两条回调路径必须共享同一份混音/增益逻辑（不许各写一份）', () => {
    // f32 便捷回调与 raw 回调都要写进同一份 write_mono_into_ring
    const f32Body = (() => {
      const start = SRC.indexOf('fn make_input_callback(')
      expect(start, '找不到 make_input_callback').toBeGreaterThan(-1)
      const rest = SRC.slice(start)
      const nextFn = rest.indexOf('\nfn ', 1)
      return nextFn > -1 ? rest.slice(0, nextFn) : rest
    })()

    expect(
      /write_mono_into_ring\s*\(/.test(f32Body),
      'f32 回调没有用共享的 write_mono_into_ring ⇒ 混音逻辑开始分叉',
    ).toBe(true)

    expect(
      /write_mono_into_ring\s*\(/.test(rawCallbackBody()),
      'raw 回调没有用共享的 write_mono_into_ring ⇒ 两条路会各自漂移（如只有一条处理 gain）',
    ).toBe(true)

    // 混音函数本身必须存在且唯一（防止有人又抄第二份）
    const defs = (SRC.match(/fn write_mono_into_ring\s*\(/g) ?? []).length
    expect(defs, `write_mono_into_ring 定义了 ${defs} 份（应为 1 份，唯一真相源）`).toBe(1)
  })

  it('负向：护栏锚点必须真实存在（防止改结构后静默空转）', () => {
    expect(/\bfn start_with_host\s*\(/.test(SRC), 'start_with_host 消失').toBe(true)
    expect(/\bfn make_input_callback\s*\(/.test(SRC), 'make_input_callback 消失').toBe(true)
    expect(/\bfn make_input_callback_raw\s*\(/.test(SRC), 'make_input_callback_raw 消失').toBe(true)
    expect(/\bfn write_mono_into_ring\s*\(/.test(SRC), 'write_mono_into_ring 消失').toBe(true)
    expect(/\bfn i32_to_f32\s*\(/.test(SRC), 'i32_to_f32 消失').toBe(true)
    // 反向确认：raw 回调确实不是 f32 回调的别名
    expect(
      /FnMut\s*\(\s*&cpal::Data\s*,/.test(SRC),
      'raw 回调签名不是 (&cpal::Data, …) ⇒ 可能被改写成了 f32 版本',
    ).toBe(true)
  })
})
