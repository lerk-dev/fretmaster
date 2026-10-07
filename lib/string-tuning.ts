// 当前调弦（半音值，高音→低音）。默认标准吉他。
// 历史上这是 app/page.tsx 的模块级 `let STRING_TUNING`，被组件在渲染期直接重赋值——
// ESM 导出绑定只读，抽出模块会失败，因此改为显式 getter/setter。
let tuning: number[] = [
    4,
    11,
    7,
    2,
    9,
    4
] // E B G D A E (high to low, as semitones from C)

export function getStringTuning(): number[] {
    return tuning
}

export function setStringTuning(t: number[]): void {
    tuning = t
}
