import express from "express";
import { pool } from "./db.js";

export const app = express();
app.use(express.json());

// Ruta de salud: confirma que la API está viva y que la base de datos responde.
app.get("/api/salud", async (_req, res) => {
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS centros FROM centro_acopio");
    res.json({ estado: "ok", baseDeDatos: "ok", centros: r.rows[0].centros });
  } catch {
    res.status(503).json({ estado: "degradado", baseDeDatos: "sin conexión" });
  }
});