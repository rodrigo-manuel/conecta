// Simula la jornada de un centro sin red: 325 recepciones (1.300 productores ÷ 4 centros),
// con una recarga a mitad de camino. Comprueba que al volver la señal no se pierde ni se duplica nada.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";

const N = 325;
const contar = () => Number(execSync('docker compose exec -T db psql -U conecta -d conecta -tAc "select count(*) from recepcion"', { cwd: new URL("..", import.meta.url) }).toString().trim());
const pendientes = (p, n) => p.waitForFunction((x) => document.querySelector("h2")?.innerText === `Pendientes por sincronizar: ${x}`, n, { timeout: 60000 });

const antes = contar();
const navegador = await chromium.launch({ channel: "msedge", headless: true });
const contexto = await navegador.newContext({ viewport: { width: 390, height: 800 } });
const p = await contexto.newPage();
await p.goto("http://localhost:3000/");
await p.getByLabel("Usuario").fill("operador");
await p.getByLabel("Clave").fill("Conecta2026!");
await p.getByRole("button", { name: "Entrar" }).click();
await p.waitForFunction(() => document.querySelectorAll("option").length > 2);
await p.evaluate(() => navigator.serviceWorker.ready);
await p.waitForTimeout(800);

await contexto.setOffline(true);
for (let i = 1; i <= N; i++) {
  await p.getByLabel("Productor").selectOption({ index: 1 + (i % 8) });
  await p.getByLabel("Litros").fill(String(50 + (i % 100)));
  await p.getByLabel("Temperatura").fill("6.5");
  await p.getByRole("button", { name: "Registrar" }).click();
  await pendientes(p, i);
  if (i === 160) {
    await p.reload(); // el service worker abre la aplicación sin red y la cola sigue intacta
    await p.waitForFunction(() => document.querySelectorAll("option").length > 2);
    await pendientes(p, i);
  }
}
const cola = await p.evaluate(() => new Promise((ok) => {
  const r = indexedDB.open("conecta", 1);
  r.onsuccess = () => { const q = r.result.transaction("cola").objectStore("cola").getAll(); q.onsuccess = () => ok(q.result); };
}));

await contexto.setOffline(false);
await pendientes(p, 0);
assert.equal(contar() - antes, N, "Deben llegar todas las recepciones");

// Reenvío completo: simula que se perdió la respuesta del servidor.
const token = await p.evaluate(() => JSON.parse(localStorage.getItem("conecta.sesion")).token);
const recepciones = cola.map(({ productorEtiqueta, codigo, error, ...r }) => r);
const respuesta = await contexto.request.post("http://localhost:3000/api/recepciones/sincronizar", { headers: { Authorization: `Bearer ${token}` }, data: { recepciones } });
const { resultados } = await respuesta.json();
assert.equal(resultados.filter((r) => r.estado === "duplicada").length, N);
assert.equal(contar() - antes, N, "El reenvío no debe crear filas");

await navegador.close();
console.log(`Jornada correcta: ${N} recepciones sin red, ninguna perdida ni duplicada`);
