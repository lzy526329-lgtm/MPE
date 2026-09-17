# Agent 指南（MPT）

面向 Cursor / AI Agent 的项目约定。人类协作者也可参考。

## 图片资源引入规范（必须遵守）

所有新增或修改的应用内置图片引用，都必须兼容 Windows / macOS 的 Electron 安装版。安装版通过 `file://` 加载 `dist/index.html`，不能只以开发服务器中能显示为准。

### 路径与编码

- `public/` 下的图片，在页面运行时使用相对于 HTML 的 `./目录/文件名`，例如 `./farm/...`、`./foods/...`、`./fishing/...`。URL 中不包含 `public/` 或 `dist/`。
- **禁止**使用 `/fishing/...` 等以 `/` 开头的根路径。Windows 安装版会将其解析到盘符根目录（例如 `file:///C:/fishing/...`），而不是应用目录。也禁止硬编码开发机器的绝对路径、盘符路径或反斜杠路径。
- 中文、空格等文件名使用 `encodeURIComponent` 编码。多级路径逐段编码，再用 `/` 拼接；不要对整个路径编码，也不要重复编码已经编码的 URL。
- 图片目录中即使保存了以 `/` 开头的资源路径，也必须在前端资源解析函数中转换成 `./...`，不能直接传给页面。
- 优先复用现有资源解析函数，避免各页面自行拼接。参考 `src/fishingAssets.ts`、`src/foodAssets.ts`、`src/decorAssets.ts`。
- 本规范覆盖 `<img src>`、运行时生成的内联 `background-image`、`Image.src`、Canvas / WebGL 纹理加载等所有图片入口。独立 CSS 文件中的 `url(...)` 相对于 CSS 文件解析，须使用构建工具可解析的资源引用，并核对构建后的路径，不能直接照搬相对于 HTML 的路径。

```ts
// 单个文件名
const imageUrl = `./foods/${encodeURIComponent(fileName)}`

// 未编码的 public 相对路径，例如 fishingGrounds/鲫鱼-cutout.png
const imageUrl = `./${assetPath.split('/').map(encodeURIComponent).join('/')}`
```

### 验证要求

- 确认图片文件存在，引用的目录名、文件名及大小写与实际文件一致。
- 修改图片路径解析逻辑时，验证 Windows / macOS 的 `file://` 页面与开发服务器下的 URL 解析结果，确保资源仍位于应用资源目录内。可参考 `src/__tests__/fishingAssets.test.ts`。
- 构建后确认图片已进入 `dist/`，且生成的 URL 指向正确位置。开发服务器中显示正常不能替代安装版路径验证。

## 「执行 action」= 发正式版

当用户说 **「执行 action」**、**「执行action」**、**「跑 action」**、**「发版」** 或类似表述时，含义是：

> **发布一个新的正式版（GitHub Latest Release），不是手动 Run workflow 试包。**

### 必须做

1. 将 `package.json` 的 `version` 递增（patch 位 +1，如 `1.0.12` → `1.0.13`）。
2. 同步更新 `package-lock.json` 根包 `version`（仅 `"name": "mpt"` 相关字段，勿改依赖包版本号）。
3. 提交：`chore: release vX.Y.Z`
4. 打 tag：`vX.Y.Z`（与 `package.json` 版本一致，带 `v` 前缀）。
5. 推送 **main** 与 **tag** 到两个 remote：
   - `github` → GitHub（触发 CI）
   - `origin` → Gitee

```bash
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z
git push github main && git push github vX.Y.Z
```

6. 确认 GitHub Actions **Build desktop installers** 由 **tag 推送**（`push` + `v*`）触发，而非 `workflow_dispatch`。

### 禁止默认做

- **不要**仅用 `gh workflow run "Build desktop installers"` 代替发版。  
  手动 Run workflow 会把 Release 标为 **Pre-release**，应用内「检查更新」仍指向旧的 **Latest** 正式版（`/releases/latest` 读不到 pre-release）。
- **不要**在未 bump 版本的情况下重复打同一 tag。

### 发版成功后

- 正式版会成为 GitHub **Latest**；`latest-mac.yml` / `latest.yml` 更新后，应用内检查更新才会提示新版本。
- 构建进度：`gh run list --repo lzy526329-lgtm/MPE --workflow "Build desktop installers"`
- Release 页：https://github.com/lzy526329-lgtm/MPE/releases

### 试包（非正式版）

仅当用户明确说 **「试包」「预发布」「手动跑 workflow 测试」** 时，才使用：

```bash
gh workflow run "Build desktop installers" --repo lzy526329-lgtm/MPE --ref main
```

此时产物为 **Pre-release**，不用于用户侧的「检查更新」验证。

## 远程与仓库

| Remote   | 用途        |
|----------|-------------|
| `github` | GitHub 主仓，CI / Release / 应用更新源 |
| `origin` | Gitee 镜像  |

## 相关文档

- 人类可读发布说明：[RELEASE.md](./RELEASE.md)
- CI 定义：[.github/workflows/release.yml](./.github/workflows/release.yml)
- 应用内更新逻辑：[electron/updater.ts](./electron/updater.ts)
