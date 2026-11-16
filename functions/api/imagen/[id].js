/* ============================================================
   imagen/[id].js — GET /api/imagen/ID
   Qué hace: entrega la foto de una publicación como imagen real (decodifica el base64 guardado en D1).
   Para qué sirve: que el muro use <img src="/api/imagen/ID"> y el navegador guarde la foto en su caché
   (nunca cambia, por eso se cachea un año). Requiere sesión, igual que el resto de la API.
   ============================================================ */
import { json, bd } from '../../_lib/comun.js';

export async function onRequestGet({ env, params }) {
  const db = await bd(env);
  const fila = await db.prepare('SELECT imagen FROM posts WHERE id = ?').bind(params.id).first();
  const m = fila && fila.imagen && fila.imagen.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return json({ error: 'Imagen no encontrada.' }, 404);
  const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
