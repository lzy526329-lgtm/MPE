# MPT 发布说明

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

1. 把代码推到 GitHub（远程名一般是 `github`）。
2. 在 `package.json` 中更新 `version`。
3. 任选一种触发方式：

**手动跑（推荐试包）**

- 打开 GitHub → Actions → **Build desktop installers** → **Run workflow**
- 成功后会：
  - 上传 Artifacts（临时下载）
  - 创建/更新 GitHub Release（`v版本号`，手动触发时为 pre-release）
  - 若配置了 `GITEE_TOKEN`，同步到 Gitee Release（国内下载通常更快）

**打 tag 正式发版**

```bash
git tag v1.0.0
git push github v1.0.0
# 如需同步 tag 到 Gitee：
git push origin v1.0.0
```

### 下载地址

- GitHub Release：`https://github.com/lzy526329-lgtm/MPE/releases`
- Gitee Release：`https://gitee.com/li_ziyang/gongju/releases`
- 若 GitHub 很慢，优先用 Gitee；或用镜像加速 GitHub Release 直链（不要用 Artifact 链接）：

```text
https://ghfast.top/https://github.com/lzy526329-lgtm/MPE/releases/download/v1.0.0/<文件名>
```

## 应用内更新

打包安装后，在 **宠物设置 → 关于与更新** 可：

1. 点击「检查更新」对比 GitHub Release 最新版
2. 有新版本时点「下载更新」
3. 下载完成后：
   - **Windows / Linux**：点「安装并重启」自动替换
   - **macOS（当前未签名）**：点「打开安装包」，把 DMG 里的 App 拖到「应用程序」覆盖安装

Mac 自动更新依赖 Apple 代码签名；未配置开发者证书时，ShipIt 会报签名校验失败，因此改为打开 DMG 手动覆盖。

构建产物直接上传到 **GitHub Release**，不再经过 Actions Artifact（免费额度很容易被安装包撑满）。

## 配置 Gitee 同步（推荐）

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中新增：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `GITEE_TOKEN` | Secret | Gitee 私人令牌（需要 `projects` 权限） |
| `GITEE_OWNER` | Variable（可选） | 默认 `li_ziyang` |
| `GITEE_REPO` | Variable（可选） | 默认 `gongju` |

创建令牌：https://gitee.com/profile/personal_access_tokens

> 注意：Gitee **单附件上限约 100MB**，MPT 安装包通常会超过，因此完整安装包会发到 **GitHub Release**；Gitee Release 页面会写明下载方式与镜像链接。  
> 文件名对照：
> - Mac：`MPT-*-mac-arm64.dmg`
> - Windows：`MPT-*-win-x64.exe`
> - Linux：`MPT-*-linux-*.AppImage` / `.deb`

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
