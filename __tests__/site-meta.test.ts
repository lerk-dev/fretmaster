/**
 * lib/site-meta.ts 的契约（审计 2026-10-31 第 14 项）。
 *
 * 静态导出（`output: 'export'`）只会生成一份 `index.html`，所以 `<head>` 里的文案
 * 天生无法按语言分别输出。原先的情况是：
 *   - `<title>` 在挂载后按语言改写（对）；
 *   - `meta[name=description]` **永远是中文** ⇒ 英文用户分享出去的链接预览是中文。
 *
 * 这里钉住三件事：
 *   ① 静态那份必须是**双语**（爬虫与分享预览读的是它）；
 *   ② 运行期按语言覆盖（title / description / html lang 三者一起）；
 *   ③ **接线不能断**：layout-shell 必须真的调 `applySiteMeta`，layout.tsx 必须真的用
 *      `STATIC_DESCRIPTION`（只写工具不接线 = 白做，且看不出来）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  SITE_TITLE,
  SITE_DESCRIPTION,
  STATIC_DESCRIPTION,
  normalizeSiteLanguage,
  applySiteMeta,
} from '@/lib/site-meta'

beforeEach(() => {
  document.head.innerHTML = '<meta name="description" content="占位" />'
  document.title = ''
  document.documentElement.lang = ''
})

afterEach(() => {
  document.head.innerHTML = ''
  document.documentElement.lang = ''
})

const description = () => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null

describe('文案', () => {
  it('两种语言的标题与描述都存在且互不相同', () => {
    for (const lang of ['zh-CN', 'en'] as const) {
      expect(SITE_TITLE[lang].length).toBeGreaterThan(0)
      expect(SITE_DESCRIPTION[lang].length).toBeGreaterThan(0)
    }
    expect(SITE_TITLE['zh-CN']).not.toBe(SITE_TITLE.en)
    expect(SITE_DESCRIPTION['zh-CN']).not.toBe(SITE_DESCRIPTION.en)
  })

  it('🚨 静态描述是双语的（爬虫/分享预览只看得到这一份）', () => {
    // 中文侧有汉字，英文侧有英文单词 —— 两边都必须出现
    expect(STATIC_DESCRIPTION).toMatch(/[\u4e00-\u9fa5]/)
    expect(STATIC_DESCRIPTION).toMatch(/[A-Za-z]{4,}/)
    expect(STATIC_DESCRIPTION).toContain(SITE_DESCRIPTION['zh-CN'])
    expect(STATIC_DESCRIPTION).toContain(SITE_DESCRIPTION.en)
  })
})

describe('normalizeSiteLanguage', () => {
  it('只认 en，其余一律 zh-CN', () => {
    expect(normalizeSiteLanguage('en')).toBe('en')
    expect(normalizeSiteLanguage('zh-CN')).toBe('zh-CN')
    for (const bad of ['ja', '', null, undefined, 'EN', 'english']) {
      expect(normalizeSiteLanguage(bad), String(bad)).toBe('zh-CN')
    }
  })
})

describe('applySiteMeta', () => {
  it('中文：title / description / html lang 三处一起更新', () => {
    applySiteMeta('zh-CN')
    expect(document.title).toBe(SITE_TITLE['zh-CN'])
    expect(description()).toBe(SITE_DESCRIPTION['zh-CN'])
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('英文：描述必须换成英文（这就是原来的 bug：只有 title 换了）', () => {
    applySiteMeta('en')
    expect(document.title).toBe(SITE_TITLE.en)
    expect(description()).toBe(SITE_DESCRIPTION.en)
    expect(description()).not.toMatch(/[\u4e00-\u9fa5]/)
    expect(document.documentElement.lang).toBe('en')
  })

  it('来回切换不会残留上一种语言的描述（幂等）', () => {
    applySiteMeta('en')
    applySiteMeta('zh-CN')
    applySiteMeta('zh-CN')
    expect(description()).toBe(SITE_DESCRIPTION['zh-CN'])
  })

  it('未知语言码按中文写，不会把描述清空', () => {
    applySiteMeta('ja')
    expect(description()).toBe(SITE_DESCRIPTION['zh-CN'])
  })

  it('页面上没有 description 时也不炸（只是什么都不写）', () => {
    document.head.innerHTML = ''
    expect(() => applySiteMeta('en')).not.toThrow()
    expect(description()).toBeNull()
  })
})

describe('源码护栏：接线不能断', () => {
  const layoutShell = readFileSync('components/layout-shell.tsx', 'utf8')
  const layout = readFileSync('app/layout.tsx', 'utf8')

  it('layout-shell 调用 applySiteMeta（而不是自己拼 title）', () => {
    expect(layoutShell).toContain("from '@/lib/site-meta'")
    expect(layoutShell).toContain('applySiteMeta(language)')
    expect(
      layoutShell,
      '别在组件里再手写一份标题：文案的唯一来源是 lib/site-meta.ts',
    ).not.toContain('document.title =')
  })

  it('layout.tsx 的静态描述走 STATIC_DESCRIPTION（不许写死单语）', () => {
    expect(layout).toContain('STATIC_DESCRIPTION')
    const metaLine = layout.split('\n').find((line) => line.includes('name="description"'))
    expect(metaLine, '找不到 description 的 meta 标签').toBeTruthy()
    expect(metaLine).not.toMatch(/content="[\u4e00-\u9fa5]/)
  })
})
