import { Router } from "express";
import { z } from "zod";
import { enTransaccion, pool } from "../db.js";
import { autenticar, ErrorHttp, permitir } from "../seguridad.js";

export const lotes = Router();
lotes.use("/lotes", autenticar, permitir("jefe_planta", "gerencia", "revisor_fiscal", "administrador"));

const esquemaLote = z.object({
  codigo: z.string().min(3).max(40),
  producto: z.string().min(2).max(80),
  fecha: z.iso.date(),
  recepciones: z.array(z.uuid()).min(1).max(5000),
});

lotes.post("/lotes", permitir("jefe_planta", "administrador"), async (req, res) => {
  const l = esquemaLote.parse(req.body);
  const id = await enTransaccion(req.usuario.id, async (c) => {
    // La leche rechazada por antibióticos o sin resultado no puede entrar a producción.
    const { rows: validas } = await c.query(
      "SELECT id FROM recepcion WHERE id = ANY($1::uuid[]) AND estado = 'analizada'",
      [l.recepciones],
    );
    if (validas.length !== new Set(l.recepciones).size) {
      throw new ErrorHttp(422, "Todas las recepciones deben existir y estar analizadas sin rechazo");
    }
    const { rows } = await c.query(
      `INSERT INTO lote (codigo, producto, fecha, creado_por) VALUES ($1, $2, $3, $4)
       ON CONFLICT (codigo) DO NOTHING RETURNING id`,
      [l.codigo, l.producto, l.fecha, req.usuario.id],
    );
    if (!rows[0]) throw new ErrorHttp(409, "Ya existe un lote con ese código");
    await c.query(
      "INSERT INTO lote_recepcion (lote_id, recepcion_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING",
      [rows[0].id, l.recepciones],
    );
    return rows[0].id as number;
  });
  res.status(201).json({ id, codigo: l.codigo });
});

lotes.get("/lotes", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT l.id, l.codigo, l.producto, l.fecha, count(lr.recepcion_id)::int AS recepciones
     FROM lote l LEFT JOIN lote_recepcion lr ON lr.lote_id = l.id
     GROUP BY l.id ORDER BY l.fecha DESC, l.id DESC LIMIT 100`,
  );
  res.json(rows);
});

// Trazabilidad hacia atrás: lote → recepciones → productores y calidad (OE1).
lotes.get("/lotes/:id/trazabilidad", async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { rows: lote } = await pool.query("SELECT id, codigo, producto, fecha FROM lote WHERE id = $1", [id]);
  if (!lote[0]) throw new ErrorHttp(404, "El lote no existe");
  const { rows } = await pool.query(
    `SELECT r.id AS "recepcionId", r.codigo, r.fecha, r.litros, r.temperatura, ca.nombre AS centro,
            p.codigo AS "productorCodigo", p.nombre AS "productorNombre",
            l.grasa, l.proteina, l.ufc, l.antibioticos_positivo AS "antibioticosPositivo"
     FROM lote_recepcion lr
     JOIN recepcion r ON r.id = lr.recepcion_id
     JOIN productor p ON p.id = r.productor_id
     JOIN centro_acopio ca ON ca.id = r.centro_id
     LEFT JOIN resultado_laboratorio l ON l.recepcion_id = r.id
     WHERE lr.lote_id = $1 ORDER BY r.fecha_hora`,
    [id],
  );
  res.json({ ...lote[0], recepciones: rows });
});
