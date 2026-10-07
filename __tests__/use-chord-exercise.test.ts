/**
 * hooks/use-chord-exercise.ts 的契约测试（此前零测试）。
 *
 * 它是和弦练习的页面级 state 容器 + 出题逻辑（从 app/page.tsx 原样搬出）：
 *   - `generateChordExercise`：选根音（可随机）→ 选类型（可随机）→ 选低音 → 生成音级序列
 *     → 设为当前题 → **预生成下一题**
 *   - `nextChordExercise`：用预生成的下一题顶上，并再预生成一题；没有预览时回退到重新出题
 *
 * 三条值得钉住的契约：
 *  ① 题目的 sequence 必须与纯函数 `generateChordSequence` 的结果**逐字一致**
 *     （页面靠 sequence 判分，不一致就会「弹出没反应」）；
 *  ② 空类型兜底为 'Major'、空序列退回上一题 —— 否则练习会静默卡住；
 *  ③ 「预生成下一题」这一机制：`nextChordExercise` 必须用预览（而不是重新随机），
 *     否则用户看到的「下一题预览」与实际出的题不一致。
 *
 * 注意：本 hook 暴露的 3 个 ref（targetChord / sequence / currentStep）**由页面
 * 同步**（app/page.tsx:906-908），hook 自身不写 ref —— 所以这里不测 ref 的即时性。
 */
import { describe, it, expect } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useChordExercise } from '@/hooks/use-chord-exercise'
import { generateChordSequence } from '@/lib/page-theory-functions'
import { NOTES } from '@/lib/page-theory-data'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Api = ReturnType<typeof useChordExercise>
let api: Api | null
function Probe() { api = useChordExercise(); return null }
function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  return {
    unmount() { act(() => root.unmount()); container.remove(); api = null },
  }
}

const LEVEL = 'three_chord_tones_root_3rd_5th' // 三和弦音（1-3-5），序列长度 3

// ---------------------------------------------------- 初值

describe('初值', () => {
  it('默认 C / Major / single_chord_tones_root / asc / root，题目与预览都为空', () => {
    const h = mount()
    expect(api!.chordExerciseRoot).toBe('C')
    expect(api!.chordExerciseTypes).toEqual(['Major'])
    expect(api!.chordExerciseLevel).toBe('single_chord_tones_root')
    expect(api!.chordExerciseOrder).toBe('asc')
    expect(api!.chordExerciseBass).toBe('root')
    expect(api!.chordExerciseCurrentStep).toBe(0)
    expect(api!.chordExerciseSequence).toEqual([])
    expect(api!.chordExerciseTargetChord).toBeNull()
    expect(api!.chordExerciseIsAnswered).toBe(false)
    expect(api!.nextChordExerciseInfo).toBeNull()
    h.unmount()
  })
})

// ---------------------------------------------------- 出题

describe('generateChordExercise', () => {
  it('固定根音/类型：sequence 与纯函数 generateChordSequence 逐字一致', () => {
    const h = mount()
    act(() => { api!.setChordExerciseLevel(LEVEL) })
    act(() => { api!.generateChordExercise() })

    expect(api!.chordExerciseTargetChord).toEqual({ root: 'C', type: 'Major' })
    expect(api!.chordExerciseSequence).toEqual(
      generateChordSequence('C', 'Major', LEVEL, 'asc', 'root', undefined)
    )
    expect(api!.chordExerciseSequence.length).toBeGreaterThan(1)
    expect(api!.chordExerciseCurrentStep).toBe(0)
    expect(api!.chordExerciseIsAnswered).toBe(false)
    h.unmount()
  })

  it('同时预生成下一题（预览非空）', () => {
    const h = mount()
    act(() => { api!.setChordExerciseLevel(LEVEL) })
    act(() => { api!.generateChordExercise() })
    const preview = api!.nextChordExerciseInfo!
    expect(preview).not.toBeNull()
    expect(preview.sequence.length).toBeGreaterThan(0)
    expect(preview.sequence).toEqual(
      generateChordSequence(preview.root, preview.type, LEVEL, 'asc', 'root', undefined)
    )
    h.unmount()
  })

  it('根音 random：题目根音取自 NOTES（下一题另随机，二者互不约束）', () => {
    const h = mount()
    act(() => { api!.setChordExerciseRoot('random') })
    act(() => { api!.generateChordExercise() })
    expect(NOTES).toContain(api!.chordExerciseTargetChord!.root)
    expect(NOTES).toContain(api!.nextChordExerciseInfo!.root)
    h.unmount()
  })

  it('类型从已选集合中随机；集合为空时兜底 Major', () => {
    const h = mount()
    act(() => { api!.setChordExerciseTypes(['Major', 'Minor']) })
    const seen = new Set<string>()
    for (let i = 0; i < 30; i++) {
      act(() => { api!.generateChordExercise() })
      seen.add(api!.chordExerciseTargetChord!.type)
    }
    expect([...seen].sort()).toEqual(['Major', 'Minor'])

    act(() => { api!.setChordExerciseTypes([]) })
    act(() => { api!.generateChordExercise() })
    expect(api!.chordExerciseTargetChord!.type).toBe('Major')
    h.unmount()
  })

  it('order=desc 时序列与 asc 不同（同一 level 的多音级序列会被重排）', () => {
    const h = mount()
    act(() => { api!.setChordExerciseLevel(LEVEL) })
    act(() => { api!.setChordExerciseOrder('asc') })
    act(() => { api!.generateChordExercise() })
    const asc = api!.chordExerciseSequence

    act(() => { api!.setChordExerciseOrder('desc') })
    act(() => { api!.generateChordExercise() })
    const desc = api!.chordExerciseSequence

    expect(desc).toEqual([...asc].reverse())
    h.unmount()
  })
})

// ---------------------------------------------------- 推进

describe('nextChordExercise', () => {
  it('有预览时：把预览顶上作为当前题（用预览，而不是重新出题）', () => {
    const h = mount()
    act(() => { api!.setChordExerciseLevel(LEVEL) })
    act(() => { api!.generateChordExercise() })

    // 关键：注入一个「可识别」的预览。若实现改成重新出题，这两个值不可能同时出现
    // （重新出题会用 C + 已选类型 + LEVEL 重新生成序列），从而把「是否真的用了预览」钉死。
    act(() => {
      api!.setNextChordExerciseInfo({ root: 'G', type: 'Minor', sequence: ['7', '9', '11'] })
    })
    act(() => { api!.nextChordExercise() })

    expect(api!.chordExerciseTargetChord).toEqual({ root: 'G', type: 'Minor' })
    expect(api!.chordExerciseSequence).toEqual(['7', '9', '11'])
    // 状态重置
    expect(api!.chordExerciseCurrentStep).toBe(0)
    expect(api!.chordExerciseIsAnswered).toBe(false)
    // 新的预览已生成
    expect(api!.nextChordExerciseInfo).not.toBeNull()
    h.unmount()
  })

  it('连续推进多次：每次严格采用上一次的预览', () => {
    const h = mount()
    act(() => { api!.setChordExerciseLevel(LEVEL) })
    act(() => { api!.generateChordExercise() })
    for (let i = 0; i < 4; i++) {
      act(() => {
        api!.setNextChordExerciseInfo({ root: 'A', type: 'Minor', sequence: [`m${i}`] })
      })
      act(() => { api!.nextChordExercise() })
      expect(api!.chordExerciseTargetChord).toEqual({ root: 'A', type: 'Minor' })
      expect(api!.chordExerciseSequence).toEqual([`m${i}`])
    }
    h.unmount()
  })

  it('没有预览时回退到重新出题（不会静默无反应）', () => {
    const h = mount()
    act(() => { api!.setChordExerciseLevel(LEVEL) })
    act(() => { api!.setNextChordExerciseInfo(null) })
    act(() => { api!.nextChordExercise() })
    expect(api!.chordExerciseTargetChord).not.toBeNull()
    expect(api!.chordExerciseSequence.length).toBeGreaterThan(0)
    expect(api!.nextChordExerciseInfo).not.toBeNull()
    h.unmount()
  })
})
