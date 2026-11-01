import { FormEvent, useState } from "react";
import { api } from "../api";
import { Aviso, useDatos } from "../comun";

interface Pendiente {
  id: string;
  codigo: string;
  fecha: string;
  litros: number;
  productorCodigo: string;
  centroNombre: string;
}

export function Laboratorio() {
  const pendientes = useDatos<Pendiente[]>(() => api("GET", "/recepciones?estado=pendiente&limite=200"));
  const alertas = useDatos<any[]>(() => api("GET", "/alertas"));
  const [abierta, setAbierta] = useState<Pendiente | null>(null);
  const [grasa, setGrasa] = useState("");
  const [proteina, setProteina] = useState("");
  const [ufc, setUfc] = useState("");
  const [antibioticos, setAntibioticos] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api("PUT", `/recepciones/${abierta!.id}/resultado`, {
        grasa: Number(grasa),
        proteina: Number(proteina),
        ufc: Number(ufc),
        antibioticosPositivo: antibioticos,
      });
      setAviso(
        r.estado === "rechazada"
          ? { tipo: "error", texto: `${abierta!.codigo} RECHAZADA por antibióticos. Se alertó al productor y a calidad.` }
          : { tipo: "ok", texto: `Resultado de ${abierta!.codigo} guardado.` },
      );
      setAbierta(null);
      setGrasa(""); setProteina(""); setUfc(""); setAntibioticos(false);
      await Promise.all([pendientes.recargar(), alertas.recargar()]);
    } catch (err) {
      setAviso({ tipo: "error", texto: (err as Error).message });
    }
  }

  return (
    <>
      <h1>Resultados de laboratorio</h1>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {pendientes.error && <Aviso tipo="error">{pendientes.error}</Aviso>}

      {abierta && (
        <form onSubmit={guardar} className="tarjeta formulario">
          <h2>{abierta.codigo} · {abierta.productorCodigo}</h2>
          <label>Grasa (%)<input type="number" step="0.01" min="0" max="15" value={grasa} onChange={(e) => setGrasa(e.target.value)} required autoFocus /></label>
          <label>Proteína (%)<input type="number" step="0.01" min="0" max="15" value={proteina} onChange={(e) => setProteina(e.target.value)} required /></label>
          <label>UFC/mL<input type="number" step="1" min="0" value={ufc} onChange={(e) => setUfc(e.target.value)} required /></label>
          <label className="casilla"><input type="checkbox" checked={antibioticos} onChange={(e) => setAntibioticos(e.target.checked)} /> Antibióticos positivos</label>
          <div className="acciones">
            <button type="submit">Guardar resultado</button>
            <button type="button" className="secundario" onClick={() => setAbierta(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <section className="tarjeta">
        <h2>Sin resultado: {pendientes.datos?.length ?? "…"}</h2>
        <div className="tabla">
          <table>
            <thead><tr><th>Código</th><th>Fecha</th><th>Productor</th><th>Centro</th><th>Litros</th><th></th></tr></thead>
            <tbody>
              {(pendientes.datos ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.codigo}</td><td>{r.fecha}</td><td>{r.productorCodigo}</td><td>{r.centroNombre}</td><td>{r.litros}</td>
                  <td><button className="enlace" onClick={() => { setAbierta(r); setAviso(null); }}>Registrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Alertas de calidad</h2>
        <ul>{(alertas.datos ?? []).slice(0, 15).map((a) => <li key={a.id}>{a.mensaje} · {a.productorCodigo} · {a.centro}</li>)}</ul>
      </section>
    </>
  );
}
