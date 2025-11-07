import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Injectable } from '@nestjs/common';
import { Logger } from '../logger/logger';

export interface CronJobOptions {
  name: string;
  cron: string;
  action: () => void | Promise<void>;
  startImmediately?: boolean;
  timezone?: string;
}

export interface CronJobInfo {
  name: string;
  isRunning: boolean;
  nextDate?: Date;
  lastDate?: Date;
}

@Injectable()
export class DynamicScheduler {
  private readonly logger = new Logger(DynamicScheduler.name);
  
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  getCronJob(name: string): CronJob | undefined {
    try {
      return this.schedulerRegistry.getCronJob(name);
    } catch (error) {
      this.logger.debug(`CronJob ${name} does not exist`);
      return undefined;
    }
  }

  getCronJobs(moduleFilter?: string): Map<string, CronJob> {
    const allCronJobs = this.schedulerRegistry.getCronJobs();

    if (!moduleFilter) {
      return allCronJobs;
    }

    const filteredJobs = new Map<string, CronJob>();
    for (const [name, cronJob] of allCronJobs.entries()) {
      if (name.includes(moduleFilter)) {
        filteredJobs.set(name, cronJob);
      }
    }

    return filteredJobs;
  }

  addCronJob(options: CronJobOptions): boolean {
    const { name, cron, action, startImmediately = true, timezone } = options;
    
    if (this.getCronJob(name)) {
      this.logger.warn(`CronJob ${name} already exists`);
      return false;
    }

    try {
      const job = new CronJob(cron, action, null, false, timezone);
      this.schedulerRegistry.addCronJob(name, job);
      
      if (startImmediately) {
        job.start();
        this.logger.info(`CronJob ${name} started`);
      } else {
        this.logger.info(`CronJob ${name} added but not started`);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to add CronJob ${name}: ${error.message}`);
      return false;
    }
  }

  deleteCronJob(name: string): boolean {
    const job = this.getCronJob(name);
    if (!job) {
      this.logger.warn(`CronJob ${name} does not exist`);
      return false;
    }

    try {
      job.stop();
      this.schedulerRegistry.deleteCronJob(name);
      this.logger.info(`CronJob ${name} deleted`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete CronJob ${name}: ${error.message}`);
      return false;
    }
  }

  startCronJob(name: string): boolean {
    const job = this.getCronJob(name);
    if (!job) {
      this.logger.warn(`CronJob ${name} does not exist`);
      return false;
    }

    try {
      job.start();
      this.logger.info(`CronJob ${name} started`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to start CronJob ${name}: ${error.message}`);
      return false;
    }
  }

  stopCronJob(name: string): boolean {
    const job = this.getCronJob(name);
    if (!job) {
      this.logger.warn(`CronJob ${name} does not exist`);
      return false;
    }

    try {
      job.stop();
      this.logger.info(`CronJob ${name} stopped`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to stop CronJob ${name}: ${error.message}`);
      return false;
    }
  }

  getCronJobInfo(name: string): CronJobInfo | undefined {
    const job = this.getCronJob(name);
    if (!job) {
      return undefined;
    }

    return {
      name,
      isRunning: job.running,
      nextDate: job.nextDate()?.toJSDate(),
      lastDate: job.lastDate() || undefined,
    };
  }

  getAllCronJobsInfo(moduleFilter?: string): CronJobInfo[] {
    const jobs = this.getCronJobs(moduleFilter);
    const jobsInfo: CronJobInfo[] = [];

    for (const [name] of jobs.entries()) {
      const info = this.getCronJobInfo(name);
      if (info) {
        jobsInfo.push(info);
      }
    }

    return jobsInfo;
  }

  deleteAllCronJobs(moduleFilter?: string): number {
    const jobs = this.getCronJobs(moduleFilter);
    let deletedCount = 0;

    for (const [name] of jobs.entries()) {
      if (this.deleteCronJob(name)) {
        deletedCount++;
      }
    }

    this.logger.info(`Deleted ${deletedCount} CronJob(s)`);
    return deletedCount;
  }
}
