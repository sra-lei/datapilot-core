/**
 * 数据库管理模块 - 服务层
 */

import { DatabaseFactory, QueryRow } from "../../database";
import { ColumnInfo, QueryResult, ServiceResult, TableInfo } from "./types";

export class DatabaseManagerService {
  async getTables(): Promise<ServiceResult<TableInfo[]>> {
    try {
      const db = DatabaseFactory.getInstance();
      const result = await db.query(
        "SELECT table_name as name, 'table' as type FROM information_schema.tables WHERE table_schema = DATABASE()",
      );
      const tables = (result.rows || []) as unknown as TableInfo[];

      return {
        success: true,
        data: tables,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: `获取表列表失败: ${(error as Error).message}`,
        },
      };
    }
  }

  async getTableInfo(tableName: string): Promise<ServiceResult<ColumnInfo[]>> {
    try {
      const db = DatabaseFactory.getInstance();
      const result = await db.query(
        "SELECT ordinal_position as cid, column_name as name, data_type as type, is_nullable = 'NO' as notnull, column_default as dflt_value, column_type LIKE '%PRI%' as pk FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
        [tableName],
      );
      const columns = (result.rows || []).map((row) => ({
        cid: Number((row as QueryRow).cid),
        name: String((row as QueryRow).name),
        type: String((row as QueryRow).type),
        notnull: Number((row as QueryRow).notnull),
        dflt_value: (row as QueryRow).dflt_value || null,
        pk: Number((row as QueryRow).pk),
      })) as ColumnInfo[];

      return {
        success: true,
        data: columns,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: `获取表结构失败: ${(error as Error).message}`,
        },
      };
    }
  }

  async executeQuery(sql: string): Promise<ServiceResult<QueryResult>> {
    try {
      const trimmedSql = sql.trim().toLowerCase();
      if (!trimmedSql.startsWith("select")) {
        return {
          success: false,
          error: {
            code: 403,
            message: "只允许执行 SELECT 查询",
          },
        };
      }

      const db = DatabaseFactory.getInstance();
      const result = await db.query(sql);
      const rows = result.rows || [];
      const columns =
        rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

      return {
        success: true,
        data: {
          columns,
          rows: rows as Record<string, unknown>[],
          rowCount: rows.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: `查询失败: ${(error as Error).message}`,
        },
      };
    }
  }

  async getTableData(
    tableName: string,
    limit: number = 100,
  ): Promise<ServiceResult<QueryResult>> {
    try {
      const db = DatabaseFactory.getInstance();

      const columnsResult = await db.query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
        [tableName],
      );
      const columns = (columnsResult.rows || []).map((row) =>
        String((row as QueryRow).name),
      );

      const result = await db.query(`SELECT * FROM \`${tableName}\` LIMIT ?`, [
        limit,
      ]);
      const rows = result.rows || [];

      return {
        success: true,
        data: {
          columns,
          rows: rows as Record<string, unknown>[],
          rowCount: rows.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: `获取表数据失败: ${(error as Error).message}`,
        },
      };
    }
  }

  async getDatabaseStats(): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const db = DatabaseFactory.getInstance();

      const tableCountResult = await db.query(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE()",
      );
      const tableCount = Number(
        (tableCountResult.rows?.[0] as QueryRow)?.count || 0,
      );

      const tablesResult = await db.query(
        "SELECT table_name as name FROM information_schema.tables WHERE table_schema = DATABASE()",
      );
      const tables = (tablesResult.rows || []) as { name: string }[];

      const tableStats: Record<string, number> = {};
      let totalRows = 0;

      for (const table of tables) {
        const countResult = await db.query(
          `SELECT COUNT(*) as count FROM \`${table.name}\``,
        );
        const count = Number((countResult.rows?.[0] as QueryRow)?.count || 0);
        tableStats[table.name] = count;
        totalRows += count;
      }

      return {
        success: true,
        data: {
          tableCount,
          totalRows,
          tableStats,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: `获取数据库统计失败: ${(error as Error).message}`,
        },
      };
    }
  }
}

export const databaseManagerService = new DatabaseManagerService();
