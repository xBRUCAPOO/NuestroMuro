/* ============================================================
   categorias/[id].js — DELETE /api/categorias/ID (borrar)  [NUEVO v2.1]
   Qué hace: permite borrar una categoría solo a quien la creó.
   Para qué sirve: corregir una categoría mal creada. Las publicaciones que la tenían simplemente dejan de mostrarla
   (el navegador ignora ids que ya no existen y el servidor los descarta la próxima vez que se edite la publicación).
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';

export async function onRequestDelete({ env, data, params }) {
  const db = await bd(env);
  const fila = await db.prepare('SELECT autor FROM categorias WHERE id = ?').bind(params.id).first();
  if (!fila) return json({ error: 'La categoría ya no existe.' }, 404);
  if (fila.autor !== data.quien) return json({ error: 'Solo quien la creó puede borrarla.' }, 403);
  await db.prepare('DELETE FROM categorias WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
