import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsPositive, IsString } from "class-validator";
import { IsUnixTimestamp } from "../../utils/decorator";
import { BaseListDto } from "../../common/common.dto";
import { Transform } from "class-transformer";
import { TransStr2Number } from "../../common/common-transform";

export class ScriptTaskCreateDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string; // sn

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileUrls?: string[];

  @IsString()
  @IsNotEmpty()
  scriptCode: string;

  @IsOptional()
	@Transform(TransStr2Number)
  @IsNumber()
  @IsPositive()
  @IsUnixTimestamp({ message: '期望执行时间必须是有效的秒级时间戳' })
  expectedExecTime?: number; // 期望执行时间戳，单位秒（客户创建的）

  @IsOptional()
  @IsBoolean()
  isRetry?: boolean; // 是否重试

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @IsUnixTimestamp({ message: '任务等待超时时间必须是有效的秒级时间戳' })
  waitTimeoutUnix?: number; // 任务等待超时时间戳，单位秒（客户创建的）

   @IsOptional()
  @IsNumber()
  @IsPositive()
  @IsUnixTimestamp({ message: '任务执行执行超时时间必须是有效的秒级时间戳' })
  execTimeoutUnix?: number; // 期望执行时间戳，单位秒（客户创建的）
}

export class ScriptTaskListDto extends BaseListDto {
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class TaskCancelDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}


export class UpdateTaskFailDto {
  recordId: string;
  reason: string;
}