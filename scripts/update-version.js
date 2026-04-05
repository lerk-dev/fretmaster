// 构建时自动更新版本号和日期
// 运行方式: node scripts/update-version.js

const fs = require('fs')
const path = require('path')

// 获取当前日期时间
const now = new Date()
const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '') // HHMMSS
const buildId = `${dateStr.replace(/-/g, '')}.${timeStr}`

// 读取 package.json
const packagePath = path.join(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

// 解析当前版本
const currentVersion = packageJson.version || '0.1.0'
const [major, minor, patch] = currentVersion.split('.').map(Number)

// 生成新版本号 (自动递增 patch 版本)
const newVersion = `${major}.${minor}.${patch + 1}`

// 更新 package.json
packageJson.version = newVersion
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n')

// 创建版本信息文件
const versionInfo = {
  version: newVersion,
  buildId: buildId,
  buildDate: now.toISOString(),
  buildDateLocal: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
}

// 写入版本信息到 lib/version.ts
const versionTsPath = path.join(__dirname, '..', 'lib', 'version.ts')
const versionTsContent = `// 自动生成的版本信息 - 请勿手动修改
// 生成时间: ${versionInfo.buildDateLocal}

export const VERSION = '${versionInfo.version}'
export const BUILD_ID = '${versionInfo.buildId}'
export const BUILD_DATE = '${versionInfo.buildDate}'
export const BUILD_DATE_LOCAL = '${versionInfo.buildDateLocal}'

export function getVersionInfo() {
  return {
    version: VERSION,
    buildId: BUILD_ID,
    buildDate: BUILD_DATE,
    buildDateLocal: BUILD_DATE_LOCAL,
  }
}
`

fs.writeFileSync(versionTsPath, versionTsContent)

console.log('========================================')
console.log('📦 版本信息已更新')
console.log('========================================')
console.log(`版本号: ${newVersion}`)
console.log(`构建ID: ${buildId}`)
console.log(`构建时间: ${versionInfo.buildDateLocal}`)
console.log('========================================')
