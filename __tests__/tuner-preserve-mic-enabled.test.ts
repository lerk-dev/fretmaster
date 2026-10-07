/**
 * `app/page.tsx` 的**源码级**契约：调音器不得关闭「启用音频输入」这个全局开关。
 *
 * 2026-10-02 用户实测报障（桌面 exe）：
 *   在设置里启用音频输入 → 回到练习/调音 → **完全没反应** →
 *   回设置一看，「音频输入」开关已被自动关闭。
 *
 * 根因是两个函数把「退出调音」和「关闭音频输入」当成了同一件事：
 *
 *   ① `startTuner`：
 *        if (micEnabled) { await stopAudioInput(); setMicEnabled(false) }
 *      —— **无差别**跑。但 Tauri 路径下 `micEnabled` 是设置页那个**全局**开关，
 *      调音器只是复用同一个 Rust 采集后端（下面 `startAudioCapture` 会重建采集）。
 *      ⇒ 用户只要碰过一次调音器，全局开关就被悄悄关掉。
 *
 *   ② `stopTuner`：
 *        无条件 `await stopAudioCapture()`
 *      —— 调音器一关，练习模式的收音也一起死。
 *
 * 后果是**静默**的：Rust 侧 `capture.rs` 的 `is_capturing` 变 false 后，
 * `pipeline.rs` 的 4 处 `if !self.capture.is_capturing()` 守卫判定「未在采集」而
 * **直接返回、不报错**，前端看起来就是「点了没反应」。
 *
 * 为什么只能靠源码断言：`app/page.tsx` 是 5000+ 行巨石、无法单独渲染，
 * 而这正是「接线」层面的错误 —— 组件级测试再全也看不到。
 *
 * 口径（与产品语义对齐）：
 *   - 「启用音频输入」= 全局开关（设置页 / 顶栏麦克风按钮）才控制它；
 *   - 「开始/退出调音器」= 只是复用/让出采集后端，**不动**全局开关；
 *   - `stopTuner` 只在「全局开关本来就关着」时才真正拆掉采集。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PAGE_SRC = readFileSync('app/page.tsx', 'utf8')

/** 剥注释：说明性注释里会提到 `setMicEnabled(false)`（在解释为什么不能乱调），不剥会误判 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const SRC = stripComments(PAGE_SRC)

/** 取一个函数/回调的源码段（从 `const <name> = useCallback(` 到下一个 `}, [...])` 收尾） */
function sliceCallback(name: string): string {
  const start = SRC.indexOf(`const ${name} = useCallback(`)
  expect(start, `page.tsx 里找不到 ${name} —— 护栏会静默空转`).toBeGreaterThan(-1)
  const end = SRC.indexOf('\n  }, [', start)
  expect(end, `${name} 的 useCallback 收尾没找到`).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('调音器不得关闭全局「启用音频输入」开关', () => {
  it('锚点自检：startTuner / stopTuner / stopAudioInput 都还在（改名即失败）', () => {
    // 没有这层自检，函数一改名所有断言都会「匹配不到 ⇒ 恰好通过」
    expect(/\bconst startTuner = useCallback\s*\(/.test(SRC), 'startTuner 消失或改名').toBe(true)
    expect(/\bconst stopTuner = useCallback\s*\(/.test(SRC), 'stopTuner 消失或改名').toBe(true)
    expect(/\bconst stopAudioInput = useCallback\s*\(/.test(SRC), 'stopAudioInput 消失或改名').toBe(
      true
    )
    expect(/\bconst startAudioInput = useCallback\s*\(/.test(SRC), 'startAudioInput 消失或改名').toBe(
      true
    )
  })

  it('startTuner 关 micEnabled 的分支必须带 `!isTauri` 守卫', () => {
    const body = sliceCallback('startTuner')
    const idx = body.indexOf('setMicEnabled(false)')
    expect(idx, 'startTuner 里已经不关 micEnabled 了（契约已变，需同步更新本测试）').toBeGreaterThan(
      -1
    )
    // 往回看最近的一个 if 条件行，必须含 !isTauri
    const before = body.slice(0, idx)
    const lastIf = before.lastIndexOf('if (')
    expect(lastIf, 'setMicEnabled(false) 不在任何 if 里 —— 那是无条件关闭').toBeGreaterThan(-1)
    const cond = before.slice(lastIf, before.indexOf('{', lastIf))
    expect(
      /!\s*isTauri/.test(cond),
      `startTuner 里 setMicEnabled(false) 的守卫缺 !isTauri（条件为 ${JSON.stringify(cond.trim())}）` +
        ` ⇒ Tauri 下碰一次调音器就会把全局音频开关关掉`
    ).toBe(true)
  })

  it('stopTuner 拆 Rust 采集前必须先查全局 micEnabled', () => {
    const body = sliceCallback('stopTuner')
    const idx = body.indexOf('stopAudioCapture')
    expect(idx, 'stopTuner 里已经不再直接 stopAudioCapture（契约已变，需同步更新本测试）').toBeGreaterThan(
      -1
    )
    const before = body.slice(0, idx)
    // 必须有一次「读当前 micEnabled」的判定（getState 直读，避免闭包里的旧值）
    expect(
      /useAppStore\.getState\(\)\.audio\.micEnabled/.test(before),
      'stopTuner 无条件拆音频采集 ⇒ 关掉调音器会连带把练习模式的收音一起杀掉' +
        '（Rust is_capturing 变 false，pipeline 守卫静默空转，表现为「点了没反应」）'
    ).toBe(true)
    // 且该判定必须真的包住 stopAudioCapture（是条件而非并列语句）
    const lastIf = before.lastIndexOf('if (')
    const cond = before.slice(lastIf, before.indexOf('{', lastIf))
    expect(
      /micEnabled/.test(cond),
      `stopTuner 里 stopAudioCapture 不在「micEnabled 为假」的条件里（条件为 ${JSON.stringify(
        cond.trim()
      )}）`
    ).toBe(true)
  })

  it('setMicEnabled(false) 的全部调用点都是「真的想关输入」（逐点分诊）', () => {
    // 允许的调用点 = 这些函数的**职责本身就是**关掉输入：
    //   - `stopAudioInput` 是「显式停止」的实现体（Web 路径的清理函数）
    //   - 其余必须是错误处理路径，或有条件守卫
    // 新增调用点若落到两个集合之外，视为回归。
    const isInsideStopAudioInput = (at: number): boolean => {
      const fnStart = SRC.indexOf('const stopAudioInput = useCallback(')
      if (fnStart < 0) return false
      const fnEnd = SRC.indexOf('\n  }, [', fnStart)
      return at > fnStart && at < fnEnd
    }

    const hits = [...SRC.matchAll(/setMicEnabled\(false\)/g)].map((m) => m.index!)
    expect(hits.length, 'page.tsx 里 setMicEnabled(false) 的调用点数量异常').toBeGreaterThanOrEqual(3)

    for (const at of hits) {
      // ① stopAudioInput 的实现体：它的职责就是关，跳过
      if (isInsideStopAudioInput(at)) continue

      const ctx = SRC.slice(Math.max(0, at - 400), at)
      const guarded =
        // 错误处理路径（启动失败要复位，合理）
        /catch\s*\(/.test(ctx.slice(-300)) ||
        /startAudioInput\(\)\.catch/.test(ctx) ||
        // 有条件守卫（如 !isTauri）
        /if\s*\([^)]*!?\s*isTauri/.test(ctx) ||
        // 紧挨着一次显式 stopAudioInput()（用户主动关，合理）
        /stopAudioInput\(\)/.test(ctx.slice(-200))
      expect(
        guarded,
        `发现一个「无守卫地关掉全局音频输入」的调用点（偏移 ${at}）——` +
          `上下文：${JSON.stringify(SRC.slice(Math.max(0, at - 160), at + 20))}`
      ).toBe(true)
    }
  })
})
