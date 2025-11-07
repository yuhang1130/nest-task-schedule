import {NestFactory} from "@nestjs/core";
import { Logger } from "../logger/logger";
import { ConfigService } from "@nestjs/config";
import { CronMainModule } from "../modules/cron-main/cron-main.module";

async function bootstrap() {
  const app = await NestFactory.create(CronMainModule, {
    logger: (+((process.env.DEBUG ?? '0')) || process.env.ENV_FLAG === 'qa')  ? ['log', 'error', 'warn', 'debug'] : ['error', 'warn']
  });
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const port = configService.get("port") || 8091;
  await app.listen(port).then(() => {
    const logger = new Logger(CronMainModule.name);
    logger.info(`Server Start: http://localhost:${port}`);
  });
}
bootstrap();
