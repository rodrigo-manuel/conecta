import pg from "pg";

// Pool de conexiones a PostgreSQL. Crearlo no abre conexiones: se abren con la primera consulta.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});
