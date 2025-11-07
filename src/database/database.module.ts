import { Module } from "@nestjs/common";
import { MongoProvider, RedisProvider } from "./database.provider";
import { ConfigModule } from "@nestjs/config";
import { EntitySubscriber } from "./entitySubscriber";
import { MongoService } from "./mongo";
import { RedisService } from "./redis";


@Module({
  imports: [ConfigModule],
  providers: [MongoProvider, RedisProvider, MongoService, RedisService, EntitySubscriber],
  exports: [MongoProvider, RedisProvider, MongoService, RedisService],
})
export class DatabaseModule {}
