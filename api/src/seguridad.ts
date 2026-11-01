import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const ROLES = [
  "operador_acopio",
  "analista_laboratorio",
  "jefe_planta",
  "coordinador_liquidacion",
  "productor",
  "gerencia",
  "revisor_fiscal",
  "administrador",
] as const;
export type Rol = (typeof ROLES)[number];

export interface UsuarioSesion {
  id: number;
  rol: Rol;
  productorId: number | null;
  centroId: number | null;
}

declare module "express-serve-static-core" {
  interface Request {
    usuario: UsuarioSesion;
  }
}

export class ErrorHttp extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

function secreto(): string {
  const valor = process.env.JWT_SECRET;
  if (!valor) throw new Error("Falta la variable de entorno JWT_SECRET");
  return valor;
}

// 16 horas: cubre una jornada de 12 horas sin internet sin pedir de nuevo la clave.
export function firmarToken(u: UsuarioSesion): string {
  return jwt.sign(u, secreto(), { expiresIn: "16h", algorithm: "HS256" });
}

export function autenticar(req: Request, _res: Response, next: NextFunction): void {
  const [tipo, token] = (req.headers.authorization ?? "").split(" ");
  if (tipo !== "Bearer" || !token) throw new ErrorHttp(401, "Debe iniciar sesión");
  try {
    const d = jwt.verify(token, secreto(), { algorithms: ["HS256"] }) as UsuarioSesion;
    req.usuario = { id: d.id, rol: d.rol, productorId: d.productorId, centroId: d.centroId };
  } catch {
    throw new ErrorHttp(401, "La sesión no es válida o venció");
  }
  next();
}

// El servidor valida el rol en cada operación (MVP-01); la interfaz solo oculta opciones.
export function permitir(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.usuario.rol)) {
      throw new ErrorHttp(403, "Su rol no permite esta operación");
    }
    next();
  };
}
