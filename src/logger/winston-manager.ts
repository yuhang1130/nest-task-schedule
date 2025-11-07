import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { getFileConfig } from "./log-config";

// Winston 实例管理器
export class WinstonManager {
  private static instance: WinstonManager;
  private winstonLogger: winston.Logger | null = null;

  static getInstance(): WinstonManager {
    if (!WinstonManager.instance) {
      WinstonManager.instance = new WinstonManager();
    }
    return WinstonManager.instance;
  }

  getLogger(): winston.Logger | null {
    const fileConfig = getFileConfig();
    if (!fileConfig.enabled) {
      return null;
    }

    if (!this.winstonLogger) {
      this.createWinstonLogger();
    }
    return this.winstonLogger;
  }

  private createWinstonLogger() {
    const fileConfig = getFileConfig();
    const transports: winston.transport[] = [];

    if (fileConfig.enabled) {
      // 配置按日期轮转的文件传输
      const fileTransport = new DailyRotateFile({
        filename: `${fileConfig.logDir}/${fileConfig.fileName}-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxSize: `${Math.floor(fileConfig.maxFileSize / 1024 / 1024)}m`, // 转换为 MB
        maxFiles: `${fileConfig.maxRetentionDays}d`,
        createSymlink: false,
        symlinkName: undefined,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          winston.format.uncolorize(), // 确保文件输出没有颜色代码
          winston.format.printf(({ timestamp, level, message, module, requestId, pid }) => {
            const pidStr = pid ? `[${pid}]` : '';
            const moduleStr = module ? `[${module}]` : '';
            const requestIdStr = requestId ? `[${requestId}]` : '';
            const levelStr = `[${level.toUpperCase()}]`;
            return `${pidStr}${levelStr}[${timestamp}]${moduleStr}${requestIdStr} ${message}`;
          })
        )
      });

      transports.push(fileTransport);
    }

    this.winstonLogger = winston.createLogger({
      level: 'debug',
      transports,
      exitOnError: false,
    });
  }

  recreateLogger() {
    if (this.winstonLogger) {
      this.winstonLogger.destroy();
      this.winstonLogger = null;
    }
    const fileConfig = getFileConfig();
    if (fileConfig.enabled) {
      this.createWinstonLogger();
    }
  }

  destroy() {
    if (this.winstonLogger) {
      this.winstonLogger.destroy();
      this.winstonLogger = null;
    }
  }
}