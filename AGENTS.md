# Agent 指南（MPT）

面向 Cursor / AI Agent 的项目约定。人类协作者也可参考。

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
