---
name: ai-report-tool
slug: ai-report-tool
displayName: AI Report Tool
name_en: AI Report Tool
name_zh: AI 报告工具
version: 0.3.1
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

**前置条件**：已安装 ai-report-tool（`npm install -g ai-report-tool`），并将 `ai-report-mcp` 注册为 MCP Server；未注册 MCP 时可退回全局 CLI `ai-report`（命令与 MCP 工具一一对应，如 `ai-report today` ↔ `get_today_report`）。

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
5. 删除报告必须是用户明确要求。
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

不要通过 `delete_report + create_report` 实现修改。

---

## Delete

只有用户明确要求删除时使用：

```text
delete_report
```

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
   ├── 删除 → delete_report
   │
   └── 总结
        ├── 周报 ← get_week_dailies（本周日报汇总）
        ├── 月报 ← 周报/日报
        └── 年报 ← 月报/周报
```

**原则：Agent 负责理解、整理和生成；MCP 负责调用；Core 负责数据管理。**
