/**
 * 音阶练习序列生成 + 根音推进 —— 从 app/page.tsx 搬到 lib/page-theory-functions.ts
 * 的两个纯函数的行为断言。
 *
 * 为什么要补：这两个函数原先藏在巨石组件里（一个 108 行、一个 34 行），
 * 搬出来前**零测试覆盖**，而它们直接决定「音阶练习」出什么题。
 * 变成模块函数后可以用 Math.random 打桩，把随机分支也钉住。
 *
 * 同时锁住「入参 `scale.intervals` 不被就地修改」这条**可观测契约**。
 * 说明清楚这个断言的效力边界（已用定向变异实测）：
 *   - ✅ 能抓住：有人把某个分支改成在 `scale.intervals` 上就地改（例如别名后 `intervals.reverse()`）
 *   - ❌ 抓不住：单纯删掉那句 `[...(scale.intervals || [])]` 拷贝。
 *     因为现有每个分支都是**重新赋值**（`intervals = [...]`）而不是就地改，
 *     那句拷贝在当前代码里是**防御性冗余**，删了行为不变 —— 所以它不是安全网，
 *     只是让"不就地改入参"这条不变量在未来编辑中继续成立。
 * 这个边界写在这里，是为了避免下次有人以为"有测试兜着"而放心删掉拷贝。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateScaleSequence, getNextKeyByMovement } from '@/lib/page-theory-functions'
import { SCALE_MODES, NOTES } from '@/lib/page-theory-data'

// 注意：这些 scale 对象来自模块级共享常量 SCALE_MODES。
// 若直接把共享对象喂给被测函数，一旦被测函数（或未来某次改动）就地改了入参，
// 污染会**跨用例连锁**——后面所有用例都读到被改坏的对象，
// 表现为"一大批用例失败"，掩盖真正的原因（我实测过：单个就地改变异导致 8+ 个用例连锁失败）。
// 所以每个用例都用独立副本，让契约类断言能**单独**报错。
const IONIAN_SHAPE = SCALE_MODES.majorScaleModes[0] // 1 2 3 4 5 6 7
const PENTATONIC_SHAPE = SCALE_MODES.pentatonic[0] // 1 2 3 5 6
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

let IONIAN: typeof IONIAN_SHAPE
let PENTATONIC: typeof PENTATONIC_SHAPE

beforeEach(() => {
  IONIAN = clone(IONIAN_SHAPE)
  PENTATONIC = clone(PENTATONIC_SHAPE)
})

/** 固定 Math.random → 让随机分支可判定 */
const stubRandom = (...values: number[]) => {
  let i = 0
  return vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)])
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generateScaleSequence', () => {
  describe('首尾音规则：序列总是「首音 → 中间 → 同一个首音」', () => {
    it('1to1 / up：1 2 3 4 5 6 7 1', () => {
      expect(generateScaleSequence(IONIAN, '1to1', 'up')).toEqual([
        '1', '2', '3', '4', '5', '6', '7', '1',
      ])
    })

    it('3to3 / up：以三音起止，其余音依次跟上（3 4 5 6 7 1 2 3）', () => {
      expect(generateScaleSequence(IONIAN, '3to3', 'up')).toEqual([
        '3', '4', '5', '6', '7', '1', '2', '3',
      ])
    })

    it('5to5 / up：以五音起止（5 6 7 1 2 3 4 5）', () => {
      expect(generateScaleSequence(IONIAN, '5to5', 'up')).toEqual([
        '5', '6', '7', '1', '2', '3', '4', '5',
      ])
    })

    it('7to7 / up：以七音起止（7 1 2 3 4 5 6 7）', () => {
      expect(generateScaleSequence(IONIAN, '7to7', 'up')).toEqual([
        '7', '1', '2', '3', '4', '5', '6', '7',
      ])
    })
  })

  describe('方向', () => {
    it('down：中间音是原音阶的倒序（1 7 6 5 4 3 2 1）', () => {
      expect(generateScaleSequence(IONIAN, '1to1', 'down')).toEqual([
        '1', '7', '6', '5', '4', '3', '2', '1',
      ])
    })

    it('up_down：上行到顶再下行，顶音是首音的八度', () => {
      expect(generateScaleSequence(IONIAN, '1to1', 'up_down')).toEqual([
        '1', '2', '3', '4', '5', '6', '7', '1', '7', '6', '5', '4', '3', '2', '1',
      ])
    })

    it('up_down 的首尾音相同、长度是「上行段 × 2 + 1」', () => {
      const seq = generateScaleSequence(IONIAN, '1to1', 'up_down')
      expect(seq[0]).toBe(seq[seq.length - 1])
      // 上行段 8 个音（1..7 + 八度 1）→ 1 + 7 + 1 + 7 = 16？实际为 15：中间顶音共用
      expect(seq.length).toBe(15)
      expect(seq.filter((x) => x === '1').length).toBe(3) // 首、顶、尾
    })
  })

  describe('sequenceType = random：首尾音从和弦音（1/3/5/7）中选', () => {
    it('随机数取 0 → 选到三音，序列等同 3to3', () => {
      stubRandom(0)
      expect(generateScaleSequence(IONIAN, 'random', 'up')).toEqual([
        '3', '4', '5', '6', '7', '1', '2', '3',
      ])
    })

    it('随机数取 0.5 → 选到五音（候选顺序为 3、5、7）', () => {
      stubRandom(0.5)
      expect(generateScaleSequence(IONIAN, 'random', 'up')).toEqual([
        '5', '6', '7', '1', '2', '3', '4', '5',
      ])
    })

    it('音阶缺少 3/5/7 时回落到根音 1（不出 undefined）', () => {
      const onlyTwo = { name: 'TwoNote', notes: [0, 2], intervals: ['1', '2'], formula: '1 2' }
      stubRandom(0.9)
      const seq = generateScaleSequence(onlyTwo as typeof IONIAN, 'random', 'up')
      expect(seq[0]).toBe('1')
      expect(seq[seq.length - 1]).toBe('1')
      expect(seq).not.toContain(undefined)
    })
  })

  describe('order = random：首尾音从 1/3/5/7 中选，中间音是其余音的随机排列', () => {
    it('首尾音相同，中间音恰好是「音阶去掉首尾音」的一个排列', () => {
      stubRandom(0, 0.9)
      const seq = generateScaleSequence(IONIAN, '1to1', 'random')
      const head = seq[0]
      expect(['1', '3', '5', '7']).toContain(head)
      expect(seq[seq.length - 1]).toBe(head)

      const middle = seq.slice(1, -1)
      const expectedMiddle = IONIAN.intervals!.filter((i) => i !== head)
      expect([...middle].sort()).toEqual([...expectedMiddle].sort())
      expect(middle.length).toBe(expectedMiddle.length)
    })
  })

  describe('intervals 缺失时由 notes 换算音级', () => {
    it('notes [0,2,4,5,7,9,11] → 1 2 3 4 5 6 7', () => {
      const noIntervals = { name: 'X', notes: [0, 2, 4, 5, 7, 9, 11], formula: '' }
      expect(generateScaleSequence(noIntervals as typeof IONIAN, '1to1', 'up')).toEqual([
        '1', '2', '3', '4', '5', '6', '7', '1',
      ])
    })

    it('五声音阶（1 2 3 5 6）也能出序列，长度 = 音数 + 1', () => {
      const seq = generateScaleSequence(PENTATONIC, '1to1', 'up')
      expect(seq).toEqual(['1', '2', '3', '5', '6', '1'])
    })
  })

  describe('不改写入参（可观测契约；效力边界见文件头注释）', () => {
    it('order = down / up_down / random 都不得修改 scale.intervals', () => {
      const scale = { name: 'S', notes: [0, 2, 4], intervals: ['1', '2', '3'], formula: '1 2 3' }
      const before = [...scale.intervals]
      generateScaleSequence(scale as typeof IONIAN, '1to1', 'up')
      expect(scale.intervals).toEqual(before)
      generateScaleSequence(scale as typeof IONIAN, '1to1', 'down')
      generateScaleSequence(scale as typeof IONIAN, '1to1', 'up_down')
      generateScaleSequence(scale as typeof IONIAN, 'random', 'random')
      expect(scale.intervals).toEqual(before)
    })

    it('连续两次调用结果一致（第二次不因第一次的排列而改变）', () => {
      stubRandom(0)
      const a = generateScaleSequence(IONIAN, '1to1', 'down')
      const b = generateScaleSequence(IONIAN, '1to1', 'down')
      expect(a).toEqual(b)
    })
  })

  describe('边界', () => {
    it('intervals 与 notes 都为空时不抛异常', () => {
      const empty = { name: 'Empty', notes: [], intervals: [], formula: '' }
      expect(() => generateScaleSequence(empty as typeof IONIAN, '1to1', 'up')).not.toThrow()
    })
  })
})

describe('getNextKeyByMovement', () => {
  it('static：返回归一化后的原调', () => {
    expect(getNextKeyByMovement('C', 'static')).toBe('C')
    expect(getNextKeyByMovement('C#', 'static')).toBe('C♯') // # → ♯ 归一化
  })

  it('upSemiTone：升半音（升号调）', () => {
    expect(getNextKeyByMovement('C', 'upSemiTone')).toBe('C♯')
    expect(getNextKeyByMovement('E', 'upSemiTone')).toBe('F')
  })

  it('downSemiTone：降半音', () => {
    expect(getNextKeyByMovement('C', 'downSemiTone')).toBe('B')
    expect(getNextKeyByMovement('E', 'downSemiTone')).toBe('D♯')
  })

  it('降号调上走半音时用降号记谱（F 上行 → G♭ 而不是 F♯）', () => {
    expect(getNextKeyByMovement('F', 'upSemiTone')).toBe('G♭')
  })

  it('circleOfFifths：+7 个半音（纯五度），固定用升号', () => {
    expect(getNextKeyByMovement('C', 'circleOfFifths')).toBe('G')
    expect(getNextKeyByMovement('F', 'circleOfFifths')).toBe('C')
    expect(getNextKeyByMovement('B', 'circleOfFifths')).toBe('F♯')
  })

  it('circleOfFourths：+5 个半音（纯四度），固定用降号', () => {
    expect(getNextKeyByMovement('C', 'circleOfFourths')).toBe('F')
    expect(getNextKeyByMovement('G', 'circleOfFourths')).toBe('C')
    expect(getNextKeyByMovement('B', 'circleOfFourths')).toBe('E')
  })

  // 🚨 单步断言测不出这个 bug：卡住的那一步**看起来是合法的**（B♭ 的下一个四度
  // 又返回 B♭）。只有连续推进才能暴露 —— 实测修复前 C→F→B♭→B♭→B♭…
  // 根因：`preferFlat()` 返回 ♭ 名，而取下标用的是 `NOTES.indexOf()`（NOTES 只有
  // ♯ 系列）⇒ 下一轮 -1 ⇒ 原地返回自己。修法是改用 `getNoteIndex()`。
  it('circleOfFourths 连续推进 12 步必须走遍 12 个调并回到起点（不卡住）', () => {
    let key = 'C'
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      key = getNextKeyByMovement(key, 'circleOfFourths')
      seen.push(key)
    }
    expect(new Set(seen).size, `四度圈走不满 12 个调（卡住了）：${seen.join(' → ')}`).toBe(12)
    // 12 × 5 半音 = 60 ≡ 0 ⇒ 第 12 步回到起点
    expect(key, `四度圈 12 步后没回到起点：${seen.join(' → ')}`).toBe('C')
  })

  it('circleOfFifths 连续推进 12 步（对照组：走 ♯ 侧，本来就正常）', () => {
    let key = 'C'
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      key = getNextKeyByMovement(key, 'circleOfFifths')
      seen.push(key)
    }
    expect(new Set(seen).size, `五度圈走不满 12 个调：${seen.join(' → ')}`).toBe(12)
    expect(key, `五度圈 12 步后没回到起点：${seen.join(' → ')}`).toBe('C')
  })

  it('♭ 名入参也能继续推进（回归：B♭ → E♭，而不是原地不动）', () => {
    expect(getNextKeyByMovement('B♭', 'circleOfFourths')).toBe('E♭')
    expect(getNextKeyByMovement('A♭', 'circleOfFourths')).toBe('D♭')
  })

  it('random：从 12 个音里随机取（打桩后确定）', () => {
    stubRandom(0.999)
    expect(getNextKeyByMovement('C', 'random')).toBe('B') // NOTES[11]
    vi.restoreAllMocks()
    stubRandom(0)
    expect(getNextKeyByMovement('C', 'random')).toBe(NOTES[0])
  })

  it('无法识别的调名：原样返回，不做越界访问', () => {
    expect(getNextKeyByMovement('H', 'upSemiTone')).toBe('H')
    expect(getNextKeyByMovement('', 'circleOfFifths')).toBe('')
  })

  it('未知 movement：返回归一化后的调名（与其它分支口径一致，已修）', () => {
    // 修复前：`default: return currentKey` —— 同一个函数里两种"归一化"口径
    // （其它分支都经 preferSharp/preferFlat 返回 ♯/♭ 形式）。
    // 该分支在类型上不可达，但 movement 来自**持久化的 store**，
    // 脏值/历史值可能落进来，故按归一化兜底。
    expect(getNextKeyByMovement('C#', 'bogus' as never)).toBe('C♯')
    expect(getNextKeyByMovement('Bb', 'bogus' as never)).toBe('B♭')
  })
})
