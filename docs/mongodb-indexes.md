# MongoDB 索引记录

本文档记录项目中 MongoDB 集合的索引配置信息。

## 索引概述

索引用于提高查询性能，合理的索引设计可以显著提升数据库操作效率。

## 索引列表

### 1. ScriptTask 集合

#### 索引：status_nextExecTime_compound
- **字段**: `status`, `nextExecTime`
- **类型**: 复合索引
- **排序**: `nextExecTime` 降序
- **说明**: 用于按状态和执行时间筛选待执行脚本任务的查询
```javascript
db.ScriptTask.createIndex({ status: 1, nextExecTime: -1 }, { background: true, name: "status_nextExecTime_compound" })
```

#### 索引：createdAt
- **字段**: `createdAt`
- **类型**: 普通索引
- **排序**: 降序
- **说明**: 用于按创建时间排序查询
```javascript
db.users.createIndex({ createdAt: -1 }, { background: true, name: "createdAt" })
```

### 2. ScriptCode 集合

#### 索引：taskId
- **字段**: `taskId`
- **类型**: 普通索引
- **排序**: `taskId` 降序
- **说明**: 用于按任务Id筛选的查询
```javascript
db.tasks.createIndex({ taskId: -1 }, { background: true, name: "taskId" })
```

### 3. ScriptTaskExecRecord 集合

#### 索引：taskId
- **字段**: `taskId`
- **类型**: 普通索引
- **排序**: `taskId` 降序
- **说明**: 用于按任务Id筛选的查询
```javascript
db.tasks.createIndex({ taskId: -1 }, { background: true, name: "taskId" })
```

#### 索引：status_execTimeoutUnix_compound
- **字段**: `status`, `execTimeoutUnix`
- **类型**: 复合索引
- **排序**: `execTimeoutUnix` 降序
- **说明**: 用于按状态和执行超时时间筛选执行超时任务的查询
```javascript
db.tasks.createIndex({ status: 1, execTimeoutUnix: -1 }, { background: true, name: "status_execTimeoutUnix_compound" })
```

### 2. ScriptTaskLog 集合

#### 索引：taskId_recordId_compound
- **字段**: `taskId`, `recordId`
- **类型**: 复合索引
- **排序**: `taskId`降序，`execTimeoutUnix` 降序
- **说明**: 用于按任务Id和任务快照Id筛选日志的查询
```javascript
db.tasks.createIndex({ taskId: -1, execTimeoutUnix: -1 }, { background: true, name: "taskId_recordId_compound" })
```

## 索引管理命令

### 查看集合所有索引
```javascript
db.collection_name.getIndexes()
```

### 删除索引
```javascript
db.collection_name.dropIndex("index_name")
```

### 查看索引使用情况
```javascript
db.collection_name.aggregate([{ $indexStats: {} }])
```

### 分析查询性能
```javascript
db.collection_name.find({ query }).explain("executionStats")
```

## 索引设计原则

1. **选择性原则**: 为高选择性字段（值分布广泛）创建索引
2. **查询频率**: 优先为高频查询字段建立索引
3. **复合索引顺序**: 等值查询字段在前，范围查询字段在后，排序字段最后
4. **避免冗余**: 复合索引可以覆盖单字段索引的功能
5. **限制数量**: 过多索引会影响写入性能，建议每个集合不超过 5-10 个索引
6. **覆盖查询**: 尽可能设计覆盖索引，避免回表查询

## 注意事项

- 索引会占用存储空间
- 索引会降低写入性能（INSERT、UPDATE、DELETE）
- 定期监控索引使用情况，删除未使用的索引
- 在生产环境创建索引时使用 `{ background: true }` 选项避免阻塞

## 更新日志

| 日期 | 操作 | 说明 |
|------|------|------|
| 2025-09-30 | 初始化 | 创建索引记录文档 |