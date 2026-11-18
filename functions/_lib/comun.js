/* ============================================================
   comun.js — Utilidades compartidas por todas las Functions
   Qué hace: respuestas JSON, sesión firmada por cookie (HMAC), comparación segura de contraseñas,
   preparación de la base D1 (crea las tablas y carga las publicaciones iniciales la primera vez),
   validación de contenido y vista previa de links.
   Para qué sirve: no repetir lo mismo en cada endpoint y mantener la seguridad en un solo lugar.
   ============================================================ */
import { IDENTIDADES, CLAVES, SECRETO_SESION, LIMITES } from './config.js';
import { SEMILLA } from './semilla.js';

/* ---------- Respuestas ---------- */
/* Respuesta JSON. Por defecto no se guarda en caché (los datos cambian); extra permite añadir cabeceras (ETag, Set-Cookie…) */
export const json = (datos, status = 200, extra = {}) =>
  new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

/* ---------- Sesión y contraseñas ---------- */
const enc = new TextEncoder();

/* HMAC-SHA256 en hexadecimal: sirve para firmar la sesión y para comparar contraseñas sin filtrar su largo */
async function hmac(secreto, mensaje) {
  const llave = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', llave, enc.encode(mensaje));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/* Comparación en tiempo constante (evita adivinar la contraseña por tiempos de respuesta) */
function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/* Contraseña vigente de una identidad: la variable secreta de Cloudflare manda sobre config.js */
const claveDe = (env, quien) => (quien === 'M' ? env.CLAVE_M : env.CLAVE_XB) || CLAVES[quien];
const secretoDe = (env) => env.MURO_SECRETO || SECRETO_SESION;

/* ¿La contraseña escrita es la de esa identidad? */
export async function claveCorrecta(env, quien, escrita) {
  if (!IDENTIDADES.includes(quien) || typeof escrita !== 'string') return false;
  return iguales(await hmac('comparar', escrita), await hmac('comparar', claveDe(env, quien)));
}
/* Valor de la cookie de sesión: "M.<firma>". Si cambia la contraseña o el secreto, la firma deja de valer */
export async function crearSesion(env, quien) {
  return `${quien}.${await hmac(secretoDe(env), `${quien}:${claveDe(env, quien)}`)}`;
}
/* Lee la cookie y devuelve "M" / "xB" si la firma es válida; si no, null */
export async function leerSesion(request, env) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)muro_sesion=([^;]+)/);
  if (!m) return null;
  const valor = decodeURIComponent(m[1]);
  const quien = valor.split('.')[0];
  if (!IDENTIDADES.includes(quien)) return null;
  return iguales(valor, await crearSesion(env, quien)) ? quien : null;
}
/* Cabecera Set-Cookie (HttpOnly: el JavaScript de la página no la puede leer; 1 año de duración; vacía = cerrar sesión) */
export const cookieSesion = (valor, segundos = 31536000) =>
  `muro_sesion=${encodeURIComponent(valor)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;

/* ---------- Base de datos D1 ---------- */
const TABLAS = [
  `CREATE TABLE IF NOT EXISTS posts (
     id TEXT PRIMARY KEY, autor TEXT NOT NULL, tipo TEXT NOT NULL,
     titulo TEXT, texto TEXT, url TEXT, datos TEXT, imagen TEXT,
     creado INTEGER NOT NULL, actualizado INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_creado ON posts(creado DESC)`,
  `CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT)`,
  /* NUEVO (v2.1): categorías compartidas por M y xB (como las listas de "guardar en…" de YouTube).
     Qué hace: guarda el nombre, el icono (nombre de Material Symbols) y quién la creó.
     Para qué sirve: clasificar publicaciones y filtrar el muro. Es CREATE IF NOT EXISTS: en una base ya desplegada solo agrega la tabla nueva. */
  `CREATE TABLE IF NOT EXISTS categorias (
     id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL, autor TEXT NOT NULL, creado INTEGER NOT NULL)`,
  /* NUEVO v2.5: notificaciones. Cada interacción de una persona genera un aviso para la otra.
     para = quién lo recibe, de = quién lo causó, tipo = clase de evento, post_id = publicación (si sigue existiendo),
     leida = ya lo vio en la campanita, empujada = ya se entregó (o se descartó) como aviso del celular, clave = para evitar repetidos. */
  `CREATE TABLE IF NOT EXISTS notificaciones (
     id TEXT PRIMARY KEY, para TEXT NOT NULL, de TEXT NOT NULL, tipo TEXT NOT NULL, post_id TEXT, texto TEXT NOT NULL,
     creado INTEGER NOT NULL, leida INTEGER NOT NULL DEFAULT 0, empujada INTEGER NOT NULL DEFAULT 0, clave TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_para ON notificaciones(para, creado DESC)`,
  /* NUEVO v2.5: dispositivos que activaron los avisos del celular (Web Push). endpoint = dirección que da el navegador; quien = identidad con sesión en ese dispositivo */
  `CREATE TABLE IF NOT EXISTS suscripciones (endpoint TEXT PRIMARY KEY, quien TEXT NOT NULL, creado INTEGER NOT NULL)`,
];
let preparada = null;   // promesa: la preparación corre una sola vez por instancia del servidor

async function preparar(env) {
  await env.DB.batch(TABLAS.map((s) => env.DB.prepare(s)));
  /* Carga inicial: el INSERT de la marca "semilla" solo cambia 1 fila la primera vez en la vida de la base, así que
     aunque dos instancias arranquen a la vez, las publicaciones iniciales se cargan una sola vez. */
  const r = await env.DB.prepare(`INSERT INTO meta (clave, valor) VALUES ('semilla', '1') ON CONFLICT(clave) DO NOTHING`).run();
  if (r.meta && r.meta.changes === 1) {
    const ahora = Date.now();
    await env.DB.batch(SEMILLA.map((p, i) =>
      env.DB.prepare(`INSERT INTO posts (id, autor, tipo, titulo, texto, url, datos, imagen, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
        .bind(crypto.randomUUID(), p.autor, p.tipo, p.titulo || null, p.texto || null, p.url || null, JSON.stringify(p.datos || {}), ahora - i * 1000, ahora - i * 1000)));
  }
}
/* Devuelve la base lista para usar (crea tablas y carga la semilla si hace falta) */
export async function bd(env) {
  if (!env.DB) throw new Error('Falta el binding de D1 llamado DB (Cloudflare Pages > Settings > Bindings).');
  if (!preparada) preparada = preparar(env).catch((e) => { preparada = null; throw e; });
  await preparada;
  return env.DB;
}

/* Columnas que se piden siempre (la foto NO se trae: se sirve aparte por /api/imagen/ID) */
export const COLUMNAS = `id, autor, tipo, titulo, texto, url, datos, (imagen IS NOT NULL) AS tiene_img, creado, actualizado`;
/* Fila de la base → objeto que recibe el navegador */
export function aPost(r) {
  let datos = {};
  try { datos = r.datos ? JSON.parse(r.datos) : {}; } catch (e) { /* datos dañados: se ignoran */ }
  return { id: r.id, autor: r.autor, tipo: r.tipo, titulo: r.titulo || '', texto: r.texto || '', url: r.url || '', datos, imagen: !!r.tiene_img, creado: r.creado, actualizado: r.actualizado };
}

/* ---------- Validación ---------- */
/* v2.3: se quita "video" (nunca se subió ninguno) y se agrega "plan" */
export const TIPOS = ['nota', 'lista', 'encuesta', 'foto', 'link', 'plan'];
/* Texto recortado y con el largo máximo permitido */
export const limpiar = (t, max) => (typeof t === 'string' ? t.trim().slice(0, max) : '');
/* Solo se aceptan direcciones http(s); devuelve la URL normalizada o null */
export function urlValida(u) {
  try { const x = new URL(String(u).trim()); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch (e) { return null; }
}
const entero = (n) => (Number.isInteger(n) && n > 0 && n <= 20000 ? n : null);

/* Arma el campo "datos" (JSON) de una publicación según su tipo. Devuelve { datos } o { error }.
   previo = datos que ya tenía (al editar), para conservar corazones, votos y vista previa. */
export function construirDatos(tipo, entrada, previo = {}) {
  const e = entrada || {};
  const datos = { corazones: Array.isArray(previo.corazones) ? previo.corazones : [] };
  if (tipo === 'lista') {
    if (!Array.isArray(e.items) || !e.items.length) return { error: 'La lista necesita al menos un elemento.' };
    datos.items = e.items.slice(0, LIMITES.maxItems)
      .map((i) => ({ t: limpiar(i && i.t, LIMITES.item), hecho: !!(i && i.hecho) })).filter((i) => i.t);
    if (!datos.items.length) return { error: 'La lista necesita al menos un elemento.' };
  } else if (tipo === 'encuesta') {
    if (previo.opciones) datos.opciones = previo.opciones;   // las opciones y votos no se editan
    else {
      const ops = (Array.isArray(e.opciones) ? e.opciones : []).map((o) => limpiar(typeof o === 'string' ? o : o && o.t, LIMITES.item)).filter(Boolean).slice(0, LIMITES.maxOpciones);
      if (ops.length < 2) return { error: 'La encuesta necesita al menos 2 opciones.' };
      datos.opciones = ops.map((t) => ({ t, votos: [] }));
    }
  } else if (tipo === 'foto') {
    datos.w = entero(e.w) || previo.w || null; datos.h = entero(e.h) || previo.h || null;
  } else if (tipo === 'link') {
    if (previo.vista) datos.vista = previo.vista;
  } else if (tipo === 'plan') {
    /* NUEVO v2.3: plan. Entrada: { dias: ['2026-11-21', …], hora: 'HH:MM' | '', lugar: '' } (hora y lugar son opcionales) */
    const fechas = [...new Set((Array.isArray(e.dias) ? e.dias : []).map((x) => (typeof x === 'string' ? x : x && x.f)).filter(fechaValida))].sort();
    if (!fechas.length) return { error: 'Elige al menos un día para el plan.' };
    if (fechas.length > LIM_PLAN.dias) return { error: `Un plan puede tener hasta ${LIM_PLAN.dias} días.` };
    const hora = typeof e.hora === 'string' ? e.hora.trim() : '';
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { error: 'La hora no es válida.' };
    Object.assign(datos, fusionarDias(previo, fechas));   // conserva el estado de los días que ya existían
    datos.hora = hora;
    datos.lugar = limpiar(e.lugar, LIM_PLAN.lugar);
  }
  return { datos };
}

/* ---------- Planes (NUEVO v2.3) ---------- */
/* Estados de un día, en el orden en que se recorren al tocarlos: posible → ideal → descartado → seguro */
export const ESTADOS_DIA = ['posible', 'ideal', 'descartado', 'seguro'];
export const LIM_PLAN = { dias: 31, lugar: 120 };
/* Fecha "AAAA-MM-DD" que existe de verdad (rechaza 2026-02-31, etc.) */
export function fechaValida(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f) || f < '2000-01-01' || f > '2100-12-31') return false;
  const d = new Date(f + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === f;
}
/* Devuelve los días al estado que tenían antes de confirmar un día seguro (guardado en "antes") */
function restaurarDias(d) {
  d.dias.forEach((x) => { if (x.e === 'descartado' && d.antes && d.antes[x.f]) x.e = d.antes[x.f] === 'seguro' ? 'posible' : d.antes[x.f]; });
  d.antes = {};
}
/* Une la lista de fechas nueva con los días anteriores: las fechas que ya estaban conservan su estado, las nuevas entran como
   "posible" (o "descartado" si el plan ya está confirmado) y si se quita el día seguro el plan vuelve a estar sin confirmar.
   Devuelve { dias: [{f, e}], antes: {f: e} } */
export function fusionarDias(previo, fechas) {
  const viejos = new Map((Array.isArray(previo.dias) ? previo.dias : []).map((x) => [x.f, x.e]));
  const confirmado = [...viejos.values()].includes('seguro');
  const r = { dias: fechas.map((f) => ({ f, e: viejos.has(f) ? viejos.get(f) : confirmado ? 'descartado' : 'posible' })), antes: { ...(previo.antes || {}) } };
  Object.keys(r.antes).forEach((f) => { if (!fechas.includes(f)) delete r.antes[f]; });
  if (confirmado) {
    fechas.forEach((f) => { if (!viejos.has(f)) r.antes[f] = 'posible'; });
    if (!r.dias.some((x) => x.e === 'seguro')) restaurarDias(r);   // el día seguro se quitó del plan
  }
  return r;
}
/* Cambia el estado de UN día respetando la regla "solo un día seguro":
   - marcar un día como seguro descarta todos los demás (se recuerda cómo estaban para poder deshacerlo);
   - quitarle "seguro" a ese día devuelve los demás a como estaban.
   Devuelve un texto de error o null si todo salió bien. */
export function ponerEstadoDia(d, fecha, estado) {
  if (!ESTADOS_DIA.includes(estado)) return 'Estado de día no válido.';
  const dia = (d.dias || []).find((x) => x.f === fecha);
  if (!dia) return 'Ese día no está en el plan.';
  const hayS = d.dias.some((x) => x.e === 'seguro');
  if (estado === 'seguro') {
    if (!hayS) d.antes = Object.fromEntries(d.dias.map((x) => [x.f, x.e]));   // foto del estado previo, solo la primera vez
    d.dias.forEach((x) => { x.e = x.f === fecha ? 'seguro' : 'descartado'; });
  } else if (dia.e === 'seguro') {
    restaurarDias(d); dia.e = estado;                                          // se desconfirma el plan
  } else if (hayS) {
    return 'El plan ya está confirmado: primero quita el día seguro.';          // los demás días quedan descartados mientras tanto
  } else {
    dia.e = estado;
  }
  return null;
}

/* ---------- Categorías (NUEVO v2.1) ---------- */
/* Límites de las categorías (aquí y no en config.js para no pisar las contraseñas que ya pusiste allí) */
export const LIM_CAT = { total: 60, nombre: 30, porPost: 12 };
/* Un icono de Material Symbols es solo minúsculas, números y guion bajo (ej.: "favorite", "ad_units"); así no se cuela texto raro */
export const ICONO_RE = /^[a-z][a-z0-9_]{0,59}$/;
/* Recibe la lista de ids que mandó el navegador y devuelve solo los que existen de verdad (sin repetidos, máx. LIM_CAT.porPost).
   Para qué sirve: una publicación nunca guarda categorías borradas ni inventadas. */
export async function idsCategoriasValidos(db, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const pedidos = [...new Set(ids.filter((x) => typeof x === 'string' && x.length <= 64))].slice(0, LIM_CAT.porPost);
  if (!pedidos.length) return [];
  const { results } = await db.prepare(`SELECT id FROM categorias WHERE id IN (${pedidos.map(() => '?').join(',')})`).bind(...pedidos).all();
  const existen = new Set(results.map((r) => r.id));
  return pedidos.filter((x) => existen.has(x));
}

/* ---------- Vista previa de links ---------- */
const entidades = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/* Lee las etiquetas og:* (título, descripción, imagen, sitio) del HTML de una página */
function extraerVista(html, base) {
  const meta = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const clave = (m[0].match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const valor = (m[0].match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (clave && valor !== undefined && !(clave.toLowerCase() in meta)) meta[clave.toLowerCase()] = entidades(valor);
  }
  const titulo = meta['og:title'] || meta['twitter:title'] || entidades(((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').trim());
  let imagen = meta['og:image'] || meta['twitter:image'] || '';
  try { imagen = imagen ? urlValida(new URL(imagen, base).href) || '' : ''; } catch (e) { imagen = ''; }
  return { titulo: titulo.slice(0, 160), descripcion: (meta['og:description'] || meta['description'] || '').slice(0, 300), imagen: imagen.slice(0, 500), sitio: (meta['og:site_name'] || '').slice(0, 80) };
}
/* Descarga (máx. 4 s y 150 KB) la cabecera de la página y devuelve su vista previa; si algo falla devuelve {} (el link se guarda igual) */
export async function vistaPrevia(url) {
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NuestroMuro/2.0)', Accept: 'text/html' } });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('text/html')) return {};
    const lector = r.body.getReader(), dec = new TextDecoder();
    let html = '', n = 0;
    while (n < 150000) {
      const { done, value } = await lector.read();
      if (done) break;
      n += value.length; html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    lector.cancel().catch(() => {});
    return extraerVista(html, url);
  } catch (e) { return {}; } finally { clearTimeout(corte); }
}
