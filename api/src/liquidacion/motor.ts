import { ParametrosPago, parametrosVigentes } from "./parametros.js";
import { Periodo } from "./periodo.js";

// Motor de liquidación: funciones puras, sin base de datos ni reloj.
// Con las mismas entradas siempre da el mismo resultado, y por eso se prueba sin Docker.

export interface ResultadoLaboratorio {
  grasa: number;
  proteina: number;
  ufc: number;
  antibioticosPositivo: boolean;
}

export interface Recepcion {
  id: string;
  fecha: string; // AAAA-MM-DD
  litros: number;
  temperatura: number;
  resultado: ResultadoLaboratorio | null;
}

export interface DetalleRecepcion {
  recepcionId: string;
  fecha: string;
  estado: "liquidada" | "rechazada";
  litros: number;
  precioPorLitro: number;
  bruto: number;
  aporteSocial: number;
  ahorroVoluntario: number;
  neto: number;
  parametrosVigentesDesde: string;
}

export interface Liquidacion {
  productorId: string;
  periodo: Periodo;
  estado: "calculada" | "aprobada";
  detalle: DetalleRecepcion[];
  diferidas: string[]; // recepciones sin resultado: pasan al periodo siguiente
  litros: number;
  bruto: number;
  aporteSocial: number;
  ahorroVoluntario: number;
  neto: number;
}

export class LiquidacionBloqueadaError extends Error {
  constructor() {
    super("Una liquidación aprobada no se puede modificar");
    this.name = "LiquidacionBloqueadaError";
  }
}

// Cuenta décimas completas con enteros: en binario 3,8 − 3,5 da 0,2999… y se perdería una décima.
// Math.trunc corta hacia cero en ambos sentidos: 3,58 y 3,42 dan 0 décimas. Sumar 0 convierte −0 en 0.
export function decimasCompletas(valor: number, referencia: number): number {
  const diferenciaEnMilesimas = Math.round(valor * 1000) - Math.round(referencia * 1000);
  return Math.trunc(diferenciaEnMilesimas / 100) + 0;
}

export function precioPorLitro(
  temperatura: number,
  resultado: ResultadoLaboratorio,
  p: ParametrosPago,
): number {
  if (resultado.antibioticosPositivo) return 0;

  let precio = p.precioBase;
  precio += decimasCompletas(resultado.grasa, p.grasaReferencia) * p.ajustePorDecimaGrasa;
  precio += decimasCompletas(resultado.proteina, p.proteinaReferencia) * p.ajustePorDecimaProteina;
  if (resultado.ufc <= p.ufcLimiteBonificacion) precio += p.bonificacionUfc;
  else if (resultado.ufc > p.ufcLimitePenalizacion) precio -= p.penalizacionUfc;
  if (temperatura > p.temperaturaMaxima) precio -= p.penalizacionTemperatura;
  return precio;
}

function validarEntradas(recepcion: Recepcion, ahorroPct: number, p: ParametrosPago): void {
  if (!(recepcion.litros > 0)) {
    throw new RangeError(`Recepción ${recepcion.id}: los litros deben ser mayores que 0`);
  }
  if (!(ahorroPct >= 0 && ahorroPct <= p.ahorroMaximoPct)) {
    throw new RangeError(`El ahorro voluntario debe estar entre 0 % y ${p.ahorroMaximoPct} %`);
  }
}

// Los valores se redondean al peso por recepción, de modo que el detalle siempre suma el total.
export function liquidarRecepcion(
  recepcion: Recepcion & { resultado: ResultadoLaboratorio },
  ahorroPct: number,
  p: ParametrosPago,
): DetalleRecepcion {
  validarEntradas(recepcion, ahorroPct, p);
  const precio = precioPorLitro(recepcion.temperatura, recepcion.resultado, p);
  const bruto = Math.round(recepcion.litros * precio);
  const aporteSocial = Math.round((bruto * p.aporteSocialPct) / 100);
  const ahorroVoluntario = Math.round((bruto * ahorroPct) / 100);
  return {
    recepcionId: recepcion.id,
    fecha: recepcion.fecha,
    estado: recepcion.resultado.antibioticosPositivo ? "rechazada" : "liquidada",
    litros: recepcion.litros,
    precioPorLitro: precio,
    bruto,
    aporteSocial,
    ahorroVoluntario,
    neto: bruto - aporteSocial - ahorroVoluntario,
    parametrosVigentesDesde: p.vigenteDesde,
  };
}

export interface EntradaLiquidacion {
  productorId: string;
  periodo: Periodo;
  ahorroAutorizadoPct: number | null; // null: el asociado no autorizó ahorro
  recepciones: Recepcion[]; // recepciones del productor aún no liquidadas
  versionesParametros: ParametrosPago[];
}

// Cada recepción usa los parámetros vigentes en la fecha en que se recibió la leche.
// Una recepción anterior al periodo que ya tiene resultado entra aquí: es la que venía diferida.
export function liquidarPeriodo(e: EntradaLiquidacion): Liquidacion {
  const delPeriodo = e.recepciones.filter((r) => r.fecha <= e.periodo.fin);
  const detalle: DetalleRecepcion[] = [];
  const diferidas: string[] = [];

  for (const r of delPeriodo) {
    if (r.resultado === null) {
      diferidas.push(r.id);
      continue;
    }
    const p = parametrosVigentes(e.versionesParametros, r.fecha);
    detalle.push(
      liquidarRecepcion({ ...r, resultado: r.resultado }, e.ahorroAutorizadoPct ?? 0, p),
    );
  }

  const sumar = (campo: "bruto" | "aporteSocial" | "ahorroVoluntario" | "neto") =>
    detalle.reduce((total, d) => total + d[campo], 0);

  return {
    productorId: e.productorId,
    periodo: e.periodo,
    estado: "calculada",
    detalle,
    diferidas,
    litros: detalle.filter((d) => d.estado === "liquidada").reduce((t, d) => t + d.litros, 0),
    bruto: sumar("bruto"),
    aporteSocial: sumar("aporteSocial"),
    ahorroVoluntario: sumar("ahorroVoluntario"),
    neto: sumar("neto"),
  };
}

// Aprobar congela la liquidación: guarda los valores ya calculados y no los parámetros,
// así que un cambio posterior de parámetros no la afecta.
export function aprobarLiquidacion(liquidacion: Liquidacion): Liquidacion {
  asegurarEditable(liquidacion);
  const aprobada: Liquidacion = {
    ...liquidacion,
    estado: "aprobada",
    periodo: Object.freeze({ ...liquidacion.periodo }),
    detalle: Object.freeze(liquidacion.detalle.map((d) => Object.freeze({ ...d }))) as DetalleRecepcion[],
    diferidas: Object.freeze([...liquidacion.diferidas]) as string[],
  };
  return Object.freeze(aprobada);
}

export function asegurarEditable(liquidacion: Liquidacion): void {
  if (liquidacion.estado === "aprobada") throw new LiquidacionBloqueadaError();
}
