/**
 * doc-kit 服务间 HTTP 客户端
 * 统一解析 doc-kit 响应 {status, msg, data}；非 200 或 HTTP 非 2xx 抛错。
 * 供任务引擎（异步生成任务提交/轮询）等内部服务使用；前端请求走 /doc-kit 代理，不经过这里。
 */

import { envConfig, logger } from './index';

export interface DocKitRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

/** 调 doc-kit，返回 data 字段；失败抛错（含 msg） */
export async function docKitRequest<T = unknown>(
  path: string,
  options: DocKitRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    timeoutMs = 60 * 1000,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${envConfig.docKitUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await resp.json()) as { status?: number; msg?: string; data?: T };
    if (!resp.ok || data.status !== 200) {
      throw new Error(data.msg || `doc-kit 返回 ${resp.status}`);
    }
    return data.data as T;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`doc-kit 请求超时（${path}）`);
    }
    logger.error('doc-kit 服务间调用失败', { error, path, method });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
