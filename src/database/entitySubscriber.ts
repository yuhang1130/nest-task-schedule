import { Logger } from "../logger/logger";
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from "typeorm"
import { Inject, Injectable } from "@nestjs/common";
import { ObjectId } from "mongodb";
import dayjs from "dayjs";
import { MONGO_CONNECTION } from "../constants/database-constants";

@EventSubscriber()
@Injectable()
export class EntitySubscriber implements EntitySubscriberInterface {
  logger = new Logger(EntitySubscriber.name);

  constructor(
    @Inject(MONGO_CONNECTION) readonly mongoConnection: DataSource,

  ) {
    mongoConnection.subscribers.push(this);
  }

    /**
     * 在插入实体之前调用。
     */
  async beforeInsert(event: InsertEvent<any>) {
      const now = dayjs().unix();
      event.entity.createdAt = event.entity.createdAt || now;
      event.entity.updatedAt = now;
      if (!event.entity._id) {
        event.entity._id = new ObjectId();
      }
    }

    /**
     * 在实体插入后调用。
     */
    async afterInsert(event: InsertEvent<any>) {
      // 可以做一些通知操作创建之后发送redis通知下发任务到中控
      // const entityName = event.metadata.name;
      // const entity = event.entity || {};
    }

    /**
     * 在实体更新之前调用。
     */
    async beforeUpdate(event: UpdateEvent<any>) {
      if (event.entity) {
        event.entity.updatedAt = dayjs().unix();
      }
    }

    /**
     * 在实体更新后调用。
     */
    async afterUpdate(event: UpdateEvent<any>) {
        // 可以做一些通知操作
    }
}