/* ============================================================
   sw.js — Service worker de Nuestro Muro (PWA)
   Qué hace: guarda en el dispositivo una copia de la página para abrirla sin conexión y decide de dónde sale cada cosa:
   - Página, CSS, JS e iconos: primero se piden a internet (así, apenas se hace push a GitHub y Cloudflare publica, la app se
     actualiza sola) y solo si no hay conexión se usa la copia guardada.
   - /api/posts (el muro): también primero internet; sin conexión se muestra lo último que se vio.
   - Fotos (/api/imagen/… y, v2.8, /api/perfiles/imagen/… de los perfiles): primero la copia guardada (una imagen nunca cambia).
   - Fuentes de Google: se guardan y se refrescan en segundo plano.
   - Avisos del celular (v2.5): cuando el servidor manda un "toque" de push se piden los avisos nuevos y se muestran como notificación.
   - Todo lo demás de la API (login, votos, publicar…): siempre a internet, nunca se guarda.
   Para qué sirve: que sea una app instalable, rápida y que siempre muestre la última versión publicada.
   Cambiar VERSION fuerza a renovar las copias guardadas (no hace falta tocarlo en cada push: la red tiene prioridad).
   ============================================================ */
const VERSION = 'v3.2.0';   // v3.2: notificaciones apiladas en una sola (etiqueta muro-pila); v3.1: sonidos (/sounds) fuera de la copia guardada y aviso 'sonar' a la app abierta; v3.0: scripts nuevos (editor, editor de imágenes, calendario) en el cascarón e íconos de las notificaciones por tipo;   // v2.8: imágenes de los perfiles (/api/perfiles/imagen/…) también primero desde la copia guardada; v2.4: fotos de perfil en el cascarón guardado; v2.5: avisos del celular (push); v2.7: fotos en gris de la escena de inicio de sesión
const CACHE_ESTATICO = `muro-estatico-${VERSION}`;   // cascarón de la app
const CACHE_DATOS = 'muro-datos';                     // listado del muro y fotos
const CACHE_FUENTES = 'muro-fuentes';                 // Google Fonts
const ESTATICOS = ['/', '/index.html', '/css/style.css', '/js/script.js', '/js/editor.js', '/js/editor-imagen.js', '/js/calendario.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon-32.png', '/icons/apple-touch-icon.png', '/img/avatar-M.png', '/img/avatar-xB.png', '/img/avatar-M-gris.png', '/img/avatar-xB-gris.png'];

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
  if (url.pathname.startsWith('/api/imagen/') || url.pathname.startsWith('/api/perfiles/imagen/')) return void e.respondWith(cachePrimero(request, CACHE_DATOS));
  if (url.pathname.startsWith('/api/')) return;               // login, yo, votos…: siempre a la red
  if (url.pathname.startsWith('/sounds/')) return;            // v3.1: los sonidos (mp3) los maneja el navegador (piden rangos de bytes; no se pasan por la copia guardada)
  if (url.pathname === '/sw.js') return;                      // el propio service worker lo gestiona el navegador
  e.respondWith(redPrimero(request, CACHE_ESTATICO));         // página, CSS, JS, iconos
});

/* ============================================================
   NUEVO v2.5 — Avisos del celular (Web Push)
   Qué hace: el servidor manda un "toque" sin texto cuando la otra persona hace algo. Aquí se le pregunta a /api/notificaciones?push=1
   qué hay de nuevo (usa la sesión guardada en el navegador) y se muestra cada aviso como notificación del sistema. Si la app está
   abierta y a la vista no se muestra nada (ya sale el aviso dentro de la app). Tocar el aviso abre/enfoca la app en esa publicación.
   Para qué sirve: enterarse de lo que pasa aunque la app esté cerrada.
   ============================================================ */
/* v3.0: cada aviso lleva un ícono según su tipo (/icons/notif/): un corazón del color de quien lo dio (azul M / rojo xB), un globo de diálogo para un comentario, etc.
   Los avisos automáticos (calendario, novedades) usan la versión gris ("sistema"). "badge" es la silueta blanca chica de la barra de estado de Android. */
const TIPOS_ICONO = ['post', 'corazon', 'comentario', 'voto', 'tarea', 'dia', 'editar', 'borrar', 'categoria', 'fecha', 'novedad'];
const TAG_PILA = 'muro-pila';   // v3.2: etiqueta única: todos los avisos del celular se juntan en una sola notificación
const TITULOS = { fecha: 'Calendario de amor', novedad: 'Novedades de Nuestro Muro' };
function iconosDe(a) {
  if (!TIPOS_ICONO.includes(a.tipo)) return { icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png' };
  const quien = a.de === 'M' || a.de === 'xB' ? a.de : 'sistema';
  return { icon: `/icons/notif/${a.tipo}-${quien}.png`, badge: `/icons/notif/badge-${a.tipo}.png` };
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let avisos = [];
    try {
      const r = await fetch('/api/notificaciones?push=1', { cache: 'no-store', credentials: 'same-origin' });
      if (r.status === 401) return;                                   // no hay sesión en este navegador: nada que mostrar
      if (r.ok) avisos = (await r.json()).notificaciones || [];
    } catch (err) { /* sin conexión: se muestra el aviso genérico */ }
    if (!avisos.length) avisos = [{ id: 'novedades', texto: 'Hay novedades en el muro.', post: '' }];
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (ventanas.some((v) => v.visibilityState === 'visible')) return; // la app está a la vista: ya se ve dentro de ella
    ventanas.forEach((v) => v.postMessage({ tipo: 'sonar' }));        // v3.1: si la app está abierta pero oculta, que suene el tono de aviso de la app (el sonido del sistema no se puede cambiar desde una web)
    /* [v3.2] APILADO (como WhatsApp): todos los avisos del celular van en UNA sola notificación. Si ya hay una en la bandeja se le suman los nuevos:
       con 1 aviso se ve como siempre (ícono del tipo, texto del aviso); con varios dice "N notificaciones nuevas" y lista los últimos mensajes.
       "tag" igual = el sistema reemplaza la anterior en vez de agregar otra, y "renotify" hace que igual avise. Tocarla abre la app (si es un solo aviso, lleva a él). */
    const previas = await self.registration.getNotifications({ tag: TAG_PILA });
    const acumulados = [];
    previas.forEach((n) => { ((n.data && n.data.avisos) || []).forEach((x) => acumulados.push(x)); });
    avisos.forEach((a) => { if (!acumulados.some((x) => x.id === a.id)) acumulados.push({ id: a.id, texto: a.texto, tipo: a.tipo || '', de: a.de || '', post: a.post || '' }); });
    const lista = acumulados.slice(-8);                                  // la pila guarda como mucho los últimos 8
    previas.forEach((n) => n.close());
    const ult = lista[lista.length - 1];
    if (lista.length === 1) {
      await self.registration.showNotification(TITULOS[ult.tipo] || 'Nuestro Muro', { body: ult.texto, tag: TAG_PILA, renotify: true, ...iconosDe(ult), data: { post: ult.post, tipo: ult.tipo, avisos: lista } });
    } else {
      await self.registration.showNotification('Nuestro Muro', {
        body: `${lista.length} notificaciones nuevas\n` + lista.slice(-4).map((x) => '• ' + x.texto).join('\n'),   // varias líneas: al expandirla en Android se leen
        tag: TAG_PILA, renotify: true, icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', data: { post: '', tipo: '', avisos: lista },
      });
    }
  })());
});
/* Tocar el aviso: enfoca la app abierta (y le pasa la publicación) o la abre con ?post=ID */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const post = (e.notification.data && e.notification.data.post) || '';
  const tipo = (e.notification.data && e.notification.data.tipo) || '';   // v3.0: un aviso del calendario o de novedades abre esa pantalla
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (ventanas.length) {
      const v = ventanas[0];
      await v.focus();
      if (post) v.postMessage({ tipo: 'ir-post', id: post });
      else if (tipo === 'fecha' || tipo === 'novedad') v.postMessage({ tipo: 'ir-vista', vista: tipo === 'fecha' ? 'calendario' : 'novedades' });
      return;
    }
    await self.clients.openWindow(post ? `/?post=${encodeURIComponent(post)}` : tipo === 'fecha' ? '/?vista=calendario' : tipo === 'novedad' ? '/?vista=novedades' : '/');
  })());
});
