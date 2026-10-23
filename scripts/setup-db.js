import { createPool } from "../src/db.js";
import { setupDatabase } from "../src/setup.js";

const pool = createPool();
try {
  const count = await setupDatabase(pool);
  console.log(`✔ schema ready, ${count} countries loaded`);
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
