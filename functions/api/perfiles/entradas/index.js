/* ============================================================
   perfiles/entradas/index.js — POST /api/perfiles/entradas  [NUEVO v2.8]
   Qué hace: crea una entrada en el perfil de M o de xB. Entrada = { perfil, icono, titulo, texto, imagenes: [{ id, imagen, w, h }] }.
   Cualquiera de los dos puede añadir entradas en cualquier perfil.
   El navegador la muestra al instante y propone el id (UUID) de la entrada y de cada imagen; se usan esos mismos para que lo que ya se ve sea lo definitivo.
   Si el mismo envío llega dos veces (id repetido) no se duplica.
   ============================================================ */
import { json, bd } from '../../../_lib/comun.js';
import { LIM_PERFIL, ID_RE, perfilValido, validarEntrada, validarImagenes, leerEntradas } from '../../../_lib/perfiles.js';

export async function onRequestPost({ request, env, data }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  if (!perfilValido(c.perfil)) return json({ error: 'Perfil no válido.' }, 400);
  const { campos, error } = validarEntrada(c);
  if (error) return json({ error }, 400);
  const { imgs, error: errImg } = validarImagenes(c.imagenes, LIM_PERFIL.imagenes);
  if (errImg) return json({ error: errImg }, errImg.includes('pesada') ? 413 : 400);

  const db = await bd(env);
  const idPedido = typeof c.id === 'string' && ID_RE.test(c.id) ? c.id : null;
  if (idPedido) {   // mismo envío repetido: se devuelve la entrada que ya existe
    const ya = (await leerEntradas(db, idPedido))[0];
    if (ya && ya.autor === data.quien) return json({ entrada: ya }, 200);
  }
  const n = await db.prepare('SELECT COUNT(*) AS n FROM perfil_entradas WHERE perfil = ?').bind(c.perfil).first();
  if (n.n >= LIM_PERFIL.entradas) return json({ error: 'Este perfil ya tiene demasiadas entradas.' }, 400);
  const id = idPedido && !(await db.prepare('SELECT 1 AS x FROM perfil_entradas WHERE id = ?').bind(idPedido).first()) ? idPedido : crypto.randomUUID();
  const ahora = Date.now();
  /* Las imágenes cuyo id ya existe (en otra entrada) reciben un id nuevo, para no chocar */
  const usados = new Set();
  for (const i of imgs) {
    if (usados.has(i.id) || await db.prepare('SELECT 1 AS x FROM perfil_imagenes WHERE id = ?').bind(i.id).first()) i.id = crypto.randomUUID();
    usados.add(i.id);
  }
  await db.batch([
    db.prepare('INSERT INTO perfil_entradas (id, perfil, icono, titulo, texto, autor, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, c.perfil, campos.icono, campos.titulo, campos.texto || null, data.quien, ahora, ahora),
    ...imgs.map((i, k) => db.prepare('INSERT INTO perfil_imagenes (id, entrada, orden, imagen, w, h) VALUES (?, ?, ?, ?, ?, ?)').bind(i.id, id, k, i.imagen, i.w, i.h)),
  ]);
  return json({ entrada: (await leerEntradas(db, id))[0] }, 201);
}
