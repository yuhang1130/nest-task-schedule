import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { GlobalModule } from "../../global.module";
import { ConfigModule } from "@nestjs/config";
import { config, getEnvFile } from "../../config";
import { DeployModule } from "../deploy/deploy.module";
import { CronMainService } from "./cron-main-service";
import { TaskExecLogModule } from "../task-exec-log/task-exec-log.modules";

@Module({
  imports: [
    GlobalModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot(
    {
      envFilePath: getEnvFile(),
      load: [config],
      expandVariables: true,
    }),
    DeployModule,
    TaskExecLogModule,
  ],
  providers: [CronMainService],
})
export class CronMainModule {}