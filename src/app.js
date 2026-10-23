import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import world from "@svg-maps/world";
import { TravelError } from "./repo.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PALETTE = ["#14b8a6", "#f97316", "#8b5cf6", "#ef4444", "#3b82f6", "#eab308", "#ec4899", "#22c55e"];

export function createApp({ repo }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.use(express.static(path.join(root, "public")));
  app.use(express.urlencoded({ extended: false, limit: "2kb" }));
  app.locals.world = world;

  const travellerId = (value) => (Number.isInteger(Number(value)) ? Number(value) : null);
  const back = (res, id, params = {}) => res.redirect(303, `/?${new URLSearchParams({ ...(id ? { t: id } : {}), ...params })}`);

  app.get("/", async (req, res, next) => {
    try {
      const travellers = await repo.travellers();
      const total = await repo.countryCount();
      const current = travellers.find((t) => t.id === travellerId(req.query.t)) ?? null;
      const visits = current ? await repo.visitsFor(current.id) : [];
      const family = current ? {} : await repo.familyCounts();
      res.render("index", {
        travellers,
        current,
        visits,
        visitedCodes: new Set(visits.map((v) => v.code.trim())),
        family,
        total,
        countryNames: await repo.countryNames(),
        nextColor: PALETTE[travellers.length % PALETTE.length],
        message: typeof req.query.msg === "string" ? req.query.msg.slice(0, 140) : null,
        error: typeof req.query.err === "string" ? req.query.err.slice(0, 140) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/travellers", async (req, res, next) => {
    try {
      const id = await repo.addTraveller(req.body.name, req.body.color);
      back(res, id, { msg: `Welcome aboard, ${req.body.name.trim()}! ✈️` });
    } catch (error) {
      if (error instanceof TravelError) return back(res, null, { err: error.message });
      next(error);
    }
  });

  app.post("/travellers/:id/delete", async (req, res, next) => {
    try {
      await repo.removeTraveller(travellerId(req.params.id));
      back(res, null, { msg: "Traveller removed." });
    } catch (error) {
      next(error);
    }
  });

  app.post("/travellers/:id/visits", async (req, res, next) => {
    const id = travellerId(req.params.id);
    try {
      const country = await repo.findCountry(req.body.country);
      const added = await repo.addVisit(id, country.code);
      back(res, id, added ? { msg: `Added ${country.name} 📍` } : { err: `${country.name} is already on the map.` });
    } catch (error) {
      if (error instanceof TravelError) return back(res, id, { err: error.message });
      next(error);
    }
  });

  // Clicking a country on the map toggles it (progressive enhancement via public/map.js).
  app.post("/travellers/:id/toggle", async (req, res, next) => {
    const id = travellerId(req.params.id);
    try {
      const code = String(req.body.code ?? "").toLowerCase();
      if (!world.locations.some((l) => l.id === code)) return back(res, id, { err: "Unknown country." });
      const added = await repo.toggleVisit(id, code);
      const name = world.locations.find((l) => l.id === code).name;
      back(res, id, { msg: added ? `Added ${name} 📍` : `Removed ${name}` });
    } catch (error) {
      next(error);
    }
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use((req, res) => res.redirect(303, "/"));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send("Database error. Is Postgres running and set up? Run: npm run db:setup");
  });

  return app;
}
