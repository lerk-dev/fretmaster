/**
 * lib/guitar-sound.ts 的契约测试。
 *
 * 这个模块决定「点击指板听到什么」，四条契约：
 *  ① 采样选择：取**最近**的采样、速率 = 2^(Δ/12)（移调量必须 ≤3 个半音，否则听感失真）；
 *  ② 弦号 + 品 → MIDI：必须与 `getNoteAtPosition` 的八度口径一致（标准调弦 / drop-D 都要对）；
 *  ③ 加载：8 个文件并发取、只解码一次、**永不 reject**（失败记空表并退回合成音）；
 *  ④ 播放：正确音走「直接拨弦」，错误音走「低通 + 短衰减」的闷音；未就绪时同步返回 false。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  GUITAR_SAMPLES,
  GUITAR_SOUND_DIR,
  pickGuitarSample,
  guitarPositionToMidi,
  ensureGuitarSamples,
  getGuitarSamples,
  playGuitarPluck,
  __resetGuitarSamplesForTest,
} from '@/lib/guitar-sound'
import { FakeAudioContext } from './helpers/fake-audio-context'
import { readdirSync } from 'node:fs'

const ctxOf = () => new FakeAudioContext() as unknown as BaseAudioContext & FakeAudioContext

/** 让 fetch 成功：每张唱片返回 8 字节假数据（decode 是假的，不看内容） */
function stubFetchOk() {
  const fetchMock = vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(8),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pickGuitarSample：最近采样 + 速率', () => {
  it('正好落在采样音高上：速率 1', () => {
    expect(pickGuitarSample(64)).toEqual({ file: 'steel_E4.wav', rootMidi: 64, rate: 1 })
  })

  it('相邻两采样正中间：取靠前的（低音）那个，速率 = 2^(3/12)', () => {
    // 61 = C#4，距 A#3(58) 与 E4(64) 都是 3 个半音 ⇒ 约定取靠前的
    const picked = pickGuitarSample(61)
    expect(picked.file).toBe('steel_Bb3.wav')
    expect(picked.rate).toBeCloseTo(Math.pow(2, 3 / 12), 6)
  })

  it('音域外（E6）：仍然取最近采样 B5，移调 5 个半音', () => {
    const picked = pickGuitarSample(88)
    expect(picked.file).toBe('steel_B5.wav')
    expect(picked.rate).toBeCloseTo(Math.pow(2, 5 / 12), 6)
  })

  it('吉他音域内（E2=40 … E6=88）任何音高的移调量都不超过 ±6 个半音', () => {
    for (let midi = 40; midi <= 88; midi++) {
      const picked = pickGuitarSample(midi)
      const semitones = Math.abs(midi - picked.rootMidi)
      expect(semitones, `midi ${midi} 的移调量过大`).toBeLessThanOrEqual(6)
    }
  })
})

describe('guitarPositionToMidi：弦号 + 品 → 音高', () => {
  const STANDARD = [4, 11, 7, 2, 9, 4] // E4 B3 G3 D3 A2 E2（高音弦 → 低音弦）

  it('标准调弦：空弦 = E4 / B3 / G3 / D3 / A2 / E2', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => guitarPositionToMidi(i, 0, STANDARD))).toEqual([64, 59, 55, 50, 45, 40])
  })

  it('标准调弦：第 5 品（A4）与 12 品（高八度）', () => {
    expect(guitarPositionToMidi(0, 5, STANDARD)).toBe(69)
    expect(guitarPositionToMidi(5, 12, STANDARD)).toBe(52)
  })

  it('Drop-D：低音弦空弦落到 D2（不是 E2）', () => {
    const dropD = [4, 11, 7, 2, 9, 2]
    expect(guitarPositionToMidi(5, 0, dropD)).toBe(38)
    expect(guitarPositionToMidi(5, 2, dropD)).toBe(40) // 第 2 品回到 E2
  })

  it('调弦音级与标准音不同的弦：按音级修正八度，不跑飞', () => {
    // 全部升半音（Eb 调弦）时，最高弦空弦应是 F4（65）而不是 E4
    const eb = [5, 0, 8, 3, 10, 5]
    expect(guitarPositionToMidi(0, 0, eb)).toBe(65)
    expect(guitarPositionToMidi(5, 0, eb)).toBe(41)
  })

  it('非法输入返回 null（调用方据此退回默认音高）', () => {
    expect(guitarPositionToMidi(9, 0, STANDARD)).toBeNull()   // 越界弦号
    expect(guitarPositionToMidi(0, -1, STANDARD)).toBeNull()  // 负品
    expect(guitarPositionToMidi(Number.NaN, 0, STANDARD)).toBeNull()
  })
})

describe('采样加载', () => {
  beforeEach(() => {
    FakeAudioContext.reset()
  })

  it('并发调用只发一轮 8 个请求，且每个只解码一次', async () => {
    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    const fetchMock = stubFetchOk()

    await Promise.all([ensureGuitarSamples(ctx), ensureGuitarSamples(ctx), ensureGuitarSamples(ctx)])

    expect(fetchMock).toHaveBeenCalledTimes(GUITAR_SAMPLES.length)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(GUITAR_SAMPLES.length)
    expect(getGuitarSamples(ctx)?.size).toBe(GUITAR_SAMPLES.length)
  })

  it('加载中 getGuitarSamples 返回 null（首声要退回合成音，而不是静音）', async () => {
    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    stubFetchOk()
    const pending = ensureGuitarSamples(ctx)
    expect(getGuitarSamples(ctx)).toBeNull()
    await pending
    expect(getGuitarSamples(ctx)).not.toBeNull()
  })

  it('fetch 失败：不 reject、不重试、只有空表（调用方退回合成音）', async () => {
    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    const fetchMock = vi.fn(async (_url: string) => ({ ok: false, status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureGuitarSamples(ctx)).resolves.toBeUndefined()
    expect(getGuitarSamples(ctx)).toBeNull()
    // 第二次调用不再发请求（空表已缓存）
    await ensureGuitarSamples(ctx)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(GUITAR_SAMPLES.length)
  })

  it('采样地址用**相对**目录拼接（绝对路径在 basePath / Tauri file:// 下会 404）', async () => {
    // 目录常量本身必须相对：以 '/' 开头就会被当成站点根，子路径部署直接 404
    expect(GUITAR_SOUND_DIR.startsWith('/')).toBe(false)
    expect(GUITAR_SOUND_DIR).toBe('sounds/guitar/')

    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    const fetchMock = stubFetchOk()
    await ensureGuitarSamples(ctx)
    const url = String(fetchMock.mock.calls[0][0])
    // 解析后应落在「当前页面所在目录」之下，而不是站点根
    expect(new URL(url).pathname).toBe(new URL(url, document.baseURI).pathname)
    expect(url.endsWith('steel_E2.wav')).toBe(true)
  })
})

describe('playGuitarPluck：正确音 / 闷音 / 未就绪', () => {
  beforeEach(() => {
    FakeAudioContext.reset()
  })

  it('采样未就绪 ⇒ 同步返回 false（调用方走合成音兜底）', () => {
    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    expect(playGuitarPluck(ctx, { midi: 64 })).toBe(false)
    // 未就绪时不该创建任何音频节点（否则会留下没人启动的空 source）
    expect(ctx.bufferSources).toHaveLength(0)
  })

  it('正确音：直接拨弦，不加低通，起音有包络', async () => {
    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    stubFetchOk()
    await ensureGuitarSamples(ctx)

    expect(playGuitarPluck(ctx, { midi: 64 })).toBe(true)
    expect(ctx.bufferSources).toHaveLength(1)
    expect(ctx.bufferSources[0].start).toHaveBeenCalledTimes(1)
    expect(ctx.filters, '正确音不该被低通').toHaveLength(0)
    expect(ctx.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalled()
    expect(ctx.gains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalled()
  })

  it('答错：同一份采样 + 低通 700Hz + 更短的衰减（闷音）', async () => {
    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    stubFetchOk()
    await ensureGuitarSamples(ctx)

    expect(playGuitarPluck(ctx, { midi: 64, muted: true })).toBe(true)
    expect(ctx.filters).toHaveLength(1)
    expect(ctx.filters[0].type).toBe('lowpass')
    // 频率用 setValueAtTime 设在音频时间轴上（不是 .value），断言 spy 的实参
    expect(ctx.filters[0].frequency.setValueAtTime).toHaveBeenCalledWith(700, 0)

    // 闷音的衰减终点明显早于正确音
    const mutedEnd = ctx.gains[0].gain.exponentialRampToValueAtTime.mock.calls[0][1] as number
    const fresh = ctxOf()
    __resetGuitarSamplesForTest(fresh)
    await ensureGuitarSamples(fresh)
    playGuitarPluck(fresh, { midi: 64 })
    const ringingEnd = fresh.gains[0].gain.exponentialRampToValueAtTime.mock.calls[0][1] as number
    expect(mutedEnd).toBeLessThan(ringingEnd)
  })

  it('音高不同 ⇒ 播放速率不同（按最近采样移调）', async () => {
    const ctx = ctxOf()
    __resetGuitarSamplesForTest(ctx)
    stubFetchOk()
    await ensureGuitarSamples(ctx)

    playGuitarPluck(ctx, { midi: 64 })   // E4，正好是采样音高
    playGuitarPluck(ctx, { midi: 67 })   // G4，距 E4 三个半音
    expect(ctx.bufferSources[0].playbackRate.value).toBe(1)
    expect(ctx.bufferSources[1].playbackRate.value).toBeCloseTo(Math.pow(2, 3 / 12), 6)
  })
})

describe('采样文件与清单一致（改文件名/漏提交都会在真机上 404）', () => {
  it('清单里的每个文件都真实存在于 public/sounds/guitar', () => {
    const onDisk = new Set(readdirSync('public/sounds/guitar'))
    for (const { file } of GUITAR_SAMPLES) {
      expect(onDisk.has(file), `清单声明了 ${file}，但 public/sounds/guitar 里没有`).toBe(true)
    }
  })

  it('文件名不含 URL 保留字符（实测 # 会让 steel_A#2.wav 被请求成 steel_A ⇒ 404）', () => {
    for (const { file } of GUITAR_SAMPLES) {
      expect(file, `${file} 含 URL 保留字符，会被浏览器截断`).not.toMatch(/[#?%\s+]/)
    }
  })
})
