/**
 * 调式图鉴 + 音程探索的**内容与判定数据**（展示方式参考 myfretboardtrainer.com）。
 *
 * 这里只放「内容」（每个调式的教学文字、音程互补对的分组）与**纯函数**；
 * 渲染（迷你指板、配色 class、图例）在 components/theory-panel.tsx。
 *
 * 🚨 对齐契约：`ModeFamily.modes[].name` 必须与 `SCALE_MODES[dataKey]` 里条目的
 * `name` **逐字相同**（含空格与大小写）—— 组件靠它查 notes/intervals/formula。
 * 护栏见 __tests__/theory-mode-guide.test.ts。
 */

import { SCALE_MODES } from '@/lib/page-theory-data'

export interface ModeInfo {
  /** 与 SCALE_MODES 对应族条目逐字相同的英文名（对齐键） */
  name: string
  /** 特征：这个调式相对基准改动了哪个音级、什么色彩 */
  descZh: string
  descEn: string
  /** 用法：配什么和弦 / 什么风格 */
  usageZh: string
  usageEn: string
}

export interface ModeFamily {
  id: 'major' | 'harmonicMinor' | 'melodicMinor'
  /** SCALE_MODES 的键 */
  dataKey: 'majorScaleModes' | 'harmonicMinorScaleModes' | 'melodicMinorScaleModes'
  /** i18n 键：theory_modes_family_major / _harmonic / _melodic */
  nameKey: 'theory_modes_family_major' | 'theory_modes_family_harmonic' | 'theory_modes_family_melodic'
  modes: ModeInfo[]
}

export const MODE_FAMILIES: ModeFamily[] = [
  {
    id: 'major',
    dataKey: 'majorScaleModes',
    nameKey: 'theory_modes_family_major',
    modes: [
      {
        name: 'Ionian',
        descZh: '标准自然大调，明亮稳定，是其余调式的对照基准。',
        descEn: 'The reference major scale: bright, stable, the baseline all other modes are heard against.',
        usageZh: '大调和弦进行、流行与乡村旋律的默认选择。',
        usageEn: 'Default choice for major progressions, pop and country melodies.',
      },
      {
        name: 'Dorian',
        descZh: '小调但六音还原（小三度 + 大六度），比自然小调亮一层。',
        descEn: 'Minor with a natural 6th (b3 + 6): one shade brighter than natural minor.',
        usageZh: '单一小七和弦上的律动（i7）、放克与爵士小调。',
        usageEn: 'One-chord i7 vamps, funk and jazz minor.',
      },
      {
        name: 'Phrygian',
        descZh: '降二音紧贴根音，暗色、紧张、带异域感。',
        descEn: 'The b2 hugging the root: dark, tense, exotic.',
        usageZh: '西班牙弗拉明戈、金属 riff。',
        usageEn: 'Spanish flamenco and metal riffs.',
      },
      {
        name: 'Lydian',
        descZh: '升四音取代纯四度，悬浮、梦幻、失去「回家」的重力。',
        descEn: '#4 replacing the perfect 4th: floating and dreamy, pulls away from home.',
        usageZh: '大七升十一（maj7#11）色彩、电影配乐。',
        usageEn: 'maj7#11 colors, film scoring.',
      },
      {
        name: 'Mixolydian',
        descZh: '大调但七音降低 —— 属七和弦的本命调式。',
        descEn: 'Major with a b7: the natural mode of the dominant 7th chord.',
        usageZh: '属七和弦上的即兴、布鲁斯摇滚。',
        usageEn: 'Soloing over V7, blues-rock.',
      },
      {
        name: 'Aeolian',
        descZh: '自然小调基准，与 Dorian/Locrian 对照着记。',
        descEn: 'The natural minor reference; learn it against Dorian and Phrygian.',
        usageZh: '小调流行与摇滚进行。',
        usageEn: 'Minor pop and rock progressions.',
      },
      {
        name: 'Locrian',
        descZh: '降二又降五 —— 连纯五度都没有，最不稳定的调式。',
        descEn: 'b2 and b5: not even a perfect fifth, the least stable mode.',
        usageZh: '半减七和弦（m7b5），小调 ii-V-i 的 ii 级。',
        usageEn: 'm7b5 chords, the ii of a minor ii-V-i.',
      },
    ],
  },
  {
    id: 'melodicMinor',
    dataKey: 'melodicMinorScaleModes',
    nameKey: 'theory_modes_family_melodic',
    modes: [
      {
        name: 'Melodic Minor',
        descZh: '小调但六、七音都还原 —— 爵士小调的基准。',
        descEn: 'Minor with natural 6 and 7: the jazz-minor baseline.',
        usageZh: '小调大七和弦（mMaj7）、爵士小调 i 级。',
        usageEn: 'mMaj7 chords, the i of jazz minor.',
      },
      {
        name: 'Dorian b2',
        descZh: '多利亚的降二版：b2 + 大六度的组合。',
        descEn: 'Dorian with a b2: pairs b2 with the natural 6.',
        usageZh: '带 susb9 色彩的半减七、和声留白。',
        usageEn: 'susb9 half-diminished colors, harmonic ambiguity.',
      },
      {
        name: 'Lydian Augmented',
        descZh: '升四又升五 —— 五音之上全是亮音。',
        descEn: '#4 and #5: everything above the 3rd is raised.',
        usageZh: '大七升五（maj7#5）和弦。',
        usageEn: 'maj7#5 chords.',
      },
      {
        name: 'Lydian Dominant',
        descZh: '利底亚加降七：#4 与 b7 共存的属调式。',
        descEn: 'Lydian with a b7: #4 and b7 coexisting over a dominant.',
        usageZh: '属七升十一（7#11）。',
        usageEn: '7#11 dominant chords.',
      },
      {
        name: 'Mixolydian b6',
        descZh: '属七但六音降低，b6 是签名音。',
        descEn: 'Dominant with a b6; the b6 is the signature note.',
        usageZh: '属七降十三（7b13），小调的 V 级。',
        usageEn: '7b13 as the V of a minor key.',
      },
      {
        name: 'Locrian Nat 2',
        descZh: '洛克里亚但二音还原，保住 b9 之外的稳定感。',
        descEn: 'Locrian with a natural 2: keeps Locrian color without the b9.',
        usageZh: '半减七（m7b5），小调 ii-V-i 的 ii 级。',
        usageEn: 'm7b5 chords, the ii of a minor ii-V-i.',
      },
      {
        name: 'Altered',
        descZh: '降二、升二、降五、升五全都在 —— 变化最彻底的属调式。',
        descEn: 'b2, #2, b5, #5 all present: the most heavily altered dominant sound.',
        usageZh: '属七 alt（7alt），小调 V 级的终极选择。',
        usageEn: '7alt chords, the ultimate minor-key V.',
      },
    ],
  },
  {
    id: 'harmonicMinor',
    dataKey: 'harmonicMinorScaleModes',
    nameKey: 'theory_modes_family_harmonic',
    modes: [
      {
        name: 'Harmonic Minor',
        descZh: '小调但七音升高，b6–7 的增二度是它的签名。',
        descEn: 'Minor with a natural 7; the b6-to-7 augmented step is its signature.',
        usageZh: '古典小调、新古典金属。',
        usageEn: 'Classical minor, neoclassical metal.',
      },
      {
        name: 'Locrian Nat 6',
        descZh: '洛克里亚但六音还原，b5 仍在但多了亮音。',
        descEn: 'Locrian with a natural 6: b5 still there, one bright note added.',
        usageZh: '半减七，小调 ii-V-i 的 ii 级。',
        usageEn: 'm7b5 chords, the ii of a minor ii-V-i.',
      },
      {
        name: 'Ionian Augmented',
        descZh: '大调但五音升高，maj7#5 的本命调式。',
        descEn: 'Major with a #5: the native mode of maj7#5.',
        usageZh: '大七升五（maj7#5）。',
        usageEn: 'maj7#5 chords.',
      },
      {
        name: 'Dorian #4',
        descZh: '多利亚加升四，小调色彩里藏一个尖锐音。',
        descEn: 'Dorian with a #4: one sharp note hidden inside a minor color.',
        usageZh: '带 #4 的小调色彩、东方风味进行。',
        usageEn: 'Minor colors with a #4, Eastern-flavored progressions.',
      },
      {
        name: 'Phrygian Dominant',
        descZh: '弗里几亚但三音还原：b2 与 3 并存，属调式的暗面。',
        descEn: 'Phrygian with a natural 3: b2 and 3 coexisting, the dark dominant.',
        usageZh: '属七降九降十三（7b9b13）、弗拉明戈。',
        usageEn: '7b9b13 dominants, flamenco.',
      },
      {
        name: 'Lydian #9',
        descZh: '利底亚加升二，亮调式里最刺的一根刺。',
        descEn: 'Lydian with a #2: the sharpest sting inside a bright mode.',
        usageZh: '大七升九（maj7#9）色彩。',
        usageEn: 'maj7#9 colors.',
      },
      {
        name: 'Superlocrian bb7',
        descZh: '降七再降一次的超洛克里亚，全音阶味道的减色彩。',
        descEn: 'Super Locrian with a bb7: whole-tone-flavored diminished color.',
        usageZh: '减七与 7b9 色彩。',
        usageEn: 'dim7 and 7b9 colors.',
      },
    ],
  },
]

/** 音级 ↔ 半音（音程探索的 12 格标签，固定表 —— 与具体音阶无关） */
export const INTERVAL_DEGREE_LABELS = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']

/** 复合音程标签（和弦音位图用）：半音 → 标签；14/17/21 等是 9/11/13 */
const EXTENDED_DEGREE_LABELS: Record<number, string> = {
  14: '9', 15: 'b9', 16: '#9', 17: '11', 18: '#11', 21: '13', 22: 'b13',
}

/**
 * 和弦音 → 度数标签。`0` 显示 R（根音）。
 * 复合音程（9/11/13）优先查扩展表，避免被 %12 折成 2/5/6。
 */
export function chordToneLabel(intervalSemitones: number): string {
  if (intervalSemitones === 0) return 'R'
  return EXTENDED_DEGREE_LABELS[intervalSemitones] ?? INTERVAL_DEGREE_LABELS[intervalSemitones % 12] ?? String(intervalSemitones)
}

/**
 * 音程互补对分组：互为转位的两个音程在指板上**形状相同**，所以成组着色
 * （这也是 myfretboardtrainer 音程探索页的视觉逻辑）。
 * `labelZh/labelEn` 是图例文案；颜色 class 由组件映射。
 */
export interface IntervalGroup {
  id: 'root' | 'halfStep' | 'wholeStep' | 'thirdPair' | 'sixthPair' | 'perfect' | 'tritone'
  semitones: readonly number[]
  labelZh: string
  labelEn: string
}

export const INTERVAL_GROUPS: IntervalGroup[] = [
  { id: 'root', semitones: [0], labelZh: '同度 / 根音', labelEn: 'Root' },
  { id: 'halfStep', semitones: [1, 11], labelZh: '小二度 · 大七度', labelEn: 'Minor 2nd · Major 7th' },
  { id: 'wholeStep', semitones: [2, 10], labelZh: '大二度 · 小七度', labelEn: 'Major 2nd · Minor 7th' },
  { id: 'thirdPair', semitones: [3, 9], labelZh: '小三度 · 大六度', labelEn: 'Minor 3rd · Major 6th' },
  { id: 'sixthPair', semitones: [4, 8], labelZh: '大三度 · 小六度', labelEn: 'Major 3rd · Minor 6th' },
  { id: 'perfect', semitones: [5, 7], labelZh: '纯四度 · 纯五度', labelEn: 'Perfect 4th · 5th' },
  { id: 'tritone', semitones: [6], labelZh: '三全音', labelEn: 'Tritone' },
]

/** 半音（0-11）→ 互补对组 id；超出范围返回 undefined（调用方自行兜底） */
export function intervalGroupOf(semitone: number): IntervalGroup['id'] | undefined {
  return INTERVAL_GROUPS.find((g) => g.semitones.includes(semitone))?.id
}

/**
 * 调式的「父调」：各族第 1 个调式就是父音阶，第 i 个调式从父音阶的第 i+1 级开始 ——
 * 所以 父调根音 = (modeRoot − parent.notes[i]) mod 12。
 * 例：E 弗里几亚属（和声小调族 i=4）→ 父调 A 和声小调。
 */
export function parentKeyOf(
  dataKey: ModeFamily['dataKey'],
  modeIndex: number,
  rootPc: number,
): { parentPc: number; degree: number } {
  const family = SCALE_MODES[dataKey]
  const parent = family[0]
  const offset = parent.notes[modeIndex] ?? 0
  return { parentPc: (((rootPc - offset) % 12) + 12) % 12, degree: modeIndex + 1 }
}
