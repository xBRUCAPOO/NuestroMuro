/* ============================================================
   categorias/index.js — GET /api/categorias (listar) y POST /api/categorias (crear)  [NUEVO v2.1]
   Qué hace: GET devuelve todas las categorías en el orden en que se crearon; POST crea una nueva con nombre e icono
   (nombre de Material Symbols), a nombre de quien tiene la sesión.
   Para qué sirve: poder clasificar las publicaciones (como las listas de YouTube) y filtrar el muro por categoría.
   Las categorías son compartidas: M y xB ven y usan las mismas.
   ============================================================ */
import { json, bd, limpiar, LIM_CAT, ICONO_RE } from '../../_lib/comun.js';
import { notificar } from '../../_lib/notificar.js';   // v2.5: avisos

export async function onRequestGet({ env }) {
  const db = await bd(env);
  const { results } = await db.prepare('SELECT id, nombre, icono, autor, creado FROM categorias ORDER BY creado ASC').all();
  return json({ categorias: results });
}

export async function onRequestPost({ request, env, data, waitUntil }) {
  let c = {};
  try { c = await request.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const nombre = limpiar(c.nombre, LIM_CAT.nombre);
  const icono = typeof c.icono === 'string' && ICONO_RE.test(c.icono) ? c.icono : 'label';   // si el icono no es válido se usa uno genérico
  if (!nombre) return json({ error: 'Ponle un nombre a la categoría.' }, 400);

  const db = await bd(env);
  const n = await db.prepare('SELECT COUNT(*) AS n FROM categorias').first();
  if (n.n >= LIM_CAT.total) return json({ error: 'Ya hay demasiadas categorías.' }, 400);
  /* No se permiten dos categorías con el mismo nombre (sin importar mayúsculas) */
  const repetida = await db.prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?)').bind(nombre).first();
  if (repetida) return json({ error: 'Ya existe una categoría con ese nombre.' }, 409);

  /* v2.7: el navegador crea la categoría al instante y propone su id (UUID); se usa ese mismo para que la ficha que ya se ve sea la definitiva */
  const idPedido = typeof c.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id) && !(await db.prepare('SELECT 1 AS x FROM categorias WHERE id = ?').bind(c.id).first()) ? c.id : null;
  const cat = { id: idPedido || crypto.randomUUID(), nombre, icono, autor: data.quien, creado: Date.now() };
  await db.prepare('INSERT INTO categorias (id, nombre, icono, autor, creado) VALUES (?, ?, ?, ?, ?)')
    .bind(cat.id, cat.nombre, cat.icono, cat.autor, cat.creado).run();
  await notificar({ env, request, waitUntil }, db, { de: data.quien, tipo: 'categoria', texto: `${data.quien} creó la categoría «${cat.nombre}»` });   // v2.5: aviso
  return json({ categoria: cat }, 201);
}
