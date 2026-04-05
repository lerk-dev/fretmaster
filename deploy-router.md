# 路由器部署指南

## 📋 部署前提

### 支持的路由器类型
- OpenWrt/LEDE
- DD-WRT
- Padavan
- 梅林固件
- 其他支持自定义Web服务器的路由器

### 所需条件
- 路由器有USB接口或足够存储空间
- 支持安装lighttpd/nginx等Web服务器
- 基本的路由器配置知识

## 🚀 部署步骤

### 1. 准备静态文件
```bash
# 构建生产版本
npm run build

# 生成的静态文件在 dist/ 目录
```

### 2. 路由器Web服务器配置

#### OpenWrt路由器示例：
```bash
# 登录路由器SSH
ssh root@192.168.1.1

# 安装lighttpd
opkg update
opkg install lighttpd lighttpd-mod-cgi

# 创建网站目录
mkdir -p /www/fretmaster

# 上传dist目录内容到 /www/fretmaster/
# 可以使用scp或路由器文件管理

# 配置lighttpd
vi /etc/lighttpd/lighttpd.conf
```

#### lighttpd配置示例：
```nginx
server.modules = (
    "mod_access",
    "mod_alias",
    "mod_compress",
    "mod_redirect"
)

server.document-root = "/www/fretmaster"
server.upload-dirs = ( "/tmp" )
server.errorlog = "/var/log/lighttpd/error.log"
server.pid-file = "/var/run/lighttpd.pid"
server.username = "www"
server.groupname = "www"
server.port = 8080

index-file.names = ( "index.html" )

# MIME类型配置
mimetype.assign = (
  ".html" => "text/html",
  ".css" => "text/css",
  ".js" => "application/javascript",
  ".json" => "application/json",
  ".png" => "image/png",
  ".jpg" => "image/jpeg",
  ".svg" => "image/svg+xml",
  ".ico" => "image/x-icon"
)

# SPA路由支持
url.rewrite-if-not-file = (
  "^/(.+)$" => "/index.html"
)

# 启用压缩
compress.cache-dir = "/tmp/lighttpd/cache/compress"
compress.filetype = ("text/plain", "text/html", "text/css", "application/javascript")
```

### 3. 启动服务
```bash
# 启动lighttpd
/etc/init.d/lighttpd start
/etc/init.d/lighttpd enable

# 检查服务状态
/etc/init.d/lighttpd status
```

### 4. 访问应用
- 局域网访问: http://路由器IP:8080
- 例如: http://192.168.1.1:8080

## 🔒 HTTPS配置（可选）

如果需要麦克风权限，必须配置HTTPS：

### 1. 生成自签名证书
```bash
# 在路由器上生成证书
openssl req -new -newkey rsa:2048 -days 365 -nodes -x509 \
  -keyout /etc/lighttpd/server.key \
  -out /etc/lighttpd/server.crt \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=Personal/CN=router.local"
```

### 2. 配置HTTPS
```nginx
# 在lighttpd.conf中添加
$SERVER["socket"] == ":8443" {
  ssl.engine = "enable"
  ssl.pemfile = "/etc/lighttpd/server.pem"
  ssl.ca-file = "/etc/lighttpd/ca.crt"
}
```

## 📱 手机端优化

### 针对移动端的配置调整
在 `next.config.mjs` 中添加移动端优化：

```javascript
const nextConfig = {
  output: 'export',
  distDir: 'dist',
  trailingSlash: true,
  experimental: {
    optimizeCss: true,
  },
  // 移动端优化
  compiler: {
    removeConsole: true,
  },
}
```

## 🔧 故障排除

### 常见问题
1. **端口被占用**: 更改server.port配置
2. **权限问题**: 确保文件权限正确
3. **SPA路由404**: 检查url.rewrite配置
4. **HTTPS证书警告**: 浏览器需要信任自签名证书

### 性能优化建议
- 启用gzip压缩
- 设置缓存头
- 优化图片大小
- 使用CDN加速静态资源

## 🌐 高级功能

### 动态DNS（外网访问）
如果需要从外网访问，可以配置动态DNS：

1. 申请免费动态DNS服务（如noip.com）
2. 在路由器中配置DDNS
3. 设置端口转发

### 反向代理
如果需要与现有网站共存，可以使用反向代理：

```nginx
location /fretmaster/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 📞 技术支持

如果遇到部署问题，可以：
1. 检查路由器日志: `logread | grep lighttpd`
2. 验证文件权限
3. 测试基本HTTP服务
4. 检查防火墙设置

---

**注意**: 路由器部署适合局域网使用，如果需要公网访问和HTTPS支持，建议使用EdgeOne Pages等云服务。