# Changelog

## 1.2.1 - 2026-09-18

### 修复

- 修复 macOS 端最近项目路径中的 `$USER_HOME$` 被展开成 `~` 的问题：启动项目不经过 shell，`~` 不会被展开，IDE 会把路径当作普通文件处理；现统一展开为 home 绝对路径，Windows 端不再需要单独补 `~` 替换
- 修复 macOS 端启动项目的方式：改为用 `open -a <应用目录>` 打开 `.app`（交给 LaunchServices），不再直接执行 `Contents/MacOS/` 下的可执行文件；应用已在运行时复用已有实例，并正确激活到前台

## 1.2.0 - 2026-09-18

### 修复

- 修复 Windows 端扫描结果被无效 `filter` 处理、`InstallLocation` / `DisplayIcon` 字段未显式映射导致 IDE 通道构建失败的问题
- 修复 Windows 端 `DisplayIcon` 带图标索引后缀（如 `idea64.exe,0`）导致启动命令不可用的问题
- 修复 `recentProjects.xml` 解析硬编码节点下标（`component.option[0].map[0]`）导致结构变化时整 IDE 项目列表丢失的问题，改为按结构遍历并兼容单/多节点；缺失 `RecentProjectMetaInfo` 的项目条目不再导致整列表解析失败
- Windows 端应用数据统一补齐默认字段（与 macOS 契约一致）

### 优化

- macOS 扫描前置按 bundle 目录名过滤目标 IDE，只对目标应用读取 `Info.plist` / `mdls`，不再全量扫描所有已安装应用，本机实测由约 390ms 降至约 70ms
- 启动项目改用 `execFile` 参数数组（不经过 shell），路径含空格/特殊字符无需引号转义

### 清理

- 移除未使用的 `getAppsSubDirectory`（旧 `ls` 实现残留）与 `getMacInstalledApps` / `getWinInstalledApps` 导出、空的 `index.html`
- `package.json` 补充 `"type": "commonjs"`（ZTools 文档要求）、移除无效 `main` 字段与重复的 `iconv-lite` 开发依赖
- `plugin.json` / `package.json` 描述由占位文案改为实际功能说明

## 1.1.0 - 2026-09-17

### 新增

- macOS 应用扫描改为直接读取 bundle 的 `Contents/Info.plist`（`plutil`），不再依赖 Spotlight 索引，未被索引的目录也能正确枚举
- 应用信息新增 `appSource`、`appLastUsedDate`、`appLastUsedTimestamp`、`appUseCount` 字段
- 项目列表副标题展示所属 IDE 与 IDE 最近使用时间：`路径 · IDE名 · 最近使用 MM-DD HH:mm`
- IDE 扫描结果使用 `ztools.dbStorage` 缓存（TTL 5 分钟，命中且较旧时后台刷新），重复进入插件秒开
- `plugin.json` 声明支持平台 `darwin` / `win32`

### 修复

- 修复 Spotlight 索引缺失时应用被静默丢弃的问题（`/Applications` 少 5 个、用户目录 `~/Applications` 全部丢失）
- 修复 `appInstallDate` 取到索引重建时间的问题，改用文件系统创建时间
- 修复项目路径包含空格时无法启动的问题（应用路径与项目路径统一加引号）
- 单个 IDE 的 `product-info.json` / `recentProjects.xml` 解析异常不再中断整个初始化；启动失败时用系统通知提示

### 优化

- 目录枚举改用 `fs.readdir`（不再走 shell `ls`），mdls 与 Info.plist 读取并行，全量扫描由约 548ms 降至约 390ms
- 清理初始化流程中的调试日志，统一各平台字段，避免上层处理 `undefined`

## 1.0.3 - 2026-03-28

- 更新插件版本并优化初始化服务

## 1.0.1 - 2026-03-28

- 更新插件版本并修复项目启动路径问题
- 添加开发模式下调试工具支持
- 使用 fast-xml-parser 替换 DOMParser 解析 XML

## 1.0.0 - 2026-03-28

- 初次发布，将插件提交至 ZTools 插件仓库。
- 实现JetBrains IDE全家桶项目快速打开功能
