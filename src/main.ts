import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { NextFunction, Request, Response } from "express";
import compression from "compression";
import helmet from "helmet";
import bodyParser from "body-parser";
import { ValidationPipe } from "@nestjs/common";
import { TransformInterceptor } from "./interceptor/transform/transform.interceptor";
import { Logger } from "./logger/logger";
import InitTracingWithProvider from "./trace";
import { isLocal } from "./config";
import { AllExceptionsFilter } from "./exceptions/http-exception.filter";

async function bootstrap(): Promise<void> {
  InitTracingWithProvider()
  const app = await NestFactory.create(AppModule, {});
  app.enableShutdownHooks();
  if (isLocal) {
		app.enableCors(); // tips: 网关开了允许跨域，这里开了会重复两个*
	}
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(10 * 60e3);
    next();
  });
  app.use(compression());
  app.use(helmet());
  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
  const configService = app.get(ConfigService);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      validationError: { target: false },
    }),
  );
  const port = configService.get("port") || 8090;
  await app.listen(port).then(() => {
    const logger = new Logger(AppModule.name);
    logger.info(`Server Start: http://localhost:${port}`);
  });
}
bootstrap().then();
