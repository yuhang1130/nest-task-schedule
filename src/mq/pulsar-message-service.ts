import { Injectable } from "@nestjs/common";
import { Logger } from "../logger/logger";
import { PulsarConsumer } from "./pulsar/decorators/pulsar-consumer";
import { Consumer } from "pulsar-client";
import { LogDataType, PulsarConsumerData } from "./pulsar/struct/pulsar.struct";
import { LogType } from "../modules/task-exec-log/entities/script-task-log.entity";
import dayjs from "dayjs";
import { ScriptTaskService } from "../modules/script-task/script-task.service";
import { TaskExecLogService } from "../modules/task-exec-log/task-exec-log.service";
import { TaskExecLogDto } from "../modules/task-exec-log/dto/task-exec-log.dto";
import _ from "lodash";
import { PulsarService } from "./pulsar/pulsar.service";
import { UpdateTaskFailDto } from "../modules/script-task/script-task.dto";

@Injectable()
export class PulsarMessageService {
  private readonly logger = new Logger('PulsarMsgSvc');

  constructor(
    private readonly scriptTaskSvc: ScriptTaskService,
    private readonly taskExecLogSvc: TaskExecLogService,
    private readonly pulsarService: PulsarService,
  ) { }

  @PulsarConsumer('adbnode-task-log-new', {
    batchReceive: true,
    batchSize: 20,
    isAutoAcknowledge: false,
    maxRetries: 3,
    retryDelay: 1e3,
    receiveTimeout: 10 * 1e3
  })
  async taskLogConsumer(topic: string, messages: PulsarConsumerData[], consumer: Consumer) {
    const randomId = `${topic}-${dayjs().unix()}`;
    this.logger.info(`taskLogConsumer start, Id: %s, count: %d, messages: %j`, randomId, messages.length, messages);
    if (!messages.length) {
      return;
    }
    const successMsgs: PulsarConsumerData[] = [];
    const errMsgs: PulsarConsumerData[] = [];
    for (const msg of messages) {
      const logType = msg.data?.['logType'];
      if (!logType) {
        this.logger.warn('taskLogConsumer no logType msg: %j', msg);
        continue;
      }
      if ([LogType.ERROR, LogType.SYSTEM_ERROR].includes(logType)) {
        errMsgs.push(msg);
      } else if (LogType.SUCCESS === logType) {
        successMsgs.push(msg);
      }
    }
    await Promise.all([
      this.saveLogs(messages),
      this.processErrorMessages(errMsgs),
      this.processSuccessMessages(successMsgs),
    ]);
    const ackPromises = messages.map(it => consumer.acknowledgeId(it.messageId))
    if (ackPromises.length) {
      await Promise.all(ackPromises);
    }
    this.logger.info(`taskLogConsumer end, Id: %s, finish count: %d`, randomId, ackPromises.length);
  }

  private async processSuccessMessages(messages: PulsarConsumerData[]): Promise<void> {
    const recordIds = this.getRecordByMessage(messages);
    await this.scriptTaskSvc.updateTaskSucByRecordIds(recordIds);
  }

  private async processErrorMessages(messages: PulsarConsumerData[]): Promise<void> {
    const records = this.getSetTaskFailDto(messages);
    await this.scriptTaskSvc.updateTaskFailByRecordIds(records);
  }

  private async saveLogs(messages: PulsarConsumerData[]): Promise<void> {
    const logs = this.getLogDtoByMessage(messages);
    await this.taskExecLogSvc.batchAddLogs(logs);
  }

  private getSetTaskFailDto(messages: PulsarConsumerData[]): UpdateTaskFailDto[] {
    const records: UpdateTaskFailDto[] = [];
    if (!messages?.length) {
      return records ;
    }

    for (const msg of messages) {
      const { data } = msg;
      if (_.isEmpty(data)) {
        this.logger.warn('process err message no data message, %j', msg);
        continue;
      }
      const { taskRecord, log } = data;
      if (!taskRecord) {
        this.logger.warn('process err message no recordId message, %j', msg);
        continue;
      }
      records.push({
        recordId: taskRecord,
        reason: log,
      });
    }
    return records;
  }

  private getRecordByMessage(messages: PulsarConsumerData[]): string[] {
    const recordIds: string[] = [];
    if (!messages?.length) {
      return recordIds;
    }

    for (const msg of messages) {
      const { data } = msg;
      if (_.isEmpty(data)) {
        this.logger.warn('process suc message no data message, %j', msg);
        continue;
      }
      const { taskId, taskRecord } = data;
      if (!taskId && !taskRecord) {
        this.logger.warn('process suc message no taskId and recordId message, %j', msg);
        continue;
      }
      recordIds.push(taskRecord);
    }
    return recordIds;
  }

  private getLogDtoByMessage(messages: PulsarConsumerData[]): TaskExecLogDto[] {
    const logs: TaskExecLogDto[] = [];
    if (!messages?.length) {
      return logs;
    }

    for (const msg of messages) {
      const { data } = msg;
      if (_.isEmpty(data)) {
        this.logger.warn('process err message no data message, %j', msg);
        continue;
      }

      const { logType, taskId, taskRecord, log, deviceId } = data as LogDataType;
      if (!taskId && !taskRecord) {
        this.logger.warn('process err message no taskId and recordId message, %j', msg);
        continue;
      }
      const logDto: TaskExecLogDto = {
        recordId: taskRecord,
        taskId,
        deviceId,
        logType,
        logText: log,
      }
      logs.push(logDto);
    }
    return logs;
  }
}