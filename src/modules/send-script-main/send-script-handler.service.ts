import { Injectable } from "@nestjs/common";
import { Logger } from "../../logger/logger";
import { MongoService } from "../../database/mongo";
import { RedisService } from "../../database/redis";
import { ScriptTaskEntity, ScriptTaskStatus } from "../script-task/entities/script-task.entity";
import dayjs from "dayjs";
import { RecordStatus, ScriptTaskExecRecordEntity } from "../script-task/entities/task-exec-record.entity";
import { ObjectId } from "mongodb";
import { getErrMsg, SleepMS } from "../../utils/util";
import { CentralControlApiService } from "../central-control-api/central-control-api.service";
import { DistributeTasksDto, MultiUploadFileDto, STATE_CODE } from "../central-control-api/central-control-api.dto";
import { CustomException } from "../../exceptions/custom.exception";
import { ScriptCodeEntity } from "../script-task/entities/script-code.entity";
import { ScriptTaskService } from "../script-task/script-task.service";
import { UpdateTaskFailDto } from "../script-task/script-task.dto";

import { MAX_RETRY_COUNT, RETRY_INTERVAL, TASK_EXEC_TIMEOUT_MINUTE } from "../../constants/task-constants";

@Injectable()
export class SendScriptHandlerService {
  logger = new Logger(SendScriptHandlerService.name);
  private isCheckingTimeout = false; // 添加标志位防止并发执行

  constructor(
    private readonly mongo: MongoService,
    private readonly redis: RedisService,
    private readonly centralControlApiSvc: CentralControlApiService,
    private readonly scriptTaskSvc: ScriptTaskService,
  ) { }

  async setTask2SystemError(ids: string[], ) {
    try {
      if (ids?.length) {
        const objectIds = ids.map(id => { return new Object(id); });
        this.logger.warn('setTask2SystemError start taskIds: %s', ids.join(','));
        await this.mongo.updateMany(ScriptTaskEntity, {
          _id: { $in: objectIds },
        }, {
          $set: {
            status: ScriptTaskStatus.Failed,
            finishTime: dayjs().unix(),
            failReason: 'Service restart',
          }
        });
        this.logger.warn('setTask2SystemError End');
      }
    } catch (e) {
      this.logger.error('setTask2SystemError Fail： Error：%s', e.message);
    }
  }

  async setTaskExecRecord2Fail(id: string, errMsg: string) {
    const updateData = {
      finishTime: dayjs().unix(),
      status: RecordStatus.Failed,
      failReason: errMsg || '未知错误',
    } as Partial<ScriptTaskExecRecordEntity>;
    const result = await this.mongo.findOneAndUpdate(ScriptTaskExecRecordEntity, {
      _id: new ObjectId(id),
    }, {
      '$set': updateData
    },
    {
      returnDocument: 'after',
    }
    );

    let updateResult = 'Failed';
    if (result?.ok && result.value) {
      updateResult = 'Success'
    }
    this.logger.warn('setTaskExecRecord2Fail update %s; recordId: %s', updateResult, id);
  }

  async setTask2RetryOrFail(task: ScriptTaskEntity, errMsg: string) {
    const {_id, isRetry, retryCount = 0} = task;
    const shouldRetry = isRetry && retryCount < MAX_RETRY_COUNT;
    if (shouldRetry) {
      this.logger.info('Setting task to retry, taskId: %s, retryCount: %d', _id?.toString(), retryCount  + 1);
      await this.mongo.findOneAndUpdate(ScriptTaskEntity, {
        _id,
      }, {
        $set: {
          status: ScriptTaskStatus.Failed_Waiting_Retry,
          nextExecTime: dayjs().add(RETRY_INTERVAL, 'minute').unix(),
        },
        $inc: {
          retryCount: 1,
        }
      });
    } else {
      const reason = isRetry ? `重试${MAX_RETRY_COUNT}次后仍失败` : '任务执行失败';
      this.logger.warn('Setting task to failed, taskId: %s, reason: %s', _id?.toString(), reason);
      await this.mongo.findOneAndUpdate(ScriptTaskEntity, {
        _id,
      }, {
        $set: {
          status: ScriptTaskStatus.Failed,
          finishTime: dayjs().unix(),
          failReason: errMsg || '未知错误',
        }
      });
    }
  }

  async handleDeviceLockedFail(taskId: string) {
    const task = await this.mongo.findOneBy(ScriptTaskEntity, { _id: new ObjectId(taskId), isDeleted: false })
    if (!task) {
      this.logger.warn('task not found, taskId: %s', taskId)
      return
    }
    const errMsg = '设备正在执行其他任务'

    // 更新任务状态是否重试
    try {
      await this.setTask2RetryOrFail(task, errMsg)
    } catch (error) {
      this.logger.error('setTask2RetryOrFail catch error: %s', getErrMsg(error))
    }

    // 创建一个任务执行快照
    try {
      const taskExecRecordModel = new ScriptTaskExecRecordEntity();
      taskExecRecordModel.taskId = task._id;
      taskExecRecordModel.deviceId = task.deviceId;
      taskExecRecordModel.status = RecordStatus.Failed;
      taskExecRecordModel.deviceLockValue = 0;
      taskExecRecordModel.finishTime = dayjs().unix();
      taskExecRecordModel.execTimeoutUnix = task.execTimeoutUnix;
      taskExecRecordModel.failReason = errMsg
      await this.mongo.save(taskExecRecordModel);
    } catch (error) {
      this.logger.error('setTask2RetryOrFail catch error: %s', getErrMsg(error))
    }
  }

  async handleRunFail(task: ScriptTaskEntity, taskExecRecordId: string, errMsg: string) {
    // 更新任务快照记录
    try {
      await this.setTaskExecRecord2Fail(taskExecRecordId, errMsg)
    } catch (error) {
      this.logger.error('setTaskExecRecord2Fail catch error: %s', getErrMsg(error))
    }

    // 更新任务状态是否重试
    try {
      await this.setTask2RetryOrFail(task, errMsg)
    } catch (error) {
      this.logger.error('setTask2RetryOrFail catch error: %s', getErrMsg(error))
    }
  }

  async taskPreprocess(task: ScriptTaskEntity) {
    try {
      if (!task.fileUrls?.length) {
        this.logger.info('no need to preprocess task')
        return
      }

      const uploadFileDto: MultiUploadFileDto = {
        sns: [task.deviceId],
        files: task.fileUrls.map(fileUrl => ({
          url: fileUrl,
        })),
      }
      const resp = await this.centralControlApiSvc.uploadMultiFiles(uploadFileDto)
      this.logger.info('【uploadMultiFiles】 finish. sn: %s, resp: %j', task.deviceId, resp)
      if (resp.code !== 0) {
        // 上传文件失败
        this.logger.error('【uploadMultiFiles】 Fail.')
        throw new CustomException(400, resp.message || '未知错误')
      }
    } catch (error) {
      const errMsg = getErrMsg(error)
      this.logger.error('taskPreprocess catch error: %s', errMsg)
      throw new CustomException(400, `上传文件失败: ${errMsg}`)
    }
  }

  async sendScript(task: ScriptTaskEntity, taskExecRecordId: ScriptTaskExecRecordEntity) {
    try {
      const scriptCode = await this.mongo.findOneBy(ScriptCodeEntity, {taskId: task._id, deviceId: task.deviceId})
      const distributeTasksDto = {
        sns: [task.deviceId],
        task_id: task._id?.toString(),
        task_name: task.name,
        record_id: taskExecRecordId._id?.toString(),
        // lua_code: scriptCode?.code ? scriptCode.code.replace(/{{[^{}]*}}/g, '') : "",
        lua_code: scriptCode?.code ?? "",
        tableVariables: {
          [task.deviceId]: task.variables || {},
        }, // 这个字段不传就会报错
        task_platform: task.variables?.platform, // 这个字段必须传，不然手电筒下载依赖文件路径会出问题
      } as DistributeTasksDto
      const resp = await this.centralControlApiSvc.distributeTasks(distributeTasksDto)
      this.logger.warn('【distributeTasks】 finish: %j', resp)
      if (resp.code !== STATE_CODE.SUCCESS) {
        // this.logger.error('【distributeTasks】 Fail. params: %j', distributeTasksDto)
        throw new CustomException(400, resp.message || '未知错误')
      }
    } catch (error) {
      const errMsg = getErrMsg(error)
      this.logger.error('taskPreprocess catch error: %s', errMsg)
      throw new CustomException(400, `下发脚本失败: ${errMsg}`)
    }
  }

  async updateTaskStatus(where: Record<string, any>, updateDoc: Record<string, any>): Promise<ScriptTaskEntity> {
    return await this.mongo.findOneAndUpdate(ScriptTaskEntity, where, updateDoc, {returnDocument: 'after'});
  }

  async checkScriptTaskTimeOut() {
    // 检查是否已经在执行，防止并发执行
    if (this.isCheckingTimeout) {
      this.logger.info('Script task timeout check is already running, skipping this execution');
      return;
    }

    try {
      this.isCheckingTimeout = true; // 设置标志位
      this.logger.info('Starting script task timeout check...');
      const where = {
        status: RecordStatus.Running,
        execTimeoutUnix: { $lt: dayjs().unix() },
      };

      // 分批处理超时任务，避免一次性加载过多数据
      const batchSize = 100;
      let totalProcessed = 0;
      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        // 查询超时的执行记录，分批获取
        const records = await this.mongo.find(ScriptTaskExecRecordEntity, {
          where,
          select: ['_id', 'taskId', 'deviceId', 'createdAt'],
          take: batchSize,
          skip: skip
        });

        if (!records.length) {
          hasMore = false;
          break;
        }

        this.logger.debug('Processing batch of %d timeout script tasks (skip: %d)', records.length, skip);

        const updateParam: UpdateTaskFailDto[] = records.map(record => {
          const timeoutMinutes = Math.floor((dayjs().unix() - record.createdAt) / 60);
          return {
            recordId: record._id?.toString(),
            reason: `脚本执行超时(${timeoutMinutes}分钟)`,
          };
        });

        await this.scriptTaskSvc.updateTaskFailByRecordIds(updateParam);
        totalProcessed += records.length;
        
        this.logger.warn('Processed batch of %d timeout script tasks (total: %d)', records.length, totalProcessed);
        
        // 如果返回记录数小于批次大小，说明已经处理完所有记录
        if (records.length < batchSize) {
          hasMore = false;
        } else {
          skip += batchSize;
        }
        
        // 添加短暂延迟，避免对数据库造成过大压力
        await SleepMS(200)
      }

      if (totalProcessed > 0) {
        this.logger.warn('Successfully processed %d total timeout script tasks', totalProcessed);
      } else {
        this.logger.info('No timeout script tasks found');
      }
    } catch (error) {
      this.logger.error('Error checking script task timeout: %s', getErrMsg(error));
    } finally {
      this.isCheckingTimeout = false; // 重置标志位
    }
  }

  async handleWaitTimeoutUnix(task: ScriptTaskEntity) {
    if (!task._id) {
      return
    }
    task.status = ScriptTaskStatus.Waiting_Timeout;
    task.failReason = '任务等待超时';
    await this.mongo.save(task)
    this.logger.warn('scriptTask [%s] waitTimeout. waitTimeoutUnix: %d', task._id?.toString(), task.waitTimeoutUnix)
  }
}



