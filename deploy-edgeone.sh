#!/bin/bash

# EdgeOne Pages 部署脚本
# 使用方法: ./deploy-edgeone.sh

echo "🚀 开始部署到 EdgeOne Pages..."

# 1. 清理并重新构建
echo "📦 清理并重新构建项目..."
rm -rf dist
npm run build

# 2. 检查构建是否成功
if [ ! -d "dist" ]; then
    echo "❌ 构建失败，dist 目录不存在"
    exit 1
fi

echo "✅ 构建成功！"

# 3. 显示部署信息
echo ""
echo "📋 部署信息:"
echo "  - 项目名称: FretMaster"
echo "  - 构建输出: dist/"
echo "  - 入口文件: dist/index.html"
echo ""

# 4. 文件统计
echo "📊 文件统计:"
echo "  - HTML 文件: $(find dist -name '*.html' | wc -l)"
echo "  - JS 文件: $(find dist -name '*.js' | wc -l)"
echo "  - CSS 文件: $(find dist -name '*.css' | wc -l)"
echo "  - 总文件数: $(find dist -type f | wc -l)"
echo ""

# 5. 部署提示
echo "🎯 部署步骤:"
echo "  1. 登录 EdgeOne Pages 控制台"
echo "  2. 创建新项目或选择现有项目"
echo "  3. 上传 dist/ 目录中的所有文件"
echo "  4. 等待部署完成"
echo ""
echo "🔗 EdgeOne Pages 控制台: https://console.cloud.tencent.com/edgeone/pages"
echo ""
echo "✨ 部署文件已准备就绪！"