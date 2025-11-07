import { Column, Entity, ObjectIdColumn } from "typeorm";
import { BaseEntity } from "../../../database/baseEntities/base";
import { ObjectId } from "mongodb";

export enum RecordStatus {
  Running = 'running', // 运行中
  Success = 'success', // 成功
  Failed = 'failed', // 失败
  Canceled = 'canceled', // 取消
}

@Entity({name: 'ScriptTaskExecRecord', comment: "执行结果快照表"})
export class ScriptTaskExecRecordEntity extends BaseEntity {
  @Column({ comment: '任务Id' })
  taskId: ObjectId;

  @Column({type: 'string', comment: "设备Id"})
  deviceId: string;

  @Column({type: 'number', comment: "设备锁的值"})
  deviceLockValue: number;

  @Column({enum: RecordStatus, comment: "执行结果" })
  status: RecordStatus;

  @Column({type: 'number', comment: "执行结束时间"})
  finishTime: number;

  @Column({type: 'string', comment: "执行失败原因" })
  failReason: string;

  @Column({ type: 'number', comment: "任务执行超时时间戳：秒" })
  execTimeoutUnix: number; // 任务执行超时时间戳：秒
}