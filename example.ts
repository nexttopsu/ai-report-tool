/**
 * API 全量演示脚本：逐个调用 ReportManager 的全部公开 API 并打印结果。
 *
 * 运行：npm run example
 *
 * 使用系统临时目录（每次运行自动创建、结束后自动清理），
 * 不会读写默认存储目录 ~/.ai-report-tool 下的任何真实数据。
 */
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ReportManager,
  ReportExistsError,
  ReportNotFoundError,
  ValidationError,
  type Report,
} from './src'

let passed = 0
let failed = 0

/** 打印单步结果并计数 */
function step(name: string, ok: boolean, detail?: string): void {
  const mark = ok ? 'PASS' : 'FAIL'
  passed += ok ? 1 : 0
  failed += ok ? 0 : 1
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 断言辅助：期望 fn 抛出指定错误类型 */
async function expectError(
  name: string,
  errorClass: new (...args: string[]) => Error,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn()
    step(name, false, '未按预期抛出错误')
  } catch (err) {
    const ok = err instanceof errorClass
    step(name, ok, ok ? (err as Error).message : `抛出了意外的错误类型: ${String(err)}`)
  }
}

function show(report: Report | null): string {
  return report ? `${report.type}/${report.period}（更新于 ${report.updatedAt}）` : 'null'
}

async function main(): Promise<void> {
  // 隔离的临时存储目录，结束后清理
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-report-example-'))
  const manager = new ReportManager({ storageDir })
  console.log(`存储目录: ${storageDir}\n`)

  const today = new Date()

  // ---------- 1. create：创建四种类型的报告 ----------
  console.log('--- create ---')
  const daily = await manager.create('daily', today, '完成日报示例：编写 API 演示脚本')
  step('create daily', daily.period !== '')
  const weekly = await manager.create('weekly', today, '本周周报：完成 v0.2.0 单元测试')
  step('create weekly', weekly.period !== '')
  const monthly = await manager.create('monthly', today, '本月月报：项目脚手架搭建完成')
  step('create monthly', monthly.period !== '')
  const yearly = await manager.create('yearly', today, '本年年报：AI 报告工具从 0 到 1')
  step('create yearly', yearly.period !== '')

  // 重复创建同一周期应报错（防误覆盖）
  await expectError(
    'create 重复创建抛 ReportExistsError',
    ReportExistsError,
    () => manager.create('daily', today, '重复内容'),
  )

  // 非法参数校验
  await expectError('create 非法类型抛 ValidationError', ValidationError, () =>
    manager.create('quarterly' as never, today, '内容'),
  )
  await expectError('create 非法日期抛 ValidationError', ValidationError, () =>
    manager.create('daily', 'not-a-date', '内容'),
  )

  // ---------- 2. get：获取与快捷方法 ----------
  console.log('\n--- get ---')
  const got = await manager.get('daily', today)
  step('get daily', got !== null && got.content.includes('日报'), show(got))
  const missing = await manager.get('daily', '2000-01-01')
  step('get 不存在的周期返回 null', missing === null, show(missing))
  step('getToday', (await manager.getToday())?.type === 'daily')
  step('getThisWeek', (await manager.getThisWeek())?.type === 'weekly')
  step('getThisMonth', (await manager.getThisMonth())?.type === 'monthly')
  step('getThisYear', (await manager.getThisYear())?.type === 'yearly')

  // ---------- 3. update：修改已存在报告 ----------
  console.log('\n--- update ---')
  const updated = await manager.update('daily', today, '完成日报示例：追加导出/恢复验证')
  step(
    'update daily 刷新内容与 updatedAt',
    updated.content.includes('恢复') && updated.updatedAt >= updated.createdAt,
    show(updated),
  )
  await expectError(
    'update 不存在的报告抛 ReportNotFoundError',
    ReportNotFoundError,
    () => manager.update('daily', '2000-01-01', '内容'),
  )

  // ---------- 4. delete：删除报告 ----------
  console.log('\n--- delete ---')
  step('delete 已存在报告返回 true', (await manager.delete('yearly', today)) === true)
  step('delete 不存在报告返回 false', (await manager.delete('yearly', today)) === false)

  // ---------- 5. query：按类型 / 区间 / 关键字查询 ----------
  console.log('\n--- query ---')
  // 造一些历史数据便于观察过滤效果
  await manager.create('daily', '2026-09-18', '9月18日：需求评审')
  await manager.create('daily', '2026-09-19', '9月19日：接口联调')
  const allDaily = await manager.query('daily')
  step('query daily 全量', allDaily.length === 3, `共 ${allDaily.length} 条`)
  const ranged = await manager.query('daily', { from: '2026-09-19' })
  step('query from 区间过滤', ranged.length === 2 && ranged.every((r) => r.period >= '2026-09-19'))
  const hit = await manager.query('daily', { keyword: '联调' })
  step('query keyword 过滤', hit.length === 1 && hit[0].content.includes('联调'))
  const empty = await manager.query('daily', { keyword: '不存在的关键字' })
  step('query 无命中返回空数组', empty.length === 0)

  // ---------- 6. export / restore：导出与恢复 ----------
  console.log('\n--- export / restore ---')
  // 此时存储中共 5 条：daily×3 + weekly×1 + monthly×1（yearly 已删除）
  const exported = await manager.export()
  step(
    'export 默认导出全部类型',
    exported.count === 5,
    `写入 ${exported.count} 条 → ${path.basename(exported.filePath)}`,
  )

  // 用一个全新的空目录模拟“新机器恢复”
  const restoreDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-report-restore-'))
  const restored = new ReportManager({ storageDir: restoreDir })
  const result1 = await restored.restore(exported.filePath)
  step(
    'restore 到空目录全部恢复',
    result1.restored === 5 && result1.skipped === 0,
    `restored=${result1.restored}, skipped=${result1.skipped}`,
  )
  const result2 = await restored.restore(exported.filePath)
  step(
    'restore 默认跳过已存在',
    result2.restored === 0 && result2.skipped === 5,
    `restored=${result2.restored}, skipped=${result2.skipped}`,
  )
  const result3 = await restored.restore(exported.filePath, { overwrite: true })
  step(
    'restore overwrite 覆盖已存在',
    result3.restored === 5 && result3.skipped === 0,
    `restored=${result3.restored}, skipped=${result3.skipped}`,
  )
  await expectError('restore 文件不存在抛 ValidationError', ValidationError, () =>
    restored.restore(path.join(restoreDir, 'no-such-file.json')),
  )
  await expectError('restore 非法 JSON 抛 ValidationError', ValidationError, async () => {
    const badFile = path.join(restoreDir, 'bad.json')
    await fs.writeFile(badFile, '{oops', 'utf-8')
    await restored.restore(badFile)
  })
  await fs.rm(restoreDir, { recursive: true, force: true })

  // ---------- 汇总 ----------
  console.log(`\n===== 汇总: ${passed} 项通过, ${failed} 项失败 =====`)

  // 清理临时目录
  await fs.rm(storageDir, { recursive: true, force: true })
  console.log('临时存储目录已清理。')

  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('示例脚本执行异常:', err)
  process.exitCode = 1
})
