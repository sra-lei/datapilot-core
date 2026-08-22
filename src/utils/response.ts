/**
 * 统一响应格式工具
 *
 * 编码安全：所有出口在 send 之前显式 setHeader('Content-Type', 'application/json; charset=utf-8')
 *   - 不依赖 Express res.json() 的自动行为（反向代理 / 压缩中间件 可能会剥离 charset）
 *   - 前端 request.ts 同时也走"arrayBuffer 强制 UTF-8 解码"兜底，双保险避免中文 mojibake
 */

import { Response } from 'express';

const JSON_UTF8 = 'application/json; charset=utf-8';

/**
 * 统一响应接口
 */
export interface ApiResponse<T = unknown> {
  status: number;
  msg: string;
  data?: T;
}

/**
 * 成功响应
 * @param res Express Response 对象
 * @param data 返回的数据
 * @param msg 响应消息
 * @param status HTTP 状态码
 */
export function success<T>(
  res: Response,
  data: T | null = null,
  msg: string = '操作成功',
  status: number = 200
): Response {
  const response: ApiResponse<T> = {
    status,
    msg,
    data: data || undefined,
  };
  res.setHeader('Content-Type', JSON_UTF8);
  return res.status(status).json(response);
}

/**
 * 错误响应
 * @param res Express Response 对象
 * @param status HTTP 状态码
 * @param msg 错误消息
 */
export function error(
  res: Response,
  status: number,
  msg: string
): Response {
  const response: ApiResponse = {
    status,
    msg,
  };
  res.setHeader('Content-Type', JSON_UTF8);
  return res.status(status).json(response);
}

/**
 * 分页响应
 * @param res Express Response 对象
 * @param data 数据列表
 * @param total 总数
 * @param page 当前页
 * @param pageSize 每页大小
 * @param msg 响应消息
 */
export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  msg: string = '获取成功'
): Response {
  const response: ApiResponse<{
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  }> = {
    status: 200,
    msg,
    data: {
      list: data,
      total,
      page,
      pageSize,
    },
  };
  res.setHeader('Content-Type', JSON_UTF8);
  return res.status(200).json(response);
}