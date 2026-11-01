import { useState } from "react";
import { api, cop } from "../api";
import { Aviso, Estado, useDatos } from "../comun";

export function Portal() {
  const recepciones = useDatos<any[]>(() => api("GET", "/portal/recepciones"));
  const liquidaciones = useDatos<any[]>(() => api("GET", "/portal/liquidaciones"));
  const [detalle, setDetalle] = useState<any | null>(null);

  return (
    <>
      <h1>Mi leche y mis pagos</h1>
      {(recepciones.error || liquidaciones.error) && <Aviso tipo="error">{recepciones.error ?? liquidaciones.error}</Aviso>}

      <section className="tarjeta">
        <h2>Mis liquidaciones aprobadas</h2>
        {liquidaciones.datos?.length === 0 && <p>Todavía no tiene liquidaciones aprobadas.</p>}
        <div className="tabla">
          <table>
            <thead><tr><th>Periodo</th><th>Litros</th><th>Bruto</th><th>Aporte</th><th>Ahorro</th><th>Neto</th><th></th></tr></thead>
            <tbody>
              {(liquidaciones.datos ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{l.periodoInicio} a {l.periodoFin}</td><td>{l.litros}</td><td>{cop(l.bruto)}</td><td>{cop(l.aporteSocial)}</td><td>{cop(l.ahorroVoluntario)}</td><td><strong>{cop(l.neto)}</strong></td>
                  <td><button className="enlace" onClick={() => void api("GET", `/liquidaciones/${l.id}`).then(setDetalle)}>Ver detalle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detalle && (
          <ul>
            {detalle.detalle.map((d: any) => (
              <li key={d.recepcionId}>{d.fecha} · {d.codigo} · {d.litros} L a {cop(d.precioPorLitro)} · neto {cop(d.neto)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta">
        <h2>Mis recepciones y resultados</h2>
        <div className="tabla">
          <table>
            <thead><tr><th>Fecha</th><th>Código</th><th>Litros</th><th>°C</th><th>Grasa</th><th>Proteína</th><th>UFC</th><th>Estado</th></tr></thead>
            <tbody>
              {(recepciones.datos ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.fecha}</td><td>{r.codigo}</td><td>{r.litros}</td><td>{r.temperatura}</td><td>{r.grasa ?? "—"}</td><td>{r.proteina ?? "—"}</td><td>{r.ufc?.toLocaleString("es-CO") ?? "—"}</td>
                  <td><Estado valor={r.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
