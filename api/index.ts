import { appConfig } from "../server/src/config";
import { createApp } from "../server/src/app";

// Writable database file for SQLite on Vercel Serverless
const vercelDbPath = "/tmp/ai-arb.sqlite";

const config = {
  ...appConfig,
  DATABASE_PATH: vercelDbPath
};

const { app } = createApp(config);

export default app;
