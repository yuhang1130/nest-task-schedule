import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Logger } from "../../logger/logger";
import { AuthenticationToken, Client, Consumer, Producer, ProducerMessage } from "pulsar-client";
import { PULSAR_OPTIONS } from "./provider/pulsar-settings.provider";
import { PulsarMessage, PulsarSettings } from "./struct/pulsar.struct";
import { getErrMsg } from "../../utils/util";

@Injectable()
export class PulsarService implements OnApplicationShutdown {
  private readonly logger = new Logger('PulsarSvc');
  private readonly client: Client;
  private producerMap = new Map<string, Producer>();
  private consumerMap = new Map<string, Consumer>();
  public defaultConsumerSubscription: string;

  constructor(
    @Inject(PULSAR_OPTIONS) private readonly settings: PulsarSettings,
  ) {
    this.logger.warn('pulsar settings: %j', settings);
    this.client = new Client({
      serviceUrl: settings.serviceUrl,
      authentication: new AuthenticationToken({ token: settings.token }),
      operationTimeoutSeconds: Number(settings.operationTimeoutSeconds),
    });
    this.defaultConsumerSubscription = settings.defaultConsumerSubscription;
  }

  async getProducer(topic: string): Promise<Producer> {
    const topicName = this.getFullTopic(topic);
    let producer = this.producerMap.get(topicName);
    if (!producer) {
      try {
        producer = await this.client.createProducer({ topic: topicName });
        this.producerMap.set(topicName, producer);
        this.logger.info(`Created new Pulsar producer for topic: ${topicName}`);
      } catch (e) {
        this.logger.error(`Failed to create Pulsar producer for topic: ${topic}, msg: ${getErrMsg(e)}`);
      }
    }
    return producer as Producer;
  }

  async getConsumer(topic: string, subscription: string, batchSize?: number, receiveTimeout?: number): Promise<Consumer> {
    const key = `${topic}-${subscription}`;
    let consumer = this.consumerMap.get(key);
    if (!consumer) {
      const topicName = this.getFullTopic(topic);
      this.logger.warn(`getFullTopic: ${topicName}`);
      try {
        consumer = await this.client.subscribe({
          topic: topicName,
          subscription,
          subscriptionType: 'Shared',
          batchReceivePolicy: batchSize ? {
            maxNumMessages: batchSize,
            maxNumBytes: 2 * 1024 * 1024,
            timeoutMs: receiveTimeout || 10 * 1e3,
          } : undefined,
        });
        this.consumerMap.set(key, consumer);
        this.logger.info(`Created new Pulsar consumer for topic: ${topic}, subscription: ${subscription}, batchSize: ${batchSize  || 'default'}`);
      } catch (e) {
        this.logger.error(`Get Pulsar consumer for topic: ${topic}, subscription: ${subscription} error, msg: ${e}`);
        throw e;
      }
    }
    return consumer as Consumer;
  }

  async send(msg: PulsarMessage, topic: string): Promise<void> {
    try {
      const msgStr = msg.message as string;
      this.logger.debug(`Sending message to Pulsar topic: ${topic}, msg: ${msgStr}`)
      const producer = await this.getProducer(topic);
      const message: ProducerMessage = {
        data: Buffer.from(msgStr),
        properties: msg.properties,
        eventTimestamp: msg.eventTimestamp,
        partitionKey: msg.partitionKey,
        orderingKey: msg.orderingKey,
        replicationClusters: msg.replicationClusters,
        deliverAt: msg.deliverAt,
        deliverAfter: msg.deliverAfter,
        disableReplication: msg.disableReplication,
      }
      await producer.send(message);
    } catch (e) {
      this.logger.error(`Failed to send message to Pulsar topic ${topic}: ${getErrMsg(e)}`);
      throw e;
    }
  }

  async closeAllConsumers(): Promise<void> {
    this.logger.info('Closing all Pulsar consumers...');
    const closePromises = Array.from(this.consumerMap.values()).map(async (consumer) => {
      try {
        await consumer.close();
      } catch (e) {
        this.logger.error(`Failed to close consumer: ${getErrMsg(e)}`);
      }
    });
    await Promise.all(closePromises);
    this.consumerMap.clear();
    this.logger.info('All Pulsar consumers closed');
  }

  async close(): Promise<void> {
    this.logger.debug('onApplication shutdown, close pulsar client.');
    await this.closeAllConsumers();
    await this.client?.close();
  }

  private getFullTopic(topic: string) {
    return `persistent://${this.settings.cluster}/${this.settings.namespace}/${topic}`;
  }

  onApplicationShutdown() {
    this.close();
  }

}