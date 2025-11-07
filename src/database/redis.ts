import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { ConfigService } from "@nestjs/config";
import { RedisServiceKey } from "../constants/redis-key";
import { Logger } from "../logger/logger";
import { getErrMsg, SleepMS } from "../utils/util";
import { CustomException } from "../exceptions/custom.exception";
import { PushScriptTaskDto } from "../modules/send-script-main/send-script-master.dto";
import { REDIS_CONNECTION } from "../constants/database-constants";

type DelInterface = (key: string) => Promise<number>;
type SetInterface = (
  key: string,
  value: string,
  opts: { ttl?: number; reset?: boolean },
) => Promise<string | number>;
type GetInterface = (key: string) => Promise<string | null>;

@Injectable()
export class RedisService implements BeforeApplicationShutdown {
  logger = new Logger(RedisService.name);
  lockers: Array<[string, number]> = [];
  private readonly JsonPrefix = this.getPrefix(RedisServiceKey.JsonPrefix);
  private readonly LockPrefix = RedisServiceKey.LockPrefix;


  async beforeApplicationShutdown() {
    this.logger.warn(
      "beforeApplicationShutdown RedisSdk Start Remove The Lock: %d",
      this?.lockers?.length
    );
    try {
      const p: Promise<number>[] = [];
      if (this.lockers && this.lockers.length) {
        for (const [key] of this.lockers) {
          p.push(this.client.del(key));
        }

        await Promise.all(p);
      }
      this.logger.warn('beforeApplicationShutdown RedisSdk End Remove The Lock %d', p.length);
    } catch (e) {
      this.logger.warn('RedisSdk RemoveError %s', getErrMsg(e));
    }
    if (this.client.disconnect) {
      this.client.disconnect()
    }
  }


  constructor(
    @Inject(REDIS_CONNECTION) readonly client: Redis,
    readonly config: ConfigService,
  ) {}

  getPrefix(k: RedisServiceKey): string {
    return `${this.config.get("redisPrefix", "schedule")}:${k}`;
  }

  NewJsonCache(prefix?: string) {
    return {
      Set: this.SetJson.bind(this, prefix) as (
        key: string | number,
        value: any,
        ttl: number,
      ) => Promise<boolean>,
      Get: this.GetJson.bind(this, prefix) as (
        key: string | number,
      ) => Promise<any>,
      Del: this.DelJson.bind(this, prefix) as (
        ...keys: Array<string | number>
      ) => Promise<void>,
      Exists: this.ExistsJson.bind(this, prefix) as (
        key: string | number,
      ) => Promise<boolean>,
      Expire: this.ExpireJson.bind(this, prefix) as (
        key: string | number,
        ttl: number,
      ) => Promise<number>,
      Ttl: this.TtlJson.bind(this, prefix) as (
        key: string | number,
      ) => Promise<number>,
    };
  }

  async SetJson(
    prefix: string | null | undefined,
    key: string | number,
    value: any,
    ttl: number,
  ): Promise<boolean> {
    prefix = prefix || this.JsonPrefix;
    const k = prefix + key;
    const v = JSON.stringify(value);
    const ret = await this.client.set(k, v, "EX", Math.round(ttl));
    if (ret !== "OK") {
      this.logger.error(`SetJsonError; ${ret}, ${v}`);
      return false;
    }

    return true;
  }

  async GetJson<T = any>(
    prefix: string | null | undefined,
    key: string | number,
  ): Promise<T | null> {
    prefix = prefix || this.JsonPrefix;
    const k = prefix + key;
    const ret = await this.client.get(k);
    if (!ret) {
      return null;
    }

    try {
      return JSON.parse(ret) as T;
    } catch (e) {
      this.logger.error(`GetJson ParseError; ${k}: ${ret}; ${e.message}`);
    }

    return null;
  }

  async DelJson(
    prefix: string | null | undefined,
    ...keys: Array<string | number>
  ) {
    prefix = prefix || this.JsonPrefix;
    await Promise.all(keys.map((key) => this.client.del(prefix + key)));
  }

  async ExistsJson(
    prefix: string | null | undefined,
    key: string | number,
  ): Promise<boolean> {
    prefix = prefix || this.JsonPrefix;
    const k = prefix + key;
    return (await this.client.exists(k)) === 1;
  }

  async ExpireJson(
    prefix: string | null | undefined,
    key: string | number,
    ttl: number,
  ): Promise<number> {
    prefix = prefix || this.JsonPrefix;
    const k = prefix + key;
    return this.client.expire(k, ttl);
  }

  async TtlJson(
    prefix: string | null | undefined,
    key: string | number,
  ): Promise<number> {
    prefix = prefix || this.JsonPrefix;
    const k = prefix + key;
    return this.client.ttl(k);
  }

  // 这些get和set方法，会话存储会用到
  private async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  private async set(
    key: string,
    v: string,
    opts: { ttl: number; reset?: boolean },
  ): Promise<string | number> {
    if (opts?.reset) {
      return this.client.del(key);
    }

    return this.client.set(key, v, "EX", Math.round(opts?.ttl) || 24 * 3600);
  }

  private async del(key: string[]): Promise<number> {
    return this.client.del(key);
  }

  private async Set(
    prefix: string,
    key: string,
    v: string,
    opts: { ttl: number; reset?: boolean },
  ): Promise<string | number> {
    const k = prefix + key;
    if (opts?.reset) {
      return this.client.del(k);
    }

    return this.client.set(k, v, "EX", Math.round(opts?.ttl) || 24 * 3600);
  }

  private async Del(prefix: string, key: string): Promise<number> {
    const k = prefix + key;
    return this.client.del(k);
  }

  private async Get(prefix: string, key: string): Promise<string | null> {
    const k = prefix + key;
    return this.client.get(k);
  }

  private async expire(key: string, ttl: number): Promise<number> {
    return this.client.expire(key, ttl);
  }

  private async InCr(prefix: string, key: string, opts: {ttl?: number, reset?: boolean, increment?: number}): Promise<number> {
    const k = prefix + key;
    if (opts?.reset) {
      await this.client.del(k);
      return 0;
    }
    
    let v;
    if (opts?.increment) {
      v = await this.client.incrby(k, opts.increment);
    } else {
      v = await this.client.incr(k);
    }
    
    if (opts?.ttl && v === 1) {
      this.client.expire(k, opts?.ttl);
    }
    
    return v;
  }

  private async SetWithNoTTL(prefix: string, key: string, v: string) {
    const k = prefix + key;
    return await this.client.set(k, v);
  }

  private async Exists(prefix: string, key: string): Promise<number> {
    const k = prefix + key;
    return await this.client.exists(k);
  }

  sleepTs = 300;
  async GetLock(k: string, ttl: number, timeout?: number): Promise<number> {
    const key = this.LockPrefix + k;
    let count = 0;
    // 使用更唯一的锁值：时间戳 + 进程ID + 随机数
    const lockValue = Date.now() + process.pid + Math.floor(Math.random() * 10000);
    let countLimit = 0;
    if (timeout) {
      countLimit = Math.round((timeout * 1000) / this.sleepTs);
    }

    const startTime = Date.now();
    while (true) {
      try {
        const ret = await this.client.set(key, lockValue.toString(), 'EX', Math.round(ttl), 'NX');
        if (ret === 'OK') {
          this.lockers.push([key, lockValue]);
          this.logger.debug('Successfully acquired lock: %s, value: %d, attempts: %d, elapsed: %dms', 
            key, lockValue, count + 1, Date.now() - startTime);
          return lockValue;
        }
      } catch (error) {
        this.logger.error('Error acquiring lock: %s, error: %s', key, getErrMsg(error));
        throw error;
      }

      if (countLimit && count >= countLimit) {
        this.logger.warn('GetLockTimeout: %s after %d attempts, elapsed: %dms', 
          key, count, Date.now() - startTime);
        throw new CustomException(1001, 'get lock timeout');
      }

      await SleepMS(this.sleepTs);
      count++;
    }
  }

  async RelLock(k: string, oldV: number): Promise<number> {
    const key = this.LockPrefix + k;
    
    // 使用Lua脚本确保原子性操作，避免竞态条件
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      const result = await this.client.eval(luaScript, 1, key, oldV.toString()) as number;
      
      if (result === 1) {
        // 从本地锁记录中移除
        const lockIndex = this.lockers.findIndex(([lock]) => lock === key);
        if (lockIndex !== -1) {
          this.lockers.splice(lockIndex, 1);
        }
        this.logger.debug('Successfully released lock: %s, value: %d', key, oldV);
        return 1;
      } else {
        this.logger.warn('Failed to release lock (version mismatch or expired): %s, expected: %d', key, oldV);
        return 0;
      }
    } catch (error) {
      this.logger.error('Error releasing lock: %s, value: %d, error: %s', key, oldV, getErrMsg(error));
      return 0;
    }
  }

  async pushScriptTask(data: PushScriptTaskDto) {
    await this.client.rpush(this.getPrefix(RedisServiceKey.HandleScriptTaskPrefix), JSON.stringify(data));
  }

  async popScriptTask(): Promise<PushScriptTaskDto | null> {
    const res = await this.client.lpop(this.getPrefix(RedisServiceKey.HandleScriptTaskPrefix));
    if (!res) {
      return null;
    }

    try {
      return JSON.parse(res) as PushScriptTaskDto;
    } catch (e) {
      this.logger.warn('popScriptTask ParseError; %s; %s', res, getErrMsg(e));
      return null;
    }
  }

  async acquireDeviceLock(deviceId: string, ttl: number = 300, timeout: number = 5): Promise<number | null> {
    try {
      const lockKey = `device_lock:${deviceId}`;
      this.logger.debug('Attempting to acquire device lock: %s, ttl: %d, timeout: %d', deviceId, ttl, timeout);
      const lockValue = await this.GetLock(lockKey, ttl, timeout);
      this.logger.info('Successfully acquired device lock: %s, value: %d', deviceId, lockValue);
      return lockValue;
    } catch (error) {
      if (error instanceof CustomException && error.code === 1001) {
        this.logger.warn('Device lock acquisition timeout for device: %s after %d seconds', deviceId, timeout);
      } else {
        this.logger.error('Failed to acquire device lock for device: %s, error: %s', deviceId, getErrMsg(error));
      }
      return null;
    }
  }

  async releaseDeviceLock(deviceId: string, lockValue: number): Promise<boolean> {
    try {
      const lockKey = `device_lock:${deviceId}`;
      this.logger.debug('Attempting to release device lock: %s, value: %d', deviceId, lockValue);
      const result = await this.RelLock(lockKey, lockValue);
      if (result === 1) {
        this.logger.info('Successfully released device lock: %s', deviceId);
        return true;
      } else {
        this.logger.warn('Failed to release device lock (may have expired): %s', deviceId);
        return false;
      }
    } catch (error) {
      this.logger.error('Error releasing device lock: %s, error: %s', deviceId, getErrMsg(error));
      return false;
    }
  }
}
