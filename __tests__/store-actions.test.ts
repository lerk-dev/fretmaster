/**
 * lib/store.ts 的 **action 落点矩阵**（此前覆盖 63%，缺口主要是那一串零测试的 setter）。
 *
 * 为什么不是「每个 setter 抄一行 expect」：那样只能验证「我写下的那个字段被改了」，
 * 验证不了「有没有顺手把兄弟字段改掉 / 改错了 slice」—— 而 store 是全局单例，
 * 一次误伤会扩散到整个应用且不报错。
 *
 * 这里对每个 action 做**全状态深比较**：动作前后逐叶子求差，
 * 断言「变化的叶子集合」恰好等于预期集合。因此这条用例同时钉住三件事：
 *   1. 预期字段确实被写成了预期值（值相等）；
 *   2. 没有多改任何其它叶子（无副作用）；
 *   3. 该 action 没有名字写错（找不到会直接 TypeError）。
 *
 * 之所以能直接比较「前」「后」两个 state 对象（而不是先深拷贝快照）：
 * zustand 的 set 只替换发生变化的 slice，未动的 slice 保持同一引用，
 * 而所有 updater 都是纯的（不原地改写），所以动作前拿到的 state 对象
 * 仍然完整保留着旧值。这也顺带成了「updater 不得原地改写」的断言 ——
 * 一旦有 updater 原地改旧对象，before 会被污染，差异集合立刻不对。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@/lib/store'
import type { CustomSong } from '@/lib/custom-song-editor'

const S = () => useAppStore.getState()

// ---------------------------------------------------------------- 快照 / 复位

/** 初始快照（JSON 深拷贝，天然丢掉 action 函数） */
const INIT = JSON.parse(JSON.stringify(S())) as Record<string, unknown>
/** 需要复位的数据键（函数键即 action，不动） */
const DATA_KEYS = Object.keys(S()).filter(
  (k) => typeof (S() as unknown as Record<string, unknown>)[k] !== 'function'
)

function resetAll() {
  const patch: Record<string, unknown> = {}
  for (const k of DATA_KEYS) patch[k] = JSON.parse(JSON.stringify(INIT[k] ?? null))
  useAppStore.setState(patch as never)
}

// ---------------------------------------------------------------- 逐叶子求差

interface Leaf {
  path: string
  from: unknown
  to: unknown
}

/** 求两个值的差异叶子集合。数组整体当一个叶子（元素级差异对 store 无意义且噪声大）。 */
function diff(a: unknown, b: unknown, prefix = ''): Leaf[] {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Object.is(a, b) ? [] : [{ path: prefix, from: a, to: b }]
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const out: Leaf[] = []
    const keys = new Set([...Object.keys(a), ...Object.keys(b as object)])
    for (const k of keys) {
      out.push(...diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k))
    }
    return out
  }
  return Object.is(a, b) ? [] : [{ path: prefix, from: a, to: b }]
}

// ---------------------------------------------------------------- 用例定义

interface Case {
  label: string
  /** 动作前的额外准备（如先收藏一条，再验证取消） */
  setup?: () => void
  /** 被验证的动作 */
  call: () => void
  /** 期望发生变化的叶子（含目标值）；集合需精确相等 */
  changed: Array<{ path: string; to: unknown }>
}

const song = (id: string): CustomSong => ({
  id, name: 'T', composer: '', beatsPerMeasure: 4, beatSize: 4,
  tempo: 120, key: 'C', chords: [], createdAt: 1, updatedAt: 1,
})


const CASES: Case[] = [
  // ---- UI
  { label: 'setActiveTab → activeTab', call: () => S().setActiveTab('stats'), changed: [{ path: 'activeTab', to: 'stats' }] },
  { label: 'toggleSidebar → 取反（false→true）', call: () => S().toggleSidebar(), changed: [{ path: 'sidebarCollapsed', to: true }] },
  { label: 'setSettingsOpen → settingsOpen', call: () => S().setSettingsOpen(true), changed: [{ path: 'settingsOpen', to: true }] },
  { label: 'toggleFullscreen → 取反（false→true）', call: () => S().toggleFullscreen(), changed: [{ path: 'isFullscreen', to: true }] },
  { label: 'setFullscreen → isFullscreen', call: () => S().setFullscreen(true), changed: [{ path: 'isFullscreen', to: true }] },
  { label: 'setDisplayScale → displayScale', call: () => S().setDisplayScale(1.25), changed: [{ path: 'displayScale', to: 1.25 }] },

  // ---- 练习 / 分数
  { label: 'setIsPlaying → isPlaying', call: () => S().setIsPlaying(true), changed: [{ path: 'isPlaying', to: true }] },
  {
    label: 'incrementScore(true) → correct+1 / total+1',
    call: () => S().incrementScore(true),
    changed: [{ path: 'score.correct', to: 1 }, { path: 'score.total', to: 1 }],
  },
  {
    label: 'incrementScore(false) → 只有 total+1（correct 不动）',
    call: () => S().incrementScore(false),
    changed: [{ path: 'score.total', to: 1 }],
  },
  {
    label: 'setScore(对象) → 整体替换',
    call: () => S().setScore({ correct: 2, total: 3 }),
    changed: [{ path: 'score.correct', to: 2 }, { path: 'score.total', to: 3 }],
  },
  {
    label: 'setScore(函数) → 基于前值计算（total 未被改动则不出现在差异里）',
    setup: () => S().setScore({ correct: 1, total: 1 }),
    call: () => S().setScore((prev) => ({ correct: prev.correct + 4, total: prev.total })),
    changed: [{ path: 'score.correct', to: 5 }],
  },
  {
    label: 'resetScore → 双字段归零',
    setup: () => S().incrementScore(true),
    call: () => S().resetScore(),
    changed: [{ path: 'score.correct', to: 0 }, { path: 'score.total', to: 0 }],
  },

  // ---- 音频
  { label: 'setMicEnabled → audio.micEnabled', call: () => S().setMicEnabled(true), changed: [{ path: 'audio.micEnabled', to: true }] },
  { label: 'setInputGain → audio.inputGain', call: () => S().setInputGain(2.5), changed: [{ path: 'audio.inputGain', to: 2.5 }] },
  { label: 'setConfidenceThreshold → audio.confidenceThreshold', call: () => S().setConfidenceThreshold(0.5), changed: [{ path: 'audio.confidenceThreshold', to: 0.5 }] },
  {
    label: 'setNoiseFloor(数字) → audio.noiseFloor（环境噪声校准结果）',
    call: () => S().setNoiseFloor(0.004),
    changed: [{ path: 'audio.noiseFloor', to: 0.004 }],
  },
  {
    label: 'setNoiseFloor(null) → audio.noiseFloor 变 undefined（清掉校准结果）',
    setup: () => S().setNoiseFloor(0.01),
    call: () => S().setNoiseFloor(null),
    changed: [{ path: 'audio.noiseFloor', to: undefined }],
  },
  { label: 'setSensitivity → audio.sensitivity', call: () => S().setSensitivity(0.9), changed: [{ path: 'audio.sensitivity', to: 0.9 }] },
  { label: 'setUseAudioWorklet → audio.useAudioWorklet', call: () => S().setUseAudioWorklet(false), changed: [{ path: 'audio.useAudioWorklet', to: false }] },
  { label: 'setSelectedAudioDevice → audio.selectedAudioDevice', call: () => S().setSelectedAudioDevice('dev-1'), changed: [{ path: 'audio.selectedAudioDevice', to: 'dev-1' }] },
  { label: 'setPitchAlgorithm → audio.pitchAlgorithm', call: () => S().setPitchAlgorithm('standard'), changed: [{ path: 'audio.pitchAlgorithm', to: 'standard' }] },
  { label: 'setBufferSize → audio.bufferSize', call: () => S().setBufferSize(1024), changed: [{ path: 'audio.bufferSize', to: 1024 }] },
  { label: 'setSampleRate → audio.sampleRate', call: () => S().setSampleRate(44100), changed: [{ path: 'audio.sampleRate', to: 44100 }] },
  { label: 'setNoiseSuppression → audio.noiseSuppression', call: () => S().setNoiseSuppression(30), changed: [{ path: 'audio.noiseSuppression', to: 30 }] },
  { label: 'setEnableHighPass → audio.enableHighPass', call: () => S().setEnableHighPass(false), changed: [{ path: 'audio.enableHighPass', to: false }] },
  { label: 'setEnableLowPass → audio.enableLowPass', call: () => S().setEnableLowPass(false), changed: [{ path: 'audio.enableLowPass', to: false }] },
  { label: 'setEnableNotch50 → audio.enableNotch50', call: () => S().setEnableNotch50(false), changed: [{ path: 'audio.enableNotch50', to: false }] },
  { label: 'setEnableNotch60 → audio.enableNotch60', call: () => S().setEnableNotch60(true), changed: [{ path: 'audio.enableNotch60', to: true }] },
  { label: 'setAudioBackend → audio.audioBackend', call: () => S().setAudioBackend('asio'), changed: [{ path: 'audio.audioBackend', to: 'asio' }] },
  { label: 'setDetectedPitch → detectedPitch（顶层，不进 audio）', call: () => S().setDetectedPitch('A4'), changed: [{ path: 'detectedPitch', to: 'A4' }] },
  { label: 'setDetectedCents → detectedCents（顶层）', call: () => S().setDetectedCents(12), changed: [{ path: 'detectedCents', to: 12 }] },

  // ---- 音频设备
  {
    label: 'setAudioDevices → audioDevice.devices',
    call: () => S().setAudioDevices([
      { deviceId: 'd1', label: 'mic', kind: 'audioinput', groupId: '' } as unknown as MediaDeviceInfo,
    ]),
    changed: [{ path: 'audioDevice.devices', to: [{ deviceId: 'd1', label: 'mic', kind: 'audioinput', groupId: '' }] }],
  },
  { label: 'setAudioInitializing → audioDevice.initializing', call: () => S().setAudioInitializing(true), changed: [{ path: 'audioDevice.initializing', to: true }] },
  { label: 'setAudioError → audioDevice.error', call: () => S().setAudioError('boom'), changed: [{ path: 'audioDevice.error', to: 'boom' }] },

  // ---- 练习设置
  { label: 'setPracticeTime → practice.practiceTime', call: () => S().setPracticeTime(600), changed: [{ path: 'practice.practiceTime', to: 600 }] },
  { label: 'setFretCount → practice.fretCount', call: () => S().setFretCount(20), changed: [{ path: 'practice.fretCount', to: 20 }] },
  { label: 'setAutoNextDelay → practice.autoNextDelay', call: () => S().setAutoNextDelay(2), changed: [{ path: 'practice.autoNextDelay', to: 2 }] },
  { label: 'setCooldownEnabled → practice.cooldownEnabled', call: () => S().setCooldownEnabled(true), changed: [{ path: 'practice.cooldownEnabled', to: true }] },
  { label: 'setCooldownDuration → practice.cooldownDuration', call: () => S().setCooldownDuration(500), changed: [{ path: 'practice.cooldownDuration', to: 500 }] },
  { label: 'setReferenceFrequency → practice.referenceFrequency', call: () => S().setReferenceFrequency(442), changed: [{ path: 'practice.referenceFrequency', to: 442 }] },
  { label: 'setFretZoneEnabled → practice.fretZoneEnabled', call: () => S().setFretZoneEnabled(true), changed: [{ path: 'practice.fretZoneEnabled', to: true }] },
  { label: 'setFretZoneStart → practice.fretZoneStart', call: () => S().setFretZoneStart(6), changed: [{ path: 'practice.fretZoneStart', to: 6 }] },
  { label: 'setFretZoneSize → practice.fretZoneSize', call: () => S().setFretZoneSize(7), changed: [{ path: 'practice.fretZoneSize', to: 7 }] },
  { label: 'setOctaveShiftEnabled → practice.octaveShiftEnabled', call: () => S().setOctaveShiftEnabled(true), changed: [{ path: 'practice.octaveShiftEnabled', to: true }] },
  { label: 'setOctaveShiftMode → practice.octaveShiftMode', call: () => S().setOctaveShiftMode('up'), changed: [{ path: 'practice.octaveShiftMode', to: 'up' }] },
  { label: 'setWeaknessWeightedEnabled → practice.weaknessWeightedEnabled', call: () => S().setWeaknessWeightedEnabled(true), changed: [{ path: 'practice.weaknessWeightedEnabled', to: true }] },

  // ---- 节拍器
  { label: 'setMetronomeEnabled → metronome.enabled', call: () => S().setMetronomeEnabled(true), changed: [{ path: 'metronome.enabled', to: true }] },
  { label: 'setMetronomeBpm → metronome.bpm', call: () => S().setMetronomeBpm(120), changed: [{ path: 'metronome.bpm', to: 120 }] },
  { label: 'setMetronomeSound → metronome.sound', call: () => S().setMetronomeSound(false), changed: [{ path: 'metronome.sound', to: false }] },
  { label: 'setMetronomeFlash → metronome.flash', call: () => S().setMetronomeFlash(true), changed: [{ path: 'metronome.flash', to: true }] },
  { label: 'setMetronomeVisualize → metronome.visualize（原本缺省，需新建键）', call: () => S().setMetronomeVisualize(true), changed: [{ path: 'metronome.visualize', to: true }] },
  {
    label: 'setMetronomeSettings → 只合并传入的键',
    call: () => S().setMetronomeSettings({ bpm: 100, sound: false }),
    changed: [{ path: 'metronome.bpm', to: 100 }, { path: 'metronome.sound', to: false }],
  },

  // ---- 反馈音
  { label: 'setFeedbackSoundEnabled → feedbackSound.enabled', call: () => S().setFeedbackSoundEnabled(false), changed: [{ path: 'feedbackSound.enabled', to: false }] },
  { label: 'setCorrectSoundEnabled → feedbackSound.correctSound', call: () => S().setCorrectSoundEnabled(false), changed: [{ path: 'feedbackSound.correctSound', to: false }] },
  { label: 'setWrongSoundEnabled → feedbackSound.wrongSound', call: () => S().setWrongSoundEnabled(false), changed: [{ path: 'feedbackSound.wrongSound', to: false }] },

  // ---- 和弦符号 / 各练习设置（Partial 合并）
  { label: 'setChordSymbolSettings → 只合并传入的键', call: () => S().setChordSymbolSettings({ useUnicode: false }), changed: [{ path: 'chordSymbols.useUnicode', to: false }] },
  { label: 'setScalePracticeSettings → 只合并传入的键', call: () => S().setScalePracticeSettings({ scaleKey: 'D' }), changed: [{ path: 'scalePractice.scaleKey', to: 'D' }] },
  { label: 'setIntervalPracticeSettings → 只合并传入的键', call: () => S().setIntervalPracticeSettings({ rootNote: 'E' }), changed: [{ path: 'intervalPractice.rootNote', to: 'E' }] },
  { label: 'setChordProgressionSettings → 只合并传入的键', call: () => S().setChordProgressionSettings({ selectedSongId: 'song-1' }), changed: [{ path: 'chordProgression.selectedSongId', to: 'song-1' }] },

  // ---- Focus
  { label: 'setFocusModeEnabled → focusMode.enabled', call: () => S().setFocusModeEnabled(true), changed: [{ path: 'focusMode.enabled', to: true }] },
  { label: 'setFocusModeSettings → 只合并传入的键', call: () => S().setFocusModeSettings({ showTimer: false }), changed: [{ path: 'focusMode.showTimer', to: false }] },
  { label: 'setFullscreenMode → focusMode.fullscreenMode', call: () => S().setFullscreenMode('fullscreen'), changed: [{ path: 'focusMode.fullscreenMode', to: 'fullscreen' }] },

  // ---- 用户设置
  { label: 'setInstrument → user.instrument', call: () => S().setInstrument('six_string_fourths'), changed: [{ path: 'user.instrument', to: 'six_string_fourths' }] },
  { label: 'setLanguage → user.language', call: () => S().setLanguage('en'), changed: [{ path: 'user.language', to: 'en' }] },
  { label: 'setTheme → user.theme', call: () => S().setTheme('ocean-dark'), changed: [{ path: 'user.theme', to: 'ocean-dark' }] },
  { label: 'setChordScaleDisplay → user.chordScaleDisplay', call: () => S().setChordScaleDisplay('jazz'), changed: [{ path: 'user.chordScaleDisplay', to: 'jazz' }] },
  { label: 'setNoteAccidentalDisplay → user.noteAccidentalDisplay', call: () => S().setNoteAccidentalDisplay('flat'), changed: [{ path: 'user.noteAccidentalDisplay', to: 'flat' }] },
  { label: 'setFretboardStyle → user.fretboardStyle', call: () => S().setFretboardStyle('guitarrun'), changed: [{ path: 'user.fretboardStyle', to: 'guitarrun' }] },
  { label: 'setPianoKeyboardStyle → user.pianoKeyboardStyle', call: () => S().setPianoKeyboardStyle('musmath'), changed: [{ path: 'user.pianoKeyboardStyle', to: 'musmath' }] },
  { label: 'setShowPracticeSuggestion → user.showPracticeSuggestion', call: () => S().setShowPracticeSuggestion(false), changed: [{ path: 'user.showPracticeSuggestion', to: false }] },
  { label: 'setCurrentPracticeSuggestion → currentPracticeSuggestion（顶层）', call: () => S().setCurrentPracticeSuggestion('练一下'), changed: [{ path: 'currentPracticeSuggestion', to: '练一下' }] },

  // ---- Premium
  { label: 'setPremiumFeature → premium.<feature>', call: () => S().setPremiumFeature('customTunings', false), changed: [{ path: 'premium.customTunings', to: false }] },

  // ---- 自定义歌曲
  { label: 'addCustomSong → 追加', call: () => S().addCustomSong(song('s1')), changed: [{ path: 'customSongs', to: [song('s1')] }] },
  { label: 'deleteCustomSong → 移除指定 id', setup: () => { S().addCustomSong(song('s1')); S().addCustomSong(song('s2')) }, call: () => S().deleteCustomSong('s1'), changed: [{ path: 'customSongs', to: [song('s2')] }] },
  { label: 'loadCustomSongs → 整体替换', setup: () => S().addCustomSong(song('s1')), call: () => S().loadCustomSongs([song('s9')]), changed: [{ path: 'customSongs', to: [song('s9')] }] },

  // ---- 收藏
  { label: 'toggleLevelFavorite → 加入', call: () => S().toggleLevelFavorite('lv-1'), changed: [{ path: 'favorites.levelFavorites', to: ['lv-1'] }] },
  { label: 'toggleLevelFavorite → 已在列表则移除', setup: () => S().toggleLevelFavorite('lv-1'), call: () => S().toggleLevelFavorite('lv-1'), changed: [{ path: 'favorites.levelFavorites', to: [] }] },
  { label: 'toggleSongFavorite → 加入', call: () => S().toggleSongFavorite('sg-1'), changed: [{ path: 'favorites.songFavorites', to: ['sg-1'] }] },
  { label: 'toggleSongFavorite → 已在列表则移除', setup: () => S().toggleSongFavorite('sg-1'), call: () => S().toggleSongFavorite('sg-1'), changed: [{ path: 'favorites.songFavorites', to: [] }] },
]

// ---------------------------------------------------------------- 执行

beforeEach(resetAll)

describe('action 落点矩阵：每个 action 只改自己那一个字段', () => {
  it('用例表非空且覆盖到全部数据键所在的 slice（防止被误删/清空后“全绿”）', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(75)
    const paths = new Set(CASES.flatMap((c) => c.changed.map((x) => x.path)))
    // 每个可持久化 slice 至少被一个 action 落到
    for (const slice of [
      'audio.', 'practice.', 'metronome.', 'feedbackSound.', 'focusMode.',
      'user.', 'premium.', 'chordSymbols.', 'scalePractice.',
      'intervalPractice.', 'chordProgression.',
    ]) {
      expect([...paths].some((p) => p.startsWith(slice)), `${slice} 无任何 action 被验证`).toBe(true)
    }
  })

  for (const c of CASES) {
    it(c.label, () => {
      resetAll()
      c.setup?.()

      const before = S()
      c.call()
      const after = S()

      const actual = diff(before, after)
        .map((l) => ({ path: l.path, from: l.from, to: l.to }))
        .sort((a, b) => a.path.localeCompare(b.path))
      const expected = c.changed
        .map((x) => ({ path: x.path, to: x.to }))
        .sort((a, b) => a.path.localeCompare(b.path))

      expect(actual.map((a) => ({ path: a.path, to: a.to }))).toEqual(expected)
    })
  }
})

describe('resetSettings 的作用范围（钉住现状，见文件末说明）', () => {
  it('只回默认 6 个 slice：audio / practice / metronome / feedbackSound / focusMode / user', () => {
    S().setMicEnabled(true)
    S().setMetronomeBpm(150)
    S().setFocusModeEnabled(true)
    S().setLanguage('en')
    S().setFeedbackSoundEnabled(false)
    S().setPracticeTime(999)
    S().setNoiseFloor(0.008)

    S().resetSettings()

    expect(S().audio.micEnabled).toBe(false)
    expect(S().metronome.bpm).toBe(80)
    expect(S().focusMode.enabled).toBe(false)
    expect(S().user.language).toBe('zh-CN')
    expect(S().feedbackSound.enabled).toBe(true)
    expect(S().practice.practiceTime).toBe(300)
    // 校准结果是 audio slice 的字段 ⇒ 跟着一起回默认（没有值 = 下次用 EMA 默认初值）
    expect(S().audio.noiseFloor).toBeUndefined()
  })

  it('**不**回默认 chordSymbols / scalePractice / intervalPractice / chordProgression / displayScale', () => {
    S().setChordSymbolSettings({ useUnicode: false })
    S().setScalePracticeSettings({ scaleKey: 'D' })
    S().setIntervalPracticeSettings({ rootNote: 'E' })
    S().setChordProgressionSettings({ selectedSongId: 'song-1' })
    S().setDisplayScale(1.5)

    S().resetSettings()

    expect(S().chordSymbols.useUnicode).toBe(false)
    expect(S().scalePractice.scaleKey).toBe('D')
    expect(S().intervalPractice.rootNote).toBe('E')
    expect(S().chordProgression.selectedSongId).toBe('song-1')
    expect(S().displayScale).toBe(1.5)
  })

  it('重置后的 slice 与 initialState 是**同一个对象引用**（共享默认值，见文末说明）', () => {
    // 无法直接引用模块内私有的 initialState，改用「两次重置拿到同一引用」来证明：
    // 若实现改成 {...initialState.audio} 之类的拷贝，两次重置就会是不同对象。
    S().setMicEnabled(true)
    S().resetSettings()
    const first = S().audio

    S().setMicEnabled(true)
    S().resetSettings()

    expect(S().audio).toBe(first)
  })
})
