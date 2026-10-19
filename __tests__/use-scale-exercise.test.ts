/**
 * hooks/use-scale-exercise.ts 的契约测试（此前零覆盖）。
 *
 * 重点钉住「下一题」的内容正确性 —— 这条链路有两个容易静默出错的地方：
 *
 *  ① **预览快照过期**（2026-10-19 修复）：`nextScaleExerciseInfo` 是上一题生成时
 *     按当时的设置算好的，而设置面板在练习途中仍可改。修复前改了方向/换了音阶池，
 *     下一题仍用旧快照的 `sequence`；更糟的是 `scaleName` 不在池里时退到
 *     `selectedScales[0]`，序列却还是旧音阶的 ⇒ **题目序列与当前音阶不一致**
 *     （指板高亮/判定都会跟错）。现在的语义：指纹不符 ⇒ 按当前设置重新出题。
 *
 *  ② **3NPS 马拉松收尾的预览用错音阶**（同轮修复）：跑完最后一个把位时，
 *     预览已经跨到「下一个调 + 下一个音阶」，旧实现却用**当前**音阶去算把位，
 *     把别的音阶的位置画到指板上。
 *
 * 另有一条「设置没变时必须用预览」的反向钉子 —— 修复不能退化成「每次都重新出题」
 * （那样用户看到的下一题预览与实际出的题就不一致了）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { useScaleExercise } from '@/hooks/use-scale-exercise'
import { createTranslator } from '@/lib/i18n'
import { SCALE_MODES } from '@/lib/page-theory-data'
import { generateScaleSequence, getNoteIndex } from '@/lib/page-theory-functions'
import { buildThreeNpsPositions } from '@/lib/three-notes-per-string'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Api = ReturnType<typeof useScaleExercise>
let api: Api | null

const TUNING = [4, 11, 7, 2, 9, 4] // 标准调弦，高音弦 → 低音弦（半音）
const FRET_COUNT = 15
const t = createTranslator('zh-CN')

function Probe() {
  api = useScaleExercise({ tuning: TUNING, fretCount: FRET_COUNT, t })
  return null
}

const mounted: Array<() => void> = []
function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  const unmount = () => {
    try { act(() => root.unmount()) } catch { /* 已拆过 */ }
    container.remove()
    api = null
  }
  mounted.push(unmount)
  return { unmount }
}

afterEach(() => {
  for (const u of mounted.splice(0)) { try { u() } catch { /* 已拆过 */ } }
  document.body.innerHTML = ''
})

const PENTA_MAJOR = SCALE_MODES.pentatonic[0]  // Major Pentatonic（1 2 3 5 6）
const PENTA_MINOR = SCALE_MODES.pentatonic[1]  // Minor Pentatonic（1 b3 4 5 b7）
const IONIAN = SCALE_MODES.majorScaleModes[0]  // 1 2 3 4 5 6 7（3NPS 只支持七声）

describe('generateScaleExercise：出题', () => {
  it('单音阶池：题目序列 = generateScaleSequence(该音阶, 形态, 方向)', () => {
    const h = mount()
    act(() => { api!.setSelectedScales([PENTA_MAJOR]) })
    act(() => { api!.setScalePracticeSequence('1to1') })
    act(() => { api!.setScaleDirection('up') })
    act(() => { api!.generateScaleExercise() })

    expect(api!.selectedScale.name).toBe('Major Pentatonic')
    expect(api!.scaleExerciseSequence).toEqual(generateScaleSequence(PENTA_MAJOR, '1to1', 'up'))
    expect(api!.scaleExerciseCurrentStep).toBe(0)
    h.unmount()
  })
})

describe('nextScaleExercise：预览与设置的一致性', () => {
  it('设置没变：严格采用预览的序列与音阶（不许每次都重新随机）', () => {
    const h = mount()
    act(() => { api!.setSelectedScales([PENTA_MAJOR]) })
    act(() => { api!.generateScaleExercise() })
    const preview = api!.nextScaleExerciseInfo!
    expect(preview).not.toBeNull()

    act(() => { api!.nextScaleExercise() })

    expect(api!.selectedScale.name).toBe(preview.scaleName)
    expect(api!.scaleExerciseSequence).toEqual(preview.sequence)
    h.unmount()
  })

  it('改了方向：预览作废，下一题按新方向生成（不沿用旧的 ascending 序列）', () => {
    const h = mount()
    act(() => { api!.setSelectedScales([PENTA_MAJOR]) })
    act(() => { api!.setScaleDirection('up') })
    act(() => { api!.generateScaleExercise() })

    act(() => { api!.setScaleDirection('down') })
    act(() => { api!.nextScaleExercise() })

    expect(api!.scaleExerciseSequence).toEqual(generateScaleSequence(PENTA_MAJOR, '1to1', 'down'))
    h.unmount()
  })

  it('把预览里那个音阶从池里换掉：下一题必须用池里的音阶重新算序列（不许「新音阶 + 旧序列」）', () => {
    const h = mount()
    act(() => { api!.setSelectedScales([PENTA_MAJOR]) })
    act(() => { api!.generateScaleExercise() })
    expect(api!.nextScaleExerciseInfo!.scaleName).toBe('Major Pentatonic')

    // 换池：大调五声 → 小调五声（两者音级不同，序列可区分）
    act(() => { api!.setSelectedScales([PENTA_MINOR]) })
    act(() => { api!.nextScaleExercise() })

    expect(api!.selectedScale.name).toBe('Minor Pentatonic')
    expect(api!.scaleExerciseSequence).toEqual(generateScaleSequence(PENTA_MINOR, '1to1', 'up'))
    // 反向钉子：旧实现的序列是大调五声的 ['1','2','3','5','6','1']
    expect(api!.scaleExerciseSequence).toContain('b3')
    h.unmount()
  })

  it('改了练习序列形态（1to1 → 3nps 的资格外形态）：下一题按新形态重新生成', () => {
    const h = mount()
    act(() => { api!.setSelectedScales([PENTA_MAJOR]) })
    act(() => { api!.setScalePracticeSequence('1to1') })
    act(() => { api!.generateScaleExercise() })

    // 五声音阶不满足 3NPS 资格 ⇒ isThreeNpsActive=false，走的仍是普通序列生成
    act(() => { api!.setScalePracticeSequence('3nps') })
    act(() => { api!.nextScaleExercise() })

    // 形态变了 ⇒ 预览失效 ⇒ 重新生成；序列仍必须是**已选池里的音阶**的序列
    expect(api!.selectedScale.name).toBe('Major Pentatonic')
    for (const label of api!.scaleExerciseSequence) {
      expect(PENTA_MAJOR.intervals, `序列里出现了不属于该音阶的音级 ${label}`).toContain(label)
    }
    h.unmount()
  })
})

describe('3NPS：马拉松收尾的下一把位预览', () => {
  it('跑完最后一个把位：预览按「下一个调 + 下一个音阶」算，而不是当前音阶', () => {
    const h = mount()
    act(() => { api!.setSelectedScales([IONIAN]) })
    act(() => { api!.setScalePracticeSequence('3nps') })
    act(() => { api!.setScaleRootMovement('upSemiTone') })
    act(() => { api!.generateScaleExercise() })

    const lastIndex = api!.threeNpsPositionOptions.at(-1)!.index
    act(() => { api!.handleThreeNpsPositionChange(lastIndex) })

    const info = api!.nextScaleExerciseInfo!
    expect(info.threeNps, '最后一个把位之后应跨到新调/新音阶并把位回到第 1 个').not.toBeNull()
    expect(info.key, 'upSemiTone 推进后调性必须变（否则本用例区分不出新旧实现）')
      .not.toBe('C')

    // 把当前把位「跑完」⇒ 目标音为空 ⇒ 预览格子生效
    act(() => { api!.setScaleExerciseCurrentStep(api!.threeNpsView!.stepTotal) })

    const expectedPosition = buildThreeNpsPositions({
      rootPitchClass: getNoteIndex(info.key),
      intervals: IONIAN.notes,
      degreeLabels: IONIAN.intervals,
      tuning: TUNING,
      maxFret: FRET_COUNT,
    })[info.threeNps!.positionIndex]
    // steps 含「上行 + 下行」两遍 ⇒ 同一格会出现两次；预览用的是 Map（天然去重）
    const expectedKeys = [...new Set(expectedPosition.steps.map((s) => `${s.stringIndex}-${s.fret}`))].sort()

    expect([...api!.nextThreeNpsCells.keys()].sort()).toEqual(expectedKeys)
    h.unmount()
  })
})
