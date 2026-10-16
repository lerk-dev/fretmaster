import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'

/**
 * useGlobalShortcuts —— 全局键盘快捷键域（从 app/page.tsx 逐行搬出，C5）
 *
 * 页面级 `window` keydown 的唯一实现。覆盖：
 *   Esc（退全屏 / 停练习）、P（启停练习）、F（切全屏）、M（切麦克风）、H（快捷键帮助）、
 *   S（打开设置）、1-5（切标签页）、空格 / → / PageDown（下一题）、
 *   ↑ / PageUp（显示指板）、↓（隐藏指板 + 下一题）、Enter（下一题）。
 *
 * ## 三条容易踩的坑（都有护栏，勿改）
 *
 * 1. **专注模式下 Space / Esc 必须让位**（P2-7）—— 两个 window 级 keydown 同时存活时，
 *    按 Space 会既推进下一题**又**启停番茄钟；`preventDefault()` 拦不住另一个监听器
 *    （它只挡浏览器默认行为，不挡同页其它 handler）。这里的约定是「谁在场谁接管」。
 * 2. **带 Ctrl/Cmd/Alt 的组合一律放行**给浏览器（Ctrl+P / F / S 等系统快捷键）。
 * 3. **输入框 / textarea / contenteditable 里的按键必须跳过**，否则打字会触发全局动作。
 *
 * ## 与页面的两处**有意改动**（其余逐行一致）
 *
 * - deps 去掉两个**函数体从未引用**的死项：`micEnabled` 与 `generateIntervalExercise`。
 *   前者在函数体里读的是 `useAppStore.getState().audio.micEnabled`（实时值，不需要重建），
 *   后者用的是 `generateIntervalExerciseRef.current?.()`。去掉它们只减少监听器无谓重建。
 * - deps 补 3 个项（`setHighlightedFrets` / `setHighlightedTargetPosition` /
 *   `setShowShortcutsHelp`）：它们在页面里是本地 `useState` setter，ESLint 认得「身份恒定」；
 *   搬成 props 后不再认得，照实写全。
 */

export interface UseGlobalShortcutsOptions {
  /** 当前标签页（决定「下一题」往哪走） */
  activeTab: string
  isFullscreen: boolean
  /** 切全屏（useFullscreen 提供；Tauri 下会先调原生） */
  setFullscreenMode: (enable?: boolean) => void
  isPlaying: boolean
  setIsPlaying: (v: boolean) => void
  /** Esc 停练习时清空作答痕迹 */
  setHighlightedFrets: (v: Map<string, boolean>) => void
  setHighlightedTargetPosition: (v: { stringIndex: number; fret: number } | null) => void
  /** ↑/PageUp 显示指板、↓ 隐藏指板时会顺带切换「显示全部音名」 */
  setShowAllNotes: (v: boolean) => void
  /** P 键启停练习（唯一写者是会话域的 togglePractice） */
  togglePractice: () => void
  isTauri: boolean
  /** M 键切麦克风：走**用户偏好**落盘（跨会话记住），不是运行时对齐 */
  setMicUserPreference: (v: boolean) => void
  setShowShortcutsHelp: (fn: (prev: boolean) => boolean) => void
  setSettingsOpen: (v: boolean) => void
  handleTabChange: (tabId: string) => void
  setTabFretboardFlag: (tab: string, value: boolean) => void
  generateNewTarget: () => void
  /** interval 的「下一题」是 ref 形态（声明在 hook 之后，直接引用会 TDZ） */
  generateIntervalExerciseRef: { current: (() => void) | null }
  nextChordExercise: () => void
  nextScaleExercise: () => void
  nextChord: () => void
  /** 专注模式开着时 Space/Esc 让位（见文件头第 1 条） */
  focusModeEnabled: boolean | undefined
}

export function useGlobalShortcuts(options: UseGlobalShortcutsOptions) {
  const {
    activeTab,
    isFullscreen,
    setFullscreenMode,
    isPlaying,
    setIsPlaying,
    setHighlightedFrets,
    setHighlightedTargetPosition,
    setShowAllNotes,
    togglePractice,
    isTauri,
    setMicUserPreference,
    setShowShortcutsHelp,
    setSettingsOpen,
    handleTabChange,
    setTabFretboardFlag,
    generateNewTarget,
    generateIntervalExerciseRef,
    nextChordExercise,
    nextScaleExercise,
    nextChord,
    focusModeEnabled,
  } = options

  // 键盘事件监听 - 全局快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 忽略输入框/可编辑元素中的按键，避免与文本输入冲突
      const target = event.target as HTMLElement | null
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return
      }
      // contenteditable 元素（如富文本编辑器）也跳过
      if (target && target.isContentEditable) {
        return
      }

      // 带系统修饰键的组合（Ctrl/Cmd/Alt）交给浏览器处理，
      // 避免劫持 Ctrl+P 打印、Ctrl+F 查找、Ctrl+S 保存、Ctrl+M 等系统快捷键
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      // 🚨 专注模式下，Space / Escape 归 FocusMode 面板所有（P2-7）。
      //    两个 window 级 keydown 同时存活时：按 Space 既推进下一题**又**启停番茄钟、
      //    按 Esc 既退出专注模式**又**停止练习 —— `preventDefault()` 拦不住另一个监听器
      //    （它只挡浏览器默认行为，不挡同页其它 handler）。这里用「谁在场谁接管」的
      //    约定做互斥：专注模式开着 ⇒ 页面这侧的 Space/Esc 让位。
      //    （P/A/F 等其余快捷键不受影响，专注模式下仍可用。）
      if (focusModeEnabled && (event.key === 'Escape' || event.key === ' ' || event.key === 'Spacebar')) {
        return
      }

      // ESC - 退出全屏或停止练习
      if (event.key === 'Escape') {
        event.preventDefault()
        if (isFullscreen) {
          setFullscreenMode(false)
        } else if (isPlaying) {
          setIsPlaying(false)
          setHighlightedFrets(new Map())
          setHighlightedTargetPosition(null)
        }
        return
      }

      // P - 开始/停止练习
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        togglePractice()
        return
      }

      // F - 切换全屏模式（全局快捷键，不依赖练习状态，与快捷键说明一致）
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        setFullscreenMode(!isFullscreen)
        return
      }

      // M - 切换麦克风（用户显式选择 ⇒ 走偏好落盘，跨会话记住）
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        const next = !useAppStore.getState().audio.micEnabled
        setMicUserPreference(next)
        if (isTauri) {
          // 🚨 只翻标志不碰 Rust ⇒ 会复刻「以为开了其实没开」的老 bug（另一扇门）。
          // 运行时对齐：开 ⇒ 确保采集在跑（ensureCaptureRunning 幂等：已在采集就不动）；
          // 关 ⇒ 停采集。pitch stream 由练习/调音 effect 依 micEnabled 自行启停，这里不管。
          import('@/lib/native-audio').then(({ stopAudioCapture, ensureCaptureRunning }) => {
            const a = useAppStore.getState().audio
            const job = next
              ? ensureCaptureRunning({
                  selectedDevice: a.selectedAudioDevice || undefined,
                  sampleRate: a.sampleRate || 48000,
                  backend: a.audioBackend || 'wasapi_shared',
                })
              : stopAudioCapture()
            job.catch((err) => console.error('[Tauri] M 键切换音频输入失败:', err))
          })
        }
        return
      }

      // H - 显示/隐藏快捷键帮助
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault()
        setShowShortcutsHelp(prev => !prev)
        return
      }

      // S - 打开设置
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }

      // 1-5 - 切换标签页
      const tabKeys = ['1', '2', '3', '4', '5']
      const tabs = ['practice', 'interval', 'chord_exercise', 'chord', 'scale']
      if (tabKeys.includes(event.key)) {
        event.preventDefault()
        handleTabChange(tabs[parseInt(event.key) - 1])
        return
      }

      // 空格/右箭头/PageDown - 下一题（练习中）
      if ((event.key === ' ' || event.key === 'ArrowRight' || event.key === 'PageDown') && isPlaying) {
        event.preventDefault()
        if (activeTab === 'practice') {
          generateNewTarget()
        } else if (activeTab === 'interval') {
          generateIntervalExerciseRef.current?.()
        } else if (activeTab === 'chord_exercise') {
          nextChordExercise()
        } else if (activeTab === 'scale') {
          nextScaleExercise()
        } else if (activeTab === 'chord') {
          nextChord()
        }
        return
      }

      // 上箭头/PageUp - 显示指板（与快捷键说明一致）
      if ((event.key === 'ArrowUp' || event.key === 'PageUp') && isPlaying) {
        event.preventDefault()
        // 根据当前练习 tab 显示对应的指板（映射见唯一真相源 lib/tab-fretboard-toggle.ts）
        setTabFretboardFlag(activeTab, true)
        setShowAllNotes(true)
        return
      }

      // 下箭头 - 隐藏指板 / 下一题（与快捷键说明一致）
      // 练习中：隐藏指板并生成下一题；非练习中：仅隐藏指板
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        // 根据当前练习 tab 隐藏对应的指板（映射见唯一真相源 lib/tab-fretboard-toggle.ts）
        setTabFretboardFlag(activeTab, false)
        setShowAllNotes(false)
        // 练习中同时生成下一题
        if (isPlaying) {
          if (activeTab === 'practice') {
            generateNewTarget()
          } else if (activeTab === 'interval') {
            generateIntervalExerciseRef.current?.()
          } else if (activeTab === 'chord_exercise') {
            nextChordExercise()
          } else if (activeTab === 'scale') {
            nextScaleExercise()
          } else if (activeTab === 'chord') {
            nextChord()
          }
        }
        return
      }

      // Enter - 下一题（练习中）
      if (event.key === 'Enter' && isPlaying) {
        event.preventDefault()
        if (activeTab === 'practice') {
          generateNewTarget()
        } else if (activeTab === 'interval') {
          generateIntervalExerciseRef.current?.()
        } else if (activeTab === 'chord_exercise') {
          nextChordExercise()
        } else if (activeTab === 'scale') {
          nextScaleExercise()
        } else if (activeTab === 'chord') {
          nextChord()
        }
        return
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen, isPlaying, togglePractice, activeTab, generateNewTarget, nextChordExercise, nextScaleExercise, nextChord, handleTabChange, setFullscreenMode, setIsPlaying, setMicUserPreference, isTauri, setSettingsOpen, generateIntervalExerciseRef, setTabFretboardFlag, focusModeEnabled, setHighlightedFrets, setHighlightedTargetPosition, setShowShortcutsHelp, setShowAllNotes])
}
