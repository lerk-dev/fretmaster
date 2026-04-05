# EdgeOne Pages 部署脚本 (PowerShell)
# 使用方法: .\deploy-edgeone.ps1

Write-Host "🚀 开始部署到 EdgeOne Pages..." -ForegroundColor Green

# 1. 清理并重新构建
Write-Host "📦 清理并重新构建项目..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
npm run build

# 2. 检查构建是否成功
if (-not (Test-Path "dist")) {
    Write-Host "❌ 构建失败，dist 目录不存在" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 构建成功！" -ForegroundColor Green

# 3. 显示部署信息
Write-Host ""
Write-Host "📋 部署信息:" -ForegroundColor Cyan
Write-Host "  - 项目名称: FretMaster"
Write-Host "  - 构建输出: dist/"
Write-Host "  - 入口文件: dist/index.html"
Write-Host ""

# 4. 文件统计
$htmlCount = (Get-ChildItem -Path "dist" -Filter "*.html" -Recurse).Count
$jsCount = (Get-ChildItem -Path "dist" -Filter "*.js" -Recurse).Count
$cssCount = (Get-ChildItem -Path "dist" -Filter "*.css" -Recurse).Count
$totalCount = (Get-ChildItem -Path "dist" -Recurse -File).Count

Write-Host "📊 文件统计:" -ForegroundColor Cyan
Write-Host "  - HTML 文件: $htmlCount"
Write-Host "  - JS 文件: $jsCount"
Write-Host "  - CSS 文件: $cssCount"
Write-Host "  - 总文件数: $totalCount"
Write-Host ""

# 5. 部署提示
Write-Host "🎯 部署步骤:" -ForegroundColor Magenta
Write-Host "  1. 登录 EdgeOne Pages 控制台"
Write-Host "  2. 创建新项目或选择现有项目"
Write-Host "  3. 上传 dist/ 目录中的所有文件"
Write-Host "  4. 等待部署完成"
Write-Host ""
Write-Host "🔗 EdgeOne Pages 控制台: https://console.cloud.tencent.com/edgeone/pages" -ForegroundColor Blue
Write-Host ""
Write-Host "✨ 部署文件已准备就绪！" -ForegroundColor Green
Write-Host ""
Write-Host "💡 提示: 您也可以直接压缩 dist 目录并上传到 EdgeOne Pages" -ForegroundColor Gray