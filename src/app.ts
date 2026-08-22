/**
 * Express 应用配置
 */

import cors from "cors";
import express, { Application, NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./constants/swaggerConfig";
import databaseManagerRouter from "./modules/database-manager/router";
import evalRouter from "./modules/eval/router";
import permissionRouter from "./modules/permission/router";
import userRouter from "./modules/user/router";
import { envConfig, success } from "./utils";
import { createDocKitProxy, pingDocKitHealth } from "./utils/docKitProxy";
import { logSystem } from "./utils/logUtils";

const app: Application = express();

// 中间件
app.use(cors());
// express.json 仅作用于 Content-Type=application/json 的请求；
// 上传文件（multipart/form-data / 二进制）走 body 流式代理，不会被解析干扰。
app.use(express.json());

// 编码兜底：对所有 JSON 响应强制声明 Content-Type: application/json; charset=utf-8
// - 即使下游 success/error/paginated 没调用（例如有人直接 res.json()），也能保证 header 正确。
// - 配合前端 request.ts 的"arrayBuffer + TextDecoder('utf-8')"，彻底杜绝浏览器按
//   ISO-8859-1 解码导致的中文乱码（截图里的 æ‰€æœ‰ 类 mojibake）。
app.use((_req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res) as typeof res.json;
  (res as Response & { _patchedJson?: boolean })._patchedJson = true;
  res.json = ((body?: unknown) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    return originalJson(body);
  }) as typeof res.json;
  next();
});

// doc-kit 代理：放在其他业务路由之前，避免前缀误匹配。
// 透传前端上传的二进制 body（multipart/form-data，含 boundary），
// 保证大文件/异步 ingest 正常提交。
const docKitProxyMiddleware = createDocKitProxy({
  target: envConfig.docKitUrl,
  timeoutMs: envConfig.docKitTimeoutMs,
});
app.use(
  "/doc-kit",
  (req: Request, res: Response, next: NextFunction) => {
    // 对 application/json 之外的大 body 请求直接跳过 express.json 缓存逻辑，
    // 实际 body 仍由代理中间件流式 pipe，这里交给它处理。
    docKitProxyMiddleware(req, res, next);
  },
);

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

// doc-kit 上游健康检查：便于前端区分"代理挂了"还是"doc-kit 未启动"
app.get("/core/health/doc-kit", async (_req: Request, res: Response) => {
  const result = await pingDocKitHealth(envConfig.docKitUrl);
  success(res, {
    status: result.reachable ? "ok" : "down",
    upstream: envConfig.docKitUrl,
    upstreamStatus: result.status ?? null,
    reachable: result.reachable,
    data: result.data ?? null,
    error: result.error ?? null,
  }, result.reachable ? "doc-kit 可达" : "doc-kit 不可达");
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
      docKit: {
        target: envConfig.docKitUrl,
        timeoutMs: envConfig.docKitTimeoutMs,
      },
    };
    res.json(response);
  });
}

export default app;
