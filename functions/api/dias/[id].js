/* ============================================================
   dias/[id].js — PUT /api/dias/ID (editar) y DELETE /api/dias/ID (borrar)   [NUEVO v3.0]
   Qué hace: cualquiera de los dos puede editar o borrar una fecha del calendario (es de las dos personas).
   Los días ligados a un plan (grupo) NO se tocan acá: cambian o desaparecen cuando se edita o borra el plan (devuelve 409).
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';
import { aDia, COLS_DIA, validarDia } from '../../_lib/fechas.js';
import { notificar, recortar } from '../../_lib/notificar.js';

async function buscar(env, id) {
  const db = await bd(env);
  const fila = await db.prepare(`SELECT ${COLS_DIA} FROM dias_importantes WHERE id = ?`).bind(id).first();
  return { db, fila };
}
const LIGADO = 'Este día pertenece a un plan: se cambia editando el plan.';

export async function onRequestPut({ request, env, data, params, waitUntil }) {
  const { db, fila } = await buscar(env, params.id);
  if (!fila) return json({ error: 'La fecha ya no existe.' }, 404);
  if (fila.grupo) return json({ error: LIGADO }, 409);
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const v = validarDia(c);
  if (v.error) return json({ error: v.error }, 400);
  const f = v.campos;
  await db.prepare(`UPDATE dias_importantes SET dia = ?, mes = ?, anio = ?, nombre = ?, descripcion = ?, color = ?, categoria = ?, recordar = ?, fin_dia = ?, fin_mes = ?, actualizado = ? WHERE id = ?`)
    .bind(f.dia, f.mes, f.anio, f.nombre, f.descripcion, f.color, f.categoria, f.recordar, f.finDia, f.finMes, Date.now(), params.id).run();
  const nueva = await db.prepare(`SELECT ${COLS_DIA} FROM dias_importantes WHERE id = ?`).bind(params.id).first();
  await notificar({ env, request, waitUntil }, db, { de: data.quien, tipo: 'fecha', texto: `${data.quien} editó la fecha «${recortar(f.nombre, 50)}» del calendario` });
  return json({ dia: aDia(nueva) });
}

export async function onRequestDelete({ request, env, data, params, waitUntil }) {
  const { db, fila } = await buscar(env, params.id);
  if (!fila) return json({ ok: true });
  if (fila.grupo) return json({ error: LIGADO }, 409);
  await db.prepare('DELETE FROM dias_importantes WHERE id = ?').bind(params.id).run();
  await notificar({ env, request, waitUntil }, db, { de: data.quien, tipo: 'fecha', texto: `${data.quien} borró la fecha «${recortar(fila.nombre, 50)}» del calendario` });
  return json({ ok: true });
}
