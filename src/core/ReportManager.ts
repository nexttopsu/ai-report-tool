import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  Report,
  ReportType,
  ReportManagerOptions,
  QueryOptions,
  ExportOptions,
  ExportResult,
  RestoreOptions,
  RestoreResult,
} from './types'
import { ReportExistsError, ReportNotFoundError, ValidationError } from './errors'
import {
  resolveStorageDir,
  validateType,
  parseDate,
  toPeriod,
  isValidPeriod,
  reportFileRelativePath,
  REPORT_TYPES,
} from './paths'
import { serializeReport, deserializeReport } from './format'

/** 导出文件结构版本号，恢复时校验，防止不兼容格式静默写坏数据 */
const EXPORT_VERSION = 1

/**
 * 报告管理器：日报 / 周报 / 月报 / 年报的创建、查询、获取、修改、删除、导出与恢复。
 *
 * 存储结构（txt，按类型分子目录，方便人工查找）：
 *   <storageDir>/daily/2026/09/21.txt
 *   <storageDir>/weekly/2026/W39.txt
 *   <storageDir>/monthly/2026/09.txt
 *   <storageDir>/yearly/2026.txt
 *
 * 用法：new ReportManager() 使用默认目录 ~/.ai-report-tool；
 *      new ReportManager({ storageDir: '/data/reports' }) 自定义目录。
 */
export class ReportManager {
  /** 存储根目录（绝对路径） */
  readonly storageDir: string

  constructor(options: ReportManagerOptions = {}) {
    this.storageDir = resolveStorageDir(options.storageDir)
  }

  // ---------- 创建 ----------

  /** 创建一份报告；目标周期已存在时抛 ReportExistsError（防误覆盖） */
  async create(type: ReportType, date: string | Date, content: string): Promise<Report> {
    validateType(type)
    if (typeof content !== 'string') throw new ValidationError('content 必须是字符串')
    const period = toPeriod(type, parseDate(date))
    const filePath = this.filePathOf(type, period)
    if (await fileExists(filePath)) {
      throw new ReportExistsError(`${type} 报告已存在: ${period}，如需修改请使用 update()`)
    }
    const now = new Date().toISOString()
    const report: Report = { type, period, content, createdAt: now, updatedAt: now }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, serializeReport(report), 'utf-8')
    return report
  }

  // ---------- 获取 ----------

  /**
   * 获取一份报告；不存在返回 null。
   * date 缺省为当前时间，因此 get('daily') 即今天日报、get('weekly') 即本周周报，依此类推。
   */
  async get(type: ReportType, date: string | Date = new Date()): Promise<Report | null> {
    validateType(type)
    const period = toPeriod(type, parseDate(date))
    const filePath = this.filePathOf(type, period)
    if (!(await fileExists(filePath))) return null
    return this.readReport(type, period, filePath)
  }

  /** 今天的日报 */
  getToday(): Promise<Report | null> {
    return this.get('daily')
  }

  /** 本周的周报（周一为一周起点） */
  getThisWeek(): Promise<Report | null> {
    return this.get('weekly')
  }

  /** 本月的月报 */
  getThisMonth(): Promise<Report | null> {
    return this.get('monthly')
  }

  /** 本年的年报 */
  getThisYear(): Promise<Report | null> {
    return this.get('yearly')
  }

  // ---------- 修改 ----------

  /** 覆盖一份已存在报告的正文并刷新 updatedAt；不存在时抛 ReportNotFoundError */
  async update(type: ReportType, date: string | Date, content: string): Promise<Report> {
    validateType(type)
    if (typeof content !== 'string') throw new ValidationError('content 必须是字符串')
    const period = toPeriod(type, parseDate(date))
    const filePath = this.filePathOf(type, period)
    if (!(await fileExists(filePath))) {
      throw new ReportNotFoundError(`${type} 报告不存在: ${period}，请先 create()`)
    }
    const existing = await this.readReport(type, period, filePath)
    const report: Report = { ...existing, content, updatedAt: new Date().toISOString() }
    await fs.writeFile(filePath, serializeReport(report), 'utf-8')
    return report
  }

  // ---------- 删除 ----------

  /** 删除一份报告；返回是否真的删除（目标不存在时返回 false，不报错） */
  async delete(type: ReportType, date: string | Date): Promise<boolean> {
    validateType(type)
    const period = toPeriod(type, parseDate(date))
    const filePath = this.filePathOf(type, period)
    try {
      await fs.unlink(filePath)
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw err
    }
  }

  // ---------- 查询 ----------

  /**
   * 按类型列出报告，支持 from/to 日期区间与 keyword 关键字过滤，按周期升序返回。
   * 目录中无法解析的非报告 txt 文件会被跳过（目录设计为可直接人工放置笔记）。
   */
  async query(type: ReportType, options: QueryOptions = {}): Promise<Report[]> {
    validateType(type)
    const reports: Report[] = []
    for (const filePath of await listTxtFiles(path.join(this.storageDir, type))) {
      const text = await fs.readFile(filePath, 'utf-8')
      let report: Report
      try {
        report = deserializeReport(text)
      } catch {
        continue
      }
      if (report.type === type) reports.push(report)
    }

    let result = reports
    if (options.keyword !== undefined) {
      result = result.filter((r) => r.content.includes(options.keyword as string))
    }
    if (options.from !== undefined || options.to !== undefined) {
      // 周期标识为定宽格式（周号补零），字典序等价于时间序，可直接字符串比较
      const fromPeriod =
        options.from !== undefined ? toPeriod(type, parseDate(options.from, 'from')) : null
      const toPeriodStr =
        options.to !== undefined ? toPeriod(type, parseDate(options.to, 'to')) : null
      result = result.filter(
        (r) =>
          (fromPeriod === null || r.period >= fromPeriod) &&
          (toPeriodStr === null || r.period <= toPeriodStr),
      )
    }
    return result.sort((a, b) => a.period.localeCompare(b.period))
  }

  // ---------- 导出 ----------

  /**
   * 把报告导出为单个 JSON 文件（含全部元数据），该文件可交给 restore() 完整恢复。
   * 默认导出全部类型到 <storageDir>/exports/ai-report-export-<时间戳>.json。
   */
  async export(options: ExportOptions = {}): Promise<ExportResult> {
    const types = options.types ?? REPORT_TYPES
    for (const type of types) validateType(type)

    const reports: Report[] = []
    for (const type of types) {
      reports.push(...(await this.query(type, options)))
    }

    const bundle = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      reports,
    }
    const outputFile =
      options.outputFile ??
      path.join(
        this.storageDir,
        'exports',
        `ai-report-export-${formatTimestampForFilename(new Date())}.json`,
      )
    await fs.mkdir(path.dirname(outputFile), { recursive: true })
    await fs.writeFile(outputFile, JSON.stringify(bundle, null, 2), 'utf-8')
    return { filePath: outputFile, count: reports.length }
  }

  // ---------- 恢复 ----------

  /**
   * 从 export() 生成的文件恢复报告。
   * 先整体校验文件结构与每条记录的合法性，全部通过后才写盘，避免写一半留脏数据。
   * 默认跳过已存在的报告；overwrite: true 时覆盖。
   */
  async restore(exportFile: string, options: RestoreOptions = {}): Promise<RestoreResult> {
    let text: string
    try {
      text = await fs.readFile(exportFile, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ValidationError(`恢复文件不存在: ${exportFile}`)
      }
      throw err
    }

    let bundle: unknown
    try {
      bundle = JSON.parse(text)
    } catch {
      throw new ValidationError('恢复文件不是合法的 JSON')
    }
    if (typeof bundle !== 'object' || bundle === null) {
      throw new ValidationError('恢复文件结构非法：顶层必须是对象')
    }
    const { version, reports } = bundle as { version?: unknown; reports?: unknown }
    if (version !== EXPORT_VERSION) {
      throw new ValidationError(`不支持的导出文件版本: ${String(version)}（当前支持: ${EXPORT_VERSION}）`)
    }
    if (!Array.isArray(reports)) {
      throw new ValidationError('恢复文件缺少 reports 数组')
    }

    // 阶段一：全量校验，任何一条非法立即失败，不写盘
    const valid: Report[] = []
    for (const item of reports) {
      if (!isReportLike(item)) {
        throw new ValidationError(`reports 中存在结构非法的条目: ${safePreview(item)}`)
      }
      if (!isValidPeriod(item.type, item.period)) {
        throw new ValidationError(`reports 中存在周期标识非法的条目: ${item.type} ${item.period}`)
      }
      valid.push(item)
    }

    // 阶段二：统一写盘
    let restored = 0
    let skipped = 0
    for (const report of valid) {
      const filePath = this.filePathOf(report.type, report.period)
      if (!options.overwrite && (await fileExists(filePath))) {
        skipped++
        continue
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, serializeReport(report), 'utf-8')
      restored++
    }
    return { restored, skipped }
  }

  // ---------- 内部工具 ----------

  private filePathOf(type: ReportType, period: string): string {
    return path.join(this.storageDir, reportFileRelativePath(type, period))
  }

  private async readReport(type: ReportType, period: string, filePath: string): Promise<Report> {
    const report = deserializeReport(await fs.readFile(filePath, 'utf-8'))
    if (report.type !== type || report.period !== period) {
      throw new Error(`报告文件元数据与存储路径不一致: ${filePath}`)
    }
    return report
  }
}

// ---------- 模块级工具函数 ----------

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** 递归列出目录下全部 .txt 文件；目录不存在返回空数组 */
async function listTxtFiles(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listTxtFiles(full)))
    } else if (entry.isFile() && entry.name.endsWith('.txt')) {
      files.push(full)
    }
  }
  return files
}

/** 生成文件名安全的时间戳（本地时间，不含 Windows 非法字符） */
function formatTimestampForFilename(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/** 恢复条目的结构校验（只认白名单类型 + 五个字符串字段） */
function isReportLike(item: unknown): item is Report {
  if (typeof item !== 'object' || item === null) return false
  const r = item as Record<string, unknown>
  return (
    typeof r.type === 'string' &&
    (REPORT_TYPES as readonly string[]).includes(r.type) &&
    typeof r.period === 'string' &&
    typeof r.content === 'string' &&
    typeof r.createdAt === 'string' &&
    typeof r.updatedAt === 'string'
  )
}

function safePreview(item: unknown): string {
  try {
    return JSON.stringify(item)?.slice(0, 120) ?? String(item)
  } catch {
    return '[无法序列化]'
  }
}
