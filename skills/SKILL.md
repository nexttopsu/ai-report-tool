---
name: ai-report-tool
slug: ai-report-tool
displayName: AI Report Tool
name_en: AI Report Tool
name_zh: AI 报告工具
version: 0.3.2
description: Manage daily, weekly, monthly, and yearly work reports via the ai-report CLI or the ai-report-mcp MCP server. Use when the user asks to write, save, view, update, delete, or search work reports (日报/周报/月报/年报), or to generate summaries from historical reports.
description_en: Manage daily, weekly, monthly, and yearly work reports via the ai-report CLI or the ai-report-mcp MCP server. Use when the user asks to write, save, view, update, delete, or search work reports (日报/周报/月报/年报), or to generate summaries from historical reports.
description_zh: 通过 ai-report 命令行或 ai-report-mcp MCP 服务管理日报、周报、月报、年报。当用户要求写/保存/查看/修改/删除/查询工作报告，或根据历史记录生成总结时使用。
argument-hint: Describe the report task, e.g. write today's daily report or query last week's work
argument-hint-en: Describe the report task, e.g. write today's daily report or query last week's work
argument-hint-zh: 描述报告任务，例如写今天的日报或查询上周的工作
author: nexttopsu
license: ISC
user-invocable: true
---

# AI Report Tool

用于管理日报、周报、月报、年报。

**前置条件**：已安装 ai-report-tool（`npm install -g ai-report-tool`，需要 Node ≥ 18），并将 `ai-report-mcp` 注册为 MCP Server；未注册 MCP 时可退回全局 CLI `ai-report`（命令与 MCP 工具一一对应，对照表见 [CLI Mode](#cli-mode)）。

## When to Use

当用户要求以下操作时使用本 Skill：

* 写/保存日报、周报、月报、年报
* 查看当前或历史报告
* 修改报告
* 删除报告
* 查询/搜索报告
* 根据历史工作记录生成总结

---

## Core Rules

1. **Agent 负责生成内容，MCP 负责保存和读取。**
2. 不要直接修改 `~/.ai-report-tool/` 中的文件。
3. 创建前优先检查目标周期是否已有报告。
4. 已存在时不要直接 `create_report`，需要更新则使用 `update_report`。
5. 删除报告必须是用户明确要求，且删除后不可恢复（见 [Delete](#delete)）。
6. 不要虚构用户没有完成的工作。
7. MCP 返回的 JSON 是内部数据，正常情况下转换成自然语言回复。

---

## Available MCP Tools

### 查看

```text
get_today_report
get_week_report
get_month_report
get_year_report
```

### 本周日报汇总

```text
get_week_dailies
```

（返回本周一至周日的全部日报，带 range 区间；CLI 对应 `ai-report week-dailies`）

### 操作

```text
create_report
update_report
delete_report
query_reports
```

`type`：

```text
daily
weekly
monthly
yearly
```

`create_report / update_report / delete_report` 均接受 `date` 参数（`YYYY-MM-DD`）。报告归属周期由该日期决定，例如周报会归到该日期所在的 ISO 周——因此写本周周报时传今天日期即可，无需自己计算周号。

---

## CLI Mode

未注册 MCP Server 时，可独立使用全局 CLI `ai-report`，能力与 MCP 一一对应：

| MCP Tool | CLI 命令 |
| --- | --- |
| `get_today_report` | `ai-report today` |
| `get_week_report` | `ai-report week` |
| `get_week_dailies` | `ai-report week-dailies` |
| `get_month_report` | `ai-report month` |
| `get_year_report` | `ai-report year` |
| `create_report` | `ai-report create <type> <内容>` |
| `update_report` | `ai-report update <type> <date> <内容>` |
| `delete_report` | `ai-report delete <type> <date>` |
| `query_reports` | `ai-report query <type> [选项]` |

`query` 选项：`--from <YYYY-MM-DD>`（起始，含）、`--to <YYYY-MM-DD>`（结束，含）、`--keyword <关键字>`（正文过滤）。

示例：

```text
ai-report create daily "今天完成了 MCP 集成"
ai-report update daily 2026-09-21 "修改后的报告内容"
ai-report query daily --from 2026-09-01 --to 2026-09-30 --keyword "告警"
```

注意：CLI 的 `create` 只能保存**当天**的报告；需要补写指定日期时使用 MCP `create_report` 并传 `date`。

---

## Daily Report

用户要求：

> 帮我写今天的日报

流程：

```text
get_today_report
      ↓
判断是否存在
      ↓
不存在 → 根据当前上下文生成 → create_report
存在   → 用户要求修改 → update_report
存在   → 未要求修改 → 告知已有报告
```

日报内容应基于用户实际完成的工作进行整理，不要虚构。

### 端到端示例

用户输入：

> 帮我写今天的日报。今天上午修完了登录超时的 bug，下午把 MCP server 的错误码统一成了结构化格式，晚上 review 了小王的 PR。

Agent 执行 `get_today_report` → 今天还没有日报 → 整理生成草稿 → 向用户确认 → `create_report(type=daily, date=2026-09-23, content=...)`。

保存的报告正文：

```text
1. 修复登录超时 bug
2. MCP server 错误码统一为结构化格式（success/error.code/message）
3. Review 小王的 PR
```

最终回复：

```text
今天的日报已经保存，内容如下：

1. 修复登录超时 bug
2. MCP server 错误码统一为结构化格式（success/error.code/message）
3. Review 小王的 PR
```

---

## Weekly Report（基于本周日报汇总）

用户要求：

> 帮我写本周的周报
> 根据这周的日报汇总一份周报

流程：

```text
get_week_report
      ↓
判断本周周报是否已存在（存在则参考 Update 一节）
      ↓
get_week_dailies            ← 一次调用拿全本周日报（无需手动计算日期区间）
      ↓
count = 0 → 告知本周还没有日报，请用户补充素材（不要虚构）
count > 0 → 按天阅读各日报正文，归纳整理
      ↓
生成周报草稿，建议先向用户展示确认
      ↓
确认后 create_report(type=weekly, date=今天, content=周报)
```

CLI 场景等价命令：`ai-report week-dailies`（获取素材）+ `ai-report create weekly "…"`（保存）。

汇总要点：

* 合并同类工作，按主题/项目分组，不要按天罗列流水账
* 突出本周完成的工作、项目进展、问题及解决
* 结尾附上下周计划（仅在日报或上下文中有依据时）
* 日报中的临时性、琐碎内容可以省略，保留有信息量的部分
* 严格基于日报真实内容，不要虚构未记录的工作

---

## Monthly Report

用户要求写月报：

```text
get_month_report
      ↓
query_reports(type=weekly, 本月)
      ↓
必要时查询 daily
      ↓
AI 总结
      ↓
create_report / update_report
```

优先使用周报作为月报素材，信息不足时再查询日报。

---

## Yearly Report

用户要求写年报：

```text
get_year_report
      ↓
query_reports(type=monthly, 本年)
      ↓
必要时查询 weekly / daily
      ↓
AI 总结
      ↓
create_report / update_report
```

优先使用月报作为年度总结素材。

---

## Query

用户要求：

> 查一下最近关于 MCP 的工作

使用：

```text
query_reports(
  type=daily,
  keyword="MCP"
)
```

用户指定日期范围时使用：

```text
query_reports(
  type=daily,
  from="YYYY-MM-DD",
  to="YYYY-MM-DD"
)
```

尽量缩小查询范围，不要无必要地读取全部历史报告。

---

## Update

用户明确要求：

* 修改日报
* 更新日报
* 重新整理日报
* 把日报改成……

使用：

```text
update_report
```

注意：`content` 是**完整的新正文**，不是增量补丁。

不要通过 `delete_report + create_report` 实现修改。

---

## Delete

只有用户明确要求删除时使用：

```text
delete_report
```

**删除是物理删除**：磁盘上的报告文件会被直接移除，没有回收站，无法通过本工具恢复。目标周期没有报告时不会报错，返回 `deleted: false`。执行前务必与用户二次确认目标周期。

---

## Report Generation

生成报告时：

* 只使用用户提供或上下文中真实存在的信息
* 合理归纳，但不要编造
* 内容简洁、专业
* 避免重复
* 保留重要的开发、测试、修复、学习和项目进展

---

## Response Style

操作成功后简洁回复。

例如：

```text
今天的日报已经保存。
```

```text
本周周报已经更新。
```

查询结果较多时，先告诉用户找到多少条，再展示相关内容。

不要默认向用户展示 MCP Tool 调用过程或原始 JSON。

---

## Data & Output Format

### MCP 返回的 JSON

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

失败时返回 `success: false` 和结构化错误：

```json
{
  "success": false,
  "error": {
    "code": "REPORT_EXISTS",
    "message": "2026-09-23 的日报已存在"
  }
}
```

### 周期标识格式

| 类型 | period 格式 | 示例 |
| --- | --- | --- |
| daily | `YYYY-MM-DD` | `2026-09-23` |
| weekly | `YYYY-Www`（ISO 8601 周，周一起始） | `2026-W39` |
| monthly | `YYYY-MM` | `2026-09` |
| yearly | `YYYY` | `2026` |

### 磁盘存储

报告以人类可读的纯文本保存在本机 `~/.ai-report-tool/` 目录，按类型分目录：

```text
~/.ai-report-tool/
├── daily/2026/09/23.txt
├── weekly/2026/W39.txt
├── monthly/2026/09.txt
└── yearly/2026.txt
```

可通过环境变量 `AI_REPORT_STORAGE_DIR` 重定向存储目录（多实例/测试隔离场景）。文件是纯文本，可直接复制备份。

---

## Troubleshooting

| 现象 | 处理方式 |
| --- | --- |
| MCP 工具不可用 / Server 连接失败 | 降级使用全局 CLI `ai-report`，命令与 MCP 工具一一对应（见 [CLI Mode](#cli-mode)） |
| `ai-report: command not found` | 执行 `npm install -g ai-report-tool`（需要 Node ≥ 18） |
| npm 安装超时 / 网络失败 | 使用国内镜像：`npm install -g ai-report-tool --registry=https://registry.npmmirror.com`，或检查代理设置后重试 |
| 报错 `REPORT_EXISTS` | 目标周期已有报告，改用 `update_report` |
| 报错 `REPORT_NOT_FOUND` | 目标周期还没有报告，改用 `create_report` |
| 报错 `VALIDATION_ERROR` | 按报错信息检查参数：type 必须是四种类型之一，date 必须是真实存在的 `YYYY-MM-DD` 日期 |
| 存储目录异常 / 权限错误 | 检查 `~/.ai-report-tool/` 是否可写；或设置 `AI_REPORT_STORAGE_DIR` 指向可写目录 |

**通用原则**：任何调用失败时，向用户如实说明失败原因和下一步建议，不要静默重试超过一次，更不要虚构操作成功。

---

## Limitations / 边界条件

* **仅本地单人使用**：数据保存在本机 `~/.ai-report-tool/`，不支持云端同步、多端共享或团队协作，无账号体系。
* **删除不可恢复**：`delete_report` 是物理删除，无回收站。
* **CLI create 仅限当天**：CLI 的 `create` 只保存当天报告；补写指定日期需用 MCP `create_report` 传 `date`。
* **周报周期为 ISO 8601 周**：周一至周日；跨年周的归属按周四所在年份判定（如 2027-01-01 属于 2026-W53）。
* **查询无分页**：`query_reports` 返回全部命中结果，超大范围查询应用 `from/to/keyword` 缩小范围。
* **不生成内容**：本工具只负责存储和检索，报告内容由 Agent 基于真实上下文生成。

---

## FAQ

**Q：周报的周期怎么算？**
A：ISO 8601 周，周一为起点、周日为终点，period 格式 `YYYY-Www`。跨年时按该周周四所在的年份定周年份。

**Q：忘了写昨天的日报，能补吗？**
A：可以。用 MCP `create_report` 并传 `date=昨天的日期` 即可；注意 CLI 的 `create` 只能保存当天。

**Q：数据存在哪里？会不会丢？**
A：全部在本机 `~/.ai-report-tool/` 下的纯文本 `.txt` 文件中，格式人类可读。工具本身没有云备份机制，可自行复制该目录备份。

**Q：不注册 MCP Server，只用命令行可以吗？**
A：可以。`ai-report` CLI 提供全部能力，与 MCP 工具一一对应（见 [CLI Mode](#cli-mode)）。

**Q：报告能用英文或其他语言写吗？**
A：可以。`content` 是纯文本，语言不限；`type` 和 `period` 必须是固定格式。

**Q：误删的报告能恢复吗？**
A：不能。删除是物理删除且无回收站，所以删除前必须与用户明确确认。

---

## Decision Flow

```text
用户请求
   │
   ├── 查看 → get_*_report
   │
   ├── 查询 → query_reports
   │
   ├── 本周日报 → get_week_dailies
   │
   ├── 创建
   │    └── 先检查 → create_report
   │
   ├── 修改 → update_report
   │
   ├── 删除 → delete_report（不可恢复，先确认）
   │
   └── 总结
        ├── 周报 ← get_week_dailies（本周日报汇总）
        ├── 月报 ← 周报/日报
        └── 年报 ← 月报/周报
```

**原则：Agent 负责理解、整理和生成；MCP 负责调用；Core 负责数据管理。**
