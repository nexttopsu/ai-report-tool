# 更新日志

## v0.3.5

- 新增 `ai-report export [文件] [--type/--from/--to/--keyword]`：备份/迁移报告为单个 JSON，支持过滤
- 新增 `ai-report restore <文件> [--overwrite]`：从备份恢复，默认跳过已存在
- MCP 不暴露备份/恢复（低频运维操作，走 CLI）

## v0.3.4

- `query_reports` 新增 `limit`（默认最多 50 条）与 `total`/`truncated` 字段，历史量大时不再撑爆上下文
- CLI `query` 新增 `--limit`，超量时提示剩余条数
- CLI `today/week/month/year` 新增 `--raw`，只输出正文（管道友好）
- `create_report` 冲突时附带 `existingReport`（上次保存时间）
- `get_week_dailies` 新增 `missingDates`（本周未写日报的日期，可提醒补写）
- `delete_report` 返回 `deletedReport`（被删内容，删除前可展示确认）

## v0.3.3

- 明确内容来源分支：用户自带成稿原样保存不归纳；只给素材才由 Agent 整理生成
- 更新请求遇目标周期无报告时，询问用户是否新建，而非直接报错

## v0.3.2

- CLI `create` 新增 `--date`：补写历史报告（缺省今天），与 MCP 对齐
- SKILL.md 大幅扩充：故障处理表、FAQ、JSON 输出示例、边界条件、CLI 命令对照表

## v0.3.1

- 新增本周日报能力：CLI `week-dailies` 与 MCP `get_week_dailies`
- 支持 `AI_REPORT_STORAGE_DIR` 环境变量覆盖存储目录
