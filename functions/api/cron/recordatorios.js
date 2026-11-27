/* ============================================================
   cron/recordatorios.js — GET/POST /api/cron/recordatorios   [NUEVO v3.0]
   Qué hace: manda los avisos del calendario ("Faltan 3 días para…", "¡MAÑANA es el gran día de…!", "¡HOY es…!") a las dos personas.
   Quién lo llama: GitHub Actions (.github/workflows/recordatorios.yml) una vez por día. Es seguro llamarlo varias veces: no repite avisos.
   Protección opcional: si en Cloudflare Pages existe la variable CRON_CLAVE, hay que mandarla (?clave=… o cabecera Authorization: Bearer …).
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';
import { enviarRecordatorios } from '../../_lib/fechas.js';

async function correr({ request, env, waitUntil }) {
  if (env.CRON_CLAVE) {
    const dada = new URL(request.url).searchParams.get('clave') || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (dada !== env.CRON_CLAVE) return json({ error: 'No autorizado.' }, 401);
  }
  const db = await bd(env);
  const avisos = await enviarRecordatorios({ env, request, waitUntil }, db);
  return json({ ok: true, avisos });
}
export const onRequestGet = correr;
export const onRequestPost = correr;
