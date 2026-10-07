/**
 * 显示缩放（displayScale）的真相源。
 *
 * ## 三种实现的取舍（前两种都被否决，别再走回去）
 *
 * ### ❌ 方案 1：根容器 CSS `zoom`
 *
 * `zoom` **参与布局计算**（MDN：「scales the targeted element, which can affect the
 * page layout」）⇒ 放大视觉的同时把**逻辑可用宽度**压成 `视口宽 / zoom`。
 * 更糟的是根容器带 `overflow-hidden`：内容视觉高变成 1170 而容器仍 780 ⇒
 * **纵向被裁 390px**，用户永远看不到、也没有滚动条。
 *
 * ### ❌ 方案 2：外层滚动容器 + `transform: scale`
 *
 * 修好了纵向裁剪与不可滚，但 `transform` 同样把**视觉尺寸**与**布局尺寸**绑定 ⇒
 * 逻辑可用宽仍是 `容器宽 / scale`（150% 时 344 → 229），**标题照样被截、按钮出屏**。
 * 与方案 1 在该维度**完全等价**。真机实测（视口 360×780）：
 *
 * | scale | 逻辑可用宽 | 标题 | 开始练习按钮 |
 * |-------|-----------|------|-------------|
 * | 1.0   | 344       | `110/110` 不截 | right 265 ✓ |
 * | 1.5   | 229       | `33/88` **截断** | right 374 **出屏** |
 *
 * ### ✅ 方案 3（当前）：只改 `html` 根字号
 *
 * `document.documentElement.style.fontSize = 16 * scale`。
 * Tailwind 具名字号（`text-xs/sm/base/lg/2xl`…）**在产物 CSS 里本来就是 `rem`**，
 * 而本仓为 `px` 任意值字号补的 4 个语义 token 也是 `rem` ⇒ **全站字号自然随根字号缩放**，
 * 而**布局长度完全不参与缩放** ⇒ 逻辑可用宽保持视口宽。
 *
 * 真机实测：scale=1/1.25/1.5 ⇒ 根字号 16/20/24px、`h1` computed 16/20/24px、
 * **123/123 按钮全可达（不可达 0）**、`main` 溢出可滚、`docOver` 恒 0。
 *
 * ⚠️ `rem` 的解析基准是 **`document.documentElement`**，**不是父级元素** ——
 * 「给某个父级 div 设 font-size 看子元素跟不跟」这种测法**必然**得到「不跟」，
 * 那是测法错误，不能据此判定「字号缩放不可行」（本项目真踩过这个坑）。
 *
 * ## 已知取舍：放大后长文本仍会截断（用户已确认接受）
 *
 * 窄屏下「字号放大」与「全部内容同屏」**物理上不可兼得**：字号变大后同样宽的容器
 * 装不下同样多的字。产品语义选择**优先「字更清楚」**，接受次要文本（如顶栏标题）
 * 继续走 `truncate`。这是**刻意的降级设计**，不是回归 ——
 * 见 `components/app-header.tsx` 顶栏注释：标题块必须能收缩，否则设置按钮会被
 * 挤出屏幕右缘。
 *
 * ⚠️ **迁移范围（2026-10-03 重划，别一刀切）**：
 *
 * · **不迁移** —— `components/ui/*`（零消费者脚手架）与**指板/钢琴键的乐器比例件**：
 *   经典皮肤的格子最小宽 `min-w-[20px]/[28px]`、GuitarRun 的弦线粗细 / 琴枕 / 品记点 /
 *   1px 分隔线、钢琴键的键宽。它们是乐器上的固定比例，与「字号缩放」语义无关；
 *   且经典皮肤外层是 `overflow-hidden`（**不是**滚动容器）⇒ 放大后 16 品装不下会被
 *   **直接裁掉**右侧几品。
 *
 * · **必须迁移** —— 文字本身**以及「装文字的容器」**：GuitarRun 的 `font-size`、
 *   `--gr-dot`（圆点）、`--gr-row-h`（行高）、`--gr-open-w`（空弦列宽）、品数行高，
 *   已全部改成 rem（`app/globals.css` 的 `.gr-*` 区块，数值与原 px 等值：÷16）。
 *   只改字号是**假修** —— 文字会溢出圆点、圆点溢出列。
 *   护栏：`__tests__/fretboard-font-parity.test.ts`。
 */

/** 缩放比例的合法区间，与 `SettingsDisplaySection` 的滑块一致。 */
export const DISPLAY_SCALE_MIN = 0.8
export const DISPLAY_SCALE_MAX = 1.5

/** 根字号基准（px）。所有 rem 字号都相对于它。 */
export const ROOT_FONT_SIZE_BASE = 16

/**
 * 把任意来源的缩放值收敛为可信值。
 *
 * 值来自 `localStorage`（`JSON.parse` 不保证类型）⇒ 必须防 `NaN` / `Infinity` /
 * 字符串数字 / 越界值。任一不合法都回落到 `1`（不缩放），绝不让非法值进 DOM 样式。
 */
export function normalizeDisplayScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  if (value < DISPLAY_SCALE_MIN || value > DISPLAY_SCALE_MAX) return 1
  return value
}

/**
 * 根字号的 CSS 值。`scale=1` 返回 `undefined`（表示「清空内联样式，回到默认 16px」）。
 *
 * 取整到 3 位小数，避免 `0.8 * 16 = 12.800000000000001` 这类浮点尾巴泄漏到
 * DOM 样式与快照里。
 */
export function getRootFontSize(scale: number): string | undefined {
  const s = normalizeDisplayScale(scale)
  if (s === 1) return undefined
  const px = Math.round(ROOT_FONT_SIZE_BASE * s * 1000) / 1000
  return `${px}px`
}

/**
 * 把缩放应用到根元素，返回**还原函数**。
 *
 * 抽成纯函数是为了能在测试里用假 root 直接验证「设了什么、还原成什么」，
 * 而不必渲染整个 React 树（jsdom 下布局断言恒真，见铁律 17）。
 */
export function applyRootFontSize(
  scale: number,
  root: { style: { fontSize: string } } = document.documentElement,
): () => void {
  const prev = root.style.fontSize
  const next = getRootFontSize(scale)
  root.style.fontSize = next ?? ''
  return () => {
    root.style.fontSize = prev
  }
}
