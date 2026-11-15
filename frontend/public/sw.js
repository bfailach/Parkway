/*
 * Service worker de Parkway (aplicación instalable).
 *
 * - Las pantallas (index.html) se piden siempre a la red, para que la app
 *   instalada tenga la última versión. Sin conexión se muestra la última
 *   guardada y la app avisa que no hay internet.
 * - Los recursos con huella en el nombre (/assets/*.js, *.css) y los
 *   íconos se sirven desde la caché: nunca cambian.
 * - La API (/api) y el WebSocket nunca se guardan en caché: los cupos, los
 *   pagos y los datos de los usuarios siempre vienen del servidor.
 */
const VERSION = "parkway-v2";
const PRECARGA = ["/", "/manifest.webmanifest", "/favicon.svg", "/iconos/icono-192.png", "/iconos/icono-512.png"];

// Al instalarse guarda la página y los archivos que esta carga (con su
// huella en el nombre), para que la app abra aunque no haya conexión.
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const c = await caches.open(VERSION);
      await c.addAll(PRECARGA);
      const html = await (await c.match("/")).text();
      const recursos = [...new Set(html.match(/\/assets\/[^"']+/g) || [])];
      await c.addAll(recursos);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return; // siempre a la red

  // Navegación: red primero; sin conexión, la última versión guardada.
  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copia));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Recursos estáticos: caché primero, y se guardan la primera vez.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/iconos/") || /\.(svg|png|woff2?)$/.test(url.pathname)) {
    evento.respondWith(
      caches.match(req).then(
        (guardada) =>
          guardada ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copia));
            }
            return res;
          })
      )
    );
  }
});
