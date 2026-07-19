﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿"use client"

import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from "react"
import { VariableSizeList as List } from 'react-window'
import { Button } from "@/components/ui/button"
import { savePracticeStats as saveToServer, getAllPracticeStats, PracticeStats as ServerPracticeStats } from "@/lib/stats-api"
import { deduplicateStats } from "@/lib/export-utils"
import { getLocalDateString, parseDbTimestamp, dbTimestampToLocalDate, getLocalDayStart, getLocalDaysAgoStart, getLocalMonthsAgoStart, normalizeAccuracy } from "@/lib/utils"
import { useAppStore, useAudioSettings, usePracticeSettings, useMetronomeSettings, useScore, useIsPlaying, useVersion, useDisplayScale, useFeedbackSoundSettings, useUser } from "@/lib/store"
import { VERSION, BUILD_DATE_LOCAL } from "@/lib/version"
import { logger } from "@/lib/logger"
import { SOLO_SONGS } from "@/lib/solo-songs"
import { PRACTICE_MODE_GROUPS, ALTERED_LEVELS, DIMINISHED_SCALES_LEVELS } from "@/lib/practice-levels"
import { InstrumentType } from "@/lib/practice-suggestions"
import { calculateRMS, frequencyToNoteName, calculateCents, getAdjustedCents, frequencyToNote, getSOLOYinAnalyser, YINPitchDetection, YINDetector, SOLOYinAnalyser } from "@/lib/pitch-detection"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn, isTauriEnv, getAudioContextClass } from "@/lib/utils"
import { WindowsAudioSettings } from "@/components/windows-audio-settings"
import { ErrorBoundary } from "@/components/error-boundary"
import { FocusMode } from "@/components/focus-mode"
import { CustomSongEditor } from "@/components/custom-song-editor-ui"
import { MetronomeVisualizer } from "@/components/metronome-visualizer"
import Sidebar from "@/app/components/Sidebar"
import Header from "@/app/components/Header"
import BottomNavigation from "@/app/components/BottomNavigation"
import { 
  OnboardingProvider,
  OnboardingOverlay,
  OnboardingTrigger,
  FeedbackDialog,
} from "@/components/onboarding"
import { 
  Guitar, 
  Play, 
  Pause, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  Target,
  Music,
  Layers,
  ChevronLeft,
  ChevronRight,
  Settings,
  Timer,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  ListMusic,
  Shuffle,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  Upload,
  X,
  Check,
  Info,
  Zap,
  Clock,
  Hash,
  Activity,
  Piano,
  SkipForward,
  Globe,
  Download,
  RefreshCw,
  Headphones,
  SlidersHorizontal,
  Languages,
  Maximize2,
  Keyboard,
  BarChart3,
  Palette,
  Moon,
  Sun,
  Monitor,
  GripVertical,
  HelpCircle,
  Edit3,
  Star,
  StarOff,
  Square,
} from "lucide-react"
import { toast } from "sonner"
import { PianoKeyboard, SimplePianoKeyboard } from "@/components/piano-keyboard"
import { TRANSLATIONS } from '@/lib/i18n'

// ==================== 音乐理论常量 ====================
const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
const NOTES_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]
const STRING_TUNING = [4, 11, 7, 2, 9, 4] // E B G D A E (high to low, as semitones from C)
const GUITAR_TUNING = ["E", "B", "G", "D", "A", "E"] // 1弦到6弦的开放音 (high to low)
const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]

// 标准化音符名：将 # 转为 ♯、b 转为 ♭（用于兼容旧数据/和弦解析结果）
function normalizeNoteName(note: string): string {
  if (!note) return note
  return note.replace(/#/g, '♯').replace(/b/g, '♭')
}

function findNoteIndexInArray(note: string, arr: string[]): number {
  return arr.findIndex(n => n === note)
}

// 练习建议数据（参考SOLO的PracticeSuggestionProvider）
const PRACTICE_SUGGESTIONS = [
  "尝试在不同弦上弹奏这个音，找到最舒适的位置。",
  "先专注于在低把位找到这个音，然后再向高把位移动。",
  "练习在指板上找到这个音的所有位置。",
  "尝试在弹奏前先在脑海中可视化音符位置。",
  "用耳朵引导你——先唱出这个音再找到它。",
  "练习在不同八度找到这个音。",
  "尝试闭着眼睛找音来培养肌肉记忆。",
  "练习将这个音与附近的音阶位置连接起来。",
  "专注于干净的按弦和清晰的音色。",
  "尝试用不同的手指弹奏来增加灵活性。",
  "练习快速连续找音来提高速度。",
  "使用节拍器来计时你的找音练习。",
  "尝试在保持稳定节奏的同时找音。",
  "练习在指板上远距离跳跃。",
  "专注于在找音时最小化手部移动。",
  "尝试在不同调性中找音来增加多样性。",
  "练习找到常见和弦进行的根音。",
  "在你熟悉的歌曲中练习找音。",
  "尝试一边看谱一边找音。",
  "练习不看指板只用耳朵找音。",
  "专注于相邻弦之间的关系。",
  "尝试用不同的指法找到同一个音。",
  "练习在所有12个调中找音。",
  "练习在和弦进行中找到和弦音。",
  "尝试在保持良好姿势的同时找音。",
]

// 音级到半音的映射（全局常量）
const DEGREE_TO_SEMITONE: Record<string, number> = {
  "1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "4": 5,
  "#4": 6, "b5": 6, "5": 7, "#5": 8, "b6": 8, "6": 9,
  "#6": 9, "b7": 10, "7": 10, "maj7": 11, "bb7": 9,
  "b9": 1, "9": 2, "#9": 3, "b13": 8, "13": 9, "11": 5, "#11": 6
}

// Chord types with intervals - 完整62种和弦类型，与SOLO保持一致
const CHORD_TYPES = [
  // 三和弦类 (6种)
  { name: "Major", intervals: [0, 4, 7], symbol: "", group: "triad", groupName: "Triads", groupZh: "三和弦" },
  { name: "Minor", intervals: [0, 3, 7], symbol: "m", group: "triad", groupName: "Triads", groupZh: "三和弦" },
  { name: "Dim", intervals: [0, 3, 6], symbol: "dim", group: "triad", groupName: "Triads", groupZh: "三和弦" },
  { name: "Aug", intervals: [0, 4, 8], symbol: "aug", group: "triad", groupName: "Triads", groupZh: "三和弦" },
  { name: "sus2", intervals: [0, 2, 7], symbol: "sus2", group: "triad", groupName: "Triads", groupZh: "三和弦" },
  { name: "sus4", intervals: [0, 5, 7], symbol: "sus4", group: "triad", groupName: "Triads", groupZh: "三和弦" },
  
  // 加音和弦 (4种)
  { name: "add9", intervals: [0, 4, 7, 14], symbol: "add9", group: "add", groupName: "Add Chords", groupZh: "加音和弦" },
  { name: "madd9", intervals: [0, 3, 7, 14], symbol: "madd9", group: "add", groupName: "Add Chords", groupZh: "加音和弦" },
  { name: "6add9", intervals: [0, 4, 7, 9, 14], symbol: "6/9", group: "add", groupName: "Add Chords", groupZh: "加音和弦" },
  { name: "m6add9", intervals: [0, 3, 7, 9, 14], symbol: "m6/9", group: "add", groupName: "Add Chords", groupZh: "加音和弦" },
  
  // 减和弦类 (2种)
  { name: "dim7", intervals: [0, 3, 6, 9], symbol: "dim7", group: "dim", groupName: "Diminished", groupZh: "减和弦" },
  { name: "dimMaj7", intervals: [0, 3, 6, 11], symbol: "dim(maj7)", group: "dim", groupName: "Diminished", groupZh: "减和弦" },
  
  // 六和弦类 (2种)
  { name: "6", intervals: [0, 4, 7, 9], symbol: "6", group: "six", groupName: "Six Chords", groupZh: "六和弦" },
  { name: "m6", intervals: [0, 3, 7, 9], symbol: "m6", group: "six", groupName: "Six Chords", groupZh: "六和弦" },
  
  // 属七和弦类 (18种)
  { name: "7", intervals: [0, 4, 7, 10], symbol: "7", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7b5", intervals: [0, 4, 6, 10], symbol: "7♭5", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7#5", intervals: [0, 4, 8, 10], symbol: "7♯5", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7b9", intervals: [0, 4, 7, 10, 13], symbol: "7♭9", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7#9", intervals: [0, 4, 7, 10, 15], symbol: "7♯9", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7#11", intervals: [0, 4, 7, 10, 18], symbol: "7♯11", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7b13", intervals: [0, 4, 7, 10, 20], symbol: "7♭13", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7#5b9", intervals: [0, 4, 8, 10, 13], symbol: "7♯5♭9", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7#5#9", intervals: [0, 4, 8, 10, 15], symbol: "7♯5♯9", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7b5b9", intervals: [0, 4, 6, 10, 13], symbol: "7♭5♭9", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7b5#9", intervals: [0, 4, 6, 10, 15], symbol: "7♭5♯9", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7b9b13", intervals: [0, 4, 7, 10, 13, 20], symbol: "7♭9♭13", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  { name: "7alt", intervals: [0, 4, 8, 10, 13, 15, 20], symbol: "7alt", group: "dominant", groupName: "Dominant 7th", groupZh: "属七和弦" },
  
  // 属九和弦类 (4种)
  { name: "9", intervals: [0, 4, 7, 10, 14], symbol: "9", group: "dominant9", groupName: "Dominant 9th", groupZh: "属九和弦" },
  { name: "9b13", intervals: [0, 4, 7, 10, 14, 20], symbol: "9♭13", group: "dominant9", groupName: "Dominant 9th", groupZh: "属九和弦" },
  { name: "9#11", intervals: [0, 4, 7, 10, 14, 18], symbol: "9♯11", group: "dominant9", groupName: "Dominant 9th", groupZh: "属九和弦" },
  { name: "9sus4", intervals: [0, 5, 7, 10, 14], symbol: "9sus4", group: "dominant9", groupName: "Dominant 9th", groupZh: "属九和弦" },
  
  // 属十三和弦类 (4种)
  { name: "13", intervals: [0, 4, 7, 10, 14, 21], symbol: "13", group: "dominant13", groupName: "Dominant 13th", groupZh: "属十三和弦" },
  { name: "13b9", intervals: [0, 4, 7, 10, 13, 21], symbol: "13♭9", group: "dominant13", groupName: "Dominant 13th", groupZh: "属十三和弦" },
  { name: "13#9", intervals: [0, 4, 7, 10, 15, 21], symbol: "13♯9", group: "dominant13", groupName: "Dominant 13th", groupZh: "属十三和弦" },
  { name: "13#11", intervals: [0, 4, 7, 10, 14, 18, 21], symbol: "13♯11", group: "dominant13", groupName: "Dominant 13th", groupZh: "属十三和弦" },
  
  // 大七和弦类 (8种)
  { name: "Maj7", intervals: [0, 4, 7, 11], symbol: "maj7", group: "major7", groupName: "Major 7th", groupZh: "大七和弦" },
  { name: "maj7#5", intervals: [0, 4, 8, 11], symbol: "maj7♯5", group: "major7", groupName: "Major 7th", groupZh: "大七和弦" },
  { name: "maj7#11", intervals: [0, 4, 7, 11, 18], symbol: "maj7♯11", group: "major7", groupName: "Major 7th", groupZh: "大七和弦" },
  { name: "maj7b6", intervals: [0, 4, 7, 11, 8], symbol: "maj7♭6", group: "major7", groupName: "Major 7th", groupZh: "大七和弦" },
  { name: "maj7#9", intervals: [0, 4, 7, 11, 15], symbol: "maj7♯9", group: "major7", groupName: "Major 7th", groupZh: "大七和弦" },
  
  // 大九和弦类 (4种)
  { name: "Maj9", intervals: [0, 4, 7, 11, 14], symbol: "maj9", group: "major9", groupName: "Major 9th", groupZh: "大九和弦" },
  { name: "maj9#11", intervals: [0, 4, 7, 11, 14, 18], symbol: "maj9♯11", group: "major9", groupName: "Major 9th", groupZh: "大九和弦" },
  { name: "maj9#5", intervals: [0, 4, 8, 11, 14], symbol: "maj9♯5", group: "major9", groupName: "Major 9th", groupZh: "大九和弦" },
  { name: "maj9b6", intervals: [0, 4, 7, 11, 14, 8], symbol: "maj9♭6", group: "major9", groupName: "Major 9th", groupZh: "大九和弦" },
  
  // 大十三和弦类 (3种)
  { name: "maj13", intervals: [0, 4, 7, 11, 14, 21], symbol: "maj13", group: "major13", groupName: "Major 13th", groupZh: "大十三和弦" },
  { name: "maj13#11", intervals: [0, 4, 7, 11, 14, 18, 21], symbol: "maj13♯11", group: "major13", groupName: "Major 13th", groupZh: "大十三和弦" },
  { name: "maj13#5", intervals: [0, 4, 8, 11, 14, 21], symbol: "maj13♯5", group: "major13", groupName: "Major 13th", groupZh: "大十三和弦" },
  
  // 小七和弦类 (8种)
  { name: "m7", intervals: [0, 3, 7, 10], symbol: "m7", group: "minor7", groupName: "Minor 7th", groupZh: "小七和弦" },
  { name: "m7b5", intervals: [0, 3, 6, 10], symbol: "m7♭5", group: "minor7", groupName: "Minor 7th", groupZh: "小七和弦" },
  { name: "m7b5nat9", intervals: [0, 3, 6, 10, 14], symbol: "m7♭5(9)", group: "minor7", groupName: "Minor 7th", groupZh: "小七和弦" },
  { name: "m7b6", intervals: [0, 3, 7, 10, 8], symbol: "m7♭6", group: "minor7", groupName: "Minor 7th", groupZh: "小七和弦" },
  { name: "mMaj7", intervals: [0, 3, 7, 11], symbol: "m(maj7)", group: "minor7", groupName: "Minor 7th", groupZh: "小七和弦" },
  { name: "mMaj9", intervals: [0, 3, 7, 11, 14], symbol: "m(maj9)", group: "minor7", groupName: "Minor 7th", groupZh: "小七和弦" },
  { name: "mMaj13", intervals: [0, 3, 7, 11, 14, 21], symbol: "m(maj13)", group: "minor7", groupName: "Minor 7th", groupZh: "小七和弦" },
  
  // 小九和弦类 (2种)
  { name: "m9", intervals: [0, 3, 7, 10, 14], symbol: "m9", group: "minor9", groupName: "Minor 9th", groupZh: "小九和弦" },
  { name: "m9b5", intervals: [0, 3, 6, 10, 14], symbol: "m9♭5", group: "minor9", groupName: "Minor 9th", groupZh: "小九和弦" },
  
  // 小十一/十三和弦类 (3种)
  { name: "m11", intervals: [0, 3, 7, 10, 14, 17], symbol: "m11", group: "minor11", groupName: "Minor 11th/13th", groupZh: "小十一/十三和弦" },
  { name: "m13", intervals: [0, 3, 7, 10, 14, 21], symbol: "m13", group: "minor11", groupName: "Minor 11th/13th", groupZh: "小十一/十三和弦" },
  
  // 挂留和弦类 (5种)
  { name: "7sus4", intervals: [0, 5, 7, 10], symbol: "7sus4", group: "sus", groupName: "Suspended", groupZh: "挂留和弦" },
  { name: "7sus4b9", intervals: [0, 5, 7, 10, 13], symbol: "7sus4♭9", group: "sus", groupName: "Suspended", groupZh: "挂留和弦" },
  { name: "sus4b9", intervals: [0, 5, 7, 13], symbol: "sus4♭9", group: "sus", groupName: "Suspended", groupZh: "挂留和弦" },
  { name: "13sus4", intervals: [0, 5, 7, 10, 14, 21], symbol: "13sus4", group: "sus", groupName: "Suspended", groupZh: "挂留和弦" },
  { name: "13sus4b9", intervals: [0, 5, 7, 10, 13, 21], symbol: "13sus4♭9", group: "sus", groupName: "Suspended", groupZh: "挂留和弦" },
  
  // 增和弦类 (1种)
  { name: "aug7", intervals: [0, 4, 8, 10], symbol: "aug7", group: "aug", groupName: "Augmented", groupZh: "增和弦" },
]

// Intervals - 完整音程定义，与原SOLO保持一致
const INTERVALS = [
  { name: "root", semitones: 0, symbol: "1" },
  { name: "flat2", semitones: 1, symbol: "b2" },
  { name: "two", semitones: 2, symbol: "2" },
  { name: "sharp2", semitones: 3, symbol: "#2" },
  { name: "flat3", semitones: 3, symbol: "b3" },
  { name: "three", semitones: 4, symbol: "3" },
  { name: "four", semitones: 5, symbol: "4" },
  { name: "sharp4", semitones: 6, symbol: "#4" },
  { name: "flat5", semitones: 6, symbol: "b5" },
  { name: "five", semitones: 7, symbol: "5" },
  { name: "sharp5", semitones: 8, symbol: "#5" },
  { name: "flat6", semitones: 8, symbol: "b6" },
  { name: "six", semitones: 9, symbol: "6" },
  { name: "flat7", semitones: 10, symbol: "b7" },
  { name: "bb7", semitones: 9, symbol: "bb7" },
  { name: "seven", semitones: 11, symbol: "7" },
  { name: "nine", semitones: 14, symbol: "9" },
  { name: "flat9", semitones: 13, symbol: "b9" },
  { name: "sharp9", semitones: 15, symbol: "#9" },
  { name: "eleven", semitones: 17, symbol: "11" },
  { name: "sharp11", semitones: 18, symbol: "#11" },
  { name: "thirteen", semitones: 21, symbol: "13" },
  { name: "flat13", semitones: 20, symbol: "b13" },
]

// 音阶音程数据类型定义
interface ScaleInterval {
  displayString: string
  formula: number
  isChordTone?: boolean
  isBebopPassingNoteChordTone?: boolean
  isBebopPassingTone?: boolean
}

interface ScaleDefinition {
  name: string
  displayString?: string
  intervals: ScaleInterval[]
  notes?: number[]
  formula?: string
}

interface ScaleGroup {
  name: string
  displayString: string
  scales: ScaleDefinition[]
}

// 完整的音阶数据 - 包含isChordTone等属性
const SCALE_GROUPS: ScaleGroup[] = [
  {
    name: "pentatonic",
    displayString: "五声音阶",
    scales: [
      {
        name: "Major Pentatonic",
        displayString: "大调五声",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "6", formula: 9, isChordTone: true }
        ],
        notes: [0, 2, 4, 7, 9],
        formula: "1 2 3 5 6"
      },
      {
        name: "Minor Pentatonic",
        displayString: "小调五声",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b7", formula: 10, isChordTone: true }
        ],
        notes: [0, 3, 5, 7, 10],
        formula: "1 b3 4 5 b7"
      },
      {
        name: "Dominant Pentatonic",
        displayString: "属七五声",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "3", formula: 4 },
          { displayString: "4", formula: 5, isChordTone: true },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b7", formula: 10, isChordTone: true }
        ],
        notes: [0, 4, 5, 7, 10],
        formula: "1 3 4 5 b7"
      },
      {
        name: "Minor 6 Pentatonic",
        displayString: "小六五声",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "6", formula: 9, isChordTone: true }
        ],
        notes: [0, 3, 5, 7, 9],
        formula: "1 b3 4 5 6"
      }
    ]
  },
  {
    name: "majorScaleModes",
    displayString: "大调音阶调式",
    scales: [
      {
        name: "Ionian",
        displayString: "伊奥尼亚 (大调)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(b6)", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 4, 5, 7, 9, 11],
        formula: "1 2 3 4 5 6 7"
      },
      {
        name: "Dorian",
        displayString: "多利亚 (调式2)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 3, 5, 7, 9, 10],
        formula: "1 2 b3 4 5 6 b7"
      },
      {
        name: "Phrygian",
        displayString: "弗里几亚 (调式3)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 3, 5, 7, 8, 10],
        formula: "1 b2 b3 4 5 b6 b7"
      },
      {
        name: "Lydian",
        displayString: "利底亚 (调式4)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(b6)", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 4, 6, 7, 9, 11],
        formula: "1 2 3 #4 5 6 7"
      },
      {
        name: "Mixolydian",
        displayString: "混合利底亚 (调式5)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 4, 5, 7, 9, 10],
        formula: "1 2 3 4 5 6 b7"
      },
      {
        name: "Aeolian",
        displayString: "爱奥利亚 (自然小调)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 3, 5, 7, 8, 10],
        formula: "1 2 b3 4 5 b6 b7"
      },
      {
        name: "Locrian",
        displayString: "洛克里亚 (调式7)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "b5", formula: 6, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 3, 5, 6, 8, 10],
        formula: "1 b2 b3 4 b5 b6 b7"
      }
    ]
  },
  {
    name: "melodicMinorModes",
    displayString: "旋律小调调式",
    scales: [
      {
        name: "Melodic Minor",
        displayString: "旋律小调 (调式1)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(b6)", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 3, 5, 7, 9, 11],
        formula: "1 2 b3 4 5 6 7"
      },
      {
        name: "Dorian b2",
        displayString: "多利亚b2 (调式2)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "b3", formula: 3 },
          { displayString: "4", formula: 5, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 3, 5, 7, 9, 10],
        formula: "1 b2 b3 4 5 6 b7"
      },
      {
        name: "Lydian Augmented",
        displayString: "利底亚增 (调式3)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "#5", formula: 8, isChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 4, 6, 8, 9, 11],
        formula: "1 2 3 #4 #5 6 7"
      },
      {
        name: "Lydian Dominant",
        displayString: "利底亚属 (调式4)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 4, 6, 7, 9, 10],
        formula: "1 2 3 #4 5 6 b7"
      },
      {
        name: "Mixolydian b6",
        displayString: "混合利底亚b6 (调式5)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 4, 5, 7, 8, 10],
        formula: "1 2 3 4 5 b6 b7"
      },
      {
        name: "Locrian Nat 2",
        displayString: "洛克里亚自然2 (调式6)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "b5", formula: 6, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 3, 5, 6, 8, 10],
        formula: "1 2 b3 4 b5 b6 b7"
      },
      {
        name: "Altered",
        displayString: "变化音阶 (调式7)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b9", formula: 1 },
          { displayString: "#9", formula: 3 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b5", formula: 6 },
          { displayString: "#5", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true }
        ],
        notes: [0, 1, 3, 4, 6, 8, 10],
        formula: "1 b9 #9 3 b5 #5 b7"
      }
    ]
  },
  {
    name: "harmonicMinorModes",
    displayString: "和声小调调式",
    scales: [
      {
        name: "Harmonic Minor",
        displayString: "和声小调 (调式1)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 3, 5, 7, 8, 11],
        formula: "1 2 b3 4 5 b6 7"
      },
      {
        name: "Locrian Nat 6",
        displayString: "洛克里亚自然6 (调式2)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "b5", formula: 6, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 3, 5, 6, 9, 10],
        formula: "1 b2 b3 4 b5 6 b7"
      },
      {
        name: "Ionian Augmented",
        displayString: "伊奥尼亚增 (调式3)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "#5", formula: 8, isChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 4, 5, 8, 9, 11],
        formula: "1 2 3 4 #5 6 7"
      },
      {
        name: "Dorian #4",
        displayString: "多利亚#4 (调式4)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 3, 6, 7, 9, 10],
        formula: "1 2 b3 #4 5 6 b7"
      },
      {
        name: "Phrygian Dominant",
        displayString: "弗里几亚属 (调式5)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b9", formula: 1 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b13", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 4, 5, 7, 8, 10],
        formula: "1 b9 3 4 5 b13 b7"
      },
      {
        name: "Lydian #9",
        displayString: "利底亚#9 (调式6)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "#9", formula: 3 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(b6)", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 3, 4, 6, 7, 9, 11],
        formula: "1 #9 3 #4 5 6 7"
      },
      {
        name: "Superlocrian bb7",
        displayString: "超洛克里亚bb7 (调式7)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b4", formula: 4 },
          { displayString: "b5", formula: 6, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "bb7", formula: 9, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 3, 4, 6, 8, 9],
        formula: "1 b2 b3 b4 b5 b6 bb7"
      }
    ]
  },
  {
    name: "harmonicMajorModes",
    displayString: "和声大调调式",
    scales: [
      {
        name: "Harmonic Major",
        displayString: "和声大调 (调式1)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 4, 5, 7, 8, 11],
        formula: "1 2 3 4 5 b6 7"
      },
      {
        name: "Dorian b5",
        displayString: "多利亚b5 (调式2)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "b5", formula: 6, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 3, 5, 6, 9, 10],
        formula: "1 2 b3 4 b5 6 b7"
      },
      {
        name: "Phrygian b4",
        displayString: "弗里几亚b4 (调式3)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b4", formula: 4 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 3, 4, 7, 8, 10],
        formula: "1 b2 b3 b4 5 b6 b7"
      },
      {
        name: "Lydian b3",
        displayString: "利底亚b3 (调式4)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(b6)", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 3, 6, 7, 9, 11],
        formula: "1 2 b3 #4 5 6 7"
      },
      {
        name: "Mixolydian b2",
        displayString: "混合利底亚b2 (调式5)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "3", formula: 4, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 4, 5, 7, 9, 10],
        formula: "1 b2 3 4 5 6 b7"
      },
      {
        name: "Lydian Augmented #2",
        displayString: "利底亚增#2 (调式6)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "#2", formula: 3 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "#5", formula: 8, isChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 3, 4, 6, 8, 9, 11],
        formula: "1 #2 3 #4 #5 6 7"
      },
      {
        name: "Locrian bb7",
        displayString: "洛克里亚bb7 (调式7)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b2", formula: 1 },
          { displayString: "b3", formula: 3, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "b5", formula: 6, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "b6", formula: 8 },
          { displayString: "bb7", formula: 9, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "(7)", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 3, 5, 6, 8, 9],
        formula: "1 b2 b3 4 b5 b6 bb7"
      }
    ]
  },
  {
    name: "otherScales",
    displayString: "其他音阶",
    scales: [
      {
        name: "Blues",
        displayString: "布鲁斯音阶",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "b5", formula: 6 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b7", formula: 10, isChordTone: true }
        ],
        notes: [0, 3, 5, 6, 7, 10],
        formula: "1 b3 4 b5 5 b7"
      },
      {
        name: "Major Blues",
        displayString: "大调布鲁斯",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "6", formula: 9, isChordTone: true }
        ],
        notes: [0, 2, 3, 4, 7, 9],
        formula: "1 2 b3 3 5 6"
      },
      {
        name: "Diminished Half Whole",
        displayString: "减音阶 半全",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "b9", formula: 1 },
          { displayString: "#9", formula: 3 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "b5", formula: 6 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "13", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true }
        ],
        notes: [0, 1, 3, 4, 6, 7, 9, 10],
        formula: "1 b9 #9 3 b5 5 13 b7"
      },
      {
        name: "Diminished Whole Half",
        displayString: "减音阶 全半",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "b5", formula: 6, isChordTone: true },
          { displayString: "#5", formula: 8 },
          { displayString: "6", formula: 9, isChordTone: true },
          { displayString: "7", formula: 11 }
        ],
        notes: [0, 2, 3, 5, 6, 8, 9, 11],
        formula: "1 2 b3 4 b5 #5 6 7"
      },
      {
        name: "Whole Tone",
        displayString: "全音音阶",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "#4", formula: 6 },
          { displayString: "#5", formula: 8, isChordTone: true },
          { displayString: "b7", formula: 10, isChordTone: true }
        ],
        notes: [0, 2, 4, 6, 8, 10],
        formula: "1 2 3 #4 #5 b7"
      },
      {
        name: "Augmented Scale",
        displayString: "增音阶",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "#9", formula: 3 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "5", formula: 7 },
          { displayString: "#5", formula: 8, isChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 3, 4, 7, 8, 11],
        formula: "1 #9 3 5 #5 7"
      }
    ]
  },
  {
    name: "bebopScales",
    displayString: "Bebop音阶",
    scales: [
      {
        name: "Bebop Dominant",
        displayString: "Bebop属音阶",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 4, 5, 7, 9, 10, 11],
        formula: "1 2 3 4 5 6 b7 7"
      },
      {
        name: "Bebop Major",
        displayString: "Bebop大调",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b6", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 4, 5, 7, 8, 9, 11],
        formula: "1 2 3 4 5 b6 6 7"
      },
      {
        name: "Bebop Dorian",
        displayString: "Bebop多利亚",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "6", formula: 9 },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 2, 3, 5, 7, 9, 10, 11],
        formula: "1 2 b3 4 5 6 b7 7"
      },
      {
        name: "Bebop Tonic Minor",
        displayString: "Bebop主小调",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b6", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isChordTone: true },
          { displayString: "7", formula: 11, isChordTone: true }
        ],
        notes: [0, 2, 3, 5, 7, 8, 9, 11],
        formula: "1 2 b3 4 5 b6 6 7"
      },
      {
        name: "Bebop Dom7b9b13",
        displayString: "Bebop属7b9b13",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "b9", formula: 1, isBebopPassingTone: true },
          { displayString: "3", formula: 4, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b13", formula: 8, isBebopPassingTone: true },
          { displayString: "b7", formula: 10, isChordTone: true, isBebopPassingNoteChordTone: true },
          { displayString: "7", formula: 11, isBebopPassingTone: true }
        ],
        notes: [0, 1, 4, 5, 7, 8, 10, 11],
        formula: "1 b9 3 4 5 b13 b7 7"
      },
      {
        name: "Bebop Tonic Minor Dorian",
        displayString: "Bebop主小调(多利亚)",
        intervals: [
          { displayString: "1", formula: 0, isChordTone: true },
          { displayString: "2", formula: 2 },
          { displayString: "b3", formula: 3, isChordTone: true },
          { displayString: "4", formula: 5 },
          { displayString: "5", formula: 7, isChordTone: true },
          { displayString: "b6", formula: 8, isBebopPassingTone: true },
          { displayString: "6", formula: 9, isChordTone: true },
          { displayString: "b7", formula: 10, isChordTone: true }
        ],
        notes: [0, 2, 3, 5, 7, 8, 9, 10],
        formula: "1 2 b3 4 5 b6 6 b7"
      }
    ]
  }
]

// Scale modes - 包含音程数字和音级字符串 (兼容旧数据结构)
// 按照 SOLO 的音阶分组结构组织
const SCALE_MODES = {
  pentatonic: [
    { name: "Major Pentatonic", notes: [0, 2, 4, 7, 9], intervals: ["1", "2", "3", "5", "6"], formula: "1 2 3 5 6" },
    { name: "Minor Pentatonic", notes: [0, 3, 5, 7, 10], intervals: ["1", "b3", "4", "5", "b7"], formula: "1 b3 4 5 b7" },
    { name: "Dominant Pentatonic", notes: [0, 4, 5, 7, 10], intervals: ["1", "3", "4", "5", "b7"], formula: "1 3 4 5 b7" },
    { name: "Minor 6 Pentatonic", notes: [0, 3, 5, 7, 9], intervals: ["1", "b3", "4", "5", "6"], formula: "1 b3 4 5 6" },
  ],
  majorScaleModes: [
    { name: "Ionian", notes: [0, 2, 4, 5, 7, 9, 11], intervals: ["1", "2", "3", "4", "5", "6", "7"], formula: "1 2 3 4 5 6 7" },
    { name: "Dorian", notes: [0, 2, 3, 5, 7, 9, 10], intervals: ["1", "2", "b3", "4", "5", "6", "b7"], formula: "1 2 b3 4 5 6 b7" },
    { name: "Phrygian", notes: [0, 1, 3, 5, 7, 8, 10], intervals: ["1", "b2", "b3", "4", "5", "b6", "b7"], formula: "1 b2 b3 4 5 b6 b7" },
    { name: "Lydian", notes: [0, 2, 4, 6, 7, 9, 11], intervals: ["1", "2", "3", "#4", "5", "6", "7"], formula: "1 2 3 #4 5 6 7" },
    { name: "Mixolydian", notes: [0, 2, 4, 5, 7, 9, 10], intervals: ["1", "2", "3", "4", "5", "6", "b7"], formula: "1 2 3 4 5 6 b7" },
    { name: "Aeolian", notes: [0, 2, 3, 5, 7, 8, 10], intervals: ["1", "2", "b3", "4", "5", "b6", "b7"], formula: "1 2 b3 4 5 b6 b7" },
    { name: "Locrian", notes: [0, 1, 3, 5, 6, 8, 10], intervals: ["1", "b2", "b3", "4", "b5", "b6", "b7"], formula: "1 b2 b3 4 b5 b6 b7" },
  ],
  melodicMinorScaleModes: [
    { name: "Melodic Minor", notes: [0, 2, 3, 5, 7, 9, 11], intervals: ["1", "2", "b3", "4", "5", "6", "7"], formula: "1 2 b3 4 5 6 7" },
    { name: "Dorian b2", notes: [0, 1, 3, 5, 7, 9, 10], intervals: ["1", "b2", "b3", "4", "5", "6", "b7"], formula: "1 b2 b3 4 5 6 b7" },
    { name: "Lydian Augmented", notes: [0, 2, 4, 6, 8, 9, 11], intervals: ["1", "2", "3", "#4", "#5", "6", "7"], formula: "1 2 3 #4 #5 6 7" },
    { name: "Lydian Dominant", notes: [0, 2, 4, 6, 7, 9, 10], intervals: ["1", "2", "3", "#4", "5", "6", "b7"], formula: "1 2 3 #4 5 6 b7" },
    { name: "Mixolydian b6", notes: [0, 2, 4, 5, 7, 8, 10], intervals: ["1", "2", "3", "4", "5", "b6", "b7"], formula: "1 2 3 4 5 b6 b7" },
    { name: "Locrian Nat 2", notes: [0, 2, 3, 5, 6, 8, 10], intervals: ["1", "2", "b3", "4", "b5", "b6", "b7"], formula: "1 2 b3 4 b5 b6 b7" },
    { name: "Altered", notes: [0, 1, 3, 4, 6, 8, 10], intervals: ["1", "b2", "#2", "3", "b5", "#5", "b7"], formula: "1 b2 #2 3 b5 #5 b7" },
  ],
  harmonicMinorScaleModes: [
    { name: "Harmonic Minor", notes: [0, 2, 3, 5, 7, 8, 11], intervals: ["1", "2", "b3", "4", "5", "b6", "7"], formula: "1 2 b3 4 5 b6 7" },
    { name: "Locrian Nat 6", notes: [0, 1, 3, 5, 6, 9, 10], intervals: ["1", "b2", "b3", "4", "b5", "6", "b7"], formula: "1 b2 b3 4 b5 6 b7" },
    { name: "Ionian Augmented", notes: [0, 2, 4, 5, 8, 9, 11], intervals: ["1", "2", "3", "4", "#5", "6", "7"], formula: "1 2 3 4 #5 6 7" },
    { name: "Dorian #4", notes: [0, 2, 3, 6, 7, 9, 10], intervals: ["1", "2", "b3", "#4", "5", "6", "b7"], formula: "1 2 b3 #4 5 6 b7" },
    { name: "Phrygian Dominant", notes: [0, 1, 4, 5, 7, 8, 10], intervals: ["1", "b2", "3", "4", "5", "b6", "b7"], formula: "1 b2 3 4 5 b6 b7" },
    { name: "Lydian #9", notes: [0, 3, 4, 6, 7, 9, 11], intervals: ["1", "#2", "3", "#4", "5", "6", "7"], formula: "1 #2 3 #4 5 6 7" },
    { name: "Superlocrian bb7", notes: [0, 1, 3, 4, 6, 8, 9], intervals: ["1", "b2", "b3", "3", "b5", "#5", "6"], formula: "1 b2 b3 3 b5 #5 6" },
  ],
  harmonicMajorScaleModes: [
    { name: "Harmonic Major", notes: [0, 2, 4, 5, 7, 8, 11], intervals: ["1", "2", "3", "4", "5", "b6", "7"], formula: "1 2 3 4 5 b6 7" },
    { name: "Dorian b5", notes: [0, 2, 3, 5, 6, 9, 10], intervals: ["1", "2", "b3", "4", "b5", "6", "b7"], formula: "1 2 b3 4 b5 6 b7" },
    { name: "Phrygian b4", notes: [0, 1, 3, 4, 7, 8, 10], intervals: ["1", "b2", "b3", "3", "5", "b6", "b7"], formula: "1 b2 b3 3 5 b6 b7" },
    { name: "Lydian b3", notes: [0, 2, 3, 6, 7, 9, 11], intervals: ["1", "2", "b3", "#4", "5", "6", "7"], formula: "1 2 b3 #4 5 6 7" },
    { name: "Mixolydian b2", notes: [0, 1, 4, 5, 7, 9, 10], intervals: ["1", "b2", "3", "4", "5", "6", "b7"], formula: "1 b2 3 4 5 6 b7" },
    { name: "Lydian Augmented #2", notes: [0, 3, 4, 6, 8, 9, 11], intervals: ["1", "#2", "3", "#4", "#5", "6", "7"], formula: "1 #2 3 #4 #5 6 7" },
    { name: "Locrian bb7", notes: [0, 1, 3, 5, 6, 8, 9], intervals: ["1", "b2", "b3", "4", "b5", "b6", "6"], formula: "1 b2 b3 4 b5 b6 6" },
  ],
  otherScales: [
    { name: "Blues", notes: [0, 3, 5, 6, 7, 10], intervals: ["1", "b3", "4", "#4", "5", "b7"], formula: "1 b3 4 #4 5 b7" },
    { name: "Major Blues", notes: [0, 2, 3, 4, 7, 9], intervals: ["1", "2", "b3", "3", "5", "6"], formula: "1 2 b3 3 5 6" },
    { name: "Diminished Half Whole", notes: [0, 1, 3, 4, 6, 7, 9, 10], intervals: ["1", "b2", "#2", "3", "b5", "5", "6", "b7"], formula: "1 b2 #2 3 b5 5 6 b7" },
    { name: "Diminished Whole Half", notes: [0, 2, 3, 5, 6, 8, 9, 11], intervals: ["1", "2", "b3", "4", "b5", "#5", "6", "7"], formula: "1 2 b3 4 b5 #5 6 7" },
    { name: "Whole Tone", notes: [0, 2, 4, 6, 8, 10], intervals: ["1", "2", "3", "#4", "#5", "#6"], formula: "1 2 3 #4 #5 #6" },
    { name: "Augmented Scale", notes: [0, 3, 4, 7, 8, 11], intervals: ["1", "#2", "3", "5", "#5", "7"], formula: "1 #2 3 5 #5 7" },
  ],
  bebopScales: [
    { name: "Bebop Dominant", notes: [0, 2, 4, 5, 7, 9, 10, 11], intervals: ["1", "2", "3", "4", "5", "6", "b7", "7"], formula: "1 2 3 4 5 6 b7 7" },
    { name: "Bebop Major", notes: [0, 2, 4, 5, 7, 8, 9, 11], intervals: ["1", "2", "3", "4", "5", "b6", "6", "7"], formula: "1 2 3 4 5 b6 6 7" },
    { name: "Bebop Dom7b9b13", notes: [0, 1, 4, 5, 7, 8, 10, 11], intervals: ["1", "b2", "3", "4", "5", "b6", "b7", "7"], formula: "1 b2 3 4 5 b6 b7 7" },
    { name: "Bebop Tonic Minor Melodic", notes: [0, 2, 3, 5, 7, 8, 9, 11], intervals: ["1", "2", "b3", "4", "5", "b6", "6", "7"], formula: "1 2 b3 4 5 b6 6 7" },
    { name: "Bebop Tonic Minor Dorian", notes: [0, 2, 3, 5, 7, 8, 9, 10], intervals: ["1", "2", "b3", "4", "5", "b6", "6", "b7"], formula: "1 2 b3 4 5 b6 6 b7" },
    { name: "Bebop Dorian", notes: [0, 2, 3, 5, 7, 9, 10, 11], intervals: ["1", "2", "b3", "4", "5", "6", "b7", "7"], formula: "1 2 b3 4 5 6 b7 7" },
  ],
  exotic: [
    { name: "Japanese", notes: [0, 1, 5, 7, 10], intervals: ["1", "b2", "4", "5", "b7"], formula: "1 b2 4 5 b7" },
    { name: "Egyptian", notes: [0, 2, 5, 7, 10], intervals: ["1", "2", "4", "5", "b7"], formula: "1 2 4 5 b7" },
    { name: "Spanish Phrygian", notes: [0, 1, 4, 5, 7, 8, 10], intervals: ["1", "b2", "3", "4", "5", "b6", "b7"], formula: "1 b2 3 4 5 b6 b7" },
    { name: "Hijaz", notes: [0, 1, 4, 5, 7, 8, 10], intervals: ["1", "b2", "3", "4", "5", "b6", "b7"], formula: "1 b2 3 4 5 b6 b7" },
    { name: "Double Harmonic", notes: [0, 1, 4, 5, 7, 8, 11], intervals: ["1", "b2", "3", "4", "5", "b6", "7"], formula: "1 b2 3 4 5 b6 7" },
  ],
  symmetrical: [
    { name: "Chromatic", notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], intervals: ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"], formula: "1 b2 2 b3 3 4 b5 5 b6 6 b7 7" },
    { name: "Augmented", notes: [0, 3, 4, 7, 8, 11], intervals: ["1", "b3", "3", "5", "b6", "7"], formula: "1 b3 3 5 b6 7" },
    { name: "Tritone", notes: [0, 1, 4, 6, 7, 10], intervals: ["1", "b2", "3", "b5", "5", "b7"], formula: "1 b2 3 b5 5 b7" },
  ],
  basic: [
    { name: "Major", notes: [0, 2, 4, 5, 7, 9, 11], intervals: ["1", "2", "3", "4", "5", "6", "7"], formula: "1 2 3 4 5 6 7" },
    { name: "Minor", notes: [0, 2, 3, 5, 7, 8, 10], intervals: ["1", "2", "b3", "4", "5", "b6", "b7"], formula: "1 2 b3 4 5 b6 b7" },
  ],
  church: [
    { name: "Ionian", notes: [0, 2, 4, 5, 7, 9, 11], intervals: ["1", "2", "3", "4", "5", "6", "7"], formula: "1 2 3 4 5 6 7" },
    { name: "Dorian", notes: [0, 2, 3, 5, 7, 9, 10], intervals: ["1", "2", "b3", "4", "5", "6", "b7"], formula: "1 2 b3 4 5 6 b7" },
    { name: "Phrygian", notes: [0, 1, 3, 5, 7, 8, 10], intervals: ["1", "b2", "b3", "4", "5", "b6", "b7"], formula: "1 b2 b3 4 5 b6 b7" },
    { name: "Lydian", notes: [0, 2, 4, 6, 7, 9, 11], intervals: ["1", "2", "3", "#4", "5", "6", "7"], formula: "1 2 3 #4 5 6 7" },
    { name: "Mixolydian", notes: [0, 2, 4, 5, 7, 9, 10], intervals: ["1", "2", "3", "4", "5", "6", "b7"], formula: "1 2 3 4 5 6 b7" },
    { name: "Aeolian", notes: [0, 2, 3, 5, 7, 8, 10], intervals: ["1", "2", "b3", "4", "5", "b6", "b7"], formula: "1 2 b3 4 5 b6 b7" },
    { name: "Locrian", notes: [0, 1, 3, 5, 6, 8, 10], intervals: ["1", "b2", "b3", "4", "b5", "b6", "b7"], formula: "1 b2 b3 4 b5 b6 b7" },
  ],
  minor: [
    { name: "Harmonic Minor", notes: [0, 2, 3, 5, 7, 8, 11], intervals: ["1", "2", "b3", "4", "5", "b6", "7"], formula: "1 2 b3 4 5 b6 7" },
    { name: "Melodic Minor", notes: [0, 2, 3, 5, 7, 9, 11], intervals: ["1", "2", "b3", "4", "5", "6", "7"], formula: "1 2 b3 4 5 6 7" },
  ],
  other: [
    { name: "Blues", notes: [0, 3, 5, 6, 7, 10], intervals: ["1", "b3", "4", "#4", "5", "b7"], formula: "1 b3 4 #4 5 b7" },
    { name: "Whole Tone", notes: [0, 2, 4, 6, 8, 10], intervals: ["1", "2", "3", "#4", "#5", "#6"], formula: "1 2 3 #4 #5 #6" },
    { name: "Diminished", notes: [0, 1, 3, 4, 6, 7, 9, 10], intervals: ["1", "b2", "b3", "3", "#4", "5", "6", "b7"], formula: "1 b2 b3 3 #4 5 6 b7" },
  ],
  bebop: [
    { name: "Bebop Major", notes: [0, 2, 4, 5, 7, 8, 9, 11], intervals: ["1", "2", "3", "4", "5", "b6", "6", "7"], formula: "1 2 3 4 5 b6 6 7" },
    { name: "Bebop Dorian", notes: [0, 2, 3, 4, 5, 7, 9, 10], intervals: ["1", "2", "b3", "3", "4", "5", "6", "b7"], formula: "1 2 b3 3 4 5 6 b7" },
    { name: "Bebop Mixolydian", notes: [0, 2, 4, 5, 7, 9, 10, 11], intervals: ["1", "2", "3", "4", "5", "6", "b7", "7"], formula: "1 2 3 4 5 6 b7 7" },
    { name: "Bebop Minor", notes: [0, 2, 3, 5, 7, 8, 9, 10], intervals: ["1", "2", "b3", "4", "5", "b6", "6", "b7"], formula: "1 2 b3 4 5 b6 6 b7" },
  ],
  jazz: [
    { name: "Lydian Dominant", notes: [0, 2, 4, 6, 7, 9, 10], intervals: ["1", "2", "3", "#4", "5", "6", "b7"], formula: "1 2 3 #4 5 6 b7" },
    { name: "Altered", notes: [0, 1, 3, 4, 6, 8, 10], intervals: ["1", "b2", "b3", "3", "b5", "b6", "b7"], formula: "1 b2 b3 3 b5 b6 b7" },
    { name: "Half-Whole Diminished", notes: [0, 1, 3, 4, 6, 7, 9, 10], intervals: ["1", "b2", "b3", "3", "#4", "5", "6", "b7"], formula: "1 b2 b3 3 #4 5 6 b7" },
    { name: "Whole-Half Diminished", notes: [0, 2, 3, 5, 6, 8, 9, 11], intervals: ["1", "2", "b3", "4", "b5", "b6", "6", "7"], formula: "1 2 b3 4 b5 b6 6 7" },
    { name: "Harmonic Major", notes: [0, 2, 4, 5, 7, 8, 11], intervals: ["1", "2", "3", "4", "5", "b6", "7"], formula: "1 2 3 4 5 b6 7" },
    { name: "Hungarian Minor", notes: [0, 2, 3, 6, 7, 8, 11], intervals: ["1", "2", "b3", "#4", "5", "b6", "7"], formula: "1 2 b3 #4 5 b6 7" },
  ],
}

// 音阶练习序列类型（琶音类型）
const SCALE_PRACTICE_SEQUENCES = [
  { id: "1to1", name: "1→1", nameKey: "scale_seq_1to1", description: "从根音到根音" },
  { id: "3to3", name: "3→3", nameKey: "scale_seq_3to3", description: "从三音到三音" },
  { id: "5to5", name: "5→5", nameKey: "scale_seq_5to5", description: "从五音到五音" },
  { id: "7to7", name: "7→7", nameKey: "scale_seq_7to7", description: "从七音到七音" },
  { id: "random", name: "随机", nameKey: "random", description: "随机琶音" },
]

// 和弦/音阶显示方式转换函数
const DISPLAY_NAMES = {
  "chinese": {
    "chordTypes": {
      "6": "大六和弦",
      "7": "属七和弦",
      "9": "属九和弦",
      "11": "属十一和弦",
      "13": "属十三和弦",
      "Major": "大三和弦",
      "Minor": "小三和弦",
      "Dim": "减三和弦",
      "Aug": "增三和弦",
      "m6": "小六和弦",
      "Maj7": "大七和弦",
      "m7": "小七和弦",
      "m7b5": "半减七和弦",
      "dim7": "减七和弦",
      "mMaj7": "小大七和弦",
      "aug7": "增七和弦",
      "7b5": "属七降五和弦",
      "7#5": "属七升五和弦",
      "maj7#5": "大七升五和弦",
      "Maj9": "大九和弦",
      "m9": "小九和弦",
      "m9b5": "小九降五和弦",
      "7#9": "属七升九和弦",
      "7b9": "属七降九和弦",
      "7#5b9": "属七升五降九和弦",
      "7#5#9": "属七升五升九和弦",
      "m11": "小十一和弦",
      "7#11": "属七升十一和弦",
      "9#11": "属九升十一和弦",
      "m13": "小十三和弦",
      "13b9": "属十三降九和弦",
      "13#11": "属十三升十一和弦",
      "sus2": "挂二和弦",
      "sus4": "挂四和弦",
      "7sus4": "属七挂四和弦",
      "9sus4": "属九挂四和弦",
      "add9": "加九和弦",
      "madd9": "小加九和弦",
      "6add9": "大六加九和弦",
      "m6add9": "小六加九和弦"
    },
    "scaleTypes": {
      "Major": "大调音阶",
      "Minor": "小调音阶",
      "Ionian": "伊奥尼亚调式",
      "Dorian": "多利亚调式",
      "Phrygian": "弗里几亚调式",
      "Lydian": "利底亚调式",
      "Mixolydian": "混合利底亚调式",
      "Aeolian": "爱奥利亚调式",
      "Locrian": "洛克里亚调式",
      "Harmonic Minor": "和声小调",
      "Melodic Minor": "旋律小调",
      "Major Pentatonic": "大调五声音阶",
      "Minor Pentatonic": "小调五声音阶",
      "Dominant Pentatonic": "属七五声音阶",
      "Minor 6 Pentatonic": "小六五声音阶",
      "Blues": "布鲁斯音阶",
      "Major Blues": "大调布鲁斯",
      "Whole Tone": "全音音阶",
      "Lydian Dominant": "利底亚属音阶",
      "Altered": "变化音阶",
      "Half-Whole Diminished": "半全减音阶",
      "Whole-Half Diminished": "全半减音阶",
      "Diminished Half Whole": "减音阶半全",
      "Diminished Whole Half": "减音阶全半",
      "Harmonic Major": "和声大调",
      "Hungarian Minor": "匈牙利小调",
      "Japanese": "日本音阶",
      "Egyptian": "埃及音阶",
      "Spanish Phrygian": "西班牙弗里几亚",
      "Hijaz": "希贾兹音阶",
      "Double Harmonic": "双和声音阶",
      "Chromatic": "半音阶",
      "Augmented": "增音阶",
      "Augmented Scale": "增音阶",
      "Tritone": "三全音音阶",
      "Dorian b2": "多利亚b2",
      "Lydian Augmented": "利底亚增",
      "Mixolydian b6": "混合利底亚b6",
      "Locrian Nat 2": "洛克里亚自然2",
      "Locrian Nat 6": "洛克里亚自然6",
      "Ionian Augmented": "伊奥尼亚增",
      "Dorian #4": "多利亚#4",
      "Phrygian Dominant": "弗里几亚属",
      "Lydian #9": "利底亚#9",
      "Superlocrian bb7": "超洛克里亚bb7",
      "Dorian b5": "多利亚b5",
      "Phrygian b4": "弗里几亚b4",
      "Lydian b3": "利底亚b3",
      "Mixolydian b2": "混合利底亚b2",
      "Lydian Augmented #2": "利底亚增#2",
      "Locrian bb7": "洛克里亚bb7",
      "Bebop Dominant": "Bebop属音阶",
      "Bebop Major": "Bebop大调",
      "Bebop Dorian": "Bebop多利亚",
      "Bebop Tonic Minor": "Bebop主小调",
      "Bebop Dom7b9b13": "Bebop属7b9b13",
      "Bebop Tonic Minor Dorian": "Bebop主小调(多利亚)",
      "Bebop Tonic Minor Melodic": "Bebop主小调(旋律)",
      "Bebop Mixolydian": "Bebop混合利底亚",
      "Bebop Minor": "Bebop小调"
    }
  },
  "english": {
    "chordTypes": {
      "6": "6",
      "7": "7",
      "9": "9",
      "11": "11",
      "13": "13",
      "Major": "Major",
      "Minor": "Minor",
      "Dim": "Dim",
      "Aug": "Aug",
      "m6": "m6",
      "Maj7": "Maj7",
      "m7": "m7",
      "m7b5": "m7b5",
      "dim7": "dim7",
      "mMaj7": "m(maj7)",
      "aug7": "aug7",
      "7b5": "7(b5)",
      "7#5": "7(#5)",
      "maj7#5": "maj7(#5)",
      "Maj9": "Maj9",
      "m9": "m9",
      "m9b5": "m9(b5)",
      "7#9": "7(#9)",
      "7b9": "7(b9)",
      "7#5b9": "7(#5b9)",
      "7#5#9": "7(#5#9)",
      "m11": "m11",
      "7#11": "7(#11)",
      "9#11": "9(#11)",
      "m13": "m13",
      "13b9": "13(b9)",
      "13#11": "13(#11)",
      "sus2": "sus2",
      "sus4": "sus4",
      "7sus4": "7sus4",
      "9sus4": "9sus4",
      "add9": "add9",
      "madd9": "m(add9)",
      "6add9": "6/9",
      "m6add9": "m6/9"
    },
    "scaleTypes": {
      "Major": "Major Scale",
      "Minor": "Minor Scale",
      "Ionian": "Ionian Mode",
      "Dorian": "Dorian Mode",
      "Phrygian": "Phrygian Mode",
      "Lydian": "Lydian Mode",
      "Mixolydian": "Mixolydian Mode",
      "Aeolian": "Aeolian Mode",
      "Locrian": "Locrian Mode",
      "Harmonic Minor": "Harmonic Minor",
      "Melodic Minor": "Melodic Minor",
      "Major Pentatonic": "Major Pentatonic",
      "Minor Pentatonic": "Minor Pentatonic",
      "Dominant Pentatonic": "Dominant Pentatonic",
      "Minor 6 Pentatonic": "Minor 6 Pentatonic",
      "Blues": "Blues Scale",
      "Major Blues": "Major Blues",
      "Whole Tone": "Whole Tone",
      "Lydian Dominant": "Lydian Dominant",
      "Altered": "Altered Scale",
      "Half-Whole Diminished": "Half-Whole Dim",
      "Whole-Half Diminished": "Whole-Half Dim",
      "Diminished Half Whole": "Diminished H-W",
      "Diminished Whole Half": "Diminished W-H",
      "Harmonic Major": "Harmonic Major",
      "Hungarian Minor": "Hungarian Minor",
      "Japanese": "Japanese Scale",
      "Egyptian": "Egyptian Scale",
      "Spanish Phrygian": "Spanish Phrygian",
      "Hijaz": "Hijaz Scale",
      "Double Harmonic": "Double Harmonic",
      "Chromatic": "Chromatic Scale",
      "Augmented": "Augmented Scale",
      "Augmented Scale": "Augmented Scale",
      "Tritone": "Tritone Scale",
      "Dorian b2": "Dorian b2",
      "Lydian Augmented": "Lydian Augmented",
      "Mixolydian b6": "Mixolydian b6",
      "Locrian Nat 2": "Locrian Nat 2",
      "Locrian Nat 6": "Locrian Nat 6",
      "Ionian Augmented": "Ionian Augmented",
      "Dorian #4": "Dorian #4",
      "Phrygian Dominant": "Phrygian Dominant",
      "Lydian #9": "Lydian #9",
      "Superlocrian bb7": "Superlocrian bb7",
      "Dorian b5": "Dorian b5",
      "Phrygian b4": "Phrygian b4",
      "Lydian b3": "Lydian b3",
      "Mixolydian b2": "Mixolydian b2",
      "Lydian Augmented #2": "Lydian Aug #2",
      "Locrian bb7": "Locrian bb7",
      "Bebop Dominant": "Bebop Dominant",
      "Bebop Major": "Bebop Major",
      "Bebop Dorian": "Bebop Dorian",
      "Bebop Tonic Minor": "Bebop Tonic Minor",
      "Bebop Dom7b9b13": "Bebop Dom7b9b13",
      "Bebop Tonic Minor Dorian": "Bebop Tonic Minor (Dorian)"
    }
  },
  "english_short": {
    "chordTypes": {
      "6": "6",
      "7": "7",
      "9": "9",
      "11": "11",
      "13": "13",
      "Major": "",
      "Minor": "m",
      "Dim": "dim",
      "Aug": "aug",
      "m6": "m6",
      "Maj7": "Maj7",
      "m7": "m7",
      "m7b5": "m7b5",
      "dim7": "dim7",
      "mMaj7": "m(maj7)",
      "aug7": "aug7",
      "7b5": "7(b5)",
      "7#5": "7(#5)",
      "maj7#5": "maj7(#5)",
      "Maj9": "Maj9",
      "m9": "m9",
      "m9b5": "m9(b5)",
      "7#9": "7(#9)",
      "7b9": "7(b9)",
      "7#5b9": "7(#5b9)",
      "7#5#9": "7(#5#9)",
      "m11": "m11",
      "7#11": "7(#11)",
      "9#11": "9(#11)",
      "m13": "m13",
      "13b9": "13(b9)",
      "13#11": "13(#11)",
      "sus2": "sus2",
      "sus4": "sus4",
      "7sus4": "7sus4",
      "9sus4": "9sus4",
      "add9": "add9",
      "madd9": "m(add9)",
      "6add9": "6/9",
      "m6add9": "m6/9"
    },
    "scaleTypes": {
      "Major": "Major",
      "Minor": "Minor",
      "Ionian": "Ionian",
      "Dorian": "Dorian",
      "Phrygian": "Phrygian",
      "Lydian": "Lydian",
      "Mixolydian": "Mixolydian",
      "Aeolian": "Aeolian",
      "Locrian": "Locrian",
      "Harmonic Minor": "Harm. Minor",
      "Melodic Minor": "Mel. Minor",
      "Major Pentatonic": "Maj Pent",
      "Minor Pentatonic": "Min Pent",
      "Dominant Pentatonic": "Dom Pent",
      "Minor 6 Pentatonic": "Min6 Pent",
      "Blues": "Blues",
      "Major Blues": "Maj Blues",
      "Whole Tone": "Whole Tone",
      "Lydian Dominant": "Lydian Dom",
      "Altered": "Altered",
      "Half-Whole Diminished": "H-W Dim",
      "Whole-Half Diminished": "W-H Dim",
      "Diminished Half Whole": "Dim H-W",
      "Diminished Whole Half": "Dim W-H",
      "Harmonic Major": "Harm. Major",
      "Hungarian Minor": "Hung. Minor",
      "Japanese": "Japanese",
      "Egyptian": "Egyptian",
      "Spanish Phrygian": "Spanish Phryg",
      "Hijaz": "Hijaz",
      "Double Harmonic": "Dbl Harm",
      "Chromatic": "Chromatic",
      "Augmented": "Augmented",
      "Augmented Scale": "Augmented",
      "Tritone": "Tritone",
      "Dorian b2": "Dorian b2",
      "Lydian Augmented": "Lydian Aug",
      "Mixolydian b6": "Mix b6",
      "Locrian Nat 2": "Locrian #2",
      "Locrian Nat 6": "Locrian #6",
      "Ionian Augmented": "Ionian Aug",
      "Dorian #4": "Dorian #4",
      "Phrygian Dominant": "Phryg Dom",
      "Lydian #9": "Lydian #9",
      "Superlocrian bb7": "Superloc bb7",
      "Dorian b5": "Dorian b5",
      "Phrygian b4": "Phryg b4",
      "Lydian b3": "Lydian b3",
      "Mixolydian b2": "Mix b2",
      "Lydian Augmented #2": "Lyd Aug #2",
      "Locrian bb7": "Locrian bb7",
      "Bebop Dominant": "Bebop Dom",
      "Bebop Major": "Bebop Maj",
      "Bebop Dorian": "Bebop Dor",
      "Bebop Tonic Minor": "Bebop Ton Min",
      "Bebop Dom7b9b13": "Bebop Dom7b9b13",
      "Bebop Tonic Minor Dorian": "Bebop Ton Min (Dor)"
    }
  },
  "jazz": {
    "chordTypes": {
      "6": "6",
      "7": "7",
      "9": "9",
      "11": "11",
      "13": "13",
      "Major": "Maj",
      "Minor": "min",
      "Dim": "dim",
      "Aug": "aug",
      "m6": "min6",
      "Maj7": "Maj7",
      "m7": "min7",
      "m7b5": "m7b5",
      "dim7": "dim7",
      "mMaj7": "min(maj7)",
      "aug7": "aug7",
      "7b5": "7(b5)",
      "7#5": "7(#5)",
      "maj7#5": "Maj7(#5)",
      "Maj9": "Maj9",
      "m9": "min9",
      "m9b5": "m9(b5)",
      "7#9": "7(#9)",
      "7b9": "7(b9)",
      "7#5b9": "7(#5b9)",
      "7#5#9": "7(#5#9)",
      "m11": "min11",
      "7#11": "7(#11)",
      "9#11": "9(#11)",
      "m13": "min13",
      "13b9": "13(b9)",
      "13#11": "13(#11)",
      "sus2": "sus2",
      "sus4": "sus4",
      "7sus4": "7sus4",
      "9sus4": "9sus4",
      "add9": "add9",
      "madd9": "min(add9)",
      "6add9": "6/9",
      "m6add9": "min6/9"
    },
    "scaleTypes": {
      "Major": "Ionian",
      "Minor": "Aeolian",
      "Ionian": "Ionian",
      "Dorian": "Dorian",
      "Phrygian": "Phrygian",
      "Lydian": "Lydian",
      "Mixolydian": "Mixolydian",
      "Aeolian": "Aeolian",
      "Locrian": "Locrian",
      "Harmonic Minor": "Harm. Minor",
      "Melodic Minor": "Mel. Minor",
      "Major Pentatonic": "Maj Pent",
      "Minor Pentatonic": "min Pent",
      "Dominant Pentatonic": "Dom Pent",
      "Minor 6 Pentatonic": "min6 Pent",
      "Blues": "Blues",
      "Major Blues": "Maj Blues",
      "Whole Tone": "Whole Tone",
      "Lydian Dominant": "Lydian Dom",
      "Altered": "Altered",
      "Half-Whole Diminished": "H-W Dim",
      "Whole-Half Diminished": "W-H Dim",
      "Diminished Half Whole": "Dim H-W",
      "Diminished Whole Half": "Dim W-H",
      "Harmonic Major": "Harm. Major",
      "Hungarian Minor": "Hung. Minor",
      "Japanese": "Japanese",
      "Egyptian": "Egyptian",
      "Spanish Phrygian": "Spanish Phryg",
      "Hijaz": "Hijaz",
      "Double Harmonic": "Dbl Harm",
      "Chromatic": "Chromatic",
      "Augmented": "Augmented",
      "Augmented Scale": "Augmented",
      "Tritone": "Tritone",
      "Dorian b2": "Dorian b2",
      "Lydian Augmented": "Lydian Aug",
      "Mixolydian b6": "Mix b6",
      "Locrian Nat 2": "Locrian #2",
      "Locrian Nat 6": "Locrian #6",
      "Ionian Augmented": "Ionian Aug",
      "Dorian #4": "Dorian #4",
      "Phrygian Dominant": "Phryg Dom",
      "Lydian #9": "Lydian #9",
      "Superlocrian bb7": "Superloc bb7",
      "Dorian b5": "Dorian b5",
      "Phrygian b4": "Phryg b4",
      "Lydian b3": "Lydian b3",
      "Mixolydian b2": "Mix b2",
      "Lydian Augmented #2": "Lyd Aug #2",
      "Locrian bb7": "Locrian bb7",
      "Bebop Dominant": "Bebop Dom",
      "Bebop Major": "Bebop Maj",
      "Bebop Dorian": "Bebop Dor",
      "Bebop Tonic Minor": "Bebop Ton Min",
      "Bebop Dom7b9b13": "Bebop Dom7b9b13",
      "Bebop Tonic Minor Dorian": "Bebop Ton Min (Dor)"
    }
  }
}

// 获取和弦显示名称
function getChordDisplayName(chordType: string, displayMode: 'chinese' | 'english' | 'english_short' | 'jazz'): string {
  return DISPLAY_NAMES[displayMode].chordTypes[chordType as keyof typeof DISPLAY_NAMES.chinese.chordTypes] || chordType
}

// 获取音阶显示名称
function getScaleDisplayName(scaleName: string, displayMode: 'chinese' | 'english' | 'english_short' | 'jazz'): string {
  const scaleTypes = DISPLAY_NAMES[displayMode].scaleTypes as Record<string, string>
  return scaleTypes[scaleName] || scaleName
}

// 将音程度数中的 # 和 b 转换为 ♯ 和 ♭
function formatDegree(degree: string): string {
  return degree.replace(/#/g, '♯').replace(/b/g, '♭')
}

// Song progressions
const SONG_PROGRESSIONS = [
  { 
    name: "Ask Me Now", 
    composer: "Thelonious Monk",
    year: "1951",
    style: "Jazz Modern",
    tempo: "Slow",
    key: "Db",
    chords: ["Gm7", "C7", "F#m7", "B7", "Fm7", "Bb7", "Em7", "A7", "Ebm7", "Ab7#5", "B7#11", "Bb7", "Eb7", "D7", "DbMaj7", "Eb7", "Ebm7", "Ab7", "B7", "Bb7", "A7", "Ab7", "Gm7", "C7", "F#m7", "B7", "Fm7", "Bb7", "Em7", "A7", "Ebm7", "Ab7#5", "B7#11", "Bb7", "Eb7", "D7", "DbMaj7", "Eb7", "Ebm7", "Ab7", "DbMaj7", "Ebm7", "Ab7", "DbMaj7", "Ebm7", "D7#11", "DbMaj7", "Eb7", "Ebm7", "Ab7", "Gb7#11", "Gm7", "C7", "F#m7", "B7", "Fm7", "Bb7", "Em7", "A7", "Ebm7", "Ab7#5", "B7#11", "Bb7", "Eb7", "D7", "DbMaj7", "Eb7", "Ebm7", "Ab7#5", "DbMaj7"] 
  },
  { 
    name: "Very Early", 
    composer: "Bill Evans",
    year: "1961",
    style: "Jazz Waltz",
    tempo: "Fast",
    key: "C",
    chords: ["CMaj7", "Bb7#11", "EbMaj7", "Ab13b9", "DbMaj7", "G7", "CMaj7", "Bb13", "DMaj7", "Am7", "F#m7", "B13b9", "Em7", "Ab7", "DbMaj7", "G7", "CMaj7", "Bb7#11", "EbMaj7", "Ab13b9", "DbMaj7", "G7", "CMaj7", "Bb7#11", "DMaj7", "Am7", "F#m7", "B13b9", "Em7", "Ab7", "DbMaj7", "G7#5", "BMaj7", "Ab13b9", "DbMaj7", "Bb7#11", "BMaj7", "G7", "CMaj7", "Ab7", "DbMaj7", "G7", "CMaj7", "A", "Dm7", "Em7", "FMaj7", "G7", "CMaj7", "G7"] 
  },
  { 
    name: "Footprints", 
    composer: "Wayne Shorter",
    year: "1966",
    style: "Jazz Modern",
    tempo: "Medium",
    key: "Cm",
    chords: ["Cm11", "Fm11", "Cm11", "F#m7b5", "F7#11", "E", "A", "Cm11"] 
  },
  { 
    name: "Days of Wine and Roses", 
    composer: "Henry Mancini",
    year: "1962",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "F",
    chords: ["FMaj7", "Eb7#11", "Am7", "D7b9", "Gm7", "Eb9", "Am7", "Dm7", "Gm7", "C7", "Em7b5", "A7b9", "Dm7", "G7", "Gm7", "C7", "FMaj7", "Eb7#11", "Am7", "D7b9", "Gm7", "Eb9", "Am7", "Dm7", "Bm7b5", "Bb7#11", "Am7", "Dm7", "Gm7", "C7", "FMaj7", "Gm7", "C7"] 
  },
  { 
    name: "Anthropology", 
    composer: "Charlie Parker & Dizzy Gillespie",
    year: "1946",
    style: "Jazz Bebop",
    tempo: "Fast",
    key: "Bb",
    chords: ["BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "Fm7", "Bb7", "EbMaj7", "Ab7", "Dm7", "G7b9", "Cm7", "F7", "BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "Fm7", "Bb7", "EbMaj7", "Ab7", "Cm7", "F7", "Bb", "D7", "G7", "C7", "F7", "BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "Fm7", "Bb7", "EbMaj7", "Ab7", "Cm7", "F7", "Bb"] 
  },
  { 
    name: "A Night In Tunisia", 
    composer: "Dizzy Gillespie",
    year: "1942",
    style: "Jazz Latin",
    tempo: "Fast",
    key: "Dm",
    chords: ["Eb7", "Eb7", "Eb7", "Eb7", "Eb7", "Eb7", "Eb7", "Eb7", "Eb7", "DmMaj7", "DmMaj7", "DmMaj7", "Em7b5", "A7b9", "DmMaj7", "DmMaj7", "DmMaj7", "DmMaj7", "Em7b5", "A7b9", "DmMaj7", "Am7b5", "D7b9", "Gm7", "Gm7b5", "C7b9", "FMaj7", "Em7b5", "A7b9", "DmMaj7", "DmMaj7", "DmMaj7", "Em7b5", "A7b9", "DmMaj7"] 
  },
  { 
    name: "All the Things You Are", 
    composer: "Jerome Kern",
    year: "1939",
    style: "Jazz Swing",
    tempo: "Fast",
    key: "Ab",
    chords: ["Fm7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Dm7", "G7", "CMaj7", "Cm7", "Fm7", "Bb7", "EbMaj7", "AbMaj7", "Am7", "D7", "GMaj7", "Am7", "D7", "GMaj7", "F#m7b5", "B", "EMaj7", "C", "Fm7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "DbmMaj7", "Cm7", "Bdim", "Bbm7", "Eb7", "AbMaj7", "Gm7b5", "C"] 
  },
  { 
    name: "Confirmation", 
    composer: "Charlie Parker",
    year: "1946",
    style: "Jazz Bebop",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "Em7b5", "A7b9", "Dm7", "G7b9", "Cm7", "F7", "Bb7", "Am7", "D7", "G7", "C7b9", "FMaj7", "Em7b5", "A7b9", "Dm7", "G7b9", "Cm7", "F7", "Bb7", "Am7", "D7", "Gm7", "C7", "FMaj7", "Cm7", "F7", "BbMaj7", "Ebm7", "Ab7", "DbMaj7", "Gm7", "C7", "FMaj7", "Em7b5", "A7b9", "Dm7", "G7b9", "Cm7", "F7", "Bb7", "Am7", "D7b9", "Gm7", "C7", "FMaj7", "C7"] 
  },
  { 
    name: "Beautiful Love", 
    composer: "Victor Young",
    year: "1931",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Dm",
    chords: ["Em7b5", "A7b9", "Dm7", "D7b9", "Gm7", "C7", "FMaj7", "Em7b5", "A7b9", "Dm7", "Gm7", "Bb7", "A7b9", "Dm7", "G7#11", "Em7b5", "A7b9", "Em7b5", "A7b9", "Dm7", "D7b9", "Gm7", "C7", "FMaj7", "Em7b5", "A7b9", "Dm7", "Gm7", "Bb7", "A7b9", "Dm7", "Bm7b5", "Bb7#11", "A7b9", "Dm7"] 
  },
  { 
    name: "Giant Steps", 
    composer: "John Coltrane",
    year: "1959",
    style: "Jazz Swing",
    tempo: "Fast",
    key: "B",
    chords: ["BMaj7", "D7", "GMaj7", "Bb7", "EbMaj7", "Am7", "D7", "GMaj7", "Bb7", "EbMaj7", "F#7", "BMaj7", "Fm7", "Bb7", "EbMaj7", "Am7", "D7", "GMaj7", "C#m7", "F#7", "BMaj7", "Fm7", "Bb7", "EbMaj7", "C#m7", "F#7"] 
  },
  { 
    name: "Falling Grace", 
    composer: "Steve Swallow",
    year: "1967",
    style: "Jazz Modern",
    tempo: "Fast",
    key: "Ab",
    chords: ["AbMaj7", "D7b9", "Gm7", "Fm7", "Bb7", "EbMaj7", "D7b9", "Gm7", "C7", "FMaj7", "F#m7b5", "B7b9", "Em7", "Am7", "D7", "GMaj7", "Cm7", "C#dim", "BbMaj7", "EbMaj7", "Em7b5", "A7b9", "Dm7", "Db7#11", "Cm7", "F7", "BbMaj7", "EbMaj7"] 
  },
  { 
    name: "Autumn Leaves", 
    composer: "Joseph Kosma",
    year: "1945",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Gm",
    chords: ["Cm7", "F7", "BbMaj7", "EbMaj7", "Am7b5", "D7b9", "Gm7", "G7b9", "Cm7", "F7", "BbMaj7", "EbMaj7", "Am7b5", "D7b9", "Gm7", "Am7b5", "D7b9", "Gm7", "G7b9", "Cm7", "F7", "BbMaj7", "EbMaj7", "Am7b5", "D7b9", "Gm7", "Gb7", "Fm7", "E7", "Am7b5", "D7b9", "Gm7", "G7b9"] 
  },
  { 
    name: "Someday My Prince Will Come", 
    composer: "Frank Churchill",
    year: "1937",
    style: "Jazz Swing",
    tempo: "Fast",
    key: "Bb",
    chords: ["BbMaj7", "D", "EbMaj7", "G7b9", "Cm7", "G7b9", "Cm7", "F7", "Dm7", "C#dim", "Cm7", "F7", "Dm7", "C#dim", "Cm7", "F7", "BbMaj7", "D7#5", "EbMaj7", "G7b9", "Cm7", "G7b9", "Cm7", "F7", "Fm7", "Bb7", "EbMaj7", "Edim", "BbMaj7", "G7b9", "Cm7", "F7"] 
  },
  { 
    name: "26-2", 
    composer: "John Coltrane",
    year: "1958",
    style: "Jazz Swing",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "Ab7", "DbMaj7", "E7", "AMaj7", "C7", "Cm7", "F7", "BbMaj7", "Db7", "GbMaj7", "A7", "Dm7", "G7", "Gm7", "C7", "FMaj7", "Ab7", "DbMaj7", "E7", "AMaj7", "C7", "Cm7", "F7", "BbMaj7", "Ab7", "DbMaj7", "E7", "AMaj7", "C7", "FMaj7", "Cm7", "F7", "Em7", "A7", "DMaj7", "F7", "BbMaj7", "Ebm7", "Ab7", "DbMaj7", "Gm7", "C7", "FMaj7", "Ab7", "DbMaj7", "E7", "AMaj7", "C7", "Cm7", "F7", "BbMaj7", "Ab7", "DbMaj7", "E7", "AMaj7", "C7", "FMaj7"] 
  },
  { 
    name: "Countdown", 
    composer: "John Coltrane",
    year: "1959",
    style: "Jazz Swing",
    tempo: "Fast",
    key: "Bb",
    chords: ["EMaj7", "Em7", "F7", "BbMaj7", "Db7", "GbMaj7", "A7", "DMaj7", "Dm7", "Eb7", "AbMaj7", "B7", "G7", "CMaj7", "Cm7", "Db7", "GbMaj7", "A7", "DMaj7", "F7", "BbMaj7", "Em7", "F7", "BbMaj7", "A7"] 
  },
  { 
    name: "Alone Together", 
    composer: "Arthur Schwartz",
    year: "1932",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Dm",
    chords: ["DMaj7", "Dm6", "Em7b5", "A7b9", "Dm6", "Em7b5", "A7b9", "Dm6", "Am7b5", "D7b9", "Gm7", "Bm7", "E7", "Gm7", "C7", "FMaj7", "Em7b5", "A7b9", "DMaj7", "Em7b5", "A7b9", "Dm6", "Em7b5", "A7b9", "Dm6", "Em7b5", "A7b9", "Dm6", "Am7b5", "D7b9", "Gm7", "Bm7", "E7", "Gm7", "C7", "FMaj7", "Em7b5", "A7b9", "Am7b5", "D7b9", "Gm6", "Gm7b5", "C7b9", "FMaj7", "Em7b5", "A7b9", "Dm6", "Em7b5", "A7b9", "Dm6", "Em7b5", "A7b9", "Dm6", "Bm7b5", "Bb7", "A7b9", "Dm6", "Em7b5", "A7b9"] 
  },
  { 
    name: "Blue in Green", 
    composer: "Miles Davis",
    year: "1959",
    style: "Jazz Modal",
    tempo: "Slow",
    key: "Gm",
    chords: ["Gm13", "A", "Dm7", "Db7#11", "Cm7", "F13b9", "BbMaj7#11", "A", "Dm7", "E", "Am7", "Dm7"] 
  },
  { 
    name: "Stella By Starlight", 
    composer: "Victor Young",
    year: "1944",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Bb",
    chords: ["Em7b5", "A7b9", "Cm7", "F7", "Fm7", "Bb7", "EbMaj7", "Ab7", "BbMaj7", "Em7b5", "A7b9", "Dm7", "Bbm7", "Eb7", "FMaj7", "Em7b5", "A7b9", "Am7b5", "D7b9", "G7#5", "Cm7", "Ab7#11", "BbMaj7", "Em7b5", "A7b9", "Dm7b5", "G7b9", "Cm7b5", "F7b9", "BbMaj7"] 
  },
  { 
    name: "Lady Bird", 
    composer: "Tadd Dameron",
    year: "1947",
    style: "Jazz Swing",
    tempo: "Fast",
    key: "C",
    chords: ["CMaj7", "Fm7", "Bb7", "CMaj7", "Bbm7", "Eb7", "AbMaj7", "Am7", "D7", "Dm7", "G7", "CMaj7", "EbMaj7", "AbMaj7", "DbMaj7"] 
  },
  { 
    name: "My Funny Valentine", 
    composer: "Richard Rodgers",
    year: "1937",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Cm",
    chords: ["Cm6", "Dm7b5", "G7b9", "Cm7", "F7", "AbMaj7", "Fm7", "Dm7b5", "G7b9", "Cm6", "Dm7b5", "G7b9", "Cm7", "F7", "AbMaj7", "Fm7", "Fm7b5", "B13b9", "EbMaj7", "Fm7", "Gm7", "Fm7", "EbMaj7", "Fm7", "Gm7", "Fm7", "EbMaj7", "G7b9", "Cm7", "B7", "Bbm7", "A7", "AbMaj7", "Dm7b5", "G7b9", "Cm6", "Dm7b5", "G7b9", "Cm7", "F7", "AbMaj7", "Dm7b5", "G7b9", "Cm7", "B7", "Bbm7", "Eb7", "AbMaj7", "Fm7", "Bb7", "Eb", "Dm7b5", "G7b9"] 
  },
  { 
    name: "Fall", 
    composer: "Wayne Shorter",
    year: "1967",
    style: "Jazz Modern",
    tempo: "Slow",
    key: "Em",
    chords: ["F#", "B13b9", "E", "EbMaj7#11", "F#", "B13b9", "E", "EbMaj7#11", "DMaj7", "D13b9", "Gm7", "Bm7", "AbMaj7#11", "F#", "B13b9", "Em7", "B"] 
  },
  { 
    name: "The Girl From Ipanema", 
    composer: "Antônio Carlos Jobim",
    year: "1962",
    style: "Jazz Bossa",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "G7#11", "Gm7", "Gb7#11", "FMaj7", "Gb7", "FMaj7", "G7#11", "Gm7", "Gb7#11", "FMaj7", "GbMaj7", "B7", "F#m7", "D7", "Gm7", "Eb7", "Am7", "D", "Gm7", "C", "FMaj7", "G7#11", "Gm7", "Gb7#11", "FMaj7", "Gb7#11"] 
  },
  { 
    name: "Infant Eyes", 
    composer: "Wayne Shorter",
    year: "1964",
    style: "Jazz Modern",
    tempo: "Slow",
    key: "Eb",
    chords: ["Gm7", "Fm7", "EbMaj7", "A13b9", "GbMaj7", "F", "Ebm7", "Bb", "Bb", "EbMaj7", "Eb", "EbMaj7#11", "EMaj7", "BMaj7", "Bb", "Abm7", "Eb", "D", "Gm7", "Fm7", "EbMaj7", "A13b9", "GbMaj7", "F", "Ebm7", "Bb"] 
  },
  { 
    name: "500 Miles High", 
    composer: "Chick Corea",
    year: "1973",
    style: "Jazz Latin",
    tempo: "Fast",
    key: "Em",
    chords: ["Em7", "Gm7", "BbMaj7", "Bm7b5", "E7#9", "Am7", "F#m7b5", "Fm7", "Cm7", "B7#9"] 
  },
  { 
    name: "Lakes (solo section)", 
    composer: "Pat Metheny",
    year: "1999",
    style: "Jazz Modern",
    tempo: "Fast",
    key: "D",
    chords: ["DMaj7", "C", "FMaj7", "Ab", "DbMaj7", "B", "EMaj7", "D", "GMaj7", "F", "BbMaj7", "Db", "GbMaj7", "G", "CMaj7", "A"] 
  },
  { 
    name: "Donna Lee", 
    composer: "Charlie Parker",
    year: "1947",
    style: "Bebop",
    tempo: "Fast",
    key: "Ab",
    chords: ["AbMaj7", "F7b9", "Bb7", "Bbm7", "Eb7", "AbMaj7", "Ebm7", "Ab7", "DbMaj7", "Gb7", "AbMaj7", "F7b9", "Bb7", "Bbm7", "Eb7", "AbMaj7", "F7b9", "Bb7", "Gm7b5", "C7b9", "Fm6", "C7b9", "Fm6", "C7b9", "Fm6", "Bdim", "Cm7", "F7b9", "Bbm7", "Eb7", "AbMaj7", "Bbm7", "Eb7"] 
  },
  { 
    name: "Corcovado", 
    composer: "Antônio Carlos Jobim",
    year: "1960",
    style: "Jazz Bossa",
    tempo: "Fast",
    key: "C",
    chords: ["Am6", "Abdim", "Gm7", "C7", "Fdim", "FMaj7", "Fm7", "Bb7", "Em7", "A", "D7", "Dm7", "Abdim", "Am6", "Abdim", "Gm7", "C", "Fdim", "FMaj7", "Fm7", "Fm6", "Em7", "Am7", "Dm7", "G", "Em7", "A", "Dm7", "G7"] 
  },
  { 
    name: "Virgo", 
    composer: "Wayne Shorter",
    year: "1969",
    style: "Jazz Modern",
    tempo: "Slow",
    key: "F",
    chords: ["FMaj7", "Bbm7", "Eb7", "Dm7b5", "Bb13", "AMaj7", "Am7", "Fm7", "Bb7", "Em7b5", "Eb13", "DMaj7", "Dm7", "Cm7", "F7", "Eb7", "D", "Am7", "Gm7", "A7", "DbMaj7", "Dm7", "G7", "Gm7", "C#m7", "F#7", "FMaj7", "Bbm7", "Eb7", "Dm7b5", "Bb13", "AMaj7", "Am7", "Fm7", "Bb7", "Em7b5", "Dm7", "Db", "Cm7", "F7", "BbMaj7", "E", "A", "Dm7", "Gm7", "C7"] 
  },
  { 
    name: "Sunny", 
    composer: "Bobby Hebb",
    year: "1966",
    style: "Pop RnB",
    tempo: "Medium",
    key: "Am",
    chords: ["Am9", "Gm7", "C7", "FMaj7", "Bm7b5", "E", "Am9", "Gm7", "C7", "FMaj7", "Bm7b5", "E", "Am9", "Gm7", "C7", "FMaj7", "Bb7#11", "Bm7b5", "E", "Am9", "Bm7b5", "E"] 
  },
  { 
    name: "Blues for Alice", 
    composer: "Charlie Parker",
    year: "1951",
    style: "Jazz Bebop",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "Em7b5", "A7b9", "Dm7", "G7", "Cm7", "F7", "Bb7", "Bbm7", "Eb7", "Am7", "D7", "Abm7", "Db7", "Gm7", "C7", "FMaj7", "D7b9", "Gm7", "C7"] 
  },
  { 
    name: "Ambleside", 
    composer: "John Taylor",
    year: "1979",
    style: "Jazz Modern",
    tempo: "Fast",
    key: "Ab",
    chords: ["AbMaj9", "EbMaj9", "F#m11", "B", "EMaj9", "Ab", "Db", "G", "CMaj9", "GMaj9", "Bbm7", "Eb", "AbMaj9", "C", "FMaj9", "B", "EMaj9", "BMaj9", "Dm7", "G13", "CMaj9", "E", "A", "Eb", "AbMaj7#5", "G", "CMaj7#5", "B", "EMaj7#5", "Eb"] 
  },
  { 
    name: "Time Remembered", 
    composer: "Bill Evans",
    year: "1962",
    style: "Jazz Modal",
    tempo: "Slow",
    key: "Bm",
    chords: ["Bm9", "CMaj7#11", "FMaj7#11", "Em9", "Am9", "Dm9", "Gm9", "EbMaj7#11", "AbMaj7#11", "Am9", "Dm9", "Gm9", "Cm9", "Fm11", "Em9", "Bm9", "Ebm9", "Am9", "Cm9", "F#m9", "Bm9", "Gm9", "EbMaj7#11", "Dm9", "Cm9"] 
  },
  { 
    name: "Coral", 
    composer: "Keith Jarrett",
    year: "1983",
    style: "Jazz Modern",
    tempo: "Slow",
    key: "Cm",
    chords: ["Cm7", "F7", "BbMaj7#5", "Am7b5", "D7b9", "Gm7", "C7", "G#m7", "BMaj7", "Gb", "BbMaj7", "Dm7b5", "G7b9", "BMaj7", "GbMaj7", "GbMaj7#11", "Fm11"] 
  },
  { 
    name: "Spain", 
    composer: "Chick Corea",
    year: "1971",
    style: "Jazz Latin",
    tempo: "Fast",
    key: "Bm",
    chords: ["GMaj7#11", "F#", "Em7", "A7", "DMaj7", "GMaj7#11", "C#", "F#", "Bm7", "B"] 
  },
  { 
    name: "Inner Urge", 
    composer: "Joe Henderson",
    year: "1964",
    style: "Jazz Modal",
    tempo: "Fast",
    key: "G",
    chords: ["F#m7b5", "FMaj7#11", "EbMaj7#11", "DbMaj7#11", "EMaj7#11", "DbMaj7#11", "DMaj7#11", "BMaj7#11", "CMaj7", "AMaj7", "Bb7", "GMaj7"] 
  },
  { 
    name: "Have You Met Miss Jones?", 
    composer: "Richard Rodgers",
    year: "1937",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "F",
    chords: ["FMaj7", "D7b9", "Gm7", "C7", "Am7", "Dm7", "Gm7", "C7", "FMaj7", "D7b9", "Gm7", "C7", "Am7", "Dm7", "Cm7", "F7", "BbMaj7", "Abm7", "Db7", "GbMaj7", "Em7", "A7", "DMaj7", "Abm7", "Db7", "GbMaj7", "Gm7", "C7", "FMaj7", "Bb7", "Am7", "D7b9", "Gm7", "C7", "Am7", "D7b9", "Gm7", "C7", "FMaj7", "Gm7", "C7"] 
  },
  { 
    name: "Solar", 
    composer: "Miles Davis",
    year: "1954",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Cm",
    chords: ["CmMaj7", "Gm7", "C7", "FMaj7", "Fm7", "Bb7", "EbMaj7", "Ebm7", "Ab7", "DbMaj7", "Dm7b5", "G7b9"] 
  },
  { 
    name: "Oleo", 
    composer: "Sonny Rollins",
    year: "1954",
    style: "Bebop",
    tempo: "Fast",
    key: "Bb",
    chords: ["BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "Fm7", "Bb7", "Eb7", "Ab7", "Dm7", "G7b9", "Cm7", "F7", "BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "Fm7", "Bb7", "Eb7", "Ab7", "Cm7", "F7", "BbMaj7", "D7", "G7", "C7", "F7", "BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "Fm7", "Bb7", "Eb7", "Ab7", "Cm7", "F7", "BbMaj7"] 
  },
  { 
    name: "Ex.14 - Major II-V-I Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "Ex.15 - Minor II-V-I Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "Cm",
    chords: ["Dm7b5", "G", "Cm7"] 
  },
  { 
    name: "Ex.25 - Major Key Diatonic 7th Chords", 
    composer: "Diatonic Major Scale Chords",
    year: "",
    style: "Diatonic Major Scale Chords",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "Dm7", "Em7", "FMaj7", "G7", "Am7", "Bm7b5"] 
  },
  { 
    name: "Ex.29 - Tadd Dameron Progression", 
    composer: "Standard Chord Progressions",
    year: "",
    style: "Standard Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "EbMaj7", "AbMaj7", "DbMaj7", "CMaj7"] 
  },
  { 
    name: "Ex.30 - Modal Progression 1", 
    composer: "Modal Progressions",
    year: "",
    style: "Modal Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["C", "B", "AMaj7#11", "Am11", "Abm11", "GMaj7#11", "F#", "F#", "Em9", "DMaj7#11", "Abm11", "GMaj7#11"] 
  },
  { 
    name: "Ex.31 - Modal Progression 2", 
    composer: "Modal Progressions",
    year: "",
    style: "Modal Progressions",
    tempo: "Slow",
    key: "Ebm",
    chords: ["Eb", "DMaj7#11", "B", "G#Maj7#5", "Gm13", "Db", "Cm9", "B13#11"] 
  },
  { 
    name: "Ex.32 - Jimi Progression", 
    composer: "Pop/Rock Progressions",
    year: "",
    style: "Pop/Rock Progressions",
    tempo: "Medium",
    key: "Em",
    chords: ["Em9", "GMaj7", "Am7", "Em9", "Bm7", "Bbm7", "Am7", "CMaj7", "GMaj7", "FMaj7", "CMaj7", "D"] 
  },
  { 
    name: "Ex.33 - Jimi With Secondary Dominants", 
    composer: "Pop/Rock Progressions",
    year: "",
    style: "Pop/Rock Progressions",
    tempo: "Medium",
    key: "Em",
    chords: ["Em9", "D7b9", "GMaj7", "E7b9", "Am7", "B7#5", "Em9", "Bm7", "Bbm7", "Am7", "CMaj7", "GMaj7", "F13", "CMaj7", "D"] 
  },
  { 
    name: "Ex.35 - Bop Passing Note Progression 2", 
    composer: "Passing Note Scale Exercises",
    year: "",
    style: "Passing Note Scale Exercises",
    tempo: "Medium",
    key: "Cm",
    chords: ["C", "F7b9", "Bb", "Eb7b9", "Ab", "Db7b9", "Gb", "B7b9", "E", "A7b9", "D", "G7b9"] 
  },
  { 
    name: "Ex.36 - Bop Passing Note Progression 3", 
    composer: "Passing Note Scale Exercises",
    year: "",
    style: "Passing Note Scale Exercises",
    tempo: "Medium",
    key: "Cm",
    chords: ["C", "F7b9", "Bb", "Eb7b9", "Ab", "Db7b9", "Gb", "B7b9", "E", "A7b9", "D", "G7b9"] 
  },
  { 
    name: "Take the A-Train", 
    composer: "Billy Strayhorn",
    year: "1941",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "C",
    chords: ["C", "D9#11", "Dm7", "G7", "C", "Dm7", "G7", "C", "D9#11", "Dm7", "G7", "C", "Gm7", "C7", "FMaj7", "D9", "Dm9", "G7", "G7b9", "C", "D9#11", "Dm7", "G7", "C", "Dm7", "G7"] 
  },
  { 
    name: "All of Me", 
    composer: "Gerald Marks & Seymour Simons",
    year: "1931",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "C",
    chords: ["C", "E7", "A7", "Dm7", "E7", "Am7", "D7", "Dm7", "G7", "C", "E7", "A7", "Dm7", "FMaj7", "Fm6", "Em7", "Am9", "Dm7", "G7", "C", "Dm7", "G7"] 
  },
  { 
    name: "All of You", 
    composer: "Cole Porter",
    year: "1954",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Eb",
    chords: ["Abm6", "EbMaj7", "Abm6", "EbMaj7", "Abm6", "Gm7", "C7", "Fm7", "Bb7", "EbMaj7", "D7b9", "Db7", "C7b9", "Fm7", "Bb7", "Abm6", "EbMaj7", "Abm6", "EbMaj7", "Gm7", "C7", "AbMaj7", "Am7b5", "D7b9", "Gm7", "C7", "Fm7", "C7b9", "Fm7", "Bb7", "EbMaj7"] 
  },
  { 
    name: "Ex.01 - Maj7 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7"] 
  },
  { 
    name: "Ex.02 - Min7 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "Cm",
    chords: ["Cm7"] 
  },
  { 
    name: "Ex.05 - 7sus4 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["C"] 
  },
  { 
    name: "Ex.06 - Dom7 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["C7"] 
  },
  { 
    name: "Ex.08 - MinMaj7 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "Cm",
    chords: ["CmMaj7"] 
  },
  { 
    name: "Ex.16 - Major II-V-I (altered V) Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["Dm7", "G", "CMaj7"] 
  },
  { 
    name: "Ex.17 - Major II-V-I w/Tritone Subs", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["Dm7", "Db9", "CMaj7"] 
  },
  { 
    name: "Ex.18 - Minor II-V-I w/Tritone Subs", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "Cm",
    chords: ["Dm7b5", "Db9", "Cm7"] 
  },
  { 
    name: "Ex.19 - Major Key I-IV-V-I Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "FMaj7", "G7", "CMaj7"] 
  },
  { 
    name: "Ex.20 - Major Key I-VI-IV-V Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "Am7", "FMaj7", "CMaj7"] 
  },
  { 
    name: "Ex.21 - Major Key I-VI-II-V Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "Am7", "Dm7", "G7"] 
  },
  { 
    name: "Ex.22 - Minor I-VI-II-V Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "Cm",
    chords: ["Cm7", "Am7b5", "Dm7b5", "G7b9"] 
  },
  { 
    name: "Ex.23 - I Dim - I Maj7 Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["Cdim", "CMaj7"] 
  },
  { 
    name: "Ex.24 - VII Dim - IMaj7 Progression", 
    composer: "Basic Chord Progressions",
    year: "",
    style: "Basic Chord Progressions",
    tempo: "Medium",
    key: "C",
    chords: ["Bdim", "CMaj7"] 
  },
  { 
    name: "Ex.26 - Basic Blues Progression (Quick IV)", 
    composer: "Standard Chord Progressions",
    year: "",
    style: "Standard Chord Progressions",
    tempo: "Slow",
    key: "E",
    chords: ["E7", "A7", "E7", "A7", "E7", "B7", "A7", "E7", "B7"] 
  },
  { 
    name: "Ex.28 - Rhythm Changes", 
    composer: "Standard Chord Progressions",
    year: "",
    style: "Standard Chord Progressions",
    tempo: "Medium",
    key: "Bb",
    chords: ["BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "BbMaj7", "Bb7", "EbMaj7", "Edim", "BbMaj7", "G7b9", "Cm7", "F7", "BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "BbMaj7", "Bb7", "EbMaj7", "Edim", "Cm7", "F7", "BbMaj7", "D7", "G7", "C7", "F7", "BbMaj7", "G7b9", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7", "BbMaj7", "Bb7", "EbMaj7", "Edim", "Cm7", "F7", "BbMaj7"] 
  },
  { 
    name: "Blue Bossa", 
    composer: "Kenny Dorham",
    year: "1961",
    style: "Jazz Latin",
    tempo: "Fast",
    key: "Cm",
    chords: ["Cm7", "Fm7", "Dm7b5", "G", "Cm7", "Ebm7", "Ab7", "DbMaj7", "Dm7b5", "G", "Cm7", "Dm7b5", "G"] 
  },
  { 
    name: "Ex.27 - Jazz Blues", 
    composer: "Standard Chord Progressions",
    year: "",
    style: "Standard Chord Progressions",
    tempo: "Medium",
    key: "Bb",
    chords: ["Bb7", "Eb7", "Bb7", "Fm7", "Bb", "Eb7", "Edim", "Bb7", "Eb7", "Dm7b5", "G", "Cm7", "F7", "Bb7", "G", "Cm7", "F7"] 
  },
  { 
    name: "Ex.34 - Bop Passing Note Progression 1", 
    composer: "Passing Note Scale Exercises",
    year: "",
    style: "Passing Note Scale Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["C", "F7", "Bb", "Eb7", "Ab", "Db7", "Gb", "B7", "E", "A7", "D", "G7"] 
  },
  { 
    name: "Ex.12 - Min7♭5♮9 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "Cm",
    chords: ["C"] 
  },
  { 
    name: "Ex.09 - 13sus4♭9 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["C"] 
  },
  { 
    name: "Ex.07 - Min7♭5 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["Cm7b5"] 
  },
  { 
    name: "Ex.03 - Sus4♭9 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["C"] 
  },
  { 
    name: "Ex.11 - 7♯11 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["C7#11"] 
  },
  { 
    name: "Ex.10 - Maj7♯5 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7#5"] 
  },
  { 
    name: "Ex.04 - Maj7♯11 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7#11"] 
  },
  { 
    name: "Ex.13 - 13♭9 Chord", 
    composer: "Single Chord Exercises",
    year: "",
    style: "Single Chord Exercises",
    tempo: "Medium",
    key: "C",
    chords: ["C13b9"] 
  },
  { 
    name: "Summertime", 
    composer: "George Gershwin",
    year: "1934",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Am",
    chords: ["Am7", "E7#5", "Am7", "A7b9", "Dm7", "F7", "B7#5", "E7b9", "Am7", "E7#5", "Am7", "D7b9", "G7b9", "CMaj7", "Am7", "Bm7b5", "E7#5", "Am7", "Bm7b5", "E7#5"] 
  },
  { 
    name: "Watermelon Man", 
    composer: "Herbie Hancock",
    year: "1962",
    style: "Jazz Funk",
    tempo: "Fast",
    key: "F",
    chords: ["F7", "Bb9", "F7", "C9", "Bb9", "C9", "Bb9", "C9", "Bb9", "Ab"] 
  },
  { 
    name: "My Favourite Things", 
    composer: "Richard Rodgers",
    year: "1959",
    style: "Jazz Waltz",
    tempo: "Medium",
    key: "Em",
    chords: ["Em7", "F#m7", "Em7", "F#m7", "CMaj7", "Am7", "D7", "GMaj7", "CMaj7", "GMaj7", "CMaj7", "F#m7b5", "B7b9", "Em7", "F#m7", "Em7", "F#m7", "CMaj7", "Am7", "D7", "GMaj7", "CMaj7", "GMaj7", "CMaj7", "F#m7b5", "B7b9", "EMaj7", "F#m7", "EMaj7", "F#m7", "AMaj7", "Am7", "D7", "GMaj7", "CMaj7", "GMaj7", "CMaj7", "F#m7b5", "B7b9", "Em7", "F#m7b5", "B7b9", "Em7", "CMaj7", "A7", "GMaj7", "CMaj7", "D7", "GMaj7", "CMaj7", "GMaj7", "CMaj7", "GMaj7", "CMaj7", "F#m7b5", "B7b9"] 
  },
  { 
    name: "Ex.37 - Jazz Minor Blues", 
    composer: "Standard Chord Progressions",
    year: "",
    style: "Standard Chord Progressions",
    tempo: "Medium",
    key: "Am",
    chords: ["Am7", "Am9", "Am7", "A", "Dm7", "Dm9", "Am7", "Am9", "F9", "E", "Am7", "E"] 
  },
  { 
    name: "Fly Me Too The Moon", 
    composer: "Bart Howard",
    year: "1954",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "Am",
    chords: ["Am7", "Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7b9", "Am7", "A7b9", "Dm7", "G7", "CMaj7", "F7", "Em7", "A7b9", "Dm7", "G7", "CMaj7", "Bm7b5", "E7b9", "Am7", "Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7b9", "Am7", "A7b9", "Dm7", "G7", "Em7", "A7b9", "Dm7", "G7", "CMaj7", "Bm7b5", "E7b9"] 
  },
  { 
    name: "A Child is Born", 
    composer: "Thad Jones",
    year: "1969",
    style: "Jazz Waltz",
    tempo: "Medium",
    key: "Bb",
    chords: ["BbMaj7", "Ebm6", "BbMaj7", "Ebm6", "BbMaj7", "Ebm6", "Am7b5", "D7#9", "Gm7", "D7#5", "Gm7", "D7#5", "Gm7", "C7", "F", "F7", "BbMaj7", "Ebm6", "BbMaj7", "Ebm6", "BbMaj7", "D", "EbMaj7", "Ab7", "BbMaj7", "GbMaj7", "Gm7", "C7", "F", "F7"] 
  },
  { 
    name: "Out of Nowhere", 
    composer: "Johnny Green",
    year: "1931",
    style: "Jazz Swing",
    tempo: "Slow",
    key: "G",
    chords: ["GMaj7", "Bbm7", "Eb7", "GMaj7", "Bm7", "E7b9", "Am7", "E7b9", "Am7", "Eb7", "Am7", "D7", "GMaj7", "Bbm7", "Eb7", "GMaj7", "Bm7", "E7b9", "Am7", "E7b9", "Am7", "Cm6", "Bm7", "Bbdim", "Am7", "D7", "G", "Am7", "D7"] 
  },
  { 
    name: "Bluesette", 
    composer: "Toots Thielemans",
    year: "1964",
    style: "Jazz Waltz",
    tempo: "Medium",
    key: "Bb",
    chords: ["BbMaj7", "Am7b5", "D7b9", "Gm7", "C7b9", "Fm7", "Bb7", "EbMaj7", "Ebm7", "Ab7", "DbMaj7", "C#m7", "F#7", "BMaj7", "Cm7", "F7", "Dm7", "G7b9", "Cm7", "F7"] 
  },
  { 
    name: "In Your Own Sweet Way", 
    composer: "Dave Brubeck",
    year: "1956",
    style: "Medium Swing",
    tempo: "Fast",
    key: "Eb",
    chords: ["Am7b5", "D7b9", "Gm7", "C7", "Cm7", "F7", "Bb7", "EbMaj7", "Abm7", "Db7", "GbMaj7", "BMaj7", "F", "B7", "Bb7", "Eb", "Am7b5", "D7b9", "Gm7", "C7", "Cm7", "F7", "Bb7", "EbMaj7", "Abm7", "Db7", "GbMaj7", "BMaj7", "F", "B7", "Bb7", "Eb", "Em7", "A7", "DMaj7", "Em7", "A7", "DMaj7", "Dm7", "G7", "Em7", "A7", "Dm7b5", "Ab7", "G7", "Cm7", "Am7b5", "D7b9", "Gm7", "C7", "Cm7", "F7", "Bb7", "EbMaj7", "Abm7", "Db7", "GbMaj7", "BMaj7", "F", "B7", "Bb7", "Eb", "Ab"] 
  },
  { 
    name: "One Note Samba", 
    composer: "Antônio Carlos Jobim",
    year: "1960",
    style: "Bossa Nova",
    tempo: "Fast",
    key: "Bb",
    chords: ["Dm7", "Db7", "Cm7", "B7#11", "Dm7", "Db7", "Cm7", "B7#11", "Fm7", "Bb7", "EbMaj7", "Ab7", "Dm7", "Db7", "Cm7", "B7#11", "Bb", "Ebm7", "Ab7", "DbMaj7", "C#m7", "F#7", "BMaj7", "Cm7b5", "F7b9", "Dm7", "Db7", "Cm7", "B7#11", "Dm7", "Db7", "Cm7", "B7#11", "Fm7", "Bb7", "EbMaj7", "Ab7", "Db", "C7", "BMaj7", "Bb"] 
  },
  { 
    name: "Black Narcissus", 
    composer: "Joe Henderson",
    year: "1969",
    style: "Jazz Waltz",
    tempo: "Medium",
    key: "G#m",
    chords: ["Abm7", "Bbm7", "Abm7", "Bbm7", "Abm7", "Bbm7", "Abm7", "CbMaj7#11", "F#m7", "G#m7", "F#m7", "G#m7", "F#m7", "G#m7", "F#m7", "AMaj7#11", "EbMaj7#11", "FMaj7#11", "BbMaj7#11", "CMaj7#11", "EbMaj7#11", "FMaj7#11", "BbMaj7#11", "GMaj7#11", "AbMaj7#11", "BbMaj7#11", "CMaj7#11"] 
  },
  { 
    name: "Bye Bye Blackbird", 
    composer: "Ray Henderson",
    year: "1926",
    style: "Jazz Swing",
    tempo: "Slow",
    key: "F",
    chords: ["FMaj7", "Gm7", "C7", "FMaj7", "Gm7", "C7", "FMaj7", "Am7b5", "D7b9", "Gm7", "C7", "Gm7", "D7b9", "Gm7", "C7", "Gm7", "C7", "F", "F7", "Am7b5", "D7b9", "Gm7", "Bbm7", "Eb7", "Gm7", "C7", "FMaj7", "Gm7", "C7", "FMaj7", "Am7b5", "D7b9", "Gm7", "C7", "FMaj7", "Gm7", "C7"] 
  },
  { 
    name: "Armando's Rhumba", 
    composer: "Chick Corea",
    year: "1980",
    style: "Latin",
    tempo: "Fast",
    key: "Cm",
    chords: ["Cm7", "D7b9", "G7#5", "Cm7", "Cm9", "D7b9", "G7#5", "Cm7", "C7b9", "Fm7", "D7b9", "Gm7", "Abdim", "D7b9", "Bb", "Bb", "Eb", "G7#5"] 
  },
  { 
    name: "April in Paris", 
    composer: "Vernon Duke",
    year: "1932",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "C",
    chords: ["G", "CMaj7", "Dm7b5", "G7b9", "CMaj7", "CMaj9", "Gm7", "C7", "FMaj7", "FMaj9", "Bm7b5", "E7b9", "Am7", "F#m7b5", "B7b9", "Bm7", "E7b9", "Em7b5", "A7b9", "F#m7b5", "Fdim", "Em7", "Ebdim", "Dm7b5", "G7b9", "C", "Bm7b5", "E7b9", "Am7", "F#m7b5", "B7b9", "EMaj7", "Dm7", "G7", "G", "CMaj7", "Em7b5", "A7b9", "D7", "Dm7b5", "G7b9", "C"] 
  },
  { 
    name: "Joy Spring", 
    composer: "Clifford Brown",
    year: "1954",
    style: "Up Tempo Swing",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "Am7", "Ab7", "Gm7", "C7", "FMaj7", "Abm7", "Db7", "GbMaj7", "Abm7", "Db7", "GbMaj7", "Bm7", "E7", "Bbm7", "A7", "Abm7", "Db7", "GbMaj7", "Am7", "D7", "GMaj7", "Gm7", "C7", "FMaj7", "Fm7", "Bb7", "EbMaj7", "Abm7", "Db7", "GbMaj7", "Gm7", "C7", "FMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "Am7", "Ab7", "Gm7", "C7", "FMaj7", "Gm7", "C7"] 
  },
  { 
    name: "Alice in Wonderland", 
    composer: "Sammy Fain",
    year: "1951",
    style: "Jazz Waltz",
    tempo: "Medium",
    key: "C",
    chords: ["Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7b9", "Am7", "Eb7#11", "Dm7", "G7", "Em7", "Am7", "Dm7", "G7", "Em7", "A7b9", "Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7b9", "Am7", "Eb7#11", "Dm7", "G7", "Em7", "Am7", "Dm7", "G7", "CMaj7", "CMaj9", "D7", "G7", "Em7", "Am7", "Dm7", "G7", "CMaj7", "FMaj7", "F#m7b5", "B7b9", "Em7", "A7b9", "Dm7", "A7b9", "Dm7", "G7"] 
  },
  { 
    name: "I Hear A Rhapsody", 
    composer: "George Fragos",
    year: "1941",
    style: "Medium Swing",
    tempo: "Medium",
    key: "Eb",
    chords: ["Cm7", "Fm7", "Bb7", "EbMaj7", "Ab7", "Gm7b5", "C7b9", "Fm7", "Abm7", "Bbm7", "Bb7", "EbMaj7", "Dm7b5", "G7#5", "Cm7", "Fm7", "Bb7", "EbMaj7", "Ab7", "Gm7b5", "C7b9", "Fm7", "Abm7", "Bbm7", "Bb7", "EbMaj7", "Am7b5", "D7b9", "Gm7", "Am7b5", "D7b9", "Gm7", "Cm7", "F7", "BbMaj7", "Fm7", "Dm7b5", "G7b9", "G7#5", "Cm7", "Fm7", "Bb7", "EbMaj7", "Ab7", "Gm7b5", "C7b9", "Fm7", "Abm7", "Bbm7", "Bb7", "EbMaj7", "Dm7b5", "G7#5"] 
  },
  { 
    name: "Ladies In Mercedes", 
    composer: "Pat Metheny",
    year: "1997",
    style: "Bossa",
    tempo: "Medium",
    key: "G",
    chords: ["GMaj7", "GMaj7", "C7#11", "C7#11", "Bm7", "Bm7", "E7", "E7", "C#", "C#", "F#mMaj7", "F#mMaj7", "D#m7b5", "D#m7b5", "G#7", "G#7", "DbMaj7", "DbMaj7", "Gb7#11", "Gb7#11", "Fm7", "Fm7", "Bb7", "Bb7", "G", "G", "CmMaj7", "CmMaj7", "Am7b5", "Am7b5", "D7", "D7"] 
  },
  { 
    name: "Laurie", 
    composer: "Bill Evans",
    year: "1962",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Bb",
    chords: ["BbMaj7", "E", "E7#5#9", "Am7", "Am7", "D7#5", "Gm7b5", "C7#5#9", "Cm7", "Cm7", "F7#5", "Fm7", "Bb7#5#9", "Ebm7", "Ab7#9", "Dm7b5", "Db", "Db7", "C", "C7", "B9", "BbMaj7", "E", "E7#5#9", "Am7", "Am7", "D7#5", "Gm7b5", "C7#5", "Cm7", "Cm7", "F7#5", "Fm7", "Bb7#5#9", "Ebm7", "Ab7#9", "Gm7", "Am7", "Bm7", "C#m7", "Cm7b5", "F7#5#9", "Bb", "Ab", "Gb", "F", "F7"] 
  },
  { 
    name: "Pannonica", 
    composer: "Thelonious Monk",
    year: "1956",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "C",
    chords: ["CMaj7", "Ebm7", "A", "Ab7", "Dm7", "Bb7", "EbMaj7", "A7#11", "Ab7", "Db7", "GbMaj7", "F7#5", "Ebm7", "Ab7", "G7", "DbMaj7", "CMaj7", "Ebm7", "Ab", "Ab7", "Dm7", "Bb7", "EbMaj7", "A7#11", "Ab7", "Db7", "GbMaj7", "F", "Ebm7", "Ab7", "G7", "DbMaj7", "Gm7", "C7", "Cm7", "F7", "F#7", "BMaj7", "Dm7", "G7", "CMaj7", "Bm7", "E7", "A7", "D7", "G7"] 
  },
  { 
    name: "I Fall In Love Too Easily", 
    composer: "Jule Styne",
    year: "1944",
    style: "Ballad",
    tempo: "Slow",
    key: "Eb",
    chords: ["Fm7", "Bb7", "EbMaj7", "AbMaj7", "Dm7b5", "G7#9", "Cm7", "A7b5", "Dm7b5", "G7#9", "Cm7", "Am7b5", "D7b9", "Dm7b5", "G7b9", "Am7b5", "D", "G7b9", "Gm7b5", "C7b9", "Fm7", "C7b9", "Fm7", "Abm7", "Db7", "G", "C7b9", "Fm7", "Bb7", "Eb", "C7b9"] 
  },
  { 
    name: "Here's That Rainy Day", 
    composer: "Jimmy Van Heusen",
    year: "1953",
    style: "Ballad",
    tempo: "Slow",
    key: "G",
    chords: ["GMaj7", "Bb7", "EbMaj7", "AbMaj7", "Am7", "D7", "GMaj7", "Dm7", "G7", "Cm7", "F7", "BbMaj7", "EbMaj7", "Am7", "D7", "GMaj7", "Em7", "Am7", "D7", "GMaj7", "Bb7", "EbMaj7", "AbMaj7", "Am7", "D7", "GMaj7", "Dm7", "G7", "CMaj7", "Am7", "D13", "Bm7", "Em7", "A13", "Am7", "D7", "G", "Em7", "Am7", "D7"] 
  },
  { 
    name: "Peace", 
    composer: "Horace Silver",
    year: "1959",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Bb",
    chords: ["Am7b5", "D7b9", "Gm7", "C7", "BbMaj7", "Cm7b5", "F7", "BbMaj7", "Bm7", "E7", "AMaj7", "F#m7", "Ebm7b5", "Ab7", "DbMaj7", "C", "B7#11", "BbMaj7"] 
  },
  { 
    name: "The Girl From Ipanema", 
    composer: "Antônio Carlos Jobim",
    year: "1962",
    style: "Bossa",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "F", "G7#11", "G9#11", "Gm7", "Gb7#11", "FMaj7", "Gb7", "FMaj7", "F", "G7#11", "G9#11", "Gm7", "Gb7#11", "FMaj7", "FMaj9", "F#Maj7", "F#Maj7", "B7", "B7", "F#m7", "D7", "Gm7", "Gm7", "Eb7", "Eb7", "Am7", "D", "Gm7", "C", "FMaj7", "FMaj9", "G7#11", "G9#11", "Gm7", "G7#11", "FMaj7", "Gb7"] 
  },
  { 
    name: "Evidence", 
    composer: "Thelonious Monk",
    year: "1948",
    style: "Medium Swing",
    tempo: "Medium",
    key: "Eb",
    chords: ["EbMaj7", "Gm7", "C7#11", "Fm7", "Bb7#11", "A7", "Am7", "Db7", "Fm7", "F", "EbMaj7", "Gm7", "C7#11", "Fm7", "Bb7#11", "A7", "Abm7", "Db7", "Fm7", "F", "Bbm7", "Eb7#11", "AbMaj7", "Db7", "Cm7", "G7#11", "F7", "Bb7#11", "EbMaj7", "Gm7", "C7#11", "Fm7", "Bb7#11", "A7", "Abm7", "Db7", "Fm7", "F"] 
  },
  { 
    name: "Emily", 
    composer: "Johnny Mandel",
    year: "1964",
    style: "Waltz",
    tempo: "Fast",
    key: "A",
    chords: ["AMaj7", "F#m7", "Bm7", "E7", "AMaj7", "A7", "DMaj7", "G7", "F#Maj7", "D#m7", "G#m7", "C#7b9", "F#m7", "B7", "Bm7", "E7#5", "AMaj7", "F#m7", "Bm7", "E7", "AMaj7", "A7", "DMaj7", "C#7", "F#m7", "G#7#5", "C#m7", "F#7", "Bm7", "E7", "C#m7b5", "F#7b9", "D#m7b5", "Dm6", "C#m7", "F#7b9", "Bm7", "E7", "AMaj7", "E7"] 
  },
  { 
    name: "There Will Never Be Another You", 
    composer: "Harry Warren",
    year: "1942",
    style: "Medium Jazz",
    tempo: "Medium",
    key: "Eb",
    chords: ["EbMaj7", "EbMaj7", "Dm7b5", "G7b9", "Cm7", "Cm7", "Bbm7", "Eb7", "AbMaj7", "Db7#11", "EbMaj7", "Cm7", "F7", "F7", "Fm7", "Bb7", "EbMaj7", "EbMaj7", "Dm7b5", "G7b9", "Cm7", "Cm7", "Bbm7", "Eb7", "AbMaj7", "Db7#11", "EbMaj7", "Am7b5", "D7", "EbMaj7", "Ab7", "Gm7", "C7", "Fm7", "Bb7", "Eb", "Bb7"] 
  },
  { 
    name: "Up Jumped Spring", 
    composer: "Freddie Hubbard",
    year: "1960",
    style: "Jazz Waltz",
    tempo: "Medium",
    key: "Bb",
    chords: ["BbMaj7", "G7#5", "Cm7", "F7", "F#dim", "Gm7", "Fm7", "Em7b5", "A7b9", "Dm7", "Ebm7", "Dm7", "Ebm7", "Bm7b5", "E7", "Cm7b5", "F7", "F7", "BbMaj7", "G7#5", "Cm7", "F7", "F#dim", "Gm7", "Fm7", "Em7b5", "A7b9", "Dm7", "Ebm7", "Dm7", "Ebm7", "Cm7", "F7", "Bb", "Am7b5", "D7b9", "Gm7", "C7", "FMaj7", "Dm7", "Abm7", "Db7", "Cm7", "F7", "BbMaj7", "G7#5b9", "Cm7", "F7", "F#dim", "Gm7", "Fm7", "Em7b5", "A7b9", "Dm7", "Ebm7", "Dm7", "Ebm7", "Cm7", "F7", "BbMaj7", "BbMaj7"] 
  },
  { 
    name: "Early Autumn", 
    composer: "Ralph Burns & Woody Herman",
    year: "1949",
    style: "Ballad",
    tempo: "Slow",
    key: "C",
    chords: ["CMaj7", "B7b9", "BbMaj7", "A7#9", "AbMaj7", "G7#9", "CMaj7", "A7#9", "Dm7", "G7", "CMaj7", "B7b9", "BbMaj7", "A7#9", "AbMaj7", "G7#9", "C", "C", "Dm7", "G7", "CMaj7", "Ebdim", "Dm7", "G7", "CMaj7", "Cm7", "F7", "BbMaj7", "Eb7", "DMaj7", "Db7", "C7", "B7", "Bb7", "AMaj7", "Ab7", "G7", "CMaj7", "Bb7b9", "BbMaj7", "A7#9", "AbMaj7", "G7#9", "C", "Am7", "Dm7", "G7"] 
  },
  { 
    name: "The Duke", 
    composer: "Dave Brubeck",
    year: "1955",
    style: "Medium Swing",
    tempo: "Fast",
    key: "C",
    chords: ["CMaj7", "FMaj7", "Em7", "Am7", "B7", "Am7", "Am7", "Dm7", "Fm7", "Bb7", "EbMaj7", "DbMaj7", "Cm7", "Bm7", "Bbm7", "Eb7", "AbMaj7", "D7", "Db7", "CMaj7", "CMaj7", "FMaj7", "Em7", "Am7", "B7", "Em7", "Am7", "Dm7", "Fm7", "Bb7", "EbMaj7", "DbMaj7", "Cm7", "Bm7", "Bbm7", "Eb7", "AbMaj7", "D7", "Db7", "CMaj7", "FMaj7", "E7", "D7", "CMaj7", "Bbm7", "AbMaj7", "G7b9", "Fm7", "Dm7b5", "G7", "Cm7", "Cm7b5", "F7", "Bbm7", "AbMaj7", "Bbm7", "Ab", "Gm7b5", "Fm7", "Eb", "Db7#11", "CMaj7", "FMaj7", "Em7", "Am7", "B7", "Em7", "Am7", "Dm7", "Fm7", "Bb7", "EbMaj7", "DbMaj7", "Cm7", "Bm7", "Bbm7", "Eb7", "AbMaj7", "D7", "Db7", "CMaj7"] 
  },
  { 
    name: "Cherokee", 
    composer: "Ray Noble",
    year: "1938",
    style: "Jazz Swing",
    tempo: "Fast",
    key: "Bb",
    chords: ["Bb", "Fm7", "Bb7", "EbMaj7", "Ab7", "Bb", "C7", "Cm7", "G7b9", "Cm7", "F7#5", "Bb", "Fm7", "Bb7", "EbMaj7", "Ab7", "Bb", "C7", "Cm7", "F7", "Bb", "C#m7", "F#7", "BMaj7", "Bm7", "E7", "AMaj7", "Am7", "D7", "GMaj7", "Gm7", "C7", "Cm7", "F7#5", "Bb", "Fm7", "Bb7", "EbMaj7", "Ab7", "Bb", "C7", "Cm7", "F7", "Bb"] 
  },
  { 
    name: "Dewey Square", 
    composer: "Charlie Parker",
    year: "1947",
    style: "Medium Up Swing",
    tempo: "Fast",
    key: "Eb",
    chords: ["EbMaj7", "Abm7", "Db7", "Gm7", "C7", "F7", "Bb7", "Gm7", "C7", "Fm7", "Bb7", "EbMaj7", "Abm7", "Db7", "Gm7", "C7", "F7", "Bb7", "EbMaj7", "Bbm7", "Eb7", "AbMaj7", "Abm7", "Db7", "EbMaj7", "EbMaj9", "C7", "F7", "F7", "Fm7", "Bb7", "EbMaj7", "Abm7", "Db7", "Gm7", "C7", "F7", "Fm7", "Bb7", "EbMaj7", "C7", "Fm7", "Bb7"] 
  },
  { 
    name: "Beatrice", 
    composer: "Sam Rivers",
    year: "1966",
    style: "Medium Swing",
    tempo: "Medium",
    key: "F",
    chords: ["FMaj7", "GbMaj7#11", "FMaj7", "EbMaj7#11", "Dm7", "Eb", "Dm7", "Cm7", "Bbm7", "Am7", "BbMaj7", "Em7b5", "A7b9", "Dm7", "Gm7", "Gb", "Fm7", "Gb"] 
  },
  { 
    name: "A Fine Romance", 
    composer: "Jerome Kern",
    year: "1936",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "C",
    chords: ["C", "C#dim", "Dm6", "D#dim", "Em7", "Am7", "Dm7", "G7", "C", "Ebdim", "Dm7", "G7", "Em7", "A7b9", "D7", "G7", "C", "C#dim", "Dm6", "D#dim", "Em7", "Am7", "Dm7", "G7", "C", "C7", "FMaj7", "F#m7b5", "B7b9", "Em7", "A7b9", "Dm7", "G7", "C", "Dm7", "G7"] 
  },
  { 
    name: "Afternoon in Paris", 
    composer: "Jazz Swing",
    year: "",
    style: "Jazz Swing",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "Cm7", "F7", "BbMaj7", "Bbm7", "Eb7", "AbMaj7", "Dm7", "G7#9", "CMaj7", "Dm7", "G7", "CMaj7", "Cm7", "F7", "BbMaj7", "Bbm7", "Eb7", "AbMaj7", "Dm7", "G7#9", "CMaj7", "CMaj9", "Dm7", "G7", "CMaj7", "A7b9", "Dm7", "G7", "C#m7", "F#7", "Dm7", "G7", "CMaj7", "Cm7", "F7", "BbMaj7", "Bbm7", "Eb7", "AbMaj7", "Dm7", "G7#9", "CMaj7", "Dm7", "G7"] 
  },
  { 
    name: "Chelsea Bridge", 
    composer: "Jazz Ballad",
    year: "",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Bbm",
    chords: ["BbmMaj7", "AbmMaj7", "BbmMaj7", "AbmMaj7", "Bb7", "Ebm7", "Ab7", "Db", "C7", "B7", "BbmMaj7", "AbmMaj7", "BbmMaj7", "AbmMaj7", "Bb7", "Ebm7", "Ab7", "Db", "C7", "B7", "F#m7", "B7", "EMaj7", "C#m7", "F#m7", "B", "Bm7", "E7", "AMaj7", "Am7", "D7", "GMaj7", "Gm7", "C7", "Db7", "C7", "B7", "BbmMaj7", "AbmMaj7", "BbmMaj7", "AbmMaj7", "Bb7", "Ebm7", "Ab7", "Db", "C7", "B7"] 
  },
  { 
    name: "Ceora", 
    composer: "Bossa Nova",
    year: "",
    style: "Bossa Nova",
    tempo: "Fast",
    key: "Ab",
    chords: ["AbMaj7", "Bbm7", "Eb7", "AbMaj7", "Ebm7", "Ab7", "DbMaj7", "Dm7", "G7", "Cm7", "F7", "Bbm7", "Eb7", "Cm7", "F7", "Dm7", "G7", "Cm7", "F7", "Bbm7", "Eb7", "AbMaj7", "Bbm7", "Eb7", "AbMaj7", "Ebm7", "Ab7", "DbMaj7", "Dm7", "G7", "Cm7", "F", "Bbm7", "Eb7", "Cm7b5", "F", "Bbm7", "Eb7", "AbMaj7", "Bbm7", "Eb7"] 
  },
  { 
    name: "I Should Care", 
    composer: "Medium Swing",
    year: "",
    style: "Medium Swing",
    tempo: "Medium",
    key: "C",
    chords: ["Dm7", "G7", "Em7", "A7", "Dm7", "G7", "CMaj7", "Em7b5", "A7", "Dm7", "Fm7", "Bb7", "CMaj7", "Bm7b5", "E7b9", "Gm7", "C7", "FMaj7", "Bm7b5", "E7b9", "Am7", "Am7", "D7", "Dm7", "G7", "F#m7b5", "B7b9", "Em7", "A7", "Dm7", "G7", "CMaj7", "Em7b5", "A7", "Dm7", "Fm7", "Bb7", "CMaj7", "Bm7b5", "E7b9", "Am7", "D7", "Dm7", "G7", "C", "F7", "Em7", "A7"] 
  },
  { 
    name: "In A Sentimental Mood", 
    composer: "Ballad",
    year: "",
    style: "Ballad",
    tempo: "Slow",
    key: "Dm",
    chords: ["Dm7", "DmMaj7", "Dm7", "Dm6", "Gm7", "GmMaj7", "Gm7", "A7", "Dm7", "D7#5", "Gm7", "C7b9", "F", "Em7b5", "A7", "Dm7", "DmMaj7", "Dm6", "Gm7", "GmMaj7", "Gm7", "Gm7", "A7", "Dm7", "D7#5", "Gm7", "C7b9", "F", "Ebm7", "Ab7", "DbMaj7", "Bbm7", "Ebm7", "Ab7", "Db", "Bb7#5", "Ebm7", "Ab7", "DbMaj7", "Bbm7", "Ebm7", "Ab7", "Gm7", "C7", "Dm7", "DmMaj7", "Dm7", "Dm6", "Gm7", "GmMaj7", "Gm7", "Gm7", "A7", "Dm7", "D7#5", "Gm7", "C7b9", "F", "Em7b5", "A7"] 
  },
  { 
    name: "I'll Remember April", 
    composer: "Medium Swing",
    year: "",
    style: "Medium Swing",
    tempo: "Medium",
    key: "G",
    chords: ["GMaj7", "G", "GMaj7", "G", "Gm7", "Gm6", "Gm7", "Gm6", "Am7b5", "D7b9", "Bm7b5", "E7b9", "Am7", "D7", "GMaj7", "GMaj7", "Cm7", "F7", "BbMaj7", "Gm7", "Cm7", "F7", "BbMaj7", "BbMaj7", "Am7", "D7", "GMaj7", "GMaj7", "F#m7", "B7", "EMaj7", "Am7", "D7"] 
  },
  { 
    name: "But Beautiful", 
    composer: "Jazz Ballad",
    year: "",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "G",
    chords: ["GMaj7", "Bm7b5", "E7b9", "Am7", "C#m7b5", "F#7b9", "GMaj7", "Bm7b5", "E7b9", "A7", "D7", "Bm7", "Em7", "Am7", "D7", "GMaj7", "Em7", "A7", "Am7", "D7", "GMaj7", "Bm7b5", "E7b9", "Am7", "C#m7b5", "F#7b9", "GMaj7", "Bm7b5", "E7b9", "A7", "D7", "Bm7", "Em7", "Am7", "F#m7b5", "B7#5", "Em7", "F7", "Bm7", "E7b9", "Am7", "D7", "G", "Em7", "Am7", "D7"] 
  },
  { 
    name: "When I Fall In Love", 
    composer: "Jazz Ballad",
    year: "",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Eb",
    chords: ["EbMaj7", "C7", "Fm7", "Bb7", "EbMaj7", "C7", "Fm7", "Bb7", "EbMaj7", "Ab7", "G7b9", "C7b9", "F7", "Bb7", "EbMaj7", "C7", "Fm7", "Bb7", "EbMaj7", "Ab7", "Gm7b5", "C7", "Fm7", "D", "Gm7b5", "C7b9", "Fm7", "C7b9", "Fm7", "Bb7", "EbMaj7", "C7", "Fm7", "Bb7", "EbMaj7", "C7", "Fm7", "Bb7", "EbMaj7", "Ab7", "G7b9", "C7b9", "F7", "Bb7", "EbMaj7", "A7#11", "AbMaj7", "D7", "Gm7", "C7#9", "Fm7", "Bb7", "EbMaj7", "C7", "Fm7", "Bb7", "Eb", "Fm7", "Bb7"] 
  },
  { 
    name: "When Sunny Gets Blue", 
    composer: "Jazz Ballad",
    year: "",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "F",
    chords: ["Gm7", "C7", "Bbm7", "Eb7", "FMaj7", "Gm7", "Am7", "D7b9", "Bm7b5", "Bbm7", "Eb7", "FMaj7", "Abm7", "Db7", "Gm7", "C7", "Bb7", "Am7", "D7b9", "Gm7", "C7", "Bbm7", "Eb7", "FMaj7", "Gm7", "Am7", "D7b9", "Bm7b5", "Bbm7", "Eb7", "FMaj7", "Abm7", "D7", "Gm7", "C7", "Bb7", "Em7", "A7b9", "DMaj7", "Em7", "F#m7", "B7#9", "Em7", "A7b9", "DMaj7", "Dm7", "G7", "CMaj7", "Am7", "FMaj7", "Dm7", "G7", "Gm7", "C7", "Gm7", "C7", "Bbm7", "Eb7", "FMaj7", "Gm7", "Am7", "D7b9", "Bm7b5", "Bbm7", "Eb7", "FMaj7", "Abm7", "Db7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Central Park West", 
    composer: "Jazz Ballad",
    year: "",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "B",
    chords: ["BMaj7", "Em7", "A7", "DMaj7", "Bbm7", "Eb7", "AbMaj7", "Gm7", "C7", "FMaj7", "C#m7", "F#7", "BMaj7", "Em7", "A7", "DMaj7", "C#m7", "F#7", "BMaj7", "C#m7", "BMaj7", "C#m7", "F#7"] 
  },
  { 
    name: "Body and Soul", 
    composer: "Jazz Ballad",
    year: "",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Db",
    chords: ["Ebm7", "Bb7#5", "Ebm7", "Ab7", "DbMaj7", "Gb7", "Fm7", "Edim", "Ebm7", "Cm7b5", "F7b9", "Bbm7", "Ebm7", "Ab7", "DbMaj7", "Gb7", "Fm7b5", "Bb7#5", "Ebm7", "Bb7#5", "Ebm7", "Ab7", "DbMaj7", "Gb7", "Fm7", "Edim", "Ebm7", "Cm7b5", "F7b9", "Bbm7", "Ebm7", "Ab7", "Db", "Em7", "A7", "DMaj7", "Em7", "F#m7", "Gm7", "C7", "F#m7", "Bm7", "Em7", "A7", "DMaj7", "Dm7", "G7", "Em7", "Ebdim", "Dm7", "G7", "C7", "B7", "Bb7", "Ebm7", "Bb7#5", "Ebm7", "Ab7", "DbMaj7", "Gb7", "Fm7", "Edim", "Ebm7", "Cm7b5", "F7b9", "Bbm7", "Ebm7", "Ab7", "Db", "Gb7", "Fm7b5", "Bb7#5"] 
  },
  { 
    name: "Bossa Antigua", 
    composer: "Bossa Nova",
    year: "",
    style: "Bossa Nova",
    tempo: "Fast",
    key: "Ab",
    chords: ["Bbm7", "Eb7", "Cm7", "Fm7", "Bbm7", "Eb7", "Cm7", "F7b9", "Bbm7", "Eb7", "Cm7", "Fm7", "Bbm7", "Dm11", "G7", "CMaj7", "Am7", "Dm7", "G7", "Em7", "Am7", "Dm7", "G7", "Cm7", "F7b9", "Bbm7", "Eb7", "Cm7", "Fm7", "Bbm7", "Eb7", "AbMaj7"] 
  },
  { 
    name: "How Hight The Moon", 
    composer: "Medium Swing",
    year: "",
    style: "Medium Swing",
    tempo: "Medium",
    key: "G",
    chords: ["GMaj7", "GMaj9", "Gm7", "C7", "FMaj7", "FMaj7", "Fm7", "Bb7", "EbMaj7", "Am7b5", "D7b9", "Gm7", "Am7b5", "D7b9", "GMaj7", "Em7", "Am7", "D7", "GMaj7", "GMaj9", "Gm7", "C7", "FMaj7", "FMaj9", "Fm7", "Bb7", "EbMaj7", "Am7b5", "D7b9", "GMaj7", "Am7", "D7", "Bm7", "E7", "Am7", "D7", "G", "Am7", "D7"] 
  },
  { 
    name: "Song For My Father", 
    composer: "Latin",
    year: "",
    style: "Latin",
    tempo: "Fast",
    key: "Fm",
    chords: ["Fm7", "Eb7", "Db7", "C", "Fm7", "Fm7", "Eb7", "Db7", "C", "Fm7", "Eb7", "Fm7", "Eb7", "Db7", "C7b9", "Fm7"] 
  },
  { 
    name: "The Dolphin", 
    composer: "Bossa Nova",
    year: "",
    style: "Bossa Nova",
    tempo: "Fast",
    key: "A",
    chords: ["AMaj7", "B7", "Ab", "Db", "CMaj7", "F#m7b5", "B7b9", "Em7", "A", "DMaj7", "F7#5", "Bbm9", "Bbm7", "BbmMaj7", "Bbm7", "Bbm6", "A", "DMaj7", "Em7", "A7", "C#m7b5", "F#", "Bm7b5", "E7b9", "Dm7", "G7", "Bm7", "E", "C#m7b5", "F#", "B", "E", "AMaj7", "B7", "G#", "C#", "F#", "B", "EMaj7", "C7", "EMaj7", "C7", "BMaj7", "EMaj7"] 
  }
]

// ==================== 统计模块类型定义 ====================

// 练习类型
type PracticeType = 'pitch_finding' | 'scale' | 'chord_exercise' | 'interval' | 'chord_progression'

// 练习详情记录
interface PracticeDetail {
  name: string        // 练习名称（如：大七和弦、多里安音阶）
  count: number       // 练习次数
}

// 每日统计
interface DailyStats {
  date: string        // 日期 YYYY-MM-DD
  totalCount: number  // 当日总练习次数
  byType: Record<PracticeType, number>  // 按练习类型统计
  byDetail: Record<PracticeType, PracticeDetail[]>  // 按详细类型统计
}

// 统计数据结构
interface PracticeStats {
  daily: DailyStats[]     // 每日统计（保留最近30天）
  total: {
    count: number
    byType: Record<PracticeType, number>
    byDetail: Record<PracticeType, PracticeDetail[]>
  }
}

// 统计时间范围
type StatsTimeRange = 'today' | 'week' | 'month' | 'total'

// Practice modes - 基础练习模式 (与源HTML文件保持一致)
// ==================== SOLO风格练习模式系统 ====================

// 练习模式类型定义
interface PracticeLevel {
  id: string
  nameKey: string
  description: string
  groupName: string
  sequences: {
    dominant?: number[]
    major?: number[]
    minor?: number[]
    sus?: number[]
    sus2?: number[]
    diminished?: number[]
    diminishedDominant?: number[]
    six?: number[]
    augmented?: number[]
    diminishedMajorSeven?: number[]
  }
  startingIntervalOption: "any" | "first" | "chordTone"
  takeStartingIntervalBeforeOrder: boolean
  orderOption: boolean
  randomOption: boolean
  forceNaturalFive: boolean
  notesPerChord: number
  endOnStartingInterval?: boolean
  usePassingNoteBebopScale?: boolean
}

// Single Chord Tones
const SINGLE_CHORD_TONES_LEVELS: PracticeLevel[] = [
  {
    id: "single_chord_tones_root",
    nameKey: "level_root",
    description: "Single chord tones    Root notes only",
    groupName: "Single Chord Tones",
    sequences: {
      dominant: [1],
      major: [1],
      minor: [1],
      sus: [1],
      diminished: [1],
      diminishedDominant: [1],
      six: [1],
    },
    startingIntervalOption: "any",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 1,
  },
  {
    id: "single_chord_tones_3rd",
    nameKey: "level_3rd",
    description: "Single chord tones    3rd only  2nd or 4th on sus chords",
    groupName: "Single Chord Tones",
    sequences: {
      dominant: [3],
      major: [3],
      minor: [3],
      sus: [4],
      sus2: [2],
      diminished: [3],
      diminishedDominant: [4],
      six: [3],
    },
    startingIntervalOption: "any",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 1,
  },
  {
    id: "single_chord_tones_5th",
    nameKey: "level_5th",
    description: "Single chord tones    5th only    (No altered 5ths on dominant chords)",
    groupName: "Single Chord Tones",
    sequences: {
      dominant: [5],
      major: [5],
      minor: [5],
      sus: [5],
      diminished: [5],
      diminishedDominant: [6],
      six: [5],
      augmented: [6],
    },
    startingIntervalOption: "any",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 1,
  },
  {
    id: "single_chord_tones_7th",
    nameKey: "level_7th",
    description: "Single chord tones    7th only    (6th/♭♭7 on 6th & diminished chords)",
    groupName: "Single Chord Tones",
    sequences: {
      dominant: [7],
      major: [7],
      minor: [7],
      sus: [7],
      diminished: [7],
      diminishedDominant: [8],
      six: [6],
      diminishedMajorSeven: [8],
    },
    startingIntervalOption: "any",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 1,
  },
]

// Two Chord Tones
const TWO_CHORD_TONES_LEVELS: PracticeLevel[] = [
  {
    id: "two_chord_tones_root_3rd",
    nameKey: "level_root_3rd",
    description: "Two chord tones    Root & 3rd    (2nd or 4th on sus chords)",
    groupName: "Two Chord Tones",
    sequences: {
      dominant: [1, 3],
      major: [1, 3],
      minor: [1, 3],
      sus: [1, 4],
      sus2: [1, 2],
      diminished: [1, 3],
      diminishedDominant: [1, 4],
      six: [1, 3],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 2,
  },
  {
    id: "two_chord_tones_root_5th",
    nameKey: "level_root_5th",
    description: "Two chord tones    Root & 5th    (No altered 5ths on dominant chords)",
    groupName: "Two Chord Tones",
    sequences: {
      dominant: [1, 5],
      major: [1, 5],
      minor: [1, 5],
      sus: [1, 5],
      diminished: [1, 5],
      diminishedDominant: [1, 6],
      six: [1, 5],
      augmented: [1, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 2,
  },
  {
    id: "two_chord_tones_root_7th",
    nameKey: "level_root_7th",
    description: "Two chord tones    Root & 7th    (6th/♭♭7 on 6th & diminished chords)",
    groupName: "Two Chord Tones",
    sequences: {
      dominant: [1, 7],
      major: [1, 7],
      minor: [1, 7],
      sus: [1, 7],
      diminished: [1, 7],
      diminishedDominant: [1, 8],
      six: [1, 6],
      diminishedMajorSeven: [1, 8],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 2,
  },
  {
    id: "two_chord_tones_3rd_5th",
    nameKey: "level_3rd_5th",
    description: "Two chord tones    3rd & 5th    (2nd or 4th on sus chords  No altered 5ths on dominant chords)",
    groupName: "Two Chord Tones",
    sequences: {
      dominant: [3, 5],
      major: [3, 5],
      minor: [3, 5],
      sus: [4, 5],
      sus2: [2, 5],
      diminished: [3, 5],
      diminishedDominant: [4, 6],
      six: [3, 5],
      augmented: [4, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 2,
  },
  {
    id: "two_chord_tones_3rd_7th",
    nameKey: "level_3rd_7th",
    description: "Two chord tones    3rd & 7th    (2nd or 4th on sus chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Two Chord Tones",
    sequences: {
      dominant: [3, 7],
      major: [3, 7],
      minor: [3, 7],
      sus: [4, 7],
      sus2: [2, 7],
      diminished: [3, 7],
      diminishedDominant: [4, 8],
      six: [3, 6],
      diminishedMajorSeven: [3, 8],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 2,
  },
]

// Three Chord Tones
const THREE_CHORD_TONES_LEVELS: PracticeLevel[] = [
  {
    id: "three_chord_tones_root_3rd_5th",
    nameKey: "level_root_3rd_5th",
    description: "Three chord tones    Root, 3rd & 5th    (2nd or 4th on sus chords  No altered 5ths on dominant chords)",
    groupName: "Three Chord Tones",
    sequences: {
      dominant: [1, 3, 5],
      major: [1, 3, 5],
      minor: [1, 3, 5],
      sus: [1, 4, 5],
      sus2: [1, 2, 5],
      diminished: [1, 3, 5],
      diminishedDominant: [1, 4, 6],
      six: [1, 3, 5],
      augmented: [1, 4, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 3,
  },
  {
    id: "three_chord_tones_root_3rd_7th",
    nameKey: "level_root_3rd_7th",
    description: "Three chord tones    Root, 3rd & 7th    (2nd or 4th on sus chords",
    groupName: "Three Chord Tones",
    sequences: {
      dominant: [1, 3, 7],
      major: [1, 3, 7],
      minor: [1, 3, 7],
      sus: [1, 4, 7],
      sus2: [1, 2, 7],
      diminished: [1, 3, 7],
      diminishedDominant: [1, 4, 8],
      six: [1, 3, 7],
      diminishedMajorSeven: [1, 3, 8],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 3,
  },
  {
    id: "three_chord_tones_3rd_5th_7th",
    nameKey: "level_3rd_5th_7th",
    description: "Three chord tones    3rd, 5th & 7th    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Three Chord Tones",
    sequences: {
      dominant: [3, 5, 7],
      major: [3, 5, 7],
      minor: [3, 5, 7],
      sus: [4, 5, 7],
      sus2: [2, 5, 7],
      diminished: [3, 5, 7],
      diminishedDominant: [4, 6, 8],
      six: [3, 5, 6],
      augmented: [4, 6, 7],
      diminishedMajorSeven: [3, 5, 8],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 3,
  },
  {
    id: "three_chord_tones_root_3rd_5th_random_inversions",
    nameKey: "level_root_3rd_5th_random_inversions",
    description: "Three chord tones    This level randomises between:-  Root, 3rd & 5th  3rd, 5th, Root  5th, Root, 3rd    (2nd or 4th on sus chords  No altered 5ths on dominant chords)",
    groupName: "Three Chord Tones",
    sequences: {
      dominant: [1, 3, 5],
      major: [1, 3, 5],
      minor: [1, 3, 5],
      sus: [1, 4, 5],
      sus2: [1, 2, 5],
      diminished: [1, 3, 5],
      diminishedDominant: [1, 4, 6],
      six: [1, 3, 5],
      augmented: [1, 4, 6],
    },
    startingIntervalOption: "any",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 3,
  },
]

// Four Chord Tones
const FOUR_CHORD_TONES_LEVELS: PracticeLevel[] = [
  {
    id: "four_chord_tones_root_3rd_5th_7th",
    nameKey: "level_root_3rd_5th_7th",
    description: "Four chord tones    Root, 3rd, 5th & 7th    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [1, 3, 5, 7],
      major: [1, 3, 5, 7],
      minor: [1, 3, 5, 7],
      sus: [1, 4, 5, 7],
      sus2: [1, 2, 5, 7],
      diminished: [1, 3, 5, 7],
      diminishedDominant: [1, 4, 6, 8],
      six: [1, 3, 5, 6],
      augmented: [1, 4, 6, 7],
      diminishedMajorSeven: [1, 3, 5, 8],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "four_chord_tones_3rd_5th_7th_root",
    nameKey: "level_3rd_5th_7th_root",
    description: "Four chord tones    3rd, 5th, 7th, Root    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [3, 5, 7, 1],
      major: [3, 5, 7, 1],
      minor: [3, 5, 7, 1],
      sus: [4, 5, 7, 1],
      sus2: [2, 5, 7, 1],
      diminished: [3, 5, 7, 1],
      diminishedDominant: [4, 6, 8, 1],
      six: [3, 5, 6, 1],
      augmented: [4, 6, 7, 1],
      diminishedMajorSeven: [3, 5, 8, 1],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "four_chord_tones_5th_7th_root_3rd",
    nameKey: "level_5th_7th_root_3rd",
    description: "Four chord tones    5th, 7th, Root, 3rd    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6thh & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [5, 7, 1, 3],
      major: [5, 7, 1, 3],
      minor: [5, 7, 1, 3],
      sus: [5, 7, 1, 4],
      sus2: [5, 7, 1, 2],
      diminished: [5, 7, 1, 3],
      diminishedDominant: [6, 8, 1, 4],
      six: [5, 6, 1, 3],
      augmented: [6, 7, 1, 4],
      diminishedMajorSeven: [5, 8, 1, 3],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "four_chord_tones_7th_root_3rd_5th",
    nameKey: "level_7th_root_3rd_5th",
    description: "Four chord tones    7th, Root, 3rd, 5th    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [7, 1, 3, 5],
      major: [7, 1, 3, 5],
      minor: [7, 1, 3, 5],
      sus: [7, 1, 4, 5],
      sus2: [7, 1, 2, 5],
      diminished: [7, 1, 3, 5],
      diminishedDominant: [8, 1, 4, 6],
      six: [6, 1, 3, 5],
      augmented: [7, 1, 4, 6],
      diminishedMajorSeven: [8, 1, 3, 5],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "four_chord_tones_root_3rd_5th_7th_random_inversions",
    nameKey: "level_root_3rd_5th_7th_random_inversions",
    description: "Four chord tones    This level randomises between:-  Root, 3rd, 5th & 7th  3rd, 5th, 7th & Root  5th, 7th, Root & 3rd  7th, Root, 3rd & 5th    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [1, 3, 5, 7],
      major: [1, 3, 5, 7],
      minor: [1, 3, 5, 7],
      sus: [1, 4, 5, 7],
      sus2: [1, 2, 5, 7],
      diminished: [1, 3, 5, 7],
      diminishedDominant: [1, 4, 6, 8],
      six: [1, 3, 5, 6],
      augmented: [1, 4, 6, 7],
      diminishedMajorSeven: [1, 3, 5, 8],
    },
    startingIntervalOption: "any",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "four_chord_tones_root_3rd_5th_7th_root",
    nameKey: "level_root_3rd_5th_7th_root",
    description: "Four chord tones    Root, 3rd, 5th, 7th & Root    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [1, 3, 5, 7],
      major: [1, 3, 5, 7],
      minor: [1, 3, 5, 7],
      sus: [1, 4, 5, 7],
      sus2: [1, 2, 5, 7],
      diminished: [1, 3, 5, 7],
      diminishedDominant: [1, 4, 6, 8],
      six: [1, 3, 5, 6],
      augmented: [1, 4, 6, 7],
      diminishedMajorSeven: [1, 3, 5, 8],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 5,
    endOnStartingInterval: true,
  },
  {
    id: "four_chord_tones_3rd_5th_7th_root_3rd",
    nameKey: "level_3rd_5th_7th_root_3rd",
    description: "Four chord tones    3rd, 5th, 7th, Root & 3rd    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [3, 5, 7, 1],
      major: [3, 5, 7, 1],
      minor: [3, 5, 7, 1],
      sus: [4, 5, 7, 1],
      sus2: [2, 5, 7, 1],
      diminished: [3, 5, 7, 1],
      diminishedDominant: [4, 6, 8, 1],
      six: [3, 5, 6, 1],
      augmented: [4, 6, 7, 1],
      diminishedMajorSeven: [3, 5, 8, 1],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
    endOnStartingInterval: true,
  },
  {
    id: "four_chord_tones_5th_7th_root_3rd_5th",
    nameKey: "level_5th_7th_root_3rd_5th",
    description: "Four chord tones    5th, 7th, Root, 3rd & 5th    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6thh & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [5, 7, 1, 3],
      major: [5, 7, 1, 3],
      minor: [5, 7, 1, 3],
      sus: [5, 7, 1, 4],
      sus2: [5, 7, 1, 2],
      diminished: [5, 7, 1, 3],
      diminishedDominant: [6, 8, 1, 4],
      six: [5, 6, 1, 3],
      augmented: [6, 7, 1, 4],
      diminishedMajorSeven: [5, 8, 1, 3],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
    endOnStartingInterval: true,
  },
  {
    id: "four_chord_tones_7th_root_3rd_5th_7th",
    nameKey: "level_7th_root_3rd_5th_7th",
    description: "Four chord tones    7th, Root, 3rd, 5th & 7th    (2nd or 4th on sus chords  No altered 5ths on dominant chords  6th/♭♭7 on 6th & diminished chords)",
    groupName: "Four Chord Tones",
    sequences: {
      dominant: [7, 1, 3, 5],
      major: [7, 1, 3, 5],
      minor: [7, 1, 3, 5],
      sus: [7, 1, 4, 5],
      sus2: [7, 1, 2, 5],
      diminished: [7, 1, 3, 5],
      diminishedDominant: [8, 1, 4, 6],
      six: [6, 1, 3, 5],
      augmented: [7, 1, 4, 6],
      diminishedMajorSeven: [8, 1, 3, 5],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
    endOnStartingInterval: true,
  },
]

// Melodic Structures - Root to 5th
const MELODIC_ROOT_TO_5TH_LEVELS: PracticeLevel[] = [
  {
    id: "melodic_root_to_5th_melodic_structure_1",
    nameKey: "level_melodic_structure_1",
    description: "Melodic structures - Root to 5th    1, 2, 3, 5 on major/dominant chords    1, 3, 4, 5 on minor chords    1, 2, 4, 5 on sus chords    1, 2, 3, 5 on diminished chords    (No altered 5ths on dominant chords)",
    groupName: "Melodic Structures - Root to 5th",
    sequences: {
      dominant: [1, 2, 3, 5],
      major: [1, 2, 3, 5],
      minor: [1, 3, 4, 5],
      sus: [1, 2, 4, 5],
      diminished: [1, 2, 3, 5],
      diminishedDominant: [1, 2, 4, 6],
      six: [1, 2, 3, 5],
      augmented: [1, 2, 4, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "melodic_root_to_5th_melodic_structure_2",
    nameKey: "level_melodic_structure_2",
    description: "Melodic structures - Root to 5th    2, 1, 5, 3 on major/dominant chords    3, 1, 5, 4 on minor chords    2, 1, 5, 4 on sus chords    2, 1, 5, 3 on diminished chords    (No altered 5ths on dominant chords)",
    groupName: "Melodic Structures - Root to 5th",
    sequences: {
      dominant: [2, 1, 5, 3],
      major: [2, 1, 5, 3],
      minor: [3, 1, 5, 4],
      sus: [2, 1, 5, 4],
      diminished: [2, 1, 5, 3],
      diminishedDominant: [2, 1, 6, 4],
      six: [2, 1, 5, 3],
      augmented: [2, 1, 6, 4],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "melodic_root_to_5th_melodic_structure_3",
    nameKey: "level_melodic_structure_3",
    description: "Melodic structures - Root to 5th    3, 5, 2, 1 on major/dominant chords    4, 5, 3, 1 on minor chords    4, 5, 2, 1 on sus chords    3, 5, 2, 1 on diminished chords    (No altered 5ths on dominant chords)",
    groupName: "Melodic Structures - Root to 5th",
    sequences: {
      dominant: [3, 5, 2, 1],
      major: [3, 5, 2, 1],
      minor: [4, 5, 3, 1],
      sus: [4, 5, 2, 1],
      diminished: [3, 5, 2, 1],
      diminishedDominant: [4, 6, 2, 1],
      six: [3, 5, 2, 1],
      augmented: [4, 6, 2, 1],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "melodic_root_to_5th_melodic_structure_4",
    nameKey: "level_melodic_structure_4",
    description: "Melodic structures - Root to 5th    5, 1, 2, 3 on major/dominant chords    5, 1, 3, 4 on minor chords    5, 1, 2, 4 on sus chords    5, 1, 2, 3 on diminished chords    (No altered 5ths on dominant chords)",
    groupName: "Melodic Structures - Root to 5th",
    sequences: {
      dominant: [5, 1, 2, 3],
      major: [5, 1, 2, 3],
      minor: [5, 1, 3, 4],
      sus: [5, 1, 2, 4],
      diminished: [5, 1, 2, 3],
      diminishedDominant: [6, 1, 2, 4],
      six: [5, 1, 2, 3],
      augmented: [6, 1, 2, 4],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "melodic_root_to_5th_melodic_structure_5_random_inversions",
    nameKey: "level_melodic_structure_5_random_inversions",
    description: "Melodic structures - Root to 5th    This level creates random inversions of the following structures:-    1, 2, 3, 5 on major/dominant chords    1, 3, 4, 5 on minor chords    1, 2, 4, 5 on sus chords    1, 2, 3, 5 on diminished chords    (No altered 5ths on dominant chords)",
    groupName: "Melodic Structures - Root to 5th",
    sequences: {
      dominant: [1, 2, 3, 5],
      major: [1, 2, 3, 5],
      minor: [1, 3, 4, 5],
      sus: [1, 2, 4, 5],
      diminished: [1, 2, 3, 5],
      diminishedDominant: [1, 2, 4, 6],
      six: [1, 2, 3, 5],
      augmented: [1, 2, 4, 6],
    },
    startingIntervalOption: "chordTone",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
]

// Melodic Structures - 5th to 9th
const MELODIC_5TH_TO_9TH_LEVELS: PracticeLevel[] = [
  {
    id: "melodic_5th_to_9th_melodic_structure_6",
    nameKey: "level_melodic_structure_6",
    description: "Melodic structures - 5th to 9th    5, 6, 7, 2 on major/dominant chords    5, 7, 1, 2 on minor chords    5, 6, 7, 1 on diminished chords",
    groupName: "Melodic Structures - 5th to 9th",
    sequences: {
      dominant: [5, 6, 7, 2],
      major: [5, 6, 7, 2],
      minor: [5, 7, 1, 2],
      sus: [5, 6, 7, 2],
      diminished: [5, 7, 8, 1],
      diminishedDominant: [6, 7, 8, 2],
      six: [5, 6, 7, 2],
      augmented: [6, 7, 1, 2],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 4,
  },
  {
    id: "melodic_5th_to_9th_melodic_structure_7",
    nameKey: "level_melodic_structure_7",
    description: "Melodic structures - 5th to 9th    6, 5, 2, 7 on major/dominant chords    7, 5, 2, 1 on minor chords    6, 5, 1, 7 on diminished chords",
    groupName: "Melodic Structures - 5th to 9th",
    sequences: {
      dominant: [6, 5, 2, 7],
      major: [6, 5, 2, 7],
      minor: [7, 5, 2, 1],
      sus: [6, 5, 2, 7],
      diminished: [7, 5, 1, 8],
      diminishedDominant: [7, 6, 2, 8],
      six: [6, 5, 2, 7],
      augmented: [7, 6, 2, 1],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 4,
  },
  {
    id: "melodic_5th_to_9th_melodic_structure_8",
    nameKey: "level_melodic_structure_8",
    description: "Melodic structures - 5th to 9th    7, 2, 6, 5 on major/dominant chords    1, 2, 7, 5 on minor chords    6, 1, 7, 5 on diminished chords",
    groupName: "Melodic Structures - 5th to 9th",
    sequences: {
      dominant: [7, 2, 6, 5],
      major: [7, 2, 6, 5],
      minor: [1, 2, 7, 5],
      sus: [7, 2, 6, 5],
      diminished: [7, 1, 8, 5],
      diminishedDominant: [8, 2, 7, 6],
      six: [7, 2, 6, 5],
      augmented: [1, 2, 7, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 4,
  },
  {
    id: "melodic_5th_to_9th_melodic_structure_9",
    nameKey: "level_melodic_structure_9",
    description: "Melodic structures - 5th to 9th    2, 7, 6, 5 on major/dominant chords    2, 1, 7, 5 on minor chords    2, 7, 1, 6 on diminished chords",
    groupName: "Melodic Structures - 5th to 9th",
    sequences: {
      dominant: [2, 7, 6, 5],
      major: [2, 7, 6, 5],
      minor: [2, 1, 7, 5],
      sus: [2, 7, 6, 5],
      diminished: [2, 8, 1, 7],
      diminishedDominant: [2, 8, 7, 6],
      six: [2, 7, 6, 5],
      augmented: [2, 1, 7, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 4,
  },
  {
    id: "melodic_5th_to_9th_melodic_structure_10_random_inversions",
    nameKey: "level_melodic_structure_10_random_inversions",
    description: "Melodic structures - 5th to 9th    This level creates random inversions of the following structures:-    5, 6, 7, 2 on major/dominant chords    5, 7, 1, 2 on minor chords    5, 6, 7, 1 on diminished chords",
    groupName: "Melodic Structures - 5th to 9th",
    sequences: {
      dominant: [5, 6, 7, 2],
      major: [5, 6, 7, 2],
      minor: [5, 7, 1, 2],
      sus: [5, 6, 7, 2],
      diminished: [5, 7, 8, 1],
      diminishedDominant: [6, 7, 8, 2],
      six: [5, 6, 7, 2],
      augmented: [6, 7, 1, 2],
    },
    startingIntervalOption: "chordTone",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 4,
  },
]

// Voice Led Structures
const VOICE_LED_LEVELS: PracticeLevel[] = [
  {
    id: "voice_led_voice_led_structure_1",
    nameKey: "level_voice_led_structure_1",
    description: "Voice led structures    3, 2, 1, 7 on minor chords    3, 2, 1, 7 on dominant chords    3, 2, 1, 7 on major chords    4, 2, 1, 7 on sus chords    3, 2, 1, 6 on diminished chords    (Works best with cyclical progression e.g II-V-I)",
    groupName: "Voice Led Structures",
    sequences: {
      dominant: [3, 2, 1, 7],
      major: [3, 2, 1, 7],
      minor: [3, 2, 1, 7],
      sus: [4, 2, 1, 7],
      diminished: [3, 2, 1, 7],
      diminishedDominant: [4, 2, 1, 8],
      six: [3, 2, 1, 7],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "voice_led_voice_led_structure_2",
    nameKey: "level_voice_led_structure_2",
    description: "Voice led structures    3, 2, 1, 7 on minor chords    3, 5, 7, 2 on dominant chords    5, 1, 2, 3 on major chords    4, 5, 7, 2 on sus chords    3, 2, 1, 6 on diminished chords    (Works best with cyclical progression e.g II-V-I)",
    groupName: "Voice Led Structures",
    sequences: {
      dominant: [3, 5, 7, 2],
      major: [5, 1, 2, 3],
      minor: [3, 2, 1, 7],
      sus: [4, 5, 7, 2],
      diminished: [3, 2, 1, 7],
      diminishedDominant: [4, 6, 8, 2],
      six: [3, 5, 7, 2],
      augmented: [4, 6, 7, 2],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "voice_led_voice_led_structure_3",
    nameKey: "level_voice_led_structure_3",
    description: "Voice led structures    1, 3, 5, 7 on minor chords    3, 2, 1, 7 on dominant chords    3, 2, 1, 7 on major chords    4, 2, 1, 7 on sus chords    3, 2, 1, 6 on diminished chords    (Works best with cyclical progression e.g II-V-I)",
    groupName: "Voice Led Structures",
    sequences: {
      dominant: [3, 2, 1, 7],
      major: [3, 2, 1, 7],
      minor: [1, 3, 5, 7],
      sus: [4, 2, 1, 7],
      diminished: [3, 2, 1, 7],
      diminishedDominant: [4, 2, 1, 7],
      six: [3, 2, 1, 7],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "voice_led_voice_led_structure_4",
    nameKey: "level_voice_led_structure_4",
    description: "Voice led structures    1, 3, 5, 7 on minor chords    3, 5, 7, 2 on dominant chords    3, 2, 1, 7 on major chords    4, 5, 7, 2 on sus chords    3, 2, 1, 6 on diminished chords    (Works best with cyclical progression e.g II-V-I)",
    groupName: "Voice Led Structures",
    sequences: {
      dominant: [3, 5, 7, 2],
      major: [3, 2, 1, 7],
      minor: [1, 3, 5, 7],
      sus: [4, 5, 7, 2],
      diminished: [3, 2, 1, 7],
      diminishedDominant: [4, 6, 8, 2],
      six: [3, 5, 7, 2],
      augmented: [4, 6, 7, 2],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
  {
    id: "voice_led_voice_led_structure_5",
    nameKey: "level_voice_led_structure_5",
    description: "Voice led structures    5, 3, 1, 7 on minor chords    3, 5, 7, 2 on dominant chords    3, 2, 1, 7 on major chords    4, 5, 7, 2 on sus chords    3, 2, 1, 6 on diminished chords    (Works best with cyclical progression e.g II-V-I)",
    groupName: "Voice Led Structures",
    sequences: {
      dominant: [3, 5, 7, 2],
      major: [3, 2, 1, 7],
      minor: [5, 3, 1, 7],
      sus: [4, 5, 7, 2],
      diminished: [3, 2, 1, 7],
      diminishedDominant: [4, 6, 8, 2],
      six: [3, 5, 7, 2],
      augmented: [4, 6, 7, 2],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 4,
  },
]

// Suspended Structures
const SUSPENDED_LEVELS: PracticeLevel[] = [
  {
    id: "suspended_suspended_2_resolution",
    nameKey: "level_suspended_2_resolution",
    description: "Suspended Structures    Suspended 2 resolving to 3 then 1",
    groupName: "Suspended Structures",
    sequences: {
      dominant: [2, 3, 1],
      major: [2, 3, 1],
      minor: [2, 3, 1],
      sus: [2, 3, 1],
      diminished: [2, 3, 1],
      diminishedDominant: [2, 4, 1],
      six: [2, 3, 1],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 3,
  },
  {
    id: "suspended_suspended_4_resolution",
    nameKey: "level_suspended_4_resolution",
    description: "Suspended Structures    Suspended 4 resolving to 3 then 1",
    groupName: "Suspended Structures",
    sequences: {
      dominant: [4, 3, 1],
      major: [4, 3, 1],
      minor: [4, 3, 1],
      sus: [4, 3, 1],
      diminished: [4, 3, 1],
      diminishedDominant: [5, 4, 1],
      six: [4, 3, 1],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: false,
    orderOption: false,
    randomOption: false,
    forceNaturalFive: true,
    notesPerChord: 3,
  },
]

// Chord Scales
const CHORD_SCALES_LEVELS: PracticeLevel[] = [
  {
    id: "chord_scales_chord_scale",
    nameKey: "level_chord_scale",
    description: "All notes of the relevant chord scale played from the root note through one octave",
    groupName: "Chord Scales",
    sequences: {
      dominant: [1, 2, 3, 4, 5, 6, 7],
      major: [1, 2, 3, 4, 5, 6, 7],
      minor: [1, 2, 3, 4, 5, 6, 7],
      sus: [1, 2, 3, 4, 5, 6, 7],
      diminished: [1, 2, 3, 4, 5, 6, 7, 8],
      diminishedDominant: [1, 2, 3, 4, 5, 6, 7, 8],
      six: [1, 2, 3, 4, 5, 6, 7],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
  },
  {
    id: "chord_scales_chord_scale_3rd_to_3rd",
    nameKey: "level_chord_scale_3rd_to_3rd",
    description: "All notes of the relevant chord scale played from the 3rd through one octave",
    groupName: "Chord Scales",
    sequences: {
      dominant: [3, 4, 5, 6, 7, 1, 2],
      major: [3, 4, 5, 6, 7, 1, 2],
      minor: [3, 4, 5, 6, 7, 1, 2],
      sus: [4, 5, 6, 7, 1, 2, 3],
      diminished: [3, 4, 5, 6, 7, 8, 1, 2],
      diminishedDominant: [4, 5, 6, 7, 8, 1, 2, 3],
      six: [3, 4, 5, 6, 7, 1, 2],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
  },
  {
    id: "chord_scales_chord_scale_5th_to_5th",
    nameKey: "level_chord_scale_5th_to_5th",
    description: "All notes of the relevant chord scale played from the 5th through one octave",
    groupName: "Chord Scales",
    sequences: {
      dominant: [5, 6, 7, 1, 2, 3, 4],
      major: [5, 6, 7, 1, 2, 3, 4],
      minor: [5, 6, 7, 1, 2, 3, 4],
      sus: [5, 6, 7, 1, 2, 3, 4],
      diminished: [5, 6, 7, 8, 1, 2, 3, 4],
      diminishedDominant: [6, 7, 8, 1, 2, 3, 4, 5],
      six: [5, 6, 7, 1, 2, 3, 4],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
  },
  {
    id: "chord_scales_chord_scale_7th_to_7th",
    nameKey: "level_chord_scale_7th_to_7th",
    description: "All notes of the relevant chord scale played from the 7th through one octave",
    groupName: "Chord Scales",
    sequences: {
      dominant: [7, 1, 2, 3, 4, 5, 6],
      major: [7, 1, 2, 3, 4, 5, 6],
      minor: [7, 1, 2, 3, 4, 5, 6],
      sus: [7, 1, 2, 3, 4, 5, 6],
      diminished: [8, 1, 2, 3, 4, 5, 6, 7],
      diminishedDominant: [8, 1, 2, 3, 4, 5, 6, 7],
      six: [7, 1, 2, 3, 4, 5, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
  },
  {
    id: "chord_scales_chord_scale_random_starting_chord_tone",
    nameKey: "level_chord_scale_random_starting_chord_tone",
    description: "All notes of the relevant chord scale starting from a randomised chord tone",
    groupName: "Chord Scales",
    sequences: {
      dominant: [1, 2, 3, 4, 5, 6, 7],
      major: [1, 2, 3, 4, 5, 6, 7],
      minor: [1, 2, 3, 4, 5, 6, 7],
      sus: [1, 2, 3, 4, 5, 6, 7],
      diminished: [1, 2, 3, 4, 5, 6, 7, 8],
      diminishedDominant: [1, 2, 3, 4, 5, 6, 7, 8],
      six: [1, 2, 3, 4, 5, 6, 7],
    },
    startingIntervalOption: "chordTone",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
  },
  {
    id: "chord_scales_chord_scale_random_starting_scale_tone",
    nameKey: "level_chord_scale_random_starting_scale_tone",
    description: "All notes of the relevant chord scale starting from a randomised scale tone",
    groupName: "Chord Scales",
    sequences: {
      dominant: [1, 2, 3, 4, 5, 6, 7],
      major: [1, 2, 3, 4, 5, 6, 7],
      minor: [1, 2, 3, 4, 5, 6, 7],
      sus: [1, 2, 3, 4, 5, 6, 7],
      diminished: [1, 2, 3, 4, 5, 6, 7, 8],
      diminishedDominant: [1, 2, 3, 4, 5, 6, 7, 8],
      six: [1, 2, 3, 4, 5, 6, 7],
    },
    startingIntervalOption: "any",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: true,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
  },
]

// Passing Note Chord Scales
const PASSING_NOTE_SCALES_LEVELS: PracticeLevel[] = [
  {
    id: "passing_note_scales_passing_note_scale",
    nameKey: "level_passing_note_scale",
    description: "All notes of the relevant chord scale with appropriate passing notes, played from root note to root note. If played starting on a downbeat, all of the subsequent chord tones will also fall on downbeats.",
    groupName: "Passing Note Chord Scales",
    sequences: {
      dominant: [1, 2, 3, 4, 5, 6, 7, 8],
      major: [1, 2, 3, 4, 5, 6, 7, 8],
      minor: [1, 2, 3, 4, 5, 6, 7, 8],
      sus: [1, 2, 3, 4, 5, 6, 7, 8],
      diminished: [1, 2, 3, 4, 5, 6, 7, 8],
      diminishedDominant: [1, 2, 3, 4, 5, 6, 7, 8],
      six: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
    usePassingNoteBebopScale: true,
  },
  {
    id: "passing_note_scales_passing_note_scale_3rd_to_3rd",
    nameKey: "level_passing_note_scale_3rd_to_3rd",
    description: "All notes of the relevant chord scale with appropriate passing notes, played from 3rd to 3rd. If played starting on a downbeat, all of the subsequent chord tones will also fall on downbeats.",
    groupName: "Passing Note Chord Scales",
    sequences: {
      dominant: [3, 4, 5, 6, 7, 8, 1, 2],
      major: [3, 4, 5, 6, 7, 8, 1, 2],
      minor: [3, 4, 5, 6, 7, 8, 1, 2],
      sus: [4, 5, 6, 7, 8, 1, 2, 3],
      diminished: [3, 4, 5, 6, 7, 8, 1, 2],
      diminishedDominant: [4, 5, 6, 7, 8, 1, 2, 3],
      six: [3, 4, 5, 6, 7, 8, 1, 2],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
    usePassingNoteBebopScale: true,
  },
  {
    id: "passing_note_scales_passing_note_scale_5th_to_5th",
    nameKey: "level_passing_note_scale_5th_to_5th",
    description: "All notes of the relevant chord scale with appropriate passing notes, played from 5th to 5th. If played starting on a downbeat, all of the subsequent chord tones will also fall on downbeats.",
    groupName: "Passing Note Chord Scales",
    sequences: {
      dominant: [5, 6, 7, 8, 1, 2, 3, 4],
      major: [5, 6, 7, 8, 1, 2, 3, 4],
      minor: [5, 6, 7, 8, 1, 2, 3, 4],
      sus: [5, 6, 7, 8, 1, 2, 3, 4],
      diminished: [5, 6, 7, 8, 1, 2, 3, 4],
      diminishedDominant: [6, 7, 8, 1, 2, 3, 4, 5],
      six: [5, 6, 7, 8, 1, 2, 3, 4],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
    usePassingNoteBebopScale: true,
  },
  {
    id: "passing_note_scales_passing_note_scale_6th7th_to_6th7th",
    nameKey: "level_passing_note_scale_6th7th_to_6th7th",
    description: "All notes of the relevant chord scale with passing notes, played from 6th to 6th or 7th to 7th, as harmonicaly appopriate. If played starting on a downbeat all of the subsequent chord tones will also fall on downbeats.",
    groupName: "Passing Note Chord Scales",
    sequences: {
      dominant: [7, 8, 1, 2, 3, 4, 5, 6],
      major: [7, 8, 1, 2, 3, 4, 5, 6],
      minor: [7, 8, 1, 2, 3, 4, 5, 6],
      sus: [7, 8, 1, 2, 3, 4, 5, 6],
      diminished: [7, 8, 1, 2, 3, 4, 5, 6],
      diminishedDominant: [8, 1, 2, 3, 4, 5, 6, 7],
      six: [7, 8, 1, 2, 3, 4, 5, 6],
    },
    startingIntervalOption: "first",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
    usePassingNoteBebopScale: true,
  },
  {
    id: "passing_note_scales_passing_note_scale_random_starting_chord_tone",
    nameKey: "level_passing_note_scale_random_starting_chord_tone",
    description: "All notes of the relevant chord scale with appropriate passing notes, from a randomised starting chord tone. If played starting on a downbeat, all of the subsequent chord tones will also fall on downbeats.",
    groupName: "Passing Note Chord Scales",
    sequences: {
      dominant: [1, 2, 3, 4, 5, 6, 7, 8],
      major: [1, 2, 3, 4, 5, 6, 7, 8],
      minor: [1, 2, 3, 4, 5, 6, 7, 8],
      sus: [1, 2, 3, 4, 5, 6, 7, 8],
      diminished: [1, 2, 3, 4, 5, 6, 7, 8],
      diminishedDominant: [1, 2, 3, 4, 5, 6, 7, 8],
      six: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    startingIntervalOption: "chordTone",
    takeStartingIntervalBeforeOrder: true,
    orderOption: true,
    randomOption: false,
    forceNaturalFive: false,
    notesPerChord: 8,
    endOnStartingInterval: true,
    usePassingNoteBebopScale: true,
  },
]

// 所有练习模式合集
const ALL_SOLO_LEVELS: PracticeLevel[] = [
  ...SINGLE_CHORD_TONES_LEVELS,
  ...TWO_CHORD_TONES_LEVELS,
  ...THREE_CHORD_TONES_LEVELS,
  ...FOUR_CHORD_TONES_LEVELS,
  ...MELODIC_ROOT_TO_5TH_LEVELS,
  ...MELODIC_5TH_TO_9TH_LEVELS,
  ...VOICE_LED_LEVELS,
  ...SUSPENDED_LEVELS,
  ...CHORD_SCALES_LEVELS,
  ...PASSING_NOTE_SCALES_LEVELS,
  ...ALTERED_LEVELS,
  ...DIMINISHED_SCALES_LEVELS,
]

// UI渲染所需的别名变量
const ALL_PRACTICE_LEVELS = ALL_SOLO_LEVELS

const LOCAL_PRACTICE_MODE_GROUPS = [
  { id: 'single_chord_tones', name: 'Single Chord Tones', nameZh: '单和弦音', levels: SINGLE_CHORD_TONES_LEVELS },
  { id: 'two_chord_tones', name: 'Two Chord Tones', nameZh: '双和弦音', levels: TWO_CHORD_TONES_LEVELS },
  { id: 'three_chord_tones', name: 'Three Chord Tones', nameZh: '三和弦音', levels: THREE_CHORD_TONES_LEVELS },
  { id: 'four_chord_tones', name: 'Four Chord Tones', nameZh: '四和弦音', levels: FOUR_CHORD_TONES_LEVELS },
  { id: 'melodic_root_to_5th', name: 'Melodic Structures - Root to 5th', nameZh: '旋律结构 - 根音到五音', levels: MELODIC_ROOT_TO_5TH_LEVELS },
  { id: 'melodic_5th_to_9th', name: 'Melodic Structures - 5th to 9th', nameZh: '旋律结构 - 五音到九音', levels: MELODIC_5TH_TO_9TH_LEVELS },
  { id: 'voice_led', name: 'Voice Led Structures', nameZh: 'Voice Led 声部连接', levels: VOICE_LED_LEVELS },
  { id: 'suspended', name: 'Suspended Structures', nameZh: '挂留结构', levels: SUSPENDED_LEVELS },
  { id: 'chord_scales', name: 'Chord Scales', nameZh: '和弦音阶', levels: CHORD_SCALES_LEVELS },
  { id: 'passing_note_chord_scales', name: 'Passing Note Chord Scales', nameZh: '经过音和弦音阶', levels: PASSING_NOTE_SCALES_LEVELS },
  { id: 'altered', name: 'Altered Dominant Structures', nameZh: '变化属和弦结构', levels: ALTERED_LEVELS },
  { id: 'diminished_scales', name: 'Diminished Scales', nameZh: '减音阶', levels: DIMINISHED_SCALES_LEVELS },
]

// 基础练习模式 (单和弦音 + 双和弦音 + 三和弦音)
const PRACTICE_LEVELS = [
  ...SINGLE_CHORD_TONES_LEVELS,
  ...TWO_CHORD_TONES_LEVELS,
  ...THREE_CHORD_TONES_LEVELS,
]

// 旋律结构 - 根音到五音
const MELODIC_STRUCTURE_R_TO_5TH = MELODIC_ROOT_TO_5TH_LEVELS

// 旋律结构 - 五音到九音
const MELODIC_STRUCTURE_5TH_TO_9TH = MELODIC_5TH_TO_9TH_LEVELS

// Voice Led结构
const VOICE_LED_STRUCTURES = VOICE_LED_LEVELS

// 经过音技巧 (挂留结构 + 和弦音阶 + 经过音音阶)
const PASSING_TONE_TECHNIQUES = [
  ...SUSPENDED_LEVELS,
  ...CHORD_SCALES_LEVELS,
  ...PASSING_NOTE_SCALES_LEVELS,
]

// 四和弦音等级
const FOUR_CHORD_TONES = FOUR_CHORD_TONES_LEVELS


// 和弦练习模式
const CHORD_EXERCISE_LEVELS = [
  { id: "root-third-fifth", nameKey: "level_root_third_fifth", intervals: ["1", "3", "5"] },
  { id: "third-fifth-seventh", nameKey: "level_third_fifth_seventh", intervals: ["3", "5", "7"] },
  { id: "random-inversion-triad", nameKey: "level_random_inversion_triad", intervals: ["1", "3", "5"] },
  { id: "root-third-fifth-seventh", nameKey: "level_root_third_fifth_seventh", intervals: ["1", "3", "5", "7"] },
  { id: "third-fifth-seventh-root", nameKey: "level_third_fifth_seventh_root", intervals: ["3", "5", "7", "1"] },
  { id: "fifth-seventh-root-third", nameKey: "level_fifth_seventh_root_third", intervals: ["5", "7", "1", "3"] },
  { id: "seventh-root-third-fifth", nameKey: "level_seventh_root_third_fifth", intervals: ["7", "1", "3", "5"] },
  { id: "random-inversion-seventh", nameKey: "level_random_inversion_seventh", intervals: ["1", "3", "5", "7"] },
  { id: "root-third-fifth-seventh-root", nameKey: "level_root_third_fifth_seventh_root", intervals: ["1", "3", "5", "7", "1"] },
]

// ==================== YIN 音高检测算法 ====================
// YIN (Yet Another Implementation of the YIN Algorithm) 是一种自相关算法的改进版本
// 用于从音频信号中检测基频（音高）

const intervalToSemitones: Record<string, number> = {
  "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8,
  "b6": 8, "6": 9, "bb7": 9, "#6": 10, "b7": 10, "7": 11,
  "b9": 1, "9": 2, "#9": 3, "11": 5, "#11": 6, "b13": 8, "13": 9
}

const noteToSemitones: Record<string, number> = {
  "C": 0, "C#": 1, "C♯": 1, "Cb": 11, "C♭": 11, "Db": 1, "D♭": 1, "D": 2, "D#": 3, "D♯": 3, "Eb": 3, "E♭": 3, "E": 4, "F": 5,
  "F#": 6, "F♯": 6, "Gb": 6, "G♭": 6, "G": 7, "G#": 8, "G♯": 8, "Ab": 8, "A♭": 8, "A": 9, "A#": 10, "A♯": 10, "Bb": 10, "B♭": 10, "B": 11
}

// 检查两个音符是否为等音（如 C♯ = D♭） 标准化后比较
function isEquivalentNote(note1: string, note2: string): boolean {
  if (note1 === note2) return true

  // 分离音符名和八度，并标准化为 ♯/♭ 形式
  const extractNoteName = (fullNote: string): string => {
    const match = fullNote.match(/^([CDEFGAB][#♯b♭]?\d*)/)
    return match ? normalizeNoteName(match[1]) : normalizeNoteName(fullNote)
  }

  const note1Name = extractNoteName(note1)
  const note2Name = extractNoteName(note2)

  if (note1Name === note2Name) return true

  // 定义等价的音符对（使用 ♯/♭ 统一形式）
  const equivalentPairs = [
    ['C♯', 'D♭'], ['D♯', 'E♭'], ['F♯', 'G♭'],
    ['G♯', 'A♭'], ['A♯', 'B♭'],
    ['C♯', 'D♭'], ['D♯', 'E♭'], ['F♯', 'G♭'],
    ['G♯', 'A♭'], ['A♯', 'B♭']
  ]

  for (const pair of equivalentPairs) {
    if ((note1Name === pair[0] && note2Name === pair[1]) ||
        (note1Name === pair[1] && note2Name === pair[0])) {
      return true
    }
  }

  return false
}

// ==================== 工具函数 ====================
function getNoteAtPosition(stringIndex: number, fret: number): string {
  const openNote = STRING_TUNING[stringIndex]
  return NOTES[(openNote + fret) % 12]
}

function getNoteIndex(note: string): number {
  if (!note) return -1
  const normalized = normalizeNoteName(note)
  const idx = NOTES.indexOf(normalized)
  if (idx !== -1) return idx
  return NOTES_FLAT.indexOf(normalized)
}

function getNoteColor(semitones: number): string {
  const colors: Record<number, string> = {
    0: "bg-red-500",
    1: "bg-orange-400",
    2: "bg-yellow-400",
    3: "bg-green-400",
    4: "bg-emerald-400",
    5: "bg-cyan-400",
    6: "bg-blue-400",
    7: "bg-indigo-400",
    8: "bg-violet-400",
    9: "bg-purple-400",
    10: "bg-fuchsia-400",
    11: "bg-pink-400",
  }
  return colors[semitones] || "bg-gray-400"
}

function transposeChord(chord: string, fromKey: string, toKey: string): string {
  const fromIndex = getNoteIndex(fromKey)
  const toIndex = getNoteIndex(toKey)
  if (fromIndex === -1 || toIndex === -1) return chord

  const diff = (toIndex - fromIndex + 12) % 12

  // Extract root note（兼容 #/♯ 和 b/♭）
  const rootMatch = chord.match(/^([A-G][#♯b♭]?)/)
  if (!rootMatch) return chord

  const root = rootMatch[1]
  const rootIndex = getNoteIndex(root)
  if (rootIndex === -1) return chord

  const newRootIndex = (rootIndex + diff) % 12
  const newRoot = NOTES[newRootIndex]

  return chord.replace(/^([A-G][#♯b♭]?)/, newRoot)
}

function parseChord(chord: string): { root: string; type: string; bass?: string } {
  const match = chord.match(/^([A-G][#♯b♭]?)(.*)$/)
  if (!match) return { root: "C", type: "Major" }

  const root = match[1]
  const rest = match[2]

  // Check for bass note
  const bassMatch = rest.match(/\/([A-G][#♯b♭]?)$/)
  const type = bassMatch ? rest.replace(bassMatch[0], "") : rest
  const bass = bassMatch ? bassMatch[1] : undefined

  return { root, type: type || "Major", bass }
}

// 规范化和弦类型符号 - 支持多种格式识别
function normalizeChordType(type: string): string {
  const normalizedMap: Record<string, string> = {
    'm7b5': 'm7b5',
    'm7♭5': 'm7b5',
    'min7b5': 'm7b5',
    'minor7b5': 'm7b5',
    '-7b5': 'm7b5',
    'ø': 'm7b5',
    '7#9': '7#9',
    '7♯9': '7#9',
    '7b9': '7b9',
    '7♭9': '7b9',
    '7#11': '7#11',
    '7♯11': '7#11',
    'maj7': 'Maj7',
    'M7': 'Maj7',
    'Δ7': 'Maj7',
    'Δ': 'Maj7',
    'm7': 'm7',
    'min7': 'm7',
    '-7': 'm7',
    'dim7': 'dim7',
    'o7': 'dim7',
    'dim': 'Dim',
    'o': 'Dim',
    'aug': 'Aug',
    '+': 'Aug',
    'm': 'Minor',
    'min': 'Minor',
    '-': 'Minor',
    '': 'Major',
  }
  return normalizedMap[type] || type
}

function formatChordName(chord: { root: string; type: string; bass?: string }, t: (key: string) => string): string {
  const normalizedType = normalizeChordType(chord.type)
  const chordType = CHORD_TYPES.find(ct => ct.symbol === normalizedType || ct.name === normalizedType || ct.symbol === chord.type || ct.name === chord.type)
  const typeSymbol = chordType ? chordType.symbol : chord.type

  let result = `${normalizeNoteName(chord.root)}${normalizeNoteName(typeSymbol)}`
  if (chord.bass) {
    result += `/${normalizeNoteName(chord.bass)}`
  }
  return result
}

// 判断和弦类型是否为变化属和弦
function isAlteredChord(type: string): boolean {
  const alteredTypes = ['7alt', '7#5', '7b5', '7#5b9', '7#5#9', '7b5b9', '7b5#9', '7b9b13', 'aug7']
  const normalizedType = normalizeChordType(type)
  return alteredTypes.some(t => type.includes(t) || normalizedType.includes(t))
}

function getBebopScaleForChordType(type: string): { name: string; intervals: string[]; passingToneIndices: number[] } | null {
  const normalizedType = normalizeChordType(type)
  
  if (type.includes('m7b5') || type.includes('m9b5') || normalizedType.includes('minorSevenFlatFive')) {
    return {
      name: 'Bebop Dorian',
      intervals: ['1', '2', 'b3', '4', '5', '6', 'b7', '7'],
      passingToneIndices: [7]
    }
  }
  
  if (type.startsWith('m') || type.includes('min') || normalizedType.includes('minor')) {
    if (type.includes('Maj7') || type.includes('maj7') || type.includes('(maj7)')) {
      return {
        name: 'Bebop Tonic Minor',
        intervals: ['1', '2', 'b3', '4', '5', 'b6', '6', '7'],
        passingToneIndices: [5]
      }
    }
    return {
      name: 'Bebop Dorian',
      intervals: ['1', '2', 'b3', '4', '5', '6', 'b7', '7'],
      passingToneIndices: [7]
    }
  }
  
  if (type.includes('Maj') || type.includes('maj') || type === 'M7' || normalizedType.includes('majorSeven') || normalizedType.includes('majorNine') || normalizedType.includes('majorThirteen')) {
    return {
      name: 'Bebop Major',
      intervals: ['1', '2', '3', '4', '5', 'b6', '6', '7'],
      passingToneIndices: [5]
    }
  }
  
  if (type.includes('b9') && type.includes('b13')) {
    return {
      name: 'Bebop Dom7b9b13',
      intervals: ['1', 'b9', '3', '4', '5', 'b13', 'b7', '7'],
      passingToneIndices: [1, 5, 7]
    }
  }
  
  if (type.includes('7') || type.includes('9') || type.includes('11') || type.includes('13') || type.includes('dominant')) {
    return {
      name: 'Bebop Dominant',
      intervals: ['1', '2', '3', '4', '5', '6', 'b7', '7'],
      passingToneIndices: [7]
    }
  }
  
  if (type.includes('6') || type.includes('6/9')) {
    return {
      name: 'Bebop Major',
      intervals: ['1', '2', '3', '4', '5', 'b6', '6', '7'],
      passingToneIndices: [5]
    }
  }
  
  return {
    name: 'Bebop Dominant',
    intervals: ['1', '2', '3', '4', '5', '6', 'b7', '7'],
    passingToneIndices: [7]
  }
}

function getChordDegrees(type: string, level?: string, options?: { 
  forceNaturalFive?: boolean, 
  endOnStartingInterval?: boolean,
  usePassingNoteBebopScale?: boolean
}): string[] {
  const normalizedType = normalizeChordType(type)
  let chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === type || ct.symbol === type)
  if (!chordType) return ["1"]
  
  if (level && level !== 'all') {
    const practiceLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level)
    
    if (practiceLevel) {
      const getSequenceType = (chordTypeStr: string): string => {
        if (['7', '7b5', '7#5', '7b9', '7#9', '7#11', '7b13', '7#5b9', '7#5#9', '7b5b9', '7b5#9', '7b9b13', '7alt'].includes(chordTypeStr)) return 'dominant'
        if (['9', '9b13', '9#11', '9sus4'].includes(chordTypeStr)) return 'dominant'
        if (['13', '13b9', '13#9', '13#11'].includes(chordTypeStr)) return 'dominant'
        if (['Maj7', 'maj7#5', 'maj7#11', 'maj7b6', 'maj7#9'].includes(chordTypeStr)) return 'major'
        if (['Maj9', 'maj9#11', 'maj9#5', 'maj9b6'].includes(chordTypeStr)) return 'major'
        if (['maj13', 'maj13#11', 'maj13#5'].includes(chordTypeStr)) return 'major'
        if (['m7', 'm7b5', 'm7b5nat9', 'm7b6', 'mMaj7', 'mMaj9', 'mMaj13'].includes(chordTypeStr)) return 'minor'
        if (['m9', 'm9b5'].includes(chordTypeStr)) return 'minor'
        if (['m11', 'm13'].includes(chordTypeStr)) return 'minor'
        if (['Dim', 'dim', 'dim7'].includes(chordTypeStr)) return 'diminished'
        if (['dimMaj7'].includes(chordTypeStr)) return 'diminishedMajorSeven'
        if (['Aug', 'aug', 'aug7'].includes(chordTypeStr)) return 'augmented'
        if (['sus4', '7sus4', '7sus4b9', 'sus4b9', '13sus4', '13sus4b9'].includes(chordTypeStr)) return 'sus'
        if (['sus2'].includes(chordTypeStr)) return 'sus2'
        if (['6', 'm6'].includes(chordTypeStr)) return 'six'
        if (chordTypeStr === 'Major' || chordTypeStr === 'minor') {
          return chordTypeStr === 'minor' ? 'minor' : 'major'
        }
        return 'major'
      }
      
      const seqType = getSequenceType(type) as keyof typeof practiceLevel.sequences
      const degreeNumbers = practiceLevel.sequences[seqType] || practiceLevel.sequences.major || [1, 3, 5, 7]
      
      const degreeToPosition = (deg: number): number => {
        if (deg === 1) return 0
        if (deg <= 4) return 1
        if (deg <= 6) return 2
        if (deg <= 8) return 3
        if (deg <= 11) return 4
        if (deg <= 13) return 5
        return 6
      }
      
      const chordIntervals = chordType.intervals
      let intervals: string[] = degreeNumbers
        .filter(deg => degreeToPosition(deg) < chordIntervals.length)
        .map(deg => {
          const pos = degreeToPosition(deg)
          const semitone = chordIntervals[pos]
          return semitonesToDegree(semitone, type)
        })
      
      if (options?.forceNaturalFive && isAlteredChord(type)) {
        intervals = intervals.map(degree => {
          if (degree === '#5' || degree === 'b5' || degree === 'b13' || degree === '#11') {
            return '5'
          }
          return degree
        })
      }
      
      if (options?.usePassingNoteBebopScale) {
        const bebopScale = getBebopScaleForChordType(type)
        if (bebopScale) {
          const levelSequence = intervals
          const bebopIntervals: string[] = []
          
          for (const interval of levelSequence) {
            bebopIntervals.push(interval)
            
            const currentIdx = bebopScale.intervals.indexOf(interval)
            if (currentIdx !== -1 && currentIdx < bebopScale.intervals.length - 1) {
              const nextInterval = bebopScale.intervals[currentIdx + 1]
              if (bebopScale.passingToneIndices.includes(currentIdx + 1)) {
                bebopIntervals.push(nextInterval)
              }
            }
          }
          
          intervals = bebopIntervals
        }
      }

      const startingOption = practiceLevel.startingIntervalOption || 'first'
      const takeBeforeOrder = practiceLevel.takeStartingIntervalBeforeOrder

      if (startingOption === 'chordTone' && intervals.length > 0) {
        const chordToneSet = new Set(chordIntervals.map(s => semitonesToDegree(s, type)))
        const chordToneInSequence = intervals.filter(i => chordToneSet.has(i))
        if (chordToneInSequence.length > 0) {
          const startInterval = chordToneInSequence[Math.floor(Math.random() * chordToneInSequence.length)]
          if (takeBeforeOrder) {
            const idx = intervals.indexOf(startInterval)
            if (idx > 0) {
              intervals = [...intervals.slice(idx), ...intervals.slice(0, idx)]
            }
          }
        }
      } else if (startingOption === 'any' && intervals.length > 0) {
        const startIdx = Math.floor(Math.random() * intervals.length)
        if (takeBeforeOrder && startIdx > 0) {
          intervals = [...intervals.slice(startIdx), ...intervals.slice(0, startIdx)]
        }
      }
      
      if ((options?.endOnStartingInterval || practiceLevel.endOnStartingInterval) && intervals.length > 0) {
        intervals = [...intervals, intervals[0]]
      }
      
      return intervals
    }
    
    let intervals = getIntervalsForLevel(level, type)
    
    if (options?.forceNaturalFive && isAlteredChord(type)) {
      intervals = intervals.map(degree => {
        if (degree === '#5' || degree === 'b5' || degree === 'b13' || degree === '#11') {
          return '5'
        }
        return degree
      })
    }
    
    if (options?.usePassingNoteBebopScale) {
      const bebopScale = getBebopScaleForChordType(type)
      if (bebopScale) {
        const levelSequence = intervals
        const bebopIntervals: string[] = []
        
        for (const interval of levelSequence) {
          bebopIntervals.push(interval)
          
          const currentIdx = bebopScale.intervals.indexOf(interval)
          if (currentIdx !== -1 && currentIdx < bebopScale.intervals.length - 1) {
            const nextInterval = bebopScale.intervals[currentIdx + 1]
            if (bebopScale.passingToneIndices.includes(currentIdx + 1)) {
              bebopIntervals.push(nextInterval)
            }
          }
        }
        
        intervals = bebopIntervals
      }
    }
    
    if (options?.endOnStartingInterval && intervals.length > 0) {
      intervals = [...intervals, intervals[0]]
    }
    
    return intervals
  }
  
  if (type === 'dim7' || type === 'diminished7') {
    return ["1", "b3", "b5", "bb7"]
  }
  
  if (type === 'm7b5' || type === 'half-diminished') {
    return ["1", "b3", "b5", "b7"]
  }
  
  const extendedChordMap: Record<string, string[]> = {
    '9': ['1', '3', '5', 'b7', '9'],
    'Maj9': ['1', '3', '5', '7', '9'],
    'm9': ['1', 'b3', '5', 'b7', '9'],
    '7#9': ['1', '3', '5', 'b7', '#9'],
    '7b9': ['1', '3', '5', 'b7', 'b9'],
    '11': ['1', '3', '5', 'b7', '9', '11'],
    'm11': ['1', 'b3', '5', 'b7', '9', '11'],
    '7#11': ['1', '3', '5', 'b7', '9', '#11'],
    '13': ['1', '3', '5', 'b7', '9', '11', '13'],
    'm13': ['1', 'b3', '5', 'b7', '9', '11', '13'],
  }
  
  if (extendedChordMap[type]) {
    return extendedChordMap[type]
  }
  
  return chordType.intervals.map(interval => {
    return semitonesToDegree(interval, type)
  })
}

// 根据练习模式获取音级 - 与源HTML文件保持一致
function getIntervalsForLevel(level: string, chordType?: string): string[] {
  let intervals: string[] = []
  
  // 获取和弦类型的实际音级
  const getChordTypeIntervals = (type?: string): string[] => {
    if (!type) return ['1', '3', '5', '7']
    const normalizedType = normalizeChordType(type)
    const ct = CHORD_TYPES.find(c => c.name === normalizedType || c.symbol === normalizedType || c.name === type || c.symbol === type)
    if (!ct) return ['1', '3', '5', '7']
    return ct.intervals.map(i => semitonesToDegree(i, type))
  }
  
  const chordIntervals = getChordTypeIntervals(chordType)
  
  // 辅助函数：查找包含特定数字的音级
  const findInterval = (num: string): string | undefined => {
    return chordIntervals.find(i => {
      const numericPart = i.replace(/[^0-9]/g, '')
      return numericPart === num
    })
  }

  switch (level) {
    // 单和弦音
    case 'single-root':
      intervals = ['1']
      break
    case 'single-3':
      intervals = [findInterval('3') || '3']
      break
    case 'single-5':
      intervals = [findInterval('5') || '5']
      break
    case 'single-7':
      intervals = [findInterval('7') || '7']
      break
    
    // 双和弦音
    case 'double-root-3':
      intervals = ['1', findInterval('3') || '3']
      break
    case 'double-root-5':
      intervals = ['1', findInterval('5') || '5']
      break
    case 'double-root-7':
      intervals = ['1', findInterval('7') || '7']
      break
    case 'double-3-5':
      intervals = [findInterval('3') || '3', findInterval('5') || '5']
      break
    case 'double-3-7':
      intervals = [findInterval('3') || '3', findInterval('7') || '7']
      break
    case 'double-5-7':
      intervals = [findInterval('5') || '5', findInterval('7') || '7']
      break
    
    // 三和弦音
    case 'triple-root-3-5':
      // 对于七和弦类型，需要包含7音
      if (chordType && (chordType.includes('7') || chordType.includes('9') || chordType.includes('11') || chordType.includes('13'))) {
        intervals = chordIntervals
      } else if (chordType && chordType.includes('6')) {
        intervals = chordIntervals
      } else if (chordType === 'dim' || chordType === 'diminished') {
        intervals = ['1', 'b3', 'b5', 'bb7']
      } else {
        intervals = ['1', findInterval('3') || '3', findInterval('5') || '5']
      }
      break
    case 'triple-3-5-7':
      const third = findInterval('3')
      const fifth = findInterval('5')
      const seventh = findInterval('7')
      if (seventh) {
        intervals = [third || '3', fifth || '5', seventh]
      } else if (chordType && chordType.includes('6')) {
        const sixth = findInterval('6')
        intervals = [third || '3', fifth || '5', sixth || '6']
      } else {
        intervals = [third || '3', fifth || '5']
      }
      break
    case 'triple-random-inversion':
      // 根据和弦类型选择转位
      if (chordType && (chordType.includes('7') || chordType.includes('9') || chordType.includes('11') || chordType.includes('13'))) {
        const inversions = [
          [...chordIntervals],
          [...chordIntervals.slice(1), chordIntervals[0]],
          [...chordIntervals.slice(2), ...chordIntervals.slice(0, 2)],
          [...chordIntervals.slice(3), ...chordIntervals.slice(0, 3)]
        ]
        intervals = inversions[Math.floor(Math.random() * inversions.length)]
      } else if (chordType && chordType.includes('6')) {
        const inversions = [
          [...chordIntervals],
          [...chordIntervals.slice(1), chordIntervals[0]],
          [...chordIntervals.slice(2), ...chordIntervals.slice(0, 2)],
          [...chordIntervals.slice(3), ...chordIntervals.slice(0, 3)]
        ]
        intervals = inversions[Math.floor(Math.random() * inversions.length)]
      } else if (chordType === 'dim' || chordType === 'diminished') {
        const dimInversions = [
          ['1', 'b3', 'b5', 'bb7'],
          ['b3', 'b5', 'bb7', '1'],
          ['b5', 'bb7', '1', 'b3'],
          ['bb7', '1', 'b3', 'b5']
        ]
        intervals = dimInversions[Math.floor(Math.random() * dimInversions.length)]
      } else {
        const triadIntervals = ['1', findInterval('3') || '3', findInterval('5') || '5']
        const triadInversions = [
          [...triadIntervals],
          [...triadIntervals.slice(1), triadIntervals[0]],
          [...triadIntervals.slice(2), triadIntervals[0], triadIntervals[1]]
        ]
        intervals = triadInversions[Math.floor(Math.random() * triadInversions.length)]
      }
      break
    
    // 四和弦音
    case 'quad-root-3-5-7':
      intervals = chordIntervals
      break
    case 'quad-3-5-7-root':
      intervals = [...chordIntervals.slice(1), chordIntervals[0]]
      break
    case 'quad-5-7-root-3':
      intervals = [...chordIntervals.slice(2), ...chordIntervals.slice(0, 2)]
      break
    case 'quad-7-root-3-5':
      intervals = [...chordIntervals.slice(3), ...chordIntervals.slice(0, 3)]
      break
    case 'quad-random-inversion':
      const quadInversions = [
        [...chordIntervals],
        [...chordIntervals.slice(1), chordIntervals[0]],
        [...chordIntervals.slice(2), ...chordIntervals.slice(0, 2)],
        [...chordIntervals.slice(3), ...chordIntervals.slice(0, 3)]
      ]
      intervals = quadInversions[Math.floor(Math.random() * quadInversions.length)]
      break
    case 'quad-root-3-5-7-root':
      intervals = [...chordIntervals, '1']
      break
    
    // 默认返回所有音级
    default:
      intervals = chordIntervals
  }
  
  return intervals
}

// 获取音阶的音级（如 1, 2, b3, 4, 5, 6, 7）
function getScaleDegrees(scale: { notes: number[] }): string[] {
  return scale.notes.map(note => {
    return semitonesToDegree(note)
  })
}

// Voice Leading: 找到与目标音最近的音级并重新排列
function applyVoiceLeading(degrees: string[], chordRoot: string, previousNote: string | null): string[] {
  if (!previousNote || degrees.length === 0) return degrees
  
  const prevNoteIdx = getNoteIndex(previousNote)
  if (prevNoteIdx === -1) return degrees
  
  const rootIdx = getNoteIndex(chordRoot)
  if (rootIdx === -1) return degrees
  
  // 计算每个音级到前一个音的距离（考虑八度）
  let minDistance = Infinity
  let bestStartIdx = 0
  
  for (let i = 0; i < degrees.length; i++) {
    const semitone = intervalToSemitones[degrees[i]]
    if (semitone === undefined) continue
    
    // 计算音级对应的音高（半音值）
    const noteSemitone = (rootIdx + semitone) % 12
    
    // 计算距离（考虑最近的八度）
    const distanceUp = (noteSemitone - prevNoteIdx + 12) % 12
    const distanceDown = (prevNoteIdx - noteSemitone + 12) % 12
    const distance = Math.min(distanceUp, distanceDown)
    
    if (distance < minDistance) {
      minDistance = distance
      bestStartIdx = i
    }
  }
  
  // 从最近的音级开始重新排列
  if (bestStartIdx === 0) return degrees
  
  const reordered = [
    ...degrees.slice(bestStartIdx),
    ...degrees.slice(0, bestStartIdx)
  ]
  
  return reordered
}

// 将半音数转换为音级表示
function semitonesToDegree(semitones: number, chordContext?: string): string {
  const isDiminished = chordContext === 'diminished' || chordContext === 'dim7' || chordContext === 'dim' || chordContext === 'dimMaj7'
  const hasFlatFive = isDiminished || chordContext === 'm7b5' || chordContext === 'm9b5' || chordContext === 'm7b5nat9' || 
    chordContext === '7b5' || chordContext === '7b5b9' || chordContext === '7b5#9'
  const isMinor = chordContext?.startsWith('m') || chordContext?.startsWith('min') || chordContext?.startsWith('-') || 
    chordContext === 'minor' || chordContext === 'm7' || chordContext === 'm9' || chordContext === 'm11' || chordContext === 'm13' || 
    chordContext === 'mMaj7' || chordContext === 'm6' || chordContext === 'm7b5' || chordContext === 'm7b6' || 
    chordContext === 'm9b5' || chordContext === 'm7b5nat9' || chordContext === 'mMaj9' || chordContext === 'mMaj13' || 
    chordContext === 'madd9' || chordContext === 'm6/9'
  const hasSharpFive = chordContext === '7#5' || chordContext === '7#5b9' || chordContext === '7#5#9' || chordContext === '7alt' ||
    chordContext === 'aug' || chordContext === 'Aug' || chordContext === 'aug7' ||
    chordContext === 'maj7#5' || chordContext === 'maj9#5' || chordContext === 'maj13#5'
  const degreeMap: Record<number, string> = {
    0: "1",
    1: "b2",
    2: "2",
    3: "b3",
    4: "3",
    5: "4",
    6: hasFlatFive ? "b5" : "#4",
    7: "5",
    8: hasSharpFive ? "#5" : isMinor ? "b6" : "#5",
    9: isDiminished ? "bb7" : "6",
    10: "b7",
    11: "7",
    12: "1",
    13: "b9",
    14: "9",
    15: "#9",
    16: "#9",
    17: "11",
    18: "#11",
    19: "b5",
    20: "b13",
    21: "13",
  }
  return degreeMap[semitones] || `${semitones}`
}

// 获取音符在和弦中的音级
function getNoteDegreeInChord(note: string, chordRoot: string, chordType: string): string | null {
  const normalizedType = normalizeChordType(chordType)
  const chordTypeData = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordType || ct.symbol === chordType)
  if (!chordTypeData) return null

  const rootIdx = getNoteIndex(chordRoot)
  const noteIdx = getNoteIndex(note)
  const interval = (noteIdx - rootIdx + 12) % 12

  // 检查这个音程是否在和弦中
  if (!chordTypeData.intervals.includes(interval)) return null

  return semitonesToDegree(interval, chordType)
}

// 根据音级和根音生成正确的音名
// 例如：D Phrygian (1 b2 b3 4 5 b6 b7) 应该显示为 D, Eb, F, G, A, Bb, C 而不是 D, D#, F, G, A, A#, C
function getScaleNoteNames(rootNote: string, intervals: string[]): string[] {
  const rootIdx = getNoteIndex(rootNote)
  const rootBaseName = rootNote.charAt(0) // 'C', 'D', 'E', 'F', 'G', 'A', 'B'
  const baseNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const rootBaseIdx = baseNotes.indexOf(rootBaseName)
  
  return intervals.map(interval => {
    // 解析音级，如 "b3", "#4", "5"
    const match = interval.match(/^(b|#)?(\d+)$/)
    if (!match) return ''
    
    const accidental = match[1] || '' // 'b', '#', or ''
    const degree = parseInt(match[2]) // 1, 2, 3, 4, 5, 6, 7, etc.
    
    // 计算音级对应的基本音名（不考虑升降号）
    // 1=C, 2=D, 3=E, 4=F, 5=G, 6=A, 7=B
    const degreeToBaseIdx: Record<number, number> = {
      1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6,
      8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5
    }
    
    const baseNoteIdx = (rootBaseIdx + (degreeToBaseIdx[degree % 7 || 7] || 0)) % 7
    const baseNoteName = baseNotes[baseNoteIdx]
    
    // 计算目标音的半音数
    const semitoneOffset = degreeToSemitone(interval)
    if (semitoneOffset === undefined) return ''
    
    const targetSemitone = (rootIdx + semitoneOffset) % 12
    
    // 计算基本音名的自然半音数
    const naturalSemitones: Record<string, number> = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    }
    const naturalSemitone = naturalSemitones[baseNoteName]
    
    // 计算需要的升降
    let diff = (targetSemitone - naturalSemitone + 12) % 12
    
    // 将 diff 转换为 -6 到 +6 范围
    if (diff > 6) diff -= 12
    
    // 生成音名
    let accidentalStr = ''
    if (diff === 1) accidentalStr = '#'
    else if (diff === 2) accidentalStr = '##'
    else if (diff === -1) accidentalStr = 'b'
    else if (diff === -2) accidentalStr = 'bb'
    else if (diff > 2) {
      // 如果差值太大，尝试从另一个方向计算
      diff = diff - 12
      if (diff === -1) accidentalStr = 'b'
    }
    
    return baseNoteName + accidentalStr
  })
}

// 音级到半音数的映射
function degreeToSemitone(degree: string): number | undefined {
  const degreeMap: Record<string, number> = {
    '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5,
    'b5': 6, '#4': 6, '5': 7, '#5': 8, 'b6': 8,
    '6': 9, 'bb7': 9, '#6': 10, 'b7': 10, '7': 11,
    'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18,
    'b13': 20, '13': 21
  }
  return degreeMap[degree]
}

// 和弦练习下一题预览组件 - 使用useMemo避免频繁重新渲染
function ChordExerciseNextChordPreview({ 
  chordExerciseRoot, 
  chordExerciseTypes 
}: { 
  chordExerciseRoot: string
  chordExerciseTypes: string[]
}) {
  const preview = useMemo(() => {
    const nextRoot = chordExerciseRoot === "random"
      ? NOTES[Math.floor(Math.random() * NOTES.length)]
      : chordExerciseRoot
    const nextType = chordExerciseTypes[Math.floor(Math.random() * chordExerciseTypes.length)]
    const normalizedType = normalizeChordType(nextType)
    const nextTypeData = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === nextType)
    const nextDegrees = getChordDegrees(nextType)
    return {
      root: nextRoot,
      type: nextTypeData?.symbol || nextType,
      degrees: nextDegrees
    }
  }, [chordExerciseRoot, chordExerciseTypes])

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm font-medium text-muted-foreground">
        {preview.root} {preview.type}
      </span>
      <span className="text-xs text-muted-foreground/70">
        {preview.degrees.join(' ')}
      </span>
    </div>
  )
}

// ==================== 乐曲选择弹窗辅助函数 ====================

// 获取歌曲分组键名
function getSongGroupKey(song: typeof SONG_PROGRESSIONS[0], sortBy: string): string {
  switch (sortBy) {
    case 'title-asc':
    case 'title-desc':
      // 按标题首字母分组
      const firstChar = song.name.charAt(0).toUpperCase()
      if (/[\u4e00-\u9fff]/.test(song.name)) return '中文'
      if (/^[0-9]/.test(song.name)) return '#'
      return firstChar
    case 'style-asc':
    case 'style-desc':
      // 按风格分组
      return song.style || '其他'
    case 'composer-asc':
    case 'composer-desc':
      // 按作曲家分组
      const composer = song.composer || '未知'
      const composerFirstChar = composer.charAt(0).toUpperCase()
      if (/[\u4e00-\u9fff]/.test(composer)) return '中文'
      if (/^[0-9]/.test(composer)) return '#'
      return composerFirstChar
    case 'year-asc':
    case 'year-desc':
      // 按年代分组（每十年一组）
      const year = parseInt(song.year) || 0
      if (year === 0) return '未知'
      const decade = Math.floor(year / 10) * 10
      return `${decade}s`
    default:
      return '其他'
  }
}

// 排序歌曲
function sortSongs(songs: typeof SONG_PROGRESSIONS, sortBy: string): typeof SONG_PROGRESSIONS {
  const sorted = [...songs]
  switch (sortBy) {
    case 'title-asc':
      return sorted.sort((a, b) => {
        // 定义分组优先级：数字 < 字母 < 中文
        const getPriority = (text: string) => {
          if (/[\u4e00-\u9fff]/.test(text)) return 3
          if (/^[0-9]/.test(text)) return 1
          return 2
        }
        const aPriority = getPriority(a.name)
        const bPriority = getPriority(b.name)
        if (aPriority !== bPriority) return aPriority - bPriority
        return a.name.localeCompare(b.name, 'zh-CN')
      })
    case 'title-desc':
      return sorted.sort((a, b) => {
        const getPriority = (text: string) => {
          if (/[\u4e00-\u9fff]/.test(text)) return 3
          if (/^[0-9]/.test(text)) return 1
          return 2
        }
        const aPriority = getPriority(a.name)
        const bPriority = getPriority(b.name)
        if (aPriority !== bPriority) return aPriority - bPriority
        return b.name.localeCompare(a.name, 'zh-CN')
      })
    case 'style-asc':
      return sorted.sort((a, b) => {
        const styleCompare = (a.style || '').localeCompare(b.style || '', 'zh-CN')
        if (styleCompare !== 0) return styleCompare
        return a.name.localeCompare(b.name, 'zh-CN')
      })
    case 'style-desc':
      return sorted.sort((a, b) => {
        const styleCompare = (b.style || '').localeCompare(a.style || '', 'zh-CN')
        if (styleCompare !== 0) return styleCompare
        return a.name.localeCompare(b.name, 'zh-CN')
      })
    case 'composer-asc':
      return sorted.sort((a, b) => {
        const composerCompare = (a.composer || '').localeCompare(b.composer || '', 'zh-CN')
        if (composerCompare !== 0) return composerCompare
        return a.name.localeCompare(b.name, 'zh-CN')
      })
    case 'composer-desc':
      return sorted.sort((a, b) => {
        const composerCompare = (b.composer || '').localeCompare(a.composer || '', 'zh-CN')
        if (composerCompare !== 0) return composerCompare
        return a.name.localeCompare(b.name, 'zh-CN')
      })
    case 'year-asc':
      return sorted.sort((a, b) => {
        const yearA = parseInt(a.year) || 0
        const yearB = parseInt(b.year) || 0
        if (yearA !== yearB) return yearA - yearB
        return a.name.localeCompare(b.name, 'zh-CN')
      })
    case 'year-desc':
      return sorted.sort((a, b) => {
        const yearA = parseInt(a.year) || 0
        const yearB = parseInt(b.year) || 0
        if (yearA !== yearB) return yearB - yearA
        return a.name.localeCompare(b.name, 'zh-CN')
      })
    default:
      return sorted
  }
}

// 过滤和分组歌曲
function filterAndGroupSongs(
  songs: typeof SONG_PROGRESSIONS,
  searchQuery: string,
  sortBy: string
): { group: string; songs: typeof SONG_PROGRESSIONS }[] {
  // 先过滤
  let filtered = songs
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim()
    filtered = songs.filter(song =>
      song.name.toLowerCase().includes(query) ||
      (song.style && song.style.toLowerCase().includes(query)) ||
      (song.composer && song.composer.toLowerCase().includes(query)) ||
      (song.year && song.year.includes(query))
    )
  }

  // 再排序
  const sorted = sortSongs(filtered, sortBy)

  // 最后分组
  const groups: { group: string; songs: typeof SONG_PROGRESSIONS }[] = []
  let currentGroup = ''
  let currentSongs: typeof SONG_PROGRESSIONS = []

  sorted.forEach(song => {
    const groupKey = getSongGroupKey(song, sortBy)
    if (groupKey !== currentGroup) {
      if (currentSongs.length > 0) {
        groups.push({ group: currentGroup, songs: currentSongs })
      }
      currentGroup = groupKey
      currentSongs = [song]
    } else {
      currentSongs.push(song)
    }
  })

  if (currentSongs.length > 0) {
    groups.push({ group: currentGroup, songs: currentSongs })
  }

  return groups
}

// ==================== 主组件 ====================
export default function FretMasterPage() {
  // ==================== Zustand Store 状态 ====================
  const store = useAppStore()
  const audioSettings = useAudioSettings()
  const practiceSettings = usePracticeSettings()
  const metronomeSettings = useMetronomeSettings()
  const feedbackSoundSettings = useFeedbackSoundSettings()
  const storeScore = useScore()
  const storeIsPlaying = useIsPlaying()
  const storeVersion = useVersion()
  const user = useUser()

  const language = user.language
  const setLanguage = store.setLanguage
  const theme = user.theme
  const setTheme = store.setTheme
  
  const getInstrumentTranspose = useCallback((instrument: string): number => {
    switch (instrument) {
      case 'b_flat_horn': return 2
      case 'e_flat_horn': return 9
      case 'concert_pitch_minus_one': return 1
      default: return 0
    }
  }, [])
  
  const transposeNoteForInstrument = useCallback((note: string, instrument: string): string => {
    const offset = getInstrumentTranspose(instrument)
    if (offset === 0) return normalizeNoteName(note)
    const noteIndex = NOTES.indexOf(normalizeNoteName(note))
    if (noteIndex === -1) return normalizeNoteName(note)
    return NOTES[(noteIndex + offset) % 12]
  }, [getInstrumentTranspose])
  const chordScaleDisplay = user.chordScaleDisplay
  const noteAccidentalDisplay = user.noteAccidentalDisplay
  const setChordScaleDisplay = store.setChordScaleDisplay
  const setNoteAccidentalDisplay = store.setNoteAccidentalDisplay

  const t = useCallback((key: string) => {
    const lang = language || 'zh-CN'
    const translations = TRANSLATIONS[lang] as Record<string, string>
    return translations?.[key] || key
  }, [language])

  // 侧边栏菜单 - useMemo缓存避免每次渲染重新创建
  const sidebarMenuItems = useMemo(() => [
    { id: "practice", label: t('nav_practice'), Icon: Target },
    { id: "interval", label: t('nav_interval'), Icon: Activity },
    { id: "chord_exercise", label: t('nav_chord_exercise'), Icon: Guitar },
    { id: "chord", label: t('nav_chord'), Icon: ListMusic },
    { id: "scale", label: t('nav_scale'), Icon: Music },
    { id: "stats", label: t('nav_stats'), Icon: BarChart3 },
  ], [t])

  // 底部导航菜单 - useMemo缓存避免每次渲染重新创建
  const bottomNavItems = useMemo(() => [
    { id: "practice", label: t('nav_practice'), Icon: Target, shortLabel: t('nav_short_practice') },
    { id: "interval", label: t('nav_interval'), Icon: Activity, shortLabel: t('nav_short_interval') },
    { id: "chord_exercise", label: t('nav_chord_exercise'), Icon: Guitar, shortLabel: t('nav_short_chord_exercise') },
    { id: "chord", label: t('nav_chord'), Icon: ListMusic, shortLabel: t('nav_short_chord') },
    { id: "scale", label: t('nav_scale'), Icon: Music, shortLabel: t('nav_short_scale') },
    { id: "stats", label: t('nav_stats'), Icon: BarChart3, shortLabel: t('nav_short_stats') },
  ], [t])

  // 客户端挂载状态
  const [mounted, setMounted] = useState(false)
  
  // 检测是否在 Tauri 环境
  const [isTauri, setIsTauri] = useState(false)
  
  // 应用主题
  useEffect(() => {
    setMounted(true)
    setIsTauri(isTauriEnv())
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const isSecure = window.isSecureContext || window.location.protocol === 'https:' || isLocalhost
    const isTauriEnvCheck = isTauriEnv()
    if (!isSecure && !isTauriEnvCheck) {
      toast.error(language === 'zh-CN' 
        ? '⚠️ 当前使用 HTTP，麦克风功能不可用。请使用 HTTPS 访问。'
        : '⚠️ HTTP detected. Microphone requires HTTPS. Please use HTTPS.',
        { duration: 8000 }
      )
    }
  }, [])

  // 核心状态 - 从 Store 获取
  const activeTab = store.activeTab
  const setActiveTab = store.setActiveTab
  const sidebarCollapsed = store.sidebarCollapsed
  const setSidebarCollapsed = store.toggleSidebar
  const settingsOpen = store.settingsOpen
  const setSettingsOpen = store.setSettingsOpen
  const isFullscreen = store.isFullscreen
  const toggleFullscreenState = store.toggleFullscreen
  const setFullscreenState = store.setFullscreen
  const displayScale = useDisplayScale()
  const setDisplayScale = store.setDisplayScale
  const focusMode = store.focusMode
  const favorites = store.favorites
  const toggleLevelFavorite = store.toggleLevelFavorite
  const toggleSongFavorite = store.toggleSongFavorite
  const isLevelFavorite = store.isLevelFavorite
  const isSongFavorite = store.isSongFavorite

  // 全屏切换处理函数
  const handleToggleFullscreen = useCallback(async (enable?: boolean) => {
    const newState = enable !== undefined ? enable : !isFullscreen
    
    if (isTauri) {
      try {
        const { setTrueFullscreen } = await import('@/lib/native-window')
        await setTrueFullscreen(newState)
      } catch (e) {
        console.error('Failed to set fullscreen:', e)
      }
    }
    
    toggleFullscreenState()
  }, [isFullscreen, toggleFullscreenState])
  
  const setFullscreenMode = handleToggleFullscreen
  
  // 专注模式启用时不再自动进入全屏，改为浮动侧边面板
  const prevFocusModeEnabled = useRef(focusMode?.enabled)
  useEffect(() => {
    if (focusMode?.enabled !== prevFocusModeEnabled.current) {
      prevFocusModeEnabled.current = focusMode?.enabled
      if (!focusMode?.enabled && isFullscreen) {
        handleToggleFullscreen(false)
      }
    }
  }, [focusMode?.enabled, isFullscreen, handleToggleFullscreen])
  
  // 全屏时切换 html 元素的 fullscreen-mode 类，防止 scrollbar-gutter 导致白条
  useEffect(() => {
    const htmlEl = document.documentElement
    if (isFullscreen) {
      htmlEl.classList.add('fullscreen-mode')
    } else {
      htmlEl.classList.remove('fullscreen-mode')
    }
    return () => {
      htmlEl.classList.remove('fullscreen-mode')
    }
  }, [isFullscreen])
  
  // 练习模式状态
  const isPlaying = storeIsPlaying
  const setIsPlaying = store.setIsPlaying
  const score = storeScore
  const setScore = store.setScore
  
  // 找音练习状态
  const [targetNote, setTargetNote] = useState<string>("C")
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [selectedStrings, setSelectedStrings] = useState<number[]>([1, 2, 3, 4, 5, 6]) // 默认选中所有弦
  
  // 找音练习新模式：指板点亮 + 音名按钮答题
  const [practiceAnswerMode, setPracticeAnswerMode] = useState<"fretboard" | "buttons">("fretboard") // 答题模式：指板点击或按钮选择
  const practiceAnswerModeRef = useRef<"fretboard" | "buttons">("fretboard") // 答题模式 ref，供音频检测回调使用
  const [highlightedTargetPosition, setHighlightedTargetPosition] = useState<{stringIndex: number, fret: number} | null>(null) // 高亮的目标位置
  
  // 找音练习建议
  const [showPracticeSuggestions, setShowPracticeSuggestions] = useState(false)
  const [currentPracticeSuggestion, setCurrentPracticeSuggestion] = useState<string>("")

  // ==================== 统计模块状态 ====================
  const [practiceStats, setPracticeStats] = useState<PracticeStats>({
    daily: [],
    total: {
      count: 0,
      byType: {
        pitch_finding: 0,
        scale: 0,
        chord_exercise: 0,
        interval: 0,
        chord_progression: 0
      },
      byDetail: {
        pitch_finding: [],
        scale: [],
        chord_exercise: [],
        interval: [],
        chord_progression: []
      }
    }
  })
  const [statsTimeRange, setStatsTimeRange] = useState<StatsTimeRange>('today')
  const [highlightedFrets, setHighlightedFrets] = useState<Map<string, boolean>>(new Map())
  const practiceTime = practiceSettings.practiceTime
  const setPracticeTime = store.setPracticeTime
  const [timeLeft, setTimeLeft] = useState(300)
  const fretCount = practiceSettings.fretCount
  const setFretCount = store.setFretCount
  const autoNextDelay = practiceSettings.autoNextDelay
  const setAutoNextDelay = store.setAutoNextDelay
  const [pitchFindingTime, setPitchFindingTime] = useState(5) // 找音练习时长（分钟）

  // 音程状态
  const [rootNote, setRootNote] = useState(normalizeNoteName(store.intervalPractice.rootNote))
  const [selectedIntervals, setSelectedIntervals] = useState<number[]>(store.intervalPractice.selectedIntervals)
  const [intervalRootMode, setIntervalRootMode] = useState<"fixed" | "random">(store.intervalPractice.rootMode)
  const [findRootFirst, setFindRootFirst] = useState(store.intervalPractice.findRootFirst)
  const [addRootBack, setAddRootBack] = useState(store.intervalPractice.addRootBack)
  const [intervalPracticeStep, setIntervalPracticeStep] = useState<"root" | "interval">("root")
  const [currentIntervalExercise, setCurrentIntervalExercise] = useState<{
    rootNote: string;
    interval: { name: string; symbol: string; semitones: number };
    targetNote: string;
    allIntervals: { name: string; symbol: string; semitones: number }[];
    currentIntervalDisplay: string;
    completedIntervals: number[];
    answered: boolean;
  } | null>(null)
  
  // 和弦进行状态
  const [selectedSong, setSelectedSong] = useState(SONG_PROGRESSIONS[0])
  const [customChords, setCustomChords] = useState<{ root: string; type: string; bass?: string }[]>([])
  const [currentChordIndex, setCurrentChordIndex] = useState(0)
  const [chordPlayOrder, setChordPlayOrder] = useState<"asc" | "desc" | "random">(store.chordProgression.playOrder)
  const [practiceLevel, setPracticeLevel] = useState(store.chordProgression.selectedLevelId)
  // 调性状态：存储音名（如 "E"），小调状态单独存储
  const getKeyNote = (key: string): string => {
    // 提取音名部分（去掉小调标记 'm'），并标准化为 ♯/♭
    const rawNotePart = key.endsWith('m') ? key.slice(0, -1) : key
    const notePart = normalizeNoteName(rawNotePart)

    // 处理降号调性 (如 D♭ -> C♯, B♭ -> A♯)
    if (notePart.includes('♭')) {
      const flatIndex = findNoteIndexInArray(notePart, NOTES_FLAT)
      if (flatIndex !== -1) {
        return NOTES[flatIndex]
      }
    }

    return notePart
  }
  const isKeyMinor = (key: string): boolean => key.endsWith('m')
  const [progressionKey, setProgressionKey] = useState(normalizeNoteName(store.chordProgression.progressionKey || getKeyNote(SONG_PROGRESSIONS[0]?.key || "C")))
  const [isMinor, setIsMinor] = useState(isKeyMinor(SONG_PROGRESSIONS[0]?.key || "C"))
  const [progressionRepeat, setProgressionRepeat] = useState(store.chordProgression.shouldRepeat)
  const [shouldVoiceLead, setShouldVoiceLead] = useState(store.chordProgression.shouldVoiceLead)
  const [shouldRandomizeKeyOnRepeat, setShouldRandomizeKeyOnRepeat] = useState(store.chordProgression.randomizeKeyOnRepeat)
  const [songSortOption, setSongSortOption] = useState<'titleAsc' | 'titleDesc' | 'styleAsc' | 'styleDesc'>(store.chordProgression.songSortOption)
  const [lastChordNote, setLastChordNote] = useState<string | null>(null) // 用于 voice leading
  
  const [levelOrderOption, setLevelOrderOption] = useState(false)
  const [levelRandomOption, setLevelRandomOption] = useState(false)
  const [levelStartingInterval, setLevelStartingInterval] = useState<"any" | "first" | "chordTone">("any")
  const [levelForceNaturalFive, setLevelForceNaturalFive] = useState(true)
  const [levelNotesPerChord, setLevelNotesPerChord] = useState(1)
  const [levelEndOnStartingInterval, setLevelEndOnStartingInterval] = useState(false)
  const [levelUsePassingNoteBebopScale, setLevelUsePassingNoteBebopScale] = useState(false)

  const getLevelOptions = useCallback(() => ({
    forceNaturalFive: levelForceNaturalFive,
    endOnStartingInterval: levelEndOnStartingInterval,
    usePassingNoteBebopScale: levelUsePassingNoteBebopScale,
  }), [levelForceNaturalFive, levelEndOnStartingInterval, levelUsePassingNoteBebopScale])
  const [isPracticePaused, setIsPracticePaused] = useState(false)
  const [practiceSessionStartTime, setPracticeSessionStartTime] = useState<number | null>(null)
  const [practiceElapsedTime, setPracticeElapsedTime] = useState(0)
  const [irealInput, setIrealInput] = useState("")
  const [newChordRoot, setNewChordRoot] = useState("C")
  const [newChordType, setNewChordType] = useState("Major")
  const [newChordBass, setNewChordBass] = useState<string | undefined>(undefined)
  const [customChordName, setCustomChordName] = useState("")
  const [showCustomChordDialog, setShowCustomChordDialog] = useState(false)
  
  // 音阶状态
  const [scaleKey, setScaleKey] = useState("C")
  const [isScaleKeyRandom, setIsScaleKeyRandom] = useState(false)
  const [selectedScaleCategory, setSelectedScaleCategory] = useState<keyof typeof SCALE_MODES>("pentatonic")
  const [selectedScale, setSelectedScale] = useState(SCALE_MODES.pentatonic[0])
  const [selectedScales, setSelectedScales] = useState<typeof SCALE_MODES.basic>([SCALE_MODES.pentatonic[0]])
  const [scaleDirection, setScaleDirection] = useState<"up" | "down" | "up_down" | "random">("up")
  const [scaleRootMovement, setScaleRootMovement] = useState<"static" | "random" | "upSemiTone" | "downSemiTone" | "circleOfFifths" | "circleOfFourths">("static")
  const [showScaleFretboard, setShowScaleFretboard] = useState(false)
  const [scalePracticeSequence, setScalePracticeSequence] = useState<string>("1to1")
  const [scaleExerciseSequence, setScaleExerciseSequence] = useState<string[]>([])
  const [scaleExerciseCurrentStep, setScaleExerciseCurrentStep] = useState(0)
  const [showScaleStructure, setShowScaleStructure] = useState(false)
  const [showScaleKeyboard, setShowScaleKeyboard] = useState(false)
  const [nextScaleExerciseInfo, setNextScaleExerciseInfo] = useState<{key: string, scaleName: string, sequence: string[]} | null>(null)
  
  // 和弦转换练习状态
  const [showFretboard, setShowFretboard] = useState(false)
  const [showChordFretboard, setShowChordFretboard] = useState(store.chordProgression.showFretboard)
  const [showChordStructure, setShowChordStructure] = useState(store.chordProgression.showStructure)
  const [nextChordInfo, setNextChordInfo] = useState<{index: number, root: string, type: string, bass?: string, degrees: string[]} | null>(null)
  const [chordDegreeCurrentStep, setChordDegreeCurrentStep] = useState(0)

  // 和弦练习状态
  const [chordExerciseRoot, setChordExerciseRoot] = useState<string>("C")
  const [chordExerciseTypes, setChordExerciseTypes] = useState<string[]>(["Major"])
  const [chordExerciseLevel, setChordExerciseLevel] = useState<string>("single_chord_tones_root")
  const [chordExerciseOrder, setChordExerciseOrder] = useState<"asc" | "desc" | "random">("asc")
  const [chordExerciseBass, setChordExerciseBass] = useState<string>("root")
  const [showChordExerciseFretboard, setShowChordExerciseFretboard] = useState(false)
  const [chordExerciseCurrentStep, setChordExerciseCurrentStep] = useState(0)
  const [chordExerciseSequence, setChordExerciseSequence] = useState<string[]>([])
  const [chordExerciseTargetChord, setChordExerciseTargetChord] = useState<{root: string, type: string} | null>(null)
  const [chordExerciseIsAnswered, setChordExerciseIsAnswered] = useState(false)
  const [nextChordExerciseInfo, setNextChordExerciseInfo] = useState<{root: string, type: string, sequence: string[]} | null>(null)
  const [showChordExerciseStructure, setShowChordExerciseStructure] = useState(false)
  const [showChordExerciseLevelSelector, setShowChordExerciseLevelSelector] = useState(false)

  // 正确答案反馈状态
  const [showCorrectFeedback, setShowCorrectFeedback] = useState(false)
  const [correctFeedbackNote, setCorrectFeedbackNote] = useState<string | null>(null)
  const [showWrongFeedback, setShowWrongFeedback] = useState(false)
  const [wrongFeedbackNote, setWrongFeedbackNote] = useState<string | null>(null)
  const [showPracticeSummary, setShowPracticeSummary] = useState(false)
  const [practiceSummaryData, setPracticeSummaryData] = useState<{correct: number, total: number, duration: number}>({correct: 0, total: 0, duration: 0})

  // 近期练习记录（从服务器加载，用于统计页展示）
  const [recentRecords, setRecentRecords] = useState<ServerPracticeStats[]>([])

  // 统计数据缓存版本：升级此版本号会自动清除旧的 localStorage 统计缓存
  // 用于修复历史脏数据（如重复记录、错误时区数据等）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const CACHE_VERSION = 'v3-20260716'  // v3: 清除路由器清理后残留的本地缓存
    const stored = localStorage.getItem('fretmaster-stats-version')
    if (stored !== CACHE_VERSION) {
      localStorage.removeItem('fretmaster-stats')
      localStorage.setItem('fretmaster-stats-version', CACHE_VERSION)
      logger.info('已清除旧的统计数据缓存', { from: stored, to: CACHE_VERSION })
    }
  }, [])

  // 音程练习状态
  const [showIntervalFretboard, setShowIntervalFretboard] = useState(store.intervalPractice.showFretboard)
  const [showIntervalKeyboard, setShowIntervalKeyboard] = useState(false)
  const [intervalPracticeDuration, setIntervalPracticeDuration] = useState(store.intervalPractice.practiceDuration)
  const [intervalRandomizeOrder, setIntervalRandomizeOrder] = useState(store.intervalPractice.randomizeOrder)
  const [intervalDirection, setIntervalDirection] = useState<"up" | "down" | "random">(store.intervalPractice.direction)
  const [intervalFretboardDuration, setIntervalFretboardDuration] = useState(store.intervalPractice.fretboardDuration)
  const [intervalAutoAdvance, setIntervalAutoAdvance] = useState(store.intervalPractice.autoAdvance)
  const [intervalTimeLeft, setIntervalTimeLeft] = useState(0) // 剩余时间（秒）
  const [intervalExerciseQueue, setIntervalExerciseQueue] = useState<number[]>([]) // 音程练习队列
  const [intervalCurrentQueueIndex, setIntervalCurrentQueueIndex] = useState(0) // 当前队列索引

  // 和弦练习状态
  const [showChordExerciseKeyboard, setShowChordExerciseKeyboard] = useState(false)

  // 和弦转换练习状态
  const [showChordKeyboard, setShowChordKeyboard] = useState(store.chordProgression.showKeyboard)

  // 乐曲选择弹窗状态
  const [showSongSelector, setShowSongSelector] = useState(false)
  const [songSearchQuery, setSongSearchQuery] = useState("")
  const [songSortBy, setSongSortBy] = useState<"title-asc" | "title-desc" | "style-asc" | "style-desc" | "composer-asc" | "composer-desc" | "year-asc" | "year-desc">("title-asc")
  const [selectedSongInfo, setSelectedSongInfo] = useState<typeof SONG_PROGRESSIONS[0] | null>(null)
  const [showSongInfoDialog, setShowSongInfoDialog] = useState(false)
  const [showCustomSongEditor, setShowCustomSongEditor] = useState(false)

  // 缓存歌曲分组结果 - 避免每次渲染重新计算
  const groupedSongs = useMemo(() => 
    filterAndGroupSongs(SONG_PROGRESSIONS, songSearchQuery, songSortBy),
    [songSearchQuery, songSortBy]
  )

  // 扁平化歌曲列表用于虚拟滚动
  const flattenedSongs = useMemo(() => {
    const result: Array<{ type: 'header'; group: string } | { type: 'song'; song: typeof SONG_PROGRESSIONS[0]; group: string }> = []
    groupedSongs.forEach(({ group, songs }) => {
      result.push({ type: 'header', group })
      songs.forEach(song => {
        result.push({ type: 'song', song, group })
      })
    })
    return result
  }, [groupedSongs])

  // 虚拟滚动列表 ref
  const songListRef = useRef<List>(null)

  // 获取歌曲列表项高度
  const getSongItemSize = useCallback((index: number) => {
    const item = flattenedSongs[index]
    return item?.type === 'header' ? 28 : 64
  }, [flattenedSongs])

  // 练习模式选择弹窗状态
  const [showLevelSelector, setShowLevelSelector] = useState(false)
  const [selectedLevelInfo, setSelectedLevelInfo] = useState<typeof ALL_PRACTICE_LEVELS[0] | null>(null)
  const [showLevelInfoDialog, setShowLevelInfoDialog] = useState(false)

  // 快捷键帮助状态
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  
  // 节拍器状态 - 从 Store 获取
  const metronomeEnabled = metronomeSettings.enabled
  const setMetronomeEnabled = store.setMetronomeEnabled
  const metronomeBpm = metronomeSettings.bpm
  const setMetronomeBpm = store.setMetronomeBpm
  const metronomeSound = metronomeSettings.sound
  const setMetronomeSound = store.setMetronomeSound
  const metronomeFlash = metronomeSettings.flash
  const setMetronomeFlash = store.setMetronomeFlash
  
  // 音频输入状态 - 从 Store 获取
  const micEnabled = audioSettings.micEnabled
  const setMicEnabled = store.setMicEnabled
  const audioDevices = store.audioDevice.devices
  const setAudioDevices = store.setAudioDevices
  const audioInitializing = store.audioDevice.initializing
  const setAudioInitializing = store.setAudioInitializing
  const audioError = store.audioDevice.error
  const setAudioError = store.setAudioError
  const selectedAudioDevice = audioSettings.selectedAudioDevice
  const setSelectedAudioDevice = store.setSelectedAudioDevice
  const detectedPitch = store.detectedPitch
  const setDetectedPitch = store.setDetectedPitch
  const detectedCents = store.detectedCents
  const setDetectedCents = store.setDetectedCents
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)
  const inputGain = audioSettings.inputGain
  const setInputGain = store.setInputGain
  
  // 音高检测调试信息
  const [pitchDebugInfo, setPitchDebugInfo] = useState<{
    rms: number
    threshold: number
    frequency: number | null
    probability: number | null
    isRunning: boolean
  }>({ rms: 0, threshold: 0, frequency: null, probability: null, isRunning: false })
  
  // MIDI状态
  const [midiEnabled, setMidiEnabled] = useState(false)
  const [midiDevices, setMidiDevices] = useState<WebMidi.MIDIInput[]>([])
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>("random")
  const [midiAccess, setMidiAccess] = useState<WebMidi.MIDIAccess | null>(null)
  
  // 设置状态 - 从 Store 获取
  const cooldownEnabled = practiceSettings.cooldownEnabled
  const setCooldownEnabled = store.setCooldownEnabled
  const cooldownDuration = practiceSettings.cooldownDuration
  const setCooldownDuration = store.setCooldownDuration
  const confidenceThreshold = audioSettings.confidenceThreshold
  const setConfidenceThreshold = store.setConfidenceThreshold
  const sensitivity = audioSettings.sensitivity
  const setSensitivity = store.setSensitivity

  // 调音器状态
  const [tunerOpen, setTunerOpen] = useState(false)
  const [tunerActive, setTunerActive] = useState(false)
  const [detectedNote, setDetectedNote] = useState<string>("-")
  const [detectedFrequency, setDetectedFrequency] = useState<number>(0)
  const [cents, setCents] = useState<number>(0)
  const referenceFrequency = practiceSettings.referenceFrequency
  const setReferenceFrequency = store.setReferenceFrequency
  const tunerAudioContextRef = useRef<AudioContext | null>(null)
  const tunerAnalyserRef = useRef<AnalyserNode | null>(null)
  const tunerStreamRef = useRef<MediaStream | null>(null)
  // 反馈音共享 AudioContext，避免每次播放都创建新实例导致内存泄漏和配额耗尽
  // （浏览器/WebView 通常限制约 6 个 AudioContext 实例）
  const feedbackAudioCtxRef = useRef<AudioContext | null>(null)
  const tunerGainNodeRef = useRef<GainNode | null>(null)
  const tunerAnimationRef = useRef<number | null>(null)
  const tunerHistoryRef = useRef<{ frequency: number; note: string; cents: number }[]>([])

  // 浮动窗口拖动位置状态
  const [chordStructurePosition, setChordStructurePosition] = useState({ x: 0, y: 0 })
  const [scaleStructurePosition, setScaleStructurePosition] = useState({ x: 0, y: 0 })
  const [chordExerciseStructurePosition, setChordExerciseStructurePosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    target: 'chord' | 'scale' | 'chordExercise' | null;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    target: null
  })
  const rafRef = useRef<number | null>(null)
  const pendingPositionRef = useRef<{ x: number; y: number; target: 'chord' | 'scale' | 'chordExercise' } | null>(null)

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const metronomeRef = useRef<NodeJS.Timeout | null>(null)
  const pitchDetectionRef = useRef<number | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const cooldownRef = useRef<NodeJS.Timeout | null>(null)
  const isCoolingDownRef = useRef(false)
  const handleMIDINoteInputRef = useRef<((note: string) => void) | null>(null)
  const nextChordExerciseRef = useRef<(() => void) | null>(null)
  const nextScaleExerciseRef = useRef<(() => void) | null>(null)
  const generateNewTargetRef = useRef<(() => void) | null>(null)
  const generateIntervalExerciseRef = useRef<(() => void) | null>(null)
  const nextChordRef = useRef<(() => void) | null>(null)
  const chordExerciseIsAnsweredRef = useRef(false)
  const practiceCardRef = useRef<HTMLDivElement | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const handleAudioWorkletMessageRef = useRef<((message: { type: string; data: unknown }) => void) | null>(null)
  const [useAudioWorklet, setUseAudioWorklet] = useState(true)
  
  // 根据运行环境获取 AudioWorklet 模块的正确路径
  // Tauri: 从根路径加载; Web子路径部署: 自动检测前缀
  const getAudioWorkletModulePath = (): string => {
    if (typeof window === 'undefined') return '/js/audio-worklet-processor.js'
    if (isTauriEnv()) return '/js/audio-worklet-processor.js'
    const path = window.location.pathname
    const match = path.match(/^(\/[^/]+)\//)
    if (match) return match[1] + '/js/audio-worklet-processor.js'
    return '/js/audio-worklet-processor.js'
  }
  
  // 状态refs - 用于音高检测回调中获取最新状态
  const isPlayingRef = useRef(isPlaying)
  const activeTabRef = useRef(activeTab)
  const sensitivityRef = useRef(sensitivity)
  const confidenceThresholdRef = useRef(confidenceThreshold)
  const pitchAlgorithmRef = useRef(audioSettings.pitchAlgorithm)
  const scoreRef = useRef(score)
  const targetNoteRef = useRef(targetNote)
  const scaleKeyRef = useRef(scaleKey)
  const scaleExerciseSequenceRef = useRef(scaleExerciseSequence)
  const scaleExerciseCurrentStepRef = useRef(scaleExerciseCurrentStep)
  const chordExerciseTargetChordRef = useRef(chordExerciseTargetChord)
  const chordExerciseSequenceRef = useRef(chordExerciseSequence)
  const chordExerciseCurrentStepRef = useRef(chordExerciseCurrentStep)
  const currentIntervalExerciseRef = useRef(currentIntervalExercise)
  const currentChordIndexRef = useRef(currentChordIndex)
  const chordDegreeCurrentStepRef = useRef(chordDegreeCurrentStep)
  const practiceLevelRef = useRef(practiceLevel)
  const findRootFirstRef = useRef(findRootFirst)
  const addRootBackRef = useRef(addRootBack)
  const nextChordInfoRef = useRef(nextChordInfo)
  const getTransposedChordsRef = useRef<(() => { root: string; type: string }[]) | null>(null)
  const lastChordNoteRef = useRef<string | null>(null) // 用于 voice leading
  const shouldVoiceLeadRef = useRef(shouldVoiceLead)
  const shouldRandomizeKeyOnRepeatRef = useRef(shouldRandomizeKeyOnRepeat)
  const progressionRepeatRef = useRef(progressionRepeat)
  const levelOptionsRef = useRef(getLevelOptions())

  // ==================== 效果 ====================
  
  // 更新状态refs - 确保音高检测回调中能获取最新状态（合并为一个useEffect减少重渲染）
  useEffect(() => {
    isPlayingRef.current = isPlaying
    activeTabRef.current = activeTab
    sensitivityRef.current = sensitivity
    confidenceThresholdRef.current = confidenceThreshold
    pitchAlgorithmRef.current = audioSettings.pitchAlgorithm
    scoreRef.current = score
    targetNoteRef.current = targetNote
    scaleKeyRef.current = scaleKey
    scaleExerciseSequenceRef.current = scaleExerciseSequence
    scaleExerciseCurrentStepRef.current = scaleExerciseCurrentStep
    chordExerciseTargetChordRef.current = chordExerciseTargetChord
    chordExerciseSequenceRef.current = chordExerciseSequence
    chordExerciseCurrentStepRef.current = chordExerciseCurrentStep
    currentIntervalExerciseRef.current = currentIntervalExercise
    currentChordIndexRef.current = currentChordIndex
    chordDegreeCurrentStepRef.current = chordDegreeCurrentStep
    practiceLevelRef.current = practiceLevel
    findRootFirstRef.current = findRootFirst
    addRootBackRef.current = addRootBack
    nextChordInfoRef.current = nextChordInfo
    shouldVoiceLeadRef.current = shouldVoiceLead
    shouldRandomizeKeyOnRepeatRef.current = shouldRandomizeKeyOnRepeat
    progressionRepeatRef.current = progressionRepeat
    levelOptionsRef.current = getLevelOptions()
  }, [isPlaying, activeTab, sensitivity, confidenceThreshold, targetNote, scaleKey, 
      scaleExerciseSequence, scaleExerciseCurrentStep, chordExerciseTargetChord, 
      chordExerciseSequence, chordExerciseCurrentStep, currentIntervalExercise, 
      currentChordIndex, chordDegreeCurrentStep, practiceLevel, findRootFirst, nextChordInfo,
      shouldVoiceLead, shouldRandomizeKeyOnRepeat, progressionRepeat, getLevelOptions, audioSettings.pitchAlgorithm])

  useEffect(() => {
    store.setIntervalPracticeSettings({
      selectedIntervals,
      rootMode: intervalRootMode,
      rootNote,
      findRootFirst,
      addRootBack,
      direction: intervalDirection,
      randomizeOrder: intervalRandomizeOrder,
      practiceDuration: intervalPracticeDuration,
      showFretboard: showIntervalFretboard,
      fretboardDuration: intervalFretboardDuration,
      autoAdvance: intervalAutoAdvance,
    })
  }, [selectedIntervals, intervalRootMode, rootNote, findRootFirst, addRootBack, intervalDirection, intervalRandomizeOrder, intervalPracticeDuration, showIntervalFretboard, intervalFretboardDuration, intervalAutoAdvance])

  useEffect(() => {
    store.setChordProgressionSettings({
      selectedLevelId: practiceLevel,
      progressionKey,
      playOrder: chordPlayOrder,
      shouldRepeat: progressionRepeat,
      shouldVoiceLead,
      randomizeKeyOnRepeat: shouldRandomizeKeyOnRepeat,
      showFretboard: showChordFretboard,
      showKeyboard: showChordKeyboard,
      showStructure: showChordStructure,
      songSortOption,
    })
  }, [practiceLevel, progressionKey, chordPlayOrder, progressionRepeat, shouldVoiceLead, shouldRandomizeKeyOnRepeat, showChordFretboard, showChordKeyboard, showChordStructure, songSortOption])

  // 从服务器/SQLite加载统计数据
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Tauri 环境首次运行：清理历史 localStorage 备份，避免从 Web 版迁移或早期版本遗留的脏数据
    // 被错误加载（导致"未使用却显示练习记录"）
    if (isTauri) {
      try {
        localStorage.removeItem('fretmaster-stats')
        localStorage.removeItem('fretmaster_stats_backup')
      } catch (e) {
        console.warn('Failed to clean legacy localStorage stats:', e)
      }
    }

    const loadStatsFromServer = async () => {
      try {
        const serverStats = await getAllPracticeStats()
        
        const newStats: PracticeStats = {
          daily: [],
          total: {
            count: 0,
            byType: {
              pitch_finding: 0,
              scale: 0,
              chord_exercise: 0,
              interval: 0,
              chord_progression: 0
            },
            byDetail: {
              pitch_finding: [],
              scale: [],
              chord_exercise: [],
              interval: [],
              chord_progression: []
            }
          }
        }
        
        const typeMapping: Record<string, PracticeType> = {
          '音高识别': 'pitch_finding',
          '音阶练习': 'scale',
          '和弦练习': 'chord_exercise',
          '音程练习': 'interval',
          '和弦进行': 'chord_progression'
        }
        
        // 先对服务器返回的数据去重，避免旧版本 bug 产生的脏数据
        // （同一秒内多条同类型记录、或时间差小于 duration 的重复记录）
        // 导致统计虚高（例如"今天没练习却显示练习了"）
        const dedupedServerStats = deduplicateStats(serverStats as ServerPracticeStats[])
        
        dedupedServerStats.forEach((record: ServerPracticeStats) => {
          // 使用 dbTimestampToLocalDate 正确解析 SQLite/ISO 时间戳为本地日期
          // 避免 SQLite 的 "YYYY-MM-DD HH:MM:SS" (UTC) 被错误解析为本地时间
          const date = record.created_at
            ? dbTimestampToLocalDate(record.created_at)
            : getLocalDateString(new Date())
          const type = typeMapping[record.exercise_type] || 'pitch_finding'
          const detailName = record.notes?.replace('练习项目: ', '') || record.exercise_type
          
          newStats.total.count += 1
          newStats.total.byType[type] = (newStats.total.byType[type] || 0) + 1
          
          const detailList = newStats.total.byDetail[type] || []
          const existingDetail = detailList.find(d => d.name === detailName)
          if (existingDetail) {
            existingDetail.count += 1
          } else {
            detailList.push({ name: detailName, count: 1 })
          }
          newStats.total.byDetail[type] = detailList
          
          let todayStats = newStats.daily.find(d => d.date === date)
          if (!todayStats) {
            todayStats = {
              date: date,
              totalCount: 0,
              byType: {
                pitch_finding: 0,
                scale: 0,
                chord_exercise: 0,
                interval: 0,
                chord_progression: 0
              },
              byDetail: {
                pitch_finding: [],
                scale: [],
                chord_exercise: [],
                interval: [],
                chord_progression: []
              }
            }
            newStats.daily.push(todayStats)
          }
          
          todayStats.totalCount += 1
          todayStats.byType[type] = (todayStats.byType[type] || 0) + 1
          
          const todayDetailList = todayStats.byDetail[type] || []
          const todayExistingDetail = todayDetailList.find(d => d.name === detailName)
          if (todayExistingDetail) {
            todayExistingDetail.count += 1
          } else {
            todayDetailList.push({ name: detailName, count: 1 })
          }
          todayStats.byDetail[type] = todayDetailList
        })
        
        // 只保留最近90天的数据
        newStats.daily = newStats.daily
          .filter(d => {
            // 使用本地时区解析日期，避免 UTC 偏移导致数据被误删
            const parts = d.date.split('-')
            if (parts.length !== 3) return false
            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
            const ninetyDaysAgo = getLocalDaysAgoStart(90)
            return date >= ninetyDaysAgo
          })
          .sort((a, b) => b.date.localeCompare(a.date))
        
        setPracticeStats(newStats)
        
        // 保存去重后的近期记录（最多 50 条，按时间倒序），供统计页展示
        setRecentRecords(dedupedServerStats.slice(0, 50))

        // Tauri 环境以 SQLite 为唯一真相源，不写入 localStorage，避免历史脏数据污染
        if (!isTauri) {
          localStorage.setItem('fretmaster-stats', JSON.stringify(newStats))
        }
      } catch (e) {
        console.error('Failed to load stats:', e)
        // Tauri 环境失败时返回空统计，不读 localStorage 备份（避免历史脏数据导致"未练习却有记录"）
        if (!isTauri) {
          const savedStats = localStorage.getItem('fretmaster-stats')
          if (savedStats) {
            try {
              const stats = JSON.parse(savedStats)
              setPracticeStats(stats)
            } catch (e) {
              console.error('Failed to load stats from localStorage:', e)
            }
          }
        }
      }
    }
    
    loadStatsFromServer()
  }, [isTauri])

  // 保存统计数据
  const savePracticeStats = useCallback((stats: PracticeStats) => {
    if (typeof window === 'undefined') return
    localStorage.setItem('fretmaster-stats', JSON.stringify(stats))
    setPracticeStats(stats)
  }, [])

  const savePracticeState = useCallback(() => {
    if (typeof window === 'undefined' || !isPlaying) return
    const state = {
      activeTab,
      score: storeScore,
      timeLeft,
      isPracticePaused,
      timestamp: Date.now(),
    }
    localStorage.setItem('fretmaster-practice-state', JSON.stringify(state))
  }, [isPlaying, activeTab, storeScore, timeLeft, isPracticePaused])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleBeforeUnload = () => {
      savePracticeState()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [savePracticeState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('fretmaster-practice-state')
      if (saved) {
        const state = JSON.parse(saved)
        if (Date.now() - state.timestamp < 30 * 60 * 1000) {
          localStorage.removeItem('fretmaster-practice-state')
        }
      }
    } catch (e) {
      console.error('Failed to parse practice state:', e)
    }
  }, [])

  // 记录练习统计
  // score/duration/accuracy 为可选参数，未传则使用当前会话的实时数据
  // - score: 本次答题得分（0-100），默认用 scoreRef 实时计算
  // - duration: 本次练习耗时（秒），默认用会话开始至今的时间
  // - accuracy: 准确率（0-100），默认用 scoreRef 实时计算
  const recordPractice = useCallback((type: PracticeType, detailName: string, opts?: { score?: number; duration?: number; accuracy?: number }) => {
    // 使用本地时区日期，避免 UTC+8 凌晨 0-8 点时今天被记为昨天
    const today = getLocalDateString(new Date())
    
    // 计算真实数据（若未显式传入）
    const currentScore = scoreRef.current
    const realAccuracy = currentScore.total > 0
      ? Math.round((currentScore.correct / currentScore.total) * 100)
      : 100
    const realDuration = practiceSessionStartTime
      ? Math.max(1, Math.round((Date.now() - practiceSessionStartTime + practiceElapsedTime * 1000) / 1000))
      : 60
    const finalScore = opts?.score ?? 100
    const finalDuration = opts?.duration ?? realDuration
    const finalAccuracy = opts?.accuracy ?? realAccuracy
    
    setPracticeStats(prevStats => {
      const newStats = { ...prevStats }
      
      // 更新总计
      newStats.total.count += 1
      newStats.total.byType[type] = (newStats.total.byType[type] || 0) + 1
      
      // 更新详细统计
      const detailList = newStats.total.byDetail[type] || []
      const existingDetail = detailList.find(d => d.name === detailName)
      if (existingDetail) {
        existingDetail.count += 1
      } else {
        detailList.push({ name: detailName, count: 1 })
      }
      newStats.total.byDetail[type] = detailList
      
      // 更新每日统计
      let todayStats = newStats.daily.find(d => d.date === today)
      if (!todayStats) {
        todayStats = {
          date: today,
          totalCount: 0,
          byType: {
            pitch_finding: 0,
            scale: 0,
            chord_exercise: 0,
            interval: 0,
            chord_progression: 0
          },
          byDetail: {
            pitch_finding: [],
            scale: [],
            chord_exercise: [],
            interval: [],
            chord_progression: []
          }
        }
        newStats.daily.push(todayStats)
      }
      
      todayStats.totalCount += 1
      todayStats.byType[type] = (todayStats.byType[type] || 0) + 1
      
      const todayDetailList = todayStats.byDetail[type] || []
      const todayExistingDetail = todayDetailList.find(d => d.name === detailName)
      if (todayExistingDetail) {
        todayExistingDetail.count += 1
      } else {
        todayDetailList.push({ name: detailName, count: 1 })
      }
      todayStats.byDetail[type] = todayDetailList
      
      // 只保留最近90天的数据
      newStats.daily = newStats.daily
        .filter(d => {
          // 使用本地时区解析日期
          const parts = d.date.split('-')
          if (parts.length !== 3) return false
          const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
          const ninetyDaysAgo = getLocalDaysAgoStart(90)
          return date >= ninetyDaysAgo
        })
        .sort((a, b) => b.date.localeCompare(a.date))
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('fretmaster-stats', JSON.stringify(newStats))
      }
      
      // 同时保存到服务器（SQLite数据库）
      const typeNames: Record<PracticeType, string> = {
        pitch_finding: '音高识别',
        scale: '音阶练习',
        chord_exercise: '和弦练习',
        interval: '音程练习',
        chord_progression: '和弦进行'
      }
      
      // 异步保存到服务器，不阻塞UI
      // 使用真实的 score/duration/accuracy，而非硬编码的 100/60/100
      // accuracy 使用 0-100 范围（与导出和验证逻辑一致）
      saveToServer({
        exercise_type: typeNames[type] || detailName,
        score: finalScore,
        duration: finalDuration,
        accuracy: finalAccuracy,
        notes: `练习项目: ${detailName}`
      }).catch(err => console.error('保存到服务器失败:', err))
      
      return newStats
    })
  }, [practiceSessionStartTime, practiceElapsedTime])

  // ==================== 音高识别练习会话统计 ====================
  // 音高识别练习按"会话"统计：从开始练习到结束练习（停止/时间到/切Tab）记为一次。
  // 不再每答对一个音就 +1，避免单次会话被记成几十次。
  const pitchFindingSessionStartRef = useRef<number | null>(null)
  const pitchFindingSessionScoreRef = useRef<{ correct: number; total: number }>({ correct: 0, total: 0 })

  useEffect(() => {
    // 会话开始：进入播放状态且在 practice tab
    if (isPlaying && activeTab === 'practice' && pitchFindingSessionStartRef.current === null) {
      pitchFindingSessionStartRef.current = Date.now()
      pitchFindingSessionScoreRef.current = { correct: 0, total: 0 }
    }

    // 会话进行中：持续记录最新分数（仅当仍在播放且在 practice tab 时更新，
    // 这样在会话结束的同一渲染周期里即使 score 被重置为 0，ref 仍保留最后一题的分数）
    if (isPlaying && activeTab === 'practice' && pitchFindingSessionStartRef.current !== null) {
      pitchFindingSessionScoreRef.current = score
    }

    // 会话结束：播放停止，且之前确实有一个进行中的 pitch_finding 会话
    if (!isPlaying && pitchFindingSessionStartRef.current !== null) {
      const startTime = pitchFindingSessionStartRef.current
      const sessionScore = pitchFindingSessionScoreRef.current
      pitchFindingSessionStartRef.current = null
      // 仅在用户实际有答题时才记录，避免"开始后立即停止"也被计入
      if (sessionScore.total > 0) {
        const accuracy = Math.round((sessionScore.correct / sessionScore.total) * 100)
        const duration = Math.max(1, Math.round((Date.now() - startTime) / 1000))
        recordPractice('pitch_finding', '找音练习', { duration, accuracy })
      }
    }
  }, [isPlaying, activeTab, score, recordPractice])

  // 获取指定时间范围的统计数据
  const getStatsByTimeRange = useCallback((range: StatsTimeRange): { count: number; byType: Record<PracticeType, number>; byDetail: Record<PracticeType, PracticeDetail[]> } => {
    // 使用本地时区的日期范围边界，避免 UTC 偏移导致"今天/本周/本月"判断错误
    // 旧代码使用 new Date().toISOString().split('T')[0] 得到的是 UTC 日期，
    // 在 UTC+8 时区凌晨 0-8 点会返回前一天，导致"今天"显示错误。
    const todayLocal = getLocalDateString(new Date())

    let startDate: Date
    switch (range) {
      case 'today':
        // 今天的本地 0 点
        startDate = getLocalDayStart(todayLocal)
        break
      case 'week':
        // 7 天前的本地 0 点（滑动窗口）
        startDate = getLocalDaysAgoStart(7)
        break
      case 'month':
        // 1 个月前的本地 0 点
        startDate = getLocalMonthsAgoStart(1)
        break
      case 'total':
      default:
        return practiceStats.total
    }

    // daily 中的 date 是 YYYY-MM-DD 格式（本地日期），需要按本地时区解析
    const filtered = practiceStats.daily.filter(d => {
      const parts = d.date.split('-')
      if (parts.length !== 3) return false
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
      return date >= startDate
    })
    
    interface StatsResult {
      count: number
      byType: Record<PracticeType, number>
      byDetail: Record<PracticeType, Array<{ name: string; count: number }>>
    }
    
    const result: StatsResult = {
      count: 0,
      byType: {
        pitch_finding: 0,
        scale: 0,
        chord_exercise: 0,
        interval: 0,
        chord_progression: 0
      },
      byDetail: {
        pitch_finding: [],
        scale: [],
        chord_exercise: [],
        interval: [],
        chord_progression: []
      }
    }
    
    filtered.forEach(day => {
      // 确保 totalCount 是数字
      const count = typeof day.totalCount === 'number' ? day.totalCount : 0
      result.count += count
      
      // 确保 byType 存在
      if (day.byType && typeof day.byType === 'object') {
        (Object.keys(day.byType) as PracticeType[]).forEach(type => {
          const typeCount = typeof day.byType[type] === 'number' ? day.byType[type] : 0
          result.byType[type] += typeCount
        })
      }
      
      // 确保 byDetail 存在
      if (day.byDetail && typeof day.byDetail === 'object') {
        (Object.keys(day.byDetail) as PracticeType[]).forEach(type => {
          const details = day.byDetail[type]
          if (Array.isArray(details)) {
            details.forEach(detail => {
              if (detail && typeof detail === 'object' && typeof detail.count === 'number') {
                const existing = result.byDetail[type].find(d => d.name === detail.name)
                if (existing) {
                  existing.count += detail.count
                } else {
                  result.byDetail[type].push({ name: detail.name, count: detail.count })
                }
              }
            })
          }
        })
      }
    })
    
    return result
  }, [practiceStats])

  // ==================== 浮动窗口拖动功能 ====================
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, target: 'chord' | 'scale' | 'chordExercise') => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    let initialPos = { x: 0, y: 0 }
    if (target === 'chord') initialPos = chordStructurePosition
    else if (target === 'scale') initialPos = scaleStructurePosition
    else if (target === 'chordExercise') initialPos = chordExerciseStructurePosition
    
    dragRef.current = {
      isDragging: true,
      startX: clientX,
      startY: clientY,
      initialX: initialPos.x,
      initialY: initialPos.y,
      target
    }
  }, [chordStructurePosition, scaleStructurePosition, chordExerciseStructurePosition])

  // 使用 requestAnimationFrame 节流状态更新
  const updatePosition = useCallback(() => {
    if (pendingPositionRef.current) {
      const { x, y, target } = pendingPositionRef.current
      if (target === 'chord') setChordStructurePosition({ x, y })
      else if (target === 'scale') setScaleStructurePosition({ x, y })
      else if (target === 'chordExercise') setChordExerciseStructurePosition({ x, y })
      pendingPositionRef.current = null
    }
    rafRef.current = null
  }, [])

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragRef.current.isDragging || !dragRef.current.target) return

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    const deltaX = clientX - dragRef.current.startX
    const deltaY = clientY - dragRef.current.startY

    const newX = dragRef.current.initialX + deltaX
    const newY = dragRef.current.initialY + deltaY

    pendingPositionRef.current = { x: newX, y: newY, target: dragRef.current.target }

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(updatePosition)
    }
  }, [updatePosition])

  const handleDragEnd = useCallback(() => {
    dragRef.current.isDragging = false
    dragRef.current.target = null
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pendingPositionRef.current = null
  }, [])

  // 添加全局拖动事件监听
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e)
    const handleMouseUp = () => handleDragEnd()
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e)
    const handleTouchEnd = () => handleDragEnd()
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleDragMove, handleDragEnd])

  // ==================== 调音器功能 ====================
  // 启动调音器
  const startTuner = useCallback(async () => {
    if (micEnabled) {
      await stopAudioInput()
      setMicEnabled(false)
    }
    if (isTauri) {
      // Tauri环境：使用Rust原生音频
      try {
        const { startAudioCapture, detectPitch: nativeDetectPitch, stopAudioCapture } = await import('@/lib/native-audio')
        
        await startAudioCapture(selectedAudioDevice || undefined)
        setTunerActive(true)
        toast.success(t('tuner_start'))
        
        let isActive = true
        
        const detectLoop = async () => {
          if (!isActive) return
          
          try {
            const result = await nativeDetectPitch()
            
            if (result && result.frequency > 0 && (result.confidence?.overall ?? 0) > confidenceThresholdRef.current) {
              const noteName = frequencyToNoteName(result.frequency)
              const noteResult = frequencyToNote(result.frequency, referenceFrequency)
              
              tunerHistoryRef.current.push({
                frequency: result.frequency,
                note: noteName || "-",
                cents: noteResult.cents
              })
              
              if (tunerHistoryRef.current.length > 5) {
                tunerHistoryRef.current.shift()
              }
              
              if (tunerHistoryRef.current.length >= 3) {
                const weights = [0.1, 0.2, 0.3, 0.4]
                let weightedFreq = 0
                let totalWeight = 0
                
                tunerHistoryRef.current.forEach((item, index) => {
                  const weight = weights[Math.min(index, weights.length - 1)]
                  weightedFreq += item.frequency * weight
                  totalWeight += weight
                })
                
                const smoothedFreq = weightedFreq / totalWeight
                const smoothedNote = frequencyToNoteName(smoothedFreq)
                const smoothedResult = frequencyToNote(smoothedFreq, referenceFrequency)
                
                setDetectedNote(smoothedNote || "-")
                setDetectedFrequency(Math.round(smoothedFreq))
                setCents(smoothedResult.cents)
              } else {
                setDetectedNote(noteName || "-")
                setDetectedFrequency(Math.round(result.frequency))
                setCents(noteResult.cents)
              }
            }
          } catch (e) {
            console.error('Native pitch detection error:', e)
          }
          
          if (isActive) {
            tunerAnimationRef.current = requestAnimationFrame(detectLoop)
          }
        }
        
        tunerAnimationRef.current = requestAnimationFrame(detectLoop)
        
        return () => {
          isActive = false
          stopAudioCapture()
        }
      } catch (err) {
        console.error('Failed to start native tuner:', err)
        toast.error(t('tuner_need_mic'))
      }
    } else {
      // Web环境：使用Web Audio API
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedAudioDevice 
            ? { 
                deviceId: { ideal: selectedAudioDevice },
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
              }
            : {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
              }
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        tunerStreamRef.current = stream

        const audioContext = new (getAudioContextClass())({
          sampleRate: 48000,
          latencyHint: 'interactive'
        })
        tunerAudioContextRef.current = audioContext
        // Tauri WebView2 / autoplay policy 下 AudioContext 可能挂起，需显式 resume
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {})
        }

        const source = audioContext.createMediaStreamSource(stream)
        
        const gainNode = audioContext.createGain()
        gainNode.gain.value = inputGain
        tunerGainNodeRef.current = gainNode
        
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 4096
        tunerAnalyserRef.current = analyser

        source.connect(gainNode)
        gainNode.connect(analyser)

        tunerHistoryRef.current = []
        
        setTunerActive(true)
        toast.success(t('tuner_start'))

        let isActive = true
        
        const detectPitch = () => {
          if (!isActive || !analyser || !audioContext) return

          const buffer = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(buffer)

          const currentAlgorithm = pitchAlgorithmRef.current
          let yinResult: { frequency: number; probability: number } | null = null

          // 使用完整缓冲区（与练习模式一致），低频需要更多周期才能准确检测
          if (currentAlgorithm === 'solo') {
            const soloAnalyser = getSOLOYinAnalyser(buffer.length, audioContext.sampleRate)
            const soloResult = soloAnalyser.analyze(buffer)
            if (soloResult && soloResult.valid) {
              yinResult = {
                frequency: soloResult.frequency,
                probability: soloResult.probability
              }
            }
          } else {
            yinResult = YINPitchDetection(buffer, audioContext.sampleRate, 0.1, 0.1)
          }

          if (!yinResult || !yinResult.frequency) {
            tunerAnimationRef.current = requestAnimationFrame(detectPitch)
            return
          }

          // 动态能量检测 - 低频使用更低阈值（与练习模式一致）
          const rms = calculateRMS(buffer)
          const energyThreshold = yinResult.frequency < 110 ? 0.001 : 0.002
          if (rms < energyThreshold) {
            tunerAnimationRef.current = requestAnimationFrame(detectPitch)
            return
          }

          // 谐波增强处理 - 针对低频（与练习模式一致）
          let detectedFreq = yinResult.frequency
          if (detectedFreq < 110) {
            const possibleFundamental = detectedFreq / 2
            let fundamentalResult: { frequency: number; probability: number } | null = null

            if (currentAlgorithm === 'solo') {
              const soloAnalyser2 = getSOLOYinAnalyser(buffer.length, audioContext.sampleRate)
              const soloResult2 = soloAnalyser2.analyze(buffer)
              if (soloResult2 && soloResult2.valid) {
                fundamentalResult = {
                  frequency: soloResult2.frequency,
                  probability: soloResult2.probability
                }
              }
            } else {
              fundamentalResult = YINPitchDetection(buffer, audioContext.sampleRate, 0.05, 0.05)
            }

            if (fundamentalResult && fundamentalResult.frequency &&
                Math.abs(fundamentalResult.frequency - possibleFundamental) < 5) {
              detectedFreq = possibleFundamental
            }
          }

          if (detectedFreq > 0 && yinResult.probability > confidenceThresholdRef.current) {
            const noteName = frequencyToNoteName(detectedFreq)
            const result = frequencyToNote(detectedFreq, referenceFrequency)

            tunerHistoryRef.current.push({
              frequency: detectedFreq,
              note: noteName || "-",
              cents: result.cents
            })

            if (tunerHistoryRef.current.length > 5) {
              tunerHistoryRef.current.shift()
            }

            if (tunerHistoryRef.current.length >= 3) {
              const weights = [0.1, 0.2, 0.3, 0.4]
              let weightedFreq = 0
              let totalWeight = 0

              tunerHistoryRef.current.forEach((item, index) => {
                const weight = weights[Math.min(index, weights.length - 1)]
                weightedFreq += item.frequency * weight
                totalWeight += weight
              })

              const smoothedFreq = weightedFreq / totalWeight
              const smoothedNote = frequencyToNoteName(smoothedFreq)
              const smoothedResult = frequencyToNote(smoothedFreq, referenceFrequency)

              setDetectedNote(smoothedNote || "-")
              setDetectedFrequency(Math.round(smoothedFreq))
              setCents(smoothedResult.cents)
            } else {
              setDetectedNote(noteName || "-")
              setDetectedFrequency(Math.round(detectedFreq))
              setCents(result.cents)
            }
          }

          tunerAnimationRef.current = requestAnimationFrame(detectPitch)
        }

        tunerAnimationRef.current = requestAnimationFrame(detectPitch)
        
        return () => {
          isActive = false
        }
      } catch (err) {
        console.error('Failed to start tuner:', err)
        toast.error(t('tuner_need_mic'))
      }
    }
  }, [t, referenceFrequency, selectedAudioDevice, inputGain, confidenceThreshold])

  // 停止调音器
  const stopTuner = useCallback(async () => {
    if (tunerAnimationRef.current) {
      cancelAnimationFrame(tunerAnimationRef.current)
      tunerAnimationRef.current = null
    }

    if (isTauri) {
      try {
        const { stopAudioCapture } = await import('@/lib/native-audio')
        await stopAudioCapture()
      } catch (e) {
        console.error('Failed to stop native audio:', e)
      }
    }

    if (tunerStreamRef.current) {
      tunerStreamRef.current.getTracks().forEach(track => track.stop())
      tunerStreamRef.current = null
    }

    if (tunerAudioContextRef.current) {
      tunerAudioContextRef.current.close()
      tunerAudioContextRef.current = null
    }

    tunerAnalyserRef.current = null
    tunerGainNodeRef.current = null
    setTunerActive(false)
    setDetectedNote("-")
    setDetectedFrequency(0)
    setCents(0)
    toast.success(t('tuner_stop'))
  }, [t])

  // 切换调音器状态
  const toggleTuner = useCallback(() => {
    if (tunerActive) {
      stopTuner()
    } else {
      startTuner()
    }
  }, [tunerActive, startTuner, stopTuner])

  // 关闭调音器面板时停止调音
  useEffect(() => {
    if (!tunerOpen && tunerActive) {
      stopTuner()
    }
  }, [tunerOpen, tunerActive, stopTuner])

  const saveSettings = useCallback(() => {
    toast.success(t('save_success'))
  }, [t])

  const resetSettings = useCallback(() => {
    store.resetSettings()
    toast.success(t('reset_settings_hint'))
  }, [store, t])

  // 导出设置
  const exportSettings = useCallback(() => {
    const settings = {
      language,
      chordScaleDisplay,
      noteAccidentalDisplay,
      practiceTime,
      fretCount,
      metronomeBpm,
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
  }, [language, chordScaleDisplay, noteAccidentalDisplay, practiceTime, fretCount, metronomeBpm, inputGain, cooldownEnabled, cooldownDuration, confidenceThreshold, sensitivity, customChords, t])

  // 导入设置
  const importSettings = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string)
        setLanguage(settings.language || 'zh-CN')
        setChordScaleDisplay(settings.chordScaleDisplay || (settings.language === 'en' ? 'english' : 'chinese'))
        setNoteAccidentalDisplay(settings.noteAccidentalDisplay || 'sharp')
        setTheme(settings.theme || 'dark')
        setPracticeTime(settings.practiceTime || 60)
        setFretCount(settings.fretCount || 15)
        setMetronomeBpm(settings.metronomeBpm || 80)
        setInputGain(settings.inputGain || 1)
        setCooldownEnabled(settings.cooldownEnabled || false)
        setCooldownDuration(settings.cooldownDuration || 1000)
        setConfidenceThreshold(settings.confidenceThreshold || 0.8)
        setSensitivity(settings.sensitivity || 0.5)
        if (settings.customChords) setCustomChords(settings.customChords)
        toast.success(t('import_success'))
      } catch (e) {
        toast.error(t('error_occurred'))
      }
    }
    reader.readAsText(file)
  }, [t])

  const playFeedbackSound = useCallback((isCorrect: boolean) => {
    if (!feedbackSoundSettings.enabled) return
    if (isCorrect && !feedbackSoundSettings.correctSound) return
    if (!isCorrect && !feedbackSoundSettings.wrongSound) return
    
    try {
      // 复用共享 AudioContext，避免每次调用都创建新实例导致配额耗尽
      // （Chromium 限制约 6 个 AudioContext，超过后新创建会抛异常导致反馈音静默失效）
      const AudioCtx = getAudioContextClass()
      if (!feedbackAudioCtxRef.current || feedbackAudioCtxRef.current.state === 'closed') {
        feedbackAudioCtxRef.current = new AudioCtx()
      }
      const ctx = feedbackAudioCtxRef.current
      // Tauri WebView2 / autoplay policy 下 AudioContext 可能处于挂起状态，需显式 resume
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      
      if (isCorrect) {
        oscillator.frequency.value = 880
        oscillator.type = "sine"
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.15)
      } else {
        oscillator.frequency.value = 220
        oscillator.type = "sawtooth"
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.2)
      }
    } catch (e) {
      logger.debug('播放反馈音失败', e)
    }
  }, [feedbackSoundSettings])

  // 计时器效果
  useEffect(() => {
    if (isPlaying && practiceTime > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsPlaying(false)
            const elapsed = practiceTime - (timeLeft - 1)
            setPracticeSummaryData({
              correct: scoreRef.current.correct,
              total: scoreRef.current.total,
              duration: elapsed,
            })
            setShowPracticeSummary(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, practiceTime])

  const metronomeAudioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    return () => {
      if (metronomeAudioCtxRef.current) {
        metronomeAudioCtxRef.current.close()
        metronomeAudioCtxRef.current = null
      }
    }
  }, [])

  // 节拍器效果
  useEffect(() => {
    if (metronomeEnabled && isPlaying) {
      const interval = 60000 / metronomeBpm
      metronomeRef.current = setInterval(() => {
        if (metronomeSound) {
          try {
            if (!metronomeAudioCtxRef.current || metronomeAudioCtxRef.current.state === 'closed') {
              const AudioCtx = getAudioContextClass()
              metronomeAudioCtxRef.current = new AudioCtx()
            }
            const ctx = metronomeAudioCtxRef.current
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {})
            }
            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()
            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)
            oscillator.frequency.value = 800
            oscillator.type = "sine"
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
            oscillator.start(ctx.currentTime)
            oscillator.stop(ctx.currentTime + 0.1)
          } catch (e) {
            console.error('Metronome audio error:', e)
          }
        }
        if (metronomeFlash) {
          const flashLayer = document.getElementById('metronome-flash-layer')
          if (flashLayer) {
            flashLayer.style.opacity = '1'
            setTimeout(() => {
              if (flashLayer) flashLayer.style.opacity = '0'
            }, 100)
          }
        }
      }, interval)
    } else {
      // 仅在节拍器关闭或停止练习时关闭 AudioContext，BPM 变化时不会触发此分支
      if (metronomeAudioCtxRef.current) {
        metronomeAudioCtxRef.current.close().catch(() => {})
        metronomeAudioCtxRef.current = null
      }
    }
    return () => {
      if (metronomeRef.current) clearInterval(metronomeRef.current)
    }
  }, [metronomeEnabled, isPlaying, metronomeBpm, metronomeSound, metronomeFlash])

  // 音程练习指板自动推进效果
  useEffect(() => {
    if (activeTab === "interval" && isPlaying && showIntervalFretboard && intervalAutoAdvance && currentIntervalExercise) {
      // 设置指板显示倒计时
      setIntervalTimeLeft(intervalFretboardDuration)
      
      const countdownInterval = setInterval(() => {
        setIntervalTimeLeft(prev => {
          if (prev <= 1) {
            // 时间到，自动进入下一题
            clearInterval(countdownInterval)
            generateIntervalExerciseRef.current?.()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      return () => {
        clearInterval(countdownInterval)
      }
    }
  }, [activeTab, isPlaying, showIntervalFretboard, intervalAutoAdvance, intervalFretboardDuration, currentIntervalExercise])

  // 获取音频设备
  const audioDevicesRef = useRef(audioDevices)
  const selectedAudioDeviceRef = useRef(selectedAudioDevice)
  audioDevicesRef.current = audioDevices
  selectedAudioDeviceRef.current = selectedAudioDevice

  const enumerateAudioDevices = useCallback(async (showNotification = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId)
      logger.debug('枚举到的音频输入设备:', audioInputs.length, audioInputs.map(d => d.label || '未命名设备'))
      const currentDeviceIds = audioDevicesRef.current.map(d => d.deviceId).sort().join(',')
      const newDeviceIds = audioInputs.map(d => d.deviceId).sort().join(',')
      const hasChanged = currentDeviceIds !== newDeviceIds
      
      if (hasChanged || audioDevicesRef.current.length === 0) {
        setAudioDevices(audioInputs)
        
        if (audioInputs.length > 0) {
          const currentDeviceExists = audioInputs.some(d => d.deviceId === selectedAudioDeviceRef.current)
          if (!selectedAudioDeviceRef.current || !currentDeviceExists) {
            setSelectedAudioDevice(audioInputs[0].deviceId)
            logger.debug('自动选择设备:', audioInputs[0].label || audioInputs[0].deviceId)
          }
        }
        
        if (showNotification && hasChanged) {
          const addedCount = audioInputs.filter(d => !audioDevicesRef.current.some(old => old.deviceId === d.deviceId)).length
          const removedCount = audioDevicesRef.current.filter(d => !audioInputs.some(new_ => new_.deviceId === d.deviceId)).length
          
          if (addedCount > 0) {
            logger.debug(`🔌 检测到 ${addedCount} 个新音频设备`)
          }
          if (removedCount > 0) {
            logger.debug(`🔌 移除了 ${removedCount} 个音频设备`)
          }
        }
      }
    } catch (err) {
      console.error('枚举设备失败:', err)
    }
  }, [])

  // 初始加载和监听设备变化（仅限 Web 版本）
  useEffect(() => {
    if (isTauri) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return

    // 请求权限并枚举设备
    const requestPermissionAndGetDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
        await enumerateAudioDevices(false)
      } catch (err) {
        console.error('无法获取音频权限:', err)
        // 即使没有权限，也尝试枚举设备
        await enumerateAudioDevices(false)
      }
    }
    
    // 初始加载时请求权限
    requestPermissionAndGetDevices()
    
    // 监听设备变化（插入/拔出USB音频设备）
    const handleDeviceChange = (() => {
      let debounceTimer: NodeJS.Timeout | null = null
      return async () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          await enumerateAudioDevices(true)
        }, 500)
      }
    })()
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  }, [])

  // 当设置面板打开时，刷新设备列表
  useEffect(() => {
    if (isTauri) return
    if (settingsOpen && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      enumerateAudioDevices(false)
    }
  }, [settingsOpen, enumerateAudioDevices])

  // 初始化MIDI - 当开启开关时才申请权限
  useEffect(() => {
    if (!midiEnabled) return
    
    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      navigator.requestMIDIAccess().then(access => {
        setMidiAccess(access)
        const inputs = Array.from(access.inputs.values()).filter(d => d.id)
        setMidiDevices(inputs)
        
        access.onstatechange = () => {
          const updatedInputs = Array.from(access.inputs.values()).filter(d => d.id)
          setMidiDevices(updatedInputs)
        }
      }).catch(err => {
        console.error('MIDI access denied:', err)
        toast.error(t('midi_device_none'))
        setMidiEnabled(false)
      })
    } else {
      toast.error(t('midi_device_none'))
      setMidiEnabled(false)
    }
  }, [midiEnabled, t])

  // MIDI消息处理
  useEffect(() => {
    if (!midiEnabled || !midiAccess) return
    
    const handleMIDIMessage = (event: WebMidi.MIDIMessageEvent) => {
      const [command, note, velocity] = event.data
      
      if (command === 144 && velocity > 0) {
        // Note on
        const noteName = NOTES[note % 12]
        setDetectedPitch(noteName)
        
        // 处理MIDI输入 - 使用ref避免循环依赖
        if (handleMIDINoteInputRef.current) {
          handleMIDINoteInputRef.current(noteName)
        }
      }
    }
    
    midiDevices.forEach(device => {
      if (selectedMidiDevice === 'random' || device.id === selectedMidiDevice) {
        device.onmidimessage = handleMIDIMessage
      }
    })
    
    return () => {
      midiDevices.forEach(device => {
        device.onmidimessage = null
      })
    }
  }, [midiEnabled, midiAccess, midiDevices, selectedMidiDevice])

  // 音频输入处理
  const startAudioInput = useCallback(async () => {
    if (tunerActive) {
      stopTuner()
    }
    if (audioContext) {
      return
    }
    logger.debug('startAudioInput: 开始初始化音频...')
    setAudioInitializing(true)
    setAudioError(null)
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const errorMsg = language === 'zh-CN' 
          ? isHttps 
            ? '浏览器不支持音频输入，请更换浏览器（Chrome/Firefox/Edge）'
            : '音频输入需要 HTTPS 安全连接。请使用 HTTPS 地址访问，或下载桌面版应用'
          : isHttps 
            ? 'Browser does not support audio input. Please try Chrome/Firefox/Edge'
            : 'Audio input requires HTTPS. Please use HTTPS URL or download the desktop app'
        toast.error(errorMsg)
        setAudioError(errorMsg)
        throw new Error(errorMsg)
      }

      try {
        const { needsUserInteractionForAudio, handleIOSAudioUnlock } = await import('@/lib/ios-compat')
        if (needsUserInteractionForAudio()) {
          await handleIOSAudioUnlock()
        }
      } catch (e) {
        // iOS compat not available, continue
      }
      // 音频约束 - 与原HTML文件一致
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedAudioDevice ? { ideal: selectedAudioDevice } : undefined,
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // @ts-ignore - latency 属性在某些浏览器类型定义中不存在
          latency: 0.01
        }
      }
      let stream: MediaStream
      logger.debug('startAudioInput: 正在调用 getUserMedia...')
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        logger.debug('startAudioInput: getUserMedia 成功')
      } catch (permissionErr: unknown) {
        console.error('startAudioInput: getUserMedia 失败:', permissionErr)
        const err = permissionErr as { name?: string; message?: string }
        let errorMsg = ''
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = language === 'zh-CN'
            ? '麦克风权限被拒绝。请在浏览器设置中允许访问麦克风，然后刷新页面重试。'
            : 'Microphone permission denied. Please allow microphone access in browser settings and refresh the page.'
        } else if (err.name === 'NotFoundError') {
          errorMsg = language === 'zh-CN'
            ? '未找到麦克风设备。请检查麦克风是否已连接。'
            : 'No microphone found. Please check if your microphone is connected.'
        } else if (err.name === 'NotReadableError') {
          errorMsg = language === 'zh-CN'
            ? '麦克风被其他应用程序占用。请关闭其他使用麦克风的应用后重试。'
            : 'Microphone is being used by another application. Please close other apps using the microphone and try again.'
        } else {
          errorMsg = language === 'zh-CN'
            ? `无法访问麦克风: ${err.message || '未知错误'}`
            : `Cannot access microphone: ${err.message || 'Unknown error'}`
        }
        toast.error(errorMsg)
        setAudioError(errorMsg)
        throw permissionErr
      }
      mediaStreamRef.current = stream
      
      // 创建 AudioContext - 与原HTML文件一致，固定48000采样率
      const ctx = new (getAudioContextClass())({
        sampleRate: 48000,
        latencyHint: 'interactive'
      })
      const source = ctx.createMediaStreamSource(stream)
      
      const gainNode = ctx.createGain()
      gainNode.gain.value = inputGain
      gainNodeRef.current = gainNode
      
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      
      // 尝试使用 AudioWorklet，如果不支持则回退到 ScriptProcessorNode
      let useWorklet = useAudioWorklet && !!ctx.audioWorklet
      logger.debug('startAudioInput: 检查 AudioWorklet 支持...', 'useAudioWorklet:', useAudioWorklet, 'ctx.audioWorklet:', !!ctx.audioWorklet)
      if (useAudioWorklet && ctx.audioWorklet) {
        try {
          // 加载 AudioWorklet 处理器
          logger.debug('startAudioInput: 正在加载 AudioWorklet 模块...')
          const workletPath = getAudioWorkletModulePath()
          await ctx.audioWorklet.addModule(workletPath)
          logger.debug('startAudioInput: AudioWorklet 模块加载成功, path:', workletPath)
          
          // 创建 AudioWorkletNode
          const workletNode = new AudioWorkletNode(ctx, 'pitch-detection-processor', {
            processorOptions: {
              sampleRate: ctx.sampleRate,
              bufferSize: 2048,
              hopSize: 512
            }
          })
          audioWorkletNodeRef.current = workletNode
          
          // 设置消息处理 - 使用 ref 确保始终调用最新的回调
          workletNode.port.onmessage = (event) => {
            if (handleAudioWorkletMessageRef.current) {
              handleAudioWorkletMessageRef.current(event.data)
            }
          }
          
          // 连接音频节点（不连接到扬声器，避免音频反馈）
          source.connect(gainNode)
          gainNode.connect(analyser)
          analyser.connect(workletNode)
          
          useWorklet = true
          logger.debug('AudioWorklet 初始化成功')
        } catch (workletError) {
          console.warn('AudioWorklet 初始化失败，回退到 ScriptProcessorNode:', workletError)
          setUseAudioWorklet(false)
        }
      }
      
      // 如果不使用 AudioWorklet，使用 ScriptProcessorNode
      if (!useWorklet) {
        // 性能优化：增大缓冲区减少回调频率（从4096增加到8192）
        const scriptProcessor = ctx.createScriptProcessor(8192, 1, 1)
        scriptProcessorRef.current = scriptProcessor
        
        source.connect(gainNode)
        gainNode.connect(analyser)
        analyser.connect(scriptProcessor)
        // ScriptProcessorNode 需要连接到 destination 才能触发 onaudioprocess
        // 但我们创建一个静音的 gain 节点来避免声音输出
        const silentGain = ctx.createGain()
        silentGain.gain.value = 0
        scriptProcessor.connect(silentGain)
        silentGain.connect(ctx.destination)
        
        startPitchDetectionWithNodes(analyser, ctx, scriptProcessor)
      }
      
      setAudioContext(ctx)
      setAnalyserNode(analyser)
      setAudioError(null)
      
      const modeText = useWorklet ? 'AudioWorklet' : 'ScriptProcessorNode'
      logger.debug(`%c[音频模式] 当前使用: ${modeText}`, 'color: #00ff00; font-size: 14px; font-weight: bold;')
      logger.debug(`[音频模式] useWorklet: ${useWorklet}, useAudioWorklet状态 ${useAudioWorklet}`)
      
      toast.success(language === 'zh-CN' ? 
        (useWorklet ? '音频输入已启用(AudioWorklet)' : '音频输入已启用(ScriptProcessor)') : 
        (useWorklet ? 'Audio input started (AudioWorklet)' : 'Audio input started (ScriptProcessor)'))
    } catch (err) {
      console.error('Failed to start audio input:', err)
      setMicEnabled(false)
      throw err
    } finally {
      setAudioInitializing(false)
    }
  }, [selectedAudioDevice, inputGain, language, useAudioWorklet])

  // 触发正确答案反馈
  const triggerCorrectFeedback = useCallback((note: string) => {
    setCorrectFeedbackNote(note)
    setShowCorrectFeedback(true)
    
    setTimeout(() => {
      setShowCorrectFeedback(false)
      setCorrectFeedbackNote(null)
    }, 500)
  }, [])

  const triggerWrongFeedback = useCallback((note: string) => {
    setWrongFeedbackNote(note)
    setShowWrongFeedback(true)

    setTimeout(() => {
      setShowWrongFeedback(false)
      setWrongFeedbackNote(null)
    }, 600)
  }, [])

  // 音高匹配处理（供 AudioWorklet 或 ScriptProcessorNode 共用）
  const processPitchMatch = useCallback((frequency: number, detectedNote: string, probability: number) => {
    const currentActiveTab = activeTabRef.current
    const currentSensitivity = sensitivityRef.current || 0.5
    const currentConfidenceThreshold = confidenceThresholdRef.current || 0.8
    
    if (currentActiveTab === 'practice') {
      // 找音练习 - 辨音模式下通过按钮答题，不自动匹配
      if (practiceAnswerModeRef.current === 'buttons') return
      if (isCoolingDownRef.current) return
      const currentTargetNote = targetNoteRef.current
      if (!currentTargetNote) return
      
      const targetSemitone = noteToSemitones[currentTargetNote] || 0
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
      
      const adjustedCents = getAdjustedCents(frequency, targetFrequency)
      
      const baseThreshold = frequency < 110 ? 35 : 25
      const matchThreshold = baseThreshold * (2 - currentSensitivity)
      
      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('找音练习匹配成功:', detectedNote, '音分差:', adjustedCents.toFixed(1))
        isCoolingDownRef.current = true
        triggerCorrectFeedback(detectedNote)
        setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        if (generateNewTargetRef.current) {
          generateNewTargetRef.current()
        }
        cooldownRef.current = setTimeout(() => {
          isCoolingDownRef.current = false
          cooldownRef.current = null
        }, 800)
      }
    } else if (currentActiveTab === 'interval') {
      // 音程练习
      const exercise = currentIntervalExerciseRef.current
      if (!exercise || exercise.answered) return
      
      const rootNoteValue = exercise.rootNote
      
      // 使用 currentIntervalDisplay（先找根音模式包含 '1'）以与点击/MIDI 路径一致
      const intervals = exercise.currentIntervalDisplay.split(' ')
      let matchedIndex: number | null = null
      let minCents = Infinity

      for (let idx = 0; idx < intervals.length; idx++) {
        const interval = intervals[idx]
        // 跳过已经完成的音级（按索引）
        if (exercise.completedIntervals.includes(idx)) continue
        // 先找根音模式：根音未完成时只接受根音
        const rootCompleted = intervals.some((intv, i) => intv === '1' && exercise.completedIntervals.includes(i))
        if (findRootFirstRef.current && !rootCompleted && interval !== '1') continue
        
        const intervalSemitone = intervalToSemitones[interval]
        if (intervalSemitone === undefined) continue
        
        const rootValue = noteToSemitones[rootNoteValue] || 0
        const targetSemitone = (rootValue + intervalSemitone) % 12
        const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
        
        const adjustedCents = getAdjustedCents(frequency, targetFrequency)
        
        const baseThreshold = frequency < 110 ? 35 : interval === '1' ? 25 : 15
        const matchThreshold = baseThreshold * (2 - currentSensitivity)
        
        if (adjustedCents <= matchThreshold && adjustedCents < minCents && probability > currentConfidenceThreshold) {
          minCents = adjustedCents
          matchedIndex = idx
        }
      }
      
      if (matchedIndex !== null) {
        const matchedInterval = intervals[matchedIndex]
        logger.debug('音程练习匹配成功:', matchedInterval, '音分差:', minCents.toFixed(1))
        triggerCorrectFeedback(detectedNote)
        const newCompletedIntervals = [...exercise.completedIntervals, matchedIndex]
        
        if (newCompletedIntervals.length >= intervals.length) {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals, answered: true })
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (addRootBackRef.current && matchedInterval !== '1') {
            setIntervalPracticeStep('root')
          } else if (generateIntervalExerciseRef.current) {
            generateIntervalExerciseRef.current()
          }
        } else {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals })
          if (findRootFirstRef.current && matchedInterval === '1') {
            setIntervalPracticeStep('interval')
          } else if (addRootBackRef.current && matchedInterval !== '1') {
            setIntervalPracticeStep('root')
          }
        }
      }
    } else if (currentActiveTab === 'scale') {
      // 音阶练习
      const sequence = scaleExerciseSequenceRef.current
      const step = scaleExerciseCurrentStepRef.current
      const key = scaleKeyRef.current
      
      if (sequence.length === 0 || step >= sequence.length) return
      
      const currentDegree = sequence[step]
      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return
      
      const keyValue = noteToSemitones[key] || 0
      const targetSemitone = (keyValue + semitone) % 12
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
      
      const adjustedCents = getAdjustedCents(frequency, targetFrequency)
      
      const baseThreshold = frequency < 110 ? 35 : currentDegree === '1' ? 25 : 15
      const matchThreshold = baseThreshold * (2 - currentSensitivity)
      
      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('音阶练习匹配成功:', detectedNote, '度数:', currentDegree, '音分差:', adjustedCents.toFixed(1))
        triggerCorrectFeedback(detectedNote)
        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextScaleExerciseRef.current) {
            nextScaleExerciseRef.current()
          }
        } else {
          setScaleExerciseCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
      }
    } else if (currentActiveTab === 'chord_exercise') {
      // 和弦练习
      const targetChord = chordExerciseTargetChordRef.current
      const sequence = chordExerciseSequenceRef.current
      const step = chordExerciseCurrentStepRef.current
      
      if (!targetChord || sequence.length === 0 || step >= sequence.length) return
      if (chordExerciseIsAnsweredRef.current) return
      
      const currentDegree = sequence[step]
      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return
      
      const rootValue = noteToSemitones[targetChord.root] || 0
      const targetSemitone = (rootValue + semitone) % 12
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
      
      const adjustedCents = getAdjustedCents(frequency, targetFrequency)
      
      const baseThreshold = frequency < 110 ? 35 : currentDegree === '1' ? 25 : 15
      const matchThreshold = baseThreshold * (2 - currentSensitivity)
      
      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('和弦练习音高匹配成功:', detectedNote, '音分差:', adjustedCents.toFixed(1))
        triggerCorrectFeedback(detectedNote)
        
        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          setChordExerciseIsAnswered(true)
          chordExerciseIsAnsweredRef.current = true
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextChordExerciseRef.current) {
            nextChordExerciseRef.current()
          }
        } else {
          setChordExerciseCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
      }
    } else if (currentActiveTab === 'chord') {
      // 和弦转换练习
      const chords = getTransposedChordsRef.current ? getTransposedChordsRef.current() : []
      const currentChord = chords[currentChordIndexRef.current]
      if (!currentChord) return
      
      // 获取和弦音级，如果开启 voice leading 则应用
      let degrees = getChordDegrees(currentChord.type, practiceLevelRef.current, levelOptionsRef.current)
      if (shouldVoiceLeadRef.current && lastChordNoteRef.current) {
        degrees = applyVoiceLeading(degrees, currentChord.root, lastChordNoteRef.current)
      }
      
      const currentStep = chordDegreeCurrentStepRef.current
      if (currentStep >= degrees.length) return
      
      const currentDegree = degrees[currentStep]
      if (!currentDegree) return
      
      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return
      
      const rootValue = noteToSemitones[currentChord.root] || 0
      const targetSemitone = (rootValue + semitone) % 12
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
      
      const adjustedCents = getAdjustedCents(frequency, targetFrequency)
      
      const baseThreshold = frequency < 110 ? 35 : currentDegree === '1' ? 25 : 15
      const matchThreshold = baseThreshold * (2 - currentSensitivity)
      
      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('和弦转换练习匹配成功:', detectedNote, '度数:', currentDegree, '音分差:', adjustedCents.toFixed(1))
        triggerCorrectFeedback(detectedNote)
        const nextStep = currentStep + 1
        if (nextStep >= degrees.length) {
          // 完成当前和弦，记录最后一个音用于 voice leading
          lastChordNoteRef.current = detectedNote
          setLastChordNote(detectedNote)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextChordInfoRef.current && nextChordRef.current) {
            nextChordRef.current()
          }
        } else {
          setChordDegreeCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
      }
    }
  }, [getTransposedChordsRef, practiceLevelRef, findRootFirstRef, targetNoteRef, scaleKeyRef, scaleExerciseSequenceRef, scaleExerciseCurrentStepRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, currentIntervalExerciseRef, currentChordIndexRef, chordDegreeCurrentStepRef, nextChordRef, nextChordInfoRef, nextScaleExerciseRef, nextChordExerciseRef, generateNewTargetRef, generateIntervalExerciseRef, setCurrentIntervalExercise, setScaleExerciseCurrentStep, setChordExerciseIsAnswered, setChordExerciseCurrentStep, setChordDegreeCurrentStep, setScore, setIntervalPracticeStep, triggerCorrectFeedback])

  // 处理 AudioWorklet 消息
  const handleAudioWorkletMessage = useCallback((message: { type: string; data: unknown }) => {
    const { type, data } = message
    
    if (type === 'pitchDetected') {
      const pitchData = data as { 
        frequency: number | null
        probability: number
        clarity: number
        energy: number
        hasSignal: boolean
      }
      
      // 更新调试信息
      setPitchDebugInfo(prev => ({
        ...prev,
        rms: pitchData.energy,
        frequency: pitchData.frequency,
        probability: pitchData.probability,
        isRunning: true
      }))
      
      // 处理音高检测结果 - 使用与 ScriptProcessorNode 相同的逻辑
      if (pitchData.frequency && pitchData.hasSignal && pitchData.probability > (confidenceThresholdRef.current || 0.8)) {
        const detectedNote = frequencyToNoteName(pitchData.frequency)
        if (detectedNote) {
          setDetectedPitch(detectedNote)
          
          // 如果正在练习，处理匹配逻辑
          if (isPlayingRef.current && !isCoolingDownRef.current) {
            processPitchMatch(pitchData.frequency, detectedNote, pitchData.probability)
          }
        }
      }
    } else if (type === 'debug') {
      logger.debug('AudioWorklet Debug:', data)
    }
  }, [processPitchMatch])

  // 更新 AudioWorklet 消息处理函数的 ref
  useEffect(() => {
    handleAudioWorkletMessageRef.current = handleAudioWorkletMessage
  }, [handleAudioWorkletMessage])

  const stopAudioInput = useCallback(() => {
    // 停止 AudioWorkletNode
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.port.onmessage = null
      audioWorkletNodeRef.current.disconnect()
      audioWorkletNodeRef.current = null
    }
    
    // 停止 ScriptProcessorNode
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    // 停止增益节点
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
      gainNodeRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
      setAudioContext(null)
    }
    if (pitchDetectionRef.current) {
      cancelAnimationFrame(pitchDetectionRef.current)
      pitchDetectionRef.current = null
    }
    // 清理冷却期
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current)
      cooldownRef.current = null
    }
    isCoolingDownRef.current = false
    setAnalyserNode(null)
    setMicEnabled(false)
    setDetectedPitch(null)
    setDetectedCents(null)
    setPitchDebugInfo(prev => ({ ...prev, isRunning: false }))
  }, [audioContext])

  // 当 micEnabled 为 true 时自动启动音频输入（仅限 Web 版本）
  useEffect(() => {
    if (isTauri) return
    if (micEnabled && !audioContext) {
      logger.debug('useEffect: 开始启动音频输入...')
      toast.info(language === 'zh-CN' ? '正在请求麦克风权限...' : 'Requesting microphone permission...')
      startAudioInput().catch(err => {
        console.error('自动启动音频输入失败:', err)
        setMicEnabled(false)
      })
    }
  }, [micEnabled, audioContext, startAudioInput, language])

  // 练习模式音高匹配逻辑（从 runPitchDetection 抽取，供 Web 和 Tauri 两条路径共用）
  const processPracticeMatch = useCallback((detectedFreq: number, probability: number, detectedNote: string) => {
    const currentIsPlaying = isPlayingRef.current
    const currentActiveTab = activeTabRef.current
    const currentSensitivity = sensitivityRef.current
    const currentConfidenceThreshold = confidenceThresholdRef.current

    if (!currentIsPlaying || !detectedNote) return
    if (isCoolingDownRef.current) return

    // 根据练习模式处理 - 完全按照原HTML的processAudio逻辑
    if (currentActiveTab === 'practice') {
      // 找音练习 - 使用音分差匹配
      const currentTargetNote = targetNoteRef.current
      if (!currentTargetNote) return

      const targetSemitone = noteToSemitones[currentTargetNote] || 0
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)

      const adjustedCents = getAdjustedCents(detectedFreq, targetFrequency)

      const baseThreshold = detectedFreq < 110 ? 35 : 25
      const matchThreshold = baseThreshold * (2 - currentSensitivity)

      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('找音练习匹配成功:', detectedNote, '音分差:', adjustedCents.toFixed(1))
        setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        if (generateNewTargetRef.current) {
          generateNewTargetRef.current()
        }
      }
    } else if (currentActiveTab === 'interval') {
      // 音程练习 - 使用音分差匹配
      const exercise = currentIntervalExerciseRef.current
      if (!exercise || exercise.answered) return

      const rootNoteValue = exercise.rootNote

      // 使用 currentIntervalDisplay（先找根音模式包含 '1'）以与点击/MIDI 路径一致
      const intervals = exercise.currentIntervalDisplay.split(' ')
      let matchedIndex: number | null = null
      let minCents = Infinity

      for (let idx = 0; idx < intervals.length; idx++) {
        const interval = intervals[idx]
        // 跳过已经完成的音级（按索引）
        if (exercise.completedIntervals.includes(idx)) continue
        // 先找根音模式：根音未完成时只接受根音
        const rootCompleted = intervals.some((intv, i) => intv === '1' && exercise.completedIntervals.includes(i))
        if (findRootFirstRef.current && !rootCompleted && interval !== '1') continue

        const intervalSemitone = intervalToSemitones[interval]
        if (intervalSemitone === undefined) continue

        const rootValue = noteToSemitones[rootNoteValue] || 0
        const targetSemitone = (rootValue + intervalSemitone) % 12
        const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)

        const adjustedCents = getAdjustedCents(detectedFreq, targetFrequency)

        const baseThreshold = detectedFreq < 110 ? 35 : interval === '1' ? 25 : 15
        const matchThreshold = baseThreshold * (2 - currentSensitivity)

        if (adjustedCents <= matchThreshold && adjustedCents < minCents && probability > currentConfidenceThreshold) {
          minCents = adjustedCents
          matchedIndex = idx
        }
      }

      if (matchedIndex !== null) {
        const matchedInterval = intervals[matchedIndex]
        logger.debug('音程练习匹配成功:', matchedInterval, '音分差:', minCents.toFixed(1))
        const newCompletedIntervals = [...exercise.completedIntervals, matchedIndex]

        if (newCompletedIntervals.length >= intervals.length) {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals, answered: true })
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (addRootBackRef.current && matchedInterval !== '1') {
            setIntervalPracticeStep('root')
          } else if (generateIntervalExerciseRef.current) {
            generateIntervalExerciseRef.current()
          }
        } else {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals })
          if (findRootFirstRef.current && matchedInterval === '1') {
            setIntervalPracticeStep('interval')
          } else if (addRootBackRef.current && matchedInterval !== '1') {
            setIntervalPracticeStep('root')
          }
        }
      }
    } else if (currentActiveTab === 'scale') {
      // 音阶练习 - 使用音分差匹配
      const sequence = scaleExerciseSequenceRef.current
      const step = scaleExerciseCurrentStepRef.current
      const key = scaleKeyRef.current

      if (sequence.length === 0 || step >= sequence.length) return

      const currentDegree = sequence[step]
      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return

      const keyValue = noteToSemitones[key] || 0
      const targetSemitone = (keyValue + semitone) % 12
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)

      const adjustedCents = getAdjustedCents(detectedFreq, targetFrequency)

      const baseThreshold = detectedFreq < 110 ? 35 : currentDegree === '1' ? 25 : 15
      const matchThreshold = baseThreshold * (2 - currentSensitivity)

      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('音阶练习匹配成功:', detectedNote, '度数:', currentDegree, '音分差:', adjustedCents.toFixed(1))
        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextScaleExerciseRef.current) {
            nextScaleExerciseRef.current()
          }
        } else {
          setScaleExerciseCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
      }
    } else if (currentActiveTab === 'chord_exercise') {
      // 和弦练习 - 使用音分差匹配
      const targetChord = chordExerciseTargetChordRef.current
      const sequence = chordExerciseSequenceRef.current
      const step = chordExerciseCurrentStepRef.current

      if (!targetChord || sequence.length === 0 || step >= sequence.length) return
      if (chordExerciseIsAnsweredRef.current) return

      const currentDegree = sequence[step]
      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return

      const rootValue = noteToSemitones[targetChord.root] || 0
      const targetSemitone = (rootValue + semitone) % 12
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)

      const adjustedCents = getAdjustedCents(detectedFreq, targetFrequency)

      const baseThreshold = detectedFreq < 110 ? 35 : currentDegree === '1' ? 25 : 15
      const matchThreshold = baseThreshold * (2 - currentSensitivity)

      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('和弦练习音高匹配成功:', detectedNote, '音分差:', adjustedCents.toFixed(1), '阈值:', matchThreshold.toFixed(1))

        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          // 完成整个和弦，设置 answered 状态
          setChordExerciseIsAnswered(true)
          chordExerciseIsAnsweredRef.current = true
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextChordExerciseRef.current) {
            nextChordExerciseRef.current()
          }
        } else {
          // 继续下一个音，不设置 answered 状态
          setChordExerciseCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
      }
    } else if (currentActiveTab === 'chord') {
      // 和弦转换练习 - 使用音分差匹配
      const chords = getTransposedChordsRef.current ? getTransposedChordsRef.current() : []
      const currentChord = chords[currentChordIndexRef.current]
      if (!currentChord) return

      const degrees = getChordDegrees(currentChord.type, practiceLevelRef.current, levelOptionsRef.current)
      const currentStep = chordDegreeCurrentStepRef.current
      if (currentStep >= degrees.length) return

      const currentDegree = degrees[currentStep]
      if (!currentDegree) return

      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return

      const rootValue = noteToSemitones[currentChord.root] || 0
      const targetSemitone = (rootValue + semitone) % 12
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)

      const adjustedCents = getAdjustedCents(detectedFreq, targetFrequency)

      const baseThreshold = detectedFreq < 110 ? 35 : currentDegree === '1' ? 25 : 15
      const matchThreshold = baseThreshold * (2 - currentSensitivity)

      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('和弦转换练习匹配成功:', detectedNote, '度数:', currentDegree, '音分差:', adjustedCents.toFixed(1))
        const nextStep = currentStep + 1
        if (nextStep >= degrees.length) {
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextChordInfoRef.current && nextChordRef.current) {
            nextChordRef.current()
          }
        } else {
          setChordDegreeCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
      }
    } else if (currentActiveTab === 'tuner') {
      // 调音表模式 - 只显示音高，不需要答题逻辑
    }
  }, [getTransposedChordsRef, practiceLevelRef, findRootFirstRef, targetNoteRef, scaleKeyRef, scaleExerciseSequenceRef, scaleExerciseCurrentStepRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, currentIntervalExerciseRef, currentChordIndexRef, chordDegreeCurrentStepRef, nextChordRef, nextChordInfoRef, nextScaleExerciseRef, nextChordExerciseRef, generateNewTargetRef, generateIntervalExerciseRef, isPlayingRef, activeTabRef, sensitivityRef, confidenceThresholdRef, isCoolingDownRef])

  const processPracticeMatchRef = useRef(processPracticeMatch)
  useEffect(() => { processPracticeMatchRef.current = processPracticeMatch }, [processPracticeMatch])

  // Tauri 环境：应用启动时自动启用默认音频设备
  // 避免用户手动启用时遇到的竞态问题，开箱即用
  useEffect(() => {
    if (!isTauri) return
    if (micEnabled) return // 已启用则跳过

    let cancelled = false
    const autoStartAudio = async () => {
      try {
        const { getAudioDevices, startAudioCaptureWithSampleRate } = await import('@/lib/native-audio')
        const deviceList = await getAudioDevices()
        if (cancelled || deviceList.length === 0) return

        // 优先使用已保存的设备，其次用默认设备
        const savedDevice = audioSettings.selectedAudioDevice
        const device = savedDevice
          ? deviceList.find(d => d.name === savedDevice)
          : null
        const targetDevice = device || deviceList.find(d => d.isDefault) || deviceList[0]

        if (cancelled) return
        await startAudioCaptureWithSampleRate(targetDevice.name, audioSettings.sampleRate || 48000)
        if (cancelled) {
          // 如果已被取消（用户手动停止），立即停止捕获
          const { stopAudioCapture } = await import('@/lib/native-audio')
          await stopAudioCapture()
          return
        }
        store.setSelectedAudioDevice(targetDevice.name)
        store.setMicEnabled(true)
        logger.info('[Tauri] 自动启用音频设备:', targetDevice.name)
      } catch (err) {
        console.error('[Tauri] 自动启用音频失败:', err)
      }
    }
    autoStartAudio()
    return () => { cancelled = true }
  }, [isTauri]) // 仅在 isTauri 变化时执行一次

  // Tauri 环境：练习模式音高检测轮询
  // WindowsAudioSettings 启用音频后，Rust 后端会持续采集；这里在练习进行时轮询 detectPitch 并复用同一套匹配逻辑
  useEffect(() => {
    if (!isTauri) return
    if (!micEnabled || !isPlaying || tunerActive) return

    let isActive = true
    let intervalId: ReturnType<typeof setInterval> | null = null
    let lastDisplayedNote: string | null = null
    let lastDisplayUpdateTime = 0
    const DISPLAY_THROTTLE_MS = 50

    const startPolling = async () => {
      const { detectPitch } = await import('@/lib/native-audio')

      intervalId = setInterval(async () => {
        if (!isActive) return

        try {
          const result = await detectPitch()
          if (!result || result.frequency <= 0) return

          const prob = result.confidence?.overall ?? 0
          const currentConfidenceThreshold = confidenceThresholdRef.current
          if (prob <= currentConfidenceThreshold) return

          const detectedFreq = result.frequency
          const detectedNote = frequencyToNoteName(detectedFreq)
          if (!detectedNote) return

          // 节流更新音高显示
          const now = Date.now()
          if (now - lastDisplayUpdateTime >= DISPLAY_THROTTLE_MS && detectedNote !== lastDisplayedNote) {
            setDetectedPitch(detectedNote)
            lastDisplayUpdateTime = now
            lastDisplayedNote = detectedNote
          }

          // 复用 Web 版的练习匹配逻辑
          processPracticeMatchRef.current(detectedFreq, prob, detectedNote)
        } catch (e) {
          console.error('Tauri 练习模式音高检测错误:', e)
        }
      }, 50)
    }

    startPolling()

    return () => {
      isActive = false
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  }, [isTauri, micEnabled, isPlaying, tunerActive])

  // 实际的音高检测逻辑 - 完全按照原HTML文件的processAudio实现
  const runPitchDetection = useCallback((analyser: AnalyserNode, ctx: AudioContext, scriptProcessor: ScriptProcessorNode) => {
    logger.debug('音高检测已启动，使用 ScriptProcessorNode，sampleRate:', ctx.sampleRate)
    setPitchDebugInfo(prev => ({ ...prev, isRunning: true }))
    
    // 性能优化：防抖和节流变量
    let lastPitchUpdateTime = 0
    let lastDebugUpdateTime = 0
    let lastDetectedPitch: string | null = null
    const PITCH_UPDATE_INTERVAL = 50 // 音高更新间隔 50ms
    const DEBUG_UPDATE_INTERVAL = 100 // 调试信息更新间隔 100ms
    
    // 使用 ScriptProcessorNode 的 onaudioprocess 事件处理音频
    scriptProcessor.onaudioprocess = (event) => {
      // 检查是否需要停止
      if (!scriptProcessorRef.current) {
        logger.debug('音高检测已停止')
        setPitchDebugInfo(prev => ({ ...prev, isRunning: false }))
        return
      }
      
      // 检查是否在冷却期内
      if (isCoolingDownRef.current) return
      
      // 获取输入音频数据
      const inputData = event.inputBuffer.getChannelData(0)
      const sampleRate = ctx.sampleRate
      
      // 获取当前状态
      const currentIsPlaying = isPlayingRef.current
      const currentActiveTab = activeTabRef.current
      const currentSensitivity = sensitivityRef.current
      const currentConfidenceThreshold = confidenceThresholdRef.current
      const currentPitchAlgorithm = pitchAlgorithmRef.current
      
      // 根据当前练习模式确定目标频率，用于动态调整YIN参数
      let isLowFrequencyTarget = false
      let currentSequence: string[] = []
      let currentStep = 0
      let rootNote = 'C'
      
      if (currentActiveTab === 'scale' && scaleExerciseSequenceRef.current.length > 0) {
        currentSequence = scaleExerciseSequenceRef.current
        currentStep = scaleExerciseCurrentStepRef.current
        rootNote = scaleKeyRef.current
      } else if (currentActiveTab === 'chord_exercise' && chordExerciseSequenceRef.current.length > 0) {
        currentSequence = chordExerciseSequenceRef.current
        currentStep = chordExerciseCurrentStepRef.current
        rootNote = chordExerciseTargetChordRef.current?.root || 'C'
      } else if (currentActiveTab === 'chord') {
        const chords = getTransposedChordsRef.current ? getTransposedChordsRef.current() : []
        const currentChord = chords[currentChordIndexRef.current]
        if (currentChord) {
          const degrees = getChordDegrees(currentChord.type, practiceLevelRef.current, levelOptionsRef.current)
          currentSequence = degrees
          currentStep = chordDegreeCurrentStepRef.current
          rootNote = currentChord.root
        }
      } else if (currentActiveTab === 'interval' && currentIntervalExerciseRef.current) {
        const exercise = currentIntervalExerciseRef.current
        if (!exercise.answered && exercise.interval?.symbol) {
          currentSequence = exercise.interval.symbol.split('_')
          currentStep = exercise.completedIntervals.length
          rootNote = exercise.rootNote
        }
      }
      
      // 检查是否有低频目标
      if (currentSequence.length > 0 && currentStep < currentSequence.length) {
        const currentInterval = currentSequence[currentStep]
        const rootValue = noteToSemitones[rootNote] || 0
        const semitone = (rootValue + (intervalToSemitones[currentInterval] || 0)) % 12
        const freq = 440 * Math.pow(2, (semitone - 9) / 12)
        isLowFrequencyTarget = freq < 110
      }
      
      // 动态调整YIN算法参数 - 低频使用更高灵敏度（与原文件一致）
      const yinParams = isLowFrequencyTarget ?
        { threshold: 0.05, probabilityCliff: 0.05 } :
        { threshold: 0.1, probabilityCliff: 0.1 }
      
      // 根据设置选择算法
      let yinResult: { frequency: number; probability: number } | null = null
      
      if (currentPitchAlgorithm === 'solo') {
        // 使用SOLO FFT加速算法
        const soloAnalyser = getSOLOYinAnalyser(inputData.length, sampleRate)
        const soloResult = soloAnalyser.analyze(inputData)
        if (soloResult && soloResult.valid) {
          yinResult = {
            frequency: soloResult.frequency,
            probability: soloResult.probability
          }
        }
      } else {
        // 使用标准YIN算法（使用固定48000采样率）
        yinResult = YINPitchDetection(inputData, 48000, yinParams.threshold, yinParams.probabilityCliff)
      }
      
      if (!yinResult || !yinResult.frequency) {
        setPitchDebugInfo(prev => ({ ...prev, rms: 0, frequency: null, probability: null }))
        return
      }
      
      // 动态能量检测 - 低频使用更低阈值
      const energy = calculateRMS(inputData)
      const energyThreshold = yinResult.frequency < 110 ? 0.001 : 0.002
      if (energy < energyThreshold) {
        setPitchDebugInfo(prev => ({ ...prev, rms: energy, frequency: null, probability: null }))
        return
      }
      
      // 谐波增强处理 - 特别针对低频（与原文件一致）
      let detectedFreq = yinResult.frequency
      if (detectedFreq < 110) {
        const possibleFundamental = detectedFreq / 2
        let fundamentalResult: { frequency: number; probability: number } | null = null
        
        if (currentPitchAlgorithm === 'solo') {
          const soloAnalyser2 = getSOLOYinAnalyser(inputData.length, sampleRate)
          const soloResult = soloAnalyser2.analyze(inputData)
          if (soloResult && soloResult.valid) {
            fundamentalResult = {
              frequency: soloResult.frequency,
              probability: soloResult.probability
            }
          }
        } else {
          fundamentalResult = YINPitchDetection(inputData, 48000, yinParams.threshold, yinParams.probabilityCliff)
        }
        
        if (fundamentalResult && fundamentalResult.frequency &&
            Math.abs(fundamentalResult.frequency - possibleFundamental) < 5) {
          detectedFreq = possibleFundamental
        }
      }
      
      // 性能优化：节流更新调试信息（每200ms更新一次）
      const now = Date.now()
      if (now - lastDebugUpdateTime >= DEBUG_UPDATE_INTERVAL) {
        setPitchDebugInfo(prev => ({
          ...prev,
          rms: energy,
          frequency: detectedFreq,
          probability: yinResult.probability
        }))
        lastDebugUpdateTime = now
      }
      
      // 获取检测到的音符用于显示
      const detectedNote = frequencyToNoteName(detectedFreq)
      
      // 性能优化：节流更新音高显示（每50ms更新一次，且音高有变化时）
      if (now - lastPitchUpdateTime >= PITCH_UPDATE_INTERVAL && detectedNote !== lastDetectedPitch) {
        setDetectedPitch(detectedNote)
        lastPitchUpdateTime = now
        lastDetectedPitch = detectedNote
      }
      
      // 调用共用的练习匹配逻辑（Web 和 Tauri 两条路径共用）
      processPracticeMatchRef.current(detectedFreq, yinResult.probability, detectedNote)
    }
  }, [getTransposedChordsRef, practiceLevelRef, findRootFirstRef, targetNoteRef, scaleKeyRef, scaleExerciseSequenceRef, scaleExerciseCurrentStepRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, currentIntervalExerciseRef, currentChordIndexRef, chordDegreeCurrentStepRef, nextChordRef, nextChordInfoRef, nextScaleExerciseRef, nextChordExerciseRef, generateNewTargetRef, generateIntervalExerciseRef, isPlayingRef, activeTabRef, sensitivityRef, confidenceThresholdRef, isCoolingDownRef, scriptProcessorRef, processPracticeMatchRef])

  // 旧的 requestAnimationFrame 方式（保留但不使用）
  const runPitchDetectionOld = useCallback((analyser: AnalyserNode, ctx: AudioContext) => {
    const bufferLength = analyser.fftSize
    const buffer = new Float32Array(bufferLength)
    let lastDetectedNote: string | null = null
    let noteHoldCount = 0
    const NOTE_HOLD_THRESHOLD = 3
    
    const yinThreshold = Math.max(0.05, 0.15 - sensitivity * 0.1)
    const yinDetector = YINDetector({ 
      threshold: yinThreshold,
      probabilityCliff: 0.1 
    })
    
    const detectPitch = () => {
      if (!pitchDetectionRef.current) return
      
      if (cooldownEnabled && isCoolingDownRef.current) {
        pitchDetectionRef.current = requestAnimationFrame(detectPitch)
        return
      }
      
      analyser.getFloatTimeDomainData(buffer)
      
      const rms = calculateRMS(buffer)
      const energyThreshold = 0.001 + (1 - sensitivity) * 0.002
      
      if (rms < energyThreshold) {
        setDetectedPitch(null)
        setDetectedCents(null)
        lastDetectedNote = null
        noteHoldCount = 0
        pitchDetectionRef.current = requestAnimationFrame(detectPitch)
        return
      }
      
      const result = yinDetector(buffer)
      
      if (result && result.frequency && result.probability > confidenceThreshold) {
        const detectedNote = frequencyToNoteName(result.frequency)
        setDetectedPitch(detectedNote)
        
        if (targetNote && isPlaying) {
          const targetFreq = 440 * Math.pow(2, (getNoteIndex(targetNote) - 9) / 12)
          const cents = calculateCents(result.frequency, targetFreq)
          setDetectedCents(cents)
        }
        
        if (isPlaying && detectedNote) {
          if (detectedNote === lastDetectedNote) {
            noteHoldCount++
            if (noteHoldCount >= NOTE_HOLD_THRESHOLD) {
              if (handleMIDINoteInputRef.current) {
                handleMIDINoteInputRef.current(detectedNote)
              }
              noteHoldCount = 0
              
              if (cooldownEnabled) {
                isCoolingDownRef.current = true
                if (cooldownRef.current) {
                  clearTimeout(cooldownRef.current)
                }
                cooldownRef.current = setTimeout(() => {
                  isCoolingDownRef.current = false
                }, cooldownDuration)
              }
            }
          } else {
            noteHoldCount = 0
          }
          lastDetectedNote = detectedNote
        }
      } else {
        setDetectedPitch(null)
        setDetectedCents(null)
      }
      
      pitchDetectionRef.current = requestAnimationFrame(detectPitch)
    }
    
    detectPitch()
  }, [isPlaying, activeTab, cooldownEnabled, cooldownDuration, sensitivity, confidenceThreshold, targetNote])

  // 使用当前状态的音高检测
  const startPitchDetection = useCallback(() => {
    logger.debug('startPitchDetection 被调用', 'analyserNode:', !!analyserNode, 'audioContext:', !!audioContext, 'scriptProcessor:', !!scriptProcessorRef.current)
    if (!analyserNode || !audioContext || !scriptProcessorRef.current) {
      logger.debug('analyserNode、audioContext 或 scriptProcessor 为空，无法启动音高检测')
      return
    }
    runPitchDetection(analyserNode, audioContext, scriptProcessorRef.current)
  }, [analyserNode, audioContext, runPitchDetection])

  // 直接使用节点启动音高检测（用于避免React状态延迟）
  const startPitchDetectionWithNodes = useCallback((analyser: AnalyserNode, ctx: AudioContext, scriptProcessor: ScriptProcessorNode) => {
    logger.debug('startPitchDetectionWithNodes 被调用')
    runPitchDetection(analyser, ctx, scriptProcessor)
  }, [runPitchDetection])

  // ==================== 练习逻辑 ====================

  // 生成新的目标音符
  const previousTargetRef = useRef<string | null>(null)

  const generateNewTarget = useCallback(() => {
    // 总是生成指板位置（在 fretboard 模式下不会被使用，但确保 buttons 模式下始终有值）
    const availableStrings = selectedStrings.length > 0 ? selectedStrings : [1, 2, 3, 4, 5, 6]
    const randomStringNum = availableStrings[Math.floor(Math.random() * availableStrings.length)]
    const stringIndex = 6 - randomStringNum
    const randomFret = Math.floor(Math.random() * (fretCount + 1))
    const noteAtPosition = getNoteAtPosition(stringIndex, randomFret)
    
    // 设置高亮位置（buttons 模式使用，fretboard 模式忽略）
    setHighlightedTargetPosition({ stringIndex, fret: randomFret })
    setTargetNote(noteAtPosition)
    previousTargetRef.current = noteAtPosition

    if (intervalRootMode === "random") {
      setRootNote(NOTES[Math.floor(Math.random() * NOTES.length)])
    }

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [intervalRootMode, recordPractice, selectedStrings, fretCount])

  // 生成音程练习队列
  const generateIntervalExerciseQueue = useCallback(() => {
    if (selectedIntervals.length === 0) return []
    
    let effectiveIntervals = [...selectedIntervals]
    if (findRootFirst) {
      effectiveIntervals = effectiveIntervals.filter(idx => idx !== 0)
    }
    if (effectiveIntervals.length === 0) return []
    
    let queue = [...effectiveIntervals]
    
    if (intervalDirection === "down") {
      queue = queue.map(idx => {
        const interval = INTERVALS[idx]
        const downSemitones = (12 - interval.semitones) % 12
        const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
        return downIndex !== -1 ? downIndex : idx
      })
    } else if (intervalDirection === "random") {
      queue = queue.map(idx => {
        if (Math.random() > 0.5) {
          const interval = INTERVALS[idx]
          const downSemitones = (12 - interval.semitones) % 12
          const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
          return downIndex !== -1 ? downIndex : idx
        }
        return idx
      })
    }
    
    if (intervalRandomizeOrder) {
      queue = queue.sort(() => Math.random() - 0.5)
    }
    
    return queue
  }, [selectedIntervals, intervalRandomizeOrder, intervalDirection, findRootFirst])

  // 生成音程练习题目
  const generateIntervalExercise = useCallback(() => {
    if (selectedIntervals.length === 0) return
    
    // 获取当前队列状态
    const currentQueue = intervalExerciseQueue
    const currentIndex = intervalCurrentQueueIndex
    
    let queue = currentQueue
    let nextIndex = currentIndex
    
    // 如果队列为空或已遍历完，重新生成队列
    if (queue.length === 0 || nextIndex >= queue.length) {
      queue = generateIntervalExerciseQueue()
      setIntervalExerciseQueue(queue)
      nextIndex = 0
      setIntervalCurrentQueueIndex(0)
    }
    
    if (queue.length === 0) return
    
    // 获取当前音程
    const intervalIndex = queue[nextIndex]
    const selectedInterval = INTERVALS[intervalIndex]
    
    // 随机选择根音
    let exerciseRoot = rootNote
    if (intervalRootMode === "random") {
      exerciseRoot = NOTES[Math.floor(Math.random() * NOTES.length)]
      setRootNote(exerciseRoot)
    }
    
    // 获取选中的音程对象
    const selectedIntervalObjects = selectedIntervals.map(i => INTERVALS[i])
    
    // 计算目标音符
    const rootIdx = getNoteIndex(exerciseRoot)
    const targetIndex = (rootIdx + selectedInterval.semitones) % 12
    const targetNoteName = NOTES[targetIndex]
    
    // 构建当前题目显示的音程
    // 先找根音模式: "1 3" (根音 + 音程)
    // 不先找根音模式: "3" (仅音程)
    const currentIntervalDisplay = findRootFirst ? `1 ${selectedInterval.symbol}` : selectedInterval.symbol
    const rootBackDisplay = addRootBack ? ` ${selectedInterval.symbol} 1` : ''
    
    setCurrentIntervalExercise({
      rootNote: exerciseRoot,
      interval: selectedInterval,
      targetNote: targetNoteName,
      allIntervals: selectedIntervalObjects,
      currentIntervalDisplay: currentIntervalDisplay + rootBackDisplay,
      completedIntervals: [] as number[],
      answered: false
    })
    
    // 重置步骤到根音
    setIntervalPracticeStep("root")
    
    // 更新队列索引
    setIntervalCurrentQueueIndex(nextIndex + 1)

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [rootNote, intervalRootMode, selectedIntervals, findRootFirst, addRootBack, recordPractice, intervalExerciseQueue, intervalCurrentQueueIndex])

  // 辅助函数：生成和弦练习序列
  const generateChordSequence = useCallback((root: string, chordType: string, levelId: string, order: string, bass: string) => {
    // 从 ALL_PRACTICE_LEVELS 获取练习模式
    const level = ALL_PRACTICE_LEVELS.find(l => l.id === levelId)
    if (!level) return []

    // 根据和弦类型确定序列类型
    const getSequenceType = (type: string): keyof typeof level.sequences => {
      // 属七和弦系列
      if (['7', '7b5', '7#5', '7b9', '7#9', '7#11', '7b13', '7#5b9', '7#5#9', '7b5b9', '7b5#9', '7b9b13', '7alt'].includes(type)) {
        return 'dominant'
      }
      // 属九和弦系列
      if (['9', '9b13', '9#11', '9sus4'].includes(type)) {
        return 'dominant'
      }
      // 属十三和弦系列
      if (['13', '13b9', '13#9', '13#11'].includes(type)) {
        return 'dominant'
      }
      // 大七和弦系列
      if (['Maj7', 'maj7#5', 'maj7#11', 'maj7b6', 'maj7#9'].includes(type)) {
        return 'major'
      }
      // 大九和弦系列
      if (['Maj9', 'maj9#11', 'maj9#5', 'maj9b6'].includes(type)) {
        return 'major'
      }
      // 大十三和弦系列
      if (['maj13', 'maj13#11', 'maj13#5'].includes(type)) {
        return 'major'
      }
      // 小七和弦系列
      if (['m7', 'm7b5', 'm7b5nat9', 'm7b6', 'mMaj7', 'mMaj9', 'mMaj13'].includes(type)) {
        return 'minor'
      }
      // 小九和弦系列
      if (['m9', 'm9b5'].includes(type)) {
        return 'minor'
      }
      // 小十一/十三和弦系列
      if (['m11', 'm13'].includes(type)) {
        return 'minor'
      }
      // 减和弦系列
      if (['Dim', 'dim', 'dim7'].includes(type)) {
        return 'diminished'
      }
      // 减大七和弦
      if (['dimMaj7'].includes(type)) {
        return 'diminishedMajorSeven'
      }
      // 增和弦系列
      if (['Aug', 'aug', 'aug7'].includes(type)) {
        return 'augmented'
      }
      // 挂留和弦系列
      if (['sus4', '7sus4', '7sus4b9', 'sus4b9', '13sus4', '13sus4b9'].includes(type)) {
        return 'sus'
      }
      // 挂二和弦
      if (['sus2'].includes(type)) {
        return 'sus2'
      }
      // 六和弦系列
      if (['6', 'm6'].includes(type)) {
        return 'six'
      }
      // 加音和弦系列 - 按大小调分类
      if (['add9', '6add9'].includes(type)) {
        return 'major'
      }
      if (['madd9', 'm6add9'].includes(type)) {
        return 'minor'
      }
      // 默认大调
      return 'major'
    }

    const sequenceType = getSequenceType(chordType)
    let sequenceNumbers = level.sequences[sequenceType] || level.sequences.major || [1]
    
    // 将数字转换为音级字符串
    let sequence = sequenceNumbers.map(n => String(n))

    // 根据和弦类型调整音级
    sequence = sequence.map(degree => {
      switch (chordType) {
        case 'Minor':
        case 'm':
        case 'm6':
        case 'm7':
        case 'm9':
        case 'm11':
        case 'm13':
        case 'madd9':
        case 'm6add9':
          if (degree === '3') return 'b3'
          if (degree === '7') return 'b7'
          return degree
        
        case 'Dim':
        case 'dim':
        case 'dim7':
          if (degree === '3') return 'b3'
          if (degree === '5') return 'b5'
          if (degree === '7') return 'bb7'
          return degree
        
        case 'dimMaj7':
          if (degree === '3') return 'b3'
          if (degree === '5') return 'b5'
          return degree
        
        case 'm7b5':
        case 'm9b5':
          if (degree === '3') return 'b3'
          if (degree === '5') return 'b5'
          if (degree === '7') return 'b7'
          return degree
        
        case 'm7b5nat9':
          if (degree === '3') return 'b3'
          if (degree === '5') return 'b5'
          if (degree === '7') return 'b7'
          return degree
        
        case 'm7b6':
          if (degree === '3') return 'b3'
          if (degree === '7') return 'b7'
          if (degree === '6') return 'b6'
          return degree
        
        case 'mMaj7':
        case 'mMaj9':
        case 'mMaj13':
          if (degree === '3') return 'b3'
          return degree
        
        case 'Aug':
        case 'aug':
          if (degree === '5') return '#5'
          return degree
        
        case 'aug7':
          if (degree === '5') return '#5'
          if (degree === '7') return 'b7'
          return degree
        
        case '7':
        case '7b5':
        case '7#5':
        case '7b9':
        case '7#9':
        case '7#11':
        case '7b13':
        case '7#5b9':
        case '7#5#9':
        case '7b5b9':
        case '7b5#9':
        case '7b9b13':
        case '7alt':
        case '9':
        case '9b13':
        case '9#11':
        case '13':
        case '13b9':
        case '13#9':
        case '13#11':
        case '7sus4':
        case '7sus4b9':
        case '9sus4':
        case '13sus4':
        case '13sus4b9':
        case 'sus4b9':
          if (degree === '7') return 'b7'
          if (degree === '5' && ['7b5', '7b5b9', '7b5#9'].includes(chordType)) return 'b5'
          if (degree === '5' && ['7#5', '7#5b9', '7#5#9', '7alt'].includes(chordType)) return '#5'
          if (degree === '9' && ['7b9', '7#5b9', '7b5b9', '7b9b13', '7sus4b9', 'sus4b9', '13sus4b9', '13b9'].includes(chordType)) return 'b9'
          if (degree === '9' && ['7#9', '7#5#9', '7b5#9', '13#9'].includes(chordType)) return '#9'
          if (degree === '11' && ['7#11', '9#11', '13#11'].includes(chordType)) return '#11'
          if (degree === '6' && ['7b13', '7b9b13', '9b13'].includes(chordType)) return 'b13'
          return degree
        
        case 'Maj7':
        case 'maj7#5':
        case 'maj7#11':
        case 'maj7b6':
        case 'maj7#9':
        case 'Maj9':
        case 'maj9#11':
        case 'maj9#5':
        case 'maj9b6':
        case 'maj13':
        case 'maj13#11':
        case 'maj13#5':
          if (degree === '5' && ['maj7#5', 'maj9#5', 'maj13#5'].includes(chordType)) return '#5'
          if (degree === '6' && ['maj7b6', 'maj9b6'].includes(chordType)) return 'b6'
          if (degree === '9' && ['maj7#9'].includes(chordType)) return '#9'
          if (degree === '11' && ['maj7#11', 'maj9#11', 'maj13#11'].includes(chordType)) return '#11'
          return degree
        
        case 'sus2':
          if (degree === '3') return '2'
          if (degree === '7') return 'b7'
          return degree
        
        case 'sus4':
          if (degree === '3') return '4'
          return degree
        
        case '6':
        case '6add9':
          return degree
        
        default:
          return degree
      }
    })

    // 应用低音音符（旋转序列使指定音级排在最前）
    if (bass && bass !== "root") {
      const bassDegreeMap: Record<string, string> = {
        "3rd": "3", "5th": "5", "7th": "7",
        "b3": "b3", "b5": "b5", "bb7": "bb7", "#5": "#5"
      }
      const targetDegree = bassDegreeMap[bass]
      if (targetDegree) {
        const bassIdx = sequence.indexOf(targetDegree)
        if (bassIdx > 0) {
          sequence = [...sequence.slice(bassIdx), ...sequence.slice(0, bassIdx)]
        }
      }
    }

    // 应用演奏顺序
    if (order === "desc") {
      sequence = sequence.reverse()
    } else if (order === "random") {
      for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[sequence[i], sequence[j]] = [sequence[j], sequence[i]]
      }
    }

    return sequence
  }, [])

  // 生成和弦练习
  const generateChordExercise = useCallback(() => {
    // 确定根音
    let root = chordExerciseRoot
    if (root === "random") {
      root = NOTES[Math.floor(Math.random() * NOTES.length)]
    }

    // 确定和弦类型（从选中的类型中随机选择）
    let chordType = "Major"
    if (chordExerciseTypes.length > 0) {
      const randomIndex = Math.floor(Math.random() * chordExerciseTypes.length)
      chordType = chordExerciseTypes[randomIndex]
    }

    // 确定低音音符
    let bass = chordExerciseBass
    if (bass === "random") {
      const bassOptions = ["root", "3rd", "5th", "7th"]
      bass = bassOptions[Math.floor(Math.random() * bassOptions.length)]
    }

    // 生成序列
    const sequence = generateChordSequence(root, chordType, chordExerciseLevel, chordExerciseOrder, bass)

    setChordExerciseTargetChord({ root, type: chordType })
    setChordExerciseSequence(sequence)
    setChordExerciseCurrentStep(0)
    setChordExerciseIsAnswered(false)
    chordExerciseIsAnsweredRef.current = false

    // 预生成下一题
    let nextRoot = chordExerciseRoot === "random" ? NOTES[Math.floor(Math.random() * NOTES.length)] : root
    let nextType = chordExerciseTypes.length > 0 ? chordExerciseTypes[Math.floor(Math.random() * chordExerciseTypes.length)] : chordType
    let nextBass = chordExerciseBass === "random" ? ["root", "3rd", "5th", "7th"][Math.floor(Math.random() * 4)] : bass
    const nextSequence = generateChordSequence(nextRoot, nextType, chordExerciseLevel, chordExerciseOrder, nextBass)

    setNextChordExerciseInfo({
      root: nextRoot,
      type: nextType,
      sequence: nextSequence
    })

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [chordExerciseRoot, chordExerciseTypes, chordExerciseLevel, chordExerciseOrder, chordExerciseBass, generateChordSequence, recordPractice])

  // 下一和弦练习
  const nextChordExercise = useCallback(() => {
    // 使用预览中的下一题信息
    if (nextChordExerciseInfo) {
      setChordExerciseTargetChord({ root: nextChordExerciseInfo.root, type: nextChordExerciseInfo.type })
      setChordExerciseSequence(nextChordExerciseInfo.sequence)
      setChordExerciseCurrentStep(0)
      setChordExerciseIsAnswered(false)
      chordExerciseIsAnsweredRef.current = false

      // 预生成新的下一题
      let newNextRoot = chordExerciseRoot === "random" ? NOTES[Math.floor(Math.random() * NOTES.length)] : nextChordExerciseInfo.root
      let newNextType = chordExerciseTypes.length > 0 ? chordExerciseTypes[Math.floor(Math.random() * chordExerciseTypes.length)] : nextChordExerciseInfo.type
      let newNextBass = chordExerciseBass === "random" ? ["root", "3rd", "5th", "7th"][Math.floor(Math.random() * 4)] : chordExerciseBass
      const newNextSequence = generateChordSequence(newNextRoot, newNextType, chordExerciseLevel, chordExerciseOrder, newNextBass)

      setNextChordExerciseInfo({
        root: newNextRoot,
        type: newNextType,
        sequence: newNextSequence
      })
    } else {
      // 如果没有预览信息，重新生成
      generateChordExercise()
    }
  }, [nextChordExerciseInfo, chordExerciseRoot, chordExerciseTypes, chordExerciseLevel, chordExerciseOrder, chordExerciseBass, generateChordSequence, generateChordExercise])

  // 查找音阶中第一个出现的指定音程（如'3', 'b3', '#3'等）
  const findFirstIntervalOfType = useCallback((intervals: string[], degree: string): string | null => {
    // 特殊处理：对于blues音阶等特殊音阶，优先检查是否有对应度数的变音记号版本
    if (degree === '3') {
      for (let i = 0; i < intervals.length; i++) {
        if (intervals[i] === 'b3') return intervals[i]
      }
    } else if (degree === '4') {
      for (let i = 0; i < intervals.length; i++) {
        if (intervals[i] === 'b4') return intervals[i]
      }
    } else if (degree === '7') {
      for (let i = 0; i < intervals.length; i++) {
        if (intervals[i] === 'b7') return intervals[i]
      }
    }

    // 检查音阶中是否包含该度数的任何变体
    for (let i = 0; i < intervals.length; i++) {
      const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
      if (intervalNumber === degree) {
        return intervals[i]
      }
    }

    return null
  }, [])

  // 当音阶中缺少特定音程时，查找音阶中实际存在的最近音程
  const findNearestIntervalInScale = useCallback((intervals: string[], degree: string): string | null => {
    // 首先尝试查找指定度数的音程
    const foundInterval = findFirstIntervalOfType(intervals, degree)
    if (foundInterval) return foundInterval

    // 如果没找到，根据音程类型选择最近的替代音程
    switch (degree) {
      case '3':
        // 3音缺失时，查找2音（优先）或4音
        for (let i = 0; i < intervals.length; i++) {
          const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
          if (intervalNumber === '4') return intervals[i]
        }
        for (let i = 0; i < intervals.length; i++) {
          const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
          if (intervalNumber === '2') return intervals[i]
        }
        break
      case '5':
        // 5音缺失时，查找4音或6音
        for (let i = 0; i < intervals.length; i++) {
          const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
          if (intervalNumber === '4') return intervals[i]
        }
        for (let i = 0; i < intervals.length; i++) {
          const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
          if (intervalNumber === '6') return intervals[i]
        }
        break
      case '7':
        // 7音缺失时，查找6音（优先）或1→1
        for (let i = 0; i < intervals.length; i++) {
          const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
          if (intervalNumber === '6') return intervals[i]
        }
        for (let i = 0; i < intervals.length; i++) {
          const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
          if (intervalNumber === '1') return intervals[i]
        }
        break
    }

    // 如果还是没找到，返回音阶中的第一个音程作为默认值
    return intervals.length > 0 ? intervals[0] : '1'
  }, [findFirstIntervalOfType])

  // 辅助函数：生成音阶练习序列
  const generateScaleSequence = useCallback((scale: typeof SCALE_MODES.basic[0], sequenceType: string, order: string) => {
    // 获取音阶的音级字符串数组
    let intervals: string[] = [...(scale.intervals || [])]
    
    // 如果没有 intervals，从 notes 转换
    if (intervals.length === 0) {
      const semitoneToDegree: Record<number, string> = {
        0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
        6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
      }
      intervals = scale.notes.map(i => semitoneToDegree[i] || String(i))
    }
    
    let startEndInterval = '1' // 默认使用1作为首尾音
    
    // 根据练习序列类型确定首尾音
    if (sequenceType === 'random') {
      const availableChordTones: string[] = []
      const thirdInterval = findFirstIntervalOfType(intervals, '3')
      if (thirdInterval) availableChordTones.push(thirdInterval)
      const fifthInterval = findFirstIntervalOfType(intervals, '5')
      if (fifthInterval) availableChordTones.push(fifthInterval)
      const seventhInterval = findFirstIntervalOfType(intervals, '7')
      if (seventhInterval) availableChordTones.push(seventhInterval)
      
      if (availableChordTones.length > 0) {
        startEndInterval = availableChordTones[Math.floor(Math.random() * availableChordTones.length)]
      } else {
        startEndInterval = '1'
      }
    } else if (sequenceType === '3to3') {
      const found = findFirstIntervalOfType(intervals, '3')
      startEndInterval = found || findNearestIntervalInScale(intervals, '3') || '1'
    } else if (sequenceType === '5to5') {
      const found = findFirstIntervalOfType(intervals, '5')
      startEndInterval = found || findNearestIntervalInScale(intervals, '5') || '1'
    } else if (sequenceType === '7to7') {
      const found = findFirstIntervalOfType(intervals, '7')
      startEndInterval = found || findNearestIntervalInScale(intervals, '7') || '1'
    }

    // 根据方向重新排列序列
    if (order === 'down') {
      const startEndIndex = intervals.indexOf(startEndInterval)
      if (startEndIndex !== -1) {
        const middleIntervals = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)].reverse()
        intervals = [startEndInterval, ...middleIntervals, startEndInterval]
      } else {
        const middleIntervals = intervals.slice(1).reverse()
        intervals = [intervals[0], ...middleIntervals, intervals[0]]
      }
    } else if (order === 'up_down') {
      const startEndIndex = intervals.indexOf(startEndInterval)
      if (startEndIndex !== -1) {
        const ascendingMiddle = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)]
        const descendingMiddle = [...ascendingMiddle].reverse()
        intervals = [startEndInterval, ...ascendingMiddle, startEndInterval, ...descendingMiddle, startEndInterval]
      } else {
        const ascendingMiddle = intervals.slice(1)
        const descendingMiddle = [...ascendingMiddle].reverse()
        intervals = [intervals[0], ...ascendingMiddle, intervals[0], ...descendingMiddle, intervals[0]]
      }
    } else if (order === 'random') {
      // 方向随机时，首尾音从1→1、3→3、5→5、7→7中随机选择，中间是音阶其他音的随机排列
      const availableStartEndTones: string[] = ['1'] // 1音始终可用
      const thirdInterval = findFirstIntervalOfType(intervals, '3')
      if (thirdInterval) availableStartEndTones.push(thirdInterval)
      const fifthInterval = findFirstIntervalOfType(intervals, '5')
      if (fifthInterval) availableStartEndTones.push(fifthInterval)
      const seventhInterval = findFirstIntervalOfType(intervals, '7')
      if (seventhInterval) availableStartEndTones.push(seventhInterval)
      
      // 从可用的首尾音中随机选择首尾音
      startEndInterval = availableStartEndTones[Math.floor(Math.random() * availableStartEndTones.length)]
      
      // 获取音阶中除首尾音外的其他音
      const startEndIndex = intervals.indexOf(startEndInterval)
      let otherIntervals: string[]
      if (startEndIndex !== -1) {
        otherIntervals = [...intervals.slice(0, startEndIndex), ...intervals.slice(startEndIndex + 1)]
      } else {
        otherIntervals = intervals.filter(i => i !== startEndInterval)
      }
      
      // 随机打乱中间音的顺序
      for (let i = otherIntervals.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[otherIntervals[i], otherIntervals[j]] = [otherIntervals[j], otherIntervals[i]]
      }
      
      // 构建最终序列：首尾音 + 随机排列的中间音 + 首尾音
      intervals = [startEndInterval, ...otherIntervals, startEndInterval]
    } else {
      if (sequenceType === '1to1' || sequenceType === '3to3' || sequenceType === '5to5' || sequenceType === '7to7' || sequenceType === 'random') {
        const startEndIndex = intervals.indexOf(startEndInterval)
        if (startEndIndex !== -1) {
          const middleIntervals = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)]
          intervals = [startEndInterval, ...middleIntervals, startEndInterval]
        } else {
          intervals = [startEndInterval, ...intervals, startEndInterval]
        }
      } else {
        intervals = [...intervals, intervals[0]]
      }
    }
    
    return intervals
  }, [findFirstIntervalOfType, findNearestIntervalInScale])

  const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'd♯']
  const FLAT_KEYS = ['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'd', 'g', 'c', 'f', 'bb', 'eb']

  const ENHARMONIC_MAP: Record<string, string> = {
    'C#': 'D♭', 'D♭': 'C#', 'C♯': 'D♭',
    'D#': 'E♭', 'E♭': 'D#', 'D♯': 'E♭',
    'F#': 'G♭', 'G♭': 'F#', 'F♯': 'G♭',
    'G#': 'A♭', 'A♭': 'G#', 'G♯': 'A♭',
    'A#': 'B♭', 'B♭': 'A#', 'A♯': 'B♭',
  }

  const preferSharp = (note: string): string => {
    const normalized = normalizeNoteName(note)
    if (['D♭', 'E♭', 'G♭', 'A♭', 'B♭', 'Db', 'Eb', 'Gb', 'Ab', 'Bb'].includes(note)) return normalizeNoteName(ENHARMONIC_MAP[note] || note)
    return normalized
  }

  const preferFlat = (note: string): string => {
    const normalized = normalizeNoteName(note)
    if (['C#', 'D#', 'F#', 'G#', 'A#', 'C♯', 'D♯', 'F♯', 'G♯', 'A♯'].includes(note)) return normalizeNoteName(ENHARMONIC_MAP[note] || note)
    return normalized
  }

  const formatNoteByAccidentalSetting = useCallback((note: string): string => {
    if (noteAccidentalDisplay === 'flat') return preferFlat(note)
    if (noteAccidentalDisplay === 'mixed') {
      // 混用模式：升降号交替显示，同一音符始终显示同一种
      const noteIndex = NOTES.indexOf(preferSharp(note))
      if (noteIndex === -1) return note
      // 使用音符索引决定升降号：C,D,E,F,G,A,B 用升号，其他用降号
      // 更合理的做法：F大调的降号调用降号，其他用升号
      const FLAT_KEYS_INDICES = [1, 3, 5, 8, 10] // Db, Eb, Gb, Ab, Bb 的索引
      return FLAT_KEYS_INDICES.includes(noteIndex) ? preferFlat(note) : preferSharp(note)
    }
    return preferSharp(note)
  }, [noteAccidentalDisplay])
  
  const getNextKeyByMovement = useCallback((currentKey: string, movement: typeof scaleRootMovement): string => {
    const normalizedKey = normalizeNoteName(currentKey)
    const noteIndex = NOTES.indexOf(normalizedKey)
    if (noteIndex === -1) return normalizedKey

    const isSharpKey = SHARP_KEYS.includes(normalizedKey)
    const isFlatKey = FLAT_KEYS.includes(normalizedKey)
    const useSharps = isSharpKey || (!isFlatKey && Math.random() > 0.5)

    switch (movement) {
      case 'static':
        return normalizedKey
      case 'random':
        return NOTES[Math.floor(Math.random() * NOTES.length)]
      case 'upSemiTone': {
        const next = NOTES[(noteIndex + 1) % 12]
        return useSharps ? preferSharp(next) : preferFlat(next)
      }
      case 'downSemiTone': {
        const next = NOTES[(noteIndex - 1 + 12) % 12]
        return useSharps ? preferSharp(next) : preferFlat(next)
      }
      case 'circleOfFifths': {
        const next = NOTES[(noteIndex + 7) % 12]
        return preferSharp(next)
      }
      case 'circleOfFourths': {
        const next = NOTES[(noteIndex + 5) % 12]
        return preferFlat(next)
      }
      default:
        return currentKey
    }
  }, [])

  // 生成音阶练习序列 - 参考 F:\新建文件夹\吉他指板视觉化练习工具.html
  const generateScaleExercise = useCallback(() => {
    if (selectedScales.length === 0) return
    
    let currentKey = scaleKey
    if (isScaleKeyRandom) {
      currentKey = NOTES[Math.floor(Math.random() * NOTES.length)]
      setScaleKey(currentKey)
    }
    
    const randomScale = selectedScales[Math.floor(Math.random() * selectedScales.length)]
    setSelectedScale(randomScale)
    
    const intervals = generateScaleSequence(randomScale, scalePracticeSequence, scaleDirection)
    setScaleExerciseSequence(intervals)
    setScaleExerciseCurrentStep(0)
    
    let nextKey: string
    if (isScaleKeyRandom) {
      nextKey = NOTES[Math.floor(Math.random() * NOTES.length)]
    } else {
      nextKey = getNextKeyByMovement(currentKey, scaleRootMovement)
    }
    const nextScale = selectedScales[Math.floor(Math.random() * selectedScales.length)]
    const nextSequence = generateScaleSequence(nextScale, scalePracticeSequence, scaleDirection)
    setNextScaleExerciseInfo({
      key: nextKey,
      scaleName: nextScale.name,
      sequence: nextSequence
    })

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [selectedScales, scalePracticeSequence, scaleDirection, isScaleKeyRandom, scaleKey, generateScaleSequence, recordPractice, scaleRootMovement, getNextKeyByMovement])

  // 下一音阶练习
  const nextScaleExercise = useCallback(() => {
    if (nextScaleExerciseInfo) {
      setScaleKey(nextScaleExerciseInfo.key)
      const scale = selectedScales.find(s => s.name === nextScaleExerciseInfo.scaleName) || selectedScales[0]
      setSelectedScale(scale)
      setScaleExerciseSequence(nextScaleExerciseInfo.sequence)
      setScaleExerciseCurrentStep(0)
      
      let newNextKey: string
      if (isScaleKeyRandom) {
        newNextKey = NOTES[Math.floor(Math.random() * NOTES.length)]
      } else {
        newNextKey = getNextKeyByMovement(nextScaleExerciseInfo.key, scaleRootMovement)
      }
      const newNextScale = selectedScales[Math.floor(Math.random() * selectedScales.length)]
      const newNextSequence = generateScaleSequence(newNextScale, scalePracticeSequence, scaleDirection)
      setNextScaleExerciseInfo({
        key: newNextKey,
        scaleName: newNextScale.name,
        sequence: newNextSequence
      })
    } else {
      generateScaleExercise()
    }
  }, [nextScaleExerciseInfo, selectedScales, isScaleKeyRandom, scalePracticeSequence, scaleDirection, generateScaleSequence, generateScaleExercise, scaleRootMovement, getNextKeyByMovement])

  // 处理MIDI音符输入
  const handleMIDINoteInput = useCallback((note: string) => {
    logger.debug('handleMIDINoteInput 被调用', note, 'isPlaying:', isPlaying, 'activeTab:', activeTab)
    if (!isPlaying) {
      logger.debug('未在练习中，忽略输入')
      return
    }
    
    switch (activeTab) {
      case "practice":
        // 辨音模式下通过按钮答题，不自动匹配（使用 ref 避免闭包延迟）
        if (practiceAnswerModeRef.current === "buttons") break
        if (note === targetNote) {
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          // 音高识别统计改为按会话记录，不在此处累加 —— 见 pitchFindingSession 统计 effect
          generateNewTarget()
        } else {
          setScore(prev => ({ ...prev, total: prev.total + 1 }))
        }
        break
      case "interval":
        // Handle interval practice
        if (!currentIntervalExercise || currentIntervalExercise.answered) break
        
        const exercise = currentIntervalExercise
        const intervals = exercise.currentIntervalDisplay.split(' ')
        const rootNote = exercise.rootNote

        // 检查弹对的音符是哪个音级
        let matchedIndex: number | null = null

        for (let idx = 0; idx < intervals.length; idx++) {
          const interval = intervals[idx]
          // 跳过已经完成的音级（按索引）
          if (exercise.completedIntervals.includes(idx)) continue
          // 先找根音模式：根音未完成时只接受根音
          const rootCompleted = intervals.some((intv, i) => intv === '1' && exercise.completedIntervals.includes(i))
          if (findRootFirst && !rootCompleted && interval !== '1') continue

          // 计算该音程对应的目标音符
          const intervalObj = interval === '1'
            ? { semitones: 0, symbol: '1' }
            : exercise.allIntervals.find(i => i.symbol === interval)

          if (!intervalObj) continue

          const rootIdx = getNoteIndex(rootNote)
          const targetIndex = (rootIdx + intervalObj.semitones) % 12
          const targetNoteName = NOTES[targetIndex]

          if (isEquivalentNote(note, targetNoteName)) {
            matchedIndex = idx
            break
          }
        }

        if (matchedIndex !== null) {
          const matchedInterval = intervals[matchedIndex]
          // 添加到已完成列表
          const newCompletedIntervals = [...exercise.completedIntervals, matchedIndex]

          // 检查是否所有音程都弹对了
          if (newCompletedIntervals.length >= intervals.length) {
            // 完成题目
            setCurrentIntervalExercise({
              ...exercise,
              completedIntervals: newCompletedIntervals,
              answered: true
            })
            setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            // 完成整个音程练习后记录一次统计
            recordPractice('interval', '音程练习')

            // 立即生成新题目（MIDI输入无需延迟）- 使用 ref 避免循环依赖
            setTimeout(() => {
              generateIntervalExerciseRef.current?.()
            }, 0)
          } else {
            // 部分完成
            setCurrentIntervalExercise({
              ...exercise,
              completedIntervals: newCompletedIntervals
            })
            
            // 如果是先找根音模式，完成根音后进入音程步骤
            if (findRootFirst && matchedInterval === '1') {
              setIntervalPracticeStep("interval")
            }
          }
        } else {
          // 答错了
          setScore(prev => ({ ...prev, total: prev.total + 1 }))
        }
        break
      case "chord":
        // Handle chord practice
        {
          const chords = transposedChords
          const currentChord = chords[currentChordIndex]
          if (!currentChord) break
          
          const normalizedType = normalizeChordType(currentChord.type)
          const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === currentChord.type || ct.symbol === currentChord.type)
          if (!chordType) break
          
          // 从所有练习模式中查找
          const level = ALL_PRACTICE_LEVELS.find(l => l.id === practiceLevel)
          if (!level) break
          
          const rootIdx = getNoteIndex(currentChord.root)
          const noteIdx = getNoteIndex(note)
          const interval = (noteIdx - rootIdx + 12) % 12
          
          // 获取当前和弦质量 (使用 group 属性)
          const chordQuality = chordType.group || 'major'
          
          // 判断音符是否正确
          let isCorrect = false
          
          if ('chordTypes' in level && level.chordTypes) {
            // 旋律结构和Voice Led结构 - 根据和弦类型使用不同的音级
            const chordIntervals = level.chordTypes[chordQuality as keyof typeof level.chordTypes] as number[] | undefined
            isCorrect = Array.isArray(chordIntervals) && chordIntervals.includes(interval)
          } else {
            // 基础练习模式 - 使用 sequences 中的对应和弦类型
            const sequenceKey = chordQuality === 'triad' ? 'major' : 
                               chordQuality === 'dominant' ? 'dominant' :
                               chordQuality === 'minor' ? 'minor' : 'major'
            const intervals = level.sequences[sequenceKey as keyof typeof level.sequences] as number[] | undefined
            isCorrect = Array.isArray(intervals) && intervals.includes(interval)
          }
          
          if (isCorrect) {
            setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          } else {
            setScore(prev => ({ ...prev, total: prev.total + 1 }))
          }
        }
        break
      case "scale":
        // 音阶练习处理
        {
          if (scaleExerciseSequence.length === 0) break
          
          const currentDegree = scaleExerciseSequence[scaleExerciseCurrentStep]
          
          // 音级到半音的映射（支持各种变音记号）
          const degreeToSemitone: Record<string, number> = {
            "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5,
            "#4": 6, "b5": 6, "5": 7, "#5": 8, "b6": 8, "6": 9,
            "#6": 9, "b7": 10, "7": 11,
            "b9": 1, "9": 2, "#9": 3, "11": 5, "#11": 6, "b13": 8, "13": 9
          }
          const semitone = degreeToSemitone[currentDegree]
          if (semitone === undefined) break
          
          const keyIdx = getNoteIndex(scaleKey)
          const targetNoteIdx = (keyIdx + semitone) % 12
          const playedNoteIdx = getNoteIndex(note)
          
          if (playedNoteIdx === targetNoteIdx) {
            // 答对了
            const nextStep = scaleExerciseCurrentStep + 1
            if (nextStep >= scaleExerciseSequence.length) {
              // 完成当前序列，使用预览的下一题
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
              // 完成整个音阶序列后记录一次统计
              recordPractice('scale', selectedScale?.name || '音阶练习')
              nextScaleExercise()
            } else {
              // 继续下一个音
              setScaleExerciseCurrentStep(nextStep)
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            }
          } else {
            // 答错了
            setScore(prev => ({ ...prev, total: prev.total + 1 }))
          }
        }
        break
      case "chord_exercise":
        // 和弦练习处理
        {
          if (!chordExerciseTargetChord || chordExerciseSequence.length === 0) break

          const currentDegree = chordExerciseSequence[chordExerciseCurrentStep]
          const normalizedType = normalizeChordType(chordExerciseTargetChord.type)
          const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordExerciseTargetChord.type)
          if (!chordType) break

          const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
          const degreeToSemitone: Record<string, number> = {
            "1": 0, "b9": 1, "9": 2, "#9": 3,
            "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8,
            "b6": 8, "6": 9, "7": 11, "b7": 10, "maj7": 11, "bb7": 9,
            "b13": 8, "13": 9, "11": 5, "#11": 6
          }
          const semitone = degreeToSemitone[currentDegree]
          if (semitone === undefined) break

          const targetNoteIdx = (rootIdx + semitone) % 12
          const playedNoteIdx = getNoteIndex(note)

          if (playedNoteIdx === targetNoteIdx) {
            // 答对了
            const nextStep = chordExerciseCurrentStep + 1
            if (nextStep >= chordExerciseSequence.length) {
              // 完成当前和弦，使用预览的下一题
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
              // 完成整个和弦序列后记录一次统计
              recordPractice('chord_exercise', chordExerciseTargetChord?.type || '和弦练习')
              nextChordExercise()
            } else {
              // 继续下一个音
              setChordExerciseCurrentStep(nextStep)
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            }
          } else {
            // 答错了
            setScore(prev => ({ ...prev, total: prev.total + 1 }))
          }
        }
        break
    }
  }, [isPlaying, activeTab, targetNote, generateNewTarget, findRootFirst, intervalPracticeStep, rootNote, selectedIntervals, intervalRootMode, customChords, selectedSong, currentChordIndex, practiceLevel, scaleKey, selectedScale, currentIntervalExercise, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, generateChordExercise, nextChordExercise, scaleExerciseSequence, scaleExerciseCurrentStep, nextScaleExercise, generateScaleExercise, recordPractice])

  // 更新 ref 以便在 startPitchDetection 中使用（不含 nextChord，它在后面定义）
  useEffect(() => {
    handleMIDINoteInputRef.current = handleMIDINoteInput
    nextChordExerciseRef.current = nextChordExercise
    nextScaleExerciseRef.current = nextScaleExercise
    generateNewTargetRef.current = generateNewTarget
    generateIntervalExerciseRef.current = generateIntervalExercise
    chordExerciseIsAnsweredRef.current = chordExerciseIsAnswered
    practiceAnswerModeRef.current = practiceAnswerMode
  }, [handleMIDINoteInput, nextChordExercise, nextScaleExercise, generateNewTarget, chordExerciseIsAnswered, practiceAnswerMode])

  // 安全网：辨音模式下如果 highlightedTargetPosition 为 null，重新生成目标位置
  useEffect(() => {
    if (activeTab !== 'practice' || practiceAnswerMode !== 'buttons') return
    if (!highlightedTargetPosition) {
      logger.debug('辨音模式安全网：highlightedTargetPosition 为 null，重新生成目标')
      generateNewTarget()
    }
  }, [activeTab, practiceAnswerMode, highlightedTargetPosition, generateNewTarget])

  // 练习开始时自动聚焦到练习卡片
  useEffect(() => {
    if (isPlaying && practiceCardRef.current) {
      practiceCardRef.current.focus()
    }
  }, [isPlaying, activeTab])

  // 屏幕常亮功能
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isPlaying) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          logger.debug('屏幕常亮已启用')
        }
      } catch (err) {
        logger.debug('无法启用屏幕常亮:', err)
      }
    }

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        wakeLockRef.current = null
        logger.debug('屏幕常亮已释放')
      }
    }

    if (isPlaying) {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }

    // 页面可见性变化时重新请求
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      releaseWakeLock()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isPlaying])

  // 和弦转换练习：当前和弦变化时预生成下一题
  useEffect(() => {
    if (activeTab === "chord" && isPlaying) {
      const chords = customChords.length > 0 ? customChords : (selectedSong.chords || []).map(c => parseChord(c))
      if (chords.length === 0) return

      let nextIndex: number
      if (chordPlayOrder === "random") {
        nextIndex = Math.floor(Math.random() * chords.length)
      } else if (chordPlayOrder === "desc") {
        nextIndex = currentChordIndex === 0 ? chords.length - 1 : currentChordIndex - 1
      } else {
        nextIndex = (currentChordIndex + 1) % chords.length
      }

      const chord = chords[nextIndex]
      if (chord) {
        setNextChordInfo({
          index: nextIndex,
          root: chord.root,
          type: chord.type,
          bass: chord.bass,
          degrees: getChordDegrees(chord.type, practiceLevel, getLevelOptions())
        })
      }
    }
  }, [activeTab, isPlaying, currentChordIndex, customChords, selectedSong, chordPlayOrder, progressionKey, practiceLevel, getLevelOptions])

  // 处理指板点击
  const handleFretClick = useCallback((stringIndex: number, fret: number) => {
    const clickedNote = getNoteAtPosition(stringIndex, fret)
    
    if (isPlaying) {
      const key = `${stringIndex}-${fret}`
      
      // 判断答案是否正确（用于显示颜色）
      let isCorrect = false
      
      switch (activeTab) {
        case "practice":
          // 找音练习：点击的音等于目标音
          isCorrect = clickedNote === targetNote
          break
          
        case "chord_exercise":
          // 和弦练习：点击的音是当前需要答的音
          if (chordExerciseTargetChord && chordExerciseSequence.length > 0) {
            const currentDegree = chordExerciseSequence[chordExerciseCurrentStep]
            const noteIdx = getNoteIndex(clickedNote)
            const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
            const normalizedType = normalizeChordType(chordExerciseTargetChord.type)
            const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordExerciseTargetChord.type)
            if (chordType && currentDegree) {
              const degreeToSemitone: Record<string, number> = {
                "1": 0, "b9": 1, "9": 2, "#9": 3, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8,
                "b6": 8, "6": 9, "7": 11, "b7": 10, "maj7": 11, "bb7": 9,
                "b13": 8, "13": 9, "11": 5, "#11": 6
              }
              const targetInterval = degreeToSemitone[currentDegree]
              const clickedInterval = (noteIdx - rootIdx + 12) % 12
              isCorrect = clickedInterval === targetInterval
            }
          }
          break
          
        case "scale":
          // 音阶练习：点击的音是当前需要答的音
          if (scaleExerciseSequence.length > 0) {
            const currentDegree = scaleExerciseSequence[scaleExerciseCurrentStep]
            const noteIdx = getNoteIndex(clickedNote)
            const keyIdx = getNoteIndex(scaleKey)
            const semitoneToDegree: Record<number, string> = {
              0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
              6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
            }
            const clickedInterval = (noteIdx - keyIdx + 12) % 12
            const clickedDegree = semitoneToDegree[clickedInterval]
            isCorrect = clickedDegree === currentDegree
          }
          break
          
        case "interval":
          // 音程练习：点击的音是目标音程音
          if (currentIntervalExercise) {
            const noteIdx = getNoteIndex(clickedNote)
            const rootIdx = getNoteIndex(currentIntervalExercise.rootNote)
            const clickedInterval = (noteIdx - rootIdx + 12) % 12
            // 先找根音模式：根音未完成时根音为正确答案
            const intervalsArr = currentIntervalExercise.currentIntervalDisplay.split(' ')
            const rootCompleted = intervalsArr.some((intv, i) => intv === '1' && currentIntervalExercise.completedIntervals.includes(i))
            if (findRootFirst && !rootCompleted) {
              isCorrect = clickedInterval === 0
            } else {
              const targetInterval = currentIntervalExercise.interval?.semitones % 12
              isCorrect = clickedInterval === targetInterval
            }
          }
          break
          
        case "chord":
          // 和弦转换练习：点击的音在当前和弦中
          {
            const chords = transposedChords
            const currentChord = chords[currentChordIndex]
            if (currentChord) {
              const noteIdx = getNoteIndex(clickedNote)
              const rootIdx = getNoteIndex(currentChord.root)
              const normalizedType = normalizeChordType(currentChord.type)
              const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === currentChord.type || ct.symbol === currentChord.type)
              if (chordType) {
                const interval = (noteIdx - rootIdx + 12) % 12
                isCorrect = chordType.intervals.includes(interval)
              }
            }
          }
          break
      }
      
      setHighlightedFrets(prev => new Map(prev).set(key, isCorrect))
      
      if (isCorrect) {
        triggerCorrectFeedback(clickedNote)
      } else {
        triggerWrongFeedback(clickedNote)
      }

      playFeedbackSound(isCorrect)
      
      setTimeout(() => {
        setHighlightedFrets(prev => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }, 500)
      
      setTimeout(() => {
        handleMIDINoteInput(clickedNote)
      }, 100)
    }
  }, [isPlaying, handleMIDINoteInput, activeTab, targetNote, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, scaleExerciseSequence, scaleExerciseCurrentStep, scaleKey, currentIntervalExercise, rootNote, customChords, selectedSong, currentChordIndex, playFeedbackSound, findRootFirst])

  const updateLevelOptions = useCallback((levelId: string) => {
    const level = ALL_SOLO_LEVELS.find(l => l.id === levelId)
    if (level) {
      setLevelOrderOption(level.orderOption)
      setLevelRandomOption(level.randomOption)
      setLevelStartingInterval(level.startingIntervalOption)
      setLevelForceNaturalFive(level.forceNaturalFive)
      setLevelNotesPerChord(level.notesPerChord)
      setLevelEndOnStartingInterval(level.endOnStartingInterval || false)
      setLevelUsePassingNoteBebopScale(level.usePassingNoteBebopScale || false)
    } else {
      setLevelOrderOption(false)
      setLevelRandomOption(false)
      setLevelStartingInterval("any")
      setLevelForceNaturalFive(true)
      setLevelNotesPerChord(1)
      setLevelEndOnStartingInterval(false)
      setLevelUsePassingNoteBebopScale(false)
    }
  }, [])

  useEffect(() => {
    updateLevelOptions(practiceLevel)
  }, [practiceLevel, updateLevelOptions])

  const pausePractice = useCallback(() => {
    if (isPlaying && !isPracticePaused) {
      setIsPracticePaused(true)
      setPracticeElapsedTime(prev => prev + (Date.now() - (practiceSessionStartTime || Date.now())))
    }
  }, [isPlaying, isPracticePaused, practiceSessionStartTime])

  const resumePractice = useCallback(() => {
    if (isPlaying && isPracticePaused) {
      setIsPracticePaused(false)
      setPracticeSessionStartTime(Date.now())
    }
  }, [isPlaying, isPracticePaused])

  const togglePausePractice = useCallback(() => {
    if (isPracticePaused) {
      resumePractice()
    } else {
      pausePractice()
    }
  }, [isPracticePaused, pausePractice, resumePractice])

  // 开始/停止练习
  const togglePractice = useCallback(() => {
    if (!isPlaying) {
      setScore({ correct: 0, total: 0 })
      // 根据活动标签设置时长
      let timeInSeconds = practiceTime
      if (activeTab === "practice") {
        timeInSeconds = pitchFindingTime * 60
        // 显示练习建议
        if (showPracticeSuggestions) {
          const randomIndex = Math.floor(Math.random() * PRACTICE_SUGGESTIONS.length)
          setCurrentPracticeSuggestion(PRACTICE_SUGGESTIONS[randomIndex])
        } else {
          setCurrentPracticeSuggestion("")
        }
      } else if (activeTab === "interval") {
        timeInSeconds = intervalPracticeDuration * 60
      }
      setTimeLeft(timeInSeconds)
      generateNewTarget()
      setIntervalPracticeStep("root")
      // 重置音程练习队列
      if (activeTab === "interval") {
        // 使用函数式更新避免依赖循环
        setIntervalExerciseQueue(prev => {
          if (selectedIntervals.length === 0) return []
          let queue = [...selectedIntervals]
          if (intervalDirection === "down") {
            queue = queue.map(idx => {
              const interval = INTERVALS[idx]
              const downSemitones = (12 - interval.semitones) % 12
              const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
              return downIndex !== -1 ? downIndex : idx
            })
          } else if (intervalDirection === "random") {
            queue = queue.map(idx => {
              if (Math.random() > 0.5) {
                const interval = INTERVALS[idx]
                const downSemitones = (12 - interval.semitones) % 12
                const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
                return downIndex !== -1 ? downIndex : idx
              }
              return idx
            })
          }
          if (intervalRandomizeOrder) {
            queue = queue.sort(() => Math.random() - 0.5)
          }
          return queue
        })
        setIntervalCurrentQueueIndex(0)
        // 延迟执行以等待状态更新
        setTimeout(() => {
          generateIntervalExerciseRef.current?.()
        }, 0)
      }
      if (activeTab === "chord_exercise") {
        generateChordExercise()
      }
      if (activeTab === "scale") {
        generateScaleExercise()
      }
      if (activeTab === "chord") {
        setCurrentChordIndex(0)
        setChordDegreeCurrentStep(0)
        setNextChordInfo(null)
        setLastChordNote(null)
      }
      setIsPlaying(true)
      setIsPracticePaused(false)
      setPracticeSessionStartTime(Date.now())
      setPracticeElapsedTime(0)
    } else {
      setIsPlaying(false)
      setIsPracticePaused(false)
      setHighlightedFrets(new Map())
      setHighlightedTargetPosition(null)
      setPracticeSessionStartTime(null)
    }
  }, [isPlaying, activeTab, pitchFindingTime, practiceTime, intervalPracticeDuration, selectedIntervals, intervalDirection, intervalRandomizeOrder, generateNewTarget, generateChordExercise, generateScaleExercise])

  // 重置练习
  const resetPractice = useCallback(() => {
    setIsPlaying(false)
    setIsPracticePaused(false)
    setScore({ correct: 0, total: 0 })
    setTimeLeft(practiceTime)
    setHighlightedFrets(new Map())
    setHighlightedTargetPosition(null)
    setIntervalPracticeStep("root")
    setCurrentIntervalExercise(null)
    setPracticeSessionStartTime(null)
    setPracticeElapsedTime(0)
    setShowFretboard(false)
    setShowIntervalFretboard(false)
    setShowChordFretboard(false)
    setShowChordExerciseFretboard(false)
    setShowScaleFretboard(false)
    setChordExerciseTargetChord(null)
    setChordExerciseSequence([])
    setChordExerciseCurrentStep(0)
    setScaleExerciseSequence([])
    setScaleExerciseCurrentStep(0)
    setIntervalPracticeStep("root")
    setChordDegreeCurrentStep(0)
    setNextChordInfo(null)
    setNextChordExerciseInfo(null)
    setNextScaleExerciseInfo(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fretmaster-practice-state')
    }
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current)
      cooldownRef.current = null
    }
    isCoolingDownRef.current = false
  }, [practiceTime])

  // 处理标签切换 - 使用 useRef 避免依赖 isPlaying 变化
  const handleTabChange = useCallback((tabId: string) => {
    if (isPlayingRef.current) {
      resetPractice()
    }
    setActiveTab(tabId)
  }, [resetPractice])

  // 优化键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault()
      if (isPlayingRef.current) {
        switch (activeTabRef.current) {
          case 'practice':
            generateNewTargetRef.current?.()
            break
          case 'interval':
            generateIntervalExerciseRef.current?.()
            break
          case 'chord':
            nextChordRef.current?.()
            break
          case 'chord_exercise':
            nextChordExerciseRef.current?.()
            break
          case 'scale':
            nextScaleExerciseRef.current?.()
            break
        }
      } else {
        switch (activeTabRef.current) {
          case 'practice':
            setShowFretboard(false)
            break
          case 'interval':
            setShowIntervalFretboard(false)
            break
          case 'chord':
            setShowChordFretboard(false)
            break
          case 'chord_exercise':
            setShowChordExerciseFretboard(false)
            break
          case 'scale':
            setShowScaleFretboard(false)
            break
        }
      }
      return
    }
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') {
      if (!isPlayingRef.current) return
      e.preventDefault()
      switch (activeTabRef.current) {
        case 'practice':
          generateNewTargetRef.current?.()
          break
        case 'interval':
          generateIntervalExerciseRef.current?.()
          break
        case 'chord':
          nextChordRef.current?.()
          break
        case 'chord_exercise':
          nextChordExerciseRef.current?.()
          break
        case 'scale':
          nextScaleExerciseRef.current?.()
          break
      }
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      if (!isPlayingRef.current) return
      e.preventDefault()
      // 上箭头 - 显示指板（与快捷键说明一致）
      switch (activeTabRef.current) {
        case 'practice':
          setShowFretboard(true)
          break
        case 'interval':
          setShowIntervalFretboard(true)
          break
        case 'chord':
          setShowChordFretboard(true)
          break
        case 'chord_exercise':
          setShowChordExerciseFretboard(true)
          break
        case 'scale':
          setShowScaleFretboard(true)
          break
      }
    }
  }, [])

  // 下一和弦
  const nextChord = useCallback(() => {
    // 重置和弦音步骤
    setChordDegreeCurrentStep(0)
    
    // 使用预生成的下一题信息
    if (nextChordInfo) {
      const chords = customChords.length > 0 ? customChords : (selectedSong.chords || []).map(c => parseChord(c))
      const nextIndex = nextChordInfo.index
      // 检测是否完成一轮（索引回到0且之前不是0）
      if (nextIndex === 0 && currentChordIndex === chords.length - 1) {
        // 完成一轮所有和弦，记录统计
        recordPractice('chord_progression', selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name)
        // 如果开启随机转调，随机选择新的调
        if (shouldRandomizeKeyOnRepeat && progressionRepeat) {
          const allKeys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
          const newKey = allKeys[Math.floor(Math.random() * allKeys.length)]
          setProgressionKey(newKey)
          logger.debug('随机转调到:', newKey)
        }
      }
      setCurrentChordIndex(nextIndex)
    } else {
      // 如果没有预览信息，重新计算
      const chords = customChords.length > 0 ? customChords : (selectedSong.chords || []).map(c => parseChord(c))
      if (chords.length === 0) return
      let nextIndex: number
      if (chordPlayOrder === "random") {
        nextIndex = Math.floor(Math.random() * chords.length)
        setCurrentChordIndex(nextIndex)
      } else if (chordPlayOrder === "desc") {
        nextIndex = currentChordIndex === 0 ? chords.length - 1 : currentChordIndex - 1
        // 检测是否完成一轮（倒序时，索引变为最后一个且之前是第一个）
        if (nextIndex === chords.length - 1 && currentChordIndex === 0) {
          recordPractice('chord_progression', selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name)
          // 如果开启随机转调，随机选择新的调
          if (shouldRandomizeKeyOnRepeat && progressionRepeat) {
            const allKeys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
            const newKey = allKeys[Math.floor(Math.random() * allKeys.length)]
            setProgressionKey(newKey)
            logger.debug('随机转调到:', newKey)
          }
        }
        setCurrentChordIndex(nextIndex)
      } else {
        nextIndex = (currentChordIndex + 1) % chords.length
        // 检测是否完成一轮（正序时，索引变为0且之前是最后一个）
        if (nextIndex === 0 && currentChordIndex === chords.length - 1) {
          recordPractice('chord_progression', selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name)
          // 如果开启随机转调，随机选择新的调
          if (shouldRandomizeKeyOnRepeat && progressionRepeat) {
            const allKeys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
            const newKey = allKeys[Math.floor(Math.random() * allKeys.length)]
            setProgressionKey(newKey)
            logger.debug('随机转调到:', newKey)
          }
        }
        setCurrentChordIndex(nextIndex)
      }
    }
  }, [nextChordInfo, customChords, selectedSong, chordPlayOrder, currentChordIndex, recordPractice, t, shouldRandomizeKeyOnRepeat, progressionRepeat])

  // 单独更新 nextChordRef（避免循环依赖）
  useEffect(() => {
    nextChordRef.current = nextChord
  }, [nextChord])

  // 键盘事件监听 - 全局快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 忽略输入框中的按键
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
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

      // F - 切换全屏模式
      if ((event.key === 'f' || event.key === 'F') && isPlaying) {
        event.preventDefault()
        setFullscreenMode(!isFullscreen)
        return
      }

      // M - 切换麦克风
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        setMicEnabled(!micEnabled)
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

      // 上箭头 - 显示指板（与快捷键说明一致）
      if (event.key === 'ArrowUp' && isPlaying) {
        event.preventDefault()
        // 根据当前练习 tab 显示对应的指板
        if (activeTab === 'practice') {
          setShowFretboard(true)
        } else if (activeTab === 'interval') {
          setShowIntervalFretboard(true)
        } else if (activeTab === 'chord') {
          setShowChordFretboard(true)
        } else if (activeTab === 'chord_exercise') {
          setShowChordExerciseFretboard(true)
        } else if (activeTab === 'scale') {
          setShowScaleFretboard(true)
        }
        setShowAllNotes(true)
        return
      }

      // 下箭头 - 隐藏指板
      if (event.key === 'ArrowDown' && isPlaying) {
        event.preventDefault()
        // 根据当前练习 tab 隐藏对应的指板
        if (activeTab === 'practice') {
          setShowFretboard(false)
        } else if (activeTab === 'interval') {
          setShowIntervalFretboard(false)
        } else if (activeTab === 'chord') {
          setShowChordFretboard(false)
        } else if (activeTab === 'chord_exercise') {
          setShowChordExerciseFretboard(false)
        } else if (activeTab === 'scale') {
          setShowScaleFretboard(false)
        }
        setShowAllNotes(false)
        return
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen, isPlaying, togglePractice, activeTab, generateNewTarget, generateIntervalExercise, nextChordExercise, nextScaleExercise, nextChord])

  // 获取音符颜色
  const getNoteButtonColor = useCallback((note: string, stringIndex: number, fret: number) => {
    const key = `${stringIndex}-${fret}`
    
    // 优先显示点击反馈（正确绿色，错误红色）
    if (highlightedFrets.has(key)) {
      const isCorrect = highlightedFrets.get(key)
      return isCorrect
        ? "bg-green-500 text-white" 
        : "bg-red-500 text-white"
    }
    
    if (activeTab === "practice") {
      // 优先显示点击反馈（正确绿色，错误红色）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white" 
          : "bg-red-500 text-white"
      }
      
      // 按钮答题模式下，高亮显示目标位置
      if (practiceAnswerMode === "buttons" && highlightedTargetPosition) {
        if (stringIndex === highlightedTargetPosition.stringIndex && fret === highlightedTargetPosition.fret) {
          return "bg-primary/80 text-primary-foreground"
        }
      }
      
      if (showAllNotes && note === targetNote) {
        return "bg-primary/80 text-primary-foreground"
      }
      // 未开始练习时只显示 hover 效果
      if (!isPlaying) {
        return "hover:bg-muted"
      }
    }

    if (activeTab === "chord_exercise") {
      // 和弦练习模式 - 色块按和弦转换练习样式
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white" 
          : "bg-red-500 text-white"
      }
      
      // 开始练习后显示当前和弦的所有音 - 按和弦转换练习色块样式
      if (isPlaying && chordExerciseTargetChord) {
        const noteIdx = getNoteIndex(note)
        const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
        const normalizedType = normalizeChordType(chordExerciseTargetChord.type)
        const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordExerciseTargetChord.type)
        
        if (chordType) {
          const interval = (noteIdx - rootIdx + 12) % 12
          
          // 检查这个音是否在当前和弦中
          if (!chordType.intervals.includes(interval)) {
            return "hover:bg-muted/50"
          }

          // 根音用柔和的蓝色
          if (noteIdx === rootIdx) {
            return "bg-blue-400/60 text-white"
          }
          // 其他和弦音用柔和的绿色
          return "bg-emerald-400/50 text-white"
        }
      }
      // 不在和弦中的音，只显示 hover 效果
      return "hover:bg-muted/50"
    }

    if (activeTab === "interval") {
      // 音程练习 - 色块按和弦转换练习样式
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white" 
          : "bg-red-500 text-white"
      }
      
      // 练习未开始时只显示 hover 效果
      if (!isPlaying) {
        return "hover:bg-muted/50"
      }

      // 开始练习后显示当前音程的所有音 - 按和弦转换练习色块样式
      const noteIdx = getNoteIndex(note)
      const rootIdx = getNoteIndex(rootNote)
      
      // 根音用柔和的蓝色
      if (noteIdx === rootIdx) {
        return "bg-blue-400/60 text-white"
      }
      
      // 选中的音程音用柔和的绿色
      const interval = (noteIdx - rootIdx + 12) % 12
      if (selectedIntervals.some(i => INTERVALS[i].semitones % 12 === interval)) {
        return "bg-emerald-400/50 text-white"
      }
      
      // 不在选中音程中的音，只显示 hover 效果
      return "hover:bg-muted/50"
    }

    if (activeTab === "scale") {
      // 音阶练习模式 - 色块按和弦转换练习样式
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white" 
          : "bg-red-500 text-white"
      }
      
      // 开始练习后显示当前音阶的所有音 - 按和弦转换练习色块样式
      if (isPlaying && scaleExerciseSequence.length > 0) {
        const noteIdx = getNoteIndex(note)
        const keyIdx = getNoteIndex(scaleKey)

        // 检查这个音是否在音阶中
        const interval = (noteIdx - keyIdx + 12) % 12
        if (!selectedScale.notes.includes(interval)) {
          return "hover:bg-muted/50"
        }

        // 根音（1级）用柔和的蓝色
        if (interval === 0) {
          return "bg-blue-400/60 text-white"
        }
        // 其他音阶音用柔和的绿色
        return "bg-emerald-400/50 text-white"
      }

      // 不在音阶中的音，只显示 hover 效果
      return "hover:bg-muted/50"
    }

    if (activeTab === "chord") {
      // 和弦转换练习 - 指板样式参考找音练习
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色） 找音练习样式
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white" 
          : "bg-red-500 text-white"
      }
      
      const chords = transposedChords
      const currentChord = chords[currentChordIndex]
      if (!currentChord) return "hover:bg-muted/50"

      const noteIdx = getNoteIndex(note)
      const rootIdx = getNoteIndex(currentChord.root)

      // 检查这个音是否在当前和弦中
      const normalizedType = normalizeChordType(currentChord.type)
      const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === currentChord.type || ct.symbol === currentChord.type)
      if (!chordType) return "hover:bg-muted/50"

      const interval = (noteIdx - rootIdx + 12) % 12
      if (!chordType.intervals.includes(interval)) {
        // 不在和弦中的音，只显示 hover 效果
        return "hover:bg-muted/50"
      }

      // 根音用柔和的蓝色
      if (noteIdx === rootIdx) {
        return "bg-blue-400/60 text-white"
      }

      // 其他和弦音用柔和的绿色
      return "bg-emerald-400/50 text-white"
    }

    // 默认返回 hover 效果样式
    return "hover:bg-muted/50"
  }, [activeTab, highlightedFrets, targetNote, showAllNotes, isPlaying, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, rootNote, selectedIntervals, scaleKey, selectedScale, customChords, selectedSong, currentChordIndex, practiceLevel, practiceAnswerMode, highlightedTargetPosition])

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // 切换音程选择
  const toggleInterval = (index: number) => {
    setSelectedIntervals(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  // 添加自定义和弦
  const addCustomChord = () => {
    setCustomChords(prev => [...prev, { root: newChordRoot, type: newChordType, bass: newChordBass }])
  }

  // 移除自定义和弦
  const removeCustomChord = (index: number) => {
    setCustomChords(prev => prev.filter((_, i) => i !== index))
  }

  // 清空自定义和弦
  const clearCustomChords = () => {
    setCustomChords([])
  }

  // 保存自定义和弦序列到本地存储
  const saveCustomChords = () => {
    if (customChords.length === 0) {
      toast.error(t('custom_chord_empty'))
      return
    }
    const data = {
      name: customChordName || t('custom_chord_unnamed'),
      sequence: customChords
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('customChordSequence', JSON.stringify(data))
    }
    toast.success(t('custom_chord_saved'))
  }

  // 从本地存储加载自定义和弦序列
  const loadCustomChords = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('customChordSequence')
      if (saved) {
        try {
          const data = JSON.parse(saved)
          if (data.sequence && data.sequence.length > 0) {
            setCustomChords(data.sequence)
            setCustomChordName(data.name || '')
            toast.success(t('custom_chord_loaded'))
          } else {
            toast.error(t('custom_chord_empty_load'))
          }
        } catch (e) {
          toast.error(t('custom_chord_load_error'))
        }
      } else {
        toast.error(t('custom_chord_not_found'))
      }
    } else {
      toast.error(t('custom_chord_not_found'))
    }
  }

  // 解析iReal Pro格式
  const parseIrealPro = (text: string) => {
    const chords: { root: string; type: string; bass?: string }[] = []
    
    // 简单解析 - 按空格或|分割
    const tokens = text.split(/[\s|]+/).filter(t => t.trim())
    
    for (const token of tokens) {
      // 跳过特殊标记
      if (token.match(/^[\[\]\(\)\*\r\n]/)) continue
      
      const parsed = parseChord(token)
      if (parsed.root) {
        chords.push(parsed)
      }
    }
    
    return chords
  }

  // 导入iReal Pro
  const importIrealPro = () => {
    const chords = parseIrealPro(irealInput)
    if (chords.length > 0) {
      setCustomChords(chords)
      toast.success(t('import_success'))
      setIrealInput("")
    } else {
      toast.error(t('error_occurred'))
    }
  }

  // 导出自定义和弦为简化格式
  const exportCustomChords = () => {
    if (customChords.length === 0) {
      toast.error(t('custom_chord_empty'))
      return
    }
    
    const chordText = customChords.map(chord => {
      const chordTypeName = getChordDisplayName(chord.type, chordScaleDisplay)
      const displayName = `${chord.root}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay) ? '' : chordTypeName}${chord.bass ? '/' + chord.bass : ''}`
      return displayName
    }).join(' | ')
    
    const exportData = {
      name: customChordName || t('custom_chord_unnamed'),
      chords: chordText
    }
    
    const exportString = `${exportData.name}\n${exportData.chords}`
    
    navigator.clipboard.writeText(exportString).then(() => {
      toast.success(t('export_success'))
    }).catch(() => {
      const blob = new Blob([exportString], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportData.name}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(t('export_success'))
    })
  }

  // 获取转调后的和弦列表 - 使用useMemo缓存
  const transposedChords = useMemo(() => {
    if (customChords.length > 0) {
      return customChords
    }
    const songKey = selectedSong.key || "C"
    // 提取歌曲调性的音名部分进行比较
    const songKeyNote = songKey.endsWith('m') ? songKey.slice(0, -1) : songKey
    if (progressionKey === songKeyNote) {
      return selectedSong.chords.map(c => parseChord(c))
    }
    // 转调
    return selectedSong.chords.map(chordString => {
      const transposed = transposeChord(chordString, songKeyNote, progressionKey)
      return parseChord(transposed)
    })
  }, [customChords, selectedSong, progressionKey])
  
  // 更新 getTransposedChordsRef
  useEffect(() => { getTransposedChordsRef.current = () => transposedChords }, [transposedChords])

  // 获取当前和弦显示
  const getCurrentChordDisplay = () => {
    const chords = transposedChords
    const chord = chords[currentChordIndex]
    if (!chord) return ""
    const chordTypeName = getChordDisplayName(chord.type, chordScaleDisplay)
    const displayName = `${normalizeNoteName(chord.root)}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay) ? '' : normalizeNoteName(chordTypeName)}${chord.bass ? '/' + normalizeNoteName(chord.bass) : ''}`
    return displayName
  }

  // 获取下一题和弦显示 - 使用预生成的信息
  const getNextChordDisplay = () => {
    if (nextChordInfo) {
      return nextChordInfo
    }
    return null
  }

  // Slider回调 - 必须在顶层调用，不能在JSX中内联useCallback
  const handleReferenceFrequencyChange = useCallback(([v]: number[]) => setReferenceFrequency(v), [])
  const handlePracticeTimeChange = useCallback(([v]: number[]) => setPracticeTime(v), [])
  const handleFretCountChange = useCallback(([v]: number[]) => setFretCount(v), [])
  const handleCooldownDurationChange = useCallback(([v]: number[]) => setCooldownDuration(v), [])
  const handleMetronomeBpmChange = useCallback(([v]: number[]) => setMetronomeBpm(v), [])
  const handleInputGainChange = useCallback(([v]: number[]) => setInputGain(v / 100), [])

  // ==================== 渲染 ====================

  return (
    <OnboardingProvider t={t}>
    <TooltipProvider>
      <div
        className="h-screen bg-background flex flex-col relative overflow-hidden"
        style={{
          zoom: displayScale !== 1 ? displayScale : undefined,
          height: '100dvh',
        }}
      >
        {/* 节拍器闪烁层 */}
        <div 
          id="metronome-flash-layer"
          className="fixed inset-0 pointer-events-none z-[90] opacity-0 transition-opacity duration-100"
          style={{ backgroundColor: 'hsl(0 0% 100% / 0.3)' }}
        />
        {/* Header */}
        <header className="border-b border-border/50 bg-card sticky top-0 z-50 shadow-sm">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Guitar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-foreground">FretMaster</h1>
                <p className="text-[10px] text-muted-foreground">{t('app_title').replace('🎸 ', '')}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Score display */}
              {isPlaying && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {score.correct}/{score.total}
                  </Badge>
                  {score.total > 0 && (
                    <Badge variant={score.correct / score.total >= 0.7 ? "default" : "secondary"} className="text-xs">
                      {Math.round((score.correct / score.total) * 100)}%
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Timer */}
              {isPlaying && practiceTime > 0 && (
                <Badge variant="outline" className="font-mono gap-1 text-xs">
                  <Timer className="h-3 w-3" />
                  {formatTime(timeLeft)}
                </Badge>
              )}
              
              {/* Detected Pitch */}
              {detectedPitch && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs bg-primary/10">
                    {detectedPitch}
                  </Badge>
                  {detectedCents !== null && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "font-mono text-xs",
                        detectedCents <= 15 ? "bg-green-500/20 text-green-600" :
                        detectedCents <= 35 ? "bg-yellow-500/20 text-yellow-600" :
                        "bg-red-500/20 text-red-600"
                      )}
                    >
                      {detectedCents < 0 ? '' : '+'}{detectedCents.toFixed(0)}¢
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Keyboard Shortcuts Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowShortcutsHelp(true)}
                title={t('keyboard_shortcuts')}
              >
                <Keyboard className="h-4 w-4" />
              </Button>

              {/* Tuner */}
              <Sheet open={tunerOpen} onOpenChange={setTunerOpen}>
                <SheetTrigger asChild>
                  <div data-onboarding="tuner">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('nav_tuner')}
                      aria-label={t('nav_tuner')}
                    >
                      <Activity className="h-4 w-4" />
                    </Button>
                  </div>
                </SheetTrigger>
                <SheetContent className="w-80 overflow-y-auto">
                  <SheetHeader className="px-4">
                    <SheetTitle>{t('tuner_title')}</SheetTitle>
                  </SheetHeader>

                  <div className="space-y-6 py-4 px-4">
                    {/* 调音器显示*/}
                    <div className="space-y-4">
                      {/* 主显示区域*/}
                      <div className="bg-card border rounded-lg p-6 text-center space-y-4">
                        {/* 检测到的音高*/}
                        <div className="text-6xl font-bold text-primary">
                          {detectedNote}
                        </div>

                        {/* 频率显示 */}
                        <div className="text-sm text-muted-foreground">
                          {detectedFrequency > 0 ? `${detectedFrequency} Hz` : '--'}
                        </div>

                        {/* 音分偏差指示器*/}
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>-50¢</span>
                            <span className={Math.abs(cents) <= 5 ? 'text-green-500 font-medium' : ''}>
                              {cents > 0 ? '+' : ''}{cents}¢
                            </span>
                            <span>+50¢</span>
                          </div>
                          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary/50" />
                            <div
                              className="absolute top-0 bottom-0 w-1.5 rounded-full transition-all duration-100"
                              style={{
                                left: `${50 + Math.max(-50, Math.min(50, cents))}%`,
                                transform: 'translateX(-50%)',
                                backgroundColor: Math.abs(cents) <= 5 ? '#22c55e' : Math.abs(cents) <= 20 ? '#eab308' : '#ef4444'
                              }}
                            />
                          </div>
                          <div className="text-center text-xs">
                            {detectedFrequency > 0 && (
                              <span className={Math.abs(cents) <= 5 ? 'text-green-500' : cents < 0 ? 'text-yellow-500' : 'text-red-500'}>
                                {Math.abs(cents) <= 5 ? t('tuner_in_tune') : cents < 0 ? t('tuner_too_low') : t('tuner_too_high')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 控制按钮 */}
                      <Button
                        onClick={toggleTuner}
                        variant={tunerActive ? "destructive" : "default"}
                        className="w-full"
                      >
                        {tunerActive ? (
                          <>
                            <MicOff className="h-4 w-4 mr-2" />
                            {t('tuner_stop')}
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4 mr-2" />
                            {t('tuner_start')}
                          </>
                        )}
                      </Button>

                      {/* 参考频率设置*/}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('tuner_reference')}</span>
                          <span className="font-mono">{referenceFrequency} Hz</span>
                        </div>
                        <Slider
                          value={[referenceFrequency]}
                          onValueChange={handleReferenceFrequencyChange}
                          min={430}
                          max={450}
                          step={1}
                        />
                      </div>

                      {/* 吉他标准音参考*/}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">{t('tuner_strings')}</h4>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {[
                            { name: t('tuner_e6'), freq: 82.41 },
                            { name: t('tuner_a5'), freq: 110.00 },
                            { name: t('tuner_d4'), freq: 146.83 },
                            { name: t('tuner_g3'), freq: 196.00 },
                            { name: t('tuner_b2'), freq: 246.94 },
                            { name: t('tuner_e1'), freq: 329.63 },
                          ].map((string) => (
                            <div
                              key={string.name}
                              className="bg-muted/50 rounded px-2 py-1.5 text-center"
                            >
                              <div className="font-medium">{string.name}</div>
                              <div className="text-muted-foreground">{string.freq} Hz</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Settings */}
              <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
                <SheetTrigger asChild>
                  <div data-onboarding="settings">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={t('nav_settings')} aria-label={t('nav_settings')}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </SheetTrigger>
                <SheetContent className="w-80 overflow-y-auto">
                  <SheetHeader className="px-4">
                    <SheetTitle>{t('nav_settings')}</SheetTitle>
                  </SheetHeader>
                  
                  <ErrorBoundary>
                  <Accordion type="multiple" defaultValue={["practice","audio","display","data"]} className="py-4 px-4">
                    <AccordionItem value="practice" className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
                        <span className="flex items-center gap-2">
                          <SlidersHorizontal className="h-4 w-4" />
                          {t('settings_practice')}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('instrument_select')}</span>
                          <Select
                            value={user.instrument}
                            onValueChange={(v) => store.setInstrument(v as InstrumentType)}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="six_string_guitar">{t('instrument_guitar_6')}</SelectItem>
                              <SelectItem value="six_string_fourths">{t('instrument_guitar_6_fourths')}</SelectItem>
                              <SelectItem value="seven_string_guitar">{t('instrument_guitar_7')}</SelectItem>
                              <SelectItem value="seven_string_fourths">{t('instrument_guitar_7_fourths')}</SelectItem>
                              <SelectItem value="four_string_bass">{t('instrument_bass_4')}</SelectItem>
                              <SelectItem value="five_string_bass">{t('instrument_bass_5')}</SelectItem>
                              <SelectItem value="b_flat_horn">{t('instrument_horn_bflat')}</SelectItem>
                              <SelectItem value="e_flat_horn">{t('instrument_horn_eflat')}</SelectItem>
                              <SelectItem value="concert_pitch">{t('instrument_concert')}</SelectItem>
                              <SelectItem value="concert_pitch_minus_one">{t('instrument_concert_minus_one')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('practice_time')}</span>
                          <span className="font-mono">{practiceTime}s</span>
                        </div>
                        <Slider
                          value={[practiceTime]}
                          onValueChange={handlePracticeTimeChange}
                          min={30}
                          max={600}
                          step={30}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('fretboard_title')}</span>
                          <span className="font-mono">{fretCount} frets</span>
                        </div>
                        <Slider
                          value={[fretCount]}
                          onValueChange={handleFretCountChange}
                          min={12}
                          max={24}
                          step={1}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('device_cooldown_enabled')}</span>
                        <Switch checked={cooldownEnabled} onCheckedChange={setCooldownEnabled} />
                      </div>
                      {cooldownEnabled && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('device_cooldown_duration')}</span>
                            <span className="font-mono">{cooldownDuration}ms</span>
                          </div>
                          <Slider
                            value={[cooldownDuration]}
                            onValueChange={handleCooldownDurationChange}
                            min={200}
                            max={3000}
                            step={100}
                          />
                        </div>
                      )}
                      </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="metronome" className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
                        <span className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          {t('device_metronome')}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground" id="metronome-toggle-label">{t('device_metronome')}</span>
                        <Switch checked={metronomeEnabled} onCheckedChange={setMetronomeEnabled} aria-labelledby="metronome-toggle-label" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('device_tempo')}</span>
                          <span className="font-mono">{metronomeBpm} BPM</span>
                        </div>
                        <Slider
                          value={[metronomeBpm]}
                          onValueChange={handleMetronomeBpmChange}
                          min={40}
                          max={240}
                          step={1}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('metronome_sound')}</span>
                        <Switch checked={metronomeSound} onCheckedChange={setMetronomeSound} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('metronome_flash')}</span>
                        <Switch checked={metronomeFlash} onCheckedChange={setMetronomeFlash} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('metronome_visualize')}</span>
                        <Switch checked={metronomeSettings.visualize ?? false} onCheckedChange={(v) => store.setMetronomeSettings({ ...metronomeSettings, visualize: v })} />
                      </div>
                      </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="audio" className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
                        <span className="flex items-center gap-2">
                          <Volume2 className="h-4 w-4" />
                          {language === 'zh-CN' ? '音频与输入' : 'Audio & Input'}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-2">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Volume2 className="h-3.5 w-3.5" />
                      {t('feedback_sound')}
                    </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('feedback_sound_enabled')}</span>
                        <Switch checked={feedbackSoundSettings.enabled} onCheckedChange={store.setFeedbackSoundEnabled} />
                      </div>
                      {feedbackSoundSettings.enabled && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{t('correct_sound')}</span>
                            <Switch checked={feedbackSoundSettings.correctSound} onCheckedChange={store.setCorrectSoundEnabled} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{t('wrong_sound')}</span>
                            <Switch checked={feedbackSoundSettings.wrongSound} onCheckedChange={store.setWrongSoundEnabled} />
                          </div>
                        </>
                      )}
                    
                    <Separator className="my-1" />
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Mic className="h-3.5 w-3.5" />
                      {t('device_audio_input')}
                    </div>
                    
                    {!mounted ? (
                      <div className="space-y-2">
                        <div className="h-20 animate-pulse bg-muted rounded-lg" />
                      </div>
                    ) : isTauri ? (
                      <WindowsAudioSettings language={language as 'zh-CN' | 'en'} />
                    ) : (
                      <div className="space-y-2">
                        
                        {/* 权限请求提示 - 当没有设备或设备没有标签时显示 */}
                        {(audioDevices.length === 0 || audioDevices.every(d => !d.label)) && (
                          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600 dark:text-yellow-400">
                            <p className="mb-2">{audioDevices.length === 0 ? t('mic_permission_needed_for_device') : t('mic_permission_needed_for_label')}</p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={async () => {
                                try {
                                  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
                                    toast.error(t('browser_not_support_audio'))
                                    return
                                  }
                                  toast.info(t('requesting_mic_permission'))
                                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                                  stream.getTracks().forEach(track => track.stop())
                                  // 刷新设备列表
                                  await enumerateAudioDevices(false)
                                  // 检查是否成功获取设备
                                  const devices = await navigator.mediaDevices.enumerateDevices()
                                  const audioInputs = devices.filter(d => d.kind === 'audioinput')
                                  if (audioInputs.length > 0 && audioInputs.some(d => d.label)) {
                                    toast.success('已获取麦克风权限')
                                  } else if (audioInputs.length > 0) {
                                    toast.warning('已获取权限，但设备名称不可用')
                                  } else {
                                    toast.warning('未检测到音频输入设备')
                                  }
                                } catch (err: unknown) {
                                  console.error('麦克风权限错误', err)
                                  const error = err instanceof Error ? err : new Error(String(err))
                                  if (error.name === 'NotAllowedError') {
                                    toast.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风')
                                  } else if (error.name === 'NotFoundError') {
                                    toast.error('未找到麦克风设备')
                                  } else {
                                    toast.error('无法获取麦克风权限 ' + (error.message || '未知错误'))
                                  }
                                }
                              }}
                            >
                              请求麦克风权限
                            </Button>
                          </div>
                        )}
                        
                        <Select value={selectedAudioDevice} onValueChange={setSelectedAudioDevice}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('hint_select_device')} />
                          </SelectTrigger>
                          <SelectContent>
                            {audioDevices.map(device => (
                              <SelectItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `Device ${device.deviceId.slice(0, 8)}...`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-sm text-muted-foreground">{t('device_audio_input')}</span>
                            {micEnabled && (
                              <span className="text-xs text-green-500">
                                {useAudioWorklet ? 'AudioWorklet' : 'ScriptProcessor'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {audioInitializing && (
                              <span className="text-xs text-muted-foreground animate-pulse">
                                {language === 'zh-CN' ? '初始化中...' : 'Initializing...'}
                              </span>
                            )}
                            <Switch 
                              checked={micEnabled} 
                              disabled={audioInitializing}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  // 直接启动音频输入，不通过 useEffect
                                  setMicEnabled(true)
                                } else {
                                  setMicEnabled(false)
                                  stopAudioInput()
                                }
                              }} 
                            />
                          </div>
                        </div>
                        {audioError && (
                          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                            {audioError}
                          </div>
                        )}
                        <div className="flex items-center justify-between py-2 border-t border-border/50">
                          <div className="flex flex-col">
                            <span className="text-sm text-muted-foreground">
                              {language === 'zh-CN' ? '使用 AudioWorklet' : 'Use AudioWorklet'}
                            </span>
                            <span className="text-xs text-muted-foreground/60">
                              {language === 'zh-CN' ? '关闭则使用 ScriptProcessorNode' : 'Off to use ScriptProcessorNode'}
                            </span>
                          </div>
                          <Switch
                            checked={useAudioWorklet}
                            disabled={micEnabled}
                            onCheckedChange={(checked) => {
                              setUseAudioWorklet(checked)
                              logger.debug(`[音频模式] 切换为 ${checked ? 'AudioWorklet' : 'ScriptProcessorNode'}`)
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('device_gain')}</span>
                            <span className="font-mono">{Math.round(inputGain * 100)}%</span>
                          </div>
                          <Slider
                            value={[inputGain * 100]}
                            onValueChange={handleInputGainChange}
                            min={0}
                            max={200}
                            step={10}
                            disabled={!micEnabled}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('device_pitch_algorithm')}</span>
                          </div>
                          <Select 
                            value={audioSettings.pitchAlgorithm} 
                            onValueChange={(value) => store.setPitchAlgorithm(value as 'standard' | 'solo')}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="solo">{t('algorithm_solo')}</SelectItem>
                              <SelectItem value="standard">{t('algorithm_standard')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {language === 'zh-CN' 
                              ? 'SOLO算法使用FFT加速，检测速度更快' 
                              : 'SOLO algorithm uses FFT acceleration for faster detection'}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    <Separator className="my-1" />
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Piano className="h-3.5 w-3.5" />
                      {t('midi_support')}
                    </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('midi_enable')}</span>
                        <Switch checked={midiEnabled} onCheckedChange={setMidiEnabled} />
                      </div>
                      <Select value={selectedMidiDevice} onValueChange={setSelectedMidiDevice} disabled={!midiEnabled}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('midi_select_device')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">{t('random')}</SelectItem>
                          {midiDevices.map(device => (
                            <SelectItem key={device.id} value={device.id}>
                              {device.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {midiDevices.length > 0 
                          ? t('midi_device_detected').replace('{count}', String(midiDevices.length))
                          : t('midi_device_none')
                        }
                      </p>
                      </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="display" className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
                        <span className="flex items-center gap-2">
                          <Palette className="h-4 w-4" />
                          {language === 'zh-CN' ? '显示与外观' : 'Display & Appearance'}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-2">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {language === 'zh-CN' ? '全屏类型' : 'Fullscreen Type'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant={focusMode?.fullscreenMode === 'windowed' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => store.setFullscreenMode('windowed')}
                          >
                            {language === 'zh-CN' ? '窗口全屏' : 'Windowed'}
                          </Button>
                          <Button
                            variant={focusMode?.fullscreenMode === 'fullscreen' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => store.setFullscreenMode('fullscreen')}
                          >
                            {language === 'zh-CN' ? '真全屏' : 'Fullscreen'}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {language === 'zh-CN' 
                            ? '窗口全屏：保留窗口边框，可快速切换；真全屏：完全覆盖任务栏，沉浸式体验'
                            : 'Windowed: keep window borders for quick switching; Fullscreen: fully immersive, covers taskbar'}
                        </p>
                      </div>

                    <Separator className="my-1" />
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Globe className="h-3.5 w-3.5" />
                      {t('language')}
                    </div>
                      <div className="flex gap-2">
                        <Button
                          variant={language === 'zh-CN' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setLanguage('zh-CN')
                            setChordScaleDisplay('chinese')
                          }}
                          className="flex-1"
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          {t('lang_zh')}
                        </Button>
                        <Button
                          variant={language === 'en' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setLanguage('en')
                            setChordScaleDisplay('english')
                          }}
                          className="flex-1"
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          {t('lang_en')}
                        </Button>
                      </div>

                    <Separator className="my-1" />
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Palette className="h-3.5 w-3.5" />
                      {t('general_theme')}
                    </div>
                      <div className="flex gap-2">
                        <Button
                          variant={theme === 'dark' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTheme('dark')}
                          className="flex-1"
                        >
                          <Moon className="h-4 w-4 mr-2" />
                          {t('theme_dark')}
                        </Button>
                        <Button
                          variant={theme === 'light' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTheme('light')}
                          className="flex-1"
                        >
                          <Sun className="h-4 w-4 mr-2" />
                          {t('theme_light')}
                        </Button>
                      </div>

                    <Separator className="my-1" />
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Monitor className="h-3.5 w-3.5" />
                      {language === 'zh-CN' ? '显示大小' : 'Display Size'}
                    </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {language === 'zh-CN' ? '缩放比例' : 'Scale'}
                          </span>
                          <span className="font-mono">{Math.round(displayScale * 100)}%</span>
                        </div>
                        <Slider
                          value={[displayScale * 100]}
                          onValueChange={([v]) => setDisplayScale(v / 100)}
                          min={80}
                          max={150}
                          step={10}
                        />
                        <p className="text-xs text-muted-foreground">
                          {language === 'zh-CN' 
                            ? '调整界面整体大小，适用于高分辨率屏幕'
                            : 'Adjust overall UI size for high resolution screens'}
                        </p>
                      </div>

                    <Separator className="my-1" />
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Music className="h-3.5 w-3.5" />
                      {t('chord_scale_display')}
                    </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant={chordScaleDisplay === 'chinese' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setChordScaleDisplay('chinese')}
                        >
                          {t('display_chinese')}
                        </Button>
                        <Button
                          variant={chordScaleDisplay === 'english' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setChordScaleDisplay('english')}
                        >
                          {t('display_english')}
                        </Button>
                        <Button
                          variant={chordScaleDisplay === 'english_short' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setChordScaleDisplay('english_short')}
                        >
                          {t('display_english_short')}
                        </Button>
                        <Button
                          variant={chordScaleDisplay === 'jazz' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setChordScaleDisplay('jazz')}
                        >
                          {t('display_jazz')}
                        </Button>
                      </div>

                    <Separator className="my-1" />
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
                      <Music className="h-3.5 w-3.5" />
                      {language === 'zh-CN' ? '音符升降号显示' : 'Note Accidental Display'}
                    </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant={noteAccidentalDisplay === 'sharp' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNoteAccidentalDisplay('sharp')}
                        >
                          {language === 'zh-CN' ? '升号 ♯' : 'Sharp ♯'}
                        </Button>
                        <Button
                          variant={noteAccidentalDisplay === 'flat' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNoteAccidentalDisplay('flat')}
                        >
                          {language === 'zh-CN' ? '降号 ♭' : 'Flat ♭'}
                        </Button>
                        <Button
                          variant={noteAccidentalDisplay === 'mixed' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNoteAccidentalDisplay('mixed')}
                        >
                          {language === 'zh-CN' ? '混用' : 'Mixed'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {language === 'zh-CN' 
                          ? '升号：所有变化音用♯显示（如C♯, F♯）；降号：所有变化音用♭显示（如D♭, G♭）；混用：根据音名自动选择升降号'
                          : 'Sharp: display all accidentals as ♯ (e.g. C♯, F♯); Flat: display all as ♭ (e.g. D♭, G♭); Mixed: auto-select based on note name'}
                      </p>
                      </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="data" className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
                        <span className="flex items-center gap-2">
                          <Save className="h-4 w-4" />
                          {t('settings_management')}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-2">
                      <p className="text-xs text-muted-foreground">{t('reset_settings_hint')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={saveSettings}>
                          <Save className="h-4 w-4 mr-2" />
                          {t('btn_save')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={resetSettings}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          {t('btn_reset')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportSettings}>
                          <Download className="h-4 w-4 mr-2" />
                          {t('export_settings')}
                        </Button>
                        <label className="contents">
                          <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && importSettings(e.target.files[0])}
                          />
                          <Button variant="outline" size="sm" className="w-full">
                            <Upload className="h-4 w-4 mr-2" />
                            {t('import_settings')}
                          </Button>
                        </label>
                      </div>
                      </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="help" className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
                        <span className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4" />
                          {language === 'zh-CN' ? '帮助' : 'Help'}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          const { restartTutorial } = await import('@/components/onboarding')
                          restartTutorial()
                        }}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {t('restart_tutorial')}
                      </Button>
                      </AccordionContent>
                    </AccordionItem>

                    <div className="pt-2 border-t border-border/30">
                      <div className="flex items-center justify-between text-xs text-muted-foreground/50">
                        <span>Build</span>
                        <span className="font-mono">v{VERSION} ({BUILD_DATE_LOCAL})</span>
                      </div>
                    </div>
                  </Accordion>
                  </ErrorBoundary>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden h-0 min-h-0">
          {/* Sidebar */}
          <aside
            data-onboarding="practice-tabs"
            className={cn(
              "border-r border-border/50 bg-card hidden md:flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.03)]",
              sidebarCollapsed ? "w-14" : "w-56"
            )}
            style={{ transition: 'width 0.2s ease-in-out' }}
          >
            <div className="p-2 space-y-1" role="tablist" aria-label={t('nav_practice')}>
              {sidebarMenuItems.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleTabChange(mode.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                    activeTab === mode.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  style={{ willChange: 'background-color, color' }}
                  title={mode.label}
                  role="tab"
                  aria-selected={activeTab === mode.id}
                  aria-label={mode.label}
                >
                  <mode.Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>{mode.label}</span>}
                </button>
              ))}
            </div>
            
            <div className="mt-auto p-2">
              <button
                onClick={() => setSidebarCollapsed()}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-accent transition-colors"
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
          </aside>

          {/* Main Area */}
          <main className="flex-1 overflow-auto min-h-0 p-2 sm:p-4 pb-20 sm:pb-6">
            <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
              {/* Control Panel - 统计页面不显示*/}
              {activeTab !== "stats" && (
              <Card 
                ref={practiceCardRef}
                tabIndex={0} 
                onKeyDown={handleKeyDown}
                className="outline-none focus:ring-2 focus:ring-primary/50"
                role="region"
                aria-label={t('fretboard_title')}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {activeTab === "practice" && t('nav_practice')}
                      {activeTab === "interval" && t('nav_interval')}
                      {activeTab === "chord_exercise" && t('nav_chord_exercise')}
                      {activeTab === "chord" && t('nav_chord')}
                      {activeTab === "scale" && t('nav_scale')}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFullscreenMode(true)}
                        title={t('fullscreen_mode')}
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => store.setFocusModeSettings({ enabled: !focusMode?.enabled })}
                        title={t('focus_mode')}
                      >
                        <Target className="h-4 w-4" />
                      </Button>
                      {isPlaying && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={togglePausePractice}
                          title={isPracticePaused ? t('resume') : t('pause')}
                        >
                          {isPracticePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        variant={isPlaying ? "destructive" : "default"}
                        size="sm"
                        onClick={togglePractice}
                        aria-label={isPlaying ? t('btn_stop') : t('btn_start')}
                      >
                        {isPlaying ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                        {isPlaying ? t('btn_stop') : t('btn_start')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetPractice}
                        title={t('reset')}
                        aria-label={t('reset')}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pt-0 pb-3">
                  {/* Practice Mode Controls */}
                  {activeTab === "practice" && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 目标音符 - 仅在指板点击模式下显示*/}
                        {practiceAnswerMode === "fretboard" && (
                          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/10 min-w-[100px] sm:min-w-[120px]">
                            <Target className="h-4 w-4 text-primary" />
                            <div>
                              <Label className="text-[10px] text-muted-foreground block">{t('target_note')}</Label>
                              <div className="text-base sm:text-lg font-bold text-primary leading-tight">{formatNoteByAccidentalSetting(targetNote)}</div>
                            </div>
                          </div>
                        )}

                        {/* 琴弦选择 */}
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('select_strings')}</Label>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5, 6].map((stringNum) => (
                              <Button
                                key={stringNum}
                                variant={selectedStrings.includes(stringNum) ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  if (selectedStrings.includes(stringNum)) {
                                    // 至少保留一根弦
                                    if (selectedStrings.length > 1) {
                                      setSelectedStrings(prev => prev.filter(s => s !== stringNum))
                                    }
                                  } else {
                                    setSelectedStrings(prev => [...prev, stringNum].sort())
                                  }
                                }}
                                className="h-5 w-5 sm:h-6 sm:w-6 p-0 text-[10px] sm:text-xs"
                              >
                                {stringNum}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* 练习时长选择 */}
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('pitch_finding_practice_time')}</Label>
                          <Select value={String(pitchFindingTime)} onValueChange={(v) => setPitchFindingTime(Number(v))}>
                            <SelectTrigger className="w-16 sm:w-20 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">{t('pitch_finding_1_minute')}</SelectItem>
                              <SelectItem value="2">{t('pitch_finding_2_minutes')}</SelectItem>
                              <SelectItem value="3">{t('pitch_finding_3_minutes')}</SelectItem>
                              <SelectItem value="5">{t('pitch_finding_5_minutes')}</SelectItem>
                              <SelectItem value="10">{t('pitch_finding_10_minutes')}</SelectItem>
                              <SelectItem value="15">{t('pitch_finding_15_minutes')}</SelectItem>
                              <SelectItem value="30">{t('pitch_finding_30_minutes')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 练习建议开关 */}
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('pitch_finding_show_suggestions')}</Label>
                          <Switch
                            checked={showPracticeSuggestions}
                            onCheckedChange={setShowPracticeSuggestions}
                            className="scale-75"
                          />
                        </div>

                        <Button variant="outline" size="sm" onClick={() => setShowAllNotes(prev => !prev)} className="h-8">
                          {showAllNotes ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          <span className="text-xs">{showAllNotes ? t('hide_notes') : t('show_all_notes')}</span>
                        </Button>
                        
                        {/* 答题模式切换 */}
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('answer_mode')}</Label>
                          <div className="flex gap-1">
                            <Button
                              variant={practiceAnswerMode === "fretboard" ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                // 如果正在练习中，先停止练习
                                if (isPlaying) {
                                  setIsPlaying(false)
                                  setTimeLeft(practiceTime)
                                  setHighlightedFrets(new Map())
                                  setHighlightedTargetPosition(null)
                                }
                                setPracticeAnswerMode("fretboard")
                              }}
                              className="h-6 px-2 text-xs"
                            >
                              {t('practice_mode_find')}
                            </Button>
                            <Button
                              variant={practiceAnswerMode === "buttons" ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                // 如果正在练习中，先停止练习
                                if (isPlaying) {
                                  setIsPlaying(false)
                                  setTimeLeft(practiceTime)
                                  setHighlightedFrets(new Map())
                                  setHighlightedTargetPosition(null)
                                }
                                setPracticeAnswerMode("buttons")
                              }}
                              className="h-6 px-2 text-xs"
                            >
                              {t('practice_mode_identify')}
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* 按钮答题模式：显示音名按钮*/}
                      {practiceAnswerMode === "buttons" && isPlaying && (
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">{t('practice_mode_description_identify')}</div>
                          <div className="flex flex-wrap gap-2">
                            {NOTES.map((note) => (
                              <Button
                                key={note}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // 检查答案是否正确
                                  if (highlightedTargetPosition) {
                                    const { stringIndex, fret } = highlightedTargetPosition
                                    const correctNote = getNoteAtPosition(stringIndex, fret)
                                    const isCorrect = note === correctNote

                                    // 显示反馈
                                    setHighlightedFrets(new Map([[`${stringIndex}-${fret}`, isCorrect]]))

                                    // 更新分数
                                    setScore(prev => ({
                                      correct: prev.correct + (isCorrect ? 1 : 0),
                                      total: prev.total + 1
                                    }))

                                    // 音高识别统计改为按会话记录，不在此处累加 —— 见 pitchFindingSession 统计 effect

                                    // 延迟后生成新题目
                                    setTimeout(() => {
                                      setHighlightedFrets(new Map())
                                      generateNewTarget()
                                    }, 800)
                                  }
                                }}
                                className="h-10 w-10 text-sm font-semibold"
                              >
                                {note}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* 显示剩余时间 */}
                      {isPlaying && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{t('time_remaining')}: {formatTime(timeLeft)}</span>
                        </div>
                      )}
                      
                      {/* 显示练习建议 */}
                      {isPlaying && currentPracticeSuggestion && (
                        <div className="p-2 bg-card/50 rounded-lg border border-border/30">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-primary">{t('practice_suggestion_title')}:</span> {currentPracticeSuggestion}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Interval Controls */}
                  {activeTab === "interval" && (
                    <div className="space-y-3">
                      {/* 第一行：基础设置 */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={rootNote} onValueChange={setRootNote} disabled={intervalRootMode === "random"}>
                          <SelectTrigger className="w-auto min-w-[60px] h-8 text-xs px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NOTES.map(note => (
                              <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={intervalRootMode} onValueChange={(v: "fixed" | "random") => setIntervalRootMode(v)}>
                          <SelectTrigger className="w-auto min-w-[70px] h-8 text-xs px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed" className="text-xs">{t('fixed_root')}</SelectItem>
                            <SelectItem value="random" className="text-xs">{t('random_root')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2 px-2">
                          <Checkbox 
                            id="findRootFirst" 
                            checked={findRootFirst} 
                            onCheckedChange={(c) => setFindRootFirst(c as boolean)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="findRootFirst" className="text-xs cursor-pointer">{t('find_root_first')}</Label>
                        </div>
                        <div className="flex items-center gap-2 px-2">
                          <Checkbox 
                            id="addRootBack" 
                            checked={addRootBack} 
                            onCheckedChange={(c) => setAddRootBack(c as boolean)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="addRootBack" className="text-xs cursor-pointer">{t('add_root_back')}</Label>
                        </div>
                        <div className="flex items-center gap-2 px-2">
                          <Switch 
                            id="showIntervalFretboard" 
                            checked={showIntervalFretboard} 
                            onCheckedChange={setShowIntervalFretboard}
                            className="h-4 w-7"
                          />
                          <Label htmlFor="showIntervalFretboard" className="text-xs cursor-pointer">{t('show_fretboard')}</Label>
                        </div>
                      </div>

                      {/* 第二行：高级设置 */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 练习时长 */}
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">{t('practice_duration')}</Label>
                          <Select value={String(intervalPracticeDuration)} onValueChange={(v) => setIntervalPracticeDuration(Number(v))}>
                            <SelectTrigger className="w-[70px] h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 3, 5, 10, 15, 20].map(min => (
                                <SelectItem key={min} value={String(min)} className="text-xs">{min}{t('minutes')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* 随机顺序 */}
                        <div className="flex items-center gap-2 px-2">
                          <Switch 
                            id="intervalRandomizeOrder" 
                            checked={intervalRandomizeOrder} 
                            onCheckedChange={setIntervalRandomizeOrder}
                            className="h-4 w-7"
                          />
                          <Label htmlFor="intervalRandomizeOrder" className="text-xs cursor-pointer">{t('randomize_order')}</Label>
                        </div>
                        
                        {/* 音程方向 */}
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">{t('interval_direction')}</Label>
                          <div className="flex gap-0.5">
                            {[
                              { id: "up", label: t('direction_up') },
                              { id: "down", label: t('direction_down') },
                              { id: "random", label: t('direction_random') },
                            ].map((dir) => (
                              <Button
                                key={dir.id}
                                variant={intervalDirection === dir.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setIntervalDirection(dir.id as "up" | "down" | "random")}
                                className="h-7 text-xs px-2"
                              >
                                {dir.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                        
                        {/* 指板自动推进 */}
                        <div className="flex items-center gap-2 px-2">
                          <Switch 
                            id="intervalAutoAdvance" 
                            checked={intervalAutoAdvance} 
                            onCheckedChange={setIntervalAutoAdvance}
                            className="h-4 w-7"
                            disabled={!showIntervalFretboard}
                          />
                          <Label htmlFor="intervalAutoAdvance" className="text-xs cursor-pointer">{t('auto_advance')}</Label>
                        </div>
                        
                        {/* 指板显示时长 */}
                        {intervalAutoAdvance && showIntervalFretboard && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">{t('fretboard_duration')}</Label>
                            <Select value={String(intervalFretboardDuration)} onValueChange={(v) => setIntervalFretboardDuration(Number(v))}>
                              <SelectTrigger className="w-[60px] h-7 text-xs px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 5, 7, 10].map(sec => (
                                  <SelectItem key={sec} value={String(sec)} className="text-xs">{sec}s</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {/* 音程选择 */}
                      <div className="flex flex-wrap gap-1">
                        {INTERVALS.map((interval, index) => (
                          <Button
                            key={interval.name}
                            variant={selectedIntervals.includes(index) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleInterval(index)}
                            className="text-xs h-7 px-2 min-w-[36px]"
                          >
                            {interval.symbol}
                          </Button>
                        ))}
                      </div>
                      
                      {/* 开始练习提示*/}
                      {!isPlaying && (
                        <div className="text-muted-foreground text-sm py-4">
                          {t('click_start_to_begin')}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Chord Exercise Controls */}
                  {activeTab === "chord_exercise" && (
                    <div 
                      data-onboarding="chord-exercise"
                      className="space-y-2"
                    >
                      {/* 第一行：基础设置 */}
                      <div className="flex flex-wrap items-end gap-2">
                        {/* 根音选择 */}
                        <div className="w-[70px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('chord_root_note')}</Label>
                          <Select value={chordExerciseRoot} onValueChange={setChordExerciseRoot}>
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="random" className="text-xs">{t('random')}</SelectItem>
                              {NOTES.map(note => (
                                <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 练习模式 */}
                        <div className="w-[140px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('practice_level')}</Label>
                          <Button
                            variant="outline"
                            className="h-7 text-xs w-full justify-between"
                            onClick={() => setShowChordExerciseLevelSelector(true)}
                          >
                            <span className="truncate">
                              {t(ALL_PRACTICE_LEVELS.find(l => l.id === chordExerciseLevel)?.nameKey || '') || chordExerciseLevel}
                            </span>
                            <ChevronRight className="h-3 w-3 ml-1 shrink-0" />
                          </Button>
                        </div>

                        {/* 低音音符选择 */}
                        <div className="w-[80px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('chord_bass_note')}</Label>
                          <Select value={chordExerciseBass} onValueChange={setChordExerciseBass}>
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="root" className="text-xs">{t('chord_bass_root')}</SelectItem>
                              <SelectItem value="3rd" className="text-xs">{t('chord_bass_3rd')}</SelectItem>
                              <SelectItem value="5th" className="text-xs">{t('chord_bass_5th')}</SelectItem>
                              <SelectItem value="7th" className="text-xs">{t('chord_bass_7th')}</SelectItem>
                              <SelectItem value="random" className="text-xs">{t('chord_bass_random')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 演奏顺序 */}
                        <div className="w-[150px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('chord_order')}</Label>
                          <div className="flex gap-0.5">
                            {[
                              { id: "asc", label: t('order_ascending') },
                              { id: "desc", label: t('order_descending') },
                              { id: "random", label: t('order_random') },
                            ].map((order) => (
                              <Button
                                key={order.id}
                                variant={chordExerciseOrder === order.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setChordExerciseOrder(order.id as "asc" | "desc" | "random")}
                                className="h-7 text-xs flex-1 px-1"
                              >
                                {order.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* 显示选项开关组 */}
                        <div className="flex items-center gap-1 h-8 px-2 bg-card/30 rounded border border-border/30">
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor="showChordExerciseFretboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('fretboard')}</Label>
                            <Switch
                              id="showChordExerciseFretboard"
                              checked={showChordExerciseFretboard}
                              onCheckedChange={setShowChordExerciseFretboard}
                              className="scale-75"
                            />
                          </div>
                          <Separator orientation="vertical" className="h-4 mx-1" />
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor="showChordExerciseKeyboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('keyboard')}</Label>
                            <Switch
                              id="showChordExerciseKeyboard"
                              checked={showChordExerciseKeyboard}
                              onCheckedChange={setShowChordExerciseKeyboard}
                              className="scale-75"
                            />
                          </div>
                          <Separator orientation="vertical" className="h-4 mx-1" />
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor="showChordExerciseStructure" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('structure')}</Label>
                            <Switch
                              id="showChordExerciseStructure"
                              checked={showChordExerciseStructure}
                              onCheckedChange={setShowChordExerciseStructure}
                              className="scale-75"
                            />
                          </div>
                        </div>

                      </div>

                      {/* 第二行：和弦类型选择 - 按分组显示 */}
                      <div className="bg-card/30 rounded-lg p-2 border border-border/30">
                        <div className="flex items-center justify-between mb-1.5">
                          <Label className="text-[10px] font-medium text-muted-foreground">{t('chord_type')}</Label>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setChordExerciseTypes(CHORD_TYPES.map(t => t.name))}
                              className="h-5 text-[10px] px-1.5 py-0"
                            >
                              {t('select_all')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setChordExerciseTypes([])}
                              className="h-5 text-[10px] px-1.5 py-0"
                            >
                              {t('clear_all')}
                            </Button>
                          </div>
                        </div>
                        <div className="max-h-[160px] overflow-y-auto">
                        {(() => {
                          const groups = CHORD_TYPES.reduce((acc, type) => {
                            const groupKey = type.group || 'other'
                            if (!acc[groupKey]) {
                              acc[groupKey] = { name: type.groupName || type.groupZh || 'Other', nameZh: type.groupZh || '其他', types: [] }
                            }
                            acc[groupKey].types.push(type)
                            return acc
                          }, {} as Record<string, { name: string; nameZh: string; types: typeof CHORD_TYPES }>)
                          
                          return Object.entries(groups).map(([key, group]) => (
                            <div key={key} className="mb-2">
                              <div className="text-[10px] font-medium text-muted-foreground/70 mb-1 px-1">{language === 'zh-CN' ? group.nameZh : group.name}</div>
                              <div className="flex flex-wrap gap-1">
                                {group.types.map(type => (
                                  <Button
                                    key={type.name}
                                    variant={chordExerciseTypes.includes(type.name) ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                      if (chordExerciseTypes.includes(type.name)) {
                                        setChordExerciseTypes(chordExerciseTypes.filter(t => t !== type.name))
                                      } else {
                                        setChordExerciseTypes([...chordExerciseTypes, type.name])
                                      }
                                    }}
                                    className="h-6 text-xs px-2 py-0.5"
                                  >
                                    {type.symbol || type.name}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ))
                        })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chord Progression Controls */}
                  {activeTab === "chord" && (
                    <div className="space-y-2">
                      {/* 第一行：歌曲选择、调性、练习模式、和弦顺序 */}
                      <div className="grid grid-cols-4 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] font-medium text-muted-foreground">{t('select_song')}</Label>
                          <Button
                            variant="outline"
                            className="h-7 text-xs w-full justify-between"
                            onClick={() => setShowSongSelector(true)}
                          >
                            <span className="truncate">{selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name}</span>
                            <ChevronRight className="h-3 w-3 ml-1 shrink-0" />
                          </Button>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] font-medium text-muted-foreground">{t('select_key')}</Label>
                          <Select value={progressionKey} onValueChange={(value) => setProgressionKey(value)}>
                            <SelectTrigger size="xs" className="w-full">
                              <SelectValue>
                                {normalizeNoteName(progressionKey) + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {NOTES.map((note, index) => {
                                const flatNote = NOTES_FLAT[index]
                                const displayName = note === flatNote 
                                  ? note + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))
                                  : `${note} / ${flatNote}` + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))
                                return (
                                  <SelectItem key={note} value={note} className="text-xs">{displayName}</SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] font-medium text-muted-foreground">{t('practice_level')}</Label>
                          <Button
                            variant="outline"
                            className="h-7 text-xs w-full justify-between"
                            onClick={() => setShowLevelSelector(true)}
                          >
                            <span className="truncate">
                              {t(ALL_PRACTICE_LEVELS.find(l => l.id === practiceLevel)?.nameKey || '') || practiceLevel}
                            </span>
                            <ChevronRight className="h-3 w-3 ml-1 shrink-0" />
                          </Button>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] font-medium text-muted-foreground">{t('chord_order')}</Label>
                          <Select value={chordPlayOrder} onValueChange={(v: "asc" | "desc" | "random") => setChordPlayOrder(v)}>
                            <SelectTrigger size="xs" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="asc" className="text-xs">{t('order_ordered')}</SelectItem>
                              <SelectItem value="desc" className="text-xs">{t('order_reverse')}</SelectItem>
                              <SelectItem value="random" className="text-xs">{t('order_random')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {/* 第二行：开关选项 + 操作按钮 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('progression_repeat')}</Label>
                          <Switch
                            checked={progressionRepeat}
                            onCheckedChange={setProgressionRepeat}
                            className="scale-75"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded border border-border/30">
                          <Label className={`text-xs whitespace-nowrap ${chordPlayOrder !== 'random' ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>{t('progression_voice_leading')}</Label>
                          <Switch
                            checked={shouldVoiceLead}
                            onCheckedChange={setShouldVoiceLead}
                            disabled={chordPlayOrder === 'random'}
                            className="scale-75"
                          />
                        </div>
                        {progressionRepeat && (
                          <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded border border-border/30">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('progression_randomize_key')}</Label>
                            <Switch
                              checked={shouldRandomizeKeyOnRepeat}
                              onCheckedChange={setShouldRandomizeKeyOnRepeat}
                              className="scale-75"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('show_fretboard')}</Label>
                          <Switch
                            id="showChordFretboard"
                            checked={showChordFretboard}
                            onCheckedChange={setShowChordFretboard}
                            className="scale-75"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('chord_progression_structure')}</Label>
                          <Switch
                            id="showChordStructure"
                            checked={showChordStructure}
                            onCheckedChange={setShowChordStructure}
                            className="scale-75"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded border border-border/30">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('show_keyboard')}</Label>
                          <Switch
                            id="showChordKeyboard"
                            checked={showChordKeyboard}
                            onCheckedChange={setShowChordKeyboard}
                            className="scale-75"
                          />
                        </div>
                        <Button
                          onClick={nextChord}
                          variant="outline"
                          className="h-7 px-3 text-xs ml-auto"
                          disabled={!isPlaying}
                        >
                          <SkipForward className="h-3 w-3 mr-1" />
                          {t('btn_next')}
                        </Button>
                      </div>

                      {/* 第三行：自定义和弦（折叠） */}
                      <Accordion type="multiple" defaultValue={[]} className="w-full">
                        <AccordionItem value="custom" className="border-0">
                          <AccordionTrigger className="text-xs py-1.5 px-2 bg-card/30 rounded border border-border/30 hover:no-underline">
                            {t('chord_custom')}
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2 p-2 bg-card/20 rounded-b border-x border-b border-border/30">
                              {/* 手动添加和弦 */}
                              <div className="flex items-center gap-2">
                                <div className="flex-1 grid grid-cols-12 gap-1">
                                  <Select value={newChordRoot} onValueChange={setNewChordRoot}>
                                    <SelectTrigger className="col-span-3 h-7 text-xs">
                                      <SelectValue placeholder={t('chord_root_note')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {NOTES.map(note => (
                                        <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select value={newChordType} onValueChange={setNewChordType}>
                                    <SelectTrigger className="col-span-6 h-7 text-xs">
                                      <SelectValue placeholder={t('chord_type')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CHORD_TYPES.map(type => (
                                        <SelectItem key={type.name} value={type.name} className="text-xs">{type.symbol || type.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button onClick={addCustomChord} size="sm" className="col-span-3 h-7 text-xs px-2">
                                    <Plus className="h-3 w-3 mr-1" />
                                    {t('custom_chord_add')}
                                  </Button>
                                </div>
                              </div>

                              {/* iReal Pro 导入 */}
                              <div className="space-y-2 pt-2 border-t border-border/30">
                                <p className="text-xs text-muted-foreground">{t('ireal_import_title')}</p>
                                <Textarea
                                  placeholder={t('ireal_import_help')}
                                  value={irealInput}
                                  onChange={(e) => setIrealInput(e.target.value)}
                                  className="min-h-[50px] text-xs"
                                />
                                <Button onClick={importIrealPro} size="sm" className="w-full h-7 text-xs">
                                  <Upload className="h-3 w-3 mr-1" />
                                  {t('ireal_import_btn')}
                                </Button>
                              </div>

                              {/* 和弦序列显示 */}
                              {customChords.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-2 border-t border-border/30">
                                  {customChords.map((chord, index) => (
                                    <Badge key={index} variant="secondary" className="text-xs gap-1 py-0.5">
                                      {formatChordName(chord, t)}
                                      <button onClick={() => removeCustomChord(index)} className="hover:text-destructive">
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* 操作按钮 */}
                              <div className="flex items-center gap-1 pt-2 border-t border-border/30">
                                <Input
                                  placeholder={t('custom_chord_sequence_name')}
                                  value={customChordName}
                                  onChange={(e) => setCustomChordName(e.target.value)}
                                  className="h-7 text-xs flex-1"
                                />
                                <Button variant="outline" size="sm" onClick={saveCustomChords} className="h-7 px-2 text-xs" disabled={customChords.length === 0}>
                                  <Save className="h-3 w-3 mr-1" />
                                  {t('custom_chord_save')}
                                </Button>
                                <Button variant="outline" size="sm" onClick={loadCustomChords} className="h-7 px-2 text-xs">
                                  <Upload className="h-3 w-3 mr-1" />
                                  {t('custom_chord_load')}
                                </Button>
                                <Button variant="outline" size="sm" onClick={exportCustomChords} className="h-7 px-2 text-xs" disabled={customChords.length === 0}>
                                  <Download className="h-3 w-3 mr-1" />
                                  {t('custom_chord_export')}
                                </Button>
                                {customChords.length > 0 && (
                                  <Button variant="outline" size="sm" onClick={clearCustomChords} className="h-7 px-2 text-xs">
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    {t('custom_chord_clear')}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  )}

                  {/* 和弦进行信息浮动窗口 */}
                  {activeTab === "chord" && showChordStructure && (
                    <div 
                      className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50"
                      style={{ 
                        transform: `translate(${chordStructurePosition.x}px, ${chordStructurePosition.y}px)`,
                        cursor: dragRef.current.isDragging && dragRef.current.target === 'chord' ? 'grabbing' : 'default'
                      }}
                    >
                      <div className="bg-card/95 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg p-3">
                        <div 
                          className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing"
                          onMouseDown={(e) => handleDragStart(e, 'chord')}
                          onTouchStart={(e) => handleDragStart(e, 'chord')}
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-3 w-3 text-muted-foreground" />
                            <h4 className="text-xs font-semibold">{t('chord_progression_info')}</h4>
                          </div>
                          <button
                            onClick={() => setShowChordStructure(false)}
                            className="text-muted-foreground hover:text-foreground p-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{t('select_key')}:</span>
                            <span className="font-mono">{progressionKey + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{t('select_song')}:</span>
                            <span className="font-mono">{selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name}</span>
                          </div>
                          {/* 显示该调的所有和弦*/}
                          <div className="pt-1.5 border-t border-border/20">
                            <span className="text-muted-foreground block mb-1.5">{t('chord_progression')}:</span>
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const chords = transposedChords
                                return chords.map((chord, index) => (
                                  <Badge
                                    key={index}
                                    variant={index === currentChordIndex ? "default" : "secondary"}
                                    className="text-[10px] py-0 px-1"
                                  >
                                    {formatChordName(chord, t)}
                                  </Badge>
                                ))
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scale Controls */}
                  {activeTab === "scale" && (
                    <div 
                      data-onboarding="scale-exercise"
                      className="space-y-2"
                    >
                      {/* 第一行：基础设置 */}
                      <div className="flex flex-wrap items-end gap-2">
                        {/* 调性选择 */}
                        <div className="w-[80px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('scale_key')}</Label>
                          <Select value={isScaleKeyRandom ? 'random' : scaleKey} onValueChange={(value) => {
                            if (value === 'random') {
                              setIsScaleKeyRandom(true)
                              const randomNote = NOTES[Math.floor(Math.random() * NOTES.length)]
                              setScaleKey(randomNote)
                            } else {
                              setIsScaleKeyRandom(false)
                              setScaleKey(value)
                            }
                          }}>
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {NOTES.map(note => (
                                <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
                              ))}
                              <SelectItem value="random" className="text-xs font-medium text-primary">
                                {t('random_key')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 调式分类 */}
                        <div className="w-[120px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('scale_mode')}</Label>
                          <Select value={selectedScaleCategory} onValueChange={(v: keyof typeof SCALE_MODES) => {
                            setSelectedScaleCategory(v)
                            setSelectedScale(SCALE_MODES[v][0])
                          }}>
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pentatonic" className="text-xs">{language === 'zh-CN' ? '五声音阶' : 'Pentatonic'}</SelectItem>
                              <SelectItem value="majorScaleModes" className="text-xs">{language === 'zh-CN' ? '大调模式' : 'Major Modes'}</SelectItem>
                              <SelectItem value="melodicMinorScaleModes" className="text-xs">{language === 'zh-CN' ? '旋律小调模式' : 'Melodic Minor Modes'}</SelectItem>
                              <SelectItem value="harmonicMinorScaleModes" className="text-xs">{language === 'zh-CN' ? '和声小调模式' : 'Harmonic Minor Modes'}</SelectItem>
                              <SelectItem value="harmonicMajorScaleModes" className="text-xs">{language === 'zh-CN' ? '和声大调模式' : 'Harmonic Major Modes'}</SelectItem>
                              <SelectItem value="otherScales" className="text-xs">{language === 'zh-CN' ? '其他音阶' : 'Other Scales'}</SelectItem>
                              <SelectItem value="bebopScales" className="text-xs">{language === 'zh-CN' ? 'Bebop音阶' : 'Bebop Scales'}</SelectItem>
                              <SelectItem value="exotic" className="text-xs">{language === 'zh-CN' ? '异域音阶' : 'Exotic'}</SelectItem>
                              <SelectItem value="symmetrical" className="text-xs">{language === 'zh-CN' ? '对称音阶' : 'Symmetrical'}</SelectItem>
                              <SelectItem value="basic" className="text-xs">{language === 'zh-CN' ? '基础' : 'Basic'}</SelectItem>
                              <SelectItem value="church" className="text-xs">{language === 'zh-CN' ? '教会调式' : 'Church'}</SelectItem>
                              <SelectItem value="minor" className="text-xs">{language === 'zh-CN' ? '小调变体' : 'Minor'}</SelectItem>
                              <SelectItem value="bebop" className="text-xs">{language === 'zh-CN' ? 'Bebop(旧)' : 'Bebop(Old)'}</SelectItem>
                              <SelectItem value="jazz" className="text-xs">{language === 'zh-CN' ? '爵士' : 'Jazz'}</SelectItem>
                              <SelectItem value="other" className="text-xs">{language === 'zh-CN' ? '其他(旧)' : 'Other(Old)'}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 方向 */}
                        <div className="w-[150px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('scale_direction')}</Label>
                          <div className="flex gap-0.5">
                            {[
                              { id: "up", label: t('order_ascending') },
                              { id: "down", label: t('order_descending') },
                              { id: "up_down", label: t('order_asc_desc') },
                              { id: "random", label: t('order_random') },
                            ].map((order) => (
                              <Button
                                key={order.id}
                                variant={scaleDirection === order.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setScaleDirection(order.id as "up" | "down" | "up_down" | "random")}
                                className="h-7 text-xs flex-1 px-1"
                              >
                                {order.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* 根音移动 */}
                        <div className="w-[140px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('root_movement')}</Label>
                          <Select value={scaleRootMovement} onValueChange={(v) => setScaleRootMovement(v as typeof scaleRootMovement)}>
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="static" className="text-xs">{t('root_movement_static')}</SelectItem>
                              <SelectItem value="random" className="text-xs">{t('root_movement_random')}</SelectItem>
                              <SelectItem value="upSemiTone" className="text-xs">{t('root_movement_up_semitone')}</SelectItem>
                              <SelectItem value="downSemiTone" className="text-xs">{t('root_movement_down_semitone')}</SelectItem>
                              <SelectItem value="circleOfFifths" className="text-xs">{t('root_movement_circle_of_fifths')}</SelectItem>
                              <SelectItem value="circleOfFourths" className="text-xs">{t('root_movement_circle_of_fourths')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 显示选项开关组 */}
                        <div className="flex items-center gap-1 h-8 px-2 bg-card/30 rounded border border-border/30">
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor="showScaleFretboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('fretboard')}</Label>
                            <Switch
                              id="showScaleFretboard"
                              checked={showScaleFretboard}
                              onCheckedChange={setShowScaleFretboard}
                              className="scale-75"
                            />
                          </div>
                          <Separator orientation="vertical" className="h-4 mx-1" />
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor="showScaleKeyboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('keyboard')}</Label>
                            <Switch
                              id="showScaleKeyboard"
                              checked={showScaleKeyboard}
                              onCheckedChange={setShowScaleKeyboard}
                              className="scale-75"
                            />
                          </div>
                          <Separator orientation="vertical" className="h-4 mx-1" />
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor="showScaleStructure" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('structure')}</Label>
                            <Switch
                              id="showScaleStructure"
                              checked={showScaleStructure}
                              onCheckedChange={setShowScaleStructure}
                              className="scale-75"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 第二行：练习序列和音阶选择 */}
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                        {/* 练习序列选择 */}
                        <div className="bg-card/30 rounded-lg p-2 border border-border/30 sm:w-auto w-full">
                          <div className="flex items-center justify-between mb-1.5">
                            <Label className="text-[10px] font-medium text-muted-foreground">{t('scale_practice_sequence')}</Label>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {SCALE_PRACTICE_SEQUENCES.map((seq) => (
                              <Button
                                key={seq.id}
                                variant={scalePracticeSequence === seq.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setScalePracticeSequence(seq.id)}
                                className="h-6 text-xs px-1.5 py-0.5"
                              >
                                {seq.id === 'random' ? t('random') : seq.name}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* 音阶类型选择 */}
                        <div className="bg-card/30 rounded-lg p-2 border border-border/30 flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <Label className="text-[10px] font-medium text-muted-foreground">
                              {selectedScaleCategory === 'pentatonic' ? (language === 'zh-CN' ? '五声音阶' : 'Pentatonic Scales') : 
                               selectedScaleCategory === 'majorScaleModes' ? (language === 'zh-CN' ? '大调音阶模式' : 'Major Scale Modes') : 
                               selectedScaleCategory === 'melodicMinorScaleModes' ? (language === 'zh-CN' ? '旋律小调模式' : 'Melodic Minor Scale Modes') : 
                               selectedScaleCategory === 'harmonicMinorScaleModes' ? (language === 'zh-CN' ? '和声小调模式' : 'Harmonic Minor Scale Modes') : 
                               selectedScaleCategory === 'harmonicMajorScaleModes' ? (language === 'zh-CN' ? '和声大调模式' : 'Harmonic Major Scale Modes') : 
                               selectedScaleCategory === 'otherScales' ? (language === 'zh-CN' ? '其他音阶' : 'Other Scales') : 
                               selectedScaleCategory === 'bebopScales' ? (language === 'zh-CN' ? 'Bebop音阶' : 'Bebop Scales') : 
                               selectedScaleCategory === 'basic' ? (language === 'zh-CN' ? '基础音阶' : 'Basic Scales') : 
                               selectedScaleCategory === 'church' ? (language === 'zh-CN' ? '教会调式' : 'Church Modes') : 
                               selectedScaleCategory === 'minor' ? (language === 'zh-CN' ? '小调变体' : 'Minor Variants') : 
                               selectedScaleCategory === 'bebop' ? (language === 'zh-CN' ? 'Bebop音阶(旧)' : 'Bebop Scales(Old)') : 
                               selectedScaleCategory === 'jazz' ? (language === 'zh-CN' ? '爵士音阶' : 'Jazz Scales') : 
                               selectedScaleCategory === 'exotic' ? (language === 'zh-CN' ? '异域音阶' : 'Exotic Scales') : 
                               selectedScaleCategory === 'symmetrical' ? (language === 'zh-CN' ? '对称音阶' : 'Symmetrical Scales') : 
                               (language === 'zh-CN' ? '其他音阶(旧)' : 'Other Scales(Old)')}
                              <span className="ml-1 text-[9px] text-muted-foreground/70">({t('multi_select_hint')})</span>
                            </Label>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {SCALE_MODES[selectedScaleCategory].map((scale) => (
                              <Button
                                key={scale.name}
                                variant={selectedScales.some(s => s.name === scale.name) ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  const isSelected = selectedScales.some(s => s.name === scale.name)
                                  if (isSelected) {
                                    // 取消选择（至少保留一个）
                                    if (selectedScales.length > 1) {
                                      const newScales = selectedScales.filter(s => s.name !== scale.name)
                                      setSelectedScales(newScales)
                                      setSelectedScale(newScales[0])
                                    }
                                  } else {
                                    // 添加选择
                                    const newScales = [...selectedScales, scale]
                                    setSelectedScales(newScales)
                                    setSelectedScale(scale)
                                  }
                                }}
                                className="h-6 text-xs px-1.5 py-0.5"
                              >
                                {scale.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              )}

              {/* 音阶结构浮动窗口 */}
              {activeTab === "scale" && showScaleStructure && (
                <div 
                  className="fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg p-3 max-w-xs"
                  style={{ 
                    transform: `translate(${scaleStructurePosition.x}px, ${scaleStructurePosition.y}px)`,
                    cursor: dragRef.current.isDragging && dragRef.current.target === 'scale' ? 'grabbing' : 'default'
                  }}
                >
                  <div 
                    className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => handleDragStart(e, 'scale')}
                    onTouchStart={(e) => handleDragStart(e, 'scale')}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold">{normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</h4>
                    </div>
                    <button 
                      onClick={() => setShowScaleStructure(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('scale_formula')}:</span>
                      <span className="font-mono">{selectedScale.formula}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('scale_intervals')}:</span>
                      <span className="font-mono">{selectedScale.intervals?.join(', ') || selectedScale.notes.map(n => {
                        const semitoneToDegree: Record<number, string> = {
                          0: "1", 1: "b9", 2: "2", 3: "b3", 4: "3", 5: "4",
                          6: "#4", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
                        }
                        return semitoneToDegree[n] || String(n)
                      }).join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('scale_notes')}:</span>
                      <span className="font-mono">{(() => {
                        const intervals = selectedScale.intervals || selectedScale.notes.map(n => {
                          const semitoneToDegree: Record<number, string> = {
                            0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
                            6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
                          }
                          return semitoneToDegree[n] || String(n)
                        })
                        return getScaleNoteNames(scaleKey, intervals).join(', ')
                      })()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 和弦练习结构浮动窗口 */}
              {activeTab === "chord_exercise" && showChordExerciseStructure && chordExerciseTargetChord && (
                <div 
                  className="fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg p-3 max-w-xs"
                  style={{ 
                    transform: `translate(${chordExerciseStructurePosition.x}px, ${chordExerciseStructurePosition.y}px)`,
                    cursor: dragRef.current.isDragging && dragRef.current.target === 'chordExercise' ? 'grabbing' : 'default'
                  }}
                >
                  <div 
                    className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => handleDragStart(e, 'chordExercise')}
                    onTouchStart={(e) => handleDragStart(e, 'chordExercise')}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold">{normalizeNoteName(chordExerciseTargetChord.root)} {normalizeNoteName(getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay))}</h4>
                    </div>
                    <button
                      onClick={() => setShowChordExerciseStructure(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('chord_type')}:</span>
                      <span className="font-mono">{getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('chord_degrees')}:</span>
                      <span className="font-mono">{getChordDegrees(chordExerciseTargetChord.type).join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('current_step')}:</span>
                      <span className="font-mono">{chordExerciseSequence[chordExerciseCurrentStep] || '-'}</span>
                    </div>
                  </div>
                </div>
              )}


              {/* 正确答案反馈浮动窗口 */}
              {showCorrectFeedback && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
                  <div className="bg-green-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl animate-pulse">
                    <Check className="h-16 w-16 text-white" />
                  </div>
                  <div className="absolute mt-32 text-2xl font-bold text-green-500 animate-bounce">
                    ✓ {correctFeedbackNote ? formatNoteByAccidentalSetting(correctFeedbackNote) : ''}
                  </div>
                </div>
              )}

              {showWrongFeedback && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
                  <div className="bg-red-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl" style={{animation: 'shake 0.4s ease-in-out'}}>
                    <X className="h-16 w-16 text-white" />
                  </div>
                  <div className="absolute mt-32 text-2xl font-bold text-red-500">
                    ✗ {wrongFeedbackNote ? formatNoteByAccidentalSetting(wrongFeedbackNote) : ''}
                  </div>
                </div>
              )}

              {showPracticeSummary && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-sm w-full mx-4 shadow-2xl">
                    <div className="text-center mb-6">
                      <div className="text-4xl mb-2">
                        {practiceSummaryData.total > 0 && (practiceSummaryData.correct / practiceSummaryData.total) >= 0.8 ? '🎉' : 
                         practiceSummaryData.total > 0 && (practiceSummaryData.correct / practiceSummaryData.total) >= 0.5 ? '👍' : '💪'}
                      </div>
                      <h3 className="text-xl font-bold">{t('practice_summary_title')}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {practiceSummaryData.total > 0 && (practiceSummaryData.correct / practiceSummaryData.total) >= 0.8 ? t('practice_summary_excellent') :
                         practiceSummaryData.total > 0 && (practiceSummaryData.correct / practiceSummaryData.total) >= 0.5 ? t('practice_summary_good') : t('practice_summary_keep')}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-green-500">{practiceSummaryData.correct}</div>
                        <div className="text-xs text-muted-foreground">{t('practice_summary_correct')}</div>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-red-500">{practiceSummaryData.total - practiceSummaryData.correct}</div>
                        <div className="text-xs text-muted-foreground">{t('practice_summary_wrong')}</div>
                      </div>
                      <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-primary">
                          {practiceSummaryData.total > 0 ? Math.round((practiceSummaryData.correct / practiceSummaryData.total) * 100) : 0}%
                        </div>
                        <div className="text-xs text-muted-foreground">{t('practice_summary_accuracy')}</div>
                      </div>
                      <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-accent">{Math.floor(practiceSummaryData.duration / 60)}:{String(practiceSummaryData.duration % 60).padStart(2, '0')}</div>
                        <div className="text-xs text-muted-foreground">{t('practice_summary_duration')}</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowPracticeSummary(false)}
                      >
                        {t('practice_summary_close')}
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => {
                          setShowPracticeSummary(false)
                          togglePractice()
                        }}
                      >
                        {t('practice_summary_again')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Fretboard - 根据模式显示/隐藏，统计页面不显示 */}
              {activeTab !== "stats" &&
               (activeTab !== "chord" || showChordFretboard) &&
               (activeTab !== "scale" || showScaleFretboard) &&
               (activeTab !== "interval" || showIntervalFretboard) &&
               (activeTab !== "chord_exercise" || showChordExerciseFretboard) && (
                <Card 
                  data-onboarding="fretboard"
                  className="gap-0 pt-3 sm:pt-4 pb-0"
                >
                  <CardContent className="p-2 sm:p-4 pt-0">
                    {/* 指板外层容器 - 统一圆角 */}
                    <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30 dark:bg-zinc-900/30">
                      {/* 琴弦之间的虚线分隔 - 深浅主题都显示，浅色主题使用更浅的颜色*/}
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={`string-separator-${i}`}
                          className="absolute left-0 right-0 pointer-events-none block z-10 dark:border-t dark:border-dashed dark:border-[oklch(0.35_0.02_260_/_0.8)]"
                          style={{
                            top: `${((i + 1) / 6) * 100}%`,
                            borderTop: '1px dashed oklch(0.7 0.02 260 / 0.5)',
                            transform: 'translateY(-1px)',
                          }}
                        />
                      ))}

                      {/* String labels and frets */}
                      {STRING_TUNING.map((_, stringIndex) => {
                        // 找音练习：检查弦是否被选中（stringIndex 0-5 对应 1-6弦）
                        const stringNum = stringIndex + 1
                        const isStringEnabled = activeTab !== "practice" || selectedStrings.includes(stringNum)

                        return (
                        <div key={stringIndex} className={cn(
                          "flex items-center",
                          !isStringEnabled && "opacity-60"
                        )}>
                          {/* Frets - 包含空弦（0品） */}
                          <div className="flex-1 flex">
                            {/* 空弦（0品） */}
                            <button
                              onClick={() => isStringEnabled && handleFretClick(stringIndex, 0)}
                              disabled={!isStringEnabled}
                              className={cn(
                                "flex-[0.8] h-6 sm:h-8 text-[10px] sm:text-xs font-mono font-semibold transition-all duration-150",
                                "flex items-center justify-center",
                                isStringEnabled 
                                  ? cn("text-foreground/80 bg-secondary/80 hover:bg-secondary", getNoteButtonColor(getNoteAtPosition(stringIndex, 0), stringIndex, 0))
                                  : "text-muted-foreground/50 bg-muted/30 cursor-not-allowed"
                              )}
                            >
                              {formatNoteByAccidentalSetting(getNoteAtPosition(stringIndex, 0))}
                            </button>
                            
                            {/* 1品及以上 */}
                            {Array.from({ length: fretCount }, (_, fret) => {
                              const actualFret = fret + 1
                              const note = getNoteAtPosition(stringIndex, actualFret)
                              
                              // 确定是否显示内容
                              // 1. 显示所有音符模式
                              // 2. 点击后有反馈
                              // 3. 练习模式下显示当前题目的音级
                              const isHighlighted = highlightedFrets.has(`${stringIndex}-${actualFret}`)
                              const showNote = showAllNotes || isHighlighted
                              
                              // 检查是否是当前练习题目中的音
                              let isCurrentExerciseNote = false
                              let exerciseDegree = ""
                              
                              // 和弦转换练习
                              if (activeTab === "chord" && isPlaying) {
                                const chords = transposedChords
                                const currentChord = chords[currentChordIndex]
                                if (currentChord) {
                                  const degree = getNoteDegreeInChord(note, currentChord.root, currentChord.type)
                                  if (degree) {
                                    isCurrentExerciseNote = true
                                    exerciseDegree = degree
                                  }
                                }
                              }
                              
                              // 和弦练习
                              if (activeTab === "chord_exercise" && isPlaying && chordExerciseTargetChord) {
                                const degree = getNoteDegreeInChord(note, chordExerciseTargetChord.root, chordExerciseTargetChord.type)
                                if (degree) {
                                  isCurrentExerciseNote = true
                                  exerciseDegree = degree
                                }
                              }
                              
                              // 音程练习
                              if (activeTab === "interval" && isPlaying) {
                                const noteIdx = getNoteIndex(note)
                                const rootIdx = getNoteIndex(rootNote)
                                // 计算音程，考虑超过一个八度的情况
                                const rawInterval = (noteIdx - rootIdx + 12) % 12
                                
                                // 查找选中的音程中是否有匹配当前音程的（考虑多个八度）
                                for (const intervalIndex of selectedIntervals) {
                                  const intervalInfo = INTERVALS[intervalIndex]
                                  if (!intervalInfo) continue
                                  
                                  // 检查音程是否匹配（考虑b2的情况）
                                  if (intervalInfo.semitones % 12 === rawInterval) {
                                    isCurrentExerciseNote = true
                                    exerciseDegree = intervalInfo.symbol
                                    break
                                  }
                                }
                              }
                              
                              // 音阶练习
                              if (activeTab === "scale" && isPlaying && scaleExerciseSequence.length > 0) {
                                const noteIdx = getNoteIndex(note)
                                const keyIdx = getNoteIndex(scaleKey)
                                const interval = (noteIdx - keyIdx + 12) % 12
                                if (selectedScale.notes.includes(interval)) {
                                  const semitoneToDegree: Record<number, string> = {
                                    0: "1", 1: "b9", 2: "2", 3: "b3", 4: "3", 5: "4",
                                    6: "#4", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
                                  }
                                  isCurrentExerciseNote = true
                                  exerciseDegree = semitoneToDegree[interval]
                                }
                              }
                              
                              // 根据模式确定显示内容
                              let displayText = formatNoteByAccidentalSetting(note)
                              let showText = showNote || isCurrentExerciseNote
                              
                              // 练习模式下显示音级数字
                              if (isCurrentExerciseNote && exerciseDegree) {
                                displayText = exerciseDegree
                              }

                              return (
                                <button
                                  key={actualFret}
                                  onClick={() => isStringEnabled && handleFretClick(stringIndex, actualFret)}
                                  disabled={!isStringEnabled}
                                  className={cn(
                                    "flex-1 h-6 sm:h-8 text-[8px] sm:text-[10px] font-medium transition-all duration-150 min-w-[20px] sm:min-w-[28px]",
                                    "flex items-center justify-center relative z-10",
                                    "border-r",
                                    isStringEnabled 
                                      ? cn("border-border/50 dark:border-zinc-600/50", getNoteButtonColor(note, stringIndex, actualFret))
                                      : "border-border/30 dark:border-zinc-800/50 text-muted-foreground/50 bg-muted/30 cursor-not-allowed"
                                  )}
                                >
                                  <span className={cn(
                                    "transition-opacity duration-150",
                                    showText ? "opacity-100" : "opacity-0"
                                  )}>
                                    {displayText}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )})}
                    </div>
                    
                    {/* Fret numbers - 品数显示（泛音点位置用绿色标记） */}
                    <div className="flex items-center py-1">
                      <div className="flex-1 flex">
                        {/* 0品占位（与指板空弦对齐） */}
                        <div className="flex-[0.8]" />
                        {/* 品数 */}
                        {Array.from({ length: fretCount }, (_, fret) => {
                          const actualFret = fret + 1
                          const isMarker = FRET_MARKERS.includes(actualFret)
                          return (
                            <div key={actualFret} className="flex-1 flex justify-center min-w-[20px] sm:min-w-[28px]">
                              <span className={cn(
                                "text-[10px]",
                                isMarker ? "text-primary font-semibold" : "text-muted-foreground"
                              )}>
                                {actualFret}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                  </CardContent>
                </Card>
              )}

              {/* 钢琴键盘显示 - 和弦练习 */}
              {activeTab === "chord_exercise" && showChordExerciseKeyboard && (
                <Card className="py-2">
                  <CardContent className="p-2 sm:p-4">
                    <SimplePianoKeyboard
                      rootNote={chordExerciseTargetChord ? chordExerciseTargetChord.root : chordExerciseRoot}
                      highlightedNotes={(() => {
                        const targetChord = chordExerciseTargetChord
                        if (targetChord) {
                          const degrees = getChordDegrees(targetChord.type, chordExerciseLevel, getLevelOptions())
                          const rootIdx = getNoteIndex(targetChord.root)
                          return degrees.map(degree => {
                            const semitone = DEGREE_TO_SEMITONE[degree]
                            if (semitone === undefined) return null
                            const noteIdx = (rootIdx + semitone) % 12
                            return NOTES[noteIdx]
                          }).filter((n): n is string => n !== null)
                        } else {
                          const chordType = chordExerciseTypes[0] || "Major"
                          const degrees = getChordDegrees(chordType, chordExerciseLevel, getLevelOptions())
                          const rootIdx = getNoteIndex(chordExerciseRoot)
                          return degrees.map(degree => {
                            const semitone = DEGREE_TO_SEMITONE[degree]
                            if (semitone === undefined) return null
                            const noteIdx = (rootIdx + semitone) % 12
                            return NOTES[noteIdx]
                          }).filter((n): n is string => n !== null)
                        }
                      })()}
                      currentStepNote={chordExerciseTargetChord ? (() => {
                        const degrees = getChordDegrees(chordExerciseTargetChord.type, chordExerciseLevel, getLevelOptions())
                        const currentDegree = degrees[chordExerciseCurrentStep]
                        if (!currentDegree) return undefined
                        const semitone = DEGREE_TO_SEMITONE[currentDegree]
                        if (semitone === undefined) return undefined
                        const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
                        const noteIdx = (rootIdx + semitone) % 12
                        return NOTES[noteIdx]
                      })() : undefined}
                    />
                  </CardContent>
                </Card>
              )}

              {/* 钢琴键盘显示 - 和弦转换练习 */}
              {activeTab === "chord" && showChordKeyboard && (() => {
                const chords = transposedChords
                const currentChord = chords[currentChordIndex]
                return currentChord ? (
                  <Card className="py-2">
                    <CardContent className="p-2 sm:p-4">
                      <SimplePianoKeyboard
                        rootNote={currentChord.root}
                        highlightedNotes={(() => {
                          const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
                          const rootIdx = getNoteIndex(currentChord.root)
                          return degrees.map(degree => {
                            const semitone = DEGREE_TO_SEMITONE[degree]
                            if (semitone === undefined) return null
                            const noteIdx = (rootIdx + semitone) % 12
                            return NOTES[noteIdx]
                          }).filter((n): n is string => n !== null)
                        })()}
                        currentStepNote={(() => {
                          const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
                          const currentDegree = degrees[chordDegreeCurrentStep]
                          if (!currentDegree) return undefined
                          const semitone = DEGREE_TO_SEMITONE[currentDegree]
                          if (semitone === undefined) return undefined
                          const rootIdx = getNoteIndex(currentChord.root)
                          const noteIdx = (rootIdx + semitone) % 12
                          return NOTES[noteIdx]
                        })()}
                      />
                    </CardContent>
                  </Card>
                ) : null
              })()}

              {/* 钢琴键盘显示 - 音阶练习 */}
              {activeTab === "scale" && showScaleKeyboard && (
                <Card className="py-2">
                  <CardContent className="p-2 sm:p-4">
                    <SimplePianoKeyboard
                      rootNote={scaleKey}
                      highlightedNotes={(() => {
                        const keyIdx = getNoteIndex(scaleKey)
                        const scale = SCALE_MODES[selectedScaleCategory].find(s => s.name === selectedScale.name)
                        if (!scale) return []
                        return scale.notes.map(interval => {
                          const noteIdx = (keyIdx + interval) % 12
                          return NOTES[noteIdx]
                        }).filter((n): n is string => n !== null)
                      })()}
                      currentStepNote={scaleExerciseSequence.length > 0 ? (() => {
                        const currentDegree = scaleExerciseSequence[scaleExerciseCurrentStep]
                        if (!currentDegree) return undefined
                        const semitone = DEGREE_TO_SEMITONE[currentDegree]
                        if (semitone === undefined) return undefined
                        const keyIdx = getNoteIndex(scaleKey)
                        const noteIdx = (keyIdx + semitone) % 12
                        return NOTES[noteIdx]
                      })() : undefined}
                    />
                  </CardContent>
                </Card>
              )}

              {/* 和弦练习 - 显示要答题的和弦音级（度数） */}
              {activeTab === "chord" && !showChordFretboard && (
                <Card className="py-2">
                  <CardContent className="p-0 px-4">
                    <div className="text-center">
                      {/* 当前题目 */}
                      <div className="mb-3">
                        <h3 className="text-lg font-semibold">{getCurrentChordDisplay()}</h3>
                        <div className="flex flex-wrap justify-center gap-2 mt-2">
                          {(() => {
                            const chords = transposedChords
                            const currentChord = chords[currentChordIndex]
                            if (!currentChord) return null
                            const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
                            return degrees.map((degree, i) => (
                              <Badge 
                                key={i} 
                                variant={i === chordDegreeCurrentStep ? "default" : "outline"}
                                className={cn(
                                  "text-lg px-4 py-2",
                                  i < chordDegreeCurrentStep && "opacity-50"
                                )}
                              >
                                {formatDegree(degree)}
                              </Badge>
                            ))
                          })()}
                        </div>
                      </div>

                      {/* 下一题预览*/}
                      {(() => {
                        const nextChord = getNextChordDisplay()
                        if (!nextChord) return null
                        const chordTypeName = getChordDisplayName(nextChord.type, chordScaleDisplay)
                        const displayName = `${normalizeNoteName(nextChord.root)}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay) ? '' : normalizeNoteName(chordTypeName)}${nextChord.bass ? '/' + normalizeNoteName(nextChord.bass) : ''}`
                        return (
                          <div className="py-1 border-t border-border/30 flex flex-col justify-center">
                            <p className="text-[10px] text-muted-foreground mb-0.5">{t('next_chord')}</p>
                            <div className="text-sm font-medium text-muted-foreground mb-0.5">
                              {displayName}
                            </div>
                            <div className="text-xs text-muted-foreground tracking-tight">
                              {nextChord.degrees.map(formatDegree).join(' ')}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* 音阶练习 - 显示练习序列 */}
              {activeTab === "scale" && !showScaleFretboard && (
                <Card className="py-2">
                  <CardContent className="p-0 px-4">
                    <div className="text-center">
                      {/* 当前题目 */}
                      <div className="mb-3">
                        {isPlaying && scaleExerciseSequence.length > 0 ? (
                          <>
                            <h3 className="text-lg font-semibold">{normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</h3>
                            <div className="flex flex-wrap justify-center gap-2 mt-3">
                              {scaleExerciseSequence.map((degree, i) => (
                                <Badge 
                                  key={i} 
                                  variant={i === scaleExerciseCurrentStep ? "default" : "outline"}
                                  className={cn(
                                    "text-lg px-4 py-2",
                                    i < scaleExerciseCurrentStep && "opacity-50"
                                  )}
                                >
                                  {formatDegree(degree)}
                                </Badge>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground py-4">
                            <p className="text-sm">{t('click_start_to_begin')}</p>
                          </div>
                        )}
                      </div>

                      {/* 下一题预览*/}
                      {isPlaying && nextScaleExerciseInfo && (
                        <div className="py-1 border-t border-border/30 flex flex-col justify-center">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{t('next_chord')}</p>
                          <div className="text-sm font-medium text-muted-foreground mb-0.5">
                            {normalizeNoteName(nextScaleExerciseInfo.key)} {getScaleDisplayName(nextScaleExerciseInfo.scaleName, chordScaleDisplay)}
                          </div>
                          <div className="text-xs text-muted-foreground tracking-tight">
                            {nextScaleExerciseInfo.sequence.map(formatDegree).join(' ')}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* 和弦练习 - 显示当前题目 */}
              {activeTab === "chord_exercise" && !showChordExerciseFretboard && (
                <Card className="py-2">
                  <CardContent className="p-0 px-4">
                    <div className="text-center">
                      {/* 当前题目 */}
                      <div className="mb-3">
                        {isPlaying && chordExerciseTargetChord ? (
                          <>
                            <h3 className="text-lg font-semibold">
                              {normalizeNoteName(chordExerciseTargetChord.root)} {normalizeNoteName(getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay))}
                            </h3>
                            <div className="flex flex-wrap justify-center gap-2 mt-3">
                              {chordExerciseSequence.map((degree, i) => (
                                <Badge 
                                  key={i} 
                                  variant={i === chordExerciseCurrentStep ? "default" : "outline"}
                                  className={cn(
                                    "text-lg px-4 py-2",
                                    i < chordExerciseCurrentStep && "opacity-50"
                                  )}
                                >
                                  {formatDegree(degree)}
                                </Badge>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground py-4">
                            <p className="text-sm">{t('click_start_to_begin')}</p>
                          </div>
                        )}
                      </div>

                      {/* 下一题预览*/}
                      {isPlaying && nextChordExerciseInfo && (
                        <div className="py-1 border-t border-border/30 flex flex-col justify-center">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{t('next_chord')}</p>
                          <div className="text-sm font-medium text-muted-foreground mb-0.5">
                            {nextChordExerciseInfo.root} {getChordDisplayName(nextChordExerciseInfo.type, chordScaleDisplay)}
                          </div>
                          <div className="text-xs text-muted-foreground tracking-tight">
                            {nextChordExerciseInfo.sequence.map(formatDegree).join(' ')}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 音程练习 - 显示当前题目 */}
              {activeTab === "interval" && !showIntervalFretboard && isPlaying && currentIntervalExercise && (
                <Card>
                  <CardContent className="p-6">
                    <div className="text-center space-y-4">
                      {/* 顶部信息栏 */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>{formatTime(timeLeft)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{t('direction')}: {intervalDirection === 'up' ? '↑' : intervalDirection === 'down' ? '↓' : '↕'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{intervalCurrentQueueIndex}/{intervalExerciseQueue.length}</span>
                        </div>
                      </div>
                      
                      {/* 根音显示 */}
                      <div className="text-6xl font-bold">
                        {normalizeNoteName(currentIntervalExercise.rootNote)}
                      </div>
                      {/* 音程题目显示 */}
                      <div className="relative">
                        {/* 背景：所有选中的音符*/}
                        <div className="text-sm text-muted-foreground mb-2">
                          {currentIntervalExercise.allIntervals.map(i => formatDegree(i.symbol)).join(' ')}
                        </div>
                        {/* 当前题目 */}
                        <div className="text-4xl font-bold text-primary">
                          {currentIntervalExercise.currentIntervalDisplay.split(' ').map((interval, idx) => (
                            <span 
                              key={idx}
                              className={cn(
                                "mx-2",
                                currentIntervalExercise.completedIntervals.includes(idx) && "text-muted-foreground line-through"
                              )}
                            >
                              {formatDegree(interval)}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      {/* 目标音符提示（可选） */}
                      {currentIntervalExercise.answered && (
                        <div className="text-lg text-green-600">
                          {currentIntervalExercise.targetNote}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 统计页面 */}
              {activeTab === "stats" && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        {t('nav_stats')}
                      </CardTitle>
                      <div className="flex gap-1 flex-wrap">
                        {[
                          { key: 'today', label: t('stats_today') },
                          { key: 'week', label: t('stats_week') },
                          { key: 'month', label: t('stats_month') },
                          { key: 'total', label: t('stats_total') },
                        ].map((range) => (
                          <Button
                            key={range.key}
                            variant={statsTimeRange === range.key ? "default" : "outline"}
                            size="sm"
                            onClick={() => setStatsTimeRange(range.key as StatsTimeRange)}
                            className="text-xs h-7 px-2 flex-1 sm:flex-none"
                          >
                            {range.label}
                          </Button>
                        ))}
                        <div className="flex gap-1 ml-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={async () => {
                              try {
                                const { getAllPracticeStats } = await import('@/lib/stats-api')
                                const { exportPracticeData } = await import('@/lib/export-utils')
                                const allStats = await getAllPracticeStats()
                                const result = await exportPracticeData(allStats, { format: 'csv', language: language as 'zh-CN' | 'en' })
                                if (result.success) {
                                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                                } else if (result.error !== 'cancelled') {
                                  toast.error(t('export_failed'))
                                }
                              } catch (e) {
                                toast.error(t('export_failed'))
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            CSV
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={async () => {
                              try {
                                const { getAllPracticeStats } = await import('@/lib/stats-api')
                                const { exportPracticeData } = await import('@/lib/export-utils')
                                const allStats = await getAllPracticeStats()
                                const result = await exportPracticeData(allStats, { format: 'pdf', language: language as 'zh-CN' | 'en' })
                                if (result.success) {
                                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                                } else if (result.error !== 'cancelled') {
                                  toast.error(t('export_failed'))
                                }
                              } catch (e) {
                                toast.error(t('export_failed'))
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            PDF
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={async () => {
                              try {
                                const { getAllPracticeStats } = await import('@/lib/stats-api')
                                const { exportPracticeData } = await import('@/lib/export-utils')
                                const allStats = await getAllPracticeStats()
                                const result = await exportPracticeData(allStats, { format: 'json', language: language as 'zh-CN' | 'en' })
                                if (result.success) {
                                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                                } else if (result.error !== 'cancelled') {
                                  toast.error(t('export_failed'))
                                }
                              } catch (e) {
                                toast.error(t('export_failed'))
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            JSON
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={async () => {
                              try {
                                const { getAllPracticeStats } = await import('@/lib/stats-api')
                                const { exportPracticeData } = await import('@/lib/export-utils')
                                const allStats = await getAllPracticeStats()
                                const result = await exportPracticeData(allStats, { format: 'html', language: language as 'zh-CN' | 'en' })
                                if (result.success) {
                                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                                } else if (result.error !== 'cancelled') {
                                  toast.error(t('export_failed'))
                                }
                              } catch (e) {
                                toast.error(t('export_failed'))
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            HTML
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const stats = getStatsByTimeRange(statsTimeRange)
                      const practiceTypeNames: Record<PracticeType, string> = {
                        pitch_finding: t('nav_practice'),
                        scale: t('nav_scale'),
                        chord_exercise: t('nav_chord_exercise'),
                        interval: t('nav_interval'),
                        chord_progression: t('nav_chord')
                      }
                      
                      return (
                        <>
                          {/* 总练习次数*/}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                            <div className="bg-primary/5 rounded-lg p-2 sm:p-3 text-center">
                              <div className="text-xl sm:text-2xl font-bold text-primary">{stats.count}</div>
                              <div className="text-[10px] sm:text-xs text-muted-foreground">{t('stats_total_practices')}</div>
                            </div>
                            {(Object.keys(stats.byType) as PracticeType[]).map(type => (
                              <div key={type} className="bg-card/50 rounded-lg p-2 sm:p-3 text-center border border-border/30">
                                <div className="text-lg sm:text-xl font-semibold">{stats.byType[type] || 0}</div>
                                <div className="text-[10px] sm:text-xs text-muted-foreground">{practiceTypeNames[type]}</div>
                              </div>
                            ))}
                          </div>
                          
                          {/* 详细统计 - 找音练习和音程练习不显示详细分类 */}
                          <div className="space-y-3">
                            <h4 className="text-sm font-medium text-muted-foreground">{t('stats_detail_breakdown')}</h4>
                            {(Object.keys(stats.byDetail) as PracticeType[])
                              .filter(type => type !== 'pitch_finding' && type !== 'interval')
                              .map(type => {
                                const details = stats.byDetail[type]
                                if (!details || details.length === 0) return null
                                
                                return (
                                  <div key={type} className="bg-card/30 rounded-lg p-3 border border-border/30">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium">{practiceTypeNames[type]}</span>
                                      <span className="text-xs text-muted-foreground">{t('stats_count')}: {stats.byType[type] || 0}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {details
                                        .sort((a, b) => b.count - a.count)
                                        .map(detail => (
                                          <span
                                            key={detail.name}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                                          >
                                            {detail.name}
                                            <span className="bg-primary/20 px-1 rounded text-[10px]">{detail.count}</span>
                                          </span>
                                        ))}
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                          
                          {/* 近期练习记录列表 */}
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">{t('stats_recent_records')}</h4>
                            {recentRecords.length === 0 ? (
                              <div className="text-center py-4 text-xs text-muted-foreground">
                                {t('stats_recent_empty')}
                              </div>
                            ) : (
                              <div className="space-y-1 max-h-80 overflow-y-auto">
                                {recentRecords.map((rec, idx) => {
                                  const dt = parseDbTimestamp(rec.created_at || rec.date)
                                  const dateStr = isNaN(dt.getTime()) ? '-' : dbTimestampToLocalDate(rec.created_at || rec.date)
                                  const timeStr = isNaN(dt.getTime()) ? '-' : dt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
                                  // 提取练习项目名（兼容 "练习项目: xxx" 格式）
                                  const notesStr = rec.notes || ''
                                  const m = notesStr.match(/练习项目[:：]\s*(.+)/)
                                  const detailName = m ? m[1].trim() : (notesStr.trim() || '-')
                                  // 类型中文名映射
                                  const typeDisplayMap: Record<string, string> = {
                                    'pitch_finding': t('nav_practice'),
                                    'find_note': t('nav_practice'),
                                    '音高识别': t('nav_practice'),
                                    '找音练习': t('nav_practice'),
                                    'scale': t('nav_scale'),
                                    '音阶练习': t('nav_scale'),
                                    'chord_exercise': t('nav_chord_exercise'),
                                    '和弦练习': t('nav_chord_exercise'),
                                    'interval': t('nav_interval'),
                                    '音程练习': t('nav_interval'),
                                    'chord_progression': t('nav_chord'),
                                    '和弦进行': t('nav_chord'),
                                    '练习': t('nav_practice'),
                                  }
                                  const typeDisplay = typeDisplayMap[rec.exercise_type || rec.exerciseType || ''] || rec.exercise_type || rec.exerciseType || '-'
                                  const acc = rec.accuracy != null ? Math.round(rec.accuracy <= 1 ? rec.accuracy * 100 : rec.accuracy) : null
                                  return (
                                    <div key={rec.id ?? idx} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-card/30 rounded border border-border/20 text-xs">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-muted-foreground tabular-nums shrink-0">{dateStr} {timeStr}</span>
                                        <span className="text-primary shrink-0">{typeDisplay}</span>
                                        <span className="truncate text-muted-foreground">{detailName}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0 text-muted-foreground tabular-nums">
                                        {acc != null && <span>{acc}%</span>}
                                        {rec.duration ? <span>{rec.duration}{t('stats_duration_sec')}</span> : null}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          
                          {stats.count === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">{t('stats_no_data')}</p>
                              <p className="text-xs mt-1">{t('stats_start_practicing')}</p>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>

        {/* Mobile bottom navigation - 优化显示 */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 p-1 pb-safe z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]" role="tablist" aria-label={t('nav_practice')}>
          <div className="flex justify-around">
            {bottomNavItems.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleTabChange(mode.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg min-w-[3rem]",
                  activeTab === mode.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                )}
                style={{ willChange: 'background-color, color' }}
                role="tab"
                aria-selected={activeTab === mode.id}
                aria-label={mode.label}
              >
                <mode.Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium truncate max-w-full">{mode.shortLabel}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* 全屏模式覆盖层 */}
        {isFullscreen && (
          <div 
            className="fixed inset-0 z-[9999] bg-background flex items-center justify-center"
            style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', top: 0, left: 0, right: 0, bottom: 0 }}
            onClick={() => setFullscreenMode(false)}
          >
            <div 
              className="text-center p-8 min-w-[400px] min-h-[300px] flex flex-col items-center justify-center" 
              onClick={(e) => e.stopPropagation()}
            >
              {/* 根据当前练习模式显示不同内容 */}
              {activeTab === "practice" && isPlaying && (
                <div className="space-y-8">
                  {practiceAnswerMode === "fretboard" ? (
                    <>
                      <div className="text-8xl font-bold text-primary">{formatNoteByAccidentalSetting(targetNote)}</div>
                      <div className="text-2xl text-muted-foreground">{t('target_note')}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-6xl font-bold text-primary">{t('target_note')}</div>
                      <div className="text-2xl text-muted-foreground">{t('practice_mode_description_identify')}</div>
                    </>
                  )}
                  {currentPracticeSuggestion && (
                    <div className="mt-4 p-4 bg-card/50 rounded-lg border border-border/30 max-w-md">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-primary">{t('practice_suggestion_title')}:</span> {currentPracticeSuggestion}
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === "chord" && (
                <div className="space-y-8">
                  <div className="text-7xl font-bold text-primary">{getCurrentChordDisplay()}</div>
                  <div className="flex flex-wrap justify-center gap-4">
                    {(() => {
                      const chords = transposedChords
                      const currentChord = chords[currentChordIndex]
                      if (!currentChord) return null
                      const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
                      return degrees.map((degree, i) => (
                        <span key={i} className="text-5xl font-bold text-primary">{formatDegree(degree)}</span>
                      ))
                    })()}
                  </div>
                  {/* 下一题预览*/}
                  {(() => {
                    const nextChord = getNextChordDisplay()
                    if (!nextChord) return null
                    const chordTypeName = getChordDisplayName(nextChord.type, chordScaleDisplay)
                    const displayName = `${normalizeNoteName(nextChord.root)}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay) ? '' : normalizeNoteName(chordTypeName)}${nextChord.bass ? '/' + normalizeNoteName(nextChord.bass) : ''}`
                    return (
                      <div className="pt-8 mt-8 border-t border-border/30">
                        <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
                        <div className="text-xl font-medium text-muted-foreground mb-1">{displayName}</div>
                        <div className="text-lg text-muted-foreground/70">{nextChord.degrees.map(formatDegree).join(' ')}</div>
                      </div>
                    )
                  })()}
                </div>
              )}
              
              {activeTab === "chord_exercise" && isPlaying && chordExerciseTargetChord && (
                <div className="space-y-8">
                  <div className="text-7xl font-bold text-primary">
                    {normalizeNoteName(chordExerciseTargetChord.root)} {normalizeNoteName(getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-4">
                    {chordExerciseSequence.map((degree, i) => (
                      <span 
                        key={i} 
                        className={cn(
                          "text-5xl font-bold",
                          i === chordExerciseCurrentStep ? "text-primary" : "text-muted-foreground",
                          i < chordExerciseCurrentStep && "opacity-30"
                        )}
                      >
                        {formatDegree(degree)}
                      </span>
                    ))}
                  </div>
                  {/* 下一题预览*/}
                  {nextChordExerciseInfo && (
                    <div className="pt-8 mt-8 border-t border-border/30">
                      <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
                      <div className="text-xl font-medium mb-1">
                        {nextChordExerciseInfo.root} {getChordDisplayName(nextChordExerciseInfo.type, chordScaleDisplay)}
                      </div>
                      <div className="text-lg text-muted-foreground/70">
                        {nextChordExerciseInfo.sequence.map(formatDegree).join(' ')}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === "scale" && isPlaying && scaleExerciseSequence.length > 0 && (
                <div className="space-y-6">
                  <div className="text-6xl font-bold text-primary">{normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</div>
                  <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
                    {scaleExerciseSequence.map((degree, i) => (
                      <span 
                        key={i} 
                        className={cn(
                          "text-4xl font-bold",
                          i === scaleExerciseCurrentStep ? "text-primary" : "text-muted-foreground",
                          i < scaleExerciseCurrentStep && "opacity-30"
                        )}
                      >
                        {formatDegree(degree)}
                      </span>
                    ))}
                  </div>
                  {/* 下一题预览*/}
                  {nextScaleExerciseInfo && (
                    <div className="pt-6 mt-6 border-t border-border/30">
                      <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
                      <div className="text-xl font-medium mb-1">
                        {normalizeNoteName(nextScaleExerciseInfo.key)} {getScaleDisplayName(nextScaleExerciseInfo.scaleName, chordScaleDisplay)}
                      </div>
                      <div className="text-lg text-muted-foreground/70">
                        {nextScaleExerciseInfo.sequence.map(formatDegree).join(' ')}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === "interval" && isPlaying && currentIntervalExercise && (
                <div className="space-y-8">
                  <div className="text-8xl font-bold text-primary">{normalizeNoteName(currentIntervalExercise.rootNote)}</div>
                  <div className="text-6xl font-bold">
                    {currentIntervalExercise.currentIntervalDisplay.split(' ').map((interval, idx) => (
                      <span 
                        key={idx}
                        className={cn(
                          "mx-4",
                          currentIntervalExercise.completedIntervals.includes(idx) && "text-muted-foreground line-through"
                        )}
                      >
                        {interval}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 提示文字 */}
              <div className="mt-12 text-sm text-muted-foreground">
                {t('click_to_exit_fullscreen')}
              </div>
            </div>
          </div>
        )}

        {/* 快捷键帮助对话框 */}
        <Dialog open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                {t('shortcuts_title')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t('shortcuts_title')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* 全局快捷键*/}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('shortcuts_global')}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_esc')}</kbd>
                    <span className="text-sm">{t('shortcuts_esc_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_number')}</kbd>
                    <span className="text-sm">{t('shortcuts_number_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_f')}</kbd>
                    <span className="text-sm">{t('shortcuts_f_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_m')}</kbd>
                    <span className="text-sm">{t('shortcuts_m_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_s')}</kbd>
                    <span className="text-sm">{t('shortcuts_s_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_p')}</kbd>
                    <span className="text-sm">{t('shortcuts_p_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_h')}</kbd>
                    <span className="text-sm">{t('shortcuts_h_desc')}</span>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              {/* 练习模式快捷键*/}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('shortcuts_practice')}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_space')}</kbd>
                    <span className="text-sm">{t('shortcuts_space_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_up')}</kbd>
                    <span className="text-sm">{t('shortcuts_up_desc')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_down')}</kbd>
                    <span className="text-sm">{t('shortcuts_down_desc')}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button onClick={() => setShowShortcutsHelp(false)} variant="outline" size="sm">
                {t('shortcuts_close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 乐曲选择弹窗 */}
        <Dialog open={showSongSelector} onOpenChange={setShowSongSelector}>
          <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <ListMusic className="h-5 w-5" />
                  {t('select_song')}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {t('select_song')}
                </DialogDescription>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('sort_label')}</span>
                  <Select value={songSortBy} onValueChange={(v) => setSongSortBy(v as typeof songSortBy)}>
                    <SelectTrigger className="h-8 text-xs w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="title-asc" className="text-xs">{t('sort_title_asc')}</SelectItem>
                      <SelectItem value="title-desc" className="text-xs">{t('sort_title_desc')}</SelectItem>
                      <SelectItem value="style-asc" className="text-xs">{t('sort_style_asc')}</SelectItem>
                      <SelectItem value="style-desc" className="text-xs">{t('sort_style_desc')}</SelectItem>
                      <SelectItem value="composer-asc" className="text-xs">{t('sort_composer_asc')}</SelectItem>
                      <SelectItem value="composer-desc" className="text-xs">{t('sort_composer_desc')}</SelectItem>
                      <SelectItem value="year-asc" className="text-xs">{t('sort_year_asc')}</SelectItem>
                      <SelectItem value="year-desc" className="text-xs">{t('sort_year_desc')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DialogHeader>

            {/* 搜索框*/}
            <div className="px-6 py-3 border-b bg-muted/30">
              <div className="relative">
                <input
                  type="text"
                  placeholder={t('search_song_placeholder')}
                  value={songSearchQuery}
                  onChange={(e) => setSongSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
              </div>
            </div>

            {/* 乐曲列表 */}
            <div className="flex-1 overflow-y-auto max-h-[300px]">
              {groupedSongs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('no_songs_found')}
                </div>
              ) : (
                <div className="px-4 py-2">
                  {groupedSongs.map(({ group, songs }) => (
                    <div key={group}>
                      <div className="flex items-center py-1 bg-background/95 backdrop-blur z-10 sticky top-0">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                          {group}
                        </h4>
                      </div>
                      {songs.map((song) => (
                        <div
                          key={song.name}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                            selectedSong.name === song.name
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted/50 border border-transparent"
                          )}
                          onClick={() => {
                            setSelectedSong(song)
                            if (song.key) {
                              const songKey = song.key
                              const notePart = songKey.endsWith('m') ? songKey.slice(0, -1) : songKey
                              
                              let normalizedKey = notePart
                              if (notePart.includes('b') && !notePart.includes('#')) {
                                const flatIndex = findNoteIndexInArray(notePart, NOTES_FLAT)
                                if (flatIndex !== -1) {
                                  normalizedKey = NOTES[flatIndex]
                                }
                              }
                              
                              setProgressionKey(normalizedKey)
                              setIsMinor(songKey.endsWith('m'))
                            }
                            setCustomChords([])
                            setCurrentChordIndex(0)
                            setShowSongSelector(false)
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{song.name}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span>{song.composer || t('unknown')}</span>
                              <span>·</span>
                              <span>{song.year || t('unknown')}</span>
                              <span>·</span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {song.style || t('jazz_standard')}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSongFavorite(song.name)
                              }}
                            >
                              {isSongFavorite(song.name) ? (
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              ) : (
                                <Star className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedSongInfo(song)
                                setShowSongInfoDialog(true)
                              }}
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomSongEditor(true)
                }}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                {language === 'zh-CN' ? '自定义歌曲编辑器' : 'Song Editor'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedSong({ name: '__custom__', composer: '', year: '', style: '', tempo: '', key: 'C', chords: [] })
                  setCurrentChordIndex(0)
                  setShowSongSelector(false)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('chord_custom')}
              </Button>
              <Button variant="outline" onClick={() => setShowSongSelector(false)}>
                {t('btn_cancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 乐曲信息弹窗 */}
        <Dialog open={showSongInfoDialog} onOpenChange={setShowSongInfoDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                {selectedSongInfo?.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {selectedSongInfo?.name}
              </DialogDescription>
            </DialogHeader>

            {selectedSongInfo && (
              <div className="space-y-4 py-4">
                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('song_composer')}</Label>
                    <p className="text-sm font-medium">{selectedSongInfo.composer || t('unknown')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('song_year')}</Label>
                    <p className="text-sm font-medium">{selectedSongInfo.year || t('unknown')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('song_style')}</Label>
                    <p className="text-sm font-medium">{selectedSongInfo.style || t('jazz_standard')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('song_tempo')}</Label>
                    <p className="text-sm font-medium">{selectedSongInfo.tempo || t('unknown')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('song_key')}</Label>
                    <p className="text-sm font-medium">{selectedSongInfo.key || t('unknown')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('chord_count')}</Label>
                    <p className="text-sm font-medium">{selectedSongInfo.chords?.length || 0} {t('chords')}</p>
                  </div>
                </div>

                <Separator />

                {/* 和弦进行 */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t('chord_progression')}</Label>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-sm font-mono leading-relaxed">
                      {selectedSongInfo.chords?.join(' - ') || t('no_chords')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={() => {
                  if (selectedSongInfo) {
                    setSelectedSong(selectedSongInfo)
                    if (selectedSongInfo.key) {
                      setProgressionKey(selectedSongInfo.key)
                    }
                    setCustomChords([])
                    setCurrentChordIndex(0)
                  }
                  setShowSongInfoDialog(false)
                  setShowSongSelector(false)
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                {t('select_this_song')}
              </Button>
              <Button variant="outline" onClick={() => setShowSongInfoDialog(false)}>
                {t('btn_close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 练习模式选择弹窗 */}
        <Dialog open={showLevelSelector} onOpenChange={setShowLevelSelector}>
          <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {t('practice_level')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t('practice_level')}
              </DialogDescription>
            </DialogHeader>

            {/* 练习模式列表 */}
            <ScrollArea className="max-h-[60vh]">
              <div className="p-4 space-y-4">
                {/* 基础练习 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {t('practice_category_basic')}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {PRACTICE_LEVELS.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{t(level.nameKey)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t(`level_desc_${level.id.replace(/-/g, '_')}` as keyof typeof TRANSLATIONS['zh-CN']) || level.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleLevelFavorite(level.id)
                            }}
                          >
                            {isLevelFavorite(level.id) ? (
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            ) : (
                              <Star className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                              setSelectedLevelInfo(fullLevel || null)
                              setShowLevelInfoDialog(true)
                            }}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 四和弦音 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {t('level_group_four_chord_tones')}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {FOUR_CHORD_TONES.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{t(level.nameKey)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t(`level_desc_${level.id}` as keyof typeof TRANSLATIONS['zh-CN']) || level.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                            setSelectedLevelInfo(fullLevel || null)
                            setShowLevelInfoDialog(true)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 旋律结构 - R到3th */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {t('practice_category_melodic_r5')}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {MELODIC_STRUCTURE_R_TO_5TH.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{t(level.nameKey)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t(`level_desc_${level.id}` as keyof typeof TRANSLATIONS['zh-CN']) || level.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                            setSelectedLevelInfo(fullLevel || null)
                            setShowLevelInfoDialog(true)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 旋律结构 - 5th到7th */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {t('practice_category_melodic_59')}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {MELODIC_STRUCTURE_5TH_TO_9TH.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{t(level.nameKey)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t(`level_desc_${level.id}` as keyof typeof TRANSLATIONS['zh-CN']) || level.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                            setSelectedLevelInfo(fullLevel || null)
                            setShowLevelInfoDialog(true)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Voice Led结构 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {t('practice_category_voice_led')}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {VOICE_LED_STRUCTURES.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{t(level.nameKey)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t(`level_desc_${level.id}` as keyof typeof TRANSLATIONS['zh-CN']) || level.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                            setSelectedLevelInfo(fullLevel || null)
                            setShowLevelInfoDialog(true)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 经过音技巧*/}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {t('practice_category_passing')}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {PASSING_TONE_TECHNIQUES.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{t(level.nameKey)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t(`level_desc_${level.id}` as keyof typeof TRANSLATIONS['zh-CN']) || level.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                            setSelectedLevelInfo(fullLevel || null)
                            setShowLevelInfoDialog(true)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 变化属和弦结构 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {language === 'zh-CN' ? '变化属和弦结构' : 'Altered Dominant Structures'}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {ALTERED_LEVELS.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{language === 'zh-CN' ? level.nameZh : level.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {language === 'zh-CN' ? level.descriptionZh : level.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedLevelInfo(level)
                            setShowLevelInfoDialog(true)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 减音阶 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                    {language === 'zh-CN' ? '减音阶' : 'Diminished Scales'}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {DIMINISHED_SCALES_LEVELS.map((level) => (
                      <div
                        key={level.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                          practiceLevel === level.id
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-muted/50 border-transparent"
                        )}
                        onClick={() => {
                          setPracticeLevel(level.id)
                          setShowLevelSelector(false)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{language === 'zh-CN' ? level.nameZh : level.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {language === 'zh-CN' ? level.descriptionZh : level.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedLevelInfo(level)
                            setShowLevelInfoDialog(true)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-4 border-t">
              <Button variant="outline" onClick={() => setShowLevelSelector(false)}>
                {t('btn_close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 练习模式详细信息弹窗 */}
        <Dialog open={showLevelInfoDialog} onOpenChange={setShowLevelInfoDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {selectedLevelInfo ? t(selectedLevelInfo.nameKey) : ''}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {selectedLevelInfo ? t(selectedLevelInfo.nameKey) : ''}
              </DialogDescription>
            </DialogHeader>

            {selectedLevelInfo && (
              <div className="space-y-4 py-4">
                {/* 基本信息 */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('practice_level')}</Label>
                    <p className="text-sm font-medium">{t(selectedLevelInfo.nameKey)}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('description')}</Label>
                    <p className="text-sm">
                      {t(`level_desc_${selectedLevelInfo.id}` as keyof typeof TRANSLATIONS['zh-CN']) || 
                       t(`level_desc_${selectedLevelInfo.id.replace(/-/g, '_')}` as keyof typeof TRANSLATIONS['zh-CN']) || 
                       selectedLevelInfo.description}
                    </p>
                  </div>

                  {/* 音程信息 */}
                  {(() => {
                    const level = selectedLevelInfo as { intervals?: number[] }
                    if (level.intervals && Array.isArray(level.intervals)) {
                      const degreeMap: Record<number, string> = {
                        0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
                        6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
                      }
                      return (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('intervals')}</Label>
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-sm font-mono">
                              {level.intervals.map(i => degreeMap[i] || i).join(' - ')}
                            </p>
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* 和弦类型特定音程 */}
                  {(() => {
                    const level = selectedLevelInfo as { chordTypes?: Record<string, number[]> }
                    if (level.chordTypes && typeof level.chordTypes === 'object') {
                      const degreeMap: Record<number, string> = {
                        0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
                        6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
                      }
                      return (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">{t('chord_type_intervals')}</Label>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {Object.entries(level.chordTypes).map(([type, intervals]) => (
                              <div key={type} className="p-2 bg-muted/30 rounded">
                                <span className="font-medium capitalize">{type}:</span>{' '}
                                <span className="font-mono text-xs">
                                  {intervals.map(i => degreeMap[i] || i).join('-')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* SOLO风格等级选项 */}
                  {(() => {
                    const soloLevel = selectedLevelInfo as typeof ALL_SOLO_LEVELS[0]
                    if (soloLevel.sequences) {
                      return (
                        <div className="space-y-3 pt-2 border-t">
                          <Label className="text-xs text-muted-foreground">{t('level_options')}</Label>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                              <span>{t('level_order_option')}</span>
                              <Badge variant={soloLevel.orderOption ? "default" : "outline"}>
                                {soloLevel.orderOption ? t('enabled') : t('disabled')}
                              </Badge>
                            </div>
                            <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                              <span>{t('level_random_option')}</span>
                              <Badge variant={soloLevel.randomOption ? "default" : "outline"}>
                                {soloLevel.randomOption ? t('enabled') : t('disabled')}
                              </Badge>
                            </div>
                            <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                              <span>{t('level_starting_interval')}</span>
                              <Badge variant="secondary">{soloLevel.startingIntervalOption}</Badge>
                            </div>
                            <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                              <span>{t('level_notes_per_chord')}</span>
                              <Badge variant="secondary">{soloLevel.notesPerChord}</Badge>
                            </div>
                            <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                              <span>{t('level_force_natural_five')}</span>
                              <Badge variant={soloLevel.forceNaturalFive ? "default" : "outline"}>
                                {soloLevel.forceNaturalFive ? t('yes') : t('no')}
                              </Badge>
                            </div>
                            {soloLevel.endOnStartingInterval !== undefined && (
                              <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                                <span>{t('level_end_on_starting')}</span>
                                <Badge variant={soloLevel.endOnStartingInterval ? "default" : "outline"}>
                                  {soloLevel.endOnStartingInterval ? t('yes') : t('no')}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={() => {
                  if (selectedLevelInfo) {
                    setPracticeLevel(selectedLevelInfo.id)
                  }
                  setShowLevelInfoDialog(false)
                  setShowLevelSelector(false)
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                {t('select_this_level')}
              </Button>
              <Button variant="outline" onClick={() => setShowLevelInfoDialog(false)}>
                {t('btn_close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 和弦练习模式选择弹窗 */}
        <Dialog open={showChordExerciseLevelSelector} onOpenChange={setShowChordExerciseLevelSelector}>
          <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {t('practice_level')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t('practice_level')}
              </DialogDescription>
            </DialogHeader>

            {/* 练习模式列表 */}
            <ScrollArea className="max-h-[60vh]">
              <div className="p-4 space-y-4">
                {LOCAL_PRACTICE_MODE_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                      {language === 'zh-CN' ? group.nameZh : group.name}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {group.levels.map((level) => (
                        <div
                          key={level.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                            chordExerciseLevel === level.id
                              ? "bg-primary/10 border-primary/30"
                              : "hover:bg-muted/50 border-transparent"
                          )}
                          onClick={() => {
                            setChordExerciseLevel(level.id)
                            setShowChordExerciseLevelSelector(false)
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{t(level.nameKey)}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {level.description}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedLevelInfo(level)
                              setShowLevelInfoDialog(true)
                            }}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-4 border-t">
              <Button variant="outline" onClick={() => setShowChordExerciseLevelSelector(false)}>
                {t('btn_close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新手教程覆盖层*/}
        <OnboardingOverlay />

        <Dialog open={showCustomSongEditor} onOpenChange={setShowCustomSongEditor}>
          <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
            <CustomSongEditor language={language as 'zh-CN' | 'en'} onClose={() => setShowCustomSongEditor(false)} />
          </DialogContent>
        </Dialog>

        {focusMode?.enabled && (
          <FocusMode
            language={language as 'zh-CN' | 'en'}
            isPlaying={isPlaying}
            score={{ correct: score.correct, total: score.total }}
            timeLeft={timeLeft}
            practiceTime={practiceTime}
          />
        )}

        <MetronomeVisualizer
          bpm={metronomeBpm}
          enabled={metronomeSettings.visualize ?? false}
          isPlaying={isPlaying}
          beatsPerMeasure={4}
          language={language as 'zh-CN' | 'en'}
        />
      </div>
    </TooltipProvider>
    </OnboardingProvider>
  )
}
