# Troubleshooting（故障处理）

| 现象 | 处理方式 |
| --- | --- |
| MCP 工具不可用 / Server 连接失败 | 降级使用全局 CLI `ai-report`，命令与 MCP 工具一一对应（见 references/cli.md） |
| `ai-report: command not found` | 执行 `npm install -g ai-report-tool`（需要 Node ≥ 18） |
| 本机版本落后于 npm 最新版 | 首次使用本 Skill 时检查（`ai-report version` 对比 `npm view ai-report-tool version`，见 SKILL.md 版本检查），落后则提醒 `npm install -g ai-report-tool@latest` 并重启 MCP Client |
| npm 安装超时 / 网络失败 | 使用国内镜像：`npm install -g ai-report-tool --registry=https://registry.npmmirror.com`，或检查代理设置后重试 |
| 报错 `REPORT_EXISTS` | 目标周期已有报告（错误里附带 `existingReport.updatedAt`，可直接告知用户上次保存时间），改用 `update_report` |
| 报错 `REPORT_NOT_FOUND` | 目标周期还没有报告。若是更新请求，询问用户是否新建（见 SKILL.md Update 一节）而非直接报错；用户确认后改用 `create_report` |
| 报错 `VALIDATION_ERROR` | 按报错信息检查参数：type 必须是四种类型之一，date 必须是真实存在的 `YYYY-MM-DD` 日期 |
| 存储目录异常 / 权限错误 | 检查 `~/.ai-report-tool/` 是否可写；或设置 `AI_REPORT_STORAGE_DIR` 指向可写目录 |

**通用原则**：任何调用失败时，向用户如实说明失败原因和下一步建议，不要静默重试超过一次，更不要虚构操作成功。

## 错误返回格式

所有 MCP Tool 失败时返回 `success: false` + 结构化错误（isError=true），Agent 读取 `error.code` 决定下一步：

```json
{
  "success": false,
  "error": {
    "code": "REPORT_EXISTS",
    "message": "daily 报告已存在: 2026-09-23",
    "existingReport": { "period": "2026-09-23", "updatedAt": "2026-09-23T07:30:00.000Z" }
  }
}
```

错误码：`REPORT_NOT_FOUND`、`REPORT_EXISTS`（附 `existingReport`）、`VALIDATION_ERROR`、`INTERNAL_ERROR`。
