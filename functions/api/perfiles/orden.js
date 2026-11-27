/* ============================================================
   perfiles/orden.js — PUT /api/perfiles/orden  [NUEVO v3.0]
   Qué hace: guarda el orden que se eligió ARRASTRANDO las entradas de un perfil. Recibe { perfil: 'M' | 'xB', ids: [id, id, …] } (de arriba hacia abajo)
   y guarda la posición de cada una en la columna "orden". Las entradas que no se mencionan no se tocan. No cambia "actualizado" (no cuenta como editar).
   Para qué sirve: que cada perfil conserve el orden que le dio su dueño, también en el otro celular.
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';
import { perfilValido, LIM_PERFIL } from '../../_lib/perfiles.js';

export async function onRequestPut({ request, env }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  if (!perfilValido(c.perfil)) return json({ error: 'Perfil no válido.' }, 400);
  const ids = [...new Set(Array.isArray(c.ids) ? c.ids.filter((x) => typeof x === 'string') : [])].slice(0, LIM_PERFIL.entradas + 20);
  if (!ids.length) return json({ error: 'No hay entradas para ordenar.' }, 400);
  const db = await bd(env);
  /* Solo cuentan las entradas que existen de verdad y que son de ese perfil */
  const { results } = await db.prepare('SELECT id FROM perfil_entradas WHERE perfil = ?').bind(c.perfil).all();
  const validas = new Set(results.map((r) => r.id)), orden = ids.filter((x) => validas.has(x));
  if (!orden.length) return json({ error: 'Esas entradas ya no existen.' }, 404);
  await db.batch(orden.map((id, k) => db.prepare('UPDATE perfil_entradas SET orden = ? WHERE id = ?').bind(k, id)));
  return json({ ok: true, orden: Object.fromEntries(orden.map((id, k) => [id, k])) });
}
