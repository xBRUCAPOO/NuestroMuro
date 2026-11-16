/* ============================================================
   _middleware.js — Guardia de TODA la API (/api/*)
   Qué hace: antes de cada petición 1) rechaza escrituras que vengan de otro sitio (protección CSRF),
   2) lee la sesión firmada de la cookie y la deja en context.data.quien ("M" o "xB"),
   3) exige sesión en todo menos en login, yo y salir.
   Para qué sirve: que sin la contraseña de M o de xB nadie pueda ver ni publicar nada en el muro.
   ============================================================ */
import { json, leerSesion, bd } from '../_lib/comun.js';

const PUBLICAS = ['/api/login', '/api/yo', '/api/salir'];

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
  return next();
}
