/* ============================================================
   perfiles/entradas/[id].js — PUT y DELETE /api/perfiles/entradas/ID  [NUEVO v2.8]
   Qué hace: PUT cambia ícono, título y texto de una entrada y su lista de imágenes: "conservar" = ids de las imágenes que se quedan (en su orden) e
   "imagenes" = imágenes nuevas [{ id, imagen, w, h }]; las demás se borran. DELETE borra la entrada con todas sus imágenes.
   Para qué sirve: los dos pueden editar y borrar CUALQUIER entrada de cualquier perfil (así se decidió), no solo las propias.
   ============================================================ */
import { json, bd } from '../../../_lib/comun.js';
import { LIM_PERFIL, validarEntrada, validarImagenes, leerEntradas } from '../../../_lib/perfiles.js';

export async function onRequestPut({ request, env, params }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const db = await bd(env);
  const previa = await db.prepare('SELECT id FROM perfil_entradas WHERE id = ?').bind(params.id).first();
  if (!previa) return json({ error: 'La entrada ya no existe.' }, 404);
  const { campos, error } = validarEntrada(c);
  if (error) return json({ error }, 400);

  /* Imágenes que ya tenía y se conservan (solo cuentan las que existen de verdad en esta entrada, sin repetir) */
  const { results: ex } = await db.prepare('SELECT id FROM perfil_imagenes WHERE entrada = ?').bind(params.id).all();
  const existentes = new Set(ex.map((x) => x.id));
  const conservar = [...new Set(Array.isArray(c.conservar) ? c.conservar : [])].filter((x) => existentes.has(x));
  const { imgs, error: errImg } = validarImagenes(c.imagenes, LIM_PERFIL.imagenes - conservar.length);
  if (errImg) return json({ error: errImg }, errImg.includes('pesada') ? 413 : 400);
  const usados = new Set([...conservar]);
  for (const i of imgs) {
    if (usados.has(i.id) || (!existentes.has(i.id) && await db.prepare('SELECT 1 AS x FROM perfil_imagenes WHERE id = ?').bind(i.id).first())) i.id = crypto.randomUUID();
    usados.add(i.id);
  }
  const quitar = [...existentes].filter((x) => !conservar.includes(x));
  await db.batch([
    db.prepare('UPDATE perfil_entradas SET icono = ?, titulo = ?, texto = ?, actualizado = ? WHERE id = ?').bind(campos.icono, campos.titulo, campos.texto || null, Date.now(), params.id),
    ...quitar.map((x) => db.prepare('DELETE FROM perfil_imagenes WHERE id = ?').bind(x)),
    ...conservar.map((x, k) => db.prepare('UPDATE perfil_imagenes SET orden = ? WHERE id = ?').bind(k, x)),
    ...imgs.map((i, k) => db.prepare('INSERT INTO perfil_imagenes (id, entrada, orden, imagen, w, h) VALUES (?, ?, ?, ?, ?, ?)').bind(i.id, params.id, conservar.length + k, i.imagen, i.w, i.h)),
  ]);
  return json({ entrada: (await leerEntradas(db, params.id))[0] });
}

export async function onRequestDelete({ env, params }) {
  const db = await bd(env);
  /* Si ya no existe se responde "ok" igual: el resultado que quería quien borró (que no esté) ya se cumple */
  await db.batch([
    db.prepare('DELETE FROM perfil_imagenes WHERE entrada = ?').bind(params.id),
    db.prepare('DELETE FROM perfil_entradas WHERE id = ?').bind(params.id),
  ]);
  return json({ ok: true });
}
