/* ============================================================
   notificaciones.js — /api/notificaciones  (v2.5)
   Qué hace:
   GET  /api/notificaciones           → mis avisos más recientes + cuántos no leí: { notificaciones: [...], noLeidas: n }
   GET  /api/notificaciones?push=1    → solo los que todavía no se entregaron como aviso del celular (y los marca como entregados);
                                        lo usa el service worker cuando llega un toque de push
   POST { accion: "leer" }            → marca todos como leídos (con "ids": [...] solo esos)
   POST { accion: "vaciar" }          → borra todos mis avisos
   Para qué sirve: la campanita de la app y los avisos del celular. Cada persona solo ve los suyos (data.quien).
   ============================================================ */
import { json, bd } from '../_lib/comun.js';

const COLS = 'id, de, tipo, post_id, texto, creado, leida';
const aAviso = (r) => ({ id: r.id, de: r.de, tipo: r.tipo, post: r.post_id || '', texto: r.texto, creado: r.creado, leida: !!r.leida });

export async function onRequestGet({ request, env, data }) {
  const db = await bd(env), yo = data.quien;
  if (new URL(request.url).searchParams.get('push')) {
    const { results } = await db.prepare(`SELECT ${COLS} FROM notificaciones WHERE para = ? AND empujada = 0 ORDER BY creado ASC LIMIT 10`).bind(yo).all();
    if (results.length) await db.batch(results.map((r) => db.prepare('UPDATE notificaciones SET empujada = 1 WHERE id = ?').bind(r.id)));
    return json({ notificaciones: results.map(aAviso) });
  }
  const { results } = await db.prepare(`SELECT ${COLS} FROM notificaciones WHERE para = ? ORDER BY creado DESC LIMIT 60`).bind(yo).all();
  const n = await db.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE para = ? AND leida = 0').bind(yo).first();
  return json({ notificaciones: results.map(aAviso), noLeidas: n.n });
}

export async function onRequestPost({ request, env, data }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const db = await bd(env), yo = data.quien;
  if (c.accion === 'leer') {
    const ids = Array.isArray(c.ids) ? c.ids.filter((x) => typeof x === 'string').slice(0, 100) : null;
    if (ids && ids.length) await db.batch(ids.map((id) => db.prepare('UPDATE notificaciones SET leida = 1 WHERE para = ? AND id = ?').bind(yo, id)));
    else if (!ids) await db.prepare('UPDATE notificaciones SET leida = 1 WHERE para = ?').bind(yo).run();
  } else if (c.accion === 'vaciar') {
    await db.prepare('DELETE FROM notificaciones WHERE para = ?').bind(yo).run();
  } else {
    return json({ error: 'Acción no válida.' }, 400);
  }
  const n = await db.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE para = ? AND leida = 0').bind(yo).first();
  return json({ ok: true, noLeidas: n.n });
}
