import { Injectable, NestMiddleware } from "@nestjs/common";
import {
  ALSConfig,
  AlsSetRequest,
  AlsSetRequestId,
  AlsSetRequestIp,
  ASLStore,
} from "../../async-storage/async-storage";
import { nanoid } from "nanoid";
import { Request } from "express";
import { trace } from "@opentelemetry/api";



@Injectable()
export class AsyncStorageMiddleware implements NestMiddleware {
  use(req: Request, res: any, next: () => void) {
    ASLStore.run({} as ALSConfig, () => {
      const ip =
        (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || '';
      const traceId = trace.getActiveSpan()?.spanContext().traceId || '';
      AlsSetRequest(req);
      AlsSetRequestId(traceId || nanoid(20));
      AlsSetRequestIp(ip);
      next();
    });
  }
}
