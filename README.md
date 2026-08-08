# Trae Core Service

基于 Node.js + Express + MySQL 的后端核心服务，提供用户管理、权限管理和数据库管理功能。

## 技术栈

- **运行时**: Node.js 20 + TypeScript
- **框架**: Express 5
- **数据库**: MySQL 8.0（mysql2）
- **权限引擎**: Casbin
- **日志**: Winston
- **API 文档**: Swagger（开发环境默认开启）
- **部署**: Docker 多阶段构建

## 项目结构

```
src/
├── config/              # 配置
├── constants/           # 常量与 Swagger 定义
├── database/            # 数据库适配层（工厂模式）
├── middleware/           # 中间件（权限校验）
├── modules/
│   ├── user/            # 用户管理
│   ├── permission/      # 权限管理
│   └── database-manager/# 数据库管理
├── utils/               # 工具函数
├── app.ts               # Express 应用配置
└── index.ts             # 入口文件
```

## 快速开始

### 环境要求

- Node.js 20+
- MySQL 8.0+
- Docker & Docker Compose（容器化部署时）

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务（需先启动 MySQL）
npm run dev
```

### Docker 开发环境

```bash
# 启动（自动构建 + 初始化数据库）
docker compose up -d

# 查看日志
docker compose logs -f core

# 修改代码后重启生效
docker compose restart core
```

### Docker 生产环境

```bash
# 启动
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

## 环境变量

### 开发环境（.env.development）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 环境 | `development` |
| `PORT` | 服务端口 | `3002` |
| `DB_HOST` | 数据库地址 | `mysql` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户 | `datapolit-core` |
| `DB_PASSWORD` | 数据库密码 | `core_password` |
| `DB_NAME` | 数据库名 | `datapolit` |
| `ENABLE_SWAGGER` | 是否启用 Swagger | `true` |

### 生产环境（.env.production）

额外需要以下 MySQL 容器初始化变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | `datapolit-root` |
| `MYSQL_DATABASE` | 初始化数据库名 | `datapolit` |
| `MYSQL_USER` | 初始化应用用户 | `datapolit-core` |
| `MYSQL_PASSWORD` | 应用用户密码 | `core_password` |

## API 接口

所有接口以 `/core` 为前缀。

### 用户管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/core/user/register` | 用户注册 | - |
| POST | `/core/user/login` | 用户登录 | - |
| GET | `/core/user/list` | 获取用户列表 | - |
| POST | `/core/user/change-password` | 修改密码 | - |
| PUT | `/core/user/status` | 更新用户状态 | `user:update` |
| DELETE | `/core/user/:id` | 删除用户（软删除） | `user:delete` |

### 权限管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/core/permission/permissions` | 获取所有权限 | - |
| POST | `/core/permission/permissions` | 创建权限 | 需要认证 |
| DELETE | `/core/permission/permissions/:id` | 删除权限 | 需要认证 |
| GET | `/core/permission/roles` | 获取所有角色 | - |
| POST | `/core/permission/roles` | 创建角色 | 需要认证 |
| GET | `/core/permission/roles/:id` | 获取角色详情 | - |
| PUT | `/core/permission/roles/:id` | 更新角色 | 需要认证 |
| DELETE | `/core/permission/roles/:id` | 删除角色 | 需要认证 |
| POST | `/core/permission/roles/:id/permissions` | 为角色分配权限 | 需要认证 |
| DELETE | `/core/permission/roles/:roleId/permissions/:permissionId` | 移除角色权限 | 需要认证 |
| POST | `/core/permission/users/:userId/roles` | 为用户分配角色 | 需要认证 |
| DELETE | `/core/permission/users/:userId/roles/:roleId` | 移除用户角色 | 需要认证 |
| GET | `/core/permission/users/:userId/permissions` | 获取用户权限 | - |

### 数据库管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/core/database/tables` | 获取所有表 | - |
| GET | `/core/database/tables/:name/info` | 获取表结构 | - |
| GET | `/core/database/tables/:name/data` | 获取表数据 | - |
| POST | `/core/database/query` | 执行 SQL 查询 | 需要认证 |
| GET | `/core/database/stats` | 获取数据库统计 | - |

### 健康检查

```
GET /core/health
```

## 默认账户

数据库初始化后会自动创建管理员账户：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `Sra` | `admin123` | admin（所有权限） |

> **注意**: 生产环境部署后请立即修改默认密码。

## Swagger 文档

开发环境默认开启 Swagger，访问地址：

```
http://localhost:3002/core/api-docs
```

生产环境可通过 `ENABLE_SWAGGER=true` 手动开启。

## Docker 文件说明

| 文件 | 用途 |
|------|------|
| `Dockerfile` | 生产环境镜像（多阶段构建，仅含生产依赖） |
| `Dockerfile.dev` | 开发环境镜像（含全量依赖，使用 ts-node 运行） |
| `docker-compose.yml` | 开发环境编排 |
| `docker-compose.prod.yml` | 生产环境编排（含资源限制、日志轮转、健康检查） |
