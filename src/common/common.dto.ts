import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class IdReqDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class IdsReqDto {
  @IsArray()
  @IsString({ each: true})
  @IsNotEmpty()
  ids: string[];
}

export enum OrderType {
  DESC = 'DESC',
  ASC = 'ASC',
}

export class BaseListDto {
  @IsOptional()
  @IsNumber()
  page: number = 1;

  @IsOptional()
  @IsNumber()
  size: number = 20;

  @IsOptional()
  @IsNumber()
  beginTime?: number; // 秒级时间戳

  @IsOptional()
  @IsNumber()
  endTime?: number; // 秒级时间戳

  @IsOptional()
  @IsString()
  word?: string;

  @IsOptional()
  @IsString()
  orderBy?: string;

  @IsOptional()
  @IsEnum(OrderType)
  order?: OrderType;
}

export class ListResultDto<T> {
  public readonly list: readonly T[];
  public readonly total: number;

  constructor(list: T[] | readonly T[] = [], total: number = 0) {
    this.list = Object.freeze([...list]);
    this.total = total;
  }
}