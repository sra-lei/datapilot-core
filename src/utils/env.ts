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
  
  // 开发环境判断
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

// 导出环境信息
export default envConfig;
