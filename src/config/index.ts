export const deployEnv = process.env.DEPLOY_ENV || "local";
export const isLocal = deployEnv === "local";
export const isProd = deployEnv === "prod";
export const logLevel = process.env.LOG_LEVEL || "";

export const config = () => ({
  env: process.env.DEPLOY_ENV || "local",
  port: +(process.env.PORT || 0),
  mongoUrl: process.env.MONGO_URL || "mongodb://account:password@127.0.0.1:27017/task_schedule?authSource=admin&replicaSet=rs-mongo-replica-59e61d5cdca3&retryWrites=true",
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    password: process.env.REDIS_PWD || 'wvMn4OBlhXuCJ68VK',
    db: process.env.REDIS_DB || '151'
  },
  centralControlAddress: process.env.CENTRAL_CONTROL_ADDRESS || "https://127.0.0.1:18881",
  redisPrefix: process.env.REDIS_PREFIX || "task_schedule_qa",
  logFileConfig: {
    enabled: process.env.LOG_FILE_ENABLED === 'true' || false,
    logDir: process.env.LOG_FILE_DIR || './logs',
    fileName: process.env.LOG_FILE_NAME || 'schedule',
    maxRetentionDays: parseInt(process.env.LOG_FILE_RETENTION_DAYS || '7'),
    maxFileSize: parseInt(process.env.LOG_FILE_MAX_SIZE || '104857600'),
    cleanupInterval: parseInt(process.env.LOG_FILE_CLEANUP_INTERVAL || '3600000'),
  },
  trace: {
    endpoint: process.env.TRACE_GRPC_ENDPOINT || 'http://127.0.0.1:4317',
    isTraceOn: process.env.IS_TRACE_ON || "1",
    withConsoleExporter: false,
    metadata: {
      "X-ByteAPM-AppKey": process.env.TRACE_APP_KEY || '76d5850a45785d3ed333ea7a518fb6ed',
    },
    serviceName: process.env.TRACE_SERVICE_NAME || 'task_schedule_qa'
  },
  pulsar: {
    serviceUrl: process.env.PULSAR_SERVICE_URL || 'http://127.0.0.1:8080',
    token: process.env.PULSAR_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZi1yeSJ9.ckFNXB3jALMblB1YdosmECX-07mlGLxcU1F16m47w9M',
    operationTimeoutSeconds: process.env.PULSAR_OPERATION_TIMEOUT_SECONDS || 30,
    defaultConsumerSubscription: process.env.DEFAULT_CONSUMER_SUBSCRIPTION || 'task-schedule-consumer',
    namespace: process.env.PULSAR_NAMESPACE || 'social-x',
    cluster: process.env.PULSAR_CLUSTER || 'socialflow',
    subscriptionInitialPosition: process.env.SUBSCRIPTION_INIT_POSITION || 'Earliest'
  },
  disableMqConsumer: process.env.DISABLE_MQ_CONSUMER || '1',
});
export type ConfigType = ReturnType<typeof config>

export const getEnvFile = () => {
  const envName = process.env.ENV;
  return envName ? `.env.${envName}` : '.env';
};
