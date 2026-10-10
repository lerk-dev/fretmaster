/**
 * 跨语言字段口径**穷举护栏**（2026-10-10 全仓审查 P1-2 / P1-3 的根因收口）。
 *
 * ## 背景
 *
 * Tauri 只把命令的**顶层参数名**转 camelCase；**返回值 / 嵌套结构体的字段名由 serde
 * 原样序列化**。所以一个没有 `#[serde(rename_all = "camelCase")]` 的 Rust 结构体，
 * 线上发的是 snake_case —— 前端若按 camelCase 读，**全部字段恒 undefined 且不报错**。
 *
 * `native-invoke-contract.test.ts` 里那条 `AudioStatus` 双向比对只能守住
 * **一个手工圈定的结构体**；`AudioDeviceInfo`（`isDefault` 恒 undefined ⇒ 默认设备挑选
 * 静默失效）与 debug 面板裸读 `get_audio_status` 就是从这个缝里漏出去的。
 *
 * ## 本护栏的做法
 *
 * 1. **穷举** Rust 源码里全部 `pub struct`（带 `Serialize`）—— 数量与清单必须显式登记在
 *    `FIELD_CONVENTION`（新增结构体不登记 ⇒ 红）。
 * 2. 每个结构体登记它的**线上口径**：`'camelCase'`（Rust 侧有 rename_all）、
 *    `'snake_case'`（无 rename，前端必须按 snake_case 读或经归一化函数）。
 * 3. 若某结构体实际带 `rename_all` 却登记成 snake_case（或反之）⇒ 红。
 *
 * 顺带钉住 P1-3：前端不得再裸 `invoke('get_audio_status')`。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

/** 递归收集目录下所有匹配扩展名的文件（相对 ROOT 的 posix 路径）。 */
function walk(dir: string, exts: string[]): string[] {
  const abs = path.join(ROOT, dir)
  const out: string[] = []
  if (!fs.existsSync(abs)) return out
  const stack = [abs]
  while (stack.length) {
    const cur = stack.pop() as string
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        out.push(path.relative(ROOT, full).replace(/\\/g, '/'))
      }
    }
  }
  return out.sort()
}

interface RustStruct {
  name: string
  file: string
  renameAll: 'camelCase' | 'snake_case' | 'none'
}

/** 扫描 Rust 源码，返回全部带 Serialize 的 pub struct 及其 rename_all 标注。 */
function scanRustStructs(): RustStruct[] {
  const out: RustStruct[] = []
  for (const rel of walk('src-tauri/src', ['.rs'])) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    // 匹配「一串属性 + pub struct Name {」，属性块里必须含 Serialize
    const re = /((?:#\[[^\]]*\]\s*)*)pub struct (\w+)\s*\{/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const attrs = m[1]
      if (!attrs.includes('Serialize')) continue
      const renameAll = attrs.includes('rename_all = "camelCase"')
        ? 'camelCase'
        : attrs.includes('rename_all = "snake_case"')
          ? 'snake_case'
          : 'none'
      out.push({ name: m[2], file: rel, renameAll })
    }
  }
  return out
}

/**
 * 🚨 跨 Tauri 边界、返回给前端的结构体登记表：结构体名 → 线上实际字段口径。
 *
 * - `'camelCase'`：Rust 侧写了 `#[serde(rename_all = "camelCase")]`，前端按 camelCase 读。
 * - `'snake_case'`：Rust 侧**没有** rename，线上发 snake_case ⇒ 前端要么按 snake_case
 *   读，要么走 `lib/native-audio.ts` 的归一化函数（`normalizeAudioStatus` /
 *   `normalizePitchStreamEvent`）。**新增未登记的结构体一律红**，逼你显式表态。
 */
const FIELD_CONVENTION: Record<string, 'camelCase' | 'snake_case'> = {
  // ✅ 已补 rename_all（2026-10-10 P1-2 修复）
  AudioDeviceInfo: 'camelCase',
  // ✅ 本来就有 rename_all
  PositionStatEntry: 'camelCase',
  PositionStatRecord: 'camelCase',
  // 无 rename，线上 snake_case，前端经归一化 / 按 snake_case 读
  AudioStatus: 'snake_case',
  AudioLevelInfo: 'snake_case',
  PitchStreamEvent: 'snake_case',
  PitchResult: 'snake_case',
  // PitchConfidence 是**逐字段** rename（非 rename_all）；字段全为单个小写单词
  // （yin/overall…）⇒ 两种口径同形，登记为 snake_case 亦无歧义。
  PitchConfidence: 'snake_case',
  HarmonicAnalysis: 'snake_case',
  PitchDetectorConfig: 'snake_case',
  AudioPreprocessorConfig: 'snake_case',
  NoiseEstimate: 'snake_case',
  FilterConfig: 'snake_case',
  PracticeStats: 'snake_case',
  StatsSummary: 'snake_case',
  ExerciseTypeStats: 'snake_case',
  DeviceChangeEvent: 'snake_case',
}

describe('穷举护栏：每一个跨边界 Serialize 结构体都必须登记线上字段口径', () => {
  const structs = scanRustStructs()

  it('扫描下限：确实扫到了结构体（防「空集恒通过」）', () => {
    expect(structs.length, 'src-tauri/src 下没扫到 Serialize 结构体，扫描器坏了').toBeGreaterThanOrEqual(15)
  })

  it('登记表与源码一一对应：源码里有的必须登记，登记了的不许是幽灵', () => {
    const scanned = structs.map((s) => s.name).sort()
    const registered = Object.keys(FIELD_CONVENTION).sort()
    const missing = scanned.filter((n) => !(n in FIELD_CONVENTION))
    const ghost = registered.filter((n) => !scanned.includes(n))
    expect(
      { missing, ghost },
      '新增了跨边界结构体却没登记口径（missing），或删了结构体但登记表没清（ghost）',
    ).toEqual({ missing: [], ghost: [] })
  })

  it('登记的「线上口径」与源码里的 rename_all 标注一致', () => {
    const mismatched: Array<{ name: string; declared: string; actual: string }> = []
    for (const s of structs) {
      const declared = FIELD_CONVENTION[s.name]
      if (!declared) continue
      if (declared === 'camelCase' && s.renameAll !== 'camelCase') {
        mismatched.push({ name: s.name, declared, actual: s.renameAll })
      }
      if (declared === 'snake_case' && s.renameAll === 'camelCase') {
        mismatched.push({ name: s.name, declared, actual: s.renameAll })
      }
    }
    expect(mismatched, '登记口径与 Rust 源码的 rename_all 不一致').toEqual([])
  })

  it('前端读 camelCase 结构体时不得出现 snake_case 键', () => {
    const consumers = ['lib/native-audio.ts', 'components/windows-audio-settings.tsx']
    const offenders: Array<{ file: string; line: number }> = []
    for (const rel of consumers) {
      fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .split('\n')
        .forEach((l, i) => {
          if (/\.is_default\b/.test(l)) offenders.push({ file: rel, line: i + 1 })
        })
    }
    expect(offenders, 'AudioDeviceInfo 已改为 camelCase，读取处不得再用 is_default').toEqual([])
  })
})

describe('P1-3 回归：前端不得裸 invoke get_audio_status', () => {
  it('除归一化入口外，全仓不得出现裸 invoke(\'get_audio_status\')', () => {
    const candidates = [
      ...walk('app', ['.ts', '.tsx']),
      ...walk('components', ['.ts', '.tsx']),
      ...walk('lib', ['.ts', '.tsx']),
      ...walk('hooks', ['.ts', '.tsx']),
    ]
    const offenders: Array<{ file: string; line: number }> = []
    for (const rel of candidates) {
      if (rel === 'lib/native-audio.ts') continue // 归一化入口自己当然要 invoke
      fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .split('\n')
        .forEach((l, i) => {
          // 🚨 先剥注释：修复说明里会引用这条命令名（本文件与 debug-panel 都写过），
          // 不剥的话护栏会被自己的注释"咬"成假红。
          const code = l.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')
          if (code.includes("invoke('get_audio_status'") || code.includes('invoke("get_audio_status"')) {
            offenders.push({ file: rel, line: i + 1 })
          }
        })
    }
    expect(offenders, '发现绕过归一化的裸调用（字段会恒 undefined）').toEqual([])
  })

  it('debug-panel 确实引用了归一化入口', () => {
    const text = fs.readFileSync(path.join(ROOT, 'components/debug-panel.tsx'), 'utf8')
    expect(text).toMatch(/from ['"]@\/lib\/native-audio['"]/)
    expect(text).toMatch(/getAudioStatus\(\)/)
  })
})
