/**
 * 第三套指板皮肤（MyFretboardTrainer 风格）的**接线**护栏 —— 源码级。
 *
 * 为什么单开一个文件：本功能把一个**两值枚举**扩成了三值
 * （`FretboardStyle = 'classic' | 'guitarrun' | 'trainer'`），而这类改动最典型的故障形态是
 * 「**改了类型、漏改某个消费点**」—— 编译器不会红（`=== 'guitarrun'` 依然合法），
 * 表现是「选了 3D 琴颈风格还是老皮肤」或「全屏里没跟上」，全都是**静默**的。
 *
 * 这里钉住的东西：
 *  ① 枚举恰好三值，且设置面板三选一齐全（少一个 ⇒ 该值永远选不到）；
 *  ② 🚨 **选渲染器的判据必须是 `!== 'classic'`**，不许出现 `=== 'guitarrun'`
 *     —— 后者会把 trainer 静默落回经典皮肤。两个消费点（主区域 / 全屏）都要有；
 *  ③ 两个消费点都必须把 `skin` 透传下去，且「有 skin」的文件集合 === 「有 `!== classic`」的集合
 *     （用集合相等而不是逐个文件名，这样将来新增消费点漏了就红）；
 *  ④ 角色判定只调用**一次**（两套皮肤共用一份结果，铁律：同一「量」不许两份判定逻辑）；
 *  ⑤ `TRAINER_ROLE` 必须覆盖 `FretCellRole` 的**每一个**成员（漏一个 ⇒ 该角色在第三套皮肤下
 *     `data-role` 变成 `undefined` → 没有配色 → 圆点静默隐形）；
 *  ⑥ 乐理面板「整幅」的接线：`fretMarkers` 必须由 page 传入（不自己再写一份品记表）、
 *     整幅时隐藏外层的「分图」性质按钮（否则同一区块出现两组互不同步的按钮）；
 *  ⑦ 源码里出现的 `trainer_*` / 新键必须**两种语言都有**（缺键时 `t()` 返回键名本身，不报错）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TRAINER_ROLE } from '@/components/guitarrun-fretboard'
import { TRANSLATIONS } from '@/lib/i18n'

const ROOT = process.cwd()

/** 读源码并把 CRLF 归一（Write 工具产出 CRLF，不做归一多行锚点会匹配不上）。 */
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
}

/** 剥掉 `/* *\/`、`//`、`{/* *\/}` 三种注释（本仓注释里大量出现「不要写 xx」）。 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 递归收集 app/ components/ hooks/ lib/ 下的源码文件（跳过测试目录）。 */
function sources(): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue
        walk(child)
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(child)
      }
    }
  }
  for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir)
  return out
}

/** 取 JSX 里某个自闭合组件的属性块（从 `<Name` 到下一个 `/>`）。 */
function jsxAttrs(src: string, name: string): string {
  const at = src.indexOf(`<${name}`)
  expect(at, `源码里找不到 <${name}>（组件被改名/搬走了？）`).toBeGreaterThanOrEqual(0)
  const end = src.indexOf('/>', at)
  expect(end, `<${name}> 不是自闭合标签？`).toBeGreaterThan(at)
  return src.slice(at, end)
}

const ALL_SOURCES = sources()
const SOURCE_TEXT: Record<string, string> = Object.fromEntries(ALL_SOURCES.map((f) => [f, read(f)]))

describe('FretboardStyle 枚举：三值必须处处同步', () => {
  it("lib/store.ts 的联合类型恰好是 'classic' | 'guitarrun' | 'trainer'", () => {
    const m = /export type FretboardStyle = ([^\n]+)/.exec(SOURCE_TEXT['lib/store.ts'])
    expect(m, 'lib/store.ts 里找不到 FretboardStyle').not.toBeNull()
    const values = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(values).toEqual(['classic', 'guitarrun', 'trainer'])
  })

  it('设置面板三个选项齐全，且第三个回传 trainer', () => {
    const src = stripComments(SOURCE_TEXT['components/settings-display-section.tsx'])
    for (const v of ['classic', 'guitarrun', 'trainer']) {
      expect(src, `设置面板缺 ${v} 的选中判据`).toContain(`fretboardStyle === '${v}'`)
      expect(src, `设置面板缺 ${v} 的 aria-pressed`).toContain(`aria-pressed={fretboardStyle === '${v}'}`)
    }
    expect(src, '缺少回传 trainer 的回调').toContain("onFretboardStyleChange('trainer')")
  })

  it('🚨 不许出现 `fretboardStyle === \'guitarrun\'` 作为**选渲染器**的判据', () => {
    // 这类判据会把 trainer 静默落回经典皮肤（编译器不会红）。
    // 唯一的合法写法是 `!== 'classic'`。
    // 例外：设置面板里的「选中态高亮」本来就要逐值比较，故排除该文件。
    const offenders = ALL_SOURCES.filter((f) => f !== 'components/settings-display-section.tsx').filter(
      (f) => /fretboardStyle\s*===\s*'guitarrun'/.test(stripComments(SOURCE_TEXT[f])),
    )
    expect(offenders, '这两个文件把 trainer 漏掉了').toEqual([])
  })

  it('两个消费点（主区域 / 全屏）都用 `!== \'classic\'` 选皮肤，且各只有一处', () => {
    for (const f of ['app/page.tsx', 'components/fullscreen-overlay.tsx']) {
      const src = stripComments(SOURCE_TEXT[f])
      const hits = [...src.matchAll(/fretboardStyle !== 'classic'/g)]
      expect({ file: f, hits: hits.length }).toEqual({ file: f, hits: 1 })
    }
  })

  it('🚨 「有 skin 透传」的文件集合 === 「有 `!== classic`」的文件集合（新增消费点漏了会红）', () => {
    const skin = ALL_SOURCES.filter((f) => /\bskin=\{/.test(stripComments(SOURCE_TEXT[f])))
    const choose = ALL_SOURCES.filter((f) => /fretboardStyle !== 'classic'/.test(stripComments(SOURCE_TEXT[f])))
    expect(skin.sort()).toEqual(choose.sort())
    expect(skin.sort()).toEqual(['app/page.tsx', 'components/fullscreen-overlay.tsx'])
  })

  it('skin 的取值只有 trainer / guitarrun 两种，且判据是 `=== \'trainer\'`', () => {
    for (const f of ['app/page.tsx', 'components/fullscreen-overlay.tsx']) {
      const src = stripComments(SOURCE_TEXT[f])
      expect(src, `${f} 的 skin 三元写错了`).toContain(
        "skin={user.fretboardStyle === 'trainer' ? 'trainer' : 'guitarrun'}",
      )
    }
  })
})

describe('🚨 角色判定只跑一次（两套皮肤共用一份结果）', () => {
  /** 数**调用点**：带括号的匹配（import 那行是 `resolveFretCellRole,`，不带括号，不计入） */
  const callSites = (src: string) => [...src.matchAll(/resolveFretCellRole\s*\(/g)].length

  it('guitarrun-fretboard.tsx 里 resolveFretCellRole 只有一个调用点', () => {
    const src = stripComments(SOURCE_TEXT['components/guitarrun-fretboard.tsx'])
    expect(callSites(src), '角色判定被复制成了两份（两套皮肤会悄悄分叉）').toBe(1)
    // 正向对照：import 确实在（否则 0 个调用点是「压根没接线」而不是「只有一个」）
    expect(src).toMatch(/^\s*resolveFretCellRole,\s*$/m)
  })

  it('反向对照：把判定复制成两份的写法必须被判出来（证明上面的计数不是恒为 1）', () => {
    const legacy = `
      const a = strings.map((_, s) => resolveFretCellRole(ctx, s, 0))
      const b = strings.map((_, s) => resolveFretCellRole(ctx, s, 1))
    `
    expect(callSites(legacy)).toBe(2)
    expect(callSites('const x = resolveFretCellRole(ctx, 0, 0)')).toBe(1)
  })

  it('skin=trainer 分支消费的是同一个 rows 结果，而不是自己再判一次', () => {
    const src = stripComments(SOURCE_TEXT['components/guitarrun-fretboard.tsx'])
    expect(src).toContain("if (skin === 'trainer')")
    // trainer 分支里必须从 rows 取角色
    const branch = src.slice(src.indexOf("if (skin === 'trainer')"))
    expect(branch).toContain('rows[stringIndex][fret]')
  })
})

describe('TRAINER_ROLE 必须覆盖 FretCellRole 的每一个成员', () => {
  /** 从 lib/fretboard-cell-role.ts 的联合类型里解析出成员（**从被契约方解析**，不手抄一份） */
  function declaredRoles(): string[] {
    const src = stripComments(read('lib/fretboard-cell-role.ts'))
    const m = /export type FretCellRole =([\s\S]*?)\n\n/.exec(src)
    expect(m, 'lib/fretboard-cell-role.ts 里找不到 FretCellRole 联合类型').not.toBeNull()
    return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }

  it('每个成员都有映射（漏一个 ⇒ data-role=undefined ⇒ 圆点没有配色，静默隐形）', () => {
    const missing = declaredRoles().filter((r) => !(r in TRAINER_ROLE))
    expect(missing, `漏映射的角色：${missing.join(', ')}`).toEqual([])
  })

  it('反向：不许映射多余的角色名（打错字会被这条抓住）', () => {
    const declared = new Set(declaredRoles())
    const extra = Object.keys(TRAINER_ROLE).filter((k) => !declared.has(k))
    expect(extra, `多余/拼错的角色：${extra.join(', ')}`).toEqual([])
  })

  it("'none' 映射成空 data-role（无语义 ⇒ 不该上色）", () => {
    expect(TRAINER_ROLE.none).toBe('')
  })
})

describe('乐理面板「整幅」的接线', () => {
  const theory = stripComments(SOURCE_TEXT['components/theory-panel.tsx'])

  it('TheoryPanelProps 增加 fretMarkers: number[]，并解构出来', () => {
    const propsBlock = theory.slice(
      theory.indexOf('interface TheoryPanelProps'),
      theory.indexOf('}', theory.indexOf('interface TheoryPanelProps')),
    )
    expect(propsBlock).toMatch(/fretMarkers:\s*number\[\]/)
    expect(theory).toMatch(/export function TheoryPanel\(\{[^}]*fretMarkers[^}]*\}/)
  })

  it('cagedView 状态默认 split，两值互斥', () => {
    expect(theory).toContain("useState<'split' | 'merged'>('split')")
  })

  it('🚨 整幅时隐藏外层性质组（避免同区块两组互不同步的按钮）', () => {
    expect(theory).toContain("{cagedView === 'split' && (")
    // 外层那组按钮走的是 theory_quality_major / minor；整幅里 CagedBoard 自带一组
    const splitGuardAt = theory.indexOf("{cagedView === 'split' && (")
    const nextClose = theory.indexOf('cagedShapes.length === 0', splitGuardAt)
    const block = theory.slice(splitGuardAt, nextClose > 0 ? nextClose : splitGuardAt + 2000)
    expect(block, '外层性质组没被 cagedView 包住').toContain('theory_quality_major')
  })

  it('提示文案随样式切换（分图 / 整幅两套说明）', () => {
    expect(theory).toMatch(/cagedView === 'split' \? t\('theory_caged_hint'\) : t\('trainer_hint'\)/)
  })

  it('CagedBoard 拿到的属性齐全（受控 quality / 同源 fretMarkers / 根音跟随 posRoot）', () => {
    const attrs = jsxAttrs(theory, 'CagedBoard')
    for (const [name, pattern] of [
      ['t', /t=\{t\}/],
      ['language', /language=\{language\}/],
      ['config', /config=\{config\}/],
      ['fretCount', /fretCount=\{fretCount\}/],
      ['fretMarkers', /fretMarkers=\{fretMarkers\}/],
      ['openLabel', /openLabel=\{t\('theory_open_string'\)\}/],
      ['defaultRoot', /defaultRoot=\{NOTES\[posRoot\]\}/],
      ['quality（受控）', /quality=\{cagedQuality\}/],
      ['onQualityChange（受控）', /onQualityChange=\{setCagedQuality\}/],
      ['preferFlat', /preferFlat=\{modesPreferFlat\}/],
    ] as const) {
      expect(attrs, `CagedBoard 缺属性 ${name}`).toMatch(pattern)
    }
  })

  it('app/page.tsx 把 FRET_MARKERS 传给 TheoryPanel（品记表不复制第二份）', () => {
    const page = stripComments(SOURCE_TEXT['app/page.tsx'])
    const attrs = jsxAttrs(page, 'TheoryPanel')
    expect(attrs).toMatch(/fretMarkers=\{FRET_MARKERS\}/)
  })

  it('整幅浏览器在非六弦下走原来的「不支持」文案（不渲染 CagedBoard）', () => {
    expect(theory).toMatch(/isStandardSixStringGuitar\(config\)[\s\S]{0,120}cagedView === 'merged'/)
  })
})

describe('整幅浏览器的 i18n 用法（铁律：缺键时 t() 返回键名本身）', () => {
  const src = stripComments(SOURCE_TEXT['components/caged-board.tsx'])
  const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
  const en = TRANSLATIONS['en'] as Record<string, string>

  it("用 translateOr 而不是 `t(k) || fb`（后者的兜底永远不会命中）", () => {
    expect(src).toContain('translateOr')
    expect(src, '又出现了 t(k) || fb 式的假兜底').not.toMatch(/t\('[^']+'\)\s*\|\|/)
  })

  it('源码里写死的每个 trainer_* 键在两种语言里都存在', () => {
    const keys = new Set([
      ...[...src.matchAll(/'((?:trainer)_[a-z_]+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/key = quality === 'major' \? '([^']+)' : '([^']+)'/g)].flatMap((m) => [
        m[1],
        m[2],
      ]),
    ])
    expect(keys.size, '一个键都没扫到？').toBeGreaterThan(5)
    const missingZh = [...keys].filter((k) => !(k in zh))
    const missingEn = [...keys].filter((k) => !(k in en))
    expect({ missingZh, missingEn }).toEqual({ missingZh: [], missingEn: [] })
  })

  it('六个档的标签键都存在（含大调/小调音阶两个变体）', () => {
    const needed = [
      'trainer_mode_caged',
      'trainer_mode_arpeggio',
      'trainer_mode_arp7',
      'trainer_mode_pentatonic',
      'trainer_mode_blues',
      'trainer_mode_scale_major',
      'trainer_mode_scale_minor',
    ]
    for (const k of needed) {
      expect({ k, zh: k in zh, en: k in en }).toEqual({ k, zh: true, en: true })
    }
  })

  it('theory-panel 用到的新键（trainer_view_* / trainer_hint）两语言都有', () => {
    for (const k of ['trainer_hint', 'trainer_view_split', 'trainer_view_merged']) {
      expect({ k, zh: k in zh, en: k in en }).toEqual({ k, zh: true, en: true })
    }
  })
})
