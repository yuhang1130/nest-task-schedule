import { config } from "../config";

export interface LogFileConfig {
  enabled: boolean; // 是否启用文件日志
  logDir: string; // 日志目录
  fileName: string; // 文件名前缀
  maxRetentionDays: number; // 保留天数
  maxFileSize: number; // 单文件最大大小（字节）
  cleanupInterval: number; // 清理检查间隔（毫秒）
}

// 从配置中获取文件日志配置
export const getFileConfig = (): LogFileConfig => {
  return config().logFileConfig;
};
