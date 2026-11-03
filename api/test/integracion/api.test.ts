import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { pool } from "../../src/db.js";

const CLAVE = "Conecta2026!";
const tokens: Record<string, string> = {};

async function entrar(usuario: string): Promise<string> {
  const r = await request(app).post("/api/auth/login").send({ usuario, clave: CLAVE });
  expect(r.status).toBe(200);
  return r.body.token;
}
const como = (usuario: string) => ({ Authorization: `Bearer ${tokens[usuario]}` });

async function idDeProductor(codigo: string): Promise<number> {
  const { rows } = await pool.query("SELECT id FROM productor WHERE codigo = $1", [codigo]);
  return rows[0].id;
}

const nuevaRecepcion = (cambios: object = {}) => ({
  id: randomUUID(),
  productorId: 1,
  centroId: 1,
  fechaHora: "2026-09-05T07:00:00-05:00",
  litros: 120,
  temperatura: 6,
  ...cambios,
});

beforeAll(async () => {
  for (const u of ["operador", "analista", "jefeplanta", "coordinador", "productor", "productor2", "gerencia", "revisor", "admin"]) {
    tokens[u] = await entrar(u);
  }
});
afterAll(() => pool.end());

describe("autenticación y roles (MVP-01)", () => {
  it("rechaza una clave incorrecta con el mismo mensaje que un usuario inexistente", async () => {
    const a = await request(app).post("/api/auth/login").send({ usuario: "admin", clave: "mala" });
    const b = await request(app).post("/api/auth/login").send({ usuario: "noexiste", clave: "mala" });
    expect(a.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });
  it("guarda las claves con bcrypt", async () => {
    const { rows } = await pool.query("SELECT DISTINCT left(hash_clave, 4) AS prefijo FROM usuario");
    expect(rows).toEqual([{ prefijo: "$2b$" }]);
  });
  it("exige sesión y rechaza un token alterado", async () => {
    expect((await request(app).get("/api/recepciones")).status).toBe(401);
    const r = await request(app).get("/api/recepciones").set({ Authorization: `Bearer ${tokens.admin}x` });
    expect(r.status).toBe(401);
  });
  it.each([
    ["productor", "post", "/api/recepciones"],
    ["analista", "post", "/api/recepciones"],
    ["operador", "put", `/api/recepciones/${randomUUID()}/resultado`],
    ["operador", "post", "/api/liquidaciones/calcular"],
    ["operador", "get", "/api/auditoria"],
    ["operador", "get", "/api/tablero"],
    ["gerencia", "post", "/api/lotes"],
    ["productor", "get", "/api/lotes"],
    ["revisor", "post", "/api/parametros"],
  ] as const)("%s no puede hacer %s %s", async (usuario, metodo, ruta) => {
    const r = await request(app)[metodo](ruta).set(como(usuario)).send({});
    expect(r.status).toBe(403);
  });
});

describe("un productor no puede ver datos de otro (MVP-08, D5)", () => {
  let idAjena: string;
  let liquidacionAjena: number;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `SELECT r.id FROM recepcion r JOIN productor p ON p.id = r.productor_id
       WHERE p.codigo = 'PR-0002' LIMIT 1`,
    );
    idAjena = rows[0].id;
    await request(app)
      .post("/api/liquidaciones/calcular")
      .set(como("coordinador"))
      .send({ fecha: new Date().toISOString().slice(0, 10) });
    const l = await pool.query(
      `SELECT l.id FROM liquidacion l JOIN productor p ON p.id = l.productor_id
       WHERE p.codigo = 'PR-0002' LIMIT 1`,
    );
    liquidacionAjena = l.rows[0].id;
    await request(app).post(`/api/liquidaciones/${liquidacionAjena}/aprobar`).set(como("coordinador"));
  });

  it("el portal solo devuelve sus recepciones", async () => {
    const r = await request(app).get("/api/portal/recepciones").set(como("productor"));
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    const { rows } = await pool.query(
      `SELECT r.id FROM recepcion r JOIN productor p ON p.id = r.productor_id WHERE p.codigo = 'PR-0001'`,
    );
    const propias = new Set(rows.map((x) => x.id));
    expect(r.body.every((x: { id: string }) => propias.has(x.id))).toBe(true);
  });
  it("no abre una recepción ajena por id", async () => {
    const r = await request(app).get(`/api/recepciones/${idAjena}`).set(como("productor"));
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: "No puede ver datos de otro productor" });
  });
  it("sí la abre su dueño", async () => {
    const r = await request(app).get(`/api/recepciones/${idAjena}`).set(como("productor2"));
    expect(r.status).toBe(200);
  });
  it("no abre una liquidación ajena por id", async () => {
    const r = await request(app).get(`/api/liquidaciones/${liquidacionAjena}`).set(como("productor"));
    expect(r.status).toBe(403);
  });
  it("sí la abre su dueño cuando está aprobada", async () => {
    const r = await request(app).get(`/api/liquidaciones/${liquidacionAjena}`).set(como("productor2"));
    expect(r.status).toBe(200);
    expect(r.body.detalle.length).toBeGreaterThan(0);
  });
  it("no puede listar productores, recepciones ni liquidaciones generales", async () => {
    for (const ruta of ["/api/productores", "/api/recepciones", "/api/liquidaciones?fecha=2026-10-01"]) {
      expect((await request(app).get(ruta).set(como("productor"))).status).toBe(403);
    }
  });
  it("ignora un parámetro con el id de otro productor en el portal", async () => {
    const otro = await idDeProductor("PR-0002");
    const r = await request(app).get(`/api/portal/liquidaciones?productorId=${otro}`).set(como("productor"));
    expect(r.status).toBe(200);
    expect(r.body.map((l: { id: number }) => l.id)).not.toContain(liquidacionAjena);
  });
  it("no consulta la autorización de datos de otro", async () => {
    const otro = await idDeProductor("PR-0002");
    expect((await request(app).get(`/api/productores/${otro}/autorizacion-datos`).set(como("productor"))).status).toBe(403);
  });
});

describe("recepción y sincronización (MVP-02, MVP-03)", () => {
  it("registra, genera código y no duplica al reenviar", async () => {
    const r = nuevaRecepcion();
    const a = await request(app).post("/api/recepciones").set(como("operador")).send(r);
    const b = await request(app).post("/api/recepciones").set(como("operador")).send(r);
    expect(a.status).toBe(201);
    expect(a.body.codigo).toMatch(/^REC-[0-9A-F]{12}$/);
    expect(b.status).toBe(200);
    expect(b.body.estado).toBe("duplicada");
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM recepcion WHERE id = $1", [r.id]);
    expect(rows[0].n).toBe(1);
  });
  it("sincroniza un lote: no pierde, no duplica y aísla el error", async () => {
    const ya = nuevaRecepcion();
    await request(app).post("/api/recepciones").set(como("operador")).send(ya);
    const nueva = nuevaRecepcion();
    const mala = nuevaRecepcion({ litros: -3 });
    const r = await request(app)
      .post("/api/recepciones/sincronizar")
      .set(como("operador"))
      .send({ recepciones: [ya, nueva, mala, nueva] });
    expect(r.status).toBe(200);
    expect(r.body.resultados.map((x: { estado: string }) => x.estado)).toEqual(["duplicada", "creada", "error", "duplicada"]);
  });
  it("un operador no registra en otro centro", async () => {
    const r = await request(app).post("/api/recepciones").set(como("operador")).send(nuevaRecepcion({ centroId: 2 }));
    expect(r.status).toBe(403);
  });
  describe("un operador solo actúa sobre su centro", () => {
    const deCentro = async (centro: number) => {
      const { rows } = await pool.query("SELECT id FROM recepcion WHERE centro_id = $1 LIMIT 1", [centro]);
      return rows[0].id as string;
    };
    it("no corrige una recepción de otro centro, y el dato no cambia", async () => {
      const id = await deCentro(2);
      const antes = await pool.query("SELECT litros FROM recepcion WHERE id = $1", [id]);
      const r = await request(app).patch(`/api/recepciones/${id}`).set(como("operador")).send({ litros: 1, temperatura: 1 });
      expect(r.status).toBe(403);
      const despues = await pool.query("SELECT litros FROM recepcion WHERE id = $1", [id]);
      expect(despues.rows[0].litros).toBe(antes.rows[0].litros);
    });
    it("sí corrige una de su centro", async () => {
      const id = await deCentro(1);
      const { rows } = await pool.query("SELECT litros, temperatura FROM recepcion WHERE id = $1", [id]);
      await request(app).patch(`/api/recepciones/${id}`).set(como("operador")).send(rows[0]).expect(200);
    });
    it("no abre una recepción de otro centro", async () => {
      const r = await request(app).get(`/api/recepciones/${await deCentro(2)}`).set(como("operador"));
      expect(r.status).toBe(403);
    });
    it("el listado solo trae su centro", async () => {
      const r = await request(app).get("/api/recepciones?limite=500").set(como("operador"));
      expect(r.body.length).toBeGreaterThan(0);
      expect(r.body.every((x: { centroId: number }) => x.centroId === 1)).toBe(true);
    });
    it("un rol sin centro asignado sí puede corregir en cualquier centro", async () => {
      const id = await deCentro(2);
      const { rows } = await pool.query("SELECT litros, temperatura FROM recepcion WHERE id = $1", [id]);
      await request(app).patch(`/api/recepciones/${id}`).set(como("jefeplanta")).send(rows[0]).expect(200);
    });
  });
  it("valida las entradas y un intento de inyección no afecta la base de datos", async () => {
    const r = await request(app)
      .post("/api/recepciones")
      .set(como("operador"))
      .send(nuevaRecepcion({ id: "'; DROP TABLE recepcion; --" }));
    expect(r.status).toBe(400);
    const b = await request(app).post("/api/auth/login").send({ usuario: "' OR '1'='1", clave: "x" });
    expect(b.status).toBe(401);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM recepcion");
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("laboratorio, liquidación y bloqueo (MVP-04 a MVP-06)", () => {
  // Productor sin recepciones viejas pendientes de liquidar: se usa un periodo futuro aislado.
  const fechaHora = "2027-03-05T07:00:00-05:00";
  const fecha = "2027-03-05";
  let productor: number;
  let conResultado: string;
  let sinResultado: string;
  let positiva: string;
  let liquidacionId: number;

  beforeAll(async () => {
    productor = await idDeProductor("PR-0005"); // centro 1, ahorro autorizado de 5 %
    await request(app).post("/api/liquidaciones/calcular").set(como("coordinador")).send({ fecha: "2027-02-20" });
    const crear = async () => {
      const r = nuevaRecepcion({ productorId: productor, fechaHora });
      await request(app).post("/api/recepciones").set(como("operador")).send(r);
      return r.id;
    };
    conResultado = await crear();
    sinResultado = await crear();
    positiva = await crear();
  });

  it("registra el resultado y un antibiótico positivo rechaza y alerta", async () => {
    await request(app)
      .put(`/api/recepciones/${conResultado}/resultado`)
      .set(como("analista"))
      .send({ grasa: 3.7, proteina: 3.0, ufc: 80000, antibioticosPositivo: false })
      .expect(200);
    const r = await request(app)
      .put(`/api/recepciones/${positiva}/resultado`)
      .set(como("analista"))
      .send({ grasa: 3.7, proteina: 3.0, ufc: 80000, antibioticosPositivo: true });
    expect(r.body.estado).toBe("rechazada");
    const { rows } = await pool.query("SELECT 1 FROM alerta WHERE recepcion_id = $1", [positiva]);
    expect(rows).toHaveLength(1);
    const sms = await pool.query("SELECT texto FROM mensaje_saliente WHERE texto LIKE '%rechazada%'");
    expect(sms.rows.length).toBeGreaterThan(0);
  });
  it("calcula como el ejemplo del caso, difiere lo pendiente y paga 0 al rechazo", async () => {
    const r = await request(app).post("/api/liquidaciones/calcular").set(como("coordinador")).send({ fecha });
    expect(r.status).toBe(200);
    const lista = await request(app).get(`/api/liquidaciones?fecha=${fecha}`).set(como("coordinador"));
    const propia = lista.body.find((l: { productorId: number }) => l.productorId === productor);
    liquidacionId = propia.id;
    const d = await request(app).get(`/api/liquidaciones/${liquidacionId}`).set(como("coordinador"));
    const porId = (id: string) => d.body.detalle.find((x: { recepcionId: string }) => x.recepcionId === id);
    expect(porId(conResultado)).toMatchObject({ precioPorLitro: 1900, bruto: 228000, aporteSocial: 4560, ahorroVoluntario: 11400, neto: 212040 });
    expect(porId(positiva)).toMatchObject({ estado: "rechazada", neto: 0 });
    expect(porId(sinResultado)).toBeUndefined();
  });
  it("una liquidación aprobada queda bloqueada, también en la base de datos", async () => {
    await request(app).post(`/api/liquidaciones/${liquidacionId}/aprobar`).set(como("coordinador")).expect(200);
    await request(app).post(`/api/liquidaciones/${liquidacionId}/aprobar`).set(como("coordinador")).expect(409);
    await expect(pool.query("UPDATE liquidacion SET neto = 1 WHERE id = $1", [liquidacionId])).rejects.toThrow(/no se puede modificar/);
    await expect(pool.query("DELETE FROM liquidacion_detalle WHERE liquidacion_id = $1", [liquidacionId])).rejects.toThrow(/no se puede modificar/);
    const r = await request(app)
      .put(`/api/recepciones/${conResultado}/resultado`)
      .set(como("analista"))
      .send({ grasa: 4, proteina: 4, ufc: 1, antibioticosPositivo: false });
    expect(r.status).toBe(409);
  });
  it("no cambia aunque cambien los parámetros, y recalcular no la toca", async () => {
    const versiones = await request(app).get("/api/parametros").set(como("coordinador"));
    const nueva = { ...versiones.body[0], vigenteDesde: "2027-03-01", precioBase: 2500 };
    await request(app).post("/api/parametros").set(como("coordinador")).send(nueva).expect(201);
    await request(app).post("/api/parametros").set(como("coordinador")).send(nueva).expect(409);
    await request(app).post("/api/liquidaciones/calcular").set(como("coordinador")).send({ fecha }).expect(200);
    const d = await request(app).get(`/api/liquidaciones/${liquidacionId}`).set(como("coordinador"));
    expect(d.body.detalle.find((x: { recepcionId: string }) => x.recepcionId === conResultado).neto).toBe(212040);
  });
  it("la recepción pendiente se liquida en el periodo siguiente", async () => {
    await request(app)
      .put(`/api/recepciones/${sinResultado}/resultado`)
      .set(como("analista"))
      .send({ grasa: 3.5, proteina: 3.1, ufc: 200000, antibioticosPositivo: false })
      .expect(200);
    await request(app).post("/api/liquidaciones/calcular").set(como("coordinador")).send({ fecha: "2027-03-20" }).expect(200);
    const lista = await request(app).get("/api/liquidaciones?fecha=2027-03-20").set(como("coordinador"));
    const siguiente = lista.body.find((l: { productorId: number }) => l.productorId === productor);
    expect(siguiente).toBeDefined();
    const d = await request(app).get(`/api/liquidaciones/${siguiente.id}`).set(como("coordinador"));
    expect(d.body.detalle.map((x: { recepcionId: string }) => x.recepcionId)).toContain(sinResultado);
  });
  it("exporta lo aprobado para el ERP y el ahorro para el fondo", async () => {
    const erp = await request(app).get(`/api/liquidaciones/exportar?fecha=${fecha}&destino=erp`).set(como("coordinador"));
    expect(erp.status).toBe(200);
    expect(erp.headers["content-type"]).toMatch(/text\/csv/);
    expect(erp.text).toContain("PR-0005");
    expect(erp.text).toContain("212040");
    const fondo = await request(app).get(`/api/liquidaciones/exportar?fecha=${fecha}&destino=fondo`).set(como("coordinador"));
    expect(fondo.text).toContain("11400");
    expect(fondo.text).not.toContain("212040");
  });
});

describe("lotes y trazabilidad (MVP-07)", () => {
  it("consulta hacia atrás y hacia adelante", async () => {
    const { rows } = await pool.query("SELECT id FROM recepcion WHERE estado = 'analizada' LIMIT 3");
    const ids = rows.map((r) => r.id);
    const creado = await request(app)
      .post("/api/lotes")
      .set(como("jefeplanta"))
      .send({ codigo: "LOTE-T-1", producto: "Queso costeño", fecha: "2026-10-20", recepciones: ids });
    expect(creado.status).toBe(201);
    const atras = await request(app).get(`/api/lotes/${creado.body.id}/trazabilidad`).set(como("jefeplanta"));
    expect(atras.body.recepciones).toHaveLength(3);
    expect(atras.body.recepciones[0]).toHaveProperty("productorCodigo");
    expect(atras.body.recepciones[0]).toHaveProperty("grasa");
    const adelante = await request(app).get(`/api/recepciones/${ids[0]}/lotes`).set(como("jefeplanta"));
    expect(adelante.body.map((l: { codigo: string }) => l.codigo)).toContain("LOTE-T-1");
  });
  it("no admite leche rechazada o sin resultado", async () => {
    const { rows } = await pool.query("SELECT id FROM recepcion WHERE estado = 'rechazada' LIMIT 1");
    const r = await request(app)
      .post("/api/lotes")
      .set(como("jefeplanta"))
      .send({ codigo: "LOTE-T-2", producto: "Yogur", fecha: "2026-10-20", recepciones: [rows[0].id] });
    expect(r.status).toBe(422);
  });
});

describe("tablero y auditoría (MVP-09, MVP-10)", () => {
  it("el tablero entrega los cuatro indicadores", async () => {
    const r = await request(app).get("/api/tablero").set(como("gerencia"));
    expect(r.status).toBe(200);
    expect(r.body.litrosPorCentro).toHaveLength(4);
    expect(r.body).toHaveProperty("porcentajeRechazos");
    expect(r.body).toHaveProperty("recepcionesSinResultado");
    expect(r.body.valorEstimadoAPagar).toBeGreaterThan(0);
  });
  it("registra quién, cuándo y qué cambió, y el revisor lo consulta", async () => {
    const rec = nuevaRecepcion();
    await request(app).post("/api/recepciones").set(como("operador")).send(rec);
    await request(app).patch(`/api/recepciones/${rec.id}`).set(como("operador")).send({ litros: 130, temperatura: 7 }).expect(200);
    const r = await request(app).get(`/api/auditoria?tabla=recepcion&registroId=${rec.id}`).set(como("revisor"));
    const cambio = r.body.find((a: { operacion: string }) => a.operacion === "UPDATE");
    expect(cambio.usuario).toBe("operador");
    expect(cambio.en).toBeTruthy();
    expect(cambio.antes.litros).toBe(120);
    expect(cambio.despues.litros).toBe(130);
  });
  it("el rastro no se puede editar, borrar ni truncar", async () => {
    await expect(pool.query("UPDATE auditoria SET usuario_id = NULL")).rejects.toThrow(/no se puede modificar/);
    await expect(pool.query("DELETE FROM auditoria")).rejects.toThrow(/no se puede modificar/);
    await expect(pool.query("TRUNCATE auditoria")).rejects.toThrow(/no se puede modificar/);
  });
  it("guarda la autorización de datos de cada productor", async () => {
    const id = await idDeProductor("PR-0001");
    const r = await request(app).get(`/api/productores/${id}/autorizacion-datos`).set(como("productor"));
    expect(r.body[0].versionPolitica).toBe("v1.0-2026");
    await request(app)
      .post(`/api/productores/${id}/autorizacion-datos`)
      .set(como("operador"))
      .send({ versionPolitica: "v1.1-2026", medio: "centro_acopio" })
      .expect(201);
  });
  it("el listado de productores no expone teléfonos", async () => {
    const r = await request(app).get("/api/productores").set(como("operador"));
    expect(r.body.length).toBeGreaterThanOrEqual(30);
    expect(r.body[0]).not.toHaveProperty("telefono");
  });
});

describe("datos de prueba (D4)", () => {
  it("tiene al menos 30 productores, 4 centros, 30 días y un usuario por rol", async () => {
    const { rows } = await pool.query(`
      SELECT (SELECT count(*) FROM productor)::int AS productores,
             (SELECT count(*) FROM centro_acopio)::int AS centros,
             (SELECT count(DISTINCT rol) FROM usuario)::int AS roles`);
    expect(rows[0].productores).toBeGreaterThanOrEqual(30);
    expect(rows[0].centros).toBe(4);
    expect(rows[0].roles).toBe(8);
    const { rows: dias } = await pool.query(
      "SELECT max(fecha) - min(fecha) + 1 AS dias FROM recepcion WHERE creado_en::date = current_date AND fecha > current_date - 40",
    );
    expect(dias[0].dias).toBeGreaterThanOrEqual(30);
  });
});
