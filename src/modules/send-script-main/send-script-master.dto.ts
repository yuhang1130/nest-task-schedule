import { IpcEventService } from "../../common/ipc-event.service";

export interface TaskWorker {
  ipc: IpcEventService;
  taskCount: number;
  ready: boolean;
  id: number;
  deviceTasks: Map<string, number>; // deviceId -> task count
}

export interface PushScriptTaskDto {
	taskId: string;
	deviceId: string;
}