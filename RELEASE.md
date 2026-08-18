# Gognju 发布说明

## 本地打包

```bash
# 当前系统
npm run build

# 指定平台
npm run package:mac
npm run package:win
npm run package:linux
```

安装包输出到 `release/<版本号>/`。由于 Sharp 包含平台原生模块，正式发布时应在对应系统上构建；项目提供的 GitHub Actions 会自动完成这一点。

## GitHub Actions 自动发布

1. 将项目初始化为 Git 仓库并推送到 GitHub。
2. 在 `package.json` 中更新 `version`。
3. 创建并推送同版本标签：

```bash
git tag v1.0.0
git push origin v1.0.0
```

工作流会在 macOS、Windows、Linux 上分别构建，并把 DMG、ZIP、EXE、AppImage、DEB 上传到 GitHub Release。也可以在 Actions 页面手动运行，只生成工作流附件而不创建 Release。

## 正式签名所需 Secrets

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中配置：

### macOS

- `MAC_CERTIFICATE`：Developer ID Application 的 P12 文件（Base64 或文件内容）
- `MAC_CERTIFICATE_PASSWORD`：P12 密码
- `APPLE_ID`：Apple 开发者账号
- `APPLE_APP_PASSWORD`：App 专用密码
- `APPLE_TEAM_ID`：开发者 Team ID

### Windows

- `WIN_CERTIFICATE`：代码签名 PFX/P12 文件
- `WIN_CERTIFICATE_PASSWORD`：证书密码

不配置证书也能构建，但 macOS Gatekeeper 和 Windows SmartScreen 会对下载的应用显示安全警告。
