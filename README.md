# MPT · MY PET

以桌面宠物为中心的本地工具箱。宠物常驻桌面，右键即可照顾、对话、打开工具；文件处理都在本机完成，不上传。

## 下载

- GitHub Release：https://github.com/lzy526329-lgtm/MPE/releases
- Gitee Release：https://gitee.com/li_ziyang/gongju/releases（国内可优先）

Mac 未签名安装包若提示「已损坏」，把 App 拖到「应用程序」后执行：

```bash
sudo xattr -cr /Applications/MPT.app
```

## 桌宠

| 能力 | 说明 |
|------|------|
| 桌面常驻 | 置顶透明窗，可拖拽；支持显示/隐藏、调整大小 |
| 形象 | Spine 角色切换；idle / 点击 / 行走 / 胜利等动画 |
| 自动行走 | 可开可关；按工作区活动，状态差时更懒，火象更爱动，土象更稳 |
| 身份 | 首次启动随机生成名字、性别、四元素 × 星座性格 |
| 状态 | 饱食度 / 卫生 / 健康 / 心情；随时间衰减，离线也会结算 |
| 照顾 | 喂食、清洁、休息（设置页或右键菜单）；照顾后会冒气泡反馈 |
| 提醒 | 间隔 / 定时 / 每日提醒，气泡弹出，可要求确认 |
| 主动搭话 | 饿、脏、虚弱、寂寞时本地模板冒气泡；心情好可哼歌 |
| 工作关怀 | 检测到连续用电脑约 30 分钟，提醒起来休息（空闲约 5 分钟后可再提醒） |
| AI 文案（可选） | 对话页开启后，主动搭话与照顾反馈可走 DeepSeek |
| 长期记忆 | 照顾、改名、会话摘要写入本机记忆，对话时注入上下文 |
| 小游戏 | 右键「小游戏 → 打小球」：规则与攻击范围见角色 `meta.json` 的 `skills` / `minigames.ballHit`；主窗口「玩法 → 象狮虎豹」支持红方对战电脑的翻牌、移动与吃牌 |
| 农场 | 6 格田种菜：播种、浇水、赶虫、收割；离线生长；缺水 / 枯萎 / 雨天 / 生虫事件；收获进背包，每日可领种子；右键或主窗口进入 |

性格会影响衰减倍率与走动习惯（火象更易饿、土象更稳等）。成长值 / 金币已建档，玩法仍在扩展。

## 玩家账号与云存档

主管理窗口提供账号入口。游客可继续本地游玩；登录后自动绑定当前 `game.json`，离线继续保存，联网后重试。已有不同云存档或多设备修订冲突时，需要选择本地或云端版本。选择云端前会备份本地文件；退出、封禁和会话失效不删除游戏进度。

开发时默认使用 `http://localhost:8088`，可通过 `GAME_API_BASE_URL` 指定本地测试服务。安装版构建必须显式设置 HTTPS 地址，否则构建失败：

```bash
GAME_API_BASE_URL=https://YOUR_GAME_API_HOST npm run build:app
```

地址是 API 所在的服务根地址，不含 `/api/game`；客户端会追加路径。禁止在地址内放用户名、密码、查询参数或片段。此配置在构建时写入 Electron 主进程，安装后仅修改 shell 环境不会替换构建地址。localhost HTTP 仅用于开发，不能用于正式安装版。SMTP、数据库连接和 `GAME_EMAIL_CODE_SECRET` 只配置在服务端，不能放进桌宠环境或渲染进程。

发布顺序为：服务端新增五张玩家表的数据库迁移、服务端与 SMTP 配置、管理后台、桌宠客户端。发布前在测试环境确认邮件注册、首次绑定、离线恢复、双设备冲突、封禁和解封重登。游戏配置和玩法继续由本地代码管理。

`npm test` 包含账号 API、会话、同步、界面及本地文件保护测试；`electron/gameAccount/e2e-fixtures.ts` 提供完整版本 2 测试存档，`e2e.test.ts` 验证响应协议经过真实 API 客户端和同步协调器后的行为，使用假传输和临时文件，不发送实际网络请求。

安装版通过 `file://` 加载 `dist/index.html` 与 `dist/pet.html`。构建后核对 HTML、动态资源和图片均为相对路径并实际存在；在 macOS 可使用 `CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac --dir --publish never` 生成未签名的本地检查包，不触发发布。

## 本地好友对战双开测试

先启动 `gognju-server/server` 的本地后端（`npm start`，端口 8088），停止普通 `npm run dev` 后，在本项目执行：

```bash
npm run dev:battle
```

将自动打开「本地对战测试 A / B」两个窗口，统一连接 `http://localhost:8088`，不会使用 shell 中配置的线上 API 地址。两边分别登录不同测试账号、互加好友，再创建房间并邀请，或通过房间码加入。每个账号至少需要 10 金币，双方准备后开始对局。

两个窗口的账号、设备标识、缓存和存档独立保存到默认用户资料目录旁的 `mpt-battle-test/A` 与 `mpt-battle-test/B`（macOS 通常在 `~/Library/Application Support/` 下）。下次启动会保留各自登录状态。此隔离只针对客户端资料，本地后端所连的数据库由后端配置决定。

关闭其中一个窗口可测试掉线；关闭两个窗口或在终端按 Ctrl+C 会结束双开。此入口仅用于开发，不改变正式安装版的单实例行为。更新主进程或预加载代码会重启两个测试端，前端改动继续使用热更新。

## AI 对话

入口：右键宠物 → **与我对话**，或主窗口侧边栏。

1. 在对话页填写 [DeepSeek API Key](https://platform.deepseek.com/api_keys)（仅存本机）
2. 固定模型：`deepseek-v4-flash`
3. 对话会带上当前状态与近期记忆；不会直接报数值，而是用宠物口吻表达感受

已接入的工具调用：

| Skill | 场景 |
|-------|------|
| 查看电脑信息 | 问配置、内存、磁盘等 → 打开「电脑信息」页并口头总结 |
| 视频去水印 | 提到去水印或粘贴抖音/快手链接 → 打开工具页并预填 |

可清空聊天记录（会话摘要写入记忆）或清空长期记忆。

## 本地工具箱

右键宠物菜单或主窗口均可进入：

| 工具 | 能力 |
|------|------|
| 图片压缩 | JPG / PNG / WebP / AVIF，本地压缩 |
| 视频去水印 | 抖音、快手分享链接解析并下载 |
| 文件压缩 | 打压缩包 |
| 文件解压 | 解压常见归档格式 |
| PDF 工具箱 | 合并、拆分、转图、压缩、图片转 PDF、加水印 |
| 电脑信息 | 系统 / CPU / 内存 / GPU / 磁盘等 |
| 磁盘瘦身 | 扫描并清理本机可释放空间 |

## 开发

```bash
npm install
npm run dev
```

打包见 [RELEASE.md](./RELEASE.md)。玩法与 AI 设计细节见 [docs/pet-gameplay.md](./docs/pet-gameplay.md)、[docs/pet-ai-system.md](./docs/pet-ai-system.md)。

## License
- Source Code: PolyForm Noncommercial License 1.0.0
- Image / Art / Game Assets: Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)

### Important
This project is **NOT PERMITTED FOR ANY COMMERCIAL USE**.
You are free to use, copy and modify this project for personal learning and non-commercial purposes only.

Commercial use of any part of this repository requires a separate commercial license from the author.
If you need commercial authorization, please contact the author.
