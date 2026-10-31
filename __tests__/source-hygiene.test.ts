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

/**
 * 🚨 桌面端不许走「Web 专属」的浏览器权限流程。
 *
 * 2026-10-31 实测：打包后的 exe 一启动就弹系统麦克风权限框
 * （`tauri.localhost 想要使用麦克风`）。原因不是 `isTauriEnv()` 判错了，
 * 而是这段 effect 只看 **state** `isTauri`（初始 false，挂载后才翻转）
 * ⇒ 桌面端第一次渲染落进 Web 分支 ⇒ `getUserMedia`。
 *
 * 这类错误用行为测试很难盖住（jsdom 里没有 `tauri.localhost`），只能钉源码。
 */
describe('Web 专属流程必须用同步判定 isTauriEnv()，不能只看 state isTauri', () => {
  const PAGE = readFileSync('app/page.tsx', 'utf8').replace(/\r\n/g, '\n')

  it('请求麦克风权限的那段 effect，分支条件里必须有 isTauriEnv()', () => {
    const idx = PAGE.indexOf('requestPermissionAndGetDevices')
    expect(idx, '找不到 requestPermissionAndGetDevices —— 锚点失效').toBeGreaterThan(-1)
    const before = PAGE.slice(0, idx)
    const branchAt = before.lastIndexOf('if (isTauri')
    expect(branchAt, '这个 effect 里找不到 isTauri 分支').toBeGreaterThan(-1)
    const branchLine = before.slice(branchAt).split('\n')[0]
    expect(
      branchLine,
      '分支只看了 state isTauri ⇒ 打包后的桌面端首帧会掉进 Web 分支并弹麦克风权限框',
    ).toContain('isTauriEnv()')
  })

  it('同一段里没有任何「无条件 getUserMedia」的旁路', () => {
    const start = PAGE.indexOf('requestPermissionAndGetDevices')
    const end = PAGE.indexOf('// 当设置面板打开时，刷新设备列表')
    expect(end).toBeGreaterThan(start)
    const region = PAGE.slice(start, end)
    // getUserMedia 只允许出现在 `requestPermissionAndGetDevices` 内部（被上面的分支保护）
    const calls = (region.match(/navigator\.mediaDevices\.getUserMedia/g) ?? []).length
    expect(calls, `这段里出现 ${calls} 次 getUserMedia（预期 1 次，且在该函数内）`).toBe(1)
  })
})

/**
 * 🚨 音程方向「只有一处真相源，且调用点必须真的传」。
 *
 * 用户报的现象：音程练习进全屏后**方向没了**。两个独立的缺口叠在一起才会出现：
 *
 *  ① `components/fullscreen-overlay.tsx` 根本没渲染方向（组件内缺口）；
 *  ② `app/page.tsx` 也没把 `intervalDirection` 传给它（接线缺口）。
 *
 * ②不是①的附带品：即使组件补好了，漏传 prop 依然什么都不会显示，而组件级测试
 * 是**直接给 props** 的（等于绕过了 page.tsx），盖不住这条缝。
 *
 * 另外钉住「不许再内联三元」：`↕`（双向）与 `🔀`（随机）只差一个字符，抄错之后
 * 界面上完全看不出来 —— 这份映射只能有一份（`INTERVAL_DIRECTION_SYMBOLS`）。
 */
describe('音程方向：唯一真相源 + 调用点接线', () => {
  const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

  it('两个显示点都调 intervalDirectionSymbol()，不许内联方向三元', () => {
    for (const file of ['components/interval-question.tsx', 'components/fullscreen-overlay.tsx']) {
      const src = read(file)
      expect(src, `${file} 没有使用方向符号的唯一真相源`).toContain('intervalDirectionSymbol(')
      // 内联写法长这样：intervalDirection === 'up' ? '↑' : …
      expect(
        /intervalDirection\s*===\s*['"]up['"]\s*\?/.test(src),
        `${file} 里又出现了一份内联的方向三元表达式（改成 intervalDirectionSymbol）`,
      ).toBe(false)
    }
  })

  it('fullscreen-overlay 的 props 里声明了方向与队列进度', () => {
    const src = read('components/fullscreen-overlay.tsx')
    for (const prop of ['intervalDirection:', 'intervalExerciseQueue:', 'intervalCurrentQueueIndex:']) {
      expect(src, `Props 里缺少 ${prop}`).toContain(prop)
    }
  })

  it('app/page.tsx 调用 FullscreenOverlay 时确实传了这三项', () => {
    const page = read('app/page.tsx')
    const at = page.indexOf('<FullscreenOverlay')
    expect(at, '找不到 <FullscreenOverlay —— 锚点失效').toBeGreaterThan(-1)
    const call = page.slice(at, page.indexOf('/>', at))
    for (const prop of [
      'intervalDirection={intervalDirection}',
      'intervalExerciseQueue={intervalExerciseQueue}',
      'intervalCurrentQueueIndex={intervalCurrentQueueIndex}',
    ]) {
      expect(call, `FullscreenOverlay 漏传 ${prop} ⇒ 全屏里不会显示`).toContain(prop)
    }
  })
})
