import { Router } from "express";
import { z } from "zod";
import { enTransaccion, pool } from "../db.js";
import { liquidarPeriodo } from "../liquidacion/motor.js";
import { periodoDe } from "../liquidacion/periodo.js";
import { autenticar, ErrorHttp, permitir } from "../seguridad.js";
import { aRecepcionDelMotor, agruparPorProductor, cargarParametros } from "./liquidaciones.js";

// Catálogos, portal del productor, tablero gerencial, alertas, auditoría y datos personales.
export const consultas = Router();
const PERSONAL = ["operador_acopio", "analista_laboratorio", "jefe_planta", "coordinador_liquidacion", "gerencia", "revisor_fiscal", "administrador"] as const;

consultas.get("/centros", autenticar, async (_req, res) => {
  const { rows } = await pool.query("SELECT id, nombre, municipio FROM centro_acopio ORDER BY id");
  res.json(rows);
});

// Minimización de datos: el listado no incluye teléfonos.
consultas.get("/productores", autenticar, permitir(...PERSONAL), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, codigo, nombre, centro_id AS "centroId",
            ahorro_autorizado_pct AS "ahorroAutorizadoPct" FROM productor ORDER BY codigo`,
  );
  res.json(rows);
});

// ── Portal: el productor siempre sale de la sesión, nunca de un parámetro que él pueda cambiar.
consultas.use("/portal", autenticar, permitir("productor"));

consultas.get("/portal/recepciones", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.codigo, r.fecha, r.litros, r.temperatura, r.estado,
            l.grasa, l.proteina, l.ufc, l.antibioticos_positivo AS "antibioticosPositivo"
     FROM recepcion r LEFT JOIN resultado_laboratorio l ON l.recepcion_id = r.id
     WHERE r.productor_id = $1 ORDER BY r.fecha_hora DESC LIMIT 100`,
    [req.usuario.productorId],
  );
  res.json(rows);
});

consultas.get("/portal/liquidaciones", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, periodo_inicio AS "periodoInicio", periodo_fin AS "periodoFin", estado, litros, bruto,
            aporte_social AS "aporteSocial", ahorro_voluntario AS "ahorroVoluntario", neto
     FROM liquidacion WHERE productor_id = $1 AND estado = 'aprobada' ORDER BY periodo_inicio DESC`,
    [req.usuario.productorId],
  );
  res.json(rows);
});

// ── Tablero gerencial (MVP-09) ─────────────────────────────────────────────
consultas.get(
  "/tablero",
  autenticar,
  permitir("gerencia", "revisor_fiscal", "administrador"),
  async (req, res) => {
    const { fecha } = z.object({ fecha: z.iso.date().optional() }).parse(req.query);
    const { rows: hoy } = await pool.query(
      "SELECT COALESCE($1::date, (now() AT TIME ZONE 'America/Bogota')::date) AS dia",
      [fecha ?? null],
    );
    const dia: string = hoy[0].dia;
    const periodo = periodoDe(dia);

    const { rows: litrosPorCentro } = await pool.query(
      `SELECT ca.id, ca.nombre, COALESCE(sum(r.litros), 0) AS litros, count(r.id)::int AS recepciones
       FROM centro_acopio ca LEFT JOIN recepcion r ON r.centro_id = ca.id AND r.fecha = $1
       GROUP BY ca.id ORDER BY ca.id`,
      [dia],
    );
    const { rows: conteo } = await pool.query(
      `SELECT count(*) FILTER (WHERE estado = 'rechazada')::int AS rechazadas,
              count(*)::int AS total,
              count(*) FILTER (WHERE estado = 'pendiente')::int AS "sinResultado"
       FROM recepcion WHERE fecha BETWEEN $1 AND $2`,
      [periodo.inicio, periodo.fin],
    );

    // El valor estimado usa el mismo motor que la liquidación real.
    const { rows: filas } = await pool.query(
      `SELECT r.id, r.productor_id, p.ahorro_autorizado_pct, r.fecha, r.litros, r.temperatura,
              l.grasa, l.proteina, l.ufc, l.antibioticos_positivo
       FROM recepcion r
       JOIN productor p ON p.id = r.productor_id
       LEFT JOIN resultado_laboratorio l ON l.recepcion_id = r.id
       WHERE r.fecha BETWEEN $1 AND $2`,
      [periodo.inicio, periodo.fin],
    );
    const versiones = await cargarParametros();
    let valorEstimado = 0;
    for (const [productorId, grupo] of agruparPorProductor(filas)) {
      valorEstimado += liquidarPeriodo({
        productorId: String(productorId),
        periodo,
        ahorroAutorizadoPct: grupo[0].ahorro_autorizado_pct,
        recepciones: grupo.map(aRecepcionDelMotor),
        versionesParametros: versiones,
      }).neto;
    }

    const { total, rechazadas, sinResultado } = conteo[0];
    res.json({
      dia,
      periodo,
      litrosPorCentro,
      litrosDelDia: litrosPorCentro.reduce((t, c) => t + c.litros, 0),
      recepcionesPeriodo: total,
      porcentajeRechazos: total === 0 ? 0 : Math.round((rechazadas / total) * 1000) / 10,
      recepcionesSinResultado: sinResultado,
      valorEstimadoAPagar: valorEstimado,
    });
  },
);

consultas.get(
  "/alertas",
  autenticar,
  permitir("analista_laboratorio", "jefe_planta", "gerencia", "administrador"),
  async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT a.id, a.tipo, a.mensaje, a.creada_en AS "creadaEn", p.codigo AS "productorCodigo", ca.nombre AS centro
       FROM alerta a JOIN productor p ON p.id = a.productor_id
       JOIN recepcion r ON r.id = a.recepcion_id JOIN centro_acopio ca ON ca.id = r.centro_id
       ORDER BY a.creada_en DESC LIMIT 100`,
    );
    res.json(rows);
  },
);

consultas.get("/mensajes", autenticar, permitir("administrador"), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT m.id, p.codigo AS "productorCodigo", m.canal, m.texto, m.creado_en AS "creadoEn"
     FROM mensaje_saliente m JOIN productor p ON p.id = m.productor_id ORDER BY m.id DESC LIMIT 100`,
  );
  res.json(rows);
});

// ── Auditoría (solo lectura; la tabla rechaza UPDATE y DELETE) ─────────────
consultas.get(
  "/auditoria",
  autenticar,
  permitir("revisor_fiscal", "administrador"),
  async (req, res) => {
    const f = z
      .object({
        tabla: z.enum(["recepcion", "resultado_laboratorio", "liquidacion", "parametro_pago"]).optional(),
        registroId: z.string().max(60).optional(),
        limite: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    const { rows } = await pool.query(
      `SELECT a.id, a.en, a.operacion, a.tabla, a.registro_id AS "registroId", u.usuario, a.antes, a.despues
       FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id
       WHERE ($1::text IS NULL OR a.tabla = $1) AND ($2::text IS NULL OR a.registro_id = $2)
       ORDER BY a.id DESC LIMIT $3`,
      [f.tabla ?? null, f.registroId ?? null, f.limite],
    );
    res.json(rows);
  },
);

// ── Autorización de tratamiento de datos (Ley 1581 de 2012) ────────────────
consultas.get("/productores/:id/autorizacion-datos", autenticar, async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { rol, productorId } = req.usuario;
  const puede = rol === "revisor_fiscal" || rol === "administrador" || (rol === "productor" && productorId === id);
  if (!puede) throw new ErrorHttp(403, "Su rol no permite esta operación");
  const { rows } = await pool.query(
    `SELECT id, version_politica AS "versionPolitica", medio, otorgada_en AS "otorgadaEn"
     FROM autorizacion_datos WHERE productor_id = $1 ORDER BY otorgada_en DESC`,
    [id],
  );
  res.json(rows);
});

consultas.post(
  "/productores/:id/autorizacion-datos",
  autenticar,
  permitir("operador_acopio", "administrador"),
  async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const a = z
      .object({
        versionPolitica: z.string().min(1).max(40),
        medio: z.enum(["formato_fisico", "portal", "centro_acopio"]),
      })
      .parse(req.body);
    const { rows } = await enTransaccion(req.usuario.id, (c) =>
      c.query(
        `INSERT INTO autorizacion_datos (productor_id, version_politica, medio, registrada_por)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, a.versionPolitica, a.medio, req.usuario.id],
      ),
    );
    res.status(201).json(rows[0]);
  },
);
