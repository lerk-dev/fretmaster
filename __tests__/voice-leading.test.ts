/**
 * 声部连接（Voice Leading）与音级序列可达性契约。
 *
 * 覆盖三块此前零测试的核心逻辑（都在 lib/page-theory-functions.ts）：
 *   1. applyVoiceLeading —— 和弦转换练习的「上一个音 → 下一个和弦从哪个音级起」决策
 *   2. getNoteIndex      —— 上面那个函数的前置条件，也是 transposeChord 的前置条件
 *   3. isEquivalentNote  —— 按钮答题模式的判分依据
 *
 * 外加一条**跨全量 level × 和弦类型**的可达性契约：`getChordDegrees` 返回的每个音级
 * 都必须是 `intervalToSemitones` 的键。原因见下方 describe 内注释 —— 这条不满足时，
 * 练习界面会「完全没反应」（静默 return），是本项目最该防的失效形态。
 */
import { describe, it, expect } from 'vitest'
import {
  applyVoiceLeading,
  getNoteIndex,
  isEquivalentNote,
  getChordDegrees,
  generateChordSequence,
  intervalToSemitones,
} from '@/lib/page-theory-functions'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import { CHORD_TYPES } from '@/lib/page-theory-data'

describe('applyVoiceLeading —— 从离上一个音最近的音级起', () => {
  it('previousNote 为空（null / 空串）时原样返回，且返回同一引用', () => {
    const degrees = ['1', '3', '5']
    expect(applyVoiceLeading(degrees, 'C', null)).toBe(degrees)
    expect(applyVoiceLeading(degrees, 'C', '')).toBe(degrees)
  })

  it('degrees 为空时原样返回', () => {
    const empty: string[] = []
    expect(applyVoiceLeading(empty, 'C', 'E')).toBe(empty)
  })

  it('previousNote 无法识别时原样返回（含带八度的写法，见下方边界说明）', () => {
    const degrees = ['1', '3', '5']
    expect(applyVoiceLeading(degrees, 'C', 'X')).toBe(degrees)
    // ⚠️ 边界：getNoteIndex 不做八度剥离（'C4' 不是 NOTES/NOTES_FLAT 的成员），
    // 一旦调用方传入带八度的音名，声部连接会**静默失效**。
    // 现有两个调用点的 note 都来自 frequencyToNoteName()（无八度），所以当前安全。
    expect(getNoteIndex('C4')).toBe(-1)
    expect(applyVoiceLeading(degrees, 'C', 'C4')).toBe(degrees)
  })

  it('和弦根音无法识别时原样返回', () => {
    const degrees = ['1', '3', '5']
    expect(applyVoiceLeading(degrees, 'X', 'E')).toBe(degrees)
  })

  it('旋转到最近音级：C 和弦 + 上一个音 F♯ → 从 5 音起', () => {
    // F♯(6) 到 1(0)=6、到 3(4)=2、到 5(7)=1 → 最近是 5
    expect(applyVoiceLeading(['1', '3', '5'], 'C', 'F♯')).toEqual(['5', '1', '3'])
  })

  it('最近的本来就是第一个音级时原样返回', () => {
    // 上一个音 B(11)：到 1(0) 只差 1 个半音，最近
    const degrees = ['1', '3', '5']
    expect(applyVoiceLeading(degrees, 'C', 'B')).toBe(degrees)
  })

  it('七和弦四音级也按同一规则旋转', () => {
    // C: 1(0) 3(4) 5(7) b7(10)，上一个音 A(9)
    // 到 b7(10) 只差 1 个半音 → 从 b7 起
    expect(applyVoiceLeading(['1', '3', '5', 'b7'], 'C', 'A')).toEqual(['b7', '1', '3', '5'])
  })

  it('降号根音同样成立（B♭ 和弦 + 上一个音 D → 从 3 音起）', () => {
    expect(applyVoiceLeading(['1', '3', '5'], 'B♭', 'D')).toEqual(['3', '5', '1'])
  })

  it('等音写法结果一致（F♯ 与 G♭ 等价）', () => {
    const a = applyVoiceLeading(['1', '3', '5'], 'C', 'F♯')
    const b = applyVoiceLeading(['1', '3', '5'], 'C', 'G♭')
    expect(a).toEqual(b)
  })

  it('两音级到上一个音距离相同时，取靠前的那个（不旋转）', () => {
    // C 的 1(0) 与 3(4) 到 D(2) 都是 2 个半音 → 平局取 i=0
    const degrees = ['1', '3']
    expect(applyVoiceLeading(degrees, 'C', 'D')).toBe(degrees)
  })

  it('旋转不改变音级集合，且不改写入参（返回新数组）', () => {
    const degrees = ['1', '3', '5']
    const snapshot = [...degrees]
    const out = applyVoiceLeading(degrees, 'C', 'F♯')

    expect(degrees).toEqual(snapshot) // 入参未被就地修改
    expect(out).not.toBe(degrees) // 旋转后是新数组
    expect([...out].sort()).toEqual([...degrees].sort()) // 多重集不变
  })

  it('无法映射的音级不会被丢弃（只是可能被转到后面）', () => {
    const out = applyVoiceLeading(['1', 'bogus', '5'], 'C', 'F♯')
    expect(out).toHaveLength(3)
    expect([...out].sort()).toEqual(['1', '5', 'bogus'])
    // 最近的是 5 → 从它起；无法映射的项被保留在末尾
    expect(out).toEqual(['5', '1', 'bogus'])
  })
})

describe('getNoteIndex —— 音名 → 半音索引（applyVoiceLeading / transposeChord 的前置）', () => {
  it('自然音级', () => {
    expect(getNoteIndex('C')).toBe(0)
    expect(getNoteIndex('E')).toBe(4)
    expect(getNoteIndex('B')).toBe(11)
  })

  it('升号两种写法（# 与 ♯）都认', () => {
    expect(getNoteIndex('C#')).toBe(1)
    expect(getNoteIndex('C♯')).toBe(1)
    expect(getNoteIndex('F#')).toBe(6)
    expect(getNoteIndex('F♯')).toBe(6)
  })

  it('降号两种写法（b 与 ♭）都认', () => {
    expect(getNoteIndex('Db')).toBe(1)
    expect(getNoteIndex('D♭')).toBe(1)
    expect(getNoteIndex('Bb')).toBe(10)
    expect(getNoteIndex('B♭')).toBe(10)
  })

  it('无法识别时返回 -1（调用方必须自行兜底，不可当作 0）', () => {
    expect(getNoteIndex('')).toBe(-1)
    expect(getNoteIndex('X')).toBe(-1)
    expect(getNoteIndex('C4')).toBe(-1) // 不支持八度后缀
  })

  it('B♯ / Cb 这类音名不在表内 → -1（属已知局限，不是约定）', () => {
    // NOTES 有 12 项、NOTES_FLAT 也有 12 项，都不含 B♯ / C♭ / E♯ / F♭
    expect(getNoteIndex('B#')).toBe(-1)
    expect(getNoteIndex('Cb')).toBe(-1)
  })
})

describe('isEquivalentNote —— 等音判定（按钮答题模式的判分依据）', () => {
  it('同名字符串直接相等', () => {
    expect(isEquivalentNote('C', 'C')).toBe(true)
  })

  it('等音对（♯ 与 ♭ 写法）互相等价', () => {
    expect(isEquivalentNote('C#', 'Db')).toBe(true)
    expect(isEquivalentNote('C♯', 'D♭')).toBe(true)
    expect(isEquivalentNote('F#', 'Gb')).toBe(true)
    expect(isEquivalentNote('A#', 'Bb')).toBe(true)
  })

  it('不同的音不等价', () => {
    expect(isEquivalentNote('C', 'D')).toBe(false)
    expect(isEquivalentNote('C#', 'D')).toBe(false)
  })

  it('等音判定不区分大小写形式之外的自然音拼写', () => {
    expect(isEquivalentNote('E', 'Fb')).toBe(false) // 表内没有 Fb，按字面比较
  })
})

describe('getChordDegrees 的可达性契约：返回的每个音级都必须能被 intervalToSemitones 识别', () => {
  /**
   * 为什么这条值得单独测：练习匹配路径（audio / MIDI 都会经过）写的是
   *
   *   const semitone = intervalToSemitones[currentDegree]
   *   if (semitone === undefined) return     // ← 静默 return，界面无任何反馈
   *
   * 也就是说，只要某个 level × 和弦类型组合产出了 intervalToSemitones 里没有的音级，
   * 用户就会看到「练习完全没反应」——不报错、不提示，极难排查。
   * 这里用**全量笛卡尔积**遍历，把这类问题挡在测试里。
   */
  const allChordTypeNames = CHORD_TYPES.map((ct) => ct.name)

  it(`覆盖 ${ALL_PRACTICE_LEVELS.length} 个等级 × ${allChordTypeNames.length} 种和弦类型，音级全部可识别`, () => {
    const bad: string[] = []
    for (const level of ALL_PRACTICE_LEVELS) {
      for (const type of allChordTypeNames) {
        const degrees = getChordDegrees(type, level.id)
        for (const d of degrees) {
          if (!(d in intervalToSemitones)) {
            bad.push(`${level.id} / ${type} → 音级 "${d}"`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('同一契约在开启 bebop 经过音 / 固定自然五音选项时同样成立', () => {
    const bad: string[] = []
    for (const level of ALL_PRACTICE_LEVELS) {
      for (const type of ['7', 'Maj7', 'm7', 'm7b5', 'dim7', '7b9', '7#9']) {
        for (const options of [
          { usePassingNoteBebopScale: true },
          { forceNaturalFive: true },
          { endOnStartingInterval: true },
        ]) {
          for (const d of getChordDegrees(type, level.id, options)) {
            if (!(d in intervalToSemitones)) {
              bad.push(`${level.id} / ${type} / ${JSON.stringify(options)} → "${d}"`)
            }
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('每个等级 × 和弦类型都至少产出一个音级（否则练习会"卡住"）', () => {
    const empty: string[] = []
    for (const level of ALL_PRACTICE_LEVELS) {
      for (const type of allChordTypeNames) {
        if (getChordDegrees(type, level.id).length === 0) {
          empty.push(`${level.id} / ${type}`)
        }
      }
    }
    expect(empty).toEqual([])
  })

  /**
   * 上面那条全量契约最初**失败**在两个组合上（修复前返回空数组）：
   *   single_chord_tones_7th + Aug    —— 序列 [7]，但 wholeTone 只有 6 个音
   *   single_chord_tones_7th + dimMaj7 —— 序列 [8]，但 harmonicMinor 只有 7 个音
   * 两个类型都在和弦练习里可选（「全选」按钮会带上），所以这是用户可达的失效：
   * 音级序列为空 → 页面在 `if (currentStep >= degrees.length) return` 处静默返回，
   * 指板不高亮、也不会匹配，用户看到的是「练习没反应」。
   * 修复方式是把越界位置夹到音阶最高音，这里逐条钉住修复后的取值。
   */
  it('7 音关卡在「音阶不足 7 音 / 序列写 8」的和弦上也必须给出音级', () => {
    // wholeTone = ['1','2','3','#4','#5','b7']（6 音），位置 7 夹到 6 → b7
    expect(getChordDegrees('Aug', 'single_chord_tones_7th')).toEqual(['b7'])
    // harmonicMinor = ['1','2','b3','4','5','b6','7']（7 音），位置 8 夹到 7 → 7
    // （dimMaj7 的七音本就是大七度，两者一致）
    expect(getChordDegrees('dimMaj7', 'single_chord_tones_7th')).toEqual(['7'])
  })

  it('夹取兜底不会改变本来就有音级的组合（越界位置在正常组合里仍是跳过）', () => {
    // dim7 的七音序列是 [7]，diminishedWholeHalf 有 8 音 → 不触发兜底
    expect(getChordDegrees('dim7', 'single_chord_tones_7th')).toHaveLength(1)
    // [1..8] 这类八音序列在 7 音音阶上仍是「跳过 8」而不是夹成重复的 7
    expect(getChordDegrees('Maj7', 'single_chord_tones_root')).toEqual(['1'])
    const full = getChordDegrees('Maj7', 'four_chord_tones_root_3rd_5th_7th')
    expect(new Set(full).size).toBe(full.length) // 无重复音级
  })
})

describe('generateChordSequence —— 和弦练习的序列生成（与 getChordDegrees 共用同一映射）', () => {
  it('未知等级 id 返回空数组（调用方需自行兜底）', () => {
    expect(generateChordSequence('C', 'Maj7', 'no_such_level', 'asc', 'root')).toEqual([])
  })

  it('基础组合：根音关卡 + 大七和弦 → 只有根音', () => {
    expect(generateChordSequence('C', 'Maj7', 'single_chord_tones_root', 'asc', 'root')).toEqual(['1'])
  })

  it('同一「音级为空」缺陷在这里也必须被兜住（Aug / dimMaj7 + 7 音关卡）', () => {
    // 修复前两者都是 []，会让 use-chord-exercise 直接 break（练习无反应）
    expect(generateChordSequence('C', 'Aug', 'single_chord_tones_7th', 'asc', 'root')).toEqual(['b7'])
    expect(generateChordSequence('C', 'dimMaj7', 'single_chord_tones_7th', 'asc', 'root')).toEqual(['7'])
  })

  it('desc / random 只改变顺序，不改变音级集合', () => {
    const asc = generateChordSequence('C', 'Maj7', 'four_chord_tones_root_3rd_5th_7th', 'asc', 'root')
    const desc = generateChordSequence('C', 'Maj7', 'four_chord_tones_root_3rd_5th_7th', 'desc', 'root')
    expect(desc).toEqual([...asc].reverse())
    expect(asc).toHaveLength(4)
  })

  it('全量契约：每个等级 × 和弦类型都产出非空序列', () => {
    const empty: string[] = []
    for (const level of ALL_PRACTICE_LEVELS) {
      for (const type of CHORD_TYPES.map((ct) => ct.name)) {
        if (generateChordSequence('C', type, level.id, 'asc', 'root').length === 0) {
          empty.push(`${level.id} / ${type}`)
        }
      }
    }
    expect(empty).toEqual([])
  })
})

/**
 * `getIntervalsForLevel` 的删除记录（155 行，lib/page-theory-functions.ts 原 651-805）。
 *
 * 该函数的 19 个 `case` 用的都是**连字符短 id**（'single-root'、'quad-root-3-5-7' …），
 * 而它的唯一调用点位于 `getChordDegrees` 里 `if (practiceLevel) { … return }` 之后 ——
 * 只有「非空、不是任何 ALL_PRACTICE_LEVELS.id、也不是 'all'」的 level 才能走到。
 *
 * 全仓与 git 历史都确认过：这些短 id **从未**出现在任何 level 数据里
 * （首个提交里它们也只出现在 switch 自身；store 的 v1→v2 迁移只认
 * 'voice_led_voice_led_structure_1' 这类带前缀的旧 id）。故这段 switch 对全部
 * 真实输入都不可达，已删除，调用点改为直接映射和弦自身的 intervals。
 *
 * 下面把删除**会改变什么**显式钉住：连字符短 id 不再是特例，按「未知 level」处理。
 */
describe('getIntervalsForLevel 删除后的口径（未知 level → 和弦自身的全部音级）', () => {
  it('未知 level id 返回和弦的全部音级（不是空数组）', () => {
    expect(getChordDegrees('Maj7', 'no_such_level')).toEqual(['1', '3', '5', '7'])
    expect(getChordDegrees('m7', 'no_such_level')).toEqual(['1', 'b3', '5', 'b7'])
  })

  it('连字符短 id 不再被特例化（删除前 single-root 会返回 ["1"]）', () => {
    // 这是本次删除**唯一**的行为变化面：那些短 id 在删除前命中 case，
    // 删除后与其它未知 level 一样按「全部音级」处理。
    expect(getChordDegrees('Maj7', 'single-root')).toEqual(['1', '3', '5', '7'])
    expect(getChordDegrees('Maj7', 'quad-root-3-5-7')).toEqual(['1', '3', '5', '7'])
  })

  it('level 为 undefined / "all" 时仍走既有的兜底分支（未受删除影响）', () => {
    expect(getChordDegrees('Maj7')).toEqual(['1', '3', '5', '7'])
    expect(getChordDegrees('Maj7', 'all')).toEqual(['1', '3', '5', '7'])
    // 延伸和弦走 extendedChordMap，与 level 无关
    expect(getChordDegrees('9')).toEqual(['1', '3', '5', 'b7', '9'])
    // 特殊和弦的硬编码分支优先级高于 level
    expect(getChordDegrees('dim7')).toEqual(['1', 'b3', 'b5', 'bb7'])
    expect(getChordDegrees('m7b5')).toEqual(['1', 'b3', 'b5', 'b7'])
  })

  it('未知 level 时 forceNaturalFive / endOnStartingInterval 仍然生效', () => {
    const ALTERED = ['#5', 'b5', 'b13', '#11']
    const plain = getChordDegrees('7b5', 'no_such_level')
    const forced = getChordDegrees('7b5', 'no_such_level', { forceNaturalFive: true })
    expect(plain.some((d) => ALTERED.includes(d))).toBe(true)
    expect(forced.some((d) => ALTERED.includes(d))).toBe(false)

    const ended = getChordDegrees('Maj7', 'no_such_level', { endOnStartingInterval: true })
    expect(ended[ended.length - 1]).toBe(ended[0])
  })
})
