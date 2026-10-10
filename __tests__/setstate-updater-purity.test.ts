/**
 * 铁律 1 护栏：`setState` 的 updater 必须是**纯函数**。
 *
 * 为什么：React StrictMode 会**双调用** updater 来暴露副作用。若 updater 内部读取
 * 随时间/随机变化的量（`Date.now()` / `Math.random()` / `performance.now()` /
 * `crypto.randomUUID()` …），两次调用会得到不同结果：
 *   - 累加型（`prev + f()`）⇒ 值被加两次或漂移；
 *   - 生成型（`prev.map(() => random())`）⇒ 两份不同的随机结果互相覆盖。
 * 更阴的是：这类 bug **只在 dev（StrictMode）下出现**，生产不复现 ⇒ 极难归因。
 *
 * 判据：扫描 `setX(prev => ...)` / `setX((prev) => ...)` 的**回调体**，若体内出现
 * 上述非纯来源，即为违规。允许的写法是把它们**提到 updater 之外**：
 *   ```ts
 *   const now = Date.now()            // ✅ 外面取
 *   setElapsed(prev => prev + now)    // ✅ updater 纯
 *   ```
 *
 * 说明（判据边界）：本护栏是**源码级字符串扫描**，不做真正的数据流分析。它抓的是
 * 「非纯来源字面出现在 updater 体内」这一最常见形态；把 `Date.now()` 藏进另一个
 * 函数再调用（`setX(prev => prev + helper())`）可以绕过 —— 但那种写法在评审里也很显眼，
 * 且本仓尚无此形态。宁可要一条会误报的简单护栏，也不要一条永远绿的复杂护栏。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const IMPURE = /\b(Date\.now|performance\.now|Math\.random|crypto\.randomUUID|new Date)\s*\(/

/** 从 `setX(` 起，括号配平地取出该次调用的完整实参文本。 */
function callArgsAt(src: string, openParenIdx: number): string | null {
  let depth = 0
  for (let i = openParenIdx; i < src.length; i++) {
    const c = src[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return src.slice(openParenIdx + 1, i)
    }
  }
  return null
}

/** 找出文件里所有 `setX(...)` 调用，返回其完整实参文本。 */
function collectSetCalls(src: string): Array<{ name: string; args: string }> {
  const out: Array<{ name: string; args: string }> = []
  const re = /\b(set[A-Z]\w*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const openIdx = m.index + m[0].length - 1
    const args = callArgsAt(src, openIdx)
    if (args !== null) out.push({ name: m[1], args })
  }
  return out
}

/**
 * 判断一次 `setX(...)` 调用里是否用了**函数式 updater**（首参是箭头函数），
 * 若是则返回该 updater 的**函数体**文本；否则返回 null。
 */
function updaterBody(args: string): string | null {
  const t = args.trimStart()
  // 形如 `prev => <expr>` 或 `(prev) => <expr>` 或 `prev => { ... }`
  const m = t.match(/^(\(?\s*[A-Za-z_$][\w$]*\s*\)?)\s*=>/)
  if (!m) return null
  return t.slice(m[0].length - 3) // 去掉 `=>` 前的参数部分，从 `=>` 保留
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function collectFiles(dirs: string[]): string[] {
  const files: string[] = []
  for (const dir of dirs) {
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue
          walk(`${d}/${e.name}`)
        } else if (/\.tsx?$/.test(e.name)) {
          files.push(`${d}/${e.name}`)
        }
      }
    }
    walk(dir)
  }
  return files
}

describe('铁律 1：setState updater 必须纯（不得含 Date.now / Math.random 等）', () => {
  it('app/ components/ hooks/ 下没有「非纯来源出现在 updater 体内」的写法', () => {
    const offenders: string[] = []
    for (const file of collectFiles(['app', 'components', 'hooks'])) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const { name, args } of collectSetCalls(src)) {
        const body = updaterBody(args)
        if (body === null) continue
        if (IMPURE.test(body)) {
          offenders.push(`${file}: ${name}(...) 的 updater 体内出现非纯来源 → ${body.slice(0, 80).replace(/\s+/g, ' ')}`)
        }
      }
    }
    expect(offenders, `\n${offenders.join('\n')}\n\n修法：把这些量提到 updater 之外再 set。`).toEqual([])
  })

  it('自检：护栏解析器对「正确写法」与「违规写法」分别判绿/判红', () => {
    const ok = stripComments('const now = Date.now()\nsetElapsed(prev => prev + now)')
    const okCalls = collectSetCalls(ok)
      .map(({ args }) => updaterBody(args))
      .filter((b): b is string => b !== null)
    expect(okCalls.some((b) => IMPURE.test(b)), '正确写法不应被误报').toBe(false)

    const bad = stripComments('setElapsed(prev => prev + Date.now())')
    const badCalls = collectSetCalls(bad)
      .map(({ args }) => updaterBody(args))
      .filter((b): b is string => b !== null)
    expect(badCalls.some((b) => IMPURE.test(b)), '违规写法必须被抓住').toBe(true)
  })

  it('pausePractice：Date.now() 必须在 updater 之外取（P3-1 回归）', () => {
    const src = readFileSync('app/page.tsx', 'utf8')
    // 锚点：pausePractice 的定义体
    const idx = src.indexOf('const pausePractice = useCallback(')
    expect(idx, '未找到 pausePractice').toBeGreaterThan(-1)
    const body = src.slice(idx, idx + 900)
    // ❌ 不得再出现「把 Date.now() 写进 setPracticeElapsedTime 的 updater」
    expect(
      /setPracticeElapsedTime\s*\(\s*prev\s*=>\s*[^\n]*Date\.now\(\)/.test(body),
      'pausePractice 里 Date.now() 又回到了 updater 体内（StrictMode 双调用会漂移）'
    ).toBe(false)
    // ✅ 必须先把 now 取出来
    expect(body).toMatch(/const\s+now\s*=\s*Date\.now\(\)/)
  })
})
