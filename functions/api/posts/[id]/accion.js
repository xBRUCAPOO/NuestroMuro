/* ============================================================
   posts/[id]/accion.js — POST /api/posts/ID/accion
   Qué hace: acciones que pueden hacer AMBOS sobre cualquier publicación (no solo sobre las propias):
   { accion: "corazon" }                      → pone/quita tu corazón
   { accion: "voto", opcion: 0 }              → vota (o quita tu voto) en una opción de la encuesta (un voto por persona)
   { accion: "item", indice: 2, hecho: true } → tilda / destilda un elemento de la lista
   { accion: "dia", fecha: "2026-11-21", estado: "seguro" } → NUEVO v2.3: cambia el estado de un día de un plan (lo pueden hacer ambos);
   v2.6: también { accion: "dia", cambios: [{ fecha, estado }, …] } para guardar varios toques seguidos de una vez
   { accion: "comentar", texto: "…" }       → NUEVO v2.2: agrega un comentario (lo puede hacer cualquiera, también en publicaciones ajenas)
   { accion: "borrar_comentario", id: "…" }   → NUEVO v2.2: borra un comentario, pero solo quien lo escribió
   Para qué sirve: interactuar con el muro sin cambiar quién es el autor de la publicación.
   Los comentarios se guardan dentro de "datos.comentarios" de la publicación: [{ id, autor, texto, creado }].
   ============================================================ */
import { json, bd, COLUMNAS, aPost, limpiar, ponerEstadoDia } from '../../../_lib/comun.js';
import { notificar, otraPersona, refPost, recortar, etiquetaDia } from '../../../_lib/notificar.js';   // v2.5: avisos a la otra persona

/* Límites de los comentarios (aquí y no en config.js para no pisar las contraseñas que ya pusiste allí) */
const LIM_COMENTARIOS = { texto: 500, porPost: 200 };

export async function onRequestPost({ request, env, data, params, waitUntil }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const db = await bd(env);
  const fila = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(params.id).first();
  if (!fila) return json({ error: 'La publicación ya no existe.' }, 404);
  const p = aPost(fila), d = p.datos, yo = data.quien;
  /* NUEVO v2.5: cada acción arma "aviso" (texto + datos para no repetir) y al final se le manda a la otra persona.
     "ref" es cómo se nombra la publicación desde su punto de vista: "tu lista «Súper»" o "su lista «Súper»" */
  const ref = refPost(p, otraPersona(yo));
  let aviso = null;

  if (c.accion === 'corazon') {
    const l = Array.isArray(d.corazones) ? d.corazones : [];
    d.corazones = l.includes(yo) ? l.filter((q) => q !== yo) : [...l, yo];
    /* Solo avisa al DAR corazón (no al quitarlo) y no más de una vez cada 10 min por publicación, para que dar y quitar no llene de avisos */
    if (!l.includes(yo)) aviso = { tipo: 'corazon', texto: `A ${yo} le gustó ${ref}`, clave: `corazon:${p.id}:${yo}`, ventana: 600000 };
  } else if (c.accion === 'voto' && p.tipo === 'encuesta' && Array.isArray(d.opciones)) {
    const i = Number(c.opcion);
    if (!Number.isInteger(i) || !d.opciones[i]) return json({ error: 'Opción no válida.' }, 400);
    const yaVotaba = d.opciones[i].votos.includes(yo);
    const antes = d.opciones.findIndex((o) => o.votos.includes(yo));   // opción que tenía votada (para decir "cambió su voto")
    d.opciones.forEach((o) => { o.votos = o.votos.filter((q) => q !== yo); });   // un solo voto por persona
    if (!yaVotaba) d.opciones[i].votos.push(yo);                                  // tocar tu opción otra vez quita el voto
    const op = `«${recortar(d.opciones[i].t, 50)}»`;
    aviso = { tipo: 'voto', texto: yaVotaba ? `${yo} quitó su voto de ${op} en ${ref}` : antes >= 0 ? `${yo} cambió su voto de «${recortar(d.opciones[antes].t, 50)}» a ${op} en ${ref}` : `${yo} votó ${op} en ${ref}` };
  } else if (c.accion === 'item' && p.tipo === 'lista' && Array.isArray(d.items)) {
    const i = Number(c.indice);
    if (!Number.isInteger(i) || !d.items[i]) return json({ error: 'Elemento no válido.' }, 400);
    const antesHecho = !!d.items[i].hecho;
    d.items[i].hecho = !!c.hecho;
    if (antesHecho !== d.items[i].hecho) aviso = { tipo: 'tarea', texto: `${yo} ${d.items[i].hecho ? 'marcó' : 'volvió a dejar pendiente'} «${recortar(d.items[i].t, 50)}»${d.items[i].hecho ? ' como completada' : ''} en ${ref}` };
  } else if (c.accion === 'dia' && p.tipo === 'plan' && Array.isArray(d.dias)) {
    /* NUEVO v2.3: cualquiera de los dos cambia el estado de un día del plan (posible/ideal/descartado/seguro).
       La regla "solo un día seguro" (los demás se descartan) vive en ponerEstadoDia. */
    /* v2.6: la app puede mandar varios toques seguidos en una sola vez: { cambios: [{ fecha, estado }, …] } (se aplican en orden, igual que
       en la pantalla de quien tocó). Sigue valiendo el formato de un solo cambio { fecha, estado }. Si alguno no es válido no se guarda nada. */
    const cambios = Array.isArray(c.cambios) ? c.cambios.slice(0, 60) : [{ fecha: c.fecha, estado: c.estado }];
    if (!cambios.length) return json({ error: 'No hay cambios para guardar.' }, 400);
    const antes = Object.fromEntries(d.dias.map((x) => [x.f, x.e]));
    for (const k of cambios) {
      const err = ponerEstadoDia(d, k && k.fecha, k && k.estado);
      if (err) return json({ error: err }, 400);
    }
    /* Un solo aviso con el resultado final: confirmar / mover / quitar el día seguro, o los días que pasaron de un estado a otro */
    const viejoSeguro = Object.keys(antes).find((f) => antes[f] === 'seguro'), nuevoSeguro = (d.dias.find((x) => x.e === 'seguro') || {}).f;
    const difs = d.dias.filter((x) => antes[x.f] !== x.e);
    if (nuevoSeguro && nuevoSeguro !== viejoSeguro) aviso = { tipo: 'dia', texto: viejoSeguro ? `${yo} cambió el día seguro de ${ref} de ${etiquetaDia(viejoSeguro)} a ${etiquetaDia(nuevoSeguro)}` : `${yo} confirmó ${ref} para el ${etiquetaDia(nuevoSeguro)}` };
    else if (viejoSeguro && !nuevoSeguro) aviso = { tipo: 'dia', texto: `${yo} quitó el día seguro (${etiquetaDia(viejoSeguro)}) de ${ref}` };
    else if (difs.length) aviso = { tipo: 'dia', texto: `${yo} pasó ${difs.slice(0, 3).map((x) => `el ${etiquetaDia(x.f)} de ${antes[x.f]} a ${x.e}`).join(', ')}${difs.length > 3 ? ` y ${difs.length - 3} más` : ''} en ${ref}` };
  } else if (c.accion === 'comentar') {
    /* NUEVO v2.2: comentario nuevo al final. "limpiar" recorta espacios y largo; un comentario vacío se rechaza */
    const texto = limpiar(c.texto, LIM_COMENTARIOS.texto);
    if (!texto) return json({ error: 'Escribe algo para comentar.' }, 400);
    const l = Array.isArray(d.comentarios) ? d.comentarios : [];
    if (l.length >= LIM_COMENTARIOS.porPost) return json({ error: 'Esta publicación ya tiene demasiados comentarios.' }, 400);
    d.comentarios = [...l, { id: crypto.randomUUID(), autor: yo, texto, creado: Date.now() }];
    aviso = { tipo: 'comentario', texto: `${yo} comentó en ${ref}: «${recortar(texto, 80)}»` };
  } else if (c.accion === 'borrar_comentario') {
    /* NUEVO v2.2: solo se puede borrar un comentario propio */
    const l = Array.isArray(d.comentarios) ? d.comentarios : [];
    const com = l.find((x) => x.id === c.id);
    if (!com) return json({ error: 'El comentario ya no existe.' }, 404);
    if (com.autor !== yo) return json({ error: 'Solo quien lo escribió puede borrar el comentario.' }, 403);
    d.comentarios = l.filter((x) => x.id !== c.id);
    aviso = { tipo: 'comentario', texto: `${yo} borró un comentario en ${ref}` };
  } else {
    return json({ error: 'Acción no válida.' }, 400);
  }

  await db.prepare('UPDATE posts SET datos = ?, actualizado = ? WHERE id = ?').bind(JSON.stringify(d), Date.now(), params.id).run();
  if (aviso) await notificar({ env, request, waitUntil }, db, { de: yo, post_id: p.id, ...aviso });   // v2.5: avisa a la otra persona
  const nueva = await db.prepare(`SELECT ${COLUMNAS} FROM posts WHERE id = ?`).bind(params.id).first();
  return json({ post: aPost(nueva) });
}
