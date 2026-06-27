/**
 * Swagger API 文档配置 - 路径定义
 */

export const swaggerPaths = {
  '/': {
    get: {
      summary: '服务器信息',
      responses: {
        '200': {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  docs: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },

  '/core/health': {
    get: {
      summary: '健康检查',
      tags: ['系统'],
      responses: {
        '200': {
          description: '服务正常',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'number', example: 200 },
                  msg: { type: 'string', example: '服务运行正常' },
                  data: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/core/user/login': {
    post: {
      tags: ['用户管理'],
      summary: '用户登录',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string', description: '用户名' },
                password: { type: 'string', description: '密码' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: '登录成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'number', example: 200 },
                  msg: { type: 'string', example: '登录成功' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      username: { type: 'string' },
                      roles: { type: 'array', items: { type: 'string' } },
                      permissions: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
        '401': { description: '用户名或密码错误' },
        '403': { description: '用户已被停用或删除' },
      },
    },
  },

  '/core/user/register': {
    post: {
      tags: ['用户管理'],
      summary: '用户注册',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string', description: '用户名' },
                password: { type: 'string', description: '密码' },
                email: { type: 'string', description: '邮箱（可选）' },
                roleId: { type: 'number', description: '角色ID（可选）' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: '注册成功' },
        '400': { description: '用户名已存在或参数错误' },
      },
    },
  },

  '/core/user/change-password': {
    post: {
      tags: ['用户管理'],
      summary: '修改密码',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'oldPassword', 'newPassword'],
              properties: {
                username: { type: 'string', description: '用户名' },
                oldPassword: { type: 'string', description: '旧密码' },
                newPassword: { type: 'string', description: '新密码' },
                force: {
                  type: 'boolean',
                  description: '强制修改（需要管理员权限）',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: '密码修改成功' },
        '400': { description: '原密码错误' },
        '403': { description: '没有权限' },
      },
    },
  },

  '/core/user/list': {
    get: {
      tags: ['用户管理'],
      summary: '获取用户列表',
      responses: {
        '200': {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'number', example: 200 },
                  msg: { type: 'string', example: '获取成功' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'number' },
                        username: { type: 'string' },
                        email: { type: 'string', nullable: true },
                        status: { type: 'string' },
                        created_at: { type: 'string' },
                        updated_at: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/core/user/status': {
    put: {
      tags: ['用户管理'],
      summary: '更新用户状态',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['userId', 'status'],
              properties: {
                userId: { type: 'number', description: '用户ID' },
                status: {
                  type: 'string',
                  enum: ['active', 'inactive'],
                  description: '用户状态',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: '状态更新成功' },
        '400': { description: '无效的状态值' },
        '403': { description: '没有权限' },
      },
    },
  },

  '/core/user/{id}': {
    delete: {
      tags: ['用户管理'],
      summary: '删除用户（软删除）',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '用户ID',
        },
      ],
      responses: {
        '200': { description: '删除成功' },
        '404': { description: '用户不存在' },
        '403': { description: '管理员用户不可删除' },
      },
    },
  },

  '/core/permission/permissions': {
    get: {
      tags: ['权限管理'],
      summary: '获取所有权限列表',
      responses: {
        '200': {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'number', example: 200 },
                  msg: { type: 'string', example: '获取权限列表成功' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'number' },
                        name: { type: 'string' },
                        description: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    post: {
      tags: ['权限管理'],
      summary: '创建权限',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: '权限名称' },
                description: { type: 'string', description: '权限描述' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: '创建成功' },
        '400': { description: '权限名称不能为空' },
      },
    },
  },

  '/core/permission/permissions/{id}': {
    delete: {
      tags: ['权限管理'],
      summary: '删除权限',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '权限ID',
        },
      ],
      responses: {
        '200': { description: '删除成功' },
        '404': { description: '权限不存在' },
      },
    },
  },

  '/core/permission/roles': {
    get: {
      tags: ['权限管理'],
      summary: '获取所有角色列表',
      responses: {
        '200': { description: '成功' },
      },
    },
    post: {
      tags: ['权限管理'],
      summary: '创建角色',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: '角色名称' },
                description: { type: 'string', description: '角色描述' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: '创建成功' },
        '400': { description: '角色名称不能为空' },
      },
    },
  },

  '/core/permission/roles/{id}': {
    get: {
      tags: ['权限管理'],
      summary: '获取角色详情（包括权限）',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '角色ID',
        },
      ],
      responses: {
        '200': { description: '成功' },
        '404': { description: '角色不存在' },
      },
    },
    put: {
      tags: ['权限管理'],
      summary: '更新角色',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '角色ID',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: '角色名称' },
                description: { type: 'string', description: '角色描述' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: '更新成功' },
      },
    },
    delete: {
      tags: ['权限管理'],
      summary: '删除角色',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '角色ID',
        },
      ],
      responses: {
        '200': { description: '删除成功' },
        '404': { description: '角色不存在' },
      },
    },
  },

  '/core/permission/roles/{id}/permissions': {
    post: {
      tags: ['权限管理'],
      summary: '为角色授予权限',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '角色ID',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['permissionId'],
              properties: {
                permissionId: { type: 'number', description: '权限ID' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: '授权成功' },
      },
    },
    delete: {
      tags: ['权限管理'],
      summary: '撤销角色权限',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '角色ID',
        },
        {
          name: 'permissionId',
          in: 'query',
          required: true,
          schema: { type: 'number' },
          description: '权限ID',
        },
      ],
      responses: {
        '200': { description: '撤销成功' },
      },
    },
  },

  '/core/permission/users/{userId}/roles': {
    post: {
      tags: ['权限管理'],
      summary: '为用户分配角色',
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '用户ID',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['roleId'],
              properties: {
                roleId: { type: 'number', description: '角色ID' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: '分配成功' },
      },
    },
    delete: {
      tags: ['权限管理'],
      summary: '撤销用户角色',
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '用户ID',
        },
        {
          name: 'roleId',
          in: 'query',
          required: true,
          schema: { type: 'number' },
          description: '角色ID',
        },
      ],
      responses: {
        '200': { description: '撤销成功' },
      },
    },
  },

  '/core/permission/users/{userId}/permissions': {
    get: {
      tags: ['权限管理'],
      summary: '获取用户的角色和权限',
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'number' },
          description: '用户ID',
        },
      ],
      responses: {
        '200': {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'number', example: 200 },
                  msg: { type: 'string', example: '获取用户权限成功' },
                  data: {
                    type: 'object',
                    properties: {
                      roles: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'number' },
                            name: { type: 'string' },
                          },
                        },
                      },
                      permissions: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/core/database/tables': {
    get: {
      tags: ['数据库管理'],
      summary: '获取所有表',
      responses: {
        '200': {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'number', example: 200 },
                  msg: { type: 'string', example: '获取表列表成功' },
                  data: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/core/database/tables/{name}/info': {
    get: {
      tags: ['数据库管理'],
      summary: '获取表结构',
      parameters: [
        {
          name: 'name',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: '表名',
        },
      ],
      responses: {
        '200': { description: '成功' },
        '404': { description: '表不存在' },
      },
    },
  },

  '/core/database/tables/{name}/data': {
    get: {
      tags: ['数据库管理'],
      summary: '获取表数据',
      parameters: [
        {
          name: 'name',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: '表名',
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'number', default: 100 },
          description: '返回记录数',
        },
      ],
      responses: {
        '200': { description: '成功' },
        '404': { description: '表不存在' },
      },
    },
  },

  '/core/database/query': {
    post: {
      tags: ['数据库管理'],
      summary: '执行 SQL 查询',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['sql'],
              properties: {
                sql: { type: 'string', description: 'SQL 查询语句' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: '查询成功' },
        '400': { description: 'SQL 语句错误' },
      },
    },
  },

  '/core/database/stats': {
    get: {
      tags: ['数据库管理'],
      summary: '获取数据库统计信息',
      responses: {
        '200': {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'number', example: 200 },
                  msg: { type: 'string', example: '获取统计信息成功' },
                  data: {
                    type: 'object',
                    properties: {
                      tableCount: { type: 'number' },
                      totalRows: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
