/**
 * 显示缩放（displayScale）契约测试。
 *
 * ## 本文件守护的**不变量**（换实现时这些必须继续成立）
 *
 * 1. **缩放不许参与布局计算** —— 逻辑可用宽必须保持视口宽。
 *    两版被否决的实现（CSS `zoom`、`transform: scale`）都违反了这条。
 * 2. **不许出现 `zoom:` 样式属性**（它参与布局计算）。
 * 3. **字号必须是 rem** —— 否则改 `html` 根字号对它们无效。
 * 4. **非法值必须收敛为 1**（值来自 localStorage，类型不可信）。
 * 5. **缩放可逆** —— 卸载/改回 1 时必须还原根字号，不留残留。
 *
 * ## 为什么用纯函数 + 源码护栏，而不是渲染断言（铁律 17）
 *
 * jsdom **没有布局引擎**：`getBoundingClientRect()` 恒 0、`scrollWidth === clientWidth === 0`
 * ⇒「标题有没有被截」「按钮有没有出屏」这类断言在单测里**恒真**，拦不住任何回归。
 * 因此本文件守两头：
 *   · **纯函数层** —— 「算出什么值」可以精确断言（含浮点尾巴、非法值）；
 *   · **源码层** —— 「DOM 里写了什么」可以断言，防止有人把缩放又写回布局属性。
 * 真机数字（视口 360×780，scale=1/1.25/1.5）：
 *
 * | scale | 根字号 | h1 computed | h1 视觉高 | 按钮不可达 | main 溢出 | docOver |
 * |-------|--------|-------------|-----------|-----------|-----------|---------|
 * | 1     | 16px   | 16px        | 24        | 0/123     | 0         | 0       |
 * | 1.25  | 20px   | 20px        | 30        | 0/123     | 23px（可滚）| 0     |
 * | 1.5   | 24px   | 24px        | 36        | 0/123     | 95px（可滚）| 0     |
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DISPLAY_SCALE_MIN,
  DISPLAY_SCALE_MAX,
  ROOT_FONT_SIZE_BASE,
  normalizeDisplayScale,
  getRootFontSize,
  applyRootFontSize,
} from '@/lib/display-scale'

const ROOT = process.cwd()

/** 读源码并规整换行（Write 工具产出 CRLF，node 脚本要先归一）。 */
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
}

/**
 * 剥离注释后再断言。
 *
 * ⚠️ 否则「注释里解释『不要用 zoom』」会被自己的护栏判红 ——
 * 这类假阳性会逼人把有价值的说明删掉，是本项目反复踩过的坑。
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')  // JSX {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '')      // /* ... */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')  // // ...（避开 https:// 里的 //）
}

/** 遍历目录下所有 .tsx/.ts（排除 components/ui 脚手架与测试自身）。 */
function walkSources(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) {
      if (rel === 'components/ui') continue
      walkSources(rel, acc)
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      acc.push(rel)
    }
  }
  return acc
}

describe('display-scale —— 常量与边界', () => {
  it('缩放区间与设置面板滑块一致（80%..150%）', () => {
    expect(DISPLAY_SCALE_MIN).toBe(0.8)
    expect(DISPLAY_SCALE_MAX).toBe(1.5)
  })

  it('根字号基准是 16px（rem 的解析基准，改了会整体偏移）', () => {
    expect(ROOT_FONT_SIZE_BASE).toBe(16)
  })

  it('滑块源码的 min/max/step 与本模块常量一致', () => {
    const src = readSource('components/settings-display-section.tsx')
    const min = src.match(/min=\{(\d+)\}/)
    const max = src.match(/max=\{(\d+)\}/)
    expect(min, '没找到 min={...}，滑块结构可能已变').not.toBeNull()
    expect(max, '没找到 max={...}，滑块结构可能已变').not.toBeNull()
    expect(Number(min![1]) / 100).toBe(DISPLAY_SCALE_MIN)
    expect(Number(max![1]) / 100).toBe(DISPLAY_SCALE_MAX)
  })
})

describe('display-scale —— normalizeDisplayScale 非法值收敛', () => {
  it('合法区间内的数值原样返回', () => {
    for (const v of [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5]) {
      expect(normalizeDisplayScale(v)).toBe(v)
    }
  })

  it('非 number 一律回落到 1（值来自 localStorage，类型不可信）', () => {
    const junk = [undefined, null, '1.5', '2', true, false, {}, [], () => 1]
    for (const v of junk) {
      expect(normalizeDisplayScale(v), `${JSON.stringify(v)} 应回落为 1`).toBe(1)
    }
  })

  it('NaN / ±Infinity 回落为 1（否则会写出 font-size: NaNpx）', () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      expect(normalizeDisplayScale(v)).toBe(1)
    }
  })

  it('越界值回落为 1（不夹取 —— 夹取会让脏值静默变成合法缩放）', () => {
    for (const v of [0, 0.5, 0.79, 1.51, 2, 10, -1]) {
      expect(normalizeDisplayScale(v), `${v} 越界应回落为 1`).toBe(1)
    }
  })

  it('0 不等于「不缩放」的假值 —— 必须显式回落', () => {
    expect(normalizeDisplayScale(0)).toBe(1)
  })
})

describe('display-scale —— 根字号计算', () => {
  it('scale=1 返回 undefined（清空内联，回到默认 16px）', () => {
    expect(getRootFontSize(1)).toBeUndefined()
  })

  it('scale≠1 返回 px 值 = 16 × scale', () => {
    expect(getRootFontSize(1.5)).toBe('24px')
    expect(getRootFontSize(1.25)).toBe('20px')
    expect(getRootFontSize(1.3)).toBe('20.8px')
    expect(getRootFontSize(0.8)).toBe('12.8px')
  })

  it('🚨 输出不带浮点尾巴 —— 0.8/1.3 这类值乘 16 后必须干净（否则会泄漏到 DOM 样式与快照）', () => {
    for (const v of [0.8, 0.9, 1.1, 1.2, 1.3, 1.4, 1.5]) {
      const out = getRootFontSize(v)
      expect(out, `${v} → ${out} 含浮点尾巴`).toMatch(/^\d+(\.\d{1,3})?px$/)
    }
  })

  it('🚨 取整真的在干活 —— 滑块可达值（step=10%）全都恰好干净，取整防的是**脏值**', () => {
    // 这一条是「取整不可删」的**唯一**证据链。背景（变异 M9 假 ZERO 的分诊）：
    //   滑块 step=10% ⇒ 可达值只有 0.8/0.9/…/1.5 共 8 个，而 `16 * v` 对它们
    //   **本来就**是干净的（`16*0.8 === 12.8` 在 IEEE-754 下精确）⇒ 删掉取整
    //   在这 8 个值上**观察不到任何差异**，只测滑块值的用例必然「咬不住」。
    //   但取整并非冗余：`normalizeDisplayScale` 只保证 [0.8,1.5] 与 isFinite，
    //   **并不保证是 0.1 的整数倍** —— 手改 localStorage 就能塞进 1.0000001。
    const sliderValues = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5]
    const tailFree = (v: number) => {
      const raw = ROOT_FONT_SIZE_BASE * v
      return raw === Math.round(raw * 1000) / 1000
    }
    // ① 前提：滑块可达值恰好全都无尾巴 ⇒ 单靠它们无法证明取整有效
    for (const v of sliderValues) {
      expect(tailFree(v), `滑块值 ${v} 本来就有尾巴，前提不成立`).toBe(true)
    }
    // ② 缝隙证明：脏值**确实**会带尾巴（否则取整是真冗余，可删）
    expect(tailFree(1.0000001), '1.0000001 竟然无尾巴？取整就是真冗余了').toBe(false)
    expect(String(ROOT_FONT_SIZE_BASE * 1.0000001)).toBe('16.0000016')
    // ③ 取整把尾巴收掉
    expect(getRootFontSize(1.0000001)).toBe('16px')
    // ④ 且仍然尊重 1.5 上限内的任意合法小数（不是「一律抹成整数」）
    expect(getRootFontSize(1.0000001)).not.toBe(getRootFontSize(1.001))
    expect(getRootFontSize(1.001)).toBe('16.016px')
  })

  it('非法值 → undefined（等于不缩放，绝不写出 NaNpx）', () => {
    expect(getRootFontSize(NaN)).toBeUndefined()
    expect(getRootFontSize(Infinity)).toBeUndefined()
    expect(getRootFontSize('1.5' as never)).toBeUndefined()
    expect(getRootFontSize(99)).toBeUndefined()
  })
})

describe('display-scale —— applyRootFontSize（改根元素 + 可逆）', () => {
  /** 假根元素：只带 style.fontSize，够 applyRootFontSize 用。 */
  const fakeRoot = (initial = '') => ({ style: { fontSize: initial } })

  it('scale≠1 时把根字号设为 16×scale', () => {
    const root = fakeRoot()
    applyRootFontSize(1.5, root)
    expect(root.style.fontSize).toBe('24px')
  })

  it('scale=1 时清空内联样式（回到默认，而不是写死 16px）', () => {
    const root = fakeRoot('24px')
    applyRootFontSize(1, root)
    expect(root.style.fontSize).toBe('')
  })

  it('返回的还原函数把根字号恢复为**进入前**的值', () => {
    const root = fakeRoot('18px')
    const undo = applyRootFontSize(1.5, root)
    expect(root.style.fontSize).toBe('24px')
    undo()
    expect(root.style.fontSize, '还原必须回到原值，不能一律清空').toBe('18px')
  })

  it('🚨 连续切换后还原，不会残留放大值（幂等标志位失败路径必须回滚 —— 铁律 6）', () => {
    const root = fakeRoot()
    const undo1 = applyRootFontSize(1.5, root)
    undo1()
    const undo2 = applyRootFontSize(1.25, root)
    expect(root.style.fontSize).toBe('20px')
    undo2()
    expect(root.style.fontSize, '两次施加/还原后必须回到初始空值').toBe('')
  })

  it('非法值等价于不缩放（清空内联）', () => {
    const root = fakeRoot('24px')
    applyRootFontSize(NaN, root)
    expect(root.style.fontSize).toBe('')
  })
})

describe('🔒 源码护栏 —— 缩放不许参与布局（page.tsx）', () => {
  const src = readSource('app/page.tsx')
  const code = stripComments(src)

  it('🚨 根容器不再使用 CSS zoom（zoom 参与布局计算 ⇒ 压缩逻辑可用宽 + 与 overflow-hidden 叠加裁内容）', () => {
    // ⚠️ 不能只认行首的 `zoom:` —— 变异常把它塞进对象字面量的中段
    //    （`{ height: '100dvh', zoom: ... }`），行首锚点会漏判（实测咬 ZERO）。
    //    改为：匹配「作为对象属性键」的写法 —— 前面是 `{`、`,`、换行或空白，后面紧跟 `:`。
    const styleZoom = /(^|[{,\n])\s*zoom\s*:/m.test(code)
    expect(styleZoom, 'page.tsx 里仍有 `zoom:` 样式属性 —— 会重新引入逻辑宽压缩与纵向裁剪').toBe(false)
  })

  it('🚨 根容器不再用 transform: scale 做整体缩放（transform 同样把视觉尺寸绑进布局）', () => {
    const scaleTransform = /transform(?:Origin)?\s*:\s*[`"']?scale\(/.test(code)
    expect(scaleTransform, 'page.tsx 里又出现 transform: scale( —— 会重新压缩逻辑可用宽').toBe(false)
  })

  it('🚨 根容器不再用 calc(100% / …) 做缩放期宽度补偿（那是 transform 方案的补丁）', () => {
    expect(code, '出现 calc(100% / ⇒ 又回到「缩窄再放大」的老路').not.toMatch(/width:\s*[`"']?calc\(100%\s*\//)
  })

  it('缩放通过根字号 effect 施加，且几何真相源来自 lib/display-scale', () => {
    expect(code).toMatch(/from\s+["']@\/lib\/display-scale["']/)
    expect(code, '必须调用 applyRootFontSize 施加缩放').toContain('applyRootFontSize')
    expect(code, '根字号必须写在 document.documentElement 上（rem 只认它，不是父级）')
      .toMatch(/applyRootFontSize\s*\(/)
  })
})

describe('🔒 源码护栏 —— 全站字号必须是 rem（否则改根字号对它们无效）', () => {
  const files = walkSources('app').concat(walkSources('components'), walkSources('lib'), walkSources('hooks'))

  it('🚨 不再有 px 任意值字号（text-[Npx] 写死物理像素 ⇒ 不随根字号缩放）', () => {
    const offenders: string[] = []
    for (const f of files) {
      const code = stripComments(readSource(f))
      const m = code.match(/text-\[\d+px\]/g)
      if (m) offenders.push(`${f}: ${m.join(', ')}`)
    }
    expect(offenders, 'px 任意值字号不会随根字号缩放，请改用语义 token（text-4xs/3xs/2xs/2xs-plus）')
      .toEqual([])
  })

  it('4 个语义 token 已在 tailwind.config.ts 定义且都是 rem', () => {
    const cfg = readSource('tailwind.config.ts')
    for (const [token, rem] of [['4xs', '0.5rem'], ['3xs', '0.5625rem'], ['2xs', '0.625rem'], ['2xs-plus', '0.6875rem']] as const) {
      expect(cfg, `tailwind 配置缺 ${token} token`).toContain(`'${token}'`)
      expect(cfg, `${token} 必须是 rem（${rem}）`).toContain(rem)
    }
  })

  it('🚨 这些 token 的 rem 值必须各自等于迁移前的 px 值（16px 基准）—— 否则是静默的字号漂移', () => {
    const expectPairs: Array<[string, number, number]> = [
      ['4xs', 0.5, 8], ['3xs', 0.5625, 9], ['2xs', 0.625, 10], ['2xs-plus', 0.6875, 11],
    ]
    for (const [token, rem, px] of expectPairs) {
      expect(rem * ROOT_FONT_SIZE_BASE, `${token} 的 rem×16 应等于原 px 值 ${px}`).toBe(px)
    }
  })
})
