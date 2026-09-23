import * as assert from 'node:assert/strict'
import { test, beforeEach, afterEach } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { ReportManager } from '../src/core'
import { ReportExistsError, ReportNotFoundError, ValidationError } from '../src/core/errors'
import { isoWeek, resolveStorageDir } from '../src/core/paths'

let storageDir: string
let manager: ReportManager

beforeEach(async () => {
  storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-report-test-'))
  manager = new ReportManager({ storageDir })
})

afterEach(async () => {
  await fs.rm(storageDir, { recursive: true, force: true })
})

// ---------- ISO 周号基础正确性 ----------

test('isoWeek: 2026-09-21（周一）属于 2026 年第 39 周', () => {
  assert.deepEqual(isoWeek(new Date(2026, 8, 21)), { year: 2026, week: 39 })
})

test('isoWeek: 2027-01-01（周五）归属上一年的 2026-W53', () => {
  assert.deepEqual(isoWeek(new Date(2027, 0, 1)), { year: 2026, week: 53 })
})

test('isoWeek: 2026-01-01（周四）为 2026-W01', () => {
  assert.deepEqual(isoWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 })
})

// ---------- 创建 ----------

test('create: 日报落盘到 daily/2026/09/21.txt 且内容可回读', async () => {
  const report = await manager.create('daily', '2026-09-21', '今天完成了报告工具的开发')
  assert.equal(report.period, '2026-09-21')
  const filePath = path.join(storageDir, 'daily', '2026', '09', '21.txt')
  const text = await fs.readFile(filePath, 'utf-8')
  assert.ok(text.includes('type: daily'))
  assert.ok(text.includes('period: 2026-09-21'))
  assert.ok(text.endsWith('---\n今天完成了报告工具的开发'))
})

test('create: 周报落盘到 weekly/2026/W39.txt（ISO 周一为起点）', async () => {
  const report = await manager.create('weekly', '2026-09-21', '本周迭代总结')
  assert.equal(report.period, '2026-W39')
  await assert.ok(
    fs.access(path.join(storageDir, 'weekly', '2026', 'W39.txt')).then(
      () => true,
      () => false,
    ),
  )
})

test('create: 月报落盘到 monthly/2026/09.txt，年报落盘到 yearly/2026.txt', async () => {
  await manager.create('monthly', '2026-09-21', '九月月报')
  await manager.create('yearly', '2026-09-21', '二〇二六年报')
  await fs.access(path.join(storageDir, 'monthly', '2026', '09.txt'))
  await fs.access(path.join(storageDir, 'yearly', '2026.txt'))
})

test('create: 同一周期重复创建抛 ReportExistsError，不同周期不受影响', async () => {
  await manager.create('daily', '2026-09-21', 'v1')
  await manager.create('daily', '2026-09-22', 'v2') // 另一天，正常创建
  await assert.rejects(manager.create('daily', '2026-09-21', 'again'), ReportExistsError)
})

// ---------- 获取 ----------

test('get: 不存在返回 null，存在返回完整报告', async () => {
  assert.equal(await manager.get('daily', '2026-01-01'), null)
  await manager.create('daily', '2026-01-01', '元旦值班')
  const report = await manager.get('daily', '2026-01-01')
  assert.ok(report)
  assert.equal(report.content, '元旦值班')
  assert.equal(report.period, '2026-01-01')
})

test('get: 缺省日期取当前周期（今天/本周/本月/本年）', async () => {
  await manager.create('daily', new Date(), '今日份日报')
  const today = await manager.getToday()
  assert.ok(today)
  assert.equal(today.content, '今日份日报')

  await manager.create('weekly', new Date(), '本周份周报')
  assert.equal((await manager.getThisWeek())?.content, '本周份周报')

  await manager.create('monthly', new Date(), '本月份月报')
  assert.equal((await manager.getThisMonth())?.content, '本月份月报')

  await manager.create('yearly', new Date(), '本年份年报')
  assert.equal((await manager.getThisYear())?.content, '本年份年报')
})

// ---------- 修改 ----------

test('update: 覆盖正文并刷新 updatedAt', async () => {
  const created = await manager.create('daily', '2026-09-21', '初稿')
  await new Promise((resolve) => setTimeout(resolve, 5)) // 保证时间戳推进
  const updated = await manager.update('daily', '2026-09-21', '终稿')
  assert.equal(updated.content, '终稿')
  assert.equal(updated.createdAt, created.createdAt)
  assert.ok(updated.updatedAt > created.updatedAt)
  assert.equal((await manager.get('daily', '2026-09-21'))?.content, '终稿')
})

test('update: 不存在抛 ReportNotFoundError', async () => {
  await assert.rejects(manager.update('daily', '2026-01-01', 'x'), ReportNotFoundError)
})

// ---------- 删除 ----------

test('delete: 删除后文件消失，再次删除返回 false', async () => {
  await manager.create('daily', '2026-09-21', '待删除')
  assert.equal(await manager.delete('daily', '2026-09-21'), true)
  assert.equal(await manager.get('daily', '2026-09-21'), null)
  assert.equal(await manager.delete('daily', '2026-09-21'), false)
})

// ---------- 查询 ----------

test('query: 按周期升序列出，支持 from/to 与 keyword', async () => {
  await manager.create('daily', '2026-09-19', '周六：处理线上告警')
  await manager.create('daily', '2026-09-21', '周一：核心库开发')
  await manager.create('daily', '2026-09-20', '周日：梳理需求')

  const all = await manager.query('daily')
  assert.deepEqual(
    all.map((r) => r.period),
    ['2026-09-19', '2026-09-20', '2026-09-21'],
  )

  const ranged = await manager.query('daily', { from: '2026-09-20', to: '2026-09-20' })
  assert.deepEqual(
    ranged.map((r) => r.period),
    ['2026-09-20'],
  )

  const hit = await manager.query('daily', { keyword: '告警' })
  assert.deepEqual(
    hit.map((r) => r.period),
    ['2026-09-19'],
  )

  assert.deepEqual(await manager.query('weekly'), []) // 尚无周报
})

test('query: 周报区间过滤按所属周折算', async () => {
  await manager.create('weekly', '2026-09-14', 'W38 周报') // 2026-W38
  await manager.create('weekly', '2026-09-21', 'W39 周报') // 2026-W39
  const ranged = await manager.query('weekly', { from: '2026-09-21', to: '2026-09-25' })
  assert.deepEqual(
    ranged.map((r) => r.period),
    ['2026-W39'],
  )
})

test('query: limit 取最近的 N 份且保持升序，非法 limit 被拒绝', async () => {
  for (let d = 18; d <= 22; d++) {
    await manager.create('daily', `2026-09-${d}`, `D${d}`)
  }
  const latest3 = await manager.query('daily', { limit: 3 })
  assert.deepEqual(
    latest3.map((r) => r.period),
    ['2026-09-20', '2026-09-21', '2026-09-22'], // 最近的 3 份（20/21/22），升序
  )
  const all = await manager.query('daily')
  assert.deepEqual(
    all.map((r) => r.period),
    ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'],
  )
  await assert.rejects(manager.query('daily', { limit: 0 }), ValidationError)
  await assert.rejects(manager.query('daily', { limit: 1.5 }), ValidationError)
})

// ---------- 导出 / 恢复（闭环） ----------

test('export + restore: 单文件导出，删除后可完整恢复', async () => {
  await manager.create('daily', '2026-09-21', '日报正文，含特殊字符\n---\n第二行')
  await manager.create('weekly', '2026-09-21', '周报正文')
  await manager.create('monthly', '2026-09-10', '月报正文')
  await manager.create('yearly', '2026-03-01', '年报正文')

  const exported = await manager.export()
  assert.equal(exported.count, 4)
  const bundle = JSON.parse(await fs.readFile(exported.filePath, 'utf-8'))
  assert.equal(bundle.version, 1)
  assert.equal(bundle.reports.length, 4)

  // 全部删除后恢复，内容逐字节一致
  await manager.delete('daily', '2026-09-21')
  await manager.delete('weekly', '2026-09-21')
  await manager.delete('monthly', '2026-09-10')
  await manager.delete('yearly', '2026-03-01')
  assert.equal((await manager.query('daily')).length, 0)
  assert.equal((await manager.query('weekly')).length, 0)
  assert.equal((await manager.query('monthly')).length, 0)
  assert.equal((await manager.query('yearly')).length, 0)

  const result = await manager.restore(exported.filePath)
  assert.equal(result.restored, 4)
  assert.equal(result.skipped, 0)

  const daily = await manager.get('daily', '2026-09-21')
  assert.equal(daily?.content, '日报正文，含特殊字符\n---\n第二行')
  assert.equal((await manager.get('weekly', '2026-09-21'))?.content, '周报正文')
  assert.equal((await manager.get('monthly', '2026-09-10'))?.content, '月报正文')
  assert.equal((await manager.get('yearly', '2026-03-01'))?.content, '年报正文')
})

test('restore: 已存在的报告默认跳过，overwrite 时覆盖', async () => {
  await manager.create('daily', '2026-09-21', '原始版本')
  const exported = await manager.export()

  await manager.update('daily', '2026-09-21', '修改版本')
  const skipped = await manager.restore(exported.filePath)
  assert.deepEqual(skipped, { restored: 0, skipped: 1 })
  assert.equal((await manager.get('daily', '2026-09-21'))?.content, '修改版本')

  const overwritten = await manager.restore(exported.filePath, { overwrite: true })
  assert.deepEqual(overwritten, { restored: 1, skipped: 0 })
  assert.equal((await manager.get('daily', '2026-09-21'))?.content, '原始版本')
})

test('export: types 与 outputFile 可自定义', async () => {
  await manager.create('daily', '2026-09-21', '日报')
  await manager.create('yearly', '2026-03-01', '年报')
  const outputFile = path.join(storageDir, 'custom-export.json')
  const result = await manager.export({ types: ['daily'], outputFile })
  assert.equal(result.count, 1)
  assert.equal(result.filePath, outputFile)
})

// ---------- 参数校验 / 安全 ----------

test('非法类型被拒绝', async () => {
  await assert.rejects(
    manager.create('hourly' as never, '2026-09-21', 'x'),
    ValidationError,
  )
})

test('非法日期被拒绝（格式错误、不存在的日历日、路径穿越尝试）', async () => {
  await assert.rejects(manager.create('daily', '2026/09/21', 'x'), ValidationError)
  await assert.rejects(manager.create('daily', '2026-9-1', 'x'), ValidationError)
  await assert.rejects(manager.create('daily', '2026-02-30', 'x'), ValidationError)
  await assert.rejects(manager.create('daily', '../../etc/passwd', 'x'), ValidationError)
})

test('非法 content 类型被拒绝', async () => {
  await assert.rejects(
    manager.create('daily', '2026-09-21', 123 as never),
    ValidationError,
  )
})

test('restore: 恢复文件不存在 / 结构非法时明确报错且不写盘', async () => {
  await assert.rejects(manager.restore(path.join(storageDir, 'nope.json')), ValidationError)

  const badFile = path.join(storageDir, 'bad.json')
  await fs.writeFile(badFile, '{"version": 1, "reports": [{"type": "daily"}]}', 'utf-8')
  await assert.rejects(manager.restore(badFile), ValidationError)

  // 脏数据校验：period 带路径穿越
  const evilFile = path.join(storageDir, 'evil.json')
  await fs.writeFile(
    evilFile,
    JSON.stringify({
      version: 1,
      reports: [
        {
          type: 'daily',
          period: '../../evil',
          content: 'x',
          createdAt: '2026-09-21T00:00:00.000Z',
          updatedAt: '2026-09-21T00:00:00.000Z',
        },
      ],
    }),
    'utf-8',
  )
  await assert.rejects(manager.restore(evilFile), ValidationError)
})

test('默认存储目录为 ~/.ai-report-tool（跨平台）', () => {
  const defaultManager = new ReportManager()
  assert.equal(defaultManager.storageDir, resolveStorageDir())
  assert.ok(defaultManager.storageDir.includes('.ai-report-tool'))
})

test('存储目录直接人工放非报告 txt，query 会跳过而不崩溃', async () => {
  await manager.create('daily', '2026-09-21', '真报告')
  await fs.mkdir(path.join(storageDir, 'daily', '2026', '09'), { recursive: true })
  await fs.writeFile(path.join(storageDir, 'daily', '2026', '09', '20.txt'), '随手笔记', 'utf-8')
  const reports = await manager.query('daily')
  assert.equal(reports.length, 1)
  assert.equal(reports[0].content, '真报告')
})
