/* ============================================================
   perfiles/bio/[quien].js — PUT /api/perfiles/bio/M (o xB)  [NUEVO v2.8]
   Qué hace: guarda la frase corta ("bio") de un perfil. SOLO la puede cambiar su dueño (M cambia la de M, xB la de xB).
   Para qué sirve: la línea de presentación bajo el nombre en la cabecera del perfil.
   ============================================================ */
import { json, bd, limpiar } from '../../../_lib/comun.js';
import { LIM_PERFIL, perfilValido } from '../../../_lib/perfiles.js';

export async function onRequestPut({ request, env, data, params }) {
  if (!perfilValido(params.quien)) return json({ error: 'Perfil no válido.' }, 404);
  if (params.quien !== data.quien) return json({ error: 'Solo quien es dueño del perfil puede cambiar su frase.' }, 403);
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const frase = limpiar(c.frase, LIM_PERFIL.frase), ahora = Date.now();
  const db = await bd(env);
  await db.prepare('INSERT INTO perfiles (quien, frase, actualizado) VALUES (?, ?, ?) ON CONFLICT(quien) DO UPDATE SET frase = excluded.frase, actualizado = excluded.actualizado')
    .bind(params.quien, frase, ahora).run();
  return json({ quien: params.quien, frase, actualizado: ahora });
}
