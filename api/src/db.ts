import pg from "pg";

// Las fechas se manejan como texto AAAA-MM-DD para que la zona horaria no las mueva.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

// Pool de conexiones a PostgreSQL. Crearlo no abre conexiones: se abren con la primera consulta.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

// Ejecuta todo o nada, y le dice a los triggers de auditoría quién está actuando.
export async function enTransaccion<T>(
  usuarioId: number,
  trabajo: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT set_config('conecta.usuario_id', $1, TRUE)", [String(usuarioId)]);
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}
