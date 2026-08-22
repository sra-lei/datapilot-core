/**
 * doc-kit 服务代理
 * 使用 Node 内置 http / https 模块流式转发，不引入新依赖。
 * - 请求体：req 直接 pipe 到上游（支持 multipart 大文件，不会整份加载到内存）
 * - 响应体：上游 res 直接 pipe 回客户端
 * - 超时：socket timeout + 代理端兜底 502 JSON（避免上游崩时 nginx 502 白屏）
 */

import { NextFunction, Request, Response } from "express";
import http from "http";
import https from "https";
import { URL } from "url";
import { logError } from "./logUtils";

export interface DocKitProxyOptions {
  target: string;
  timeoutMs?: number;
}

export function createDocKitProxy(options: DocKitProxyOptions) {
  const { target, timeoutMs = 5 * 60 * 1000 } = options;
  const targetUrl = new URL(target);
  const useHttps = targetUrl.protocol === "https:";
  const lib = useHttps ? https : http;

  return (req: Request, res: Response, _next: NextFunction): void => {
    // 保留原始路径前缀 /doc-kit/...（doc-kit 服务按方案 B 路由前缀暴露）
    const upstreamPath = (req.originalUrl || req.url) ?? "/";
    const upstreamHeaders: Record<string, string> = {};
    Object.entries(req.headers).forEach(([k, v]) => {
      if (v === undefined) return;
      if (Array.isArray(v)) {
        upstreamHeaders[k] = v.join(", ");
      } else {
        upstreamHeaders[k] = String(v);
      }
    });
    // 替换 Host 为上游目标 host，避免上游基于 Host 的路由失败
    upstreamHeaders.host = targetUrl.host;
    // X-Forwarded 头部（链路追踪）
    upstreamHeaders["x-forwarded-for"] =
      (req.headers["x-forwarded-for"] as string | undefined) ?? (req.ip || "");
    upstreamHeaders["x-forwarded-proto"] =
      (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;

    const upstreamReq = lib.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port ? Number(targetUrl.port) : useHttps ? 443 : 80,
        path: upstreamPath,
        method: req.method,
        headers: upstreamHeaders,
        timeout: timeoutMs,
      },
      (upstreamRes) => {
        // 转发 status code + headers
        res.status(upstreamRes.statusCode ?? 502);
        Object.entries(upstreamRes.headers).forEach(([k, v]) => {
          if (v === undefined) return;
          try {
            if (Array.isArray(v)) {
              res.setHeader(
                k,
                v.map((x) => String(x)),
              );
            } else {
              res.setHeader(k, String(v));
            }
          } catch {
            // 忽略非法 header（Content-Length 等 pipe 时让底层处理）
          }
        });
        upstreamRes.pipe(res);
        upstreamRes.on("error", (err) => {
          logError(
            "doc-kit proxy upstream response error",
            "doc-kit 上游响应异常",
            err,
          );
          if (!res.headersSent) {
            res.status(502).json({
              code: 502,
              status: 502,
              message: "doc-kit 服务上游响应异常",
              msg: "doc-kit 服务上游响应异常",
              data: null,
            });
          } else {
            try {
              res.end();
            } catch {
              /* ignore */
            }
          }
        });
      },
    );

    upstreamReq.on("timeout", () => {
      upstreamReq.destroy(new Error("doc-kit proxy timeout"));
    });
    upstreamReq.on("error", (err) => {
      logError(
        "doc-kit proxy upstream request error",
        "doc-kit 服务暂不可用（上游请求失败）",
        err,
      );
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          /* ignore */
        }
        return;
      }
      res.status(502).json({
        code: 502,
        status: 502,
        message: "doc-kit 服务暂不可用，请稍后再试",
        msg: "doc-kit 服务暂不可用，请稍后再试",
        data: null,
      });
    });

    // 客户端请求体 -> 上游请求体（流式；二进制原样透传，匹配 multipart boundary）
    req.pipe(upstreamReq);
    req.on("aborted", () => {
      upstreamReq.destroy(new Error("client request aborted"));
    });
    req.on("error", (err) => {
      logError(
        "doc-kit proxy client request error",
        "浏览器端请求体读取失败",
        err,
      );
      upstreamReq.destroy(
        err instanceof Error ? err : new Error("client error"),
      );
    });
  };
}

/**
 * 探活工具：GET /doc-kit/health 返回上游 data。
 * 用于 BFF 的健康检查接口：/core/health/doc-kit
 */
export async function pingDocKitHealth(target: string): Promise<{
  reachable: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}> {
  const useHttps = target.startsWith("https://");
  const lib = useHttps ? https : http;
  try {
    const targetUrl = new URL(target);
    const upstreamPath = "/doc-kit/health";
    const upstreamReq = lib.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port ? Number(targetUrl.port) : useHttps ? 443 : 80,
      path: upstreamPath,
      method: "GET",
      timeout: 5000,
      headers: { accept: "application/json" },
    });
    return await new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        finished = true;
      };
      upstreamReq.on("timeout", () => {
        if (finished) return;
        cleanup();
        upstreamReq.destroy(new Error("doc-kit health timeout"));
      });
      upstreamReq.on("error", (err) => {
        if (finished) return;
        cleanup();
        reject(err);
      });
      upstreamReq.on("response", (r) => {
        const chunks: Buffer[] = [];
        r.on("data", (c) =>
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
        );
        r.on("end", () => {
          if (finished) return;
          cleanup();
          const buf = Buffer.concat(chunks);
          let data: unknown = null;
          try {
            data = JSON.parse(buf.toString("utf8") || "{}");
          } catch {
            /* ignore parse error */
          }
          const payload = data as any;
          resolve({
            reachable: (r.statusCode ?? 0) >= 200 && (r.statusCode ?? 0) < 300,
            status: r.statusCode,
            data: payload?.data ?? payload,
          });
        });
        r.on("error", (err) => {
          if (finished) return;
          cleanup();
          reject(err);
        });
      });
      upstreamReq.end();
    });
  } catch (err) {
    return {
      reachable: false,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}
