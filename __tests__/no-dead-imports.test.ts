/**
 * 源码级护栏：禁止「死导入」（import 了却从未使用的绑定）。
 *
 * 为什么需要它：
 *  - `npm run lint` 目前是坏的（仓库是 .eslintrc 旧格式，ESLint 9 只认
 *    eslint.config.js，直接 `eslint .` 会报「couldn't find an eslint.config file」），
 *    所以 @typescript-eslint/no-unused-vars 那条 warn 规则根本没跑起来；
 *  - tsconfig 的 `noUnusedLocals` 迟到 2026-10-04 才开启（见 no-unused-locals.test.ts）；
 *  - 于是这类「组件被抽走后忘了删 import」的残留一路累积：本次清理前
 *    app/page.tsx 一个文件就有 109 处（24 条整行 import + 30 条部分绑定）。
 *
 * 判定方式：同一文件里，把 import 语句整体剔除后，若某个导入绑定在剩余代码中
 * 一次都没出现，则视为死导入。保守起见「出现在注释里也算使用」，不会误报。
 *
 * 覆盖范围：app/、components/（含 components/ui）、lib/、hooks/、__tests__/。
 * 确有需要保留的（例如仅为类型文档而导入），加进 ALLOWLIST 并写清原因。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', '__tests__']

/** 例外清单（key = 相对路径，value = 允许保留的绑定名→原因） */
const ALLOWLIST: Record<string, Record<string, string>> = {}

const IMPORT_RE = /^import[\s\S]*?from\s*['"][^'"]+['"];?|^import\s*['"][^'"]+['"];?/gm

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** 取一条 import 语句里的所有本地绑定名 */
function bindingsOf(stmt: string): string[] {
  const names: string[] = []
  const head = /^import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/.exec(stmt)
  if (head) names.push(head[1])
  const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(stmt)
  if (ns) names.push(ns[1])
  const brace = /\{([\s\S]*?)\}/.exec(stmt)
  if (brace) {
    for (const tok of brace[1].split(',')) {
      const t = tok.trim()
      if (!t) continue
      const parts = t.split(/\s+as\s+/)
      names.push(parts[parts.length - 1].trim().replace(/^type\s+/, ''))
    }
  }
  return names
}

function collectDeadImports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const stmts: { text: string; index: number }[] = []
  IMPORT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IMPORT_RE.exec(src))) stmts.push({ text: m[0], index: m.index })

  // 去掉所有 import 语句后的「主体」
  let body = src
  for (const s of [...stmts].reverse()) body = body.slice(0, s.index) + body.slice(s.index + s.text.length)

  const allowed = ALLOWLIST[relative(ROOT, file).split('\\').join('/')] ?? {}
  const dead: string[] = []
  for (const s of stmts) {
    for (const name of bindingsOf(s.text)) {
      if (allowed[name]) continue
      const used = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(body)
      if (!used) dead.push(`${relative(ROOT, file).split('\\').join('/')}  导入 ${name} 后从未使用`)
    }
  }
  return dead
}

describe('源码卫生：没有死导入', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
  const rel = (f: string) => relative(ROOT, f).split('\\').join('/')

  it('扫描范围非空（防呆：目录改名/配置写错时要能发现）', () => {
    expect(files.length).toBeGreaterThan(80)
    expect(files.map(rel)).toContain('app/page.tsx')
  })

  it('所有 .ts/.tsx 里都没有「导入了却没用」的绑定', () => {
    const offenders = files.flatMap(collectDeadImports).sort()
    expect(offenders).toEqual([])
  })
})
