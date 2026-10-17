import { createDb } from "./index.js";
import { runMigrations } from "./migrator.js";
import { seedExercises } from "./seed.js";

// The one deploy-time database command: schema first, then the exercise library.
// Both steps are idempotent, so it is safe to run on every deploy.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  await runMigrations(url);
  console.log("Migrations complete.");

  const { db, pool } = createDb(url);
  try {
    const count = await seedExercises(db);
    console.log(`Seeded ${count} exercises.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
