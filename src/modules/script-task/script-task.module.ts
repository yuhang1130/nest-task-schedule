import { Module } from "@nestjs/common";
import { ScriptTaskController } from "./script-task.controller";
import { ScriptTaskService } from "./script-task.service";
import { CentralControlApiModule } from "../central-control-api/central-control-api.module";
import { DatabaseModule } from "../../database/database.module";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CentralControlApiModule
  ],
  controllers: [ScriptTaskController],
  providers: [ScriptTaskService],
  exports: [ScriptTaskService],
})
export class ScriptTaskModule {}
