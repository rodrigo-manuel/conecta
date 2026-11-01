import { useState } from "react";
import { api } from "../api";
import { Aviso, useDatos } from "../comun";

// Muestra solo los campos que cambiaron, que es lo que busca el revisor fiscal.
function cambios(antes: any, despues: any): string {
  if (!antes || !despues) return "";
  return Object.keys(despues)
    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    .map((k) => `${k}: ${JSON.stringify(antes[k])} → ${JSON.stringify(despues[k])}`)
    .join("; ");
}

export function Auditoria() {
  const [tabla, setTabla] = useState("");
  const { datos, error } = useDatos<any[]>(
    () => api("GET", `/auditoria?limite=150${tabla ? `&tabla=${tabla}` : ""}`),
    [tabla],
  );
  const productores = useDatos<any[]>(() => api("GET", "/productores"));
  const [productor, setProductor] = useState("");
  const autorizaciones = useDatos<any[]>(
    () => (productor ? api("GET", `/productores/${productor}/autorizacion-datos`) : Promise.resolve([])),
    [productor],
  );

  return (
    <>
      <h1>Auditoría</h1>
      <p>Este rastro no se puede editar ni borrar: la base de datos lo impide.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <section className="tarjeta">
        <label>Tabla
          <select value={tabla} onChange={(e) => setTabla(e.target.value)}>
            <option value="">Todas</option>
            <option value="recepcion">Recepciones</option>
            <option value="resultado_laboratorio">Resultados</option>
            <option value="liquidacion">Liquidaciones</option>
            <option value="parametro_pago">Parámetros</option>
          </select>
        </label>
        <div className="tabla">
          <table>
            <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Tabla</th><th>Registro</th><th>Cambios</th></tr></thead>
            <tbody>
              {(datos ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.en).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</td>
                  <td>{a.usuario ?? "sistema"}</td><td>{a.operacion}</td><td>{a.tabla}</td><td>{a.registroId?.slice(0, 13)}</td>
                  <td>{cambios(a.antes, a.despues)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Autorización de tratamiento de datos (Ley 1581 de 2012)</h2>
        <label>Productor
          <select value={productor} onChange={(e) => setProductor(e.target.value)}>
            <option value="">Seleccione…</option>
            {(productores.datos ?? []).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
          </select>
        </label>
        <ul>
          {(autorizaciones.datos ?? []).map((a) => (
            <li key={a.id}>Política {a.versionPolitica} · {a.medio} · {new Date(a.otorgadaEn).toLocaleDateString("es-CO")}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
