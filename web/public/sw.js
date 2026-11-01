// Service worker: guarda la aplicación para que abra sin internet.
// Los datos de la API nunca se cachean aquí; las recepciones viven en la cola de IndexedDB.
const CACHE = "conecta-v1";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const html = await (await fetch("/", { cache: "no-store" })).text();
      // Los archivos compilados llevan un hash en el nombre: se leen del index.html.
      const archivos = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll(["/", "/manifest.webmanifest", "/icono.svg", ...archivos]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // Navegación: primero la red, para recibir versiones nuevas; sin red, la copia guardada.
  if (evento.request.mode === "navigate") {
    evento.respondWith(fetch(evento.request).catch(() => caches.match("/")));
    return;
  }
  evento.respondWith(caches.match(evento.request).then((copia) => copia ?? fetch(evento.request)));
});
