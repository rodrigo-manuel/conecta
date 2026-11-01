import type { Exportador, LineaLiquidacion } from "./interfaces.js";

function csv(encabezado: string[], filas: (string | number)[][]): string {
  return [encabezado, ...filas].map((f) => f.join(";")).join("\r\n") + "\r\n";
}

// Archivo plano para SICOOP: el ERP actual no tiene API. El nuevo ERP será otra implementación.
export const exportadorSicoop: Exportador = {
  nombreArchivo: (inicio) => `sicoop_liquidacion_${inicio}.csv`,
  generar: (lineas: LineaLiquidacion[]) =>
    csv(
      ["liquidacion_id", "productor", "periodo_inicio", "periodo_fin", "litros", "bruto", "aporte_social", "ahorro_voluntario", "neto"],
      lineas.map((l) => [
        l.liquidacionId, l.productorCodigo, l.periodoInicio, l.periodoFin,
        l.litros, l.bruto, l.aporteSocial, l.ahorroVoluntario, l.neto,
      ]),
    ),
};

// Al fondo solo le interesa el ahorro voluntario que se le traslada.
export const exportadorFondo: Exportador = {
  nombreArchivo: (inicio) => `fondo_ahorro_${inicio}.csv`,
  generar: (lineas: LineaLiquidacion[]) =>
    csv(
      ["liquidacion_id", "productor", "periodo_inicio", "periodo_fin", "ahorro_voluntario"],
      lineas
        .filter((l) => l.ahorroVoluntario > 0)
        .map((l) => [l.liquidacionId, l.productorCodigo, l.periodoInicio, l.periodoFin, l.ahorroVoluntario]),
    ),
};
