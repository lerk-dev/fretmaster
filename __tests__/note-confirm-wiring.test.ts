/**
 * 「多帧一致的时间口径」在 app/page.tsx 的**接线**护栏。
 *
 * 为什么单独一条：`lib/note-confirm.ts` 的单元测试只能证明**函数**会按 `frameMs` 换算帧数，
 * 证明不了**页面真的把三条路径各自的帧间隔报了上去**。而这三处接线恰恰是 bug 的现场 ——
 * 少传一个 `frameMs` 不报错、不 log，只是那条路径的确认延迟悄悄放大十几倍（worklet 32ms
 * vs ScriptProcessor ~557ms）。
 *
 * 护栏**从被契约方解析**（扫源码），不写死形状：加第 4 条收音路径、换常量名都会跟着走；
 * 只有「新增生产者却忘了 frameMs」或「把常量换回字面量」才挂。自带自测（见第一条用例）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const PAGE_REL = path.join('app', 'page.tsx')
const readPage = (): string => fs.readFileSync(path.join(ROOT, PAGE_REL), 'utf8')

/**
 * 去掉注释后再扫。
 * 🚨 必须做：护栏的负向断言（`not.toContain('SCRIPT_PROCESSOR_ONSET_GATE')`）会被
 * **说明性注释**绊倒 —— 修复后的代码里恰好留着「此前这里是 `const SCRIPT_PROCESSOR_ONSET_GATE`」
 * 这样的历史说明，那是刻意保留的（讲清楚为什么不再写死）。不剥注释就会把文档当成回归。
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
}

/** 页面源码，已剥注释 —— 所有「扫页面代码」的断言都应当用它。 */
const readCode = (): string => stripComments(readPage())

/** 抽出每个 `processPracticeMatchRef.current({ … })` 调用的对象字面量文本。 */
export function extractMatchCalls(src: string): string[] {
  return [...src.matchAll(/processPracticeMatchRef\.current\(\{([\s\S]*?)\}\)/g)].map((m) => m[1])
}

/** 某个调用块是否上报了帧间隔（`frameMs:` 字段）。 */
export function hasFrameMs(callBlock: string): boolean {
  return /(^|[\s{,])frameMs\s*:/.test(callBlock)
}

describe('多帧一致的时间口径 —— 三条收音路径都必须上报帧间隔', () => {
  it('护栏自测：判定步骤能识别出「缺 frameMs」的调用块（改成恒真这条就红）', () => {
    expect(hasFrameMs('  frequency: x,\n  isNoteOnset: y\n')).toBe(false)
    expect(hasFrameMs('  frequency: x,\n  frameMs: 50\n')).toBe(true)
    expect(extractMatchCalls('a(); processPracticeMatchRef.current({ x: 1 }) b()')).toHaveLength(1)
  })

  it('page.tsx 里每一个 practice 匹配调用都带 frameMs', () => {
    const calls = extractMatchCalls(readCode())
    expect(
      calls.length,
      '没找到 processPracticeMatchRef.current 调用（被改名 / 重构了？护栏需要同步）'
    ).toBeGreaterThanOrEqual(3)

    const missing = calls.filter((c) => !hasFrameMs(c))
    expect(
      missing,
      `有 practice 匹配调用没上报 frameMs —— 该路径会按 worklet 口径算帧数，确认延迟被放大：\n${missing.join('\n---\n')}`
    ).toEqual([])
  })

  it('三条路径的帧长度常量各自只定义一处（生产者与消费者必须同源）', () => {
    const src = readCode()
    for (const name of [
      'AUDIO_WORKLET_HOP_SIZE',
      'SCRIPT_PROCESSOR_BUFFER_SIZE',
      'NATIVE_PITCH_INTERVAL_MS',
    ]) {
      const defs = src.match(new RegExp(`const ${name} =`, 'g')) ?? []
      expect(defs.length, `${name} 的定义数量应为 1（现在 ${defs.length} 处）`).toBe(1)
    }
  })

  it('ScriptProcessor / Tauri 的实际用法引用常量，而不是各写一份字面量', () => {
    const src = readCode()
    expect(src, 'createScriptProcessor 的第一个参数应与 SCRIPT_PROCESSOR_BUFFER_SIZE 同源').toMatch(
      /createScriptProcessor\(\s*SCRIPT_PROCESSOR_BUFFER_SIZE\s*,/
    )
    expect(src, 'createScriptProcessor 里出现了字面量长度').not.toMatch(
      /createScriptProcessor\(\s*\d+\s*,/
    )
    expect(src, 'startPitchStream 的实参应与 NATIVE_PITCH_INTERVAL_MS 同源').toMatch(
      /startPitchStream\(\s*NATIVE_PITCH_INTERVAL_MS\s*\)/
    )
    expect(src, 'startPitchStream 用了字面量间隔').not.toMatch(/startPitchStream\(\s*\d+\s*\)/)
  })

  it('AUDIO_WORKLET_HOP_SIZE 与 worklet 源码里的 hopSize 默认值一致（跨文件同源）', () => {
    const m = readCode().match(/const AUDIO_WORKLET_HOP_SIZE = (\d+)/)
    expect(m, 'page.tsx 里没找到 AUDIO_WORKLET_HOP_SIZE').not.toBeNull()

    const worklet = fs.readFileSync(
      path.join(ROOT, 'public', 'js', 'audio-worklet-processor.js'),
      'utf8'
    )
    const wm = worklet.match(/hopSize\s*=\s*processorOptions\.hopSize\s*\|\|\s*(\d+)/)
    expect(wm, 'worklet 里没找到 hopSize 的默认值（被改名了？护栏需要同步）').not.toBeNull()
    expect(
      Number(wm![1]),
      'AUDIO_WORKLET_HOP_SIZE 与 audio-worklet-processor.js 的 hopSize 默认值不一致'
    ).toBe(Number(m![1]))
  })
})

// ==================== 起音门限必须跟底噪走，不能写死 ====================
// 背景：ScriptProcessor 回退路径曾把起音门限写死成 0.001，而 worklet / Tauri 都跟着
// 各自跟踪的环境底噪走（`max(0.0008, 底噪 × 1.5)`，见 lib/pitch-detection.ts 的
// 「起音门限」段与 __tests__/onset-gate.test.ts 的跨实现护栏）。写死的后果：噪声校准
// 采到 0.025 ⇒ 两条原生路径门限 0.0375、回退路径 0.001（低 37 倍）⇒ 环境噪声被判成
// 「一次新的拨弦」⇒ confirmNote 的确认记忆被反复清空 ⇒ 嘈杂房间里永不确认。
// 这条护栏钉的是「页面确实把本帧门限交回 lib 计算」，不是形状本身。

/** 从 `callee(` 起按括号配对取出整个实参列表（能正确处理 `f(g(x))` 这类嵌套调用）。 */
export function extractCallArgs(src: string, callee: string): string[] | null {
  const start = src.indexOf(`${callee}(`)
  if (start < 0) return null
  let depth = 0
  const args: string[] = []
  let current = ''
  for (let i = start + callee.length; i < src.length; i++) {
    const ch = src[i]
    if (ch === '(') {
      depth++
      if (depth === 1) continue
    } else if (ch === ')') {
      depth--
      if (depth === 0) {
        args.push(current)
        return args.map((a) => a.trim())
      }
    } else if (ch === ',' && depth === 1) {
      args.push(current)
      current = ''
      continue
    }
    current += ch
  }
  return null
}

/** detectOnset 的门限实参（第 2 个实参）文本。 */
export function extractDetectOnsetGate(src: string): string | null {
  const args = extractCallArgs(src, 'detectOnset')
  return args && args.length >= 2 ? args[1] : null
}

describe('起音门限 —— ScriptProcessor 路径必须跟底噪走，不能写死', () => {
  it('护栏自测：剥注释后注释里的旧常量名不再误伤（不剥就会把历史说明当回归）', () => {
    expect(
      stripComments('  // 此前这里是 const SCRIPT_PROCESSOR_ONSET_GATE = 0.001\ncode()')
    ).not.toContain('SCRIPT_PROCESSOR_ONSET_GATE')
    expect(stripComments('/* 块注释 SCRIPT_PROCESSOR_ONSET_GATE */ f()')).toContain('f()')
    expect(
      stripComments("const u = 'https://a.b'"),
      '字符串里的 :// 不能被当成行注释起点'
    ).toContain('https://a.b')
  })

  it('护栏自测：判定步骤能读出 detectOnset 的门限实参（换回字面量这条就红）', () => {
    expect(extractDetectOnsetGate('detectOnset(energy, 0.001, t, s)')).toBe('0.001')
    expect(
      extractDetectOnsetGate('detectOnset(\n  energy,\n  updateOnsetGate(energy),\n  performance.now(),\n  st\n)')
    ).toBe('updateOnsetGate(energy)')
    expect(extractCallArgs('f(a, g(b, c), d)', 'f'), '嵌套实参要被当成一个整体').toEqual([
      'a',
      'g(b, c)',
      'd',
    ])
  })

  it('page.tsx 的门限实参是 updateOnsetGate(energy)，且不再有写死的门限常量', () => {
    const src = readCode()
    expect(
      src,
      'SCRIPT_PROCESSOR_ONSET_GATE 又回来了 —— 门限写死会让回退路径与校准后的底噪脱钩'
    ).not.toContain('SCRIPT_PROCESSOR_ONSET_GATE')

    const gate = extractDetectOnsetGate(src)
    expect(gate, 'page.tsx 里没找到 detectOnset 调用（被重构了？护栏需要同步）').not.toBeNull()
    expect(gate, '门限实参不是 updateOnsetGate(energy)：写死字面量 / 换成别的来源都会与另两条路径分叉').toBe(
      'updateOnsetGate(energy)'
    )
  })

  it('updateOnsetGate 确实从 lib/pitch-detection 引入（不是页面内自建第二真相源）', () => {
    const src = readCode()
    const importLine = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*"@\/lib\/pitch-detection"/)
    expect(importLine, '没找到对 @/lib/pitch-detection 的具名导入').not.toBeNull()
    expect(importLine![1]).toMatch(/\bupdateOnsetGate\b/)
  })
})
