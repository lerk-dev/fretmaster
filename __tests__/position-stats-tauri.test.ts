/**
 * lib/position-stats.ts 的 **Tauri 分支**契约测试。
 *
 * 同目录的 position-stats.test.ts 只覆盖了 Web（localStorage）那一半；`invoke(...)` 那半在
 * jsdom 下从未执行过 —— 这正是行覆盖停在 68% 的原因。而它偏是最容易**静默**出错的地方：
 *
 *   ① **命令名拼错** → invoke reject → 被 catch 吞掉 → 位置统计永远读写不了，界面毫无提示。
 *   ② **参数名拼错** → Tauri 只把命令**顶层**参数名转 camelCase；嵌套结构体字段由 serde 原样匹配。
 *   ③ **降级方向**：查询/清空类出错降级成空操作（页面照常渲染），但写入类失败**必须保留脏键**，
 *      否则用户练了一整天的位置数据会静默丢掉。
 *   ④ **幂等标志位**（loadedInstruments）在失败时是否正确回滚 —— 一次性失败不该让某乐器整会话读不到。
 *
 * 本文件同时补一条**跨语言参数名护栏**（命令名护栏已在 native-invoke-contract.test.ts 里覆盖
 * upsert/get/clear_position_stats）：运行期捕获前端实际发出的参数键，与 Rust `db_commands.rs` 的
 * 形参名逐一比对；嵌套的 `PositionStatEntry` 字段再单独比一次（它带 `#[serde(rename_all = "camelCase")]`）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))

type Mod = typeof import('@/lib/position-stats')
type Rec = { stringIndex: number; fret: number; total: number; correct: number }

const WEB_KEY = 'fretmaster-position-stats'
const GUITAR = 'six_string_guitar'
const BASS = 'four_string_bass'

const winLike = window as unknown as { __TAURI__?: boolean }

let store: Map<string, string>

/** 模块级状态（cache / loadedInstruments / dirtyKeys / flushTimer）跨用例存活，
 *  所以每条用例都要 `vi.resetModules()` 后重新 import 一份干净实例。 */
async function fresh(): Promise<Mod> {
  vi.resetModules()
  return await import('@/lib/position-stats')
}

function readStore(): Record<string, Record<string, Rec>> {
  return JSON.parse(store.get(WEB_KEY) ?? '{}')
}

/** invoke 收到过某命令的实参（第一条）。 */
function argsOf(cmd: string): Record<string, unknown> | undefined {
  const call = mocks.invoke.mock.calls.find((c) => c[0] === cmd)
  return call?.[1] as Record<string, unknown> | undefined
}

function invokeCount(cmd: string): number {
  return mocks.invoke.mock.calls.filter((c) => c[0] === cmd).length
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})

  store = new Map()
  const ls = window.localStorage as unknown as {
    getItem: ReturnType<typeof vi.fn>
    setItem: ReturnType<typeof vi.fn>
  }
  ls.getItem.mockReset().mockImplementation((k: string) => store.get(k) ?? null)
  ls.setItem.mockReset().mockImplementation((k: string, v: string) => {
    store.set(k, String(v))
  })

  winLike.__TAURI__ = true // 默认走 Tauri 分支；Web 用例自行删除
  mocks.invoke.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  // 逐条 try/catch：任一条失败不能拖累后面的清场（残留 __TAURI__ 会让后续用例走错分支）。
  const steps: Array<() => void> = [
    () => { delete winLike.__TAURI__ },
    () => vi.useRealTimers(),
    () => vi.restoreAllMocks(),
    () => { document.body.innerHTML = '' },
  ]
  for (const step of steps) {
    try { step() } catch { /* 忽略清场异常 */ }
  }
})

// ==================================================== 真机分支：命令名 / 参数名 / 返回值

describe('loadPositionStats（Tauri）', () => {
  it('发 get_position_stats 且参数名是 instrument；返回的行落进缓存并通知订阅者', async () => {
    mocks.invoke.mockResolvedValue([
      // Rust 侧 `PositionStatRecord` 带 #[serde(rename_all = "camelCase")] → 线上就是裸 camelCase
      { stringIndex: 3, fret: 7, total: 4, correct: 3 },
    ])
    const m = await fresh()
    const notify = vi.fn()
    m.subscribePositionStats(notify)

    await m.loadPositionStats(GUITAR)

    expect(mocks.invoke).toHaveBeenCalledWith('get_position_stats', { instrument: GUITAR })
    // 关键契约：TS 侧用 r.stringIndex 读（若 Rust 少了 rename_all，这里会读到 undefined）
    expect(m.getPositionStat(GUITAR, 3, 7)).toMatchObject({ stringIndex: 3, fret: 7, total: 4, correct: 3 })
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('同一乐器只读一次（loadedInstruments 幂等）', async () => {
    mocks.invoke.mockResolvedValue([])
    const m = await fresh()
    await m.loadPositionStats(GUITAR)
    await m.loadPositionStats(GUITAR)
    await m.loadPositionStats(GUITAR)
    expect(invokeCount('get_position_stats')).toBe(1)

    // 换乐器才会再读一次
    await m.loadPositionStats(BASS)
    expect(invokeCount('get_position_stats')).toBe(2)
  })

  it('读取失败：降级成空值（不抛），但**不**把该乐器永久标成已加载 —— 下次还能重试', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('db not ready'))
    const m = await fresh()

    await expect(m.loadPositionStats(GUITAR)).resolves.toBeUndefined()
    expect(m.getPositionStat(GUITAR, 0, 0)).toBeNull()

    // 回归：曾被永久标记 → 此后整会话都读不到该乐器的数据
    mocks.invoke.mockResolvedValue([{ stringIndex: 0, fret: 0, total: 2, correct: 1 }])
    await m.loadPositionStats(GUITAR)
    expect(invokeCount('get_position_stats')).toBe(2)
    expect(m.getPositionStat(GUITAR, 0, 0)).toMatchObject({ total: 2, correct: 1 })
  })
})

describe('flushPositionStats（Tauri）', () => {
  it('发 upsert_position_stats，按乐器分组、每组一条命令，entries 就是缓存里的记录', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 2, 5, true)
    m.recordPositionResult(GUITAR, 2, 5, false)
    m.recordPositionResult(BASS, 1, 3, true)

    await m.flushPositionStats()

    expect(invokeCount('upsert_position_stats')).toBe(2)
    const guitar = mocks.invoke.mock.calls.find(
      (c) => c[0] === 'upsert_position_stats' && (c[1] as { instrument: string }).instrument === GUITAR,
    )
    expect(guitar?.[1]).toEqual({
      instrument: GUITAR,
      entries: [{ stringIndex: 2, fret: 5, total: 2, correct: 1 }],
    })
    const bass = mocks.invoke.mock.calls.find(
      (c) => c[0] === 'upsert_position_stats' && (c[1] as { instrument: string }).instrument === BASS,
    )
    expect(bass?.[1]).toEqual({
      instrument: BASS,
      entries: [{ stringIndex: 1, fret: 3, total: 1, correct: 1 }],
    })
  })

  it('写成功后清掉脏标记：再 flush 一次不会重复发命令', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    await m.flushPositionStats()
    expect(invokeCount('upsert_position_stats')).toBe(1)

    await m.flushPositionStats()
    expect(invokeCount('upsert_position_stats')).toBe(1)
  })

  it('写失败：脏键保留，下次 flush 重试仍能把增量写进去（不丢数据）', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('disk full'))
    const m = await fresh()
    m.recordPositionResult(GUITAR, 4, 2, true)

    await expect(m.flushPositionStats()).resolves.toBeUndefined() // 失败静默，不抛给调用方

    // 恢复后重试 —— 若失败时清了脏键，这次就不发了，那些练习记录永久丢失
    await m.flushPositionStats()
    expect(invokeCount('upsert_position_stats')).toBe(2)
    expect(Object.keys(argsOf('upsert_position_stats')!).sort()).toEqual(['entries', 'instrument'])
  })

  it('flush 进行中并发清空该乐器 → 分组时记录已消失，不发 upsert、不抛错', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    mocks.invoke.mockClear()

    // flush 在 `await import('@tauri-apps/api/core')` 处让出；而 clearPositionStats 的
    // 缓存 / 脏键删除发生在它自己的第一个 await 之前 ⇒ 一定是同步先删掉。
    // 于是 flush 恢复后走到「按 instrument 分组」那一步时，cache.get(脏键) 已经是 undefined。
    const flushing = m.flushPositionStats()
    const clearing = m.clearPositionStats(GUITAR)

    // 不抛（flush 自己的 catch 会吞掉，但这里 flush 本就不该出错）
    await expect(flushing).resolves.toBeUndefined()
    await clearing.catch(() => { /* clear 的写盘部分可能因 mock 抖动失败，与本次断言无关 */ })

    // 关键断言：一条空记录都不该发出去（若没有 `if (!rec) return` 这道守卫，
    // entries 里会塞进 undefined，upsert 就会被调用）
    expect(
      mocks.invoke.mock.calls.filter((c) => c[0] === 'upsert_position_stats'),
    ).toEqual([])
    expect(m.getPositionStat(GUITAR, 0, 0)).toBeNull()
  })

  it('没有脏键时不发任何命令', async () => {
    const m = await fresh()
    await m.flushPositionStats()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

describe('clearPositionStats（Tauri）', () => {
  it('发 clear_position_stats（参数 instrument），并清掉该乐器的缓存与脏键', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    m.recordPositionResult(BASS, 1, 3, true)

    const notify = vi.fn()
    m.subscribePositionStats(notify)
    await m.clearPositionStats(GUITAR)

    expect(mocks.invoke).toHaveBeenCalledWith('clear_position_stats', { instrument: GUITAR })
    expect(m.getPositionStat(GUITAR, 0, 0)).toBeNull()
    expect(m.getPositionStat(BASS, 1, 3)).toMatchObject({ total: 1 })
    expect(notify).toHaveBeenCalledTimes(1)

    // 被清掉的乐器不再有脏键 → flush 只写另一个乐器
    await m.flushPositionStats()
    expect(invokeCount('upsert_position_stats')).toBe(1)
    expect((argsOf('upsert_position_stats') as { instrument: string }).instrument).toBe(BASS)
  })

  it('清空失败时静默（缓存已清、不抛），且不误伤其它乐器的待写增量', async () => {
    mocks.invoke.mockImplementation((cmd: string) => {
      if (cmd === 'clear_position_stats') return Promise.reject(new Error('locked'))
      return Promise.resolve(undefined)
    })
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    m.recordPositionResult(BASS, 1, 3, true)

    await expect(m.clearPositionStats(GUITAR)).resolves.toBeUndefined()
    await m.flushPositionStats()
    expect((argsOf('upsert_position_stats') as { instrument: string }).instrument).toBe(BASS)
  })
})

// ==================================================== 防抖写盘（与分支无关，但只在 Web 下可测定时器）

describe('防抖写盘 scheduleFlush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    delete winLike.__TAURI__ // Web 分支：flush 只碰 localStorage，不涉及动态 import
  })

  it('无论记多少次，同一个窗口内只建一个定时器，到点写一次盘', async () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const m = await fresh()

    m.recordPositionResult(GUITAR, 0, 0, true)
    m.recordPositionResult(GUITAR, 0, 1, false)
    m.recordPositionResult(GUITAR, 0, 2, true)

    const timers = setSpy.mock.calls.filter((c) => c[1] === 3000)
    expect(timers.length, '三次记录只该建一个 3s 防抖定时器').toBe(1)
    expect(store.has(WEB_KEY), '未到点不该写盘').toBe(false)

    await vi.advanceTimersByTimeAsync(3000)

    const s = readStore()
    expect(s[GUITAR]['0-0']).toMatchObject({ total: 1, correct: 1 })
    expect(s[GUITAR]['0-1']).toMatchObject({ total: 1, correct: 0 })
    expect(s[GUITAR]['0-2']).toMatchObject({ total: 1, correct: 1 })
  })

  it('定时器触发后复位：之后再记录会重新建一个定时器', async () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const m = await fresh()

    m.recordPositionResult(GUITAR, 0, 0, true)
    await vi.advanceTimersByTimeAsync(3000)

    m.recordPositionResult(GUITAR, 0, 1, true)
    expect(setSpy.mock.calls.filter((c) => c[1] === 3000).length).toBe(2)
    await vi.advanceTimersByTimeAsync(3000)
    expect(readStore()[GUITAR]['0-1']).toMatchObject({ total: 1 })
  })

  it('防抖写盘失败被自身 catch 吞掉（不会变成 unhandled rejection）', async () => {
    const errSpy = vi.mocked(console.error)
    const ls = window.localStorage as unknown as { setItem: ReturnType<typeof vi.fn> }
    ls.setItem.mockImplementation(() => { throw new Error('QuotaExceededError') })
    const m = await fresh()

    m.recordPositionResult(GUITAR, 0, 0, true)
    await vi.advanceTimersByTimeAsync(3000) // 返回 vi 自身（可链式），不是 Promise

    expect(ls.setItem).toHaveBeenCalled()
    // flushPositionStats 内部自己 try/catch，所以报错出自它的分支日志（scheduleFlush 外层那层
    // .catch 实际是防御性的 —— 该函数从不 reject）
    expect(errSpy).toHaveBeenCalledWith(expect.any(String), 'localStorage 位置统计写入失败', expect.any(Error))
  })
})

// ==================================================== Web 分支的边缘/失败路径

describe('Web 分支的边缘路径', () => {
  beforeEach(() => {
    delete winLike.__TAURI__
  })

  it('存储里是损坏的 JSON：load 降级成空值（不抛），且允许下次重试', async () => {
    store.set(WEB_KEY, '{ not json')
    const m = await fresh()

    await expect(m.loadPositionStats(GUITAR)).resolves.toBeUndefined()
    expect(m.getPositionStat(GUITAR, 0, 0)).toBeNull()

    store.set(WEB_KEY, JSON.stringify({ [GUITAR]: { '1-1': { stringIndex: 1, fret: 1, total: 3, correct: 2 } } }))
    await m.loadPositionStats(GUITAR)
    expect(m.getPositionStat(GUITAR, 1, 1)).toMatchObject({ total: 3, correct: 2 })
  })

  it('存储里是损坏的 JSON：clear 静默失败（不抛），缓存仍被清掉', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    store.set(WEB_KEY, '{ not json')

    await expect(m.clearPositionStats(GUITAR)).resolves.toBeUndefined()
    expect(m.getPositionStat(GUITAR, 0, 0)).toBeNull()
  })

  it('清空后 flush 不会把已清空的乐器写回（脏键已被 clear 一并清掉 ⇒ 走「无脏键」早退）', async () => {
    const m = await fresh()
    m.recordPositionResult(GUITAR, 0, 0, true)
    await m.clearPositionStats(GUITAR) // 缓存与脏键同时清掉
    store.delete(WEB_KEY)
    await m.flushPositionStats()
    expect(store.has(WEB_KEY)).toBe(false)
    // ⚠️ 这条走的是 flushPositionStats 第 88 行的「dirtyKeys.size === 0」早退，
    //    而不是 89-93 的「脏键还在、缓存已空」分支 —— 后者在公开 API 下不可达
    //    （recordPositionResult 必定同时写 cache 与脏键；clearPositionStats 必定同时删两者）。
  })

  it('页面卸载前强制写盘（防抖窗口内的数据不丢）', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const m = await fresh()
    const handler = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')?.[1] as () => void
    expect(typeof handler, '模块加载时就该注册 beforeunload 兜底').toBe('function')

    m.recordPositionResult(GUITAR, 5, 9, true)
    handler()

    // flushPositionStats 是异步的（Web 分支内无 await），刷几轮微任务即可见
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(readStore()[GUITAR]['5-9']).toMatchObject({ total: 1, correct: 1 })
  })
})

// ==================================================== 跨语言参数名护栏

const ROOT = process.cwd()
const RUST_CMD = path.join('src-tauri', 'src', 'commands', 'db_commands.rs')
const RUST_STATS = path.join('src-tauri', 'src', 'db', 'stats.rs')

/** 剥掉**整行**注释（否则被注释掉的注册/定义仍会被正则匹配，护栏会漏报）。 */
function stripLineComments(text: string): string {
  return text.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n')
}

/** `string_index` → `stringIndex`（Tauri 对**顶层**命令参数做的 camelCase 转换）。 */
function snakeToCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** 按**顶层**逗号切分参数表（`State<'_, AppState>` 里的逗号不能算分隔符）。 */
function splitTopLevelParams(params: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of params) {
    if (ch === '<' || ch === '(' || ch === '[') depth++
    else if (ch === '>' || ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

/** 解析 Rust 命令的形参名（排除 Tauri 注入的 state / app）。 */
function parseCommandParams(rustText: string): Map<string, string[]> {
  const text = stripLineComments(rustText)
  const out = new Map<string, string[]>()
  const re = /#\[tauri::command\]\s*pub\s+async\s+fn\s+([a-z_0-9]+)\s*\(([\s\S]*?)\)\s*->/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const params = splitTopLevelParams(m[2])
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split(':')[0].trim())
      .filter((n) => n && n !== 'state' && n !== 'app')
    out.set(m[1], params)
  }
  return out
}

/** 解析命名结构体的字段名，并按 `#[serde(rename_all)]` 推断实际线上键名。 */
function parseStructFields(rustText: string, structName: string): string[] | null {
  const text = stripLineComments(rustText)
  const re = new RegExp(`((?:#\\[[^\\]]*\\]\\s*)*)pub\\s+struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`)
  const m = re.exec(text)
  if (!m) return null
  const renameAll = /rename_all\s*=\s*"([a-zA-Z_]+)"/.exec(m[1])?.[1]
  const fields: string[] = []
  for (const line of m[2].split('\n')) {
    const f = /^\s*pub\s+([a-z_0-9]+)\s*:/.exec(line)
    if (f) fields.push(renameAll === 'camelCase' ? snakeToCamel(f[1]) : f[1])
  }
  return fields
}

const POSITION_COMMANDS = ['upsert_position_stats', 'get_position_stats', 'clear_position_stats'] as const

/** 前端每个直连后端位置统计命令的调用方式。 */
const FRONTEND_CALLS: Array<[string, () => Promise<unknown>]> = [
  [
    'upsert_position_stats',
    async () => {
      const m = await fresh()
      m.recordPositionResult(GUITAR, 2, 5, true)
      return m.flushPositionStats()
    },
  ],
  ['get_position_stats', async () => (await fresh()).loadPositionStats(GUITAR)],
  ['clear_position_stats', async () => (await fresh()).clearPositionStats(GUITAR)],
]

describe('跨语言护栏：position-stats 的 invoke 参数名必须与 Rust 形参一致', () => {
  const rustCmdText = (): string => fs.readFileSync(path.join(ROOT, RUST_CMD), 'utf8')
  const rustStatsText = (): string => fs.readFileSync(path.join(ROOT, RUST_STATS), 'utf8')

  describe('护栏自测（防止护栏自己失效后恒真通过）', () => {
    it('只从 #[tauri::command] 函数里取形参，并剔除 state/app、按顶层逗号切分', () => {
      const fake = [
        '#[tauri::command]',
        'pub async fn do_thing(',
        '    app: AppHandle,',
        "    state: State<'_, AppState>,",
        '    instrument: String,',
        '    entries: Vec<stats::PositionStatEntry>,',
        ') -> Result<(), String> {',
        '    Ok(())',
        '}',
      ].join('\n')
      expect(parseCommandParams(fake).get('do_thing')).toEqual(['instrument', 'entries'])
    })

    it('整行注释掉的命令定义不算数（含单行形式）', () => {
      const multi = ['// #[tauri::command]', '// pub async fn hidden() -> Result<(), String> {'].join('\n')
      expect(parseCommandParams(multi).size).toBe(0)
      // 单行形式才是真考验：若不先剥注释，正则会在 `// …` 内部匹配到
      // `#[tauri::command] pub async fn`，把注释掉的命令当成有效定义（护栏静默漏报）
      const single = '// #[tauri::command] pub async fn hidden2() -> Result<(), String> {'
      expect(parseCommandParams(single).size).toBe(0)
    })

    it('结构体字段按 rename_all 推断线上键名', () => {
      const snake = 'pub struct S {\n    pub string_index: i32,\n}'
      expect(parseStructFields(snake, 'S')).toEqual(['string_index'])

      const camel =
        '#[derive(Debug, Clone, Serialize, Deserialize)]\n#[serde(rename_all = "camelCase")]\n' +
        'pub struct S {\n    pub string_index: i32,\n    pub fret: i32,\n}'
      expect(parseStructFields(camel, 'S')).toEqual(['stringIndex', 'fret'])

      expect(parseStructFields(snake, 'Nope')).toBeNull()
    })

    it('snakeToCamel 处理多下划线', () => {
      expect(snakeToCamel('string_index')).toBe('stringIndex')
      expect(snakeToCamel('fret')).toBe('fret')
      expect(snakeToCamel('notch50')).toBe('notch50')
    })

    it('按顶层逗号切分：泛型里的逗号不算分隔符', () => {
      expect(splitTopLevelParams("state: State<'_, AppState>, instrument: String"))
        .toEqual(["state: State<'_, AppState>", ' instrument: String'])
      expect(splitTopLevelParams('')).toEqual([''])
    })
  })

  it('每个前端函数发出的命令与参数键，都能对上 Rust 的形参', async () => {
    const params = parseCommandParams(rustCmdText())
    const rustParams = params.get('upsert_position_stats')
    expect(rustParams, 'db_commands.rs 里解析不到 upsert_position_stats，护栏可能已失效').toBeTruthy()
    expect(rustParams).toContain('instrument')

    const problems: string[] = []
    for (const [cmd, call] of FRONTEND_CALLS) {
      mocks.invoke.mockClear()
      await call()
      const called = mocks.invoke.mock.calls.find((c) => c[0] === cmd)
      if (!called) {
        problems.push(`${cmd}: 前端没有发出该命令（实际发出 ${mocks.invoke.mock.calls.map((c) => String(c[0])).join(',') || '无'}）`)
        continue
      }
      const expected = (params.get(cmd) ?? []).map(snakeToCamel).sort()
      if (expected.length === 0) {
        problems.push(`${cmd}: Rust db_commands.rs 里找不到该命令`)
        continue
      }
      const actual = Object.keys((called[1] ?? {}) as Record<string, unknown>).sort()
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        problems.push(`${cmd}: 前端发送 ${JSON.stringify(actual)}，Rust 形参要求 ${JSON.stringify(expected)}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('三个位置统计命令都在 Rust 端存在且已注册（命令名护栏的正向补充）', () => {
    const params = parseCommandParams(rustCmdText())
    for (const cmd of POSITION_COMMANDS) {
      expect(params.has(cmd), `db_commands.rs 缺 ${cmd}`).toBe(true)
    }
    const main = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8')
    const start = main.indexOf('generate_handler!')
    const block = stripLineComments(main.slice(start, main.indexOf('])', start)))
    for (const cmd of POSITION_COMMANDS) {
      expect(block, `main.rs 未注册 ${cmd}`).toContain(cmd)
    }
  })

  it('upsert 的嵌套 entries 字段名与 Rust PositionStatEntry 一致（Tauri 不转换嵌套字段）', async () => {
    const fields = parseStructFields(rustStatsText(), 'PositionStatEntry')
    expect(fields, 'stats.rs 里找不到 PositionStatEntry').not.toBeNull()
    expect(fields!.length, 'PositionStatEntry 字段解析为 0 个，护栏可能已失效').toBe(4)

    mocks.invoke.mockClear()
    const m = await fresh()
    m.recordPositionResult(GUITAR, 2, 5, true)
    await m.flushPositionStats()

    const entries = (argsOf('upsert_position_stats') as { entries: Array<Record<string, unknown>> }).entries
    expect(Object.keys(entries[0]).sort()).toEqual([...fields!].sort())
  })
})
