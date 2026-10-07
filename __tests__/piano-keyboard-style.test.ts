/**
 * lib/piano-keyboard-style.ts —— 钢琴键盘皮肤真相源的契约测试。
 *
 * 这份文件是「换皮肤」的唯一判据：色谱、角色优先级、色标规则。
 * 组件（components/piano-keyboard.tsx）只负责把这里的结论画成 DOM，
 * 所以**这里错了组件不会报错、只会画错颜色/画错形状** —— 必须钉死。
 *
 * 色谱数值是**外部数据契约**（musmath.com 的 `--color-note-chroma-0..11`），
 * 因此这里逐个硬编码期望值：改一个色号就该红。
 */
import { describe, it, expect } from 'vitest'
import {
  CHROMA_COLORS,
  MUSMATH_DARK_KEY_COLORS,
  MUSMATH_KEY_RATIOS,
  chromaColor,
  resolveMusmathKeyGeometry,
  resolvePianoBadge,
  resolvePianoKeyRole,
  type PianoKeyRole,
  type PianoKeyboardStyle,
} from '@/lib/piano-keyboard-style'

/** musmath 线上样式表 `--color-note-chroma-0..11` 的原始值（浅色主题，深色主题不改写） */
const MUSMATH_CHROMA = [
  '#a5524d', '#9d562b', '#906606', '#6b6d3b', '#3e7541', '#237568',
  '#007386', '#1d73a5', '#616491', '#7b5a9f', '#955080', '#8e5a66',
]

describe('十二音级色谱', () => {
  it('恰好 12 个，且与 musmath 线上值逐个一致', () => {
    expect(CHROMA_COLORS).toHaveLength(12)
    expect([...CHROMA_COLORS]).toEqual(MUSMATH_CHROMA)
  })

  it('都是合法 hex 且互不重复（同一颜色会让两个音级无法区分）', () => {
    for (const c of CHROMA_COLORS) {
      expect(c, `${c} 不是 6 位 hex`).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(new Set(CHROMA_COLORS).size).toBe(12)
  })

  it('chromaColor 把任意整数归一化到 0..11（负数也不能越界成 undefined）', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(chromaColor(pc)).toBe(MUSMATH_CHROMA[pc])
      expect(chromaColor(pc + 12)).toBe(MUSMATH_CHROMA[pc])
      expect(chromaColor(pc - 12)).toBe(MUSMATH_CHROMA[pc])
    }
    // 呼叫方常见写法：pc - root 可能为负
    expect(chromaColor(-1)).toBe(MUSMATH_CHROMA[11])
    expect(chromaColor(-13)).toBe(MUSMATH_CHROMA[11])
    expect(chromaColor(23)).toBe(MUSMATH_CHROMA[11])
  })
})

describe('琴键角色（两套皮肤共用的优先级）', () => {
  // 优先级必须与经典皮肤原实现 getWhiteKeyClass 的分支顺序逐条一致：
  // 根音（且高亮）> 当前步骤 > 其它高亮音 > 无
  const cases: Array<[boolean, boolean, boolean, PianoKeyRole]> = [
    // highlighted, currentStep, isRoot → role
    [true, false, true, 'root'],
    [true, true, true, 'root'],     // 根音压过「当前步骤」
    [false, false, true, 'plain'],  // 根音没被高亮 ⇒ 不算根音
    [true, false, false, 'tone'],
    [true, true, false, 'current'],
    [false, true, false, 'current'],// 当前步骤优先于「未高亮」—— 与经典皮肤一致
    [false, false, false, 'plain'],
    [false, true, true, 'current'], // 未高亮的根音 + 当前步骤 ⇒ 当前步骤
  ]

  it.each(cases)('highlighted=%s currentStep=%s isRoot=%s → %s', (h, c, r, want) => {
    expect(resolvePianoKeyRole(h, c, r)).toBe(want)
  })

  it('穷举 2×2×2 只有这 8 种组合，没有遗漏', () => {
    let n = 0
    for (const h of [false, true]) {
      for (const c of [false, true]) {
        for (const r of [false, true]) {
          expect(['root', 'current', 'tone', 'plain']).toContain(resolvePianoKeyRole(h, c, r))
          n++
        }
      }
    }
    expect(n).toBe(8)
    expect(new Set(cases.map((c) => [c[0], c[1], c[2]].join(','))).size).toBe(8)
  })
})

describe('色标规则', () => {
  const ROLES: PianoKeyRole[] = ['root', 'current', 'tone', 'plain']
  const VARIANTS: PianoKeyboardStyle[] = ['classic', 'musmath']

  it('classic 皮肤永远不画色标（它用整键底色表达）', () => {
    for (const role of ROLES) {
      const b = resolvePianoBadge('classic', role, 0)
      expect(b.show, `classic/${role}`).toBe(false)
      expect(b.color).toBeNull()
      expect(b.square).toBe(false)
      expect(b.pulse).toBe(false)
    }
  })

  it('musmath 只给音阶/和弦音画色标，非音阶音不渲染任何节点', () => {
    expect(resolvePianoBadge('musmath', 'plain', 0).show).toBe(false)
    for (const role of ['root', 'current', 'tone'] as PianoKeyRole[]) {
      expect(resolvePianoBadge('musmath', role, 0).show, role).toBe(true)
    }
  })

  it('musmath：圆色标取「该半音的色谱色」，根音改方形', () => {
    for (let pc = 0; pc < 12; pc++) {
      const tone = resolvePianoBadge('musmath', 'tone', pc)
      expect(tone.color, `pc=${pc} 的色标底色应等于色谱色`).toBe(chromaColor(pc))
      expect(tone.square).toBe(false)
      expect(tone.pulse).toBe(false)

      const root = resolvePianoBadge('musmath', 'root', pc)
      expect(root.color).toBe(chromaColor(pc))
      expect(root.square, `pc=${pc} 的根音必须是方形`).toBe(true)
    }
  })

  it('脉冲来自**独立入参**，不能从 role 反推（根音同时是当前步骤时两者都要在）', () => {
    // 回归：把「根音装饰」和「当前步骤脉冲」合并成一个 role 后，
    // 练习第 0 步（就是根音）的脉冲会整个消失 —— 经典皮肤的 pulseCount 用例抓到的正是这个。
    const both = resolvePianoBadge('musmath', 'root', 0, true)
    expect(both.show).toBe(true)
    expect(both.square, '形状归根音').toBe(true)
    expect(both.pulse, '脉冲归当前步骤').toBe(true)

    // role='current' 只是「键面扮的角色」，真正的脉冲信号由第 4 个入参给
    expect(resolvePianoBadge('musmath', 'current', 0).pulse).toBe(false)
    expect(resolvePianoBadge('musmath', 'current', 0, true).pulse).toBe(true)
  })

  it('变体之间只有 classic/musmath 两种取值（写错字符串会静默退化成 classic）', () => {
    expect(VARIANTS).toEqual(['classic', 'musmath'])
    // 未知变体走 classic 分支（不画色标），不抛错
    expect(resolvePianoBadge('nope' as PianoKeyboardStyle, 'tone', 0).show).toBe(false)
  })
})

/**
 * 键面深色 —— 「浅色键盘不好看」这次改动的契约。
 *
 * 这一组**不是随手挑的深色**，而是把 Dark Reader 官方 bundle（v4.9.133，动态模式）
 * 套在 musmath 钢琴页上之后实测到的键面颜色：
 *   白键 #ffffff → #181a1b（Dark Reader 的 darkSchemeBackgroundColor）
 *   黑键 #062f3e → #052632（已经暗的颜色 ×0.8）
 *   描边 #c6bca8 → #444a4d（浅色压暗去饱和）
 * 出处、复现脚本与实测表写在 lib/piano-keyboard-style.ts 的常量注释里。
 */
describe('musmath 键面的深色（Dark Reader 实测值）', () => {
  const rgb = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  })
  /** WCAG 相对亮度 */
  const relLum = (hex: string) => {
    const f = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    const { r, g, b } = rgb(hex)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }

  it('三个取值就是 Dark Reader 实算出来的那三个（外部数据契约，逐个钉死）', () => {
    expect(MUSMATH_DARK_KEY_COLORS).toEqual({
      whiteKey: '#181a1b',
      blackKey: '#052632',
      border: '#444a4d',
    })
  })

  it('都是 6 位 hex（写错会被 Tailwind 静默忽略 ⇒ 键面掉回默认色）', () => {
    for (const c of Object.values(MUSMATH_DARK_KEY_COLORS)) {
      expect(c, `${c} 不是 6 位 hex`).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('键面确实是深色（相对亮度远低于中灰）', () => {
    // 被替换掉的浅色原值全部会挂在这里：白键 #fff(1.00) / 米色 #d8c69c(0.59) / 描边 #c6bca8(0.52)
    for (const key of ['whiteKey', 'blackKey', 'border'] as const) {
      expect(
        relLum(MUSMATH_DARK_KEY_COLORS[key]),
        `${key}=${MUSMATH_DARK_KEY_COLORS[key]} 不够暗`,
      ).toBeLessThan(0.12)
    }
  })

  it('黑键与白键靠「红通道更低、蓝通道更高」区分（两者同色的话黑键就看不见了）', () => {
    const w = rgb(MUSMATH_DARK_KEY_COLORS.whiteKey)
    const b = rgb(MUSMATH_DARK_KEY_COLORS.blackKey)
    expect(MUSMATH_DARK_KEY_COLORS.blackKey).not.toBe(MUSMATH_DARK_KEY_COLORS.whiteKey)
    expect(b.r, '黑键要比白键更暗（红通道更低）').toBeLessThan(w.r)
    expect(b.b, '黑键要比白键更偏青（蓝通道更高）').toBeGreaterThan(w.b)
  })
})

/**
 * 键的**形状** —— 与色谱、键面色一样，是从 musmath 原站 DOM 实测出来的外部数据契约。
 *
 * 原站每个键上的类（`https://www.musmath.com/scale/minor-blues/c/piano`，容器 `h-48`=192px）：
 *   白键 `h-[97%] w-10` ⇒ 40 × 186.24
 *   黑键 `h-3/5  w-8`  ⇒ 32 × 115.2
 * 所以三个比例都是**商**，不是拍出来的近似值。
 */
describe('musmath 键的形状比例', () => {
  it('三个比例必须由原站实测尺寸推出（改一个数就该红）', () => {
    expect(MUSMATH_KEY_RATIOS.whiteHeightPerWidth).toBeCloseTo(186.24 / 40, 10)
    expect(MUSMATH_KEY_RATIOS.blackWidthRatio).toBeCloseTo(32 / 40, 10)
    expect(MUSMATH_KEY_RATIOS.blackHeightRatio).toBeCloseTo(115.2 / 186.24, 10)
  })

  it('黑键高比例是 60/97 —— 白键不是满高（h-[97%]），当成 1 会得到 0.6，矮 3%', () => {
    expect(MUSMATH_KEY_RATIOS.blackHeightRatio).toBeCloseTo(60 / 97, 10)
    expect(MUSMATH_KEY_RATIOS.blackHeightRatio).not.toBeCloseTo(0.6, 3)
    expect(MUSMATH_KEY_RATIOS.blackHeightRatio).toBeGreaterThan(0.6)
  })

  it('形状的两个方向都要「比直觉更极端」：白键细长、黑键宽', () => {
    // 这两条挡的是「照感觉画」：常见的目测值 ≈ 高宽比 3.4、黑键宽比 0.6
    expect(MUSMATH_KEY_RATIOS.whiteHeightPerWidth).toBeGreaterThan(4.5)
    expect(MUSMATH_KEY_RATIOS.blackWidthRatio).toBeGreaterThan(0.75)
  })

  it('把原站的白键宽喂回去，必须还原出原站整套尺寸（比例与来源自洽）', () => {
    const g = resolveMusmathKeyGeometry(40)
    expect(g.whiteWidth).toBe(40)
    expect(g.whiteHeight).toBeCloseTo(186.24, 0)
    expect(g.blackWidth).toBe(32)
    expect(g.blackHeight).toBeCloseTo(115.2, 0)
  })

  it('等比缩放：白键宽翻倍，其余三个跟着翻倍（±1px 取整误差）', () => {
    const a = resolveMusmathKeyGeometry(26)
    const b = resolveMusmathKeyGeometry(52)
    for (const k of ['whiteHeight', 'blackWidth', 'blackHeight'] as const) {
      expect(Math.abs(b[k] - a[k] * 2), k).toBeLessThanOrEqual(1)
    }
  })

  it('本应用白键宽 26px ⇒ 26×121 / 21×75（黑键相对原实现的 16px 明显变宽）', () => {
    expect(resolveMusmathKeyGeometry(26)).toEqual({
      whiteWidth: 26,
      whiteHeight: 121,
      blackWidth: 21,
      blackHeight: 75,
    })
  })

  it('派生尺寸都是整数（小数会原样写进 style 变成 20.8px，与 DOM 断言、像素对齐都对不上）', () => {
    for (const w of [18, 20, 26, 30, 40]) {
      const { whiteHeight, blackWidth, blackHeight } = resolveMusmathKeyGeometry(w)
      for (const v of [whiteHeight, blackWidth, blackHeight]) {
        expect(Number.isInteger(v), `白键宽 ${w} 派生出非整数 ${v}`).toBe(true)
      }
    }
  })
})
