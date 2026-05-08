import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../db/query.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedsDir = path.resolve(__dirname, "../../seeds");

async function run() {
  const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(seedsDir, file), "utf8");
    await query(sql);
    console.log(`seeded ${file}`);
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
