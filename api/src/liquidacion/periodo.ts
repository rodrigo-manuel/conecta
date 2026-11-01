export interface Periodo {
  inicio: string; // AAAA-MM-DD
  fin: string;
}

// Quincenas del caso: días 1 a 15 y 16 a fin de mes. Se trabaja con texto y UTC
// para que la zona horaria del servidor no pueda mover una recepción de quincena.
export function periodoDe(fecha: string): Periodo {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const prefijo = fecha.slice(0, 7);
  if (dia <= 15) {
    return { inicio: `${prefijo}-01`, fin: `${prefijo}-15` };
  }
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { inicio: `${prefijo}-16`, fin: `${prefijo}-${ultimoDia}` };
}
