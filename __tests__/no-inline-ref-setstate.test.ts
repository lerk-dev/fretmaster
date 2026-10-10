/**
 * 源码级护栏：**禁止在内联 ref 回调里 setState**（P2-6）。
 *
 * 2026-10-10 全仓审查：
 *   `components/onboarding/onboarding-overlay.tsx` 曾把气泡尺寸测量写在
 *   `ref={(el) => { const r = el.getBoundingClientRect(); setTooltipSize({...}) }}` 里。
 *   内联 ref 函数**每次渲染都是新 identity** ⇒ React 每轮都 detach/attach ⇒
 *   每次都 `setTooltipSize({新对象})` ⇒ 再渲染 ⇒ 再测量……形成永不收敛的重渲染循环。
 *   只要教程浮层出现，该子树就持续重渲染（framer-motion 每帧重提交，低配设备掉帧）。
 *
 * 为什么只能源码级：这个循环依赖「React 对内联 ref 的处理」+「新对象 ≠ 旧对象」，
 * jsdom 单测跑一两轮渲染看不出来（要数到成百上千轮才会超时）。
 *
 * 允许的写法：
 *   - `ref={someRef}`（稳定引用）
 *   - `ref={useCallback(...)}`（稳定引用）
 *   - 需要在 ref 里测量时，改到 `useLayoutEffect`，并「值变了才 setState」。
 *
 * 本护栏扫描全仓 `components/**`、`app/**`、`hooks/**` 里的内联 ref 箭头函数体，
 * 只要体内出现 `set[A-Z]\w*(` 就判定违规（`ref.current = el` 这种**写 ref** 不算）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/** 递归收集目录下的 .ts/.tsx（与 native-field-convention.test.ts 同型） */
function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      out.push(...walk(full, exts))
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full)
    }
  }
  return out
}

/** 剥掉块注释与行注释（注释里会举例说明反例，不剥会误判） */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * 找 `ref={(el) => { ... }}` / `ref={(el) => expr}` 形式的内联回调，
 * 返回其函数体（供进一步判定）。
 * 简化实现：定位 `ref={` 后到匹配的 `}`，用括号计数。
 */
function findInlineRefCallbacks(src: string): string[] {
  const out: string[] = []
  const re = /\bref=\{\(([^)]*)\)\s*=>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    // 从箭头开始，括号计数直到对应的收尾
    const start = m.index + m[0].length
    let depth = 0
    let i = start
    let sawBrace = false
    for (; i < src.length; i++) {
      const ch = src[i]
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++
        if (ch === '{') sawBrace = true
      } else if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) break
        depth--
      } else if (ch === ',' && depth === 0 && !sawBrace) {
        // `ref={(el) => expr, ...}` 这种少见写法：到逗号结束
        break
      } else if (ch === ';' && depth === 0) {
        break
      }
    }
    out.push(src.slice(start, i))
  }
  return out
}

describe('禁止内联 ref 回调里 setState（P2-6 重渲染循环）', () => {
  const files = ['components', 'app', 'hooks'].flatMap((d) => {
    try {
      return statSync(d).isDirectory() ? walk(d, ['.tsx', '.ts']) : []
    } catch {
      return []
    }
  })

  it('扫到了待检查文件（否则护栏静默空转）', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('全仓没有「内联 ref 回调 + setState」的组合', () => {
    const offenders: Array<{ file: string; body: string }> = []
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const body of findInlineRefCallbacks(src)) {
        // 只抓「调用 React setter」：setXxx(...)，排除 ref.current = el 之类的写法
        if (/\bset[A-Z]\w*\s*\(/.test(body)) {
          offenders.push({ file, body: body.trim().slice(0, 120) })
        }
      }
    }
    expect(
      offenders,
      '发现内联 ref 回调里调用 setState —— 内联 ref 每次渲染换 identity，' +
        'React 每轮 detach/attach ⇒ setState ⇒ 再渲染 的死循环：\n' +
        offenders.map((o) => `  ${o.file}\n    ${o.body}`).join('\n')
    ).toEqual([])
  })
})
