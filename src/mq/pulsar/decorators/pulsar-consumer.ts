import _ from "lodash";
import { PulsarService } from "../pulsar.service";
import { ConsumerMetrics, ConsumerConfig, PulsarConsumerData } from "../struct/pulsar.struct";
import { config } from "../../../config";
import { Logger } from "../../../logger/logger";
import { getErrMsg, SleepMS } from "../../../utils/util";
import { Consumer, Message } from "pulsar-client";

const logger = new Logger('pulsar-consumer');

interface ConsumerInstance {
  topic: string | string[];
  propertyKey: string;
  config: ConsumerConfig;
  metrics: ConsumerMetrics;
  isShutdown: boolean;
  activeHandlers: Set<Promise<void>>;
}

class MessageProcessor {
  private retryAttempts = new Map<string, number>();

  constructor(
    private readonly config: ConsumerConfig,
    private readonly pulsarSvc: PulsarService,
  ) {}

  async processMessage (
    instance: any,
    consumer: Consumer,
    message: Message,
    method: string,
    topic: string,
    metrics: ConsumerMetrics
  ): Promise<void> {
    const startTime = Date.now();
    const messageId = message.getMessageId().toString();
    let isSuccess = false;

    try {
      metrics.messagesReceived++;
      
      const dataStr = this.safeDecodeMessage(message);
      if (!dataStr) {
        throw new Error('Failed to decode message data');
      }

      const msgObj = this.safeParseJson(dataStr);
      if (this.config.messageValidation && !this.validateMessage(msgObj)) {
        throw new Error('Message validation failed');
      }
      logger.info("Pulsar Processing message: topic=%s, messageId=%s", topic, messageId);

      const consumerMethod = instance[method];
      if (!consumerMethod) {
        throw new Error(`Consumer method ${method} not found`);
      }
      const messageData: PulsarConsumerData = {
        messageId: message.getMessageId(),
        data: msgObj
      }

      await consumerMethod.apply(instance, [topic, messageData, consumer]);
      if (this.config.isAutoAcknowledge) {
        await consumer.acknowledge(message);
        metrics.messagesAcknowledged++;
      }

      isSuccess = true;
      metrics.messagesProcessed++;
      this.retryAttempts.delete(messageId);

    } catch (error) {
      metrics.messagesFailed++;
      await this.handleError(consumer, message, error, metrics);
    } finally {
      const processingTime = Date.now() - startTime;
      this.updateMetrics(metrics, processingTime, isSuccess);
    }
  }

  async processBatchMessage (
    instance: any,
    consumer: Consumer,
    messages: Message[],
    method: string,
    topic: string,
    metrics: ConsumerMetrics
  ): Promise<void> {
    const startTime = Date.now();
    let successCount = 0;
    const ackPromises: Promise<null>[] = [];

    try {
      metrics.messagesReceived += messages.length;
      const messageData: PulsarConsumerData[] = [];
      for (const m of messages) {
        try {
          const dataStr = this.safeDecodeMessage(m);
          if (dataStr) {
            const msgObj = this.safeParseJson(dataStr);
            /**
             * 等上线之后可以去掉这里的代码
             * 目前和荣耀测试环境共用中控MQ，这里过滤一下荣耀测试环境的脚本日志回传
             * taskId: 759263996984430778 (mysql的Id)
             * taskId: 68d634677f75fbb54f006418 (mongo的Id)
             */
            if (msgObj?.taskId?.length < 24) {
              // 不处理
              ackPromises.push(consumer.acknowledgeId(m.getMessageId()))
              continue;
            }

            messageData.push({
              messageId: m.getMessageId(),
              data: msgObj
            });
          }
        } catch (error) {
          logger.error('Failed to process message in batch: %s', getErrMsg(error));
          consumer.negativeAcknowledge(m);
        }
      }

      if (ackPromises.length) {
        await Promise.all(ackPromises);
      }

      if (messageData.length === 0) {
        return;
      }
      logger.info("Pulsar Processing batch messages: topic: %s, count: %d", topic, messageData.length);

      const consumerMethod = instance[method];
      await consumerMethod.apply(instance, [topic, messageData, consumer]);

      if (this.config.isAutoAcknowledge) {
        const acknowledgePromises = messages.map(m => consumer.acknowledge(m));
        await Promise.all(acknowledgePromises);
        metrics.messagesAcknowledged += messages.length;
      }

      successCount = messages.length;
      metrics.messagesProcessed += successCount;

    } catch (error) {
      logger.error('Batch message processing error: %s, data; %j', getErrMsg(error));
      messages.forEach(m => consumer.negativeAcknowledge(m));
      metrics.messagesFailed += messages.length;
    } finally {
      const processingTime = Date.now() - startTime;
      this.updateMetrics(metrics, processingTime, successCount > 0);
    }
  }

  private safeDecodeMessage(message: Message): string | null {
    try {
      return new TextDecoder().decode(message.getData());
    } catch (error) {
      logger.error('Failed to decode message: %s', getErrMsg(error));
      return null;
    }
  }

  private safeParseJson(content: string): any {
    try {
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to parse JSON: %s', getErrMsg(error));
      throw new Error('Invalid JSON format');
    }
  }

  private validateMessage(msgObj: any): boolean {
    return msgObj !== null && msgObj !== undefined;
  }

  private async handleError(
    consumer: Consumer,
    message: Message,
    error: Error,
    metrics: ConsumerMetrics,
  ):  Promise<void> {
    const messageId = message.getMessageId().toString();
    const currentAttempts = this.retryAttempts.get(messageId) || 0;
    if (currentAttempts < this.config.maxRetries) {
      const nextAttempts = currentAttempts + 1;
      this.retryAttempts.set(messageId, nextAttempts);
      const delay = this.calculateRetryDelay(currentAttempts);
      logger.warn(
        'Message processing failed, retrying in %dms (attempt %d/%d): %s',
        delay, nextAttempts,  this.config.maxRetries, getErrMsg(error)
      );
      metrics.messagesRetried++;
      await SleepMS(delay);
      consumer.negativeAcknowledge(message);
    } else {
      logger.error(
        'Message process failed after %d attempts, messageId: %s, error Info: %s', 
        currentAttempts, messageId, getErrMsg(error)
      );
      try {
        if (this.config.enableDeadLetterQueue && this.config.deadLetterTopic) {
          await this.sendToDeadLetterQueue(message, error);
          metrics.messagesSentToDLQ++;
          logger.info('Message sent to dead letter queue: messageId=%s, topic=%s', messageId, this.config.deadLetterTopic);
        }
      } catch (e) {
        logger.error('Failed to send message to DLQ: %s', getErrMsg(e));
      }
      // 确认消息以丢弃它，避免重新入队
      await consumer.acknowledge(message);
      metrics.messagesDiscarded++;
      this.retryAttempts.delete(messageId);
      logger.info('Message discarded after max retries, messageId: %s', messageId);
    }
  }

  private calculateRetryDelay(attempt: number): number {
    return Math.min(this.config.retryDelay * Math.pow(2, attempt), 30 * 1e3);
  }

  private async sendToDeadLetterQueue(message: Message, error: Error): Promise<void> {
    if (!this.config.deadLetterTopic) {
      logger.error('Dead letter topic not configured');
      return;
    }

    if (!this.pulsarSvc) {
      logger.warn('PulsarService not available, cannot send message to DLQ');
      return;
    }

    try {
      const originalData = new TextDecoder().decode(message.getData());
      const originalMessageId = message.getMessageId().toString();
      const failReason = error.message;
      const failureTime = new Date().toISOString();
      const retryAttempts = this.config.maxRetries;
      const dlqMessage = {
        originalMessageId,
        originalData,
        failReason: failReason,
        failStack: error.stack,
        retryAttempts,
        failureTime,
        properties: message.getProperties()
      }

      await this.pulsarSvc.send({
        message: JSON.stringify(dlqMessage),
        properties: {
          'original-message-id':originalMessageId,
          'failure-reason': failReason,
          'retry-attempts': retryAttempts.toString(),
          'failure-time': failureTime
        }
      }, this.config.deadLetterTopic as string);
    } catch (e) {
      logger.error('Failed to send message to DLQ: %s', getErrMsg(e));
      throw e;
    }
  }

  private updateMetrics(metrics: ConsumerMetrics, processingTime: number, isSuccess: boolean): void {
    metrics.lastMessageTime = new Date();
    if (isSuccess) {
      const oldAverage = metrics.averageProcessingTime;
      metrics.averageProcessingTime = oldAverage === 0 ?  processingTime : (oldAverage * 0.9) + (processingTime * 0.1);
    }
  }
}

export function PulsarConsumer (topic: string|string[], consumerConfig: ConsumerConfig) {
  return function(target: any, propertyKey: string) {
    if (!target.__pulsarConsumers) {
      target.__pulsarConsumers = [];
    }
    const instance: ConsumerInstance = {
      topic,
      propertyKey,
      config: consumerConfig,
      isShutdown: false,
      activeHandlers: new Set(),
      metrics: {
        messagesReceived: 0,
        messagesProcessed: 0,
        messagesAcknowledged: 0,
        messagesFailed: 0,
        messagesRetried: 0,
        messagesDiscarded: 0,
        messagesSentToDLQ: 0,
        averageProcessingTime: 0,
        lastMessageTime: new Date(),
      },
    }
    target.__pulsarConsumers.push(instance);

    const originalOnModuleInit = target.onModuleInit;
    const originalOnModuleDestroy = target.onModuleDestroy;
    
    if (!target.__isLifecyclePatched) {
      target.__isLifecyclePatched = true;

      target.onModuleInit = async function(...args: any[]) {
        if (originalOnModuleInit) {
          await originalOnModuleInit.apply(this, args);
        }

        if (_.toNumber(config().disableMqConsumer)) {
          logger.warn('MQ消费者已禁用, 跳过启动');
          return;
        }

        if (!this.pulsarService || !(this.pulsarService instanceof PulsarService)) {
          throw new Error(`${target.constructor.name} 类应该要注入「PulsarService」实例`);
        }

        const pulsarService = this.pulsarService as PulsarService;
        const processor = new MessageProcessor(consumerConfig, pulsarService);
          
        for (const consumer of target.__pulsarConsumers) {
          await this.startConsume(consumer, pulsarService, processor);
        }
      }

      target.onModuleDestroy = async function(...args: any[]) {
        logger.info('Shutting down Pulsar consumers...');
        // 标记所有消费者为关闭状态
        for (const consumer of target.__pulsarConsumers || []) {
          consumer.isShutdown = true;
        }

        // 等待所有活跃的处理器完成
        // const allHandlers = target.__pulsarConsumers?.flatMap((c: ConsumerInstance) => Array.from(c.activeHandlers)) || [];
        // if (allHandlers.length > 0) {
        //   logger.info(`Waiting for ${allHandlers.length} active handlers to complete...`);
        //   await Promise.allSettled(allHandlers);
        // }
        // tips: isShutdown设置true之后，allHandlers没有返回值，会一直阻塞,导致服务无法关闭，所以这里手动关闭所有consumer
        if (this.pulsarService) {
          await this.pulsarService.closeAllConsumers();
        }

        if (originalOnModuleDestroy) {
          await originalOnModuleDestroy.apply(this, args);
        }

        logger.info('Pulsar consumers shutdown completed');
      }

      target.startConsume = async function(
        instance: ConsumerInstance,
        pulsarSvc: PulsarService,
        processor: MessageProcessor,
      ) {
        const finalSubscriptionName = instance.config.subscriptionName || pulsarSvc.defaultConsumerSubscription;
        const topicList = Array.isArray(instance.topic) ? instance.topic : [instance.topic];
        for (const topic of topicList) {
          const handler = this.createConsumerHandler(
            instance,
            topic,
            finalSubscriptionName,
            pulsarSvc,
            processor
          );

          instance.activeHandlers.add(handler);

          handler.finally(() => {
            instance.activeHandlers.delete(handler);
          });
        }
      }

      target.createConsumerHandler = async function(
        instance: ConsumerInstance,
        topic: string,
        subscriptionName: string,
        pulsarSvc: PulsarService,
        processor: MessageProcessor
      ) {
        try {
          const { isShutdown, config, propertyKey, metrics } = instance;
          const { batchReceive, batchSize, receiveTimeout } = config;
          const consumer = await pulsarSvc.getConsumer(topic, subscriptionName, batchSize, receiveTimeout);
          while(!isShutdown) {
            try {
              if (batchReceive) {
                const messages = await consumer.batchReceive();
                if (messages?.length) {
                  await processor.processBatchMessage(this, consumer, messages, propertyKey, topic, metrics);
                }
              } else {
                const message = await consumer.receive();
                await processor.processMessage(this, consumer, message, propertyKey, topic, metrics);
              }
            } catch(error) {
              if (error.name === 'TimeoutError') {
                continue;
              }
              logger.error('Consumer handler error for topic %s: %s', topic, getErrMsg(error));
              await SleepMS(1000); // 错误后等待更长时间
            }
          }
        } catch (e) {
          logger.error('Failed to createConsumerHandler for topic %s: %s', topic, getErrMsg(e));
        }
      }

      target.getConsumerMetrics = function(): ConsumerMetrics[]  {
        return (target.__pulsarConsumers || []).map((c: ConsumerInstance) => ({ ...c.metrics }));
      }
    }
  }
};
