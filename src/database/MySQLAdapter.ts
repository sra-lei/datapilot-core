/**
 * MySQL适配器
 * 用于生产环境
 */

import mysql, {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
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
  /** 当前事务连接（withTransaction 期间非空；单例串行化保证同一时刻只有一个事务） */
  private txConnection: PoolConnection | null = null;
  /** 事务串行化队列：避免并发 withTransaction 复用同一事务连接导致数据串写 */
  private txQueue: Promise<unknown> = Promise.resolve();

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

  /** 事务期间使用事务连接，否则使用连接池 */
  private getTarget(): Pool | PoolConnection {
    if (!this.pool) throw new Error("Database not initialized");
    return this.txConnection ?? this.pool;
  }

  /**
   * 执行查询
   */
  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const [rows] = await this.getTarget().query<RowDataPacket[]>(sql, params);

    return { rows: rows as QueryRow[] };
  }

  /**
   * 执行插入
   */
  async insert(sql: string, params?: unknown[]): Promise<QueryResult> {
    const [result] = await this.getTarget().query<ResultSetHeader>(sql, params);

    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows,
    };
  }

  /**
   * 执行更新
   */
  async update(sql: string, params?: unknown[]): Promise<QueryResult> {
    const [result] = await this.getTarget().query<ResultSetHeader>(sql, params);

    return { affectedRows: result.affectedRows };
  }

  /**
   * 执行删除
   */
  async delete(sql: string, params?: unknown[]): Promise<QueryResult> {
    const [result] = await this.getTarget().query<ResultSetHeader>(sql, params);

    return { affectedRows: result.affectedRows };
  }

  /**
   * 执行DDL语句（创建表等）
   */
  async run(sql: string): Promise<void> {
    await this.getTarget().query(sql);
  }

  /**
   * 在事务中执行回调：begin → fn → commit；异常则 rollback 并上抛。
   * 通过串行化队列保证同一时刻只有一个活跃事务（单例适配器 + 低并发管理台场景足够）。
   * 注意：回调内不要再嵌套调用 withTransaction（会等待队列形成死锁），
   * 需要嵌套请直接复用入参 db 执行 SQL。
   */
  withTransaction<T>(fn: (db: IDatabaseAdapter) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.pool) throw new Error("Database not initialized");
      const connection = await this.pool.getConnection();
      this.txConnection = connection;
      try {
        await connection.beginTransaction();
        const result = await fn(this);
        await connection.commit();
        return result;
      } catch (err) {
        try {
          await connection.rollback();
        } catch {
          // 回滚失败（如连接已断）时保留原始错误
        }
        throw err;
      } finally {
        this.txConnection = null;
        connection.release();
      }
    };

    // 串行化：前一个事务（成功或失败）结束后才启动下一个
    const next = this.txQueue.then(run, run);
    this.txQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
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
