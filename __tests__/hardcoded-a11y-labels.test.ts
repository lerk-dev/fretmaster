/**
 * 护栏：`aria-label` / `title` / `alt` / `placeholder` 不得使用「字面量中文」
 *
 * 背景：2026-09-26 在本项目里**连续发现 6 处**同类缺陷 —— 界面文案都走了 `t()`，
 * 只有无障碍标签漏了，导致切到英文后视觉全英文、**屏幕阅读器仍念中文**：
 *
 *   components/tuner-sheet.tsx            主显示区 aria-label（含插值）
 *   components/chord-structure-window.tsx 关闭按钮 aria-label
 *   app/page.tsx                          音阶结构 / 和弦练习结构 的关闭按钮 aria-label
 *   components/app-header.tsx             得分 / 剩余时间 aria-label（含插值）
 *
 * 2026-09-28 又发现**护栏本身有洞**：原正则只匹配 `attr="字面量"`，
 * 匹配不到 `attr={...}` 这种 JSX 表达式 —— 于是 4 处「模板字符串里硬编码中文」
 * 一直漏网（英文界面上读屏仍念中文）：
 *
 *   components/fullscreen-overlay.tsx:325,346   `${note} ${n}弦 0品`
 *   components/practice-fretboard.tsx:127,227   同上
 *
 * 现在按三条规则扫（另有「护栏自测」防同类洞再现）：
 *   A. 模板字符串（反引号）里含中文 → 缺陷（插值标签应走 t()）
 *   B. 表达式含中文字面量，且既无 t()、也无「三元 + 非中文分支」→ 缺陷
 *      （`zh ? '最小化' : 'Minimize'` 是允许的：它确实输出英文）
 *   C. `t('k') || '中文'` → 假兜底。本仓 t() 缺键返回「键名本身」（真值），兜底永不生效。
 *
 * 允许的写法：
 *   - `aria-label={t('some_key')}`（推荐）
 *   - 插值走 t()：`aria-label={t('k').replace('{n}', String(n))}`
 *   - 语言分支：`title={zh ? '最小化' : 'Minimize'}`
 *   - `components/ui/**`（shadcn 脚手架、零消费者）不在扫描范围
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..')
const CJK = /[\u4e00-\u9fff]/
/** 扫描的源码根目录 */
const SCAN_DIRS = ['app', 'components']
/** 跳过：shadcn 脚手架（零消费者）与测试自身 */
const SKIP_DIR_PATTERNS = [/(^|[\\/])node_modules([\\/]|$)/, /(^|[\\/])components[\\/]ui([\\/]|$)/]

const ATTR = '(?:aria-label|title|alt|placeholder)'
/** 规则 0：`attr="字面量"` / `attr='字面量'` */
const LITERAL_ATTR = new RegExp(`\\b${ATTR}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g')
/** 规则 A/B 的入口：`attr={ ... }`（表达式由括号配对取出，支持多行） */
const EXPR_ATTR = new RegExp(`\\b${ATTR}\\s*=\\s*\\{`, 'g')
/** 规则 C：`t('k') || '中文'` */
const DEAD_FALLBACK = /\bt\([^)]*\)\s*\|\|\s*(['"])([^'"]*)\1/g

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (SKIP_DIR_PATTERNS.some((re) => re.test(relative(ROOT, full)))) continue
    const st = statSync(full)
    if (st.isDirectory()) collectTsx(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** 从 `{` 起做括号配对，取回整段表达式（支持跨行；模板/字符串里的 { } 一般成对，净影响为 0） */
function extractExpr(lines: string[], startLine: number, braceCol: number): string {
  let depth = 0
  let expr = ''
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    for (let j = i === startLine ? braceCol : 0; j < line.length; j++) {
      const ch = line[j]
      if (ch === '{') {
        depth++
        if (depth === 1) continue // 跳过最外层 {
      } else if (ch === '}') {
        depth--
        if (depth === 0) return expr // 命中收尾 }
      }
      expr += ch
    }
    expr += '\n'
  }
  return expr
}

/** 判定一段表达式是否违规；返回违规说明或 null */
function exprViolation(expr: string): string | null {
  if (!CJK.test(expr)) return null
  if (expr.includes('`')) return '模板字符串里含中文（应改走 t()）'
  const hasT = /\bt\(/.test(expr)
  const hasTernary = expr.includes('?')
  const hasAsciiAlt = [...expr.matchAll(/(['"])([^'"]*)\1/g)].some((q) => !CJK.test(q[2]))
  if (hasT) return null // 交给规则 C 单独判定假兜底
  if (hasTernary && hasAsciiAlt) return null // 语言分支，会输出英文
  return '表达式含中文，且既无 t()、也无「三元 + 非中文分支」'
}

function findOffenders(lines: string[], label: string): string[] {
  const out: string[] = []
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(LITERAL_ATTR)) {
      const v = m[1] ?? m[2] ?? ''
      if (CJK.test(v)) out.push(`${label}:${idx + 1}  ${line.trim()}  ← 字面量 "${v}"`)
    }
    for (const m of line.matchAll(EXPR_ATTR)) {
      const braceCol = m.index + m[0].length - 1
      const why = exprViolation(extractExpr(lines, idx, braceCol))
      if (why) out.push(`${label}:${idx + 1}  ${line.trim()}  ← ${why}`)
    }
    for (const m of line.matchAll(DEAD_FALLBACK)) {
      if (CJK.test(m[2])) out.push(`${label}:${idx + 1}  ${line.trim()}  ← 假兜底 t(...) || "${m[2]}"`)
    }
  })
  return out
}

describe('护栏：无障碍标签不得字面量中文', () => {
  const files = SCAN_DIRS.flatMap((d) => collectTsx(join(ROOT, d)))

  it('扫描范围非空（防「路径写错导致空扫描、断言变成空跑」）', () => {
    expect(files.length).toBeGreaterThan(30)
    expect(files.some((f) => f.endsWith(join('app', 'page.tsx')))).toBe(true)
    expect(files.some((f) => f.endsWith(join('components', 'app-header.tsx')))).toBe(true)
  })

  it('app/ 与 components/（不含 ui 脚手架）里没有字面量中文的无障碍标签', () => {
    const offenders = files.flatMap((file) =>
      findOffenders(readFileSync(file, 'utf8').split(/\r?\n/), relative(ROOT, file).replace(/\\/g, '/')),
    )
    expect(offenders, `\n发现字面量中文标签（应改走 t()）：\n${offenders.join('\n')}`).toEqual([])
  })

  it('2026-09-26 修掉的 6 处已改为 t()（回归即失败）', () => {
    const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
    expect(read('components/tuner-sheet.tsx')).toContain("t('tuner_detected_label')")
    expect(read('components/tuner-sheet.tsx')).toContain("t('tuner_no_pitch_label')")
    expect(read('components/chord-structure-window.tsx')).toContain("t('chord_structure_close_label')")
    expect(read('app/page.tsx')).toContain("t('scale_structure_close_label')")
    expect(read('app/page.tsx')).toContain("t('chord_exercise_structure_close_label')")
    expect(read('components/app-header.tsx')).toContain("t('score_aria_label')")
    expect(read('components/app-header.tsx')).toContain("t('time_left_aria_label')")
  })

  it('2026-09-28 修掉的 4 处指板标签已走 t()（回归即失败）', () => {
    const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
    // 🚨 2026-10-01 口径变更：全屏那份内联指板副本已删除（指板标记唯一真相源 =
    // `components/practice-fretboard.tsx`）⇒ 全屏**不再自己拼** `fretboard_position_label`。
    // 这条原先把 fullscreen-overlay 列进「必须含 t('fretboard_position_label')」，
    // 属于**钉住旧行为的断言**（去重后必红，是中间态不是回归）。
    // 改为：① 持有者名单换成当前真正的持有者；② 全屏改为断言**委托**。
    const OWNERS = [
      'components/practice-fretboard.tsx',
      'components/guitarrun-fretboard.tsx',
      'components/theory-panel.tsx',
    ]
    for (const rel of OWNERS) {
      expect(read(rel), `${rel} 未使用 fretboard_position_label`).toContain("t('fretboard_position_label')")
    }
    expect(read('components/fullscreen-overlay.tsx'), '全屏必须委托共享组件拼标签').toContain('<PracticeFretboard')
    for (const rel of ['components/fullscreen-overlay.tsx', 'components/practice-fretboard.tsx']) {
      // 这两个文件的 aria-label 表达式里不得再出现中文
      expect(findOffenders(read(rel).split(/\r?\n/), rel)).toEqual([])
    }
    // 假兜底已删除
    expect(read('app/page.tsx')).not.toContain("t('chord_structure_drag_hint') ||")
    expect(read('app/page.tsx')).toContain("aria-label={t('chord_structure_drag_hint')}")
  })

  it('2026-09-28 去重的译文：走 i18n 键而非内联中英文三元（回归即失败）', () => {
    // title-bar：`title_*` 键在表里**早已存在**，却内联了同义的 `zh ? '最小化' : 'Minimize'`
    // ⇒ 译文被复制了一份，改 i18n 表不会同步（漂移隐患）。
    // song-selector-dialog：底部「歌曲编辑器」原本是 `language === 'zh-CN' ? '自定义歌曲编辑器' : 'Song Editor'`。
    // 注意：内联三元与 i18n 键的**输出完全相同**，行为测试咬不住 ⇒ 只能用源码断言钉住。
    const tb = readFileSync(join(ROOT, 'components/title-bar.tsx'), 'utf8')
    for (const k of ['title_minimize', 'title_maximize', 'title_restore', 'title_close']) {
      expect(tb, `title-bar 未使用 t('${k}')`).toContain(`t('${k}')`)
    }
    for (const literal of ["'最小化'", "'最大化'", "'还原'", "'关闭'"]) {
      expect(tb, `title-bar 仍有内联译文 ${literal}`).not.toContain(literal)
    }

    const ssd = readFileSync(join(ROOT, 'components/song-selector-dialog.tsx'), 'utf8')
    expect(ssd, "song-selector-dialog 未使用 t('song_editor_title')").toContain("t('song_editor_title')")
    expect(ssd, 'song-selector-dialog 仍有内联译文').not.toContain("'自定义歌曲编辑器'")
  })
})

describe('护栏自测（防止护栏自己出现同类漏洞）', () => {
  const flag = (lines: string[]) => findOffenders(lines, 'x').length > 0

  const cases: Array<[string, string, boolean]> = [
    ['字面量引号', '<button aria-label="关闭" />', true],
    ['表达式里的中文引号串', `<button aria-label={'关闭'} />`, true],
    ['模板字符串含中文', '<button aria-label={`第${i}品`} />', true],
    ['语言三元（合法）', `<button aria-label={zh ? '关闭' : 'Close'} />`, false],
    ['t() 调用（合法）', `<button aria-label={t('close_label')} />`, false],
    ['假兜底', `<button aria-label={t('x') || '关闭'} />`, true],
    ['嵌套语言三元（合法）', `<div title={isMax ? (zh ? '还原' : 'Restore') : (zh ? '最大化' : 'Maximize')} />`, false],
    ['中文三元但另一支也是中文', `<div title={zh ? '还原' : '还原'} />`, true],
    ['英文标签不受影响', '<button aria-label="Close" />', false],
  ]

  it.each(cases)('%s', (_name, line, shouldFlag) => {
    expect(flag([line]), line).toBe(shouldFlag)
  })

  it('多行表达式同样能检测（tuner-sheet 那种换行写法）', () => {
    const good = [
      '  aria-label={',
      "    isPlaying && note ? t('tuner_detected_label').replace('{note}', note) : t('tuner_no_pitch_label')",
      '  }',
    ]
    expect(flag(good)).toBe(false)

    const bad = ['  aria-label={', '    isPlaying ? `第${i}品` : undefined', '  }']
    expect(flag(bad)).toBe(true)

    const badLiteral = ['  title={', "    zh ? '还原' : '还原'", '  }']
    expect(flag(badLiteral)).toBe(true)
  })
})
