import { Module } from "@nestjs/common";
import { PulsarSettingsProvider } from "./pulsar/provider/pulsar-settings.provider";
import { PulsarService } from "./pulsar/pulsar.service";
import { PulsarMessageService } from "./pulsar-message-service";
import { ScriptTaskModule } from "../modules/script-task/script-task.module";
import { TaskExecLogModule } from "../modules/task-exec-log/task-exec-log.modules";

@Module({
  imports: [ScriptTaskModule, TaskExecLogModule],
  providers: [PulsarSettingsProvider, PulsarService, PulsarMessageService],
  exports: [PulsarSettingsProvider]
})
export class MQModule{}