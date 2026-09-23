# CLI Mode（命令行模式）

未注册 MCP Server 时，可独立使用全局 CLI `ai-report`，能力与 MCP 一一对应。

## MCP ↔ CLI 对照表

| MCP Tool | CLI 命令 |
| --- | --- |
| `get_today_report` | `ai-report today [--raw]` |
| `get_week_report` | `ai-report week [--raw]` |
| `get_week_dailies` | `ai-report week-dailies` |
| `get_month_report` | `ai-report month [--raw]` |
| `get_year_report` | `ai-report year [--raw]` |
| `create_report` | `ai-report create <type> <内容> [--date <YYYY-MM-DD>]` |
| `update_report` | `ai-report update <type> <date> <内容>` |
| `delete_report` | `ai-report delete <type> <date>` |
| `query_reports` | `ai-report query <type> [选项]` |
| （无对应 MCP 工具） | `ai-report export` / `ai-report restore`（备份与恢复，见下） |

## 各命令选项

* `today/week/month/year`：`--raw` 只输出报告正文（不带类型/时间戳头部），适合管道场景（如 `ai-report today --raw | pbcopy` 复制正文）
* `create`：`--date <YYYY-MM-DD>` 指定归属日期（缺省为今天），报告周期由该日期决定，支持补写历史报告；与 MCP `create_report` 的 `date` 参数对齐。同一周期已存在报告时仍会报错，应改用 update
* `query`：`--from <YYYY-MM-DD>`（起始，含）、`--to <YYYY-MM-DD>`（结束，含）、`--keyword <关键字>`（正文过滤）、`--limit <N>`（最多返回最近 N 条）

## 示例

```text
ai-report create daily "今天完成了 MCP 集成"
ai-report create daily "补写昨天的日报" --date 2026-09-22
ai-report update daily 2026-09-21 "修改后的报告内容"
ai-report query daily --from 2026-09-01 --to 2026-09-30 --keyword "告警"
ai-report query daily --limit 10
```

## 备份与恢复（仅 CLI，MCP 未暴露）

* `ai-report export [文件] [--type/--from/--to/--keyword]`：导出为单个 JSON 文件，缺省落 `~/.ai-report-tool/exports/`；`--type` 可重复传多个类型
* `ai-report restore <文件> [--overwrite]`：从导出文件恢复，默认跳过已存在（提示跳过数量），`--overwrite` 强制覆盖

用户要备份/迁移数据时，指引其使用这两条命令。

```text
ai-report export backup.json        # 全量备份
ai-report export work.json --type daily --from 2026-09-01   # 只导出 9 月的日报
ai-report restore backup.json       # 恢复（已存在的跳过）
```
