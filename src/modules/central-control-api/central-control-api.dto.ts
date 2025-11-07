// 这些枚举值从中控copy来的Start
export enum STATE_CODE {
  //成功
  SUCCESS = 0,
  //部分成功
  PARTIAL_SUCCESS = 1,
  //失败
  FAIL = -1,
  //限流
  LIMIT = -2,
  //权限不正确
  NEED_AUTH = -3,
  //参数校验错误
  VERIFY_ERROR = -4,
  //参数校验错误
  CONCURRENCY_LIMIT = -5,
  //请求超时
  TIMEOUT = -6,
  //内部错误
  SYS_ERROR = -999,
  //自动回复参数校验特殊使用
  AUTOMATIC_I = -7,
  //余额不足
  BALANCE_NOT_ENOUGH = -8,
  //频率限制
  RATE_LIMIT = -9,
  //购买失败
  BUY_FAIL = -10,
  //转账失败
  TRANSFER_FAIL = -11,
}

export enum DEVICE_BOUND_STATUS {
  ONLINE = 'online',
  OFFLINE = 'offline',
  RECONNECTING = 'reconnecting',
}

// 这些枚举值从中控copy来的End

export interface CustomAxiosResponse<T> {
  data: CentralControlApiRes<T>;
  status: number;
  statusText: string;
  headers: any;
  config: any;
  request?: any;
}

export interface CentralControlApiRes<T> {
  code: STATE_CODE;
  data?: T
  message?: string;

}

export interface DeviceInfoRes {
  id: number
  sn: string // 745559201362743370
  serial: string // 192.168.200.28:5555
  task_name?: string
  task_id?: string,
  task_running?: boolean
  device_type: string // OTG
  node_host: string // 127.0.0.1
  node_id: string // 10.246.0.6
  show_name: string, // test_2_200_20026
  bound_status: DEVICE_BOUND_STATUS // online
}

export interface UploadFileDto {
  sns: string[]; // 设备sn列表
  fileUrl: string; // 文件URL
  fileName?: string; // 可选的文件名
  async?: boolean; // 是否异步执行
}

/**
 * 文件上传结果
 */
export interface FileResultItem {
  /** 是否上传成功 */
  success: boolean;
  /** 文件名 */
  fileName?: string;
  /** 文件路径 */
  path?: string;
  /** 错误信息 */
  error?: string;
}

export interface FileUploadRes {
  /** 是否上传成功 */
  success: boolean;
  /** 文件名 (单文件上传时使用) */
  fileName?: string;
  /** 文件路径 (单文件上传时使用) */
  path?: string;
  /** 错误信息 */
  error?: string;
  /** 多文件上传结果 (多文件上传时使用) */
  files?: FileResultItem[];
  /** 状态码: 1=正常, -1=设备不存在或不在线, -2=下载的文件不存在, 0=其他异常 */
  code?: number;
}

export interface FileInfo {
  url: string; // 文件URL
  name?: string; // 文件名
}

export interface MultiUploadFileDto {
  sns: string[];
  files: FileInfo[]; // 多个文件信息
}

export interface DistributedData {
  tableData: any
}

export interface DistributeTasksDto {
  requestId?: string;
  retry: number;
  sns: string[];
  task_name: string;
  task_id: string;
  lua_code: string;
  tableVariables: any;
  distributeData: DistributedData,
  record_id: string;
  // {"xhs_pinglun": {"url": "https://dashscope.aliyuncs.com", "apiKey": ""}, "xiaohongshu": {"url": "https://dashscope.aliyuncs.com", "apiKey": ""}, "screenshot_huawei": {"domain": "", "endPoint": "", "accessKey": "", "secretKey": "", "bucketName": ""}}
  pluginInfo?: any;
  // {"pluginName": {"data": {"code": "DYVidSum4o"}, "type": "prompt", "prompt": "**任务描述**：\n请根据以下提供的抖音博主名称、视频标题和评论区的评论，进行内容识别和总结。请确保总结过程中能够准确提取视频的主要信息和评论区的观点倾向。\n\n**输入**：\n- 博主名称：\n- 视频标题：\n- 评论区评论：\n\n**输出**：\n- 视频内容总结，如果总结不出来则输出空的内容总结\n- 评论区评论内容总结及评论观点情绪倾向（如支持、反对、中立等），如果没有评论则输出空的评论总结和情绪倾向。\n- 不要以markdown格式输出", "version": "1.0.0", "paramaters": [{"code": "apiKey", "name": "API Key", "type": "user"}, {"code": "model", "name": "模型", "type": "system", "value": "gpt-4o"}, {"code": "url", "name": "Base Url", "type": "user"}], "requiredClientVersion": "2.0.0"}}
  pluginExtra?: any;
  userVariables: any;
  task_type: string;
  task_platform: string;
}

export interface DistributeTasksRes {
  failedSns: string[]
  success: string[]
}

export interface StopTaskDto {
  sns: string[];
  taskId: string;
}