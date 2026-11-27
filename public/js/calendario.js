/* ============================================================================================================
   NUESTRO MURO — calendario.js (NUEVO v3.0)
   Qué hace: el "Calendario de Amor" dentro de Nuestro Muro.
     · Vista de calendario del mes con las fechas importantes en color (hasta 3 por día y "+N"), y las fechas de un mismo plan unidas por una línea.
     · Vista de lista "Fechas": por cercanía, con buscador, filtro por categoría e interruptor de feriados.
     · Ventana para agregar / editar una fecha (se repite todos los años o una sola vez, rango de días, categoría, color, aviso N días antes, descripción).
     · Ventana de detalle con cuenta regresiva y botón de compartir.
     · Ventanita flotante (mantener apretado un día del selector de días de un plan) con lo que hay ese día.
     · Las fechas de una sola vez que ya pasaron se ven "Expirado" (gris oscuro); las que se repiten cada año nunca expiran.
   Cómo se conecta: script.js llama a Calendario.iniciar(puente) y recibe un objeto con mostrar(), nuevo(), diasEn(), flotante()…
   Se carga ANTES que script.js. Los colores salen de las variables --dia-color-N del CSS (nunca se escribe un color a mano).
   ============================================================================================================ */
(function () {
  'use strict';

  const CATEGORIAS = [
    { id: 'pareja', nombre: 'Pareja', icono: 'favorite' },
    { id: 'cumpleanos', nombre: 'Cumpleaños', icono: 'cake' },
    { id: 'aniversario', nombre: 'Aniversario', icono: 'celebration' },
    { id: 'feriado', nombre: 'Feriado', icono: 'flag' },
    { id: 'otro', nombre: 'Otro', icono: 'event' },
    { id: 'plan', nombre: 'Plan', icono: 'event_available' },        // solo lo ponen solos los días ligados a un plan
  ];
  const CAT = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const AVISOS = [[null, 'Sin aviso'], [0, 'Solo el mismo día'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [7, '1 semana antes'], [15, '15 días antes'], [30, '1 mes antes']];
  const COLORES = 50;                                                    // --dia-color-1 … --dia-color-50
  const MAX_MARCAS = 3;                                                  // fechas que se dibujan dentro de un día del calendario (el resto: "+N")

  /* ---------- Fechas (todo como texto "AAAA-MM-DD"; sin zonas horarias) ---------- */
  const p2 = (n) => String(n).padStart(2, '0');
  const ISO = (a, m, d) => `${a}-${p2(m)}-${p2(d)}`;
  const existe = (a, m, d) => { const x = new Date(Date.UTC(a, m - 1, d)); return x.getUTCMonth() === m - 1 && x.getUTCDate() === d; };
  const aUTC = (f) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  const diasEntre = (a, b) => Math.round((aUTC(b) - aUTC(a)) / 86400000);
  const sumarDias = (f, n) => { const x = new Date(aUTC(f) + n * 86400000); return ISO(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };
  const diaSemana = (f) => new Date(aUTC(f)).getUTCDay();
  const etiqueta = (f, conAnio) => { const [a, m, d] = f.split('-').map(Number); return `${d} ${MESES_CORTOS[m - 1]}` + (conAnio ? ` ${a}` : ''); };
  const etiquetaLarga = (f) => { const [a, m, d] = f.split('-').map(Number); return `${DIAS_SEM[diaSemana(f)]} ${d} de ${MESES[m - 1].toLowerCase()} de ${a}`; };

  /* Primera vez (desde "hoy") en que ocurre una fecha: { ini, fin } o null. Las de una sola vez tienen su única fecha (aunque ya haya pasado) */
  function ocurrencia(d, hoy) {
    const a0 = Number(hoy.slice(0, 4)), conFin = (a) => (d.finDia ? ISO(a, d.finMes || d.mes, d.finDia) : ISO(a, d.mes, d.dia));
    if (d.anio != null) return { ini: ISO(d.anio, d.mes, d.dia), fin: conFin(d.anio) };
    for (const a of [a0, a0 + 1]) { if (!existe(a, d.mes, d.dia)) continue; const o = { ini: ISO(a, d.mes, d.dia), fin: conFin(a) }; if (o.fin >= hoy) return o; }
    return null;
  }
  /* ¿Ya pasó del todo? Solo las de una sola vez expiran; las que se repiten cada año nunca */
  const expirada = (d, hoy) => { if (d.anio == null) return false; const o = ocurrencia(d, hoy); return !!o && o.fin < hoy; };
  /* Texto de la cuenta regresiva */
  function cuenta(d, hoy) {
    const o = ocurrencia(d, hoy);
    if (!o) return '';
    if (o.fin < hoy) return 'Expirado';
    if (o.ini <= hoy) return o.ini === o.fin ? '¡Es hoy!' : '¡Está en curso!';
    const n = diasEntre(hoy, o.ini);
    return n === 1 ? 'Falta 1 día' : `Faltan ${n} días`;
  }
  /* Cuándo es, en palabras cortas: "14 feb", "21 dic 2026", "10 – 12 jul" */
  function cuando(d, hoy) {
    const o = ocurrencia(d, hoy); if (!o) return '';
    const conAnio = d.anio != null;
    return o.ini === o.fin ? etiqueta(o.ini, conAnio) : `${etiqueta(o.ini, conAnio)} – ${etiqueta(o.fin, conAnio)}`;
  }
  const colorDe = (d) => (d.categoria === 'feriado' ? 'var(--dia-color-feriado)' : `var(--dia-color-${d.color || 1})`);

  function iniciar(M) {
    const { h, $, icono, api, avisar, abrirModal, cerrarModal, intentarCerrar, confirmar, md, instantaneas } = M;
    let dias = [], cargado = false, cargando = false;
    let pestana = 'mes';                                     // 'mes' | 'lista'
    let mes = (() => { const n = M.hoy(); return { a: Number(n.slice(0, 4)), m: Number(n.slice(5, 7)) }; })();
    let busca = '', cat = '', feriados = true;
    try { feriados = localStorage.getItem('muro_feriados') !== '0'; } catch (e) { /* sin almacenamiento */ }
    const vista = $('vistaCalendario'), modal = $('modalDia'), info = $('modalDiaInfo');
    let editando = null, colorElegido = 1, catElegida = 'pareja', recurrente = true;

    /* ---------- Datos ---------- */
    async function cargar() {
      if (!M.yo() || cargando) return;
      cargando = true;
      try { const r = await api('/dias'); const firma = JSON.stringify(r.dias); if (!cargado || firma !== cargar._f) { cargar._f = firma; dias = r.dias; cargado = true; if (!vista.hidden) pintar(); if (!info.hidden) repintarInfo(); } }
      catch (e) { /* sin conexión: se reintenta */ }
      finally { cargando = false; }
    }
    setInterval(() => { if (document.visibilityState === 'visible' && M.yo() && (!vista.hidden || document.body.classList.contains('modal-abierto'))) cargar(); }, 12000);
    const visibles = () => dias.filter((d) => feriados || d.categoria !== 'feriado');

    /* Fechas (días importantes) que caen en un día "AAAA-MM-DD". excluirGrupo = no contar los días de ese plan (el que se está editando) */
    function diasEn(f, excluirGrupo, conFeriados = true) {
      const a = Number(f.slice(0, 4)), m = Number(f.slice(5, 7)), d = Number(f.slice(8, 10));
      return dias.filter((x) => {
        if (excluirGrupo && x.grupo === excluirGrupo) return false;
        if (!conFeriados && x.categoria === 'feriado') return false;
        const anio = x.anio != null ? x.anio : a; if (x.anio != null && x.anio !== a) return false;
        if (!existe(anio, x.mes, x.dia)) return false;
        const ini = ISO(anio, x.mes, x.dia), fin = x.finDia ? ISO(anio, x.finMes || x.mes, x.finDia) : ini;
        return f >= ini && f <= fin;
      });
    }

    /* ---------- Vista: cabecera + pestañas ---------- */
    const cuerpo = h('div', { class: 'calv__cuerpo' });
    const btnMes = h('button', { class: 'segmento__btn segmento__btn--activo', type: 'button', onclick: () => ponerPestana('mes') }, icono('calendar_month'), h('span', { text: 'Calendario' }));
    const btnLista = h('button', { class: 'segmento__btn', type: 'button', onclick: () => ponerPestana('lista') }, icono('format_list_bulleted'), h('span', { text: 'Fechas' }));
    vista.append(
      h('div', { class: 'tarjeta calv__cab' }, icono('calendar_month'), h('h2', { class: 'calv__titulo', text: 'Calendario de amor' }),
        h('p', { class: 'calv__sub', text: 'Las fechas que nos importan, con aviso antes de que lleguen. Los días de cada plan aparecen solos.' })),
      h('div', { class: 'segmento calv__pestanas', role: 'tablist' }, btnMes, btnLista), cuerpo);
    function ponerPestana(p) { pestana = p; animar = true; btnMes.classList.toggle('segmento__btn--activo', p === 'mes'); btnLista.classList.toggle('segmento__btn--activo', p === 'lista'); pintar(); }

    function pintar() {
      if (pestana === 'mes') pintarMes(); else pintarLista();
    }

    /* ---------- Calendario del mes ---------- */
    let obsAncho = null;
    /* [v3.1] Animaciones de entrada: solo cuando se abre el calendario, se cambia de mes o de pestaña (no cada vez que se repinta por un cambio de datos).
       dirMes = 1 (mes siguiente: entra desde la derecha) | -1 (anterior: desde la izquierda) | 0 (sin dirección). El CSS las apaga/acorta según Ajustes. */
    let animar = true, dirMes = 0;
    function pintarMes() {
      const entra = animar, dir = dirMes; animar = false; dirMes = 0;
      const hoy = M.hoy(), { a, m } = mes, total = new Date(a, m, 0).getDate();
      const nav = h('div', { class: 'calv__nav' },
        h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Mes anterior', onclick: () => cambiarMes(-1) }, icono('chevron_left')),
        h('strong', { class: 'calv__mes' + (entra ? ' calv__mes--entra' : ''), text: `${MESES[m - 1]} ${a}`, 'aria-live': 'polite' }),
        h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Mes siguiente', onclick: () => cambiarMes(1) }, icono('chevron_right')),
        h('button', { class: 'btn btn--fantasma calv__hoy', type: 'button', onclick: () => { mes = { a: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) }; animar = true; pintarMes(); } }, icono('today'), 'Hoy'),
        feriadosSwitch());
      const semana = h('div', { class: 'calv__semana', 'aria-hidden': 'true' }, ...LETRAS.map((l) => h('span', { text: l })));
      const celdas = [], vacias = (diaSemana(ISO(a, m, 1)) + 6) % 7;
      for (let i = 0; i < vacias; i++) celdas.push(h('span', { class: 'calv__vacio', 'aria-hidden': 'true' }));
      /* [v3.1] Primero se calcula qué hay en cada día y qué días van UNIDOS (grupos): los días de un mismo plan Y los días de una fecha con rango ("Semana de la Dulzura").
         grupos: clave → [{ f, color }] en orden de fecha. filaDe(n) = fila de la rejilla donde cae el día n (0 = primera semana). */
      const grupos = new Map(), porDia = [], filaDe = (n) => Math.floor((vacias + n - 1) / 7);
      for (let n = 1; n <= total; n++) {
        const f = ISO(a, m, n), lista = diasEn(f, null, feriados);
        const orden = [...lista].sort((x, y) => (x.categoria === 'feriado') - (y.categoria === 'feriado'));   // los feriados al final
        porDia.push({ n, f, orden });
        orden.forEach((d) => {
          const clave = d.grupo ? 'g:' + d.grupo : (d.finDia ? 'r:' + d.id : '');          // plan → por su grupo; rango → por la fecha misma
          if (clave) { if (!grupos.has(clave)) grupos.set(clave, []); grupos.get(clave).push({ f, n, color: colorDe(d) }); }
        });
      }
      /* Filas que necesitan un HUECO debajo: cuando el siguiente día unido cae en otra fila, se deja espacio justo encima de ese día para que la línea baje y apunte hacia él */
      const huecos = new Set();
      grupos.forEach((l) => { for (let i = 0; i < l.length - 1; i++) { const fa = filaDe(l[i].n), fb = filaDe(l[i + 1].n); if (fb > fa) huecos.add(fb - 1); } });
      let pos = vacias;                                                          // cuántas celdas de la rejilla van puestas (para saber cuándo termina una fila)
      porDia.forEach(({ n, f, orden }) => {
        const c = h('button', { class: 'calv__dia' + (f === hoy ? ' calv__dia--hoy' : '') + (orden.length ? ' calv__dia--con' : '') + (orden.length && orden.every((d) => expirada(d, hoy)) ? ' calv__dia--exp' : ''), type: 'button', 'data-f': f, 'data-fila': String(filaDe(n)),
          'aria-label': `${etiquetaLarga(f)}${orden.length ? ': ' + orden.map((d) => d.nombre).join(', ') : ''}`, onclick: () => abrirDia(f) },
          h('span', { class: 'calv__num', text: String(n) }),
          orden.length ? h('span', { class: 'calv__marcas' }, ...orden.slice(0, MAX_MARCAS).map((d) => {
            const mk = h('span', { class: 'calv__marca' + (expirada(d, hoy) ? ' calv__marca--exp' : ''), 'aria-hidden': 'true' }, h('span', { class: 'calv__marca-txt', text: d.nombre }));
            mk.style.setProperty('--c', colorDe(d)); return mk;
          }), orden.length > MAX_MARCAS ? h('span', { class: 'calv__mas', text: `+${orden.length - MAX_MARCAS}` }) : null) : null);
        if (orden.length) c.style.setProperty('--c', colorDe(orden[0]));
        c.style.setProperty('--i', String(n - 1));                               // v3.1: posición para la entrada escalonada (animación)
        celdas.push(c); pos++;
        if (pos % 7 === 0 && huecos.has(filaDe(n))) celdas.push(h('span', { class: 'calv__hueco', 'data-fila': String(filaDe(n)), 'aria-hidden': 'true' }));   // espacio para la línea que baja
      });
      const rejilla = h('div', { class: 'calv__dias' + (entra ? ' calv__dias--entra' + (dir > 0 ? ' calv__dias--sig' : dir < 0 ? ' calv__dias--ant' : '') : '') }, ...celdas);
      const lineas = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); lineas.setAttribute('class', 'calv__lineas' + (entra ? ' calv__lineas--anim' : '')); lineas.setAttribute('aria-hidden', 'true');
      if (entra) setTimeout(() => lineas.classList.remove('calv__lineas--anim'), 1800);   // las líneas se dibujan con animación solo la primera vez (no al redibujar por cambio de tamaño)
      const caja = h('div', { class: 'calv__rejilla' }, rejilla, lineas);
      const leyenda = h('p', { class: 'campo__ayuda calv__ayuda' }, icono('link'), 'Los días que van unidos (los de un plan y las fechas de varios días) se ven con una línea del mismo color; si el siguiente cae en otra semana, una flecha baja hasta él. Toca un día para ver todo lo que tiene.');
      cuerpo.replaceChildren(h('div', { class: 'tarjeta calv__tarjeta' }, nav, semana, caja, leyenda));
      const dibujar = () => dibujarLineas(lineas, caja, grupos);
      requestAnimationFrame(dibujar);
      if (obsAncho) obsAncho.disconnect();
      if (typeof ResizeObserver !== 'undefined') { obsAncho = new ResizeObserver(dibujar); obsAncho.observe(caja); }
    }
    function cambiarMes(n) { const d = new Date(mes.a, mes.m - 1 + n, 1); mes = { a: d.getFullYear(), m: d.getMonth() + 1 }; animar = true; dirMes = n; pintarMes(); }
    /* [v3.1] Une con una línea los días que van juntos (planes y rangos), de uno al siguiente y en el color de esos días.
       - Mismo renglón: línea punteada entre los puntos de cada día.
       - Siguiente día en otro renglón: la línea baja al hueco que se dejó, corre hasta la columna del día y baja con una flecha que apunta a él (codo con flecha).
       Cada grupo usa un "carril" (alto distinto) para que dos grupos en los mismos días no se tapen. */
    function dibujarLineas(svg, caja, grupos) {
      const r0 = caja.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${r0.width} ${r0.height}`); svg.replaceChildren();
      const NS = 'http://www.w3.org/2000/svg', carriles = new Map();
      const el = (tag, at) => { const e = document.createElementNS(NS, tag); Object.keys(at).forEach((k) => e.setAttribute(k, at[k])); return e; };
      grupos.forEach((lista) => {
        if (lista.length < 2) return;
        const carril = Math.min(2, Math.max(...lista.map((x) => carriles.get(x.f) || 0))); lista.forEach((x) => carriles.set(x.f, carril + 1));
        const pts = lista.slice().sort((x, y) => (x.f < y.f ? -1 : 1)).map((x) => {
          const e = caja.querySelector(`[data-f="${x.f}"]`); if (!e) return null; const r = e.getBoundingClientRect();
          return { x: r.left - r0.left + r.width / 2, y: r.top - r0.top + r.height - 7 - carril * 6, top: r.top - r0.top, fila: Number(e.dataset.fila), color: x.color };
        }).filter(Boolean);
        for (let i = 0; i < pts.length - 1; i++) {
          const A = pts[i], B = pts[i + 1], css = { class: 'calv__linea' };
          let l;
          if (B.fila === A.fila) l = el('line', { ...css, x1: A.x, y1: A.y, x2: B.x, y2: B.y });
          else {
            const g = caja.querySelector(`.calv__hueco[data-fila="${B.fila - 1}"]`), gr = g ? g.getBoundingClientRect() : null;
            const yg = gr ? gr.top - r0.top + 5 + carril * 4 : B.top - 10, punta = B.top + 1;
            l = el('path', { ...css, d: `M${A.x} ${A.y} V${yg} H${B.x} V${punta - 5}` });
            const f = el('path', { class: 'calv__flecha', d: `M${B.x - 5} ${punta - 6} L${B.x} ${punta} L${B.x + 5} ${punta - 6}` }); f.style.setProperty('--c', B.color); f.style.setProperty('--i', String(i)); svg.append(f);
          }
          l.style.setProperty('--c', A.color); l.style.setProperty('--i', String(i)); svg.append(l);
        }
        pts.forEach((p, i) => { const c = el('circle', { cx: p.x, cy: p.y, r: 3.5, class: 'calv__nodo' }); c.style.setProperty('--c', p.color); c.style.setProperty('--i', String(i)); svg.append(c); });
      });
    }
    /* Interruptor "Feriados" (se ve en el calendario y en la lista) */
    function feriadosSwitch() {
      const b = h('button', { class: 'calv__interruptor', type: 'button', role: 'switch', 'aria-checked': String(feriados), onclick: () => {
        feriados = !feriados; try { localStorage.setItem('muro_feriados', feriados ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
        pintar();
      } }, h('span', { class: 'calv__interruptor-riel' }, h('span', { class: 'calv__interruptor-bola' })), h('span', { text: 'Feriados' }));
      return b;
    }

    /* ---------- Lista "Fechas" ---------- */
    function pintarLista() {
      let primera = animar; animar = false;                    // v3.1: las filas entran escalonadas solo al abrir la lista (no al escribir en el buscador)
      const hoy = M.hoy();
      const q = M.normalizar(busca);
      let lista = visibles().filter((d) => (!cat || d.categoria === cat) && (!q || M.normalizar(d.nombre + ' ' + d.descripcion).includes(q)));
      /* Orden por cercanía: primero lo que está en curso y lo que viene (de la más cercana a la más lejana); al final lo expirado (lo más reciente primero) */
      const clave = (d) => { const o = ocurrencia(d, hoy); if (!o) return [2, 0]; return o.fin < hoy ? [1, -aUTC(o.fin)] : [0, aUTC(o.ini <= hoy ? hoy : o.ini)]; };
      lista = lista.map((d) => ({ d, k: clave(d) })).sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.d.nombre.localeCompare(y.d.nombre, 'es')).map((x) => x.d);
      const campoBusca = h('input', { class: 'campo__entrada', type: 'search', placeholder: 'Buscar una fecha…', 'aria-label': 'Buscar una fecha', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', value: busca });
      campoBusca.addEventListener('input', () => { busca = campoBusca.value; repintarFilas(); });
      const chips = [h('button', { class: 'chip' + (!cat ? ' chip--activo' : ''), type: 'button', onclick: () => { cat = ''; pintarLista(); } }, icono('apps'), h('span', { text: 'Todas' })),
        ...CATEGORIAS.map((c) => h('button', { class: 'chip' + (cat === c.id ? ' chip--activo' : ''), type: 'button', onclick: () => { cat = cat === c.id ? '' : c.id; pintarLista(); } }, icono(c.icono), h('span', { text: c.nombre })))];
      const filas = h('div', { class: 'calv__lista' });
      const cuentaTxt = h('span', { class: 'contador-lista', 'aria-live': 'polite' });
      function repintarFilas() {
        const qq = M.normalizar(busca);
        const l = lista.filter((d) => !qq || M.normalizar(d.nombre + ' ' + d.descripcion).includes(qq));
        cuentaTxt.textContent = `${l.length} ${l.length === 1 ? 'fecha' : 'fechas'}`;
        filas.classList.toggle('calv__lista--entra', primera); primera = false;
        filas.replaceChildren(...(l.length ? l.map((d, i) => fila(d, hoy, i)) : [h('div', { class: 'vacio' }, icono('event_busy'), h('p', { text: dias.length ? 'No hay fechas con ese filtro.' : 'Todavía no hay fechas. ¡Toca el botón + y agrega la primera!' }))]));
      }
      cuerpo.replaceChildren(h('div', { class: 'tarjeta calv__tarjeta' },
        h('label', { class: 'buscador' }, icono('search'), campoBusca), h('div', { class: 'calv__filtros' }, h('nav', { class: 'ayuda-indice filtros__tipos' }, ...chips), feriadosSwitch()),
        h('div', { class: 'ayuda-acciones' }, cuentaTxt), filas));
      repintarFilas();
    }
    function fila(d, hoy, i = 0) {
      const exp = expirada(d, hoy), cu = cuenta(d, hoy);
      const b = h('button', { class: 'calv__fila' + (exp ? ' calv__fila--exp' : ''), type: 'button', onclick: () => abrirFecha(d.id) },
        h('span', { class: 'calv__fila-icono' }, icono((CAT[d.categoria] || CAT.otro).icono, true)),
        h('span', { class: 'calv__fila-texto' }, h('span', { class: 'calv__fila-nombre', text: d.nombre }),
          h('span', { class: 'calv__fila-cuando' }, cuando(d, hoy), d.recurrente ? ' · cada año' : '', d.grupo ? ' · de un plan' : '')),
        h('span', { class: 'calv__fila-cuenta' + (cu.startsWith('¡') ? ' calv__fila-cuenta--ya' : ''), text: cu }));
      b.style.setProperty('--c', colorDe(d)); b.style.setProperty('--i', String(Math.min(i, 14)));   // v3.1: posición para la entrada escalonada
      return b;
    }

    /* ---------- Detalle ---------- */
    let infoCtx = null;                                       // { f } (todo lo de un día) o { id } (una fecha)
    let animarInfo = false;                                   // v3.1: las tarjetas del detalle entran escalonadas solo al abrirlo (no en cada actualización)
    function abrirDia(f) { infoCtx = { f }; animarInfo = true; repintarInfo(); abrirModal(info); }
    function abrirFecha(id) { infoCtx = { id }; animarInfo = true; repintarInfo(); abrirModal(info); }
    function repintarInfo() {
      if (!infoCtx) return;
      const hoy = M.hoy();
      const lista = infoCtx.id ? dias.filter((d) => d.id === infoCtx.id) : diasEn(infoCtx.f, null, true);
      if (infoCtx.id && !lista.length) { cerrarModal(info); return; }
      $('infoTitulo').textContent = infoCtx.f ? etiquetaLarga(infoCtx.f) : (lista[0] ? lista[0].nombre : 'Fecha');
      const cuerpoInfo = $('infoCuerpo');
      const ent = animarInfo; animarInfo = false;
      const tarjetas = lista.map((d, i) => { const t = tarjeta(d, hoy); if (ent) { t.classList.add('calv__tarjeta-dia--entra'); t.style.setProperty('--i', String(Math.min(i, 8))); } return t; });   // v3.1
      const pie = infoCtx.f ? [h('button', { class: 'btn btn--fantasma btn--bloque', type: 'button', onclick: () => { cerrarModal(info); nuevo(infoCtx.f); } }, icono('add'), 'Agregar una fecha este día')] : [];
      cuerpoInfo.replaceChildren(...(tarjetas.length ? tarjetas : [h('div', { class: 'vacio' }, icono('event_available'), h('p', { text: 'No hay fechas importantes este día.' }))]), ...pie);
    }
    function tarjeta(d, hoy) {
      const exp = expirada(d, hoy), cu = cuenta(d, hoy), cat1 = CAT[d.categoria] || CAT.otro;
      const aviso = d.recordar == null ? 'Sin aviso' : d.recordar === 0 ? 'Avisa el mismo día' : `Avisa desde ${d.recordar} ${d.recordar === 1 ? 'día' : 'días'} antes`;
      const acciones = d.grupo
        ? [h('button', { class: 'btn btn--fantasma', type: 'button', onclick: () => { cerrarModal(info); M.irAlPlan(d.grupo); } }, icono('open_in_new'), 'Ir al plan')]
        : [h('button', { class: 'btn btn--fantasma', type: 'button', onclick: () => editar(d) }, icono('edit'), 'Editar')];
      acciones.unshift(h('button', { class: 'btn btn--fantasma', type: 'button', onclick: () => compartir(d, hoy) }, icono('share'), 'Compartir'));
      const t = h('article', { class: 'calv__tarjeta-dia' + (exp ? ' calv__tarjeta-dia--exp' : '') },
        h('div', { class: 'calv__tarjeta-cab' }, h('span', { class: 'calv__tarjeta-icono' }, icono(cat1.icono, true)),
          h('div', { class: 'calv__tarjeta-tit' }, h('h3', { text: d.nombre }), h('span', { class: 'calv__tarjeta-cuando', text: `${cuando(d, hoy)} · ${d.recurrente ? 'se repite cada año' : 'una sola vez'}` })),
          h('span', { class: 'calv__cuenta' + (cu.startsWith('¡') ? ' calv__cuenta--ya' : ''), text: cu })),
        h('div', { class: 'calv__tarjeta-datos' },
          h('span', { class: 'calv__dato' }, icono(cat1.icono), cat1.nombre),
          h('span', { class: 'calv__dato' }, icono('notifications_active'), aviso),
          d.grupo ? h('span', { class: 'calv__dato' }, icono('link'), 'Ligado a un plan') : null),
        d.descripcion ? md(d.descripcion, 'calv__desc') : null,
        h('div', { class: 'calv__tarjeta-acciones' }, ...acciones));
      t.style.setProperty('--c', colorDe(d));
      return t;
    }
    async function compartir(d, hoy) {
      const texto = `${d.nombre} — ${cuando(d, hoy)}${d.recurrente ? ' (cada año)' : ''}\n${cuenta(d, hoy)}${d.descripcion ? '\n' + d.descripcion : ''}`;
      try {
        if (navigator.share) { await navigator.share({ title: d.nombre, text: texto }); return; }
        await navigator.clipboard.writeText(texto); avisar('Texto copiado para compartir.');
      } catch (e) { if (e && e.name === 'AbortError') return; avisar('No se pudo compartir.', 'error'); }
    }
    info.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarModal(info)));
    info.addEventListener('mousedown', (e) => { if (e.target === info) cerrarModal(info); });

    /* ---------- Agregar / editar ---------- */
    const f = { nombre: $('diaNombre'), fecha: $('diaFecha'), rango: $('diaRango'), fin: $('diaFin'), aviso: $('diaAviso'), desc: $('diaDescripcion'), error: $('errorDia'), borrar: $('btnBorrarDia'), guardar: $('btnGuardarDia') };
    /* Colores (50) */
    $('diaColores').replaceChildren(...Array.from({ length: COLORES }, (_, i) => {
      const n = i + 1, b = h('button', { class: 'calv__color', type: 'button', 'aria-label': `Color ${n}`, 'aria-pressed': 'false', 'data-c': String(n), onclick: () => { colorElegido = n; marcarColor(); } });
      b.style.setProperty('--i', String(i));   // v3.1: posición para la entrada escalonada de los círculos de color
      b.style.setProperty('--c', `var(--dia-color-${n})`); return b;
    }));
    const marcarColor = () => $('diaColores').querySelectorAll('.calv__color').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.c) === colorElegido)));
    /* Categorías (las que se pueden elegir) */
    $('diaCategorias').replaceChildren(...CATEGORIAS.filter((c) => c.id !== 'plan').map((c) => h('button', { class: 'chip', type: 'button', 'data-cat': c.id, onclick: () => { catElegida = c.id; marcarCat(); } }, icono(c.icono), h('span', { text: c.nombre }))));
    const marcarCat = () => { $('diaCategorias').querySelectorAll('.chip').forEach((b) => b.classList.toggle('chip--activo', b.dataset.cat === catElegida)); $('diaColoresCaja').hidden = catElegida === 'feriado'; };   // los feriados siempre son grises
    /* Se repite / una sola vez */
    const marcarRepite = () => { $('diaRepite').querySelectorAll('.segmento__btn').forEach((b) => b.classList.toggle('segmento__btn--activo', (b.dataset.rep === 'si') === recurrente)); $('diaAyudaFecha').textContent = recurrente ? 'Se repite todos los años (el año de la fecha no importa).' : 'Solo ocurre en esta fecha; después queda como "Expirado".'; };
    $('diaRepite').querySelectorAll('.segmento__btn').forEach((b) => b.addEventListener('click', () => { recurrente = b.dataset.rep === 'si'; marcarRepite(); }));
    f.rango.addEventListener('change', () => { $('diaCajaFin').hidden = !f.rango.checked; if (f.rango.checked && !f.fin.value && f.fecha.value) f.fin.value = sumarDias(f.fecha.value, 1); });
    f.aviso.replaceChildren(...AVISOS.map(([v, t]) => h('option', { value: v == null ? '' : String(v), text: t })));

    /* Abre la ventana: nueva (fecha opcional) o editando una */
    function abrirForm(d, fechaInicial) {
      editando = d || null;
      $('diaTitulo').textContent = d ? 'Editar fecha' : 'Nueva fecha';
      $('textoGuardarDia').textContent = d ? 'Guardar' : 'Agregar';
      f.borrar.hidden = !d; f.error.textContent = '';
      const hoy = M.hoy();
      if (d) {
        const o = ocurrencia(d, hoy) || { ini: ISO(Number(hoy.slice(0, 4)), d.mes, d.dia), fin: ISO(Number(hoy.slice(0, 4)), d.finMes || d.mes, d.finDia || d.dia) };
        recurrente = d.anio == null; f.nombre.value = d.nombre; f.fecha.value = o.ini; f.rango.checked = !!d.finDia; f.fin.value = d.finDia ? o.fin : '';
        catElegida = d.categoria === 'plan' ? 'otro' : d.categoria; colorElegido = d.color || 1; f.aviso.value = d.recordar == null ? '' : String(d.recordar); f.desc.value = d.descripcion || '';
      } else {
        recurrente = true; f.nombre.value = ''; f.fecha.value = fechaInicial || hoy; f.rango.checked = false; f.fin.value = '';
        catElegida = 'pareja'; colorElegido = M.yo() === 'xB' ? 1 : 11; f.aviso.value = '3'; f.desc.value = '';
      }
      $('diaCajaFin').hidden = !f.rango.checked;
      marcarRepite(); marcarCat(); marcarColor();
      const col = $('diaColores'); col.classList.add('calv__colores--entra'); setTimeout(() => col.classList.remove('calv__colores--entra'), 1200);   // v3.1: los círculos de color aparecen en cascada solo al abrir el formulario
      abrirModal(modal);
      setTimeout(() => f.nombre.focus(), 80);
    }
    const nuevo = (fecha) => abrirForm(null, fecha);
    const editar = (d) => { cerrarModal(info); setTimeout(() => abrirForm(d), 180); };
    instantaneas.modalDia = () => JSON.stringify([f.nombre.value, f.fecha.value, f.rango.checked, f.fin.value, f.aviso.value, f.desc.value, recurrente, catElegida, colorElegido]);
    modal.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => intentarCerrar(modal)));
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) intentarCerrar(modal); });

    $('formDia').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = f.nombre.value.trim(); f.error.textContent = '';
      if (!nombre) { f.error.textContent = 'Ponle un nombre a la fecha.'; f.nombre.focus(); return; }
      if (!f.fecha.value) { f.error.textContent = 'Elige la fecha.'; return; }
      const [a, m, d] = f.fecha.value.split('-').map(Number);
      const cuerpoDia = { dia: d, mes: m, anio: recurrente ? null : a, nombre, descripcion: f.desc.value.trim(), color: colorElegido, categoria: catElegida, recordar: f.aviso.value === '' ? null : Number(f.aviso.value) };
      if (f.rango.checked) {
        if (!f.fin.value) { f.error.textContent = 'Elige el último día del rango.'; return; }
        const [fa, fm, fd] = f.fin.value.split('-').map(Number);
        if (f.fin.value <= f.fecha.value || fa !== a) { f.error.textContent = 'El rango tiene que terminar después de empezar y dentro del mismo año.'; return; }
        cuerpoDia.finDia = fd; cuerpoDia.finMes = fm;
      }
      f.guardar.disabled = true;
      try {
        const r = await api(editando ? `/dias/${editando.id}` : '/dias', { metodo: editando ? 'PUT' : 'POST', cuerpo: cuerpoDia });
        dias = editando ? dias.map((x) => (x.id === r.dia.id ? r.dia : x)) : [...dias, r.dia];
        cargar._f = JSON.stringify(dias);
        cerrarModal(modal);                                                  // lo guardado ya es lo que hay: al cerrar no pregunta por cambios
        if (!vista.hidden) { const o = ocurrencia(r.dia, M.hoy()); if (pestana === 'mes' && o) mes = { a: Number(o.ini.slice(0, 4)), m: Number(o.ini.slice(5, 7)) }; pintar(); }
        avisar(editando ? 'Fecha guardada.' : 'Fecha agregada.');
      } catch (err) { f.error.textContent = err.message; }
      finally { f.guardar.disabled = false; }
    });
    f.borrar.addEventListener('click', async () => {
      if (!editando) return;
      if (!(await confirmar({ titulo: '¿Borrar esta fecha?', texto: `«${editando.nombre}» se va a borrar del calendario para los dos.`, boton: 'Borrar' }))) return;
      const id = editando.id;
      try { await api(`/dias/${id}`, { metodo: 'DELETE' }); dias = dias.filter((x) => x.id !== id); cargar._f = JSON.stringify(dias); basesLimpiar(); cerrarModal(modal); if (!vista.hidden) pintar(); avisar('Fecha borrada.'); }
      catch (err) { f.error.textContent = err.message; }
    });
    /* Tras borrar, lo escrito ya no importa: se iguala la foto del formulario para que al cerrar no pregunte */
    const basesLimpiar = () => M.marcarLimpio('modalDia');

    /* ---------- Ventanita flotante (mantener apretado un día del selector de plan) ---------- */
    let flota = null;
    function cerrarFlota() { if (flota) { flota.remove(); flota = null; } document.removeEventListener('pointerdown', fueraFlota, true); document.removeEventListener('keydown', teclaFlota, true); window.removeEventListener('scroll', cerrarFlota, true); }
    const fueraFlota = (e) => { if (flota && !flota.contains(e.target)) cerrarFlota(); };
    const teclaFlota = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrarFlota(); } };
    function flotante(fecha, ancla) {
      cerrarFlota();
      const hoy = M.hoy(), lista = diasEn(fecha, null, true);
      flota = h('div', { class: 'dia-flota', role: 'dialog', 'aria-label': `Fechas del ${etiquetaLarga(fecha)}` },
        h('strong', { class: 'dia-flota__fecha', text: etiquetaLarga(fecha) }),
        ...(lista.length ? lista.map((d) => { const x = h('div', { class: 'dia-flota__fila' + (expirada(d, hoy) ? ' dia-flota__fila--exp' : '') }, icono((CAT[d.categoria] || CAT.otro).icono, true),
          h('span', { class: 'dia-flota__txt' }, h('span', { class: 'dia-flota__nombre', text: d.nombre }), h('span', { class: 'dia-flota__cuenta', text: `${cuenta(d, hoy)} · ${(CAT[d.categoria] || CAT.otro).nombre}${d.recurrente ? ' · cada año' : ''}` }))); x.style.setProperty('--c', colorDe(d)); return x; })
          : [h('span', { class: 'dia-flota__vacio', text: 'No hay fechas importantes este día.' })]));
      document.body.append(flota);
      const r = ancla.getBoundingClientRect(), w = flota.offsetWidth, alto = flota.offsetHeight;
      let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      let y = r.bottom + 8; if (y + alto > window.innerHeight - 8) y = Math.max(8, r.top - alto - 8);
      flota.style.left = x + 'px'; flota.style.top = y + 'px';
      setTimeout(() => { document.addEventListener('pointerdown', fueraFlota, true); document.addEventListener('keydown', teclaFlota, true); window.addEventListener('scroll', cerrarFlota, true); }, 0);
    }

    /* ---------- Mostrar / ocultar la vista ---------- */
    return {
      mostrar() { animar = true; pintar(); cargar(); },   // v3.1: al abrir el calendario entra con animación
      cargar, nuevo, flotante, cerrarFlota, diasEn,
      color: colorDe,
      /* Al cambiar de persona se descarta todo y se vuelve a pedir */
      reiniciar() { dias = []; cargado = false; cargar._f = ''; busca = ''; cat = ''; pestana = 'mes'; btnMes.classList.add('segmento__btn--activo'); btnLista.classList.remove('segmento__btn--activo'); cerrarFlota(); },
    };
  }

  window.Calendario = { iniciar, CATEGORIAS };
})();
