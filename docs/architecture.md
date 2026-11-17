# DeepSeek 复刻实验版 — 架构方案 v1 (2026-11-18)

## 组件
- web/: fork deepseek-ai/chat-demo (MIT, TS + rspack)。保留 IndexedDB 作本地缓存（离线优先），新增 sync 层替换纯本地存储；登录/注册/服务器地址页；鲸鱼图标右上角英文角标 "Beta"；页脚/关于页标注"非官方实验版"，保留 LICENSE。
- server/: Go 单二进制 + SQLite (modernc.org/sqlite, 无 cgo)。同时托管 web 静态文件和 /api。预计常驻内存 20–40MB。
- android/: Capacitor 包装同一份 web 构建，首次启动可填服务器地址；APK 由 GitHub Actions 构建（产物 artifact，不发 Release）。
- deploy/: docker-compose.yml（app + 可选 Caddy 自动 HTTPS），数据卷 ./data（sqlite + 附件）。

## 账号
- 用户名 + 密码（argon2id 存哈希），邀请码注册。
- 管理：容器内 CLI `dsx invite create --uses 1 --expires 7d` / `list` / `revoke`，外加 /admin 极简页（仅 admin 角色）。
- 会话：短期 access token + 长期 refresh token（可在设置里查看/注销设备）。

## 同步模型
- 会话、消息节点（id/parent_id 树，天然只追加，分支不冲突）、设置（按 key 的 LWW）、删除（墓碑）。
- 每用户单调递增 revision；客户端 push 批量变更，pull `?since=rev`；可选 SSE 通知其他设备即时拉取。
- 附件：v1 同步图片原件（每用户配额，默认 200MB 可调），非图片仅同步元数据（与官方 demo 导出范围一致）。DeepSeek Files API 的 file_id 跟 key 绑定，不跨设备复用，按需重新上传。

## API Key 加密 —— 选端到端
- 理由：聊天请求客户端直连 api.deepseek.com，服务器永远不需要明文 key；服务端加密意味着服务器同时持有解密钥匙，DB 泄露/备份泄露时等于没加密。
- 方案：客户端用登录密码 + 独立 salt 经 Argon2id(WASM) 派生加密密钥（与登录用的认证哈希分开派生，参考 Bitwarden 拆分），AES-256-GCM 加密 key，服务器只存密文。
- 代价：忘记密码 = 重新填 key（只是个 API key，可接受）；改密码时客户端重新加密。
- 诚实边界：防 DB/备份泄露和运维窥视；防不住"服务器被篡改后下发恶意前端"——这对任何 Web 端 E2E 都成立。

## 导入
- 官方网页现行导出 deepseek_data-*.zip：manifest.json + chat_sessions/{id}.json + chat_session_index.json (+ user.json)。chat-demo 自带 export_format_version 3 解析器（format.ts/schema.ts/toLocal.ts）就是这个结构 → 直接复用，改为"合并导入"而非"覆盖全部"。
- 旧版导出：conversations.json（数组，每会话 mapping 树，消息 fragments: REQUEST/RESPONSE/THINK/SEARCH）+ user.json → 写适配器转成 v3 结构。
- 安卓 App 是否有独立导出格式：未知，等用户样本。所有格式先过 schema 校验，不认识就报错，不猜。

## 待用户决定
- 仓库名、公开/私有。
- safety_check：保留 high（还原 App）/ 去掉（=low，API 最宽松）/ 设置里开关。
- 部署时：域名（HTTPS 必需，WebCrypto/Capacitor 需要安全上下文）。

## 里程碑
- M0 建仓库 + monorepo 骨架 + CI
- M1 服务端：注册/登录/邀请码/CLI/同步 API/SQLite 迁移
- M2 前端：fork chat-demo，接入登录与同步层，服务器地址配置，角标
- M3 Key 端到端加密 + 设置同步 + 多设备联调
- M4 导入器：v3 zip 合并导入 + 旧版 conversations.json 适配 + 用样本验证
- M5 UI 1:1 打磨（对照官方网页端/安卓截图）
- M6 Docker compose + 部署文档（上 VPS 需用户授权）
- M7 Capacitor 安卓 APK（Actions 构建）
