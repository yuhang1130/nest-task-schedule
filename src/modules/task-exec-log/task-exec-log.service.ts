import { Injectable } from "@nestjs/common";
import { Logger } from "../../logger/logger";
import { MongoService } from "../../database/mongo";
import { GetTaskExecLogDto, TaskExecLogDto } from "./dto/task-exec-log.dto";
import { ScriptTaskLogEntity } from "./entities/script-task-log.entity";
import { ObjectId } from "mongodb";
import { ScriptTaskService } from "../script-task/script-task.service";
import { ScriptTaskExecRecordEntity } from "../script-task/entities/task-exec-record.entity";
import dayjs from "dayjs";
import { ConfigService } from "@nestjs/config";
import { FindManyOptions } from "typeorm";
import _ from "lodash";

@Injectable()
export class TaskExecLogService {
  private readonly logger = new Logger('TaskExecLogSvc');

  constructor(
    private readonly mongo: MongoService,
    private readonly scriptTaskSvc: ScriptTaskService,
    private readonly configSvc: ConfigService,
  ) {}

  async batchAddLogs(logs: TaskExecLogDto[]) {
    if (!logs.length) {
      return;
    }
    const allRecordIds = _.uniq(logs.map(it => it.recordId));
    const records = await this.scriptTaskSvc.getExecRecordByIds(allRecordIds, ['_id', 'taskId', 'createdAt']);
    const recordId2TaskMap = records.map(it => [it._id, it]);
    const now = dayjs().unix();
    const entities: ScriptTaskLogEntity[] = logs.map(it => {
      const { taskId, recordId, logText, logType, deviceId } = it;
      const record = recordId2TaskMap[recordId];
      const entity =  new ScriptTaskLogEntity();
      entity.deviceId = deviceId;
      entity.taskId = new ObjectId(taskId ? taskId : (record?.createdAt || ''));
      entity.executeAt = record?.createdAt || now;
      entity.recordId = new ObjectId(recordId);
      entity.logType = logType;
      entity.logText = logText || '';
      return entity;
    });
    await this.mongo.batchSave(ScriptTaskLogEntity, entities);
  }

  // 传了 recordId 的情况查对应记录的执行日志，没传的情况查最新的执行记录的日志
  async getLogs(data: GetTaskExecLogDto): Promise<ScriptTaskLogEntity[]> {
    const { taskId } = data;
    const taskObjectId = new ObjectId(taskId);
    let recordId = data.recordId;
    if (!recordId) {
      const record = await this.mongo.find(ScriptTaskExecRecordEntity, {
        where: {
          taskId: taskObjectId
        },
        select: ['_id'],
        order: { _id: 'DESC' },
        take: 1,
      });
      recordId = record[0]?._id?.toString();
    }
    const options: FindManyOptions<ScriptTaskLogEntity> = {
      where: {
        taskId: taskObjectId,
      ...(recordId && { recordId: new ObjectId(recordId) }),
      },
      select: ['_id', 'taskId', 'recordId', 'deviceId', 'logText', 'logType', 'createdAt'],
      order: { '_id': 'ASC' },
      take: 999
    }
    return this.mongo.find(ScriptTaskLogEntity, options);
  }

  // FIXME: 创建 executeAt 的索引
  async autoCleanExecLog(): Promise<number> {
    const days = (this.configSvc.get('logFileConfig')?.maxRetentionDays || 7) + 1;
    const deleteTime = dayjs().subtract(days, 'day').startOf('day').unix();
    const result = await this.mongo.delete(ScriptTaskExecRecordEntity, {
      executeAt: { $lt: deleteTime }
    });
    return result.affected || 0;
  }

}