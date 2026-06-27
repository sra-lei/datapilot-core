/**
 * 数据库工厂类
 * 仅支持 MySQL 数据库
 */

import { IDatabaseAdapter } from "./IDatabaseAdapter";
import { MySQLAdapter } from "./MySQLAdapter";

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function getDefaultConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "trae",
  };
}

export class DatabaseFactory {
  private static instance: IDatabaseAdapter | null = null;

  static createAdapter(
    config: DatabaseConfig = getDefaultConfig(),
  ): IDatabaseAdapter {
    return new MySQLAdapter(config);
  }

  static getInstance(
    config: DatabaseConfig = getDefaultConfig(),
  ): IDatabaseAdapter {
    if (!DatabaseFactory.instance) {
      DatabaseFactory.instance = DatabaseFactory.createAdapter(config);
    }
    return DatabaseFactory.instance;
  }

  static async initialize(
    config: DatabaseConfig = getDefaultConfig(),
  ): Promise<IDatabaseAdapter> {
    const adapter = DatabaseFactory.getInstance(config);
    await adapter.initialize();
    return adapter;
  }

  static async close(): Promise<void> {
    if (DatabaseFactory.instance) {
      await DatabaseFactory.instance.close();
      DatabaseFactory.instance = null;
    }
  }

  static reset(): void {
    DatabaseFactory.instance = null;
  }
}

export function getDatabaseConfigFromEnv(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "trae",
  };
}
