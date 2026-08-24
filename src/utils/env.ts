/**
 * 环境变量配置工具
 */

import dotenv from 'dotenv';
import path from 'path';

// 环境类型
export type NodeEnv = 'development' | 'production' | 'test';

// 加载环境变量
export function loadEnv(): void {
  const env = process.env.NODE_ENV || 'development';
  const envPath = path.resolve(process.cwd(), `.env.${env}`);
  
  dotenv.config({ path: envPath });
}

// 获取环境变量
export function getEnv(key: string, defaultValue?: string): string {
  return process.env[key] || defaultValue || '';
}

// 获取布尔类型的环境变量
export function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

// 获取数字类型的环境变量
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// 环境配置
export const envConfig = {
  // 环境
  nodeEnv: (process.env.NODE_ENV || 'development') as NodeEnv,

  // 服务器
  port: parseInt(process.env.PORT || '3002', 10),

  // Swagger
  enableSwagger: process.env.ENABLE_SWAGGER !== 'false',

  // 数据库
  dbType: process.env.DB_TYPE || 'sqlite',
  sqlitePath: process.env.SQLITE_DB_PATH || './data/trae.db',

  // doc-kit（文档解析/入库微服务）：BFF 代理目标
  docKitHost: getEnv('DOC_KIT_HOST', '127.0.0.1'),
  docKitPort: getEnvNumber('DOC_KIT_PORT', 8100),
  docKitUrl: getEnv(
    'DOC_KIT_URL',
    `http://${getEnv('DOC_KIT_HOST', '127.0.0.1')}:${getEnvNumber('DOC_KIT_PORT', 8100)}`,
  ),
  docKitTimeoutMs: getEnvNumber('DOC_KIT_TIMEOUT_MS', 5 * 60 * 1000),

  // docs-seeker（RAG 问答服务）：评估集在线运行目标（POST /v1/chat）
  docsSeekerHost: getEnv('DOCS_SEEKER_HOST', '127.0.0.1'),
  docsSeekerPort: getEnvNumber('DOCS_SEEKER_PORT', 8001),
  docsSeekerUrl: getEnv(
    'DOCS_SEEKER_URL',
    `http://${getEnv('DOCS_SEEKER_HOST', '127.0.0.1')}:${getEnvNumber('DOCS_SEEKER_PORT', 8001)}`,
  ),
  docsSeekerTimeoutMs: getEnvNumber('DOCS_SEEKER_TIMEOUT_MS', 60 * 1000),

  // 开发环境判断
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

// 导出环境信息
export default envConfig;
