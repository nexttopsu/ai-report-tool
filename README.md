# ai-report-tool

AI 报告工具核心库（TypeScript / Node.js ≥ 18，零运行时依赖）：管理日报、周报、月报、年报的完整生命周期——创建、查询、获取、修改、删除、导出、恢复。

## 安装与构建

```bash
npm install ai-report-tool        # 仅 dev 依赖（typescript / @types/node）
npm test           # 运行 24 个单元测试
npm run build      # 产出 dist/
```

## 快速上手

```ts
import { ReportManager } from 'ai-report-tool'

// 默认存储在 ~/.ai-report-tool/；也可自定义目录：
const manager = new ReportManager({ storageDir: '/data/my-reports' })

// ---------- 创建 ----------
await manager.create('daily', '2026-09-21', '今天完成了报告工具核心库的开发')
await manager.create('weekly', '2026-09-21', '本周：API 设计与实现完成')
await manager.create('monthly', '2026-09-08', '本月：报告工具立项')
await manager.create('yearly', '2026-01-05', '年度目标：打磨效率工具链')

// ---------- 获取（今天 / 本周 / 本月 / 本年） ----------
const today = await manager.getToday()        // 或 get('daily')，缺省即当前周期
const week  = await manager.getThisWeek()
const month = await manager.getThisMonth()
const year  = await manager.getThisYear()
// 也可指定任意日期：await manager.get('daily', '2026-09-21')

// ---------- 修改 / 删除 ----------
await manager.update('daily', '2026-09-21', '修改后的正文')
await manager.delete('daily', '2026-09-21')   // 返回 boolean，不存在不报错

// ---------- 查询 ----------
await manager.query('daily', { from: '2026-09-01', to: '2026-09-30' })
await manager.query('daily', { keyword: '告警' })
await manager.query('weekly')                 // 全部周报，按周期升序

// ---------- 导出 / 恢复 ----------
const { filePath, count } = await manager.export()   // 单个 JSON 文件（默认全部类型）
const { restored, skipped } = await manager.restore(filePath)          // 已存在则跳过
const result2 = await manager.restore(filePath, { overwrite: true })   // 强制覆盖
```

## CLI 命令行工具

安装包自带 `ai-report` 命令（全局或本地安装后可用，Node.js ≥ 18）：

```bash
npm install -g ai-report-tool
ai-report --help
```

CLI 与库使用同一份存储（默认 `~/.ai-report-tool/`），是 Core API 的直接适配层。可通过环境变量 `AI_REPORT_STORAGE_DIR` 覆盖存储目录（对 CLI 和 MCP Server 均生效）。

### 查看当前报告

```bash
ai-report today         # 今天的日报（getToday()）
ai-report week          # 本周的周报（getThisWeek()）
ai-report week-dailies  # 本周的所有日报（周一至周日，等价于 query daily --from 本周一 --to 本周日）
ai-report month         # 本月的月报（getThisMonth()）
ai-report year          # 今年的年报（getThisYear()）
```

四个查看命令均支持 `--raw`，只输出报告正文（不带类型/时间戳头部），适合管道场景：

```bash
ai-report today --raw | pbcopy   # macOS 复制正文到剪贴板
```

输出示例：

```
$ ai-report today

日报
日期：2026-09-21
--------------------
今天完成了 MCP 集成
--------------------
创建时间：2026-09-21 13:44:48
更新时间：2026-09-21 13:44:48
```

还没有报告时不会报错，只提示：`今天还没有日报。`

### 创建 / 更新 / 删除

```bash
ai-report create daily "今天完成了 MCP 集成"
ai-report create daily "补写昨天的日报" --date 2026-09-22   # 补写历史报告
ai-report create weekly "本周完成了 CLI 开发"
ai-report create monthly "本月完成了工具包开发"
ai-report create yearly "年度目标"

ai-report update daily 2026-09-21 "修改后的报告内容"
ai-report delete daily 2026-09-21
```

`create` 以 `--date` 指定日期归属周期（缺省为今天），支持补写历史报告，与 MCP `create_report` 的 `date` 参数对齐；同一周期重复 `create` 会报错（防误覆盖，请用 `update`），`delete` 不存在的报告只提示、不报错。

### 查询报告

```bash
ai-report query daily                                # 全部日报
ai-report query daily --from 2026-09-01 --to 2026-09-30
ai-report query daily --keyword "告警"               # 也支持 --keyword=告警
ai-report query daily --limit 10                     # 只看最近 10 条（也支持 --limit=10）
ai-report query weekly
```

无命中时提示：`没有找到符合条件的日报。`

### 备份与恢复

```bash
ai-report export backup.json        # 全量备份到指定文件
ai-report export                    # 导出到默认位置 ~/.ai-report-tool/exports/
ai-report export work.json --type daily --from 2026-09-01   # 只导出 9 月的日报
ai-report restore backup.json       # 恢复（已存在的报告跳过）
ai-report restore backup.json --overwrite   # 强制覆盖已存在的报告
```

导出为单个 JSON 文件（`{ version, exportedAt, reports[] }`），适合换电脑迁移或定期备份；恢复前会整体校验文件结构，非法文件不会写盘。

### 其他

```bash
ai-report --help     # 或 ai-report help
ai-report --version  # 或 ai-report version
```

参数错误与业务错误（重复创建、报告不存在、非法类型/日期）只输出简洁的 `错误：…` 提示并以退出码 1 结束，不会打印堆栈。

## MCP Server

包内自带 MCP Server（`@modelcontextprotocol/sdk`，stdio 传输），让 Claude Code 等 MCP Client 中的 AI Agent 可以直接读写报告。与 CLI、库共用同一份存储（默认 `~/.ai-report-tool/`）。

### 在 MCP Client 中接入

```bash
npm install -g ai-report-tool
```

然后在 MCP Client 配置中注册（以 Claude Code 的 `mcp.json` 为例）：

```json
{
  "mcpServers": {
    "ai-report": {
      "command": "ai-report-mcp"
    }
  }
}
```

或直接指向 node 产物（无需全局安装）：

```json
{
  "mcpServers": {
    "ai-report": {
      "command": "node",
      "args": ["/path/to/ai-report-tool/dist/mcp/server.js"]
    }
  }
}
```

### 提供的 9 个 Tools

| Tool | 参数 | 对应 Core API |
| --- | --- | --- |
| `get_today_report` | 无 | `getToday()` |
| `get_week_report` | 无 | `getThisWeek()` |
| `get_month_report` | 无 | `getThisMonth()` |
| `get_year_report` | 无 | `getThisYear()` |
| `get_week_dailies` | 无 | `query('daily', { from: 本周一, to: 本周日 })` |
| `create_report` | `type`、`date`、`content` | `create()` |
| `update_report` | `type`、`date`、`content` | `update()` |
| `delete_report` | `type`、`date` | `delete()`（返回被删报告内容） |
| `query_reports` | `type`，可选 `from`、`to`、`keyword`、`limit` | `query()`（默认最多返回 50 条，附 `total` 总数） |

`type` 为 `daily / weekly / monthly / yearly`，`date` 为 `YYYY-MM-DD`。

### 返回结构

所有 Tool 返回结构化 JSON，供 Agent 直接解析：

```json
// 成功
{ "success": true, "action": "created", "report": { "type": "daily", "period": "2026-09-21", "content": "...", "createdAt": "...", "updatedAt": "..." } }

// 失败（isError=true）
{ "success": false, "error": { "code": "REPORT_EXISTS", "message": "daily 报告已存在: 2026-09-21", "existingReport": { "period": "2026-09-21", "updatedAt": "..." } } }
```

错误码：`REPORT_NOT_FOUND`（不存在）、`REPORT_EXISTS`（周期已存在，附 `existingReport` 元信息，应改用 `update_report`）、`VALIDATION_ERROR`（非法参数）。查询当前周期报告不存在时同样返回 `REPORT_NOT_FOUND`，不会让 Server 崩溃。

补充说明：

- `query_reports` 返回 `total`（过滤后总条数）与 `reports`（本次列表，默认最近 50 条），`truncated: true` 表示还有更早历史。
- `get_week_dailies` 额外返回 `missingDates`（本周一至今还没写日报的日期），可用于提醒补写。
- `delete_report` 返回 `deletedReport`（被删报告的 period 与正文），删除不可恢复。

### 设计约定

- **内容生成在 Agent 侧**：用户说“帮我写日报”时，Agent 先自行生成正文，再调 `create_report` 保存；MCP Server 只负责存取。
- MCP Server 是 Core 的纯适配层，不含报告业务逻辑，与 CLI 层互不依赖。

### 本地开发与测试

```bash
npm run build      # 产出 dist/mcp/server.js（SDK 已打包，单文件可直接执行）
npm run test:mcp   # 用官方 SDK Client 走 stdio 冒烟测试 9 个 Tool（30 项检查）
```

## 存储结构（文件夹 + txt，方便人工查找）

```
~/.ai-report-tool/
├── daily/2026/09/21.txt      # 日报
├── weekly/2026/W39.txt       # 周报（ISO 8601 周，周一为起点，周号补零）
├── monthly/2026/09.txt       # 月报
├── yearly/2026.txt           # 年报
└── exports/                  # 导出文件默认落点
```

txt 文件为人类可读格式，可直接用任何编辑器打开：

```
type: daily
period: 2026-09-21
createdAt: 2026-09-21T03:53:48.444Z
updatedAt: 2026-09-21T03:53:48.444Z
---
今天完成了报告工具核心库的开发
```

- 周报采用 ISO 8601 周号（周一为一周开始；跨年日期归属含首个周四的年份，如 2027-01-01 属 2026-W53）。
- 导出文件为单个 JSON（`{ version, exportedAt, reports[] }`），交给 `restore()` 即可完整恢复，默认跳过已存在报告。

## API 一览

| 方法 | 说明 |
| --- | --- |
| `create(type, date, content)` | 创建报告；周期已存在抛 `ReportExistsError` |
| `get(type, date?)` | 获取报告；缺省日期取当前周期（今天/本周/本月/本年） |
| `getToday()` / `getThisWeek()` / `getThisMonth()` / `getThisYear()` | 当前周期便捷方法 |
| `update(type, date, content)` | 覆盖正文并刷新 `updatedAt`；不存在抛 `ReportNotFoundError` |
| `delete(type, date)` | 删除报告，返回是否真的删除 |
| `query(type, { from, to, keyword, limit })` | 按类型查询，支持区间/关键字/数量上限（limit 取最近 N 份，升序返回） |
| `export({ types, from, to, keyword, outputFile })` | 导出为单个 JSON 文件 |
| `restore(file, { overwrite })` | 从导出文件恢复，返回 `{ restored, skipped }` |

错误类型：`ValidationError`（非法参数/路径穿越/损坏的恢复文件）、`ReportExistsError`、`ReportNotFoundError`。

## 已知限制

1. 未加文件锁：多进程并发写同一份报告时可能出现相互覆盖（单进程/单人使用无影响）。
2. `query` 会跳过目录中无法解析的非报告 txt 文件（目录设计为可人工放置笔记），不会报错。
3. 周期粒度固定为 日/周/月/年 四种，不支持自定义周期。
