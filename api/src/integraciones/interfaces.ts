// Puertos hacia los sistemas externos. La lógica de liquidación no conoce a SICOOP, al fondo
// ni al proveedor de SMS: cambiar uno de ellos solo exige otra implementación de estas interfaces.

export interface Mensajeria {
  enviar(productorId: number, texto: string): Promise<void>;
}

export interface LineaLiquidacion {
  liquidacionId: number;
  productorCodigo: string;
  periodoInicio: string;
  periodoFin: string;
  litros: number;
  bruto: number;
  aporteSocial: number;
  ahorroVoluntario: number;
  neto: number;
}

export interface Exportador {
  nombreArchivo(periodoInicio: string): string;
  generar(lineas: LineaLiquidacion[]): string;
}
