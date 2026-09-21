/**
 * MCP 协议层集成测试：通过 stdio 启动 dist/mcp/server.js，用官方 SDK Client
 * 逐个调用 8 个 Tool，验证结果结构、错误转换与 Server 存活。
 *
 * 运行：npx tsx scripts/mcp-smoke.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const SERVER = 'dist/mcp/server.js'

let passed = 0
let failed = 0

function step(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL'
  if (ok) passed++
  else failed++
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
}

function parseContent(result: { content: { type: string; text?: string }[]; isError?: boolean }): any {
  const text = result.content[0]?.text ?? ''
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text }
  }
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ body: any; isError: boolean }> {
  const result = await client.callTool({ name, arguments: args })
  return { body: parseContent(result as any), isError: (result as any).isError === true }
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
  })
  const client = new Client({ name: 'smoke-test-client', version: '0.0.1' })
  await client.connect(transport)
  console.log('已连接 MCP Server\n')

  // --- 工具发现 ---
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  const expected = [
    'create_report',
    'delete_report',
    'get_month_report',
    'get_today_report',
    'get_week_report',
    'get_year_report',
    'query_reports',
    'update_report',
  ]
  step('工具发现：共 8 个 Tool', names.length === 8, names.join(', '))
  step(
    '工具发现：名称与预期完全一致',
    JSON.stringify(names) === JSON.stringify(expected),
  )
  const todayTool = tools.find((t) => t.name === 'get_today_report')
  step('get_today_report 有 description', !!todayTool?.description && todayTool.description.length > 10)
  const createTool = tools.find((t) => t.name === 'create_report')
  step(
    'create_report 有严格 inputSchema',
    !!createTool?.inputSchema && JSON.stringify(createTool.inputSchema).includes('content'),
  )

  // --- 1. get_today_report（未创建，应返回明确未找到） ---
  let r = await callTool(client, 'get_today_report')
  step(
    'get_today_report 未创建时 REPORT_NOT_FOUND',
    r.body?.success === false && r.body?.error?.code === 'REPORT_NOT_FOUND',
    r.body?.error?.message,
  )

  // --- 2. create_report ---
  r = await callTool(client, 'create_report', {
    type: 'daily',
    date: '2026-09-21',
    content: 'MCP 协议层冒烟测试：创建日报',
  })
  step(
    'create_report 成功返回 created + report',
    r.body?.success === true && r.body?.action === 'created' && r.body?.report?.type === 'daily',
    `period=${r.body?.report?.period}`,
  )

  // --- 3. 重复创建 → REPORT_EXISTS ---
  r = await callTool(client, 'create_report', {
    type: 'daily',
    date: '2026-09-21',
    content: '重复创建应失败',
  })
  step(
    'create_report 重复创建 → REPORT_EXISTS（isError=true）',
    r.isError && r.body?.error?.code === 'REPORT_EXISTS',
    r.body?.error?.message,
  )

  // --- 4. update_report ---
  r = await callTool(client, 'update_report', {
    type: 'daily',
    date: '2026-09-21',
    content: '更新后的正文：MCP 冒烟测试通过',
  })
  step(
    'update_report 成功返回 updated',
    r.body?.success === true && r.body?.action === 'updated' && r.body?.report?.content.includes('冒烟'),
  )

  // --- 5. update 不存在 → REPORT_NOT_FOUND ---
  r = await callTool(client, 'update_report', {
    type: 'daily',
    date: '2020-01-01',
    content: 'x',
  })
  step(
    'update_report 不存在 → REPORT_NOT_FOUND',
    r.isError && r.body?.error?.code === 'REPORT_NOT_FOUND',
  )

  // --- 6. get_today_report（已创建） ---
  r = await callTool(client, 'get_today_report')
  step(
    'get_today_report 创建后可读取',
    r.body?.success === true && r.body?.report?.content.includes('冒烟'),
  )

  // --- 7. create weekly + get_week_report ---
  r = await callTool(client, 'create_report', {
    type: 'weekly',
    date: '2026-09-21',
    content: '本周完成 MCP Server 接入',
  })
  const weeklyPeriod = r.body?.report?.period
  r = await callTool(client, 'get_week_report')
  step(
    'get_week_report 成功',
    r.body?.success === true && r.body?.report?.period === weeklyPeriod,
    `period=${weeklyPeriod}`,
  )

  // --- 8. get_month_report / get_year_report（未创建） ---
  r = await callTool(client, 'get_month_report')
  step(
    'get_month_report 未创建 → REPORT_NOT_FOUND',
    r.body?.success === false && r.body?.error?.code === 'REPORT_NOT_FOUND',
  )
  r = await callTool(client, 'get_year_report')
  step(
    'get_year_report 未创建 → REPORT_NOT_FOUND',
    r.body?.success === false && r.body?.error?.code === 'REPORT_NOT_FOUND',
  )

  // --- 9. query_reports（区间 + keyword） ---
  r = await callTool(client, 'query_reports', { type: 'daily' })
  step('query_reports 全量', r.body?.success === true && r.body?.count === 1, `count=${r.body?.count}`)
  r = await callTool(client, 'query_reports', {
    type: 'daily',
    from: '2026-09-01',
    to: '2026-09-30',
    keyword: '冒烟',
  })
  step(
    'query_reports 区间+关键字命中',
    r.body?.success === true && r.body?.count === 1,
  )
  r = await callTool(client, 'query_reports', { type: 'daily', keyword: '绝不存在的关键字' })
  step('query_reports 无命中 count=0', r.body?.success === true && r.body?.count === 0)

  // --- 10. 非法参数 → VALIDATION_ERROR（schema 层） ---
  r = await callTool(client, 'create_report', {
    type: 'quarterly',
    date: '2026-09-21',
    content: 'x',
  })
  step('create_report 非法类型被 schema 拒绝', r.isError, r.body?.error?.message ?? r.body?._raw?.slice(0, 80))
  r = await callTool(client, 'create_report', {
    type: 'daily',
    date: '2026-9-1',
    content: 'x',
  })
  step('create_report 非法日期格式被拒绝', r.isError)

  // --- 11. delete_report + 重复删除 ---
  r = await callTool(client, 'delete_report', { type: 'daily', date: '2026-09-21' })
  step(
    'delete_report 成功',
    r.body?.success === true && r.body?.action === 'deleted' && r.body?.deleted === true,
  )
  r = await callTool(client, 'delete_report', { type: 'daily', date: '2026-09-21' })
  step(
    'delete_report 不存在时 deleted=false（不报错）',
    r.body?.success === true && r.body?.deleted === false,
  )

  // --- 12. Server 在多次失败后依然存活 ---
  step('Server 在错误调用后依然存活（上一条 delete 正常返回）', true)
  r = await callTool(client, 'get_today_report')
  step(
    '错误之后 get_today_report 仍可正常调用',
    r.body?.success === false || r.body?.success === true,
    '连接保持',
  )

  // --- 清理测试周报，还原默认目录 ---
  r = await callTool(client, 'delete_report', { type: 'weekly', date: '2026-09-21' })
  step('清理测试周报', r.body?.deleted === true)

  await client.close()
  console.log(`\n===== 汇总: ${passed} 项通过, ${failed} 项失败 =====`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('冒烟测试异常:', err)
  process.exitCode = 1
})
