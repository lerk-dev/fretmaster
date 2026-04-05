# 🚀 EdgeOne Pages 部署指南

## 📦 部署文件

所有部署所需的文件已生成在 `dist/` 目录中。

### 文件结构
```
dist/
├── index.html          # 主入口文件
├── 404.html            # 404 页面
├── _next/              # Next.js 静态资源
│   └── static/
│       ├── chunks/     # JS 和 CSS 文件
│       └── ...
├── _not-found/         # 404 页面资源
├── apple-icon.png      # 苹果图标
├── icon.svg            # 网站图标
└── ...                 # 其他静态资源
```

## 🎯 部署步骤

### 方法一：通过 EdgeOne Pages 控制台上传

1. **登录控制台**
   - 访问 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages)
   - 使用腾讯云账号登录

2. **创建/选择项目**
   - 点击「创建项目」或选择现有项目
   - 项目名称：`fretmaster`

3. **上传文件**
   - 选择「静态部署」方式
   - 上传 `dist/` 目录中的所有文件
   - 或者将 `dist/` 目录压缩为 zip 文件后上传

4. **配置域名（可选）**
   - 在项目中绑定自定义域名
   - 或直接使用 EdgeOne Pages 提供的默认域名

5. **完成部署**
   - 等待部署完成（通常 1-2 分钟）
   - 访问分配的域名查看效果

### 方法二：使用命令行工具

```bash
# 安装 EdgeOne Pages CLI
npm install -g @edgeone/pages-cli

# 登录
edgeone-pages login

# 部署
edgeone-pages deploy dist/
```

## 📋 配置说明

### 已配置项

1. **静态导出** (`next.config.mjs`)
   ```javascript
   output: 'export'
   distDir: 'dist'
   ```

2. **EdgeOne Pages 配置** (`_edgeone/pages.json`)
   - 构建命令：`npm run build`
   - 输出目录：`dist`
   - 路由规则：SPA 路由支持
   - 安全头部：已配置

3. **缓存策略**
   - JS/CSS 文件：1年缓存
   - HTML 文件：不缓存

## 🔧 本地测试

在部署前，您可以先本地测试构建结果：

```bash
# 安装 serve
npm install -g serve

# 本地预览
serve dist/

# 访问 http://localhost:3000
```

## 🌐 部署后访问

部署成功后，您可以通过以下方式访问：

- **默认域名**：`https://<project-name>-<hash>.edgeone.app`
- **自定义域名**：如果您绑定了自己的域名

## 📝 注意事项

1. **HTTPS**：EdgeOne Pages 自动提供 HTTPS 支持
2. **CDN**：全球 CDN 加速，访问速度快
3. **缓存**：静态资源有长期缓存，更新后可能需要刷新
4. **路由**：已配置 SPA 路由，支持前端路由

## 🆘 常见问题

### Q: 部署后页面显示空白？
A: 检查 `_next/static/` 目录是否正确上传，这是 Next.js 的静态资源。

### Q: 如何更新部署？
A: 重新运行 `npm run build`，然后重新上传 `dist/` 目录。

### Q: 如何配置自定义域名？
A: 在 EdgeOne Pages 控制台的项目设置中添加自定义域名。

## 📊 构建信息

- **构建时间**：$(date)
- **Next.js 版本**：16.1.6
- **输出模式**：静态导出
- **优化级别**：生产模式

---

**✨ 部署文件已准备就绪，祝您部署顺利！**