import bcrypt from "bcryptjs";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db.js";
import { autenticar, ErrorHttp, firmarToken, UsuarioSesion } from "../seguridad.js";

export const autenticacion = Router();

// Frena los intentos de adivinar claves. Se desactiva en las pruebas automáticas.
const limiteIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: () => process.env.NODE_ENV === "test",
});

const HASH_SIN_USUARIO = bcrypt.hashSync("usuario-inexistente", 10);

const credenciales = z.object({ usuario: z.string().min(1).max(100), clave: z.string().min(1).max(200) });

autenticacion.post("/auth/login", limiteIntentos, async (req, res) => {
  const { usuario, clave } = credenciales.parse(req.body);
  const { rows } = await pool.query(
    `SELECT id, nombre, hash_clave, rol, productor_id, centro_id FROM usuario
     WHERE usuario = $1 AND activo`,
    [usuario],
  );
  const u = rows[0];
  // Mismo mensaje y mismo trabajo en ambos casos para no revelar qué usuarios existen.
  const claveCorrecta = await bcrypt.compare(clave, u?.hash_clave ?? HASH_SIN_USUARIO);
  if (!u || !claveCorrecta) {
    throw new ErrorHttp(401, "Usuario o clave incorrectos");
  }
  const sesion: UsuarioSesion = {
    id: u.id,
    rol: u.rol,
    productorId: u.productor_id,
    centroId: u.centro_id,
  };
  res.json({ token: firmarToken(sesion), usuario: { ...sesion, nombre: u.nombre } });
});

autenticacion.get("/auth/yo", autenticar, (req, res) => {
  res.json(req.usuario);
});
