/* ============================================================
   perfiles.js — Ayudas compartidas por los endpoints de perfiles  [NUEVO v2.8]
   Qué hace: límites de los perfiles, validación de imágenes e ids, y lectura de perfiles + entradas desde D1 con la forma que recibe el navegador.
   Para qué sirve: no repetir lo mismo en cada endpoint de /api/perfiles/*.
   Los límites viven aquí (y no en config.js) para no pisar las contraseñas que ya pusiste allí.
   ============================================================ */
import { IDENTIDADES, LIMITES } from './config.js';
import { limpiar, ICONO_RE } from './comun.js';

export const LIM_PERFIL = { frase: 120, titulo: 80, texto: 3000, imagenes: 4, entradas: 100 };
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const entero = (n) => (Number.isInteger(n) && n > 0 && n <= 20000 ? n : null);

/* ¿"quien" es una de las dos identidades (M / xB)? */
export const perfilValido = (q) => typeof q === 'string' && IDENTIDADES.includes(q);
/* Icono válido de Material Symbols o uno genérico ("star") */
export const iconoOStar = (i) => (typeof i === 'string' && ICONO_RE.test(i) ? i : 'star');

/* Valida una lista de imágenes nuevas [{ id?, imagen: 'data:image/…', w, h }]. Devuelve { imgs } o { error } */
export function validarImagenes(lista, max) {
  const l = Array.isArray(lista) ? lista : [];
  if (l.length > max) return { error: `Cada entrada admite hasta ${LIM_PERFIL.imagenes} imágenes.` };
  const imgs = [];
  for (const x of l) {
    if (!x || typeof x.imagen !== 'string' || !IMG_RE.test(x.imagen)) return { error: 'Una de las imágenes no es válida.' };
    if (x.imagen.length > LIMITES.imagen) return { error: 'Una de las imágenes es demasiado pesada.' };
    imgs.push({ id: typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : crypto.randomUUID(), imagen: x.imagen, w: entero(x.w), h: entero(x.h) });
  }
  return { imgs };
}

/* Campos de texto de una entrada ya limpios. Devuelve { campos } o { error } */
export function validarEntrada(c) {
  const titulo = limpiar(c.titulo, LIM_PERFIL.titulo);
  if (!titulo) return { error: 'Ponle un título a la entrada.' };
  return { campos: { icono: iconoOStar(c.icono), titulo, texto: limpiar(c.texto, LIM_PERFIL.texto) } };
}

/* Entradas (con la lista de sus imágenes) de uno o de todos los perfiles, de la más nueva a la más vieja */
export async function leerEntradas(db, id = null) {
  const sql = `SELECT id, perfil, icono, titulo, texto, autor, creado, actualizado FROM perfil_entradas ${id ? 'WHERE id = ?' : ''} ORDER BY creado DESC`;
  const { results } = await (id ? db.prepare(sql).bind(id) : db.prepare(sql)).all();
  if (!results.length) return [];
  const { results: imgs } = await db.prepare('SELECT id, entrada, w, h FROM perfil_imagenes ORDER BY entrada, orden').all();
  const porEntrada = new Map();
  imgs.forEach((i) => { if (!porEntrada.has(i.entrada)) porEntrada.set(i.entrada, []); porEntrada.get(i.entrada).push({ id: i.id, w: i.w, h: i.h }); });
  return results.map((e) => ({ ...e, texto: e.texto || '', imagenes: porEntrada.get(e.id) || [] }));
}
/* Las frases de los dos perfiles: { M: { frase, actualizado }, xB: { … } } (vacías si todavía no escribieron nada) */
export async function leerFrases(db) {
  const { results } = await db.prepare('SELECT quien, frase, actualizado FROM perfiles').all();
  const r = Object.fromEntries(IDENTIDADES.map((q) => [q, { frase: '', actualizado: 0 }]));
  results.forEach((f) => { if (r[f.quien]) r[f.quien] = { frase: f.frase || '', actualizado: f.actualizado }; });
  return r;
}
