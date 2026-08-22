/**
 * MySQL适配器
 * 用于生产环境
 */

import mysql, { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { IDatabaseAdapter, QueryResult, QueryRow } from "./IDatabaseAdapter";

export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class MySQLAdapter implements IDatabaseAdapter {
  private pool: Pool | null = null;
  private config: MySQLConfig;

  constructor(config: MySQLConfig) {
    this.config = config;
  }

  /**
   * 初始化数据库连接
   * 编码安全：强制使用 utf8mb4（含 4-byte emoji/生僻字），
   * 连接建立后立即 SET NAMES utf8mb4，杜绝因 MySQL 实例默认字符集为 latin1/gbk
   * 导致的"中文存入时 UTF-8 bytes 被按 latin1 编码 → 再按 latin1 读出 → 前端显示 æ‰€æœ‰ 类乱码"。
   */
  async initialize(): Promise<void> {
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      charset: "utf8mb4",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const connection = await this.pool.getConnection();
    try {
      await connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
      await connection.query(
        "SET SESSION character_set_client=utf8mb4, character_set_connection=utf8mb4, character_set_results=utf8mb4",
      );
    } finally {
      connection.release();
    }
  }

  /**
   * 执行查询
   */
  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) throw new Error("Database not initialized");

    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);

    return { rows: rows as QueryRow[] };
  }

  /**
   * 执行插入
   */
  async insert(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) throw new Error("Database not initialized");

    const [result] = await this.pool.query<ResultSetHeader>(sql, params);

    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows,
    };
  }

  /**
   * 执行更新
   */
  async update(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) throw new Error("Database not initialized");

    const [result] = await this.pool.query<ResultSetHeader>(sql, params);

    return { affectedRows: result.affectedRows };
  }

  /**
   * 执行删除
   */
  async delete(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) throw new Error("Database not initialized");

    const [result] = await this.pool.query<ResultSetHeader>(sql, params);

    return { affectedRows: result.affectedRows };
  }

  /**
   * 执行DDL语句（创建表等）
   */
  async run(sql: string): Promise<void> {
    if (!this.pool) throw new Error("Database not initialized");
    await this.pool.query(sql);
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * 获取适配器名称
   */
  getName(): string {
    return "MySQL";
  }
}
