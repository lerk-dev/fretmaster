﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿"use client"

import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { savePracticeStats as saveToServer, getAllPracticeStats, PracticeStats as ServerPracticeStats } from "@/lib/stats-api"
import { useAppStore, useAudioSettings, usePracticeSettings, useMetronomeSettings, useScore, useIsPlaying, useVersion, useDisplayScale } from "@/lib/store"
import { VERSION, BUILD_DATE_LOCAL } from "@/lib/version"
import { logger } from "@/lib/logger"
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
import { cn } from "@/lib/utils"
import Sidebar from "@/components/Sidebar"
import Header from "@/components/Header"
import BottomNavigation from "@/components/BottomNavigation"
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
} from "lucide-react"
import { toast } from "sonner"
import { PianoKeyboard, SimplePianoKeyboard } from "@/components/piano-keyboard"

// ==================== 多语言支持 ====================
const TRANSLATIONS = {
                'zh-CN': {
                    'fullscreen_mode': '全屏模式',
                    'click_to_exit_fullscreen': '点击退出全屏',
                    'multi_select_hint': '可多选',
                    'clear_all': '清空',
                    'stats_start_practicing': '开始练习来记录数据',
                    'stats_no_data': '暂无数据',
                    'stats_count': '次数',
                    'stats_detail_breakdown': '详细分类',
                    'stats_total_practices': '总练习次数',
                    'stats_total': '总计',
                    'stats_month': '本月',
                    'stats_week': '本周',
                    'stats_today': '今天',
                    'current_step': '当前步骤',
                    'chord_degrees': '和弦音级',
                    'random_key': '随机调性',
                    'scale_notes': '音阶音符',
                    'scale_intervals': '音程',
                    'scale_formula': '音阶公式',
                    'scale_structure': '音阶结构',
                    'nav_arpeggio': '琶音练习',
                    'next_chord': '下一个',
                    'chord_progression_info': '和弦进行信息',
                    'chord_progression_structure': '和弦进行结构',
                    'btn_next': '下一个',
                    'btn_stop': '停止练习',
                    'time_remaining': '剩余时间',
                    'practice_mode_description_identify': '听音并在指板上点击正确位置',
                    'practice_mode_identify': '辨音模式',
                    'practice_mode_find': '找音模式',
                    'show_keyboard': '显示键盘',
                    'chord_structure': '和弦结构',
                    'click_start_to_begin': '点击开始按钮开始练习',
                    'show_fretboard': '显示指板',
                    'fixed_root': '固定根音',
                    'hide_notes': '隐藏音符',
                    'show_all_notes': '显示所有音符',
                    'settings_practice': '练习设置',
                    'tuner_e1': '1弦 E',
                    'tuner_b2': '2弦 B',
                    'tuner_g3': '3弦 G',
                    'tuner_d4': '4弦 D',
                    'tuner_a5': '5弦 A',
                    'tuner_e6': '6弦 E',
                    'tuner_strings': '琴弦',
                    'tuner_reference': '参考频率',
                    'tuner_too_high': '偏高',
                    'tuner_too_low': '偏低',
                    'tuner_in_tune': '音准',
                    'chord_scale_display': '和弦音阶显示',
                    'display_jazz': '爵士记谱',
                    'display_english_short': '英文缩写',
                    'display_english': '英文显示',
                    'display_chinese': '中文显示',
                    'midi_select_device': '选择MIDI设备',
                    'metronome_flash': '节拍器闪光',
                    'metronome_sound': '节拍器声音',
                    'device_cooldown_duration': '冷却时长',
                    'device_cooldown_enabled': '启用冷却时间',
                    'fretboard_title': '指板',
                    'btn_close': '关闭',
                    'onboarding_welcome_desc': '这是一个帮助你掌握吉他指板的可视化练习工具',
                    'onboarding_welcome_title': '欢迎使用 FretMaster',
                    'onboarding_tuner_title': '调音器',
                    'onboarding_tuner_desc': '首先，使用调音器确保你的吉他音准正确。点击麦克风图标启用音频输入。',
                    'onboarding_fretboard_title': '指板可视化',
                    'onboarding_fretboard_desc': '这是吉他指板的可视化展示。你可以看到所有品格和琴弦的位置。',
                    'onboarding_practice_tabs_title': '练习模式',
                    'onboarding_practice_tabs_desc': '我们提供多种练习模式：和弦练习、音阶练习、找音练习等。点击标签切换。',
                    'onboarding_chord_exercise_title': '和弦练习',
                    'onboarding_chord_exercise_desc': '在和弦练习中，系统会显示和弦构成音，你需要在指板上找到对应的音。',
                    'onboarding_scale_exercise_title': '音阶练习',
                    'onboarding_scale_exercise_desc': '音阶练习帮助你熟悉各种音阶在指板上的位置，支持多种指法模式。',
                    'onboarding_settings_title': '个性化设置',
                    'onboarding_settings_desc': '在设置中，你可以调整显示方式、选择语言、配置音频设备等。',
                    'onboarding_shortcuts_title': '快捷键支持',
                    'onboarding_shortcuts_desc': '按 H 键可以查看所有快捷键，提高练习效率。',
                    'onboarding_complete_title': '开始练习吧！',
                    'onboarding_complete_desc': '现在你已经了解了基本功能。开始你的吉他学习之旅吧！',
                    'onboarding_paused': '教程已暂停',
                    'onboarding_continue': '继续',
                    'onboarding_prev': '上一步',
                    'onboarding_next': '下一步',
                    'onboarding_skip': '跳过',
                    'onboarding_finish': '完成',
                    'onboarding_tip': '提示',
                    // 排序相关
                    'sort_label': '排序',
                    'sort_title_asc': '标题 A-Z',
                    'sort_title_desc': '标题 Z-A',
                    'sort_style_asc': '风格 A-Z',
                    'sort_style_desc': '风格 Z-A',
                    'sort_composer_asc': '作曲家 A-Z',
                    'sort_composer_desc': '作曲家 Z-A',
                    'sort_year_asc': '年份 旧-新',
                    'sort_year_desc': '年份 新-旧',
                    // 歌曲信息
                    'song_key': '调性',
                    'chord_count': '和弦数量',
                    'chords': '个和弦',
                    'chord_progression': '和弦进行',
                    'no_chords': '无和弦信息',
                    'select_this_song': '选择此歌曲',
                    // 练习等级
                    'level_root_third_fifth': '原位三和弦(1,3,5)',
                    'level_third_fifth_seventh': '三音+五音+七音(3,5,7)',
                    'level_random_inversion_triad': '随机转位三和弦',
                    'level_root_third_fifth_seventh': '原位七和弦(1,3,5,7)',
                    'level_third_fifth_seventh_root': '三音+五音+七音+根音(3,5,7,1)',
                    'level_fifth_seventh_root_third': '五音+七音+根音+三音(5,7,1,3)',
                    'level_seventh_root_third_fifth': '七音+根音+三音+五音(7,1,3,5)',
                    'level_random_inversion_seventh': '随机转位七和弦',
                    'level_root_third_fifth_seventh_root': '扩展练习(1,3,5,7,1)',
                    // 基础练习等级
                    'level_single_root': '1',
                    'level_single_3': '3',
                    'level_single_5': '5',
                    'level_single_7': '7',
                    'level_double_root_3': '1,3',
                    'level_double_root_5': '1,5',
                    'level_double_root_7': '1,7',
                    'level_double_3_5': '3,5',
                    'level_double_3_7': '3,7',
                    'level_double_5_7': '5,7',
                    'level_triple_root_3_5': '1,3,5',
                    'level_triple_3_5_7': '3,5,7',
                    'level_triple_random_inversion': '1,3,5随机转位',
                    'level_quad_root_3_5_7': '1,3,5,7',
                    'level_quad_3_5_7_root': '3,5,7,1',
                    'level_quad_5_7_root_3': '5,7,1,3',
                    'level_quad_7_root_3_5': '7,1,3,5',
                    'level_quad_random_inversion': '1,3,5,7随机转位',
                    'level_quad_root_3_5_7_root': '1,3,5,7,1',
                    'level_all': '全部',
                    // 旋律结构练习
                    'level_melodic_1': '旋律结构1 - 根音到五音',
                    'level_melodic_2': '旋律结构2 - 根音到五音变化',
                    'level_melodic_3': '旋律结构3 - 五音到根音',
                    'level_melodic_4': '旋律结构4 - 三音进行',
                    'level_melodic_5': '旋律结构5 - 随机转位',
                    'level_melodic_6': '旋律结构6 - 五音到九音',
                    'level_melodic_7': '旋律结构7 - 五音到九音变化',
                    'level_melodic_8': '旋律结构8 - 复杂音程',
                    'level_melodic_9': '旋律结构9 - 倒置结构',
                    'level_melodic_10': '旋律结构10 - 随机转位',
                    // Voice Led 声部连接
                    'level_voice_led_1': 'Voice Led 1 - 基础声部连接',
                    'level_voice_led_2': 'Voice Led 2 - 变化声部连接',
                    'level_voice_led_3': 'Voice Led 3 - 和音声部连接',
                    'level_voice_led_4': 'Voice Led 4 - 混合声部连接',
                    'level_voice_led_5': 'Voice Led 5 - 高级声部连接',
                    // 经过音技巧
                    'level_passing_1': '经过音1 - 半音经过',
                    'level_passing_2': '经过音2 - 全音经过',
                    'level_passing_3': '经过音3 - 三音经过',
                    'level_passing_4': '经过音4 - 四音经过',
                    'level_passing_5': '经过音5 - 五音经过',
                    // 练习等级分类标题
                    'practice_category_basic': '基础练习',
                    'practice_category_melodic_r5': '旋律结构 - R→5th',
                    'practice_category_melodic_59': '旋律结构 - 5th→9th',
                    'practice_category_voice_led': 'Voice Led结构',
                    'practice_category_passing': '经过音技巧',
                    'custom_chord_not_found': '未找到和弦',
                    'custom_chord_load_error': '加载和弦失败',
                    'custom_chord_empty_load': '没有可加载的和弦',
                    'custom_chord_loaded': '和弦已加载',
                    'custom_chord_saved': '和弦已保存',
                    'custom_chord_unnamed': '未命名和弦',
                    'custom_chord_empty': '和弦为空',
                    'error_occurred': '发生错误',
                    'import_settings': '导入设置',
                    'import_success': '导入成功',
                    'export_settings': '导出设置',
                    'save_success': '保存成功',
                    'tuner_need_mic': '需要麦克风权限',
                    'tuner_stop': '停止调音',
                    'tuner_start': '开始调音',
                    'answer_mode': '答题模式',
                    'keyboard_shortcuts': '键盘快捷键',
                    // 快捷键面板
                    'shortcuts_title': '键盘快捷键',
                    'shortcuts_global': '全局快捷键',
                    'shortcuts_esc': 'ESC',
                    'shortcuts_esc_desc': '停止练习 / 退出全屏',
                    'shortcuts_number': '1-5',
                    'shortcuts_number_desc': '切换练习标签页',
                    'shortcuts_f': 'F',
                    'shortcuts_f_desc': '切换全屏模式',
                    'shortcuts_m': 'M',
                    'shortcuts_m_desc': '切换麦克风',
                    'shortcuts_s': 'S',
                    'shortcuts_s_desc': '打开设置',
                    'shortcuts_p': 'P',
                    'shortcuts_p_desc': '开始/停止练习',
                    'shortcuts_h': 'H',
                    'shortcuts_h_desc': '显示/隐藏快捷键帮助',
                    'shortcuts_practice': '练习模式快捷键',
                    'shortcuts_space': '空格 / → / PageDown',
                    'shortcuts_space_desc': '下一题',
                    'shortcuts_up': '↑',
                    'shortcuts_up_desc': '显示指板',
                    'shortcuts_down': '↓',
                    'shortcuts_down_desc': '隐藏指板 / 下一题',
                    'shortcuts_close': '关闭',
                    'practice_time': '练习时间',
                    'select_strings': '选择弦',
                    'target_note': '目标音',
                    'tuner_title': '吉他调音器',
                    'nav_tuner': '调音器',
                    'nav_stats': '统计',
                    'nav_chord_exercise': '和弦练习',
                    'nav_interval': '音程练习',
                    'nav_practice': '找音练习',
                    'app_title': '🎸 吉他指板视觉化练习工具',
                 
                    'page_title': '吉他指板视觉化练习工具',
                    'btn_start': '开始练习',
                    'status_ready': '准备就绪',
                    'lang_zh': '中文',
                    'lang_en': 'English',
                    'nav_scale': '音阶练习',
                    'nav_chord': '和弦转换',
                    'nav_progression': '和弦进行',
                    'nav_pitch_finding': '音程练习',
                    'settings_pitch_finding': '音程练习设置',
                    'nav_settings': '设置',
                    'settings_scale': '音阶练习选项',
                    'settings_chord': '和弦练习选项',
                    'settings_device': '设备设置',
                    'settings_general': '通用设置',
                    'general_language': '语言设置',
                    'interface_language': '界面语言',
                    'test_language_switch': '测试语言切换',
                    
                    // 快捷键提示
                    'shortcut_hint': '按 ESC 返回主菜单',
                    
                    // 音高显示
                    'pitch_display': '音高',
                    'cents_display': '音分差',
                    
                    // 和弦设置
                    'chord_root_note': '根音',
                    'chord_root_note_hint': '选择和弦的根音',
                    'chord_type': '和弦类型',
                    'chord_type_hint': '选择要练习的和弦类型',
                    'chord_order': '顺序',
                    'chord_order_hint': '选择和弦音符的演奏顺序',
                    'chord_custom': '自定义和弦进行',
                    
                    // 和弦转位设置
                    'chord_bass_note': '低音音符',
                    'chord_bass_root': '根音',
                    'chord_bass_3rd': '三音',
                    'chord_bass_5th': '五音',
                    'chord_bass_7th': '七音',
                    'chord_bass_random': '随机',

                    
                    // 顺序按钮
                    'order_ascending': '上行',
                    'order_descending': '下行',
                    'order_random': '随机',
                    
                    // 和弦类型
                    'chord_major': '大三和弦',
                    'chord_minor': '小三和弦',
                    'chord_dim': '减三和弦',
                    'chord_aug': '增三和弦',
                    'chord_6': '大六和弦',
                    'chord_m6': '小六和弦',
                    'chord_7': '属七和弦',
                    'chord_maj7': '大七和弦',
                    'chord_m7': '小七和弦',
                    'chord_m7b5': '半减七和弦',
                    'chord_dim7': '减七和弦',
                    'chord_9': '属九和弦',
                    'chord_maj9': '大九和弦',
                    'chord_m9': '小九和弦',
                    'chord_7sharp9': '属7♯9和弦',
                    'chord_7flat9': '属7♭9和弦',
                    'chord_11': '属十一和弦',
                    'chord_m11': '小十一和弦',
                    'chord_7sharp11': '属7♯11和弦',
                    'chord_13': '属十三和弦',
                    'chord_m13': '小十三和弦',
                    'chord_sus2': '挂二和弦',
                    'chord_sus4': '挂四和弦',
                    'chord_add9': '加九和弦',
                    'chord_madd9': '小加九和弦',
                    'chord_6add9': '六加九和弦',
                    'chord_m6add9': '小六加九和弦',
                    
                    // 随机选项
                    'random': '随机',
                    'random_root': '随机根音',
                    'random_chord': '随机和弦',
                    
                    // 选择器页面
                    'search_song_placeholder': '搜索歌曲名...',
                    'select_song': '选择乐曲',
                    'practice_level': '练习等级',
                    'select_key': '选择调性',
                    'key_desc': '调性',
                    
                    // 练习等级选项
                    'single_chord_notes': '单和弦音',
                    'double_chord_notes': '双和弦音',
                    'triple_chord_notes': '三和弦音',
                    'quad_chord_notes': '四和弦音',
                    'all_chord_notes': '全部和弦音',

                    // 音程描述
                    'root_note': 'R',
                    'third_note': '3rd',
                    'fifth_note': '5th',
                    'seventh_note': '7th',
                    'root': '根音',
                    'third': '三音',
                    'fifth': '五音',
                    'seventh': '七音',
                    'root_third': 'R,3rd',
                    'root_fifth': 'R,5th',
                    'root_seventh': 'R,7th',
                    'third_fifth': '3rd,5th',
                    'third_seventh': '3rd,7th',
                    'root_third_fifth': '原位三和弦',
                    'third_fifth_seventh': '3rd,5th,7th',
                    'random_inversion': '随机转位',
                    'root_third_fifth_seventh': '原位七和弦',
                    'first_inversion': '第一转位',
                    'second_inversion': '第二转位',
                    'third_inversion': '第三转位',
                    'with_octave_root': '含高八度根音',
                    'all_notes': '全部音',
                    'all_chord_notes_desc': '和弦所有音符',

                    // 新增选项描述翻译
                    'root_to_third': '1,2,3,5 on major/dominant chords\n1,3,4,5 on minor chords\n1,2,4,5 on sus chords\n1,2,3,5 on diminished chords\n(No altered 5ths on dominant chords)',
                    'root_to_fifth': '2,1,5,3 on major/dominant chords\n3,1,5,4 on minor chords\n2,1,4,5 on sus chords\n2,1,5,3 on diminished chords\n(No altered 5ths on dominant chords)',
                    'third_to_fifth': '3,5,2,1 on major/dominant chords\n4,5,3,1 on minor chords\n4,5,2,1 on sus chords\n3,5,2,1 on diminished chords\n(No altered 5ths on dominant chords)',
                    'root_third_fifth_line': '5,1,2,3 on major/dominant chords\n5,1,3,4 on minor chords\n5,1,2,4 on sus chords\n5,1,2,3 on diminished chords\n(No altered 6ths on dominant chords)',
                    'random_inversions': 'Random inversions of: 1,2,3,5 on major/dominant chords\n1,3,4,5 on minor chords\n1,2,4,5 on sus chords\n1,2,3,5 on diminished chords\n(No altered 5ths on dominant chords)',
                    'melodic_structure_6': '5,6,7,2 on major/dominant chords\n5,7,1,2 on minor chords\n5,6,7,1 on diminished chords',
                    'melodic_structure_7': '6,5,2,7 on major/dominant chords\n7,5,2,1 on minor chords\n6,5,1,7 on diminished chords',
                    'melodic_structure_8': '7,2,6,5 on major/dominant chords\n1,2,7,5 on minor chords\n6,1,7,5 on diminished chords',
                    'melodic_structure_9': '2,7,6,5 on major/dominant chords\n2,1,7,5 on minor chords\n2,7,1,6 on diminished chords',
                    'melodic_structure_10': 'Random inversions of: 5,6,7,2 on major/dominant chords\n5,7,1,2 on minor chords\n5,6,7,1 on diminished chords',
                                        'voice_led_structure_1': '3,2,1,7 on minor/dominant/major chords\n4,2,1,7 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_2': '3,2,1,7 on minor chords\n3,5,7,2 on dominant chords\n5,1,2,3 on major chords\n4,5,7,2 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_3': '1,3,5,7 on minor chords\n3,2,1,7 on dominant/major chords\n4,2,1,7 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_4': '1,3,5,7 on minor chords\n3,5,7,2 on dominant chords\n3,2,1,7 on major chords\n4,5,7,2 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_5': '5,3,1,7 on minor chords\n3,5,7,2 on dominant chords\n3,2,1,7 on major chords\n4,5,7,2 on sus chords\n3,2,1,6 on diminished chords',
                                        'suspended_2_resolution': 'Sus2 resolving to 3 then 1',
                    'suspended_4_resolution': 'Sus4 resolving to 3 then 1',
                                        'chord_scale_root_to_root': 'All chord scale notes from root through octave',
                    'chord_scale_3rd_to_3rd': 'All chord scale notes from 3rd through octave',
                    'chord_scale_5th_to_5th': 'All chord scale notes from 5th through octave',
                    'chord_scale_7th_to_7th': 'All chord scale notes from 7th through octave',
                    'chord_scale_random_chord_tone': 'All chord scale notes from random chord tone',
                    'chord_scale_random_scale_tone': 'All chord scale notes from random scale tone',
                    'passing_note_scale_root_to_root': 'All chord scale notes with passing notes from root to root',
                    'passing_note_scale_3rd_to_3rd': 'All chord scale notes with passing notes from 3rd to 3rd',
                    'passing_note_scale_5th_to_5th': 'All chord scale notes with passing notes from 5th to 5th',
                    'passing_note_scale_6th_7th_to_6th_7th': 'All chord scale notes with passing notes from 6th to 6th or 7th to 7th',
                    'passing_note_scale_random_chord_tone': 'All chord scale notes with passing notes from random chord tone',
                    'diatonic_passing_tones': '自然音阶经过音',
                    'chromatic_passing_tones': '半音经过音',
                    'enclosure_passing_tones': '包围音经过技巧',
                    'appoggiatura_passing_tones': '装饰音经过技巧',
                    'random_scale': '随机调式',
                    
                    // 自定义和弦进行页面
                    'custom_chord_title': '自定义和弦进行',
                    'custom_chord_root': '根音',
                    'custom_chord_type': '和弦类型',
                    'custom_chord_inversion': '转位',
                    'custom_chord_bass_root': '根音',
                    'custom_chord_bass_3rd': '三音',
                    'custom_chord_bass_5th': '五音',
                    'custom_chord_bass_7th': '七音',
                    'custom_chord_add': '添加和弦',
                    'custom_chord_sequence_name': '输入歌曲名称...',
                    'custom_chord_clear': '清空',
                    'custom_chord_save': '保存',
                    'custom_chord_load': '加载',
                    'custom_chord_load_practice': '加载练习',
                    'btn_custom_chords': '自定义和弦进行',
                    
                    // iReal Pro导入
                    'ireal_import_title': '从iReal Pro导入',
                    'ireal_show': '展开',
                    'ireal_hide': '收起',
                    'ireal_import_help': '粘贴iReal Pro导出的和弦进行文本或URL（irealbook://格式）',
                    'ireal_textarea_placeholder': '粘贴iReal Pro和弦进行...\n\n支持格式:\n• irealbook://URL格式\n• 纯文本和弦进行（如: CM7 | Am7 | Dm7 | G7）',
                    'ireal_song_name': '歌曲名称（可选）',
                    'ireal_song_key': '调性（如C, F, Bb）',
                    'ireal_import_btn': '导入和弦进行',
                    'ireal_import_success': '成功导入 {count} 个和弦',
                    'ireal_import_error': '导入失败：无法解析和弦进行',
                    
                    // 音阶设置
                    'scale_key': '调',
                    'scale_mode': '调式',
                    'scale_direction': '方向',
                    'scale_practice_sequence': '练习序列',
                    'scale_order': '演奏顺序',
                    
                    // 设备设置
                    'device_audio_input': '音频输入设备',
                    'device_gain': '输入增益',
                    'device_metronome': '节拍器',
                    'device_tempo': '速度',
                    'device_sensitivity': '灵敏度',
                    'device_cooldown': '冷却时间',
                    'device_confidence': '置信度阈值',
                    'device_noise': '噪音等级',
                    'device_volume': '最小音量',
                    'device_buffer': '缓冲区大小',
                    'device_harmonic': '谐波权重',
                    'device_zero_crossing': '零交叉阈值',
                    
                    // 通用设置
                    'general_language': '语言设置',
                    'interface_language': '界面语言',
                    
                    // 按钮和操作
                    'btn_save': '保存设置',
                    'btn_reset': '重置设置',
                    'btn_refresh': '刷新设备列表',
                    'btn_back': '返回主菜单',
                    'btn_cancel': '取消',
                    'btn_confirm': '确认',

                    // 调式选择控制按钮
                    'select_all': '全选',
                    'deselect_all': '全不选',
                    'random_select': '随机选择',
                    'btn_delete': '删除',
                    'btn_edit': '编辑',
                    'btn_add': '添加',
                    'btn_clear': '清空',
                    
                    // 状态信息
                    'status_recording': '录音中',
                    'status_processing': '处理中',
                    'status_error': '错误',
                    'status_success': '成功',
                    'interval_practice_complete': '音程练习完成！',
                    
                    // 错误信息
                    'error_no_audio_support': '您的浏览器不支持音频API',
                    'error_microphone_permission': '无法获取麦克风权限',
                    'error_audio_device': '音频设备初始化失败',
                    'error_pitch_detection': '音高检测失败',
                    
                    // 提示信息
                    'hint_select_device': '请选择音频输入设备',
                    'hint_connect_guitar': '请连接您的吉他',
                    'hint_start_practice': '点击开始练习按钮开始',
                    'hint_select_chord_type': '请选择至少一个和弦类型',
                    'hint_select_scale': '请选择音阶类型',
                    'device_count_detected': '{count} 个音频输入设备',
                    'chord_sequence_empty': '点击"添加和弦"开始创建和弦进行',
                    'select_song': '请选择一首歌曲',
                    'select_scale_mode': '请选择要练习的调式！',
                    'device_count_none': '未检测到音频输入设备',
                    'default_device': '默认设备',
                    'audio_device': '音频设备',
                    'audio_device_list_error': '无法获取音频设备列表，请确保已授予麦克风权限',
                    'key_c_default': 'C 默认',
                    
                    // CAGED练习设置
                    'caged_practice': 'CAGED练习',
                    'caged_practice_hint': '基于CAGED系统的音阶和和弦练习',
                    'caged_practice_mode': 'CAGED练习模式',
                    'caged_shape': 'CAGED形状',
                    'caged_shape_hint': '选择要练习的CAGED形状',
                    'caged_key': '调性',
                    'caged_key_hint': '选择练习调性',
                    'caged_mode': '练习模式',
                    'caged_mode_hint': '选择CAGED练习模式',
                    'caged_shape_connection': '形状连接',
                    'caged_random_shapes': '随机形状',
                    'caged_show_fretboard': '显示指板',
                    'caged_show_fingering': '显示指法',
                    'caged_show_scale': '显示音阶',
                    'caged_chord_practice': 'CAGED和弦练习',
                    'caged_show_chord': '显示和弦',
                    'caged_c_shape': 'C形状',
                    'caged_a_shape': 'A形状',
                    'caged_g_shape': 'G形状',
                    'caged_e_shape': 'E形状',
                    'caged_d_shape': 'D形状',
                    'midi_support': 'MIDI设备支持',
                    'midi_support_hint': '连接MIDI键盘或控制器进行练习',
                    'midi_device_connected': 'MIDI设备已连接',
                    'midi_device_disconnected': 'MIDI设备未连接',
                    'midi_device_detected': '检测到 {count} 个MIDI设备',
                    'midi_device_none': '未检测到MIDI设备',

                    // 歌曲信息相关
                    'basic_info': '基本信息',
                    'song_composer': '作曲家:',
                    'song_year': '年代:',
                    'song_style': '风格:',
                    'song_tempo': '速度:',
                    'song_key': '原调:',
                    'song_description': '曲目介绍',
                    'select_this_song': '选择此曲目',
                    'unknown': '未知',
                    'jazz_standard': '爵士标准曲',
                    'chord_progression': '和弦进行',

                    // 和弦练习分组
                    'chord_single_notes': '单和弦音',
                    'chord_double_notes': '双和弦音',
                    'chord_triple_notes': '三和弦音',
                    'chord_quad_notes': '四和弦音',
                    'chord_all_notes': '全部和弦音',

                    // 新增练习分组
                    'melodic_structure_r_to_5th': '旋律结构 - R→5th',
                    'melodic_structure_5th_to_9th': '旋律结构 - 5th→9th',
                    'voice_led_structure': 'Voice Led结构',
                    'suspension_structure': '挂留结构',
                    'chord_scale_structure': '和弦音阶',
                    'passing_tone_structure': '经过音分组',

                    // 键盘操作提示
                    'keyboard_hide': '隐藏',
                    'keyboard_show': '显示',
                    'keyboard_space': '空格',
                    'keyboard_next': '下一个',

                    // 麦克风权限相关
                    'mic_permission_denied': '麦克风权限被拒绝',
                    'mic_permission_needed': '此应用需要麦克风权限才能检测音高。',
                    'mic_permission_needed_for_device': '需要麦克风权限才能检测音频输入设备',
                    'mic_permission_needed_for_label': '需要麦克风权限才能显示设备名称',
                    'browser_not_support_audio': '浏览器不支持音频输入',
                    'requesting_mic_permission': '正在请求麦克风权限...',
                    'mic_permission_steps': '请按照以下步骤操作：',
                    'mic_step_1': '点击浏览器地址栏左侧的锁定/信息图标',
                    'mic_step_2': '在弹出的菜单中找到"麦克风"选项',
                    'mic_step_3': '将其设置为"允许"',
                    'mic_step_4': '刷新页面后重试',
                    'refresh_page': '刷新页面',
                    'return_to_main': '返回主菜单',

                    // 练习相关
                    'practice_scale': '音阶练习',
                    'practice_chord': '和弦练习',
                    'practice_progression': '和弦进行练习',
                    'practice_arpeggio': '琶音练习',
                    'practice_interval': '音程练习',
                    
                    // 音阶类型
                    'scale_major': '大调',
                    'scale_minor': '小调',
                    'scale_dorian': '多利亚',
                    'scale_phrygian': '弗里几亚',
                    'scale_lydian': '利底亚',
                    'scale_mixolydian': '混合利底亚',
                    'scale_locrian': '洛克里亚',
                    'scale_harmonic_minor': '和声小调',
                    'scale_melodic_minor': '旋律小调',
                    'scale_pentatonic_major': '大调五声音阶',
                    'scale_pentatonic_minor': '小调五声音阶',
                    'scale_blues': '蓝调音阶',
                    
                    // 和弦转换设置
                    'progression_settings': '转换设置',
                    'progression_level': '练习等级',
                    'progression_level_hint': '选择和弦复杂度',
                    'single_chord_notes': '单和弦音',
                    'double_chord_notes': '双和弦音',
                    'triple_chord_notes': '三和弦音',
                    'quad_chord_notes': '四和弦音',
                    'progression_key': '乐曲',
                    'progression_key_hint': '选择乐曲',
                    'progression_tunes': '乐曲',
                    'progression_tunes_hint': '选择练习乐曲',
                    'progression_style': '风格',
                    'progression_style_hint': '选择练习风格',
                    'progression_tempo': '速度',
                    'progression_tempo_hint': '设置练习速度',
                    'progression_difficulty': '难度',
                    'progression_difficulty_hint': '选择练习难度',
                    
                    // 音阶设置详细
                    'scale_root_note': '调',
                    'scale_root_note_hint': '选择调',
                    'scale_type': '调式',
                    'scale_type_hint': '选择调式',
                    'scale_direction_hint': '选择演奏方向',
                    'scale_practice_sequence_hint': '选择练习序列',
                    'scale_arpeggio': '琶音',
                    'scale_arpeggio_hint': '选择琶音类型',
                    'scale_interval': '音程',
                    'scale_interval_hint': '选择音程练习',
                    'scale_random': '随机',
                    'scale_random_hint': '随机生成练习',
                    
                    // 设备设置详细
                    'device_audio_input_hint': '选择音频输入设备',
                    'device_gain_hint': '调整输入增益',
                    'device_metronome_hint': '启用节拍器',
                    'device_tempo_hint': '设置节拍器速度',
                    'device_sensitivity_hint': '调整音高检测灵敏度',
                    'device_cooldown_hint': '设置冷却时间',
                    'device_confidence_hint': '设置置信度阈值',
                    'device_noise_hint': '设置噪音等级',
                    'device_volume_hint': '设置最小音量',
                    'device_buffer_hint': '设置缓冲区大小',
                    'device_harmonic_hint': '设置谐波权重',
                    'device_zero_crossing_hint': '设置零交叉阈值',
                    
                    // 通用设置详细
                    'general_language_hint': '选择界面语言',
                    'interface_language_hint': '选择界面语言',
                    'general_theme': '主题',
                    'general_theme_hint': '选择界面主题',
                    'theme_dark': '深色主题',
                    'theme_light': '浅色主题',
                    'theme_auto': '跟随系统',
                    'general_sound': '声音',
                    'general_sound_hint': '设置声音选项',
                    'general_display': '显示',
                    'general_display_hint': '设置显示选项',
                    'general_advanced': '高级',
                    'general_advanced_hint': '高级设置选项',

                    // 调试设置
                    'debug_settings': '调试设置',
                    'debug_logging': '调试日志',
                    'debug_logging_hint': '开启后将在控制台显示详细的调试信息',
                    
                    // 音阶设置optgroup标签
                    'basic_modes': '基本调式',
                    'church_modes': '教会调式 (Church Modes)',
                    'harmonic_minor_series': '和声小调系列',
                    'melodic_minor_series': '旋律小调系列',
                    'pentatonic_scales': '五声音阶',
                    'blues_scales': '布鲁斯音阶',
                    'special_scales': '特殊音阶',
                    'exotic_scales': '异国风格',
                    
                    // 和弦转换设置optgroup标签
                    'single_chord_notes': '单和弦音',
                    'double_chord_notes': '双和弦音',
                    'triple_chord_notes': '三和弦音',
                    'quad_chord_notes': '四和弦音',
                    
                    // 和弦转换设置选项
                    'single_chord_tones': '单和弦音',
                    'two_chord_tones': '双和弦音',
                    'three_chord_tones': '三和弦音',
                    'four_chord_tones': '四和弦音',
                    'random_inversions_135': '135随机转位',
                    'random_inversions_1357': '1357随机转位',
                    'all_chord_tones': '全部和弦音',
                    'all': '全部',
                    
                    // 找音练习设置
                    'pitch_finding_practice_time': '练习时间',
                    'pitch_finding_practice_time_hint': '选择练习时长',
                    'pitch_finding_show_fretboard': '显示指板',
                    'pitch_finding_show_fretboard_hint': '检测到正确音高时在指板上显示位置',
                    'fretboard_keyboard_hint': '💡 ↓隐藏 ↑显示 空格下一个',
                    'pitch_finding_fretboard_range': '指板长度',
                    'pitch_finding_fretboard_range_hint': '选择指板显示范围',
                    'pitch_finding_12_frets': '12品',
                    'pitch_finding_15_frets': '15品',
                    'pitch_finding_18_frets': '18品',
                    'pitch_finding_24_frets': '24品',
                    'pitch_finding_current_note': '当前音符',
                    'pitch_finding_time_remaining': '剩余时间',
                    'pitch_finding_practice_complete': '练习完成',
                    'pitch_finding_next_interval': '下一题间隔',
                    'pitch_finding_next_interval_hint': '答对后自动进入下一题的时间间隔',
                    'pitch_finding_no_auto': '手动',
                    'pitch_finding_2_seconds': '2秒',
                    'pitch_finding_3_seconds': '3秒',
                    'pitch_finding_5_seconds': '5秒',
                    'pitch_finding_1_minute': '1分钟',
                    'pitch_finding_2_minutes': '2分钟',
                    'pitch_finding_3_minutes': '3分钟',
                    'pitch_finding_5_minutes': '5分钟',
                    'pitch_finding_10_minutes': '10分钟',
                    'pitch_finding_15_minutes': '15分钟',
                    'pitch_finding_30_minutes': '30分钟',
                    'pitch_finding_next_question': '下一题',
                    'practice_mode': '练习模式',
                    'practice_mode_hint': '选择练习类型',
                    'note_interval_practice': '音程练习',
                    'single_note_practice': '找音练习',
                    'interval_selection': '选择音程',
                    'interval_selection_hint': '选择要练习的音程',
                    'root_note_setting': '设置根音',
                    'root_note_setting_hint': '选择根音或随机',
                    'find_root_first': '先找根音',
                    'find_root_first_hint': '开启后先练习根音，再练习音程',
                    'start_practice': '开始练习',
                    
                    // 设备设置其他标签
                    'practice_settings': '练习设置',
                    'metronome_settings': '节拍器设置',
                    'time_label': '时间',
                    'fixed_delay_generation': '延迟生成下一题',
                    'background_flash': '背景闪光',
                    
                    // 通用设置其他标签
                    'settings_management': '设置管理',
                    'reset_settings_hint': '点击重置按钮将恢复所有设置为默认值',
                    'chord_name_display': '和弦名显示',
                    'chord_name_display_hint': '选择和弦名称的显示方式',
                    'chord_name_english': '英文名',
                    'chord_name_symbols': '符号名',
                    
                    // 遗漏的翻译键
                    'sound_metronome': '声音节拍',
                    'custom_chord_progression': '自定义和弦进行',
                    'song_name_placeholder': '请输入歌曲名（可选）',
                    'btn_clear_custom_chords': '清空自定义和弦进行',
                    'btn_save_custom_chords': '保存和弦进行到本地',
                    'btn_load_local_chords': '加载本地和弦进行',
                    'btn_load_sequence': '加载序列',
                    'btn_add_chord': '添加和弦',
                    'progression_order': '顺序',
                    'progression_order_hint': '选择和弦进行的演奏顺序',
                    'progression_repeat': '重复练习',
                    'progression_repeat_hint': '开启后对歌曲进行重复练习',
                    'progression_key_label': '调',
                    'progression_key_hint': '选择练习的调性',
                    'order_ordered': '顺序',
                    'order_reverse': '倒序',
                    
                    // MIDI设备
                    'midi_support': 'MIDI设备支持',
                    'midi_support_hint': '连接MIDI键盘或控制器进行练习',
                    'midi_enable': 'MIDI设备',

                    // 音乐风格和速度术语
                    'jazz_medium': '中等',
                    'jazz_up_tempo': '快节奏',
                    'jazz_ballad': '抒情曲',
                    'jazz_swing': '摇摆乐',
                    'jazz_latin': '拉丁爵士',
                    'jazz_afro_cuban': '非洲-古巴风格',
                    'jazz_bebop': 'Bebop',
                    'jazz_modern': '现代爵士',
                    'jazz_standard': '爵士标准曲',
                    'tempo_medium': '中等',
                    'tempo_up': '快节奏',
                    'tempo_ballad': '抒情',
                    'tempo_swing': '摇摆',
                    'tempo_fast': '快速',

                    // MIDI状态消息
                    'midi_connected': '已连接',
                    'midi_disconnected': '已断开',
                    'midi_device_detected': '检测到 {count} 个MIDI设备',
                    'midi_no_device': '未检测到MIDI设备',
                    'midi_connect': '连接',
                    'midi_connected_status': '已连接',
                    'midi_device': 'MIDI设备',
                    'midi_select_to_connect': '请选择连接',
                    'midi_initializing': '正在初始化MIDI...',
                    'midi_scanning': '正在扫描MIDI设备...',
                    'midi_not_supported': '浏览器不支持MIDI功能',
                    'midi_init_failed': 'MIDI初始化失败',
                    'midi_permission_denied': 'MIDI权限被拒绝，请检查浏览器设置',
                    'midi_access_interrupted': 'MIDI设备访问被中断',
                    'midi_invalid_state': 'MIDI设备状态无效',
                    'midi_device_disconnected': '设备 {name} 已断开',
                    'midi_check_connection': '请确保MIDI设备已连接并刷新页面',

                    // 工具提示和状态消息
                    'shape': '形状',
                    'shape_current': '当前形状',
                    'shape_completed': '已完成',
                    'shape_switch': '点击切换到',
                    'shape_not_selected': '未选中',
                    'fullscreen_selector_title': '选择',
                    'random_inversions': '随机转位',
                    'default_tempo': '中等',
                    'unknown_composer': '未知',
                    'unknown_year': '未知',

                    // 调性选择
                    'key_c_default': 'C 默认',
                    'select_song': '选择歌曲',
                    'select_key': '选择调性'
                },
                'en': {
                    'fullscreen_mode': 'Fullscreen Mode',
                    'click_to_exit_fullscreen': 'Click to exit fullscreen',
                    'answer_mode': 'Answer Mode',
                    'keyboard_shortcuts': 'Keyboard Shortcuts',
                    // Shortcuts panel
                    'shortcuts_title': 'Keyboard Shortcuts',
                    'shortcuts_global': 'Global Shortcuts',
                    'shortcuts_esc': 'ESC',
                    'shortcuts_esc_desc': 'Stop practice / Exit fullscreen',
                    'shortcuts_number': '1-5',
                    'shortcuts_number_desc': 'Switch practice tabs',
                    'shortcuts_f': 'F',
                    'shortcuts_f_desc': 'Toggle fullscreen mode',
                    'shortcuts_m': 'M',
                    'shortcuts_m_desc': 'Toggle microphone',
                    'shortcuts_s': 'S',
                    'shortcuts_s_desc': 'Open settings',
                    'shortcuts_p': 'P',
                    'shortcuts_p_desc': 'Start/Stop practice',
                    'shortcuts_h': 'H',
                    'shortcuts_h_desc': 'Show/Hide shortcuts help',
                    'shortcuts_practice': 'Practice Mode Shortcuts',
                    'shortcuts_space': 'Space / → / PageDown',
                    'shortcuts_space_desc': 'Next question',
                    'shortcuts_up': '↑',
                    'shortcuts_up_desc': 'Show fretboard',
                    'shortcuts_down': '↓',
                    'shortcuts_down_desc': 'Hide fretboard / Next question',
                    'shortcuts_close': 'Close',
                    'onboarding_welcome_title': 'Welcome to FretMaster',
                    'onboarding_welcome_desc': 'This is a visualization practice tool to help you master the guitar fretboard.',
                    'onboarding_tuner_title': 'Tuner',
                    'onboarding_tuner_desc': 'First, use the tuner to ensure your guitar is in tune. Click the microphone icon to enable audio input.',
                    'onboarding_fretboard_title': 'Fretboard Visualization',
                    'onboarding_fretboard_desc': 'This is a visual representation of the guitar fretboard. You can see all frets and strings.',
                    'onboarding_practice_tabs_title': 'Practice Modes',
                    'onboarding_practice_tabs_desc': 'We offer multiple practice modes: Chord, Scale, Note Finding, and more. Click tabs to switch.',
                    'onboarding_chord_exercise_title': 'Chord Practice',
                    'onboarding_chord_exercise_desc': 'In chord practice, the system shows chord tones, and you need to find the corresponding notes on the fretboard.',
                    'onboarding_scale_exercise_title': 'Scale Practice',
                    'onboarding_scale_exercise_desc': 'Scale practice helps you familiarize yourself with various scales on the fretboard, supporting multiple fingering patterns.',
                    'onboarding_settings_title': 'Personalization',
                    'onboarding_settings_desc': 'In settings, you can adjust display options, select language, configure audio devices, and more.',
                    'onboarding_shortcuts_title': 'Keyboard Shortcuts',
                    'onboarding_shortcuts_desc': 'Press H to view all keyboard shortcuts and improve your practice efficiency.',
                    'onboarding_complete_title': 'Start Practicing!',
                    'onboarding_complete_desc': 'Now you understand the basic features. Start your guitar learning journey!',
                    'onboarding_paused': 'Tutorial Paused',
                    'onboarding_continue': 'Continue',
                    'onboarding_prev': 'Previous',
                    'onboarding_next': 'Next',
                    'onboarding_skip': 'Skip',
                    'onboarding_finish': 'Finish',
                    'onboarding_tip': 'Tip',
                    // Sort
                    'sort_label': 'Sort',
                    'sort_title_asc': 'Title A-Z',
                    'sort_title_desc': 'Title Z-A',
                    'sort_style_asc': 'Style A-Z',
                    'sort_style_desc': 'Style Z-A',
                    'sort_composer_asc': 'Composer A-Z',
                    'sort_composer_desc': 'Composer Z-A',
                    'sort_year_asc': 'Year Old-New',
                    'sort_year_desc': 'Year New-Old',
                    // Song info
                    'song_key': 'Key',
                    'chord_count': 'Chord Count',
                    'chords': 'chords',
                    'chord_progression': 'Chord Progression',
                    'no_chords': 'No chord info',
                    'select_this_song': 'Select This Song',
                    // Practice levels
                    'level_root_third_fifth': 'Root Position Triad(1,3,5)',
                    'level_third_fifth_seventh': '3rd+5th+7th(3,5,7)',
                    'level_random_inversion_triad': 'Random Inversion Triad',
                    'level_root_third_fifth_seventh': 'Root Position 7th(1,3,5,7)',
                    'level_third_fifth_seventh_root': '3rd+5th+7th+Root(3,5,7,1)',
                    'level_fifth_seventh_root_third': '5th+7th+Root+3rd(5,7,1,3)',
                    'level_seventh_root_third_fifth': '7th+Root+3rd+5th(7,1,3,5)',
                    'level_random_inversion_seventh': 'Random Inversion 7th',
                    'level_root_third_fifth_seventh_root': 'Extended(1,3,5,7,1)',
                    // Basic practice levels
                    'level_single_root': '1',
                    'level_single_3': '3',
                    'level_single_5': '5',
                    'level_single_7': '7',
                    'level_double_root_3': '1,3',
                    'level_double_root_5': '1,5',
                    'level_double_root_7': '1,7',
                    'level_double_3_5': '3,5',
                    'level_double_3_7': '3,7',
                    'level_double_5_7': '5,7',
                    'level_triple_root_3_5': '1,3,5',
                    'level_triple_3_5_7': '3,5,7',
                    'level_triple_random_inversion': '1,3,5 Random Inv.',
                    'level_quad_root_3_5_7': '1,3,5,7',
                    'level_quad_3_5_7_root': '3,5,7,1',
                    'level_quad_5_7_root_3': '5,7,1,3',
                    'level_quad_7_root_3_5': '7,1,3,5',
                    'level_quad_random_inversion': '1,3,5,7 Random Inv.',
                    'level_quad_root_3_5_7_root': '1,3,5,7,1',
                    'level_all': 'All',
                    // Melodic structure
                    'level_melodic_1': 'Melodic 1 - Root to 5th',
                    'level_melodic_2': 'Melodic 2 - Root to 5th Var.',
                    'level_melodic_3': 'Melodic 3 - 5th to Root',
                    'level_melodic_4': 'Melodic 4 - 3rd Movement',
                    'level_melodic_5': 'Melodic 5 - Random Inv.',
                    'level_melodic_6': 'Melodic 6 - 5th to 9th',
                    'level_melodic_7': 'Melodic 7 - 5th to 9th Var.',
                    'level_melodic_8': 'Melodic 8 - Complex',
                    'level_melodic_9': 'Melodic 9 - Inverted',
                    'level_melodic_10': 'Melodic 10 - Random Inv.',
                    // Voice Led
                    'level_voice_led_1': 'Voice Led 1 - Basic',
                    'level_voice_led_2': 'Voice Led 2 - Varied',
                    'level_voice_led_3': 'Voice Led 3 - Harmonic',
                    'level_voice_led_4': 'Voice Led 4 - Mixed',
                    'level_voice_led_5': 'Voice Led 5 - Advanced',
                    // Passing tones
                    'level_passing_1': 'Passing 1 - Chromatic',
                    'level_passing_2': 'Passing 2 - Diatonic',
                    'level_passing_3': 'Passing 3 - Three-note',
                    'level_passing_4': 'Passing 4 - Four-note',
                    'level_passing_5': 'Passing 5 - Five-note',
                    // Practice category titles
                    'practice_category_basic': 'Basic Practice',
                    'practice_category_melodic_r5': 'Melodic Structure - R→5th',
                    'practice_category_melodic_59': 'Melodic Structure - 5th→9th',
                    'practice_category_voice_led': 'Voice Led Structures',
                    'practice_category_passing': 'Passing Tone Techniques',
                    'nav_stats': 'Stats',
                    'nav_tuner': 'Tuner',
                    'nav_arpeggio': 'Arpeggio',
                    'nav_chord_exercise': 'Chord',
                    'next_chord': 'Next',
                    'nav_interval': 'Interval',
                    'nav_practice': 'Practice',
                    'app_title': '🎸 Fretboard Master',
                   
                    'page_title': 'Fretboard Master',
                    'btn_start': 'Start Practice',
                    'status_ready': 'Ready',
                    'lang_zh': '中文',
                    'lang_en': 'English',
                    'nav_scale': 'Scale',
                    'nav_chord': 'Chord',
                    'nav_progression': 'Changes',
                    'nav_pitch_finding': 'Note&Interval',
                    'settings_pitch_finding': 'Note&Interval Settings',
                    'nav_settings': 'Settings',
                    'settings_scale': 'Scale Practice Options',
                    'settings_chord': 'Chord Practice Options',
                    'settings_device': 'Device Settings',
                    'settings_general': 'General Settings',
                    'general_language': 'Language Settings',
                    'interface_language': 'Interface Language',
                    'test_language_switch': 'Test Language Switch',
                    
                    // 快捷键提示
                    'shortcut_hint': 'Press ESC to return to main menu',
                    
                    // 音高显示
                    'pitch_display': 'Pitch',
                    'cents_display': 'Cents',
                    
                    // 和弦设置
                    'chord_root_note': 'Root Note',
                    'chord_root_note_hint': 'Select chord root note',
                    'chord_type': 'Chord Type',
                    'chord_type_hint': 'Select chord types to practice',
                    'chord_order': 'Order',
                    'chord_order_hint': 'Select chord note playing order',
                    'chord_custom': 'Custom Chords',
                    
                    // 和弦转位设置
                    'chord_bass_note': 'Bass Note',
                    'chord_bass_root': 'Root',
                    'chord_bass_3rd': '3rd',
                    'chord_bass_5th': '5th',
                    'chord_bass_7th': '7th',
                    'chord_bass_random': 'Random',

                    
                    // 顺序按钮
                    'order_ascending': 'Ascending',
                    'order_descending': 'Descending',
                    'order_random': 'Random',
                    
                    // 和弦类型
                    'chord_major': 'Major',
                    'chord_minor': 'Minor',
                    'chord_dim': 'Dim',
                    'chord_aug': 'Aug',
                    'chord_6': '6',
                    'chord_m6': 'm6',
                    'chord_7': '7',
                    'chord_maj7': 'Maj7',
                    'chord_m7': 'm7',
                    'chord_m7b5': 'm7♭5',
                    'chord_dim7': 'dim7',
                    'chord_9': '9',
                    'chord_maj9': 'Maj9',
                    'chord_m9': 'm9',
                    'chord_7sharp9': '7♯9',
                    'chord_7flat9': '7♭9',
                    'chord_11': '11',
                    'chord_m11': 'm11',
                    'chord_7sharp11': '7♯11',
                    'chord_13': '13',
                    'chord_m13': 'm13',
                    'chord_sus2': 'sus2',
                    'chord_sus4': 'sus4',
                    'chord_add9': 'add9',
                    'chord_madd9': 'madd9',
                    'chord_6add9': '6add9',
                    'chord_m6add9': 'm6add9',
                    'chord_diminished7': 'Diminished 7',
                    'chord_dominant9': 'Dominant 9',
                    'chord_major9': 'Major 9',
                    'chord_minor9': 'Minor 9',
                    'chord_dominant7sharp9': 'Dominant 7♯9',
                    'chord_sus2': 'Sus2',
                    'chord_sus4': 'Sus4',
                    'chord_add9': 'Add9',
                    'chord_madd9': 'mAdd9',
                    'chord_6add9': '6Add9',
                    'chord_m6add9': 'm6Add9',
                    
                    // 随机选项
                    'random': 'Random',
                    'random_root': 'Random Root',
                    'random_chord': 'Random Chord',
                    
                    // 选择器页面
                    'search_song_placeholder': 'Search song name...',
                    'select_song': 'Select Song',
                    'practice_level': 'Level',
                    'select_key': 'Select Key',
                    'key_desc': 'Key',
                    
                    // 练习等级选项
                    'single_chord_notes': 'Single Chord Notes',
                    'double_chord_notes': 'Double Chord Notes',
                    'triple_chord_notes': 'Triple Chord Notes',
                    'quad_chord_notes': 'Quad Chord Notes',
                    'all_chord_notes': 'All Chord Notes',

                    // 音程描述
                    'root_note': 'R',
                    'third_note': '3rd',
                    'fifth_note': '5th',
                    'seventh_note': '7th',
                    'root': 'Root',
                    'third': '3rd',
                    'fifth': '5th',
                    'seventh': '7th',
                    'root_third': 'R,3rd',
                    'root_fifth': 'R,5th',
                    'root_seventh': 'R,7th',
                    'third_fifth': '3rd,5th',
                    'third_seventh': '3rd,7th',
                    'root_third_fifth': 'Root Position Triad',
                    'third_fifth_seventh': '3rd,5th,7th',
                    'random_inversion': 'Random Inversion',
                    'root_third_fifth_seventh': 'Root Position 7th',
                    'first_inversion': '1st Inversion',
                    'second_inversion': '2nd Inversion',
                    'third_inversion': '3rd Inversion',
                    'with_octave_root': 'With Octave Root',
                    'all_notes': 'All Notes',
                    'all_chord_notes_desc': 'All chord notes',

                    // New option descriptions
                    'root_to_third': '1,2,3,5 on major/dominant chords\n1,3,4,5 on minor chords\n1,2,4,5 on sus chords\n1,2,3,5 on diminished chords\n(No altered 5ths on dominant chords)',
                    'root_to_fifth': '2,1,5,3 on major/dominant chords\n3,1,5,4 on minor chords\n2,1,4,5 on sus chords\n2,1,5,3 on diminished chords\n(No altered 5ths on dominant chords)',
                    'third_to_fifth': '3,5,2,1 on major/dominant chords\n4,5,3,1 on minor chords\n4,5,2,1 on sus chords\n3,5,2,1 on diminished chords\n(No altered 5ths on dominant chords)',
                    'root_third_fifth_line': '5,1,2,3 on major/dominant chords\n5,1,3,4 on minor chords\n5,1,2,4 on sus chords\n5,1,2,3 on diminished chords\n(No altered 6ths on dominant chords)',
                    'random_inversions': 'Random inversions of: 1,2,3,5 on major/dominant chords\n1,3,4,5 on minor chords\n1,2,4,5 on sus chords\n1,2,3,5 on diminished chords\n(No altered 5ths on dominant chords)',
                    'melodic_structure_6': '5,6,7,2 on major/dominant chords\n5,7,1,2 on minor chords\n5,6,7,1 on diminished chords',
                    'melodic_structure_7': '6,5,2,7 on major/dominant chords\n7,5,2,1 on minor chords\n6,5,1,7 on diminished chords',
                    'melodic_structure_8': '7,2,6,5 on major/dominant chords\n1,2,7,5 on minor chords\n6,1,7,5 on diminished chords',
                    'melodic_structure_9': '2,7,6,5 on major/dominant chords\n2,1,7,5 on minor chords\n2,7,1,6 on diminished chords',
                    'melodic_structure_10': 'Random inversions of: 5,6,7,2 on major/dominant chords\n5,7,1,2 on minor chords\n5,6,7,1 on diminished chords',
                    'stepwise_voice_leading': 'Stepwise voice leading',
                    'common_tone_voice_leading': 'Common tone voice leading',
                    'contrary_motion_voice_leading': 'Contrary motion voice leading',
                    'parallel_motion_voice_leading': 'Parallel motion voice leading',
                    'voice_led_structure_1': '3,2,1,7 on minor/dominant/major chords\n4,2,1,7 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_2': '3,2,1,7 on minor chords\n3,5,7,2 on dominant chords\n5,1,2,3 on major chords\n4,5,7,2 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_3': '1,3,5,7 on minor chords\n3,2,1,7 on dominant/major chords\n4,2,1,7 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_4': '1,3,5,7 on minor chords\n3,5,7,2 on dominant chords\n3,2,1,7 on major chords\n4,5,7,2 on sus chords\n3,2,1,6 on diminished chords',
                    'voice_led_structure_5': '5,3,1,7 on minor chords\n3,5,7,2 on dominant chords\n3,2,1,7 on major chords\n4,5,7,2 on sus chords\n3,2,1,6 on diminished chords',
                                        'suspended_2_resolution': 'Sus2 resolving to 3 then 1',
                    'suspended_4_resolution': 'Sus4 resolving to 3 then 1',
                                        'chord_scale_root_to_root': 'All chord scale notes from root through octave',
                    'chord_scale_3rd_to_3rd': 'All chord scale notes from 3rd through octave',
                    'chord_scale_5th_to_5th': 'All chord scale notes from 5th through octave',
                    'chord_scale_7th_to_7th': 'All chord scale notes from 7th through octave',
                    'chord_scale_random_chord_tone': 'All chord scale notes from random chord tone',
                    'chord_scale_random_scale_tone': 'All chord scale notes from random scale tone',
                    'passing_note_scale_root_to_root': 'All chord scale notes with passing notes from root to root',
                    'passing_note_scale_3rd_to_3rd': 'All chord scale notes with passing notes from 3rd to 3rd',
                    'passing_note_scale_5th_to_5th': 'All chord scale notes with passing notes from 5th to 5th',
                    'passing_note_scale_6th_7th_to_6th_7th': 'All chord scale notes with passing notes from 6th to 6th or 7th to 7th',
                    'passing_note_scale_random_chord_tone': 'All chord scale notes with passing notes from random chord tone',
                    'diatonic_passing_tones': 'Diatonic passing tones',
                    'chromatic_passing_tones': 'Chromatic passing tones',
                    'enclosure_passing_tones': 'Enclosure passing techniques',
                    'appoggiatura_passing_tones': 'Appoggiatura passing techniques',
                    'random_scale': 'Random Mode',
                    
                    // 自定义和弦进行页面
                    'custom_chord_title': 'Custom Chord Progression',
                    'custom_chord_root': 'Root Note',
                    'custom_chord_type': 'Chord Type',
                    'custom_chord_inversion': 'Inversion',
                    'custom_chord_bass_root': 'Root',
                    'custom_chord_bass_3rd': '3rd',
                    'custom_chord_bass_5th': '5th',
                    'custom_chord_bass_7th': '7th',
                    'custom_chord_add': 'Add Chord',
                    'custom_chord_sequence_name': 'Enter song name...',
                    'custom_chord_clear': 'Clear',
                    'custom_chord_save': 'Save',
                    'custom_chord_load': 'Load',
                    'custom_chord_load_practice': 'Load Practice',
                    'btn_custom_chords': 'Custom Chord Progression',
                    
                    // iReal Pro Import
                    'ireal_import_title': 'Import from iReal Pro',
                    'ireal_show': 'Expand',
                    'ireal_hide': 'Collapse',
                    'ireal_import_help': 'Paste iReal Pro exported chord progression text or URL (irealbook:// format)',
                    'ireal_textarea_placeholder': 'Paste iReal Pro chord progression...\n\nSupported formats:\n• irealbook://URL format\n• Plain text chord progression (e.g.: CM7 | Am7 | Dm7 | G7)',
                    'ireal_song_name': 'Song name (optional)',
                    'ireal_song_key': 'Key (e.g. C, F, Bb)',
                    'ireal_import_btn': 'Import Chord Progression',
                    'ireal_import_success': 'Successfully imported {count} chords',
                    'ireal_import_error': 'Import failed: Unable to parse chord progression',
                    
                    // Scale settings
                    'scale_key': 'Key',
                    'scale_mode': 'Mode',
                    'scale_direction': 'Direction',
                    'scale_practice_sequence': 'Practice Sequence',
                    'scale_order': 'Playing Order',
                    
                    // 设备设置
                    'device_audio_input': 'Audio Input Device',
                    'device_gain': 'Input Gain',
                    'device_metronome': 'Metronome',
                    'device_tempo': 'Tempo',
                    'device_sensitivity': 'Sensitivity',
                    'device_cooldown': 'Cooldown Time',
                    'device_confidence': 'Confidence Threshold',
                    'device_noise': 'Noise Level',
                    'device_volume': 'Minimum Volume',
                    'device_buffer': 'Buffer Size',
                    'device_harmonic': 'Harmonic Weights',
                    'device_zero_crossing': 'Zero Crossing Threshold',
                    
                    // 通用设置
                    'general_language': 'Language Settings',
                    'interface_language': 'Interface Language',
                    
                    // 按钮和操作
                    'btn_save': 'Save Settings',
                    'btn_reset': 'Reset Settings',
                    'btn_refresh': 'Refresh Device List',
                    'btn_back': 'Back to Main Menu',
                    'btn_cancel': 'Cancel',
                    'btn_confirm': 'Confirm',

                    // 调式选择控制按钮
                    'select_all': 'Select All',
                    'deselect_all': 'Deselect All',
                    'random_select': 'Random Select',
                    'btn_delete': 'Delete',
                    'btn_edit': 'Edit',
                    'btn_add': 'Add',
                    'btn_clear': 'Clear',
                    
                    // 状态信息
                    'status_recording': 'Recording',
                    'status_processing': 'Processing',
                    'status_error': 'Error',
                    'status_success': 'Success',
                    'interval_practice_complete': 'Interval practice complete!',
                    
                    // 错误信息
                    'error_no_audio_support': 'Your browser does not support audio API',
                    'error_microphone_permission': 'Cannot get microphone permission',
                    'error_audio_device': 'Audio device initialization failed',
                    'error_pitch_detection': 'Pitch detection failed',
                    
                    // 提示信息
                    'hint_select_device': 'Please select an audio input device',
                    'hint_connect_guitar': 'Please connect your guitar',
                    'hint_start_practice': 'Click start practice button to begin',
                    'hint_select_chord_type': 'Please select at least one chord type',
                    'hint_select_scale': 'Please select a scale type',
                    'chord_sequence_empty': 'Click "Add Chord" to start creating chord progression',
                    'select_song': 'Please select a song',
                    'select_scale_mode': 'Please select practice mode!',
                    
                    // 练习相关
                    'practice_scale': 'Scale Practice',
                    'practice_chord': 'Chord Practice',
                    'practice_progression': 'Changes Practice',
                    'practice_arpeggio': 'Arpeggio Practice',
                    'practice_interval': 'Interval Practice',
                    
                    // 音阶类型
                    'scale_major': 'Major',
                    'scale_minor': 'Minor',
                    'scale_dorian': 'Dorian',
                    'scale_phrygian': 'Phrygian',
                    'scale_lydian': 'Lydian',
                    'scale_mixolydian': 'Mixolydian',
                    'scale_locrian': 'Locrian',
                    'scale_harmonic_minor': 'Harmonic Minor',
                    'scale_melodic_minor': 'Melodic Minor',
                    'scale_pentatonic_major': 'Major Pentatonic',
                    'scale_pentatonic_minor': 'Minor Pentatonic',
                    'scale_blues': 'Blues Scale',
                    
                    // 和弦转换设置
                    'progression_settings': 'Progression Settings',
                    'progression_level': 'Practice Level',
                    'progression_level_hint': 'Select chord complexity',
                    'single_chord_notes': 'Single Chord Notes',
                    'double_chord_notes': 'Double Chord Notes',
                    'triple_chord_notes': 'Triple Chord Notes',
                    'quad_chord_notes': 'Quad Chord Notes',
                    'progression_key': 'Tunes',
                    'progression_key_hint': 'Select a Tune',
                    'progression_tunes': 'Tunes',
                    'progression_tunes_hint': 'Select practice tunes',
                    'progression_style': 'Style',
                    'progression_style_hint': 'Select practice style',
                    'progression_tempo': 'Tempo',
                    'progression_tempo_hint': 'Set practice tempo',
                    'progression_difficulty': 'Difficulty',
                    'progression_difficulty_hint': 'Select practice difficulty',
                    
                    // 音阶设置详细
                    'scale_root_note': 'Key',
                    'scale_root_note_hint': 'Select key',
                    'scale_type': 'Mode',
                    'scale_type_hint': 'Select mode',
                    'scale_direction_hint': 'Select playing direction',
                    'scale_practice_sequence_hint': 'Select practice sequence',
                    'scale_arpeggio': 'Arpeggio',
                    'scale_arpeggio_hint': 'Select arpeggio type',
                    'scale_interval': 'Interval',
                    'scale_interval_hint': 'Select interval practice',
                    'scale_random': 'Random',
                    'scale_random_hint': 'Generate random practice',
                    
                    // 设备设置详细
                    'device_audio_input_hint': 'Select audio input device',
                    'device_gain_hint': 'Adjust input gain',
                    'device_metronome_hint': 'Enable metronome',
                    'device_tempo_hint': 'Set metronome tempo',
                    'device_sensitivity_hint': 'Adjust pitch detection sensitivity',
                    'device_cooldown_hint': 'Set cooldown time',
                    'device_confidence_hint': 'Set confidence threshold',
                    'device_noise_hint': 'Set noise level',
                    'device_volume_hint': 'Set minimum volume',
                    'device_buffer_hint': 'Set buffer size',
                    'device_harmonic_hint': 'Set harmonic weights',
                    'device_zero_crossing_hint': 'Set zero crossing threshold',
                    
                    // 通用设置详细
                    'general_language_hint': 'Select interface language',
                    'interface_language_hint': 'Select interface language',
                    'general_theme': 'Theme',
                    'general_theme_hint': 'Select interface theme',
                    'theme_dark': 'Dark Theme',
                    'theme_light': 'Light Theme',
                    'theme_auto': 'Follow System',
                    'general_sound': 'Sound',
                    'general_sound_hint': 'Set sound options',
                    'general_display': 'Display',
                    'general_display_hint': 'Set display options',
                    'general_advanced': 'Advanced',
                    'general_advanced_hint': 'Advanced settings options',

                    // 调试设置
                    'debug_settings': 'Debug Settings',
                    'debug_logging': 'Debug Logging',
                    'debug_logging_hint': 'Enable detailed debug logging in console',
                    
                    // 音阶设置optgroup标签
                    'basic_modes': 'Basic Modes',
                    'church_modes': 'Church Modes',
                    'harmonic_minor_series': 'Harmonic Minor Series',
                    'melodic_minor_series': 'Melodic Minor Series',
                    'pentatonic_scales': 'Pentatonic Scales',
                    'blues_scales': 'Blues Scales',
                    'special_scales': 'Special Scales',
                    'exotic_scales': 'Exotic Scales',
                    
                    // 和弦转换设置optgroup标签
                    'single_chord_notes': 'Single Chord Notes',
                    'double_chord_notes': 'Double Chord Notes',
                    'triple_chord_notes': 'Triple Chord Notes',
                    'quad_chord_notes': 'Quad Chord Notes',
                    
                    // 和弦转换设置选项
                    'single_chord_tones': 'Single Chord Tones',
                    'two_chord_tones': 'Two Chord Tones',
                    'three_chord_tones': 'Three Chord Tones',
                    'four_chord_tones': 'Four Chord Tones',
                    'random_inversions_135': '1,3,5 Random Inversions',
                    'random_inversions_1357': '1357 Random Inversions',
                    'all_chord_tones': 'All Chord Tones',
                    'all': 'All',
                    
                    // 找音练习设置
                    'pitch_finding_practice_time': 'Practice Time',
                    'pitch_finding_practice_time_hint': 'Select practice duration',
                    'pitch_finding_show_fretboard': 'Show Fretboard',
                    'pitch_finding_show_fretboard_hint': 'Display note positions on fretboard when correct pitch is detected',
                    'fretboard_keyboard_hint': '💡 ↓Hide ↑Show Space Next',
                    'pitch_finding_fretboard_range': 'Fretboard Range',
                    'pitch_finding_fretboard_range_hint': 'Select fretboard display range',
                    'pitch_finding_12_frets': '12 Frets',
                    'pitch_finding_15_frets': '15 Frets',
                    'pitch_finding_18_frets': '18 Frets',
                    'pitch_finding_24_frets': '24 Frets',
                    'pitch_finding_current_note': 'Current Note',
                    'pitch_finding_time_remaining': 'Time Remaining',
                    'pitch_finding_practice_complete': 'Practice Complete',
                    'pitch_finding_next_interval': 'Next Question Interval',
                    'pitch_finding_next_interval_hint': 'Time interval before automatically moving to next question after correct answer',
                    'pitch_finding_no_auto': 'Manual',
                    'pitch_finding_2_seconds': '2 Seconds',
                    'pitch_finding_3_seconds': '3 Seconds',
                    'pitch_finding_5_seconds': '5 Seconds',
                    'pitch_finding_1_minute': '1 Minute',
                    'pitch_finding_2_minutes': '2 Minutes',
                    'pitch_finding_3_minutes': '3 Minutes',
                    'pitch_finding_5_minutes': '5 Minutes',
                    'pitch_finding_10_minutes': '10 Minutes',
                    'pitch_finding_15_minutes': '15 Minutes',
                    'pitch_finding_30_minutes': '30 Minutes',
                    'pitch_finding_next_question': 'Next',
                    'practice_mode': 'Practice Mode',
                    'practice_mode_hint': 'Select practice type',
                    'note_interval_practice': 'Interval Practice',
                    'single_note_practice': 'Single Note Practice',
                    'interval_selection': 'Select Intervals',
                    'interval_selection_hint': 'Select intervals to practice',
                    'root_note_setting': 'Root Note Setting',
                    'root_note_setting_hint': 'Choose root note or random',
                    'find_root_first': 'Find Root First',
                    'find_root_first_hint': 'Practice root note first, then intervals',
                    'start_practice': 'Start Practice',
                    
                    // 设备设置其他标签
                    'practice_settings': 'Practice Settings',
                    'metronome_settings': 'Metronome Settings',
                    'time_label': 'Time',
                    'fixed_delay_generation': 'Fixed Delay Generation',
                    'background_flash': 'Background Flash',
                    
                    // 通用设置其他标签
                    'settings_management': 'Settings Management',
                    'reset_settings_hint': 'Click reset button to restore all settings to default values',
                    'chord_name_display': 'Chord Name Display',
                    'chord_name_display_hint': 'Select chord name display format',
                    'chord_name_english': 'English',
                    'chord_name_symbols': 'Symbols',
                    
                    // 遗漏的翻译键
                    'sound_metronome': 'Sound Metronome',
                    'custom_chord_progression': 'Custom Changes',
                    'song_name_placeholder': 'Enter song name (optional)',
                    'btn_clear_custom_chords': 'Clear Custom Changes',
                    'btn_save_custom_chords': 'Save Changes to Local',
                    'btn_load_local_chords': 'Load Local Changes',
                    'btn_load_sequence': 'Load Sequence',
                    'btn_add_chord': 'Add Chord',
                    'progression_order': 'Order',
                    'progression_order_hint': 'Select chord progression playing order',
                    'progression_repeat': 'Repeat Practice',
                    'progression_repeat_hint': 'Enable to repeat the song for practice',
                    'progression_key_label': 'Key',
                    'progression_key_hint': 'Select practice key',
                    'order_ordered': 'Ordered',
                    'order_reverse': 'Reverse',
                    'device_count_detected': '{count} Audio Input Devices',
                    'device_count_none': 'No Audio Input Devices Detected',
                    'default_device': 'Default Device',
                    'audio_device': 'Audio Device',
                    'audio_device_list_error': 'Unable to get audio device list, please ensure microphone permission is granted',
                    'key_c_default': 'C Default',
                    
                    // CAGED Practice Settings
                    'caged_practice': 'CAGED Practice',
                    'caged_practice_hint': 'Scale and chord practice based on CAGED system',
                    'caged_practice_mode': 'CAGED Practice Mode',
                    'caged_shape': 'CAGED Shape',
                    'caged_shape_hint': 'Select CAGED shape to practice',
                    'caged_key': 'Key',
                    'caged_key_hint': 'Select practice key',
                    'caged_mode': 'Practice Mode',
                    'caged_mode_hint': 'Select CAGED practice mode',
                    'caged_shape_connection': 'Shape Connection',
                    'caged_random_shapes': 'Random Shapes',
                    'caged_show_fretboard': 'Show Fretboard',
                    'caged_show_fingering': 'Show Fingering',
                    'caged_show_scale': 'Show Scale',
                    'caged_c_shape': 'C Shape',
                    'caged_a_shape': 'A Shape',
                    'caged_g_shape': 'G Shape',
                    'caged_e_shape': 'E Shape',
                    'caged_d_shape': 'D Shape',
                    'midi_support': 'MIDI Device Support',
                    'midi_support_hint': 'Connect MIDI keyboard or controller for practice',
                    'midi_enable': 'MIDI Device',
                    'midi_device_connected': 'MIDI device connected',
                    'midi_device_disconnected': 'MIDI device disconnected',
                    'midi_device_detected': 'Detected {count} MIDI devices',
                    'midi_device_none': 'No MIDI devices detected',

                    // Music style and tempo terms
                    'jazz_medium': 'Medium',
                    'jazz_up_tempo': 'Up-tempo',
                    'jazz_ballad': 'Ballad',
                    'jazz_swing': 'Swing',
                    'jazz_latin': 'Latin',
                    'jazz_afro_cuban': 'Afro-Cuban',
                    'jazz_bebop': 'Bebop',
                    'jazz_modern': 'Modern',
                    'jazz_standard': 'Jazz Standard',
                    'tempo_medium': 'Medium',
                    'tempo_up': 'Up-tempo',
                    'tempo_ballad': 'Ballad',
                    'tempo_swing': 'Swing',
                    'tempo_fast': 'Fast',

                    // MIDI status messages
                    'midi_connected': 'Connected',
                    'midi_disconnected': 'Disconnected',
                    'midi_device_detected': 'Detected {count} MIDI devices',
                    'midi_no_device': 'No MIDI devices detected',
                    'midi_connect': 'Connect',
                    'midi_connected_status': 'Connected',
                    'midi_device': 'MIDI device',
                    'midi_select_to_connect': 'Please select to connect',
                    'midi_initializing': 'Initializing MIDI...',
                    'midi_scanning': 'Scanning MIDI devices...',
                    'midi_not_supported': 'MIDI not supported',
                    'midi_init_failed': 'MIDI initialization failed',
                    'midi_permission_denied': 'MIDI permission denied, please check browser settings',
                    'midi_access_interrupted': 'MIDI device access interrupted',
                    'midi_invalid_state': 'MIDI device state invalid',
                    'midi_device_disconnected': 'Device {name} disconnected',
                    'midi_check_connection': 'Please ensure MIDI device is connected and refresh the page',

                    // Tooltips and status messages
                    'shape': 'shape',
                    'shape_current': 'Current shape',
                    'shape_completed': 'Completed',
                    'shape_switch': 'Switch to',
                    'shape_not_selected': 'Not selected',
                    'fullscreen_selector_title': 'Select',
                    'random_inversions': 'Random Inversions',
                    'default_tempo': 'Medium',
                    'unknown_composer': 'Unknown',
                    'unknown_year': 'Unknown',

                    // Key selection
                    'key_c_default': 'C Default',
                    'select_song': 'Select Song',
                    'select_key': 'Select Key',

                    // 歌曲信息相关
                    'basic_info': 'Basic Information',
                    'song_composer': 'Composer:',
                    'song_year': 'Year:',
                    'song_style': 'Style:',
                    'song_tempo': 'Tempo:',
                    'song_key': 'Original Key:',
                    'song_description': 'Song Description',
                    'select_this_song': 'Select This Song',
                    'unknown': 'Unknown',
                    'jazz_standard': 'Jazz Standard',
                    'chord_progression': 'Chord Progression',

                    // 和弦练习分组
                    'chord_single_notes': 'Single Chord Notes',
                    'chord_double_notes': 'Double Chord Notes',
                    'chord_triple_notes': 'Triple Chord Notes',
                    'chord_quad_notes': 'Quad Chord Notes',
                    'chord_all_notes': 'All Chord Notes',

                    // New practice groups
                    'melodic_structure_r_to_5th': 'Melodic Structure - R→5th',
                    'melodic_structure_5th_to_9th': 'Melodic Structure - 5th→9th',
                    'voice_led_structure': 'Voice Leading Structure',
                    'suspension_structure': 'Suspension Structure',
                    'chord_scale_structure': 'Chord Scale Structure',
                    'passing_tone_structure': 'Passing Tones Structure',

                    // 键盘操作提示
                    'keyboard_hide': 'Hide',
                    'keyboard_show': 'Show',
                    'keyboard_space': 'Space',
                    'keyboard_next': 'Next',

                    // 麦克风权限相关
                    'mic_permission_denied': 'Microphone Permission Denied',
                    'mic_permission_needed': 'This app needs microphone permission to detect pitch.',
                    'mic_permission_needed_for_device': 'Microphone permission required to detect audio input devices',
                    'mic_permission_needed_for_label': 'Microphone permission required to display device names',
                    'browser_not_support_audio': 'Browser does not support audio input',
                    'requesting_mic_permission': 'Requesting microphone permission...',
                    'mic_permission_steps': 'Please follow these steps:',
                    'mic_step_1': 'Click the lock/info icon on the left side of the browser address bar',
                    'mic_step_2': 'Find "Microphone" option in the popup menu',
                    'mic_step_3': 'Set it to "Allow"',
                    'mic_step_4': 'Refresh the page and try again',
                    'refresh_page': 'Refresh Page',
                    'return_to_main': 'Return to Main Menu'
                }
            };

// ==================== 音乐理论常量 ====================
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
const STRING_TUNING = [4, 11, 7, 2, 9, 4] // E B G D A E (high to low, as semitones from C)
const GUITAR_TUNING = ["E", "B", "G", "D", "A", "E"] // 1弦到6弦的开放音 (high to low)
const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]

// 音级到半音的映射（全局常量）
const DEGREE_TO_SEMITONE: Record<string, number> = {
  "1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "4": 5,
  "#4": 6, "b5": 6, "5": 7, "#5": 8, "b6": 8, "6": 9,
  "#6": 9, "b7": 10, "7": 10, "maj7": 11, "bb7": 9,
  "b9": 1, "9": 2, "#9": 3, "b13": 8, "13": 9, "11": 5, "#11": 6
}

// Chord types with intervals
const CHORD_TYPES = [
  { name: "Major", intervals: [0, 4, 7], symbol: "" },
  { name: "Minor", intervals: [0, 3, 7], symbol: "m" },
  { name: "Dim", intervals: [0, 3, 6], symbol: "dim" },
  { name: "Aug", intervals: [0, 4, 8], symbol: "aug" },
  { name: "6", intervals: [0, 4, 7, 9], symbol: "6" },
  { name: "m6", intervals: [0, 3, 7, 9], symbol: "m6" },
  { name: "7", intervals: [0, 4, 7, 10], symbol: "7" },
  { name: "Maj7", intervals: [0, 4, 7, 11], symbol: "maj7" },
  { name: "m7", intervals: [0, 3, 7, 10], symbol: "m7" },
  { name: "m7b5", intervals: [0, 3, 6, 10], symbol: "m7♭5" },
  { name: "dim7", intervals: [0, 3, 6, 9], symbol: "dim7" },
  { name: "9", intervals: [0, 4, 7, 10, 14], symbol: "9" },
  { name: "Maj9", intervals: [0, 4, 7, 11, 14], symbol: "maj9" },
  { name: "m9", intervals: [0, 3, 7, 10, 14], symbol: "m9" },
  { name: "7#9", intervals: [0, 4, 7, 10, 15], symbol: "7♯9" },
  { name: "7b9", intervals: [0, 4, 7, 10, 13], symbol: "7♯9" },
  { name: "11", intervals: [0, 4, 7, 10, 14, 17], symbol: "11" },
  { name: "m11", intervals: [0, 3, 7, 10, 14, 17], symbol: "m11" },
  { name: "7#11", intervals: [0, 4, 7, 10, 14, 18], symbol: "7♯11" },
  { name: "13", intervals: [0, 4, 7, 10, 14, 17, 21], symbol: "13" },
  { name: "m13", intervals: [0, 3, 7, 10, 14, 17, 21], symbol: "m13" },
  { name: "sus2", intervals: [0, 2, 7], symbol: "sus2" },
  { name: "sus4", intervals: [0, 5, 7], symbol: "sus4" },
  { name: "add9", intervals: [0, 4, 7, 14], symbol: "add9" },
  { name: "madd9", intervals: [0, 3, 7, 14], symbol: "madd9" },
  { name: "6add9", intervals: [0, 4, 7, 9, 14], symbol: "6/9" },
  { name: "m6add9", intervals: [0, 3, 7, 9, 14], symbol: "m6/9" },
]

// Intervals
const INTERVALS = [
  { name: "unison", semitones: 0, symbol: "1" },
  { name: "min2", semitones: 1, symbol: "b2" },
  { name: "maj2", semitones: 2, symbol: "2" },
  { name: "min3", semitones: 3, symbol: "b3" },
  { name: "maj3", semitones: 4, symbol: "3" },
  { name: "perf4", semitones: 5, symbol: "4" },
  { name: "tritone", semitones: 6, symbol: "b5/#4" },
  { name: "perf5", semitones: 7, symbol: "5" },
  { name: "min6", semitones: 8, symbol: "b6" },
  { name: "maj6", semitones: 9, symbol: "6" },
  { name: "min7", semitones: 10, symbol: "b7" },
  { name: "maj7", semitones: 11, symbol: "7" },
  { name: "octave", semitones: 12, symbol: "8" },
  { name: "flat9", semitones: 13, symbol: "b9" },
  { name: "maj9", semitones: 14, symbol: "9" },
  { name: "sharp9", semitones: 15, symbol: "#9" },
  { name: "maj11", semitones: 17, symbol: "11" },
  { name: "sharp11", semitones: 18, symbol: "#11" },
  { name: "flat13", semitones: 20, symbol: "b13" },
  { name: "maj13", semitones: 21, symbol: "13" },
]

// Scale modes - 包含音程数字和音级字符串
const SCALE_MODES = {
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
  pentatonic: [
    { name: "Major Pentatonic", notes: [0, 2, 4, 7, 9], intervals: ["1", "2", "3", "5", "6"], formula: "1 2 3 5 6" },
    { name: "Minor Pentatonic", notes: [0, 3, 5, 7, 10], intervals: ["1", "b3", "4", "5", "b7"], formula: "1 b3 4 5 b7" },
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
}

// 音阶练习序列类型（琶音类型）
const SCALE_PRACTICE_SEQUENCES = [
  { id: "1to1", name: "1→1", description: "从根音到根音" },
  { id: "3to3", name: "3→3", description: "从三音到三音" },
  { id: "5to5", name: "5→5", description: "从五音到五音" },
  { id: "7to7", name: "7→7", description: "从七音到七音" },
  { id: "random", name: "随机", description: "随机琶音" },
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
      "Maj9": "大九和弦",
      "m9": "小九和弦",
      "7#9": "属七升九和弦",
      "7b9": "属七降九和弦",
      "m11": "小十一和弦",
      "7#11": "属七升十一和弦",
      "m13": "小十三和弦",
      "sus2": "挂二和弦",
      "sus4": "挂四和弦",
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
      "Blues": "布鲁斯音阶",
      "Whole Tone": "全音音阶",
      "Lydian Dominant": "利底亚属音阶",
      "Altered": "变化音阶",
      "Half-Whole Diminished": "半全减音阶",
      "Whole-Half Diminished": "全半减音阶",
      "Harmonic Major": "和声大调",
      "Hungarian Minor": "匈牙利小调",
      "Japanese": "日本音阶",
      "Egyptian": "埃及音阶",
      "Spanish Phrygian": "西班牙弗里几亚",
      "Hijaz": "希贾兹音阶",
      "Double Harmonic": "双和声音阶",
      "Chromatic": "半音阶",
      "Augmented": "增音阶",
      "Tritone": "三全音音阶"
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
      "Maj9": "Maj9",
      "m9": "m9",
      "7#9": "7(#9)",
      "7b9": "7(b9)",
      "m11": "m11",
      "7#11": "7(#11)",
      "m13": "m13",
      "sus2": "sus2",
      "sus4": "sus4",
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
      "Blues": "Blues Scale",
      "Whole Tone": "Whole Tone",
      "Lydian Dominant": "Lydian Dominant",
      "Altered": "Altered Scale",
      "Half-Whole Diminished": "Half-Whole Dim",
      "Whole-Half Diminished": "Whole-Half Dim",
      "Harmonic Major": "Harmonic Major",
      "Hungarian Minor": "Hungarian Minor",
      "Japanese": "Japanese Scale",
      "Egyptian": "Egyptian Scale",
      "Spanish Phrygian": "Spanish Phrygian",
      "Hijaz": "Hijaz Scale",
      "Double Harmonic": "Double Harmonic",
      "Chromatic": "Chromatic Scale",
      "Augmented": "Augmented Scale",
      "Tritone": "Tritone Scale"
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
      "Maj9": "Maj9",
      "m9": "m9",
      "7#9": "7(#9)",
      "7b9": "7(b9)",
      "m11": "m11",
      "7#11": "7(#11)",
      "m13": "m13",
      "sus2": "sus2",
      "sus4": "sus4",
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
      "Blues": "Blues",
      "Whole Tone": "Whole Tone",
      "Lydian Dominant": "Lydian Dom",
      "Altered": "Altered",
      "Half-Whole Diminished": "H-W Dim",
      "Whole-Half Diminished": "W-H Dim",
      "Harmonic Major": "Harm. Major",
      "Hungarian Minor": "Hung. Minor",
      "Japanese": "Japanese",
      "Egyptian": "Egyptian",
      "Spanish Phrygian": "Spanish Phryg",
      "Hijaz": "Hijaz",
      "Double Harmonic": "Dbl Harm",
      "Chromatic": "Chromatic",
      "Augmented": "Augmented",
      "Tritone": "Tritone"
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
      "Maj9": "Maj9",
      "m9": "min9",
      "7#9": "7(#9)",
      "7b9": "7(b9)",
      "m11": "min11",
      "7#11": "7(#11)",
      "m13": "min13",
      "sus2": "sus2",
      "sus4": "sus4",
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
      "Blues": "Blues",
      "Whole Tone": "Whole Tone",
      "Lydian Dominant": "Lydian Dom",
      "Altered": "Altered",
      "Half-Whole Diminished": "H-W Dim",
      "Whole-Half Diminished": "W-H Dim",
      "Harmonic Major": "Harm. Major",
      "Hungarian Minor": "Hung. Minor",
      "Japanese": "Japanese",
      "Egyptian": "Egyptian",
      "Spanish Phrygian": "Spanish Phryg",
      "Hijaz": "Hijaz",
      "Double Harmonic": "Dbl Harm",
      "Chromatic": "Chromatic",
      "Augmented": "Augmented",
      "Tritone": "Tritone"
    }
  }
}

// 获取和弦显示名称
function getChordDisplayName(chordType: string, displayMode: 'chinese' | 'english' | 'english_short' | 'jazz'): string {
  return DISPLAY_NAMES[displayMode].chordTypes[chordType as keyof typeof DISPLAY_NAMES.chinese.chordTypes] || chordType
}

// 获取音阶显示名称
function getScaleDisplayName(scaleName: string, displayMode: 'chinese' | 'english' | 'english_short' | 'jazz'): string {
  return DISPLAY_NAMES[displayMode].scaleTypes[scaleName as keyof typeof DISPLAY_NAMES.chinese.scaleTypes] || scaleName
}

// 将音程度数中的 # 和 b 转换为 ♯ 和 ♭
function formatDegree(degree: string): string {
  return degree.replace(/#/g, '♯').replace(/b/g, '♭')
}

// Song progressions
const SONG_PROGRESSIONS = [
  { 
    name: "All Of Me", 
    composer: "Gerald Marks & Seymour Simons",
    year: "1931",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "C",
    chords: ["C", "E7", "A7", "Dm7", "G7", "C", "C7", "F", "Fm", "C", "A7", "Dm7", "G7", "C", "E7", "A7", "Dm7", "G7", "C", "C7", "F", "Fm", "C", "A7", "Dm7", "G7", "C"] 
  },
  { 
    name: "Autumn Leaves", 
    composer: "Joseph Kosma",
    year: "1945",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Gm",
    chords: ["Am7b5", "D7", "Gm7", "Cm7", "F7", "BbMaj7", "Ebmaj7", "Am7b5", "D7", "Gm7", "Cm7", "F7", "BbMaj7", "Ebmaj7", "Am7b5", "D7", "Gm7", "Cm7", "F7", "BbMaj7", "Ebmaj7", "Am7b5", "D7", "Gm7"] 
  },
  { 
    name: "Blue Bossa", 
    composer: "Kenny Dorham",
    year: "1961",
    style: "Latin Jazz",
    tempo: "Medium",
    key: "Cm",
    chords: ["Cm7", "Fm7", "Dm7b5", "G7", "Cm7", "Cm7", "Fm7", "Dm7b5", "G7", "Cm7", "Ebm7", "Ab7", "DbMaj7", "DbMaj7", "Dm7b5", "G7", "Cm7"] 
  },
  { 
    name: "Fly Me To The Moon", 
    composer: "Bart Howard",
    year: "1954",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "C",
    chords: ["Am7", "Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7", "Am7", "Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7", "Am"] 
  },
  { 
    name: "Girl From Ipanema", 
    composer: "Antonio Carlos Jobim",
    year: "1962",
    style: "Bossa Nova",
    tempo: "Medium",
    key: "F",
    chords: ["FMaj7", "G7", "Gm7", "Cm7", "F#7", "FMaj7", "A7", "Dm7", "Gm7", "C7", "FMaj7", "F#m7b5", "B7", "Em7", "A7", "Dm7", "G7", "CMaj7", "F7", "BbMaj7", "Ebm7", "Ab7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "So What", 
    composer: "Miles Davis",
    year: "1959",
    style: "Modal Jazz",
    tempo: "Medium",
    key: "Dm",
    chords: ["Dm7", "Dm7", "Dm7", "Dm7", "Ebm7", "Ebm7", "Dm7", "Dm7"] 
  },
  { 
    name: "Take Five", 
    composer: "Paul Desmond",
    year: "1959",
    style: "Cool Jazz",
    tempo: "Medium",
    key: "Ebm",
    chords: ["Ebm7", "Bbm7", "Ebm7", "Bbm7", "Cbmaj7", "Abm7", "Bbm7", "Ebm7"] 
  },
  { 
    name: "Summertime", 
    composer: "George Gershwin",
    year: "1935",
    style: "Jazz Standard",
    tempo: "Slow",
    key: "Am",
    chords: ["Am6", "E7", "Am6", "E7", "Am6", "Dm7", "G7", "CMaj7", "Fmaj7", "Bm7b5", "E7", "Am6", "Dm7", "G7", "CMaj7", "Fmaj7", "Bm7b5", "E7", "Am6"] 
  },
  { 
    name: "II-V-I Major", 
    composer: "",
    year: "",
    style: "Exercise",
    tempo: "Medium",
    key: "C",
    chords: ["Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "II-V-I Minor", 
    composer: "",
    year: "",
    style: "Exercise",
    tempo: "Medium",
    key: "Cm",
    chords: ["Dm7b5", "G7", "Cm7"] 
  },
  { 
    name: "Jazz Blues", 
    composer: "",
    year: "",
    style: "Blues",
    tempo: "Medium",
    key: "F",
    chords: ["F7", "Bb7", "F7", "Cm7", "F7", "Bb7", "Bdim7", "F7", "Am7", "D7", "Gm7", "C7"] 
  },
  { 
    name: "Rhythm Changes", 
    composer: "",
    year: "",
    style: "Bebop",
    tempo: "Fast",
    key: "Bb",
    chords: ["BbMaj7", "G7", "Cm7", "F7", "BbMaj7", "G7", "Cm7", "F7", "EbMaj7", "Eb7", "AbMaj7", "D7", "Gm7", "C7", "Fmaj7", "Bbm7", "Eb7", "AbMaj7", "D7", "Gm7", "C7", "Fmaj7", "Bbm7", "Eb7", "AbMaj7", "D7", "Gm7", "C7", "Fmaj7", "Bbm7", "Eb7", "AbMaj7", "D7", "Gm7", "C7"] 
  },
  { 
    name: "Stella By Starlight", 
    composer: "Victor Young",
    year: "1944",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Bb",
    chords: ["Em7b5", "A7", "Dm7", "G7", "CMaj7", "Fmaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7b5", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "There Will Never Be Another You", 
    composer: "Harry Warren",
    year: "1942",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Eb",
    chords: ["EbMaj7", "AbMaj7", "EbMaj7", "AbMaj7", "EbMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "EbMaj7"] 
  },
  { 
    name: "Satin Doll", 
    composer: "Duke Ellington",
    year: "1953",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "C",
    chords: ["Dm7", "G7", "CMaj7", "A7", "Dm7", "G7", "CMaj7", "A7", "Dm7", "G7", "CMaj7", "Em7", "A7", "Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "Misty", 
    composer: "Erroll Garner",
    year: "1954",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Eb",
    chords: ["EbMaj7", "Bb7", "Gm7", "Cm7", "F7", "Bb7", "EbMaj7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "EbMaj7"] 
  },
  { 
    name: "My Funny Valentine", 
    composer: "Richard Rodgers",
    year: "1937",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Cm",
    chords: ["Cm", "CmMaj7", "Cm7", "F7", "Bbmaj7", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Fmaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Fmaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Cm"] 
  },
  { 
    name: "Body and Soul", 
    composer: "Johnny Green",
    year: "1930",
    style: "Jazz Standard",
    tempo: "Slow",
    key: "Db",
    chords: ["DbMaj7", "Ebm7", "Ab7", "DbMaj7", "Dbm7", "Gb7", "CbMaj7", "Fbm7", "Bbm7b5", "Eb7", "AbMaj7", "DbMaj7", "Ebm7", "Ab7", "DbMaj7", "Db7", "GbMaj7", "Cbmaj7", "Fbm7", "Bbm7", "Eb7", "AbMaj7"] 
  },
  { 
    name: "Bye Bye Blackbird", 
    composer: "Ray Henderson",
    year: "1926",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "F",
    chords: ["F", "Dm7", "Gm7", "C7", "F", "Dm7", "Gm7", "C7", "FMaj7", "Am7", "D7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Days of Wine and Roses", 
    composer: "Henry Mancini",
    year: "1962",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "F",
    chords: ["FMaj7", "Gm7", "Cm7", "F7", "BbMaj7", "Gm7", "Cm7", "F7", "BbMaj7", "Ebm7", "Ab7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Have You Met Miss Jones", 
    composer: "Richard Rodgers",
    year: "1937",
    style: "Jazz Standard",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gbm7", "Cb7", "FBMaj7", "EMaj7", "Am7", "D7", "Gmaj7", "Cm7", "F7", "BbMaj7", "Ebm7", "Ab7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "How High The Moon", 
    composer: "Morgan Lewis",
    year: "1940",
    style: "Bebop",
    tempo: "Fast",
    key: "G",
    chords: ["Gm7", "C7", "FMaj7", "BbMaj7", "Ebmaj7", "Ab7", "DbMaj7", "Gbm7", "Cb7", "FBMaj7", "Bmaj7", "Em7", "A7", "Dmaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "I Got Rhythm", 
    composer: "George Gershwin",
    year: "1930",
    style: "Jazz Standard",
    tempo: "Fast",
    key: "Bb",
    chords: ["BbMaj7", "G7", "Cm7", "F7", "Dm7", "G7", "Cm7", "F7"] 
  },
  { 
    name: "In a Sentimental Mood", 
    composer: "Duke Ellington",
    year: "1935",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Dm",
    chords: ["Dm7", "G7", "CMaj7", "CMaj7", "Dm7", "G7", "CMaj7", "CMaj7", "FMaj7", "F#dim7", "Gm7", "C7", "FMaj7", "F#dim7", "Gm7", "C7", "Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "Just Friends", 
    composer: "John Klenner",
    year: "1931",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "G",
    chords: ["GMaj7", "Bm7", "E7", "Am7", "D7", "GMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Night and Day", 
    composer: "Cole Porter",
    year: "1932",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Eb",
    chords: ["EbMaj7", "Eb7", "AbMaj7", "Abm7", "Db7", "GbMaj7", "Gbm7", "Cb7", "FBMaj7", "Bmaj7", "Em7", "A7", "Dmaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "EbMaj7"] 
  },
  { 
    name: "On Green Dolphin Street", 
    composer: "Bronislaw Kaper",
    year: "1947",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Eb",
    chords: ["EbMaj7", "Eb7", "AbMaj7", "Abm7", "Db7", "GbMaj7", "Gbm7", "Cb7", "FBMaj7", "Bbm7b5", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "EbMaj7"] 
  },
  { 
    name: "The Way You Look Tonight", 
    composer: "Jerome Kern",
    year: "1936",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "F",
    chords: ["FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gbm7", "Cb7", "FBMaj7", "Bmaj7", "Em7", "A7", "Dmaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "What Is This Thing Called Love", 
    composer: "Cole Porter",
    year: "1929",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "C",
    chords: ["Cm7", "F7", "Bbmaj7", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Fmaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Cm7"] 
  },
  { 
    name: "Yardbird Suite", 
    composer: "Charlie Parker",
    year: "1946",
    style: "Bebop",
    tempo: "Fast",
    key: "C",
    chords: ["CMaj7", "Dm7", "G7", "CMaj7", "A7", "Dm7", "G7", "CMaj7", "Fmaj7", "F#dim7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "CMaj7"] 
  },
  { 
    name: "A Night in Tunisia", 
    composer: "Dizzy Gillespie",
    year: "1942",
    style: "Bebop",
    tempo: "Fast",
    key: "Dm",
    chords: ["Dm7", "G7", "CMaj7", "Fmaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "FMaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "FMaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "Donna Lee", 
    composer: "Charlie Parker",
    year: "1947",
    style: "Bebop",
    tempo: "Fast",
    key: "Ab",
    chords: ["AbMaj7", "Fm7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "AbMaj7", "Eb7", "AbMaj7", "Fm7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gbm7", "Cb7", "FBMaj7", "Bmaj7", "Em7", "A7", "Dmaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7"] 
  },
  { 
    name: "Ornithology", 
    composer: "Charlie Parker",
    year: "1946",
    style: "Bebop",
    tempo: "Fast",
    key: "G",
    chords: ["Gm7", "C7", "FMaj7", "BbMaj7", "Ebmaj7", "Ab7", "DbMaj7", "Gbm7", "Cb7", "FBMaj7", "Bmaj7", "Em7", "A7", "Dmaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Scrapple from the Apple", 
    composer: "Charlie Parker",
    year: "1947",
    style: "Bebop",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "D7", "Gm7", "C7", "FMaj7", "D7", "Gm7", "C7", "Am7", "D7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Confirmation", 
    composer: "Charlie Parker",
    year: "1946",
    style: "Bebop",
    tempo: "Fast",
    key: "F",
    chords: ["FMaj7", "A7", "Dm7", "G7", "CMaj7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Billie's Bounce", 
    composer: "Charlie Parker",
    year: "1945",
    style: "Blues",
    tempo: "Medium",
    key: "F",
    chords: ["F7", "F7", "F7", "F7", "Bb7", "Bb7", "F7", "F7", "Gm7", "C7", "F7", "F7"] 
  },
  { 
    name: "Now's The Time", 
    composer: "Charlie Parker",
    year: "1945",
    style: "Blues",
    tempo: "Medium",
    key: "Bb",
    chords: ["Bb7", "Bb7", "Bb7", "Bb7", "Eb7", "Eb7", "Bb7", "Bb7", "Cm7", "F7", "Bb7", "Bb7"] 
  },
  { 
    name: "C Jam Blues", 
    composer: "Duke Ellington",
    year: "1942",
    style: "Blues",
    tempo: "Medium",
    key: "C",
    chords: ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "Dm7", "G7", "C7", "C7"] 
  },
  { 
    name: "Tenor Madness", 
    composer: "Sonny Rollins",
    year: "1956",
    style: "Blues",
    tempo: "Medium",
    key: "Bb",
    chords: ["Bb7", "Bb7", "Bb7", "Bb7", "Eb7", "Eb7", "Bb7", "Bb7", "Cm7", "F7", "Bb7", "Bb7"] 
  },
  { 
    name: "Footprints", 
    composer: "Wayne Shorter",
    year: "1966",
    style: "Modal Jazz",
    tempo: "Slow",
    key: "Cm",
    chords: ["Cm7", "Cm7", "F7", "F7", "Bbmaj7", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Fmaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Cm7"] 
  },
  { 
    name: "Impressions", 
    composer: "John Coltrane",
    year: "1961",
    style: "Modal Jazz",
    tempo: "Medium",
    key: "Dm",
    chords: ["Dm7", "Dm7", "Dm7", "Dm7", "Ebm7", "Ebm7", "Dm7", "Dm7"] 
  },
  { 
    name: "Maiden Voyage", 
    composer: "Herbie Hancock",
    year: "1965",
    style: "Modal Jazz",
    tempo: "Slow",
    key: "D",
    chords: ["Dm7", "Dm7", "Fm7", "Fm7", "Dm7", "Dm7", "Ebm7", "Ebm7"] 
  },
  { 
    name: "Cantaloupe Island", 
    composer: "Herbie Hancock",
    year: "1964",
    style: "Modal Jazz",
    tempo: "Medium",
    key: "Fm",
    chords: ["Fm7", "Fm7", "Db7", "Db7", "Cm7", "Cm7", "Fm7", "Fm7"] 
  },
  { 
    name: "Watermelon Man", 
    composer: "Herbie Hancock",
    year: "1962",
    style: "Funk Jazz",
    tempo: "Medium",
    key: "F",
    chords: ["F7", "F7", "F7", "F7", "Bb7", "Bb7", "F7", "F7", "Gm7", "C7", "F7", "F7"] 
  },
  { 
    name: "Chameleon", 
    composer: "Herbie Hancock",
    year: "1973",
    style: "Funk Jazz",
    tempo: "Medium",
    key: "Bb",
    chords: ["Bb7", "Bb7", "Eb7", "Eb7", "Bb7", "Bb7", "Cm7", "F7", "Bb7", "Bb7"] 
  },
  { 
    name: "Spain", 
    composer: "Chick Corea",
    year: "1971",
    style: "Latin Jazz",
    tempo: "Fast",
    key: "G",
    chords: ["GMaj7", "F#7", "Bm7", "E7", "AMaj7", "G#7", "C#m7", "F#7", "BMaj7", "A#7", "D#m7", "G#7", "C#Maj7", "F#7", "Bm7", "E7", "AMaj7", "D7", "GMaj7"] 
  },
  { 
    name: "Windows", 
    composer: "Chick Corea",
    year: "1966",
    style: "Modal Jazz",
    tempo: "Medium",
    key: "C",
    chords: ["Cm7", "Cm7", "F7", "F7", "Bbmaj7", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Fmaj7", "Bbm7b5", "Eb7", "Abmaj7", "Dbmaj7", "Gm7", "C7", "Cm7"] 
  },
  { 
    name: "Black Orpheus", 
    composer: "Luiz Bonfé",
    year: "1959",
    style: "Bossa Nova",
    tempo: "Medium",
    key: "Am",
    chords: ["Am7", "B7b9", "E7", "Am7", "Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7", "Am7", "Dm7", "G7", "CMaj7", "FMaj7", "Bm7b5", "E7", "Am7"] 
  },
  { 
    name: "Corcovado", 
    composer: "Antonio Carlos Jobim",
    year: "1960",
    style: "Bossa Nova",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "Am7", "Dm7", "G7", "CMaj7", "Am7", "Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "Desafinado", 
    composer: "Antonio Carlos Jobim",
    year: "1959",
    style: "Bossa Nova",
    tempo: "Medium",
    key: "F",
    chords: ["FMaj7", "F7", "BbMaj7", "Bb7", "Gm7", "C7", "FMaj7", "F7", "BbMaj7", "Bb7", "Gm7", "C7", "FMaj7"] 
  },
  { 
    name: "Wave", 
    composer: "Antonio Carlos Jobim",
    year: "1967",
    style: "Bossa Nova",
    tempo: "Medium",
    key: "D",
    chords: ["DMaj7", "Gm7", "C7", "FMaj7", "Bm7b5", "E7", "Am7", "A7", "DMaj7", "Gm7", "C7", "FMaj7", "Bm7b5", "E7", "Am7", "D7", "GMaj7"] 
  },
  { 
    name: "One Note Samba", 
    composer: "Antonio Carlos Jobim",
    year: "1960",
    style: "Bossa Nova",
    tempo: "Fast",
    key: "Bb",
    chords: ["BbMaj7", "C7", "Fm7", "Bb7", "EbMaj7", "F7", "Bbm7", "Eb7", "AbMaj7", "Bb7", "EbMaj7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "BbMaj7"] 
  },
  { 
    name: "Besame Mucho", 
    composer: "Consuelo Velázquez",
    year: "1940",
    style: "Bolero",
    tempo: "Slow",
    key: "Dm",
    chords: ["Dm", "Am7", "Dm", "E7", "Am", "Dm", "E7", "Am", "Dm", "A7", "Dm", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Gm7", "C7", "Dm"] 
  },
  { 
    name: "Perdido", 
    composer: "Juan Tizol",
    year: "1941",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Bb",
    chords: ["BbMaj7", "G7", "Cm7", "F7", "BbMaj7", "G7", "Cm7", "F7", "EbMaj7", "Eb7", "AbMaj7", "D7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "D7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "D7", "Gm7", "C7", "FMaj7", "Bbm7", "Eb7", "AbMaj7", "D7", "Gm7", "C7"] 
  },
  { 
    name: "In a Mellow Tone", 
    composer: "Duke Ellington",
    year: "1939",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Ab",
    chords: ["AbMaj7", "Fm7", "Bbm7", "Eb7", "AbMaj7", "Fm7", "Bbm7", "Eb7", "DbMaj7", "Db7", "GbMaj7", "C7", "Fm7", "Bb7", "Ebmaj7", "Abm7", "Db7", "GbMaj7", "C7", "Fm7", "Bb7", "Ebmaj7", "Abm7", "Db7", "GbMaj7", "C7", "Fm7", "Bb7", "Ebmaj7"] 
  },
  { 
    name: "Take The A Train", 
    composer: "Billy Strayhorn",
    year: "1941",
    style: "Jazz Standard",
    tempo: "Fast",
    key: "C",
    chords: ["C6", "D7", "Dm7", "G7", "C6", "D7", "Dm7", "G7", "FMaj7", "F7", "BbMaj7", "A7", "Dm7", "G7", "CMaj7", "A7", "Dm7", "G7", "CMaj7", "A7", "Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "Someday My Prince Will Come", 
    composer: "Frank Churchill",
    year: "1937",
    style: "Jazz Waltz",
    tempo: "Medium",
    key: "Bb",
    chords: ["BbMaj7", "Gm7", "Cm7", "F7", "BbMaj7", "Gm7", "Cm7", "F7", "EbMaj7", "Gm7", "Cm7", "F7", "BbMaj7"] 
  },
  { 
    name: "All The Things You Are", 
    composer: "Jerome Kern",
    year: "1939",
    style: "Jazz Standard",
    tempo: "Medium",
    key: "Ab",
    chords: ["Fm7", "Bbm7", "Eb7", "AbMaj7", "DbMaj7", "Dm7b5", "G7", "Cm7", "FMaj7", "Bm7b5", "E7", "Am7", "D7", "GMaj7", "C#m7b5", "F#7", "BMaj7", "Em7", "A7", "DMaj7", "G#m7b5", "C#7", "F#Maj7", "Bm7", "E7", "AMaj7", "Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "St. Thomas", 
    composer: "Sonny Rollins",
    year: "1956",
    style: "Calypso",
    tempo: "Medium",
    key: "C",
    chords: ["CMaj7", "Dm7", "G7", "CMaj7", "Em7", "A7", "Dm7", "G7", "CMaj7"] 
  },
  { 
    name: "Song for My Father", 
    composer: "Horace Silver",
    year: "1964",
    style: "Latin Jazz",
    tempo: "Medium",
    key: "Fm",
    chords: ["Fm7", "Fm7", "Eb7", "Eb7", "AbMaj7", "AbMaj7", "DbMaj7", "DbMaj7", "Gm7", "C7", "FMaj7", "Fm7"] 
  },
  { 
    name: "Blue Monk", 
    composer: "Thelonious Monk",
    year: "1947",
    style: "Blues",
    tempo: "Slow",
    key: "Bb",
    chords: ["Bb7", "Bb7", "Bb7", "Bb7", "Eb7", "Eb7", "Bb7", "Bb7", "Gm7", "C7", "Bb7", "Bb7"] 
  },
  { 
    name: "Round Midnight", 
    composer: "Thelonious Monk",
    year: "1944",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Eb",
    chords: ["EbMaj7", "Cm7b5", "F7", "Bbm7", "Eb7", "AbMaj7", "Am7b5", "D7", "Gm7", "Cm7", "F7", "Bbm7", "Eb7", "AbMaj7"] 
  },
  { 
    name: "Straight No Chaser", 
    composer: "Thelonious Monk",
    year: "1951",
    style: "Blues",
    tempo: "Medium",
    key: "Bb",
    chords: ["Bb7", "Bb7", "Bb7", "Bb7", "Eb7", "Eb7", "Bb7", "Bb7", "Gm7", "C7", "Bb7", "Bb7"] 
  },
  { 
    name: "Well You Needn't", 
    composer: "Thelonious Monk",
    year: "1944",
    style: "Bebop",
    tempo: "Fast",
    key: "F",
    chords: ["F7", "Bb7", "F7", "C7", "Bb7", "F7", "F7", "Bb7", "F7", "C7", "Bb7", "F7"] 
  },
  { 
    name: "Ruby My Dear", 
    composer: "Thelonious Monk",
    year: "1947",
    style: "Jazz Ballad",
    tempo: "Slow",
    key: "Db",
    chords: ["DbMaj7", "Ebm7", "Ab7", "DbMaj7", "Dm7b5", "G7", "Cm7", "F7", "DbMaj7", "Ebm7", "Ab7", "DbMaj7", "Dm7b5", "G7", "Cm7", "F7", "DbMaj7"] 
  },
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

// Practice levels - 基础练习等级 (与源HTML文件保持一致)
const PRACTICE_LEVELS = [
  // 单和弦音
  { id: "single-root", nameKey: "level_single_root", description: "Only practice root note" },
  { id: "single-3", nameKey: "level_single_3", description: "Only practice 3rd (major/minor)" },
  { id: "single-5", nameKey: "level_single_5", description: "Only practice 5th" },
  { id: "single-7", nameKey: "level_single_7", description: "Only practice 7th (major/minor)" },
  // 双和弦音
  { id: "double-root-3", nameKey: "level_double_root_3", description: "Root and 3rd" },
  { id: "double-root-5", nameKey: "level_double_root_5", description: "Root and 5th" },
  { id: "double-root-7", nameKey: "level_double_root_7", description: "Root and 7th" },
  { id: "double-3-5", nameKey: "level_double_3_5", description: "3rd and 5th" },
  { id: "double-3-7", nameKey: "level_double_3_7", description: "3rd and 7th" },
  { id: "double-5-7", nameKey: "level_double_5_7", description: "5th and 7th" },
  // 三和弦音
  { id: "triple-root-3-5", nameKey: "level_triple_root_3_5", description: "Triad notes" },
  { id: "triple-3-5-7", nameKey: "level_triple_3_5_7", description: "3rd, 5th, and 7th" },
  { id: "triple-random-inversion", nameKey: "level_triple_random_inversion", description: "Random inversions of triad" },
  // 四和弦音
  { id: "quad-root-3-5-7", nameKey: "level_quad_root_3_5_7", description: "Seventh chord tones" },
  { id: "quad-3-5-7-root", nameKey: "level_quad_3_5_7_root", description: "First inversion" },
  { id: "quad-5-7-root-3", nameKey: "level_quad_5_7_root_3", description: "Second inversion" },
  { id: "quad-7-root-3-5", nameKey: "level_quad_7_root_3_5", description: "Third inversion" },
  { id: "quad-random-inversion", nameKey: "level_quad_random_inversion", description: "Random inversions of seventh chord" },
  { id: "quad-root-3-5-7-root", nameKey: "level_quad_root_3_5_7_root", description: "Extended practice" },
  // 全部
  { id: "all", nameKey: "level_all", description: "All chord tones" },
]

// 旋律结构练习 - 从根音到五音
const MELODIC_STRUCTURE_R_TO_5TH = [
  { 
    id: "melodic_1", 
    nameKey: "level_melodic_1", 
    intervals: [0, 4, 7], 
    description: "1,3,5 on all chords",
    chordTypes: { major: [0, 4, 7], minor: [0, 3, 7], dominant: [0, 4, 7], diminished: [0, 3, 6], sus: [0, 5, 7] }
  },
  { 
    id: "melodic_2", 
    nameKey: "level_melodic_2", 
    intervals: [0, 7, 4], 
    description: "1,5,3 on all chords",
    chordTypes: { major: [0, 7, 4], minor: [0, 7, 3], dominant: [0, 7, 4], diminished: [0, 6, 3], sus: [0, 7, 5] }
  },
  { 
    id: "melodic_3", 
    nameKey: "level_melodic_3", 
    intervals: [7, 4, 0], 
    description: "5,3,1 on all chords",
    chordTypes: { major: [7, 4, 0], minor: [7, 3, 0], dominant: [7, 4, 0], diminished: [6, 3, 0], sus: [7, 5, 0] }
  },
  { 
    id: "melodic_4", 
    nameKey: "level_melodic_4", 
    intervals: [4, 7, 0], 
    description: "3,5,1 on all chords",
    chordTypes: { major: [4, 7, 0], minor: [3, 7, 0], dominant: [4, 7, 0], diminished: [3, 6, 0], sus: [5, 7, 0] }
  },
  { 
    id: "melodic_5", 
    nameKey: "level_melodic_5", 
    intervals: [0, 4, 7], 
    description: "Random inversions of 1,3,5",
    chordTypes: { major: [0, 4, 7], minor: [0, 3, 7], dominant: [0, 4, 7], diminished: [0, 3, 6], sus: [0, 5, 7] },
    randomInversion: true
  },
]

// 旋律结构练习 - 从五音到九音
const MELODIC_STRUCTURE_5TH_TO_9TH = [
  { 
    id: "melodic_6", 
    nameKey: "level_melodic_6", 
    intervals: [7, 9, 11, 2], 
    description: "5,6,7,2 on major/dominant | 5,7,1,2 on minor | 5,6,7,1 on diminished",
    chordTypes: { major: [7, 9, 11, 2], minor: [7, 10, 0, 2], dominant: [7, 9, 10, 2], diminished: [6, 8, 10, 0] }
  },
  { 
    id: "melodic_7", 
    nameKey: "level_melodic_7", 
    intervals: [9, 7, 2, 11], 
    description: "6,5,2,7 on major/dominant | 7,5,2,1 on minor | 6,5,1,7 on diminished",
    chordTypes: { major: [9, 7, 2, 11], minor: [10, 7, 2, 0], dominant: [9, 7, 2, 10], diminished: [8, 6, 0, 10] }
  },
  { 
    id: "melodic_8", 
    nameKey: "level_melodic_8", 
    intervals: [11, 2, 9, 7], 
    description: "7,2,6,5 on major/dominant | 1,2,7,5 on minor | 6,1,7,5 on diminished",
    chordTypes: { major: [11, 2, 9, 7], minor: [0, 2, 10, 7], dominant: [10, 2, 9, 7], diminished: [10, 0, 8, 6] }
  },
  { 
    id: "melodic_9", 
    nameKey: "level_melodic_9", 
    intervals: [2, 11, 9, 7], 
    description: "2,7,6,5 on major/dominant | 2,1,7,5 on minor | 2,7,1,6 on diminished",
    chordTypes: { major: [2, 11, 9, 7], minor: [2, 0, 10, 7], dominant: [2, 10, 9, 7], diminished: [2, 10, 0, 8] }
  },
  { 
    id: "melodic_10", 
    nameKey: "level_melodic_10", 
    intervals: [7, 9, 11, 2], 
    description: "Random inversions of 5,6,7,2 patterns",
    chordTypes: { major: [7, 9, 11, 2], minor: [7, 10, 0, 2], dominant: [7, 9, 10, 2], diminished: [6, 8, 10, 0] },
    randomInversion: true
  },
]

// Voice Led 声部连接结构
const VOICE_LED_STRUCTURES = [
  { 
    id: "voice_led_1", 
    nameKey: "level_voice_led_1", 
    intervals: [4, 2, 0, 11], 
    description: "3,2,1,7 on minor/dominant/major | 4,2,1,7 on sus | 3,2,1,6 on diminished",
    chordTypes: { major: [4, 2, 0, 11], minor: [3, 2, 0, 10], dominant: [4, 2, 0, 10], diminished: [3, 2, 0, 9], sus: [5, 2, 0, 10] }
  },
  { 
    id: "voice_led_2", 
    nameKey: "level_voice_led_2", 
    intervals: [4, 7, 11, 2], 
    description: "3,2,1,7 on minor | 3,5,7,2 on dominant | 5,1,2,3 on major | 4,5,7,2 on sus | 3,2,1,6 on diminished",
    chordTypes: { major: [7, 0, 2, 4], minor: [3, 2, 0, 10], dominant: [4, 7, 10, 2], diminished: [3, 2, 0, 9], sus: [5, 7, 10, 2] }
  },
  { 
    id: "voice_led_3", 
    nameKey: "level_voice_led_3", 
    intervals: [0, 4, 7, 11], 
    description: "1,3,5,7 on minor | 3,2,1,7 on dominant/major | 4,2,1,7 on sus | 3,2,1,6 on diminished",
    chordTypes: { major: [4, 2, 0, 11], minor: [0, 3, 7, 10], dominant: [4, 2, 0, 10], diminished: [3, 2, 0, 9], sus: [5, 2, 0, 10] }
  },
  { 
    id: "voice_led_4", 
    nameKey: "level_voice_led_4", 
    intervals: [0, 4, 7, 11], 
    description: "1,3,5,7 on minor | 3,5,7,2 on dominant | 3,2,1,7 on major | 4,5,7,2 on sus | 3,2,1,6 on diminished",
    chordTypes: { major: [4, 2, 0, 11], minor: [0, 3, 7, 10], dominant: [4, 7, 10, 2], diminished: [3, 2, 0, 9], sus: [5, 7, 10, 2] }
  },
  { 
    id: "voice_led_5", 
    nameKey: "level_voice_led_5", 
    intervals: [7, 4, 0, 11], 
    description: "5,3,1,7 on minor | 3,5,7,2 on dominant | 3,2,1,7 on major | 4,5,7,2 on sus | 3,2,1,6 on diminished",
    chordTypes: { major: [4, 2, 0, 11], minor: [7, 3, 0, 10], dominant: [4, 7, 10, 2], diminished: [3, 2, 0, 9], sus: [5, 7, 10, 2] }
  },
]

// 经过音技巧练习
const PASSING_TONE_TECHNIQUES = [
  { 
    id: "passing_1", 
    nameKey: "level_passing_1", 
    intervals: [0, 1, 2], 
    description: "1,b2,2 - 半音经过音练习",
    type: "chromatic"
  },
  { 
    id: "passing_2", 
    nameKey: "level_passing_2", 
    intervals: [0, 2, 4], 
    description: "1,2,3 - 全音经过音练习",
    type: "diatonic"
  },
  { 
    id: "passing_3", 
    nameKey: "level_passing_3", 
    intervals: [0, 2, 4, 5], 
    description: "1,2,3,4 - 三音经过音练习",
    type: "diatonic"
  },
  { 
    id: "passing_4", 
    nameKey: "level_passing_4", 
    intervals: [0, 1, 2, 4], 
    description: "1,b2,2,3 - 混合经过音练习",
    type: "mixed"
  },
  { 
    id: "passing_5", 
    nameKey: "level_passing_5", 
    intervals: [0, 11, 1, 0], 
    description: "1,7,b2,1 - 环绕音练习",
    type: "enclosure"
  },
]

// 所有练习等级合集
const ALL_PRACTICE_LEVELS = [
  ...PRACTICE_LEVELS.map(l => ({ ...l, category: "basic" })),
  ...MELODIC_STRUCTURE_R_TO_5TH.map(l => ({ ...l, category: "melodic_r5" })),
  ...MELODIC_STRUCTURE_5TH_TO_9TH.map(l => ({ ...l, category: "melodic_59" })),
  ...VOICE_LED_STRUCTURES.map(l => ({ ...l, category: "voice_led" })),
  ...PASSING_TONE_TECHNIQUES.map(l => ({ ...l, category: "passing" })),
]

// 和弦练习等级
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

interface YINResult {
  frequency: number | null
  probability: number
  clarity: number
}

// 与原文件完全相同的 Pitchfinder.YIN 实现
function PitchfinderYIN(config: { threshold?: number; probabilityCliff?: number } = {}) {
  const threshold = config.threshold ?? 0.15;
  const probabilityCliff = config.probabilityCliff ?? 0.1;

  return function(float32AudioBuffer: Float32Array, sampleRate: number = 48000): { frequency: number | null; probability: number } | null {
    const buffer = float32AudioBuffer;
    const N = buffer.length;
    const halfN = Math.floor(N / 2);
    const d = new Float32Array(halfN);

    // 步骤1: 差分函数
    for (let tau = 0; tau < halfN; tau++) {
      let sum = 0;
      for (let i = 0; i < halfN; i++) {
        const diff = buffer[i] - buffer[i + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }

    // 步骤2: 累积平均归一化
    let runningSum = 0;
    d[0] = 1;
    for (let tau = 1; tau < halfN; tau++) {
      runningSum += d[tau];
      d[tau] = d[tau] * tau / runningSum;
    }

    // 步骤3: 阈值检测
    let tauEstimate = -1;
    for (let tau = 1; tau < halfN; tau++) {
      if (d[tau] < threshold) {
        while (tau + 1 < halfN && d[tau + 1] < d[tau]) tau++;
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate === -1) return null;

    // 步骤4: 抛物线插值提高精度
    let betterTau = tauEstimate;
    if (tauEstimate > 0 && tauEstimate < halfN - 1) {
      const s0 = d[tauEstimate - 1], s1 = d[tauEstimate], s2 = d[tauEstimate + 1];
      const denom = (s0 + s2 - 2 * s1);
      if (denom !== 0) {
        const delta = (s0 - s2) / (2 * denom);
        betterTau = tauEstimate + delta;
      }
    }

    const frequency = sampleRate / betterTau;
    const probability = Math.max(0, Math.min(1, 1 - d[tauEstimate]));

    if (probability < probabilityCliff) return null;

    return { frequency, probability };
  };
}

// 计算 RMS (Root Mean Square) 能量
function calculateRMS(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

// 频率转音符名（与参考文件一致）- 使用#符号以匹配NOTES数组
function frequencyToNoteName(frequency: number): string {
  // 防止无效频率
  if (!frequency || frequency <= 0 || !isFinite(frequency)) {
    return ''
  }

  // A4 = 440Hz
  const A4 = 440
  const semitones = Math.round(12 * Math.log2(frequency / A4))
  let noteIndex = (9 + semitones) % 12

  // 确保noteIndex为正数
  if (noteIndex < 0) {
    noteIndex = noteIndex + 12
  }

  // 使用升号表示法 - 使用#符号以匹配NOTES数组
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return noteNames[noteIndex]
}

// 计算音分数(cents)
function calculateCents(detectedFreq: number, targetFreq: number): number {
  const cents = 1200 * Math.log2(detectedFreq / targetFreq)
  const centsMod = Math.abs(cents) % 1200
  return centsMod > 600 ? 1200 - centsMod : centsMod
}

// 检查两个音符是否为等音（如 C# = Db） 与原文件相同
function isEquivalentNote(note1: string, note2: string): boolean {
  if (note1 === note2) return true

  // 分离音符名和八度
  const extractNoteName = (fullNote: string): string => {
    const match = fullNote.match(/^([CDEFGAB][#♯b♭]?\d*)/)
    return match ? match[1] : fullNote
  }

  const note1Name = extractNoteName(note1)
  const note2Name = extractNoteName(note2)

  // 定义等价的音符对
  const equivalentPairs = [
    ['C#', 'Db'], ['D#', 'Eb'], ['F#', 'Gb'],
    ['G#', 'Ab'], ['A#', 'Bb'],
    ['C#', 'Db'], ['D#', 'Eb'], ['F#', 'Gb'],
    ['G#', 'Ab'], ['A#', 'Bb']
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
  const idx = NOTES.indexOf(note)
  if (idx !== -1) return idx
  return NOTES_FLAT.indexOf(note)
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
  
  // Extract root note
  const rootMatch = chord.match(/^([A-G][#b]?)/)
  if (!rootMatch) return chord
  
  const root = rootMatch[1]
  const rootIndex = getNoteIndex(root)
  if (rootIndex === -1) return chord
  
  const newRootIndex = (rootIndex + diff) % 12
  const newRoot = NOTES[newRootIndex]
  
  return chord.replace(/^([A-G][#b]?)/, newRoot)
}

function parseChord(chord: string): { root: string; type: string; bass?: string } {
  const match = chord.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return { root: "C", type: "Major" }
  
  const root = match[1]
  const rest = match[2]
  
  // Check for bass note
  const bassMatch = rest.match(/\/([A-G][#b]?)$/)
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
  
  let result = `${chord.root}${typeSymbol}`
  if (chord.bass) {
    result += `/${chord.bass}`
  }
  return result
}

// 获取和弦的音级（如 1, 3, 5, b7）
function getChordDegrees(type: string, level?: string): string[] {
  const normalizedType = normalizeChordType(type)
  const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === type || ct.symbol === type)
  if (!chordType) return ["1"]
  
  // 如果指定了练习等级，使用等级特定的音级
  if (level && level !== 'all') {
    return getIntervalsForLevel(level, type)
  }
  
  // 特殊处理和弦类型
  if (type === 'dim7' || type === 'diminished7') {
    // 减七和弦: 1, b3, b5, bb7
    return ["1", "b3", "b5", "bb7"]
  }
  
  if (type === 'm7b5' || type === 'half-diminished') {
    // 半减七和弦：1, b3, b5, b7
    return ["1", "b3", "b5", "b7"]
  }
  
  // 扩展和弦的特殊音级映射
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
    return semitonesToDegree(interval)
  })
}

// 根据练习等级获取音级 - 与源HTML文件保持一致
function getIntervalsForLevel(level: string, chordType?: string): string[] {
  let intervals: string[] = []
  
  // 获取和弦类型的实际音级
  const getChordTypeIntervals = (type?: string): string[] => {
    if (!type) return ['1', '3', '5', '7']
    const normalizedType = normalizeChordType(type)
    const ct = CHORD_TYPES.find(c => c.name === normalizedType || c.symbol === normalizedType || c.name === type || c.symbol === type)
    if (!ct) return ['1', '3', '5', '7']
    return ct.intervals.map(i => semitonesToDegree(i))
  }
  
  const chordIntervals = getChordTypeIntervals(chordType)
  
  // 辅助函数：查找包含特定数字的音级
  const findInterval = (num: string): string | undefined => {
    return chordIntervals.find(i => i.includes(num))
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

// 将半音数转换为音级表示
function semitonesToDegree(semitones: number): string {
  const degreeMap: Record<number, string> = {
    0: "1",
    1: "b2",
    2: "2",
    3: "b3",
    4: "3",
    5: "4",
    6: "b5",
    7: "5",
    8: "#5",
    9: "6",
    10: "b7",
    11: "7",
    12: "8",
    13: "b9",
    14: "9",
    15: "#9",
    16: "10",
    17: "11",
    18: "#11",
    19: "12",
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

  return semitonesToDegree(interval)
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
    '6': 9, '#6': 10, 'b7': 10, '7': 11,
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

// ==================== 调音器函数 ====================
// 从频率计算音符（带音分偏差）
function frequencyToNote(frequency: number, referenceA4: number = 440): { note: string; cents: number; octave: number } {
  if (frequency <= 0) return { note: "-", cents: 0, octave: 0 }

  // 计算与A4的半音差
  const semitonesFromA4 = 12 * Math.log2(frequency / referenceA4)
  const roundedSemitones = Math.round(semitonesFromA4)
  const cents = Math.round((semitonesFromA4 - roundedSemitones) * 100)

  // 计算音符索引和八度
  const noteIndex = ((roundedSemitones + 9) % 12 + 12) % 12 // A=0, A#=1, B=2, C=3...
  const octave = 4 + Math.floor((roundedSemitones + 9) / 12)

  // 使用#符号以匹配NOTES数组
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  return {
    note: noteNames[noteIndex],
    cents: cents,
    octave: octave
  }
}

// YIN算法检测基频（完全按照原HTML文件实现）
function YINPitchDetection(float32AudioBuffer: Float32Array, sampleRate: number, threshold: number = 0.15, probabilityCliff: number = 0.1): { frequency: number; probability: number } | null {
  const buffer = float32AudioBuffer
  const N = buffer.length
  const halfN = Math.floor(N / 2)
  const d = new Float32Array(halfN)

  // 步骤1: 差分函数
  for (let tau = 0; tau < halfN; tau++) {
    let sum = 0
    for (let i = 0; i < halfN; i++) {
      const diff = buffer[i] - buffer[i + tau]
      sum += diff * diff
    }
    d[tau] = sum
  }

  // 步骤2: 累积平均归一化
  let runningSum = 0
  d[0] = 1
  for (let tau = 1; tau < halfN; tau++) {
    runningSum += d[tau]
    d[tau] = d[tau] * tau / runningSum
  }

  // 步骤3: 阈值检测
  let tauEstimate = -1
  for (let tau = 1; tau < halfN; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 < halfN && d[tau + 1] < d[tau]) tau++
      tauEstimate = tau
      break
    }
  }

  if (tauEstimate === -1) return null

  // 步骤4: 抛物线插值提高精度
  let betterTau = tauEstimate
  if (tauEstimate > 0 && tauEstimate < halfN - 1) {
    const s0 = d[tauEstimate - 1], s1 = d[tauEstimate], s2 = d[tauEstimate + 1]
    const denom = (s0 + s2 - 2 * s1)
    if (denom !== 0) {
      const delta = (s0 - s2) / (2 * denom)
      betterTau = tauEstimate + delta
    }
  }

  const frequency = sampleRate / betterTau
  const probability = Math.max(0, Math.min(1, 1 - d[tauEstimate]))

  if (probability < probabilityCliff) return null

  return { frequency, probability }
}

// Pitchfinder对象 - 与原HTML完全一致
const Pitchfinder = {
  YIN: function(config: { threshold?: number; probabilityCliff?: number } = {}) {
    const threshold = config.threshold || 0.15
    const probabilityCliff = config.probabilityCliff || 0.1
    return function(float32AudioBuffer: Float32Array) {
      return YINPitchDetection(float32AudioBuffer, 48000, threshold, probabilityCliff)
    }
  }
}

// YINDetector 函数 - 与原HTML文件完全一致
function YINDetector(config: { threshold?: number; probabilityCliff?: number } = {}) {
  const threshold = config.threshold || 0.15
  const probabilityCliff = config.probabilityCliff || 0.1
  return function(float32AudioBuffer: Float32Array) {
    return YINPitchDetection(float32AudioBuffer, 48000, threshold, probabilityCliff)
  }
}

// ==================== 主组件 ====================
export default function FretMasterPage() {
  // 语言状态
  const [language, setLanguage] = useState<'zh-CN' | 'en'>('zh-CN')
  const t = useCallback((key: string) => {
    return TRANSLATIONS[language][key as keyof typeof TRANSLATIONS['zh-CN']] || key
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
    { id: "practice", label: t('nav_practice'), Icon: Target, shortLabel: '找音' },
    { id: "interval", label: t('nav_interval'), Icon: Activity, shortLabel: '音程' },
    { id: "chord_exercise", label: t('nav_chord_exercise'), Icon: Guitar, shortLabel: '和弦' },
    { id: "chord", label: t('nav_chord'), Icon: ListMusic, shortLabel: '转换' },
    { id: "scale", label: t('nav_scale'), Icon: Music, shortLabel: '音阶' },
    { id: "stats", label: t('nav_stats'), Icon: BarChart3, shortLabel: '统计' },
  ], [t])

  // 主题状态
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  // 应用主题
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
  }, [theme])

  // ==================== Zustand Store 状态 ====================
  const store = useAppStore()
  const audioSettings = useAudioSettings()
  const practiceSettings = usePracticeSettings()
  const metronomeSettings = useMetronomeSettings()
  const storeScore = useScore()
  const storeIsPlaying = useIsPlaying()
  const storeVersion = useVersion()
  
  // 核心状态 - 从 Store 获取
  const activeTab = store.activeTab
  const setActiveTab = store.setActiveTab
  const sidebarCollapsed = store.sidebarCollapsed
  const setSidebarCollapsed = store.toggleSidebar
  const settingsOpen = store.settingsOpen
  const setSettingsOpen = store.setSettingsOpen
  const fullscreenMode = store.fullscreenMode
  const setFullscreenMode = store.toggleFullscreen
  const displayScale = useDisplayScale()
  const setDisplayScale = store.setDisplayScale
  
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
  const [highlightedTargetPosition, setHighlightedTargetPosition] = useState<{stringIndex: number, fret: number} | null>(null) // 高亮的目标位置

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
  const [rootNote, setRootNote] = useState("C")
  const [selectedIntervals, setSelectedIntervals] = useState<number[]>([0, 7])
  const [intervalMode, setIntervalMode] = useState<"single" | "interval">("interval")
  const [intervalRootMode, setIntervalRootMode] = useState<"fixed" | "random">("fixed")
  const [findRootFirst, setFindRootFirst] = useState(false)
  const [currentIntervalTarget, setCurrentIntervalTarget] = useState<string | null>(null)
  const [intervalPracticeStep, setIntervalPracticeStep] = useState<"root" | "interval">("root")
  const [currentIntervalExercise, setCurrentIntervalExercise] = useState<{
    rootNote: string;
    interval: { name: string; symbol: string; semitones: number };
    targetNote: string;
    allIntervals: { name: string; symbol: string; semitones: number }[];
    currentIntervalDisplay: string;
    completedIntervals: string[];
    answered: boolean;
  } | null>(null)
  
  // 和弦进行状态
  const [selectedSong, setSelectedSong] = useState(SONG_PROGRESSIONS[0])
  const [customChords, setCustomChords] = useState<{ root: string; type: string; bass?: string }[]>([])
  const [currentChordIndex, setCurrentChordIndex] = useState(0)
  const [chordPlayOrder, setChordPlayOrder] = useState<"asc" | "desc" | "random">("asc")
  const [practiceLevel, setPracticeLevel] = useState("all")
  const [progressionKey, setProgressionKey] = useState(SONG_PROGRESSIONS[0]?.key || "C")
  const [irealInput, setIrealInput] = useState("")
  const [newChordRoot, setNewChordRoot] = useState("C")
  const [newChordType, setNewChordType] = useState("Major")
  const [newChordBass, setNewChordBass] = useState<string | undefined>(undefined)
  const [customChordName, setCustomChordName] = useState("")
  const [showCustomChordDialog, setShowCustomChordDialog] = useState(false)
  
  // 音阶状态
  const [scaleKey, setScaleKey] = useState("C")
  const [isScaleKeyRandom, setIsScaleKeyRandom] = useState(false)
  const [selectedScaleCategory, setSelectedScaleCategory] = useState<keyof typeof SCALE_MODES>("basic")
  const [selectedScale, setSelectedScale] = useState(SCALE_MODES.basic[0])
  const [selectedScales, setSelectedScales] = useState<typeof SCALE_MODES.basic>([SCALE_MODES.basic[0]])
  const [scaleDirection, setScaleDirection] = useState<"up" | "down" | "random">("up")
  const [scaleCurrentNote, setScaleCurrentNote] = useState(0)
  const [showScaleFretboard, setShowScaleFretboard] = useState(false)
  const [scalePracticeSequence, setScalePracticeSequence] = useState<string>("1to1")
  const [scaleExerciseSequence, setScaleExerciseSequence] = useState<string[]>([])
  const [scaleExerciseCurrentStep, setScaleExerciseCurrentStep] = useState(0)
  const [showScaleStructure, setShowScaleStructure] = useState(false)
  const [showScaleKeyboard, setShowScaleKeyboard] = useState(false)
  const [nextScaleExerciseInfo, setNextScaleExerciseInfo] = useState<{key: string, scaleName: string, sequence: string[]} | null>(null)
  
  // 和弦转换练习状态
  const [showChordFretboard, setShowChordFretboard] = useState(false)
  const [showChordStructure, setShowChordStructure] = useState(false)
  const [nextChordInfo, setNextChordInfo] = useState<{index: number, root: string, type: string, bass?: string, degrees: string[]} | null>(null)
  const [chordDegreeCurrentStep, setChordDegreeCurrentStep] = useState(0)

  // 和弦练习状态
  const [chordExerciseRoot, setChordExerciseRoot] = useState<string>("C")
  const [chordExerciseTypes, setChordExerciseTypes] = useState<string[]>(["Major"])
  const [chordExerciseLevel, setChordExerciseLevel] = useState<string>("root-third-fifth")
  const [chordExerciseOrder, setChordExerciseOrder] = useState<"asc" | "desc" | "random">("asc")
  const [chordExerciseBass, setChordExerciseBass] = useState<string>("root")
  const [showChordExerciseFretboard, setShowChordExerciseFretboard] = useState(false)
  const [chordExerciseCurrentStep, setChordExerciseCurrentStep] = useState(0)
  const [chordExerciseSequence, setChordExerciseSequence] = useState<string[]>([])
  const [chordExerciseTargetChord, setChordExerciseTargetChord] = useState<{root: string, type: string} | null>(null)
  const [chordExerciseIsAnswered, setChordExerciseIsAnswered] = useState(false)
  const [nextChordExerciseInfo, setNextChordExerciseInfo] = useState<{root: string, type: string, sequence: string[]} | null>(null)
  const [showChordExerciseStructure, setShowChordExerciseStructure] = useState(false)

  // 正确答案反馈状态
  const [showCorrectFeedback, setShowCorrectFeedback] = useState(false)
  const [correctFeedbackNote, setCorrectFeedbackNote] = useState<string | null>(null)

  // 音程练习状态
  const [showIntervalFretboard, setShowIntervalFretboard] = useState(false)
  const [showIntervalKeyboard, setShowIntervalKeyboard] = useState(false)

  // 和弦练习状态
  const [showChordExerciseKeyboard, setShowChordExerciseKeyboard] = useState(false)

  // 和弦转换练习状态
  const [showChordKeyboard, setShowChordKeyboard] = useState(false)

  // 乐曲选择弹窗状态
  const [showSongSelector, setShowSongSelector] = useState(false)
  const [songSearchQuery, setSongSearchQuery] = useState("")
  const [songSortBy, setSongSortBy] = useState<"title-asc" | "title-desc" | "style-asc" | "style-desc" | "composer-asc" | "composer-desc" | "year-asc" | "year-desc">("title-asc")
  const [selectedSongInfo, setSelectedSongInfo] = useState<typeof SONG_PROGRESSIONS[0] | null>(null)
  const [showSongInfoDialog, setShowSongInfoDialog] = useState(false)

  // 缓存歌曲分组结果 - 避免每次渲染重新计算
  const groupedSongs = useMemo(() => 
    filterAndGroupSongs(SONG_PROGRESSIONS, songSearchQuery, songSortBy),
    [songSearchQuery, songSortBy]
  )

  // 练习等级选择弹窗状态
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
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
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
  const [audioInitializing, setAudioInitializing] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  
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
  const [chordScaleDisplay, setChordScaleDisplay] = useState<'chinese' | 'english' | 'english_short' | 'jazz'>('chinese')

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
  
  // 状态refs - 用于音高检测回调中获取最新状态
  const isPlayingRef = useRef(isPlaying)
  const activeTabRef = useRef(activeTab)
  const sensitivityRef = useRef(sensitivity)
  const confidenceThresholdRef = useRef(confidenceThreshold)
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
  const nextChordInfoRef = useRef(nextChordInfo)
  const getTransposedChordsRef = useRef<(() => { root: string; type: string }[]) | null>(null)

  // ==================== 效果 ====================
  
  // 从localStorage加载设置
  useEffect(() => {
    const savedSettings = localStorage.getItem('fretmaster-settings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        setLanguage(settings.language || 'zh-CN')
        setTheme(settings.theme || 'dark')
        setPracticeTime(settings.practiceTime || 60)
        setFretCount(settings.fretCount || 15)
        setMetronomeBpm(settings.metronomeBpm || 80)
        setInputGain(settings.inputGain || 1)
        setCooldownEnabled(settings.cooldownEnabled || false)
        setCooldownDuration(settings.cooldownDuration || 1000)
        setConfidenceThreshold(settings.confidenceThreshold || 0.8)
        setSensitivity(settings.sensitivity || 0.5)
        setChordScaleDisplay(settings.chordScaleDisplay || 'chinese')
      } catch (e) {
        console.error('Failed to load settings:', e)
      }
    }
  }, [])

  // 更新状态refs - 确保音高检测回调中能获取最新状态（合并为一个useEffect减少重渲染）
  useEffect(() => {
    isPlayingRef.current = isPlaying
    activeTabRef.current = activeTab
    sensitivityRef.current = sensitivity
    confidenceThresholdRef.current = confidenceThreshold
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
    nextChordInfoRef.current = nextChordInfo
  }, [isPlaying, activeTab, sensitivity, confidenceThreshold, targetNote, scaleKey, 
      scaleExerciseSequence, scaleExerciseCurrentStep, chordExerciseTargetChord, 
      chordExerciseSequence, chordExerciseCurrentStep, currentIntervalExercise, 
      currentChordIndex, chordDegreeCurrentStep, practiceLevel, findRootFirst, nextChordInfo])

  // 从服务器加载统计数据
  useEffect(() => {
    const loadStatsFromServer = async () => {
      try {
        // 从服务器获取所有练习记录
        const serverStats = await getAllPracticeStats()
        
        // 将服务器数据转换为本地格式
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
        
        // 练习类型映射
        const typeMapping: Record<string, PracticeType> = {
          '音高识别': 'pitch_finding',
          '音阶练习': 'scale',
          '和弦练习': 'chord_exercise',
          '音程练习': 'interval',
          '和弦进行': 'chord_progression'
        }
        
        // 处理服务器返回的记录
        serverStats.forEach((record: ServerPracticeStats) => {
          const date = record.created_at ? record.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
          const type = typeMapping[record.exercise_type] || 'pitch_finding'
          const detailName = record.notes?.replace('练习项目: ', '') || record.exercise_type
          
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
        
        // 只保留最近30天的数据
        newStats.daily = newStats.daily
          .filter(d => {
            const date = new Date(d.date)
            const ninetyDaysAgo = new Date()
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
            return date >= ninetyDaysAgo
          })
          .sort((a, b) => b.date.localeCompare(a.date))
        
        setPracticeStats(newStats)
        
        // 同时保存到localStorage作为备份
        localStorage.setItem('fretmaster-stats', JSON.stringify(newStats))
      } catch (e) {
        console.error('Failed to load stats from server:', e)
        // 如果服务器获取失败，尝试从localStorage加载
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
    
    loadStatsFromServer()
  }, [])

  // 保存统计数据到localStorage
  const savePracticeStats = useCallback((stats: PracticeStats) => {
    localStorage.setItem('fretmaster-stats', JSON.stringify(stats))
    setPracticeStats(stats)
  }, [])

  // 记录练习统计
  const recordPractice = useCallback((type: PracticeType, detailName: string) => {
    const today = new Date().toISOString().split('T')[0]
    
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
      
      // 只保留最近30天的数据
      newStats.daily = newStats.daily
        .filter(d => {
          const date = new Date(d.date)
          const ninetyDaysAgo = new Date()
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
          return date >= ninetyDaysAgo
        })
        .sort((a, b) => b.date.localeCompare(a.date))
      
      // 保存到localStorage
      localStorage.setItem('fretmaster-stats', JSON.stringify(newStats))
      
      // 同时保存到服务器（SQLite数据库）
      const typeNames: Record<PracticeType, string> = {
        pitch_finding: '音高识别',
        scale: '音阶练习',
        chord_exercise: '和弦练习',
        interval: '音程练习',
        chord_progression: '和弦进行'
      }
      
      // 异步保存到服务器，不阻塞UI
      saveToServer({
        exercise_type: typeNames[type] || detailName,
        score: 100, // 练习完成得满分
        duration: 60, // 默认练习时长1分钟
        accuracy: 1.0, // 练习完成准确率100%
        notes: `练习项目: ${detailName}`
      }).catch(err => console.error('保存到服务器失败:', err))
      
      return newStats
    })
  }, [])

  // 获取指定时间范围的统计数据
  const getStatsByTimeRange = useCallback((range: StatsTimeRange): { count: number; byType: Record<PracticeType, number>; byDetail: Record<PracticeType, PracticeDetail[]> } => {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    
    let startDate: Date
    switch (range) {
      case 'today':
        startDate = new Date(today)
        break
      case 'week':
        startDate = new Date()
        startDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate = new Date()
        startDate.setMonth(now.getMonth() - 1)
        break
      case 'total':
      default:
        return practiceStats.total
    }
    
    const filtered = practiceStats.daily.filter(d => new Date(d.date) >= startDate)
    
    const result = {
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
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedAudioDevice 
          ? { 
              deviceId: { exact: selectedAudioDevice },
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

      // 创建 AudioContext - 与原HTML文件一致，固定48000采样率
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
      })
      tunerAudioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      
      // 创建增益节点
      const gainNode = audioContext.createGain()
      gainNode.gain.value = inputGain
      tunerGainNodeRef.current = gainNode
      
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 4096  // 与原HTML文件一致
      tunerAnalyserRef.current = analyser

      // 连接音频链路：source -> gain -> analyser
      source.connect(gainNode)
      gainNode.connect(analyser)

      // 清空历史记录
      tunerHistoryRef.current = []
      
      setTunerActive(true)
      toast.success(t('tuner_start'))

      // 使用 ref 来跟踪调音器状态，避免闭包问题
      let isActive = true
      
      // 开始检测循环
      const detectPitch = () => {
        if (!isActive || !analyser || !audioContext) return

        const buffer = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(buffer)

        // 计算 RMS 能量，过滤静音 - 与原HTML文件一致
        const rms = calculateRMS(buffer)
        
        if (rms < 0.002) {
          // 静音时保持最后状态或显示默认
          tunerAnimationRef.current = requestAnimationFrame(detectPitch)
          return
        }

        // 使用基本YIN算法（与原文件一致，固定48000采样率）
        const yinResult = YINPitchDetection(buffer, 48000, 0.1, 0.1)

        if (yinResult && yinResult.frequency > 0 && yinResult.probability > confidenceThreshold) {
          const noteName = frequencyToNoteName(yinResult.frequency)
          const result = frequencyToNote(yinResult.frequency, referenceFrequency)
          
          // 添加到历史记录进行平滑处理
          tunerHistoryRef.current.push({
            frequency: yinResult.frequency,
            note: noteName || "-",
            cents: result.cents
          })
          
          // 保留最近5个检测结果
          if (tunerHistoryRef.current.length > 5) {
            tunerHistoryRef.current.shift()
          }
          
          // 使用加权平均进行平滑
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
            // 历史记录不足时直接显示
            setDetectedNote(noteName || "-")
            setDetectedFrequency(Math.round(yinResult.frequency))
            setCents(result.cents)
          }
        }

        tunerAnimationRef.current = requestAnimationFrame(detectPitch)
      }

      tunerAnimationRef.current = requestAnimationFrame(detectPitch)
      
      // 返回停止函数
      return () => {
        isActive = false
      }
    } catch (err) {
      console.error('Failed to start tuner:', err)
      toast.error(t('tuner_need_mic'))
    }
  }, [t, referenceFrequency, selectedAudioDevice, inputGain, confidenceThreshold])

  // 停止调音器
  const stopTuner = useCallback(() => {
    if (tunerAnimationRef.current) {
      cancelAnimationFrame(tunerAnimationRef.current)
      tunerAnimationRef.current = null
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

  // 保存设置到localStorage
  const saveSettings = useCallback(() => {
    const settings = {
      language,
      theme,
      practiceTime,
      fretCount,
      metronomeBpm,
      inputGain,
      cooldownEnabled,
      cooldownDuration,
      confidenceThreshold,
      sensitivity,
      chordScaleDisplay,
    }
    localStorage.setItem('fretmaster-settings', JSON.stringify(settings))
    toast.success(t('save_success'))
  }, [language, theme, practiceTime, fretCount, metronomeBpm, inputGain, cooldownEnabled, cooldownDuration, confidenceThreshold, sensitivity, chordScaleDisplay, t])

  // 重置设置
  const resetSettings = useCallback(() => {
    setLanguage('zh-CN')
    setTheme('dark')
    setPracticeTime(60)
    setFretCount(15)
    setMetronomeBpm(80)
    setInputGain(1)
    setCooldownEnabled(false)
    setCooldownDuration(1000)
    setConfidenceThreshold(0.8)
    setSensitivity(0.5)
    localStorage.removeItem('fretmaster-settings')
    toast.success(t('reset_settings_hint'))
  }, [t])

  // 导出设置
  const exportSettings = useCallback(() => {
    const settings = {
      language,
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
  }, [language, practiceTime, fretCount, metronomeBpm, inputGain, cooldownEnabled, cooldownDuration, confidenceThreshold, sensitivity, customChords, t])

  // 导入设置
  const importSettings = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string)
        setLanguage(settings.language || 'zh-CN')
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

  // 计时器效果
  useEffect(() => {
    if (isPlaying && practiceTime > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsPlaying(false)
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

  // 节拍器效果
  useEffect(() => {
    if (metronomeEnabled && isPlaying) {
      const interval = 60000 / metronomeBpm
      metronomeRef.current = setInterval(() => {
        if (metronomeSound) {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
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
    }
    return () => {
      if (metronomeRef.current) clearInterval(metronomeRef.current)
    }
  }, [metronomeEnabled, isPlaying, metronomeBpm, metronomeSound, metronomeFlash])

  // 获取音频设备
  // 音频设备枚举函数 - 使用 ref 确保 devicechange 事件处理器始终访问最新状态
  const enumerateAudioDevices = useCallback(async (showNotification = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId)
      logger.debug('枚举到的音频输入设备:', audioInputs.length, audioInputs.map(d => d.label || '未命名设备'))
      // 检查设备列表是否发生变化
      const currentDeviceIds = audioDevices.map(d => d.deviceId).sort().join(',')
      const newDeviceIds = audioInputs.map(d => d.deviceId).sort().join(',')
      const hasChanged = currentDeviceIds !== newDeviceIds
      
      if (hasChanged || audioDevices.length === 0) {
        setAudioDevices(audioInputs)
        
        // 如果当前选中的设备不存在了，自动选择第一个可用设备
        if (audioInputs.length > 0) {
          const currentDeviceExists = audioInputs.some(d => d.deviceId === selectedAudioDevice)
          if (!selectedAudioDevice || !currentDeviceExists) {
            setSelectedAudioDevice(audioInputs[0].deviceId)
            logger.debug('自动选择设备:', audioInputs[0].label || audioInputs[0].deviceId)
          }
        }
        
        // 显示设备变化提示
        if (showNotification && hasChanged) {
          const addedCount = audioInputs.filter(d => !audioDevices.some(old => old.deviceId === d.deviceId)).length
          const removedCount = audioDevices.filter(d => !audioInputs.some(new_ => new_.deviceId === d.deviceId)).length
          
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
  }, [audioDevices, selectedAudioDevice])

  // 初始加载和监听设备变化
  useEffect(() => {
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
    const handleDeviceChange = async () => {
      logger.debug('🔄 音频设备发生变化，重新枚举设备...')
      await enumerateAudioDevices(true)
    }
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 当设置面板打开时，刷新设备列表
  useEffect(() => {
    if (settingsOpen && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      // 刷新设备列表
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
    logger.debug('startAudioInput: 开始初始化音频...')
    setAudioInitializing(true)
    setAudioError(null)
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        console.error('startAudioInput: 浏览器不支持 mediaDevices')
        const errorMsg = language === 'zh-CN' 
          ? '浏览器不支持音频输入，请使用 HTTPS 或更换浏览器（Chrome/Firefox/Edge）'
          : 'Browser does not support audio input. Please use HTTPS or try Chrome/Firefox/Edge'
        toast.error(errorMsg)
        setAudioError(errorMsg)
        throw new Error(errorMsg)
      }
      // 音频约束 - 与原HTML文件一致
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
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
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
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
      let useWorklet = false
      logger.debug('startAudioInput: 检查 AudioWorklet 支持...', 'useAudioWorklet:', useAudioWorklet, 'ctx.audioWorklet:', !!ctx.audioWorklet)
      if (useAudioWorklet && ctx.audioWorklet) {
        try {
          // 加载 AudioWorklet 处理器
          logger.debug('startAudioInput: 正在加载 AudioWorklet 模块...')
          await ctx.audioWorklet.addModule('/fretmaster/js/audio-worklet-processor.js')
          logger.debug('startAudioInput: AudioWorklet 模块加载成功')
          
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
          
          // 连接音频节点
          source.connect(gainNode)
          gainNode.connect(analyser)
          analyser.connect(workletNode)
          workletNode.connect(ctx.destination)
          
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
        scriptProcessor.connect(ctx.destination)
        
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
    
    // 500ms后隐藏反馈
    setTimeout(() => {
      setShowCorrectFeedback(false)
      setCorrectFeedbackNote(null)
    }, 500)
  }, [])

  // 音高匹配处理（供 AudioWorklet 或 ScriptProcessorNode 共用）
  const processPitchMatch = useCallback((frequency: number, detectedNote: string, probability: number) => {
    const currentActiveTab = activeTabRef.current
    const currentSensitivity = sensitivityRef.current || 0.5
    const currentConfidenceThreshold = confidenceThresholdRef.current || 0.8
    
    // 音符到半音映射
    const noteToSemitones: Record<string, number> = {
      "C": 0, "C#": 1, "Cb": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, 
      "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11
    }
    
    // 音级到半音映射
    const intervalToSemitones: Record<string, number> = {
      "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8, 
      "b6": 8, "6": 9, "#6": 9, "b7": 10, "7": 11, "b9": 1, "9": 2, "#9": 3, "11": 5, "#11": 6, "b13": 8, "13": 9
    }
    
    if (currentActiveTab === 'practice') {
      // 找音练习
      const currentTargetNote = targetNoteRef.current
      if (!currentTargetNote) return
      
      const targetSemitone = noteToSemitones[currentTargetNote] || 0
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
      
      const cents = 1200 * Math.log2(frequency / targetFrequency)
      const centsMod = Math.abs(cents) % 1200
      const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
      
      const baseThreshold = frequency < 110 ? 35 : 25
      const matchThreshold = baseThreshold * (2 - currentSensitivity)
      
      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('找音练习匹配成功:', detectedNote, '音分差:', adjustedCents.toFixed(1))
        triggerCorrectFeedback(detectedNote)
        setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        if (generateNewTargetRef.current) {
          generateNewTargetRef.current()
        }
      }
    } else if (currentActiveTab === 'interval') {
      // 音程练习
      const exercise = currentIntervalExerciseRef.current
      if (!exercise || exercise.answered) return
      
      // 获取当前需要匹配的音程符号
      const currentIntervalSymbol = exercise.interval?.symbol || ''
      const rootNoteValue = exercise.rootNote
      
      // 支持复合音程（如 "b3_5" 表示小三和弦）
      const intervals = currentIntervalSymbol.split('_')
      let matchedInterval: string | null = null
      let minCents = Infinity
      
      for (const interval of intervals) {
        const intervalSemitone = intervalToSemitones[interval]
        if (intervalSemitone === undefined) continue
        
        const rootValue = noteToSemitones[rootNoteValue] || 0
        const targetSemitone = (rootValue + intervalSemitone) % 12
        const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
        
        const cents = 1200 * Math.log2(frequency / targetFrequency)
        const centsMod = Math.abs(cents) % 1200
        const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
        
        const baseThreshold = frequency < 110 ? 35 : interval === '1' ? 25 : 15
        const matchThreshold = baseThreshold * (2 - currentSensitivity)
        
        if (adjustedCents <= matchThreshold && adjustedCents < minCents && probability > currentConfidenceThreshold) {
          minCents = adjustedCents
          matchedInterval = interval
        }
      }
      
      if (matchedInterval) {
        logger.debug('音程练习匹配成功:', matchedInterval, '音分差:', minCents.toFixed(1))
        triggerCorrectFeedback(detectedNote)
        const newCompletedIntervals = [...exercise.completedIntervals, matchedInterval]
        
        if (newCompletedIntervals.length >= intervals.length) {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals, answered: true })
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (generateIntervalExerciseRef.current) {
            generateIntervalExerciseRef.current()
          }
        } else {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals })
          if (findRootFirstRef.current && matchedInterval === '1') {
            setIntervalPracticeStep('interval')
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
      
      const cents = 1200 * Math.log2(frequency / targetFrequency)
      const centsMod = Math.abs(cents) % 1200
      const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
      
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
      
      const cents = 1200 * Math.log2(frequency / targetFrequency)
      const centsMod = Math.abs(cents) % 1200
      const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
      
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
      
      const degrees = getChordDegrees(currentChord.type, practiceLevelRef.current)
      const currentStep = chordDegreeCurrentStepRef.current
      if (currentStep >= degrees.length) return
      
      const currentDegree = degrees[currentStep]
      if (!currentDegree) return
      
      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return
      
      const rootValue = noteToSemitones[currentChord.root] || 0
      const targetSemitone = (rootValue + semitone) % 12
      const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
      
      const cents = 1200 * Math.log2(frequency / targetFrequency)
      const centsMod = Math.abs(cents) % 1200
      const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
      
      const baseThreshold = frequency < 110 ? 35 : currentDegree === '1' ? 25 : 15
      const matchThreshold = baseThreshold * (2 - currentSensitivity)
      
      if (adjustedCents <= matchThreshold && probability > currentConfidenceThreshold) {
        logger.debug('和弦转换练习匹配成功:', detectedNote, '度数:', currentDegree, '音分差:', adjustedCents.toFixed(1))
        triggerCorrectFeedback(detectedNote)
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
      audioContext.close()
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

  // 当 micEnabled 为 true 时自动启动音频输入
  useEffect(() => {
    if (micEnabled && !audioContext) {
      logger.debug('useEffect: 开始启动音频输入...')
      toast.info(language === 'zh-CN' ? '正在请求麦克风权限...' : 'Requesting microphone permission...')
      startAudioInput().catch(err => {
        console.error('自动启动音频输入失败:', err)
        setMicEnabled(false)
      })
    }
  }, [micEnabled, audioContext, startAudioInput, language])

  // 实际的音高检测逻辑 - 完全按照原HTML文件的processAudio实现
  const runPitchDetection = useCallback((analyser: AnalyserNode, ctx: AudioContext, scriptProcessor: ScriptProcessorNode) => {
    logger.debug('音高检测已启动，使用 ScriptProcessorNode，sampleRate:', ctx.sampleRate)
    setPitchDebugInfo(prev => ({ ...prev, isRunning: true }))
    
    // 音级到半音映射
    const intervalToSemitones: Record<string, number> = {
      "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8, "b6": 8, "6": 9, "#6": 9, "b7": 10, "7": 11,
      "b9": 1, "9": 2, "#9": 3, "11": 5, "#11": 6, "b13": 8, "13": 9
    }
    
    // 音符到半音映射
    const noteToSemitones: Record<string, number> = {
      "C": 0, "C#": 1, "Cb": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11
    }
    
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
          const degrees = getChordDegrees(currentChord.type, practiceLevelRef.current)
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
      
      // 使用固定48000采样率（与原文件一致）
      const yinResult = YINPitchDetection(inputData, 48000, yinParams.threshold, yinParams.probabilityCliff)
      
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
        const fundamentalResult = YINPitchDetection(inputData, 48000, yinParams.threshold, yinParams.probabilityCliff)
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
      
      if (!currentIsPlaying || !detectedNote) return
      
      // 根据练习模式处理 - 完全按照原HTML的processAudio逻辑
      if (currentActiveTab === 'practice') {
        // 找音练习 - 使用音分差匹配
        const currentTargetNote = targetNoteRef.current
        if (!currentTargetNote) return
        
        const targetSemitone = noteToSemitones[currentTargetNote] || 0
        const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
        
        // 优化音高匹配算法
        const cents = 1200 * Math.log2(detectedFreq / targetFrequency)
        const centsMod = Math.abs(cents) % 1200
        const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
        
        // 动态调整匹配阈值 - 与原文件一致
        const baseThreshold = detectedFreq < 110 ? 35 : 25
        const matchThreshold = baseThreshold * (2 - currentSensitivity)
        
        if (adjustedCents <= matchThreshold && yinResult.probability > currentConfidenceThreshold) {
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
        
        const currentIntervalSymbol = exercise.interval?.symbol || ''
        const rootNoteValue = exercise.rootNote
        
        const intervals = currentIntervalSymbol.split('_')
        let matchedInterval: string | null = null
        let minCents = Infinity
        
        for (const interval of intervals) {
          const intervalSemitone = intervalToSemitones[interval]
          if (intervalSemitone === undefined) continue
          
          const rootValue = noteToSemitones[rootNoteValue] || 0
          const targetSemitone = (rootValue + intervalSemitone) % 12
          const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
          
          const cents = 1200 * Math.log2(detectedFreq / targetFrequency)
          const centsMod = Math.abs(cents) % 1200
          const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
          
          const baseThreshold = detectedFreq < 110 ? 35 : interval === '1' ? 25 : 15
          const matchThreshold = baseThreshold * (2 - currentSensitivity)
          
          if (adjustedCents <= matchThreshold && adjustedCents < minCents && yinResult.probability > currentConfidenceThreshold) {
            minCents = adjustedCents
            matchedInterval = interval
          }
        }
        
        if (matchedInterval) {
          logger.debug('音程练习匹配成功:', matchedInterval, '音分差:', minCents.toFixed(1))
          const newCompletedIntervals = [...exercise.completedIntervals, matchedInterval]
          
          if (newCompletedIntervals.length >= intervals.length) {
            setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals, answered: true })
            setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            if (generateIntervalExerciseRef.current) {
              generateIntervalExerciseRef.current()
            }
          } else {
            setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals })
            if (findRootFirstRef.current && matchedInterval === '1') {
              setIntervalPracticeStep('interval')
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
        
        // 优化音高匹配算法
        const cents = 1200 * Math.log2(detectedFreq / targetFrequency)
        const centsMod = Math.abs(cents) % 1200
        const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
        
        // 动态调整匹配阈值
        const baseThreshold = detectedFreq < 110 ? 35 : currentDegree === '1' ? 25 : 15
        const matchThreshold = baseThreshold * (2 - currentSensitivity)
        
        if (adjustedCents <= matchThreshold && yinResult.probability > currentConfidenceThreshold) {
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
        
        // 优化音高匹配算法
        const cents = 1200 * Math.log2(detectedFreq / targetFrequency)
        const centsMod = Math.abs(cents) % 1200
        const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
        
        // 动态调整匹配阈值
        const baseThreshold = detectedFreq < 110 ? 35 : currentDegree === '1' ? 25 : 15
        const matchThreshold = baseThreshold * (2 - currentSensitivity)
        
        if (adjustedCents <= matchThreshold && yinResult.probability > currentConfidenceThreshold) {
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
        
        const degrees = getChordDegrees(currentChord.type, practiceLevelRef.current)
        const currentStep = chordDegreeCurrentStepRef.current
        if (currentStep >= degrees.length) return
        
        const currentDegree = degrees[currentStep]
        if (!currentDegree) return
        
        const semitone = intervalToSemitones[currentDegree]
        if (semitone === undefined) return
        
        const rootValue = noteToSemitones[currentChord.root] || 0
        const targetSemitone = (rootValue + semitone) % 12
        const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12)
        
        // 优化音高匹配算法
        const cents = 1200 * Math.log2(detectedFreq / targetFrequency)
        const centsMod = Math.abs(cents) % 1200
        const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod
        
        // 动态调整匹配阈值
        const baseThreshold = detectedFreq < 110 ? 35 : currentDegree === '1' ? 25 : 15
        const matchThreshold = baseThreshold * (2 - currentSensitivity)
        
        if (adjustedCents <= matchThreshold && yinResult.probability > currentConfidenceThreshold) {
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
    }
  }, [getTransposedChordsRef, practiceLevelRef, findRootFirstRef, targetNoteRef, scaleKeyRef, scaleExerciseSequenceRef, scaleExerciseCurrentStepRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, currentIntervalExerciseRef, currentChordIndexRef, chordDegreeCurrentStepRef, nextChordRef, nextChordInfoRef, nextScaleExerciseRef, nextChordExerciseRef, generateNewTargetRef, generateIntervalExerciseRef, isPlayingRef, activeTabRef, sensitivityRef, confidenceThresholdRef, isCoolingDownRef, scriptProcessorRef])

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
      
      if (result.frequency && result.probability > confidenceThreshold) {
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
  const generateNewTarget = useCallback(() => {
    const newNote = NOTES[Math.floor(Math.random() * NOTES.length)]
    setTargetNote(newNote)
    if (intervalRootMode === "random") {
      setRootNote(NOTES[Math.floor(Math.random() * NOTES.length)])
    }
    
    // 如果是按钮答题模式，随机选择一个位置高亮显示
    if (practiceAnswerMode === "buttons") {
      // 在选中的琴弦中随机选择
      const availableStrings = selectedStrings.length > 0 ? selectedStrings : [1, 2, 3, 4, 5, 6]
      const randomStringNum = availableStrings[Math.floor(Math.random() * availableStrings.length)]
      const stringIndex = 6 - randomStringNum // 转换弦号到索引（1-6弦对应0-5索引）
      
      // 随机选择品位（0到fretCount）
      const randomFret = Math.floor(Math.random() * (fretCount + 1))
      
      setHighlightedTargetPosition({ stringIndex, fret: randomFret })
    } else {
      setHighlightedTargetPosition(null)
    }
    
    // 记录找音练习统计（只统计次数，不区分类型）
    recordPractice('pitch_finding', '练习')
  }, [intervalRootMode, recordPractice, practiceAnswerMode, selectedStrings, fretCount])

  // 生成音程练习题目
  const generateIntervalExercise = useCallback(() => {
    if (selectedIntervals.length === 0) return
    
    // 随机选择根音
    let exerciseRoot = rootNote
    if (intervalRootMode === "random") {
      exerciseRoot = NOTES[Math.floor(Math.random() * NOTES.length)]
      setRootNote(exerciseRoot)
    }
    
    // 获取选中的音程对象
    const selectedIntervalObjects = selectedIntervals.map(i => INTERVALS[i])
    
    // 随机选择一个音程作为当前题目
    const randomInterval = selectedIntervalObjects[Math.floor(Math.random() * selectedIntervalObjects.length)]
    
    // 计算目标音符
    const rootIdx = getNoteIndex(exerciseRoot)
    const targetIndex = (rootIdx + randomInterval.semitones) % 12
    const targetNoteName = NOTES[targetIndex]
    
    // 构建当前题目显示的音程
    // 先找根音模式: "1 3" (根音 + 音程)
    // 不先找根音模式: "3" (仅音程)
    const currentIntervalDisplay = findRootFirst ? `1 ${randomInterval.symbol}` : randomInterval.symbol
    
    setCurrentIntervalExercise({
      rootNote: exerciseRoot,
      interval: randomInterval,
      targetNote: targetNoteName,
      allIntervals: selectedIntervalObjects,
      currentIntervalDisplay: currentIntervalDisplay,
      completedIntervals: [] as string[],
      answered: false
    })
    
    // 重置步骤到根音
    setIntervalPracticeStep("root")
    
    // 记录音程练习统计（只统计次数，不区分类型）
    recordPractice('interval', '练习')
  }, [rootNote, intervalRootMode, selectedIntervals, findRootFirst, recordPractice])

  // 辅助函数：生成和弦练习序列
  const generateChordSequence = useCallback((root: string, chordType: string, levelId: string, order: string, bass: string) => {
    // 获取练习等级
    const level = CHORD_EXERCISE_LEVELS.find(l => l.id === levelId)
    if (!level) return []

    let sequence = [...level.intervals]

    // 根据和弦类型调整音级
    sequence = sequence.map(degree => {
      switch (chordType) {
        // 小三和弦系列: 3 -> b3
        case 'Minor':
        case 'm':
        case 'm6':
        case 'm7':
        case 'm9':
        case 'm11':
        case 'm13':
        case 'madd9':
        case 'm6/9':
          if (degree === '3') return 'b3'
          return degree
        
        // 减和弦系列：3 -> b3, 5 -> b5
        case 'Dim':
        case 'dim':
        case 'dim7':
          if (degree === '3') return 'b3'
          if (degree === '5') return 'b5'
          if (degree === '7') return 'bb7'  // 减七是bb7
          return degree
        
        // 半减七和弦：3 -> b3, 5 -> b5
        case 'm7b5':
          if (degree === '3') return 'b3'
          if (degree === '5') return 'b5'
          return degree
        
        // 增和弦：5 -> #5
        case 'Aug':
        case 'aug':
          if (degree === '5') return '#5'
          return degree
        
        // 属七降九: 9 -> b9
        case '7b9':
          if (degree === '9') return 'b9'
          return degree
        
        // 属七升九: 9 -> #9
        case '7#9':
          if (degree === '9') return '#9'
          return degree
        
        // 属七升十一: 11 -> #11
        case '7#11':
          if (degree === '11') return '#11'
          return degree
        
        // 挂二和弦：没有3，有2
        case 'sus2':
          if (degree === '3') return '2'  // sus2用2代替3
          return degree
        
        // 挂四和弦：没有3，有4
        case 'sus4':
          if (degree === '3') return '4'  // sus4用4代替3
          return degree
        
        default:
          return degree
      }
    })

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
    
    // 记录和弦练习统计
    recordPractice('chord_exercise', chordType)
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

  // 生成音阶练习序列 - 参考 F:\新建文件夹\吉他指板视觉化练习工具.html
  const generateScaleExercise = useCallback(() => {
    // 检查是否有选中的音阶
    if (selectedScales.length === 0) return
    
    // 如果处于随机调模式，随机选择一个调
    let currentKey = scaleKey
    if (isScaleKeyRandom) {
      currentKey = NOTES[Math.floor(Math.random() * NOTES.length)]
      setScaleKey(currentKey)
    }
    
    // 从选中的音阶中随机选择一个
    const randomScale = selectedScales[Math.floor(Math.random() * selectedScales.length)]
    setSelectedScale(randomScale)
    
    // 生成当前练习序列
    const intervals = generateScaleSequence(randomScale, scalePracticeSequence, scaleDirection)
    setScaleExerciseSequence(intervals)
    setScaleExerciseCurrentStep(0)
    
    // 预生成下一题的信息
    let nextKey = isScaleKeyRandom ? NOTES[Math.floor(Math.random() * NOTES.length)] : currentKey
    const nextScale = selectedScales[Math.floor(Math.random() * selectedScales.length)]
    const nextSequence = generateScaleSequence(nextScale, scalePracticeSequence, scaleDirection)
    setNextScaleExerciseInfo({
      key: nextKey,
      scaleName: nextScale.name,
      sequence: nextSequence
    })
    
    // 记录音阶练习统计
    recordPractice('scale', randomScale.name)
  }, [selectedScales, scalePracticeSequence, scaleDirection, isScaleKeyRandom, scaleKey, generateScaleSequence, recordPractice])

  // 下一音阶练习
  const nextScaleExercise = useCallback(() => {
    // 使用预览中的下一题信息
    if (nextScaleExerciseInfo) {
      setScaleKey(nextScaleExerciseInfo.key)
      // 找到对应的音阶对象
      const scale = selectedScales.find(s => s.name === nextScaleExerciseInfo.scaleName) || selectedScales[0]
      setSelectedScale(scale)
      setScaleExerciseSequence(nextScaleExerciseInfo.sequence)
      setScaleExerciseCurrentStep(0)
      
      // 预生成新的下一题
      let newNextKey = isScaleKeyRandom ? NOTES[Math.floor(Math.random() * NOTES.length)] : nextScaleExerciseInfo.key
      const newNextScale = selectedScales[Math.floor(Math.random() * selectedScales.length)]
      const newNextSequence = generateScaleSequence(newNextScale, scalePracticeSequence, scaleDirection)
      setNextScaleExerciseInfo({
        key: newNextKey,
        scaleName: newNextScale.name,
        sequence: newNextSequence
      })
    } else {
      // 如果没有预览信息，重新生成
      generateScaleExercise()
    }
  }, [nextScaleExerciseInfo, selectedScales, isScaleKeyRandom, scalePracticeSequence, scaleDirection, generateScaleSequence, generateScaleExercise])

  // 处理MIDI音符输入
  const handleMIDINoteInput = useCallback((note: string) => {
    logger.debug('handleMIDINoteInput 被调用', note, 'isPlaying:', isPlaying, 'activeTab:', activeTab)
    if (!isPlaying) {
      logger.debug('未在练习中，忽略输入')
      return
    }
    
    switch (activeTab) {
      case "practice":
        if (note === targetNote) {
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
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
        let matchedInterval: string | null = null
        
        for (const interval of intervals) {
          // 跳过已经完成的音级
          if (exercise.completedIntervals.includes(interval)) continue
          
          // 计算该音程对应的目标音符
          const intervalObj = interval === '1' 
            ? { semitones: 0, symbol: '1' }
            : exercise.allIntervals.find(i => i.symbol === interval)
          
          if (!intervalObj) continue
          
          const rootIdx = getNoteIndex(rootNote)
          const targetIndex = (rootIdx + intervalObj.semitones) % 12
          const targetNoteName = NOTES[targetIndex]
          
          if (note === targetNoteName) {
            matchedInterval = interval
            break
          }
        }
        
        if (matchedInterval) {
          // 添加到已完成列表
          const newCompletedIntervals = [...exercise.completedIntervals, matchedInterval]
          
          // 检查是否所有音程都弹对了
          if (newCompletedIntervals.length >= intervals.length) {
            // 完成题目
            setCurrentIntervalExercise({
              ...exercise,
              completedIntervals: newCompletedIntervals,
              answered: true
            })
            setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            
            // 立即生成新题目（MIDI输入无需延迟）
            generateIntervalExercise()
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
          
          // 从所有练习等级中查找
          const level = ALL_PRACTICE_LEVELS.find(l => l.id === practiceLevel)
          if (!level) break
          
          const rootIdx = getNoteIndex(currentChord.root)
          const noteIdx = getNoteIndex(note)
          const interval = (noteIdx - rootIdx + 12) % 12
          
          // 获取当前和弦质量
          const chordQuality = chordType?.quality || 'major'
          
          // 判断音符是否正确
          let isCorrect = false
          
          if ('chordTypes' in level && level.chordTypes) {
            // 旋律结构和Voice Led结构 - 根据和弦类型使用不同的音级
            const chordIntervals = level.chordTypes[chordQuality as keyof typeof level.chordTypes] || level.intervals
            isCorrect = chordIntervals?.includes(interval) || false
          } else if ('type' in level && level.type) {
            // 经过音技巧
            isCorrect = level.intervals?.includes(interval) || false
          } else if (level.intervals) {
            // 基础练习等级
            isCorrect = level.intervals.includes(interval)
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
  }, [isPlaying, activeTab, targetNote, generateNewTarget, findRootFirst, intervalPracticeStep, rootNote, selectedIntervals, currentIntervalTarget, intervalRootMode, customChords, selectedSong, currentChordIndex, practiceLevel, scaleKey, selectedScale, currentIntervalExercise, generateIntervalExercise, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, generateChordExercise, nextChordExercise, scaleExerciseSequence, scaleExerciseCurrentStep, nextScaleExercise, generateScaleExercise])

  // 更新 ref 以便在 startPitchDetection 中使用（不含 nextChord，它在后面定义）
  useEffect(() => {
    handleMIDINoteInputRef.current = handleMIDINoteInput
    nextChordExerciseRef.current = nextChordExercise
    nextScaleExerciseRef.current = nextScaleExercise
    generateNewTargetRef.current = generateNewTarget
    generateIntervalExerciseRef.current = generateIntervalExercise
    chordExerciseIsAnsweredRef.current = chordExerciseIsAnswered
  }, [handleMIDINoteInput, nextChordExercise, nextScaleExercise, generateNewTarget, generateIntervalExercise, chordExerciseIsAnswered])

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
          degrees: getChordDegrees(chord.type, practiceLevel)
        })
      }
    }
  }, [activeTab, isPlaying, currentChordIndex, customChords, selectedSong, chordPlayOrder, progressionKey, practiceLevel])

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
            const targetInterval = currentIntervalExercise.interval?.semitones % 12
            isCorrect = clickedInterval === targetInterval
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
      
      // 延迟清除高亮，让用户有时间看到反馈
      setTimeout(() => {
        setHighlightedFrets(prev => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }, 500)
      
      // 延迟处理练习逻辑，让高亮显示有时间渲染
      setTimeout(() => {
        handleMIDINoteInput(clickedNote)
      }, 100)
    }
  }, [isPlaying, handleMIDINoteInput, activeTab, targetNote, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, scaleExerciseSequence, scaleExerciseCurrentStep, scaleKey, currentIntervalExercise, rootNote, customChords, selectedSong, currentChordIndex])

  // 开始/停止练习
  const togglePractice = useCallback(() => {
    if (!isPlaying) {
      setScore({ correct: 0, total: 0 })
      // 找音练习使用专门的时长设置
      const timeInSeconds = activeTab === "practice" ? pitchFindingTime * 60 : practiceTime
      setTimeLeft(timeInSeconds)
      generateNewTarget()
      setIntervalPracticeStep("root")
      setScaleCurrentNote(0)
      // 音程练习模式下生成题目
      if (activeTab === "interval") {
        generateIntervalExercise()
      }
      // 和弦练习模式下生成题目
      if (activeTab === "chord_exercise") {
        generateChordExercise()
      }
      // 音阶练习模式下生成题目
      if (activeTab === "scale") {
        generateScaleExercise()
      }
      setIsPlaying(true)
    } else {
      // 停止练习时清除所有高亮
      setIsPlaying(false)
      setHighlightedFrets(new Map())
      setHighlightedTargetPosition(null)
    }
  }, [isPlaying, activeTab, pitchFindingTime, practiceTime, generateNewTarget, generateIntervalExercise, generateChordExercise, generateScaleExercise])

  // 重置练习
  const resetPractice = useCallback(() => {
    setIsPlaying(false)
    setScore({ correct: 0, total: 0 })
    setTimeLeft(practiceTime)
    setHighlightedFrets(new Map())
    setHighlightedTargetPosition(null)
    setIntervalPracticeStep("root")
    setScaleCurrentNote(0)
    setCurrentIntervalExercise(null)
    // 清理冷却期
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
        }
        setCurrentChordIndex(nextIndex)
      } else {
        nextIndex = (currentChordIndex + 1) % chords.length
        // 检测是否完成一轮（正序时，索引变为0且之前是最后一个）
        if (nextIndex === 0 && currentChordIndex === chords.length - 1) {
          recordPractice('chord_progression', selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name)
        }
        setCurrentChordIndex(nextIndex)
      }
    }
  }, [nextChordInfo, customChords, selectedSong, chordPlayOrder, currentChordIndex, recordPractice, t])

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
        if (fullscreenMode) {
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
        setFullscreenMode(prev => !prev)
        return
      }

      // M - 切换麦克风
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        setMicEnabled(prev => !prev)
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
        setActiveTab(tabs[parseInt(event.key) - 1])
        return
      }

      // 空格/右箭头/PageDown - 下一题（练习中）
      if ((event.key === ' ' || event.key === 'ArrowRight' || event.key === 'PageDown') && isPlaying) {
        event.preventDefault()
        if (activeTab === 'practice') {
          generateNewTarget()
        } else if (activeTab === 'interval') {
          generateIntervalExercise()
        } else if (activeTab === 'chord_exercise') {
          nextChordExercise()
        } else if (activeTab === 'scale') {
          nextScaleExercise()
        } else if (activeTab === 'chord') {
          nextChord()
        }
        return
      }

      // 上箭头 - 显示指板
      if (event.key === 'ArrowUp' && isPlaying) {
        event.preventDefault()
        setShowAllNotes(true)
        return
      }

      // 下箭头 - 隐藏指板
      if (event.key === 'ArrowDown' && isPlaying) {
        event.preventDefault()
        setShowAllNotes(false)
        return
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [fullscreenMode, isPlaying, togglePractice, activeTab, generateNewTarget, generateIntervalExercise, nextChordExercise, nextScaleExercise, nextChord])

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
    localStorage.setItem('customChordSequence', JSON.stringify(data))
    toast.success(t('custom_chord_saved'))
  }

  // 从本地存储加载自定义和弦序列
  const loadCustomChords = () => {
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

  // 获取转调后的和弦列表 - 使用useMemo缓存
  const transposedChords = useMemo(() => {
    if (customChords.length > 0) {
      return customChords
    }
    const songKey = selectedSong.key || "C"
    if (progressionKey === songKey) {
      return selectedSong.chords.map(c => parseChord(c))
    }
    // 转调
    return selectedSong.chords.map(chordString => {
      const transposed = transposeChord(chordString, songKey, progressionKey)
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
    const displayName = `${chord.root}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay) ? '' : chordTypeName}${chord.bass ? '/' + chord.bass : ''}`
    return displayName
  }

  // 获取下一题和弦显示 - 使用预生成的信息
  const getNextChordDisplay = () => {
    if (nextChordInfo) {
      return nextChordInfo
    }
    return null
  }

  // ==================== 渲染 ====================

  return (
    <OnboardingProvider t={t}>
    <TooltipProvider>
      <div 
        className="min-h-screen bg-background flex flex-col relative"
        style={{ 
          transform: `scale(${displayScale})`,
          transformOrigin: 'top left',
          width: `${100 / displayScale}%`,
          minHeight: `${100 / displayScale}vh`,
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
                          onValueChange={useCallback(([v]: number[]) => setReferenceFrequency(v), [])}
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={t('nav_settings')}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </SheetTrigger>
                <SheetContent className="w-80 overflow-y-auto">
                  <SheetHeader className="px-4">
                    <SheetTitle>{t('nav_settings')}</SheetTitle>
                  </SheetHeader>
                  
                  <div className="space-y-6 py-4 px-4">
                    {/* Language */}
                    {/* Practice Settings */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        {t('settings_practice')}
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('practice_time')}</span>
                          <span className="font-mono">{practiceTime}s</span>
                        </div>
                        <Slider
                          value={[practiceTime]}
                          onValueChange={useCallback(([v]: number[]) => setPracticeTime(v), [])}
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
                          onValueChange={useCallback(([v]: number[]) => setFretCount(v), [])}
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
                            onValueChange={useCallback(([v]: number[]) => setCooldownDuration(v), [])}
                            min={200}
                            max={3000}
                            step={100}
                          />
                        </div>
                      )}
                    </div>
                    
                    <Separator />
                    
                    {/* Metronome */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        {t('device_metronome')}
                      </h4>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('device_metronome')}</span>
                        <Switch checked={metronomeEnabled} onCheckedChange={setMetronomeEnabled} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('device_tempo')}</span>
                          <span className="font-mono">{metronomeBpm} BPM</span>
                        </div>
                        <Slider
                          value={[metronomeBpm]}
                          onValueChange={useCallback(([v]: number[]) => setMetronomeBpm(v), [])}
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
                    </div>
                    
                    <Separator />
                    
                    {/* Audio Input */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Mic className="h-4 w-4" />
                        {t('device_audio_input')}
                      </h4>
                      
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
                              } catch (err: any) {
                                console.error('麦克风权限错误', err)
                                if (err.name === 'NotAllowedError') {
                                  toast.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风')
                                } else if (err.name === 'NotFoundError') {
                                  toast.error('未找到麦克风设备')
                                } else {
                                  toast.error('无法获取麦克风权限 ' + (err.message || '未知错误'))
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
                          onValueChange={useCallback(([v]: number[]) => setInputGain(v / 100), [])}
                          min={0}
                          max={200}
                          step={10}
                          disabled={!micEnabled}
                        />
                      </div>
                    </div>
                    
                    <Separator />
                    
                    {/* MIDI */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Piano className="h-4 w-4" />
                        {t('midi_support')}
                      </h4>
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
                    </div>

                    <Separator />

                    {/* Language Settings */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Languages className="h-4 w-4" />
                        {t('general_language')}
                      </h4>
                      <div className="flex gap-2">
                        <Button
                          variant={language === 'zh-CN' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setLanguage('zh-CN')}
                          className="flex-1"
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          {t('lang_zh')}
                        </Button>
                        <Button
                          variant={language === 'en' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setLanguage('en')}
                          className="flex-1"
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          {t('lang_en')}
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    {/* Theme Settings */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        {t('general_theme')}
                      </h4>
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
                    </div>

                    <Separator />

                    {/* Display Scale Settings */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        {language === 'zh-CN' ? '显示大小' : 'Display Size'}
                      </h4>
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
                    </div>

                    <Separator />

                    {/* Chord/Scale Display Settings */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Music className="h-4 w-4" />
                        {t('chord_scale_display')}
                      </h4>
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
                    </div>

                    <Separator />

                    {/* Settings Management */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Save className="h-4 w-4" />
                        {t('settings_management')}
                      </h4>
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
                    </div>

                    <Separator />

                    {/* Tutorial */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        {t('onboarding_welcome_title')}
                      </h4>
                      <p className="text-xs text-muted-foreground">{t('onboarding_welcome_desc')}</p>
                      <OnboardingTrigger variant="button" />
                    </div>

                    <Separator />

                    {/* Version Info */}
                    <div className="pt-2 border-t border-border/30">
                      <div className="flex items-center justify-between text-xs text-muted-foreground/50">
                        <span>Build</span>
                        <span className="font-mono">v{VERSION} ({BUILD_DATE_LOCAL})</span>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <aside
            data-onboarding="practice-tabs"
            className={cn(
              "border-r border-border/50 bg-card hidden md:flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.03)]",
              sidebarCollapsed ? "w-14" : "w-56"
            )}
            style={{ transition: 'width 0.2s ease-in-out' }}
          >
            <div className="p-2 space-y-1">
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
                >
                  <mode.Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>{mode.label}</span>}
                </button>
              ))}
            </div>
            
            <div className="mt-auto p-2">
              <button
                onClick={() => setSidebarCollapsed(prev => !prev)}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-accent transition-colors"
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
          </aside>

          {/* Main Area */}
          <main className="flex-1 overflow-auto p-2 sm:p-4 pb-16 sm:pb-4">
            <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
              {/* Control Panel - 统计页面不显示*/}
              {activeTab !== "stats" && (
              <Card 
                ref={practiceCardRef}
                tabIndex={0} 
                onKeyDown={handleKeyDown}
                className="outline-none focus:ring-2 focus:ring-primary/50"
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
                        variant={isPlaying ? "destructive" : "default"}
                        size="sm"
                        onClick={togglePractice}
                      >
                        {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                        {isPlaying ? t('btn_stop') : t('btn_start')}
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
                              <div className="text-base sm:text-lg font-bold text-primary leading-tight">{targetNote}</div>
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
                    </div>
                  )}
                  
                  {/* Interval Controls */}
                  {activeTab === "interval" && (
                    <div className="space-y-3">
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
                          <Switch 
                            id="showIntervalFretboard" 
                            checked={showIntervalFretboard} 
                            onCheckedChange={setShowIntervalFretboard}
                            className="h-4 w-7"
                          />
                          <Label htmlFor="showIntervalFretboard" className="text-xs cursor-pointer">{t('show_fretboard')}</Label>
                        </div>
                      </div>

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
                      <div className="flex flex-wrap items-start gap-2">
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

                        {/* 练习等级 */}
                        <div className="w-[140px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('practice_level')}</Label>
                          <Select value={chordExerciseLevel} onValueChange={setChordExerciseLevel}>
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CHORD_EXERCISE_LEVELS.map(level => (
                                <SelectItem key={level.id} value={level.id} className="text-xs">{t(level.nameKey)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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

                        {/* 显示指板开关*/}
                        <div className="flex items-center gap-1.5 h-7 px-2 bg-card/30 rounded border border-border/30 mt-4">
                          <Label htmlFor="showChordExerciseFretboard" className="text-xs cursor-pointer">{t('show_fretboard')}</Label>
                          <Switch
                            id="showChordExerciseFretboard"
                            checked={showChordExerciseFretboard}
                            onCheckedChange={setShowChordExerciseFretboard}
                            className="scale-75"
                          />
                        </div>

                        {/* 和弦结构开关*/}
                        <div className="flex items-center gap-1.5 h-7 px-2 bg-card/30 rounded border border-border/30 mt-4">
                          <Label htmlFor="showChordExerciseStructure" className="text-xs cursor-pointer">{t('chord_structure')}</Label>
                          <Switch
                            id="showChordExerciseStructure"
                            checked={showChordExerciseStructure}
                            onCheckedChange={setShowChordExerciseStructure}
                            className="scale-75"
                          />
                        </div>

                        {/* 显示键盘开关*/}
                        <div className="flex items-center gap-1.5 h-7 px-2 bg-card/30 rounded border border-border/30 mt-4">
                          <Label htmlFor="showChordExerciseKeyboard" className="text-xs cursor-pointer">{t('show_keyboard')}</Label>
                          <Switch
                            id="showChordExerciseKeyboard"
                            checked={showChordExerciseKeyboard}
                            onCheckedChange={setShowChordExerciseKeyboard}
                            className="scale-75"
                          />
                        </div>

                      </div>

                      {/* 第二行：和弦类型选择 */}
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
                        <div className="flex flex-wrap gap-1.5">
                          {CHORD_TYPES.map(type => (
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
                    </div>
                  )}

                  {/* Chord Progression Controls */}
                  {activeTab === "chord" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* 左侧：练习控制部分*/}
                      <div className="space-y-3">
                        {/* 紧凑的设置行 */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <Label className="text-[10px] font-medium text-muted-foreground">{t('select_song')}</Label>
                            <Button
                              variant="outline"
                              className="h-7 text-xs w-full justify-between"
                              onClick={() => setShowSongSelector(true)}
                            >
                              <span className="truncate">{selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name}</span>
                              <ChevronRight className="h-3 w-3 ml-2" />
                            </Button>
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[10px] font-medium text-muted-foreground">{t('chord_order')}</Label>
                            <Select value={chordPlayOrder} onValueChange={(v: "asc" | "desc" | "random") => setChordPlayOrder(v)}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="asc" className="text-xs">{t('order_ordered')}</SelectItem>
                                <SelectItem value="desc" className="text-xs">{t('order_reverse')}</SelectItem>
                                <SelectItem value="random" className="text-xs">{t('order_random')}</SelectItem>
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
                              <ChevronRight className="h-3 w-3 ml-2" />
                            </Button>
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[10px] font-medium text-muted-foreground">{t('select_key')}</Label>
                            <Select value={progressionKey} onValueChange={setProgressionKey}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NOTES.map(note => (
                                  <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {/* 右侧：自定义和弦、iReal导入、下一题、显示指板*/}
                      <div className="space-y-2">
                        <Accordion type="multiple" defaultValue={[]} className="w-full space-y-1">
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

                        {/* 下一题按钮、显示指板开关和结构显示开关*/}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            onClick={nextChord}
                            variant="outline"
                            className="h-7 px-3 text-xs"
                            disabled={!isPlaying}
                          >
                            <SkipForward className="h-3 w-3 mr-1" />
                            {t('btn_next')}
                          </Button>
                          <div className="flex flex-wrap gap-2 py-1.5">
                            <div className="flex items-center gap-2 py-1.5 px-2 bg-card/30 rounded border border-border/30">
                              <Label htmlFor="showChordFretboard" className="text-xs cursor-pointer whitespace-nowrap">{t('show_fretboard')}</Label>
                              <Switch
                                id="showChordFretboard"
                                checked={showChordFretboard}
                                onCheckedChange={setShowChordFretboard}
                                className="scale-75 flex-shrink-0"
                              />
                            </div>
                            <div className="flex items-center gap-2 py-1.5 px-2 bg-card/30 rounded border border-border/30">
                              <Label htmlFor="showChordStructure" className="text-xs cursor-pointer whitespace-nowrap">{t('chord_progression_structure')}</Label>
                              <Switch
                                id="showChordStructure"
                                checked={showChordStructure}
                                onCheckedChange={setShowChordStructure}
                                className="scale-75 flex-shrink-0"
                              />
                            </div>
                            <div className="flex items-center gap-2 py-1.5 px-2 bg-card/30 rounded border border-border/30">
                              <Label htmlFor="showChordKeyboard" className="text-xs cursor-pointer whitespace-nowrap">{t('show_keyboard')}</Label>
                              <Switch
                                id="showChordKeyboard"
                                checked={showChordKeyboard}
                                onCheckedChange={setShowChordKeyboard}
                                className="scale-75 flex-shrink-0"
                              />
                            </div>
                          </div>
                        </div>

                      </div>
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
                            <span className="font-mono">{progressionKey}</span>
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
                      <div className="flex flex-wrap items-start gap-2">
                        {/* 调性选择 */}
                        <div className="w-[80px]">
                          <Label className="text-[10px] font-medium text-muted-foreground block mb-0.5 leading-4">{t('scale_key')}</Label>
                          <Select value={isScaleKeyRandom ? 'random' : scaleKey} onValueChange={(value) => {
                            if (value === 'random') {
                              setIsScaleKeyRandom(true)
                              // 立即随机一个调
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
                              <SelectItem value="basic" className="text-xs">{language === 'zh-CN' ? '基础' : 'Basic'}</SelectItem>
                              <SelectItem value="church" className="text-xs">{language === 'zh-CN' ? '教会调式' : 'Church'}</SelectItem>
                              <SelectItem value="minor" className="text-xs">{language === 'zh-CN' ? '小调变体' : 'Minor'}</SelectItem>
                              <SelectItem value="pentatonic" className="text-xs">{language === 'zh-CN' ? '五声音阶' : 'Pentatonic'}</SelectItem>
                              <SelectItem value="bebop" className="text-xs">{language === 'zh-CN' ? 'Bebop' : 'Bebop'}</SelectItem>
                              <SelectItem value="jazz" className="text-xs">{language === 'zh-CN' ? '爵士' : 'Jazz'}</SelectItem>
                              <SelectItem value="exotic" className="text-xs">{language === 'zh-CN' ? '异域' : 'Exotic'}</SelectItem>
                              <SelectItem value="symmetrical" className="text-xs">{language === 'zh-CN' ? '对称' : 'Symmetrical'}</SelectItem>
                              <SelectItem value="other" className="text-xs">{language === 'zh-CN' ? '其他' : 'Other'}</SelectItem>
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
                              { id: "random", label: t('order_random') },
                            ].map((order) => (
                              <Button
                                key={order.id}
                                variant={scaleDirection === order.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setScaleDirection(order.id as "up" | "down" | "random")}
                                className="h-7 text-xs flex-1 px-1"
                              >
                                {order.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* 显示指板开关*/}
                        <div className="flex items-center gap-1.5 h-7 px-2 bg-card/30 rounded border border-border/30 mt-4">
                          <Label htmlFor="showScaleFretboard" className="text-xs cursor-pointer">{t('show_fretboard')}</Label>
                          <Switch
                            id="showScaleFretboard"
                            checked={showScaleFretboard}
                            onCheckedChange={setShowScaleFretboard}
                            className="scale-75"
                          />
                        </div>

                        {/* 音阶结构开关*/}
                        <div className="flex items-center gap-1.5 h-7 px-2 bg-card/30 rounded border border-border/30 mt-4">
                          <Label htmlFor="showScaleStructure" className="text-xs cursor-pointer">{t('scale_structure')}</Label>
                          <Switch
                            id="showScaleStructure"
                            checked={showScaleStructure}
                            onCheckedChange={setShowScaleStructure}
                            className="scale-75"
                          />
                        </div>

                        {/* 显示键盘开关*/}
                        <div className="flex items-center gap-1.5 h-7 px-2 bg-card/30 rounded border border-border/30 mt-4">
                          <Label htmlFor="showScaleKeyboard" className="text-xs cursor-pointer">{t('show_keyboard')}</Label>
                          <Switch
                            id="showScaleKeyboard"
                            checked={showScaleKeyboard}
                            onCheckedChange={setShowScaleKeyboard}
                            className="scale-75"
                          />
                        </div>
                      </div>

                      {/* 第二行：练习序列和音阶选择 */}
                      <div className="flex flex-wrap gap-2">
                        {/* 练习序列选择 */}
                        <div className="bg-card/30 rounded-lg p-2 border border-border/30">
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
                                {seq.name}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* 音阶类型选择 */}
                        <div className="bg-card/30 rounded-lg p-2 border border-border/30 flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <Label className="text-[10px] font-medium text-muted-foreground">
                              {selectedScaleCategory === 'basic' ? (language === 'zh-CN' ? '基础音阶' : 'Basic Scales') : 
                               selectedScaleCategory === 'church' ? (language === 'zh-CN' ? '教会调式' : 'Church Modes') : 
                               selectedScaleCategory === 'minor' ? (language === 'zh-CN' ? '小调变体' : 'Minor Variants') : 
                               selectedScaleCategory === 'pentatonic' ? (language === 'zh-CN' ? '五声音阶' : 'Pentatonic Scales') : 
                               selectedScaleCategory === 'bebop' ? (language === 'zh-CN' ? 'Bebop音阶' : 'Bebop Scales') : 
                               selectedScaleCategory === 'jazz' ? (language === 'zh-CN' ? '爵士音阶' : 'Jazz Scales') : 
                               selectedScaleCategory === 'exotic' ? (language === 'zh-CN' ? '异域音阶' : 'Exotic Scales') : 
                               selectedScaleCategory === 'symmetrical' ? (language === 'zh-CN' ? '对称音阶' : 'Symmetrical Scales') : 
                               (language === 'zh-CN' ? '其他音阶' : 'Other Scales')}
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
                      <h4 className="text-sm font-semibold">{scaleKey} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</h4>
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
                      <h4 className="text-sm font-semibold">{chordExerciseTargetChord.root} {getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay)}</h4>
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
                    ✓ {correctFeedbackNote}
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
                                  ? "text-foreground/80 bg-secondary/80 hover:bg-secondary"
                                  : "text-muted-foreground/50 bg-muted/30 cursor-not-allowed"
                              )}
                            >
                              {getNoteAtPosition(stringIndex, 0)}
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
                              let displayText = note
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
                          const degrees = getChordDegrees(targetChord.type, chordExerciseLevel)
                          const rootIdx = getNoteIndex(targetChord.root)
                          return degrees.map(degree => {
                            const semitone = DEGREE_TO_SEMITONE[degree]
                            if (semitone === undefined) return null
                            const noteIdx = (rootIdx + semitone) % 12
                            return NOTES[noteIdx]
                          }).filter((n): n is string => n !== null)
                        } else {
                          const chordType = chordExerciseTypes[0] || "Major"
                          const degrees = getChordDegrees(chordType, chordExerciseLevel)
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
                        const degrees = getChordDegrees(chordExerciseTargetChord.type, chordExerciseLevel)
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
                          const degrees = getChordDegrees(currentChord.type, practiceLevel)
                          const rootIdx = getNoteIndex(currentChord.root)
                          return degrees.map(degree => {
                            const semitone = DEGREE_TO_SEMITONE[degree]
                            if (semitone === undefined) return null
                            const noteIdx = (rootIdx + semitone) % 12
                            return NOTES[noteIdx]
                          }).filter((n): n is string => n !== null)
                        })()}
                        currentStepNote={(() => {
                          const degrees = getChordDegrees(currentChord.type, practiceLevel)
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
                            const degrees = getChordDegrees(currentChord.type, practiceLevel)
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
                        const displayName = `${nextChord.root}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay) ? '' : chordTypeName}${nextChord.bass ? '/' + nextChord.bass : ''}`
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
                            <h3 className="text-lg font-semibold">{scaleKey} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</h3>
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
                            {nextScaleExerciseInfo.key} {getScaleDisplayName(nextScaleExerciseInfo.scaleName, chordScaleDisplay)}
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
                              {chordExerciseTargetChord.root} {getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay)}
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
                      {/* 根音显示 */}
                      <div className="text-6xl font-bold">
                        {currentIntervalExercise.rootNote}
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
                                currentIntervalExercise.completedIntervals.includes(interval) && "text-muted-foreground line-through"
                              )}
                            >
                              {formatDegree(interval)}
                            </span>
                          ))}
                        </div>
                      </div>
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
                        chord_progression: t('nav_chord'),
                        arpeggio: t('nav_arpeggio')
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 p-1 pb-safe z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
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
              >
                <mode.Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium truncate max-w-full">{mode.shortLabel}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* 全屏模式覆盖层 */}
        {fullscreenMode && (
          <div 
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center"
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
                      <div className="text-8xl font-bold text-primary">{targetNote}</div>
                      <div className="text-2xl text-muted-foreground">{t('target_note')}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-6xl font-bold text-primary">{t('target_note')}</div>
                      <div className="text-2xl text-muted-foreground">{t('practice_mode_description_identify')}</div>
                    </>
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
                      const degrees = getChordDegrees(currentChord.type, practiceLevel)
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
                    const displayName = `${nextChord.root}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay) ? '' : chordTypeName}${nextChord.bass ? '/' + nextChord.bass : ''}`
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
                    {chordExerciseTargetChord.root} {getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay)}
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
                  <div className="text-6xl font-bold text-primary">{scaleKey} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</div>
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
                        {nextScaleExerciseInfo.key} {getScaleDisplayName(nextScaleExerciseInfo.scaleName, chordScaleDisplay)}
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
                  <div className="text-8xl font-bold text-primary">{currentIntervalExercise.rootNote}</div>
                  <div className="text-6xl font-bold">
                    {currentIntervalExercise.currentIntervalDisplay.split(' ').map((interval, idx) => (
                      <span 
                        key={idx}
                        className={cn(
                          "mx-4",
                          currentIntervalExercise.completedIntervals.includes(interval) && "text-muted-foreground line-through"
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
            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="p-4 space-y-4">
                {(() => {
                  if (groupedSongs.length === 0) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('no_songs_found')}
                      </div>
                    )
                  }
                  return groupedSongs.map(({ group, songs }) => (
                    <div key={group} className="space-y-2">
                      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 py-1">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                          {group}
                        </h4>
                      </div>
                      <div className="space-y-1">
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
                                setProgressionKey(song.key)
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedSongInfo(song)
                                setShowSongInfoDialog(true)
                              }}
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedSong({ name: '__custom__', chords: [], displayName: t('chord_custom') })
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

        {/* 练习等级选择弹窗 */}
        <Dialog open={showLevelSelector} onOpenChange={setShowLevelSelector}>
          <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {t('practice_level')}
              </DialogTitle>
            </DialogHeader>

            {/* 练习等级列表 */}
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
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-4 border-t">
              <Button variant="outline" onClick={() => setShowLevelSelector(false)}>
                {t('btn_close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 练习等级详细信息弹窗 */}
        <Dialog open={showLevelInfoDialog} onOpenChange={setShowLevelInfoDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {selectedLevelInfo?.name}
              </DialogTitle>
            </DialogHeader>

            {selectedLevelInfo && (
              <div className="space-y-4 py-4">
                {/* 基本信息 */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('practice_level')}</Label>
                    <p className="text-sm font-medium">{selectedLevelInfo.name}</p>
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

        {/* 新手教程覆盖层*/}
        <OnboardingOverlay />
      </div>
    </TooltipProvider>
    </OnboardingProvider>
  )
}