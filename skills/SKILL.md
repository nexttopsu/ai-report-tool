---
name: ai-report-tool
slug: ai-report-tool
displayName: AI Report Tool
name_en: AI Report Tool
name_zh: AI 报告工具
version: 0.3.5
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
| `get_today_report` | `ai-report today [--raw]` |
| `get_week_report` | `ai-report week [--raw]` |
| `get_week_dailies` | `ai-report week-dailies` |
| `get_month_report` | `ai-report month [--raw]` |
| `get_year_report` | `ai-report year [--raw]` |
| `create_report` | `ai-report create <type> <内容> [--date <YYYY-MM-DD>]` |
| `update_report` | `ai-report update <type> <date> <内容>` |
| `delete_report` | `ai-report delete <type> <date>` |
| `query_reports` | `ai-report query <type> [选项]` |
| （无对应 MCP 工具） | `ai-report export [文件] [选项]` / `ai-report restore <文件> [--overwrite]`（备份与恢复，见下） |

`query` 选项：`--from <YYYY-MM-DD>`（起始，含）、`--to <YYYY-MM-DD>`（结束，含）、`--keyword <关键字>`（正文过滤）、`--limit <N>`（最多返回最近 N 条）。

`--raw` 只输出报告正文（不带类型/时间戳头部），适合管道场景（如复制正文）。

**备份与恢复**（仅 CLI，MCP 未暴露）：`ai-report export [文件]`（可加 `--type/--from/--to/--keyword` 过滤）导出为单个 JSON；`ai-report restore <文件>` 恢复（默认跳过已存在，`--overwrite` 覆盖）。用户要备份/迁移数据时，指引其使用这两条命令。

`create` 的 `--date` 选项指定归属日期（缺省为今天），报告周期由该日期决定，支持补写历史报告；与 MCP `create_report` 的 `date` 参数对齐。同一周期已存在报告时仍会报错，应改用 update。

示例：

```text
ai-report create daily "今天完成了 MCP 集成"
ai-report create daily "补写昨天的日报" --date 2026-09-22
ai-report update daily 2026-09-21 "修改后的报告内容"
ai-report query daily --from 2026-09-01 --to 2026-09-30 --keyword "告警"
```

注意：CLI 的 `create` 缺省只保存**当天**的报告，补写历史报告须显式传 `--date`。

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
不存在 → 生成内容（见下方分支）→ create_report
存在   → 用户要求修改 → update_report
存在   → 未要求修改 → 告知已有报告
```

**生成内容的两种分支**：

```text
用户消息中的内容形态
      ↓
用户已给出完整正文，只要求保存/更新
（如"把我说的这些存成今天的日报"、"帮我更新日报：……"）
      ↓
→ 原样作为 content 保存，不改写、不重新归纳
→ 仅当明显缺格式（如长段无换行）时可做最小排版规整
      ↓
用户只描述了做了哪些工作
（如"帮我写日报，今天修了个 bug"）
      ↓
→ Agent 整理归纳生成草稿 → 向用户展示确认 → 确认后保存
```

判断依据是用户意图：明确给出成稿就用原文，只给素材才生成。拿不准时先展示准备保存的正文，向用户确认。

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

### 用户自带成稿的示例

用户输入（已给出完整正文，只要求更新）：

> 帮我更新今天的日报：1）完成登录模块联调 2）修复 3 个测试用例失败 3）明天开始做权限模块

Agent 执行 `get_today_report` → 今天已有日报 → 用户明确要求更新且正文已完整 → `update_report(type=daily, date=2026-09-23, content=...)`，正文**原样使用**用户给的清单，不重新归纳。

最终回复：

```text
今天的日报已经更新。
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

**写上周/历史周报**：`create_report` 的 `date` 传上周任意一天（如上周一）即可，工具会自动折算到对应 ISO 周，Agent 无需自己计算周号。同理月报传当月任意一天、年报传当年任意一天。

`missingDates` 提示：`get_week_dailies` 返回的 `missingDates` 是本周已过但还没写日报的日期，汇总周报前可据此提醒用户"周三的日报还没写，要补吗？"。

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

尽量缩小查询范围，不要无必要地读取全部历史报告。历史量大时可传 `limit`（默认最多返回最近 50 条）；返回 `truncated: true` 时说明还有更早的历史，应加 from/to 或 keyword 缩小范围后再查。

---

## Update

用户明确要求：

* 修改日报/周报/月报/年报
* 更新日报/周报/月报/年报
* 重新整理报告
* 把日报改成……
* 帮我把这些内容存成/更新到报告

流程：

```text
先查看目标周期是否已有报告（get_*_report / query_reports）
      ↓
已存在 → update_report
      ↓
不存在 → 不要直接报错终止
      ↓
向用户说明该周期还没有报告，并询问是否新建，例如：
  "2026-09-22 还没有日报，要为你新建一份吗？"
      ↓
用户确认 → create_report（正文按内容来源分支处理）
用户拒绝 → 不做任何写操作
```

注意：

* `content` 是**完整的新正文**，不是增量补丁。
* 用户消息中已带完整正文时，**原样作为 content** 传入，不要重新归纳改写（见 Daily Report 的内容分支）。
* 用户只给了修改方向（如"把第二条展开写详细点"），才由 Agent 读取现有报告、按要求调整后生成新正文。
* 若直接调用 `update_report` 收到 `REPORT_NOT_FOUND`，同样按上述方式询问用户，不要把错误原样抛给用户。

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

* 用户已给出完整正文时，原样保存，不要重新归纳改写
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

失败时返回 `success: false` 和结构化错误（`REPORT_EXISTS` 会附带已有报告元信息，便于告知用户何时保存过）：

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

`query_reports` 返回体额外字段：`total`（过滤后总条数）、`truncated`（是否还有更早历史）；默认最多返回最近 50 条，`truncated: true` 时应缩小 from/to 范围或加 keyword 再查。`get_week_dailies` 额外返回 `missingDates`（本周已过但未写日报的日期）。`delete_report` 返回 `deletedReport`（被删报告的 period 与正文）。

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
| 报错 `REPORT_EXISTS` | 目标周期已有报告（错误里附带 `existingReport.updatedAt`，可直接告知用户上次保存时间），改用 `update_report` |
| 报错 `REPORT_NOT_FOUND` | 目标周期还没有报告。若是更新请求，询问用户是否新建（见 Update 一节）而非直接报错；用户确认后改用 `create_report` |
| 报错 `VALIDATION_ERROR` | 按报错信息检查参数：type 必须是四种类型之一，date 必须是真实存在的 `YYYY-MM-DD` 日期 |
| 存储目录异常 / 权限错误 | 检查 `~/.ai-report-tool/` 是否可写；或设置 `AI_REPORT_STORAGE_DIR` 指向可写目录 |

**通用原则**：任何调用失败时，向用户如实说明失败原因和下一步建议，不要静默重试超过一次，更不要虚构操作成功。

---

## Limitations / 边界条件

* **仅本地单人使用**：数据保存在本机 `~/.ai-report-tool/`，不支持云端同步、多端共享或团队协作，无账号体系。
* **删除不可恢复**：`delete_report` 是物理删除，无回收站。
* **补写历史报告**：CLI `create` 需显式传 `--date`（缺省为今天）；MCP `create_report` 直接传 `date`。
* **周报周期为 ISO 8601 周**：周一至周日；跨年周的归属按周四所在年份判定（如 2027-01-01 属于 2026-W53）。
* **查询无分页**：`query_reports` 返回全部命中结果，超大范围查询应用 `from/to/keyword` 缩小范围。
* **不生成内容**：本工具只负责存储和检索，报告内容由 Agent 基于真实上下文生成。

---

## FAQ

**Q：周报的周期怎么算？**
A：ISO 8601 周，周一为起点、周日为终点，period 格式 `YYYY-Www`。跨年时按该周周四所在的年份定周年份。

**Q：忘了写昨天的日报，能补吗？**
A：可以。MCP 用 `create_report` 传 `date=昨天的日期`；CLI 用 `ai-report create daily "内容" --date YYYY-MM-DD`。目标周期已有报告时会报错，此时应改用 update。

**Q：数据存在哪里？会不会丢？**
A：全部在本机 `~/.ai-report-tool/` 下的纯文本 `.txt` 文件中，格式人类可读。备份用 `ai-report export backup.json`（单个 JSON 文件，可定期备份或迁移到新电脑），恢复用 `ai-report restore backup.json`；也可直接复制整个目录。

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
   │    ├── 用户已带完整正文 → 原样保存 → create_report
   │    └── 只给素材 → 整理生成并确认 → create_report
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
