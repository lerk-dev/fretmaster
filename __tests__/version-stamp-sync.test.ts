/**
 * 版本号必须四处一致 + 同步脚本必须真的覆盖全四处。
 *
 * 2026-10-02 发现：`scripts/update-version.js`（`prebuild` 钩子）只改
 * `package.json` 与 `lib/version.ts`，**漏掉 `Cargo.toml` 与 `tauri.conf.json`**。
 * 后果是安装包叫 `FretMaster_0.2.157_x64-setup.exe` 而应用内显示 `0.2.219`
 * —— 两个数字对不上，用户无法判断装的是哪一版。
 * 危害等级：中（不崩溃、不报错，纯静默错位，但用户会拿错版本）。
 *
 * 本条护栏做两件事：
 *   1. 静态：以 `package.json` 为唯一真相源，断言另外三处与它相等；
 *   2. 脚本：断言 `update-version.js` 的 `VERSION_TARGETS` 登记表覆盖了这些文件
 *      （防止有人加第五处副本却不登记，旧 bug 以新形态回来）。
 *
 * ⚠️ 本护栏**不**调用 `update-version.js`（它有副作用：递增版本号并写盘）。
 *    这里只做只读断言。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8')
}

const pkg = JSON.parse(read('package.json')) as { version: string }
const PKG_VERSION = pkg.version

describe('版本号四处一致', () => {
  it('package.json 的版本号形如 x.y.z（后续断言的前提）', () => {
    expect(PKG_VERSION, 'package.json 的 version 不是 x.y.z').toMatch(/^\d+\.\d+\.\d+$/)
  })

  it(`src-tauri/Cargo.toml 的 [package].version === ${PKG_VERSION}`, () => {
    // 只取行首顶格的 version（[package] 段那条），不碰依赖里的 version
    const m = read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)
    expect(m, 'Cargo.toml 里找不到行首顶格的 version = "…"').not.toBeNull()
    expect(
      m![1],
      `Cargo.toml 版本号与 package.json 不一致 ⇒ 安装包内嵌的 Rust 版本是错的`
    ).toBe(PKG_VERSION)
  })

  it(`src-tauri/tauri.conf.json 的顶层 version === ${PKG_VERSION}（安装包文件名来源）`, () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json')) as { version: string }
    expect(
      conf.version,
      `tauri.conf.json 版本号与 package.json 不一致 ⇒ **安装包文件名会带旧版本号**` +
        `（这正是 0.2.157 那个 bug）`
    ).toBe(PKG_VERSION)
  })

  it(`lib/version.ts 的 VERSION === ${PKG_VERSION}（应用内显示值）`, () => {
    const m = read('lib/version.ts').match(/export const VERSION = '([^']+)'/)
    expect(m, 'lib/version.ts 里找不到 VERSION 导出').not.toBeNull()
    expect(m![1], 'lib/version.ts 与 package.json 不一致 ⇒ 应用内显示的版本是错的').toBe(
      PKG_VERSION
    )
  })

  it(`package-lock.json 的两处项目版本号都 === ${PKG_VERSION}`, () => {
    // lock 里有顶层 + packages[""] 两份项目自身的版本号，另有几百个依赖的
    // version。用 JSON.parse 精确定位这两处，别用「文件里有没有这个字符串」——
    // 依赖里出现同版本号会让它恒真。
    // 2026-11-12 / 11-13 连续两次发现它落后：update-version.js 原本不管 lock，
    // 而 npm install 会把它回写成 package.json 的值 ⇒ 每次手动补都会复发。
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string
      packages: { '': { version: string } }
    }
    expect(lock.version, '顶层 version 落后于 package.json').toBe(PKG_VERSION)
    expect(lock.packages[''].version, 'packages[""] 的 version 落后于 package.json').toBe(
      PKG_VERSION
    )
  })
})

describe('同步脚本必须登记全部版本号副本', () => {
  const script = read('scripts/update-version.js')

  // 从脚本里逐字解析出登记表，而不是断言「字符串存在」——
  // 后者对「加了一处副本但忘了登记」这种情况无效。
  function registeredFiles(): string[] {
    const block = script.match(/const VERSION_TARGETS = \[([\s\S]*?)\n\]/)
    expect(block, 'update-version.js 里找不到 VERSION_TARGETS 登记表').not.toBeNull()
    return [...block![1].matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1])
  }

  it('登记了 Cargo.toml 与 tauri.conf.json（旧 bug 的直接回归项）', () => {
    const files = registeredFiles()
    expect(files, `登记表实际内容: ${JSON.stringify(files)}`).toContain('src-tauri/Cargo.toml')
    expect(files, `登记表实际内容: ${JSON.stringify(files)}`).toContain(
      'src-tauri/tauri.conf.json'
    )
  })

  it('登记表覆盖 package-lock.json（否则 prebuild 又会漏改它）', () => {
    expect(registeredFiles(), `登记表实际内容: ${JSON.stringify(registeredFiles())}`).toContain(
      'package-lock.json'
    )
    // 两处副本 ⇒ 必须开着 all，否则只替换第一处、留半份旧值
    const block = script.match(/const VERSION_TARGETS = \[([\s\S]*?)\n\]/)![1]
    const entry = block.split(/\},\s*\{/).find((x) => x.includes("file: 'package-lock.json'"))
    expect(entry, '登记表里找不到 package-lock.json 条目').toBeTruthy()
    expect(entry, 'package-lock.json 有两处副本，必须用 all: true 全量替换').toContain(
      'all: true'
    )
  })

  it('每个登记目标都有 versionGroup（捕获组序号），且指向纯版本号', () => {
    // 🚨 这里是有真实前科的：第一版硬编码 args[1]，而 tauri.conf.json 的
    //    纯版本号在第 2 组 ⇒ 前缀被当成版本号整段替换，文件被写成
    //    `"version": "0.2.2190.2.157",`（**JSON 仍然合法**，只有看 diff 才发现）。
    const block = script.match(/const VERSION_TARGETS = \[([\s\S]*?)\n\]/)![1]
    const entries = block.split(/\},\s*\{/).filter((s) => s.includes('file:'))
    expect(entries.length, '登记表条目数异常').toBeGreaterThanOrEqual(2)

    for (const entry of entries) {
      const file = entry.match(/file:\s*'([^']+)'/)![1]
      const group = entry.match(/versionGroup:\s*(\d+)/)
      expect(group, `${file} 缺少 versionGroup —— 会退化成「猜捕获组」`).not.toBeNull()

      // 用真实文件验证该组号确实抓到纯版本号
      // ⚠️ 这里**不能**用 `/s`（dotAll）标志：tsconfig 的 target 是 ES6，
      //    tsc 会报 TS1501（dotAll 需要 ES2018+）。改用 `[\s\S]` 表达「跨行任意字符」。
      const patternSrc = entry.match(/pattern:\s*(\/[\s\S]*?\/[a-z]*)/)![1]
      const lastSlash = patternSrc.lastIndexOf('/')
      // ⚠️ 去掉 g 标志：String.match 在带 g 时只返回「匹配文本数组」、**不含捕获组**，
      //    于是 hit[versionGroup] 恒 undefined（新增 package-lock 条目带 gm 时踩到）。
      //    本护栏只验证「第一个匹配的捕获组是不是纯版本号」，本就该用非全局匹配。
      const re = new RegExp(
        patternSrc.slice(1, lastSlash),
        patternSrc.slice(lastSlash + 1).replace('g', '')
      )
      const hit = read(file).match(re)
      expect(hit, `${file} 的模式在真实文件里没命中`).not.toBeNull()
      expect(
        hit![Number(group![1])],
        `${file} 的第 ${group![1]} 捕获组不是纯版本号（会静默把前缀当版本号替换掉）`
      ).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it('脚本自带「前后缀未变」护栏（损坏版能通过 JSON.parse，必须逐字节查）', () => {
    expect(script, 'update-version.js 缺少前缀/后缀完整性护栏').toContain(
      'assertPrefixSuffixIntact'
    )

    // 🚨 必须数**调用点**，不能只 toMatch 函数名 ——
    //    第一版写的是 `/assertPrefixSuffixIntact\s*\(/`，它同时命中
    //    `function assertPrefixSuffixIntact(...)` 这一行 ⇒ 把调用整个删掉后
    //    断言依然通过（变异 M7 = ZERO）。这正是本项目反复踩的「子串式断言恒真」。
    const defs = (script.match(/function\s+assertPrefixSuffixIntact\s*\(/g) || []).length
    const all = (script.match(/assertPrefixSuffixIntact\s*\(/g) || []).length
    expect(defs, '护栏函数定义处数量异常').toBe(1)
    expect(
      all - defs,
      'assertPrefixSuffixIntact 定义了但没有真实的调用点 ⇒ 完整性校验形同虚设'
    ).toBe(1)
  })

  it('模式未命中时必须当场失败，而不是静默跳过', () => {
    expect(
      script,
      'update-version.js 在模式未命中时没有失败 ⇒ 文件结构变了会静默漏改版本号'
    ).toMatch(/process\.exitCode\s*=\s*1/)
  })
})
