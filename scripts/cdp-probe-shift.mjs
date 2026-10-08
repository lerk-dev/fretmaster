// 探针：打开 Radix Select 时，**到底是哪些元素**发生了水平位移（含根因现场取证）
//
// 与 cdp-probe-select.mjs 的区别：那个只盯 trigger 一个点；这个会对整棵可见 DOM
// 做「打开前/打开后」全量快照并 diff，直接点名位移的元素与其祖先链，
// 同时把运行时注入的滚动锁定样式、html/body 的实算样式一并 dump 出来。
//
// 用法（必须与 chrome 起在同一条 bash 命令里，本沙箱进程不能跨命令存活）：
//   PROBE_URL=http://127.0.0.1:8099/ node scripts/cdp-probe-shift.mjs
const PORT = 9222
const PAGE_URL = process.env.PROBE_URL || 'http://127.0.0.1:8099/'
const TRIGGER_SEL = process.env.PROBE_TRIGGER || '[data-slot="select-trigger"]'
const MAX_TRIGGERS = Number(process.env.PROBE_MAX_TRIGGERS || 3)

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
  send(method, params = {}, timeoutMs = 15000) {
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
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) {
      throw new Error('页面内异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
    }
    return r.result.value
  }
}

// 页面内快照：所有「可见且有尺寸」的元素的几何 + 可读路径
const SNAP_FN = `window.__fmSnap = function () {
  function pathOf(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      let p = cur.tagName.toLowerCase();
      const slot = cur.getAttribute && cur.getAttribute('data-slot');
      if (slot) p += '[' + slot + ']';
      if (cur.id) p += '#' + cur.id;
      const parent = cur.parentElement;
      if (parent) {
        const idx = Array.prototype.indexOf.call(parent.children, cur) + 1;
        p += ':nth-child(' + idx + ')';
      }
      parts.unshift(p);
      cur = cur.parentElement;
      if (parts.length > 7) { parts.unshift('…'); break; }
    }
    return parts.join('>');
  }
  const out = [];
  const nodes = document.querySelectorAll('body *');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({
      p: pathOf(el),
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
      l: Math.round(r.left * 100) / 100,
      rr: Math.round(r.right * 100) / 100,
      w: Math.round(r.width * 100) / 100,
      t: Math.round(r.top * 100) / 100,
    });
  }
  return {
    els: out,
    winW: window.innerWidth,
    docClientW: document.documentElement.clientWidth,
    docScrollW: document.documentElement.scrollWidth,
    bodyRect: (function () { const b = document.body.getBoundingClientRect(); return { l: Math.round(b.left * 100) / 100, r: Math.round(b.right * 100) / 100, w: Math.round(b.width * 100) / 100 }; })(),
    bodyInline: document.body.getAttribute('style') || '',
    htmlInline: document.documentElement.getAttribute('style') || '',
    bodyLocked: document.body.hasAttribute('data-scroll-locked'),
    htmlLocked: document.documentElement.hasAttribute('data-scroll-locked'),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scrollLeft: document.scrollingElement ? document.scrollingElement.scrollLeft : null,
  };
};
window.__fmSnap()
`

// 页面内 diff：返回位移 >= 0.5px 的元素（含其完整祖先链，便于定位「容器被谁挤窄」）
// before 快照放在页面内变量 __fmSnapBefore（走 JSON 往返太大）
const DIFF_WITH_VAR = `(function () {
  const before = window.__fmSnapBefore;
  const after = window.__fmSnap();
  const map = new Map();
  for (const e of before.els) map.set(e.p, e);
  const movers = [];
  for (const e of after.els) {
    const b = map.get(e.p);
    if (!b) continue;
    const dl = Math.round((e.l - b.l) * 100) / 100;
    const dr = Math.round((e.rr - b.rr) * 100) / 100;
    const dw = Math.round((e.w - b.w) * 100) / 100;
    if (Math.abs(dl) >= 0.5 || Math.abs(dr) >= 0.5 || Math.abs(dw) >= 0.5) {
      movers.push({ p: e.p, tag: e.tag, cls: e.cls, dl: dl, dr: dr, dw: dw });
    }
  }
  return {
    movers: movers,
    meta: {
      winW: [before.winW, after.winW],
      docClientW: [before.docClientW, after.docClientW],
      docScrollW: [before.docScrollW, after.docScrollW],
      bodyRect: [before.bodyRect, after.bodyRect],
      bodyInline: [before.bodyInline, after.bodyInline],
      htmlInline: [before.htmlInline, after.htmlInline],
      bodyLocked: [before.bodyLocked, after.bodyLocked],
      htmlLocked: [before.htmlLocked, after.htmlLocked],
      scrollX: [before.scrollX, after.scrollX],
      scrollY: [before.scrollY, after.scrollY],
      scrollLeft: [before.scrollLeft, after.scrollLeft],
    },
  };
})()`

// 把当前生效的、涉及滚动锁定的规则与 html/body 实算样式 dump 出来
const RULES_FN = `(function () {
  const found = [];
  for (const ss of Array.from(document.styleSheets)) {
    let rules = null;
    try { rules = ss.cssRules } catch { continue }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const txt = rule.cssText || '';
      if (txt.includes('scroll-locked') || txt.includes('scrollbar-gutter') || txt.includes('removed-body-scroll-bar')) {
        found.push(txt);
      }
    }
  }
  const b = getComputedStyle(document.body);
  const h = getComputedStyle(document.documentElement);
  return {
    rules: found,
    bodyComputed: { marginRight: b.marginRight, paddingRight: b.paddingRight, overflow: b.overflow, width: b.width, position: b.position, left: b.left, right: b.right },
    htmlComputed: { marginRight: h.marginRight, paddingRight: h.paddingRight, overflow: h.overflow, width: h.width, position: h.position },
  };
})()`

function printMovers(res, label) {
  const mv = res.movers
  console.log(`\n--- ${label}: 位移元素 ${mv.length} 个 ---`)
  if (!mv.length) { console.log('  (无位移)'); return }
  // 先按「最深」排序，列出前 12 个 + 汇总各级
  const sorted = mv.slice().sort((a, b) => b.p.length - a.p.length)
  for (const m of sorted.slice(0, 12)) {
    console.log(`  ${String(m.dl).padStart(7)} L | ${String(m.dr).padStart(7)} R | ${String(m.dw).padStart(6)} W  ${m.tag} ${m.cls ? '.' + m.cls.split(/\s+/).slice(0, 3).join('.') : ''}`)
    console.log(`        ${m.p}`)
  }
  if (sorted.length > 12) console.log(`  … 其余 ${sorted.length - 12} 个`)
}

async function main() {
  const version = await waitForDevtools()
  console.log('浏览器:', version.Browser)
  const target = await newTarget(PAGE_URL)
  const cdp = await CDP.connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  let ready = false
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try { if (await cdp.eval(`!!document.querySelector(${JSON.stringify(TRIGGER_SEL)})`)) { ready = true; break } } catch {}
  }
  if (!ready) { console.log('未找到 trigger:', TRIGGER_SEL); process.exit(2) }

  const count = await cdp.eval(`document.querySelectorAll(${JSON.stringify(TRIGGER_SEL)}).length`)
  console.log(`页面共有 ${count} 个 trigger，逐个测试前 ${Math.min(count, MAX_TRIGGERS)} 个`)

  // 关键：先把快照函数注入页面（后续 Diff 都靠它）
  await cdp.eval(SNAP_FN)
  await cdp.eval(`window.__fmSnapBefore = window.__fmSnap()`)

  const OPEN_CHECK = `!!document.querySelector('[data-slot="select-content"], [role="listbox"]')`
  const N = Math.min(count, MAX_TRIGGERS)
  for (let i = 0; i < N; i++) {
    console.log(`\n########## trigger[${i}] ##########`)
    const info = await cdp.eval(`(function () {
      const t = document.querySelectorAll(${JSON.stringify(TRIGGER_SEL)})[${i}];
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, l: r.left, rr: r.right,
               text: (t.textContent || '').trim().slice(0, 40),
               cls: (typeof t.className === 'string' ? t.className : '').slice(0, 80) };
    })()`)
    if (!info) { console.log('  trigger 消失，跳过'); continue }
    console.log(`  文本="${info.text}" rect=[${info.l},${info.rr}] w=${info.w}`)

    // 基线快照（关闭态）
    await cdp.eval(`window.__fmSnapBefore = window.__fmSnap()`)

    const hit = await cdp.eval(`(function(){
      const el = document.elementFromPoint(${info.x}, ${info.y});
      if (!el) return 'null';
      return (el.closest(${JSON.stringify(TRIGGER_SEL)}) ? 'IN_TRIGGER' : 'BLOCKED_BY') + ':' + el.tagName + '[' + (el.getAttribute('data-slot') || '') + ']';
    })()`)
    console.log('  点击点命中:', hit)

    let opened = false
    for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', clickCount: 1 })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', clickCount: 1 })
      await sleep(700)
      opened = await cdp.eval(OPEN_CHECK)
      if (!opened) console.log(`  第 ${attempt} 次点击未打开，重试…`)
    }
    if (!opened) {
      console.log('  ❌ 下拉未打开 ⇒ 本次 Δ 判据无效（不能当通过）')
      continue
    }
    console.log('  ✓ 下拉已打开，Δ 判据有效')

    const res = await cdp.eval(DIFF_WITH_VAR)
    printMovers(res, `trigger[${i}] 打开后`)
    console.log('  meta:', JSON.stringify(res.meta))

    const rules = await cdp.eval(RULES_FN)
    console.log('  body 实算:', JSON.stringify(rules.bodyComputed))
    console.log('  html 实算:', JSON.stringify(rules.htmlComputed))
    const locked = rules.rules.filter((r) => r.includes('scroll-locked') || r.includes('scrollbar-gutter'))
    console.log('  相关规则:')
    for (const r of locked) console.log('    ' + r.slice(0, 300).replace(/\n/g, ' '))

    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(600)
  }

  process.exit(0)
}

main().catch((e) => { console.error('探针失败:', e.message); process.exit(1) })
