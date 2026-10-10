/**
 * P3-14 护栏（跨语言源码级）：`AudioCapture` 的 `is_capturing` 回滚不变量。
 *
 * 为什么是源码级而不是单测：`start_with_host` / `start_exclusive` 都要真实的音频设备
 * 与 cpal host 才能跑（沙箱/CI 无设备）⇒ 单测覆盖不到这两条不变量。退而用源码判据钉住：
 *
 *   ① 失败回滚必须回到「进入时的快照值 `was_capturing`」，**不得**硬编码 `false`。
 *      硬编码 false 的场景：重复调 `start`（旧流仍活着）时建流失败 ⇒ 标志位被错标
 *      「未采集」，而旧流还在跑 ⇒ `pipeline.rs` 的 `if !is_capturing()` 守卫误判
 *      ⇒ 后续采集/检测操作静默空转（不报错，只是没反应）。
 *   ② 全文件里把标志位写成 `false` 的**只有 `stop()` 一处**。
 *
 * 判据用**精确计数**（铁律 20：禁 `length >= N`）：任何一处回滚被改回硬编码都会红。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SRC = 'src-tauri/src/audio/capture.rs'
const HARD_FALSE = '*self.is_capturing.lock() = false;'
const SNAPSHOT = 'let was_capturing = *self.is_capturing.lock();'

function stripped(): string {
  return readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('P3-14：capture.rs 的 is_capturing 回滚不变量', () => {
  it('全文件只有 stop() 把标志位写成 false（回滚一律走 was_capturing 快照）', () => {
    const src = stripped()
    const occurrences = src.split(HARD_FALSE).length - 1
    expect(
      occurrences,
      `把 is_capturing 写成 false 的地方有 ${occurrences} 处，应恰好 1 处（stop()）；` +
        '其余失败路径必须回滚到 was_capturing 快照'
    ).toBe(1)

    const stopIdx = src.indexOf('pub fn stop(&mut self)')
    const falseIdx = src.indexOf(HARD_FALSE)
    expect(stopIdx, '未找到 stop()').toBeGreaterThan(-1)
    expect(falseIdx, '未找到唯一的硬编码 false').toBeGreaterThan(stopIdx)
    expect(falseIdx - stopIdx, `唯一那处硬编码 false 必须落在 stop() 体内`).toBeLessThan(400)
  })

  it('两个 start 路径各自都有 was_capturing 快照', () => {
    const src = stripped()
    const snaps = src.split(SNAPSHOT).length - 1
    expect(
      snaps,
      `was_capturing 快照有 ${snaps} 处，应为 2 处（start_exclusive 与 start_with_host 各一）`
    ).toBe(2)
  })

  it('入口幂等守卫：start_with_host 调用了纯判据 start_should_short_circuit', () => {
    const src = stripped()
    const hostIdx = src.indexOf('fn start_with_host')
    expect(hostIdx).toBeGreaterThan(-1)
    const head = src.slice(hostIdx, hostIdx + 900)
    expect(
      head.includes('start_should_short_circuit('),
      'start_with_host 入口缺少幂等守卫（重复 start 会重复建流）'
    ).toBe(true)
  })
})
