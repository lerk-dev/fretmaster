/**
 * 钢琴键盘皮肤（显示方案）的**真相源**。
 *
 * 目前两套皮肤：
 *   - `classic`：应用原有画法 —— 整键底色高亮（根音深蓝 / 当前步骤亮蓝 / 和弦音浅蓝），
 *     颜色跟随主题明暗。
 *   - `musmath`：复刻 musmath.com 的钢琴键盘画法 —— **键面保持白/黑不清染**，
 *     只在音阶/和弦音所在的键上落一枚**圆形色标**（底色按「十二音级色谱」取色，
 *     同一个半音在所有八度同色），**根音那枚是方形**，当前步骤加呼吸环。
 *
 * ⚠️ 本文件**不得**出现 Tailwind 类名：`tailwind.config.ts` 的 content 只扫
 * `./pages`、`./components`、`./app`，写在 lib/ 里的类名不会被生成
 * （症状是「类名在 DOM 上、样式完全不生效」）。类名一律留在组件里，
 * 这里只出**数据与判定**（可单测、可变异）。
 */

/** 钢琴键盘皮肤：classic = 整键底色高亮；musmath = 键面留白 + 音级色标 */
export type PianoKeyboardStyle = 'classic' | 'musmath'

/**
 * musmath 皮肤的**键面**配色 —— Dark Reader 实测值，不是拍脑袋调的色。
 *
 * 取了 musmath 原站的浅色键面（白键 `#ffffff` / 黑键 `#062f3e` / 描边 `#c6bca8`），
 * 把 Dark Reader 官方 bundle（v4.9.133 的 `darkreader.js`，动态模式 `DarkReader.enable()`
 * 默认参数）注入它的钢琴页 https://www.musmath.com/scale/minor-blues/c/piano ，
 * 再用 CDP 读 `getComputedStyle` 拿到的**实算颜色**（探针脚本
 * `.workbuddy/tmp/musmath/dr-probe.cjs`）：
 *
 *   musmath 浅色原值   → 套 Dark Reader 后     Dark Reader 做了什么
 *   #ffffff 白键面     → #181a1b               直接换成它的 darkSchemeBackgroundColor
 *   #062f3e 黑键面     → #052632               已暗的颜色一律 ×0.8（每个通道都实测吻合）
 *   #c6bca8 键描边     → #444a4d               浅色向暗色方案背景压暗并去饱和
 *
 * ⚠️ musmath **自己的深色主题也是浅色键盘**（`--color-piano-key: #d8c69c` 米色键），
 * 所以应用的两套主题共用上面这一组深色，不再按明暗分档（与 GuitarRun 指板皮肤
 * 「固定在深色舞台」一个口径）。
 *
 * ⚠️ 这里只是**数据**。真正生效必须写成组件里的 Tailwind 任意值字面量
 * （`bg-[#181a1b]`）—— `tailwind.config.ts` 的 content 只扫 components/app/pages，
 * 写在 lib/ 里的类名不会被生成。组件里的字面量与这里的取值**必须逐字一致**，
 * 由 `__tests__/piano-keyboard.test.ts` 的差分护栏钉住（从本常量拼出期望类名比对 DOM）。
 */
export const MUSMATH_DARK_KEY_COLORS = {
  /** 白键键面（Dark Reader 的 darkSchemeBackgroundColor） */
  whiteKey: '#181a1b',
  /** 黑键键面 */
  blackKey: '#052632',
  /** 键面描边 */
  border: '#444a4d',
} as const

/**
 * musmath 的「十二音级色谱」：每个半音一个颜色，跨八度同色。
 * 数值逐个抄自线上样式表 `--color-note-chroma-0..11`
 * （https://www.musmath.com/assets/globals-*.css），明暗主题共用同一组值。
 * 下标 = 半音序号（0 = C）。
 */
export const CHROMA_COLORS = [
  '#a5524d', // 0  C
  '#9d562b', // 1  C♯ / D♭
  '#906606', // 2  D
  '#6b6d3b', // 3  D♯ / E♭
  '#3e7541', // 4  E
  '#237568', // 5  F
  '#007386', // 6  F♯ / G♭
  '#1d73a5', // 7  G
  '#616491', // 8  G♯ / A♭
  '#7b5a9f', // 9  A
  '#955080', // 10 A♯ / B♭
  '#8e5a66', // 11 B
] as const

/**
 * 取某个半音对应的色谱色。
 * 负数是**故意支持的**（调用方可能先减根音再取模），统一归一化到 0..11。
 */
export function chromaColor(pitchClass: number): string {
  return CHROMA_COLORS[((pitchClass % 12) + 12) % 12]
}

/**
 * musmath 键的**形状**比例 —— 从原站 DOM 与线上样式表实测，不是目测估的。
 *
 * 原站 https://www.musmath.com/scale/minor-blues/c/piano 上每个键的类：
 *   白键  `inline-flex justify-center rounded-b-md border border-piano-key-border
 *          shadow-md shadow-shadow/10 h-[97%] w-10 bg-piano-key`
 *   黑键  `inline-flex justify-center rounded-b-md border border-piano-key-border
 *          shadow-md shadow-shadow/10 absolute h-3/5 w-8 -translate-x-4 transform
 *          bg-piano-key-accidental`
 *   容器  `h-48`（= 12rem = 192px）
 *
 * ⇒ 白键 40 × 186.24、黑键 32 × 115.2，黑键 `-translate-x-4`(−16px) 恰为**自身半宽**，
 *   所以中心正好落在左右白键的交界上（与本应用 `boundary·W − BW/2` 同一口径）。
 *
 * ⚠️ 黑键/白键高 = `h-3/5` ÷ `h-[97%]` = **60/97 ≈ 0.6186，不是 0.6** —— 白键不是满高，
 *   照 0.6 算会矮 3%。同理别把白键当成容器满高（那会让宽高比差 3%）。
 */
export const MUSMATH_KEY_RATIOS = {
  /** 白键 高÷宽（原站 `h-[97%]`×192 ÷ `w-10`40 = 186.24/40） */
  whiteHeightPerWidth: 186.24 / 40,
  /** 黑键宽 ÷ 白键宽（原站 `w-8`32 ÷ `w-10`40） */
  blackWidthRatio: 32 / 40,
  /** 黑键高 ÷ 白键高（原站 115.2 ÷ 186.24 = 60/97） */
  blackHeightRatio: 115.2 / 186.24,
} as const

/** 一套键的像素尺寸（白键宽是输入，其余全部由比例派生） */
export interface PianoKeyGeometry {
  whiteWidth: number
  whiteHeight: number
  blackWidth: number
  blackHeight: number
}

/**
 * 按 musmath 的比例把「白键宽」展开成整套键的像素尺寸。
 *
 * 为什么输入是白键宽而不是照抄原站的 40px：原站整个键盘是页面主角（容器就 192px 高），
 * 本应用只是练习页里的一块可选面板，3 个八度 × 40px 会撑到 840px 必须横滚。
 * 原站自己也是用百分比表达高度的 ⇒ **缩放白键宽即可整体等比缩放**，形状（比例）不变。
 */
export function resolveMusmathKeyGeometry(whiteKeyWidth: number): PianoKeyGeometry {
  const whiteHeight = Math.round(whiteKeyWidth * MUSMATH_KEY_RATIOS.whiteHeightPerWidth)
  return {
    whiteWidth: whiteKeyWidth,
    whiteHeight,
    blackWidth: Math.round(whiteKeyWidth * MUSMATH_KEY_RATIOS.blackWidthRatio),
    blackHeight: Math.round(whiteHeight * MUSMATH_KEY_RATIOS.blackHeightRatio),
  }
}

/**
 * 琴键扮演的角色。优先级与经典皮肤 `getWhiteKeyClass` 的分支顺序**逐条对齐**：
 * 根音（且已高亮）> 当前步骤 > 其它高亮音 > 无。
 * 两套皮肤共用这一个判定，避免「改了这边忘了那边」。
 */
export type PianoKeyRole = 'root' | 'current' | 'tone' | 'plain'

export function resolvePianoKeyRole(
  highlighted: boolean,
  currentStep: boolean,
  isRoot: boolean,
): PianoKeyRole {
  if (isRoot && highlighted) return 'root'
  if (currentStep) return 'current'
  if (highlighted) return 'tone'
  return 'plain'
}

export interface PianoKeyBadge {
  /** 是否渲染色标。classic 皮肤一律 false（它用整键底色表达，不用色标） */
  show: boolean
  /** 色标底色（CSS 颜色字面量）；不渲染时为 null */
  color: string | null
  /** 方形（musmath 画根音的方式）还是圆形 */
  square: boolean
  /** 是否加呼吸提示（当前步骤） */
  pulse: boolean
}

/**
 * 某个键该不该画色标、画成什么形状/颜色。
 * musmath 只给**音阶/和弦音**画色标（非音阶音在他们的页面上是 hover 才显形，
 * 这里干脆不渲染 —— 隐藏元素留在 DOM 里会让 `textContent` 断言看到「屏幕上看不见的字」）。
 *
 * ⚠️ `isCurrentStep` 必须**单独传**，不能从 role 反推：一个键可以**同时**是根音和当前步骤
 * （音阶/和弦练习的第 0 步就是根音），此时 role 取 'root'（形状/颜色归根音），
 * 但「这是你现在该弹的音」这个信号仍然要保留 —— 经典皮肤原本就是两个独立装饰叠加，
 * 合并成一个 role 会把脉冲整个吃掉（`scale-keyboard.test.ts` 的 pulseCount 用例抓到的正是这个）。
 */
export function resolvePianoBadge(
  variant: PianoKeyboardStyle,
  role: PianoKeyRole,
  pitchClass: number,
  isCurrentStep = false,
): PianoKeyBadge {
  const none: PianoKeyBadge = { show: false, color: null, square: false, pulse: false }
  if (variant !== 'musmath') return none
  if (role === 'plain') return none
  return {
    show: true,
    color: chromaColor(pitchClass),
    square: role === 'root',
    pulse: isCurrentStep,
  }
}
