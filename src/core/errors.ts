/** 参数校验失败（类型/日期/内容不合法，含路径穿越尝试） */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** 目标周期已存在同名报告（create 撞重复时抛出） */
export class ReportExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportExistsError'
  }
}

/** 目标周期不存在报告（update 一个不存在的报告时抛出） */
export class ReportNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportNotFoundError'
  }
}
