/**
 * 带超时的 fetch。
 *
 * 为什么需要：全仓 7 处 `fetch` 原本都是裸调用 —— 路由器上的 CGI（uhttpd + SQLite）
 * 一旦卡住，或者手机在 Wi-Fi/蜂窝之间切换、TCP 连上但永远不返回，浏览器默认超时
 * 可能长达数分钟。用户侧表现是「统计页一直转圈」「答完题统计不更新」，而代码里
 * 没有任何错误、也没有任何提示。加超时能把「永远等」变成「明确失败 → 回退本地」。
 *
 * 为什么不用 `AbortSignal.timeout()`：它在 Chrome 103+ / Safari 16.4+ 才有，
 * 而本项目还要跑在 Tauri 的 WebView2（版本随用户机器走）。用 AbortController +
 * setTimeout 自己的实现兼容性最好，逻辑也更直白（还能把外部 signal 一起联动）。
 *
 * ⚠️ 超时抛出的错误 `name` 是 `TimeoutError`，与「用户取消」（`AbortError`）区分开，
 *    这样调用方日志里能看出到底是网络慢还是被主动取消了。
 */

/** 默认超时：10 秒。CGI 查询是毫秒级，这个值只是防「永远不返回」。 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

/** 超时错误的统一构造（name 固定为 TimeoutError，便于调用方识别） */
function timeoutError(timeoutMs: number): DOMException {
  return new DOMException(`请求超时（${timeoutMs}ms）`, 'TimeoutError')
}

/**
 * 与 `fetch` 同签名，额外接收超时毫秒数。
 *
 * - `init.signal` 存在时会与超时**联动**（任一触发即中断），不会覆盖调用方的取消能力；
 * - 无论成功、失败、超时，`finally` 都会清掉定时器与监听器（避免悬挂的 setTimeout
 *   让测试报「open handle」，也避免长跑页面里累积监听器）。
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const external = init.signal
  let timer: ReturnType<typeof setTimeout> | undefined

  const abortFromExternal = () => controller.abort(external?.reason)
  if (external) {
    if (external.aborted) controller.abort(external.reason)
    else external.addEventListener('abort', abortFromExternal, { once: true })
  }

  // 外部已取消就不必再挂定时器（省一个无意义的时间轮）
  if (!controller.signal.aborted) {
    timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs)
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    external?.removeEventListener('abort', abortFromExternal)
  }
}
