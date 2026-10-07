// 整幅指板数据层契约：**以参考站实测数据为 golden**。
//
// 取证方式（2026-10-03）：无头 Edge + CDP 打开 https://myfretboardtrainer.com/pentatonic/，
// 用真实鼠标事件逐档点击，读回每个 `.note` 的 class（`AColor` / `DCColor` / …）。
// 下面这些数字与格子表都是从那次抓取的 JSON 里直接抄下来的，
// 不是「按教科书推算」—— 推算过的部分（见 lib/fretboard-positions.ts 的注释）也用这份数据反验过。
//
// 覆盖到的坑：
//   · CAGED 档**只画形状按得到的音**（所以比 Arpeggios 档少 4 格）；
//   · 共享音是**环**上的相邻对（最后一对是 DC 而不是 CD）；
//   · 六档音集的音位数各不相同，任何一档改错都会在这张表上红。

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CAGED_ADJACENT_PAIRS,
  CAGED_FORM_COLORS,
  CAGED_FORM_ORDER,
  TRAINER_MODE_ORDER,
  TRAINER_MODES,
  getTrainerBoard,
  orderFormPair,
  type TrainerMode,
} from '@/lib/fretboard-trainer-theory'
import { getCagedFormCells, type FretboardConfig } from '@/lib/fretboard-positions'

/** 标准六弦（0 = 最高音弦 E，与 INSTRUMENT_CONFIG 同约定） */
const STD: FretboardConfig = { stringCount: 6, tuning: [4, 11, 7, 2, 9, 4] }
const FRET_COUNT = 15

/** 参考站 C 大调 CAGED 档的全部 22 格（`弦索引-品` → 形状） */
const CAGED_C_MAJOR: Record<string, string> = {
  '0-0': 'C|D',
  '0-3': 'A',
  '0-8': 'G|E',
  '0-12': 'C|D',
  '0-15': 'A',
  '1-1': 'C|D',
  '1-5': 'A|G',
  '1-8': 'E',
  '1-13': 'C|D',
  '2-0': 'C|D',
  '2-5': 'A|G',
  '2-9': 'E',
  '2-12': 'C|D',
  '3-2': 'C',
  '3-5': 'A|G',
  '3-10': 'E|D',
  '3-14': 'C',
  '4-3': 'C|A',
  '4-7': 'G',
  '4-10': 'E',
  '4-15': 'C|A',
  '5-8': 'G|E',
}

/** 参考站实测的每档音位数（C 大调 / C 小调，0–15 品） */
const NOTE_COUNTS: Record<TrainerMode, { major: number; minor: number }> = {
  caged: { major: 22, minor: 21 },
  arpeggio: { major: 26, minor: 24 },
  arp7: { major: 34, minor: 32 },
  pentatonic: { major: 42, minor: 41 },
  blues: { major: 49, minor: 49 },
  scale: { major: 59, minor: 56 },
}

/** 把 "form-C|D" 这类期望值规范化（形状顺序按环序，便于断言） */
const sortedForms = (role: string) =>
  role
    .replace('form-', '')
    .split('')
    .sort()
    .join('|')

describe('CAGED 档：与参考站逐格一致（C 大调）', () => {
  const board = getTrainerBoard('caged', 0, 'major', STD, FRET_COUNT)

  it('格子总数 = 22（参考站实测）', () => {
    expect(board.size).toBe(22)
  })

  it('每一格的形状归属都与参考站一致', () => {
    const actual: Record<string, string> = {}
    for (const [key, cell] of board) {
      const forms = cell.role.replace('form-', '').split('')
      actual[key] = forms.join('|')
    }
    const expected: Record<string, string> = {}
    for (const [key, v] of Object.entries(CAGED_C_MAJOR)) expected[key] = v

    // 逐格比对：多一格、少一格、形状归属错都会红
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())
    for (const key of Object.keys(expected)) {
      expect({ key, forms: sortedForms(`form-${actual[key]}`) }).toEqual({
        key,
        forms: sortedForms(`form-${expected[key]}`),
      })
    }
  })

  it('🚨 6 弦 0/3/12/15 品是 C 和弦音但**不在任何形状里** ⇒ CAGED 档不画（参考站实测如此）', () => {
    for (const fret of [0, 3, 12, 15]) {
      expect(board.has(`5-${fret}`)).toBe(false)
    }
    // 同样这几格在 Arpeggios 档**要**画（那边是与形状无关的「全部和弦音」）
    const arp = getTrainerBoard('arpeggio', 0, 'major', STD, FRET_COUNT)
    for (const fret of [0, 3, 12, 15]) {
      expect(arp.has(`5-${fret}`)).toBe(true)
    }
  })

  it('CAGED 档是 Arpeggios 档的子集（同一和弦音集，只少了形状外的音）', () => {
    const arp = getTrainerBoard('arpeggio', 0, 'major', STD, FRET_COUNT)
    for (const key of board.keys()) expect(arp.has(key)).toBe(true)
  })
})

describe('各档音位数：与参考站实测一致', () => {
  for (const mode of TRAINER_MODE_ORDER) {
    it(`${mode}：major ${NOTE_COUNTS[mode].major} / minor ${NOTE_COUNTS[mode].minor}`, () => {
      expect(getTrainerBoard(mode, 0, 'major', STD, FRET_COUNT).size).toBe(NOTE_COUNTS[mode].major)
      expect(getTrainerBoard(mode, 0, 'minor', STD, FRET_COUNT).size).toBe(NOTE_COUNTS[mode].minor)
    })
  }
})

describe('🚨 「一半一半」的判定：相邻形状对必须在 CAGED **环**上', () => {
  it('共享音格的 role 恰好是两个形状，且按环序拼（D 的后继回到 C ⇒ DC 而非 CD）', () => {
    const board = getTrainerBoard('caged', 0, 'major', STD, FRET_COUNT)
    const shared = [...board.entries()].filter(([, c]) => c.role.replace('form-', '').length === 2)
    expect(shared.length).toBe(14) // 22 格里 14 格是共享音
    for (const [, cell] of shared) {
      const pair = cell.role.replace('form-', '')
      expect(CAGED_ADJACENT_PAIRS.map(([a, b]) => `${a}${b}`)).toContain(pair)
    }
  })

  it('orderFormPair 对环上的相邻对给出确定顺序，对不相邻对返回 null', () => {
    expect(orderFormPair(['C', 'D'])).toBe('DC') // 环：D → C
    expect(orderFormPair(['C', 'A'])).toBe('CA')
    expect(orderFormPair(['A', 'G'])).toBe('AG')
    expect(orderFormPair(['G', 'E'])).toBe('GE')
    expect(orderFormPair(['E', 'D'])).toBe('ED')
    // 非相邻（C 与 G 隔了 A）不该有共享音
    expect(orderFormPair(['C', 'G'])).toBeNull()
    expect(orderFormPair(['A', 'E'])).toBeNull()
  })

  it('环的最后一对是 DC（不是 CD）—— 顺序反了就会画出「左紫右黄」而参考站是「左黄右紫」', () => {
    expect(CAGED_ADJACENT_PAIRS[CAGED_ADJACENT_PAIRS.length - 1]).toEqual(['D', 'C'])
  })

  it('形状出现的顺序表与图例一致（C A G E D）', () => {
    expect([...CAGED_FORM_ORDER]).toEqual(['C', 'A', 'G', 'E', 'D'])
    expect(CAGED_ADJACENT_PAIRS.length).toBe(5)
  })
})

describe('非 CAGED 档：按音级着色（root / default / seventh / blue）', () => {
  it('琶音档只有 root 与 default', () => {
    const board = getTrainerBoard('arpeggio', 0, 'major', STD, FRET_COUNT)
    const roles = new Set([...board.values()].map((c) => c.role))
    expect([...roles].sort()).toEqual(['default', 'root'])
  })

  it('属七琶音档多出 seventh（♭7），且数量与 root 相同（都是 8 格）', () => {
    const board = getTrainerBoard('arp7', 0, 'major', STD, FRET_COUNT)
    const count = (r: string) => [...board.values()].filter((c) => c.role === r).length
    expect(count('seventh')).toBe(8)
    expect(count('root')).toBe(8)
    expect(count('default')).toBe(18)
  })

  it('🚨 布鲁斯档的蓝调音单独成 role=blue：大调是 ♭3（7 格）、小调是 ♭5（8 格）', () => {
    // 参考站实测：blues_major_C 比 pentatonic_major_C 多出的 7 格全是 D♯/E♭（= ♭3），
    // blues_minor_C 比 pentatonic_minor_C 多出 8 格（= ♭5）。两种调式的蓝调音**不是同一个音级**。
    const major = getTrainerBoard('blues', 0, 'major', STD, FRET_COUNT)
    const majorBlue = [...major.values()].filter((c) => c.role === 'blue')
    expect(majorBlue.length).toBe(7)
    for (const cell of majorBlue) expect(cell.degree).toBe('♭3')

    const minor = getTrainerBoard('blues', 0, 'minor', STD, FRET_COUNT)
    const minorBlue = [...minor.values()].filter((c) => c.role === 'blue')
    expect(minorBlue.length).toBe(8)
    for (const cell of minorBlue) expect(cell.degree).toBe('♭5')
  })

  it('蓝调档 = 对应五声档 + 蓝调音（大调 42+7、小调 41+8）', () => {
    const extraKeys = (mode: TrainerMode, pent: TrainerMode, q: 'major' | 'minor') => {
      const base = getTrainerBoard(pent, 0, q, STD, FRET_COUNT)
      return [...getTrainerBoard(mode, 0, q, STD, FRET_COUNT).keys()].filter((k) => !base.has(k))
    }
    expect(extraKeys('blues', 'pentatonic', 'major').length).toBe(7)
    expect(extraKeys('blues', 'pentatonic', 'minor').length).toBe(8)
  })

  it('音阶档不用 seventh 色（只有属七琶音档用）', () => {
    const board = getTrainerBoard('scale', 0, 'major', STD, FRET_COUNT)
    const roles = new Set([...board.values()].map((c) => c.role))
    expect(roles.has('seventh')).toBe(false)
    expect([...roles].sort()).toEqual(['default', 'root'])
  })
})

describe('根音平移：整幅音位随根音移动，形状不重新发明', () => {
  it('C → E（+4 半音）后 DC 格整体右移 4 品（并保留低八度等价格）', () => {
    const pick = (root: number) =>
      [...getTrainerBoard('caged', root, 'major', STD, FRET_COUNT)]
        .filter(([, c]) => c.role === 'form-DC')
        .map(([k]) => k)
        .sort()

    expect(pick(0)).toEqual(['0-0', '0-12', '1-1', '1-13', '2-0', '2-12'])
    expect(pick(4)).toEqual(['0-4', '1-5', '2-4'])
  })

  it('非六弦标准调弦 ⇒ 无 CAGED 形状，整表为空（与 getCagedShapes 同约定）', () => {
    const bass: FretboardConfig = { stringCount: 4, tuning: [7, 2, 9, 4] }
    expect(getTrainerBoard('caged', 0, 'major', bass, FRET_COUNT).size).toBe(0)
    expect(getTrainerBoard('scale', 0, 'major', bass, FRET_COUNT).size).toBe(0)
  })
})

describe('🚨 八度展开：把位的上下界与步长都是承重的', () => {
  /**
   * 为什么需要这条：`getCagedFormCells` 为了覆盖「负品指型在低把位的等价格」，
   * 会把每个形状沿八度反复展开（`rootFret = base-36 … fretCount+12`，步长 12）。
   * 这三个参数（起点、步长、上界）**对单个根音看起来都无所谓** ——
   * 例如下面把上界从 `fretCount+12` 砍成 `fretCount`，C 大调那 22 格一格不少
   * （因为形状 offset 只在 -3…+3，窗口外的根音位置根本落不进来）。
   * 只有把**12 个根音 × 大小调**全跑一遍求和，差别才显出来 ⇒ 单根音的 golden 表天然漏它。
   *
   * 512 是实测值（不是从公式推的）。
   */
  it('12 个根音 × 大小调 的形状覆盖总量 = 512（0–15 品）', () => {
    let total = 0
    for (let root = 0; root < 12; root++) {
      for (const q of ['major', 'minor'] as const) {
        total += getCagedFormCells(root, STD, FRET_COUNT, q).size
      }
    }
    expect(total).toBe(512)
  })

  it('同一总量的第二个锚点：12 品窗口下 = 416（窗口裁剪会真的改变总量）', () => {
    let total = 0
    for (let root = 0; root < 12; root++) {
      for (const q of ['major', 'minor'] as const) {
        total += getCagedFormCells(root, STD, 12, q).size
      }
    }
    expect(total).toBe(416)
  })

  it('🚨 非根音的那一半也在计数里（守卫不是只覆盖 root=0）', () => {
    // root=0 与 root=1 的覆盖量必须不同 —— 相同就说明求和写错了（比如把 root 循环体写死）
    const sum = (root: number) =>
      (['major', 'minor'] as const).reduce((a, q) => a + getCagedFormCells(root, STD, FRET_COUNT, q).size, 0)
    expect(sum(0)).not.toBe(sum(1))
  })
})

describe('护栏：CSS 里的形状色必须与 lib 的单一真相源一致', () => {
  it('app/globals.css 的 --ft-form-* 与 CAGED_FORM_COLORS 逐个相同', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')
    for (const [form, color] of Object.entries(CAGED_FORM_COLORS)) {
      const pattern = new RegExp(`--ft-form-${form}:\\s*${color}\\s*;`, 'i')
      expect({ form, matched: pattern.test(css) }).toEqual({ form, matched: true })
    }
  })

  it('CSS 里每个相邻对都写了 40%/60% 的双色渐变（漏一个 ⇒ 该共享音变成纯色）', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')
    for (const [a, b] of CAGED_ADJACENT_PAIRS) {
      const pattern = new RegExp(
        `\\[data-role='form-${a}${b}'\\][^}]*background:\\s*linear-gradient\\(90deg,\\s*var\\(--ft-form-${a}\\)\\s*40%,\\s*var\\(--ft-form-${b}\\)\\s*60%\\)`,
      )
      expect({ pair: `${a}${b}`, matched: pattern.test(css) }).toEqual({ pair: `${a}${b}`, matched: true })
    }
  })

  it('只对相邻对写双色渐变 —— 不留 form-CG / form-CD 这类「不存在的共享音」', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')
    const shared = [...css.matchAll(/\[data-role='form-([A-G]{2})'\]/g)].map((m) => m[1])
    const legal = CAGED_ADJACENT_PAIRS.map(([a, b]) => `${a}${b}`)
    expect(shared.length).toBeGreaterThan(0)
    for (const pair of shared) expect(legal).toContain(pair)
  })
})

describe('音级表本身：每个形状都齐全、且半音与音级一一对应', () => {
  it('六档均有 major/minor 两套，且 semitones 与 degrees 长度一致、半音升序', () => {
    expect(TRAINER_MODE_ORDER.length).toBe(6)
    for (const mode of TRAINER_MODE_ORDER) {
      const def = TRAINER_MODES[mode]
      for (const q of ['major', 'minor'] as const) {
        expect({ mode, q, ok: def.semitones[q].length === def.degrees[q].length }).toEqual({ mode, q, ok: true })
        const asc = [...def.semitones[q]].sort((a, b) => a - b)
        expect({ mode, q, asc }).toEqual({ mode, q, asc: def.semitones[q] })
      }
    }
  })

  it('根音在两套调式下都是第 1 个音级（1）', () => {
    for (const mode of TRAINER_MODE_ORDER) {
      for (const q of ['major', 'minor'] as const) {
        expect(TRAINER_MODES[mode].semitones[q][0]).toBe(0)
        expect(TRAINER_MODES[mode].degrees[q][0]).toBe('1')
      }
    }
  })
})
