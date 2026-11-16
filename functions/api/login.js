/* ============================================================
   login.js — POST /api/login   { quien: "M" | "xB", clave: "..." }
   Qué hace: comprueba la contraseña de la identidad elegida y, si es correcta, entrega la cookie de sesión (1 año).
   Para qué sirve: es la ventana de acceso de la primera vez; después la cookie evita volver a pedir la contraseña.
   Si la contraseña es incorrecta espera un instante (frena los intentos automáticos).
   ============================================================ */
import { json, claveCorrecta, crearSesion, cookieSesion } from '../_lib/comun.js';
import { IDENTIDADES } from '../_lib/config.js';

export async function onRequestPost({ request, env }) {
  let cuerpo = {};
  try { cuerpo = await request.json(); } catch (e) { /* cuerpo vacío o inválido */ }
  const { quien, clave } = cuerpo;
  if (!IDENTIDADES.includes(quien)) return json({ error: 'Identidad no válida.' }, 400);

  if (!(await claveCorrecta(env, quien, clave))) {
    await new Promise((r) => setTimeout(r, 700));   // freno anti-fuerza-bruta
    return json({ error: 'Contraseña incorrecta.' }, 401);
  }
  return json({ quien }, 200, { 'Set-Cookie': cookieSesion(await crearSesion(env, quien)) });
}
