import { readFile } from "node:fs/promises";
import world from "@svg-maps/world";

/** Create tables and load every country from the map data, so the DB and the SVG always agree. */
export async function setupDatabase(pool, { demo = true } = {}) {
  await pool.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
  const codes = world.locations.map((l) => l.id);
  const names = world.locations.map((l) => l.name);
  await pool.query(
    `INSERT INTO countries (code, name)
     SELECT * FROM unnest($1::varchar[], $2::varchar[])
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
    [codes, names],
  );
  if (demo) {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM travellers");
    if (rows[0].n === 0) {
      await pool.query(`
        WITH t AS (
          INSERT INTO travellers (name, color) VALUES ('Aarav', '#14b8a6'), ('Asha', '#f97316') RETURNING id, name
        )
        INSERT INTO visits (traveller_id, country_code)
        SELECT t.id, c FROM t, unnest(CASE t.name
          WHEN 'Aarav' THEN ARRAY['in','np','bt','th','sg','ae']
          ELSE ARRAY['in','fr','it','jp','us','gb','ch'] END) AS c`);
    }
  }
  return codes.length;
}
