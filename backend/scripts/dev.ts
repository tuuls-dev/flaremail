import { migrateDatabase } from "./migrate";
await migrateDatabase();
const appProcess = Bun.spawn(["bun", "run", "dev:app"], { stdout: "inherit", stderr: "inherit" });
process.on("SIGINT", () => appProcess.kill());
process.on("SIGTERM", () => appProcess.kill());
process.exitCode = await appProcess.exited;
