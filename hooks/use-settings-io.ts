import { useCallback } from 'react'
import { toast } from 'sonner'
import { clampMetronomeBpm, clampMetronomeBeats } from '@/lib/store'
import type { useAppStore } from '@/lib/store'
import type { createTranslator } from '@/lib/i18n'

type AppStore = ReturnType<typeof useAppStore.getState>

/**
 * useSettingsIo —— 设置「导出 / 导入 / 重置」的唯一真相源。
 *
 * 单独成文件不只是为了减行数：这个域里出过两个**静默**缺陷（都不会报错，只是用户
 * 换台设备/重装后发现设置悄悄变样）：
 *
 * 1. **export 曾漏 `theme`** —— import 侧读 `settings.theme`，导出侧没写它
 *    ⇒ 换设备后主题永远被重置成 dark。改这里时先看 import 侧的读取清单。
 * 2. **import 曾用 `||` 取缺省值** —— 把合法的 `0` / `false` 吞掉
 *    （`inputGain` 滑块 `min={0}`，导出 0 再导回就变成 1；`cooldownEnabled: false` 同理）。
 *    现在用「只认正确类型」的三个取值器 `num` / `bool` / `str`：既不吃 0/false，
 *    也顺手挡掉手改 JSON 带来的 NaN / 错类型。
 *
 * ⚠️ 节拍器的拍号走 `clampMetronomeBeats` 白名单 —— 旧版导出的文件没有这个字段，
 *    手改过的文件也可能塞进 0 / NaN（会让可视化算出 NaN 拍号）。
 *
 * ⚠️ 装配顺序：调用点必须在 `useAudioInput` **之后** —— resetSettings 要调它返回的
 *    `clearNoiseFloor`（校准记录是 audio slice 的字段，会随重置回默认 ⇒ 运行中的
 *    收音链路也要回默认，否则会出现「设置已重置、门限却还按着之前那间屋子的底噪走」）。
 */

export interface UseSettingsIoOptions {
  t: ReturnType<typeof createTranslator>

  // ---- 导出要读的当前值 ----
  // 语言 / 主题等四项在 user slice（不在 store 顶层）⇒ 类型从对应 setter 的参数推导
  language: Parameters<AppStore['setLanguage']>[0]
  chordScaleDisplay: Parameters<AppStore['setChordScaleDisplay']>[0]
  noteAccidentalDisplay: Parameters<AppStore['setNoteAccidentalDisplay']>[0]
  theme: Parameters<AppStore['setTheme']>[0]
  practiceTime: number
  fretCount: number
  metronomeBpm: number
  metronomeBeats: number
  inputGain: number
  cooldownEnabled: boolean
  cooldownDuration: number
  confidenceThreshold: number
  sensitivity: number
  customChords: { root: string; type: string; bass?: string }[]

  // ---- 导入要写的 setter（类型直接取自 store） ----
  setLanguage: AppStore['setLanguage']
  setChordScaleDisplay: AppStore['setChordScaleDisplay']
  setNoteAccidentalDisplay: AppStore['setNoteAccidentalDisplay']
  setTheme: AppStore['setTheme']
  setPracticeTime: AppStore['setPracticeTime']
  setFretCount: AppStore['setFretCount']
  setMetronomeBpm: AppStore['setMetronomeBpm']
  setMetronomeBeatsPerMeasure: AppStore['setMetronomeBeatsPerMeasure']
  setInputGain: AppStore['setInputGain']
  setCooldownEnabled: AppStore['setCooldownEnabled']
  setCooldownDuration: AppStore['setCooldownDuration']
  setConfidenceThreshold: AppStore['setConfidenceThreshold']
  setSensitivity: AppStore['setSensitivity']
  setCustomChords: (v: { root: string; type: string; bass?: string }[]) => void

  // ---- 重置 ----
  resetSettingsAction: AppStore['resetSettings']
  /** 收音 hook 提供：清掉环境噪声校准结果（含运行中的检测链状态） */
  clearNoiseFloor: () => void
}

export function useSettingsIo(options: UseSettingsIoOptions) {
  const {
    t,
    language,
    chordScaleDisplay,
    noteAccidentalDisplay,
    theme,
    practiceTime,
    fretCount,
    metronomeBpm,
    metronomeBeats,
    inputGain,
    cooldownEnabled,
    cooldownDuration,
    confidenceThreshold,
    sensitivity,
    customChords,
    setLanguage,
    setChordScaleDisplay,
    setNoteAccidentalDisplay,
    setTheme,
    setPracticeTime,
    setFretCount,
    setMetronomeBpm,
    setMetronomeBeatsPerMeasure,
    setInputGain,
    setCooldownEnabled,
    setCooldownDuration,
    setConfidenceThreshold,
    setSensitivity,
    setCustomChords,
    resetSettingsAction,
    clearNoiseFloor,
  } = options

  const saveSettings = useCallback(() => {
    toast.success(t('save_success'))
  }, [t])

  // 导出设置
  const exportSettings = useCallback(() => {
    const settings = {
      language,
      chordScaleDisplay,
      noteAccidentalDisplay,
      // 🚨 原先漏了 theme：import 侧读 `settings.theme`，而 export 侧没写它
      // ⇒ 换设备/重装后主题永远被重置成 dark（界面静默变样，且无从回溯）。
      theme,
      practiceTime,
      fretCount,
      metronomeBpm,
      metronomeBeats,
      inputGain,
      cooldownEnabled,
      cooldownDuration,
      confidenceThreshold,
      sensitivity,
      customChords,
    }
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fretmaster-settings.json'
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('export_settings'))
  }, [language, chordScaleDisplay, noteAccidentalDisplay, theme, practiceTime, fretCount, metronomeBpm, metronomeBeats, inputGain, cooldownEnabled, cooldownDuration, confidenceThreshold, sensitivity, customChords, t])

  // 导入设置
  const importSettings = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string)
        // 🚨 这里原先一律用 `||` 取缺省值，会把**合法的 0 / false 吞掉**：
        // `inputGain` 滑块 `min={0}`，导出 0 再导回就变成 1（`sensitivity` /
        // `confidenceThreshold` / `cooldownDuration` 同理），而用户完全看不出
        // 「设置没被还原」。改用「只认正确类型」的取值器：既不吃 0/false，
        // 也顺手挡掉手改 JSON 带来的 NaN / 错类型。
        const num = (v: unknown, fallback: number) =>
          typeof v === 'number' && Number.isFinite(v) ? v : fallback
        const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
        // 泛型 `<T extends string>` 是为了保住字面量联合类型（ThemeMode / 语言码…），
        // 否则返回值退化成 `string`、setter 不收。
        const str = <T extends string>(v: unknown, fallback: T): T =>
          typeof v === 'string' && v.length > 0 ? (v as T) : fallback

        setLanguage(str(settings.language, 'zh-CN'))
        setChordScaleDisplay(str(settings.chordScaleDisplay, settings.language === 'en' ? 'english' : 'chinese'))
        setNoteAccidentalDisplay(str(settings.noteAccidentalDisplay, 'sharp'))
        setTheme(str(settings.theme, 'dark'))
        setPracticeTime(num(settings.practiceTime, 60))
        setFretCount(num(settings.fretCount, 15))
        setMetronomeBpm(clampMetronomeBpm(num(settings.metronomeBpm, 80)))
        // 拍号（#14）：走 store 的白名单校验 —— 旧版导出的设置文件里没有这个字段，
        // 手改过的文件也可能塞进 0 / NaN（会让可视化算出 NaN 拍号），这里统一收敛。
        setMetronomeBeatsPerMeasure(clampMetronomeBeats(num(settings.metronomeBeats, 4)))
        setInputGain(num(settings.inputGain, 1))
        setCooldownEnabled(bool(settings.cooldownEnabled, false))
        setCooldownDuration(num(settings.cooldownDuration, 1000))
        setConfidenceThreshold(num(settings.confidenceThreshold, 0.8))
        setSensitivity(num(settings.sensitivity, 0.5))
        if (Array.isArray(settings.customChords)) setCustomChords(settings.customChords)
        toast.success(t('import_success'))
      } catch {
        toast.error(t('error_occurred'))
      }
    }
    reader.readAsText(file)
  }, [setChordScaleDisplay, setConfidenceThreshold, setCooldownDuration, setCooldownEnabled, setFretCount, setInputGain, setLanguage, setMetronomeBpm, setMetronomeBeatsPerMeasure, setNoteAccidentalDisplay, setPracticeTime, setSensitivity, setTheme, setCustomChords, t])

  // 重置设置 —— 摆在收音域之后，因为它要调用 hook 返回的 `clearNoiseFloor`。
  // （放在声明之前会让 deps 数组在渲染期读到未初始化的绑定 ⇒ TDZ。）
  const resetSettings = useCallback(() => {
    resetSettingsAction()
    // 校准记录是 audio slice 的字段，会跟着一起回默认 ⇒ 运行中的收音链路也要回默认，
    // 否则会出现「设置已重置，门限却还按着之前那间屋子的底噪走」。
    // 两条路径（worklet 传 null + TS 侧 resetPitchDetectionState）的细节见
    // hooks/use-audio-input.ts::clearNoiseFloor。
    clearNoiseFloor()
    // P3-4：重置成功的提示必须用**结果**文案，不能复用按钮的前置说明
    //（`reset_settings_hint` 是「点击重置按钮将恢复…」，出现在成功 toast 里语义矛盾）。
    toast.success(t('settings_reset_done'))
  }, [resetSettingsAction, t, clearNoiseFloor])

  return { saveSettings, exportSettings, importSettings, resetSettings }
}
