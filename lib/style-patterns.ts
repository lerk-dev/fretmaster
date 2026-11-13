// 风格 pattern 引擎（#5）：鼓 + 贝斯的「一小节 hit 表」。
//
// 设计要点：
//  ① 这里只有**数据 + 纯函数**，不碰 AudioContext —— 排程由
//     `hooks/use-metronome-scheduler.ts` 的 lookahead 循环完成（与节拍器同一个时钟，
//     所以鼓/贝斯/咔哒天然对齐，不需要第二套定时器）；
//  ② 网格是「拍 + 拍内 16 分位置」，不是绝对秒数 —— BPM 变化时整张表自动跟着缩放；
//  ③ 贝斯只记「取和弦的哪个音」（根/三/五/七），音高在排程时按当前和弦算，
//     换调、换和弦都不需要改表；
//  ④ 摇摆（swing）只影响每拍的**后半拍**：从 1/2 推迟到 2/3，即三连音感。
//     所以写摇摆风格时鼓和贝斯只用 sub 0 / sub 2，不要用 sub 1 / 3。
//
// ⚠️ 表按 4/4 写。拍号大于 4 时（6/8），第 5、6 拍没有 hit（留白），不做自动循环压缩——
//    把 4 拍 groove 硬塞进 6 拍会变成另一种律动，不如留白。
import { CHORD_TYPES } from '@/lib/page-theory-data'
import { getNoteIndex, normalizeChordType } from '@/lib/page-theory-functions'

/** 可选风格。新增风格 = 在 `STYLE_PATTERNS` 里加一项 + 补 i18n，不需要改排程代码。 */
export const ACCOMPANIMENT_STYLE_IDS = ['swing', 'bossa', 'rock'] as const
export type AccompanimentStyleId = (typeof ACCOMPANIMENT_STYLE_IDS)[number]

export function isAccompanimentStyleId(value: unknown): value is AccompanimentStyleId {
  return typeof value === 'string' && (ACCOMPANIMENT_STYLE_IDS as readonly string[]).includes(value)
}

export type DrumInstrument = 'kick' | 'snare' | 'hat' | 'ride'

/** 鼓点：`beat` 是小节内第几拍（0 起），`sub` 是该拍内的第几个 16 分（0..3） */
export interface DrumHit {
  beat: number
  sub: number
  instrument: DrumInstrument
  /** 0..1，最终音量 = velocity × 伴奏音量百分比 */
  velocity: number
}

/** 贝斯音：取和弦的第几个音（根 / 三 / 五 / 七） */
export type BassTone = 'root' | 'third' | 'fifth' | 'seventh'

export interface BassHit {
  beat: number
  sub: number
  tone: BassTone
  /** 八度偏移（0 = 低音区 C2..B2，1 = 高八度） */
  octave: number
  velocity: number
  /** 时值（以 16 分为单位） */
  lengthSubs: number
}

export interface StylePattern {
  id: AccompanimentStyleId
  /** i18n key（风格名） */
  nameKey: string
  /** 八分摇摆：每拍的后半拍推迟到 2/3 处 */
  swing: boolean
  drum: DrumHit[]
  bass: BassHit[]
}

/**
 * 风格表。
 *
 * - swing：ride 打 1、2&、3、4&（爵士 ride pattern），踩镲踏板 2、4，底鼓轻踩 1、3；
 *          贝斯走四分音符的根-五-三-五，最后一拍后半拍提前（push）。
 * - bossa：底鼓 1、3，军鼓边击 2&、4&，踩镲八分音符；贝斯根-五-根-八度，
 *          第 4 拍后半拍是提前音（bossa 的标志性 anticipation）。
 * - rock：底鼓 1、3、3&，军鼓 2、4（标准 backbeat），踩镲八分音符；贝斯根音铺底 + 五度。
 */
export const STYLE_PATTERNS: readonly StylePattern[] = [
  {
    id: 'swing',
    nameKey: 'style_swing',
    swing: true,
    drum: [
      { beat: 0, sub: 0, instrument: 'ride', velocity: 0.85 },
      { beat: 1, sub: 2, instrument: 'ride', velocity: 0.5 },
      { beat: 2, sub: 0, instrument: 'ride', velocity: 0.75 },
      { beat: 3, sub: 2, instrument: 'ride', velocity: 0.55 },
      { beat: 1, sub: 0, instrument: 'hat', velocity: 0.3 },
      { beat: 3, sub: 0, instrument: 'hat', velocity: 0.3 },
      { beat: 0, sub: 0, instrument: 'kick', velocity: 0.22 },
      { beat: 2, sub: 0, instrument: 'kick', velocity: 0.18 },
    ],
    bass: [
      { beat: 0, sub: 0, tone: 'root', octave: 0, velocity: 0.85, lengthSubs: 4 },
      { beat: 1, sub: 0, tone: 'fifth', octave: 0, velocity: 0.7, lengthSubs: 4 },
      { beat: 2, sub: 0, tone: 'third', octave: 0, velocity: 0.75, lengthSubs: 4 },
      { beat: 3, sub: 2, tone: 'fifth', octave: 0, velocity: 0.6, lengthSubs: 2 },
    ],
  },
  {
    id: 'bossa',
    nameKey: 'style_bossa',
    swing: false,
    drum: [
      { beat: 0, sub: 0, instrument: 'kick', velocity: 0.6 },
      { beat: 2, sub: 0, instrument: 'kick', velocity: 0.5 },
      { beat: 1, sub: 2, instrument: 'snare', velocity: 0.35 },
      { beat: 3, sub: 2, instrument: 'snare', velocity: 0.35 },
      { beat: 0, sub: 0, instrument: 'hat', velocity: 0.26 },
      { beat: 0, sub: 2, instrument: 'hat', velocity: 0.16 },
      { beat: 1, sub: 0, instrument: 'hat', velocity: 0.24 },
      { beat: 1, sub: 2, instrument: 'hat', velocity: 0.16 },
      { beat: 2, sub: 0, instrument: 'hat', velocity: 0.26 },
      { beat: 2, sub: 2, instrument: 'hat', velocity: 0.16 },
      { beat: 3, sub: 0, instrument: 'hat', velocity: 0.24 },
      { beat: 3, sub: 2, instrument: 'hat', velocity: 0.16 },
    ],
    bass: [
      { beat: 0, sub: 0, tone: 'root', octave: 0, velocity: 0.8, lengthSubs: 4 },
      { beat: 1, sub: 2, tone: 'fifth', octave: 0, velocity: 0.65, lengthSubs: 2 },
      { beat: 2, sub: 0, tone: 'root', octave: 0, velocity: 0.75, lengthSubs: 4 },
      { beat: 3, sub: 2, tone: 'root', octave: 1, velocity: 0.6, lengthSubs: 2 },
    ],
  },
  {
    id: 'rock',
    nameKey: 'style_rock',
    swing: false,
    drum: [
      { beat: 0, sub: 0, instrument: 'kick', velocity: 0.8 },
      { beat: 2, sub: 0, instrument: 'kick', velocity: 0.7 },
      { beat: 2, sub: 2, instrument: 'kick', velocity: 0.55 },
      { beat: 1, sub: 0, instrument: 'snare', velocity: 0.7 },
      { beat: 3, sub: 0, instrument: 'snare', velocity: 0.7 },
      { beat: 0, sub: 0, instrument: 'hat', velocity: 0.3 },
      { beat: 0, sub: 2, instrument: 'hat', velocity: 0.2 },
      { beat: 1, sub: 0, instrument: 'hat', velocity: 0.28 },
      { beat: 1, sub: 2, instrument: 'hat', velocity: 0.2 },
      { beat: 2, sub: 0, instrument: 'hat', velocity: 0.3 },
      { beat: 2, sub: 2, instrument: 'hat', velocity: 0.2 },
      { beat: 3, sub: 0, instrument: 'hat', velocity: 0.28 },
      { beat: 3, sub: 2, instrument: 'hat', velocity: 0.2 },
    ],
    bass: [
      { beat: 0, sub: 0, tone: 'root', octave: 0, velocity: 0.85, lengthSubs: 4 },
      { beat: 1, sub: 2, tone: 'root', octave: 0, velocity: 0.65, lengthSubs: 2 },
      { beat: 2, sub: 0, tone: 'fifth', octave: 0, velocity: 0.8, lengthSubs: 4 },
      { beat: 3, sub: 2, tone: 'fifth', octave: 0, velocity: 0.6, lengthSubs: 2 },
    ],
  },
]

/** 找不到（老数据 / 手改 localStorage）时回退到第一项，而不是让伴奏静音。 */
export function getStylePattern(id: string | null | undefined): StylePattern {
  return STYLE_PATTERNS.find((p) => p.id === id) ?? STYLE_PATTERNS[0]
}

/** 该拍上的鼓点（拍号 > 4 时多出来的拍自然返回空） */
export function drumHitsAtBeat(style: StylePattern, beat: number): DrumHit[] {
  return style.drum.filter((h) => h.beat === beat)
}

/** 该拍上的贝斯音 */
export function bassHitsAtBeat(style: StylePattern, beat: number): BassHit[] {
  return style.bass.filter((h) => h.beat === beat)
}

/**
 * 一小节内某个 16 分位置相对拍点的时刻偏移（秒）。
 *
 * 摇摆风格里每拍的**后半拍**（sub 2）从 1/2 推迟到 2/3 —— 这就是「三连音感」的
 * 全部秘密，不需要改 hit 表。sub 1 / 3 在摇摆风格里不推荐使用（这里按直音处理）。
 */
export function hitOffsetSeconds(sub: number, beatDurationSec: number, swing: boolean): number {
  const s = Math.max(0, Math.min(3, Math.round(sub)))
  if (swing && s === 2) return beatDurationSec * (2 / 3)
  return beatDurationSec * (s / 4)
}

/** 低音区基准：C2。贝斯音在此之上按根音 / 和弦音 / 八度叠加。 */
export const BASS_BASE_MIDI = 36

/**
 * 当前和弦 + hit 的 tone → MIDI 音高。
 * 三和弦没有七音时 `seventh` 回落成最后一个音（五度），避免整拍静音。
 */
export function bassMidiForChord(
  chord: { root: string; type: string },
  tone: BassTone,
  octave = 0,
  baseMidi = BASS_BASE_MIDI
): number | null {
  const rootPc = getNoteIndex(chord.root)
  if (rootPc < 0) return null
  const def = CHORD_TYPES.find((t) => t.name === normalizeChordType(chord.type))
  const intervals = def?.intervals ?? [0, 4, 7]
  const index = tone === 'root' ? 0 : tone === 'third' ? 1 : tone === 'fifth' ? 2 : 3
  const semitone = (intervals[index] ?? intervals[intervals.length - 1] ?? 0) % 12
  return baseMidi + rootPc + semitone + octave * 12
}
