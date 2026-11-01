import { app } from "./app.js";
import { pool } from "./db.js";

const puerto = Number(process.env.PORT ?? 3000);

const servidor = app.listen(puerto, () => {
  console.log(`API de Conecta escuchando en el puerto ${puerto}`);
});

// Cierre ordenado: docker compose down envía SIGTERM al contenedor.
process.on("SIGTERM", () => {
  servidor.close(() => {
    void pool.end().then(() => process.exit(0));
  });
});
