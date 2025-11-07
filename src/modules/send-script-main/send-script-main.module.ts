import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { config, getEnvFile } from "../../config";
import { DatabaseModule } from "../../database/database.module";
import { HttpModule } from "@nestjs/axios";
import { GlobalModule } from "../../global.module";
import { DeployModule } from "../deploy/deploy.module";
import { SendScriptMasterService } from "./send-script-master.service";
import { SendScriptWorkerService } from "./send-script-worker.service";
import { ScheduleModule } from "@nestjs/schedule";
import { DynamicScheduler } from "../../utils/dynamic-scheduler";
import { SendScriptHandlerService } from "./send-script-handler.service";
import { CentralControlApiModule } from "../central-control-api/central-control-api.module";
import { ScriptTaskModule } from "../script-task/script-task.module";


@Module({
  imports: [
    ConfigModule.forRoot(
    {
      envFilePath: getEnvFile(),
      load: [config],
      expandVariables: true,
    }),
    GlobalModule,
    DatabaseModule,
    DeployModule,
    ScheduleModule.forRoot(),
    CentralControlApiModule,
    ScriptTaskModule,
  ],
  providers: [
    DynamicScheduler, SendScriptMasterService, SendScriptWorkerService, SendScriptHandlerService
  ],
})

export class SendScriptMainModule { }
