// myfretboardtrainer 风格指板的数据层：六档显示模式的音级定义 + 整幅音位表。
//
// 与 `lib/fretboard-positions.ts` 的分工：
//   · 那边管「指型/把位的几何」（CAGED_FORMS 是指型数据的**唯一**真相源）；
//   · 这里管「某一档要显示哪些音、每个音是什么角色」，不复制任何指型偏移。
//
// 🚨 六档音级表是**照参考站实测**定的，不是照教科书抄的（同根音同档的音位数已逐一对过）：
//   CAGED 22 / Arpeggios 26 / 属七琶音 34 / 五声 42 / 蓝调 49 / 大调音阶 59（C 大调，0–15 品）。
//   其中 Blues 的蓝调音（♭5）单独占一档颜色（参考站的 `blue` 类），不并入 default。

import { NOTES } from '@/lib/page-theory-data'
import {
    getCagedFormCells,
    isStandardSixStringGuitar,
    type ChordQuality,
    type FretboardConfig,
} from '@/lib/fretboard-positions'

/** 显示档（对应参考站那排胶囊按钮） */
export type TrainerMode = 'caged' | 'arpeggio' | 'arp7' | 'pentatonic' | 'blues' | 'scale'

/** 显示顺序 = 参考站按钮顺序 */
export const TRAINER_MODE_ORDER: TrainerMode[] = [
    'caged',
    'arpeggio',
    'arp7',
    'pentatonic',
    'blues',
    'scale',
]

interface TrainerModeDef {
    /** 相对根音的半音集合（**升序**，与 degrees 一一对应） */
    semitones: Record<ChordQuality, number[]>
    /** 与 semitones 同序的音级标签 */
    degrees: Record<ChordQuality, string[]>
    /**
     * 需要**单独着色**的音级（目前只有 Blues 的蓝调音）。
     * 🚨 大调蓝调与小调蓝调的蓝调音**不是同一个音级**（实测参考站）：
     *   大调蓝调 = 大调五声 + ♭3；小调蓝调 = 小调五声 + ♭5。
     * 照「大调也加 ♭5」写会多出一格（大调 blues 实测 49 格，错写成 ♭5 会变 50 格）。
     */
    accentDegrees?: Record<ChordQuality, string[]>
}

export const TRAINER_MODES: Record<TrainerMode, TrainerModeDef> = {
    caged: {
        semitones: { major: [0, 4, 7], minor: [0, 3, 7] },
        degrees: { major: ['1', '3', '5'], minor: ['1', '♭3', '5'] },
    },
    arpeggio: {
        semitones: { major: [0, 4, 7], minor: [0, 3, 7] },
        degrees: { major: ['1', '3', '5'], minor: ['1', '♭3', '5'] },
    },
    arp7: {
        semitones: { major: [0, 4, 7, 10], minor: [0, 3, 7, 10] },
        degrees: { major: ['1', '3', '5', '♭7'], minor: ['1', '♭3', '5', '♭7'] },
    },
    pentatonic: {
        semitones: { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] },
        degrees: { major: ['1', '2', '3', '5', '6'], minor: ['1', '♭3', '4', '5', '♭7'] },
    },
    blues: {
        semitones: { major: [0, 2, 3, 4, 7, 9], minor: [0, 3, 5, 6, 7, 10] },
        degrees: { major: ['1', '2', '♭3', '3', '5', '6'], minor: ['1', '♭3', '4', '♭5', '5', '♭7'] },
        accentDegrees: { major: ['♭3'], minor: ['♭5'] },
    },
    scale: {
        semitones: { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] },
        degrees: {
            major: ['1', '2', '3', '4', '5', '6', '7'],
            minor: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
        },
    },
}

/**
 * CAGED 五形状色 —— 取自参考站深色主题的 `--CColor/--AColor/--GColor/--EColor/--DColor`。
 * ⚠️ 这是**颜色**的真相源；`app/globals.css` 里的 `--ft-form-*` 变量必须与之一致
 * （有护栏比对，改一边不改另一边会红）。
 */
export const CAGED_FORM_COLORS: Record<string, string> = {
    C: '#95609f',
    A: '#8eb676',
    G: '#06b6d4',
    E: '#f43f5e',
    D: '#eab308',
}

/** 图例顺序（= 环的顺序，与参考站下方 `C A G E D` 一致） */
export const CAGED_FORM_ORDER = ['C', 'A', 'G', 'E', 'D'] as const

/**
 * 环上**相邻**形状对，顺序即双色渐变 40% / 60% 两侧的颜色顺序。
 * 🚨 CAGED 是**环**：D 的后继回到 C，所以最后一对是 `DC`（左 D 右 C）而不是 `CD`。
 * 实测参考站 `.note.clicked.DCColor` 是 `linear-gradient(90deg, DColor 40%, CColor 60%)`，
 * 据此逐像素验过：C 调 1 弦空弦那一格左黄（D）右紫（C）。
 */
export const CAGED_ADJACENT_PAIRS: readonly (readonly [string, string])[] = [
    ['C', 'A'],
    ['A', 'G'],
    ['G', 'E'],
    ['E', 'D'],
    ['D', 'C'],
]

/** 两个形状 → 相邻对字符串（如 `['C','D']` → `'DC'`）；不相邻返回 null */
export function orderFormPair(forms: readonly string[]): string | null {
    for (const [a, b] of CAGED_ADJACENT_PAIRS) {
        if (forms.includes(a) && forms.includes(b)) return `${a}${b}`
    }
    return null
}

/** 一个格子的显示信息 */
export interface TrainerBoardCell {
    /** 音级标签（如 `1` / `♭5`） */
    degree: string
    /** 音名（默认升号；调用方可用升降号偏好覆盖） */
    note: string
    /** 半音值 0–11 */
    pitchClass: number
    /** 视觉角色 → `data-role`：`root` / `default` / `seventh` / `blue` / `form-C` / `form-DC` */
    role: string
}

/** 一个格子的 role 由「音级 + 档位 + 性质」决定（CAGED 档例外，走形状） */
function roleOfDegree(mode: TrainerMode, quality: ChordQuality, degree: string): string {
    if (TRAINER_MODES[mode].accentDegrees?.[quality].includes(degree)) return 'blue'
    if (degree === '1') return 'root'
    if (mode === 'arp7' && degree === '♭7') return 'seventh'
    return 'default'
}

/**
 * 生成整幅指板的格子表：`"${stringIndex}-${fret}"` → 格子信息。
 *
 * ⚠️ **CAGED 档与其它档的取音规则不同**（照参考站实测）：
 *   · CAGED：只画**五个形状指法按得到的**音位。C 和弦的 6 弦空弦/3/12/15 品是和弦音，
 *     但不在任何形状里，参考站**不画**（所以 CAGED 22 格 < Arpeggios 26 格）。
 *   · 其它档：画**全部**符合条件的音位，与形状无关。
 * 另：非六弦标准调弦没有 CAGED 形状，整表返回空（与 `getCagedShapes` 同约定）。
 */
export function getTrainerBoard(
    mode: TrainerMode,
    rootPitchClass: number,
    quality: ChordQuality,
    config: FretboardConfig,
    fretCount: number,
): Map<string, TrainerBoardCell> {
    const out = new Map<string, TrainerBoardCell>()
    if (!isStandardSixStringGuitar(config)) return out

    const def = TRAINER_MODES[mode]
    const semitones = def.semitones[quality]
    const degrees = def.degrees[quality]
    const formCells = mode === 'caged' ? getCagedFormCells(rootPitchClass, config, fretCount, quality) : null

    for (let stringIndex = 0; stringIndex < config.tuning.length; stringIndex++) {
        for (let fret = 0; fret <= fretCount; fret++) {
            const pitchClass = (((config.tuning[stringIndex] + fret) % 12) + 12) % 12
            const idx = semitones.indexOf(((((pitchClass - rootPitchClass) % 12) + 12) % 12))
            if (idx < 0) continue

            const key = `${stringIndex}-${fret}`
            const degree = degrees[idx]
            let role: string

            if (formCells) {
                const forms = formCells.get(key)
                if (!forms || forms.length === 0) continue
                const pair = forms.length > 1 ? orderFormPair(forms) : null
                role = pair ? `form-${pair}` : `form-${forms[0]}`
            } else {
                role = roleOfDegree(mode, quality, degree)
            }

            out.set(key, { degree, note: NOTES[pitchClass], pitchClass, role })
        }
    }
    return out
}

/** 根音音名 → 半音值（用项目唯一的音名解析，自建表会静默落兜底） */
export function trainerRootPitchClass(rootName: string, getNoteIndex: (n: string) => number): number {
    return ((getNoteIndex(rootName) % 12) + 12) % 12
}
