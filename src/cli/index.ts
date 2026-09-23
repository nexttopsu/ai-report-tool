#!/usr/bin/env node
/**
 * ai-report CLI —— Core ReportManager 的命令行适配层。
 *
 * 设计约定：
 * - 只做参数解析、调用 Core API、面向终端的输出格式化，不重复实现任何 Core 逻辑
 * - 不引入 CLI 框架，使用原生 process.argv
 * - 业务错误（ValidationError / ReportExistsError / ReportNotFoundError）只输出简洁信息，
 *   不打印堆栈，并以 process.exitCode = 1 退出
 */
import {
  ReportManager,
  ReportExistsError,
  ReportNotFoundError,
  ValidationError,
  REPORT_TYPES,
  toPeriod,
} from '../core'
import type { Report, ReportType } from '../core'
import pkg from '../../package.json'

const TYPE_NAMES: Record<ReportType, string> = {
  daily: '日报',
  weekly: '周报',
  monthly: '月报',
  yearly: '年报',
}

const SEP = '--------------------'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const HELP = `ai-report — AI 报告工具命令行 v${pkg.version}

用法：
  ai-report today [--raw]                查看今天的日报（--raw 只输出正文）
  ai-report week [--raw]                 查看本周的周报（--raw 只输出正文）
  ai-report week-dailies                 查看本周的所有日报
  ai-report month [--raw]                查看本月的月报（--raw 只输出正文）
  ai-report year [--raw]                 查看今年的年报（--raw 只输出正文）

  ai-report create <type> <内容> [选项]   创建报告（type: daily / weekly / monthly / yearly）
      选项：
        --date <YYYY-MM-DD>    归属日期（缺省为今天；报告周期由该日期决定，可补写历史报告）
  ai-report update <type> <date> <内容>  更新指定日期的报告
  ai-report delete <type> <date>         删除指定日期的报告
  ai-report query <type> [选项]          查询报告列表
      选项：
        --from <YYYY-MM-DD>    起始日期（含）
        --to <YYYY-MM-DD>      结束日期（含）
        --keyword <关键字>     按正文关键字过滤（也支持 --keyword=关键字）
        --limit <N>            最多返回最近 N 条（也支持 --limit=N）

  ai-report export [文件路径] [选项]      导出报告为单个 JSON 文件（备份/迁移）
      选项：
        --type <type>          只导出指定类型（可重复，如 --type daily --type weekly）
        --from <YYYY-MM-DD>    起始日期（含）
        --to <YYYY-MM-DD>      结束日期（含）
        --keyword <关键字>     按正文关键字过滤
        （缺省文件路径为 ~/.ai-report-tool/exports/ai-report-export-<时间戳>.json）
  ai-report restore <文件> [选项]         从导出文件恢复报告
      选项：
        --overwrite            覆盖已存在的同名报告（缺省跳过）

  ai-report --help | help                显示本帮助
  ai-report --version | version          显示版本号

示例：
  ai-report create daily "今天完成了 MCP 集成"
  ai-report create daily "补写昨天的日报" --date 2026-09-22
  ai-report update daily 2026-09-21 "修改后的报告内容"
  ai-report query daily --from 2026-09-01 --to 2026-09-30 --keyword "告警"
  ai-report export backup.json           # 全量备份
  ai-report export work.json --type daily --from 2026-09-01
  ai-report restore backup.json          # 恢复（已存在的跳过）

报告默认存储在 ~/.ai-report-tool/ 目录下。`

// ---------- 输出辅助 ----------

/** ISO 时间戳 → 本地时区可读格式（终端友好） */
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    ` ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/** 单条报告的详情输出 */
function printReport(report: Report): void {
  console.log(TYPE_NAMES[report.type])
  console.log(`${report.type === 'daily' ? '日期' : '周期'}：${report.period}`)
  console.log(SEP)
  console.log(report.content)
  console.log(SEP)
  console.log(`创建时间：${formatTimestamp(report.createdAt)}`)
  console.log(`更新时间：${formatTimestamp(report.updatedAt)}`)
}

/** 参数错误：抛 ValidationError，由顶层统一转为简洁提示 */
function usageError(message: string): never {
  throw new ValidationError(message)
}

/** 校验并收窄报告类型参数 */
function parseType(value: string | undefined): ReportType {
  if (!value || !REPORT_TYPES.includes(value as ReportType)) {
    usageError(
      `报告类型必须是 ${REPORT_TYPES.join(' / ')}，收到: ${JSON.stringify(value ?? '')}`,
    )
  }
  return value as ReportType
}

/** 校验必填的 YYYY-MM-DD 日期参数（日历合法性由 Core 最终把关） */
function parseDateArg(value: string | undefined, what: string): string {
  if (!value || !DATE_RE.test(value)) {
    usageError(`${what} 必须是 YYYY-MM-DD 格式，收到: ${JSON.stringify(value ?? '')}`)
  }
  return value
}

// ---------- 命令实现（每个命令只做适配，不含业务逻辑） ----------

const manager = new ReportManager(
  // 支持通过环境变量覆盖存储目录（测试隔离/多实例场景）；缺省为 ~/.ai-report-tool
  process.env.AI_REPORT_STORAGE_DIR ? { storageDir: process.env.AI_REPORT_STORAGE_DIR } : {},
)

/** today / week / month / year：查看当前周期报告（直接映射 Core 快捷方法）。
 *  --raw 只输出正文，适合管道场景（如 ai-report today --raw | pbcopy）。 */
async function showCurrent(type: ReportType, raw: boolean): Promise<void> {
  const currentGetters: Record<ReportType, () => Promise<Report | null>> = {
    daily: () => manager.getToday(),
    weekly: () => manager.getThisWeek(),
    monthly: () => manager.getThisMonth(),
    yearly: () => manager.getThisYear(),
  }
  const report = await currentGetters[type]()
  if (!report) {
    const when = { daily: '今天', weekly: '本周', monthly: '本月', yearly: '今年' }[type]
    console.log(`${when}还没有${TYPE_NAMES[type]}。`)
    return
  }
  if (raw) {
    console.log(report.content)
    return
  }
  printReport(report)
}

/** 本周的起止日期（周一至周日，YYYY-MM-DD） */
function thisWeekRange(): { from: string; to: string } {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1)) // 周一为一周起点，与 Core isoWeek 一致
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date): string => toPeriod('daily', d)
  return { from: fmt(monday), to: fmt(sunday) }
}

/** week-dailies：列出本周的所有日报（等价于 query daily --from 本周一 --to 本周日） */
async function showWeekDailies(): Promise<void> {
  const { from, to } = thisWeekRange()
  const reports = await manager.query('daily', { from, to })
  if (reports.length === 0) {
    console.log(`本周（${from} ~ ${to}）还没有日报。`)
    return
  }
  console.log(`本周（${from} ~ ${to}）共 ${reports.length} 条日报：`)
  console.log(SEP)
  for (const report of reports) {
    console.log(`◆ ${report.period}`)
    for (const line of report.content.split('\n')) {
      console.log(`  ${line}`)
    }
    console.log(`  更新时间：${formatTimestamp(report.updatedAt)}`)
  }
}

/**
 * create：创建报告。内容参数中可混入 --date 选项指定归属日期（缺省今天），
 * 报告周期由该日期决定（与 MCP create_report 对齐），支持补写历史报告。
 * 目标周期已存在时仍抛 ReportExistsError，保持防误覆盖语义。
 */
async function cmdCreate(args: string[]): Promise<void> {
  const type = parseType(args[0])
  const rest = args.slice(1)
  let date: Date | string = new Date() // 缺省为今天
  const contentParts: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    const eq = arg.indexOf('=')
    const hasEq = arg.startsWith('--') && eq > 2
    const name = hasEq ? arg.slice(0, eq) : arg
    const inlineValue = hasEq ? arg.slice(eq + 1) : undefined
    if (name === '--date') {
      date = parseDateArg(inlineValue ?? rest[++i], '--date')
    } else {
      contentParts.push(arg)
    }
  }
  const content = contentParts.join(' ').trim()
  if (!content) {
    usageError(`缺少报告内容。用法：ai-report create <type> <内容> [--date <YYYY-MM-DD>]`)
  }
  const report = await manager.create(type, date, content)
  console.log(`已创建 ${report.period} 的${TYPE_NAMES[type]}。`)
}

async function cmdUpdate(args: string[]): Promise<void> {
  const type = parseType(args[0])
  const date = parseDateArg(args[1], '日期')
  const content = args.slice(2).join(' ').trim()
  if (!content) {
    usageError(`缺少报告内容。用法：ai-report update <type> <date> <内容>`)
  }
  const report = await manager.update(type, date, content)
  console.log(`已更新 ${report.period} 的${TYPE_NAMES[type]}。`)
}

async function cmdDelete(args: string[]): Promise<void> {
  const type = parseType(args[0])
  const date = parseDateArg(args[1], '日期')
  const deleted = await manager.delete(type, date)
  if (deleted) {
    console.log(`已删除 ${date} 的${TYPE_NAMES[type]}。`)
  } else {
    console.log(`${date} 的${TYPE_NAMES[type]}不存在，未删除。`)
  }
}

/** 解析 query 的 --from / --to / --keyword / --limit 选项（支持空格分隔与 = 连写） */
function parseQueryOptions(rest: string[]): {
  from?: string
  to?: string
  keyword?: string
  limit?: number
} {
  const options: { from?: string; to?: string; keyword?: string; limit?: number } = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    const eq = arg.indexOf('=')
    const hasEq = arg.startsWith('--') && eq > 2
    const name = hasEq ? arg.slice(0, eq) : arg
    const inlineValue = hasEq ? arg.slice(eq + 1) : undefined
    const value = inlineValue ?? rest[++i]
    if (name === '--from') {
      options.from = parseDateArg(value, '--from')
    } else if (name === '--to') {
      options.to = parseDateArg(value, '--to')
    } else if (name === '--keyword') {
      if (value === undefined || value === '') {
        usageError('--keyword 需要一个关键字，如 --keyword "告警"')
      }
      options.keyword = value
    } else if (name === '--limit') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) {
        usageError('--limit 需要一个正整数，如 --limit 10')
      }
      options.limit = n
    } else {
      usageError(`未知的查询选项: ${JSON.stringify(arg)}`)
    }
  }
  return options
}

async function cmdQuery(args: string[]): Promise<void> {
  const type = parseType(args[0])
  const options = parseQueryOptions(args.slice(1))
  const all = await manager.query(type, options)
  // limit 语义：取最近的 N 条（Core 已处理），allCount 用于提示还有更早的历史
  const allCount = options.limit !== undefined ? (await manager.query(type, {
    from: options.from,
    to: options.to,
    keyword: options.keyword,
  })).length : all.length
  const reports = all

  if (reports.length === 0) {
    console.log(`没有找到符合条件的${TYPE_NAMES[type]}。`)
    return
  }
  if (options.limit !== undefined && allCount > reports.length) {
    console.log(`共 ${allCount} 条${TYPE_NAMES[type]}，显示最近的 ${reports.length} 条：`)
  } else {
    console.log(`共 ${reports.length} 条${TYPE_NAMES[type]}：`)
  }
  console.log(SEP)
  for (const report of reports) {
    console.log(`◆ ${report.period}`)
    for (const line of report.content.split('\n')) {
      console.log(`  ${line}`)
    }
    console.log(`  更新时间：${formatTimestamp(report.updatedAt)}`)
  }
}

// ---------- 入口与分发 ----------

/** export：把报告导出为单个 JSON 文件（备份/迁移）。文件路径为第一个非 -- 开头参数。 */
async function cmdExport(args: string[]): Promise<void> {
  let outputFile: string | undefined
  const options: { types?: ReportType[]; from?: string; to?: string; keyword?: string } = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      if (outputFile !== undefined) usageError(`多余的参数: ${JSON.stringify(arg)}`)
      outputFile = arg
      continue
    }
    const eq = arg.indexOf('=')
    const hasEq = eq > 2
    const name = hasEq ? arg.slice(0, eq) : arg
    const value = hasEq ? arg.slice(eq + 1) : args[++i]
    if (name === '--type') {
      if (value === undefined) usageError('--type 需要一个类型，如 --type daily')
      ;(options.types ??= []).push(parseType(value))
    } else if (name === '--from') {
      options.from = parseDateArg(value, '--from')
    } else if (name === '--to') {
      options.to = parseDateArg(value, '--to')
    } else if (name === '--keyword') {
      if (value === undefined || value === '') usageError('--keyword 需要一个关键字')
      options.keyword = value
    } else {
      usageError(`未知的导出选项: ${JSON.stringify(arg)}`)
    }
  }
  const result = await manager.export({ ...options, outputFile })
  console.log(`已导出 ${result.count} 份报告 → ${result.filePath}`)
}

/** restore：从 export 生成的 JSON 文件恢复报告。缺省跳过已存在，--overwrite 覆盖。 */
async function cmdRestore(args: string[]): Promise<void> {
  let file: string | undefined
  let overwrite = false
  for (const arg of args) {
    if (arg === '--overwrite') {
      overwrite = true
    } else if (!arg.startsWith('--')) {
      if (file !== undefined) usageError(`多余的参数: ${JSON.stringify(arg)}`)
      file = arg
    } else {
      usageError(`未知的恢复选项: ${JSON.stringify(arg)}`)
    }
  }
  if (!file) usageError('缺少导出文件路径。用法：ai-report restore <文件> [--overwrite]')
  const result = await manager.restore(file, { overwrite })
  const skippedHint = result.skipped > 0 ? `，跳过已存在 ${result.skipped} 份（用 --overwrite 覆盖）` : ''
  console.log(`已恢复 ${result.restored} 份报告${skippedHint}。`)
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const args = argv.slice(1)

  switch (command) {
    case '--help':
    case 'help':
      console.log(HELP)
      return

    case '--version':
    case 'version':
      console.log(`ai-report v${pkg.version}`)
      return

    case 'today':
      await showCurrent('daily', args[0] === '--raw')
      return
    case 'week':
      await showCurrent('weekly', args[0] === '--raw')
      return
    case 'week-dailies':
      await showWeekDailies()
      return
    case 'month':
      await showCurrent('monthly', args[0] === '--raw')
      return
    case 'year':
      await showCurrent('yearly', args[0] === '--raw')
      return

    case 'create':
      await cmdCreate(args)
      return

    case 'update':
      await cmdUpdate(args)
      return

    case 'delete':
      await cmdDelete(args)
      return

    case 'query':
      await cmdQuery(args)
      return

    case 'export':
      await cmdExport(args)
      return

    case 'restore':
      await cmdRestore(args)
      return

    case undefined:
      console.log(HELP)
      process.exitCode = 1
      return

    default:
      usageError(`未知命令: ${JSON.stringify(command)}`)
  }
}

run().catch((err: unknown) => {
  // 业务错误与参数错误：只输出简洁信息，不打印堆栈
  if (err instanceof ValidationError) {
    console.error(`错误：${err.message}`)
    console.error('运行 ai-report --help 查看用法。')
  } else if (err instanceof ReportExistsError || err instanceof ReportNotFoundError) {
    console.error(`错误：${err.message}`)
  } else {
    console.error(`错误：${err instanceof Error ? err.message : String(err)}`)
  }
  process.exitCode = 1
})
