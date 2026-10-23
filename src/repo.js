export class TravelError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

export function createRepo(pool) {
  return {
    async travellers() {
      const { rows } = await pool.query(`
        SELECT t.id, t.name, t.color, count(v.country_code)::int AS visited
        FROM travellers t LEFT JOIN visits v ON v.traveller_id = t.id
        GROUP BY t.id ORDER BY t.id`);
      return rows;
    },

    async countryCount() {
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM countries");
      return rows[0].n;
    },

    async countryNames() {
      const { rows } = await pool.query("SELECT name FROM countries ORDER BY name");
      return rows.map((r) => r.name);
    },

    async visitsFor(travellerId) {
      const { rows } = await pool.query(
        `SELECT v.country_code AS code, c.name FROM visits v JOIN countries c ON c.code = v.country_code
         WHERE v.traveller_id = $1 ORDER BY v.added_at DESC`,
        [travellerId],
      );
      return rows;
    },

    /** For the family view: how many travellers have been to each country. */
    async familyCounts() {
      const { rows } = await pool.query("SELECT country_code AS code, count(*)::int AS n FROM visits GROUP BY country_code");
      return Object.fromEntries(rows.map((r) => [r.code.trim(), r.n]));
    },

    async addTraveller(name, color) {
      const cleanName = String(name ?? "").trim();
      if (!cleanName || cleanName.length > 30) throw new TravelError("Names need 1–30 characters.");
      if (!/^#[0-9a-f]{6}$/i.test(color ?? "")) throw new TravelError("Pick a valid colour.");
      try {
        const { rows } = await pool.query("INSERT INTO travellers (name, color) VALUES ($1, $2) RETURNING id", [cleanName, color]);
        return rows[0].id;
      } catch (error) {
        if (error.code === "23505") throw new TravelError(`There's already a traveller called ${cleanName}.`, 409);
        throw error;
      }
    },

    async removeTraveller(id) {
      await pool.query("DELETE FROM travellers WHERE id = $1", [id]);
    },

    /**
     * Resolve free text to a country: exact name, then exact code, then "starts with", then "contains".
     * Returns the best match so "united k" → United Kingdom and "IN" → India.
     */
    async findCountry(query) {
      const term = String(query ?? "").trim();
      if (term.length < 2) throw new TravelError("Type at least two letters of a country.");
      const { rows } = await pool.query(
        `SELECT code, name FROM countries
         WHERE lower(name) = lower($1) OR lower(code) = lower($1) OR name ILIKE $2
         ORDER BY (lower(name) = lower($1)) DESC, (lower(code) = lower($1)) DESC, (name ILIKE $3) DESC, length(name)
         LIMIT 1`,
        [term, `%${term.replace(/[%_\\]/g, "\\$&")}%`, `${term.replace(/[%_\\]/g, "\\$&")}%`],
      );
      if (!rows[0]) throw new TravelError(`Couldn't find a country matching “${term}”.`, 404);
      return { code: rows[0].code.trim(), name: rows[0].name };
    },

    async addVisit(travellerId, code) {
      const { rowCount } = await pool.query(
        "INSERT INTO visits (traveller_id, country_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [travellerId, code],
      );
      return rowCount === 1;
    },

    async toggleVisit(travellerId, code) {
      const { rowCount } = await pool.query("DELETE FROM visits WHERE traveller_id = $1 AND country_code = $2", [travellerId, code]);
      if (rowCount === 0) await pool.query("INSERT INTO visits (traveller_id, country_code) VALUES ($1, $2)", [travellerId, code]);
      return rowCount === 0;
    },
  };
}
