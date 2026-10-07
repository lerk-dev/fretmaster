// 指板位置数据
import { SCALE_INTERVAL_DISPLAY, SCALE_INTERVALS, ScaleType } from "@/lib/scale-theory"

// ==================== 把位指型生成 ====================
// 两种把位教学体系：
//
// 1. 度数锚定把位（Position Playing，任意乐器/调弦/音阶通用）
//    - 每个把位从最低音弦上的某个音级开始
//    - 窗口宽度：五声类（≤6 音）5 品，七声类（≥7 音）4 品
//    - 一指一品（食指=把位第 1 品），空弦仅在 0 把位窗口内出现
//
// 2. CAGED 系统（仅六弦标准调弦）
//    - 5 个经典可移动指型，按 C-A-G-E-D 命名
//    - 同时给出各指型对应的五声音阶"盒子"窗口（经典 5 盒）
//
// 弦索引约定与 INSTRUMENT_CONFIG 一致：0 = 最高音弦

/** 指板配置（INSTRUMENT_CONFIG 的结构子集，便于传入完整配置对象） */
export interface FretboardConfig {
  stringCount: number
  /** 各弦空弦音（半音值，索引 0 = 最高音弦） */
  tuning: number[]
}

/** 指板上的一个音 */
export interface PositionNote {
  stringIndex: number
  fret: number
  pitchClass: number
  /** 相对音阶的音级（1 起） */
  degree: number
  isRoot: boolean
  /** 建议指法：0 = 空弦，1-4 = 食指到小指 */
  finger: number
}

/** 一个度数锚定把位（窗口内的全部音符） */
export interface PositionWindow {
  /** 把位序号（按最低音弦锚点音级从低到高） */
  index: number
  /** 锚点音级（1 起） */
  anchorDegree: number
  startFret: number
  endFret: number
  notes: PositionNote[]
}

/** 和弦性质（用于 CAGED 指型的三音调整） */
export type ChordQuality = 'major' | 'minor'

/** CAGED 指型中的一个和弦音 */
export interface CagedChordTone {
  stringIndex: number
  fret: number
  role: string
}

/** CAGED 可移动指型 */
export interface CagedShape {
  form: string
  rootStringIndex: number
  rootFret: number
  windowStart: number
  windowEnd: number
  chordTones: CagedChordTone[]
  suggestedScale: ScaleType
}

;
export function getDegreeLabels(scaleType: ScaleType): string[] {
    const raw = SCALE_INTERVAL_DISPLAY[scaleType] ?? [];
    return raw.map((label)=>label.replace(/b/g, '♭').replace(/#/g, '♯'));
}
// ==================== 度数锚定把位 ====================
/** 五声类（≤6 音）窗口 5 品；七声类（≥7 音）窗口 4 品 */ function windowSpanOf(scaleType: ScaleType): number {
    const len = (SCALE_INTERVALS[scaleType] ?? []).length;
    return len <= 6 ? 4 : 3;
}
function buildDegreeMap(rootNote: number, scaleType: ScaleType): Map<number, number> {
    const intervals = SCALE_INTERVALS[scaleType] ?? [];
    const map = new Map<number, number>();
    intervals.forEach((interval, idx)=>{
        const pc = ((rootNote + interval) % 12 + 12) % 12;
        if (!map.has(pc)) map.set(pc, idx + 1); // 同名音取最低音级
    });
    return map;
}
function collectNotesInWindow(
    degreeByPC: Map<number, number>,
    rootNote: number,
    config: FretboardConfig,
    startFret: number,
    endFret: number
): PositionNote[] {
    const notes: PositionNote[] = [];
    // 最低音弦（高索引）→ 最高音弦（索引 0）
    for(let s = config.stringCount - 1; s >= 0; s--){
        const open = config.tuning[s];
        for(let f = startFret; f <= endFret; f++){
            const pc = ((open + f) % 12 + 12) % 12;
            const degree = degreeByPC.get(pc);
            if (degree === undefined) continue;
            notes.push({
                stringIndex: s,
                fret: f,
                pitchClass: pc,
                degree,
                isRoot: pc === rootNote,
                // 一指一品：空弦不按（0）。startFret=0 的开放把位没有「第 0 品手指」，
                // 食指实际落在 1 品，故窗口起点至少按 1 品计 —— 否则 1/2/3 品会整体偏移一位
                // （表现为开放把位显示成 2/3/4 = 中指/无名指/小指）。
                finger: f === 0 ? 0 : Math.min(4, Math.max(1, f - Math.max(startFret, 1) + 1))
            });
        }
    }
    return notes;
}
export function generateScalePositions(
    rootNote: number,
    scaleType: ScaleType,
    config: FretboardConfig,
    fretCount: number
): PositionWindow[] {
    const intervals = SCALE_INTERVALS[scaleType] ?? [];
    if (intervals.length === 0) return [];
    const span = windowSpanOf(scaleType);
    const lowString = config.stringCount - 1;
    const lowOpen = config.tuning[lowString];
    const degreeByPC = buildDegreeMap(rootNote, scaleType);
    // 主音在最低音弦的基准品（0-11）
    const tonicFret = ((rootNote - lowOpen) % 12 + 12) % 12;
    const positions: PositionWindow[] = [];
    intervals.forEach((interval, idx)=>{
        let anchor = tonicFret + interval;
        if (anchor + span > fretCount) anchor -= 12; // 越界降八度
        if (anchor < 0 || anchor + span > fretCount) return;
        const notes = collectNotesInWindow(degreeByPC, rootNote, config, anchor, anchor + span);
        if (notes.length === 0) return;
        positions.push({
            index: positions.length + 1,
            anchorDegree: idx + 1,
            startFret: anchor,
            endFret: anchor + span,
            notes
        });
    });
    return positions;
}
export function getScaleNotesInWindow(
    rootNote: number,
    scaleType: ScaleType,
    config: FretboardConfig,
    startFret: number,
    endFret: number
): PositionNote[] {
    const degreeByPC = buildDegreeMap(rootNote, scaleType);
    return collectNotesInWindow(degreeByPC, rootNote, config, startFret, endFret);
}
// 弦索引：0=1弦(E) 1=2弦(B) 2=3弦(G) 3=4弦(D) 4=5弦(A) 5=6弦(E)
interface CagedFormDef {
    form: string
    rootStringIndex: number
    windowBefore: number
    windowAfter: number
    offsets: { stringIndex: number; offset: number; role: string }[]
}

const CAGED_FORMS: CagedFormDef[] = [
    {
        form: 'E',
        rootStringIndex: 5,
        windowBefore: 0,
        windowAfter: 3,
        offsets: [
            {
                stringIndex: 5,
                offset: 0,
                role: 'root'
            },
            {
                stringIndex: 4,
                offset: 2,
                role: 'fifth'
            },
            {
                stringIndex: 3,
                offset: 2,
                role: 'root'
            },
            {
                stringIndex: 2,
                offset: 1,
                role: 'third'
            },
            {
                stringIndex: 1,
                offset: 0,
                role: 'fifth'
            },
            {
                stringIndex: 0,
                offset: 0,
                role: 'root'
            }
        ]
    },
    {
        form: 'D',
        rootStringIndex: 3,
        windowBefore: 0,
        windowAfter: 3,
        offsets: [
            {
                stringIndex: 3,
                offset: 0,
                role: 'root'
            },
            {
                stringIndex: 2,
                offset: 2,
                role: 'fifth'
            },
            {
                stringIndex: 1,
                offset: 3,
                role: 'root'
            },
            {
                stringIndex: 0,
                offset: 2,
                role: 'third'
            }
        ]
    },
    {
        form: 'C',
        rootStringIndex: 4,
        windowBefore: -2,
        windowAfter: 1,
        offsets: [
            {
                stringIndex: 4,
                offset: 0,
                role: 'root'
            },
            {
                stringIndex: 3,
                offset: -1,
                role: 'third'
            },
            {
                stringIndex: 2,
                offset: -3,
                role: 'fifth'
            },
            {
                stringIndex: 1,
                offset: -2,
                role: 'root'
            },
            {
                stringIndex: 0,
                offset: -3,
                role: 'third'
            }
        ]
    },
    {
        // A 指型和弦根音在 5 弦；其五声盒子窗口与 E/D 一样从根音品起（3 弦根音高 2 品）
        form: 'A',
        rootStringIndex: 4,
        windowBefore: 0,
        windowAfter: 3,
        offsets: [
            {
                stringIndex: 4,
                offset: 0,
                role: 'root'
            },
            {
                stringIndex: 3,
                offset: 2,
                role: 'fifth'
            },
            {
                stringIndex: 2,
                offset: 2,
                role: 'root'
            },
            {
                stringIndex: 1,
                offset: 2,
                role: 'third'
            },
            {
                stringIndex: 0,
                offset: 0,
                role: 'fifth'
            }
        ]
    },
    {
        form: 'G',
        rootStringIndex: 5,
        windowBefore: -3,
        windowAfter: 0,
        offsets: [
            {
                stringIndex: 5,
                offset: 0,
                role: 'root'
            },
            {
                stringIndex: 4,
                offset: -1,
                role: 'third'
            },
            {
                stringIndex: 3,
                offset: -3,
                role: 'fifth'
            },
            {
                stringIndex: 2,
                offset: -3,
                role: 'root'
            },
            {
                stringIndex: 1,
                offset: -3,
                role: 'third'
            },
            {
                stringIndex: 0,
                offset: 0,
                role: 'root'
            }
        ]
    }
];
export function isStandardSixStringGuitar(config: FretboardConfig): boolean {
    const std = [
        4,
        11,
        7,
        2,
        9,
        4
    ];
    return config.stringCount === 6 && config.tuning.length === 6 && std.every((v, i)=>config.tuning[i] === v);
}
export function getCagedShapes(
    rootNote: number,
    config: FretboardConfig,
    fretCount: number,
    quality: ChordQuality = 'major'
): CagedShape[] {
    if (!isStandardSixStringGuitar(config)) return [];
    const shapes: CagedShape[] = [];
    for (const def of CAGED_FORMS){
        const open = config.tuning[def.rootStringIndex];
        let rootFret = ((rootNote - open) % 12 + 12) % 12;
        // 窗口起点偏移为负的指型需要根音品足够高，否则升八度
        const minRootFret = -def.windowBefore;
        if (rootFret < minRootFret) rootFret += 12;
        const windowStart = rootFret + def.windowBefore;
        const windowEnd = rootFret + def.windowAfter;
        if (windowStart < 0 || windowEnd > fretCount) continue;
        const thirdShift = quality === 'minor' ? -1 : 0;
        const chordTones: CagedChordTone[] = [];
        for (const o of def.offsets){
            // offsets 是"相对根音品"的偏移（见 CAGED_FORMS 注释），必须叠加 rootFret 才是绝对品。
            // 原实现漏加 rootFret，导致 CAGED 指型图全部画在低把位（如 C 根音 E 型画成了开放 E 和弦）。
            const fret = rootFret + o.offset + (o.role === 'third' ? thirdShift : 0);
            if (fret < 0 || fret > fretCount) continue; // 小三度可能把三音挤出指板
            chordTones.push({
                stringIndex: o.stringIndex,
                fret,
                role: o.role
            });
        }
        if (chordTones.length === 0) continue;
        shapes.push({
            form: def.form,
            rootStringIndex: def.rootStringIndex,
            rootFret,
            windowStart,
            windowEnd,
            chordTones,
            suggestedScale: quality === 'major' ? ScaleType.majorPentatonic : ScaleType.minorPentatonic
        });
    }
    // 按窗口起点排序（低把位 → 高把位）
    shapes.sort((a, b) => a.windowStart - b.windowStart);
    return shapes;
}
/**
 * CAGED 五形状的**音位覆盖表**：整幅指板上每个格子各被哪些形状按到。
 *
 * 与 `getCagedShapes` 的分工：
 *   · `getCagedShapes` 给「**每个**形状**各自**一张把位图」（现在乐理面板用的分图样式）；
 *   · 本函数给「**五个**形状**叠在**一张指板上」的合并视图 —— 这正是「两个形状共用的音」
 *     能被看见的前提：共享音 = 同一格子同时被两个形状命中。
 *
 * ⚠️ 指型数据仍然**只有一份**（上面的 `CAGED_FORMS`）：这里只做两件事 ——
 *   ① 按根音**展开所有八度**；② 把 (弦,品) 合并成「形状列表」。
 *   任何一处指型偏移改了，分图与叠加图会同时跟着变（铁律 14）。
 *
 * 为什么要展开所有八度：低把位那个「负品」指型与高把位同形。以 C 根音为例，
 * D 形状在 rootFret=-2 与 rootFret=10 各出现一次，两者共同覆盖 (1弦,0)(2弦,1)(3弦,0) —— 
 * 这三格同时也是 C 形状的音位，于是成为 DC 双色格。只算一个八度就会漏掉一半共享音。
 */
export function getCagedFormCells(
    rootNote: number,
    config: FretboardConfig,
    fretCount: number,
    quality: ChordQuality = 'major'
): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (!isStandardSixStringGuitar(config)) return out;
    const thirdShift = quality === 'minor' ? -1 : 0;
    for (const def of CAGED_FORMS){
        const open = config.tuning[def.rootStringIndex];
        const baseRootFret = ((rootNote - open) % 12 + 12) % 12;
        const shifted = def.offsets.map((o)=>({
            stringIndex: o.stringIndex,
            offset: o.offset + (o.role === 'third' ? thirdShift : 0)
        }));
        const minOffset = Math.min(...shifted.map((o)=>o.offset));
        const maxOffset = Math.max(...shifted.map((o)=>o.offset));
        // 三个低八度足够覆盖任何「负品指型」的等价位置；实际落不进视窗的会在下一行被丢掉。
        for (let rootFret = baseRootFret - 36; rootFret <= fretCount + 12; rootFret += 12) {
            if (rootFret + maxOffset < 0 || rootFret + minOffset > fretCount) continue;
            for (const o of shifted){
                const fret = rootFret + o.offset;
                if (fret < 0 || fret > fretCount) continue;
                const key = `${o.stringIndex}-${fret}`;
                const list = out.get(key);
                if (!list) out.set(key, [
                    def.form
                ]);
                else if (!list.includes(def.form)) list.push(def.form);
            }
        }
    }
    return out;
}
