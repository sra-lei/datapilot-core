-- ============================================
-- Trae Core 数据库初始化脚本（唯一权威文件）
-- 支持 MySQL 8.0+
--
-- 引用说明：
--   - services/core/docker-compose.yml / docker-compose.prod.yml / docker-compose.server.yml
--     通过 ./database/init 挂载到 /docker-entrypoint-initdb.d
--   - deploy/docker-compose.deploy.yml 通过 ../services/core/database/init 复用本文件
--
-- 注意：docker-entrypoint-initdb.d 仅在 MySQL 数据卷首次创建时执行；
--       已有数据库由服务启动时的 ensureSchema() 幂等补齐（内容与本文件保持一致）。
-- ============================================

-- 授予应用用户远程访问权限（与 .env 的 DB_USER / DB_NAME / DB_PASSWORD 一致）
CREATE USER IF NOT EXISTS 'datapolit-core'@'%' IDENTIFIED BY 'core_password';
GRANT ALL PRIVILEGES ON datapolit.* TO 'datapolit-core'@'%';
FLUSH PRIVILEGES;

-- ============================================
-- 基础表
-- ============================================

-- 创建 users 表（其他表的依赖）
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建权限表
CREATE TABLE IF NOT EXISTS permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建角色表
CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建角色-权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建用户-角色关联表
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 评估集管理
-- ============================================

-- 评估集（status: normal=正常（默认）/disabled=禁用/deleted=已删除，软删除）
CREATE TABLE IF NOT EXISTS eval_sets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    doc_scope VARCHAR(255),
    status VARCHAR(20) DEFAULT 'normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评估用例（expected_chapter 为 NULL 表示跨章节；expected_keywords 存 JSON 数组；
-- status: normal=正常（默认，可正常使用）/disabled=禁用（跑评估集时跳过）/deleted=已删除（软删除））
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 初始化默认数据
-- 权限全集与 services/core/src/modules/permission/constants.ts 的
-- DEFAULT_PERMISSIONS / DEFAULT_ROLES 保持一致，勿随意增删
-- ============================================

-- 插入默认权限（基础权限，与 DEFAULT_PERMISSIONS 对齐；* 由 hasPermission / 前端 manage-all 使用）
INSERT IGNORE INTO permissions (name, description) VALUES
    ('user:read', '查看用户'),
    ('user:create', '创建用户'),
    ('user:update', '更新用户'),
    ('user:delete', '删除用户'),
    ('role:read', '查看角色'),
    ('role:create', '创建角色'),
    ('role:update', '更新角色'),
    ('role:delete', '删除角色'),
    ('role:assign', '分配角色'),
    ('database:read', '查看数据库'),
    ('database:query', '执行查询'),
    ('system:settings', '系统设置'),
    ('*', '所有权限');

-- 评估集权限
INSERT IGNORE INTO permissions (name, description) VALUES
    ('eval:read', '查看评估集'),
    ('eval:write', '管理评估集');

-- 插入默认角色（admin / user / developer，与 DEFAULT_ROLES 对齐）
INSERT IGNORE INTO roles (name, description) VALUES
    ('admin', '系统管理员，拥有所有权限'),
    ('user', '普通用户，拥有基础权限'),
    ('developer', '开发人员，拥有数据库查询权限');

-- 为 admin 角色授予所有权限（含评估集权限）
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin';

-- 为 user 角色授予基础权限
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND p.name IN ('user:read', 'database:read');

-- 为 developer 角色授予基础权限 + 数据库查询权限
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'developer' AND p.name IN ('user:read', 'database:read', 'database:query');

-- 创建/更新默认管理员账户（用户名: Sra, 密码: admin123）
-- 已存在则更新关键字段，保证脚本可幂等重复执行
-- MySQL 8.0.19+ 行别名语法（VALUES() 自 8.0.20 起弃用）
INSERT INTO users (username, password, email, status) VALUES
    ('Sra', 'admin123', 'admin@example.com', 'active') AS new
ON DUPLICATE KEY UPDATE password = new.password;

-- 为 Sra 分配 admin 角色
INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'Sra' AND r.name = 'admin';
