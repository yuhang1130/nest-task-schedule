import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { AsyncStorageMiddleware } from "./middleware/async-store/async-storage.middleware";
import {ConfigModule, ConfigService} from "@nestjs/config";
import { config, ConfigType, getEnvFile } from "./config";
import { DeployModule } from "./modules/deploy/deploy.module";
import { DatabaseModule } from "./database/database.module";
import { GlobalModule } from "./global.module";
import { SfNestTraceModule } from "sf-nest-trace";
import { ScriptTaskModule } from "./modules/script-task/script-task.module";
import { CustomException } from "./exceptions/custom.exception";
import { CentralControlApiModule } from "./modules/central-control-api/central-control-api.module";
import { TaskExecLogModule } from "./modules/task-exec-log/task-exec-log.modules";

@Module({
  imports: [
    GlobalModule,
    ConfigModule.forRoot(
    {
      envFilePath: getEnvFile(),
      load: [config],
      expandVariables: true,
    }),
    DatabaseModule,
    DeployModule,
    ScriptTaskModule,
    TaskExecLogModule,
    CentralControlApiModule,
    SfNestTraceModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (confSvc: ConfigService<ConfigType>) => {
        const traceConfig = confSvc.get('trace');
        if (!traceConfig) {
          throw new CustomException(1005,"Trace configuration is missing");
        }
        return traceConfig;
      },
    })
  ],
})
export class AppModule implements NestModule {
  static readonly SessionName = "nest.sid";
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AsyncStorageMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
