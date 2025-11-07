import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { LogType } from "../entities/script-task-log.entity";

export class GetTaskExecLogDto {
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @IsOptional()
  @IsString()
  recordId?: string;
}

export interface TaskExecLogDto {
  recordId: string;
  deviceId: string;
  taskId?: string;
  logText: string;
  logType: LogType;
}