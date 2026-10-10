// 探针：「限制弦」的出题目标是否落在**选中的弦**上（并可直接点击答题）
//
// 用户症状：「限制弦的辨音模式练习中，有时候会出不在该弦上的音，看不到该位置无法答题」。
// 根因：出题端 `STRING_COUNT - 弦号` 与渲染端 `下标 + 1` 镜像相反 ⇒ 目标格所在弦被禁用
// ⇒ 该格 `disabled=true`、整行 opacity-60，用户既看不明显也点不了。
//
// 本探针走**真实 UI**（切 tab → 选辨音模式 → 只留 1 号弦 → 开始练习 → 空格换题 ×N），
// 每次读 `[data-role="target"]` 的 disabled 与所在行；判据 = 目标弦 ∈ 选中弦 且 未禁用。
//
// 用法（必须与 chrome 起在同一条 bash 命令里，本沙箱进程不能跨命令存活）：
//   PROBE_URL=http://192.168.123.2/fretmaster/ node scripts/cdp-probe-string-limit.mjs

const PORT = 9222
const PAGE_URL = process.env.PROBE_URL || 'http://127.0.0.1:8099/'
// 保留哪根弦（1..6）；其余全部点掉
const KEEP = Number(process.env.PROBE_KEEP_STRING || 1)
const ROUNDS = Number(process.env.PROBE_ROUNDS || 12)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map() }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')) })
    const c = new CDP(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && c.pending.has(msg.id)) {
        const { res, rej, timer } = c.pending.get(msg.id)
        clearTimeout(timer); c.pending.delete(msg.id)
        if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result)
      }
    }
    return c
  }
  send(method, params = {}, timeoutMs = 15000) {
    const id = ++this.id
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP 超时: ${method}`)) }, timeoutMs)
      this.pending.set(id, { res, rej, timer })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('页面内异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
    return r.result.value
  }
  async key(key, code, vk) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  }
}

/** 页面内：读目标格（disabled + 所在行 → 弦号） */
const READ_FN = `(function () {
  const t = document.querySelector('[data-role="target"]')
  if (!t) return { found: false, playState: window.__fmPlay || null }
  const r = t.getBoundingClientRect()
  const cells = Array.from(document.querySelectorAll('button[data-role]'))
  const tops = Array.from(new Set(cells.map(c => Math.round(c.getBoundingClientRect().top)))).sort((a, b) => a - b)
  let rowIndex = -1
  for (let i = 0; i < tops.length; i++) { if (Math.abs(tops[i] - Math.round(r.top)) <= 3) { rowIndex = i; break } }
  return {
    found: true,
    disabled: t.disabled === true,
    rowIndex: rowIndex,
    stringNumber: rowIndex >= 0 ? rowIndex + 1 : null,
    rowCount: tops.length,
    aria: t.getAttribute('aria-label'),
  }
})()`

/** 页面内：按文本点按钮（可见的） */
const clickByExact = (txt) => `(function () {
  const el = Array.from(document.querySelectorAll('button')).find(b =>
    (b.textContent || '').trim() === ${JSON.stringify(txt)} && b.offsetParent !== null)
  if (!el) return false
  el.click()
  return true
})()`

async function main() {
  await waitForDevtools()
  const target = await newTarget('about:blank')
  const cdp = await CDP.connect(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url: PAGE_URL })
  await sleep(4500)

  // 等水合：找得到弦选择按钮
  const readyExpr = `(function(){
    const btns = Array.from(document.querySelectorAll('button'))
      .filter(b => /^[1-6]$/.test((b.textContent||'').trim()) && (b.className||'').includes('w-7'))
    return btns.length
  })()`
  let n = 0
  for (let i = 0; i < 30; i++) {
    n = await cdp.eval(readyExpr)
    if (n >= 6) break
    await sleep(500)
  }
  console.log(`字符串选择按钮数 = ${n}（期望 >= 6）`)
  if (n < 6) { console.log('FAIL 页面未就绪（找不到弦选择按钮）'); process.exit(1) }

  // ① 切到「练习」tab（快捷键 1）
  await cdp.key('1', 'Digit1', 49)
  await sleep(900)

  // ② 选「辨音模式」
  const identifyOk = await cdp.eval(clickByExact('辨音模式'))
  console.log(`选中「辨音模式」= ${identifyOk}`)
  await sleep(600)

  // ③ 只保留 KEEP 号弦（点掉其余）
  const clicked = await cdp.eval(`(function(){
    const btns = Array.from(document.querySelectorAll('button'))
      .filter(b => /^[1-6]$/.test((b.textContent||'').trim()) && (b.className||'').includes('w-7'))
    let removed = []
    for (const b of btns) {
      const num = Number((b.textContent||'').trim())
      if (num !== ${KEEP}) { b.click(); removed.push(num) }
    }
    return removed
  })()`)
  console.log(`已点掉弦 = ${JSON.stringify(clicked)}（保留 ${KEEP}）`)
  await sleep(800)

  // ④ 开始练习
  const started = await cdp.eval(`(function(){
    const el = Array.from(document.querySelectorAll('button')).find(b =>
      (b.textContent || '').includes('开始练习') && b.offsetParent !== null)
    if (!el) return false
    el.click()
    return true
  })()`)
  console.log(`点击「开始练习」= ${started}`)
  await sleep(2500)

  // ⑤ 空格换题 × ROUNDS
  const rows = []
  for (let i = 0; i < ROUNDS; i++) {
    if (i > 0) { await cdp.key(' ', 'Space', 32); await sleep(700) }
    const r = await cdp.eval(READ_FN)
    rows.push(r)
    const tag = !r.found ? '找不到目标格'
      : `弦${r.stringNumber} disabled=${r.disabled} (共${r.rowCount}行, aria=${r.aria || '-'})`
    console.log(`  第${String(i + 1).padStart(2)}题: ${tag}`)
  }

  const found = rows.filter(r => r.found)
  const bad = found.filter(r => r.stringNumber !== KEEP || r.disabled)
  console.log('')
  console.log(`目标格命中 ${found.length}/${ROUNDS}；弦号全为 ${KEEP} 且未禁用 = ${bad.length === 0}`)
  console.log(bad.length === 0 && found.length === ROUNDS
    ? `PASS 限制弦 ${KEEP}：目标始终落在选中弦上且可点击`
    : `FAIL 有 ${bad.length} 题目标不在选中弦/被禁用`)
  process.exit(bad.length === 0 && found.length === ROUNDS ? 0 : 1)
}

main().catch((e) => { console.error('探针异常:', e.message); process.exit(1) })
