import { Injectable } from "@nestjs/common";
import _ from "lodash";
import { Logger } from "../../logger/logger";
import { ConfigService } from "@nestjs/config";
import { MongoService } from "../../database/mongo";
import { RedisService } from "../../database/redis";
import { TaskCancelDto, ScriptTaskCreateDto, ScriptTaskListDto, UpdateTaskFailDto } from "./script-task.dto";
import { ScriptTaskEntity, ScriptTaskStatus } from "./entities/script-task.entity";
import { ObjectId } from "mongodb";
import { CentralControlApiService } from "../central-control-api/central-control-api.service";
import { STATE_CODE } from "../central-control-api/central-control-api.dto";
import { CustomException } from "../../exceptions/custom.exception";
import { ScriptCodeEntity } from "./entities/script-code.entity";
import dayjs from "dayjs";
import { FilterOperators, FindManyOptions, FindOptionsWhere } from "typeorm";
import { RecordStatus, ScriptTaskExecRecordEntity } from "./entities/task-exec-record.entity";
import { MAX_RETRY_COUNT, RETRY_INTERVAL, TASK_EXEC_TIMEOUT_MINUTE } from "../../constants/task-constants";
import { IdReqDto, IdsReqDto, ListResultDto } from "../../common/common.dto";
import { getErrMsg } from "../../utils/util";

@Injectable()
export class ScriptTaskService {
  private readonly logger = new Logger(ScriptTaskService.name);
  constructor(
    private readonly mongo: MongoService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly centralControlApi: CentralControlApiService,
  ) { }
  
  private async checkSn(sn: string) {
    const deviceResp = await this.centralControlApi.deviceInfo(sn);
    if (deviceResp.code !== STATE_CODE.SUCCESS) {
      throw new CustomException(
        deviceResp.code || 400,
        deviceResp.message ||`设备【${sn}】不存在`,
      );
    }
  }

  private async checkScriptCode(scriptCode: string) {
    // try {
    //   JSON.parse(scriptCode);
    // } catch (error) {
    //   throw new CustomException(
    //     400,
    //     "脚本代码格式错误",
    //   );
    // }

    const codeByteSize = Buffer.byteLength(scriptCode, 'utf8');
    this.logger.info('codeByteSize: %d', codeByteSize)
    if (codeByteSize > 200 * 1024) {
      throw new CustomException(
        400,
        "请控制脚本大小",
      );
    }
  }

  async create(data: ScriptTaskCreateDto): Promise<{id: string}> {
    await this.checkScriptCode(data.scriptCode)
    await this.checkSn(data.deviceId);

    const taskId = new ObjectId();
    const scriptTask = new ScriptTaskEntity();
    scriptTask._id = taskId;
    scriptTask.deviceId = data.deviceId;
    scriptTask.isRetry = !!data.isRetry;
    scriptTask.retryCount = 0;
    scriptTask.status = ScriptTaskStatus.Waiting;
    scriptTask.execTimeoutUnix = data.execTimeoutUnix || dayjs().add(TASK_EXEC_TIMEOUT_MINUTE, 'minute').unix();

    if (data.waitTimeoutUnix) {
      scriptTask.waitTimeoutUnix = data.waitTimeoutUnix;
    }

    if (!_.isEmpty(data.variables)) {
      scriptTask.variables = data.variables;
    }
    if (data.fileUrls) {
      scriptTask.fileUrls = data.fileUrls;
    }
    if (data.expectedExecTime) {
      scriptTask.expectedExecTime = data.expectedExecTime;
      scriptTask.nextExecTime = data.expectedExecTime;
    } else {
      scriptTask.nextExecTime = dayjs().unix();
    }


    const scriptCode = new ScriptCodeEntity();
    scriptCode.taskId = taskId;
    scriptCode.deviceId = data.deviceId;
    scriptCode.code = data.scriptCode;

    await Promise.all([this.mongo.save(scriptTask), this.mongo.save(scriptCode)]);

    if (!data.expectedExecTime) {
      // 立即执行，放到redis队列
      await this.redis.pushScriptTask({
        taskId: scriptTask._id.toString(),
        deviceId: scriptTask.deviceId,
      });
    }

    return {
      id: taskId.toString(),
    }
  }

  /**
   * new ObjectId(data.id) === new ObjectId(data.id) // false
   * new ObjectId(data.id).equals(new ObjectId(data.id)) // true
   * new ObjectId(data.id).toString() === new ObjectId(data.id).toString() // true
   */

  async info(data: IdReqDto): Promise<ScriptTaskEntity | null> {
    const scriptTask = await this.mongo.findOneBy(ScriptTaskEntity, {
      _id: new ObjectId(data.id),
      isDeleted: false,
    });
    return scriptTask;
  }

  async batchGetInfo(data: IdsReqDto): Promise<ScriptTaskEntity[]> {
    const ids = data.ids.map(x => new ObjectId(x));
    const result = await this.mongo.find(ScriptTaskEntity, {
      where: {
        _id: {
          $in: ids
        },
        isDeleted: false,
      },
      select: ['_id', 'status', 'finishTime', 'failReason']
    })

    await this.formatTasks(result)

    return result;
  }

  async formatTasks(items: ScriptTaskEntity[]) {
    // 如果没有任务项，直接返回
    if (!items.length) {
      return
    }

    const taskIds = items.map(x => x._id)
    // 获取任务的第一个执行记录的创建时间作为任务实际开始执行时间返回给客户端
    const scriptTaskExecRecords = await this.mongo.aggregate(ScriptTaskExecRecordEntity, [
      { $match: { taskId: { $in: taskIds } } },
      { $sort: { _id: 1 } },
      {
        $group: {
          _id: "$taskId",
          firstRecord: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$firstRecord" }
      },
      {
        $project: {
          _id: 1,
          taskId: 1,
          createdAt: 1
        }
      }
    ]);
    const actualExecTimeMap = new Map<string, number>(
      scriptTaskExecRecords.map(v => [v.taskId.toString(), v.createdAt])
    )
    // 如果没有执行记录，直接返回
    if (!actualExecTimeMap.size) {
      return
    }

    // 为每个任务项设置实际执行时间
    for (const item of items) {
      item['actualExecTime'] = actualExecTimeMap.get(item._id.toString()) || 0
    }
  }

  async softDelete(data: IdReqDto): Promise<boolean> {
    const record = await this.mongo.findOneBy(ScriptTaskEntity, {
      _id: new ObjectId(data.id),
      isDeleted: false,
    });
    if (!record) {
      throw new CustomException(400, "任务不存在");
    }
    record.isDeleted = true;
    const result = await this.mongo.save(record);
    if (result.isDeleted) {
      this.logger.warn(`delete script task 【${data.id}】 success`);
      return true;
    }

    return false
  }

  async list(data: ScriptTaskListDto): Promise<ListResultDto<ScriptTaskEntity>> {
    const { page, size, deviceId, beginTime, endTime, word, order, orderBy } = data;
    const options: FindManyOptions<ScriptTaskEntity> = {
      where: { },
      order: { _id: 'DESC' },
      take: size,
      skip: (page - 1) * size,
    }
    if (order && orderBy) {
      options.order = { [orderBy]: order }
    }

    const where = options.where as FindOptionsWhere<ScriptTaskEntity>;

    if (beginTime && endTime) {
      where.createdAt = { $gte: beginTime, $lte: endTime } as any;
    } else if (beginTime) {
      where.createdAt = { $gte: beginTime } as any;
    } else if (endTime) {
      where.createdAt = { $lte: endTime } as any;
    }

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (word) {
      where.name = {
        $regex: new RegExp(word, 'i'),
      } as any;
    }
    const result = await Promise.all([
      this.mongo.count(ScriptCodeEntity, where),
      this.mongo.find(ScriptTaskEntity, options)
    ]);

    return {
      list : result[1],
      total: result[0],
    };
  }

  async cancel(data: TaskCancelDto): Promise<boolean> {
    const id = data.id;
    const taskObjectId = new ObjectId(id);
    const task = await this.mongo.findOneBy(ScriptTaskEntity, { _id: taskObjectId });
    if (!task) {
      throw new CustomException(400, "任务不存在");
    }
    const notAllowed = [
      ScriptTaskStatus.Canceled,
      ScriptTaskStatus.Failed,
      ScriptTaskStatus.Success,
      ScriptTaskStatus.Waiting_Timeout
    ].includes(task.status)
    if (notAllowed) {
      throw new CustomException(400, "已完成的任务不支持取消");
    }
    const deviceId = task.deviceId;
    const deviceInfo = (await this.centralControlApi.deviceInfo(deviceId)).data;
    // 停止设备上正在执行的任务
    if (!!deviceInfo?.task_running && deviceInfo?.task_id === id) {
      await this.centralControlApi.stopTask({ sns: [deviceId], taskId: id });
    }
    // 执行记录记为取消
    const records = await this.mongo.find(ScriptTaskExecRecordEntity, {
      where: {
        taskId: taskObjectId
      },
      select: ['_id', 'status'],
      order: { _id: 'DESC' },
      take: 1,
    });
    const record = records[0];
    if (record?.status === RecordStatus.Running) {
      await this.mongo.update(ScriptTaskExecRecordEntity, { _id: record._id }, {
        status: RecordStatus.Canceled
      });
    }
    // 任务状态记为取消
    await this.mongo.update(ScriptTaskEntity, {
      _id: taskObjectId,
      status: {
        $in: [ScriptTaskStatus.Waiting, ScriptTaskStatus.Running, ScriptTaskStatus.Running, ScriptTaskStatus.Failed_Waiting_Retry]
      }
    }, {
      status: ScriptTaskStatus.Canceled,
    });
    // 理论上不用从等待队列中移除，worker执行的时候会根据状态过滤
    return true;
  }

  /**
   * 校验并清理记录ID数组
   * @param recordIds 记录ID数组
   * @returns 清理后的记录ID数组，如果为空则返回null
   */
  private validateAndCleanRecordIds(recordIds: string[]): string[] | null {
    const cleanIds = _.uniq(recordIds?.filter(Boolean));
    return cleanIds?.length ? cleanIds : null;
  }

  async updateTaskSucByRecordIds(recordIds: string[]) {
    const validRecordIds = this.validateAndCleanRecordIds(recordIds);
    if (!validRecordIds) {
      return;
    }
    const promises: Promise<any>[] = [];
    const now = dayjs().unix();
    const records = await this.getExecRecordByIds(validRecordIds, ['taskId', 'deviceId', 'deviceLockValue']);
    const taskIds = _.uniq(records.map(it => it.taskId));
    if (taskIds.length) {
      const updateTaskPromise = this.mongo.update(ScriptTaskEntity, {
        _id: { $in: taskIds }
      }, {
        status: ScriptTaskStatus.Success,
        finishTime: now,
      });
      promises.push(updateTaskPromise);
    }
    const updateRecordPromise = this.mongo.update(ScriptTaskExecRecordEntity, {
      _id: { $in: validRecordIds.map(it => new ObjectId(it)) }
    },  {
      status: RecordStatus.Success,
      finishTime: now,
    });
    promises.push(updateRecordPromise);
    await Promise.all(promises);

    // 任务完成释放锁
    await this.batchReleaseDeviceLocks(records);
  }

  /**
   * 批量释放设备锁
   * @param records 包含设备锁信息的记录数组
   */
  private async batchReleaseDeviceLocks(records: Array<{deviceId?: string, deviceLockValue?: number, taskId?: any}>) {
    if (!records?.length) return;

    // 按设备分组，每个设备只释放一次锁，使用最新的lockValue
    const deviceLockMap = new Map<string, {lockValue: number, taskId: string}>();
    for (const record of records) {
      const {deviceId, deviceLockValue, taskId} = record;
      if (deviceId && deviceLockValue) {
        // 如果同一设备有多个记录，保留lockValue较大的（通常是最新的）
        const existing = deviceLockMap.get(deviceId);
        if (!existing || deviceLockValue > existing.lockValue) {
          deviceLockMap.set(deviceId, {
            lockValue: deviceLockValue,
            taskId: taskId?.toString() || ''
          });
        }
      }
    }
    
    // 释放每个设备的锁
    const releasePromises: Promise<void>[] = [];
    for (const [deviceId, {lockValue, taskId}] of deviceLockMap.entries()) {
      releasePromises.push(this.releaseTaskLock(deviceId, lockValue, taskId));
    }
    
    if (releasePromises.length) {
      await Promise.all(releasePromises);
    }
  }

  private async releaseTaskLock(deviceId: string, deviceLockValue: number, taskId: string) {
    // 释放设备锁
    try {
      const released = await this.redis.releaseDeviceLock(deviceId, deviceLockValue);
      if (released) {
        this.logger.info('Released device lock for deviceId: %s, taskId: %s', deviceId, taskId);
      } else {
        this.logger.warn('Failed to release device lock (may have expired) for device: %s, task: %s', deviceId, taskId);
      }
    } catch (e) {
      this.logger.error('Failed to release device lock for device: %s, task: %s, error: %s',
        deviceId, taskId, getErrMsg(e));
    }
  }

  async updateTaskFailByRecordIds(data: UpdateTaskFailDto[]) {
    const allRecordIds = this.validateAndCleanRecordIds(data?.map(it => it.recordId) || []);
    if (!allRecordIds) {
      return;
    }

    const execRecords = await this.getExecRecordByIds(allRecordIds, ['_id', 'taskId', 'deviceId', 'deviceLockValue']);
    const recordId2TaskMap = await this.getTaskMapByRecords(execRecords);
    const records: ScriptTaskExecRecordEntity[] = [];
    const tasks: ScriptTaskEntity[] = [];
    const now = dayjs().unix();
    data.forEach(it => {
      const { recordId, reason } = it;
      const task = recordId2TaskMap.get(recordId);
      const record = new ScriptTaskExecRecordEntity();
      record._id = new ObjectId(recordId);
      record.status = RecordStatus.Failed;
      record.failReason = reason;
      record.finishTime = now;
      record.execTimeoutUnix = task?.execTimeoutUnix || dayjs().add(TASK_EXEC_TIMEOUT_MINUTE, 'minute').unix();
      records.push(record);
      if (!_.isEmpty(task) && task.status !== ScriptTaskStatus.Failed) {
        const { _id, isRetry, retryCount } = task;
        const updateTask = new ScriptTaskEntity(); // 使用new的时候，注意entity中定义的属性是否有默认值，注意被覆盖
        updateTask._id = _id;
        updateTask.isRetry = isRetry;
        updateTask.retryCount = retryCount;
        // 不重试或者超过最大重试次数的设置任务为失败，否则只需要更新下次执行时间
        if (!isRetry || retryCount >= MAX_RETRY_COUNT) {
          updateTask.status = ScriptTaskStatus.Failed;
          updateTask.finishTime = now;
          updateTask.failReason = reason;
        } else {
          updateTask.status = ScriptTaskStatus.Failed_Waiting_Retry;
          // updateTask.retryCount = retryCount + 1; // 创建下次快照的时候加一
          updateTask.nextExecTime = dayjs().add(RETRY_INTERVAL, 'minute').unix();
        }
        tasks.push(updateTask);
      }
    });
    const promises: Promise<any>[] = [];
    if (records.length) {
       const saveRecordPromise = this.mongo.batchSave(ScriptTaskExecRecordEntity, records);
       promises.push(saveRecordPromise);
    }
    if (tasks.length) {
      const saveTaskPromise = this.mongo.batchSave(ScriptTaskEntity, tasks);
      promises.push(saveTaskPromise);
    }
    if (promises.length) {
      await Promise.all(promises);
    }

    // 任务失败释放锁
    await this.batchReleaseDeviceLocks(execRecords);
  }

  async getExecRecordByIds(recordIds: string[], select?: (keyof ScriptTaskExecRecordEntity)[]): Promise<ScriptTaskExecRecordEntity[]> {
    if (!recordIds?.length) {
      return [];
    }
    const options: FilterOperators<ScriptTaskExecRecordEntity> = {
       where: {
        _id: { $in: recordIds.map(it => new ObjectId(it)) },
      },
    }
    if (select?.length) {
      options['select'] = select;
    }
    return await this.mongo.find(ScriptTaskExecRecordEntity, options);
  }

  async getTaskMapByRecordIds(recordIds: string[]) {
    recordIds = _.uniq(recordIds);
    const map = new Map<string, ScriptTaskEntity>();
    if (!recordIds.length) {
      return map;
    }
    const recordOptions: FilterOperators<ScriptTaskExecRecordEntity> = {
       where: {
        _id: { $in: recordIds.map(it => new ObjectId(it)) },
      },
      select: ['_id', 'taskId', 'deviceId', 'deviceLockValue'],
    }
    const records = await this.mongo.find(ScriptTaskExecRecordEntity, recordOptions);
    const record2taskMap = new Map<string, string>();
    records.forEach(it => {
      record2taskMap.set(it._id.toString(), it.taskId.toString());
    });
    const taskIds = _.uniq(Array.from(record2taskMap.values()));
    const taskOptions: FilterOperators<ScriptTaskEntity> = {
       where: {
        _id: { $in: taskIds.map(v => new ObjectId(v)) },
      },
      select: ['_id', 'retryCount', 'isRetry', 'status']
    }
    const tasks = await this.mongo.find(ScriptTaskEntity, taskOptions);
    const taskMap = new Map<string, ScriptTaskEntity>();
    tasks.forEach(it => {
      taskMap.set(it._id.toString(), it);
    });
    recordIds.forEach(it => {
      map.set(it, taskMap.get(record2taskMap.get(it) as string) as ScriptTaskEntity);
    });
    return map;
  }

  async getTaskMapByRecords(records: ScriptTaskExecRecordEntity[]): Promise<Map<string, ScriptTaskEntity>> {
    let res = new Map<string, ScriptTaskEntity>();
    if (!records?.length) {
      return res
    }

    const taskIds = _.uniq(records.map(v => v.taskId));
    const taskOptions: FilterOperators<ScriptTaskEntity> = {
      where: {
        _id: { $in: taskIds },
        isDeleted: false,
      },
      select: ['_id', 'retryCount', 'isRetry', 'status']
    }
    const tasks = await this.mongo.find(ScriptTaskEntity, taskOptions);
    const taskMap = new Map<string, ScriptTaskEntity>(tasks.map(v => [v._id.toString(), v]));
    return new Map<string, ScriptTaskEntity>(
      records
        .map(v => [v._id.toString(), taskMap.get(v.taskId?.toString())] as [string, ScriptTaskEntity | undefined])
        .filter((entry): entry is [string, ScriptTaskEntity] => entry[1] !== undefined)
    )
  }
}


