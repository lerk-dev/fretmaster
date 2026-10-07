/**
 * `app/page.tsx` 的**源码级**契约：题目区不能被「显示指板」开关关掉。
 *
 * 2026-10-01 修：各练习点「开始练习」后再点「显示指板」，**题目区直接消失、没法练**。
 * 根因是四个题目组件都带了自己的 `!showXxxFretboard` 门控：
 *
 *   {activeTab === "chord"          && !showChordFretboard         && (<ChordDegreesDisplay  …
 *   {activeTab === "scale"          && !showScaleFretboard         && (<ScaleSequenceDisplay …
 *   {activeTab === "chord_exercise" && !showChordExerciseFretboard && (<ChordExerciseQuestion …
 *   {activeTab === "interval"       && !showIntervalFretboard      && (<IntervalQuestion      …
 *
 * ⇒ 一开指板就把题目**卸载**，用户不知道要弹什么。口径应当是「显示指板是**辅助**」
 * （课程文案原话：「先用『显示指板』辅助，再关闭它凭记忆找音」）⇒ 两者必须**同屏**。
 *
 * 为什么只能靠源码断言：`app/page.tsx` 是 5400 行的巨石、**没有任何单测**（无法单独渲染），
 * 组件级测试再全也看不到「页面里那个门控条件」。所以这里读源码来钉。
 *
 * ⚠️ 扫源码前**必须先剥注释**：修完后的说明性注释里就写着 `!showChordFretboard`（在解释
 * 为什么不能这么写），不剥注释会把文档当成回归（本仓在 `KNOWN-ISSUES` 里踩过同一个坑）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PAGE_SRC = readFileSync('app/page.tsx', 'utf8')

/** [组件名, 所属 tab, 对应的指板开关] */
const CASES: ReadonlyArray<readonly [string, string, string]> = [
  ['ChordDegreesDisplay', 'chord', 'showChordFretboard'],
  ['ScaleSequenceDisplay', 'scale', 'showScaleFretboard'],
  ['ChordExerciseQuestion', 'chord_exercise', 'showChordExerciseFretboard'],
  ['IntervalQuestion', 'interval', 'showIntervalFretboard'],
] as const

/** 去掉 JSX 注释 / 块注释 / 行注释 —— 否则「解释为什么不能这么写」的文档会被当成缺陷 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* … */
    .replace(/^\s*\/\/.*$/gm, '') // // …
}

/** 返回「题目区被指板开关关掉」的违规描述；空数组 = 合规 */
function questionGatesClosedByFretboardToggle(
  src: string,
  cases: ReadonlyArray<readonly [string, string, string]>,
): string[] {
  const clean = stripComments(src)
  const bad: string[] = []
  for (const [component, tab, toggle] of cases) {
    const at = clean.indexOf(`<${component}`)
    if (at < 0) {
      bad.push(`页面里找不到 <${component}>`)
      continue
    }
    // 组件标签往回数最近的 `{activeTab` —— 那一段就是它的渲染门控
    const start = clean.lastIndexOf('{activeTab', at)
    if (start < 0) {
      bad.push(`<${component}> 前面没有 activeTab 门控（结构变了？）`)
      continue
    }
    const gate = clean.slice(start, at)
    if (!gate.includes(`activeTab === "${tab}"`)) {
      bad.push(`${component} 的门控不是 activeTab === "${tab}"`)
    }
    if (gate.includes(toggle)) {
      bad.push(`${component} 被 ${toggle} 关掉了 ⇒ 一开指板题目区就消失、没法练`)
    } else if (/show\w*Fretboard/.test(gate)) {
      bad.push(`${component} 的门控里还挂着别的指板开关`)
    }
  }
  return bad
}

describe('题目区与指板必须同屏（app/page.tsx 源码护栏）', () => {
  it('四个题目区都不能被对应的指板开关关掉', () => {
    const bad = questionGatesClosedByFretboardToggle(PAGE_SRC, CASES)
    expect(bad, bad.join(' | ')).toEqual([])
  })

  it('护栏自测：把旧的互斥写法喂进来，必须四个都报缺陷', () => {
    // 不剥注释 + 漏判的话，这条自测会挂 ⇒ 证明上面的护栏真的在干活
    const legacy = CASES.map(
      ([component, tab, toggle]) =>
        `{activeTab === "${tab}" && !${toggle} && (\n  <${component} />\n)}`,
    ).join('\n')
    const bad = questionGatesClosedByFretboardToggle(legacy, CASES)
    expect(bad).toHaveLength(CASES.length)
    expect(bad.join(' | ')).toContain('被 showChordFretboard 关掉')
    expect(bad.join(' | ')).toContain('被 showIntervalFretboard 关掉')
  })

  it('护栏自测：解释性注释里的 `!showXxxFretboard` 不算缺陷（先剥注释）', () => {
    const commented = CASES.map(
      ([component, tab]) =>
        `{/* 这里**不能**写 !showXxxFretboard —— 见 KNOWN-ISSUES */}\n` +
        `{activeTab === "${tab}" && (\n  <${component} />\n)}`,
    ).join('\n')
    expect(stripComments(commented)).not.toContain('!showXxxFretboard')
    expect(questionGatesClosedByFretboardToggle(commented, CASES)).toEqual([])
  })

  it('另一侧：四个开关仍然各自控制**指板**的显隐（别把开关顺手删了）', () => {
    const clean = stripComments(PAGE_SRC)
    const boardRender = clean.indexOf('<GuitarRunFretboard')
    expect(boardRender, '页面里要有指板渲染入口').toBeGreaterThan(0)
    const gateStart = clean.lastIndexOf('{activeTab !== "stats"', boardRender)
    expect(gateStart, '指板门控的起点').toBeGreaterThan(0)
    const gate = clean.slice(gateStart, boardRender)
    for (const [, , toggle] of CASES) {
      expect(gate, `${toggle} 仍然要决定指板显不显示`).toContain(toggle)
    }
  })

  it('探针自检：四个题目组件都还在页面里被渲染', () => {
    const clean = stripComments(PAGE_SRC)
    expect(CASES).toHaveLength(4)
    for (const [component] of CASES) {
      expect(clean, `${component} 的渲染点`).toContain(`<${component}`)
    }
  })
})
