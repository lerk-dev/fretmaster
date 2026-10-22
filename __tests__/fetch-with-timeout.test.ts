/**
 * lib/fetch-with-timeout.ts 的契约测试。
 *
 * 这个模块存在的意义是「把永远等变成明确失败」，所以测试的重点不是「能发出请求」，
 * 而是三条时序性质：
 *   ① 超时之后**真的中断**（fetch 收到 aborted 的 signal，调用方拿到 TimeoutError）；
 *   ② 正常返回 / 失败之后**定时器一定被清掉**（否则长跑页面里会累积定时器，
 *      测试里表现为 open handle）；
 *   ③ 与调用方自带的 signal **联动**，但不能把「用户取消」误报成「超时」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

/** 永不 resolve 的 fetch 桩：只在 signal 被 abort 时 reject（与真实 fetch 行为一致） */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) reject(signal.reason)
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fetchWithTimeout：正常路径', () => {
  it('原样透传 URL 与 init，并返回 fetch 的响应', async () => {
    const response = { ok: true, status: 200 } as Response
    const spy = vi.fn(async () => response)
    vi.stubGlobal('fetch', spy)

    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    const res = await fetchWithTimeout('/cgi-bin/stats', init)

    expect(res).toBe(response)
    expect(spy).toHaveBeenCalledTimes(1)
    const [url, passed] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/cgi-bin/stats')
    expect(passed.method).toBe('POST')
    expect(passed.body).toBe('{}')
    // 传下去的必须是 controller 的 signal（不是原地透传 undefined）
    expect(passed.signal).toBeInstanceOf(AbortSignal)
  })

  it('成功之后不留悬挂定时器', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 } as Response)))
    await fetchWithTimeout('/x')
    expect(vi.getTimerCount(), '成功路径必须清定时器，否则页面里会累积').toBe(0)
  })

  it('fetch 抛错时也清定时器，且原样上抛', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(fetchWithTimeout('/x')).rejects.toThrow('Failed to fetch')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('fetchWithTimeout：超时', () => {
  it('超过时限就中断，错误名是 TimeoutError（不是 AbortError）', async () => {
    vi.stubGlobal('fetch', hangingFetch())

    const p = fetchWithTimeout('/slow', {}, 1000)
    // 先挂上断言，再推进时间（否则 rejection 会在推进时成为 unhandled）
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' })

    await vi.advanceTimersByTimeAsync(999)
    expect(vi.getTimerCount(), '未到时限前不应中断').toBe(1)

    await vi.advanceTimersByTimeAsync(1)
    await assertion
  })

  it('中断时传给 fetch 的 signal 已经是 aborted 状态', async () => {
    const spy = hangingFetch()
    vi.stubGlobal('fetch', spy)

    const p = fetchWithTimeout('/slow', {}, 500)
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(500)
    await assertion

    const passed = (spy.mock.calls[0] as unknown as [unknown, RequestInit])[1]
    expect(passed.signal?.aborted).toBe(true)
    expect(vi.getTimerCount(), '超时后也要清定时器').toBe(0)
  })

  it('默认时限是 DEFAULT_FETCH_TIMEOUT_MS', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const p = fetchWithTimeout('/slow')
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' })

    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS - 1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await assertion
  })
})

describe('fetchWithTimeout：与外部 signal 联动', () => {
  it('外部取消 ⇒ 立即中断，且错误是 AbortError（不能被误报成超时）', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const controller = new AbortController()

    const p = fetchWithTimeout('/slow', { signal: controller.signal }, 10_000)
    const assertion = expect(p).rejects.toMatchObject({ name: 'AbortError' })

    controller.abort(new DOMException('用户取消', 'AbortError'))
    await assertion

    expect(vi.getTimerCount(), '外部取消后要清掉超时定时器').toBe(0)
  })

  it('外部 signal 已经 aborted ⇒ 不发多余定时器，直接中断', async () => {
    const spy = hangingFetch()
    vi.stubGlobal('fetch', spy)
    const controller = new AbortController()
    controller.abort(new DOMException('已被取消', 'AbortError'))

    const p = fetchWithTimeout('/x', { signal: controller.signal }, 5000)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
    const passed = (spy.mock.calls[0] as unknown as [unknown, RequestInit])[1]
    expect(passed.signal?.aborted).toBe(true)
  })
})

describe('源码护栏：生产代码不许再出现裸 fetch', () => {
  /**
   * 这条护栏防的是「以后新增一处请求时忘了用带超时的版本」——
   * 裸 fetch 在 CGI 卡住时会一直等，界面表现为「永远转圈」，且没有任何报错。
   */
  const ROOT_DIRS = ['lib', 'hooks', 'app', 'components']
  const SELF = 'lib/fetch-with-timeout.ts'

  function collectSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        collectSourceFiles(full, acc)
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        acc.push(full)
      }
    }
    return acc
  }

  it('所有 fetch 调用都走 fetchWithTimeout（唯一例外是它的实现本身）', () => {
    const offenders: string[] = []
    for (const file of ROOT_DIRS.flatMap((d) => collectSourceFiles(d))) {
      const rel = file.replace(/\\/g, '/')
      if (rel === SELF) continue
      // 去掉注释，避免文档里提到 `fetch(` 就误报
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      // 匹配裸露的 fetch(...)：前面不能是 fetchWithTimeout 的一部分
      const hits = src.match(/(?<![\w.])fetch\s*\(/g) ?? []
      if (hits.length > 0) offenders.push(`${rel}（${hits.length} 处）`)
    }
    expect(offenders, '发现裸 fetch —— CGI 卡住时会永远等，必须改用 lib/fetch-with-timeout').toEqual([])
  })
})
