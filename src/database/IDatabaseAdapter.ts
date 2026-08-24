/**
 * 数据库适配层接口
 * 定义统一的数据库操作接口，支持多种数据库实现
 */

// 查询结果行类型
export interface QueryRow {
  [ key: string ]: unknown;
}

// 查询结果类型
export interface QueryResult {
  rows?: QueryRow[];
  insertId?: number;
  affectedRows?: number;
}

/**
 * 数据库适配器接口
 * 所有数据库适配器必须实现此接口
 */
export interface IDatabaseAdapter {
  /**
   * 初始化数据库连接
   */
  initialize(): Promise<void>;

  /**
   * 执行查询
   * @param sql SQL语句
   * @param params 参数数组
   */
  query(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * 执行插入
   * @param sql SQL语句
   * @param params 参数数组
   */
  insert(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * 执行更新
   * @param sql SQL语句
   * @param params 参数数组
   */
  update(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * 执行删除
   * @param sql SQL语句
   * @param params 参数数组
   */
  delete(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * 执行DDL语句（创建表等）
   * @param sql SQL语句
   */
  run(sql: string): Promise<void>;

  /**
   * 在事务中执行回调；回调内的所有操作原子提交或整体回滚。
   * @param fn 事务回调（入参为当前事务绑定的适配器，回调内应使用该实例执行 SQL）
   */
  withTransaction<T>(fn: (db: IDatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * 关闭数据库连接
   */
  close(): Promise<void>;

  /**
   * 获取适配器名称
   */
  getName(): string;
}
