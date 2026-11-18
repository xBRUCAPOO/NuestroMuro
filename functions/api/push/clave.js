/* ============================================================
   push/clave.js — GET /api/push/clave  (v2.5)
   Qué hace: entrega la clave pública VAPID del servidor (la crea sola la primera vez).
   Para qué sirve: el navegador la necesita para suscribirse a los avisos del celular.
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';
import { llavesVapid } from '../../_lib/notificar.js';

export async function onRequestGet({ env }) {
  const db = await bd(env);
  return json({ clave: (await llavesVapid(db)).publica });
}
