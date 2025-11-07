import { NestFactory } from "@nestjs/core";
import cluster from "cluster";
import { SendScriptMainModule } from "../modules/send-script-main/send-script-main.module";
import { SendScriptMasterService } from "../modules/send-script-main/send-script-master.service";
import { SendScriptWorkerService } from "../modules/send-script-main/send-script-worker.service";

async function bootstrap() {
  if (cluster.isPrimary) {
    const app = await NestFactory.create(SendScriptMainModule);
    app.enableShutdownHooks();

    const service = app.get(SendScriptMasterService);
    await service.Init();
    await app.listen(process.env.PORT || 8092);
  } else {
    const appWorker = await NestFactory.createApplicationContext(SendScriptMainModule);
    appWorker.enableShutdownHooks();

    const service = appWorker.get(SendScriptWorkerService);
    await service.Init();
  }
}
bootstrap();
