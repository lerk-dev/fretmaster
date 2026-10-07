/**
 * 指板**字体**的契约护栏（两套皮肤 + 显示缩放）。
 *
 * ## 为什么需要它
 *
 * 2026-10-03 排查「指板上的品数 / 音名 / 音程名到底是什么字体」时发现三处分叉，
 * 都是**不报错、只是看着不对**的类型（跟配色、音量一样，是「哑巴 bug」）：
 *
 * 1. **两套皮肤两条栈**：经典皮肤 1..n 品用继承来的 `ui-sans-serif`（Windows = Segoe UI），
 *    空弦格却挂着 `font-mono`；GuitarRun 皮肤用 `ui-monospace, 'IBM Plex Mono', monospace`。
 *    同一个音名换个皮肤、甚至在同一块指板上换一格就变字形。
 * 2. **♯/♭ 没有人兜底**：指板的变音号由 `formatDegree()` 产出，而两套栈里都没有符号字体
 *    （`font-mono` 那条尾巴是泛型 monospace）—— 经典皮肤靠继承 sans 栈里的
 *    'Segoe UI Symbol' 侥幸能看，GuitarRun 则看浏览器心情。
 * 3. **GuitarRun 皮肤的字号写死 px**（10/9/11/7px）⇒ 「显示缩放」只改 `html` 根字号
 *    （lib/display-scale.ts 的方案 3），对 px 无效 ⇒ 调缩放时经典皮肤的字变大、
 *    GuitarRun 纹丝不动。
 *
 * ## 本文件钉住的不变量
 *
 * · `--font-fretboard`（`app/globals.css` 的 `:root`）是**唯一**字体栈真相源；
 *   Tailwind 的 `font-fretboard` 工具类只指向它，不复制字面量。
 * · 族的**顺序有语义**：等宽打头（数字/拉丁）→ 符号（♯/♭）→ CJK（「空弦」）→ 泛型。
 *   尤其 **符号层必须在等宽层之后** —— `'Noto Music'` 的 latin 子集覆盖 U+0000-00FF
 *   （含数字与 A-G），提到前面会把品数/音名整体换成乐谱字形。
 * · 两套皮肤（经典三处文字、GuitarRun 的 `.gr-note-dot` / `.gr-fret-numbers`）都引用该变量。
 * · GuitarRun 的**字号与其容器**必须是 rem，且**数值与迁移前的 px 等值**（÷16）——
 *   只把字体类改掉、字号留 px，等于没修。
 *
 * ## 写法约定（避免本仓踩过两次的假通过）
 *
 * · 断言全部落在**具体值/具体语句**上（星号数、rem↔px 对表、族的下标关系），
 *   不用 `length >= N`、不用 `toContain('ui-monospace')` 这类改名还能过的形态（铁律 20）。
 * · 每条规则先剥注释再判定 —— 本仓源码注释里大量出现「不要写 xx」，
 *   不剥注释的护栏会把说明文字当成违规（display-scale.test.ts 头部记过这个坑）。
 * · 规则体提取按「规则起始位置」匹配，避免 `indexOf('.gr-fret-number')` 命中 `.gr-fret-numbers`，
 *   以及命中 `.gr-cell--open .gr-note-dot` 这类后代选择器。
 * · 纯函数助手（`orderViolations` / `pxFontSizes` / `fontFamilies`）**同时**被正向断言与
 *   「反向对照」用例使用 —— 后者证明助手真的有能力判红，而不是恒真。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
/** rem 的解析基准（与 lib/display-scale.ts 的 ROOT_FONT_SIZE_BASE 同源口径）。 */
const ROOT_PX = 16

/** 读源码并把 CRLF 归一（Write 工具产出 CRLF，不做归一多行锚点会匹配不上）。 */
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
}

/** 剥掉 `/* *\/`、`//`、`{/* *\/}` 三种注释。 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * 取某选择器的规则体。
 *
 * ⚠️ 锚点必须是**规则起始处**（行首或紧跟在 `}` 之后）：否则
 * `ruleBody(css, '.gr-note-dot')` 会命中 `.gr-cell--open .gr-note-dot` 的后半段，
 * 而 `ruleBody(css, '.gr-fret-number')` 会命中 `.gr-fret-numbers`。
 */
function ruleBody(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{`, 'm').exec(css)
  expect(m, `globals.css 里找不到规则 ${selector}（选择器改名了？）`).not.toBeNull()
  const start = m!.index + m![0].length
  return css.slice(start, css.indexOf('}', start))
}

/**
 * 取某个**顶层分区**：从 anchor 起，到下一个分区分隔注释（行首 `/* =====`）为止；
 * 该 anchor 之后若再无分隔注释，则取到文件尾。
 *
 * ⚠️ 这里踩过一次坑：初版直接 `css.slice(at)` 切到文件尾，并把「`.gr-` 就是最后一段」
 * 当默认 —— 2026-10-03 在文件尾追加第三套皮肤（`.ft-*`）后，那 5 条 `font-family` 与一整组
 * rem 字号被**静默并进** `.gr-` 区块，两个用例的「数量/顺序表」立刻误报。
 * 所以改成显式找边界：以后往 globals.css 尾部追加任何分区都不会再污染本文件的断言。
 */
function sectionAt(raw: string, anchor: string): string {
  const at = raw.indexOf(anchor)
  // 🚨 找不到时 `slice(-1)` 只会返回最后一个字符 ⇒ 所有断言**恒真**。必须当场失败。
  expect(at, `globals.css 里找不到 ${anchor}（被改名/搬走了？）`).toBeGreaterThanOrEqual(0)
  const sep = /\n\/\* ={10,}/g
  sep.lastIndex = at
  const next = sep.exec(raw)
  return stripComments(raw.slice(at, next ? next.index : raw.length))
}

/** 字体栈 → 族名数组（去引号、小写、丢空项）。 */
function families(stack: string): string[] {
  return stack
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .filter(Boolean)
}

/** 抓取片段里所有 `font-size: <n>px` 的数值（px 字号 ⇒ 不随根字号缩放）。 */
function pxFontSizes(css: string): number[] {
  return [...stripComments(css).matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]))
}

/** 抓取片段里所有 `font-family:` 的值（原样，含空格）。 */
function fontFamilies(css: string): string[] {
  return [...stripComments(css).matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim())
}

/** 抓取某个自定义属性在片段里的**全部**声明值（顺序 = 源码顺序）。 */
function varValues(css: string, name: string): string[] {
  const esc = name.replace(/[-]/g, '\\-')
  return [...css.matchAll(new RegExp(`${esc}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim())
}

/**
 * 校验参数族的**顺序**，返回违规理由（空数组 = 合规）。
 *
 * 顺序规则：`ui-monospace` 打头 → `consolas` → 符号族（`segoe ui symbol` / `noto music`）
 * 必须在等宽族**之后** → CJK 族 → 泛型垫底。
 */
function orderViolations(fams: string[]): string[] {
  const out: string[] = []
  if (fams[0] !== 'ui-monospace') out.push('首族必须是 ui-monospace（品数是数字、音名是拉丁字母）')
  const mono = fams.indexOf('consolas')
  if (mono < 0) out.push('缺等宽族 Consolas')
  for (const sym of ['segoe ui symbol', 'noto music']) {
    const i = fams.indexOf(sym)
    if (i < 0) out.push(`缺符号族 ${sym}`)
    else if (i < mono) out.push(`${sym} 排在等宽族之前 ⇒ 会抢走数字与 A-G 的字形`)
  }
  const cjk = ['microsoft yahei', 'pingfang sc', 'hiragino sans gb', 'noto sans sc']
  const cjkAt = cjk.map((c) => fams.indexOf(c)).filter((i) => i >= 0)
  if (cjkAt.length === 0) out.push('缺 CJK 族（「空弦」标签是中文）')
  else if (Math.min(...cjkAt) < mono) out.push('CJK 族排在等宽族之前 ⇒ 中文字体自带的拉丁字形会抢先')
  const last = fams[fams.length - 1]
  if (last !== 'monospace' && last !== 'sans-serif') out.push('泛型族没有垫底')
  return out
}

const CSS = read('app/globals.css')

describe('指板字体 —— 唯一真相源 --font-fretboard', () => {
  const stack = varValues(CSS, '--font-fretboard')[0] ?? ''
  const fams = families(stack)

  it('在 globals.css 里**只定义一次**（多处定义会按源码顺序静默互相覆盖）', () => {
    expect(varValues(CSS, '--font-fretboard')).toHaveLength(1)
  })

  it('🚨 族顺序合规（等宽 → 符号 → CJK → 泛型）', () => {
    // 逐条说出违规理由，而不是只回一个 false —— 顺序错法的后果各不相同
    expect(orderViolations(fams)).toEqual([])
  })

  it('🚨 反向对照：把符号层提到最前 / 用旧的 IBM Plex 栈，都必须判为不合规（证明上面的助手不是恒真）', () => {
    expect(orderViolations(['noto music', 'ui-monospace', 'consolas', 'monospace'])).not.toEqual([])
    expect(orderViolations(families(`ui-monospace, 'IBM Plex Mono', monospace`))).not.toEqual([])
  })

  it('CJK 族在栈里（GuitarRun 的空弦标签是中文「空弦」—— lib/i18n.ts:220）', () => {
    expect(fams).toContain('microsoft yahei')
  })
})

describe('指板字体 —— Tailwind 工具类只指向变量，不复制字体栈', () => {
  const cfg = stripComments(read('tailwind.config.ts'))

  it("fontFamily.fretboard === 'var(--font-fretboard)'", () => {
    expect(cfg).toMatch(/fretboard:\s*'var\(--font-fretboard\)'/)
  })

  it('🚨 fontFamily 段里没有任何字体族字面量（写死就是第二份栈，与 .gr-* 用的变量静默分叉）', () => {
    const from = cfg.indexOf('fontFamily:')
    const to = cfg.indexOf('fontSize:')
    expect(from, 'tailwind.config.ts 里找不到 fontFamily 段').toBeGreaterThanOrEqual(0)
    expect(to, '找不到 fontSize 段（用作 fontFamily 段的结束锚点）').toBeGreaterThan(from)
    const block = cfg.slice(from, to)
    expect(block).not.toMatch(/ui-monospace|Consolas|Noto Music|Microsoft YaHei|IBM Plex/i)
  })
})

describe('指板字体 —— 两套皮肤都引用同一个变量', () => {
  const css = stripComments(CSS)

  it('.gr-note-dot（音名 / 音程名）走变量', () => {
    expect(fontFamilies(ruleBody(css, '.gr-note-dot'))).toEqual(['var(--font-fretboard)'])
  })

  it('.gr-fret-numbers（品数）走变量', () => {
    expect(fontFamilies(ruleBody(css, '.gr-fret-numbers'))).toEqual(['var(--font-fretboard)'])
  })

  it('🚨 .gr- 区块里再没有裸字体族（原来的 ui-monospace / IBM Plex Mono 两处已消除）', () => {
    const gr = sectionAt(CSS, '.gr-stage {')
    expect(fontFamilies(gr)).toEqual(['var(--font-fretboard)', 'var(--font-fretboard)'])
    expect(gr).not.toContain('IBM Plex Mono')
    expect(gr).not.toContain('ui-monospace')
  })

  it('🚨 区块边界是显式算出来的：`.gr-` 区块不会被后面的分区（如 `.ft-*` 第三套皮肤）撑大', () => {
    // 这条守的就是上面 sectionAt 的边界逻辑本身 —— 如果它又退化成「切到文件尾」，
    // 这里的 `.ft-` 就会重新混进来（历史上正是这样静默误报的）。
    const gr = sectionAt(CSS, '.gr-stage {')
    expect(gr, '`.gr-` 区块把后面的分区也吃进来了').not.toContain('.ft-')
    // 正向对照：第三套皮肤的区块确实存在于该锚点之后，否则「没混进来」只是因为它压根不存在。
    expect(CSS.indexOf('.ft-board {'), '.ft- 第三套皮肤区块不见了').toBeGreaterThan(CSS.indexOf('.gr-stage {'))
    expect(sectionAt(CSS, '.ft-board {'), '`.ft-` 区块应当被切出来').toContain('.ft-dot')
  })

  it('经典皮肤的三处文字都挂 font-fretboard，且不再有 font-mono', () => {
    // 只剥注释 —— 那个 🚨 注释里写着「原来是 font-mono」，不剥会撞上自己的说明文字
    const code = stripComments(read('components/practice-fretboard.tsx'))
    /** 取含 anchor 的那个类名字符串字面量（允许类名顺序变化，但不允许整串消失）。 */
    const literalWith = (anchor: string): string => {
      const m = code.match(new RegExp(`"[^"]*${anchor}[^"]*"`))
      expect(m, `找不到含「${anchor}」的类名串（文字元素被改写了？）`).not.toBeNull()
      return m![0]
    }

    expect(literalWith('h-8 sm:h-10 text-2xs sm:text-xs'), '空弦（0 品）').toContain('font-fretboard')
    expect(literalWith('h-8 sm:h-10 text-4xs sm:text-2xs'), '1 品及以上').toContain('font-fretboard')
    expect(code, '品数行').toContain('"text-2xs font-fretboard"')
    // 反向：旧的「品数行不带字体类」写法必须已消失
    expect(code, '品数行又变回没有字体类').not.toMatch(/"text-2xs",\s*isMarker/)
    expect(code, '经典皮肤里又出现 font-mono ⇒ 与 GuitarRun 分叉').not.toMatch(/\bfont-mono\b/)
  })
})

describe('指板字体 —— GuitarRun 皮肤跟随显示缩放（字号与其容器都是 rem）', () => {
  const gr = sectionAt(CSS, '.gr-stage {')

  it('🚨 皮肤里不再有 px 字号（px 不认根字号 ⇒ 调显示缩放时指板纹丝不动）', () => {
    expect(pxFontSizes(gr)).toEqual([])
  })

  it('🚨 四个字号档的 rem 值与迁移前的 px **一一等值**（÷16，防静默字号漂移）', () => {
    // 源码顺序：.gr-fret-numbers(10) → .gr-fret-number--open(9) → .gr-note-dot(11) → ≤639 的圆点(7)
    const rems = [...gr.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]))
    expect(rems.map((r) => r * ROOT_PX)).toEqual([10, 9, 11, 7])
  })

  it('🚨 圆点 / 行高 / 空弦列宽（含 ≥640 档）都是 rem 且与迁移前等值', () => {
    // 顺序 = 源码顺序（.gr-stage 基础档 → @media (min-width:640px) 档）
    const table: Array<[string, number[]]> = [
      ['--gr-open-w', [34, 54]],
      ['--gr-row-h', [30, 40]],
      ['--gr-dot', [18, 34]],
    ]
    for (const [name, px] of table) {
      const vals = varValues(gr, name)
      expect(vals, `${name} 必须恰好两档（基础 + ≥640）`).toHaveLength(2)
      expect(vals.every((v) => /^[\d.]+rem$/.test(v)), `${name} 有非 rem 档：${vals.join(', ')}`).toBe(true)
      expect(vals.map((v) => Number.parseFloat(v) * ROOT_PX), `${name} 的 rem × 16 ≠ 迁移前的 px`).toEqual(px)
    }
  })

  it('品数行高也是 rem（22px 基准）', () => {
    expect(ruleBody(gr, '.gr-fret-numbers')).toMatch(/height:\s*1\.375rem;/)
  })

  it('🚨 反向对照：旧写法（px 字号 + 裸字体族）必须判为不合规', () => {
    const legacy = `.gr-note-dot { font-family: ui-monospace, 'IBM Plex Mono', monospace; font-size: 11px; }`
    expect(pxFontSizes(legacy), '旧写法的 px 字号必须被检出').toEqual([11])
    expect(fontFamilies(legacy), '旧写法的裸字体族必须被判为「不是变量」').not.toEqual(['var(--font-fretboard)'])
  })
})
