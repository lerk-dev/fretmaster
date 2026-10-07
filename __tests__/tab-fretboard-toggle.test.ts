/**
 * `lib/tab-fretboard-toggle.ts` 的契约测试 —— 「tab → 指板显隐开关」唯一真相源。
 *
 * 存在的理由（2026-10-02）：这个映射在源码里**曾经有 3 份**且彼此顺序不同：
 *   · `components/fullscreen-overlay.tsx`  三元链（读）
 *   · `app/page.tsx` ↑ 键 if/else 链（写 true）
 *   · `app/page.tsx` ↓ 键 if/else 链（写 false）
 * 条件互斥时长这样不会出错，**但**：① 加第 6 个 tab 要改 3 处，漏一处就
 * 「那个 tab 按 ↑ 没反应」（而且**有测试也抓不到** —— 覆盖率扫描看不见语义）；
 * ② 一旦两个 tab 同名/条件重叠，两份的**顺序差**立刻变成静默分叉。
 *
 * 本文件同时管两件事：
 *   ① 真相源自身的契约（覆盖全集、往返一致、未知 tab 的明确兜底）；
 *   ② **源码级护栏** —— 禁止那两份内联映射复活（读源码，因为 `page.tsx` 是巨石无单测）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PRACTICE_TABS,
  TAB_FRETBOARD_FLAG,
  isPracticeTab,
  getTabFretboardFlag,
  pickTabFretboardFlag,
} from '@/lib/tab-fretboard-toggle'

/** 去注释，避免「解释为什么不能这么写」的文档被当成缺陷（本仓踩过这个坑）。 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('tab → 指板开关：全集与命名', () => {
  it('每个练习 tab 都在对照表里，且开关名唯一', () => {
    expect(PRACTICE_TABS.length).toBe(5)
    for (const tab of PRACTICE_TABS) {
      expect(TAB_FRETBOARD_FLAG[tab], `${tab} 没有开关名`).toBeTruthy()
    }
    // 开关名必须两两不同 —— 两个 tab 共用一个开关 = 一开就串台
    const names = PRACTICE_TABS.map((t) => TAB_FRETBOARD_FLAG[t])
    expect(new Set(names).size, `开关名有重复：${names.join(', ')}`).toBe(names.length)
  })

  it('开关名全都以 show 开头（辅助开关的命名约定，铁律 18）', () => {
    for (const tab of PRACTICE_TABS) {
      expect(TAB_FRETBOARD_FLAG[tab].startsWith('show')).toBe(true)
    }
  })
})

describe('getTabFretboardFlag：非练习 tab 必须返回 null，不许给假名字', () => {
  it('练习 tab 返回自己的开关名', () => {
    expect(getTabFretboardFlag('practice')).toBe('showFretboard')
    expect(getTabFretboardFlag('chord')).toBe('showChordFretboard')
    expect(getTabFretboardFlag('chord_exercise')).toBe('showChordExerciseFretboard')
    expect(getTabFretboardFlag('interval')).toBe('showIntervalFretboard')
    expect(getTabFretboardFlag('scale')).toBe('showScaleFretboard')
  })

  it('非练习 tab 返回 null（stats / theory / course / tuner / 空串 / 乱码）', () => {
    for (const tab of ['stats', 'theory', 'course', 'tuner', '', 'Practice', 'practice ']) {
      expect(getTabFretboardFlag(tab), `${JSON.stringify(tab)} 应为 null`).toBeNull()
    }
  })

  it('isPracticeTab 与 PRACTICE_TABS 一致（含大小写敏感）', () => {
    for (const tab of PRACTICE_TABS) expect(isPracticeTab(tab)).toBe(true)
    expect(isPracticeTab('stats')).toBe(false)
    expect(isPracticeTab('PRACTICE')).toBe(false)
  })
})

describe('pickTabFretboardFlag：读侧（全屏覆盖层）', () => {
  it('按 tab 挑出对应的那一个，且只认 `=== true`', () => {
    const flags = {
      showFretboard: true,
      showIntervalFretboard: false,
      showChordFretboard: true,
      showChordExerciseFretboard: false,
      showScaleFretboard: true,
    }
    expect(pickTabFretboardFlag('practice', flags)).toBe(true)
    expect(pickTabFretboardFlag('interval', flags)).toBe(false)
    expect(pickTabFretboardFlag('chord', flags)).toBe(true)
    expect(pickTabFretboardFlag('chord_exercise', flags)).toBe(false)
    expect(pickTabFretboardFlag('scale', flags)).toBe(true)
  })

  it('未知 tab / 未提供该键 ⇒ false（非练习 tab 不该画指板）', () => {
    expect(pickTabFretboardFlag('stats', {})).toBe(false)
    expect(pickTabFretboardFlag('theory', { showFretboard: true })).toBe(false)
    expect(pickTabFretboardFlag('practice', {})).toBe(false)
    // 只给了别的 tab 的键 ⇒ 当前 tab 仍是 false（不许「沾亲带故」）
    expect(pickTabFretboardFlag('practice', { showScaleFretboard: true })).toBe(false)
  })

  it('🚨 只认 `true` 本身：真值垃圾（字符串 / 数字 / 对象）一律收敛成 false', () => {
    // 为什么值得单独一条：这个函数的调用方是**全屏覆盖层**，五个 prop 虽然声明成
    // `boolean`，但页面侧的初值走 `useState(false)`、历史值曾来自**持久化的 store**
    // （`JSON.parse` 出来的东西不保证类型）⇒ 「非空真值就该显示指板」是一条会静默
    // 画出指板的捷径。这里把「只认 true 本身」钉成契约。
    const junk: unknown[] = ['true', 'false', 1, 0, {}, [], 'yes', -1]
    for (const v of junk) {
      expect(
        pickTabFretboardFlag('practice', { showFretboard: v as boolean }),
        `垃圾值 ${JSON.stringify(v)} 必须收敛为 false`,
      ).toBe(false)
    }
    // 反向：真正的 true 仍然生效（防止上面那条被写成恒 false 的假护栏）
    expect(pickTabFretboardFlag('practice', { showFretboard: true })).toBe(true)
  })

  it('🚨 单键穷举：5 个 tab × 5 个键「只有自己的键生效」', () => {
    // 逐个键单独点亮，断言只有它对应的 tab 变 true —— 这条能抓住「对照表被复制粘贴错位」
    for (const tab of PRACTICE_TABS) {
      const flag = TAB_FRETBOARD_FLAG[tab]
      for (const probe of PRACTICE_TABS) {
        const on = probe === tab
        expect(
          pickTabFretboardFlag(probe, { [flag]: true }),
          `点亮 ${flag} 后 ${probe} 的取值`,
        ).toBe(on)
      }
    }
  })
})

describe('🚨 源码护栏：3 份内联映射不许复活', () => {
  const OVERLAY = stripComments(readFileSync('components/fullscreen-overlay.tsx', 'utf8'))
  const PAGE = stripComments(readFileSync('app/page.tsx', 'utf8'))

  it('全屏覆盖层不再自带 tab→开关 的三元链', () => {
    // 特征物：`=== 'xxx' ? showXxxFretboard` 形式的取舍链
    expect(OVERLAY).not.toMatch(/activeTab\s*===\s*['"][a-z_]+['"]\s*\?\s*show[A-Za-z]*Fretboard/)
    // 且必须真的调了真相源（否则删掉链子却没接上 ⇒ 永远 false，指板再也不显示）
    expect(OVERLAY).toContain('pickTabFretboardFlag')
  })

  it('page.tsx 的 ↑/↓ 键不再自带 tab→setter 的 if/else 链', () => {
    // 特征物：`activeTab === 'xxx') { setShowXxxFretboard(true` / `(false`
    expect(PAGE).not.toMatch(
      /activeTab\s*===\s*['"][a-z_]+['"]\s*\)\s*\{\s*\n?\s*setShow[A-Za-z]*Fretboard\((?:true|false)\)/,
    )
    expect(PAGE).toContain('setTabFretboardFlag(activeTab, false)')
  })

  it('setter 对照表由真相源的类型钉住（新增 tab 漏 setter ⇒ tsc 报错）', () => {
    // Record<TabFretboardFlag, …> 出现 ⇒ 键集与真相源同步
    expect(PAGE).toMatch(/Record<TabFretboardFlag\s*,/)
    // 5 个 setter 全在表里（逐个点名，缺一个就红）
    for (const tab of PRACTICE_TABS) {
      expect(PAGE, `${tab} 的 setter 不在对照表里`).toContain(`${TAB_FRETBOARD_FLAG[tab]}: set`)
    }
  })
})
