import { DBSchema, openDB } from "idb";
import { api, ErrorApi } from "./api";

// Cola sin conexión (MVP-03). Toda recepción se guarda primero aquí y luego se envía.
// El id lo crea el dispositivo: si la respuesta del servidor se pierde y se reenvía,
// el servidor reconoce el id y no la duplica. Solo se borra de la cola cuando el servidor confirma.

export interface RecepcionLocal {
  id: string;
  codigo: string;
  productorId: number;
  productorEtiqueta: string;
  centroId: number;
  fechaHora: string;
  litros: number;
  temperatura: number;
  error?: string;
}

export interface Catalogo {
  id: number;
  codigo?: string;
  nombre: string;
  centroId?: number;
}

interface Esquema extends DBSchema {
  cola: { key: string; value: RecepcionLocal };
  catalogos: { key: string; value: Catalogo[] };
}

const baseLocal = openDB<Esquema>("conecta", 1, {
  upgrade(db) {
    db.createObjectStore("cola", { keyPath: "id" });
    db.createObjectStore("catalogos");
  },
});

export const codigoDeRecepcion = (id: string) =>
  "REC-" + id.slice(0, 13).replace("-", "").toUpperCase();

export async function encolar(r: RecepcionLocal): Promise<void> {
  await (await baseLocal).put("cola", r);
}
export async function pendientes(): Promise<RecepcionLocal[]> {
  return (await baseLocal).getAll("cola");
}

// Los catálogos se guardan para poder elegir productor sin internet.
export async function catalogo(nombre: "productores" | "centros"): Promise<Catalogo[]> {
  const db = await baseLocal;
  try {
    const datos = await api<Catalogo[]>("GET", `/${nombre}`);
    await db.put("catalogos", datos, nombre);
    return datos;
  } catch (error) {
    const copia = await db.get("catalogos", nombre);
    if (copia) return copia;
    throw error;
  }
}

export interface ResultadoSincronizacion {
  enviadas: number;
  conError: number;
  sinConexion: boolean;
}

let enCurso = false;

export async function sincronizar(): Promise<ResultadoSincronizacion> {
  const db = await baseLocal;
  const cola = await db.getAll("cola");
  if (enCurso || cola.length === 0) return { enviadas: 0, conError: 0, sinConexion: false };
  enCurso = true;
  try {
    const cuerpo = cola.map(({ productorEtiqueta: _e, codigo: _c, error: _x, ...r }) => r);
    const { resultados } = await api<{ resultados: { id: string; estado: string; mensaje?: string }[] }>(
      "POST",
      "/recepciones/sincronizar",
      { recepciones: cuerpo },
    );
    let enviadas = 0;
    let conError = 0;
    for (const r of resultados) {
      if (r.estado === "error") {
        conError++;
        const item = cola.find((c) => c.id === r.id);
        if (item) await db.put("cola", { ...item, error: r.mensaje });
      } else {
        enviadas++;
        await db.delete("cola", r.id);
      }
    }
    return { enviadas, conError, sinConexion: false };
  } catch (error) {
    // Sin red o con la sesión vencida la cola queda intacta: no se pierde nada.
    if (error instanceof ErrorApi && error.estado !== 401) throw error;
    return { enviadas: 0, conError: 0, sinConexion: true };
  } finally {
    enCurso = false;
  }
}
