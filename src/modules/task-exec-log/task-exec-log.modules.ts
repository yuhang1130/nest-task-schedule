import { Module } from "@nestjs/common";
import { TaskExecLogService } from "./task-exec-log.service";
import { ScriptTaskModule } from "../script-task/script-task.module";
import { TaskExecLogController } from "./task-exec-log.controller";

@Module({
  imports: [ScriptTaskModule],
  controllers: [TaskExecLogController],
  providers: [TaskExecLogService],
  exports: [TaskExecLogService],
})
export class TaskExecLogModule {}
