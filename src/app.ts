/**
 * Express 应用配置
 */

import cors from "cors";
import express, { Application, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./constants/swaggerConfig";
import databaseManagerRouter from "./modules/database-manager/router";
import evalRouter from "./modules/eval/router";
import permissionRouter from "./modules/permission/router";
import userRouter from "./modules/user/router";
import { envConfig, success } from "./utils";
import { logSystem } from "./utils/logUtils";

const app: Application = express();

// 中间件
app.use(cors());
app.use(express.json());

// Swagger UI - 仅在开发环境或启用 Swagger 时加载
if (envConfig.isDevelopment || envConfig.enableSwagger) {
  app.use("/core/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logSystem("swagger", "Swagger API 文档已启用", {
    url: `http://localhost:${envConfig.port}/core/api-docs`,
  });
} else {
  logSystem("swagger", "Swagger API 文档已禁用", {
    nodeEnv: envConfig.nodeEnv,
  });
}

// 路由配置
app.use("/core/user", userRouter);
app.use("/core/database", databaseManagerRouter);
app.use("/core/permission", permissionRouter);
app.use("/core", evalRouter);

// 基础路由
app.get("/core/health", (_req: Request, res: Response) => {
  success(res, { status: "ok" }, "服务运行正常");
});

// Swagger API 文档信息 - 仅在启用 Swagger 时显示
if (envConfig.isDevelopment || envConfig.enableSwagger) {
  app.get("/", (_req: Request, res: Response) => {
    const response: any = {
      message: "Trae Core Service",
      version: "1.0.0",
      status: "running",
      nodeEnv: envConfig.nodeEnv,
      docs: `http://localhost:${envConfig.port}/core/api-docs`,
    };
    res.json(response);
  });
}

export default app;
