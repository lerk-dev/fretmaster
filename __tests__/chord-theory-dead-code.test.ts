/**
 * lib/chord-theory.ts 死码护栏（2026-10-04 · 清理清单第 1 项 + 同族两处）。
 *
 * 背景：这个文件是死码重灾区（KNOWN-ISSUES「第四批」曾登记 4 个死分支 + getCacheKey），
 * 本次清理的三处全部**出生即死**（git 全历史 `-S` 搜索证明，见下），tsc 也未开
 * noUnusedLocals（全仓尚有 ~47 处 backlog，不能开）：
 *   · getCacheKey        —— 4f5cbbaf5（2026-05-14）引入；调用形态 `getCacheKey('` / `getCacheKey("`
 *     全历史零出现（各调用点一直自建内联 key），仅 `tsc --noUnusedLocals` 能看见。
 *   · chordTypeTokenCache —— 同提交引入；`.get` / `.set` 全历史零出现，只被
 *     `clearChordTheoryCache()` 里 `.clear()` 一次 ——「清一个从未写入的缓存」，
 *     **tsc 看不见这种形态**（标识符有出现，但全是 clear）。
 *   · slashNoteTokens    —— 首提交 935c4f945 起，`ChordParser.parse` 内死局部，从未读写。
 *
 * 为什么靠源码扫描而不是行为测试：这三类残留都不改变任何行为（缓存透明、死局部无副作用），
 * 行为测试永远测不出来；能测出来的只有「对源码做文本级不变量检查」——与
 * `no-dead-imports.test.ts`（137 处死导入清理的护栏）同一思路。
 *
 * 契约（两条不变量，均作用于**剥掉注释后**的纯代码，防注释里的名字制造假引用，铁律 20）：
 *   ① 顶层非导出声明：必须存在至少 1 处「非声明行、非 `.clear()`」的引用；
 *   ② 恰声明一次的局部 let/const：在别处必须还有出现（全文出现 ≥ 2 次）。
 * 判定粒度是「文件级文本引用」而非语义分析（同名变量跨函数会混计，故只对唯一声明名判 ②）——
 * 目标是把这类残留挡在引入时，不是替代 tsc。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const FILE = 'lib/chord-theory.ts'
const SOURCE = readFileSync(FILE, 'utf8')

// 剥掉行注释（//）与块注释（/* …… */），得到纯代码文本。
function stripComments(src: string): string {
  let inBlock = false
  return src
    .split('\n')
    .map((line) => {
      let out = ''
      let i = 0
      while (i < line.length) {
        if (inBlock) {
          const end = line.indexOf('*/', i)
          if (end === -1) return out
          inBlock = false
          i = end + 2
          continue
        }
        const block = line.indexOf('/*', i)
        const lineComment = line.indexOf('//', i)
        if (lineComment !== -1 && (block === -1 || lineComment < block)) {
          return out + line.slice(i, lineComment)
        }
        if (block !== -1) {
          out += line.slice(i, block)
          inBlock = true
          i = block + 2
          continue
        }
        return out + line.slice(i)
      }
      return out
    })
    .join('\n')
}

const CODE = stripComments(SOURCE)

/** name 在纯代码文本里的全部出现（1-based 行号 + 行文本）。 */
function occurrences(name: string): Array<{ line: number; text: string }> {
  const re = new RegExp(`\\b${name}\\b`)
  return CODE.split('\n')
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => re.test(text))
}

/** 该行是否为 name 的顶层声明行（function / const / let / class）。 */
function isDeclLine(name: string, text: string): boolean {
  return new RegExp(`^(?:function|const|let|class)\\s+${name}\\b`).test(text.trim())
}

describe('lib/chord-theory.ts 死码护栏（2026-10-04 清理后防复发）', () => {
  it('锚点自检：缓存系统区块标题与 ChordParser 都在（扫描目标漂移时直接失败，不得静默空转）', () => {
    expect(
      SOURCE,
      '「缓存系统」区块标题不见了——文件被大改，请同步本护栏的扫描逻辑'
    ).toContain('// ==================== 缓存系统 ====================')
    expect(SOURCE, 'ChordParser 类不见了——文件被大改，请同步本护栏').toContain(
      'export class ChordParser'
    )
  })

  it('顶层非导出声明必须有「读写」引用（仅定义、或只剩 .clear()，都算死）', () => {
    const topLevel = [...CODE.matchAll(/^(?:function|const|let|class)\s+(\w+)/gm)].map(
      (m) => m[1]
    )

    // 防呆：扫描必须抓到当前已知的 7 个（正则失效 / 结构漂移时失败，而不是空转通过）
    for (const expected of [
      'chordTypeTokenMap',
      'CHORD_TYPE_DISPLAY',
      'chordParseCache',
      'chordNotesCache',
      'chordDisplayCache',
      'MAX_CACHE_SIZE',
      'setCacheWithLRU',
    ]) {
      expect(topLevel, `顶层扫描没抓到 ${expected}——扫描正则或文件结构漂移`).toContain(expected)
    }

    for (const name of topLevel) {
      const live = occurrences(name).filter(
        ({ text }) => !isDeclLine(name, text) && !/\.clear\s*\(\s*\)/.test(text)
      )
      expect(
        live.length,
        `${name} 没有任何读/写引用（仅定义或仅 .clear()）——死声明：要么删掉，要么接上用途。` +
          `（2026-10-04 刚清掉同款三处：getCacheKey / chordTypeTokenCache / slashNoteTokens）`
      ).toBeGreaterThan(0)
    }
  })

  it('恰声明一次的局部 let/const 必须在别处被用到（死局部兜底，如曾有的 slashNoteTokens）', () => {
    const declNames = [...CODE.matchAll(/^\s+(?:let|const)\s+(\w+)/gm)].map((m) => m[1])
    const counts = new Map<string, number>()
    for (const n of declNames) counts.set(n, (counts.get(n) ?? 0) + 1)

    const once = [...counts.entries()].filter(([, c]) => c === 1).map(([n]) => n)
    expect(once.length, '局部扫描没抓到足够样本——扫描正则失效？').toBeGreaterThan(25)

    for (const name of once) {
      expect(
        occurrences(name).length,
        `${name} 声明后从未在别处出现——死局部，删掉（历史同款：slashNoteTokens，2026-10-04 已删）`
      ).toBeGreaterThan(1)
    }
  })
})
