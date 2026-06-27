/**
 * Swagger API 文档配置 - 通用 Schema 组件
 */

export const swaggerComponents = {
  schemas: {
    // 基础响应
    BaseResponse: {
      type: 'object',
      properties: {
        status: { type: 'number', example: 200 },
        msg: { type: 'string', example: '操作成功' },
      },
    },

    // 用户信息
    UserInfo: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        username: { type: 'string' },
        email: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['active', 'inactive', 'deleted'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },

    // 登录参数
    LoginParams: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
    },

    // 注册参数
    RegisterParams: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        email: { type: 'string' },
        roleId: { type: 'number' },
      },
    },

    // 更新用户状态参数
    UpdateUserStatusParams: {
      type: 'object',
      required: ['userId', 'status'],
      properties: {
        userId: { type: 'number' },
        status: { type: 'string', enum: ['active', 'inactive', 'deleted'] },
      },
    },

    // 角色信息
    RoleInfo: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        description: { type: 'string', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },

    // 权限信息
    PermissionInfo: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        description: { type: 'string', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },

    // 数据库统计
    DatabaseStats: {
      type: 'object',
      properties: {
        tableCount: { type: 'number' },
        totalRows: { type: 'number' },
      },
    },

    // 表信息
    TableInfo: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        columns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              nullable: { type: 'boolean' },
              primaryKey: { type: 'boolean' },
              default: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  },

  responses: {
    Success: {
      description: '成功',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'number', example: 200 },
              msg: { type: 'string', example: '操作成功' },
            },
          },
        },
      },
    },

    Unauthorized: {
      description: '未授权',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'number', example: 401 },
              msg: { type: 'string', example: '未登录或登录已过期' },
            },
          },
        },
      },
    },

    Forbidden: {
      description: '禁止访问',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'number', example: 403 },
              msg: { type: 'string', example: '没有权限执行此操作' },
            },
          },
        },
      },
    },

    NotFound: {
      description: '资源不存在',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'number', example: 404 },
              msg: { type: 'string', example: '资源不存在' },
            },
          },
        },
      },
    },

    BadRequest: {
      description: '请求参数错误',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'number', example: 400 },
              msg: { type: 'string', example: '参数错误' },
            },
          },
        },
      },
    },
  },
};
