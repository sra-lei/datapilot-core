/**
 * 服务器入口文件
 */

import app from "./app";
import { LOG_OPERATIONS, SYSTEM_MESSAGES } from "./constants";
import { DatabaseFactory, getDatabaseConfigFromEnv } from "./database";
import { envConfig, loadEnv, logError, logSystem } from "./utils";

// 加载环境变量
loadEnv();

const PORT = envConfig.port;

// 启动服务器
async function startServer(): Promise<void> {
  try {
    const config = getDatabaseConfigFromEnv();
    const db = await DatabaseFactory.initialize(config);

    logSystem(
      LOG_OPERATIONS.SERVER_START,
      `数据库初始化成功，使用 ${db.getName()} 适配器`,
      {
        port: PORT,
        nodeEnv: envConfig.nodeEnv,
        dbType: db.getName(),
        enableSwagger: envConfig.enableSwagger,
      },
    );

    app.listen(PORT, () => {
      logSystem(
        LOG_OPERATIONS.SERVER_START,
        SYSTEM_MESSAGES.SERVER_START_SUCCESS,
        {
          port: PORT,
          nodeEnv: envConfig.nodeEnv,
          enableSwagger: envConfig.enableSwagger,
        },
      );
    });
  } catch (error) {
    logError(
      LOG_OPERATIONS.SERVER_START,
      SYSTEM_MESSAGES.SERVER_START_FAILED,
      error,
      {
        port: PORT,
      },
    );
  }
}

startServer();
