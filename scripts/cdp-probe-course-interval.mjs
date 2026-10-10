/**
 * 真机探针：验证「课程启动 → 音程练习」注入的是不是课程要求的那个音程。
 *
 * 做法：往 localStorage 的 zustand persist 里塞一个 courseLaunch 请求（模拟点
 * 「进入练习」），reload 让页面消费它，然后读回 `intervalPractice.selectedIntervals`
 * （该字段是 INTERVALS 下标）与页面上实际显示的音程文本。
 *
 * ⚠️ 必须有「课程面板」的产物才有效 —— 课程只在 router-course 分支，所以要对
 * 路由器版（或本地 router-course 构建）跑，别对 Pages（main 构建）跑。
 *
 * 用法（本环境 exe 无法跨 bash 命令存活 ⇒ 起 Chrome 与跑探针写在同一条命令里）：
 *   PROBE_URL=http://192.168.123.2/fretmaster/ node scripts/cdp-probe-course-interval.mjs
 *   小样本冒烟：PROBE_SYMBOLS=b3,3,7 PROBE_URL=... node scripts/cdp-probe-course-interval.mjs
 */
import { readFileSync } from 'node:fs'

const PORT = 9222
const PAGE_URL = process.env.PROBE_URL || 'http://127.0.0.1:8099/'
const STORE_KEY = 'fretmaster-store'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 从源码解析 INTERVALS（保证与被测代码同源，不手抄） */
function parseIntervals() {
  const src = readFileSync('lib/page-theory-data.ts', 'utf8')
  const m = src.match(/export const INTERVALS = \[([\s\S]*?)\n\]/)
  if (!m) throw new Error('未能从 lib/page-theory-data.ts 解析 INTERVALS')
  const out = []
  const re = /\{\s*name:\s*"([^"]+)"\s*,\s*semitones:\s*(-?\d+)\s*,\s*symbol:\s*"([^"]+)"\s*\}/g
  let x
  while ((x = re.exec(m[1]))) out.push({ name: x[1], semitones: Number(x[2]), symbol: x[3] })
  if (out.length === 0) throw new Error('INTERVALS 解析结果为空')
  return out
}

const INTERVALS = parseIntervals()

async function waitForDevtools(timeoutMs = 25000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return await r.json()
    } catch {}
    await sleep(300)
  }
  throw new Error('DevTools 端口未就绪')
}

async function newTarget(url) {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!r.ok) throw new Error(`创建 target 失败: ${r.status}`)
  return await r.json()
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
  }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      ws.onopen = res
      ws.onerror = () => rej(new Error('WebSocket 连接失败'))
    })
    const c = new CDP(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && c.pending.has(msg.id)) {
        const { res, rej, timer } = c.pending.get(msg.id)
        clearTimeout(timer)
        c.pending.delete(msg.id)
        if (msg.error) rej(new Error(JSON.stringify(msg.error)))
        else res(msg.result)
      }
    }
    return c
  }
  send(method, params = {}, timeoutMs = 20000) {
    const id = ++this.id
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rej(new Error(`CDP 超时: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { res, rej, timer })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
    return r.result.value
  }
}

/** 注入 courseLaunch 请求 + 把 selectedIntervals 重置成哨兵 [0] */
const INJECT = (symbols) => `
(function () {
  const KEY = ${JSON.stringify(STORE_KEY)}
  const raw = localStorage.getItem(KEY)
  let parsed = { state: {}, version: 2 }
  try { parsed = JSON.parse(raw || 'null') || parsed } catch (e) { parsed = { state: {}, version: 2 } }
  if (!parsed.state) parsed.state = {}
  parsed.state.activeTab = 'interval'
  parsed.state.intervalPractice = Object.assign({}, parsed.state.intervalPractice || {}, {
    selectedIntervals: [0],           // 哨兵：注入前先清空成「根音」
    rootMode: 'fixed',
    rootNote: 'A',
    findRootFirst: true,
    direction: 'up',
  })
  parsed.state.courseLaunch = {
    nonce: Date.now(),
    tab: 'interval',
    intervals: ${JSON.stringify(symbols)},
    rootMode: 'fixed',
    rootNote: 'A',
    findRootFirst: true,
    direction: 'up',
  }
  localStorage.setItem(KEY, JSON.stringify(parsed))
  return 'injected'
})()
`

/** 读回结果：selectedIntervals + 页面上出现的音程文本 */
const READBACK = `
(function () {
  const KEY = ${JSON.stringify(STORE_KEY)}
  let sel = null, launch = null
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null')
    sel = (p && p.state && p.state.intervalPractice && p.state.intervalPractice.selectedIntervals) || null
    launch = (p && p.state && p.state.courseLaunch) || null
  } catch (e) {}
  // 页面上可见文本里出现的音程度数记号
  const seen = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const re = /(?:♭|♯|b|#)?(?:bb)?[0-9]+/g
  let n
  while ((n = walk.nextNode())) {
    const txt = (n.nodeValue || '').trim()
    if (!txt) continue
    const hits = txt.match(re)
    if (hits) for (const h of hits) seen.push(h)
  }
  return { sel, launch, seen: seen.slice(0, 80) }
})()
`

async function main() {
  const ver = await waitForDevtools()
  const target = await newTarget(PAGE_URL)
  const cdp = await CDP.connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  console.log('连接成功 | Chrome:', ver.Browser, '| URL:', PAGE_URL)
  console.log('INTERVALS 共', INTERVALS.length, '项')

  // 课程用到的音程符号（覆盖用户报的 ♭3 与「其他音程」）
  // 可用 PROBE_SYMBOLS=b3,3,7 限定小样本（先冒烟确认注入机制通，再全量）
  const ALL_SYMBOLS = ['b3', '3', '5', '7', 'b5', 'b7', 'b2', '#2', '#4', '#5', 'b6', 'bb7', '6', '9', '11', '13', '2', '4']
  const SYMBOLS = process.env.PROBE_SYMBOLS
    ? process.env.PROBE_SYMBOLS.split(',').map((s) => s.trim()).filter(Boolean)
    : ALL_SYMBOLS

  const rows = []
  let fail = 0

  for (const sym of SYMBOLS) {
    // 首次需要等页面加载；后续靠 reload
    await sleep(1500)
    await cdp.eval(INJECT([sym]))
    await cdp.send('Page.reload', { ignoreCache: false })
    await sleep(4000) // 水合 + useEffect 消费 courseLaunch

    const r = await cdp.eval(READBACK)
    const wantIdx = INTERVALS.findIndex((i) => i.symbol === sym)
    const wantSemi = INTERVALS[wantIdx].semitones
    const got = r.sel || []
    const gotIdx = got.length ? got[0] : -1
    const gotIv = gotIdx >= 0 ? INTERVALS[gotIdx] : null
    const ok = gotIdx === wantIdx
    if (!ok) fail++
    rows.push({
      sym,
      wantIdx,
      wantSemi,
      gotIdx,
      gotSym: gotIv ? gotIv.symbol : '—',
      gotSemi: gotIv ? gotIv.semitones : null,
      判定: ok ? 'PASS' : 'FAIL',
    })
  }

  console.log('\n===== 课程音程注入 · 真机判据 =====')
  console.log('符号   期望下标/半音   实际下标→符号/半音      判定')
  for (const x of rows) {
    console.log(
      `${String(x.sym).padEnd(5)} ${String(x.wantIdx).padStart(3)}/${String(x.wantSemi).padEnd(3)}` +
        `      ${String(x.gotIdx).padStart(3)}→${String(x.gotSym).padEnd(4)}/${String(x.gotSemi ?? '-').padEnd(3)}` +
        `   ${x.判定}`
    )
  }
  console.log(`\n结论：${fail === 0 ? 'PASS —— 全部落到课程要求的音程' : `FAIL —— ${fail} 个错位`}`)

  // 顺带 dump 最后一次的可见文本，供人工核对页面上到底显示了什么
  const last = await cdp.eval(READBACK)
  console.log('\n最后一次（13）页面可见音程记号片段:', JSON.stringify(last.seen.slice(0, 30)))
  console.log('courseLaunch 已被消费:', last.launch === null ? '是（null）' : '否')

  process.exitCode = fail === 0 ? 0 : 1
}

main().catch((e) => {
  console.error('探针失败:', e && e.message ? e.message : e)
  process.exitCode = 2
})
