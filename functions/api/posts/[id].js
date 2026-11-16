/* ============================================================
   posts/[id].js — PATCH /api/posts/ID (editar) y DELETE /api/posts/ID (borrar)
   Qué hace: permite a quien subió una publicación cambiar su texto/título/link/elementos de lista o borrarla.
   Para qué sirve: cada uno administra lo suyo; no se puede editar ni borrar lo que subió la otra persona.
   (Las encuestas solo permiten cambiar la pregunta; las opciones y los votos no se tocan.)
   ============================================================ */
import { json, bd, COLUMNAS, aPost, limpiar, urlValida, construirDatos, vistaPrevia } from '../../_lib/comun.js';
import { LIMITES } from '../../_lib/config.js';

/* Busca la publicación y comprueba que sea del usuario con sesión. Devuelve { fila } o { respuesta } (error ya armado) */
async function propia(env, id, quien) {
  const db = await bd(env);
  const fila = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(id).first();
  if (!fila) return { respuesta: json({ error: 'La publicación ya no existe.' }, 404) };
  if (fila.autor !== quien) return { respuesta: json({ error: 'Solo quien la subió puede modificarla.' }, 403) };
  return { fila, db };
}

export async function onRequestPatch({ request, env, data, params }) {
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
  if ((previo.tipo === 'link' || previo.tipo === 'video') && c.url !== undefined) {
    url = urlValida(c.url);
    if (!url) return json({ error: 'Escribe una dirección válida (que empiece con http:// o https://).' }, 400);
    if (url !== previo.url) datosPrevios = { ...datosPrevios, vista: undefined };   // cambió el link: la vista previa vieja ya no sirve
  }
  /* Lista: se envía completa con el estado "hecho" de cada elemento; el resto de tipos conserva sus datos */
  const entrada = previo.tipo === 'lista' ? c.datos : undefined;
  const r = previo.tipo === 'lista' ? construirDatos('lista', entrada, datosPrevios) : { datos: datosPrevios };
  if (r.error) return json({ error: r.error }, 400);
  if (previo.tipo === 'link' && !r.datos.vista) r.datos.vista = await vistaPrevia(url);

  const ahora = Date.now();
  await db.prepare('UPDATE posts SET titulo = ?, texto = ?, url = ?, datos = ?, actualizado = ? WHERE id = ?')
    .bind(titulo || null, texto || null, url, JSON.stringify(r.datos), ahora, params.id).run();
  const nueva = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(params.id).first();
  return json({ post: aPost(nueva) });
}

export async function onRequestDelete({ env, data, params }) {
  const { db, respuesta } = await propia(env, params.id, data.quien);
  if (respuesta) return respuesta;
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
