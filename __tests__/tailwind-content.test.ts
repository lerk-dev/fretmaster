/**
 * `tailwind.config.ts` 的 `content` 必须覆盖**所有写 tailwind 类名的源码目录**。
 *
 * 2026-10-01 发现（生产构建时）：`content` 只有 `pages / components / app` 三行，
 * **漏了 `lib/`**。而经典皮肤配色的唯一实现 `lib/fretboard-note-button-color.ts`
 * 与 musmath 钢琴皮肤 `lib/piano-keyboard-style.ts` 的类名**只写在 lib 里**
 * ⇒ 被 Tailwind 静默 purge：**不报错、不告警、构建成功**，只是运行时没样式。
 *
 * 浏览器实测（无头 Chrome：扫 `document.styleSheets` 的 selectorText + 逐属性比对
 * computed style，两路一致）确认下列 18 个类压根不在样式表里：
 *
 *   bg-emerald-400/50  音阶/和弦音（大面积底色）      bg-blue-400/60  根音
 *   bg-amber-400       一弦三音「当前目标」           ring-amber-500  同上
 *   opacity-20         限制品区「区外压暗」           bg-primary/80   找音模式目标
 *   bg-cyan-500/25 / text-cyan-50 / ring-cyan-400/60 / border-cyan-400/70
 *   bg-lime-400/70 / text-black / ring-lime-300/80 / border-lime-300
 *   ring-orange-300 / border-orange-300            ← 「下一把位预览」三档配色
 *   fret-next-blink                                ← 预览的呼吸动画（定义在 globals.css 的
 *                                                    `@layer components` 里，同样靠类名被扫到才存活）
 *
 * 危害等级：**高**。整块配色（根音/音阶音/预览）在线上全是「无色」，
 * 而且因为 `getNoteButtonColor` 的单元测试只断言**返回的字符串**、
 * `jsdom` 又不加载 tailwind 产物，任何现有测试都发现不了。
 *
 * 为什么用「扫目录」而不是「扫类名」：类名提取靠正则，长度/转义/任意值写法都要处理，
 * 误报会把护栏写成噪声。而**目录粒度**是本 bug 的真实边界 —— Tailwind 是按 `content`
 * glob 决定「哪些文件能被提取到类名」，只要目录进了 glob，里面的类名就都能被扫到。
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'

const TAILWIND_SRC = readFileSync('tailwind.config.ts', 'utf8')

/** 不该被 tailwind 扫描的顶层目录（不是打进 App 的源码） */
const NON_APP_DIRS = new Set([
  'node_modules',
  '__tests__',
  '__mocks__',
  'scripts',
  'src-tauri',
  'dist-tauri',
  'coverage',
  'public',
  'data',
  // 本地专用归档（.gitignore，不进仓库、不打进 App）：课程内容原件等
  'local-only',
])

// ---------------------------------------------------------------------------
// glob 匹配（只支持本仓实际用到的写法：`dir/**/*.{a,b}` 与 `dir/**/*.ts`）
// ---------------------------------------------------------------------------

/** 展开 `{a,b,c}` 分支（递归，支持多个花括号） */
function expandBraces(glob: string): string[] {
  const m = glob.match(/\{([^{}]*)\}/)
  if (!m) return [glob]
  return m[1]
    .split(',')
    .flatMap((opt) => expandBraces(glob.replace(m[0], opt.trim())))
}

// glob → RegExp：支持「双星号 + 斜杠」（跨目录，可 0 层）与单星号（段内任意）
// ⚠️ 写这个注释时**不能**直接把那三个字符连起来写进块注释 —— 会被当成注释结束符。
function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/^\.\//, '')
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*' && g[i + 1] === '*') {
      i++
      if (g[i + 1] === '/') {
        i++
        re += '(?:.*/)?' // 双星号+斜杠 ⇒ 可匹配 0 层目录
      } else {
        re += '.*'
      }
      continue
    }
    if (c === '*') {
      re += '[^/]*'
      continue
    }
    if ('\\^$.|?+()[]{}'.includes(c)) {
      re += `\\${c}`
      continue
    }
    re += c
  }
  return new RegExp(`^${re}$`)
}

/** 某个相对路径是否被 content glob 覆盖 */
function isCovered(file: string, globs: readonly string[]): boolean {
  const f = file.replace(/\\/g, '/').replace(/^\.\//, '')
  return globs.some((g) => expandBraces(g).some((one) => globToRegExp(one).test(f)))
}

/** 从 tailwind.config.ts 源码里抠出 `content: [...]` 里的 glob 字符串 */
function parseContentGlobs(src: string): string[] {
  const at = src.indexOf('content:')
  if (at < 0) throw new Error('tailwind.config.ts 里找不到 content:')
  const open = src.indexOf('[', at)
  const close = src.indexOf(']', open)
  if (open < 0 || close < 0) throw new Error('content 不是数组字面量')
  return [...src.slice(open + 1, close).matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
}

// ---------------------------------------------------------------------------
// 源码目录发现
// ---------------------------------------------------------------------------

function hasTsSource(dir: string, depth = 0): boolean {
  if (depth > 4) return false
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const e of entries) {
    if (e.isFile() && /\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) return true
    if (e.isDirectory() && hasTsSource(path.join(dir, e.name), depth + 1)) return true
  }
  return false
}

/** 含 TS/TSX 源码的**顶层**目录（= 会被打进 App 的那些） */
function appSourceDirs(root = '.'): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !n.startsWith('.') && !n.startsWith('_') && !NON_APP_DIRS.has(n))
    .filter((n) => hasTsSource(path.join(root, n)))
    .sort()
}

// ---------------------------------------------------------------------------

describe('tailwind content 必须覆盖所有写类名的源码目录', () => {
  const globs = parseContentGlobs(TAILWIND_SRC)

  it('护栏自测：glob 匹配器不是恒真', () => {
    // 该匹配的要匹配
    expect(isCovered('app/foo.tsx', ['./app/**/*.{ts,tsx}'])).toBe(true)
    expect(isCovered('app/a/b/foo.tsx', ['./app/**/*.{ts,tsx}']), '**/ 要能跨层').toBe(true)
    expect(isCovered('lib/x.ts', ['./lib/**/*.ts'])).toBe(true)
    // 不该匹配的绝不能匹配（否则下面的覆盖率断言是空的）
    expect(isCovered('lib/foo.ts', ['./app/**/*.{ts,tsx}'])).toBe(false)
    expect(isCovered('app2/foo.ts', ['./app/**/*.ts'])).toBe(false)
    expect(isCovered('app/foo.tsx', ['./app/**/*.ts']), '扩展名要真的区分').toBe(false)
    // 解析器本身：能读出 3 行以上的 glob，别解析成空数组
    expect(globs.length, '从 tailwind.config.ts 解析出的 glob 条数').toBeGreaterThanOrEqual(3)
    expect(globs.every((g) => g.startsWith('./')), 'glob 都要是相对路径写法').toBe(true)
  })

  it('每一个含 TS/TSX 源码的顶层目录都被 content 覆盖', () => {
    const dirs = appSourceDirs()
    expect(dirs, '一个源码目录都没扫到 ⇒ 扫描逻辑坏了').not.toHaveLength(0)
    const uncovered = dirs.filter((d) => !isCovered(`${d}/__probe__.ts`, globs))
    expect(
      uncovered,
      `以下源码目录没进 tailwind content ⇒ 里面的类名会被静默 purge（不报错、只是没样式）：${uncovered.join(', ')}`,
    ).toEqual([])
  })

  it('探针自检：扫到的目录正是这几块源码（多一个少一个都要有人来看一眼）', () => {
    expect(appSourceDirs()).toEqual(['app', 'components', 'hooks', 'lib'])
  })

  it('缝隙证明：去掉 ./lib/** 这条 glob，配色文件立刻失去覆盖', () => {
    const target = 'lib/fretboard-note-button-color.ts'
    expect(existsSync(target), '配色文件还在（它没被搬走/改名）').toBe(true)
    expect(isCovered(target, globs), '现在必须是覆盖的').toBe(true)

    const withoutLib = globs.filter((g) => !g.startsWith('./lib/'))
    expect(withoutLib.length, '确实去掉了一条').toBe(globs.length - 1)
    expect(
      isCovered(target, withoutLib),
      '去掉 lib 后必须变成未覆盖 —— 否则上面那条覆盖率断言是空转的',
    ).toBe(false)
  })

  it('这条目录规则绑着真实危害：lib 里真的写着 tailwind 类名', () => {
    const colorSrc = readFileSync('lib/fretboard-note-button-color.ts', 'utf8')
    // 只要这个文件还在「产出类名」，目录覆盖对它就永远有意义
    expect(colorSrc, '配色函数是这个文件导出的').toContain('export function getNoteButtonColor')
    const classTokens = colorSrc.match(/\b(?:bg|text|ring|border|opacity)-[a-z0-9]+(?:[/[\]-][\w./%[\]]+)?/g) ?? []
    expect(classTokens.length, 'lib/fretboard-note-button-color.ts 里提取到的类名数量').toBeGreaterThan(20)
  })
})
