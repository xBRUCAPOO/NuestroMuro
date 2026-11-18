/* ============================================================
   push/suscribir.js — POST /api/push/suscribir  { endpoint }   (v2.5)
   Qué hace: registra este dispositivo para recibir los avisos del celular a nombre de quien tiene la sesión.
   Si el dispositivo ya estaba registrado (por ejemplo cambió de M a xB), solo actualiza a nombre de quién va.
   Para qué sirve: que lleguen notificaciones aunque la app esté cerrada.
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';

export async function onRequestPost({ request, env, data }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  let u;
  try { u = new URL(c.endpoint); } catch (e) { return json({ error: 'Dirección de aviso no válida.' }, 400); }
  /* Solo https (http únicamente al probar en la computadora); el servidor llama a esa dirección, así que se limita el tipo y el largo */
  const local = ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
  if ((u.protocol !== 'https:' && !(local && u.protocol === 'http:')) || String(c.endpoint).length > 1000) return json({ error: 'Dirección de aviso no válida.' }, 400);
  const db = await bd(env);
  await db.prepare('INSERT INTO suscripciones (endpoint, quien, creado) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET quien = excluded.quien')
    .bind(c.endpoint, data.quien, Date.now()).run();
  /* Máximo 10 dispositivos por persona (se borran los más viejos) */
  await db.prepare('DELETE FROM suscripciones WHERE quien = ? AND endpoint NOT IN (SELECT endpoint FROM suscripciones WHERE quien = ? ORDER BY creado DESC LIMIT 10)').bind(data.quien, data.quien).run();
  return json({ ok: true });
}
