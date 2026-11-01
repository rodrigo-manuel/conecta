import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Crea conecta_test desde cero con los mismos scripts de db/init, sin tocar los datos de la demo.
export default async function preparar(): Promise<void> {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? "postgres://conecta:cambie_esta_clave@localhost:5432/conecta_test",
  );
  const base = url.pathname.slice(1);
  url.pathname = "/postgres";

  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${base} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${base}`);
  await admin.end();

  url.pathname = `/${base}`;
  const cliente = new pg.Client({ connectionString: url.href });
  await cliente.connect();
  const carpeta = path.resolve("../db/init");
  for (const archivo of readdirSync(carpeta).sort()) {
    await cliente.query(readFileSync(path.join(carpeta, archivo), "utf8"));
  }
  await cliente.end();
}
