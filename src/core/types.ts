/** 报告类型：日报 / 周报 / 月报 / 年报 */
export type ReportType = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** 一份报告的完整数据 */
export interface Report {
  /** 报告类型 */
  type: ReportType
  /** 周期标识：日报 2026-09-21 / 周报 2026-W39 / 月报 2026-09 / 年报 2026 */
  period: string
  /** 报告正文 */
  content: string
  /** 创建时间（ISO 8601） */
  createdAt: string
  /** 最后修改时间（ISO 8601） */
  updatedAt: string
}

/** ReportManager 构造选项 */
export interface ReportManagerOptions {
  /** 存储根目录；默认 ~/.ai-report-tool（跨平台，基于 os.homedir()） */
  storageDir?: string
}

/** query / export 的过滤选项 */
export interface QueryOptions {
  /** 起始日期（含），'YYYY-MM-DD' 字符串或 Date；周报/月报/年报会折算到对应周期 */
  from?: string | Date
  /** 结束日期（含），'YYYY-MM-DD' 字符串或 Date；周报/月报/年报会折算到对应周期 */
  to?: string | Date
  /** 正文关键字过滤（包含匹配） */
  keyword?: string
  /**
   * 最多返回的份数（正整数）。设置后按周期**降序**返回最近的 limit 份，
   * 未设置时按周期升序返回全部（历史量大时注意体量）。
   */
  limit?: number
}

/** 导出选项 */
export interface ExportOptions extends QueryOptions {
  /** 要导出的报告类型，默认全部四种 */
  types?: ReportType[]
  /** 导出文件路径；默认 <storageDir>/exports/ai-report-export-<时间戳>.json */
  outputFile?: string
}

/** 导出结果 */
export interface ExportResult {
  /** 导出文件绝对路径 */
  filePath: string
  /** 导出的报告份数 */
  count: number
}

/** 恢复选项 */
export interface RestoreOptions {
  /** 目标位置已存在同名报告时是否覆盖；默认 false（跳过并计入 skipped） */
  overwrite?: boolean
}

/** 恢复结果 */
export interface RestoreResult {
  /** 实际写回的报告份数 */
  restored: number
  /** 因已存在而跳过的份数 */
  skipped: number
}
