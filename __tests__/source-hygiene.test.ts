/**
 * 源码卫生护栏（B 批，2026-10-04 全面审计的后续）。
 *
 * 两条规矩都是「机器能查、人容易忘」的：
 *
 *  ① **生产目录不许裸 `console.log/info/debug`** —— 项目已有统一日志层
 *     `lib/logger.ts`（`debug` 级别 dev-only，`warn/error` 带时间戳前缀）。
 *     裸调的后果不是报错，而是「发布版里用户的控制台被刷屏」，且无从统一关掉。
 *     白名单只有一个：`lib/logger.ts` 自己（它必须直连 console）。
 *     ⚠️ `console.warn/error` **不在禁令内** —— 存量 60+ 处且都带诊断价值，
 *     一刀切会把真正的故障信息一起埋掉，等存量收敛后再谈。
 *
 *  ② **生产目录不许 `@ts-ignore`** —— 它比 `@ts-expect-error` 危险：错误消失后
 *     不会报错，会永远留在那里并持续吞掉**同一段里的其它类型错误**。
 *     `app/page.tsx` 的 getUserMedia 约束那处已改为交叉类型
 *     `MediaTrackConstraints & { latency?: number }` 转正（B3）。
 *
 * 🚨 铁律 20：断言的是**具体的文件:行清单**（为空），不是「出现过几次 < N」。
 *    这样新增一处违规定位点名，而不是让数字悄悄涨。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SCAN_DIRS = ['app', 'components', 'hooks', 'lib']
/** 唯一允许直连 console 的文件：日志层自身 */
const CONSOLE_WHITELIST = new Set(['lib/logger.ts'])
/** 禁止在生产目录出现的类型压制指令（比 @ts-expect-error 危险：错误消失后不报错） */
const BANNED_TS_DIRECTIVE = /^\s*(?:\/\/|\/?\*)\s*@ts-ignore\b/
const BARE_CONSOLE = /console\.(?:log|info|debug)\s*\(/

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out // 目录不存在（如尚未创建的 hooks/）→ 跳过，不算违规
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (/\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

/** 收集违规点，返回 `相对路径:行号` 清单（便于失败时定位） */
function collect(re: RegExp, skip: (rel: string) => boolean): string[] {
  const hits: string[] = []
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      const rel = relative(process.cwd(), file).replace(/\\/g, '/')
      if (skip(rel)) continue
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        if (re.test(line)) hits.push(`${rel}:${i + 1}`)
      })
    }
  }
  return hits
}

describe('生产目录不许裸 console.log / info / debug（统一走 lib/logger）', () => {
  it('app / components / hooks / lib 下除 lib/logger.ts 外零命中', () => {
    const hits = collect(BARE_CONSOLE, (rel) => CONSOLE_WHITELIST.has(rel))
    expect(hits, `以下位置直连了 console（请改用 logger.debug/info）：\n${hits.join('\n')}`).toEqual([])
  })

  it('白名单本身必须是 lib/logger.ts（改日志层实现时要同步这里）', () => {
    expect([...CONSOLE_WHITELIST]).toEqual(['lib/logger.ts'])
    // 唯一真相源必须还在，否则上一条的「放行」就成了放行空气
    expect(() => readFileSync(join(process.cwd(), 'lib/logger.ts'), 'utf8')).not.toThrow()
  })
})

describe('生产目录不许 @ts-ignore（会永久吞掉同段其它类型错误）', () => {
  it('app / components / hooks / lib 下零命中', () => {
    // 只认**注释开头紧跟 @ts-ignore** 的指令形态，避免把「注释里解释为什么不用
    // @ts-ignore」的正文当成违规（page.tsx 的 getUserMedia 约束处就有这样一句）。
    const hits = collect(BANNED_TS_DIRECTIVE, () => false)
    expect(hits, `以下位置用了 @ts-ignore（请补真实类型或改用 @ts-expect-error）：\n${hits.join('\n')}`).toEqual([])
  })
})
