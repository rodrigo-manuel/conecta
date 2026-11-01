import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { leerSesion } from "../api";
import { catalogo, Catalogo, codigoDeRecepcion, encolar, pendientes, RecepcionLocal, sincronizar } from "../cola";
import { Aviso, useDatos } from "../comun";

export function RecepcionPagina() {
  const centroPropio = leerSesion()!.usuario.centroId;
  const { datos: productores, error } = useDatos<Catalogo[]>(() => catalogo("productores"));
  const { datos: centros } = useDatos<Catalogo[]>(() => catalogo("centros"));
  const [centroId, setCentroId] = useState<number>(centroPropio ?? 1);
  const [productorId, setProductorId] = useState("");
  const [litros, setLitros] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [cola, setCola] = useState<RecepcionLocal[]>([]);
  const [comprobante, setComprobante] = useState<RecepcionLocal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const primerCampo = useRef<HTMLSelectElement>(null);

  const refrescarCola = useCallback(async () => setCola(await pendientes()), []);

  const enviarCola = useCallback(async () => {
    const r = await sincronizar();
    await refrescarCola();
    if (r.sinConexion) setAviso("Sin conexión o sesión vencida: las recepciones siguen guardadas en este dispositivo.");
    else if (r.enviadas || r.conError) {
      setAviso(`Sincronización: ${r.enviadas} enviadas${r.conError ? `, ${r.conError} con error para revisar` : ""}.`);
    }
  }, [refrescarCola]);

  // Sincronización automática al recuperar la señal; el botón manual queda como respaldo.
  useEffect(() => {
    const alConectar = () => { setEnLinea(true); void enviarCola(); };
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    void refrescarCola();
    if (navigator.onLine) void enviarCola();
    return () => {
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
    };
  }, [enviarCola, refrescarCola]);

  const delCentro = (productores ?? []).filter((p) => p.centroId === centroId);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    const productor = delCentro.find((p) => p.id === Number(productorId));
    if (!productor) return;
    const id = crypto.randomUUID();
    const r: RecepcionLocal = {
      id,
      codigo: codigoDeRecepcion(id),
      productorId: productor.id,
      productorEtiqueta: `${productor.codigo} · ${productor.nombre}`,
      centroId,
      fechaHora: new Date().toISOString(),
      litros: Number(litros),
      temperatura: Number(temperatura),
    };
    await encolar(r); // primero en el dispositivo: si se va la luz o la señal, ya está a salvo
    setComprobante(r);
    setProductorId("");
    setLitros("");
    setTemperatura("");
    setAviso(null);
    primerCampo.current?.focus();
    await refrescarCola();
    if (navigator.onLine) await enviarCola();
  }

  const centroNombre = centros?.find((c) => c.id === centroId)?.nombre ?? `Centro ${centroId}`;

  return (
    <>
      <div className="no-imprimir">
        <h1>Registrar recepción</h1>
        <p className={enLinea ? "senal senal-si" : "senal senal-no"}>
          {enLinea ? "Con conexión" : "Sin conexión: se guarda en este dispositivo"}
        </p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <form onSubmit={registrar} className="tarjeta formulario">
          {centroPropio === null && (
            <label>Centro de acopio
              <select value={centroId} onChange={(e) => { setCentroId(Number(e.target.value)); setProductorId(""); }}>
                {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <label>Productor
            <select ref={primerCampo} value={productorId} onChange={(e) => setProductorId(e.target.value)} required autoFocus>
              <option value="">Seleccione…</option>
              {delCentro.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
            </select>
          </label>
          <label>Litros
            <input type="number" inputMode="decimal" step="0.1" min="0.1" max="5000" value={litros} onChange={(e) => setLitros(e.target.value)} required />
          </label>
          <label>Temperatura (°C)
            <input type="number" inputMode="decimal" step="0.1" min="-5" max="60" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} required />
          </label>
          <button type="submit">Registrar</button>
        </form>

        <section className="tarjeta">
          <h2>Pendientes por sincronizar: {cola.length}</h2>
          {aviso && <Aviso>{aviso}</Aviso>}
          <button onClick={() => void enviarCola()} disabled={cola.length === 0}>Sincronizar ahora</button>
          <ul>
            {cola.map((r) => (
              <li key={r.id}>{r.codigo} · {r.productorEtiqueta} · {r.litros} L{r.error && <strong className="texto-error"> · {r.error}</strong>}</li>
            ))}
          </ul>
        </section>
      </div>

      {comprobante && (
        <section className="tarjeta comprobante">
          <h2>Comprobante de recepción</h2>
          <p className="codigo">{comprobante.codigo}</p>
          <dl>
            <dt>Productor</dt><dd>{comprobante.productorEtiqueta}</dd>
            <dt>Centro</dt><dd>{centroNombre}</dd>
            <dt>Fecha y hora</dt><dd>{new Date(comprobante.fechaHora).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</dd>
            <dt>Litros</dt><dd>{comprobante.litros}</dd>
            <dt>Temperatura</dt><dd>{comprobante.temperatura} °C</dd>
          </dl>
          <button className="no-imprimir" onClick={() => window.print()}>Imprimir comprobante</button>
        </section>
      )}
    </>
  );
}
