/**
 * 服务器入口文件
 */

import app from "./app";
import { LOG_OPERATIONS, SYSTEM_MESSAGES } from "./constants";
import { DatabaseFactory, getDatabaseConfigFromEnv } from "./database";
import { ensureSchema } from "./database/ensureSchema";
import { taskWorker } from "./modules/task";
import { envConfig, loadEnv, logError, logSystem } from "./utils";

// 加载环境变量
loadEnv();

const PORT = envConfig.port;

// 启动服务器
async function startServer(): Promise<void> {
  try {
    const config = getDatabaseConfigFromEnv();
    const db = await DatabaseFactory.initialize(config);

    // 幂等建表与权限种子（已有数据库不会重跑 init.sql，启动时保证表结构就绪）
    await ensureSchema(db);
    logSystem("schema", "数据库表结构与权限种子已就绪", {
      dbType: db.getName(),
    });

    // 任务引擎启动：重启恢复（queued/running → failed）+ 保留策略定时清理
    taskWorker.init();
    logSystem("task-worker", "任务引擎已启动（进程内串行队列）", {
      dbType: db.getName(),
    });

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
