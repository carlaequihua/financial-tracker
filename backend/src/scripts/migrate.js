import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../db/query.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../../migrations");

async function run() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const already = await query("SELECT 1 FROM schema_migrations WHERE filename=$1", [file]);
    if (already.rowCount > 0) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await query(sql);
    await query("INSERT INTO schema_migrations(filename) VALUES($1)", [file]);
    console.log(`applied ${file}`);
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
