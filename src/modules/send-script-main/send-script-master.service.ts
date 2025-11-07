import { BeforeApplicationShutdown, Injectable } from "@nestjs/common";
import { Logger } from "../../logger/logger";
import { MongoService } from "../../database/mongo";
import { DynamicScheduler } from "../../utils/dynamic-scheduler";
import { CronExpression } from "@nestjs/schedule";
import cluster from "cluster";
import { IpcEventService, IpcMsgType } from "../../common/ipc-event.service";
import _ from "lodash";
import { RedisService } from "../../database/redis";
import { getErrMsg, Sleep, SleepMS } from "../../utils/util";
import { SendScriptHandlerService } from "./send-script-handler.service";
import { ScriptTaskEntity, ScriptTaskStatus } from "../script-task/entities/script-task.entity";
import dayjs from "dayjs";
import { FindCursor, ObjectLiteral } from "typeorm";
import { PushScriptTaskDto, TaskWorker } from "./send-script-master.dto";

const WorkerNumber = +(process.env.WORKERS ?? 2);

@Injectable()
export class SendScriptMasterService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(SendScriptMasterService.name);
  private readonly workers: TaskWorker[] = [];
  private readonly waitFreshQueueSet: Set<string> = new Set();
  private readonly waitFreshQueue: PushScriptTaskDto[] = [];
  private readonly waitQueue: PushScriptTaskDto[] = [];
  private readonly processingSet: Set<string> = new Set();
	private exit = false;

  constructor(
    private readonly redisSvc: RedisService,
    private readonly mongo: MongoService,
    private readonly dynamicScheduler: DynamicScheduler,
    private readonly sendScriptHandlerSvc: SendScriptHandlerService,
  ) {
    setInterval(() => {
      this.logger.warn('waitFreshQueueSet size: %d', this.waitFreshQueueSet.size);
    }, 60e3)
  }

  async beforeApplicationShutdown() {
    this.exit = true;
    this.logger.warn('%s beforeApplicationShutdown Kill TaskWorker Start', SendScriptMasterService.name);
    if (this.processingSet?.size > 0) {
      const ids = [...this.processingSet];
      await this.sendScriptHandlerSvc.setTask2SystemError(ids);
      this.logger.warn('HandlingQueue Size: %d', this.processingSet.size);
    }

    for (const worker of this.workers) {
      if (worker && worker.ipc) {
        worker.ipc.kill();
      }
    }
    this.logger.warn('%s beforeApplicationShutdown Kill TaskWorker End', SendScriptMasterService.name);
  }

  async Init() {
    for (let i = 0; i < WorkerNumber; i++) {
      const worker = cluster.fork();
      const ipc = new IpcEventService(worker);
      const workerInfo: TaskWorker = {
        ready: false,
        ipc,
        id: worker.id,
        taskCount: 0,
        deviceTasks: new Map()
      };
      this.workers.push(workerInfo);
    }
    for (const worker of this.workers) {
      this.setupMasterEventHandlers(worker);
    }

    this.listenNotice();
    // 每5秒检查一次任务
    this.dynamicScheduler.addCronJob({
      name: 'checkTask',
      cron: CronExpression.EVERY_5_SECONDS,
      action: this.checkTask.bind(this),
      startImmediately: true,
    })
    this.dynamicScheduler.addCronJob({
      name: 'loadDelayScriptTaskData',
      cron: CronExpression.EVERY_5_MINUTES,
      action: this.loadDelayScriptTaskData.bind(this),
      startImmediately: true,
    })
    // 脚本下发成功后，检查执行超时处理 - 每10分钟检查一次
    this.dynamicScheduler.addCronJob({
      name: 'checkScriptTaskTimeOut',
      cron: CronExpression.EVERY_10_MINUTES,
      action: this.sendScriptHandlerSvc.checkScriptTaskTimeOut.bind(this.sendScriptHandlerSvc),
      startImmediately: false, // 启动后等待第一个间隔再执行
    });
  }


  private async checkTask() {
    this.logger.warn("CheckTask waitFreshQueue: %d", this.waitFreshQueue?.length);
    if (this.waitFreshQueue?.length) {
      const data = [...this.waitFreshQueue];
      // 清空缓存区
      this.waitFreshQueue.length = 0
      const period = 100;
      while (data.length ) {
        const handleRecords = data.splice(0, period);
        this.waitQueue.push(...handleRecords);
        this.handleLoop();
      }
    }
  }

  private async loadDelayScriptTaskData() {
    this.logger.warn(`load ScriptTaskData start.`);
    let count = 0;
    let cursor: FindCursor<ScriptTaskEntity> | undefined = undefined;
    const cursorQuery: ObjectLiteral = {
      status: { $in: [ScriptTaskStatus.Waiting, ScriptTaskStatus.Failed_Waiting_Retry] },
      nextExecTime: { $lte: dayjs().unix(), $gte: dayjs().subtract(24, 'hour').unix() },
    };
    try {
      cursor = (await this.mongo.createCursor(ScriptTaskEntity, cursorQuery)).sort({ _id: 1 });
      while (await cursor.hasNext()) {
        const entity = await cursor.next();
        const taskId = entity?._id.toString();
        count++;
        // 避免重复添加
        if (taskId && !this.waitFreshQueueSet.has(taskId)) {
          this.waitFreshQueue.push({
            taskId: taskId,
            deviceId: entity?.deviceId || '',
          });
          this.waitFreshQueueSet.add(taskId)
        } else {
          this.logger.warn('loadScriptTaskData taskId: %s isExistWaitFreshQueueSet', taskId);
        }
      }
      this.logger.warn(`load ScriptTaskData end total: %d`, count);
    } catch (e) {
      this.logger.error(
        `create ScriptTaskEntity cursor Error. query: %j, error: %j`,
        cursorQuery,
        getErrMsg(e),
      );
    } finally {
      if (cursor) {
        await cursor.close();
      }
    }
  }

  private Processing: boolean = false;
  async handleLoop() {
    if (!this.Processing) {
      this.Processing = true;
      try {
        if (this.waitQueue?.length) {
          const list = this.waitQueue;
          while (list.length) {
            const temp = list.shift();
            if (temp) {
              this.logger.warn('handleLoop temp: %j', temp);
              await this.sendWorker(temp);
            }
          }
        }
      }
      catch (e) {
        this.logger.error(`SubmitLoop: ${e.message}`);
      }
      finally {
        this.Processing = false;
      }
    }
  }

  private async sendWorker(data: PushScriptTaskDto) {
    const { taskId: id, deviceId} = data;
    if (this.isProcessing(id)) {
      this.logger.warn(`${id} Is Processing`);
      return;
    }

    // 获取任务的deviceId用于负载均衡
    this.registerProcessing(id);
    await this.dispatchToWorker({ id, deviceId });
    return;
  }

  private registerProcessing(id: string) {
    this.processingSet.add(id);
  }

  private isProcessing(id: string): boolean {
    return this.processingSet?.has(id) || false;
  }

  private unRegisterProcessing(id: string): boolean {
    const exists = this.processingSet.has(id);
    this.processingSet?.delete(id);
    return exists;
  }

  private async dispatchToWorker(opt: { id: string; deviceId: string }, waitReadyCount: number = 0): Promise<boolean> {
    if (waitReadyCount > 10) {
      this.logger.error(`No Worker Ready`);
      return false;
    }

    const readyWorkers = this.workers.filter(w => w.ready);
    if (readyWorkers.length === 0) {
      this.logger.error(`No Worker Ready; Sleep For Ready`);
      await SleepMS(500);
      return this.dispatchToWorker(opt, ++waitReadyCount);
    }

    let selectedWorker: TaskWorker;

    if (opt.deviceId) {
      // 设备维度负载均衡分配算法
      selectedWorker = this.selectWorkerForDevice(readyWorkers, opt.deviceId);
    } else {
      selectedWorker = _.minBy(readyWorkers, 'taskCount')!;
    }

    // 更新worker统计
    selectedWorker.taskCount++;
    if (opt.deviceId) {
      const currentCount = selectedWorker.deviceTasks.get(opt.deviceId) || 0;
      selectedWorker.deviceTasks.set(opt.deviceId, currentCount + 1);
    }

    // 发送任务到worker
    selectedWorker.ipc.sendToWorker(IpcMsgType.Task_Handle, JSON.stringify(opt));
    this.logger.warn(`Task ${opt.id} assigned to worker ${selectedWorker.id}, device: ${opt.deviceId || 'unknown'}`);

    return true;
  }

  private selectWorkerForDevice(readyWorkers: TaskWorker[], deviceId: string): TaskWorker {
    // 1. 优先选择当前没有处理该设备任务的worker
    const availableWorkers = readyWorkers.filter(w => !w.deviceTasks.has(deviceId) || w.deviceTasks.get(deviceId) === 0);
    
    if (availableWorkers.length > 0) {
      // 在可用的worker中选择总任务数最少的
      return _.minBy(availableWorkers, 'taskCount')!;
    }

    // 2. 如果所有worker都在处理该设备，选择处理该设备任务最少的worker
    const workersWithDeviceTasks = readyWorkers.map(w => ({
      worker: w,
      deviceTaskCount: w.deviceTasks.get(deviceId) || 0
    }));

    // 先按设备任务数排序，再按总任务数排序
    workersWithDeviceTasks.sort((a, b) => {
      if (a.deviceTaskCount !== b.deviceTaskCount) {
        return a.deviceTaskCount - b.deviceTaskCount;
      }
      return a.worker.taskCount - b.worker.taskCount;
    });

    return workersWithDeviceTasks[0].worker;
  }

  private setupMasterEventHandlers(worker: TaskWorker) {
    worker.ipc.onMessage(IpcMsgType.Worker_Online, (data: any) => {
      worker.ready = true;
      this.logger.warn('Worker Online. workerId: %d', worker.id);
    });

    worker.ipc.onMessage(IpcMsgType.Task_Done, (data: string, message) => {
      worker.taskCount--;
      try {
        const result: {id: string; deviceId: string} = JSON.parse(data);
        if (result.deviceId) {
          // 减少设备任务统计
          const currentCount = worker.deviceTasks.get(result.deviceId) || 0;
          if (currentCount > 0) {
            worker.deviceTasks.set(result.deviceId, currentCount - 1);
          }
          if (worker.deviceTasks.get(result.deviceId) === 0) {
            worker.deviceTasks.delete(result.deviceId);
          }
        }

        if (result.id) {
          const exists = this.unRegisterProcessing(result.id);
          if (!exists) {
            this.logger.error(`TaskDone NotExistProcessing ${message}`);
          }
          this.waitFreshQueueSet?.delete(result.id)
        }
      } catch (error) {
        this.logger.error('TaskDone Error: %s', getErrMsg(error))
      }
      this.logger.warn(`TaskDone: %d;TaskCount:%d;DeviceTasksCount:%d;message: %j`,
        worker.id, worker.taskCount, worker.deviceTasks.size, message);
    });

    worker.ipc.onMessage(IpcMsgType.Worker_Exit, this.workerDead.bind(this));

  }

  private workerDead(deadWorkerId: number, code: number, signal: string) {
    this.logger.error(`WorkerDead: %s ; Code: %s; Signal: %s`, deadWorkerId, code,  signal);
    const newProcess = code !== 0;
    if (newProcess) {
      const oldDeadWorker = _.remove(this.workers, w => {
        return w.id === deadWorkerId;
      })[0];
      if (oldDeadWorker) {
        oldDeadWorker.ipc.kill();
      }
      const newWorker = cluster.fork();
      const ipc = new IpcEventService(newWorker);
      const workerInfo: TaskWorker = {
        ready: false,
        ipc,
        id: newWorker.id,
        taskCount: 0,
        deviceTasks: new Map(),
      };

      this.logger.warn(`TaskWorker Add Child Worker Id:%d`, newWorker.id);
      this.workers.push(workerInfo);
      this.setupMasterEventHandlers(workerInfo);
    }
  }

  private async listenNotice() {
    let errorCount = 0;
    while (1) {
      if (this.exit) {
        return;
      }

      try {
        errorCount = 0;
        const res = await this.redisSvc.popScriptTask();
        this.logger.warn('scriptTask receive notice %j', res);
        if (res) {
          // 避免重复添加
          if (!this.waitFreshQueueSet.has(res.taskId)) {
            this.waitFreshQueue.push(res);
            this.waitFreshQueueSet.add(res.taskId);
          } else {
            this.logger.warn('listenNotice taskId: %s isExistWaitFreshQueueSet', res.taskId);
          }
        } else {
          await Sleep(5);
        }
      } catch (e) {
        if (this.exit) {
          return;
        }

        this.logger.error('scriptTask error: %s', e.message);
        errorCount++;
      }

      if (errorCount) {
        if (errorCount > 100) {
          this.logger.error('scriptTask Error countLimit processExit');
          process.exit();
        }

        await Sleep(1);
      }
    }
  }
}