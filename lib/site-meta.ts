/**
 * 站点级元信息（`<title>` / `meta[name=description]` / `<html lang>`）。
 *
 * ## 为什么要单独一个模块
 *
 * 这是**静态导出**（`output: 'export'`）：构建期只生成一份 `index.html`，
 * 所以 `<head>` 里的文案无法按语言分别输出。原先的做法是：
 * - `<title>` 在 `layout-shell` 挂载后按语言改写（已做）；
 * - `meta[name=description]` **永远是中文**（审计 2026-10-31 第 14 项）
 *   ⇒ 英文用户分享出去的链接预览是中文。
 *
 * 现在两件事都走这里：静态期写**双语**描述（爬虫/分享抓的是这一份），
 * 运行期按当前语言覆盖（用户看到的那一份）。
 *
 * 护栏：`__tests__/site-meta.test.ts`（含「layout-shell 真的调用了它」的源码护栏 ——
 * 只写工具不接线 = 白做）。
 */

export type SiteLanguage = 'zh-CN' | 'en'

/** 文档标题（`<title>` 与运行期 `document.title` 的唯一来源） */
export const SITE_TITLE: Record<SiteLanguage, string> = {
  'zh-CN': 'FretMaster - 吉他指板练习工具',
  en: 'FretMaster - Guitar Fretboard Practice Tool',
}

/** 描述文案（中英各一份，运行期按语言写入 meta） */
export const SITE_DESCRIPTION: Record<SiteLanguage, string> = {
  'zh-CN': '专业的吉他指板可视化练习工具，助你掌握指板音符位置',
  en: 'A visual guitar fretboard trainer for learning note positions, intervals, scales and chords',
}

/**
 * 静态导出时写进 `index.html` 的描述（双语）。
 *
 * 🚨 不要改成单语：这一份是**爬虫与社交分享**唯一能看到的内容，而站点同时提供
 * 中文和英文界面，任何一种单语都会让另一半用户看到完全不相关的语言。
 */
export const STATIC_DESCRIPTION = `${SITE_DESCRIPTION['zh-CN']} · ${SITE_DESCRIPTION.en}`

/** 把语言码收敛成支持的两值（与 `lib/i18n.ts` 的 `normalizeLanguage` 同口径）。 */
export function normalizeSiteLanguage(language: string | null | undefined): SiteLanguage {
  return language === 'en' ? 'en' : 'zh-CN'
}

/**
 * 按语言同步 `document.title` / `meta[name=description]` / `<html lang>`。
 *
 * 幂等：可以被任意次调用（语言切换、挂载）。没有 `document`（SSR / 测试环境）时直接返回。
 */
export function applySiteMeta(language: string | null | undefined): void {
  if (typeof document === 'undefined') return
  const lang = normalizeSiteLanguage(language)
  document.title = SITE_TITLE[lang]
  document.documentElement.lang = lang
  const meta = document.querySelector('meta[name="description"]')
  if (meta) meta.setAttribute('content', SITE_DESCRIPTION[lang])
}
