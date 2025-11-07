# nest-task-schedule
基于nestjs,redis,mongodb实现的master-slave模式的下发任务服，采用k8s，支持微服务部署（web服务，cron定时服务，send-script下发脚本服务）

```bash 设置淘宝镜像源
$ npm config set registry https://registry.npmmirror.com --global
$ npm install
```

## Running the app

```bash
# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov

## 微服务架构

```bash
# web接口服务(web)根目录运行：
$ npm run start:dev

# 定时任务服务(cron)根目录运行：
$ npm run start:cron:dev

# 下发脚本服务(send-script)根目录运行：
$ npm run start:send-script:dev


```
