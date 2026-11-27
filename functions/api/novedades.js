/* ============================================================
   novedades.js — GET /api/novedades   [NUEVO v3.0]
   Qué hace: devuelve las notas de las actualizaciones (functions/_lib/novedades.js), de la más nueva a la más vieja.
   Para qué sirve: la sección "Novedades" del menú de Ajustes.
   ============================================================ */
import { json } from '../_lib/comun.js';
import { NOVEDADES } from '../_lib/novedades.js';

export async function onRequestGet() {
  return json({ novedades: NOVEDADES }, 200, { 'Cache-Control': 'no-cache' });
}
