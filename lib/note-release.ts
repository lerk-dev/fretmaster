// 「松音」检测：连续一段时间没有任何可用音高 ⇒ 认为这一下已经结束。
//
// 为什么需要它（2026-11-11，单音全指板）：
//   `lib/note-confirm.ts` 的 `firedNote` 锁只在**起音**时清空，这是为了「一次拨弦只计一次分」。
//   而「全指板找同一个音」整轮目标音不变，用户要反复弹同一个音名：
//   · 上一根弦还在响（或 AGC 抬高了底噪）时，新拨弦的帧间相对增量常常达不到 1.45×
//     ⇒ 判不出起音 ⇒ `firedNote` 一直是这个音名 ⇒ 第二个音迟迟不响应，甚至整轮都无响应。
//   · 正常模式下「命中即换题」，新目标音名不同，`firedNote !== note` 天然放行，所以这个问题
//     一直藏着没暴露。
//
// 修法不碰判定口径：只在「检测不到音高」持续 RELEASE_SILENCE_MS 后清空确认记忆
// （= 用户左手松开/护弦了），下一次拨弦即使没有起音信号也能重新计数。
// 持音（连续可检出）不会触发，所以不会把一次长音灌成多次命中。
//
// 三条收音路径（worklet / ScriptProcessor / Tauri）都要喂同一个 ref：
// 前两条能直接看到「这一帧没音高」，Tauri 只能在**下一条有效事件**上用时间间隔回推。

/** 连续多久没有可用音高就认为「松开了」（ms）。 */
export const RELEASE_SILENCE_MS = 120

export interface NoteReleaseState {
  /** 本段静音从哪一刻开始（ms）；null = 当前有音 */
  silentSince: number | null
  /** 本段静音是否已经触发过释放（避免持续静音时每帧都清一次确认记忆） */
  released: boolean
}

export function createNoteReleaseState(): NoteReleaseState {
  return { silentSince: null, released: false }
}

/**
 * 本帧没有可用音高。返回 true 表示**刚刚**跨过静音阈值，调用方应执行一次
 * `resetNoteConfirmState()`；同一段静音只会返回一次 true。
 */
export function markNoPitch(
  state: NoteReleaseState,
  nowMs: number,
  silenceMs: number = RELEASE_SILENCE_MS,
): boolean {
  if (state.silentSince === null) {
    state.silentSince = nowMs
    return false
  }
  if (!state.released && nowMs - state.silentSince >= silenceMs) {
    state.released = true
    return true
  }
  return false
}

/** 本帧检出了音高：结束本段静音，允许下一次静音再次触发释放。 */
export function markPitch(state: NoteReleaseState): void {
  state.silentSince = null
  state.released = false
}
