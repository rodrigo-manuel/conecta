import { api, cop } from "../api";
import { Aviso, useDatos } from "../comun";

export function Tablero() {
  const { datos: t, error } = useDatos<any>(() => api("GET", "/tablero"));
  if (error) return <Aviso tipo="error">{error}</Aviso>;
  if (!t) return <p>Cargando…</p>;
  const maximo = Math.max(1, ...t.litrosPorCentro.map((c: any) => c.litros));

  return (
    <>
      <h1>Tablero gerencial</h1>
      <p>Día {t.dia} · Quincena {t.periodo.inicio} a {t.periodo.fin}</p>
      <section className="indicadores">
        <article className="tarjeta"><span>Litros del día</span><strong>{t.litrosDelDia.toLocaleString("es-CO")}</strong></article>
        <article className="tarjeta"><span>Rechazos en la quincena</span><strong>{t.porcentajeRechazos} %</strong></article>
        <article className="tarjeta"><span>Recepciones sin resultado</span><strong>{t.recepcionesSinResultado}</strong></article>
        <article className="tarjeta"><span>Estimado a pagar en la quincena</span><strong>{cop(t.valorEstimadoAPagar)}</strong></article>
      </section>
      <section className="tarjeta">
        <h2>Litros del día por centro</h2>
        {t.litrosPorCentro.map((c: any) => (
          <div className="barra-dato" key={c.id}>
            <span>{c.nombre}</span>
            <div className="pista"><div className="relleno" style={{ width: `${(c.litros / maximo) * 100}%` }} /></div>
            <span>{c.litros.toLocaleString("es-CO")} L · {c.recepciones} rec.</span>
          </div>
        ))}
      </section>
    </>
  );
}
