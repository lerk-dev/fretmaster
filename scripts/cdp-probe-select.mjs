// 临时探针：验证「打开 Radix Select 时 body 被写入滚动条补偿 ⇒ 页面右侧整体左移」
// 用法：同一条 bash 命令内先起 chrome --headless --remote-debugging-port=9222，再跑本脚本。
const PORT = 9222
const PAGE_URL = process.env.PROBE_URL || 'http://127.0.0.1:8099/'

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
  // Chrome 111+ 要求 PUT
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

const MEASURE = `(() => {
  const t = document.querySelector('[data-slot="select-trigger"]');
  const b = document.body;
  const cs = getComputedStyle(b);
  const r = t ? t.getBoundingClientRect() : null;
  // 找出注入的、带 data-scroll-locked 的样式规则原文
  let lockedRule = null;
  for (const ss of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(ss.cssRules)) {
        if (rule.cssText && rule.cssText.includes('data-scroll-locked')) { lockedRule = rule.cssText; break; }
      }
    } catch {}
    if (lockedRule) break;
  }
  return {
    triggerFound: !!t,
    // ⚠️ 自证判据：必须确认下拉**真的打开了**。
    // 否则「打开前后 Δ = 0」在「压根没打开」时同样成立 ⇒ 假通过。
    contentOpen: !!document.querySelector('[data-slot="select-content"], [role="listbox"]'),
    triggerLeft: r ? Math.round(r.left * 100) / 100 : null,
    triggerRight: r ? Math.round(r.right * 100) / 100 : null,
    triggerWidth: r ? Math.round(r.width * 100) / 100 : null,
    bodyMarginRight: cs.marginRight,
    bodyPaddingRight: cs.paddingRight,
    bodyWidth: Math.round(b.getBoundingClientRect().width * 100) / 100,
    scrollLocked: b.hasAttribute('data-scroll-locked'),
    scrollLockedAttr: b.getAttribute('data-scroll-locked'),
    docClientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    gapMeasured: window.innerWidth - document.documentElement.clientWidth,
    lockedRule,
  };
})()`

async function main() {
  const version = await waitForDevtools()
  console.log('浏览器:', version.Browser)
  const target = await newTarget(PAGE_URL)
  const cdp = await CDP.connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  // 等 React 水合 + 出现 select trigger
  let ok = false
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      const v = await cdp.eval(`!!document.querySelector('[data-slot="select-trigger"]')`)
      if (v) { ok = true; break }
    } catch {}
  }
  if (!ok) {
    const btns = await cdp.eval(`Array.from(document.querySelectorAll('button,[role="tab"]')).map(e=>(e.textContent||'').trim()).filter(Boolean).slice(0,40)`)
    console.log('未找到 select-trigger。页面上的按钮/标签文本：')
    console.log(JSON.stringify(btns, null, 2))
    process.exit(2)
  }

  console.log('\n===== 打开前 =====')
  const before = await cdp.eval(MEASURE)
  console.log(JSON.stringify(before, null, 2))

  const box = await cdp.eval(`(() => {
    const t = document.querySelector('[data-slot="select-trigger"]');
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)

  // 点击点是否真的落在 trigger 上（有遮罩时会被别的元素接走）
  const hitInfo = await cdp.eval(`(() => {
    const el = document.elementFromPoint(${box.x}, ${box.y});
    if (!el) return 'null';
    const inTrigger = !!el.closest('[data-slot="select-trigger"]');
    return (inTrigger ? 'IN_TRIGGER' : 'BLOCKED_BY') + ':' + el.tagName + '[' + (el.getAttribute('data-slot') || el.className || '') + ']';
  })()`)
  console.log('点击点命中:', hitInfo)

  const OPEN_CHECK = `!!document.querySelector('[data-slot="select-content"], [role="listbox"]')`
  const clickOnce = async () => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }

  let opened = false
  for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
    await clickOnce()
    await sleep(700)
    opened = await cdp.eval(OPEN_CHECK)
    if (!opened) console.log(`  第 ${attempt} 次点击后仍未打开，重试…`)
  }

  if (!opened) {
    const blockers = await cdp.eval(`(() => {
      const els = Array.from(document.body.children).map(e => e.tagName + '[' + (e.getAttribute('data-slot') || e.id || e.className.slice(0, 60)) + ']');
      const overlay = document.querySelector('[data-slot="dialog-overlay"], [class*="overlay"], [class*="mask"]');
      return { bodyChildren: els, overlayFound: !!overlay, overlayCls: overlay ? overlay.className.slice(0, 120) : null };
    })()`)
    console.log('❌ 下拉未打开 ⇒ 本次 Δ 判据无效，不能当作通过。')
    console.log('现场:', JSON.stringify(blockers, null, 2))
    process.exit(3)
  }
  console.log('✓ 下拉已打开（contentOpen = true），Δ 判据有效')

  console.log('\n===== 打开后 =====')
  const after = await cdp.eval(MEASURE)
  console.log(JSON.stringify(after, null, 2))

  console.log('\n===== 差值 =====')
  const diff = (k) => {
    const a = before[k], b = after[k]
    if (typeof a !== 'number' || typeof b !== 'number') return 'n/a'
    return (Math.round((b - a) * 100) / 100)
  }
  console.log('triggerLeft  Δ =', diff('triggerLeft'))
  console.log('triggerRight Δ =', diff('triggerRight'))
  console.log('triggerWidth Δ =', diff('triggerWidth'))
  console.log('bodyWidth    Δ =', diff('bodyWidth'))
  console.log('bodyMarginRight:', before.bodyMarginRight, '->', after.bodyMarginRight)
  console.log('scrollLocked   :', before.scrollLocked, '->', after.scrollLocked)
  console.log('docClientWidth :', before.docClientWidth, '->', after.docClientWidth)
  console.log('innerWidth     :', before.innerWidth, '->', after.innerWidth)

  console.log('\n===== 结论 =====')
  if (!after.contentOpen) {
    console.log('INVALID：打开后没检测到 popup，Δ 判据无效')
  } else {
    const dRight = Math.round((after.triggerRight - before.triggerRight) * 100) / 100
    const dBody = Math.round((after.bodyWidth - before.bodyWidth) * 100) / 100
    console.log(`PASS|FAIL 判据： Δ triggerRight = ${dRight}px, Δ bodyWidth = ${dBody}px`)
    console.log(dRight === 0 && dBody === 0
      ? 'PASS：打开下拉不会让页面右侧移动'
      : 'FAIL：打开下拉时页面右侧发生了位移')
  }

  // 再按 Esc 关闭，看是否复原（排除「一直偏移」的另一个假设）
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(600)
  console.log('\n===== 关闭后 =====')
  const closed = await cdp.eval(MEASURE)
  console.log('triggerRight =', closed.triggerRight, '| scrollLocked =', closed.scrollLocked, '| bodyMarginRight =', closed.bodyMarginRight)

  process.exit(0)
}

main().catch((e) => {
  console.error('探针失败:', e.message)
  process.exit(1)
})
