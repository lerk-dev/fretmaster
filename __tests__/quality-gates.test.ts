/**
 * 源码级护栏：工程门禁不变量（2026-10-04 A 批修复的防回退锁）。
 *
 * 背景：这三类门禁曾以「配置在、但机器不执行」的形态静默缺席：
 *   1) lint —— ESLint 9 只认 flat config，仓库还是旧 .eslintrc ⇒ `npm run lint`
 *      长期直接报错；react-hooks 规则在仓库历史上从未被机器执行过；
 *   2) 构建类型检查 —— next.config.mjs 挂了两处 ignoreBuildErrors: true；
 *   3) CI —— 4 个 workflow 里没有任何 tsc / lint / vitest 步骤。
 * 全部靠 2026-10-04 的人工全量审计才发现 ⇒ 用本测试钉住，防再回退。
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'

describe('工程门禁：lint / 构建类型检查 / CI 质量步骤', () => {
  it('eslint.config.mjs 在岗（ESLint 9 flat config），旧 .eslintrc 不得复活', () => {
    expect(existsSync('eslint.config.mjs')).toBe(true)
    expect(existsSync('.eslintrc')).toBe(false)
  })

  it('eslint 配置必须启用 react-hooks 经典两条；npm run lint 必须走 eslint', () => {
    const cfg = readFileSync('eslint.config.mjs', 'utf8')
    expect(cfg).toContain('react-hooks/rules-of-hooks')
    expect(cfg).toContain('react-hooks/exhaustive-deps')
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.lint ?? '').toMatch(/^eslint\b/)
  })

  it('npm run lint 必须带 --max-warnings 0（2026-10-06 起 warning 基线为 0，回潮即 CI 失败）', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    const lint = pkg.scripts?.lint ?? ''
    expect(lint).toMatch(/^eslint\b/)
    expect(lint).toContain('--max-warnings 0')
  })

  it('next.config.mjs 不得再出现 ignoreBuildErrors（构建必须做类型门禁）', () => {
    const cfg = readFileSync('next.config.mjs', 'utf8')
    expect(cfg.includes('ignoreBuildErrors')).toBe(false)
  })

  it('.npmrc 必须固化 legacy-peer-deps（react-day-picker/react-window 的 react19 peer 冲突）', () => {
    expect(existsSync('.npmrc')).toBe(true)
    const npmrc = readFileSync('.npmrc', 'utf8')
    expect(npmrc).toMatch(/legacy-peer-deps\s*=\s*true/)
  })

  it('ci.yml 必须包含 tsc / lint / vitest / build 四道质量步骤', () => {
    expect(existsSync('.github/workflows/ci.yml')).toBe(true)
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
    expect(ci).toContain('tsc --noEmit')
    expect(ci).toContain('npm run lint')
    expect(ci).toContain('vitest run')
    expect(ci).toContain('npm run build')
  })
})
