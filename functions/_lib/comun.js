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
export const TIPOS = ['nota', 'lista', 'encuesta', 'foto', 'link', 'video'];
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
  }
  return { datos };
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
