import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { TaskExecLogService } from "../task-exec-log/task-exec-log.service";
import { Logger } from "../../logger/logger";

@Injectable()
export class CronMainService {
  private readonly logger = new Logger('ScheduleMainSvc');
  constructor(
    private readonly taskExecLogSvc: TaskExecLogService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async doSomething(): Promise<void> {
    this.logger.info(`doSomething`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async cleanTaskLog(): Promise<void> {
    this.logger.info('auto clean task exec log start.')
    const count = await this.taskExecLogSvc.autoCleanExecLog();
    this.logger.info('auto clean task exec log end, del count: %d', count);
  }

}