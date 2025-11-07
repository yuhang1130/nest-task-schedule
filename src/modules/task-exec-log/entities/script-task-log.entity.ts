import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../database/baseEntities/base";
import { ObjectId } from "mongodb";

export enum LogType {
  INFO='info',
  ERROR='error',
  SUCCESS='success',
  WARN='warn',
  SYSTEM='system',
  SYSTEM_ERROR='system_error'
}

@Entity({name: 'ScriptTaskLog', comment: "脚本任务日志表"})
export class ScriptTaskLogEntity extends BaseEntity {
  @Column({comment: "任务Id"})
  taskId: ObjectId;

  @Column({comment: "执行记录Id"})
  recordId: ObjectId;

  @Column({ type: 'string', comment: "设备Id"})
  deviceId: string;

  @Column({ type: 'string', comment: "日志内容" })
  logText: string;

  @Column({ type: 'enum', enum: LogType, comment: "日志类型"})
  logType: LogType = LogType.INFO;

  @Column({ type: 'number', comment: '任务开始执行时间戳:秒级' })
  executeAt: number;
}