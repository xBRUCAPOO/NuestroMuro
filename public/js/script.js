/* ============================================================
   script.js — Nuestro Muro
   Qué hace: 1) tema claro/oscuro con fundido, 2) iconos "cargando" mientras llega la fuente de iconos, 3) acceso (switch M / xB +
   contraseña, solo la primera vez), 4) el muro: carga las publicaciones del servidor, las pinta como tarjetas, filtra/busca y se
   actualiza solo cada pocos segundos, 5) publicar y editar (nota, lista, encuesta, foto, link, video), 6) corazones, votos, tildar
   listas y borrar, 7) visor de fotos, avisos, ondas al tocar, 8) PWA (instalar + service worker).
   Para qué sirve: toda la lógica del navegador. Los datos viven en Cloudflare D1 y se piden a /api/* (carpeta functions/).
   IMPORTANTE: se carga en el <head> (antes de pintar) para aplicar el tema sin parpadeo; por eso el resto espera a DOMContentLoaded.
   Seguridad: todo el contenido que escriben las personas se pinta con textContent (nunca como HTML).
   ============================================================ */

/* ---------- 1) Tema claro / oscuro ---------- */
/* Qué hace: guarda la preferencia (localStorage, con respaldo en memoria si el navegador la bloquea), la aplica como
   data-tema="claro|oscuro" en <html>, pinta el color de la barra del navegador y avisa a quien escuche el cambio.
   Para qué sirve: que cada persona elija cómo ver la página con el botón de la barra superior. El CSS reacciona al atributo. */
const Tema = (() => {
  'use strict';
  const CLAVE = 'muro_tema';                                    // 'oscuro' (predeterminado) | 'claro'
  const VALIDOS = ['oscuro', 'claro'];
  const oyentes = [];                                           // funciones a llamar cuando el tema ya se aplicó

  function leer() { try { const v = localStorage.getItem(CLAVE); return VALIDOS.includes(v) ? v : 'oscuro'; } catch (e) { return 'oscuro'; } }
  let actual = leer();                                          // copia en memoria: el botón sigue funcionando aunque no haya almacenamiento

  /* Aplica el tema al documento y pinta la barra del navegador (theme-color) con la variable --color-tarjeta del CSS */
  function aplicar() {
    document.documentElement.dataset.tema = actual;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta); }
    meta.content = getComputedStyle(document.documentElement).getPropertyValue('--color-tarjeta').trim();
    oyentes.forEach((fn) => fn(actual));
  }

  /* Cambia entre oscuro y claro con fundido cruzado (View Transitions) o, si no hay soporte, fundiendo los colores */
  function alternar() {
    actual = actual === 'oscuro' ? 'claro' : 'oscuro';
    try { localStorage.setItem(CLAVE, actual); } catch (e) { /* sin almacenamiento: queda solo en memoria */ }
    if (document.startViewTransition) { document.startViewTransition(aplicar); return; }
    const raiz = document.documentElement;
    raiz.classList.add('tema-cambiando'); aplicar();
    setTimeout(() => raiz.classList.remove('tema-cambiando'), 400);
  }

  aplicar();
  return { alternar, alCambiar: (fn) => { oyentes.push(fn); fn(actual); }, repintarBarra: aplicar };
})();

/* ---------- 2) Iconos cargando ---------- */
/* Qué hace: mientras la fuente de iconos (Material Symbols, fonts.google.com/icons) no terminó de descargarse, el navegador
   escribiría el NOMBRE de cada icono como texto ("search", "favorite"…). Aquí se pone la clase "iconos-cargando" en <html> y el CSS
   muestra en su lugar una cajita con latido; apenas la fuente está lista la clase se quita. Si en 5 segundos no llegó (sin conexión), se rinde.
   Para qué sirve: que la página se vea prolija mientras carga. */
(() => {
  'use strict';
  const raiz = document.documentElement, LIMITE_MS = 5000, FAMILIA = 'Material Symbols Rounded';
  if (!document.fonts || !document.fonts[Symbol.iterator]) return;
  raiz.classList.add('iconos-cargando');
  const desde = Date.now();
  const caras = () => [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === FAMILIA);
  const revisar = () => {
    const c = caras();
    c.forEach((f) => { if (f.status === 'unloaded') f.load().catch(() => { /* si falla, pasa a "error" y se deja de esperar */ }); });
    const lista = c.length > 0 && c.every((f) => f.status === 'loaded' || f.status === 'error');
    if (lista || Date.now() - desde > LIMITE_MS) raiz.classList.remove('iconos-cargando'); else setTimeout(revisar, 80);
  };
  revisar();
})();

/* ---------- 3) Aplicación (cuando el HTML ya está listo) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== Utilidades ===== */
  const $ = (id) => document.getElementById(id);
  /* Crea un elemento: h('div', { class: 'x', text: 'hola', onclick: fn }, hijo1, hijo2). Usa textContent: nunca interpreta HTML */
  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat()) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(c)); }
    return el;
  }
  /* Icono Material Symbols (nombre de fonts.google.com/icons); lleno = versión rellena */
  const icono = (nombre, lleno) => h('span', { class: 'material-symbols-rounded' + (lleno ? ' lleno' : ''), text: nombre, 'aria-hidden': 'true' });
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();   // minúsculas y sin tildes
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Aviso breve abajo de la pantalla */
  function avisar(texto, tipo) {
    const t = h('div', { class: 'toast' + (tipo ? ` toast--${tipo}` : ''), text: texto });
    $('toasts').append(t);
    setTimeout(() => t.remove(), 3600);
  }

  /* ===== API ===== */
  let yo = null;                         // "M" | "xB" cuando hay sesión
  /* Llama a /api/…; devuelve el JSON. Si el servidor responde 401 (sin sesión) abre la ventana de acceso. */
  async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
    const res = await fetch('/api' + ruta, {
      method: metodo, credentials: 'same-origin',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let datos = {};
    try { datos = await res.json(); } catch (e) { /* respuesta sin cuerpo */ }
    if (res.status === 401 && ruta !== '/login') { yo = null; mostrarAcceso(); }
    if (!res.ok) throw Object.assign(new Error(datos.error || `Error ${res.status}`), { status: res.status });
    return datos;
  }

  /* ===== Ventanas (abrir / cerrar con animación) ===== */
  function abrirModal(el) {
    el.classList.remove('saliendo'); el.hidden = false;
    document.body.classList.add('modal-abierto');
  }
  function cerrarModal(el) {
    if (el.hidden) return;
    el.classList.add('saliendo');
    setTimeout(() => { el.hidden = true; el.classList.remove('saliendo'); if (!document.querySelector('.modal-fondo:not([hidden])')) document.body.classList.remove('modal-abierto'); }, 160);
  }
  /* Confirmación propia (reemplaza a confirm()): devuelve una promesa true/false */
  function confirmar({ titulo, texto, boton = 'Aceptar' }) {
    return new Promise((resolver) => {
      $('confTitulo').textContent = titulo; $('confTexto').textContent = texto; $('confSi').textContent = boton;
      const fin = (v) => { $('confSi').onclick = $('confNo').onclick = null; cerrarModal($('modalConfirmar')); resolver(v); };
      $('confSi').onclick = () => fin(true); $('confNo').onclick = () => fin(false);
      abrirModal($('modalConfirmar'));
    });
  }

  /* ===== Botón de tema ===== */
  /* Qué hace: alterna claro/oscuro y cambia su icono (sol = "pasar a claro", luna = "pasar a oscuro") y su etiqueta accesible. */
  Tema.alCambiar((t) => {
    const claro = t === 'claro', b = $('btnTema');
    b.querySelector('.material-symbols-rounded').textContent = claro ? 'dark_mode' : 'light_mode';
    b.setAttribute('aria-label', claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  });
  $('btnTema').addEventListener('click', Tema.alternar);

  /* ============================================================
     ACCESO — switch M / xB + contraseña (solo la primera vez: después la cookie de sesión lo evita)
     ============================================================ */
  const formAcceso = $('formAcceso'), switchBoton = $('switchBoton');
  /* Elige la identidad: el contorno de la ventana pasa a azul oscuro (M) o rojo (xB) (lo hace el CSS con data-quien) */
  function elegirQuien(quien) {
    formAcceso.dataset.quien = quien;
    switchBoton.setAttribute('aria-checked', String(quien === 'xB'));
    $('errorAcceso').textContent = '';
  }
  switchBoton.addEventListener('click', () => elegirQuien(formAcceso.dataset.quien === 'M' ? 'xB' : 'M'));
  switchBoton.addEventListener('keydown', (e) => {                          // flechas: izquierda = M, derecha = xB
    if (e.key === 'ArrowLeft') { e.preventDefault(); elegirQuien('M'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); elegirQuien('xB'); }
  });
  document.querySelectorAll('.switch-id__etiqueta').forEach((et) => et.addEventListener('click', () => elegirQuien(et.dataset.lado)));
  $('verClave').addEventListener('click', () => {                           // mostrar / ocultar contraseña
    const campo = $('claveAcceso'), ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    $('verClave').querySelector('.material-symbols-rounded').textContent = ver ? 'visibility_off' : 'visibility';
    $('verClave').setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  /* Muestra la ventana de acceso y bloquea el muro de atrás */
  function mostrarAcceso() {
    $('app').inert = true; $('btnNuevo').hidden = true; $('btnYo').hidden = true;
    document.documentElement.removeAttribute('data-yo');
    let ultimo = 'M'; try { ultimo = localStorage.getItem('muro_quien') === 'xB' ? 'xB' : 'M'; } catch (e) { /* sin almacenamiento */ }
    elegirQuien(ultimo);
    $('claveAcceso').value = '';
    abrirModal($('modalAcceso'));
    setTimeout(() => $('claveAcceso').focus(), 60);
  }
  formAcceso.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clave = $('claveAcceso').value;
    if (!clave) { $('errorAcceso').textContent = 'Escribe la contraseña.'; return; }
    const boton = $('btnEntrar'); boton.disabled = true;
    try {
      const r = await api('/login', { metodo: 'POST', cuerpo: { quien: formAcceso.dataset.quien, clave } });
      cerrarModal($('modalAcceso'));
      iniciarSesion(r.quien);
    } catch (err) {
      $('errorAcceso').textContent = err.message;
      formAcceso.classList.remove('sacudir'); void formAcceso.offsetWidth; formAcceso.classList.add('sacudir');   // sacudida de error
    } finally { boton.disabled = false; }
  });

  /* Sesión iniciada: aplica los colores de la persona, desbloquea el muro y carga las publicaciones */
  function iniciarSesion(quien) {
    yo = quien;
    document.documentElement.dataset.yo = quien;
    try { localStorage.setItem('muro_quien', quien); } catch (e) { /* sin almacenamiento */ }
    Tema.repintarBarra();
    $('app').inert = false;
    $('btnNuevo').hidden = false;
    const chip = $('btnYo'); chip.hidden = false; chip.textContent = quien;
    chip.setAttribute('aria-label', `Sesión de ${quien}: tocar para cambiar de identidad`);
    ultimaFirma = ''; nodos.forEach((n) => n.remove()); nodos.clear();   // otra identidad = se vuelve a pintar todo
    cargar();
  }
  /* Tocar la inicial de quien soy: confirmar y salir (vuelve a aparecer la ventana de acceso) */
  $('btnYo').addEventListener('click', async () => {
    if (!(await confirmar({ titulo: `Sesión de ${yo}`, texto: '¿Quieres cerrar la sesión para entrar como otra identidad?', boton: 'Cerrar sesión' }))) return;
    try { await api('/salir', { metodo: 'POST' }); } catch (e) { /* aunque falle, se muestra el acceso */ }
    yo = null; mostrarAcceso();
  });

  /* ============================================================
     EL MURO — estado, filtros y pintado
     ============================================================ */
  let posts = [];                         // publicaciones tal como las devolvió el servidor (más nueva primero)
  const filtro = { tipo: '', autor: '', q: '' };
  const nodos = new Map();                // id → tarjeta ya pintada (para actualizar solo lo que cambió)
  let ultimaFirma = '';                   // huella del último listado pintado (si no cambió, no se repinta)

  /* Tipos de publicación: nombre, icono (fonts.google.com/icons) y texto */
  const TIPOS = {
    nota: { icono: 'sticky_note_2', nombre: 'Nota' },
    lista: { icono: 'checklist', nombre: 'Lista' },
    encuesta: { icono: 'ballot', nombre: 'Encuesta' },
    foto: { icono: 'photo_camera', nombre: 'Foto' },
    link: { icono: 'link', nombre: 'Link' },
    video: { icono: 'videocam', nombre: 'Video' },
  };

  /* Chips de filtro por tipo (Todo + uno por tipo) */
  const chipsTipo = [['', 'apps', 'Todo'], ...Object.entries(TIPOS).map(([k, t]) => [k, t.icono, t.nombre])];
  chipsTipo.forEach(([valor, ic, texto]) => {
    const c = h('button', { class: 'chip' + (valor === '' ? ' chip--activo' : ''), type: 'button', 'data-tipo': valor }, icono(ic), h('span', { text: texto }));
    c.addEventListener('click', () => {
      filtro.tipo = valor;
      document.querySelectorAll('#filtroTipos .chip').forEach((x) => x.classList.toggle('chip--activo', x === c));
      pintar();
    });
    $('filtroTipos').append(c);
  });
  /* Filtro por autor (Todos / M / xB) */
  $('filtroAutor').querySelectorAll('.segmento__btn').forEach((b) => b.addEventListener('click', () => {
    filtro.autor = b.dataset.autor;
    $('filtroAutor').querySelectorAll('.segmento__btn').forEach((x) => x.classList.toggle('segmento__btn--activo', x === b));
    pintar();
  }));
  /* Buscador: título, texto, link, elementos de lista y opciones de encuesta */
  $('buscador').addEventListener('input', (e) => { filtro.q = normalizar(e.target.value.trim()); pintar(); });
  $('buscador').addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.value) { e.target.value = ''; filtro.q = ''; pintar(); } });

  /* Texto buscable de una publicación */
  function textoDe(p) {
    const d = p.datos || {};
    return normalizar([p.titulo, p.texto, p.url, p.autor, (d.items || []).map((i) => i.t).join(' '), (d.opciones || []).map((o) => o.t).join(' '), d.vista && d.vista.titulo].join(' '));
  }
  const pasaFiltro = (p) => (!filtro.tipo || p.tipo === filtro.tipo) && (!filtro.autor || p.autor === filtro.autor) && (!filtro.q || filtro.q.split(/\s+/).every((w) => textoDe(p).includes(w)));

  /* Hora relativa ("hace 5 min") y, pasada una semana, la fecha */
  const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  function hora(ts) {
    const seg = Math.round((ts - Date.now()) / 1000), a = Math.abs(seg);
    if (a < 60) return 'ahora';
    if (a < 3600) return relativo.format(Math.round(seg / 60), 'minute');
    if (a < 86400) return relativo.format(Math.round(seg / 3600), 'hour');
    if (a < 604800) return relativo.format(Math.round(seg / 86400), 'day');
    return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  setInterval(() => document.querySelectorAll('time[data-ts]').forEach((t) => { t.textContent = hora(Number(t.dataset.ts)); }), 60000);   // refresca las horas cada minuto

  /* ----- Video: devuelve cómo mostrarlo (YouTube / Vimeo incrustado, archivo directo) o null si solo se puede abrir como link ----- */
  function infoVideo(url) {
    try {
      const u = new URL(url), host = u.hostname.replace(/^www\./, '');
      let id = null;
      if (host === 'youtu.be') id = u.pathname.slice(1);
      else if (host.endsWith('youtube.com')) {
        if (u.pathname === '/watch') id = u.searchParams.get('v');
        else { const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/); if (m) id = m[1]; }
      }
      if (id && /^[\w-]{6,15}$/.test(id)) return { tipo: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` };
      if (host === 'vimeo.com') { const m = u.pathname.match(/^\/(\d+)/); if (m) return { tipo: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` }; }
      if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(u.pathname)) return { tipo: 'video', src: url };
    } catch (e) { /* URL inválida */ }
    return null;
  }
  const sitioDe = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };
  /* Convierte las direcciones http(s) dentro de un texto en links clickeables (sin usar innerHTML) */
  function conEnlaces(texto) {
    const partes = [], re = /https?:\/\/[^\s<]+/g;
    let ultimo = 0, m;
    while ((m = re.exec(texto))) {
      if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
      partes.push(h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer', text: m[0] }));
      ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) partes.push(texto.slice(ultimo));
    return partes;
  }

  /* ----- Cuerpo de cada tipo de publicación ----- */
  function cuerpoPost(p) {
    const d = p.datos || {}, partes = [];
    if (p.titulo) partes.push(h('h3', { class: 'post__titulo', text: p.titulo }));

    if (p.tipo === 'foto') {
      const img = h('img', { class: 'post__foto', src: `/api/imagen/${p.id}`, alt: p.titulo || p.texto || 'Foto', loading: 'lazy', decoding: 'async' });
      if (d.w && d.h) img.style.aspectRatio = `${d.w} / ${d.h}`;       // reserva el alto: el muro no "salta" al cargar la foto
      img.addEventListener('click', () => abrirVisor(img.src, p.titulo || p.texto));
      partes.push(img);
    }
    if (p.tipo === 'video') {
      const v = infoVideo(p.url);
      if (v && v.tipo === 'iframe') partes.push(h('div', { class: 'video' }, h('iframe', { src: v.src, title: p.titulo || 'Video', loading: 'lazy', allowfullscreen: true, allow: 'picture-in-picture; encrypted-media; fullscreen', referrerpolicy: 'strict-origin-when-cross-origin' })));
      else if (v) partes.push(h('div', { class: 'video' }, h('video', { src: v.src, controls: true, preload: 'metadata', playsinline: true })));
      else partes.push(tarjetaEnlace(p, { sitio: sitioDe(p.url), titulo: p.titulo || p.url }, 'play_circle'));
    }
    if (p.tipo === 'link') partes.push(tarjetaEnlace(p, d.vista || {}, 'open_in_new'));

    if (p.tipo === 'lista') {
      const items = d.items || [], hechos = items.filter((i) => i.hecho).length, pct = items.length ? Math.round(hechos * 100 / items.length) : 0;
      partes.push(h('div', { class: 'lista' }, items.map((it, i) => h('button', { class: 'lista__item' + (it.hecho ? ' hecho' : ''), type: 'button', 'aria-pressed': String(!!it.hecho), onclick: () => accion(p, { accion: 'item', indice: i, hecho: !it.hecho }) },
        icono(it.hecho ? 'check_box' : 'check_box_outline_blank', it.hecho), h('span', { text: it.t })))));
      partes.push(h('div', { class: 'progreso', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, style: `--valor:${pct}%` }, h('div', { class: 'progreso__barra' })));
      partes.push(h('span', { class: 'progreso__texto', text: `${hechos} de ${items.length} · ${pct}%` }));
    }
    if (p.tipo === 'encuesta') {
      const ops = d.opciones || [], total = ops.reduce((s, o) => s + o.votos.length, 0);
      partes.push(h('div', { class: 'encuesta' }, ops.map((o, i) => {
        const nM = o.votos.filter((v) => v === 'M').length, ancho = total ? Math.round(o.votos.length * 100 / total) : 0, corte = o.votos.length ? Math.round(nM * 100 / o.votos.length) : 50;
        return h('button', { class: 'opcion' + (o.votos.includes(yo) ? ' opcion--mia' : ''), type: 'button', 'aria-pressed': String(o.votos.includes(yo)), onclick: () => accion(p, { accion: 'voto', opcion: i }) },
          h('span', { class: 'opcion__barra', style: `--ancho:${ancho}%;--corte:${corte}%` }),
          h('span', { class: 'opcion__texto', text: o.t }),
          h('span', { class: 'opcion__votos' }, o.votos.map((v) => h('span', { class: `mini mini--${v}`, text: v }))));
      })));
      partes.push(h('span', { class: 'progreso__texto', text: total ? `${total} ${total === 1 ? 'voto' : 'votos'}` : 'Todavía nadie votó' }));
    }
    if (p.texto) partes.push(h('p', { class: 'post__texto' }, conEnlaces(p.texto)));   // texto con los links clickeables
    return partes;
  }
  /* Tarjeta de link con vista previa (imagen, sitio, título y descripción del sitio si se pudieron leer) */
  function tarjetaEnlace(p, vista, ic) {
    return h('a', { class: 'enlace', href: p.url, target: '_blank', rel: 'noopener noreferrer' },
      vista.imagen ? h('img', { class: 'enlace__img', src: vista.imagen, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
      h('div', { class: 'enlace__cuerpo' },
        h('span', { class: 'enlace__sitio' }, icono(ic), h('span', { text: vista.sitio || sitioDe(p.url) })),
        (vista.titulo || !p.titulo) && (vista.titulo || p.url) !== p.titulo ? h('span', { class: 'enlace__titulo', text: vista.titulo || p.url }) : null,   // título del sitio (o la dirección si no hay nada más)
        vista.descripcion ? h('span', { class: 'enlace__desc', text: vista.descripcion }) : null));
  }

  /* ----- Tarjeta completa ----- */
  function crearTarjeta(p) {
    const mia = p.autor === yo, cor = (p.datos && p.datos.corazones) || [], meGusta = cor.includes(yo);
    const tarjeta = h('article', { class: 'post', 'data-autor': p.autor, 'data-id': p.id },
      h('div', { class: 'post__cab' },
        h('span', { class: 'autor' }, h('span', { class: 'autor__avatar', text: p.autor }), h('time', { class: 'autor__hora', 'data-ts': p.creado, text: hora(p.creado), title: new Date(p.creado).toLocaleString('es-AR') })),
        h('span', { class: 'material-symbols-rounded post__tipo', text: TIPOS[p.tipo].icono, 'aria-hidden': 'true' })),   // icono del tipo (nota, lista…) a la derecha
      ...cuerpoPost(p),
      h('div', { class: 'post__pie' },
        h('button', { class: 'post__accion post__accion--corazon' + (meGusta ? ' activo' : ''), type: 'button', 'aria-pressed': String(meGusta), 'aria-label': 'Me gusta', onclick: () => accion(p, { accion: 'corazon' }) },
          icono('favorite', meGusta), cor.length ? h('span', { class: 'corazones' }, cor.map((q) => h('span', { class: `mini mini--${q}`, text: q }))) : null),
        mia && p.tipo !== 'encuesta' ? h('button', { class: 'post__accion post__accion--der', type: 'button', 'aria-label': 'Editar', onclick: () => abrirEditor(p) }, icono('edit')) : null,
        mia ? h('button', { class: 'post__accion post__accion--peligro' + (p.tipo === 'encuesta' ? ' post__accion--der' : ''), type: 'button', 'aria-label': 'Eliminar', onclick: () => borrar(p) }, icono('delete')) : null));
    return tarjeta;
  }

  /* Pinta el muro: crea las tarjetas nuevas, reemplaza las que cambiaron, quita las que ya no están y las ordena.
     Solo las tarjetas recién aparecidas llevan la animación de entrada. */
  function pintar() {
    const lista = posts.filter(pasaFiltro), muro = $('muro');
    const visibles = new Set(lista.map((p) => p.id));
    nodos.forEach((el, id) => { if (!visibles.has(id)) { el.remove(); nodos.delete(id); } });   // borradas (desde otro dispositivo) o filtradas
    let orden = 0;
    lista.forEach((p, i) => {
      const firma = JSON.stringify([p.actualizado, yo]);
      let el = nodos.get(p.id);
      if (!el || el._firma !== firma) {
        const nuevo = crearTarjeta(p); nuevo._firma = firma;
        if (!el) {                                                     // tarjeta que recién aparece: entra con animación en cascada
          nuevo.classList.add('entra'); nuevo.style.setProperty('--i', Math.min(orden++, 10));
          nuevo.addEventListener('animationend', () => nuevo.classList.remove('entra'), { once: true });   // para que no se repita si se mueve de lugar
        } else el.replaceWith(nuevo);
        el = nuevo; nodos.set(p.id, el);
      }
      if (muro.children[i] !== el) muro.insertBefore(el, muro.children[i] || null);
    });
    const n = lista.length;
    $('cuenta').textContent = `${n} ${n === 1 ? 'publicación' : 'publicaciones'}`;
    $('cargando').hidden = true;
    $('vacio').hidden = n > 0;
    $('vacioTexto').textContent = posts.length ? 'No hay nada que coincida con ese filtro.' : 'Todavía no hay nada en el muro. ¡Toca el botón + y sube lo primero!';
  }

  /* Pide las publicaciones al servidor (el navegador reutiliza la respuesta si nada cambió gracias al ETag) y repinta solo si cambió algo */
  let cargando = false;
  async function cargar() {
    if (!yo || cargando) return;
    cargando = true;
    try {
      const r = await api('/posts');
      const firma = JSON.stringify(r.posts.map((p) => [p.id, p.actualizado]));
      if (firma !== ultimaFirma) { ultimaFirma = firma; posts = r.posts; pintar(); }
    } catch (e) {
      if (e.status !== 401) { $('cargando').hidden = true; if (!posts.length) { $('vacio').hidden = false; $('vacioTexto').textContent = 'No se pudo cargar el muro. Revisa tu conexión.'; } }
    } finally { cargando = false; }
  }
  setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, 12000);      // actualización automática
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cargar(); });

  /* ----- Acciones sobre una publicación (corazón, voto, tildar lista) ----- */
  async function accion(p, cuerpo) {
    try {
      const r = await api(`/posts/${p.id}/accion`, { metodo: 'POST', cuerpo });
      reemplazar(r.post);
    } catch (e) { avisar(e.message, 'error'); if (e.status === 404) cargar(); }
  }
  /* Cambia una publicación en memoria y repinta (no espera al siguiente ciclo de actualización) */
  function reemplazar(nueva) {
    posts = posts.map((x) => (x.id === nueva.id ? nueva : x));
    ultimaFirma = JSON.stringify(posts.map((x) => [x.id, x.actualizado]));
    pintar();
  }
  async function borrar(p) {
    if (!(await confirmar({ titulo: 'Eliminar publicación', texto: 'Se borrará para los dos y no se puede deshacer.', boton: 'Eliminar' }))) return;
    try {
      await api(`/posts/${p.id}`, { metodo: 'DELETE' });
      const el = nodos.get(p.id);
      if (el) { el.classList.remove('entra'); el.classList.add('sale'); await pausa(280); }
      posts = posts.filter((x) => x.id !== p.id);
      ultimaFirma = JSON.stringify(posts.map((x) => [x.id, x.actualizado]));
      pintar(); avisar('Publicación eliminada.', 'ok');
    } catch (e) { avisar(e.message, 'error'); }
  }

  /* ============================================================
     VISOR DE FOTOS
     ============================================================ */
  function abrirVisor(src, pie) {
    $('visorImg').src = src; $('visorPie').textContent = pie || ''; $('visorPie').hidden = !pie;
    $('visor').hidden = false; document.body.classList.add('modal-abierto');
  }
  function cerrarVisor() { $('visor').hidden = true; $('visorImg').removeAttribute('src'); if (!document.querySelector('.modal-fondo:not([hidden])')) document.body.classList.remove('modal-abierto'); }
  $('visor').addEventListener('click', cerrarVisor);

  /* ============================================================
     PUBLICAR Y EDITAR
     ============================================================ */
  const formNuevo = $('formNuevo');
  let tipoActual = 'nota';                // tipo elegido en el formulario
  let editando = null;                    // publicación que se está editando (null = publicación nueva)
  let foto = null;                        // { dataUrl, w, h } de la foto elegida

  /* Botones de tipo (Nota, Lista, Encuesta, Foto, Link, Video) */
  Object.entries(TIPOS).forEach(([clave, t]) => $('tiposNuevo').append(
    h('button', { class: 'tipo-btn', type: 'button', role: 'tab', 'data-tipo': clave, onclick: () => elegirTipo(clave) }, icono(t.icono), h('span', { text: t.nombre }))));

  /* Filas editables (elementos de lista / opciones de encuesta): cada fila es un campo de texto con su botón de quitar */
  function agregarFila(valor = '', hecho = false) {
    const max = tipoActual === 'encuesta' ? 8 : 50;
    if ($('filasItems').children.length >= max) { avisar(`Máximo ${max} elementos.`, 'error'); return; }
    const entrada = h('input', { class: 'campo__entrada', type: 'text', maxlength: 200, placeholder: tipoActual === 'encuesta' ? `Opción ${$('filasItems').children.length + 1}` : 'Elemento', autocomplete: 'off', value: valor });
    const fila = h('div', { class: 'fila' }, entrada, h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Quitar', onclick: () => fila.remove() }, icono('close')));
    fila._hecho = hecho;                                                  // se conserva el "tildado" al editar una lista
    $('filasItems').append(fila);
    return entrada;
  }
  $('btnMasItems').addEventListener('click', () => agregarFila().focus());
  $('filasItems').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); agregarFila().focus(); } });   // Enter = nueva fila

  /* Muestra solo los campos que necesita cada tipo */
  function elegirTipo(tipo) {
    tipoActual = tipo;
    document.querySelectorAll('#tiposNuevo .tipo-btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tipo === tipo)));
    const esEnc = tipo === 'encuesta';
    $('campoTitulo').hidden = false;
    $('etiquetaTitulo').textContent = esEnc ? 'Pregunta' : (tipo === 'nota' ? 'Título (opcional)' : 'Título (opcional)');
    $('campoTexto').hidden = !['nota', 'foto', 'link', 'video'].includes(tipo);
    $('etiquetaTexto').textContent = tipo === 'nota' ? 'Texto' : (tipo === 'foto' ? 'Descripción (opcional)' : 'Comentario (opcional)');
    $('campoUrl').hidden = !['link', 'video'].includes(tipo);
    $('campoItems').hidden = !['lista', 'encuesta'].includes(tipo);
    $('etiquetaItems').textContent = esEnc ? 'Opciones (mínimo 2)' : 'Elementos de la lista';
    $('textoMasItems').textContent = esEnc ? 'Agregar opción' : 'Agregar elemento';
    $('campoFoto').hidden = tipo !== 'foto' || !!editando;                // al editar no se cambia la foto
    $('errorNuevo').textContent = '';
    if (!$('filasItems').children.length && !$('campoItems').hidden) { agregarFila(); agregarFila(); }
  }

  /* Abre el formulario vacío (publicación nueva) */
  function abrirNuevo() {
    editando = null; foto = null;
    formNuevo.reset(); $('filasItems').replaceChildren(); $('fotoPrevia').hidden = true; $('textoFoto').textContent = 'Elegir o tomar una foto';
    $('nuevoTitulo').textContent = 'Nueva publicación'; $('textoPublicar').textContent = 'Publicar';
    $('tiposNuevo').hidden = false;
    elegirTipo('nota');
    abrirModal($('modalNuevo')); setTimeout(() => $('nuevoTexto').focus(), 80);
  }
  /* Abre el formulario con los datos de una publicación propia para editarla */
  function abrirEditor(p) {
    editando = p; foto = null;
    formNuevo.reset(); $('filasItems').replaceChildren(); $('fotoPrevia').hidden = true;
    $('nuevoTitulo').textContent = `Editar ${TIPOS[p.tipo].nombre.toLowerCase()}`; $('textoPublicar').textContent = 'Guardar';
    $('tiposNuevo').hidden = true;                                       // el tipo no se cambia al editar
    elegirTipo(p.tipo);
    $('nuevoTituloCampo').value = p.titulo; $('nuevoTexto').value = p.texto; $('nuevoUrl').value = p.url;
    if (p.tipo === 'lista') { $('filasItems').replaceChildren(); (p.datos.items || []).forEach((i) => agregarFila(i.t, i.hecho)); }
    abrirModal($('modalNuevo'));
  }
  $('btnNuevo').addEventListener('click', abrirNuevo);
  document.querySelectorAll('#modalNuevo [data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarModal($('modalNuevo'))));
  $('modalNuevo').addEventListener('mousedown', (e) => { if (e.target === $('modalNuevo')) cerrarModal($('modalNuevo')); });   // clic afuera = cerrar

  /* ----- Foto: elegir y comprimir en el celular antes de subir ----- */
  /* Qué hace: reduce la foto a un máximo de 1280 px y la guarda como JPEG bajando la calidad hasta que pese poco (≈ 800 KB como máximo).
     Para qué sirve: las fotos se guardan en la base de datos D1, que admite filas de ~2 MB; así caben muchas y cargan rápido. */
  async function comprimirFoto(archivo) {
    let bmp;
    try { bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); }
    catch (e) {                                                          // respaldo para navegadores sin createImageBitmap con opciones
      bmp = await new Promise((ok, mal) => { const url = URL.createObjectURL(archivo), im = new Image(); im.onload = () => { URL.revokeObjectURL(url); ok(im); }; im.onerror = mal; im.src = url; });
    }
    const MAX_CHARS = 1100000;                                           // tope de la foto en base64 (el servidor admite 1.400.000)
    let lado = 1280, calidad = 0.82, dataUrl, w, hh;
    for (let intento = 0; intento < 8; intento++) {
      const origW = bmp.naturalWidth || bmp.width, origH = bmp.naturalHeight || bmp.height, k = Math.min(1, lado / Math.max(origW, origH));
      w = Math.max(1, Math.round(origW * k)); hh = Math.max(1, Math.round(origH * k));
      const lienzo = document.createElement('canvas'); lienzo.width = w; lienzo.height = hh;
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-blanco').trim() || '#fff';   // fondo para PNG con transparencia
      ctx.fillRect(0, 0, w, hh); ctx.drawImage(bmp, 0, 0, w, hh);
      dataUrl = lienzo.toDataURL('image/jpeg', calidad);
      if (dataUrl.length <= MAX_CHARS) break;
      if (calidad > 0.55) calidad -= 0.1; else lado = Math.round(lado * 0.8);   // primero baja la calidad, después el tamaño
    }
    if (dataUrl.length > 1400000) throw new Error('La foto es demasiado pesada.');
    return { dataUrl, w, h: hh };
  }
  $('btnElegirFoto').addEventListener('click', () => $('inputFoto').click());
  $('inputFoto').addEventListener('change', async () => {
    const archivo = $('inputFoto').files[0]; if (!archivo) return;
    $('textoFoto').textContent = 'Procesando foto…';
    try {
      foto = await comprimirFoto(archivo);
      $('fotoPrevia').src = foto.dataUrl; $('fotoPrevia').hidden = false; $('textoFoto').textContent = 'Cambiar foto'; $('errorNuevo').textContent = '';
    } catch (e) { foto = null; $('textoFoto').textContent = 'Elegir o tomar una foto'; $('errorNuevo').textContent = 'No se pudo leer esa imagen. Prueba con otra.'; }
  });

  /* ----- Enviar el formulario (publicar o guardar cambios) ----- */
  /* Agrega https:// si la persona escribió una dirección sin esquema (ej. youtube.com/...) */
  const arreglarUrl = (u) => { u = u.trim(); return u && !/^https?:\/\//i.test(u) ? 'https://' + u : u; };
  formNuevo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('errorNuevo'); error.textContent = '';
    const tipo = tipoActual, cuerpo = { tipo, titulo: $('nuevoTituloCampo').value.trim(), texto: $('nuevoTexto').value.trim(), datos: {} };
    const filas = [...$('filasItems').children].map((f) => ({ t: f.querySelector('input').value.trim(), hecho: !!f._hecho })).filter((f) => f.t);

    if (tipo === 'nota' && !cuerpo.texto && !cuerpo.titulo) return void (error.textContent = 'Escribe algo en la nota.');
    if (tipo === 'lista') { if (!filas.length) return void (error.textContent = 'Agrega al menos un elemento.'); cuerpo.datos.items = filas; }
    if (tipo === 'encuesta') {
      if (!cuerpo.titulo) return void (error.textContent = 'Escribe la pregunta.');
      if (filas.length < 2) return void (error.textContent = 'Agrega al menos 2 opciones.');
      cuerpo.datos.opciones = filas.map((f) => f.t);
    }
    if (tipo === 'link' || tipo === 'video') {
      cuerpo.url = arreglarUrl($('nuevoUrl').value);
      if (!cuerpo.url) return void (error.textContent = 'Pega la dirección del ' + (tipo === 'link' ? 'link.' : 'video.'));
      try { new URL(cuerpo.url); } catch (x) { return void (error.textContent = 'Esa dirección no es válida.'); }
    }
    if (tipo === 'foto' && !editando) {
      if (!foto) return void (error.textContent = 'Elige una foto.');
      cuerpo.imagen = foto.dataUrl; cuerpo.datos.w = foto.w; cuerpo.datos.h = foto.h;
    }

    const boton = $('btnPublicar'); boton.disabled = true;
    try {
      if (editando) {
        const r = await api(`/posts/${editando.id}`, { metodo: 'PATCH', cuerpo });
        reemplazar(r.post); avisar('Cambios guardados.', 'ok');
      } else {
        const r = await api('/posts', { metodo: 'POST', cuerpo });
        posts = [r.post, ...posts.filter((x) => x.id !== r.post.id)];
        ultimaFirma = JSON.stringify(posts.map((x) => [x.id, x.actualizado]));
        pintar(); avisar('¡Publicado!', 'ok');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      cerrarModal($('modalNuevo'));
    } catch (err) { error.textContent = err.message; }
    finally { boton.disabled = false; }
  });

  /* Esc: cierra la ventana o el visor que esté arriba (la de acceso no se puede cerrar) */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('visor').hidden) cerrarVisor();
    else if (!$('modalConfirmar').hidden) { if ($('confNo').onclick) $('confNo').onclick(); }
    else if (!$('modalNuevo').hidden) cerrarModal($('modalNuevo'));
  });

  /* ============================================================
     ONDA AL TOCAR (igual que ÉLIX)
     Qué hace: en todo elemento "tocable" nace una onda en el punto exacto de la pulsación.
     Para qué sirve: dar respuesta visual al toque.
     ============================================================ */
  const SEL_ONDA = '.btn, .btn-icono, .chip, .segmento__btn, .tipo-btn, .opcion, .lista__item, .yo-chip, .fab, .post__accion';
  document.addEventListener('pointerdown', (e) => {
    const host = e.target.closest ? e.target.closest(SEL_ONDA) : null;
    if (!host || host.disabled) return;
    const r = host.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
    const onda = h('span', { class: 'onda' });
    onda.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    onda.addEventListener('animationend', () => onda.remove());
    host.append(onda);
  }, { passive: true });

  /* ============================================================
     PWA — instalar como aplicación y service worker
     ============================================================ */
  /* Qué hace: cuando el navegador permite instalar la app, muestra el botón de la barra superior y lanza el cuadro de instalación.
     Para qué sirve: abrir el muro como una app propia desde la pantalla de inicio. */
  let eventoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; $('btnInstalar').hidden = false; });
  $('btnInstalar').addEventListener('click', async () => {
    if (!eventoInstalar) return;
    eventoInstalar.prompt(); await eventoInstalar.userChoice;
    eventoInstalar = null; $('btnInstalar').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('btnInstalar').hidden = true; });
  /* El service worker permite abrir la app sin conexión y se actualiza solo cuando se hace push a GitHub */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* sin service worker la página funciona igual */ });

  /* ============================================================
     ARRANQUE: ¿ya hay sesión? Sí → directo al muro. No → ventana de acceso (la primera vez)
     ============================================================ */
  (async function arrancar() {
    try {
      const r = await api('/yo');
      iniciarSesion(r.quien);
    } catch (e) {
      if (e.status === 401) { $('cargando').hidden = true; mostrarAcceso(); }
      else {                                                              // sin conexión: si ya había sesión, se muestra lo último guardado
        let hay = null; try { hay = localStorage.getItem('muro_quien'); } catch (x) { /* nada */ }
        if (hay) iniciarSesion(hay); else { $('cargando').hidden = true; mostrarAcceso(); }
      }
    }
  })();
});
