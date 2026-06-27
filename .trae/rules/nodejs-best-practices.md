---
alwaysApply: false
description: Node.js / TypeScript 后端开发规范，适用于 core 项目
---

# Node.js / TypeScript 后端规范

> 本规范适用于 Node.js / TypeScript 后端服务（core 项目）。

---

## 目录

1. [模块结构](#1-模块结构)
2. [Controller 规范](#2-controller-规范)
3. [Service 规范](#3-service-规范)
4. [Router 规范](#4-router-规范)
5. [TypeScript 类型定义](#5-typescript-类型定义)
6. [常量定义](#6-常量定义)
7. [日志记录](#7-日志记录)

---

## 1. 模块结构

每个业务模块包含以下文件：

```
user/
├── controller.ts    # 处理 HTTP 请求/响应
├── service.ts       # 业务逻辑处理
├── router.ts        # 路由定义
├── types.ts         # TypeScript 类型定义
├── constants.ts     # 模块常量（错误码、消息等）
└── index.ts         # 统一导出
```

---

## 2. Controller 规范

```typescript
/**
 * 用户控制器
 */
import { Request, Response } from "express";
import { success, error } from "../../utils/response";
import { generateTraceId, logUserOperation } from "../../utils/logUtils";
import * as userService from "./service";
import { RegisterParams } from "./types";
import { ErrorCode, MESSAGES, OPERATIONS } from "./constants";

export async function register(req: Request, res: Response): Promise<void> {
  const traceId = generateTraceId();
  const { username, password, email } = req.body as RegisterParams;

  if (!username || !password) {
    error(res, ErrorCode.BAD_REQUEST, MESSAGES.ALL_FIELDS_REQUIRED);
    return;
  }

  const result = await userService.register({ username, password, email });

  if (!result.success) {
    error(res, result.error!.code, result.error!.message);
    return;
  }

  logUserOperation(OPERATIONS.USER_REGISTER, MESSAGES.REGISTER_SUCCESS, {
    traceId,
    userId: result.data!.id,
  });

  success(res, result.data, MESSAGES.REGISTER_SUCCESS);
}
```

---

## 3. Service 规范

```typescript
/**
 * 用户服务层
 */
import { DatabaseFactory } from "../../database";
import { ErrorCode, ServiceResult } from "./types";
import { MESSAGES } from "./constants";
import { RegisterParams } from "./types";

function getDb() {
  return DatabaseFactory.getInstance();
}

export async function register(params: RegisterParams): Promise<ServiceResult> {
  try {
    const { username, password, email } = params;
    const db = getDb();

    const result = await db.insert(
      "INSERT INTO users (username, password, email) VALUES (?, ?, ?)",
      [username, password, email || null],
    );

    return {
      success: true,
      data: { id: result.insertId },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: MESSAGES.REGISTER_FAILED,
      },
    };
  }
}
```

---

## 4. Router 规范

```typescript
import { Router } from "express";
import * as userController from "./controller";

const router = Router();

router.post("/register", userController.register);
router.post("/login", userController.login);
router.put("/:id/status", userController.updateUserStatus);
router.delete("/:id", userController.deleteUser);

export default router;
```

---

## 5. TypeScript 类型定义

```typescript
export enum ErrorCode {
  SUCCESS = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_ERROR = 500,
}

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
  };
}

export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
  roleId?: number;
}
```

---

## 6. 常量定义

```typescript
export const MESSAGES = {
  REGISTER_SUCCESS: "注册成功",
  REGISTER_FAILED: "注册失败",
  LOGIN_SUCCESS: "登录成功",
  LOGIN_FAILED: "登录失败",
  ALL_FIELDS_REQUIRED: "请填写所有必填字段",
  USER_ALREADY_EXISTS: "用户已存在",
  USER_NOT_FOUND: "用户不存在",
};

export const OPERATIONS = {
  USER_REGISTER: "user_register",
  USER_LOGIN: "user_login",
  USER_DELETE: "user_delete",
};
```

---

## 7. 日志记录
- 不要使用 console.log 打印句，而要使用 winston 模块记录日志
- 开发环境下，使用 winston 记录日志到控制台，默认级别为 debug
- 生产环境下记录到文件，默认级别为 info
```typescript
import winston from "winston";
```
