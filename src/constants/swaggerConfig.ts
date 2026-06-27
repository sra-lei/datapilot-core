/**
 * Swagger API 文档配置 - 统一导出
 */

import { swaggerInfo, swaggerServers } from './swaggerInfo';
import { swaggerTags } from './swaggerTags';
import { swaggerPaths } from './swaggerPaths';
import { swaggerComponents } from './swaggerComponents';

/**
 * Swagger 配置对象
 */
export const swaggerSpec = {
  openapi: '3.0.0',
  info: swaggerInfo,
  servers: swaggerServers,
  tags: swaggerTags,
  paths: swaggerPaths,
  components: swaggerComponents,
};

export { swaggerInfo, swaggerServers, swaggerTags, swaggerPaths, swaggerComponents };
