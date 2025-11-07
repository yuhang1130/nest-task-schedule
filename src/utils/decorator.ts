import { registerDecorator, ValidationArguments, ValidationOptions } from "class-validator";
import { CustomException } from "../exceptions/custom.exception";
import { Eval } from "./util";


type ExpKeyGetter = (...args: any[]) => string;


/**
 * 用于在方法执行前获取分布式锁的装饰器
 * 防止在分布式环境下，同一时间多个请求对同一个资源进行操作
 * 
 * @param module 模块名称，用于区分不同的模块
 * @param expKey 键的生成器函数或字符串模板，用于生成锁的键
 * @param ttl 锁的过期时间（秒），默认为300秒
 * @param limitTs 获取锁的超时时间（秒），默认为60秒
 */
export const Locked = (
  module: string,
  expKey: string | ExpKeyGetter,
  ttl: number = 300,
  limitTs: number = 60
) => {
  return (target: any, property: string) => {
    const value = target[property];
    async function decorateFun() {
      let result;
      if (typeof value === "function") {
        const key =
          typeof expKey === "function"
            ? expKey(...arguments)
            : Eval({ args: arguments }, expKey);
        if (!key) {
          throw new CustomException(1002, `lock key is empty. key: ${expKey}`);
        } else {
          const redisSdk = this.redisSdk;
          if (!redisSdk) {
            const msg = `${target.constructor.name}类需要注入「RedisSdk」, 设置为 redisSdk`;
            throw new CustomException(1003, msg);
          }

          const lockKey = `${module}:${key}`;

          const lock = await redisSdk.GetLock(lockKey, ttl, limitTs);
          try {
            result = await value.apply(this, arguments);
          } finally {
            // 执行完成释放锁
            if (lock) {
              await redisSdk.RelLock(lockKey, lock);
            }
          }
        }
      }
      return result;
    }

    return {
      value: decorateFun,
      writable: true,
      enumerable: false,
      configurable: true,
    };
  };
};

export const IsEqualTo = <T>(
  value: T,
  validationOptions?: ValidationOptions
) => {
  return function (target: Record<string, any>, propertyName: string): void {
    if (!target?.constructor || typeof propertyName !== 'string' || propertyName.trim().length === 0) {
      throw new CustomException(1004, 'Invalid target object or empty property name');
    }
    const options = validationOptions ?? {};
    registerDecorator({
      name: "isEqualTo",
      target: target.constructor,
      propertyName: propertyName,
      constraints: [value],
      options: options,
      validator: {
        validate(val: T, args: ValidationArguments): boolean {
          const [relatedValue] = args.constraints as [T];
          return val === relatedValue;
        },
      },
    });
  };
};

export const IsUnixTimestamp = (validationOptions?: ValidationOptions) => {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isUnixTimestamp',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'number') return false;

          // 检查是否为10位数字（秒级时间戳）
          const timestampStr = value.toString();
          if (timestampStr.length !== 10) return false;

          // 检查时间戳范围（1970年到2038年）
          const minTimestamp = 0; // 1970-01-01
          const maxTimestamp = 2147483647; // 2038-01-19

          return value >= minTimestamp && value <= maxTimestamp;
        },
        defaultMessage(args: ValidationArguments) {
          return 'expectedExecTime must be a valid unix timestamp (10 digits)';
        }
      }
    });
  }
};