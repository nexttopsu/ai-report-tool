import * as os from 'node:os'
import * as path from 'node:path'
import { ReportType } from './types'
import { ValidationError } from './errors'

/** 合法报告类型白名单（同时用于防路径穿越） */
export const REPORT_TYPES: readonly ReportType[] = ['daily', 'weekly', 'monthly', 'yearly']

/** 默认存储目录名，位于用户主目录下 */
export const DEFAULT_STORAGE_DIR_NAME = '.ai-report-tool'

/** 解析存储根目录：未指定时使用 ~/.ai-report-tool（os.homedir 跨平台，Windows/Linux/macOS 通用） */
export function resolveStorageDir(dir?: string): string {
  return dir ?? path.join(os.homedir(), DEFAULT_STORAGE_DIR_NAME)
}

/** 校验报告类型，只允许白名单内的字面量 */
export function validateType(type: ReportType): void {
  if (!REPORT_TYPES.includes(type)) {
    throw new ValidationError(`未知的报告类型: ${String(type)}（合法值: ${REPORT_TYPES.join(', ')}）`)
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 把输入规整为本地时区的 Date。
 * 字符串只接受严格的 YYYY-MM-DD 且必须是真实存在的日历日期，
 * 因此 '../..'、'2026-9-1'、'2026-02-30' 等非法/穿越输入都会被拒绝。
 */
export function parseDate(input: string | Date, what = 'date'): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new ValidationError(`${what} 不是有效的 Date`)
    return input
  }
  if (typeof input !== 'string' || !DATE_RE.test(input)) {
    throw new ValidationError(
      `${what} 必须是 YYYY-MM-DD 格式的字符串或 Date 对象，收到: ${JSON.stringify(input)}`,
    )
  }
  const [y, m, d] = input.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new ValidationError(`${what} 不是真实存在的日期: ${input}`)
  }
  return date
}

/**
 * ISO 8601 周号：周一为一周开始，包含当年第一个周四的那一周为第 1 周。
 * 周年份可能与公历年不同（如 2027-01-01 属于 2026-W53）。
 */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // 移到本周周四，用周四所在的年份判定周年份
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const year = d.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7)
  return { year, week }
}

/** 日期 → 该类型报告的周期标识（周号为两位补零，保证字典序与时间序一致） */
export function toPeriod(type: ReportType, date: Date): string {
  const y = date.getFullYear()
  switch (type) {
    case 'daily':
      return `${y}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    case 'weekly': {
      const { year, week } = isoWeek(date)
      return `${year}-W${pad2(week)}`
    }
    case 'monthly':
      return `${y}-${pad2(date.getMonth() + 1)}`
    case 'yearly':
      return `${y}`
  }
}

/** 各类型周期标识的严格格式（恢复外部导出文件时防脏数据 / 防路径穿越） */
const PERIOD_RES: Record<ReportType, RegExp> = {
  daily: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  weekly: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
  monthly: /^\d{4}-(0[1-9]|1[0-2])$/,
  yearly: /^\d{4}$/,
}

/** 校验周期标识格式是否与报告类型匹配 */
export function isValidPeriod(type: ReportType, period: string): boolean {
  return PERIOD_RES[type]?.test(period) === true
}

/** 报告周期 → 存储文件相对路径：daily/2026/09/21.txt、weekly/2026/W39.txt、monthly/2026/09.txt、yearly/2026.txt */
export function reportFileRelativePath(type: ReportType, period: string): string {
  switch (type) {
    case 'daily': {
      const [y, m, d] = period.split('-')
      return path.join('daily', y, m, `${d}.txt`)
    }
    case 'weekly': {
      const [y, w] = period.split('-W')
      return path.join('weekly', y, `W${w}.txt`)
    }
    case 'monthly': {
      const [y, m] = period.split('-')
      return path.join('monthly', y, `${m}.txt`)
    }
    case 'yearly':
      return path.join('yearly', `${period}.txt`)
  }
}
