/* ============================================================
   posts/index.js — GET /api/posts (listar) y POST /api/posts (publicar)
   Qué hace: GET devuelve las publicaciones (más nuevas primero) sin las fotos; usa ETag para que, si nada cambió, el navegador
   reciba un 304 vacío (el muro se actualiza cada pocos segundos sin gastar datos). POST crea una publicación de cualquier tipo:
   nota, lista, encuesta, foto, link o plan (v2.3: reemplaza a "video"), a nombre de quien tiene la sesión.
   Para qué sirve: es el corazón del muro compartido.
   ============================================================ */
import { json, bd, COLUMNAS, aPost, TIPOS, limpiar, urlValida, construirDatos, vistaPrevia, idsCategoriasValidos } from '../../_lib/comun.js';
import { notificar, articuloTipo, tituloDe } from '../../_lib/notificar.js';   // v2.5: avisos
import { LIMITES } from '../../_lib/config.js';

export async function onRequestGet({ request, env }) {
  const db = await bd(env);
  /* ETag = cantidad + suma y máximo de "actualizado": cambia con cualquier alta, edición, voto o borrado */
  const r = await db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(actualizado), 0) AS m, COALESCE(SUM(actualizado), 0) AS s FROM posts').first();
  const etag = `"${r.n}-${r.m}-${r.s}"`;
  const cab = { ETag: etag, 'Cache-Control': 'no-cache' };
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: cab });
  const { results } = await db.prepare(`SELECT ${COLUMNAS} FROM posts ORDER BY creado DESC LIMIT ?`).bind(LIMITES.publicaciones).all();
  return json({ posts: results.map(aPost) }, 200, cab);
}

export async function onRequestPost({ request, env, data, waitUntil }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const tipo = c.tipo;
  if (!TIPOS.includes(tipo)) return json({ error: 'Tipo de publicación no válido.' }, 400);

  const titulo = limpiar(c.titulo, LIMITES.titulo);
  const texto = limpiar(c.texto, LIMITES.texto);
  let url = null, imagen = null;

  /* Reglas por tipo */
  if (tipo === 'nota' && !texto && !titulo) return json({ error: 'Escribe algo en la nota.' }, 400);
  if (tipo === 'encuesta' && !titulo) return json({ error: 'Escribe la pregunta de la encuesta.' }, 400);
  if (tipo === 'plan' && !titulo) return json({ error: 'Ponle un nombre al plan.' }, 400);   // v2.3: el plan necesita título (los días los valida construirDatos)
  if (tipo === 'link') {
    url = urlValida(c.url);
    if (!url) return json({ error: 'Escribe una dirección válida (que empiece con http:// o https://).' }, 400);
  }
  if (tipo === 'foto') {
    if (typeof c.imagen !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(c.imagen)) return json({ error: 'Falta la foto.' }, 400);
    if (c.imagen.length > LIMITES.imagen) return json({ error: 'La foto es demasiado pesada.' }, 413);
    imagen = c.imagen;
  }

  const { datos, error } = construirDatos(tipo, c.datos);
  if (error) return json({ error }, 400);
  if (tipo === 'link') datos.vista = await vistaPrevia(url);   // título, descripción e imagen del sitio (si se pueden leer)

  const ahora = Date.now(), id = crypto.randomUUID();
  const db = await bd(env);
  /* NUEVO v2.1: categorías elegidas (solo se guardan las que existen). Van dentro de "datos"; vacío = "sin categoría" */
  datos.categorias = await idsCategoriasValidos(db, c.categorias);
  await db.prepare('INSERT INTO posts (id, autor, tipo, titulo, texto, url, datos, imagen, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, data.quien, tipo, titulo || null, texto || null, url, JSON.stringify(datos), imagen, ahora, ahora).run();
  const fila = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(id).first();
  /* NUEVO v2.5: aviso para la otra persona ("M publicó un link: «título»") */
  const nuevo = aPost(fila);
  await notificar({ env, request, waitUntil }, db, { de: data.quien, tipo: 'post', post_id: id, texto: `${data.quien} publicó ${articuloTipo(tipo)}${tituloDe(nuevo) ? ': ' + tituloDe(nuevo) : ''}` });
  return json({ post: nuevo }, 201);
}
