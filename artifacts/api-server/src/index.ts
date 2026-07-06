import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocket } from "./lib/websocket";
import { runMigrations } from "./lib/run-migrations";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// إنشاء خادم HTTP لدعم WebSocket
const server = http.createServer(app);

// تفعيل WebSocket للتحديثات اللحظية
setupWebSocket(server);

// تشغيل migrations قبل بدء الخادم
runMigrations().then(() => {
  server.listen(port, () => {
    logger.info({ port }, "الخادم يعمل على المنفذ");
  });
}).catch((err) => {
  logger.error({ err }, "فشل في تشغيل migrations");
  process.exit(1);
});
