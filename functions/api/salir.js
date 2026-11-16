/* ============================================================
   salir.js — POST /api/salir
   Qué hace: borra la cookie de sesión.
   Para qué sirve: cambiar de identidad (por ejemplo, si el celular lo usa otra persona). Al volver a entrar se pide la ventana de acceso.
   ============================================================ */
import { json, cookieSesion } from '../_lib/comun.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSesion('', 0) });
}
