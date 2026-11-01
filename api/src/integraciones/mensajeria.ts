import { pool } from "../db.js";
import type { Mensajeria } from "./interfaces.js";

// Adaptador falso: guarda el SMS en vez de enviarlo. Un proveedor real implementa la misma interfaz.
export const mensajeriaFalsa: Mensajeria = {
  async enviar(productorId, texto) {
    await pool.query(
      "INSERT INTO mensaje_saliente (productor_id, canal, texto) VALUES ($1, 'sms_simulado', $2)",
      [productorId, texto],
    );
  },
};
