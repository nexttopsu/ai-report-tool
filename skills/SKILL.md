---
name: ai-report-tool
slug: ai-report-tool
displayName: Report Tool
name_en: Report Tool
name_zh: 日报工具
version: 0.3.10
description: Manage daily, weekly, monthly, and yearly work reports. Use when the user asks to write, save, view, update, delete, or search work reports (日报/周报/月报/年报), or to generate summaries from historical reports.
description_en: Manage daily, weekly, monthly, and yearly work reports. Use when the user asks to write, save, view, update, delete, or search work reports (日报/周报/月报/年报), or to generate summaries from historical reports.
description_zh: 管理日报、周报、月报、年报。当用户要求写/保存/查看/修改/删除/查询工作报告，或根据历史记录生成总结时使用。
argument-hint: Describe the report task, e.g. write today's daily report or query last week's work
argument-hint-en: Describe the report task, e.g. write today's daily report or query last week's work
argument-hint-zh: 描述报告任务，例如写今天的日报或查询上周的工作
author: nexttopsu
license: ISC
user-invocable: true
---

# AI Report Tool

用于管理日报、周报、月报、年报。

**前置条件**：已安装 ai-report-tool（`npm install -g ai-report-tool`，需要 Node ≥ 18），并将 `ai-report-mcp` 注册为 MCP Server；未注册 MCP 时可退回全局 CLI `ai-report`（命令一一对应，见 [references/cli.md](references/cli.md)）。

**版本检查**：首次使用本 Skill 时（尤其用户刚通过 skillhub 安装技能），检查用户本机 npm 包版本是否为最新：

```text
ai-report version                      ← 本机已装版本（若命令不存在则未安装，见前置条件）
npm view ai-report-tool version        ← npm 上的最新版本
```

本机版本 < 最新版本时，提醒用户升级：

> 检测到 ai-report-tool v0.3.1，最新版本是 v0.3.6，建议升级：npm install -g ai-report-tool@latest

升级后 MCP Client 需重启（MCP Server 进程在安装时加载，旧进程不会自动切到新版本）。版本相同或查询失败（网络问题）则静默跳过，不要阻塞正常报告操作。

**详细参考**（按需读取）：

* [references/cli.md](references/cli.md) — CLI 命令对照表、各命令选项、备份与恢复
* [references/troubleshooting.md](references/troubleshooting.md) — 故障处理表、错误码与错误返回格式
* [references/faq.md](references/faq.md) — JSON 返回格式、周期标识、磁盘存储、FAQ

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
5. 删除报告必须是用户明确要求，且删除后不可恢复（物理删除，无回收站，执行前二次确认）。
6. 不要虚构用户没有完成的工作。
7. MCP 返回的 JSON 是内部数据，正常情况下转换成自然语言回复。

---

## Available MCP Tools

**查看**：`get_today_report` / `get_week_report` / `get_month_report` / `get_year_report`

**本周日报列表**：`get_week_dailies`（返回本周一至周日的全部日报，带 range 区间与 missingDates 缺勤日期）

**操作**：`create_report` / `update_report` / `delete_report` / `query_reports`

`type`：`daily` / `weekly` / `monthly` / `yearly`

**易混警告——"本周的日报" ≠ "本周的周报"**：

* 用户说"本周的日报 / 这周的日报 / 这周每天做了什么" → **`get_week_dailies`**（本周日报列表），不是 `get_week_report`
* 用户说"本周的周报 / 本周总结 / 这周的周报" → **`get_week_report`**（周报单份）

判定看"日报/周报"这个关键词，不要因为"本周"就联想到周报。

`create_report / update_report / delete_report` 均接受 `date` 参数（`YYYY-MM-DD`）。报告归属周期由该日期决定，例如周报会归到该日期所在的 ISO 周——写本周周报传今天日期即可，无需计算周号。

`query_reports` 支持 `from`/`to`/`keyword`/`limit`（默认最多返回最近 50 条，附 total/truncated）。

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

* 用户已给出完整正文，只要求保存/更新（如"把我说的这些存成今天的日报"）→ **原样作为 content 保存**，不改写、不重新归纳；仅当明显缺格式时可做最小排版规整
* 用户只描述了做了哪些工作（如"帮我写日报，今天修了个 bug"）→ Agent 整理归纳生成草稿 → 向用户展示确认 → 确认后保存

判断依据是用户意图：明确给出成稿就用原文，只给素材才生成。拿不准时先展示准备保存的正文，向用户确认。

日报内容应基于用户实际完成的工作进行整理，不要虚构。

### 示例（用户只给素材）

用户输入：

> 帮我写今天的日报。今天上午修完了登录超时的 bug，下午把 MCP server 的错误码统一成了结构化格式，晚上 review 了小王的 PR。

Agent 执行 `get_today_report` → 今天还没有日报 → 整理生成草稿 → 向用户确认 → `create_report(type=daily, date=2026-09-23, content=...)`，正文：

```text
1. 修复登录超时 bug
2. MCP server 错误码统一为结构化格式（success/error.code/message）
3. Review 小王的 PR
```

### 示例（用户自带成稿）

用户输入（已给出完整正文，只要求更新）：

> 帮我更新今天的日报：1）完成登录模块联调 2）修复 3 个测试用例失败 3）明天开始做权限模块

Agent 执行 `get_today_report` → 今天已有日报 → 用户明确要求更新且正文已完整 → `update_report(...)`，正文**原样使用**用户给的清单，不重新归纳。

---

## Weekly Report（基于本周日报汇总）

用户要求：

> 帮我写本周的周报
> 根据这周的日报汇总一份周报

**先消歧**：用户说"查看本周的日报"是要日报列表，用 `get_week_dailies` 直接返回，不要进入本节写周报的流程；只有明确要"周报/本周总结"才继续。

流程：

```text
get_week_dailies            ← 一次调用拿全本周日报（无需手动计算日期区间）
      ↓
count = 0 → 告知本周还没有日报，请用户补充素材（不要虚构），流程结束
count > 0 → 按天阅读各日报正文，归纳整理
      ↓
missingDates 非空 → 提醒用户"某天日报还没写，要补吗？"（不阻塞，可继续）
      ↓
生成新周报草稿
      ↓
get_week_report 检查本周是否已有周报
      ↓
┌─ 没有周报：直接向用户展示新周报草稿 → 确认后 create_report → 回复"周报已生成/保存"
│
└─ 已有周报：一次性展示两部分，让用户对比——
   ① 旧周报（明确标注"当前已有周报"，注明保存日期即可，不带具体时间）
   ② 新周报草稿（标注"基于本周日报新生成"）
   → 询问"是否用新周报覆盖旧周报？"
   → 确认后 update_report → 回复"周报已更新"
   → 用户拒绝 → 保留旧周报，不做写操作
```

**输出示例（已有周报时）**：

```text
基于本周日报生成了新的周报草稿：

【当前已有周报】（09-22 保存）
……旧周报正文……

【新生成的周报】
……新周报草稿……

要用新的周报覆盖旧的吗？
```

注意：

* 展示草稿与旧周报要**一次完成**，不要分多轮挤牙膏。
* 调用工具的参数错误（如日期格式）在 Agent 侧自行修正后重试，**不要向用户展示报错原文和自我修正过程**（如"需要指定日期格式，让我查看正确的用法"这类独白）。
* 用户确认覆盖用 `update_report`，不要 delete + create。

**写上周/历史周报**：`create_report` 的 `date` 传上周任意一天（如上周一）即可，工具会自动折算到对应 ISO 周。同理月报传当月任意一天、年报传当年任意一天。

汇总要点：

* 合并同类工作，按主题/项目分组，不要按天罗列流水账
* 突出本周完成的工作、项目进展、问题及解决
* 结尾附上下周计划（仅在日报或上下文中有依据时）
* 严格基于日报真实内容，不要虚构未记录的工作

---

## Monthly / Yearly Report

月报：`get_month_report` → `query_reports(type=weekly, 本月)` → 必要时查 daily → AI 总结 → create/update。优先用周报作素材。

年报：`get_year_report` → `query_reports(type=monthly, 本年)` → 必要时查 weekly/daily → AI 总结 → create/update。优先用月报作素材。

---

## Query

按关键字（如"查一下最近关于 MCP 的工作"）：`query_reports(type=daily, keyword="MCP")`

按日期范围：`query_reports(type=daily, from="YYYY-MM-DD", to="YYYY-MM-DD")`

尽量缩小查询范围；历史量大时传 `limit`，返回 `truncated: true` 说明还有更早历史，应缩小范围再查。

---

## Update

用户明确要求：修改/更新/重新整理报告、把报告改成……、帮我把这些内容存成/更新到报告。

流程：

```text
先查看目标周期是否已有报告（get_*_report / query_reports）
      ↓
已存在 → update_report
不存在 → 不要直接报错终止
      ↓
向用户说明该周期还没有报告，并询问是否新建
（如"2026-09-22 还没有日报，要为你新建一份吗？"）
      ↓
用户确认 → create_report（正文按内容来源分支处理）
用户拒绝 → 不做任何写操作
```

注意：

* `content` 是**完整的新正文**，不是增量补丁。
* 用户已带完整正文时原样传入，不要重新归纳改写；只给修改方向（如"把第二条展开写详细点"）才由 Agent 读取现有报告调整生成。
* 若直接调用 `update_report` 收到 `REPORT_NOT_FOUND`，同样询问用户是否新建，不要把错误原样抛给用户。

不要通过 `delete_report + create_report` 实现修改。

---

## Delete

只有用户明确要求删除时使用 `delete_report`。

**删除是物理删除**：磁盘文件直接移除，没有回收站，无法恢复。返回 `deletedReport`（被删报告的 period 与正文），确认对话中可向用户展示内容。目标周期没有报告时不报错，返回 `deleted: false`。

---

## Report Generation

* 用户已给出完整正文时，原样保存，不要重新归纳改写
* 只使用用户提供或上下文中真实存在的信息
* 合理归纳，但不要编造
* 内容简洁、专业，避免重复
* 保留重要的开发、测试、修复、学习和项目进展

---

## Response Style

操作成功后简洁回复（如"今天的日报已经保存。"）。查询结果较多时，先告诉用户找到多少条，再展示相关内容。不要默认向用户展示 MCP Tool 调用过程或原始 JSON。

**不暴露内部元数据**：展示报告内容时只呈现日期（period）与正文，**不要附上每条报告的更新时间（updatedAt）、创建时间（createdAt）等内部字段**——用户看日报列表不需要这些。仅在用户明确询问"什么时候写的/改的"时才提供。

**不暴露过程噪音**：工具参数错误、报错原文、Agent 的自我修正独白（如"需要指定日期格式，让我查看正确的用法"）一律不要出现在回复中——自行修正后重试，只呈现最终结果。

---

## Limitations / 边界条件

* **仅本地单人使用**：数据在本机 `~/.ai-report-tool/`，不支持云端同步、多端共享或团队协作
* **删除不可恢复**：物理删除，无回收站
* **查询无深分页**：默认最多返回 50 条，更大范围用 from/to/keyword 缩小
* **不生成内容**：只负责存储和检索，报告内容由 Agent 基于真实上下文生成
* 备份/迁移走 CLI `export` / `restore`（见 references/cli.md）

---

## Decision Flow

```text
用户请求
   │
   ├── 查看 → get_*_report
   │
   ├── 查询 → query_reports
   │
   ├── 本周日报 → get_week_dailies（"本周的日报"是日报列表，不是周报）
   │
   ├── 创建
   │    ├── 用户已带完整正文 → 原样保存 → create_report
   │    └── 只给素材 → 整理生成并确认 → create_report
   │
   ├── 修改 → 先查是否存在 → update_report / 询问是否新建
   │
   ├── 删除 → delete_report（不可恢复，先确认）
   │
   └── 总结
        ├── 周报 ← get_week_dailies（本周日报汇总）
        ├── 月报 ← 周报/日报
        └── 年报 ← 月报/周报
```

**原则：Agent 负责理解、整理和生成；MCP 负责调用；Core 负责数据管理。**
