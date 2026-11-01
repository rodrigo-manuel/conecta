import { FormEvent, useState } from "react";
import { api, cerrarSesion, guardarSesion, leerSesion, Sesion } from "./api";
import { Aviso } from "./comun";
import { Auditoria } from "./paginas/Auditoria";
import { Laboratorio } from "./paginas/Laboratorio";
import { Liquidaciones } from "./paginas/Liquidaciones";
import { Lotes } from "./paginas/Lotes";
import { Portal } from "./paginas/Portal";
import { RecepcionPagina } from "./paginas/Recepcion";
import { Tablero } from "./paginas/Tablero";

// Esto solo ordena el menú; quien decide los permisos es el servidor en cada operación.
const PAGINAS: { id: string; titulo: string; roles: string[]; Vista: () => React.JSX.Element }[] = [
  { id: "recepcion", titulo: "Recepción", roles: ["operador_acopio", "administrador"], Vista: RecepcionPagina },
  { id: "laboratorio", titulo: "Laboratorio", roles: ["analista_laboratorio", "administrador"], Vista: Laboratorio },
  { id: "liquidacion", titulo: "Liquidación", roles: ["coordinador_liquidacion", "administrador"], Vista: Liquidaciones },
  { id: "portal", titulo: "Mi leche y mis pagos", roles: ["productor"], Vista: Portal },
  { id: "tablero", titulo: "Tablero", roles: ["gerencia", "revisor_fiscal", "administrador"], Vista: Tablero },
  { id: "lotes", titulo: "Lotes y trazabilidad", roles: ["jefe_planta", "gerencia", "revisor_fiscal", "administrador"], Vista: Lotes },
  { id: "auditoria", titulo: "Auditoría", roles: ["revisor_fiscal", "administrador"], Vista: Auditoria },
];

function Login({ alEntrar }: { alEntrar: (s: Sesion) => void }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const s = await api<Sesion>("POST", "/auth/login", { usuario, clave });
      guardarSesion(s);
      alEntrar(s);
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : "Se necesita conexión para iniciar sesión");
    }
  }

  return (
    <main className="login">
      <h1>Conecta</h1>
      <p>Cooperativa Lechera Valle Sereno</p>
      <form onSubmit={enviar} className="tarjeta">
        <label>Usuario<input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required autoFocus /></label>
        <label>Clave<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required /></label>
        <button type="submit">Entrar</button>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>
    </main>
  );
}

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  if (!sesion) return <Login alEntrar={setSesion} />;

  const disponibles = PAGINAS.filter((p) => p.roles.includes(sesion.usuario.rol));
  const activa = disponibles.find((p) => p.id === seleccion) ?? disponibles[0];

  return (
    <>
      <header className="cabecera no-imprimir">
        <strong>Conecta</strong>
        <nav>
          {disponibles.map((p) => (
            <button key={p.id} className={p.id === activa?.id ? "activo" : "enlace"} onClick={() => setSeleccion(p.id)}>
              {p.titulo}
            </button>
          ))}
        </nav>
        <span className="quien">
          {sesion.usuario.nombre}{" "}
          <button className="enlace" onClick={() => { cerrarSesion(); setSesion(null); setSeleccion(null); }}>Salir</button>
        </span>
      </header>
      <main className="contenido">{activa ? <activa.Vista key={activa.id} /> : <Aviso tipo="error">Su rol no tiene pantallas asignadas.</Aviso>}</main>
    </>
  );
}
