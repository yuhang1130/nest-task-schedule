import { BeforeApplicationShutdown, Injectable } from "@nestjs/common";
import { Logger } from "../../logger/logger";
import { MongoService } from "../../database/mongo";
import { IpcEventService, IpcMsgType } from "../../common/ipc-event.service";
import { getErrMsg, Sleep } from "../../utils/util";
import _ from "lodash";
import { ScriptTaskEntity, ScriptTaskStatus } from "../script-task/entities/script-task.entity";
import { RecordStatus, ScriptTaskExecRecordEntity } from "../script-task/entities/task-exec-record.entity";
import { SendScriptHandlerService } from "./send-script-handler.service";
import { RedisService } from "../../database/redis";
import { ObjectId } from "mongodb";
import dayjs from "dayjs";


@Injectable()
export class SendScriptWorkerService implements BeforeApplicationShutdown {
  logger = new Logger(SendScriptWorkerService.name);
  ipc: IpcEventService;
	workingCount: number = 0;

  constructor(
    private readonly mongo: MongoService,
    private readonly redisSvc: RedisService,
    private readonly sendScriptHandlerSvc: SendScriptHandlerService,
  ) { }

  async beforeApplicationShutdown(signal: string) {
    this.logger.warn(`%s beforeApplicationShutdown Kill The Worker End`, SendScriptWorkerService.name);
  }

  async Init() {
    this.ipc = new IpcEventService();
    this.ipc.onMessage(IpcMsgType.Task_Handle, this.handelMessage.bind(this))
    setInterval(() => {
      this.logger.warn('workerId: %d, workingCount: %d', process.pid, this.workingCount);
    }, 3 * 60e3);
  }

  async handelMessage(message: string) {
    let model: {id: string; deviceId: string};
    try {
      model = JSON.parse(message);
    } catch (e) {
      this.logger.error(`Parse handelMessage Msg Error [${message}]; ${e.stack}`);
      return;
    }
    this.logger.info(`workerId[${process.pid}] ReceiveMsg; ${message}`);

    try {
      this.workingCount++;
      // 在处理任务前获取设备锁，等脚本执行完成回调释放设备锁或者等锁超时
      const deviceLockValue = await this.redisSvc.acquireDeviceLock(model.deviceId, 600, 5); // 10分钟锁，5秒超时
      if (!deviceLockValue) {
        this.logger.warn('Failed to acquire device lock for device: %s, task: %s', model.deviceId, model.id);
        // 如果获取锁失败，将该任务置为失败待重试（消耗重试次数）
        // await this.sendScriptHandlerSvc.handleDeviceLockedFail(model.id)
        return;
      }
      this.logger.info('Acquired device lock for device: %s, task: %s, lockValue: %d', model.deviceId, model.id, deviceLockValue);
      await this.run(model.id, deviceLockValue);
      await Sleep(10)
    } catch (e) {
      this.logger.error('HandleSubmitMessage Run Error taskId: %s, msg: %s', model.id, getErrMsg(e));
    } finally {
      this.workingCount--;
      this.ipc.sendToMaster(IpcMsgType.Task_Done, JSON.stringify({id: model.id, deviceId: model.deviceId}));
    }
  }

  async run(id: string, deviceLockValue: number) {
    this.logger.info('scriptTask [%s] ready to handle', id);
    let scriptTask = await this.mongo.findOne(ScriptTaskEntity, {
      where: {
        status: {
          $in: [ScriptTaskStatus.Waiting, ScriptTaskStatus.Failed_Waiting_Retry]
        },
        _id: new ObjectId(id),
      }
    });

    if (!scriptTask) {
      this.logger.warn('scriptTask [%s] notExist', id);
      return;
    }

    // 判断是否等待超时
    if (scriptTask.waitTimeoutUnix && scriptTask.waitTimeoutUnix < dayjs().unix()) {
      await this.sendScriptHandlerSvc.handleWaitTimeoutUnix(scriptTask);
      return
    }

    // 创建一个任务执行快照
    const taskExecRecordModel = new ScriptTaskExecRecordEntity();
    taskExecRecordModel.taskId = scriptTask._id;
    taskExecRecordModel.deviceId = scriptTask.deviceId;
    taskExecRecordModel.status = RecordStatus.Running;
    taskExecRecordModel.deviceLockValue = deviceLockValue;
    taskExecRecordModel.execTimeoutUnix = scriptTask.execTimeoutUnix;
    const taskExecRecord = await this.mongo.save(taskExecRecordModel);
    this.logger.info('create taskExecRecord recordId: [%s]', taskExecRecord._id.toString());

    // 更新状态为运行中，执行次数++
    if (scriptTask.status === ScriptTaskStatus.Failed_Waiting_Retry) {
      scriptTask.retryCount++;
    }
    scriptTask.status = ScriptTaskStatus.Running;
    scriptTask = await this.mongo.save(scriptTask)
    this.logger.info('update task status to running. taskId: [%s]', id)

    try {
      // 预处理
      await this.sendScriptHandlerSvc.taskPreprocess(scriptTask)

      // 下发脚本
      await this.sendScriptHandlerSvc.sendScript(scriptTask, taskExecRecord)

      // 更新任务下发脚本成功
      scriptTask.status = ScriptTaskStatus.Send_Success;
      await this.mongo.save(scriptTask);
      this.logger.info('update task status to Send_Success. taskId: [%s]', id)
    } catch (error) {
      // 更新本次任务执行快照
      const errMsg = getErrMsg(error);
      await this.sendScriptHandlerSvc.handleRunFail(scriptTask, taskExecRecord?._id?.toString(), errMsg);
      this.logger.error(
        `[Run] Error ScriptTaskId: %s; taskExecRecordId: %s; ErrorMsg: %s`,
        scriptTask._id.toString(),
        taskExecRecord._id.toString(),
        errMsg
      );
    }
  }
}