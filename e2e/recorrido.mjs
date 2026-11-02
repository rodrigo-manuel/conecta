// Recorre el ciclo de la leche con los 8 roles y falla ante cualquier error de la interfaz.
// Requiere la aplicación con datos recién cargados y Microsoft Edge instalado.
// Si se define la variable CAPTURAS, guarda ahí las imágenes del documento.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const CLAVE = "Conecta2026!"; // clave pública de los usuarios de prueba (ver README)
const CAPTURAS = process.env.CAPTURAS;
const navegador = await chromium.launch({ channel: "msedge", headless: true });
const errores = [];

async function entrar(usuario, ancho = 1180, alto = 760) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await contexto.newPage();
  p.on("pageerror", (e) => errores.push(`${usuario}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errores.push(`${usuario}: ${m.text()}`); });
  await p.goto("http://localhost:3000/");
  await p.getByLabel("Usuario").fill(usuario);
  await p.getByLabel("Clave").fill(CLAVE);
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByRole("button", { name: "Salir" }).waitFor();
  await p.waitForTimeout(800);
  return p;
}
const captura = async (p, nombre, fullPage = false) => { if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage }); };
const avisoDice = (p, patron) => p.waitForFunction((t) => new RegExp(t).test(document.querySelector(".aviso")?.innerText ?? ""), patron);

// Operadora: la recepción del ejemplo del caso
let p = await entrar("operador", 390, 800);
await p.waitForFunction(() => document.querySelectorAll("option").length > 2);
await p.getByLabel("Productor").selectOption({ label: "PR-0005 · Efraín Ariza (ficticio)" });
await p.getByLabel("Litros").fill("120");
await p.getByLabel("Temperatura").fill("6");
await p.getByRole("button", { name: "Registrar" }).click();
await p.locator(".comprobante").waitFor();
await p.waitForFunction(() => document.querySelector("h2").innerText.endsWith(": 0"));
await captura(p, "01_recepcion_comprobante", true);
const codigo = await p.locator(".codigo").innerText();

// Analista: resultado del ejemplo y un rechazo por antibióticos
p = await entrar("analista");
await p.locator("tr", { hasText: codigo }).getByRole("button", { name: "Registrar" }).click();
await p.getByLabel("Grasa").fill("3.7");
await p.getByLabel("Proteína").fill("3.0");
await p.getByLabel("UFC").fill("80000");
await captura(p, "02_laboratorio");
await p.getByRole("button", { name: "Guardar resultado" }).click();
await avisoDice(p, "guardado");
await p.waitForTimeout(500);
await p.locator("tbody tr").first().getByRole("button", { name: "Registrar" }).click();
await p.getByLabel("Grasa").fill("3.5");
await p.getByLabel("Proteína").fill("3.1");
await p.getByLabel("UFC").fill("90000");
await p.getByLabel("Antibióticos").check();
await p.getByRole("button", { name: "Guardar resultado" }).click();
await avisoDice(p, "RECHAZADA");
await p.waitForTimeout(500);
await captura(p, "03_rechazo_alerta");

// Coordinador: primero la quincena anterior, para que la actual quede solo con sus recepciones
p = await entrar("coordinador");
const fechaBogota = (dias) => new Date(Date.now() - dias * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
await p.getByLabel("Fecha dentro de la quincena").fill(fechaBogota(16));
await p.getByRole("button", { name: "Calcular" }).click();
await avisoDice(p, "liquidaciones calculadas");
await p.getByLabel("Fecha dentro de la quincena").fill(fechaBogota(0));
await p.waitForTimeout(500);
await p.getByRole("button", { name: "Calcular" }).click();
await p.waitForTimeout(1200);
await p.locator("tr", { hasText: "PR-0005" }).getByRole("button", { name: "Ver detalle" }).click();
await p.getByRole("button", { name: "Aprobar y bloquear" }).waitFor();
const fila = p.locator("tr", { hasText: codigo });
assert.match(await fila.innerText(), /212\.040/, "El ejemplo del caso debe dar neto 212.040");
await captura(p, "04_liquidacion_detalle");
await p.getByRole("button", { name: "Aprobar y bloquear" }).click();
await avisoDice(p, "aprobada y bloqueada");
const [descarga] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Exportar a SICOOP" }).click()]);
assert.match(descarga.suggestedFilename(), /^erp_/);
await p.waitForTimeout(300);
await captura(p, "05_liquidacion_aprobada");

// Jefe de planta: trazabilidad y creación de un lote
p = await entrar("jefeplanta");
await p.getByRole("button", { name: "Ver trazabilidad" }).first().click();
await p.getByText("Hacia atrás").waitFor();
await p.getByRole("button", { name: "¿En qué lotes está?" }).first().click();
await p.getByText("Hacia adelante").waitFor();
await captura(p, "06_trazabilidad");
const casillas = p.locator("form input[type=checkbox]");
await casillas.nth(0).check();
await casillas.nth(1).check();
await p.getByLabel("Código").fill(`LOTE-E2E-${Date.now() % 100000}`);
await p.getByRole("button", { name: /Crear con 2/ }).click();
await avisoDice(p, "creado");

// Productor: solo ve lo suyo y, ahora, su liquidación aprobada
p = await entrar("productor2", 390, 800);
await p.getByText("Mis recepciones").waitFor();
p = await entrar("productor", 390, 800);
await p.getByText("Mis recepciones").waitFor();
await p.waitForTimeout(500);
await captura(p, "07_portal_productor");

// Gerencia y revisor fiscal
p = await entrar("gerencia");
await p.getByText("Litros del día por centro").waitFor();
await captura(p, "08_tablero");
p = await entrar("revisor");
await p.getByRole("button", { name: "Auditoría" }).click();
await p.getByLabel("Tabla").selectOption("liquidacion");
await p.waitForTimeout(800);
await captura(p, "09_auditoria");
assert.match(await p.locator("tbody tr").first().innerText(), /coordinador/);

// Administrador: ve todos los módulos operativos
p = await entrar("admin");
assert.match(await p.locator("nav").innerText(), /Recepción[\s\S]*Auditoría/);

await navegador.close();
assert.deepEqual(errores, [], "No debe haber errores en la consola");
console.log("Recorrido correcto con los 8 roles");
