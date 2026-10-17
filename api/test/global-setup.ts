import pg from "pg";
import { createDb } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrator.js";
import { seedExercises } from "../src/db/seed.js";
import { TEST_DATABASE_URL } from "./helpers.js";

// Runs once before the suite: make sure the fitness_test database exists, then
// apply the real migrations to it (the same code path production uses).
export default async function setup(): Promise<void> {
  const target = new URL(TEST_DATABASE_URL);
  const databaseName = target.pathname.slice(1);

  const admin = new URL(TEST_DATABASE_URL);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach Postgres for tests (${admin.host}). Start it with: docker compose up -d postgres\n${String(error)}`
    );
  }
  const exists = await client.query("select 1 from pg_database where datname = $1", [databaseName]);
  if (exists.rowCount === 0) await client.query(`create database "${databaseName}"`);
  await client.end();

  await runMigrations(TEST_DATABASE_URL);

  // The library is shared, read-only reference data: seed it once for the whole run.
  const { db, pool } = createDb(TEST_DATABASE_URL);
  try {
    await seedExercises(db);
  } finally {
    await pool.end();
  }
}
