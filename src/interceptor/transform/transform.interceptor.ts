import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import {
  AlsGetRequest,
  AlsGetRequestId,
  AlsGetRequestIp,
} from "../../async-storage/async-storage";
import { SkipLogController } from "../../constants/system-constants";
import { Logger } from "../../logger/logger";
import { trace } from "@opentelemetry/api";

export interface Response<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>implements NestInterceptor<T, Response<T>> {
  logger = new Logger(TransformInterceptor.name);
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = AlsGetRequest();
    const requestId = AlsGetRequestId();
    const originalUrl = request.originalUrl;
    const method = request.method;
    const ip = AlsGetRequestIp();
    const controller = context.getClass().name;

    return next.handle().pipe(
      map((data) => {
        // if (!SkipLogController.includes(controller)) {
        //   this.logger.info("Response Data RequestId: %s; Request origin url: %s; IP: %s; Response data: %j", requestId, originalUrl, method, ip, data);
        // }

        // 对列表接口字段做转换
        if (data?.hasOwnProperty("page")) {
          const { items, total = 0, page = 1, size = 20 } = data || {};
          return {
            code: 0,
            message: "success",
            data: {
              list: items || [],
              page_info: {
                page,
                page_size: size,
                total_number: total,
                total_page: Math.ceil(total / size),
              },
            },
            requestId: requestId,
          };
        }

        return {
          code: 0,
          message: "success",
          data,
          requestId: requestId,
        };
      }),
    );
  }
}
