
import { Body, Controller, Post } from "@nestjs/common";
import { ScriptTaskService } from "./script-task.service";
import { TaskCancelDto, ScriptTaskCreateDto, ScriptTaskListDto } from "./script-task.dto";
import { ScriptTaskEntity } from "./entities/script-task.entity";
import { IdReqDto, IdsReqDto, ListResultDto } from "../../common/common.dto";

@Controller("script-task")
export class ScriptTaskController {
  constructor(private readonly scriptTaskService: ScriptTaskService) { }
  
  @Post('create')
  async create(@Body() data: ScriptTaskCreateDto): Promise<{id: string}> {
    return await this.scriptTaskService.create(data);
  }

  @Post('info')
  async info(@Body() data: IdReqDto): Promise<ScriptTaskEntity | null> {
    return await this.scriptTaskService.info(data);
  }

  @Post('batch-info')
  async batchGetInfo(@Body() data: IdsReqDto): Promise<ScriptTaskEntity[]> {
    return await this.scriptTaskService.batchGetInfo(data);
  }

  @Post('delete')
  async delete(@Body() data: IdReqDto): Promise<boolean> {
    return await this.scriptTaskService.softDelete(data);
  }

  @Post('list')
  async list(@Body() data: ScriptTaskListDto): Promise<ListResultDto<ScriptTaskEntity>> {
    return this.scriptTaskService.list(data);
  }

  @Post('cancel')
  async cancel(@Body() data: TaskCancelDto): Promise<boolean> {
    return this.scriptTaskService.cancel(data);
  }

}
