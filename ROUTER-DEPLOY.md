# OpenWrt路由器快速部署指南

## 🚀 一键部署（推荐）

### 1. 确保已构建项目
```bash
npm run build
```

### 2. 运行部署脚本
```powershell
# 在PowerShell中运行
.\deploy-to-router.ps1
```

## 🔧 手动部署步骤

如果你更喜欢手动控制，可以按照以下步骤操作：

### 步骤1: 连接到路由器SSH
```bash
# 使用Windows PowerShell或命令提示符
ssh root@192.168.123.2
# 密码: password
```

### 步骤2: 在路由器上创建目录
```bash
# 登录路由器后执行
mkdir -p /www/fretmaster
cd /www/fretmaster
```

### 步骤3: 上传文件（在本地PowerShell中执行）

#### 方法A: 使用SCP（需要安装OpenSSH客户端）
```powershell
# 压缩dist目录
Compress-Archive -Path .\dist\* -DestinationPath .\fretmaster.zip -Force

# 上传到路由器
scp .\fretmaster.zip root@192.168.123.2:/tmp/

# 登录路由器解压
ssh root@192.168.123.2 "cd /www/fretmaster && unzip -o /tmp/fretmaster.zip"
```

#### 方法B: 使用WinSCP（图形界面）
1. 下载并安装 WinSCP: https://winscp.net/
2. 打开WinSCP，配置连接：
   - 主机名: 192.168.123.2
   - 用户名: root
   - 密码: password
   - 协议: SCP
3. 连接后，将本地 `dist` 目录内容上传到 `/www/fretmaster/`

### 步骤4: 配置Web服务器

#### 检查lighttpd是否已安装
```bash
# 在路由器上执行
opkg list-installed | grep lighttpd
```

#### 如果未安装，安装lighttpd
```bash
opkg update
opkg install lighttpd lighttpd-mod-alias lighttpd-mod-compress
```

#### 配置lighttpd
```bash
# 编辑配置文件
cat > /etc/lighttpd/conf.d/fretmaster.conf << 'EOF'
# FretMaster配置
alias.url += ( "/fretmaster/" => "/www/fretmaster/" )

# SPA路由支持
url.rewrite-if-not-file += (
  "^/fretmaster/(.+)$" => "/fretmaster/index.html"
)
EOF
```

### 步骤5: 启动服务
```bash
# 重启lighttpd
/etc/init.d/lighttpd restart

# 设置开机自启
/etc/init.d/lighttpd enable

# 检查状态
/etc/init.d/lighttpd status
```

### 步骤6: 访问应用
```
http://192.168.123.2:80/fretmaster/
```

## 🔒 启用HTTPS（可选）

如果需要麦克风权限，需要配置HTTPS：

### 生成自签名证书
```bash
# 在路由器上执行
opkg install openssl-util

# 生成证书
openssl req -new -newkey rsa:2048 -days 365 -nodes -x509 \
  -keyout /etc/lighttpd/server.key \
  -out /etc/lighttpd/server.crt \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=Personal/CN=192.168.123.2"

# 合并证书
cat /etc/lighttpd/server.crt /etc/lighttpd/server.key > /etc/lighttpd/server.pem
```

### 配置HTTPS
```bash
cat >> /etc/lighttpd/conf.d/fretmaster.conf << 'EOF'

# HTTPS配置
$SERVER["socket"] == ":8443" {
  ssl.engine = "enable"
  ssl.pemfile = "/etc/lighttpd/server.pem"
  server.document-root = "/www"
}
EOF

# 重启服务
/etc/init.d/lighttpd restart
```

### HTTPS访问地址
```
https://192.168.123.2:8443/fretmaster/
```

## 🛠️ 故障排除

### 检查服务状态
```bash
# 查看lighttpd状态
/etc/init.d/lighttpd status

# 查看错误日志
tail -f /var/log/lighttpd/error.log

# 检查端口监听
netstat -tlnp | grep lighttpd
```

### 常见问题

#### 1. 端口被占用
```bash
# 更改端口
uci set lighttpd.main.port=8080
uci commit lighttpd
/etc/init.d/lighttpd restart
```

#### 2. 权限问题
```bash
# 修复文件权限
chown -R www:www /www/fretmaster
chmod -R 755 /www/fretmaster
```

#### 3. 防火墙阻止
```bash
# 添加防火墙规则
uci add firewall rule
uci set firewall.@rule[-1].name='Allow-FretMaster'
uci set firewall.@rule[-1].src='lan'
uci set firewall.@rule[-1].dest_port='80 8080 8443'
uci set firewall.@rule[-1].proto='tcp'
uci set firewall.@rule[-1].target='ACCEPT'
uci commit firewall
/etc/init.d/firewall restart
```

## 📱 访问测试

部署完成后，在同一局域网的任何设备上都可以访问：

- **电脑浏览器**: http://192.168.123.2/fretmaster/
- **手机浏览器**: http://192.168.123.2/fretmaster/
- **HTTPS版本**: https://192.168.123.2:8443/fretmaster/（如果配置了HTTPS）

## 🔄 更新部署

更新应用时，只需要重新上传dist目录：

```powershell
# 重新构建
npm run build

# 重新上传（使用WinSCP或SCP）
scp -r .\dist\* root@192.168.123.2:/www/fretmaster/
```

## 💡 提示

- 路由器需要足够的存储空间（至少50MB）
- 确保路由器有USB接口或足够的内部存储
- 首次访问HTTPS时，浏览器会显示安全警告，这是正常的
- 如果只需要局域网使用，HTTP版本就足够了