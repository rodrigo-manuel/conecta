import { describe, expect, it } from "vitest";
import {
  aprobarLiquidacion,
  asegurarEditable,
  decimasCompletas,
  LiquidacionBloqueadaError,
  liquidarPeriodo,
  liquidarRecepcion,
  precioPorLitro,
  Recepcion,
  ResultadoLaboratorio,
} from "../src/liquidacion/motor.js";
import {
  PARAMETROS_INICIALES as P,
  ParametrosPago,
  parametrosVigentes,
} from "../src/liquidacion/parametros.js";
import { periodoDe } from "../src/liquidacion/periodo.js";

// Resultado neutro: sin ajustes de grasa ni proteína, y UFC en la franja sin ajuste.
const neutro: ResultadoLaboratorio = {
  grasa: 3.5,
  proteina: 3.1,
  ufc: 200_000,
  antibioticosPositivo: false,
};
const precio = (cambios: Partial<ResultadoLaboratorio>, temperatura = 6) =>
  precioPorLitro(temperatura, { ...neutro, ...cambios }, P);

const recepcion = (
  id: string,
  fecha: string,
  resultado: ResultadoLaboratorio | null = neutro,
  litros = 100,
): Recepcion => ({ id, fecha, litros, temperatura: 6, resultado });

const liquidar = (recepciones: Recepcion[], ahorro: number | null = null, versiones = [P]) =>
  liquidarPeriodo({
    productorId: "p1",
    periodo: periodoDe("2026-10-05"),
    ahorroAutorizadoPct: ahorro,
    recepciones,
    versionesParametros: versiones,
  });

describe("ejemplo resuelto de la sección 3.7", () => {
  it("120 L, 3,7 % grasa, 3,0 % proteína, 80.000 UFC, 6 °C y 5 % de ahorro", () => {
    const d = liquidarRecepcion(
      {
        id: "r1",
        fecha: "2026-10-05",
        litros: 120,
        temperatura: 6,
        resultado: { grasa: 3.7, proteina: 3.0, ufc: 80_000, antibioticosPositivo: false },
      },
      5,
      P,
    );
    expect(d.precioPorLitro).toBe(1900);
    expect(d.bruto).toBe(228_000);
    expect(d.aporteSocial).toBe(4560);
    expect(d.ahorroVoluntario).toBe(11_400);
    expect(d.neto).toBe(212_040);
    expect(d.estado).toBe("liquidada");
  });
});

describe("décimas completas", () => {
  it.each([
    [3.58, 3.5, 0], // el caso: 3,58 % no tiene ajuste
    [3.42, 3.5, 0], // lo mismo por debajo
    [3.59, 3.5, 0],
    [3.6, 3.5, 1],
    [3.8, 3.5, 3], // en binario 3,8 − 3,5 da 0,2999…
    [3.4, 3.5, -1],
    [3.3, 3.5, -2],
    [3.0, 3.1, -1],
    [3.5, 3.5, 0],
  ])("%d frente a %d da %d", (valor, referencia, esperado) => {
    expect(decimasCompletas(valor, referencia)).toBe(esperado);
  });
});

describe("ajustes al precio por litro", () => {
  it("sin ajustes el precio es la base", () => expect(precio({})).toBe(1850));
  it("grasa: +15 y −15 por décima completa", () => {
    expect(precio({ grasa: 3.7 })).toBe(1880);
    expect(precio({ grasa: 3.3 })).toBe(1820);
    expect(precio({ grasa: 3.58 })).toBe(1850);
  });
  it("proteína: +20 y −20 por décima completa", () => {
    expect(precio({ proteina: 3.3 })).toBe(1890);
    expect(precio({ proteina: 3.0 })).toBe(1830);
    expect(precio({ proteina: 3.19 })).toBe(1850);
  });
  it.each([
    [100_000, 1890], // límite: ≤ 100.000 bonifica
    [100_001, 1850],
    [300_000, 1850], // límite: 300.000 aún no penaliza
    [300_001, 1790],
  ])("UFC %d da %d", (ufc, esperado) => expect(precio({ ufc })).toBe(esperado));
  it("temperatura: solo penaliza si supera 8 °C", () => {
    expect(precio({}, 8)).toBe(1850);
    expect(precio({}, 8.1)).toBe(1825);
  });
});

describe("antibióticos positivos", () => {
  it("rechaza la recepción y paga 0 aunque la calidad sea excelente", () => {
    const d = liquidarRecepcion(
      {
        ...recepcion("r1", "2026-10-05"),
        resultado: { grasa: 4.5, proteina: 3.9, ufc: 1000, antibioticosPositivo: true },
      },
      5,
      P,
    );
    expect(d.estado).toBe("rechazada");
    expect(d.precioPorLitro).toBe(0);
    expect(d.bruto).toBe(0);
    expect(d.aporteSocial).toBe(0);
    expect(d.ahorroVoluntario).toBe(0);
    expect(d.neto).toBe(0);
  });
  it("sus litros no cuentan en el total pagado", () => {
    const l = liquidar([
      recepcion("r1", "2026-10-05"),
      recepcion("r2", "2026-10-06", { ...neutro, antibioticosPositivo: true }),
    ]);
    expect(l.litros).toBe(100);
    expect(l.bruto).toBe(185_000);
    expect(l.detalle).toHaveLength(2);
  });
});

describe("descuentos", () => {
  it("sin autorización no se descuenta ahorro", () => {
    const l = liquidar([recepcion("r1", "2026-10-05")], null);
    expect(l.ahorroVoluntario).toBe(0);
    expect(l.aporteSocial).toBe(3700);
    expect(l.neto).toBe(181_300);
  });
  it("acepta los extremos 0 % y 10 %", () => {
    expect(liquidar([recepcion("r1", "2026-10-05")], 0).ahorroVoluntario).toBe(0);
    expect(liquidar([recepcion("r1", "2026-10-05")], 10).ahorroVoluntario).toBe(18_500);
  });
  it.each([10.1, -1, Number.NaN])("rechaza un ahorro de %d %%", (ahorro) => {
    expect(() => liquidar([recepcion("r1", "2026-10-05")], ahorro)).toThrow(RangeError);
  });
  it.each([0, -5, Number.NaN])("rechaza %d litros", (litros) => {
    expect(() => liquidar([recepcion("r1", "2026-10-05", neutro, litros)])).toThrow(RangeError);
  });
  it("redondea al peso y el neto cuadra", () => {
    const l = liquidar([recepcion("r1", "2026-10-05", { ...neutro, grasa: 3.6 }, 120.5)], 5);
    expect(l.bruto).toBe(224_733); // 120,5 × 1.865 = 224.732,5
    expect(l.aporteSocial).toBe(4495);
    expect(l.ahorroVoluntario).toBe(11_237);
    expect(l.neto).toBe(l.bruto - l.aporteSocial - l.ahorroVoluntario);
  });
});

describe("resultado pendiente", () => {
  it("no se liquida y pasa al periodo siguiente", () => {
    const l = liquidar([recepcion("r1", "2026-10-05"), recepcion("r2", "2026-10-14", null)]);
    expect(l.detalle.map((d) => d.recepcionId)).toEqual(["r1"]);
    expect(l.diferidas).toEqual(["r2"]);
    expect(l.bruto).toBe(185_000);
  });
  it("se liquida en el periodo siguiente cuando ya tiene resultado", () => {
    const l = liquidarPeriodo({
      productorId: "p1",
      periodo: periodoDe("2026-10-20"),
      ahorroAutorizadoPct: null,
      recepciones: [recepcion("r2", "2026-10-14")],
      versionesParametros: [P],
    });
    expect(l.detalle.map((d) => d.recepcionId)).toEqual(["r2"]);
    expect(l.diferidas).toEqual([]);
  });
  it("ignora recepciones posteriores al cierre del periodo", () => {
    const l = liquidar([recepcion("r3", "2026-10-16")]);
    expect(l.detalle).toEqual([]);
    expect(l.diferidas).toEqual([]);
    expect(l.neto).toBe(0);
  });
});

describe("liquidación aprobada", () => {
  it("queda bloqueada", () => {
    const aprobada = aprobarLiquidacion(liquidar([recepcion("r1", "2026-10-05")]));
    expect(aprobada.estado).toBe("aprobada");
    expect(() => asegurarEditable(aprobada)).toThrow(LiquidacionBloqueadaError);
    expect(() => aprobarLiquidacion(aprobada)).toThrow(LiquidacionBloqueadaError);
  });
  it("sus valores no se pueden alterar en memoria", () => {
    const aprobada = aprobarLiquidacion(liquidar([recepcion("r1", "2026-10-05")]));
    expect(() => {
      aprobada.neto = 1;
    }).toThrow(TypeError);
    expect(() => {
      aprobada.detalle[0].neto = 1;
    }).toThrow(TypeError);
  });
  it("no cambia aunque después cambien los parámetros", () => {
    const aprobada = aprobarLiquidacion(liquidar([recepcion("r1", "2026-10-05")]));
    const netoAntes = aprobada.neto;
    const nueva: ParametrosPago = { ...P, vigenteDesde: "2026-10-01", precioBase: 2500 };

    const recalculada = liquidar([recepcion("r1", "2026-10-05")], null, [P, nueva]);

    expect(recalculada.neto).not.toBe(netoAntes);
    expect(aprobada.neto).toBe(netoAntes);
  });
  it("una liquidación calculada sigue editable", () => {
    expect(() => asegurarEditable(liquidar([]))).not.toThrow();
  });
});

describe("parámetros versionados", () => {
  const nueva: ParametrosPago = { ...P, vigenteDesde: "2026-10-10", precioBase: 2000 };

  it("usa la versión vigente en la fecha, incluido el primer día", () => {
    expect(parametrosVigentes([P, nueva], "2026-10-09").precioBase).toBe(1850);
    expect(parametrosVigentes([P, nueva], "2026-10-10").precioBase).toBe(2000);
    expect(parametrosVigentes([nueva, P], "2026-12-01").precioBase).toBe(2000);
  });
  it("falla si la fecha es anterior a toda versión", () => {
    expect(() => parametrosVigentes([P], "2025-12-31")).toThrow(RangeError);
  });
  it("cada recepción de un mismo periodo usa su propia versión y la registra", () => {
    const l = liquidar(
      [recepcion("r1", "2026-10-09"), recepcion("r2", "2026-10-10")],
      null,
      [P, nueva],
    );
    expect(l.detalle.map((d) => d.precioPorLitro)).toEqual([1850, 2000]);
    expect(l.detalle[1].parametrosVigentesDesde).toBe("2026-10-10");
  });
});

describe("quincenas", () => {
  it.each([
    ["2026-10-01", "2026-10-01", "2026-10-15"],
    ["2026-10-15", "2026-10-01", "2026-10-15"],
    ["2026-10-16", "2026-10-16", "2026-10-31"],
    ["2026-11-30", "2026-11-16", "2026-11-30"],
    ["2026-02-20", "2026-02-16", "2026-02-28"],
    ["2028-02-20", "2028-02-16", "2028-02-29"], // año bisiesto
  ])("%s pertenece a %s – %s", (fecha, inicio, fin) => {
    expect(periodoDe(fecha)).toEqual({ inicio, fin });
  });
});
