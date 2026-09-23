#!/usr/bin/env node
/**
 * ai-report-mcp —— ai-report-tool 的 MCP Server（stdio 传输）。
 *
 * 架构：AI Agent → MCP Server（本文件，纯适配层）→ ReportManager → Storage
 *
 * 约定：
 * - 只做 MCP Tool 的注册、参数适配、结果包装，不包含任何报告业务逻辑
 * - 所有工具返回结构化 JSON（content 内为 JSON 字符串），适合 Agent 解析
 * - Core 异常转换为 { success: false, error: { code, message } }，不让 Server 崩溃
 * - stdio 模式下严禁向 stdout 打印普通日志（会破坏 MCP 协议帧）；调试走 stderr
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  ReportManager,
  ReportExistsError,
  ReportNotFoundError,
  ValidationError,
  toPeriod,
} from '../core'
import type { Report, ReportType } from '../core'
import pkg from '../../package.json'

const manager = new ReportManager(
  // 支持通过环境变量覆盖存储目录（测试隔离/多实例场景）；缺省为 ~/.ai-report-tool
  process.env.AI_REPORT_STORAGE_DIR ? { storageDir: process.env.AI_REPORT_STORAGE_DIR } : {},
)

// ---------- 公共 schema 与结果包装 ----------

/** 报告类型枚举（与 Core REPORT_TYPES 一致） */
const typeSchema = z
  .enum(['daily', 'weekly', 'monthly', 'yearly'])
  .describe('报告类型：daily=日报，weekly=周报，monthly=月报，yearly=年报')

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '必须是 YYYY-MM-DD 格式')
  .describe('日期（YYYY-MM-DD）。报告归属的周期由该日期决定，如周报会归到该日期所在的 ISO 周')

const contentSchema = z
  .string()
  .min(1, '报告正文不能为空')
  .describe('报告正文（完整内容，Markdown 纯文本）。注意：内容由 Agent 生成，本工具只负责保存')

/**
 * 把成功结果包装为 MCP content。
 * 返回 JSON 字符串并保持 isError=false，让 Agent 直接解析结构化数据。
 */
function ok(payload: Record<string, unknown>): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}

/** Core 错误 → 结构化失败结果（isError=true，Agent 可读取错误码）；extra 可向 error 附带补充信息 */
function fail(err: unknown, extra?: Record<string, unknown>): {
  content: { type: 'text'; text: string }[]
  isError: boolean
} {
  let code = 'INTERNAL_ERROR'
  if (err instanceof ReportNotFoundError) code = 'REPORT_NOT_FOUND'
  else if (err instanceof ReportExistsError) code = 'REPORT_EXISTS'
  else if (err instanceof ValidationError) code = 'VALIDATION_ERROR'
  const message = err instanceof Error ? err.message : String(err)
  // 结构化错误对象放 content（协议要求文本），同时用 isError 标记失败
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: false, error: { code, message, ...extra } }),
      },
    ],
    isError: true,
  }
}

/** 统一的异步 handler 包装：异常全部转为结构化结果，绝不让 Server 崩溃 */
async function guard<T>(fn: () => Promise<T>): Promise<ReturnType<typeof ok> | ReturnType<typeof fail>> {
  try {
    return ok(await fn() as Record<string, unknown>)
  } catch (err) {
    return fail(err)
  }
}

// ---------- Server 与 Tool 注册 ----------

const server = new McpServer(
  { name: 'ai-report-mcp', version: pkg.version },
  { capabilities: { tools: {} } },
)

/** 报告对象按 Core 原样返回（type/period/content/createdAt/updatedAt），不增删字段 */
function reportResult(action: string, report: Report) {
  return { success: true, action, report }
}

// --- 1. get_today_report ---
server.registerTool(
  'get_today_report',
  {
    title: '获取今天的日报',
    description:
      '获取今天的日报内容。当用户询问今天完成了什么、今天的日报是什么、今天的工作记录是什么时使用。如果今天还没有日报，返回明确的未找到结果。',
  },
  async () =>
    guard(async () => {
      const report = await manager.getToday()
      if (!report) {
        return { success: false, error: { code: 'REPORT_NOT_FOUND', message: '今天还没有日报' } }
      }
      return reportResult('fetched', report)
    }),
)

// --- 2. get_week_report ---
server.registerTool(
  'get_week_report',
  {
    title: '获取本周周报',
    description:
      '获取本周的周报内容（ISO 8601 周，周一为一周开始）。当用户询问本周总结、本周周报时使用。如果本周还没有周报，返回明确的未找到结果。',
  },
  async () =>
    guard(async () => {
      const report = await manager.getThisWeek()
      if (!report) {
        return { success: false, error: { code: 'REPORT_NOT_FOUND', message: '本周还没有周报' } }
      }
      return reportResult('fetched', report)
    }),
)

// --- 3. get_month_report ---
server.registerTool(
  'get_month_report',
  {
    title: '获取本月月报',
    description:
      '获取本月的月报内容。当用户询问本月总结、本月月报时使用。如果本月还没有月报，返回明确的未找到结果。',
  },
  async () =>
    guard(async () => {
      const report = await manager.getThisMonth()
      if (!report) {
        return { success: false, error: { code: 'REPORT_NOT_FOUND', message: '本月还没有月报' } }
      }
      return reportResult('fetched', report)
    }),
)

// --- 4. get_year_report ---
server.registerTool(
  'get_year_report',
  {
    title: '获取今年的年度报告',
    description:
      '获取今年的年度报告内容。当用户询问年度总结、年报时使用。如果今年还没有年报，返回明确的未找到结果。',
  },
  async () =>
    guard(async () => {
      const report = await manager.getThisYear()
      if (!report) {
        return { success: false, error: { code: 'REPORT_NOT_FOUND', message: '今年还没有年报' } }
      }
      return reportResult('fetched', report)
    }),
)

// --- 5. create_report ---
server.registerTool(
  'create_report',
  {
    title: '创建报告',
    description:
      '创建一份日报、周报、月报或年度报告。仅当用户明确要求保存/创建报告时使用。注意：本工具不负责生成报告内容，Agent 应先自行撰写完整正文，再作为 content 传入。同一周期已存在报告时会返回 REPORT_EXISTS 错误，此时应改用 update_report。',
    inputSchema: {
      type: typeSchema,
      date: dateSchema,
      content: contentSchema,
    },
  },
  async ({ type, date, content }) => {
    try {
      const created = await manager.create(type, date, content)
      return ok(reportResult('created', created))
    } catch (err) {
      // 已存在时附带已有报告的元信息，让 Agent 能直接告知用户"何时保存过"，省一次查询
      if (err instanceof ReportExistsError) {
        const existing = await manager.get(type, date)
        return fail(err, {
          existingReport: existing
            ? { period: existing.period, updatedAt: existing.updatedAt }
            : null,
        })
      }
      return fail(err)
    }
  },
)

// --- 6. update_report ---
server.registerTool(
  'update_report',
  {
    title: '更新报告',
    description:
      '修改一份已存在的报告，用新的完整正文替换原内容。报告不存在时返回 REPORT_NOT_FOUND 错误，此时应改用 create_report。注意：content 是完整的新正文而非增量补丁。',
    inputSchema: {
      type: typeSchema,
      date: dateSchema,
      content: contentSchema,
    },
  },
  async ({ type, date, content }) =>
    guard(async () => reportResult('updated', await manager.update(type, date, content))),
)

// --- 7. delete_report ---
server.registerTool(
  'delete_report',
  {
    title: '删除报告',
    description:
      '删除一份报告。仅当用户明确要求删除时使用。物理删除、不可恢复。返回 deletedReport（被删报告的 period 与正文），便于向用户确认删掉了什么；目标周期没有报告时不会报错，返回 deleted: false。',
    inputSchema: {
      type: typeSchema,
      date: dateSchema,
    },
  },
  async ({ type, date }) =>
    guard(async () => {
      const existing = await manager.get(type, date)
      const deleted = await manager.delete(type, date)
      return {
        success: true,
        action: 'deleted',
        deleted,
        type,
        date,
        deletedReport: deleted && existing ? { period: existing.period, content: existing.content } : null,
      }
    }),
)

/** 本周的起止日期（周一至周日，YYYY-MM-DD；周一为起点，与 Core isoWeek 语义一致） */
function thisWeekRange(): { from: string; to: string } {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date): string => toPeriod('daily', d)
  return { from: fmt(monday), to: fmt(sunday) }
}

/** 周一至今还没有日报的日期（已过但未写的天；未来日期不算缺勤） */
function missingDailyDates(from: string, writtenPeriods: Set<string>): string[] {
  const missing: string[] = []
  const start = new Date(`${from}T00:00:00`)
  const today = new Date()
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const period = toPeriod('daily', d)
    if (!writtenPeriods.has(period)) missing.push(period)
  }
  return missing
}

// --- 8. query_reports ---
server.registerTool(
  'query_reports',
  {
    title: '查询报告列表',
    description:
      '按类型查询报告列表，支持日期区间（from/to）、正文关键字（keyword）与数量上限（limit，默认 50，按周期降序取最近的）过滤。返回 total（过滤后的总条数）与 reports（本次返回的列表）；total 超过返回条数时说明还有更早的历史，应缩小 from/to 范围或加 keyword 后再查。当用户想回顾/检索历史日报、周报、月报、年报时使用。',
    inputSchema: {
      type: typeSchema,
      from: dateSchema.optional().describe('起始日期（含），YYYY-MM-DD'),
      to: dateSchema.optional().describe('结束日期（含），YYYY-MM-DD'),
      keyword: z.string().min(1).optional().describe('正文关键字过滤'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('最多返回条数（默认 50），按周期降序取最近的'),
    },
  },
  async ({ type, from, to, keyword, limit }) =>
    guard(async () => {
      const reports = await manager.query(type, { from, to, keyword })
      const max = limit ?? 50
      const truncated = reports.length > max
      return {
        success: true,
        action: 'queried',
        type,
        total: reports.length,
        count: truncated ? max : reports.length,
        truncated,
        reports: truncated
          ? reports.slice(-max) // reports 已升序，取最近的 max 份
          : reports,
      }
    }),
)

// --- 9. get_week_dailies ---
server.registerTool(
  'get_week_dailies',
  {
    title: '获取本周的所有日报',
    description:
      '获取本周（周一至周日）的全部日报列表。当用户询问本周每天都做了什么、查看本周全部日报、或需要汇总本周日报来写周报时使用。返回按日期升序的日报数组，以及 missingDates（周一至今还没有日报的日期，可据此提醒用户补写）；本周还没有任何日报时返回空列表。',
  },
  async () =>
    guard(async () => {
      const { from, to } = thisWeekRange()
      const reports = await manager.query('daily', { from, to })
      return {
        success: true,
        action: 'queried',
        type: 'daily',
        range: { from, to },
        count: reports.length,
        missingDates: missingDailyDates(from, new Set(reports.map((r) => r.period))),
        reports,
      }
    }),
)

// ---------- 启动（stdio） ----------

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // 调试日志只能走 stderr；stdout 由 MCP 协议独占
  console.error('ai-report-mcp server started (stdio)')
}

main().catch((err: unknown) => {
  console.error('ai-report-mcp fatal:', err)
  process.exit(1)
})
