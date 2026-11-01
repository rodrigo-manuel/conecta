export interface Sesion {
  token: string;
  usuario: { id: number; nombre: string; rol: string; productorId: number | null; centroId: number | null };
}

const CLAVE = "conecta.sesion";

export function leerSesion(): Sesion | null {
  const crudo = localStorage.getItem(CLAVE);
  return crudo ? (JSON.parse(crudo) as Sesion) : null;
}
export const guardarSesion = (s: Sesion) => localStorage.setItem(CLAVE, JSON.stringify(s));
export const cerrarSesion = () => localStorage.removeItem(CLAVE);

export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
  }
}

function cabeceras(): HeadersInit {
  const s = leerSesion();
  return { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}) };
}

export async function api<T = any>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: cabeceras(),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, datos.error ?? "No se pudo completar la operación");
  return datos as T;
}

export async function descargar(ruta: string, nombre: string): Promise<void> {
  const r = await fetch(`/api${ruta}`, { headers: cabeceras() });
  if (!r.ok) throw new ErrorApi(r.status, "No se pudo generar el archivo");
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(await r.blob());
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

export const cop = (v: number) => `$ ${Math.round(v).toLocaleString("es-CO")}`;
export const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
