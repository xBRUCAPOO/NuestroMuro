/* ============================================================
   perfiles/index.js — GET /api/perfiles  [NUEVO v2.8]
   Qué hace: devuelve las frases de los dos perfiles y todas sus entradas (sin las imágenes: esas se piden aparte por /api/perfiles/imagen/ID).
   Usa ETag: si nada cambió, el navegador recibe un 304 vacío (así se puede revisar cada pocos segundos sin gastar datos).
   Para qué sirve: pintar la pestaña "Perfiles".
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';
import { leerEntradas, leerFrases } from '../../_lib/perfiles.js';

export async function onRequestGet({ request, env }) {
  const db = await bd(env);
  /* ETag = cantidad + suma y máximo de "actualizado" de entradas y frases + cantidad de imágenes: cambia con cualquier alta, edición o borrado */
  const [a, b, c] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(actualizado), 0) AS m, COALESCE(SUM(actualizado), 0) AS s FROM perfil_entradas').first(),
    db.prepare('SELECT COALESCE(SUM(actualizado), 0) AS s FROM perfiles').first(),
    db.prepare('SELECT COUNT(*) AS n FROM perfil_imagenes').first(),
  ]);
  const etag = `"p${a.n}-${a.m}-${a.s}-${b.s}-${c.n}"`;
  const cab = { ETag: etag, 'Cache-Control': 'no-cache' };
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: cab });
  return json({ perfiles: await leerFrases(db), entradas: await leerEntradas(db) }, 200, cab);
}
