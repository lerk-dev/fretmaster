/**
 * lib/store.ts 的契约测试（此前零测试）。
 *
 * store 是全局单例，管着「用户设置 / 收藏 / 自定义歌曲 / 课程进度」的持久化。
 * 其中最有价值、也最容易静默出错的是**老用户数据迁移**（`migratePersistedState`）——
 * 迁移逻辑写错不会抛异常，只会让老用户已选的练习等级 / 收藏失效。
 *
 * 为可测，本轮把原先内联在 persist options 里的 `migrate` 提为导出的
 * `migratePersistedState`，并导出 `remapLegacyLevelId` / `storePartialize`。
 * 这是**零行为变化**的提取（函数体逐字搬移）；partialize 仍以
 * `(state) => storePartialize(state)` 内联包裹，否则会破坏 zustand persist 的
 * 类型推断（具名常量的返回类型不参与 PersistedState 泛型推断）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useAppStore,
  parseTheme,
  composeTheme,
  isLightTheme,
  migratePersistedState,
  remapLegacyLevelId,
  storePartialize,
  type ThemeMode,
} from '@/lib/store'
import { logger } from '@/lib/logger'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import type { CustomSong } from '@/lib/custom-song-editor'

const LEVEL_IDS = new Set(ALL_PRACTICE_LEVELS.map((l) => l.id))

// 旧命名方案的等级 id（remapLegacyLevelId 显式表 + 前缀兜底覆盖的真实用例）
const LEGACY_LEVEL_IDS = [
  'chord_scales_chord_scale',
  'chord_scales_chord_scale_3rd_to_3rd',
  'chord_scales_chord_scale_5th_to_5th',
  'chord_scales_chord_scale_7th_to_7th',
  'chord_scales_chord_scale_random_starting_chord_tone',
  'chord_scales_chord_scale_random_starting_scale_tone',
  'four_chord_tones_root_3rd_5th_7th_random_inversions',
  'melodic_5th_to_9th_melodic_structure_10_random_inversions',
  'melodic_5th_to_9th_melodic_structure_6',
  'melodic_5th_to_9th_melodic_structure_7',
  'melodic_5th_to_9th_melodic_structure_8',
  'melodic_5th_to_9th_melodic_structure_9',
  'melodic_root_to_5th_melodic_structure_1',
  'melodic_root_to_5th_melodic_structure_2',
  'melodic_root_to_5th_melodic_structure_3',
  'melodic_root_to_5th_melodic_structure_4',
  'melodic_root_to_5th_melodic_structure_5_random_inversions',
  'passing_note_scales_passing_note_scale',
  'passing_note_scales_passing_note_scale_3rd_to_3rd',
  'passing_note_scales_passing_note_scale_5th_to_5th',
  'passing_note_scales_passing_note_scale_6th7th_to_6th7th',
  'passing_note_scales_passing_note_scale_random_starting_chord_tone',
  'suspended_suspended_2_resolution',
  'suspended_suspended_4_resolution',
  'three_chord_tones_root_3rd_5th_random_inversions',
  'voice_led_voice_led_structure_1',
  'voice_led_voice_led_structure_2',
  'voice_led_voice_led_structure_3',
  'voice_led_voice_led_structure_4',
  'voice_led_voice_led_structure_5',
]

// 已被合并掉的旧等级：迁移时应回退默认，且它们不应再出现在等级库里
const REMOVED_LEGACY_LEVEL_IDS = [
  'four_chord_tones_3rd_5th_7th_root_3rd',
  'four_chord_tones_5th_7th_root_3rd_5th',
  'four_chord_tones_7th_root_3rd_5th_7th',
]

const DEFAULT_LEVEL_ID = 'single_chord_tones_root'

// ---------------------------------------------------------------- 主题

describe('主题：parseTheme / composeTheme / isLightTheme', () => {
  const STYLES = [
    'classic', 'forest', 'ocean', 'sunset', 'monochrome', 'rose',
    'midnight', 'sand', 'celadon', 'lavender', 'carbon',
  ] as const

  it('parseTheme 与 composeTheme 全枚举互逆', () => {
    const failures: string[] = []
    for (const style of STYLES) {
      for (const brightness of ['dark', 'light'] as const) {
        const mode = composeTheme(style, brightness)
        const back = parseTheme(mode)
        if (back.style !== style || back.brightness !== brightness) {
          failures.push(`${style}/${brightness} → ${mode} → ${JSON.stringify(back)}`)
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('classic 风格的 ThemeMode 就是明暗本身（不带 -dark/-light 后缀）', () => {
    expect(composeTheme('classic', 'dark')).toBe('dark')
    expect(composeTheme('classic', 'light')).toBe('light')
  })

  it('isLightTheme 只对 light 与 *-light 为真', () => {
    expect(isLightTheme('light')).toBe(true)
    expect(isLightTheme('carbon-light')).toBe(true)
    expect(isLightTheme('dark')).toBe(false)
    expect(isLightTheme('carbon-dark')).toBe(false)
    expect(isLightTheme('midnight-dark')).toBe(false)
  })

  it('parseTheme 的 brightness 与 isLightTheme 判定一致', () => {
    const modes: ThemeMode[] = ['dark', 'light', 'forest-dark', 'forest-light', 'carbon-light']
    for (const m of modes) {
      expect(parseTheme(m).brightness === 'light', m).toBe(isLightTheme(m))
    }
  })
})

// ------------------------------------------------- 等级 id 迁移映射

describe('remapLegacyLevelId：旧等级 id → 新命名方案', () => {
  it('显式表里的每个旧 id 都映射到「等级库中真实存在」的 id', () => {
    const failures: string[] = []
    for (const oldId of LEGACY_LEVEL_IDS) {
      const mapped = remapLegacyLevelId(oldId)
      if (!mapped) failures.push(`${oldId} → null（应能映射）`)
      else if (!LEVEL_IDS.has(mapped)) failures.push(`${oldId} → ${mapped}（不在等级库）`)
    }
    expect(failures, `\n${failures.join('\n')}`).toEqual([])
  })

  it('映射结果不再带重复的分类前缀', () => {
    for (const oldId of LEGACY_LEVEL_IDS) {
      const mapped = remapLegacyLevelId(oldId)!
      // 去前缀后的兜底与显式表都遵循：结果不以旧分类前缀开头
      expect(mapped.startsWith('voice_led_voice_led_'), oldId).toBe(false)
    }
  })

  it('前缀兜底：去掉已知分类前缀；未知前缀返回 null', () => {
    expect(remapLegacyLevelId('voice_led_structure_x')).toBe('structure_x')
    expect(remapLegacyLevelId('suspended_foo')).toBe('foo')
    expect(remapLegacyLevelId('melodic_root_to_5th_foo')).toBe('foo')
    expect(remapLegacyLevelId('some_unrelated_id')).toBeNull()
  })

  it('已被合并掉的旧等级 id 不在等级库里（否则不应被“移除”）', () => {
    for (const id of REMOVED_LEGACY_LEVEL_IDS) {
      expect(LEVEL_IDS.has(id), `${id} 又回到等级库了，请重新评估迁移逻辑`).toBe(false)
    }
  })
})

// ------------------------------------------------------- migrate

describe('migratePersistedState：老用户数据迁移', () => {
  it('非对象输入返回默认 state（不崩）', () => {
    expect(migratePersistedState(null, 0).activeTab).toBe('practice')
    expect(migratePersistedState('bad', 0).activeTab).toBe('practice')
    expect(migratePersistedState(123, 0).activeTab).toBe('practice')
  })

  it('缺失 focusMode / user 时补默认值', () => {
    const out = migratePersistedState({}, 1)
    expect(out.focusMode.enabled).toBe(false)
    expect(out.focusMode.fullscreenMode).toBe('windowed')
    expect(out.user.language).toBe('zh-CN')
    expect(out.user.theme).toBe('dark')
  })

  it('focusMode 存在但字段缺失时逐个补齐', () => {
    const out = migratePersistedState({ focusMode: { enabled: true } }, 1)
    expect(out.focusMode.enabled).toBe(true) // 已有值保留
    expect(out.focusMode.fullscreenMode).toBe('windowed')
    expect(out.focusMode.enableWakeLock).toBe(true)
    expect(out.focusMode.enableFullscreen).toBe(true)
  })

  it('user 存在但字段缺失时逐个补齐（含 language / instrument / showPracticeSuggestion）', () => {
    const out = migratePersistedState({ user: { theme: 'ocean-dark' } }, 1)
    expect(out.user.theme).toBe('ocean-dark') // 已有值保留
    expect(out.user.language).toBe('zh-CN')
    expect(out.user.instrument).toBe('six_string_guitar')
    expect(out.user.chordScaleDisplay).toBe('chinese')
    expect(out.user.noteAccidentalDisplay).toBe('sharp')
    expect(out.user.showPracticeSuggestion).toBe(true)
    // 后加的嵌套字段：merge 是顶层浅合并 ⇒ user 整个被老 blob 替换 ⇒ 不在这里补就永久 undefined
    expect(out.user.fretboardStyle).toBe('classic')
    expect(out.user.pianoKeyboardStyle).toBe('classic')
  })

  it('user 里已有 fretboardStyle 时不被覆盖（尊重用户选择）', () => {
    expect(migratePersistedState({ user: { fretboardStyle: 'guitarrun' } }, 1).user.fretboardStyle).toBe(
      'guitarrun',
    )
  })

  it('user 里已有 pianoKeyboardStyle 时不被覆盖（尊重用户选择）', () => {
    expect(
      migratePersistedState({ user: { pianoKeyboardStyle: 'musmath' } }, 1).user.pianoKeyboardStyle,
    ).toBe('musmath')
  })

  it('老语言标记 zh 迁到 zh-CN', () => {
    expect(migratePersistedState({ user: { language: 'zh' } }, 1).user.language).toBe('zh-CN')
    // 已是 zh-CN / en 的不受影响
    expect(migratePersistedState({ user: { language: 'en' } }, 1).user.language).toBe('en')
  })

  it('顶层 fullscreenMode 迁到 isFullscreen 并删掉旧键', () => {
    const out = migratePersistedState({ fullscreenMode: true }, 1)
    expect(out.isFullscreen).toBe(true)
    expect('fullscreenMode' in out).toBe(false)
  })

  it('v1→v2：可映射的等级 id 迁到新 id', () => {
    const out = migratePersistedState(
      { chordProgression: { selectedLevelId: 'voice_led_voice_led_structure_1' } },
      1
    )
    expect(out.chordProgression.selectedLevelId).toBe('voice_led_structure_1')
  })

  it('v1→v2：已被合并掉的等级回退默认等级', () => {
    for (const removed of REMOVED_LEGACY_LEVEL_IDS) {
      const out = migratePersistedState({ chordProgression: { selectedLevelId: removed } }, 1)
      expect(out.chordProgression.selectedLevelId, removed).toBe(DEFAULT_LEVEL_ID)
    }
  })

  it('v1→v2：收藏列表同样迁移，且被合并掉的条目被剔除、其它条目保留', () => {
    const out = migratePersistedState(
      {
        favorites: {
          levelFavorites: [
            'chord_scales_chord_scale',
            ...REMOVED_LEGACY_LEVEL_IDS,
            'suspended_suspended_2_resolution',
          ],
        },
      },
      1
    )
    expect(out.favorites.levelFavorites).toEqual(['chord_scale', 'suspended_2_resolution'])
  })

  it('v1→v2 迁移后的等级 id 必定真实存在于等级库', () => {
    const out = migratePersistedState(
      { favorites: { levelFavorites: [...LEGACY_LEVEL_IDS] } },
      1
    )
    for (const id of out.favorites.levelFavorites) {
      expect(LEVEL_IDS.has(id), `${id} 不在等级库`).toBe(true)
    }
  })

  it('version >= 2 时不再改动等级 id（迁移是幂等的）', () => {
    const out = migratePersistedState(
      { chordProgression: { selectedLevelId: 'voice_led_voice_led_structure_1' } },
      2
    )
    expect(out.chordProgression.selectedLevelId).toBe('voice_led_voice_led_structure_1')
  })

  it('focusMode 里 enabled 缺省时补 false（已有值时不动）', () => {
    const out = migratePersistedState({ focusMode: { showTimer: false } as never }, 1)
    expect(out.focusMode.enabled).toBe(false)
    expect((out.focusMode as { showTimer: boolean }).showTimer).toBe(false)
  })

  it('迁移中途抛错时不向上抛，回落到默认 state 并记日志（老用户不至于白屏）', () => {
    const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => { /* 静音 */ })

    // focusMode 是数字：!persistedState.focusMode 为假 → 走进 else 分支 →
    // 给原始值挂属性在严格模式下抛 TypeError → 被 catch 兜住
    const out = migratePersistedState({ focusMode: 5 }, 1)

    expect(out.activeTab).toBe('practice')
    expect(errSpy).toHaveBeenCalledWith('Store migration failed, resetting to defaults:', expect.any(Error))
    errSpy.mockRestore()
  })

  it('⚠️ 失败兜底返回的是**同一个模块级 initialState 对象**（两次调用同一引用，见文末说明）', () => {
    const a = migratePersistedState({ focusMode: 5 }, 1)
    const b = migratePersistedState(null, 0)
    expect(a).toBe(b)
    expect(a.audio).toBe(b.audio)
  })
})

// ------------------------------------------------------ partialize

describe('storePartialize：持久化白名单', () => {
  it('恰好持久化这 14 个 slice', () => {
    const picked = storePartialize(useAppStore.getState())
    expect(Object.keys(picked).sort()).toEqual(
      [
        'displayScale', 'audio', 'practice', 'metronome', 'feedbackSound', 'focusMode',
        'user', 'premium', 'customSongs', 'favorites', 'chordSymbols', 'scalePractice',
        'intervalPractice', 'chordProgression',
      ].sort()
    )
  })

  it('瞬时状态绝不写盘（刷新后不应恢复这些）', () => {
    const picked = storePartialize(useAppStore.getState()) as Record<string, unknown>
    for (const transient of [
      'activeTab', 'sidebarCollapsed', 'settingsOpen', 'isFullscreen', 'isPlaying',
      'score', 'detectedPitch', 'detectedCents', 'audioDevice', 'currentPracticeSuggestion',
    ]) {
      expect(transient in picked, `${transient} 不应被持久化`).toBe(false)
    }
  })
})

// --------------------------------------------------------- actions

const INIT = useAppStore.getState()
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

beforeEach(() => {
  useAppStore.setState({
    audio: clone(INIT.audio),
    practice: clone(INIT.practice),
    metronome: clone(INIT.metronome),
    feedbackSound: clone(INIT.feedbackSound),
    focusMode: clone(INIT.focusMode),
    user: clone(INIT.user),
    favorites: { levelFavorites: [], songFavorites: [] },
    customSongs: [],
    score: { correct: 0, total: 0 },
  })
})

const S = () => useAppStore.getState()

describe('action：分数', () => {
  it('incrementScore 累加 correct / total', () => {
    S().incrementScore(true)
    S().incrementScore(false)
    S().incrementScore(true)
    expect(S().score).toEqual({ correct: 2, total: 3 })
  })

  it('resetScore 清零', () => {
    S().incrementScore(true)
    S().resetScore()
    expect(S().score).toEqual({ correct: 0, total: 0 })
  })

  it('setScore 支持函数式更新', () => {
    S().setScore({ correct: 1, total: 4 })
    S().setScore((prev) => ({ ...prev, correct: prev.correct + 2 }))
    expect(S().score).toEqual({ correct: 3, total: 4 })
  })
})

describe('action：收藏（toggle 幂等）', () => {
  it('toggleLevelFavorite 加一次、再点去掉', () => {
    S().toggleLevelFavorite('a')
    expect(S().favorites.levelFavorites).toEqual(['a'])
    S().toggleLevelFavorite('a')
    expect(S().favorites.levelFavorites).toEqual([])
  })

  it('toggleSongFavorite 同样切换', () => {
    S().toggleSongFavorite('s1')
    expect(S().favorites.songFavorites).toEqual(['s1'])
    S().toggleSongFavorite('s1')
    expect(S().favorites.songFavorites).toEqual([])
  })
})

describe('action：数值边界夹取', () => {
  it('setBufferSize 只接受白名单，非法回退 2048', () => {
    S().setBufferSize(512)
    expect(S().audio.bufferSize).toBe(512)
    S().setBufferSize(300)
    expect(S().audio.bufferSize).toBe(2048)
  })

  it('setSampleRate 只接受白名单，非法回退 48000', () => {
    S().setSampleRate(96000)
    expect(S().audio.sampleRate).toBe(96000)
    S().setSampleRate(12345)
    expect(S().audio.sampleRate).toBe(48000)
  })

  it('setNoiseSuppression 夹到 [0, 100]', () => {
    S().setNoiseSuppression(-10)
    expect(S().audio.noiseSuppression).toBe(0)
    S().setNoiseSuppression(150)
    expect(S().audio.noiseSuppression).toBe(100)
    S().setNoiseSuppression(42)
    expect(S().audio.noiseSuppression).toBe(42)
  })

  it('setFretZoneStart 夹到 [0, fretCount - fretZoneSize]', () => {
    S().setFretCount(15)
    S().setFretZoneSize(5)
    S().setFretZoneStart(999)
    expect(S().practice.fretZoneStart).toBe(10)
    S().setFretZoneStart(-3)
    expect(S().practice.fretZoneStart).toBe(0)
  })

  it('setFretZoneSize 夹到 [2, fretCount]', () => {
    S().setFretCount(15)
    S().setFretZoneSize(1)
    expect(S().practice.fretZoneSize).toBe(2)
    S().setFretZoneSize(999)
    expect(S().practice.fretZoneSize).toBe(15)
  })
})

describe('action：自定义歌曲', () => {
  const song = (id: string): CustomSong => ({
    id,
    name: 'T',
    composer: '',
    beatsPerMeasure: 4,
    beatSize: 4,
    tempo: 120,
    key: 'C',
    chords: [],
    createdAt: 1,
    updatedAt: 1,
  })

  it('addCustomSong / deleteCustomSong', () => {
    S().addCustomSong(song('s1'))
    S().addCustomSong(song('s2'))
    expect(S().customSongs.map((s) => s.id)).toEqual(['s1', 's2'])
    S().deleteCustomSong('s1')
    expect(S().customSongs.map((s) => s.id)).toEqual(['s2'])
  })

  it('updateCustomSong 合并字段并刷新 updatedAt', () => {
    S().addCustomSong(song('s1'))
    S().updateCustomSong('s1', { name: '改名了' })
    const updated = S().customSongs[0]
    expect(updated.name).toBe('改名了')
    expect(updated.key).toBe('C') // 未指定的字段保留
    expect(updated.updatedAt).toBeGreaterThan(1)
  })

  it('loadCustomSongs 整体替换', () => {
    S().addCustomSong(song('s1'))
    S().loadCustomSongs([song('s9')])
    expect(S().customSongs.map((s) => s.id)).toEqual(['s9'])
  })
})

describe('action：resetSettings 的范围', () => {
  it('重置设置类 slice/字段，但不动收藏 / 自定义歌曲 / 分数', () => {
    S().setMicEnabled(true)
    S().setMetronomeBpm(150)
    S().setDisplayScale(1.5)          // P2-4：设置类顶层字段，应回默认
    S().setChordSymbolSettings({ useUnicode: false })
    S().toggleLevelFavorite('a')
    S().addCustomSong({
      id: 's1', name: 'T', composer: '', beatsPerMeasure: 4, beatSize: 4,
      tempo: 120, key: 'C', chords: [], createdAt: 1, updatedAt: 1,
    })
    S().incrementScore(true)

    S().resetSettings()

    expect(S().audio.micEnabled).toBe(false) // 回默认
    expect(S().metronome.bpm).toBe(80)
    expect(S().displayScale).toBe(1)          // 回默认（P2-4 修复）
    expect(S().chordSymbols.useUnicode).toBe(true) // 回默认（P2-4 修复）
    expect(S().favorites.levelFavorites).toEqual(['a']) // 保留
    expect(S().customSongs).toHaveLength(1)
    expect(S().score).toEqual({ correct: 1, total: 1 })
  })
})

// ---------------------------------------------------------------------------
// 文末说明
//
// 1) migratePersistedState 的失败兜底与 resetSettings 都直接把**模块级 initialState**
//    的 slice 交出去（同一对象引用，而非拷贝）。当前所有 setter 都是纯的（新建对象），
//    所以不会真的污染默认值；但一旦将来有人在某个 setter 里原地改 slice，
//    默认值会被永久改掉、并跨用例/跨会话扩散。低风险但不该默认放任。
// 2) resetSettings 回默认 8 项：audio/practice/metronome/feedbackSound/focusMode/
//    user + displayScale + chordSymbols（后两者 2026-10-10 P2-4 补齐：它们同样是
//    设置弹窗里能改、且被持久化的顶层字段，漏掉会让「恢复所有设置」的文案失真）。
//    **不动** scalePractice/intervalPractice/chordProgression（练习进度，非设置）。
// 详见 __tests__/store-actions.test.ts 末尾同名说明。

// ==================================================== micUserDisabled（音频输入默认开）

/**
 * 2026-10-02 新增语义：桌面端「音频输入默认开，不需要每次开启；
 * 关闭才需要每次关闭」（用户确认：跨会话记住）。
 *
 * `micEnabled` 的默认值是 false，无法区分「主动关」和「从没碰过」⇒
 * 单独用 `micUserDisabled` 记录反例证据，只经 `setMicUserPreference` 写入。
 */
describe('micUserDisabled：默认开的反例证据', () => {
  it('老 blob 缺 micUserDisabled ⇒ migrate 补 false（嵌套字段不会被顶层浅合并补默认值）', () => {
    const out = migratePersistedState({ audio: { micEnabled: false, inputGain: 1 } }, 2)
    expect(out.audio.micUserDisabled).toBe(false)
  })

  it('已有值保留（显式关过的不能被迁移顶回去）', () => {
    const out = migratePersistedState({ audio: { micEnabled: false, micUserDisabled: true } }, 2)
    expect(out.audio.micUserDisabled).toBe(true)
  })

  it('audio 整个缺失时不补（交给 initialState 兜底）', () => {
    const out = migratePersistedState({}, 2)
    expect(out.audio).toBeUndefined()
  })

  it('setMicUserPreference(true) ⇒ micEnabled=true 且 micUserDisabled=false（偏好同步落盘）', () => {
    // 先制造一个「显式关」的现场，再开回来
    useAppStore.setState({ audio: { ...useAppStore.getState().audio, micEnabled: false, micUserDisabled: true } })
    useAppStore.getState().setMicUserPreference(true)
    expect(useAppStore.getState().audio.micEnabled).toBe(true)
    expect(useAppStore.getState().audio.micUserDisabled).toBe(false)
  })

  it('setMicUserPreference(false) ⇒ 双字段同步（这就是「跨会话记住关」的落盘点）', () => {
    useAppStore.getState().setMicUserPreference(false)
    expect(useAppStore.getState().audio.micEnabled).toBe(false)
    expect(useAppStore.getState().audio.micUserDisabled).toBe(true)
  })

  it('setMicEnabled 不动 micUserDisabled（它只用于启动恢复时对齐 UI，不是用户选择）', () => {
    useAppStore.setState({ audio: { ...useAppStore.getState().audio, micEnabled: false, micUserDisabled: true } })
    useAppStore.getState().setMicEnabled(true)
    expect(useAppStore.getState().audio.micEnabled).toBe(true)
    expect(useAppStore.getState().audio.micUserDisabled, '对齐 UI 不得顺手清掉用户偏好').toBe(true)
  })

  it('resetSettings 后回到「从未主动关」（默认开重新生效）', () => {
    useAppStore.getState().setMicUserPreference(false)
    useAppStore.getState().resetSettings()
    expect(useAppStore.getState().audio.micUserDisabled).toBe(false)
    expect(useAppStore.getState().audio.micEnabled).toBe(false)
  })
})
