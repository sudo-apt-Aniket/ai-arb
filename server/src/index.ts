import { appConfig } from "./config";
import { createApp } from "./app";

const { app } = createApp(appConfig);

app.listen(appConfig.PORT, "127.0.0.1", () => {
  console.log(`AI Arbitrage Engine API listening on http://127.0.0.1:${appConfig.PORT}`);
});
