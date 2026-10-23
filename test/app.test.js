import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createPool } from "../src/db.js";
import { createRepo } from "../src/repo.js";
import { setupDatabase } from "../src/setup.js";

describe("Wanderlog with PostgreSQL", { skip: !process.env.DATABASE_URL && "DATABASE_URL not set" }, () => {
  let pool;
  let repo;
  let server;
  let base;

  before(async () => {
    pool = createPool();
    await pool.query("DROP TABLE IF EXISTS visits, travellers, countries");
    await setupDatabase(pool, { demo: false });
    repo = createRepo(pool);
    server = createApp({ repo }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await pool?.end();
  });

  const post = (path, body) => fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  const flash = (res) => {
    const params = new URL(res.headers.get("location"), base).searchParams;
    return params.get("msg") ?? params.get("err") ?? "";
  };

  test("all map countries are loaded", async () => {
    assert.ok((await repo.countryCount()) > 200);
  });

  test("findCountry prefers exact, then code, then prefix", async () => {
    assert.equal((await repo.findCountry("india")).code, "in");
    assert.equal((await repo.findCountry("JP")).name, "Japan");
    assert.equal((await repo.findCountry("united k")).name, "United Kingdom");
    await assert.rejects(repo.findCountry("Atlantis"), /Couldn't find/);
    await assert.rejects(repo.findCountry("%"), /two letters/);
  });

  test("traveller lifecycle: add, visit, duplicate, toggle, cascade delete", async () => {
    const created = await post("/travellers", { name: "Meera", color: "#8b5cf6" });
    assert.equal(created.status, 303);
    const id = new URL(created.headers.get("location"), base).searchParams.get("t");

    const added = await post(`/travellers/${id}/visits`, { country: "Japan" });
    assert.match(flash(added), /Added Japan/);

    const dupe = await post(`/travellers/${id}/visits`, { country: "jp" });
    assert.match(flash(dupe), /already on the map/);

    await post(`/travellers/${id}/toggle`, { code: "fr" });
    let codes = (await repo.visitsFor(id)).map((v) => v.code.trim()).sort();
    assert.deepEqual(codes, ["fr", "jp"]);
    await post(`/travellers/${id}/toggle`, { code: "fr" });
    codes = (await repo.visitsFor(id)).map((v) => v.code.trim());
    assert.deepEqual(codes, ["jp"]);

    const html = await (await fetch(`${base}/?t=${id}`)).text();
    assert.match(html, /data-code="jp" class="visited"/);

    await post(`/travellers/${id}/delete`, {});
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM visits WHERE traveller_id = $1", [id]);
    assert.equal(rows[0].n, 0);
  });

  test("duplicate names and bad colours are rejected", async () => {
    await repo.addTraveller("Kabir", "#123456");
    await assert.rejects(repo.addTraveller("Kabir", "#654321"), /already a traveller/);
    await assert.rejects(repo.addTraveller("Zoya", "red"), /valid colour/);
  });

  test("family view counts travellers per country", async () => {
    const a = await repo.addTraveller("A", "#111111");
    const b = await repo.addTraveller("B", "#222222");
    await repo.addVisit(a, "it");
    await repo.addVisit(b, "it");
    assert.equal((await repo.familyCounts()).it, 2);
  });
});
