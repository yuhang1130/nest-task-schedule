import { Column, Entity } from "typeorm";
import { BusinessBaseEntity } from "../../../database/baseEntities/base";


/**
 * 1、下发中控的参数：
 * sn，metaData，jsScripts，callbackUrl（任务结束之后的回调地址），callbackTaskId（回调参数）
 */

export enum ScriptTaskStatus {
  Waiting = 'waiting', // 等待中
  Running = 'running', // 运行中
  Send_Success = 'send_success', // 下发脚本成功
  Success = 'success', // 脚本执行成功
  Failed = 'failed', // 失败
  Failed_Waiting_Retry = 'failed_waiting_retry', // 失败等待重试
  Canceled = 'canceled', // 手动取消
  Waiting_Timeout = 'waiting_timeout', // 等待超时
}

@Entity({name: 'ScriptTask', comment: "脚本任务表"})
export class ScriptTaskEntity extends BusinessBaseEntity {
  @Column({ type: 'string', comment: "任务状态"})
  status: ScriptTaskStatus = ScriptTaskStatus.Waiting;

  @Column({ type: 'number', comment: "任务结束时间"})
  finishTime: number;

  @Column({ type: 'string', comment: "任务失败原因" })
  failReason: string;

  @Column({ type: 'string', comment: "任务名称"})
  name: string;

  @Column({ type: 'string', comment: "设备ID"})
  deviceId: string

  @Column({ type: 'json', comment: "脚本需要的变量" })
  variables?: Record<string, any>; // 业务方自定义脚本需要的变量，会透传到脚本服务

  @Column({ type: 'array', comment: "需要上传的文件地址" })
  fileUrls?: string[]; // 如果有值,则先上传到云手机相册

  @Column({ type: 'number', comment: "期望执行时间，单位秒（客户创建的）" })
  expectedExecTime?: number; // 期望执行时间，单位秒（客户创建的）

  @Column({ type: 'number', comment: "下次执行时间，单位秒（重试的时候，根据时间间隔计算的）" })
  nextExecTime: number; // 下次执行时间，单位秒（重试的时候，根据时间间隔计算的）

  @Column({ type: 'boolean', comment: "是否重试" })
  isRetry: boolean = false; // 失败后是否重试

  @Column({ type: 'number', comment: "重试次数, 默认0" })
  retryCount: number; // 失败后重试的次数，默认3次

  @Column({ type: 'number', comment: "任务等待超时时间戳：秒" })
  waitTimeoutUnix: number; // 任务等待超时时间戳：秒

  @Column({ type: 'number', comment: "任务执行超时时间戳：秒" })
  execTimeoutUnix: number; // 任务执行超时时间戳：秒
}
