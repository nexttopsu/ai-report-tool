import { Report } from './types'

/**
 * txt 存储格式：人类可读的键值头 + '---' 分隔行 + 正文原样保留。
 *
 *   type: daily
 *   period: 2026-09-21
 *   createdAt: 2026-09-21T03:30:00.000Z
 *   updatedAt: 2026-09-21T03:30:00.000Z
 *   ---
 *   正文内容……
 *
 * 只按第一处换行后的 '---' 分隔，正文中再出现 '---' 也不影响解析。
 */
const SEPARATOR = '\n---\n'
const REQUIRED_FIELDS: Array<keyof Report> = ['type', 'period', 'createdAt', 'updatedAt']

/** Report → txt 文本 */
export function serializeReport(report: Report): string {
  const header = [
    `type: ${report.type}`,
    `period: ${report.period}`,
    `createdAt: ${report.createdAt}`,
    `updatedAt: ${report.updatedAt}`,
  ].join('\n')
  return `${header}${SEPARATOR}${report.content}`
}

/** txt 文本 → Report；格式损坏时抛错（含错误信息说明缺什么） */
export function deserializeReport(text: string): Report {
  const separatorIndex = text.indexOf(SEPARATOR)
  if (separatorIndex === -1) {
    throw new Error('报告文件格式损坏：缺少 --- 分隔行')
  }
  const meta: Record<string, string> = {}
  for (const line of text.slice(0, separatorIndex).split('\n')) {
    const idx = line.indexOf(': ')
    if (idx > 0) meta[line.slice(0, idx)] = line.slice(idx + 2)
  }
  for (const field of REQUIRED_FIELDS) {
    if (!meta[field as string]) {
      throw new Error(`报告文件格式损坏：缺少 ${field} 字段`)
    }
  }
  return {
    type: meta.type as Report['type'],
    period: meta.period,
    content: text.slice(separatorIndex + SEPARATOR.length),
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  }
}
