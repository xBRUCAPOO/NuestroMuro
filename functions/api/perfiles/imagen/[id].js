/* ============================================================
   perfiles/imagen/[id].js — GET /api/perfiles/imagen/ID  [NUEVO v2.8]
   Qué hace: entrega una imagen de una entrada de perfil como imagen real (decodifica el base64 guardado en D1).
   Para qué sirve: <img src="/api/perfiles/imagen/ID">; el navegador la guarda en su caché (una imagen nunca cambia, por eso se cachea un año).
   Requiere sesión, igual que el resto de la API.
   ============================================================ */
import { json, bd } from '../../../_lib/comun.js';

export async function onRequestGet({ env, params }) {
  const db = await bd(env);
  const fila = await db.prepare('SELECT imagen FROM perfil_imagenes WHERE id = ?').bind(params.id).first();
  const m = fila && fila.imagen.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return json({ error: 'Imagen no encontrada.' }, 404);
  const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
