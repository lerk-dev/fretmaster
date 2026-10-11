/**
 * 设备热插拔护栏（跨语言 + 源码级）。
 *
 * 背景（2026-10-11 实测定位）：此前设备检测**只在设置面板打开时**活着 ——
 * `WindowsAudioSettings` 挂在 Radix `SheetContent` 下，而 dialog 关闭会卸载子树
 * （`SheetContent` 没传 `forceMount`），其 cleanup 里的 `unlistenDeviceChanges()`
 * 当时会 `stop_device_monitor` ⇒ 关掉设置后插拔声卡永久无人察觉。
 * 两种形态也都不给用户可见反馈（Web 只 `logger.debug`，桌面明确注释「不弹提示」）。
 *
 * 这几条不变量只有在真实 WebView2 + 真实声卡插拔下才能端到端验证，故用源码判据钉住
 * （铁律 20：判据必须精确，禁 `length >= N` 这类饱和断言）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function read(p: string): string {
  // 本仓文件全 CRLF ⇒ 先归一，再剥注释（否则注释里的示例代码会污染判据）
  return readFileSync(p, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const MONITOR_RS = 'src-tauri/src/audio/device_monitor.rs'
const COMMANDS_RS = 'src-tauri/src/commands/audio_commands.rs'
const MAIN_RS = 'src-tauri/src/main.rs'
const NATIVE_TS = 'lib/native-audio.ts'
const PAGE_TSX = 'app/page.tsx'
const SETTINGS_TSX = 'components/windows-audio-settings.tsx'

describe('设备热插拔：桌面端监控**常驻**（不依赖设置面板生命周期）', () => {
  it('main.rs 的 .setup() 里常驻启动监控（插拔是系统级事件，不该依赖 UI 挂载）', () => {
    const src = read(MAIN_RS)
    const setupIdx = src.indexOf('.setup(')
    expect(setupIdx, '未找到 .setup()').toBeGreaterThan(-1)

    const startIdx = src.indexOf('start_resident(')
    expect(startIdx, '.setup() 里必须常驻启动设备监控').toBeGreaterThan(setupIdx)

    // 精确计数：常驻启动只此一处（避免有人又在别处起一个）
    expect(src.split('start_resident(').length - 1).toBe(1)
  })

  it('DeviceMonitor::stop 对 resident 监控直接返回（前端停不掉它）', () => {
    const src = read(MONITOR_RS)
    const stopIdx = src.indexOf('pub fn stop(&mut self)')
    expect(stopIdx).toBeGreaterThan(-1)

    // stop() 体内必须先判 resident 再返回；且这段判断必须在 running.store(false) 之前
    const residentGuard = src.indexOf('if self.resident', stopIdx)
    const clearsRunning = src.indexOf('self.running.store(false', stopIdx)
    expect(residentGuard, 'stop() 缺少 resident 守卫').toBeGreaterThan(stopIdx)
    expect(clearsRunning, '未找到 stop() 里的 running.store(false)').toBeGreaterThan(residentGuard)
    expect(
      residentGuard - stopIdx,
      'resident 判断必须在 stop() 最前面（早于任何实际的停止动作）'
    ).toBeLessThan(120)
  })

  it('前端 unlistenDeviceChanges **不再发** stop_device_monitor', () => {
    const src = read(NATIVE_TS)
    const fnIdx = src.indexOf('export function unlistenDeviceChanges')
    expect(fnIdx).toBeGreaterThan(-1)

    // 取函数体：到下一个顶层 export 为止
    const nextExport = src.indexOf('\nexport ', fnIdx + 10)
    const body = nextExport === -1 ? src.slice(fnIdx) : src.slice(fnIdx, nextExport)

    expect(
      body.includes('stop_device_monitor'),
      'unlistenDeviceChanges 里出现 stop_device_monitor ⇒ 设置抽屉一关就会停掉监控（回归）'
    ).toBe(false)
  })

  it('前端用 ensure_device_monitor（常驻）而不再是 start_device_monitor', () => {
    const src = read(NATIVE_TS)
    expect(src.includes('ensure_device_monitor')).toBe(true)
    expect(
      src.includes("'start_device_monitor'"),
      "仍在使用 start_device_monitor —— 它起的监控可被 stop 停掉，不是常驻语义"
    ).toBe(false)
  })

  it('设置面板卸载只摘掉自己的订阅，不碰模块级监控', () => {
    const src = read(SETTINGS_TSX)
    const cleanupIdx = src.indexOf('cancelled = true')
    expect(cleanupIdx).toBeGreaterThan(-1)
    const body = src.slice(cleanupIdx, cleanupIdx + 400)
    expect(
      body.includes('unlistenDeviceChanges'),
      '设置面板卸载时调了 unlistenDeviceChanges ⇒ 面板与监控耦合（回归）'
    ).toBe(false)
  })
})

describe('设备热插拔：启动快照与真实插入必须可区分', () => {
  it('Rust 事件结构体带 isInitial（camelCase，跨 Tauri 边界）', () => {
    const src = read(MONITOR_RS)
    expect(src.includes('#[serde(rename_all = "camelCase")]')).toBe(true)
    expect(src.includes('pub is_initial: bool')).toBe(true)
    // 默认 false ⇒ 老前端把未知字段当 false，行为不变
    expect(src.includes('#[serde(default)]')).toBe(true)
  })

  it('只有启动那一次 emit 带 is_initial: true，真变化一律 false', () => {
    const src = read(MONITOR_RS)
    expect(src.split('is_initial: true').length - 1, '启动快照恰好 1 处').toBe(1)
    expect(src.split('is_initial: false').length - 1, '真实变化恰好 1 处').toBe(1)
  })

  it('常驻启动命令已注册进 main.rs 的 generate_handler!', () => {
    const main = read(MAIN_RS)
    expect(main.includes('fretmaster::commands::ensure_device_monitor')).toBe(true)
    const cmds = read(COMMANDS_RS)
    expect(cmds.includes('pub async fn ensure_device_monitor')).toBe(true)
  })
})

describe('设备热插拔：两种形态都给用户可见反馈', () => {
  it('page.tsx 全局层统一处理，且拔掉当前设备会停采集 + 提示', () => {
    const src = read(PAGE_TSX)
    expect(src.includes('handleGlobalDeviceChange'), '缺少全局设备变化处理').toBe(true)
    const fnIdx = src.indexOf('const handleGlobalDeviceChange')
    expect(fnIdx).toBeGreaterThan(-1)
    const body = src.slice(fnIdx, fnIdx + 2200)

    // 拔掉当前设备：运行时状态降级（setMicEnabled(false)）+ 清选择 + toast.error
    expect(body.includes('setMicEnabled(false)')).toBe(true)
    expect(body.includes("setSelectedAudioDevice('')")).toBe(true)
    expect(
      /if \(currentSelected && removed\.includes\(currentSelected\)\)[\s\S]{0,600}?toast\.error/.test(body),
      '「拔掉当前设备」分支必须走到 toast.error（分支被短路/掏空都会被咬住）'
    ).toBe(true)

    // 新增设备：必须是**真的**由 added 非空触发，且条件不可被写成恒假
    // （M8 变异：`if (added.length > 0)` → `if (false)` 必须变红）
    expect(
      /if \(added\.length > 0\) \{[\s\S]{0,400}?toast\.success/.test(body),
      '新增设备提示必须由 `added.length > 0` 守卫并连到 toast.success'
    ).toBe(true)
    // 且该守卫只出现一次（避免有人加个恒假的同形守卫把真判据架空）
    expect(body.split('if (added.length > 0)').length - 1).toBe(1)
  })

  it('桌面端全局订阅会忽略启动快照（否则每次启动误报 N 个设备）', () => {
    const src = read(PAGE_TSX)
    expect(src.includes('isInitial')).toBe(true)
    // 必须是「if (event.isInitial) return」这种真正的早退，而不是别处的同名提及
    expect(
      /if \(event\.isInitial\)\s*\n?\s*return/.test(src),
      'isInitial 之后必须真的 return（只更新列表、不弹提示）'
    ).toBe(true)
    // 且事件类型里确实有该字段（否则 event.isInitial 恒 undefined ⇒ 判据形同虚设）。
    // 🚨 用「结构体字段 + 读取点」双重判据：只留其一都能被单点删除绕过
    // （M12 变异：把 isInitial?: boolean 改名 ⇒ 必须变红）。
    const native = read(NATIVE_TS)
    expect(
      /export interface DeviceChangeEvent \{[\s\S]{0,400}?isInitial\?: boolean/.test(native),
      'DeviceChangeEvent 必须声明 isInitial 字段'
    ).toBe(true)
  })

  it('Web 端 devicechange 监听在 page.tsx 且求了差集（事件本身不说谁进谁出）', () => {
    const src = read(PAGE_TSX)
    expect(src.includes("addEventListener('devicechange'")).toBe(true)
    expect(src.includes("removeEventListener('devicechange'")).toBe(true)
    // 差集：before/after 对比，首帧不算变化
    expect(src.includes('lastIds')).toBe(true)
    expect(src.includes('before.length === 0')).toBe(true)
    // 差集结果必须真的喂给统一处理函数（否则「检测到了但不反馈」）
    expect(
      /const added = after\.filter[\s\S]{0,200}?const removed = before\.filter[\s\S]{0,300}?handleGlobalDeviceChange\(/.test(src),
      'Web 差集结果必须传给 handleGlobalDeviceChange'
    ).toBe(true)
  })
})
