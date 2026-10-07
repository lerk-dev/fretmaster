/**
 * 源码级护栏：指板皮肤「标记必须画在琴弦之上」的层序锁（2026-10-06）。
 *
 * 真机现象（用户报告）：「指板 应该是 品/音的标记在琴弦上方，不应该是琴弦遮挡标记」。
 *
 * 根因是**纯 CSS 层叠**，不是布局：trainer 皮肤（`.ft-*`，3D 琴颈）里
 * `.ft-cell::before`（琴弦）z-index **5** 高于 `.ft-dot`（音名/音级圆点）z-index **3**，
 * 同一层叠上下文内弦必然画在圆点之上 ⇒ 金属弦把音名标记切开。
 * 修法：把两类标记提到弦之上 —— 品记 `.ft-inlay` 0→6、音名圆点 `.ft-dot` 3→7。
 *
 * 为什么是「值级」断言而非渲染断言：jsdom 没有层叠/绘制引擎，渲染结果断言恒真（铁律 17）；
 * 而「谁盖谁」在同一层叠上下文里就是 z-index 的**数值比较** —— 可确定性验证。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// 先剥掉注释：① 让规则边界（`}`）与选择器相邻，便于锚定；② 避免注释里的说明文字干扰取值。
const CSS = readFileSync('app/globals.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** 取某选择器块内的 z-index；未声明（auto）按 0 计 */
function zIndexOf(selector: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 🚨 必须锚定「规则边界」：选择器前面只能是 `}`（或文件开头）。
  // 否则 `.gr-cell:not(:disabled):hover .gr-note-dot {` 这种**后代**选择器会先被匹配到，
  // 而它的块里没有 z-index ⇒ 恒返 0（本护栏第一版就踩了这个，GuitarRun 那条假红）。
  const block = CSS.match(new RegExp('(?:^|\\})\\s*' + escaped + '\\s*\\{([^}]*)\\}'))
  expect(block, `globals.css 里找不到 ${selector} 的样式块`).not.toBeNull()
  const z = block![1].match(/z-index:\s*(-?\d+)/)
  return z ? Number(z[1]) : 0
}

describe('指板皮肤层序：标记必须画在琴弦之上', () => {
  it('trainer 皮肤：音名圆点 > 琴弦 > 品丝，且品记点也在琴弦之上', () => {
    const fretWire = zIndexOf('.ft-cell::after') // 品丝（竖）
    const string = zIndexOf('.ft-cell::before') // 琴弦（横）
    const inlay = zIndexOf('.ft-inlay') // 品记点
    const dot = zIndexOf('.ft-dot') // 音名/音级圆点

    expect(fretWire).toBeLessThan(string) // 原设计：品丝在弦之下
    expect(string).toBeLessThan(dot) // 🚨 本次修复：圆点在弦之上
    expect(string).toBeLessThan(inlay) // 🚨 本次修复：品记在弦之上
    expect(inlay).toBeLessThanOrEqual(dot) // 圆点不落后于品记
  })

  it('GuitarRun 皮肤：圆点（.gr-note-dot）也在弦线（.gr-cell::before）之上', () => {
    expect(zIndexOf('.gr-note-dot')).toBeGreaterThan(zIndexOf('.gr-cell::before'))
  })
})
