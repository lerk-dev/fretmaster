/**
 * 「音级标签 → 半音数」的**唯一真相源**。
 *
 * ## 🚨 为什么要有这个文件
 *
 * 2026-10-15 全仓盘点时发现同一份「音级 → 半音」映射存在**六份字面量**：
 *
 *   ① `lib/page-theory-functions.ts` 的 `intervalToSemitones`
 *   ② `lib/page-theory-data.ts` 的 `DEGREE_TO_SEMITONE`
 *   ③ `lib/page-theory-functions.ts` 的 `SCALE_DEGREE_SEMITONE_FALLBACK`
 *   ④ `lib/page-theory-functions.ts` 的 `degreeToSemitone()`（函数体内联）
 *   ⑤ `app/page.tsx` 的和弦练习点击判定（内联 Record）
 *   ⑥ `app/page.tsx` 的和弦练习 MIDI 判定（内联 Record）
 *
 * 六份各有各的洞：`#2` 只在两份里有、`b4` 只有一份补了、`bb7` 三份有、双变音记号
 * （`bb4`/`##5`/`##1`）一份都没有 —— 而 `getScaleNoteNames` 的正则却认得它们，
 * 于是「解析得了、查不到半音」⇒ 静默返回空音名。
 *
 * ## 语义：两种，靠一个规则互推
 *
 * - **mod-12**（值域 0..11）：给「音阶练习 / 键盘高亮 / 点击判定」用。
 * - **复合音程**（值域可到 21）：给「和弦级数」用（`'9' → 14`、`'13' → 21`）。
 *
 * 两者的关系是**确定的**：复合度数（`b9`/`9`/`#9`/`11`/`#11`/`b13`/`13`）= 同名单八度
 * 音级的 mod-12 值 **+12**；其余（`1`~`7`、`b3`、`bb7`、`maj7`、双变音记号）两语义同值。
 * 所以本文件只保留**一张字面量表**，复合语义由 `degreeToSemitone()` 推导。
 *
 * 护栏：`__tests__/degree-semitone.test.ts` 穷举锁死键集、两种语义的互推关系、
 * 以及「六份字面量不许复活」。
 */

/**
 * mod-12 的「音级 → 半音」表（**唯一字面量**）。
 *
 * 收录口径：所有可能出现过的音级拼写，含异名同音（`b3` 与 `#2` 都是 3）与
 * 双变音记号。缺键会让消费方静默拿到 `undefined`（表现为「音名空白」「高亮缺失」），
 * 所以宁可多收，不可漏收。
 */
export const DEGREE_SEMITONE_MOD12: Readonly<Record<string, number>> = {
  // 单八度 · 自然音级
  '1': 0,
  b2: 1,
  '2': 2,
  b3: 3,
  '3': 4,
  '4': 5,
  '5': 7,
  '6': 9,
  '7': 11,
  maj7: 11,
  // 单八度 · 变化音级（异名同音各归其位）
  '#2': 3,
  '#4': 6,
  b5: 6,
  '#5': 8,
  b6: 8,
  '#6': 10,
  b7: 10,
  // 降四级 / 重降七级（前者给 alteredDominantFlatFlat7 用，后者给减和弦用）
  b4: 4,
  bb7: 9,
  // 双变音记号：`getScaleNoteNames` 的正则认得它们，表就必须接得住
  // （`4`=5 ⇒ `b4`=4 ⇒ `bb4`=3；`5`=7 ⇒ `#5`=8 ⇒ `##5`=9；`1`=0 ⇒ `##1`=2）
  bb4: 3,
  '##5': 9,
  '##1': 2,
  // 复合音程（mod-12 后）—— 单独列出来是为了让「哪些是复合度数」可枚举
  b9: 1,
  '9': 2,
  '#9': 3,
  '11': 5,
  '#11': 6,
  b13: 8,
  '13': 9,
}

/** 复合音程的度数集合（`degreeToSemitone()` 会给这些 +12）。 */
const COMPOUND_DEGREES: ReadonlySet<string> = new Set(['b9', '9', '#9', '11', '#11', 'b13', '13'])

/** 该音级是不是复合音程（≥ 一个八度）。 */
export function isCompoundDegree(degree: string): boolean {
  return COMPOUND_DEGREES.has(degree)
}

/**
 * mod-12 语义的查表（查不到 ⇒ `undefined`，调用方自行决定兜底）。
 *
 * 这是**绝大多数**场景该用的那个。
 */
export function degreeSemitoneMod12(degree: string): number | undefined {
  return DEGREE_SEMITONE_MOD12[degree]
}

/**
 * **复合音程**语义的查表（`'9' → 14`、`'13' → 21`），给和弦级数用。
 *
 * 🚨 与 `degreeSemitoneMod12` **不要混用**：混用会让音阶练习整体高一个八度
 * （表现为「目标音名对不上但音级看着没错」）。
 */
export function degreeToSemitone(degree: string): number | undefined {
  const base = DEGREE_SEMITONE_MOD12[degree]
  if (base === undefined) return undefined
  return COMPOUND_DEGREES.has(degree) ? base + 12 : base
}
