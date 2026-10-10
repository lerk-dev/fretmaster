/**
 * lib/i18n.ts 的契约测试（此前零测试）。
 *
 * i18n 表是「所有界面文案」的真相源（两个语言块各 1143 个键）。
 * 最要紧的两条：
 *  ① 两种语言的**键集必须完全一致** —— 少一个键，该语言下就会回退显示 key 本身；
 *  ② 数据里被 `t(level.nameKey)` 引用的键必须真实存在 —— 否则等级选择器会显示
 *     'level_random_inversions' 这样的原始 key（本轮修了 12 处此类问题，见提交说明）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TRANSLATIONS, createTranslator, translateOr } from '@/lib/i18n'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import { SCALE_PRACTICE_SEQUENCES } from '@/lib/page-theory-data'

const zh = TRANSLATIONS['zh-CN'] as Record<string, string>
const en = TRANSLATIONS['en'] as Record<string, string>

// ---------------------------------------------------- 表结构

describe('i18n 表结构', () => {
  it('包含 zh-CN 与 en 两个语言块', () => {
    expect(Object.keys(TRANSLATIONS).sort()).toEqual(['en', 'zh-CN'])
  })

  it('两种语言的键集完全一致（少键会回退显示原始 key）', () => {
    const onlyZh = Object.keys(zh).filter(k => !(k in en))
    const onlyEn = Object.keys(en).filter(k => !(k in zh))
    expect(onlyZh, `仅 zh 有: ${onlyZh.join(', ')}`).toEqual([])
    expect(onlyEn, `仅 en 有: ${onlyEn.join(', ')}`).toEqual([])
  })

  it('没有重复键（对象字面量重复键会被静默覆盖）', () => {
    // 以源码为准无法直接检测（对象已去重）；此处保证规模量级，防止误删整段
    expect(Object.keys(zh).length).toBeGreaterThan(1000)
    expect(Object.keys(en).length).toBe(Object.keys(zh).length)
  })

  it('所有值都是非空字符串', () => {
    const badZh = Object.entries(zh).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k)
    const badEn = Object.entries(en).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k)
    expect(badZh).toEqual([])
    expect(badEn).toEqual([])
  })

  it('带 {placeholder} 的键，两种语言的占位符集合必须一致', () => {
    const placeholders = (s: string) => (s.match(/\{[^}]*\}/g) ?? []).sort()
    const mismatched: string[] = []
    for (const k of Object.keys(zh)) {
      const a = placeholders(zh[k])
      const b = placeholders(en[k] ?? '')
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatched.push(`${k}: zh=${JSON.stringify(a)} en=${JSON.stringify(b)}`)
    }
    expect(mismatched, mismatched.join(' | ')).toEqual([])
  })
})

// ---------------------------------------------------- 数据引用的键必须存在

describe('数据里引用的 i18n 键必须存在', () => {
  it('57 个练习等级的 nameKey 在 zh 与 en 里都存在', () => {
    // 钉住修复：此前有 12 个等级的 nameKey 指向不存在的键
    // （如 'level_random_inversions'、'level_chord_scale_random_st' 这类被截断/改写的名字），
    // 后果是等级选择器显示成原始 key。
    const missingZh: string[] = []
    const missingEn: string[] = []
    for (const l of ALL_PRACTICE_LEVELS) {
      if (!l.nameKey) { missingZh.push(`${l.id}: 无 nameKey`); continue }
      if (!(l.nameKey in zh)) missingZh.push(`${l.id} → '${l.nameKey}'`)
      if (!(l.nameKey in en)) missingEn.push(`${l.id} → '${l.nameKey}'`)
    }
    expect(missingZh, `\n${missingZh.join('\n')}`).toEqual([])
    expect(missingEn, `\n${missingEn.join('\n')}`).toEqual([])
  })

  it('每个等级的 nameKey 互不相同（否则两课显示同一标题）', () => {
    const keys = ALL_PRACTICE_LEVELS.map(l => l.nameKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('如实记录：SCALE_PRACTICE_SEQUENCES 的 4 个 nameKey 不在 i18n（且该字段无消费者）', () => {
    // scale-controls.tsx:242 用的是 `seq.id === 'random' ? t('random') : seq.name`，
    // 从不读 nameKey —— 所以这 4 个缺失不影响界面；属冗余死字段。
    const missing = SCALE_PRACTICE_SEQUENCES
      .filter(s => !(s.nameKey in zh))
      .map(s => s.nameKey)
      .sort()
    expect(missing).toEqual(['scale_seq_1to1', 'scale_seq_3to3', 'scale_seq_5to5', 'scale_seq_7to7'])
  })
})

// ---------------------------------------------------- 死键（P3-12）

describe('死键：i18n 里不应有「定义了但全仓无调用方」的键', () => {
  // 🚨 P3-12：本轮清掉了 5 类死键（ireal 成败 ×2 / device_count_detected /
  //    stats_sync_success / error_boundary_* ×5，共 9 个键）。死键的危害是双重的：
  //    ① 误导维护者以为某功能在用它（实际 UI 走了别的路径或组件内建词表）；
  //    ② 改文案时白改，用户看不到任何变化。
  //
  // ⚠️ 现状：全仓仍存量 **大量** 无字面引用的键（本轮实测 604 个）。它们分两类：
  //    ① 真死键（历史功能已删/未接线）；
  //    ② 动态/间接引用（经 `nameKey` 字段、`t(\`level_${id}\`)` 模板、数据文件驱动）。
  //    静态扫描无法区分两者 —— 所以**本轮不做批量删除**（风险面太大、收益不明）。
  //    这里改为**回归钉死当前数量**：新增死键会立刻让数量上升而变红，逼迫新增者
  //    要么真的接上调用方、要么显式把上限抬高（抬高动作本身就是一次人工复核）。
  //    与其假装「零死键」，不如如实记录存量并阻止其增长。
  const DEAD_KEY_BUDGET = 604

  it('死键数量不超过已登记预算（新增死键会红；清理后可下调预算）', () => {
    const root = path.resolve(__dirname, '..')
    const exts = ['.ts', '.tsx']
    const skipDirs = new Set(['node_modules', '.next', '.git', 'out', 'local-only', 'coverage', 'src-tauri', 'dist-tauri'])
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (skipDirs.has(e.name) || e.name.startsWith('.')) continue
          walk(path.join(dir, e.name))
        } else if (exts.some(x => e.name.endsWith(x))) {
          files.push(path.join(dir, e.name))
        }
      }
    }
    walk(root)
    // 排除 i18n.ts 自身（定义处必然含键名）与测试文件（测试里的引用不算生产调用方）。
    const corpus = files
      .filter(f => !f.endsWith(path.join('lib', 'i18n.ts')))
      .filter(f => !f.includes(`${path.sep}__tests__${path.sep}`))
      .map(f => fs.readFileSync(f, 'utf8'))
      .join('\n')

    const dead: string[] = []
    for (const k of Object.keys(zh)) {
      // 判据：源码里出现 `'key'` 或 `"key"`（引号包裹的字面量）。
      if (!corpus.includes(`'${k}'`) && !corpus.includes(`"${k}"`)) dead.push(k)
    }
    expect(
      dead.length,
      `死键数量 ${dead.length} 超过预算 ${DEAD_KEY_BUDGET}。新增的死键：请接上调用方，或（确认无害后）抬高 DEAD_KEY_BUDGET。\n前 40 个：\n${dead.slice(0, 40).join('\n')}`
    ).toBeLessThanOrEqual(DEAD_KEY_BUDGET)
  })

  it('本轮清掉的 9 个死键不会再出现（P3-12 回归）', () => {
    // 这 9 个键是**确证**死键：对应功能要么走了别的路径（ErrorBoundary 用组件内建词表、
    // 和弦导入只用 title/help/btn），要么根本没有消费者（device_count_detected /
    // stats_sync_success 在 UI 里被更具体的键取代）。它们不该被重新加回来。
    for (const k of [
      'ireal_import_success', 'ireal_import_error',
      'device_count_detected', 'stats_sync_success',
      'error_boundary_title', 'error_boundary_component', 'error_boundary_default',
      'error_boundary_retry', 'error_boundary_details',
    ]) {
      expect(k in zh, `${k} 已被确证为死键并删除，不应重新加回`).toBe(false)
      expect(k in en, `${k} 已被确证为死键并删除，不应重新加回`).toBe(false)
    }
  })
})

// ---------------------------------------------------- 内容质量
describe('内容质量（防漏翻译）', () => {
  it('中文块里不应出现「整句英文」（符号/缩写类短值除外）', () => {
    // 曾有 'chord_scale_random_scale_tone' 的中文值是整句英文（本轮已修）。
    // 判据：值里含空格且长度 > 15 且全是 ASCII 字母/空格/标点 —— 这类在中文块里必是漏翻。
    const suspicious = Object.entries(zh)
      .filter(([, v]) => v.includes(' ') && v.trim().length > 15 && /^[A-Za-z0-9 ,.'’\-()/&%!?:;+]+$/.test(v.trim()))
      .map(([k, v]) => `${k}='${v}'`)
    expect(suspicious, `\n${suspicious.join('\n')}`).toEqual([])
  })

  it('两种语言里允许存在少量「值完全相同」的键（符号/编号/专名）', () => {
    const identical = Object.keys(zh).filter(k => zh[k] === en[k])
    // 实测若干，例如 level_single_root='1'、shortcuts_esc='Esc'
    expect(identical.length).toBeLessThan(60)
    for (const k of identical) {
      // 相同值应当短（不是整句话）
      expect(zh[k].length, `${k}='${zh[k]}'`).toBeLessThanOrEqual(12)
    }
  })
})

// ---------------------------------------------------- translateOr：t() 的真兜底

describe('translateOr —— t() 的真兜底（别再用 `t(k) || fallback`）', () => {
  const t = createTranslator('zh-CN')

  it('键存在时返回译文', () => {
    expect(translateOr(t, 'level_root', 'FALLBACK')).toBe(zh['level_root'])
  })

  it('键缺失时返回 fallback，而不是键名本身', () => {
    expect(translateOr(t, 'no_such_key_xyz', 'FALLBACK')).toBe('FALLBACK')
  })

  it('对照：朴素的 `t(k) || fallback` 是假兜底（把键名当成了有效值）', () => {
    // 这就是本仓库的铁律之一：t() 缺键返回**键名本身**（真值），`||` 永远命不中兜底。
    expect(t('no_such_key_xyz') || 'FALLBACK').toBe('no_such_key_xyz')
  })

  it('fallback 是空串时也照样生效（不会退化成键名）', () => {
    // 对应「查不到 level 就显示 level id」那类调用：fallback 本身可能就是空串。
    expect(translateOr(t, 'no_such_key_xyz', '')).toBe('')
    expect(t('no_such_key_xyz') || '').toBe('no_such_key_xyz')
  })

  it('语言代码为空/undefined 时回退 zh-CN；未知语言码则整体退化为键名（→ 走兜底）', () => {
    expect(translateOr(createTranslator(''), 'level_root', 'FALLBACK')).toBe(zh['level_root'])
    expect(translateOr(createTranslator(null), 'level_root', 'FALLBACK')).toBe(zh['level_root'])
    expect(translateOr(createTranslator('fr'), 'level_root', 'FALLBACK')).toBe('FALLBACK')
  })
})

// ---------------------------------------------------- level_desc 键 ↔ 等级 id

describe('level_desc 键与 57 个等级一一对应（选择器与详情弹窗都按 id 直接拼键）', () => {
  it('每个 level.id 在 zh 与 en 里都有 level_desc_<id>', () => {
    const missing: string[] = []
    for (const l of ALL_PRACTICE_LEVELS) {
      const key = `level_desc_${l.id}`
      if (!(key in zh)) missing.push(`${l.id} → 缺 zh 的 '${key}'`)
      if (!(key in en)) missing.push(`${l.id} → 缺 en 的 '${key}'`)
    }
    expect(missing, `\n${missing.join('\n')}`).toEqual([])
  })

  it('没有多余的 level_desc_ 键（防 id 改名后留下孤儿译文，悄悄累积）', () => {
    const ids = new Set(ALL_PRACTICE_LEVELS.map(l => l.id))
    const orphans = Object.keys(zh).filter(
      k => k.startsWith('level_desc_') && !ids.has(k.slice('level_desc_'.length))
    )
    expect(orphans, `\n${orphans.join('\n')}`).toEqual([])
  })

  it('等级 id 全部不含短横线 —— 所以拼接时必须直接用 id，不能做 .replace(/-/g,"_")', () => {
    // 曾写成 `level_desc_${level.id.replace(/-/g, '_')}`：因为 id 全是下划线，这是
    // 无副作用的死代码，但它是「两条拼接路径可能分叉」的隐患（若有人引入带短横线的 id，
    // 选择器与详情弹窗会查不同的键）。这里钉住前提，真出现短横线 id 时立刻报警。
    const dashed = ALL_PRACTICE_LEVELS.filter(l => l.id.includes('-')).map(l => l.id)
    expect(dashed, `等级 id 不允许含短横线: ${dashed.join(', ')}`).toEqual([])
  })
})

// ---------------------------------------------------- 假兜底源码护栏

describe('假兜底护栏：组件里不得再出现 `t(...) || fallback`', () => {
  const ROOT = process.cwd()

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(entry.name)) out.push(full)
    }
    return out
  }

  const files = [...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'app'))]

  it('扫描面足够大（防止目录改名后护栏恒真）', () => {
    expect(files.length).toBeGreaterThan(80)
  })

  it('没有 `t(...) || <兜底>` 这种永远不生效的写法', () => {
    const offenders: string[] = []
    // 单行内 `t(...)` 紧跟 `||`。真正的兜底请用 translateOr()。
    const re = /\bt\([^;\n]*\)\s*\|\|/
    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/')
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '') // 忽略行尾注释（文档里会举例）
        if (re.test(code)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders, `\n${offenders.join('\n')}`).toEqual([])
  })
})
