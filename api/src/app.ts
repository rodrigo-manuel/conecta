import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import { pool } from "./db.js";
import { autenticacion } from "./rutas/autenticacion.js";
import { consultas } from "./rutas/consultas.js";
import { liquidaciones } from "./rutas/liquidaciones.js";
import { lotes } from "./rutas/lotes.js";
import { recepciones } from "./rutas/recepciones.js";
import { ErrorHttp } from "./seguridad.js";

export const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));

// Ruta de salud: confirma que la API está viva y que la base de datos responde.
app.get("/api/salud", async (_req, res) => {
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS centros FROM centro_acopio");
    res.json({ estado: "ok", baseDeDatos: "ok", centros: r.rows[0].centros });
  } catch {
    res.status(503).json({ estado: "degradado", baseDeDatos: "sin conexión" });
  }
});

app.use("/api", autenticacion, recepciones, liquidaciones, lotes, consultas);

app.use("/api", (_req, _res, next) => next(new ErrorHttp(404, "Ruta no encontrada")));

// La misma aplicación entrega la PWA ya compilada (ver ADR de estilo arquitectónico).
const carpetaWeb = process.env.CARPETA_WEB;
if (carpetaWeb) {
  app.use(express.static(carpetaWeb));
  app.get(/.*/, (_req, res) => res.sendFile(path.resolve(carpetaWeb, "index.html")));
}

// Traduce los errores a respuestas HTTP. Lo inesperado no filtra detalles internos al cliente.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ErrorHttp) {
    res.status(error.estado).json({ error: error.message });
  } else if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Datos inválidos", detalle: z.flattenError(error).fieldErrors });
  } else if ((error as { code?: string }).code === "23503") {
    res.status(422).json({ error: "Hace referencia a un registro que no existe" });
  } else if ((error as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "El cuerpo de la petición no es JSON válido" });
  } else {
    console.error(error);
    res.status(500).json({ error: "Error interno" });
  }
});
