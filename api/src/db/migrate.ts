import { runMigrations } from "./migrator.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

runMigrations(url)
  .then(() => console.log("Migrations complete."))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
