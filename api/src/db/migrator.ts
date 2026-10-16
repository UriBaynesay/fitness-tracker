import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Resolved from this file, so it is api/drizzle/migrations from both src/ (tsx)
// and dist/ (the production image), never from the process's working directory.
const migrationsFolder = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
