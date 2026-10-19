/**
 * 内容列宽必须随视口分级（2026-10-19 比例修正的回归护栏）。
 *
 * ## 修的是什么
 *
 * 主区内容列原先固定 `max-w-4xl`（896px）。真机实测（headless Chrome + CDP，
 * `local-only/cdp-ui-probe.mjs`）：
 *   · 1920×1080：主区 1688px，内容列只占 **53%**，两侧各留 ~400px 空白；
 *   · 2560：只剩 40%。
 * 表现就是「整个应用被压成中间一条窄带」——指板被压扁、设置项挤在一起。
 *
 * 改为按断点递进（lg/xl/2xl 各一档，上限 1152px）后：
 *   · 1920：内容列 **68%**、指板宽高比 2.85 → 3.67（更接近真实琴颈）；
 *   · 1440：87%；· 390（手机）：94%（不变，仍是撑满）。
 *
 * ## 为什么是源码级判据
 *
 * jsdom 没有布局引擎（铁律 15：布局断言恒真），所以「宽度是否真的变大」只能在
 * 真浏览器里量；这里只钉住**退化形态** —— 有人把分级类删回单一固定宽度时立刻红。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PAGE = 'app/page.tsx'

describe('主区内容列：大屏必须分级放宽', () => {
  const src = readFileSync(PAGE, 'utf8')

  /** 取内容列那个 div 的 className（`mx-auto` + `space-y-*` 的那个） */
  const findColumn = (): string => {
    const re = /className="([^"]*mx-auto[^"]*space-y-3[^"]*)"/
    const m = src.match(re)
    expect(m, '找不到主区内容列的 className（结构被改了？请同步更新本护栏）').not.toBeNull()
    return m![1]
  }

  it('内容列带 lg/xl/2xl 三档 max-width（不再是单一固定宽度）', () => {
    const cls = findColumn()
    for (const bp of ['lg:max-w-', 'xl:max-w-', '2xl:max-w-']) {
      expect(cls, `内容列缺少 ${bp}* —— 宽屏上会退回「中间一条窄带」`).toContain(bp)
    }
  })

  it('最大一档不超过 72rem（1152px）：再宽会让设置行变得稀疏、控件被拉散', () => {
    const cls = findColumn()
    const caps = [...cls.matchAll(/(?:^|\s)(?:lg|xl|2xl):max-w-\[(\d+)rem\]/g)].map((m) => Number(m[1]))
    expect(caps.length, '三档 max-w 应都是 rem 值（px 值会在缩放时与根字号脱钩）').toBeGreaterThanOrEqual(3)
    expect(Math.max(...caps), '大屏列宽超过 72rem —— 设置行会重新变得稀疏').toBeLessThanOrEqual(72)
  })
})
