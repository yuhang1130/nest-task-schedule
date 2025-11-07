import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../database/baseEntities/base";
import { ObjectId } from "mongodb";


@Entity({name: 'ScriptCode', comment: "完整的脚本代码"})
export class ScriptCodeEntity extends BaseEntity {
  @Column({comment: "任务Id"})
  taskId: ObjectId;

  @Column({ type: 'string', comment: "设备Id"})
  deviceId: string;

  @Column({ type: 'string', comment: "完整的code脚本" })
  code: string;
}