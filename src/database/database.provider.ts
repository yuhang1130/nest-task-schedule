import { ConfigService } from "@nestjs/config";
import { Cluster, Redis } from "ioredis";
import { DataSource } from "typeorm";
import { Logger } from "../logger/logger";
import { ConfigType } from "../config";
import { MongoConnectionOptions } from "typeorm/driver/mongodb/MongoConnectionOptions";
import { FactoryProvider } from "@nestjs/common";
import { CustomException } from "../exceptions/custom.exception";
import _ from "lodash";
import { MONGO_CONNECTION, REDIS_CONNECTION } from "../constants/database-constants";

const logger = new Logger("databaseProvider");
export const MongoProvider: FactoryProvider<DataSource> = {
  inject: [ConfigService],
  provide: MONGO_CONNECTION,
  useFactory: async (config: ConfigService<ConfigType>): Promise<DataSource> => {
    try {
      const mongoUrl = config.get("mongoUrl", "");
      const connectConf: MongoConnectionOptions = {
        url: mongoUrl,
        authSource: "admin",
        type: "mongodb",
        entities: [__dirname + "/../modules/**/*.entity{.ts,.js}"],
        synchronize: false,
      };
      logger.info("连接mongo: %s", mongoUrl);
      const dataSource = new DataSource(connectConf);
      await dataSource.initialize();
      if (dataSource.isInitialized) {
        logger.info("mongo connect success");
      } else {
        logger.error("mongo connect error");
      }
      return dataSource;
    } catch (e) {
      logger.error("mongo Connect Error. msg: %s", e.message);
      throw new CustomException(1000, 'Failed to initialize Mongo DataSource');
    }
  },
};


export const RedisProvider: FactoryProvider<Cluster | Redis> = {
  inject: [ConfigService],
  provide: REDIS_CONNECTION,
  useFactory: (config: ConfigService<ConfigType>): Cluster | Redis => {
    try {
      const redisConf = config.get("redis");
      logger.info("连接redis: %j", redisConf);
      if (_.isArray(redisConf)) {
        const cluster = new Redis.Cluster(redisConf, {
          enableReadyCheck: true,
          enableOfflineQueue: false,
        });
        cluster.on("error", (e) => {
          logger.error("redis cluster on error. e: %j", e);
        });
        cluster.on("connect", () => {
          logger.info("redis cluster connect success.");
        });
        return cluster;
      }
      const redis = new Redis(redisConf.url, {
        password: redisConf.password || null,
        db: redisConf.db,
      });
      redis.on("error", (e) => {
        logger.error("redis on error. e: %j", e);
      });
      redis.on("connect", () => {
        logger.info("redis connect success.");
      });
      return redis;
    } catch (e) {
      logger.error("Redis Connect Error: %s", e?.message);
      throw new CustomException(1000, 'Failed to initialize Redis connection');
    }
  },
};
