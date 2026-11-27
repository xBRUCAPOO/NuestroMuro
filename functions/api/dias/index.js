/* ============================================================
   dias/index.js — GET /api/dias (listar) y POST /api/dias (crear)   [NUEVO v3.0]
   Qué hace: GET devuelve todas las fechas importantes del calendario (usa ETag: si nada cambió, 304 vacío). POST agrega una fecha nueva.
   Además, al listar, dispara (en segundo plano) los recordatorios del día si todavía no se mandaron (respaldo por si el cron diario falla).
   Para qué sirve: pantalla "Calendario" de la app.
   ============================================================ */
import { json, bd, hoyAR } from '../../_lib/comun.js';
import { aDia, COLS_DIA, validarDia, prepararDias, enviarRecordatorios } from '../../_lib/fechas.js';
import { notificar, recortar } from '../../_lib/notificar.js';

export async function onRequestGet({ request, env, waitUntil }) {
  const db = await bd(env);
  await prepararDias(db);
  /* Respaldo de recordatorios: solo después de las 8:00 de Argentina (UTC-3) */
  if (new Date(Date.now() - 3 * 3600 * 1000).getUTCHours() >= 8 && waitUntil) waitUntil(enviarRecordatorios({ env, request, waitUntil }, db, hoyAR()).catch(() => {}));
  const r = await db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(actualizado), 0) AS m, COALESCE(SUM(actualizado), 0) AS s FROM dias_importantes').first();
  const etag = `"d${r.n}-${r.m}-${r.s}"`, cab = { ETag: etag, 'Cache-Control': 'no-cache' };
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: cab });
  const { results } = await db.prepare(`SELECT ${COLS_DIA} FROM dias_importantes ORDER BY mes, dia`).all();
  return json({ dias: results.map(aDia) }, 200, cab);
}

export async function onRequestPost({ request, env, data, waitUntil }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const v = validarDia(c);
  if (v.error) return json({ error: v.error }, 400);
  const db = await bd(env); await prepararDias(db);
  const n = await db.prepare(`SELECT COUNT(*) AS n FROM dias_importantes`).first();
  if (n.n >= 1000) return json({ error: 'Ya hay demasiadas fechas guardadas.' }, 400);
  const f = v.campos, id = crypto.randomUUID(), ahora = Date.now();
  await db.prepare(`INSERT INTO dias_importantes (id, dia, mes, anio, nombre, descripcion, color, categoria, recordar, fin_dia, fin_mes, grupo, estado, autor, creado, actualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`).bind(id, f.dia, f.mes, f.anio, f.nombre, f.descripcion, f.color, f.categoria, f.recordar, f.finDia, f.finMes, data.quien, ahora, ahora).run();
  const fila = await db.prepare(`SELECT ${COLS_DIA} FROM dias_importantes WHERE id = ?`).bind(id).first();
  await notificar({ env, request, waitUntil }, db, { de: data.quien, tipo: 'fecha', texto: `${data.quien} agregó la fecha «${recortar(f.nombre, 50)}» al calendario` });
  return json({ dia: aDia(fila) }, 201);
}
