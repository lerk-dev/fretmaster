"use client"

import { cn } from "@/lib/utils"
import { getNoteIndex } from "@/lib/page-theory-functions"
import { useMemo, memo } from "react"
import { usePianoKeyboardStyle } from "@/lib/store"
import {
  resolveMusmathKeyGeometry,
  resolvePianoBadge,
  resolvePianoKeyRole,
  type PianoKeyGeometry,
  type PianoKeyRole,
  type PianoKeyboardStyle,
} from "@/lib/piano-keyboard-style"

const PIANO_CONFIG = {
  startNote: 21,
  endNote: 108,
  WHITE_KEY_WIDTH: 26,
  WHITE_KEY_HEIGHT: 88,
  BLACK_KEY_WIDTH: 16,
  BLACK_KEY_HEIGHT: 56,
}

/** classic 皮肤的键尺寸 = 应用原有常量，**保持不变**（形状随皮肤走，别顺手改了经典皮肤） */
const CLASSIC_GEOMETRY: PianoKeyGeometry = {
  whiteWidth: PIANO_CONFIG.WHITE_KEY_WIDTH,
  whiteHeight: PIANO_CONFIG.WHITE_KEY_HEIGHT,
  blackWidth: PIANO_CONFIG.BLACK_KEY_WIDTH,
  blackHeight: PIANO_CONFIG.BLACK_KEY_HEIGHT,
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function getNoteBase(midiNote: number): string {
  return NOTE_NAMES[midiNote % 12]
}

function isBlackKey(midiNote: number): boolean {
  const noteIndex = midiNote % 12
  return [1, 3, 6, 8, 10].includes(noteIndex)
}

interface PianoKeyboardProps {
  highlightedNotes?: number[]
  currentStepNotes?: number[]
  rootNote?: string
  className?: string
  showLabels?: boolean
  minOctave?: number
  maxOctave?: number
  /**
   * 皮肤。缺省 classic（应用原有整键底色画法）；musmath = 键面留白 + 音级色标。
   * 生产路径由 `SimplePianoKeyboard` 从全局设置透传，这里保持纯受控。
   */
  variant?: PianoKeyboardStyle
}

export const PianoKeyboard = memo(function PianoKeyboard({
  highlightedNotes = [],
  currentStepNotes = [],
  rootNote,
  className,
  showLabels = true,
  minOctave = 3,
  maxOctave = 5,
  variant = 'classic',
}: PianoKeyboardProps) {
  const keyboardLayout = useMemo(() => {
    const startMidi = Math.max(PIANO_CONFIG.startNote, (minOctave + 1) * 12)
    const endMidi = Math.min(PIANO_CONFIG.endNote, (maxOctave + 2) * 12 - 1)

    const allNotes: number[] = []
    for (let i = startMidi; i <= endMidi; i++) {
      allNotes.push(i)
    }

    const whiteKeys = allNotes.filter(note => !isBlackKey(note))
    const blackKeys = allNotes.filter(note => isBlackKey(note))

    const highlightedBases = new Set(highlightedNotes.map(hn => getNoteBase(hn)))
    const currentStepBases = new Set(currentStepNotes.map(cn => getNoteBase(cn)))

    // 预计算白键索引映射，用于黑键定位
    // 返回「该音之前的白键个数」—— 也就是它左侧那条白键交界的序号。
    // 起点必须是 startMidi（而非 (minOctave+1)*12）：当 minOctave 很小、startMidi 被
    // PIANO_CONFIG.startNote 顶上去时，两者不一致会让黑键整体再偏移一段。
    const whiteKeysBefore = (midiNote: number) => {
      let count = 0
      for (let i = startMidi; i < midiNote; i++) {
        if (!isBlackKey(i)) count++
      }
      return count
    }

    return { whiteKeys, blackKeys, highlightedBases, currentStepBases, whiteKeysBefore }
  }, [highlightedNotes, currentStepNotes, minOctave, maxOctave])

  const { whiteKeys, blackKeys, highlightedBases, currentStepBases, whiteKeysBefore } = keyboardLayout

  // 键的几何随皮肤走（比例来自 musmath 原站实测，见 lib/piano-keyboard-style.ts）：
  // musmath 的白键更细长、黑键更宽（占白键 0.8，原实现只有 0.615）。
  // 黑键定位公式 `boundary·白键宽 − 黑键宽/2` 对两者都成立 —— 只要这里的宽都跟着换。
  const geo = variant === 'musmath'
    ? resolveMusmathKeyGeometry(PIANO_CONFIG.WHITE_KEY_WIDTH)
    : CLASSIC_GEOMETRY

  const isHighlighted = (midiNote: number) => highlightedBases.has(getNoteBase(midiNote))
  const isCurrentStep = (midiNote: number) => currentStepBases.has(getNoteBase(midiNote))
  // 根音用**半音序号**比较：调用方传进来的可能是 Unicode（`C♯`）或 ASCII（`C#`）/降号（`B♭`），
  // 而 getNoteBase 只返回 ASCII 升号表里的名字，直接字符串比较会让 `C♯` 永不匹配根音。
  const rootSemitone = rootNote ? getNoteIndex(rootNote) : -1
  const isRootNote = (midiNote: number) => rootSemitone >= 0 && midiNote % 12 === rootSemitone

  // 角色判定（根音 > 当前步骤 > 其它高亮音 > 无）来自共享真相源，
  // 两套皮肤只是把同一个角色画成不同的样子。
  const roleOf = (midiNote: number): PianoKeyRole =>
    resolvePianoKeyRole(isHighlighted(midiNote), isCurrentStep(midiNote), isRootNote(midiNote))

  // ---- classic 皮肤：整键底色高亮（单一蓝色强调色系：根音深蓝锚点 / 当前步骤亮蓝 / 其余柔和浅蓝）----
  const classicWhiteKeyClass = (role: PianoKeyRole) => {
    if (role === 'root') {
      return "bg-blue-500 text-white shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.18)]"
    }
    if (role === 'current') {
      return "bg-sky-400 text-white shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.15)]"
    }
    if (role === 'tone') {
      return "bg-blue-200/70 dark:bg-blue-500/25 text-blue-900 dark:text-blue-100"
    }
    return "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-700"
  }

  const classicBlackKeyClass = (role: PianoKeyRole) => {
    if (role === 'root') return "bg-blue-500"
    if (role === 'current') return "bg-sky-400"
    if (role === 'tone') return "bg-blue-400/80 dark:bg-blue-500/70"
    return "bg-zinc-900 dark:bg-black"
  }

  /**
   * classic 黑键的「浮起」重投影。
   * ⚠️ 必须**只在 classic 分支**里拼上（见下面的 keyClass）：`cn()` 走 tailwind-merge，
   * 而 `shadow-md`（musmath 的投影）与它是同一个 shadow-size 冲突组 —— 一旦两者同时进
   * 一个 `cn()`，后出现的那个会**静默吃掉**前面那个。也就是说「无脑加在 JSX 上再靠守卫
   * 判断皮肤」这种写法里，守卫失效是**观测不到**的（DOM 上结果一样），
   * 测试也写不出能咬它的断言。放在分支里则「谁长出什么投影」是结构上确定的。
   */
  const CLASSIC_BLACK_KEY_SHADOW = "shadow-[0_2px_4px_rgba(0,0,0,0.35)]"

  // ---- musmath 皮肤：**键面不清染**，音阶/和弦音落在键面下部的圆形色标上 ----
  // 键面**不用** musmath 的浅色原值，而用它「套上 Dark Reader 之后」的深色：
  // 白键 #181a1b / 黑键 #052632 / 描边 #444a4d（实测过程与出处见
  // lib/piano-keyboard-style.ts 的 MUSMATH_DARK_KEY_COLORS，那里是唯一真相源）。
  // 两套应用主题共用同一组深色 —— musmath 自己的深色主题是米色键，属于「浅色键盘」，
  // 这里刻意不跟；浅色键面铺在深色卡片上会整块发亮，正是要修掉的观感。
  //
  // 形状部分照抄原站的三个类：`rounded-b-md`（只有底部两角）+ `border` + `shadow-md`。
  // 原站投影是 `shadow-md shadow-shadow/10`（`--color-shadow` 取 10%），
  // 这里同样用「shadow-md + 色/10」的写法，色取 Dark Reader 后的 #052632
  // （= 原站 `--color-shadow:#062f3e` 经同样处理后的值，与黑键面同源）。
  const musmathWhiteKeyClass =
    "bg-[#181a1b] border border-[#444a4d] shadow-md shadow-[#052632]/10"
  const musmathBlackKeyClass =
    "bg-[#052632] border border-[#444a4d] shadow-md shadow-[#052632]/10"

  const keyClass = (isBlack: boolean, role: PianoKeyRole) => {
    if (variant === 'musmath') return isBlack ? musmathBlackKeyClass : musmathWhiteKeyClass
    // 重投影只在 classic 分支产生 —— 别挪到 JSX 上再靠守卫判断皮肤（见 CLASSIC_BLACK_KEY_SHADOW 注释）
    if (isBlack) return cn(classicBlackKeyClass(role), CLASSIC_BLACK_KEY_SHADOW)
    return classicWhiteKeyClass(role)
  }

  /**
   * 色标（musmath 画法）。classic 皮肤永远返回 null（它不用色标）。
   * 注意：非音阶音**不渲染**任何节点 —— 留在 DOM 里的隐藏文字会让
   * `textContent` 断言看到「屏幕上看不见的字」。
   */
  const renderBadge = (midiNote: number, role: PianoKeyRole, isBlack: boolean) => {
    const badge = resolvePianoBadge(variant, role, midiNote % 12, isCurrentStep(midiNote))
    if (!badge.show) return null
    return (
      <span
        key="badge"
        data-note-badge={midiNote % 12}
        data-badge-shape={badge.square ? 'square' : 'circle'}
        className={cn(
          "absolute left-1/2 -translate-x-1/2 bottom-1.5 flex items-center justify-center",
          "font-bold leading-none text-white select-none pointer-events-none",
          badge.square ? "rounded-[3px]" : "rounded-full",
          badge.pulse && "animate-pulse ring-2 ring-white/70",
          isBlack ? "h-[14px] w-[14px] text-3xs" : "h-[18px] w-[18px] text-2xs",
        )}
        style={{ backgroundColor: badge.color ?? undefined }}
      >
        {showLabels ? getNoteBase(midiNote) : null}
      </span>
    )
  }

  return (
    <div className={cn("relative w-full overflow-x-auto", className)}>
      <div className="relative min-w-max py-3 flex justify-center">
        <div className="relative flex">
          {/* 白键层 */}
          <div className="flex relative z-0">
            {whiteKeys.map((note) => {
              const role = roleOf(note)
              // classic 皮肤的标签：高亮键 + 每个 C；musmath 的音名画在色标里
              const showClassicLabel =
                showLabels &&
                variant !== 'musmath' &&
                (role !== 'plain' || getNoteBase(note) === "C")

              return (
                <div
                  key={note}
                  className={cn(
                    "relative transition-colors duration-200 rounded-b-md",
                    "flex items-end justify-center pb-1.5 select-none",
                    keyClass(false, role)
                  )}
                  style={{
                    width: `${geo.whiteWidth}px`,
                    height: `${geo.whiteHeight}px`,
                  }}
                >
                  {/* 根音锚点：顶部小圆点（classic 皮肤的画法） */}
                  {variant !== 'musmath' && isRootNote(note) && isHighlighted(note) && (
                    <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-white/90" />
                  )}
                  {/* 当前步骤：呼吸提示（classic 皮肤的画法）。
                      与上一个信号**独立**：同一个键可以既是根音又是当前步骤，两个装饰都该在。 */}
                  {variant !== 'musmath' && isCurrentStep(note) && (
                    <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  )}
                  {renderBadge(note, role, false)}
                  {showClassicLabel && (
                    <span className={cn(
                      "text-3xs font-semibold leading-none transition-opacity",
                      role !== 'plain' ? "opacity-100" : "opacity-50"
                    )}>
                      {getNoteBase(note)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* 黑键层：精确绝对定位 */}
          <div className="absolute top-0 left-0 pointer-events-none z-10">
            {blackKeys.map((note) => {
              const role = roleOf(note)
              // 黑键中心对齐到「它前面那个白键」与「它后面那个白键」的交界处。
              // 该交界的 x 坐标 = 前面白键的个数 × 白键宽（第 k 条交界在 k*W 处）。
              const boundary = whiteKeysBefore(note)
              const leftPx = boundary * geo.whiteWidth - geo.blackWidth / 2

              return (
                <div
                  key={note}
                  className={cn(
                    "absolute rounded-b-md transition-colors duration-200",
                    "flex items-end justify-center pb-1.5 select-none",
                    keyClass(true, role)
                  )}
                  style={{
                    left: `${leftPx}px`,
                    width: `${geo.blackWidth}px`,
                    height: `${geo.blackHeight}px`,
                  }}
                >
                  {renderBadge(note, role, true)}
                  {isHighlighted(note) && showLabels && variant !== 'musmath' && (
                    <span className="text-4xs font-bold text-white leading-none opacity-90">
                      {getNoteBase(note)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})

interface SimplePianoKeyboardProps {
  rootNote: string
  highlightedNotes: string[]
  currentStepNote?: string
  className?: string
}

export const SimplePianoKeyboard = memo(function SimplePianoKeyboard({
  rootNote,
  highlightedNotes,
  currentStepNote,
  className,
}: SimplePianoKeyboardProps) {
  // 皮肤是**全局档位**（设置 → 显示与外观）：三个 keyboard wrapper 都走这里，
  // 因此换皮肤不需要逐页接线。
  const variant = usePianoKeyboardStyle()

  const noteToMidi = (noteName: string, octave: number): number => {
    // 不能用 NOTE_NAMES.indexOf：app 里的音名是 Unicode 升/降号（`C♯` / `B♭`），
    // 而 NOTE_NAMES 是 ASCII（`C#`）→ indexOf 恒为 -1 → 全部回退成 C（MIDI 60），
    // 表现为「所有黑键音都高亮到 C」。getNoteIndex 同时认 ASCII/Unicode 与降号表。
    const noteIndex = getNoteIndex(noteName)
    if (noteIndex === -1) return 60
    return (octave + 1) * 12 + noteIndex
  }

  const highlightedMidis: number[] = []
  highlightedNotes.forEach(noteName => {
    for (let octave = 3; octave <= 5; octave++) {
      const midi = noteToMidi(noteName, octave)
      highlightedMidis.push(midi)
    }
  })

  const currentStepMidis: number[] = []
  if (currentStepNote) {
    for (let octave = 3; octave <= 5; octave++) {
      const midi = noteToMidi(currentStepNote, octave)
      currentStepMidis.push(midi)
    }
  }

  return (
    <PianoKeyboard
      highlightedNotes={highlightedMidis}
      currentStepNotes={currentStepMidis}
      rootNote={rootNote}
      className={className}
      minOctave={3}
      maxOctave={5}
      variant={variant}
    />
  )
})

export default PianoKeyboard
