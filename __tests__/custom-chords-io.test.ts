/**
 * 自定义和弦序列的存取纯逻辑（lib/custom-chords-io.ts，从 app/page.tsx 抽出）。
 *
 * 覆盖两块：
 *   parseStoredCustomChords —— localStorage 字符串 → 四种结果（含 JSON 损坏、SSR 无存储）
 *   buildCustomChordsExport —— 和弦列表 → 用户可见的导出文本
 *
 * 导出格式本身值得钉死：它会被写进剪贴板 / 下载成 .txt，用户可能再导入回来，
 * 所以「大三和弦省略后缀」和「低音用 /低音」这两条规则都要有测试。
 *
 * 已知不一致（**未修改**，见最后一条测试）：屏幕上显示和弦走的是
 * `getCurrentChordDisplay`，它对音名做了 normalizeNoteName（C# → C♯），
 * 而导出**没有**做。两者对同一个和弦会得到 'C♯m7' 与 'C#m7'。是否统一需要产品判断
 * （改导出会改变用户拿到的文本内容），故此处只用测试如实记录现状。
 */
import { describe, it, expect } from 'vitest'
import {
  parseStoredCustomChords,
  buildCustomChordsExport,
  CUSTOM_CHORD_STORAGE_KEY,
} from '@/lib/custom-chords-io'
import { formatChordShape, getChordDisplayName } from '@/lib/page-theory-functions'

const options = {
  name: '我的进行',
  unnamedLabel: '未命名',
  chordScaleDisplay: 'english_short' as const,
  chordSymbols: undefined,
}

describe('parseStoredCustomChords', () => {
  it('正常记录 → loaded（带名字与序列）', () => {
    const raw = JSON.stringify({
      name: '进行 A',
      sequence: [
        { root: 'C', type: 'maj7' },
        { root: 'A', type: 'm7' },
      ],
    })
    expect(parseStoredCustomChords(raw)).toEqual({
      kind: 'loaded',
      name: '进行 A',
      sequence: [
        { root: 'C', type: 'maj7' },
        { root: 'A', type: 'm7' },
      ],
    })
  })

  it('与页面保存格式形成往返：手动构造的 {name, sequence} 能被读回', () => {
    // 页面 saveCustomChords 写的就是 { name, sequence } 两个字段
    const saved = JSON.stringify({ name: 'X', sequence: [{ root: 'F', type: 'Major' }] })
    const r = parseStoredCustomChords(saved)
    expect(r.kind).toBe('loaded')
    if (r.kind === 'loaded') {
      expect(r.sequence).toEqual([{ root: 'F', type: 'Major' }])
      expect(r.name).toBe('X')
    }
  })

  it('缺 name 字段时名字回落为空串', () => {
    const r = parseStoredCustomChords(JSON.stringify({ sequence: [{ root: 'C', type: 'Major' }] }))
    expect(r).toMatchObject({ kind: 'loaded', name: '' })
  })

  it('null / undefined / 空串 → missing（含 SSR 取不到 localStorage 的情形）', () => {
    expect(parseStoredCustomChords(null).kind).toBe('missing')
    expect(parseStoredCustomChords(undefined).kind).toBe('missing')
    expect(parseStoredCustomChords('').kind).toBe('missing')
  })

  it('存过但序列为空 → empty（与 missing/invalid 区分开，页面提示不同的文案）', () => {
    expect(parseStoredCustomChords(JSON.stringify({ sequence: [] })).kind).toBe('empty')
    expect(parseStoredCustomChords(JSON.stringify({ name: 'x' })).kind).toBe('empty')
  })

  it('JSON 损坏 → invalid（不抛异常）', () => {
    expect(parseStoredCustomChords('{not json').kind).toBe('invalid')
    expect(parseStoredCustomChords('{"sequence": ').kind).toBe('invalid')
  })

  it('JSON 合法但不是对象（null / 数字 / 字符串）→ 走 empty，不抛异常', () => {
    // 注意 'null'：`data && data.sequence` 在 data === null 时**短路**，不会去取 .sequence，
    // 因此结果是 empty 而不是 invalid（我第一版把这条写成了 invalid，是预期写错，不是代码错）。
    expect(parseStoredCustomChords('null').kind).toBe('empty')
    expect(parseStoredCustomChords('123').kind).toBe('empty')
    expect(parseStoredCustomChords('"abc"').kind).toBe('empty')
  })

  it('键名常量是既有约定值', () => {
    expect(CUSTOM_CHORD_STORAGE_KEY).toBe('customChordSequence')
  })
})

describe('buildCustomChordsExport 在四种显示模式下都成立', () => {
  // 显示模式来自用户设置（chordScaleDisplay），所以这条规则必须在**每个模式**下都成立。
  // 只有 english_short 一种模式的覆盖是不够的：变异测试发现
  // 「去掉大三和弦省略后缀」这个变异在单模式下抓不住（见文件末尾说明）。
  const MODES = ['chinese', 'english', 'english_short', 'jazz'] as const

  for (const mode of MODES) {
    it(`${mode}：大三和弦只写根音，其他和弦保留该模式下的后缀`, () => {
      const m7Name = getChordDisplayName('m7', mode)
      const r = buildCustomChordsExport(
        [
          { root: 'C', type: 'Major' },
          { root: 'A', type: 'm7' },
        ],
        { ...options, chordScaleDisplay: mode }
      )
      const [first, second] = r.chords.split(' | ')
      expect(first).toBe('C') // 大三和弦不写后缀
      expect(second).toBe('A' + m7Name) // 非大三和弦保留后缀
    })
  }

  it('打印各模式下 Major / m7 的名字（供人工核对用）', () => {
    const names = MODES.map((m) => `${m}:Major=${JSON.stringify(getChordDisplayName('Major', m))},m7=${JSON.stringify(getChordDisplayName('m7', m))}`).join('  ')
    console.log('[探测] ' + names)
    expect(MODES.length).toBe(4)
  })
})

describe('buildCustomChordsExport', () => {
  it('大三和弦省略后缀（C 而不是 Cmajor）', () => {
    const major = getChordDisplayName('Major', 'english_short')
    const r = buildCustomChordsExport([{ root: 'C', type: 'Major' }], options)
    expect(major).toBeTruthy()
    expect(r.chords).toBe('C')
  })

  it('非大三和弦保留后缀', () => {
    const r = buildCustomChordsExport(
      [
        { root: 'A', type: 'm7' },
        { root: 'D', type: 'm7' },
      ],
      options
    )
    expect(r.chords).toBe('Am7 | Dm7')
  })

  it('低音/转位用 /低音 表示', () => {
    const r = buildCustomChordsExport(
      [
        { root: 'C', type: 'Major', bass: 'G' },
        // 用注册表的规范拼写 'Maj7'（CHORD_TYPES[].name）。真实数据只会是这个：
        // 编辑器的 parseChordSymbol 与 iReal 的 ^7 都会把 'maj7' 归一成 'Maj7'。
        { root: 'F', type: 'Maj7', bass: 'A' },
      ],
      options
    )
    expect(r.chords).toBe('C/G | FMaj7/A')
  })

  it('非规范拼写小写 maj7 与规范拼写 Maj7 渲染一致（2026-09-26 起的行为）', () => {
    // 历史：getChordDisplayName 原先对不在 DISPLAY_NAMES 表里的拼写**原样回退**，
    // 于是 'maj7'（表里的键是 'Maj7'）会输出小写 'Fmaj7'；而 'Maj7' 一直输出 'FMaj7'。
    // 同一个和弦两种拼写得到两种文本。现在先走 normalizeChordType 归一，两者一致。
    // 之所以不影响真实数据：parseChordSymbol / irealQualityToProjectKey 都已归一为 'Maj7'。
    const viaSymbol = buildCustomChordsExport([{ root: 'F', type: 'maj7' }], options)
    const viaName = buildCustomChordsExport([{ root: 'F', type: 'Maj7' }], options)
    expect(viaSymbol.chords).toBe(viaName.chords)
    expect(viaSymbol.chords).toBe('FMaj7')
    expect(getChordDisplayName('maj7', 'english_short')).toBe(getChordDisplayName('Maj7', 'english_short'))
    // 中文模式同理：两者都应是术语「大七和弦」，而不是原样回退成裸拼写
    expect(getChordDisplayName('maj7', 'chinese')).toBe('大七和弦')
  })

  it('完整文本 = 名字 + 换行 + 和弦串（第一行是名字）', () => {
    const r = buildCustomChordsExport(
      [
        { root: 'D', type: 'm7' },
        { root: 'G', type: '7' },
      ],
      options
    )
    expect(r.name).toBe('我的进行')
    expect(r.text).toBe('我的进行\nDm7 | G7')
    expect(r.text.split('\n')[0]).toBe('我的进行')
  })

  it('名字为空时用传入的占位文案', () => {
    const r = buildCustomChordsExport([{ root: 'C', type: 'Major' }], { ...options, name: '' })
    expect(r.name).toBe('未命名')
    expect(r.text.startsWith('未命名\n')).toBe(true)
  })

  it('单个和弦也能导出（不产生多余分隔符）', () => {
    expect(buildCustomChordsExport([{ root: 'C', type: 'Major' }], options).chords).toBe('C')
  })

  it('空列表 → 空和弦串（页面在调用前已挡掉空列表，这里只保证不抛）', () => {
    const r = buildCustomChordsExport([], options)
    expect(r.chords).toBe('')
    expect(r.text).toBe('我的进行\n')
  })

  it('不改写入参', () => {
    const chords = [{ root: 'C', type: 'Major' as const, bass: 'G' }]
    const before = JSON.parse(JSON.stringify(chords))
    buildCustomChordsExport(chords, options)
    expect(chords).toEqual(before)
  })

  it('导出与屏幕显示一致：音名都归一化为 ♯/♭（曾不一致，已统一）', () => {
    // 修复前：屏幕走 page.tsx 的 getCurrentChordDisplay（归一化）→ 'C♯m7'，
    // 导出自己拼一遍且漏了归一化 → 'C#m7'。现在两处都走
    // lib/page-theory-functions 的 formatChordShape（唯一真相源）。
    const r = buildCustomChordsExport([{ root: 'C#', type: 'm7' }], options)
    expect(r.chords).toBe('C♯m7')
  })

  it('与 formatChordShape 的输出逐字相同（回到唯一真相源）', () => {
    const chords = [
      { root: 'C#', type: 'm7' },
      { root: 'Bb', type: 'Major', bass: 'F#' },
    ]
    const viaExport = buildCustomChordsExport(chords, options).chords
    const viaFormatter = chords
      .map((c) => formatChordShape(c, options.chordScaleDisplay, options.chordSymbols))
      .join(' | ')
    expect(viaExport).toBe(viaFormatter)
  })
})

describe('formatChordShape（和弦显示的唯一真相源，定义在 page-theory-functions）', () => {
  const short = 'english_short' as const

  it('大三和弦省略后缀；其他和弦保留', () => {
    expect(formatChordShape({ root: 'C', type: 'Major' }, short)).toBe('C')
    expect(formatChordShape({ root: 'A', type: 'm7' }, short)).toBe('Am7')
  })

  it('音名归一化为 ♯/♭', () => {
    expect(formatChordShape({ root: 'C#', type: 'Major' }, short)).toBe('C♯')
    expect(formatChordShape({ root: 'Bb', type: 'Major' }, short)).toBe('B♭')
  })

  it('低音/转位带斜杠，且低音也归一化', () => {
    expect(formatChordShape({ root: 'C', type: 'Major', bass: 'G' }, short)).toBe('C/G')
    expect(formatChordShape({ root: 'C#', type: 'm7', bass: 'F#' }, short)).toBe('C♯m7/F♯')
  })

  it('没有低音时不产生多余斜杠', () => {
    expect(formatChordShape({ root: 'C', type: 'maj7' }, short)).not.toContain('/')
  })

  it('四种显示模式下都成立', () => {
    for (const mode of ['chinese', 'english', 'english_short', 'jazz'] as const) {
      expect(formatChordShape({ root: 'C', type: 'Major' }, mode)).toBe('C')
      expect(formatChordShape({ root: 'A', type: 'm7' }, mode)).toBe('A' + getChordDisplayName('m7', mode))
    }
  })
})
