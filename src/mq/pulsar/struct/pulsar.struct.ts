import { MessageId } from "pulsar-client";
import { LogType } from "../../../modules/task-exec-log/entities/script-task-log.entity";

export class PulsarConsumerData {
  messageId: MessageId;
  data: any;
}

export interface PulsarSettings {
  serviceUrl: string;
  token: string;
  defaultConsumerSubscription: string;
  operationTimeoutSeconds: number;
  namespace: string;
  cluster: string;
  subscriptionInitialPosition?: 'Latest' | 'Earliest';
  topicPrefix?: string;
}

export interface PulsarMessage {
  message?: string | Buffer;
  properties?: { [key: string]: string };
  eventTimestamp?: number; // 对应 eventTimestamp
  sequenceId?: number; // 对应 sequenceId
  partitionKey?: string; // 对应 partitionKey
  orderingKey?: string; // 对应 orderingKey
  replicationClusters?: string[]; // 对应 replicationClusters
  deliverAfter?: number; // 对应 deliverAfter
  deliverAt?: number; // 对应 deliverAt
  disableReplication?: boolean; // 对应 disableReplication
}

export class ConsumerConfig {
  constructor(
    public batchReceive: boolean = false,
    public batchSize: number = 10,
    public isAutoAcknowledge: boolean = true,
    public maxRetries: number = 3,
    public retryDelay: number = 1000,
    public receiveTimeout: number = 10000,
    public enableMetrics?: boolean,
    public messageValidation?: boolean,
    public subscriptionName?: string,
    public enableDeadLetterQueue?: boolean,
    public deadLetterTopic?: string,
  ) { }
}

export interface ConsumerMetrics {
  messagesReceived: number;
  messagesProcessed: number;
  messagesAcknowledged: number;
  messagesFailed: number;
  messagesRetried: number;
  messagesDiscarded: number;
  messagesSentToDLQ: number;
  averageProcessingTime: number;
  lastMessageTime: Date;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBackoff: boolean;
}

export interface LogDataType {
  log: string; // 开启小红书App...
  logType: LogType;
  time: number; // 1758868613927
  taskId: string; // 68d634677f75fbb54f006418
  taskRecord: string; // 68d6346e8a8569d29f842f8f
  deviceId: string; // 745559201362743370
}