import { ObjectId } from "mongodb";
import { Entity, ObjectIdColumn } from "typeorm";

@Entity({ name: 'ping', comment: "健康检测表"})
export class PingEntity {
  @ObjectIdColumn({comment: '主键ID' })
  _id: ObjectId;
}