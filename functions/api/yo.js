/* ============================================================
   yo.js — GET /api/yo
   Qué hace: dice quién tiene la sesión abierta ({ quien: "M" | "xB" }) o responde 401 si no hay sesión.
   Para qué sirve: al abrir la página, decidir si se muestra la ventana de acceso (solo la primera vez) o directamente el muro.
   ============================================================ */
import { json } from '../_lib/comun.js';

export async function onRequestGet({ data }) {
  return data.quien ? json({ quien: data.quien }) : json({ error: 'Sin sesión.' }, 401);
}
