// 构建时自动更新版本号和日期
// 运行方式: node scripts/update-version.js
//
// 🚨 版本号有四处副本，必须一起改（2026-10-02 之前只改了前两处）：
//   1. package.json          —— 前端/Node 侧
//   2. lib/version.ts        —— 前端展示用（自动生成）
//   3. src-tauri/Cargo.toml  —— Rust crate 版本
//   4. src-tauri/tauri.conf.json —— ⚠️ **这个才是安装包文件名的来源**
// 漏掉第 4 处的后果：安装包叫 `FretMaster_0.2.157_x64-setup.exe`，
// 而应用内显示 0.2.219 —— 两个数字对不上，用户无法判断装的是哪版。
// 用正则做**定点替换**而不是 JSON.parse/stringify，是为了保住原文件的
// 缩进与字段顺序（tauri.conf.json 是手写维护的，重排会产生巨大无意义 diff）。

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

// 获取当前日期时间
const now = new Date()
const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '') // HHMMSS
const buildId = `${dateStr.replace(/-/g, '')}.${timeStr}`

// 读取 package.json
const packagePath = path.join(ROOT, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

// 解析当前版本
const currentVersion = packageJson.version || '0.1.0'
const [major, minor, patch] = currentVersion.split('.').map(Number)

// 生成新版本号 (自动递增 patch 版本)
const newVersion = `${major}.${minor}.${patch + 1}`

// 更新 package.json
packageJson.version = newVersion
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n')

/**
 * 定点替换某个文件里的版本号，并回读校验。
 *
 * 🚨 为什么不用 `String.replace(pattern, `$1${v}$3`)`：
 *    本函数第一版就是那么写的，结果把 tauri.conf.json 写成了
 *    `"version": "0.2.2190.2.157",` —— 前缀捕获组（`\s*"version":\s*"`）被吃掉，
 *    旧版本号又被拼回去。**文件损坏但 JSON 仍能解析**，
 *    所以只有逐字节看 diff 才发现。
 *
 * 🚨 第二个坑（同样吃过）：**捕获组的序号必须显式指定**。
 *    本函数第一版硬编码 `args[1]`，而 tauri.conf.json 的模式是
 *    `/(\s*"version":\s*")([^"]+)(")/` —— 纯版本号在第 **2** 组，
 *    `args[1]` 是前缀 ⇒ `indexOf(前缀)` 找到 0 ⇒ 前缀被当成版本号整段替换掉。
 *    ⇒ 现在由调用方传 `versionGroup`，且启动时自检「捕获到的内容不含引号/换行」。
 *
 * @param {string} relPath 相对项目根的路径
 * @param {RegExp} pattern 带捕获组
 * @param {number} versionGroup 纯版本号所在的捕获组序号（1-based）
 * @returns {'updated'|'unchanged'} 实际是否发生了替换
 * @throws {Error} 模式未命中 —— 说明文件结构变了，**当场失败**比静默漏改安全
 */
function stampVersion(relPath, pattern, versionGroup) {
  const abs = path.join(ROOT, relPath)
  const src = fs.readFileSync(abs, 'utf8')

  // 每次都用全新 RegExp 构造，避免 lastIndex 残留（带 g 标志时有状态）
  const probe = new RegExp(pattern.source, pattern.flags.replace('g', ''))
  const m = src.match(probe)
  if (!m) {
    throw new Error(
      `[update-version] 在 ${relPath} 里找不到版本号模式 ${pattern}。` +
        `文件结构可能已变更 —— 请同步更新本脚本，不要让它静默跳过。`
    )
  }

  const sample = m[versionGroup]
  // 自检：捕获到的必须是**看起来像版本号**的东西。抓到前缀/引号就说明组号写错了。
  if (typeof sample !== 'string' || !/^\d+\.\d+\.\d+$/.test(sample)) {
    throw new Error(
      `[update-version] ${relPath} 的第 ${versionGroup} 捕获组是 ${JSON.stringify(sample)}，` +
        `不像版本号 —— versionGroup 可能写错了（会静默把前缀当版本号替换掉）`
    )
  }

  let hit = false
  const replaced = src.replace(probe, (...args) => {
    const matched = args[0]
    const captured = args[versionGroup] // 纯版本号
    hit = true
    const idx = matched.indexOf(captured)
    if (idx < 0) throw new Error(`[update-version] ${relPath} 捕获组定位失败`)
    // 前段（含前缀）+ 新版本号 + 后段，逐段拼接，绝不重排
    return matched.slice(0, idx) + newVersion + matched.slice(idx + captured.length)
  })

  if (!hit || replaced === src) return 'unchanged'
  fs.writeFileSync(abs, replaced)
  return 'updated'
}

/**
 * 护栏：替换后必须逐字节确认「除了版本号那一段，前后缀一字未变」。
 * 损坏版（`0.2.2190.2.157",`）能通过 JSON.parse，所以只能靠这个查。
 * @param {string} srcBefore 替换前原文
 * @param {string} srcAfter 替换后原文
 * @param {RegExp} pattern 与 stampVersion 同一个模式
 * @param {string} oldVersion 替换前的版本号
 */
function assertPrefixSuffixIntact(relPath, srcBefore, srcAfter, pattern, oldVersion) {
  const strip = (s) => s.replace(new RegExp(pattern.source, pattern.flags), '__V__')
  if (strip(srcBefore) !== strip(srcAfter)) {
    throw new Error(
      `[update-version] ${relPath} 替换后除版本号外的内容发生了变化 —— 疑似前缀/后缀错位。\n` +
        `  替换前: ${JSON.stringify(strip(srcBefore).slice(0, 120))}\n` +
        `  替换后: ${JSON.stringify(strip(srcAfter).slice(0, 120))}`
    )
  }
  // 再确认旧版本号没有残留（防止 `0.2.2190.2.157` 这类拼接）
  if (srcAfter.includes(oldVersion + '"') && !srcAfter.includes(`"version": "${newVersion}"`)) {
    throw new Error(`[update-version] ${relPath} 里旧版本号 ${oldVersion} 仍有残留`)
  }
}

const stamped = []

// 四处版本号副本（相对路径, 匹配模式, 纯版本号所在捕获组, 说明）
// ⚠️ 测试 __tests__/version-stamp-sync.test.ts 会读这份表：新增副本必须同步登记，
//    否则会静默漏改（护栏扫的是「文件里是否真的写进了同一个版本号」）。
const VERSION_TARGETS = [
  {
    file: 'src-tauri/Cargo.toml',
    // 只认行首顶格的 version（[package] 段那条），避免误改依赖里的 version /
    // 也避开末尾 [patch.crates-io] 内容
    pattern: /^version = "([^"]+)"/m,
    versionGroup: 1,
  },
  {
    file: 'src-tauri/tauri.conf.json',
    // ⚠️ 这个才是**安装包文件名**的来源，漏改会导致包名与应用内版本对不上
    // 组 2 = 纯版本号（组 1 是 `  "version": "` 前缀，组 3 是收尾引号）
    pattern: /^(\s*"version":\s*")([^"]+)(")/m,
    versionGroup: 2,
  },
]

for (const target of VERSION_TARGETS) {
  try {
    const abs = path.join(ROOT, target.file)
    const srcBefore = fs.readFileSync(abs, 'utf8')
    const oldVersion = (srcBefore.match(target.pattern) || [])[target.versionGroup] || ''

    const r = stampVersion(target.file, target.pattern, target.versionGroup)

    if (r === 'updated') {
      // 逐字节校验前后缀没被动过（损坏版能通过 JSON.parse，只能这样查）
      assertPrefixSuffixIntact(
        target.file,
        srcBefore,
        fs.readFileSync(abs, 'utf8'),
        target.pattern,
        oldVersion
      )
    }
    stamped.push([target.file, r])
  } catch (e) {
    console.error(`⚠️  ${e.message}`)
    process.exitCode = 1
  }
}

// 创建版本信息文件
const versionInfo = {
  version: newVersion,
  buildId: buildId,
  buildDate: now.toISOString(),
  buildDateLocal: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
}

// 写入版本信息到 lib/version.ts
const versionTsPath = path.join(ROOT, 'lib', 'version.ts')
const versionTsContent = `// 自动生成的版本信息 - 请勿手动修改
// 生成时间: ${versionInfo.buildDateLocal}

export const VERSION = '${versionInfo.version}'
export const BUILD_DATE_LOCAL = '${versionInfo.buildDateLocal}'
`

fs.writeFileSync(versionTsPath, versionTsContent)

console.log('========================================')
console.log('📦 版本信息已更新')
console.log('========================================')
console.log(`版本号: ${newVersion}`)
console.log(`构建ID: ${buildId}`)
console.log(`构建时间: ${versionInfo.buildDateLocal}`)
console.log('----------------------------------------')
console.log('已同步的文件:')
console.log(`  package.json            → ${newVersion}`)
console.log(`  lib/version.ts          → ${newVersion}`)
for (const [file, r] of stamped) {
  console.log(`  ${file.padEnd(23)} → ${newVersion}${r === 'unchanged' ? ' (未变化)' : ''}`)
}
console.log('========================================')
