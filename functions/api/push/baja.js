/* ============================================================
   push/baja.js — POST /api/push/baja  { endpoint }   (v2.5)
   Qué hace: borra este dispositivo de los avisos del celular (al desactivarlos o cerrar sesión).
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';

export async function onRequestPost({ request, env, data }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const db = await bd(env);
  await db.prepare('DELETE FROM suscripciones WHERE endpoint = ? AND quien = ?').bind(String(c.endpoint || ''), data.quien).run();
  return json({ ok: true });
}
