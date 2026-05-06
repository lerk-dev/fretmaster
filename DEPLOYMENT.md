# FretMaster 部署说明

## Web版本 (路由器部署)

### 部署步骤
1. 确保路由器已安装OpenWrt并配置好Nginx
2. 运行部署脚本:
   ```powershell
   .\deploy-to-router.ps1
   ```
3. 访问 http://192.168.123.254/

### 手动部署
如果PowerShell脚本无法运行，可以手动复制dist文件夹到路由器的/www/fretmaster目录。

---

## Windows EXE版本

### 文件说明

| 文件 | 大小 | 说明 |
|------|------|------|
| `FretMaster.exe` | 5.44 MB | 便携版，直接运行 |
| `FretMaster-Setup.exe` | 2.3 MB | 安装程序 |

### WebView2 说明

**Tauri v2 使用 Edge WebView2，不需要额外的DLL文件！**

WebView2是Windows 10/11的系统组件，通过以下方式提供:
- Windows 11: 内置WebView2运行时
- Windows 10: 通过Windows Update自动安装

如果运行EXE时提示缺少WebView2，可以:
1. 下载WebView2运行时: https://developer.microsoft.com/microsoft-edge/webview2/
2. 或使用Evergreen Bootstrapper自动安装

### 系统要求
- Windows 10 (版本 1803+) 或 Windows 11
- WebView2 运行时 (通常已预装)
- 麦克风权限 (用于调音器功能)

---

## 版本更新记录

### v0.2.47 (2026-05-06)
- ✅ 新增节拍器声音可视化
- ✅ 新增练习数据导出 (CSV/PDF/JSON)
- ✅ 新增多乐器支持 (吉他/贝斯/号类等)
- ✅ 新增引导式教程
- ✅ Focus Mode 专注模式
- ✅ 自定义歌曲编辑器
- ✅ 收藏系统

---

## 常见问题

### Q: 为什么EXE文件看不到WebView2的DLL?
A: Tauri v2使用系统自带的Edge WebView2，不需要捆绑DLL文件。这样可以使EXE更小，且能自动更新。

### Q: 便携版和安装版有什么区别?
A: 
- 便携版: 单文件，直接运行，所有数据存储在同级目录
- 安装版: 需要安装，数据存储在用户目录，支持卸载

### Q: 如何更新Web版本?
A: 重新运行 `npm run build` 然后执行部署脚本即可。
