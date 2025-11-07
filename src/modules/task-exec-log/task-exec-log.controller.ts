import { Body, Controller, Post } from "@nestjs/common";
import { TaskExecLogService } from "./task-exec-log.service";
import { GetTaskExecLogDto } from "./dto/task-exec-log.dto";
import { ScriptTaskLogEntity } from "./entities/script-task-log.entity";

@Controller("task-exec-log")
export class TaskExecLogController {
  constructor(
    private readonly taskExecLogSvc: TaskExecLogService,
  ) { }

  @Post('get-task-exec-log')
  async getTaskExecLog(@Body() data: GetTaskExecLogDto): Promise<ScriptTaskLogEntity[]> {
    return this.taskExecLogSvc.getLogs(data);
  }
}