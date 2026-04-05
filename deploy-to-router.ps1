# OpenWrt路由器自动部署脚本
# 使用方法: .\deploy-to-router.ps1

$routerIP = "192.168.123.2"
$routerUser = "root"
$routerPassword = "password"
$localDistPath = ".\dist"
$remotePath = "/www/fretmaster"

Write-Host "🚀 开始部署到OpenWrt路由器..." -ForegroundColor Green
Write-Host "路由器地址: $routerIP" -ForegroundColor Cyan

# 检查dist目录是否存在
if (-not (Test-Path $localDistPath)) {
    Write-Host "❌ 错误: dist目录不存在，请先运行 'npm run build'" -ForegroundColor Red
    exit 1
}

# 安装pscp和plink（如果未安装）
function Install-PuttyTools {
    $puttyPath = "C:\Program Files\PuTTY"
    if (-not (Test-Path "$puttyPath\pscp.exe")) {
        Write-Host "📥 正在下载PuTTY工具..." -ForegroundColor Yellow
        $url = "https://the.earth.li/~sgtatham/putty/latest/w64/pscp.exe"
        $output = "$env:TEMP\pscp.exe"
        Invoke-WebRequest -Uri $url -OutFile $output
        
        # 创建目录并移动文件
        if (-not (Test-Path $puttyPath)) {
            New-Item -ItemType Directory -Path $puttyPath -Force
        }
        Move-Item $output "$puttyPath\pscp.exe" -Force
        
        # 添加到PATH
        $env:Path += ";$puttyPath"
        [Environment]::SetEnvironmentVariable("Path", $env:Path, "User")
    }
}

# 使用SCP上传文件
function Deploy-Files {
    Write-Host "📤 正在上传文件到路由器..." -ForegroundColor Yellow
    
    # 创建远程目录
    $createDirCmd = "echo '$routerPassword' | plink -ssh -batch $routerUser@$routerIP 'mkdir -p $remotePath'"
    Invoke-Expression $createDirCmd
    
    # 上传文件
    $files = Get-ChildItem -Path $localDistPath -Recurse -File
    $totalFiles = $files.Count
    $currentFile = 0
    
    foreach ($file in $files) {
        $currentFile++
        $relativePath = $file.FullName.Substring((Resolve-Path $localDistPath).Path.Length + 1)
        $remoteFilePath = "$remotePath/$relativePath".Replace("\", "/")
        $remoteDir = Split-Path $remoteFilePath -Parent
        
        # 显示进度
        Write-Progress -Activity "部署文件" -Status "上传: $relativePath" -PercentComplete (($currentFile / $totalFiles) * 100)
        
        # 创建远程目录
        $mkdirCmd = "echo '$routerPassword' | plink -ssh -batch $routerUser@$routerIP 'mkdir -p \"$remoteDir\"'"
        Invoke-Expression $mkdirCmd
        
        # 上传文件
        $scpCmd = "echo '$routerPassword' | pscp -scp -r -pw '$routerPassword' \"$($file.FullName)\" $routerUser@${routerIP}:\"$remoteFilePath\""
        Invoke-Expression $scpCmd 2>$null
    }
    
    Write-Progress -Activity "部署文件" -Completed
    Write-Host "✅ 文件上传完成" -ForegroundColor Green
}

# 配置lighttpd
function Configure-Lighttpd {
    Write-Host "⚙️  配置lighttpd Web服务器..." -ForegroundColor Yellow
    
    $configContent = @"
server.modules = (
    "mod_access",
    "mod_alias",
    "mod_compress",
    "mod_redirect"
)

server.document-root = "/www"
server.upload-dirs = ( "/tmp" )
server.errorlog = "/var/log/lighttpd/error.log"
server.pid-file = "/var/run/lighttpd.pid"
server.username = "www"
server.groupname = "www"
server.port = 8080

# FretMaster配置
alias.url += ( "/fretmaster/" => "/www/fretmaster/" )

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
  "^/fretmaster/(.+)$" => "/fretmaster/index.html"
)

# 启用压缩
compress.cache-dir = "/tmp/lighttpd/cache/compress"
compress.filetype = ("text/plain", "text/html", "text/css", "application/javascript")
"@
    
    # 将配置写入临时文件
    $tempConfig = "$env:TEMP\lighttpd-fretmaster.conf"
    $configContent | Out-File -FilePath $tempConfig -Encoding UTF8
    
    # 上传配置文件
    $scpCmd = "echo '$routerPassword' | pscp -scp -pw '$routerPassword' \"$tempConfig\" $routerUser@${routerIP}:/etc/lighttpd/conf.d/fretmaster.conf"
    Invoke-Expression $scpCmd
    
    # 重启lighttpd
    $restartCmd = "echo '$routerPassword' | plink -ssh -batch $routerUser@$routerIP '/etc/init.d/lighttpd restart'"
    Invoke-Expression $restartCmd
    
    Write-Host "✅ lighttpd配置完成" -ForegroundColor Green
}

# 主函数
function Main {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "   FretMaster OpenWrt部署工具" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 安装工具
    Install-PuttyTools
    
    # 部署文件
    Deploy-Files
    
    # 配置Web服务器
    Configure-Lighttpd
    
    Write-Host ""
    Write-Host "🎉 部署完成！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "访问地址:" -ForegroundColor Yellow
    Write-Host "  HTTP:  http://$routerIP`:8080/fretmaster/" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  注意: 首次访问可能需要接受自签名证书警告" -ForegroundColor Yellow
}

# 执行主函数
Main
