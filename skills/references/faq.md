# 数据格式与 FAQ

## MCP 返回的 JSON

成功时返回 `success: true` 和报告数据：

```json
{
  "success": true,
  "action": "fetched",
  "report": {
    "type": "daily",
    "period": "2026-09-23",
    "content": "1. 修复登录超时 bug\n2. MCP server 错误码统一为结构化格式",
    "createdAt": "2026-09-23T08:30:00.000Z",
    "updatedAt": "2026-09-23T09:12:00.000Z"
  }
}
```

字段说明：

* `type`：报告类型（daily / weekly / monthly / yearly）
* `period`：周期标识，见下方「周期标识格式」
* `content`：报告正文（纯文本，多行用 `\n` 分隔）
* `createdAt` / `updatedAt`：ISO 8601 时间戳

`query_reports` 返回体额外字段：`total`（过滤后总条数）、`truncated`（是否还有更早历史）；默认最多返回最近 50 条，`truncated: true` 时应缩小 from/to 范围或加 keyword 再查。`get_week_dailies` 额外返回 `missingDates`（本周已过但未写日报的日期）。`delete_report` 返回 `deletedReport`（被删报告的 period 与正文）。

失败时的错误格式见 references/troubleshooting.md。

## 周期标识格式

| 类型 | period 格式 | 示例 |
| --- | --- | --- |
| daily | `YYYY-MM-DD` | `2026-09-23` |
| weekly | `YYYY-Www`（ISO 8601 周，周一起始） | `2026-W39` |
| monthly | `YYYY-MM` | `2026-09` |
| yearly | `YYYY` | `2026` |

## 磁盘存储

报告以人类可读的纯文本保存在本机 `~/.ai-report-tool/` 目录，按类型分目录：

```text
~/.ai-report-tool/
├── daily/2026/09/23.txt
├── weekly/2026/W39.txt
├── monthly/2026/09.txt
└── yearly/2026.txt
```

可通过环境变量 `AI_REPORT_STORAGE_DIR` 重定向存储目录（多实例/测试隔离场景）。文件是纯文本，可直接复制备份（正式备份命令见 references/cli.md 的「备份与恢复」）。

## FAQ

**Q：周报的周期怎么算？**
A：ISO 8601 周，周一为起点、周日为终点，period 格式 `YYYY-Www`。跨年时按该周周四所在的年份定周年份。

**Q：忘了写昨天的日报，能补吗？**
A：可以。MCP 用 `create_report` 传 `date=昨天的日期`；CLI 用 `ai-report create daily "内容" --date YYYY-MM-DD`。目标周期已有报告时会报错，此时应改用 update。

**Q：数据存在哪里？会不会丢？**
A：全部在本机 `~/.ai-report-tool/` 下的纯文本 `.txt` 文件中，格式人类可读。备份用 `ai-report export backup.json`（单个 JSON 文件，可定期备份或迁移到新电脑），恢复用 `ai-report restore backup.json`；也可直接复制整个目录。

**Q：不注册 MCP Server，只用命令行可以吗？**
A：可以。`ai-report` CLI 提供全部能力，与 MCP 工具一一对应（见 references/cli.md）。

**Q：报告能用英文或其他语言写吗？**
A：可以。`content` 是纯文本，语言不限；`type` 和 `period` 必须是固定格式。

**Q：误删的报告能恢复吗？**
A：不能。删除是物理删除且无回收站，所以删除前必须与用户明确确认。若定期用 `ai-report export` 备份过，可从备份文件恢复。

**Q：要写上周/上月的周报/月报，日期怎么传？**
A：传该周期内任意一天即可，工具自动折算到对应周期（如上周周报传上周一日期，月报传当月任意一天），无需自己计算周号。
