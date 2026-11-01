// Parámetros de pago (sección 3.7 del caso). Cada versión rige desde su fecha de vigencia,
// así que un cambio de reglas se agrega como versión nueva y no altera el pasado.
export interface ParametrosPago {
  vigenteDesde: string; // AAAA-MM-DD
  precioBase: number;
  grasaReferencia: number;
  ajustePorDecimaGrasa: number;
  proteinaReferencia: number;
  ajustePorDecimaProteina: number;
  ufcLimiteBonificacion: number;
  bonificacionUfc: number;
  ufcLimitePenalizacion: number;
  penalizacionUfc: number;
  temperaturaMaxima: number;
  penalizacionTemperatura: number;
  aporteSocialPct: number;
  ahorroMaximoPct: number;
}

export const PARAMETROS_INICIALES: ParametrosPago = {
  vigenteDesde: "2026-01-01",
  precioBase: 1850,
  grasaReferencia: 3.5,
  ajustePorDecimaGrasa: 15,
  proteinaReferencia: 3.1,
  ajustePorDecimaProteina: 20,
  ufcLimiteBonificacion: 100_000,
  bonificacionUfc: 40,
  ufcLimitePenalizacion: 300_000,
  penalizacionUfc: 60,
  temperaturaMaxima: 8,
  penalizacionTemperatura: 25,
  aporteSocialPct: 2,
  ahorroMaximoPct: 10,
};

// Devuelve la versión más reciente cuya vigencia ya empezó en la fecha indicada.
// Las fechas AAAA-MM-DD se pueden comparar como texto.
export function parametrosVigentes(versiones: ParametrosPago[], fecha: string): ParametrosPago {
  const aplicables = versiones.filter((v) => v.vigenteDesde <= fecha);
  if (aplicables.length === 0) {
    throw new RangeError(`No hay parámetros de pago vigentes el ${fecha}`);
  }
  return aplicables.reduce((a, b) => (b.vigenteDesde > a.vigenteDesde ? b : a));
}
