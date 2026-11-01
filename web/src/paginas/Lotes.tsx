import { FormEvent, useState } from "react";
import { api, hoy, leerSesion } from "../api";
import { Aviso, Estado, useDatos } from "../comun";

export function Lotes() {
  const rol = leerSesion()!.usuario.rol;
  const puedeCrear = rol === "jefe_planta" || rol === "administrador";
  const lotes = useDatos<any[]>(() => api("GET", "/lotes"));
  const disponibles = useDatos<any[]>(() => api("GET", "/recepciones?estado=analizada&limite=60"));
  const [codigo, setCodigo] = useState("");
  const [producto, setProducto] = useState("Queso costeño");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [traza, setTraza] = useState<any | null>(null);
  const [adelante, setAdelante] = useState<{ codigo: string; lotes: any[] } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function alternar(id: string) {
    const nuevas = new Set(marcadas);
    if (!nuevas.delete(id)) nuevas.add(id);
    setMarcadas(nuevas);
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api("POST", "/lotes", { codigo, producto, fecha: hoy(), recepciones: [...marcadas] });
      setAviso({ tipo: "ok", texto: `Lote ${r.codigo} creado con ${marcadas.size} recepciones.` });
      setCodigo("");
      setMarcadas(new Set());
      await lotes.recargar();
      await verTraza(r.id);
    } catch (err) {
      setAviso({ tipo: "error", texto: (err as Error).message });
    }
  }

  async function verTraza(id: number) {
    setAdelante(null);
    setTraza(await api("GET", `/lotes/${id}/trazabilidad`));
  }

  async function verAdelante(id: string, codigoRecepcion: string) {
    setAdelante({ codigo: codigoRecepcion, lotes: await api("GET", `/recepciones/${id}/lotes`) });
  }

  return (
    <>
      <h1>Lotes y trazabilidad</h1>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <section className="tarjeta">
        <h2>Lotes de producción</h2>
        <div className="tabla">
          <table>
            <thead><tr><th>Código</th><th>Producto</th><th>Fecha</th><th>Recepciones</th><th></th></tr></thead>
            <tbody>
              {(lotes.datos ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{l.codigo}</td><td>{l.producto}</td><td>{l.fecha}</td><td>{l.recepciones}</td>
                  <td><button className="enlace" onClick={() => void verTraza(l.id)}>Ver trazabilidad</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {traza && (
        <section className="tarjeta">
          <h2>Hacia atrás: {traza.codigo} · {traza.producto}</h2>
          <div className="tabla">
            <table>
              <thead><tr><th>Recepción</th><th>Fecha</th><th>Centro</th><th>Productor</th><th>Litros</th><th>°C</th><th>Grasa</th><th>Proteína</th><th>UFC</th><th></th></tr></thead>
              <tbody>
                {traza.recepciones.map((r: any) => (
                  <tr key={r.recepcionId}>
                    <td>{r.codigo}</td><td>{r.fecha}</td><td>{r.centro}</td><td>{r.productorCodigo} · {r.productorNombre}</td><td>{r.litros}</td><td>{r.temperatura}</td><td>{r.grasa}</td><td>{r.proteina}</td><td>{r.ufc?.toLocaleString("es-CO")}</td>
                    <td><button className="enlace" onClick={() => void verAdelante(r.recepcionId, r.codigo)}>¿En qué lotes está?</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {adelante && (
        <section className="tarjeta">
          <h2>Hacia adelante: {adelante.codigo}</h2>
          <ul>{adelante.lotes.map((l) => <li key={l.id}>{l.codigo} · {l.producto} · {l.fecha}</li>)}</ul>
        </section>
      )}

      {puedeCrear && (
        <form onSubmit={crear} className="tarjeta">
          <h2>Crear lote</h2>
          <div className="barra">
            <label>Código<input value={codigo} onChange={(e) => setCodigo(e.target.value)} minLength={3} required /></label>
            <label>Producto
              <select value={producto} onChange={(e) => setProducto(e.target.value)}>
                {["Queso costeño", "Suero costeño", "Leche UHT", "Yogur"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <button type="submit" disabled={marcadas.size === 0}>Crear con {marcadas.size} recepciones</button>
          </div>
          <div className="tabla alto-limitado">
            <table>
              <thead><tr><th></th><th>Código</th><th>Fecha</th><th>Productor</th><th>Centro</th><th>Litros</th><th>Estado</th></tr></thead>
              <tbody>
                {(disponibles.datos ?? []).map((r) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" aria-label={`Incluir ${r.codigo}`} checked={marcadas.has(r.id)} onChange={() => alternar(r.id)} /></td>
                    <td>{r.codigo}</td><td>{r.fecha}</td><td>{r.productorCodigo}</td><td>{r.centroNombre}</td><td>{r.litros}</td><td><Estado valor={r.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      )}
    </>
  );
}
