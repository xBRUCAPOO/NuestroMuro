/* ============================================================
   posts/[id].js — PATCH /api/posts/ID (editar) y DELETE /api/posts/ID (borrar)
   Qué hace: permite a quien subió una publicación cambiar su texto/título/link/elementos de lista o borrarla.
   Para qué sirve: cada uno administra lo suyo; no se puede editar ni borrar lo que subió la otra persona.
   (Las encuestas solo permiten cambiar la pregunta; las opciones y los votos no se tocan.)
   ============================================================ */
import { json, bd, COLUMNAS, aPost, limpiar, urlValida, construirDatos, vistaPrevia, idsCategoriasValidos } from '../../_lib/comun.js';
import { notificar, refPost, otraPersona } from '../../_lib/notificar.js';   // v2.5: avisos
import { LIMITES } from '../../_lib/config.js';

/* Busca la publicación y comprueba que sea del usuario con sesión. Devuelve { fila } o { respuesta } (error ya armado) */
async function propia(env, id, quien) {
  const db = await bd(env);
  const fila = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(id).first();
  if (!fila) return { respuesta: json({ error: 'La publicación ya no existe.' }, 404) };
  if (fila.autor !== quien) return { respuesta: json({ error: 'Solo quien la subió puede modificarla.' }, 403) };
  return { fila, db };
}

export async function onRequestPatch({ request, env, data, params, waitUntil }) {
  const { fila, db, respuesta } = await propia(env, params.id, data.quien);
  if (respuesta) return respuesta;
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }

  const previo = aPost(fila);
  const titulo = c.titulo !== undefined ? limpiar(c.titulo, LIMITES.titulo) : previo.titulo;
  const texto = c.texto !== undefined ? limpiar(c.texto, LIMITES.texto) : previo.texto;
  let url = previo.url, datosPrevios = previo.datos;

  if (previo.tipo === 'nota' && !texto && !titulo) return json({ error: 'La nota no puede quedar vacía.' }, 400);
  if (previo.tipo === 'encuesta' && !titulo) return json({ error: 'La encuesta necesita su pregunta.' }, 400);
  if (previo.tipo === 'plan' && !titulo) return json({ error: 'El plan necesita su nombre.' }, 400);   // v2.3
  if (previo.tipo === 'link' && c.url !== undefined) {
    url = urlValida(c.url);
    if (!url) return json({ error: 'Escribe una dirección válida (que empiece con http:// o https://).' }, 400);
    if (url !== previo.url) datosPrevios = { ...datosPrevios, vista: undefined };   // cambió el link: la vista previa vieja ya no sirve
  }
  /* Lista: se envía completa con el estado "hecho" de cada elemento; el resto de tipos conserva sus datos */
  /* v2.3: el plan también se reconstruye al editar (días, hora y lugar); los estados de los días que se mantienen se conservan */
  const reconstruir = previo.tipo === 'lista' || (previo.tipo === 'plan' && c.datos !== undefined);
  const r = reconstruir ? construirDatos(previo.tipo, c.datos, datosPrevios) : { datos: datosPrevios };
  if (r.error) return json({ error: r.error }, 400);
  if (previo.tipo === 'link' && !r.datos.vista) r.datos.vista = await vistaPrevia(url);

  /* NUEVO v2.1: categorías. Si el navegador las envía se validan; si no, se conservan las que ya tenía (sin las borradas) */
  const catsPrevias = await idsCategoriasValidos(db, previo.datos.categorias);
  r.datos.categorias = c.categorias !== undefined ? await idsCategoriasValidos(db, c.categorias) : catsPrevias;

  /* NUEVO v2.2: los comentarios nunca se pierden al editar (las listas se reconstruyen desde cero, así que se copian aparte) */
  if (previo.datos.comentarios) r.datos.comentarios = previo.datos.comentarios;

  /* NUEVO v2.1: "editado". Solo se marca si de verdad cambió algo del contenido (título, texto, link, elementos de la lista o
     categorías); guardar sin tocar nada, o dar corazón/votar, no cuenta como edición. */
  const ahora = Date.now();
  const mismoItems = JSON.stringify(previo.datos.items || null) === JSON.stringify(r.datos.items || null);
  const mismasCats = JSON.stringify(catsPrevias) === JSON.stringify(r.datos.categorias);
  /* v2.3: en un plan también cuenta como edición cambiar las fechas, la hora o el lugar (cambiar el estado de un día NO cuenta) */
  const planDe = (d) => JSON.stringify([(d.dias || []).map((x) => x.f), d.hora || '', d.lugar || '']);
  const mismoPlan = previo.tipo !== 'plan' || planDe(previo.datos) === planDe(r.datos);
  const cambio = titulo !== previo.titulo || texto !== previo.texto || url !== previo.url || !mismoItems || !mismasCats || !mismoPlan;
  r.datos.editado = cambio ? ahora : (previo.datos.editado || 0);

  await db.prepare('UPDATE posts SET titulo = ?, texto = ?, url = ?, datos = ?, actualizado = ? WHERE id = ?')
    .bind(titulo || null, texto || null, url, JSON.stringify(r.datos), ahora, params.id).run();
  const nueva = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(params.id).first();
  /* NUEVO v2.5: aviso "M editó su link «título»" (solo si de verdad cambió el contenido, igual que la marca "editado") */
  if (cambio) await notificar({ env, request, waitUntil }, db, { de: data.quien, tipo: 'editar', post_id: params.id, texto: `${data.quien} editó ${refPost(aPost(nueva), otraPersona(data.quien))}` });
  return json({ post: aPost(nueva) });
}

export async function onRequestDelete({ request, env, data, params, waitUntil }) {
  const { fila, db, respuesta } = await propia(env, params.id, data.quien);
  if (respuesta) return respuesta;
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(params.id).run();
  /* NUEVO v2.5: aviso "M eliminó su nota «título»" (sin enlace: la publicación ya no existe) */
  await notificar({ env, request, waitUntil }, db, { de: data.quien, tipo: 'borrar', texto: `${data.quien} eliminó ${refPost(aPost(fila), otraPersona(data.quien))}` });
  return json({ ok: true });
}
