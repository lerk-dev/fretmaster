import { describe, it, expect } from 'vitest'
import {
  createNoteReleaseState,
  markNoPitch,
  markPitch,
  RELEASE_SILENCE_MS,
} from '@/lib/note-release'
import { createNoteConfirmState, confirmNote, resetNoteConfirmState } from '@/lib/note-confirm'

describe('note-release：静音判定（单音全指板的「同音连弹」前提）', () => {
  it('短于阈值的抖动不算松开', () => {
    const s = createNoteReleaseState()
    expect(markNoPitch(s, 0)).toBe(false)
    expect(markNoPitch(s, RELEASE_SILENCE_MS - 1)).toBe(false)
    expect(s.released).toBe(false)
  })

  it('静音满阈值只触发一次', () => {
    const s = createNoteReleaseState()
    markNoPitch(s, 0)
    expect(markNoPitch(s, RELEASE_SILENCE_MS)).toBe(true)
    expect(markNoPitch(s, RELEASE_SILENCE_MS + 50)).toBe(false)
  })

  it('重新出现音高后，下一段静音可以再次触发', () => {
    const s = createNoteReleaseState()
    markNoPitch(s, 0)
    expect(markNoPitch(s, 200)).toBe(true)
    markPitch(s)
    markNoPitch(s, 300)
    expect(markNoPitch(s, 500)).toBe(true)
  })

  it('有音高的帧会清掉静音起点', () => {
    const s = createNoteReleaseState()
    markNoPitch(s, 0)
    markPitch(s)
    expect(s.silentSince).toBeNull()
    expect(markNoPitch(s, 1000)).toBe(false)
  })
})

describe('note-release + note-confirm：同音连弹不会被 firedNote 永久锁死', () => {
  const frame = { frequency: 82.41, isNoteOnset: false, frameMs: 10 }
  const requiredFrames = 2

  it('没有松音复位时：同一个音只放行一次', () => {
    const state = createNoteConfirmState()
    const run = () =>
      [0, 1, 2].map(() => confirmNote({ ...frame, requiredFrames }, state))

    expect(run()).toEqual([false, true, false])
    // 持音（没有 reset）永远不会再放行
    expect(confirmNote({ ...frame, requiredFrames }, state)).toBe(false)
  })

  it('松音后 reset：同一个音可以再次放行（单音全指板整轮只找一个音）', () => {
    const state = createNoteConfirmState()
    expect(confirmNote({ ...frame, requiredFrames }, state)).toBe(false)
    expect(confirmNote({ ...frame, requiredFrames }, state)).toBe(true)
    expect(confirmNote({ ...frame, requiredFrames }, state)).toBe(false)

    // 静音满阈值 ⇒ 调用方会执行这一步
    resetNoteConfirmState(state)

    expect(confirmNote({ ...frame, requiredFrames }, state)).toBe(false)
    expect(confirmNote({ ...frame, requiredFrames }, state)).toBe(true)
  })
})
