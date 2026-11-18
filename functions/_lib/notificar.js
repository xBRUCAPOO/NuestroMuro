/* ============================================================
   notificar.js — Notificaciones (v2.5)
   Qué hace:
   1) Arma el texto de cada aviso ("M comentó en tu nota…") y lo guarda en la tabla "notificaciones" para la OTRA persona.
   2) Si esa persona activó los avisos del celular, le manda un "toque" de Web Push a cada dispositivo suscripto.
   Para qué sirve: enterarse de lo que hace el otro aunque la app esté cerrada.
   Cómo funciona el push (sin configurar nada): el servidor crea solo sus claves VAPID la primera vez y las guarda en la tabla "meta".
   El toque no lleva texto (así no hace falta cifrar nada): al recibirlo, el service worker (sw.js) le pregunta a /api/notificaciones?push=1
   qué hay de nuevo y muestra el aviso.
   ============================================================ */
import { IDENTIDADES } from './config.js';

export const otraPersona = (q) => IDENTIDADES.find((x) => x !== q) || q;
export const LIM_NOTIF = { porPersona: 200, texto: 240 };

/* ---------- Textos ---------- */
const NOMBRE_TIPO = { nota: 'nota', lista: 'lista', encuesta: 'encuesta', foto: 'foto', link: 'link', plan: 'plan' };
const CON_ARTICULO = { nota: 'una nota', lista: 'una lista', encuesta: 'una encuesta', foto: 'una foto', link: 'un link', plan: 'un plan' };
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/* Recorta un texto a "max" caracteres (agrega … si se pasó) y le saca saltos de línea y marcas de formato */
export const recortar = (t, max = 60) => {
  const s = String(t || '').replace(/[*_~`#>]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};
/* "sáb 21 nov" a partir de "2026-11-21" */
export const etiquetaDia = (f) => { const d = new Date(f + 'T00:00:00Z'); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };
/* «título» de una publicación (si no tiene título: su texto, o el sitio del link) */
export function tituloDe(p) {
  const t = recortar(p.titulo) || recortar(p.texto, 40) || (p.tipo === 'link' ? recortar((p.datos && p.datos.vista && p.datos.vista.titulo) || (() => { try { return new URL(p.url).hostname; } catch (e) { return ''; } })(), 40) : '');
  return t ? `«${t}»` : '';
}
/* "tu nota «Hola»" / "su nota «Hola»" (tu = la publicación es de quien recibe el aviso) */
export function refPost(p, para) {
  return [p.autor === para ? 'tu' : 'su', NOMBRE_TIPO[p.tipo] || 'publicación', tituloDe(p)].filter(Boolean).join(' ');
}
export const articuloTipo = (tipo) => CON_ARTICULO[tipo] || 'una publicación';

/* ---------- Guardar el aviso ---------- */
/* ctx = { env, request, waitUntil }; ev = { de, tipo, post_id, texto, clave?, ventana? }
   Si se pasa "clave" y "ventana" (ms), no se repite el mismo aviso dentro de ese lapso (evita el spam al dar y quitar corazón).
   Nunca debe romper la acción principal: cualquier error se ignora. */
export async function notificar(ctx, db, ev) {
  try {
    const para = otraPersona(ev.de), ahora = Date.now();
    if (ev.clave && ev.ventana) {
      const rep = await db.prepare('SELECT id FROM notificaciones WHERE para = ? AND clave = ? AND creado > ?').bind(para, ev.clave, ahora - ev.ventana).first();
      if (rep) return;
    }
    await db.prepare('INSERT INTO notificaciones (id, para, de, tipo, post_id, texto, creado, leida, empujada, clave) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)')
      .bind(crypto.randomUUID(), para, ev.de, ev.tipo, ev.post_id || null, recortar(ev.texto, LIM_NOTIF.texto), ahora, ev.clave || null).run();
    /* Se guardan como máximo LIM_NOTIF.porPersona avisos por persona (los más viejos se borran) */
    await db.prepare('DELETE FROM notificaciones WHERE para = ? AND id NOT IN (SELECT id FROM notificaciones WHERE para = ? ORDER BY creado DESC LIMIT ?)')
      .bind(para, para, LIM_NOTIF.porPersona).run();
    const tarea = empujar(ctx, db, para);
    if (ctx.waitUntil) ctx.waitUntil(tarea); else await tarea;
  } catch (e) { /* un aviso fallido no debe afectar lo que la persona estaba haciendo */ }
}

/* ---------- Web Push (sin carga útil) ---------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uTexto = (t) => b64u(new TextEncoder().encode(t));
let llavesCache = null;
/* Claves VAPID del servidor: se crean solas la primera vez y se guardan en "meta". Devuelve { publica (base64url), privada (JWK) } */
export async function llavesVapid(db) {
  if (llavesCache) return llavesCache;
  let fila = await db.prepare(`SELECT valor FROM meta WHERE clave = 'vapid'`).first();
  if (!fila) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const nuevo = { publica: b64u(await crypto.subtle.exportKey('raw', par.publicKey)), privada: await crypto.subtle.exportKey('jwk', par.privateKey) };
    /* Si dos instancias la crean a la vez gana la primera (DO NOTHING) y todos releen la ganadora */
    await db.prepare(`INSERT INTO meta (clave, valor) VALUES ('vapid', ?) ON CONFLICT(clave) DO NOTHING`).bind(JSON.stringify(nuevo)).run();
    fila = await db.prepare(`SELECT valor FROM meta WHERE clave = 'vapid'`).first();
  }
  llavesCache = JSON.parse(fila.valor);
  return llavesCache;
}
/* Cabecera Authorization de VAPID (RFC 8292) para un servicio de push: token JWT firmado con ES256 */
async function cabeceraVapid(llaves, endpoint, origenSitio) {
  const cuerpo = `${b64uTexto(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64uTexto(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: origenSitio }))}`;
  const clave = await crypto.subtle.importKey('jwk', llaves.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, new TextEncoder().encode(cuerpo));
  return `vapid t=${cuerpo}.${b64u(firma)}, k=${llaves.publica}`;
}
/* Manda el "toque" a todos los dispositivos de esa persona; los que ya no existen (404/410) se borran */
async function empujar(ctx, db, para) {
  const { results } = await db.prepare('SELECT endpoint FROM suscripciones WHERE quien = ?').bind(para).all();
  if (!results.length) return;
  const llaves = await llavesVapid(db), origen = new URL(ctx.request.url).origin;
  await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'normal', Authorization: await cabeceraVapid(llaves, endpoint, origen) } });
      if (r.status === 404 || r.status === 410) await db.prepare('DELETE FROM suscripciones WHERE endpoint = ?').bind(endpoint).run();
    } catch (e) { /* el servicio de push no respondió: se reintenta con el próximo aviso */ }
  }));
}
