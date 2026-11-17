# Android（Capacitor）

APK 由 `.github/workflows/android.yml` 在 GitHub Actions 里构建（手动触发或推送 web/、android/ 时），产物在该次运行的 Artifacts 里，不发 Release。

- 前端以 `DSX_APP=1`、`DSX_SERVER=<服务器地址>` 构建，服务器地址写死在 APK 里。
- 原生工程（`android/android`）每次在 CI 里用 `npx cap add android` 生成，不入库。
- 签名：`release.p12`（私有仓库内的固定实验签名，保证后续版本可覆盖安装）。
- 图标/启动图：`assets/`，由 `@capacitor/assets` 生成各尺寸。
