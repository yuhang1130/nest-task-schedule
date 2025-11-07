FROM swr.cn-south-1.myhuaweicloud.com/folderName/node:20.10.0-alpine AS package-builder

ARG GFW_PROXY

# 指定工作目录
WORKDIR /task-schedule

#复制package到工作目录
COPY package.json package-lock.json ./

# 安装依赖
RUN npm config set registry https://registry.npmmirror.com --global
RUN http_proxy=$GFW_PROXY https_proxy=$GFW_PROXY npm install

# 复制当前所有代码到工作目录
COPY . .

# 打包
RUN npm run build

# 再次使用基础镜像
FROM swr.cn-south-1.myhuaweicloud.com/folderName/node:20.10.0-alpine AS run-builder

WORKDIR /task-schedule
ARG ENV_FLAG

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
  && apk update \
  && apk add curl \
  && apk add -U tzdata

# 安装Pm2
# RUN npm config set registry https://registry.npmmirror.com --global
RUN npm config set registry https://registry.npmjs.org --global
RUN http_proxy=$GFW_PROXY https_proxy=$GFW_PROXY npm install pm2@5.3.0 -g

# 从package-builder阶段复制打包后的文件
COPY --from=package-builder /task-schedule/node_modules /task-schedule/node_modules
COPY --from=package-builder /task-schedule/dist /task-schedule/dist
COPY ./pm2 /task-schedule/pm2

#暴露端口8090（与服务启动端口一致）
EXPOSE 8090

# 环境变量
ENV PORT=8090
ENV ENV_FLAG=${ENV_FLAG}
