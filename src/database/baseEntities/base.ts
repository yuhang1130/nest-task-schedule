import { ObjectId } from "mongodb";
import { Column, ObjectIdColumn } from "typeorm";

export abstract class BaseEntity {
  @ObjectIdColumn({comment: '主键ID' })
  _id: ObjectId; // new ObjectId();

  @Column({ type: 'number', comment: '创建时间戳:秒级' })
  createdAt: number;

  @Column({ type: 'number', comment: '更新时间戳:秒级' })
  updatedAt: number;
}

export abstract class BusinessBaseEntity extends BaseEntity {
  @Column({type: 'boolean', default: false, comment: '是否软删'})
  isDeleted: boolean = false;
}


