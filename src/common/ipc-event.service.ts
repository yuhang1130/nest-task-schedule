import { EventEmitter2 } from '@nestjs/event-emitter';
import cluster, { Worker } from 'cluster';
import { Logger } from '../logger/logger';

export enum IpcMsgType {
  Request = 'request',
  Worker_Exit = 'worker:exit',
  Worker_Online = 'worker:online',
  Master_Disconnect = 'master:disconnect',
  Task_Done = 'task:done',
  Task_Handle = 'task:handle'
}

export interface IpcMessage {
  type: IpcMsgType;
  data: any;
  timestamp: number;
  from: 'master' | 'worker';
  workerId?: number;
}

export class IpcEventService extends EventEmitter2 {
  private readonly logger = new Logger(IpcEventService.name);
  private readonly eventPrefix = 'ipc:';

  constructor(private readonly worker?: Worker) {
    super();
    this.initializeMessageHandlers();
  }

  sendToWorker(type: IpcMsgType, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!cluster.isPrimary) {
        this.logger.warn('sendToWorker can only be called from master process');
        reject(new Error('sendToWorker can only be called from master process'));
        return;
      }

      if (!this.worker) {
        this.logger.warn('No worker provided to IpcEventService');
        reject(new Error('No worker provided to IpcEventService'));
        return;
      }

      if (this.worker.isDead()) {
        this.logger.warn(`Worker ${this.worker.id} is dead`);
        reject(new Error(`Worker ${this.worker.id} is dead`));
        return;
      }

      const message: IpcMessage = {
        type,
        data,
        timestamp: Date.now(),
        from: 'master'
      };

      try {
        this.worker.send(message);
        this.logger.debug(`Master sent message to worker ${this.worker.id}: ${type}`);
        resolve();
      } catch (error) {
        this.logger.error(`Failed to send message to worker ${this.worker.id}: ${error.message}`);
        reject(error);
      }
    });
  }

  sendToMaster(type: IpcMsgType, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (cluster.isPrimary) {
        this.logger.warn('sendToMaster can only be called from worker process');
        reject(new Error('sendToMaster can only be called from worker process'));
        return;
      }

      const message: IpcMessage = {
        type,
        data,
        timestamp: Date.now(),
        from: 'worker',
        workerId: cluster.worker?.id
      };

      try {
        process.send?.(message);
        this.logger.debug(`Worker ${cluster.worker?.id} sent message to master: ${type}`);
        resolve();
      } catch (error) {
        this.logger.error(`Failed to send message to master: ${error.message}`);
        reject(error);
      }
    });
  }

  onMessage(type: string, handler: (data: any, message: IpcMessage) => void | Promise<void>): void {
    const eventName = `${this.eventPrefix}${type}`;
    this.on(eventName, handler);
    this.logger.debug(`Registered handler for IPC event: ${type}`);
  }

  offMessage(type: string, handler?: (data: any, message: IpcMessage) => void | Promise<void>): void {
    const eventName = `${this.eventPrefix}${type}`;
    if (handler) {
      this.off(eventName, handler);
    } else {
      this.removeAllListeners(eventName);
    }
    this.logger.debug(`Removed handler(s) for IPC event: ${type}`);
  }

  onceMessage(type: string, handler: (data: any, message: IpcMessage) => void | Promise<void>): void {
    const eventName = `${this.eventPrefix}${type}`;
    this.once(eventName, handler);
    this.logger.debug(`Registered one-time handler for IPC event: ${type}`);
  }

  emitLocal(type: IpcMsgType, data: any, message?: Partial<IpcMessage>): void {
    const eventName = `${this.eventPrefix}${type}`;
    const fullMessage: IpcMessage = {
      type,
      data,
      timestamp: Date.now(),
      from: cluster.isPrimary ? 'master' : 'worker',
      workerId: cluster.isPrimary ? this.worker?.id : cluster.worker?.id,
      ...message
    };
    
    this.emit(eventName, data, fullMessage);
    this.logger.debug(`Emitted local IPC event: ${type}`);
  }

  private initializeMessageHandlers(): void {
    if (cluster.isPrimary && this.worker) {
      this.initializeMasterHandlers();
    } else if (!cluster.isPrimary) {
      this.initializeWorkerHandlers();
    }
  }

  private initializeMasterHandlers(): void {
    if (!this.worker) return;

    this.worker.on('message', (message: IpcMessage) => {
      this.logger.info('Received message in master: %j', message);
      if (this.isValidIpcMessage(message)) {
        this.logger.debug(`Master received message from worker ${this.worker!.id}: ${message.type}`);
        this.emitLocal(message.type, message.data, message);
      }
    });

    this.worker.on('exit', (code: number, signal: string) => {
      this.logger.warn(`Worker ${this.worker!.process.pid} died with code ${code} and signal ${signal}`);
      this.emitLocal(IpcMsgType.Worker_Exit, { workerId: this.worker!.id, code, signal });
    });

    this.worker.on('online', () => {
      this.logger.info(`Worker ${this.worker!.process.pid} is online`);
      this.emitLocal(IpcMsgType.Worker_Online, { workerId: this.worker!.id, pid: this.worker!.process.pid });
    });

    this.logger.info(`Master IPC handlers initialized for worker ${this.worker.id}`);
  }

  private initializeWorkerHandlers(): void {
    process.on('message', (message: IpcMessage) => {
      this.logger.info('Received message in worker: %j', message)
      if (this.isValidIpcMessage(message)) {
        this.logger.debug(`Worker ${cluster.worker?.id} received message from master: ${message.type}`);
        this.emitLocal(message.type, message.data, message);
      }
    });

    process.on('disconnect', () => {
      this.logger.warn('Worker disconnected from master');
      this.emitLocal(IpcMsgType.Master_Disconnect, {});
    });

    this.logger.info(`Worker ${cluster.worker?.id} IPC handlers initialized`);
  }

  private isValidIpcMessage(message: any): message is IpcMessage {
    return message && 
           typeof message === 'object' && 
           typeof message.type === 'string' && 
           message.data !== undefined && 
           typeof message.timestamp === 'number' &&
           (message.from === 'master' || message.from === 'worker');
  }

  getWorkerInfo() {
    if (!this.worker) {
      return null;
    }
    return {
      workerId: this.worker.id,
      pid: this.worker.process.pid,
      isDead: this.worker.isDead()
    };
  }

  getProcessInfo() {
    return {
      isPrimary: cluster.isPrimary,
      currentWorkerId: cluster.worker?.id,
      pid: process.pid,
      managedWorker: this.getWorkerInfo()
    };
  }

  async waitForWorkerOnline(timeout: number = 30000): Promise<void> {
    if (!cluster.isPrimary) {
      throw new Error('waitForWorkerOnline can only be called from master process');
    }

    if (!this.worker) {
      throw new Error('No worker provided to IpcEventService');
    }

    if (!this.worker.isDead()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for worker ${this.worker!.id} to come online`));
      }, timeout);

      const onOnline = () => {
        clearTimeout(timer);
        this.worker!.off('online', onOnline);
        resolve();
      };

      this.worker?.on('online', onOnline);
    });
  }

  kill(signal?: string): void {
    if (!cluster.isPrimary) {
      throw new Error('kill can only be called from master process');
    }
    
    if (!this.worker) {
      throw new Error('No worker provided to IpcEventService');
    }
    
    this.worker.kill(signal);
    this.logger.info(`Killed worker ${this.worker.id} with signal ${signal || 'SIGTERM'}`);
  }

  disconnect(): void {
    if (!cluster.isPrimary) {
      throw new Error('disconnect can only be called from master process');
    }
    
    if (!this.worker) {
      throw new Error('No worker provided to IpcEventService');
    }
    
    this.worker.disconnect();
    this.logger.info(`Disconnected worker ${this.worker.id}`);
  }
}