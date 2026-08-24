/**
 * 启动时幂等建表与权限种子
 *
 * 目的：init.sql 只在 Docker 首次创建数据卷时执行；已有数据库（本地/既有环境）
 * 不会重跑 init.sql。这里在服务启动时执行相同语义的幂等 DDL（CREATE TABLE IF NOT EXISTS
 * / INSERT IGNORE / 按 INFORMATION_SCHEMA 判断补列），保证任何环境平滑升级、可重复执行。
 */

import { IDatabaseAdapter, QueryRow } from './IDatabaseAdapter';

/** 若列不存在则补充（MySQL 不支持 ADD COLUMN IF NOT EXISTS，用元数据判断） */
async function ensureColumn(
  db: IDatabaseAdapter,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const result = await db.query(
    'SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [ table, column ],
  );
  const count = Number((result.rows?.[0] as QueryRow)?.count || 0);
  if (count === 0) {
    await db.run(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  }
}

export async function ensureSchema(db: IDatabaseAdapter): Promise<void> {
  // 评估集（status: normal=正常（默认）/disabled=禁用/deleted=已删除，软删除）
  await db.run(`
    CREATE TABLE IF NOT EXISTS eval_sets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        doc_scope VARCHAR(255),
        status VARCHAR(20) DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 评估用例（expected_chapter 为 NULL 表示跨章节；expected_keywords 存 JSON 数组）
  await db.run(`
    CREATE TABLE IF NOT EXISTS eval_cases (
        id INT PRIMARY KEY AUTO_INCREMENT,
        set_id INT NOT NULL,
        case_id VARCHAR(64) NOT NULL,
        question TEXT NOT NULL,
        expected_chapter VARCHAR(255) NULL,
        expected_keywords JSON NOT NULL,
        category VARCHAR(50) NOT NULL,
        sort_order INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_set_case (set_id, case_id),
        FOREIGN KEY (set_id) REFERENCES eval_sets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 兼容旧表：早期版本 eval_cases 无 status 列（软删除升级）
  await ensureColumn(
    db,
    'eval_cases',
    'status',
    'status VARCHAR(20) DEFAULT \'normal\' AFTER sort_order',
  );

  // 兼容旧数据：早期两态版本用 active 表示生效，统一迁移为 normal（正常）
  await db.run('UPDATE eval_sets SET status = \'normal\' WHERE status = \'active\'');
  await db.run('UPDATE eval_cases SET status = \'normal\' WHERE status = \'active\'');

  // 评估运行结果（评估集运行入库后的唯一数据源；set_id 可空，ON DELETE SET NULL 保证软删评估集不丢历史）
  await db.run(`
    CREATE TABLE IF NOT EXISTS eval_runs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        set_id INT NULL,
        set_name VARCHAR(255) NULL,
        doc_scope VARCHAR(255) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        timestamp VARCHAR(32) NULL,
        total INT NOT NULL DEFAULT 0,
        passed INT NOT NULL DEFAULT 0,
        avg_score DOUBLE NOT NULL DEFAULT 0,
        avg_elapsed DOUBLE NOT NULL DEFAULT 0,
        pass_rate VARCHAR(20) NULL,
        category_stats JSON NULL,
        failed_cases JSON NULL,
        raw_report JSON NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_run_set (set_id),
        INDEX idx_run_created (created_at),
        CONSTRAINT fk_run_set FOREIGN KEY (set_id) REFERENCES eval_sets(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 评估运行-用例明细（运行快照，不关联 eval_cases：用例后续编辑/软删不影响历史运行）
  await db.run(`
    CREATE TABLE IF NOT EXISTS eval_run_cases (
        id INT PRIMARY KEY AUTO_INCREMENT,
        run_id INT NOT NULL,
        case_id VARCHAR(64) NOT NULL,
        question TEXT NOT NULL,
        score DOUBLE NULL,
        elapsed DOUBLE NULL,
        keywords_found JSON NULL,
        keyword_count INT NOT NULL DEFAULT 0,
        source_count INT NOT NULL DEFAULT 0,
        has_answer TINYINT(1) NOT NULL DEFAULT 0,
        chapter_match TINYINT(1) NULL,
        answer_preview TEXT NULL,
        error TEXT NULL,
        UNIQUE KEY uk_run_case (run_id, case_id),
        FOREIGN KEY (run_id) REFERENCES eval_runs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 评估集权限种子（与 init.sql 保持一致）
  await db.run(`
    INSERT IGNORE INTO permissions (name, description) VALUES
        ('eval:read', '查看评估集'),
        ('eval:write', '管理评估集')
  `);

  // admin 角色自动获得评估集权限
  await db.run(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'admin' AND p.name IN ('eval:read', 'eval:write')
  `);
}
