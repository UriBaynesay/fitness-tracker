import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const app = await buildApp({ config, db });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
