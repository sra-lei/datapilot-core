/**
 * 统一响应格式工具
 */

import { Response } from 'express';

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
  return res.status(200).json(response);
}