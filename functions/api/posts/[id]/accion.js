/* ============================================================
   posts/[id]/accion.js — POST /api/posts/ID/accion
   Qué hace: acciones que pueden hacer AMBOS sobre cualquier publicación (no solo sobre las propias):
   { accion: "corazon" }                      → pone/quita tu corazón
   { accion: "voto", opcion: 0 }              → vota (o quita tu voto) en una opción de la encuesta (un voto por persona)
   { accion: "item", indice: 2, hecho: true } → tilda / destilda un elemento de la lista
   Para qué sirve: interactuar con el muro sin cambiar quién es el autor de la publicación.
   ============================================================ */
import { json, bd, COLUMNAS, aPost } from '../../../_lib/comun.js';

export async function onRequestPost({ request, env, data, params }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const db = await bd(env);
  const fila = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(params.id).first();
  if (!fila) return json({ error: 'La publicación ya no existe.' }, 404);
  const p = aPost(fila), d = p.datos, yo = data.quien;

  if (c.accion === 'corazon') {
    const l = Array.isArray(d.corazones) ? d.corazones : [];
    d.corazones = l.includes(yo) ? l.filter((q) => q !== yo) : [...l, yo];
  } else if (c.accion === 'voto' && p.tipo === 'encuesta' && Array.isArray(d.opciones)) {
    const i = Number(c.opcion);
    if (!Number.isInteger(i) || !d.opciones[i]) return json({ error: 'Opción no válida.' }, 400);
    const yaVotaba = d.opciones[i].votos.includes(yo);
    d.opciones.forEach((o) => { o.votos = o.votos.filter((q) => q !== yo); });   // un solo voto por persona
    if (!yaVotaba) d.opciones[i].votos.push(yo);                                  // tocar tu opción otra vez quita el voto
  } else if (c.accion === 'item' && p.tipo === 'lista' && Array.isArray(d.items)) {
    const i = Number(c.indice);
    if (!Number.isInteger(i) || !d.items[i]) return json({ error: 'Elemento no válido.' }, 400);
    d.items[i].hecho = !!c.hecho;
  } else {
    return json({ error: 'Acción no válida.' }, 400);
  }

  await db.prepare('UPDATE posts SET datos = ?, actualizado = ? WHERE id = ?').bind(JSON.stringify(d), Date.now(), params.id).run();
  const nueva = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(params.id).first();
  return json({ post: aPost(nueva) });
}
