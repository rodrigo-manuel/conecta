import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";

// Se reemplaza la base de datos por un doble: esta prueba no necesita Docker.
vi.mock("../src/db.js", () => ({ pool: { query: vi.fn() } }));
const consulta = vi.mocked(pool.query as (sql: string) => Promise<unknown>);

describe("GET /api/salud", () => {
  beforeEach(() => {
    consulta.mockReset();
  });

  it("responde 200 con el número de centros cuando la base de datos responde", async () => {
    consulta.mockResolvedValue({ rows: [{ centros: 4 }] });

    const r = await request(app).get("/api/salud");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ estado: "ok", baseDeDatos: "ok", centros: 4 });
  });

  it("responde 503 cuando la base de datos no responde", async () => {
    consulta.mockRejectedValue(new Error("sin conexión"));

    const r = await request(app).get("/api/salud");

    expect(r.status).toBe(503);
    expect(r.body).toEqual({ estado: "degradado", baseDeDatos: "sin conexión" });
  });
});
