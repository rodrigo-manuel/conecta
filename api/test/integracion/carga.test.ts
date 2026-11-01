import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { pool } from "../../src/db.js";

// Requisito de desempeño (sección 5.2): trazabilidad en menos de 2 s con al menos 100.000 recepciones.
// Las fechas son de 2031 para no interferir con las liquidaciones de las otras pruebas.
const RECEPCIONES = 100_000;
const DEL_LOTE = 1300; // caso exigente: toda la leche de un día en un solo lote

describe("prueba de carga de la trazabilidad", () => {
  let token: string;
  let loteId: number;

  beforeAll(async () => {
    await pool.query("ALTER TABLE recepcion DISABLE TRIGGER USER");
    await pool.query(
      `INSERT INTO recepcion (id, codigo, productor_id, centro_id, fecha_hora, litros, temperatura, estado)
       SELECT u, 'REC-' || upper(replace(left(u::text, 13), '-', '')), p.id, p.centro_id,
              timestamptz '2031-01-01 06:00-05' + (n % 300) * interval '1 day', 100, 6, 'analizada'
       FROM (SELECT n, gen_random_uuid() AS u FROM generate_series(1, $1::int) AS n) s
       JOIN productor p ON p.id = 1 + s.n % 32`,
      [RECEPCIONES],
    );
    await pool.query("ALTER TABLE recepcion ENABLE TRIGGER USER");
    await pool.query("ANALYZE recepcion");
    const { rows } = await pool.query(
      "INSERT INTO lote (codigo, producto, fecha) VALUES ('LOTE-CARGA', 'Queso costeño', '2031-01-01') RETURNING id",
    );
    loteId = rows[0].id;
    await pool.query(
      `INSERT INTO lote_recepcion (lote_id, recepcion_id)
       SELECT $1, id FROM recepcion WHERE fecha >= '2031-01-01' LIMIT $2`,
      [loteId, DEL_LOTE],
    );
    const r = await request(app).post("/api/auth/login").send({ usuario: "jefeplanta", clave: "Conecta2026!" });
    token = r.body.token;
  }, 120_000);

  afterAll(() => pool.end());

  it("responde en menos de 2 segundos", async () => {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM recepcion");
    expect(rows[0].n).toBeGreaterThanOrEqual(RECEPCIONES);

    const tiempos: number[] = [];
    for (let i = 0; i < 5; i++) {
      const inicio = performance.now();
      const r = await request(app).get(`/api/lotes/${loteId}/trazabilidad`).set({ Authorization: `Bearer ${token}` });
      tiempos.push(performance.now() - inicio);
      expect(r.status).toBe(200);
      expect(r.body.recepciones).toHaveLength(DEL_LOTE);
    }
    console.log(`Trazabilidad con ${rows[0].n} recepciones y ${DEL_LOTE} en el lote (ms): ${tiempos.map(Math.round).join(", ")}`);
    expect(Math.max(...tiempos)).toBeLessThan(2000);
  });
});
