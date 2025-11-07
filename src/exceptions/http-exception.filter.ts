import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Logger } from '../logger/logger';
import { CustomException } from '../exceptions/custom.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  
  catch(exception: CustomException | any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const method = req.method;
    const path = req.path;

    let code = 500;
    let message = '';
    let status = HttpStatus.OK;
    let logMsg = `${method} ${path}: `;
    if (exception instanceof CustomException) {
      message = exception.message;
      code = exception.code;
      logMsg += `${this.getStackMsg(exception)}`;
    } else if (exception instanceof HttpException) {
      const response = exception?.getResponse() as any;
      if (exception instanceof NotFoundException) {
        status = exception.getStatus() || HttpStatus.OK;
        code = response?.statusCode || 404;
        message = exception.message || 'Internal Server Error';
        logMsg += `${response?.message} ${response?.error}`;
      } else if (exception instanceof BadRequestException) {
        status = exception.getStatus() || HttpStatus.OK;
        code = response?.statusCode || 400;
        message = exception.message || 'Internal Server Error';
        logMsg += `${response?.message}: ${response?.error}`;
      } else {
        code = response?.code || 500;
        message = message || response?.message || exception?.message || 'Unknown Error';
        status = exception.getStatus() || HttpStatus.OK;
        logMsg += `${this.getStackMsg(exception)}`;
      }
    } else {
      message = exception.message || 'Internal Server Error';
      logMsg += `${this.getStackMsg(exception)}`;
    }
    this.logger.error(logMsg);
    res.status(status).json({
      code,
      message,
    });
  }

  private getStackMsg(exception: any) {
    return (exception as any)?.stack || '';
  }
}
