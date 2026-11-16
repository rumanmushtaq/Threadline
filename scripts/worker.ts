import "dotenv/config";
import { createDb } from "../src/server/db";
import { runMaintenance } from "../src/server/maintenance";
import "../src/server/orders";

// Long-running worker for VPS / Docker deployments. Safe to run next to the cron route.
const { db, close } = createDb(process.env.DATABASE_URL!);
let stopping = false;
const stop = () => {
  stopping = true;
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function loop() {
  console.log("Threadline worker started");
  while (!stopping) {
    try {
      const r = await runMaintenance(db);
      if (r.ai.processed) console.log(`Processed ${r.ai.processed} AI job(s)`);
    } catch (err) {
      console.error("Worker cycle failed", err);
    }
    for (let i = 0; i < 10 && !stopping; i++) await new Promise((r) => setTimeout(r, 1000));
  }
  await close();
  console.log("Threadline worker stopped");
}

loop();
