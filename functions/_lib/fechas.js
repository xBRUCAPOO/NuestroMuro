/* ============================================================
   fechas.js — Calendario de fechas importantes (lógica del servidor)  [NUEVO v3.0]
   Qué hace:
   - Valida y convierte los días importantes (tabla dias_importantes).
   - Carga una sola vez las fechas iniciales del "Calendario de Amor" (feriados, fechas de pareja…).
   - Mantiene un día importante por cada FECHA de cada PLAN ("el año también importa": son de una sola vez y quedan ligados al plan, grupo = id del plan):
     al crear, editar o borrar el plan, sus días se crean, se actualizan o se borran solos.
   - Calcula la próxima fecha de un día (para los recordatorios).
   Para qué sirve: ver todo en el calendario sin cargar los planes a mano y recibir avisos ("Faltan 3 días para…").
   ============================================================ */
import { limpiar, fechaValida, hoyAR, aPost } from './comun.js';
import { notificarATodos } from './notificar.js';
import { FECHAS_SEMILLA } from './fechas_semilla.js';

export const CATEGORIAS_DIA = ['pareja', 'cumpleanos', 'aniversario', 'feriado', 'otro'];   // las que se pueden elegir; 'plan' la ponen solo los días ligados a un plan
export const LIM_DIA = { nombre: 80, descripcion: 1500, colores: 50, recordar: 60 };
const COLOR_PLAN = { M: 11, xB: 1 };                                          // color de los días de un plan según quien lo creó (11 = azul, 1 = rojo)
const ESTADO_TXT = { posible: 'Posible', ideal: 'Ideal', descartado: 'Descartado', seguro: 'Seguro' };

/* Fila de la base → objeto que recibe el navegador */
export const aDia = (r) => ({
  id: r.id, dia: r.dia, mes: r.mes, anio: r.anio, recurrente: r.anio == null, nombre: r.nombre, descripcion: r.descripcion || '', color: r.color,
  categoria: r.categoria, recordar: r.recordar, finDia: r.fin_dia, finMes: r.fin_dia ? (r.fin_mes || r.mes) : null, grupo: r.grupo || '', estado: r.estado || '', autor: r.autor || '',
});
export const COLS_DIA = 'id, dia, mes, anio, nombre, descripcion, color, categoria, recordar, fin_dia, fin_mes, grupo, estado, autor';

const entero = (n, min, max) => (Number.isInteger(n) && n >= min && n <= max ? n : null);
/* ¿Existe ese día en ese mes? (sin año se acepta el 29 de febrero) */
function existe(dia, mes, anio) { const a = anio || 2024, d = new Date(Date.UTC(a, mes - 1, dia)); return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia; }

/* Valida lo que manda el navegador. Devuelve { campos } o { error } */
export function validarDia(c) {
  const dia = entero(c.dia, 1, 31), mes = entero(c.mes, 1, 12);
  const anio = c.anio == null || c.anio === '' ? null : entero(Number(c.anio), 2000, 2100);
  if (c.anio != null && c.anio !== '' && anio == null) return { error: 'El año no es válido.' };
  if (!dia || !mes || !existe(dia, mes, anio)) return { error: 'La fecha no es válida.' };
  const nombre = limpiar(c.nombre, LIM_DIA.nombre);
  if (!nombre) return { error: 'Ponle un nombre a la fecha.' };
  const color = entero(Number(c.color), 1, LIM_DIA.colores) || 1;
  const categoria = CATEGORIAS_DIA.includes(c.categoria) ? c.categoria : 'otro';
  const recordar = c.recordar == null || c.recordar === '' ? null : entero(Number(c.recordar), 0, LIM_DIA.recordar);
  if (c.recordar != null && c.recordar !== '' && recordar == null) return { error: 'Los días de aviso no son válidos.' };
  let finDia = null, finMes = null;
  if (c.finDia != null && c.finDia !== '') {                                  // rango: último día
    finDia = entero(Number(c.finDia), 1, 31); finMes = entero(Number(c.finMes || mes), 1, 12);
    if (!finDia || !finMes || !existe(finDia, finMes, anio)) return { error: 'El último día del rango no es válido.' };
    if (finMes * 100 + finDia <= mes * 100 + dia) { finDia = null; finMes = null; }   // un rango de un solo día es un día común
  }
  return { campos: { dia, mes, anio, nombre, descripcion: limpiar(c.descripcion, LIM_DIA.descripcion), color, categoria, recordar, finDia, finMes } };
}

/* Carga las fechas iniciales UNA sola vez en la vida de la base (el INSERT de la marca solo cambia una fila la primera vez) */
export async function sembrarFechas(db) {
  const r = await db.prepare(`INSERT INTO meta (clave, valor) VALUES ('dias_semilla', '1') ON CONFLICT(clave) DO NOTHING`).run();
  if (!(r.meta && r.meta.changes === 1)) return;
  const ahora = Date.now();
  await db.batch(FECHAS_SEMILLA.map((d) => db.prepare(`INSERT INTO dias_importantes (id, dia, mes, anio, nombre, descripcion, color, categoria, recordar, fin_dia, fin_mes, grupo, estado, autor, creado, actualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`).bind(crypto.randomUUID(), d.dia, d.mes, d.recurrente ? null : d.anio, d.nombre, d.descripcion, d.color, d.categoria, d.recordar, d.finDia, d.finDia ? (d.finMes || d.mes) : null, ahora, ahora)));   // v3.0: un rango sin mes final termina en el mismo mes
}

/* Deja en el calendario un día por cada fecha del plan (ligados por "grupo" = id del plan). post = publicación de tipo plan tal como la devuelve aPost() */
export async function sincronizarPlan(db, post) {
  if (!post || post.tipo !== 'plan') return;
  const d = post.datos || {}, dias = Array.isArray(d.dias) ? d.dias.filter((x) => fechaValida(x.f)) : [];
  const ahora = Date.now(), ids = dias.map((x) => `plan:${post.id}:${x.f}`);
  const detalle = [d.hora ? `Hora: ${d.hora}` : '', d.lugar ? `Lugar: ${d.lugar}` : ''].filter(Boolean).join(' · ');
  const ops = dias.map((x) => {
    const [a, m, dd] = x.f.split('-').map(Number), est = ESTADO_TXT[x.e] || 'Posible';
    const texto = `Plan «${post.titulo || 'sin nombre'}» · ${est}` + (detalle ? `\n${detalle}` : '');
    /* los planes confirmados (día seguro) avisan el día anterior; el resto no avisa */
    return db.prepare(`INSERT INTO dias_importantes (id, dia, mes, anio, nombre, descripcion, color, categoria, recordar, fin_dia, fin_mes, grupo, estado, autor, creado, actualizado)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'plan', ?, NULL, NULL, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, descripcion = excluded.descripcion, color = excluded.color, recordar = excluded.recordar, estado = excluded.estado, actualizado = excluded.actualizado`)
      .bind(`plan:${post.id}:${x.f}`, dd, m, a, post.titulo || 'Plan', texto, COLOR_PLAN[post.autor] || 1, x.e === 'seguro' ? 1 : null, post.id, x.e || 'posible', post.autor, ahora, ahora);
  });
  const { results } = await db.prepare('SELECT id FROM dias_importantes WHERE grupo = ?').bind(post.id).all();
  const sobran = results.map((r) => r.id).filter((id) => !ids.includes(id));
  await db.batch([...sobran.map((id) => db.prepare('DELETE FROM dias_importantes WHERE id = ?').bind(id)), ...ops]);
}
export const borrarDiasDePlan = (db, postId) => db.prepare('DELETE FROM dias_importantes WHERE grupo = ?').bind(postId).run();

/* Una sola vez: crea los días de los planes que ya existían antes de esta versión */
export async function sincronizarPlanesExistentes(db, aPost) {
  const r = await db.prepare(`INSERT INTO meta (clave, valor) VALUES ('dias_planes', '1') ON CONFLICT(clave) DO NOTHING`).run();
  if (!(r.meta && r.meta.changes === 1)) return;
  const { results } = await db.prepare(`SELECT id, autor, tipo, titulo, texto, url, datos, creado, actualizado, 0 AS tiene_img FROM posts WHERE tipo = 'plan'`).all();
  for (const fila of results) await sincronizarPlan(db, aPost(fila));
}

/* ---------- Fechas para los recordatorios ---------- */
/* Días entre dos fechas "AAAA-MM-DD" (b - a) */
export const diasEntre = (a, b) => Math.round((Date.UTC(...b.split('-').map((n, i) => (i === 1 ? n - 1 : Number(n)))) - Date.UTC(...a.split('-').map((n, i) => (i === 1 ? n - 1 : Number(n))))) / 86400000);
/* Próxima vez (desde hoy, inclusive) en que cae un día: { fecha: 'AAAA-MM-DD' } o null si ya pasó (de una sola vez) */
export function proximaFecha(r, hoy = hoyAR()) {
  const pad = (n) => String(n).padStart(2, '0'), a0 = Number(hoy.slice(0, 4));
  if (r.anio != null) { const f = `${r.anio}-${pad(r.mes)}-${pad(r.dia)}`; return f >= hoy ? f : null; }
  for (const a of [a0, a0 + 1]) {
    if (!existe(r.dia, r.mes, a)) continue;                                   // 29 de febrero en un año común
    const f = `${a}-${pad(r.mes)}-${pad(r.dia)}`; if (f >= hoy) return f;
  }
  return null;
}
/* Texto del aviso según cuántos días faltan (hoy = 0) */
export function textoRecordatorio(nombre, faltan) {
  if (faltan <= 0) return `¡HOY es el gran día de ${nombre}!`;
  if (faltan === 1) return `¡MAÑANA es el gran día de ${nombre}!`;
  return `Faltan ${faltan} días para ${nombre}`;
}

/* Prepara el calendario una sola vez por instancia: fechas iniciales + días de los planes que ya existían */
let diasListos = null;
export function prepararDias(db) {
  if (!diasListos) diasListos = (async () => { await sembrarFechas(db); await sincronizarPlanesExistentes(db, aPost); })().catch((e) => { diasListos = null; throw e; });
  return diasListos;
}

/* ---------- Recordatorios ---------- */
/* Avisa a las dos personas de los días que están dentro de su ventana de aviso (recordar = N días antes … hoy).
   Cada aviso lleva una clave (día + fecha + días que faltan) para que no se repita aunque se ejecute varias veces el mismo día.
   Devuelve cuántos días generaron aviso. Los feriados no avisan salvo que tengan "recordar". */
export async function enviarRecordatorios(ctx, db, hoy = hoyAR()) {
  await prepararDias(db);
  const { results } = await db.prepare(`SELECT ${COLS_DIA} FROM dias_importantes WHERE recordar IS NOT NULL`).all();
  let n = 0;
  for (const r of results) {
    const f = proximaFecha(r, hoy); if (!f) continue;
    const faltan = diasEntre(hoy, f);
    if (faltan < 0 || faltan > r.recordar) continue;
    await notificarATodos(ctx, db, { tipo: 'fecha', post_id: r.grupo || null, texto: textoRecordatorio(r.nombre, faltan), clave: `dia:${r.id}:${f}:${faltan}`, ventana: 3 * 86400000 });
    n++;
  }
  return n;
}
