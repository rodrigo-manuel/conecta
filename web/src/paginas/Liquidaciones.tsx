import { useState } from "react";
import { api, cop, descargar, hoy } from "../api";
import { Aviso, Estado, useDatos } from "../comun";

export function Liquidaciones() {
  const [fecha, setFecha] = useState(hoy());
  const lista = useDatos<any[]>(() => api("GET", `/liquidaciones?fecha=${fecha}`), [fecha]);
  const versiones = useDatos<any[]>(() => api("GET", "/parametros"));
  const [detalle, setDetalle] = useState<any | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const [nuevaVigencia, setNuevaVigencia] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");

  async function intentar(trabajo: () => Promise<void>) {
    setAviso(null);
    try {
      await trabajo();
    } catch (err) {
      setAviso({ tipo: "error", texto: (err as Error).message });
    }
  }

  const calcular = () =>
    intentar(async () => {
      const r = await api("POST", "/liquidaciones/calcular", { fecha });
      setDetalle(null);
      setAviso({
        tipo: "ok",
        texto: `Periodo ${r.periodo.inicio} a ${r.periodo.fin}: ${r.creadas} liquidaciones calculadas; ${r.recepcionesDiferidas} recepciones sin resultado pasan al periodo siguiente.`,
      });
      await lista.recargar();
    });

  const abrir = (id: number) => intentar(async () => setDetalle(await api("GET", `/liquidaciones/${id}`)));

  const aprobar = (id: number) =>
    intentar(async () => {
      await api("POST", `/liquidaciones/${id}/aprobar`);
      setAviso({ tipo: "ok", texto: "Liquidación aprobada y bloqueada. Se notificó al productor." });
      await lista.recargar();
      setDetalle(await api("GET", `/liquidaciones/${id}`));
    });

  const agregarVersion = () =>
    intentar(async () => {
      const ultima = versiones.datos![versiones.datos!.length - 1];
      await api("POST", "/parametros", { ...ultima, vigenteDesde: nuevaVigencia, precioBase: Number(nuevoPrecio) });
      setNuevaVigencia("");
      setNuevoPrecio("");
      setAviso({ tipo: "ok", texto: "Nueva versión de parámetros registrada. Lo ya aprobado no cambia." });
      await versiones.recargar();
    });

  const exportar = (destino: "erp" | "fondo") =>
    intentar(() => descargar(`/liquidaciones/exportar?fecha=${fecha}&destino=${destino}`, `${destino}_${fecha}.csv`));

  return (
    <>
      <h1>Liquidación quincenal</h1>
      <section className="tarjeta barra">
        <label>Fecha dentro de la quincena<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <button onClick={() => void calcular()}>Calcular</button>
        <button className="secundario" onClick={() => void exportar("erp")}>Exportar a SICOOP</button>
        <button className="secundario" onClick={() => void exportar("fondo")}>Exportar al fondo</button>
      </section>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {lista.error && <Aviso tipo="error">{lista.error}</Aviso>}

      {detalle && (
        <section className="tarjeta">
          <h2>{detalle.productorCodigo} · {detalle.productorNombre} <Estado valor={detalle.estado} /></h2>
          <p>Bruto {cop(detalle.bruto)} − aporte {cop(detalle.aporteSocial)} − ahorro {cop(detalle.ahorroVoluntario)} = <strong>neto {cop(detalle.neto)}</strong></p>
          <div className="tabla">
            <table>
              <thead><tr><th>Recepción</th><th>Fecha</th><th>Estado</th><th>Litros</th><th>Precio/L</th><th>Bruto</th><th>Aporte</th><th>Ahorro</th><th>Neto</th><th>Parámetros</th></tr></thead>
              <tbody>
                {detalle.detalle.map((d: any) => (
                  <tr key={d.recepcionId}>
                    <td>{d.codigo}</td><td>{d.fecha}</td><td><Estado valor={d.estado} /></td><td>{d.litros}</td>
                    <td>{cop(d.precioPorLitro)}</td><td>{cop(d.bruto)}</td><td>{cop(d.aporteSocial)}</td><td>{cop(d.ahorroVoluntario)}</td><td>{cop(d.neto)}</td>
                    <td>{d.parametrosVigentesDesde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detalle.estado === "calculada" && <button onClick={() => void aprobar(detalle.id)}>Aprobar y bloquear</button>}
        </section>
      )}

      <section className="tarjeta">
        <h2>Liquidaciones del periodo: {lista.datos?.length ?? "…"}</h2>
        <div className="tabla">
          <table>
            <thead><tr><th>Productor</th><th>Litros</th><th>Bruto</th><th>Aporte</th><th>Ahorro</th><th>Neto</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {(lista.datos ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{l.productorCodigo}</td><td>{l.litros}</td><td>{cop(l.bruto)}</td><td>{cop(l.aporteSocial)}</td><td>{cop(l.ahorroVoluntario)}</td><td>{cop(l.neto)}</td>
                  <td><Estado valor={l.estado} /></td>
                  <td><button className="enlace" onClick={() => void abrir(l.id)}>Ver detalle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Parámetros de pago por vigencia</h2>
        <ul>{(versiones.datos ?? []).map((v) => <li key={v.vigenteDesde}>Desde {v.vigenteDesde}: base {cop(v.precioBase)}/L</li>)}</ul>
        <div className="barra">
          <label>Vigente desde<input type="date" value={nuevaVigencia} onChange={(e) => setNuevaVigencia(e.target.value)} /></label>
          <label>Precio base<input type="number" min="1" value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} /></label>
          <button className="secundario" disabled={!nuevaVigencia || !nuevoPrecio || !versiones.datos} onClick={() => void agregarVersion()}>Agregar versión</button>
        </div>
      </section>
    </>
  );
}
