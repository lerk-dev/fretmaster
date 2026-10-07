/**
 * 歌曲和弦纯函数 + 调性解析（刚从 app/page.tsx 搬到 lib/）。
 *
 * 这两个函数（transposeSongChords / parseIrealPro）此前藏在组件里、零测试覆盖，
 * 但它们是**转调**这个核心乐理功能的实现，而且已经被搬到 lib/song-chords.ts。
 *
 * 这里还钉住一处**修复前的错误行为**（见 parseIrealPro 那组）：
 *   `if (parsed.root)` 这个守卫是恒真的 —— parseChord 对无法识别的输入会**回退**成
 *   `{ root: 'C', type: 'Major' }`，所以任何垃圾 token（iReal 的段落标记 T44/N1、
 *   或用户直接粘贴 irealbook:// URL）都会被静默变成 C 大三和弦塞进和弦列表。
 */
import { describe, it, expect } from 'vitest'
import { transposeSongChords, parseIrealPro, irealQualityToProjectType, extractIrealChords } from '@/lib/song-chords'
import { getKeyNote } from '@/lib/page-theory-functions'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'

type Song = (typeof SONG_PROGRESSIONS)[number]

/** 构造最小可用的歌曲对象（只用到 key 与 chords 两个字段） */
const song = (key: string, chords: string[]): Song =>
  ({ name: 'Test Song', key, chords } as unknown as Song)

describe('transposeSongChords', () => {
  it('已有自定义和弦时直接返回它（同一引用，忽略歌曲与调性）', () => {
    const custom = [{ root: 'F', type: 'maj7' }]
    const out = transposeSongChords(custom, song('C', ['Cmaj7']), 'D')
    expect(out).toBe(custom)
  })

  it('当前调性 == 歌曲调性：只解析，不转调', () => {
    const out = transposeSongChords([], song('C', ['Cmaj7', 'Am7', 'G7']), 'C')
    expect(out).toEqual([
      { root: 'C', type: 'maj7', bass: undefined },
      { root: 'A', type: 'm7', bass: undefined },
      { root: 'G', type: '7', bass: undefined },
    ])
  })

  it('当前调性 != 歌曲调性：根音按音程整体平移（C→D 即 +2 个半音）', () => {
    const out = transposeSongChords([], song('C', ['Cmaj7', 'Dm7']), 'D')
    expect(out.map((c) => c.root)).toEqual(['D', 'E'])
    // 和弦性质（后缀）必须原样保留
    expect(out.map((c) => c.type)).toEqual(['maj7', 'm7'])
  })

  it('小调歌曲：调性里的 m 后缀不参与转调（Am7 从 A 起算）', () => {
    const out = transposeSongChords([], song('Am', ['Am7', 'Dm7']), 'C')
    // A→C 是 +3 个半音：A→C、D→F
    expect(out.map((c) => c.root)).toEqual(['C', 'F'])
    expect(out.map((c) => c.type)).toEqual(['m7', 'm7'])
  })

  it('歌曲没有 key 字段时按 C 处理', () => {
    const out = transposeSongChords([], song('', ['Cmaj7']), 'D')
    expect(out[0].root).toBe('D')
  })

  it('当前调性无法识别时原样返回（transposeChord 的保护行为，不抛异常）', () => {
    const out = transposeSongChords([], song('C', ['Cmaj7']), 'H')
    expect(out).toEqual([{ root: 'C', type: 'maj7', bass: undefined }])
  })

  it('转调结果会保留低音/转位标记，且**低音跟着一起转**', () => {
    // 修复前：transposeChord 只替换根音，'C/G' 在 C→D 时得到 'D/G'（低音停在 G，音乐上是错的）。
    // 内置曲库目前没有斜杠和弦，所以这个错误此前不可见（潜在 bug）。
    const out = transposeSongChords([], song('C', ['C/G']), 'D')
    expect(out).toEqual([{ root: 'D', type: 'Major', bass: 'A' }])
  })

  it('低音是升号记谱时也一起转（C/F♯ → D/G♯）', () => {
    const out = transposeSongChords([], song('C', ['C/F♯']), 'D')
    expect(out).toEqual([{ root: 'D', type: 'Major', bass: 'G♯' }])
  })

  it('不改写入参（自定义和弦数组与歌曲和弦数组都保持原样）', () => {
    const chords = ['Cmaj7', 'Dm7']
    const s = song('C', chords)
    transposeSongChords([], s, 'E')
    expect(chords).toEqual(['Cmaj7', 'Dm7'])
    expect(s.key).toBe('C')
  })
})

describe('parseIrealPro', () => {
  it('解析 UI 提示里那种纯文本格式（CM7 | Am7 | Dm7 | G7）', () => {
    const out = parseIrealPro('CM7 | Am7 | Dm7 | G7')
    expect(out).toEqual([
      { root: 'C', type: 'M7' },
      { root: 'A', type: 'm7' },
      { root: 'D', type: 'm7' },
      { root: 'G', type: '7' },
    ])
  })

  it('空格、换行、制表符都能作为分隔符', () => {
    expect(parseIrealPro('Cmaj7\n\n  Am7\tG7')).toHaveLength(3)
  })

  it('跳过以 [ ] ( ) * 开头的段落标记', () => {
    const out = parseIrealPro('[Verse] *A (Fine) Cmaj7')
    expect(out).toEqual([{ root: 'C', type: 'maj7' }])
  })

  it('识别转位/低音标记', () => {
    expect(parseIrealPro('C/G')).toEqual([{ root: 'C', type: 'Major', bass: 'G' }])
  })

  it('空输入返回空数组', () => {
    expect(parseIrealPro('')).toEqual([])
    expect(parseIrealPro('   \n  ')).toEqual([])
  })

  it('非和弦 token 会被跳过，而不是被当成 C 大三和弦', () => {
    // 修复前：parseChord('T44') 回退成 { root:'C', type:'Major' }，
    // 而守卫 `if (parsed.root)` 恒真 → 这些垃圾 token 会被塞进和弦列表。
    // iReal Pro 的原生格式里就满是这类标记（T44 = 4/4 拍号、N1 = 段落）。
    expect(parseIrealPro('T44')).toEqual([])
    expect(parseIrealPro('N1')).toEqual([])
    expect(parseIrealPro('Cmaj7 T44 Am7')).toEqual([
      { root: 'C', type: 'maj7' },
      { root: 'A', type: 'm7' },
    ])
  })

  it('粘贴 irealbook:// URL：URL 片段被丢弃，但解析器**并不认识**这种格式', () => {
    // UI 的提示文案（i18n 的 ireal_textarea_placeholder）声称支持 irealbook:// 格式，
    // 但本解析器只做「按空白/竖线切分」，没有任何 URL 处理。
    // 修复前：连 URL 那一整段都会回退成 C 大三和弦，于是「导入成功」却得到一列表 C。
    const out = parseIrealPro('irealbook://Blue%20Bossa|C|C|Fmaj7')
    // URL 片段被丢弃了（它不以音名开头），剩下的和弦部分仍会被解析：
    expect(out).toEqual([
      { root: 'C', type: 'Major' },
      { root: 'C', type: 'Major' },
      { root: 'F', type: 'maj7' },
    ])
  })

  it('【已知残留问题】URL 里的普通单词会被误当成和弦', () => {
    // 这是"只按分隔符切分"的必然后果：URL 的元数据（曲名/作者）里任何以 A-G 开头的
    // 单词都会被 parseChord 当成和弦 —— 'Bossa' → 根音 B、后缀 'ossa'。
    // 也就是说提示文案里承诺的「irealbook:// URL 格式」实际不可用。
    // 未擅自实现 URL 解析（属功能开发），此处用测试如实记录现状。
    const out = parseIrealPro('irealbook://Blue Bossa|C|Fmaj7')
    expect(out.map((c) => c.root)).toEqual(['B', 'C', 'F'])
    expect(out[0]).toEqual({ root: 'B', type: 'ossa' })
  })
})

describe('getKeyNote（调性字符串 → 音名）', () => {
  it('普通大调直接返回', () => {
    expect(getKeyNote('C')).toBe('C')
    expect(getKeyNote('E')).toBe('E')
  })

  it('小调去掉 m 后缀', () => {
    expect(getKeyNote('Am')).toBe('A')
    expect(getKeyNote('F♯m')).toBe('F♯')
  })

  it('# 归一化为 ♯', () => {
    expect(getKeyNote('F#m')).toBe('F♯')
    expect(getKeyNote('C#')).toBe('C♯')
  })

  it('降号调映射为等音的升号（与页面其它地方保持同一套音名）', () => {
    expect(getKeyNote('B♭')).toBe('A♯')
    expect(getKeyNote('E♭m')).toBe('D♯')
    expect(getKeyNote('D♭')).toBe('C♯')
  })

  it('空字符串原样返回', () => {
    expect(getKeyNote('')).toBe('')
  })
})

// ------------------------------ irealQualityToProjectType 的兜底链

describe('irealQualityToProjectType：未收录写法的兜底链', () => {
  it('查表直接就有的写法（对照）', () => {
    expect(irealQualityToProjectType('^7')).toBe('Maj7')
    expect(irealQualityToProjectType('-7')).toBe('m7')
    expect(irealQualityToProjectType('  ^7  ')).toBe('Maj7')   // 先 trim
  })

  it('`^` 换成 maj 之后才落在表里（如 ^7b5 → maj7b5）', () => {
    expect(irealQualityToProjectType('^7b5')).toBe('maj7#11')
  })

  it('`-` 前缀的小调写法：`-6/9` → `m6/9` 命中查表', () => {
    expect(irealQualityToProjectType('-6/9')).toBe('m6add9')
  })

  it('`-` 前缀且换算后本身就是项目类型 → 直接放行（m9b5）', () => {
    expect(irealQualityToProjectType('-9b5')).toBe('m9b5')
  })

  it('两条兜底都不认识 → 原样返回，不硬猜成大三和弦', () => {
    expect(irealQualityToProjectType('-7#11')).toBe('-7#11')
    expect(irealQualityToProjectType('完全不是和弦')).toBe('完全不是和弦')
  })
})

describe('extractIrealChords：纯段落记号的 token 要被跳过', () => {
  it('`ZZZ` 这种「非独立成词、又会被剥成空串」的记号不会变成一个凭空和弦', () => {
    // ZZZ 紧挨着且全由段落字符组成：前面的通用清理（要求独立成词）匹配不到它，
    // 只有循环里剥完前缀/后缀后发现「空了就 continue」这一步能拦住它。
    expect(extractIrealChords('C^7 ZZZ')).toHaveLength(1)
    expect(extractIrealChords('C^7 ZZZ')[0]).toEqual({ root: 'C', type: 'Maj7' })
    expect(extractIrealChords('C^7')).toHaveLength(1)
  })
})
