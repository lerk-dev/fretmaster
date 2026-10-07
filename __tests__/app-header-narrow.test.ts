/**
 * 顶栏在窄屏不被「挤出屏幕」（2026-10-01）。
 *
 * 症状（无头 Chrome + CDP 实测，360px 视口，**练习中**）：
 *   顶栏内可用宽 = 360 - container `px-4`（两侧 16px）= 328px
 *   左标题块 136px（logo 36 + gap 12 + 标题 88）+ 右组 250px（得分/计时/三个按钮）= 386px
 *   ⇒ 设置按钮落在 x=370→402，**超出父级可用宽 42px**，被裁掉 ⇒ 练习中根本点不到设置。
 *
 * 为什么只能是**源码护栏**：jsdom 没有布局引擎 —— `getBoundingClientRect()` 恒 0、
 * `scrollWidth === clientWidth === 0`，一切「宽度/溢出/裁切」断言在单测里必然空转。
 * 所以这里解析 `components/app-header.tsx` 里的**真实 class token**（收缩机制的唯一实现），
 * 并把真机实测数字记为常量做缝隙证明，而不是去 `toContain('min-w-0')` 了事。
 *
 * ⚠️ 锚点找不到时必须**当场失败**（返回 null ⇒ 断言红），否则改了结构会静默空转。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SRC = readFileSync('components/app-header.tsx', 'utf8')


/** 取 `anchor` **之前**最近的一个 `className="…"` —— 用来拿到「包住锚点的那个 div」的类名 */
function classBefore(anchor: string): string | null {
  const at = SRC.indexOf(anchor)
  if (at < 0) return null
  const m = [...SRC.slice(0, at).matchAll(/className="([^"]*)"/g)].pop()
  return m ? m[1] : null
}

/**
 * 返回「顶栏缺少窄屏收缩机制」的违规描述；空数组 = 干净。
 * 抽成函数是为了给它写自测 —— 把**修前**的原文喂进去必须逐条报出来，
 * 否则这些断言可能只是恒真（本仓踩过护栏恒真的坑）。
 */
function headerNarrowDefects(src: string): string[] {
  const bad: string[] = []
  const before = (anchor: string): string | null => {
    const at = src.indexOf(anchor)
    if (at < 0) return null
    const m = [...src.slice(0, at).matchAll(/className="([^"]*)"/g)].pop()
    return m ? m[1] : null
  }
  const toks = (s: string | null) => (s ?? '').split(/\s+/).filter(Boolean)

  // ① 左组块必须能收缩（`min-w-0`）—— 否则它按内容宽顶开，把右侧控件挤出去
  if (!toks(before('w-9 h-9 rounded-lg')).includes('min-w-0')) bad.push('左组块缺 `min-w-0`')
  // ② 标题容器也要能收缩（flex 子项默认 `min-width:auto`）
  if (!toks(before('<h1 className="text-base')).includes('min-w-0')) bad.push('标题容器缺 `min-w-0`')
  // ③ 标题文字要能截断，否则收缩时溢出
  if (!toks(src.match(/<h1 className="([^"]*)">/)?.[1] ?? null).includes('truncate')) bad.push('h1 缺 `truncate`')
  if (!toks(src.match(/<p className="([^"]*)"\>\{t\('app_title'\)/)?.[1] ?? null).includes('truncate')) bad.push('副标题缺 `truncate`')
  // ④ 右侧控件组窄屏要收紧间距（桌面 12px → 窄屏 6px，省出 24px 给设置按钮）
  if (!toks(before('Score display')).includes('gap-1.5')) bad.push('右组窄屏未收紧 `gap-1.5`')
  // ⑤ logo 不能跟着缩（缩了图标会变形）
  if (!toks(before('h-5 w-5 text-primary')).includes('shrink-0')) bad.push('logo 缺 `shrink-0`')
  return bad
}

// 真机（无头 Chrome + CDP）在 360px 视口练习中的实测值
const VIEWPORT = 360
const HEADER_PAD_X = 32 // container `px-4` 两侧
const USABLE = VIEWPORT - HEADER_PAD_X // 328
const LEFT_OLD = 136 // 修前：标题块按内容宽撑开
const RIGHT = 250 // 练习中：得分 + 计时 + 三个按钮
const SETTINGS_X_OLD = 370 // 修前：设置按钮左边缘（实测）

describe('源码护栏：顶栏有窄屏收缩机制（2026-10-01）', () => {
  it('当前顶栏不该有任何违规', () => {
    expect(headerNarrowDefects(SRC), '顶栏缺窄屏收缩机制').toEqual([])
  })

  it('缝隙证明：修前结构在 360px 真的放不下（且锚点没落空）', () => {
    // 探针自检：五个锚点都必须能在源码里找到，否则下面的断言是空转
    for (const a of ['w-9 h-9 rounded-lg', '<h1 className="text-base', 'Score display', 'h-5 w-5 text-primary']) {
      expect(SRC.includes(a), `锚点「${a}」找不到 ⇒ 护栏空转`).toBe(true)
    }
    expect(classBefore('<h1 className="text-base'), '标题容器的 className 解析失败').not.toBeNull()

    // 修前：左块不可收缩 ⇒ 按内容宽 136 撑开，加上右组 250，共 386 > 可用宽 328
    expect(LEFT_OLD + RIGHT, '修前总宽超出可用宽').toBeGreaterThan(USABLE)
    expect(LEFT_OLD + RIGHT - USABLE, '超出 58px').toBe(58)
    // 设置按钮落在可用宽之外 ⇒ 被裁
    expect(SETTINGS_X_OLD, '设置按钮右移出屏').toBeGreaterThan(USABLE)
    // 修后：左块可收缩，最坏情况被压到 0 ⇒ 右组 250 ≤ 328，一定放得下
    expect(RIGHT, '右组本身在可用宽内').toBeLessThanOrEqual(USABLE)
  })

  it('护栏自测：把**修前**原文喂进去必须逐条报出来（否则上面那条是恒真）', () => {
    const oldSrc = `
      <header className="border-b border-border/50 bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Guitar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">FretMaster</h1>
              <p className="text-[10px] text-muted-foreground">{t('app_title')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Score display */}
          </div>
        </div>
      </header>`
    const defects = headerNarrowDefects(oldSrc)
    expect(defects.length, '六个特征物都要被报出来').toBe(6)
    const joined = defects.join(' / ')
    for (const k of ['左组块缺', '标题容器缺', 'h1 缺', '副标题缺', '右组窄屏未收紧', 'logo 缺']) {
      expect(joined).toContain(k)
    }
  })

  it('护栏自测：类名判定按 token 精确匹配，近似值蒙混不过去', () => {
    // 全是「差一点」的类名：`min-w-0x` / `not-truncate` / `gap-1.55` / `not-shrink-0`
    // 若改用 `String.includes` 子串匹配，`min-w-0x`.includes('min-w-0') === true ⇒ 这些全会漏报。
    const nearMiss = `
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center not-shrink-0">
          <Guitar className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0x">
          <h1 className="text-base not-truncate">FretMaster</h1>
          <p className="text-[10px] not-truncate">{t('app_title')}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.55">
        {/* Score display */}
      </div>`
    const d = headerNarrowDefects(nearMiss)
    expect(d.length, '六个特征物一个都不能被近似值蒙混').toBe(6)
    expect(d.join(' / '), '`gap-1.55` 不等于 `gap-1.5`').toContain('右组窄屏未收紧')
    expect(d.join(' / '), '`not-shrink-0` 不等于 `shrink-0`').toContain('logo 缺')
  })
})
