/**
 * lib/logger.ts 契约测试（此前零测试）。
 *
 * logger 的价值全在**分级**上：
 *   - `debug` 只在 development 输出 —— 生产构建里成百上千条调试日志必须静音，
 *     否则控制台被淹没。项目里 `logger.debug` 有 30+ 处调用，全在音频/匹配的高频路径上。
 *   - `info` / `warn` / `error` 任何环境都要留痕（排查线上问题唯一的线索）。
 *   - `group` / `time` 系列同样只在 development 生效（它们是纯调试辅助）。
 *   - 前缀 `[ISO 时间] [LEVEL]` 是排查时唯一的锚点，不能丢。
 *
 * 注意 `isDevelopment` 是**模块级常量**，所以测 development / production 两个分支
 * 必须 `vi.stubEnv('NODE_ENV', ...)` + `vi.resetModules()` 后重新 import，
 * 顶层静态 import 只能测到其中一种（vitest 下 NODE_ENV 是 'test'）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

const ISO_PREFIX = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[(DEBUG|INFO|WARN|ERROR)\]$/

/** 以指定 NODE_ENV 重新加载 logger（模块级常量决定分级行为）。 */
async function loadLogger(nodeEnv: string) {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', nodeEnv)
  const mod = await import('@/lib/logger')
  return mod.logger
}

/** 把用到的 console 方法全部替换成 spy，避免测试输出被真实日志污染。 */
function spyConsole() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    group: vi.spyOn(console, 'group').mockImplementation(() => {}),
    groupEnd: vi.spyOn(console, 'groupEnd').mockImplementation(() => {}),
    time: vi.spyOn(console, 'time').mockImplementation(() => {}),
    timeEnd: vi.spyOn(console, 'timeEnd').mockImplementation(() => {}),
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('lib/logger —— 分级输出', () => {
  it('生产构建：debug 静音，info / warn / error 保留', async () => {
    const c = spyConsole()
    const logger = await loadLogger('production')

    logger.debug('这条不该出现在生产控制台')
    expect(c.log).not.toHaveBeenCalled()

    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(c.info).toHaveBeenCalledTimes(1)
    expect(c.warn).toHaveBeenCalledTimes(1)
    expect(c.error).toHaveBeenCalledTimes(1)
  })

  it('NODE_ENV=test（vitest 默认）同样静音 debug —— 默认是「非开发」', async () => {
    const c = spyConsole()
    const logger = await loadLogger('test')
    logger.debug('x')
    expect(c.log).not.toHaveBeenCalled()
    logger.info('y')
    expect(c.info).toHaveBeenCalledTimes(1)
  })

  it('开发环境：debug 走 console.log 输出', async () => {
    const c = spyConsole()
    const logger = await loadLogger('development')
    logger.debug('d')
    expect(c.log).toHaveBeenCalledTimes(1)
    expect(c.log.mock.calls[0][0]).toMatch(ISO_PREFIX)
    expect(c.log.mock.calls[0][0]).toContain('[DEBUG]')
  })

  it('开发环境：group / groupEnd / time / timeEnd 都生效', async () => {
    const c = spyConsole()
    const logger = await loadLogger('development')
    logger.group('g')
    logger.groupEnd()
    logger.time('t')
    logger.timeEnd('t')
    expect(c.group).toHaveBeenCalledWith('g')
    expect(c.groupEnd).toHaveBeenCalledTimes(1)
    expect(c.time).toHaveBeenCalledWith('t')
    expect(c.timeEnd).toHaveBeenCalledWith('t')
  })

  // 注意：这必须是**独立用例**。若与开发环境那段写在同一个 it 里，第二次
  // spyOn(console, 'group') 拿到的是上一段留下的同一个 spy（带调用记录），
  // 断言会假失败 —— 不是 logger 的问题，是 spy 复用。
  it('生产环境：group / groupEnd / time / timeEnd 全部静音', async () => {
    const c = spyConsole()
    const logger = await loadLogger('production')
    logger.group('g')
    logger.groupEnd()
    logger.time('t')
    logger.timeEnd('t')
    expect(c.group).not.toHaveBeenCalled()
    expect(c.groupEnd).not.toHaveBeenCalled()
    expect(c.time).not.toHaveBeenCalled()
    expect(c.timeEnd).not.toHaveBeenCalled()
  })

  it('每个级别走对应的 console 方法，且 level 名转成大写', async () => {
    const c = spyConsole()
    const logger = await loadLogger('development')
    logger.debug('x')
    logger.info('x')
    logger.warn('x')
    logger.error('x')

    expect(c.log.mock.calls[0][0]).toContain('[DEBUG]')
    expect(c.info.mock.calls[0][0]).toContain('[INFO]')
    expect(c.warn.mock.calls[0][0]).toContain('[WARN]')
    expect(c.error.mock.calls[0][0]).toContain('[ERROR]')
  })

  it('前缀格式是 [ISO 时间] [LEVEL]，业务参数在它之后原样透传', async () => {
    const c = spyConsole()
    const logger = await loadLogger('production')

    const payload = { note: 'C♯', cents: -3.2 }
    logger.error('匹配失败', 42, payload)

    expect(c.error).toHaveBeenCalledTimes(1)
    const args = c.error.mock.calls[0]
    expect(args[0]).toMatch(ISO_PREFIX)
    expect(args.slice(1)).toEqual(['匹配失败', 42, payload])
  })

  it('时间戳是解析得出的真实时刻（不是固定串）', async () => {
    const c = spyConsole()
    const logger = await loadLogger('production')

    const before = Date.now()
    logger.warn('t')
    const after = Date.now()

    const iso = String(c.warn.mock.calls[0][0]).match(/^\[([^\]]+)\]/)?.[1]
    expect(iso).toBeTruthy()
    const ts = new Date(iso as string).getTime()
    expect(ts).toBeGreaterThanOrEqual(before - 1000)
    expect(ts).toBeLessThanOrEqual(after + 1000)
  })
})
