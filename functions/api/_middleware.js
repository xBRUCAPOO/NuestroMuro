/* ============================================================
   _middleware.js — Guardia de TODA la API (/api/*)
   Qué hace: antes de cada petición 1) rechaza escrituras que vengan de otro sitio (protección CSRF),
   2) lee la sesión firmada de la cookie y la deja en context.data.quien ("M" o "xB"),
   3) exige sesión en todo menos en login, yo y salir.
   Para qué sirve: que sin la contraseña de M o de xB nadie pueda ver ni publicar nada en el muro.
   ============================================================ */
import { json, leerSesion, bd } from '../_lib/comun.js';
import { ULTIMA } from '../_lib/novedades.js';
import { notificarATodos } from '../_lib/notificar.js';

const PUBLICAS = ['/api/login', '/api/yo', '/api/salir', '/api/cron/recordatorios'];   // v3.0: el cron diario no tiene sesión (se protege con CRON_CLAVE si existe)

/* v3.0: la primera petición con sesión después de publicar una versión nueva manda la notificación de "novedades" (una sola vez para las dos personas).
   El INSERT … ON CONFLICT … WHERE solo cambia una fila si la versión guardada es distinta, así que aunque dos peticiones lleguen juntas se avisa una sola vez. */
let novedadRevisada = '';
async function avisarNovedad(ctx, db) {
  if (novedadRevisada === ULTIMA.version) return;
  novedadRevisada = ULTIMA.version;
  try {
    const r = await db.prepare(`INSERT INTO meta (clave, valor) VALUES ('novedad_version', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor WHERE meta.valor <> excluded.valor`).bind(ULTIMA.version).run();
    if (r.meta && r.meta.changes === 1) await notificarATodos(ctx, db, { tipo: 'novedad', texto: `Novedades v${ULTIMA.version}: ${ULTIMA.titulo}. ${ULTIMA.resumen}`, clave: `novedad:${ULTIMA.version}`, ventana: 365 * 86400000 });
  } catch (e) { novedadRevisada = ''; /* se reintenta en la próxima petición */ }
}

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  /* Escrituras: el origen (si el navegador lo envía) debe ser este mismo sitio */
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origen = request.headers.get('Origin');
    if (origen && origen !== url.origin) return json({ error: 'Origen no permitido.' }, 403);
  }

  try { await bd(env); } catch (e) { return json({ error: e.message || 'Error de base de datos.' }, 500); }

  data.quien = await leerSesion(request, env);
  if (!data.quien && !PUBLICAS.includes(url.pathname)) return json({ error: 'Inicia sesión para continuar.' }, 401);
  if (data.quien && context.waitUntil) context.waitUntil(avisarNovedad({ env, request, waitUntil: context.waitUntil.bind(context) }, env.DB));   // v3.0: aviso de versión nueva
  return next();
}
