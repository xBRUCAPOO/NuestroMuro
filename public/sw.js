/* ============================================================
   sw.js — Service worker de Nuestro Muro (PWA)
   Qué hace: guarda en el dispositivo una copia de la página para abrirla sin conexión y decide de dónde sale cada cosa:
   - Página, CSS, JS e iconos: primero se piden a internet (así, apenas se hace push a GitHub y Cloudflare publica, la app se
     actualiza sola) y solo si no hay conexión se usa la copia guardada.
   - /api/posts (el muro): también primero internet; sin conexión se muestra lo último que se vio.
   - Fotos (/api/imagen/…): primero la copia guardada (una foto nunca cambia).
   - Fuentes de Google: se guardan y se refrescan en segundo plano.
   - Todo lo demás de la API (login, votos, publicar…): siempre a internet, nunca se guarda.
   Para qué sirve: que sea una app instalable, rápida y que siempre muestre la última versión publicada.
   Cambiar VERSION fuerza a renovar las copias guardadas (no hace falta tocarlo en cada push: la red tiene prioridad).
   ============================================================ */
const VERSION = 'v2.0.0';
const CACHE_ESTATICO = `muro-estatico-${VERSION}`;   // cascarón de la app
const CACHE_DATOS = 'muro-datos';                     // listado del muro y fotos
const CACHE_FUENTES = 'muro-fuentes';                 // Google Fonts
const ESTATICOS = ['/', '/index.html', '/css/style.css', '/js/script.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon-32.png', '/icons/apple-touch-icon.png'];

/* Instalación: guarda el cascarón y se activa de inmediato */
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_ESTATICO).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});
/* Activación: borra las copias de versiones viejas y toma el control de las pestañas abiertas */
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((claves) => Promise.all(claves.filter((k) => k.startsWith('muro-estatico-') && k !== CACHE_ESTATICO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Red primero: intenta internet (máx. 5 s); si falla o tarda, usa la copia guardada. Guarda la respuesta buena para la próxima vez */
async function redPrimero(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(request, { signal: ctrl.signal, cache: 'no-cache' });
    clearTimeout(t);
    if (r.ok) cache.put(request, r.clone());
    return r;
  } catch (err) {
    const guardada = await cache.match(request, { ignoreSearch: false });
    if (guardada) return guardada;
    if (request.mode === 'navigate') { const inicio = await cache.match('/index.html'); if (inicio) return inicio; }
    throw err;
  }
}
/* Caché primero: si ya está guardado lo entrega; si no, lo pide y lo guarda */
async function cachePrimero(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  const r = await fetch(request);
  if (r.ok) cache.put(request, r.clone());
  return r;
}
/* Entrega lo guardado al instante y lo refresca en segundo plano (para las fuentes) */
async function guardadaYRefresca(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(request);
  const red = fetch(request).then((r) => { if (r.ok || r.type === 'opaque') cache.put(request, r.clone()); return r; }).catch(() => guardada);
  return guardada || red;
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;                       // solo se manejan lecturas
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {                  // fuentes de Google
    if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(guardadaYRefresca(request, CACHE_FUENTES));
    return;
  }
  if (url.pathname === '/api/posts') return void e.respondWith(redPrimero(request, CACHE_DATOS));
  if (url.pathname.startsWith('/api/imagen/')) return void e.respondWith(cachePrimero(request, CACHE_DATOS));
  if (url.pathname.startsWith('/api/')) return;               // login, yo, votos…: siempre a la red
  if (url.pathname === '/sw.js') return;                      // el propio service worker lo gestiona el navegador
  e.respondWith(redPrimero(request, CACHE_ESTATICO));         // página, CSS, JS, iconos
});
