import { Router } from "express";
import type pg from "pg";
import { z } from "zod";
import { enTransaccion, pool } from "../db.js";
import { mensajeriaFalsa } from "../integraciones/mensajeria.js";
import { autenticar, ErrorHttp, permitir, UsuarioSesion } from "../seguridad.js";

export const recepciones = Router();
recepciones.use("/recepciones", autenticar);

const esquemaRecepcion = z.object({
  id: z.uuid(),
  productorId: z.number().int().positive(),
  centroId: z.number().int().positive(),
  fechaHora: z.iso.datetime({ offset: true }),
  litros: z.number().positive().max(5000),
  temperatura: z.number().min(-5).max(60),
});
type NuevaRecepcion = z.infer<typeof esquemaRecepcion>;

// El dispositivo calcula el mismo código, por eso puede imprimir el comprobante sin conexión.
export const codigoDeRecepcion = (id: string) =>
  "REC-" + id.slice(0, 13).replace("-", "").toUpperCase();

// ON CONFLICT DO NOTHING hace la operación idempotente: reenviar nunca duplica.
async function guardarRecepcion(r: NuevaRecepcion, u: UsuarioSesion): Promise<"creada" | "duplicada"> {
  if (u.centroId !== null && u.centroId !== r.centroId) {
    throw new ErrorHttp(403, "Solo puede registrar recepciones de su centro de acopio");
  }
  return enTransaccion(u.id, async (c) => {
    const { rowCount } = await c.query(
      `INSERT INTO recepcion (id, codigo, productor_id, centro_id, fecha_hora, litros, temperatura, operador_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
      [r.id, codigoDeRecepcion(r.id), r.productorId, r.centroId, r.fechaHora, r.litros, r.temperatura, u.id],
    );
    return rowCount === 1 ? "creada" : "duplicada";
  });
}

const SELECT_RECEPCION = `
  SELECT r.id, r.codigo, r.productor_id AS "productorId", p.codigo AS "productorCodigo",
         p.nombre AS "productorNombre", r.centro_id AS "centroId", ca.nombre AS "centroNombre",
         r.fecha_hora AS "fechaHora", r.fecha, r.litros, r.temperatura, r.estado,
         l.grasa, l.proteina, l.ufc, l.antibioticos_positivo AS "antibioticosPositivo"
  FROM recepcion r
  JOIN productor p ON p.id = r.productor_id
  JOIN centro_acopio ca ON ca.id = r.centro_id
  LEFT JOIN resultado_laboratorio l ON l.recepcion_id = r.id`;

recepciones.post("/recepciones", permitir("operador_acopio", "administrador"), async (req, res) => {
  const r = esquemaRecepcion.parse(req.body);
  const estado = await guardarRecepcion(r, req.usuario);
  res.status(estado === "creada" ? 201 : 200).json({ id: r.id, codigo: codigoDeRecepcion(r.id), estado });
});

// La cola sin conexión envía aquí sus pendientes. Cada una va en su propia transacción:
// una recepción inválida no impide que entren las demás.
recepciones.post(
  "/recepciones/sincronizar",
  permitir("operador_acopio", "administrador"),
  async (req, res) => {
    const lote = z.array(z.unknown()).min(1).max(2000).parse(req.body?.recepciones);
    const resultados = [];
    for (const crudo of lote) {
      const id = (crudo as { id?: unknown })?.id;
      try {
        const r = esquemaRecepcion.parse(crudo);
        resultados.push({ id: r.id, estado: await guardarRecepcion(r, req.usuario) });
      } catch (error) {
        resultados.push({ id, estado: "error", mensaje: mensajeDe(error) });
      }
    }
    res.json({ resultados });
  },
);

function mensajeDe(error: unknown): string {
  if (error instanceof ErrorHttp) return error.message;
  if (error instanceof z.ZodError) return "Datos inválidos";
  if ((error as { code?: string }).code === "23503") return "El productor o el centro no existe";
  throw error;
}

recepciones.get(
  "/recepciones",
  permitir("operador_acopio", "analista_laboratorio", "jefe_planta", "coordinador_liquidacion", "gerencia", "revisor_fiscal", "administrador"),
  async (req, res) => {
    const f = z
      .object({
        estado: z.enum(["pendiente", "analizada", "rechazada"]).optional(),
        fecha: z.iso.date().optional(),
        limite: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    const { rows } = await pool.query(
      `${SELECT_RECEPCION}
       WHERE ($1::text IS NULL OR r.estado = $1) AND ($2::date IS NULL OR r.fecha = $2)
         AND ($4::int IS NULL OR r.centro_id = $4)
       ORDER BY r.fecha_hora DESC LIMIT $3`,
      [f.estado ?? null, f.fecha ?? null, f.limite, req.usuario.centroId],
    );
    res.json(rows);
  },
);

const idValido = (v: unknown) => z.uuid().parse(v);

recepciones.get("/recepciones/:id", async (req, res) => {
  const { rows } = await pool.query(`${SELECT_RECEPCION} WHERE r.id = $1`, [idValido(req.params.id)]);
  const r = rows[0];
  if (!r) throw new ErrorHttp(404, "La recepción no existe");
  if (req.usuario.rol === "productor" && r.productorId !== req.usuario.productorId) {
    throw new ErrorHttp(403, "No puede ver datos de otro productor");
  }
  if (req.usuario.centroId !== null && r.centroId !== req.usuario.centroId) {
    throw new ErrorHttp(403, "Solo puede ver recepciones de su centro de acopio");
  }
  res.json(r);
});

// Trazabilidad hacia adelante: recepción → lotes.
recepciones.get(
  "/recepciones/:id/lotes",
  permitir("jefe_planta", "gerencia", "revisor_fiscal", "administrador"),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT l.id, l.codigo, l.producto, l.fecha FROM lote l
       JOIN lote_recepcion lr ON lr.lote_id = l.id WHERE lr.recepcion_id = $1 ORDER BY l.fecha`,
      [idValido(req.params.id)],
    );
    res.json(rows);
  },
);

async function exigirNoLiquidada(c: pg.PoolClient, id: string): Promise<void> {
  const { rowCount } = await c.query(
    `SELECT 1 FROM liquidacion_detalle d JOIN liquidacion l ON l.id = d.liquidacion_id
     WHERE d.recepcion_id = $1 AND l.estado = 'aprobada'`,
    [id],
  );
  if (rowCount) throw new ErrorHttp(409, "La recepción ya está en una liquidación aprobada");
}

// Corrección de digitación: el trigger de auditoría guarda el valor anterior y el nuevo.
recepciones.patch(
  "/recepciones/:id",
  permitir("operador_acopio", "jefe_planta", "administrador"),
  async (req, res) => {
    const id = idValido(req.params.id);
    const cambios = z
      .object({ litros: z.number().positive().max(5000), temperatura: z.number().min(-5).max(60) })
      .parse(req.body);
    await enTransaccion(req.usuario.id, async (c) => {
      const { rows } = await c.query("SELECT centro_id FROM recepcion WHERE id = $1 FOR UPDATE", [id]);
      if (!rows[0]) throw new ErrorHttp(404, "La recepción no existe");
      if (req.usuario.centroId !== null && rows[0].centro_id !== req.usuario.centroId) {
        throw new ErrorHttp(403, "Solo puede corregir recepciones de su centro de acopio");
      }
      await exigirNoLiquidada(c, id);
      await c.query("UPDATE recepcion SET litros = $2, temperatura = $3 WHERE id = $1", [
        id,
        cambios.litros,
        cambios.temperatura,
      ]);
    });
    res.json({ id, ...cambios });
  },
);

const esquemaResultado = z.object({
  grasa: z.number().min(0).max(15),
  proteina: z.number().min(0).max(15),
  ufc: z.number().int().min(0).max(100_000_000),
  antibioticosPositivo: z.boolean(),
});

recepciones.put(
  "/recepciones/:id/resultado",
  permitir("analista_laboratorio", "administrador"),
  async (req, res) => {
    const id = idValido(req.params.id);
    const r = esquemaResultado.parse(req.body);
    const estado = r.antibioticosPositivo ? "rechazada" : "analizada";

    const recepcion = await enTransaccion(req.usuario.id, async (c) => {
      await exigirNoLiquidada(c, id);
      const { rows } = await c.query(
        "UPDATE recepcion SET estado = $2 WHERE id = $1 RETURNING codigo, productor_id AS \"productorId\"",
        [id, estado],
      );
      if (!rows[0]) throw new ErrorHttp(404, "La recepción no existe");
      await c.query(
        `INSERT INTO resultado_laboratorio (recepcion_id, grasa, proteina, ufc, antibioticos_positivo, analista_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (recepcion_id) DO UPDATE SET grasa = $2, proteina = $3, ufc = $4,
           antibioticos_positivo = $5, analista_id = $6, registrado_en = now()`,
        [id, r.grasa, r.proteina, r.ufc, r.antibioticosPositivo, req.usuario.id],
      );
      if (r.antibioticosPositivo) {
        await c.query(
          "INSERT INTO alerta (tipo, recepcion_id, productor_id, mensaje) VALUES ('antibioticos', $1, $2, $3)",
          [id, rows[0].productorId, `Antibióticos positivos en la recepción ${rows[0].codigo}`],
        );
      }
      return rows[0];
    });

    if (r.antibioticosPositivo) {
      await mensajeriaFalsa.enviar(
        recepcion.productorId,
        `COOVASER: la recepción ${recepcion.codigo} fue rechazada por antibióticos. Comuníquese con calidad.`,
      );
    }
    res.json({ id, estado });
  },
);
