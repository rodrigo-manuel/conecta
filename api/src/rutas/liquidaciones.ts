import { Router } from "express";
import { z } from "zod";
import { enTransaccion, pool } from "../db.js";
import { exportadorFondo, exportadorSicoop } from "../integraciones/exportadores.js";
import type { LineaLiquidacion } from "../integraciones/interfaces.js";
import { mensajeriaFalsa } from "../integraciones/mensajeria.js";
import { liquidarPeriodo, Recepcion } from "../liquidacion/motor.js";
import type { ParametrosPago } from "../liquidacion/parametros.js";
import { periodoDe } from "../liquidacion/periodo.js";
import { autenticar, ErrorHttp, permitir } from "../seguridad.js";

export const liquidaciones = Router();
liquidaciones.use(["/liquidaciones", "/parametros"], autenticar);

export async function cargarParametros(): Promise<ParametrosPago[]> {
  const { rows } = await pool.query("SELECT valores FROM parametro_pago");
  return rows.map((r) => r.valores);
}

interface FilaRecepcion {
  id: string;
  productor_id: number;
  ahorro_autorizado_pct: number | null;
  fecha: string;
  litros: number;
  temperatura: number;
  grasa: number | null;
  proteina: number | null;
  ufc: number | null;
  antibioticos_positivo: boolean | null;
}

export function aRecepcionDelMotor(f: FilaRecepcion): Recepcion {
  return {
    id: f.id,
    fecha: f.fecha,
    litros: f.litros,
    temperatura: f.temperatura,
    resultado:
      f.grasa === null
        ? null
        : {
            grasa: f.grasa,
            proteina: f.proteina!,
            ufc: f.ufc!,
            antibioticosPositivo: f.antibioticos_positivo!,
          },
  };
}

export function agruparPorProductor(filas: FilaRecepcion[]): Map<number, FilaRecepcion[]> {
  const grupos = new Map<number, FilaRecepcion[]>();
  for (const f of filas) {
    grupos.set(f.productor_id, [...(grupos.get(f.productor_id) ?? []), f]);
  }
  return grupos;
}

const esquemaPeriodo = z.object({ fecha: z.iso.date() });

// Calcula el periodo que contiene la fecha. Se puede repetir: rehace lo no aprobado.
liquidaciones.post(
  "/liquidaciones/calcular",
  permitir("coordinador_liquidacion", "administrador"),
  async (req, res) => {
    const periodo = periodoDe(esquemaPeriodo.parse(req.body).fecha);
    const versiones = await cargarParametros();

    const resumen = await enTransaccion(req.usuario.id, async (c) => {
      await c.query("DELETE FROM liquidacion WHERE periodo_inicio = $1 AND estado = 'calculada'", [periodo.inicio]);
      const { rows } = await c.query<FilaRecepcion>(
        `SELECT r.id, r.productor_id, p.ahorro_autorizado_pct, r.fecha, r.litros, r.temperatura,
                l.grasa, l.proteina, l.ufc, l.antibioticos_positivo
         FROM recepcion r
         JOIN productor p ON p.id = r.productor_id
         LEFT JOIN resultado_laboratorio l ON l.recepcion_id = r.id
         WHERE r.fecha <= $1
           AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle d WHERE d.recepcion_id = r.id)
           AND NOT EXISTS (SELECT 1 FROM liquidacion a WHERE a.productor_id = r.productor_id
                           AND a.periodo_inicio = $2 AND a.estado = 'aprobada')
         ORDER BY r.fecha`,
        [periodo.fin, periodo.inicio],
      );

      let creadas = 0;
      let diferidas = 0;
      for (const [productorId, filas] of agruparPorProductor(rows)) {
        const l = liquidarPeriodo({
          productorId: String(productorId),
          periodo,
          ahorroAutorizadoPct: filas[0].ahorro_autorizado_pct,
          recepciones: filas.map(aRecepcionDelMotor),
          versionesParametros: versiones,
        });
        diferidas += l.diferidas.length;
        if (l.detalle.length === 0) continue;
        const { rows: nueva } = await c.query(
          `INSERT INTO liquidacion (productor_id, periodo_inicio, periodo_fin, litros, bruto, aporte_social, ahorro_voluntario, neto)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [productorId, periodo.inicio, periodo.fin, l.litros, l.bruto, l.aporteSocial, l.ahorroVoluntario, l.neto],
        );
        for (const d of l.detalle) {
          await c.query(
            `INSERT INTO liquidacion_detalle (liquidacion_id, recepcion_id, estado, litros, precio_por_litro, bruto, aporte_social, ahorro_voluntario, neto, parametros_vigentes_desde)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [nueva[0].id, d.recepcionId, d.estado, d.litros, d.precioPorLitro, d.bruto, d.aporteSocial, d.ahorroVoluntario, d.neto, d.parametrosVigentesDesde],
          );
        }
        creadas++;
      }
      return { creadas, recepcionesDiferidas: diferidas };
    });
    res.json({ periodo, ...resumen });
  },
);

const SELECT_LIQUIDACION = `
  SELECT l.id, l.productor_id AS "productorId", p.codigo AS "productorCodigo", p.nombre AS "productorNombre",
         l.periodo_inicio AS "periodoInicio", l.periodo_fin AS "periodoFin", l.estado, l.litros, l.bruto,
         l.aporte_social AS "aporteSocial", l.ahorro_voluntario AS "ahorroVoluntario", l.neto, l.aprobada_en AS "aprobadaEn"
  FROM liquidacion l JOIN productor p ON p.id = l.productor_id`;

liquidaciones.get(
  "/liquidaciones",
  permitir("coordinador_liquidacion", "gerencia", "revisor_fiscal", "administrador"),
  async (req, res) => {
    const { fecha } = esquemaPeriodo.parse(req.query);
    const { rows } = await pool.query(`${SELECT_LIQUIDACION} WHERE l.periodo_inicio = $1 ORDER BY p.codigo`, [
      periodoDe(fecha).inicio,
    ]);
    res.json(rows);
  },
);

// Va antes de /liquidaciones/:id para que "exportar" no se interprete como un id.
liquidaciones.get(
  "/liquidaciones/exportar",
  permitir("coordinador_liquidacion", "administrador"),
  async (req, res) => {
    const { fecha, destino } = z
      .object({ fecha: z.iso.date(), destino: z.enum(["erp", "fondo"]) })
      .parse(req.query);
    const { inicio } = periodoDe(fecha);
    const { rows } = await pool.query<LineaLiquidacion>(
      `SELECT l.id AS "liquidacionId", p.codigo AS "productorCodigo", l.periodo_inicio AS "periodoInicio",
              l.periodo_fin AS "periodoFin", l.litros, l.bruto, l.aporte_social AS "aporteSocial",
              l.ahorro_voluntario AS "ahorroVoluntario", l.neto
       FROM liquidacion l JOIN productor p ON p.id = l.productor_id
       WHERE l.periodo_inicio = $1 AND l.estado = 'aprobada' ORDER BY p.codigo`,
      [inicio],
    );
    const exportador = destino === "erp" ? exportadorSicoop : exportadorFondo;
    res.attachment(exportador.nombreArchivo(inicio)).type("text/csv").send(exportador.generar(rows));
  },
);

const idValido = (v: unknown) => z.coerce.number().int().positive().parse(v);

// Comparte la regla con el portal: un productor solo puede abrir sus propias liquidaciones.
liquidaciones.get("/liquidaciones/:id", async (req, res) => {
  const { rows } = await pool.query(`${SELECT_LIQUIDACION} WHERE l.id = $1`, [idValido(req.params.id)]);
  const l = rows[0];
  if (!l) throw new ErrorHttp(404, "La liquidación no existe");
  const { rol, productorId } = req.usuario;
  if (rol === "productor" && (l.productorId !== productorId || l.estado !== "aprobada")) {
    throw new ErrorHttp(403, "No puede ver datos de otro productor");
  }
  if (!["productor", "coordinador_liquidacion", "gerencia", "revisor_fiscal", "administrador"].includes(rol)) {
    throw new ErrorHttp(403, "Su rol no permite esta operación");
  }
  const { rows: detalle } = await pool.query(
    `SELECT d.recepcion_id AS "recepcionId", r.codigo, r.fecha, d.estado, d.litros,
            d.precio_por_litro AS "precioPorLitro", d.bruto, d.aporte_social AS "aporteSocial",
            d.ahorro_voluntario AS "ahorroVoluntario", d.neto, d.parametros_vigentes_desde AS "parametrosVigentesDesde"
     FROM liquidacion_detalle d JOIN recepcion r ON r.id = d.recepcion_id
     WHERE d.liquidacion_id = $1 ORDER BY r.fecha`,
    [l.id],
  );
  res.json({ ...l, detalle });
});

liquidaciones.post(
  "/liquidaciones/:id/aprobar",
  permitir("coordinador_liquidacion", "administrador"),
  async (req, res) => {
    const id = idValido(req.params.id);
    const aprobada = await enTransaccion(req.usuario.id, async (c) => {
      const { rows } = await c.query("SELECT estado FROM liquidacion WHERE id = $1 FOR UPDATE", [id]);
      if (!rows[0]) throw new ErrorHttp(404, "La liquidación no existe");
      if (rows[0].estado === "aprobada") throw new ErrorHttp(409, "La liquidación ya está aprobada");
      const r = await c.query(
        `UPDATE liquidacion SET estado = 'aprobada', aprobada_por = $2, aprobada_en = now()
         WHERE id = $1 RETURNING productor_id AS "productorId", neto`,
        [id, req.usuario.id],
      );
      return r.rows[0];
    });
    await mensajeriaFalsa.enviar(
      aprobada.productorId,
      `COOVASER: su liquidación fue aprobada. Neto a pagar: COP ${aprobada.neto}.`,
    );
    res.json({ id, estado: "aprobada" });
  },
);

// Consultar y agregar versiones de parámetros; nunca se edita una existente (extensión 5.4).
liquidaciones.get(
  "/parametros",
  permitir("coordinador_liquidacion", "gerencia", "revisor_fiscal", "administrador"),
  async (_req, res) => {
    const versiones = await cargarParametros();
    res.json(versiones.sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde)));
  },
);

const esquemaParametros = z.object({
  vigenteDesde: z.iso.date(),
  precioBase: z.number().positive(),
  grasaReferencia: z.number().positive(),
  ajustePorDecimaGrasa: z.number().min(0),
  proteinaReferencia: z.number().positive(),
  ajustePorDecimaProteina: z.number().min(0),
  ufcLimiteBonificacion: z.number().int().positive(),
  bonificacionUfc: z.number().min(0),
  ufcLimitePenalizacion: z.number().int().positive(),
  penalizacionUfc: z.number().min(0),
  temperaturaMaxima: z.number(),
  penalizacionTemperatura: z.number().min(0),
  aporteSocialPct: z.number().min(0).max(100),
  ahorroMaximoPct: z.number().min(0).max(100),
});

liquidaciones.post(
  "/parametros",
  permitir("coordinador_liquidacion", "administrador"),
  async (req, res) => {
    const p = esquemaParametros.parse(req.body);
    const { rowCount } = await enTransaccion(req.usuario.id, (c) =>
      c.query(
        `INSERT INTO parametro_pago (vigente_desde, valores, creado_por) VALUES ($1, $2, $3)
         ON CONFLICT (vigente_desde) DO NOTHING`,
        [p.vigenteDesde, JSON.stringify(p), req.usuario.id],
      ),
    );
    if (!rowCount) throw new ErrorHttp(409, "Ya existe una versión con esa fecha de vigencia");
    res.status(201).json(p);
  },
);
