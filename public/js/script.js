/* ============================================================
   script.js — Nuestro Muro
   Qué hace: 1) tema claro/oscuro con fundido, 2) iconos "cargando" mientras llega la fuente de iconos, 3) acceso (switch M / xB +
   contraseña, solo la primera vez), 4) el muro: carga las publicaciones del servidor, las pinta como tarjetas, filtra/busca y se
   actualiza solo cada pocos segundos, 5) publicar y editar (nota, lista, encuesta, foto, link, plan), 6) corazones, votos, tildar
   listas y borrar, 7) visor de fotos, avisos, ondas al tocar, 8) PWA (instalar + service worker).
   Para qué sirve: toda la lógica del navegador. Los datos viven en Cloudflare D1 y se piden a /api/* (carpeta functions/).
   IMPORTANTE: se carga en el <head> (antes de pintar) para aplicar el tema sin parpadeo; por eso el resto espera a DOMContentLoaded.
   Seguridad: todo el contenido que escriben las personas se pinta con textContent (nunca como HTML).
   NUEVO v2.1: 9) texto con formato (barra de botones + Markdown seguro), 10) categorías (selector tipo "guardar en lista", creación
   con nombre e icono y fila de filtros que se desliza), 11) "editado hace…" en las publicaciones modificadas, 12) corazón relleno, 13) notificaciones (v2.5).
   NUEVO v2.7: 14) TODO instantáneo: cada acción (corazón, voto, tildar, comentar, publicar, editar, borrar, categorías) se ve al momento y se manda al
   servidor en segundo plano; si el servidor la rechaza, la pantalla vuelve a lo que dice el servidor y sale un aviso de error. 15) las tarjetas se
   actualizan "en el lugar" (morph) para que las transiciones sean fluidas, 16) formato de texto (negrita, cursiva…) en todos los campos de texto,
   17) lista completada en verde, 18) escena de inicio de sesión.
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
      else if (k.startsWith('on')) { const t = k.slice(2); (el._h = el._h || {})[t] = v; escuchar(el, t); }   // v2.7: manejador indirecto (ver escuchar)
      else el.setAttribute(k, v === true ? '' : v);
    }
    /* v2.1: flat(Infinity) para aceptar listas dentro de listas de hijos (el formato de texto devuelve arreglos anidados) */
    for (const c of hijos.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(c)); }
    return el;
  }
  /* ----- v2.7: manejadores indirectos y "morph" -----
     Qué hace: los manejadores (onclick…) se guardan en el propio elemento (el._h) y un único oyente fijo los llama. Así, cuando una tarjeta cambia,
     morph() puede actualizar la tarjeta que ya está en pantalla con los datos nuevos (en vez de reemplazarla por otra) y le pasa los manejadores
     nuevos; los elementos que ya estaban se quedan, y por eso las transiciones de CSS (colores, barras, tachado, corazón) se animan en vez de saltar.
     Para qué sirve: animaciones fluidas y que no se pierda el foco ni lo que se está escribiendo. */
  function escuchar(el, tipo) {
    el._reg = el._reg || new Set();
    if (el._reg.has(tipo)) return;
    el._reg.add(tipo);
    el.addEventListener(tipo, (e) => { const f = el._h && el._h[tipo]; if (f) f.call(el, e); });
  }
  /* Deja "viejo" igual a "nuevo" tocando solo lo que cambió. raiz = true en la tarjeta: ahí no se tocan class/style (los pone script.js: animación de entrada, resaltado) */
  function morph(viejo, nuevo, raiz) {
    for (const a of [...viejo.attributes]) { if (!nuevo.hasAttribute(a.name) && !(raiz && (a.name === 'class' || a.name === 'style'))) viejo.removeAttribute(a.name); }
    for (const a of nuevo.attributes) { if (raiz && (a.name === 'class' || a.name === 'style')) continue; if (viejo.getAttribute(a.name) !== a.value) viejo.setAttribute(a.name, a.value); }
    viejo._h = nuevo._h || {};
    Object.keys(viejo._h).forEach((t) => escuchar(viejo, t));
    const hv = [...viejo.childNodes].filter((n) => !(n.classList && n.classList.contains('onda'))), hn = [...nuevo.childNodes];   // las ondas del toque se dejan terminar
    /* Hijos con clave (data-k): se emparejan por su clave y no por su posición (así, si aparece un comentario nuevo o un bloque, el cuadro de
       comentario que se está escribiendo no se pierde ni se mezcla con otro). Los que no existían se agregan y los que sobran se quitan. */
    if (hn.some((n) => n.nodeType === 1 && n.hasAttribute('data-k'))) {
      const porClave = new Map(hv.filter((n) => n.nodeType === 1 && n.hasAttribute('data-k')).map((n) => [n.getAttribute('data-k'), n]));
      const final = hn.map((b) => {
        const a = b.nodeType === 1 ? porClave.get(b.getAttribute('data-k')) : null;
        if (!a || a.tagName !== b.tagName) return b;
        porClave.delete(b.getAttribute('data-k'));
        if (!a.matches('textarea.comentar__campo')) morph(a, b, false);
        return a;
      });
      hv.forEach((n) => { if (!final.includes(n)) n.remove(); });
      let cur = viejo.firstChild;
      final.forEach((n) => { if (cur === n) cur = cur.nextSibling; else viejo.insertBefore(n, cur); });
      return;
    }
    for (let i = 0; i < Math.max(hv.length, hn.length); i++) {
      const a = hv[i], b = hn[i];
      if (!b) { a.remove(); continue; }
      if (!a) { viejo.append(b); continue; }
      if (a.nodeType === 3 && b.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; continue; }
      if (a.nodeType === 1 && b.nodeType === 1) {
        if (a.matches('textarea.comentar__campo') && b.matches('textarea.comentar__campo')) continue;   // el cuadro de comentario se queda tal cual (con lo que se está escribiendo)
        if (a.tagName === b.tagName) { morph(a, b, false); continue; }
      }
      a.replaceWith(b);
    }
  }
  const clon = (x) => JSON.parse(JSON.stringify(x));   // copia profunda de datos simples (publicaciones)
  /* Id único para lo que se crea en pantalla antes de que el servidor responda (el servidor usa ese mismo id) */
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

  /* Icono Material Symbols (nombre de fonts.google.com/icons); lleno = versión rellena */
  const icono = (nombre, lleno) => h('span', { class: 'material-symbols-rounded' + (lleno ? ' lleno' : ''), text: nombre, 'aria-hidden': 'true' });
  /* NUEVO v2.4: foto de perfil de cada identidad (M = carta azul, xB = carta roja; archivos en /img/).
     Qué hace: devuelve el <span class="avatar"> con la imagen de quien se pida; "clase" agrega un tamaño (avatar--chico, etc.).
     Para qué sirve: reemplaza a las iniciales en la barra, las publicaciones, los comentarios, los corazones y los votos.
     Si la imagen no carga, el atributo alt muestra la inicial como respaldo. */
  const avatar = (quien, clase) => {
    const q = quien === 'xB' ? 'xB' : 'M';   // solo existen dos identidades (el servidor ya lo valida)
    return h('span', { class: `avatar avatar--${q}` + (clase ? ' ' + clase : ''), title: q }, h('img', { src: `/img/avatar-${q}.png`, alt: q, decoding: 'async', draggable: 'false' }));
  };
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
  async function api(ruta, { metodo = 'GET', cuerpo, keepalive } = {}) {
    let res;
    try {
      res = await fetch('/api' + ruta, {
        method: metodo, credentials: 'same-origin', keepalive: !!keepalive,   // v2.6: keepalive deja terminar el guardado aunque se cierre la página
        headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch (e) { throw Object.assign(new Error('No hay conexión con el servidor.'), { status: 0 }); }   // v2.7: mensaje claro cuando no hay red
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
    if (typeof ocultarBarraFlota === 'function') ocultarBarraFlota();   // v2.7: la barra de formato flotante no queda suelta al cerrar una ventana
    el.classList.add('saliendo');
    /* v2.8: si la ventana se volvió a abrir mientras se cerraba (ej.: el servidor rechazó lo que se acababa de enviar y se reabre con lo escrito), el cierre pendiente se cancela */
    setTimeout(() => { if (!el.classList.contains('saliendo')) return; el.hidden = true; el.classList.remove('saliendo'); if (!document.querySelector('.modal-fondo:not([hidden])')) document.body.classList.remove('modal-abierto'); }, 160);
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
    $('app').inert = true; $('btnNuevo').hidden = true; $('btnYo').hidden = true; $('btnNotif').hidden = true;   // v2.5: sin sesión no hay campanita
    noLeidas = 0; pintarContador(); cerrarModal($('modalNotif'));
    document.documentElement.removeAttribute('data-yo');
    let ultimo = 'M'; try { ultimo = localStorage.getItem('muro_quien') === 'xB' ? 'xB' : 'M'; } catch (e) { /* sin almacenamiento */ }
    elegirQuien(ultimo);
    $('claveAcceso').value = '';
    abrirModal($('modalAcceso'));
    setTimeout(() => $('claveAcceso').focus(), 60);
  }
  let salidaEnCurso = Promise.resolve();                                    // v2.7: cierre de sesión en el servidor que todavía no terminó
  formAcceso.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clave = $('claveAcceso').value;
    if (!clave) { $('errorAcceso').textContent = 'Escribe la contraseña.'; return; }
    const boton = $('btnEntrar'); boton.disabled = true;
    try {
      await salidaEnCurso;                                                  // v2.7: si se acaba de cerrar sesión, se espera a que el servidor termine (si no, borraría la sesión nueva)
      const r = await api('/login', { metodo: 'POST', cuerpo: { quien: formAcceso.dataset.quien, clave } });
      mostrarEscena(r.quien);                                               // v2.7: escena de bienvenida (pantalla negra con las dos fotos)
      cerrarModal($('modalAcceso'));
      iniciarSesion(r.quien);
    } catch (err) {
      $('errorAcceso').textContent = err.message;
      formAcceso.classList.remove('sacudir'); void formAcceso.offsetWidth; formAcceso.classList.add('sacudir');   // sacudida de error
    } finally { boton.disabled = false; }
  });

  /* ----- v2.7: escena de inicio de sesión (inspirada en el cambio de personaje de The Coffin of Andy and Leyley) -----
     Qué hace: al entrar con una identidad aparece una pantalla negra con las dos fotos en gris; a los 2 s la foto de quien entró recupera su color
     (fundido + destello) y recién entonces aparece, dentro de una caja y letra por letra, "Eres Mely" (M) o "Eres Bruu" (xB). Después se desvanece
     y queda el muro. Tocar la pantalla la salta. Las fotos en gris son img/avatar-*-gris.png; el color es la foto de siempre encima.
     Para qué sirve: dar la bienvenida. Los tiempos de cada paso están en el CSS (.escena*), aquí solo cuánto se queda en pantalla. */
  const NOMBRE_ESCENA = { M: 'Mely', xB: 'Bruu' };
  ['M', 'xB'].forEach((q) => { new Image().src = `/img/avatar-${q}-gris.png`; });   // se precargan para que la escena no arranque con las fotos a medio cargar
  function mostrarEscena(quien) {
    const ESPERA = 2000;                                                    // ms hasta que la foto de quien entró recupera su color
    const nombre = 'Eres ' + (NOMBRE_ESCENA[quien] || quien);
    const foto = (q) => h('div', { class: 'escena__foto ' + (q === quien ? 'escena__foto--activa' : 'escena__foto--otra') },
      h('img', { class: 'escena__gris', src: `/img/avatar-${q}-gris.png`, alt: '', draggable: 'false' }),
      q === quien ? h('img', { class: 'escena__color', src: `/img/avatar-${q}.png`, alt: '', draggable: 'false' }) : null);
    const el = h('div', { class: 'escena', role: 'status', 'aria-label': nombre, style: `--escena-espera:${ESPERA}ms` },
      h('div', { class: 'escena__fotos' }, foto('M'), foto('xB')),
      h('div', { class: 'escena__caja' }, h('div', { class: 'escena__nombre', 'aria-hidden': 'true' }, [...nombre].map((c, i) => h('span', { class: 'escena__letra', style: `--n:${i}`, text: c })))));
    document.body.append(el);
    const cerrar = () => { clearTimeout(t); el.classList.add('escena--sale'); setTimeout(() => el.remove(), 560); };
    const t = setTimeout(cerrar, ESPERA + 700 + nombre.length * 55 + 520 + 1400);   // color + letras + un momento para leerlo
    el.addEventListener('click', cerrar, { once: true });                           // un toque salta la escena
  }

  /* Sesión iniciada: aplica los colores de la persona, desbloquea el muro y carga las publicaciones */
  function iniciarSesion(quien) {
    yo = quien;
    /* v2.7: otra identidad = se descarta todo lo que había en pantalla y las respuestas pendientes de la sesión anterior */
    sesion++; servidor.clear(); catsServidor = []; pendientes.length = 0; cola.clear(); fotosLocales.clear(); posts = [];
    planesPend.forEach((e) => clearTimeout(e.timer)); planesPend.clear(); ultimaFirma = '';
    document.documentElement.dataset.yo = quien;
    try { localStorage.setItem('muro_quien', quien); } catch (e) { /* sin almacenamiento */ }
    Tema.repintarBarra();
    $('app').inert = false;
    $('btnNuevo').hidden = false;
    const chip = $('btnYo'); chip.hidden = false; chip.replaceChildren(avatar(quien));   // v2.4: foto en vez de la inicial
    chip.setAttribute('aria-label', `Sesión de ${quien}: tocar para ver mi perfil`);   // v2.8
    ultimaFirma = ''; nodos.forEach((n) => n.remove()); nodos.clear();   // otra identidad = se vuelve a pintar todo
    categorias = []; ultimaFirmaCats = ''; filtro.cat = '';              // v2.1: también se vuelven a pedir las categorías
    avisos = []; noLeidas = 0; avisosVistos.clear(); primeraCargaAvisos = true; pintarContador();   // v2.5: notificaciones de la otra identidad
    $('btnNotif').hidden = false; sincronizarPush();
    comentariosAbiertos.clear(); borradores.clear();                     // v2.2: al cambiar de identidad no quedan comentarios desplegados ni borradores de la otra persona
    pintarFiltroCategorias();
    reiniciarPerfiles(quien);                                            // v2.8: perfiles de la sesión anterior fuera; se vuelve a la pestaña del muro
    cargar();
  }
  /* v2.8: tocar mi foto abre MI PERFIL (ahí está el botón "Cerrar sesión", que antes estaba en la foto) */
  $('btnYo').addEventListener('click', () => { if (yo) abrirPerfil(yo); });
  /* Cerrar sesión: confirmar y salir (vuelve a aparecer la ventana de acceso). v2.8: lo llama el botón del perfil propio */
  async function cerrarSesion() {
    if (!(await confirmar({ titulo: `Sesión de ${yo}`, texto: '¿Quieres cerrar la sesión para entrar como otra identidad?', boton: 'Cerrar sesión' }))) return;
    /* v2.7: la ventana de acceso aparece al instante; el cierre de sesión en el servidor sigue en segundo plano (el nuevo inicio de sesión lo espera) */
    salidaEnCurso = bajaPushDeEstaSesion().catch(() => {}).then(() => api('/salir', { metodo: 'POST' })).catch(() => { /* aunque falle, ya se muestra el acceso */ });   // v2.5: este dispositivo deja de recibir los avisos de esta persona
    yo = null; sesion++; pendientes.length = 0; perfPend.length = 0; mostrarAcceso();   // v2.8: tampoco quedan cambios de perfil pendientes de esta sesión
  }

  /* ============================================================
     EL MURO — estado, filtros y pintado
     ============================================================ */
  let posts = [];                         // publicaciones tal como las devolvió el servidor (más nueva primero)
  /* v2.1: filtro.cat = '' (todas) | '__sin' (sin categoría) | id de una categoría */
  const filtro = { tipo: '', autor: '', q: '', cat: '' };
  const nodos = new Map();                // id → tarjeta ya pintada (para actualizar solo lo que cambió)
  let ultimaFirma = '';                   // huella del último listado pintado (si no cambió, no se repinta)
  let categorias = [];                    // v2.1: categorías compartidas [{ id, nombre, icono, autor, creado }]
  let ultimaFirmaCats = '';               // huella de las categorías (si cambió, se repintan filtros y tarjetas)
  const comentariosAbiertos = new Set();  // v2.2: ids de publicaciones con la sección de comentarios desplegada
  const borradores = new Map();           // v2.2: id de publicación → comentario a medio escribir (para no perderlo al repintar la tarjeta)

  /* Tipos de publicación: nombre, icono (fonts.google.com/icons) y texto */
  const TIPOS = {
    nota: { icono: 'sticky_note_2', nombre: 'Nota' },
    lista: { icono: 'checklist', nombre: 'Lista' },
    encuesta: { icono: 'ballot', nombre: 'Encuesta' },
    foto: { icono: 'photo_camera', nombre: 'Foto' },
    link: { icono: 'link', nombre: 'Link' },
    plan: { icono: 'event', nombre: 'Plan' },   // v2.3: reemplaza a "video"
  };
  /* v2.3: estados de un día de un plan, en el orden en que se recorren al tocarlos (icono de fonts.google.com/icons + texto) */
  const ESTADOS_DIA = {
    posible: { icono: 'radio_button_unchecked', nombre: 'Posible' },
    ideal: { icono: 'star', nombre: 'Ideal' },
    descartado: { icono: 'block', nombre: 'Descartado' },
    seguro: { icono: 'check_circle', nombre: 'Seguro' },
  };
  const ORDEN_ESTADOS = Object.keys(ESTADOS_DIA);
  const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  /* Fecha "AAAA-MM-DD" ↔ Date local (sin que la zona horaria corra el día) */
  const aFecha = (f) => { const [a, m, d] = f.split('-').map(Number); return new Date(a, m - 1, d); };
  const aISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const hoyISO = () => aISO(new Date());
  /* "sáb 21 nov" (con el año solo si no es el actual) */
  function etiquetaDia(f) {
    const dt = aFecha(f);
    return `${DIAS_SEMANA[dt.getDay()]} ${dt.getDate()} ${MESES[dt.getMonth()]}` + (dt.getFullYear() !== new Date().getFullYear() ? ` ${dt.getFullYear()}` : '');
  }
  /* ----- v2.6: réplica en el navegador de las reglas de los días de un plan (iguales a las de functions/_lib/comun.js) -----
     Qué hace: permite cambiar el estado de un día AL INSTANTE en la pantalla, sin esperar la respuesta del servidor. Regla: solo un día
     seguro; marcarlo descarta los demás (se recuerda cómo estaban en "antes") y quitarlo los devuelve a como estaban.
     Un "estado de días" es { dias: [{ f, e }], antes: { fecha: estado } }. */
  const clonarDias = (datos) => ({ dias: ((datos && datos.dias) || []).map((x) => ({ f: x.f, e: x.e })), antes: { ...((datos && datos.antes) || {}) } });
  function restaurarDiasLocal(d) {
    d.dias.forEach((x) => { if (x.e === 'descartado' && d.antes[x.f]) x.e = d.antes[x.f] === 'seguro' ? 'posible' : d.antes[x.f]; });
    d.antes = {};
  }
  /* Devuelve false si el cambio no es posible (el servidor lo rechazaría) */
  function ponerEstadoDiaLocal(d, fecha, estado) {
    const dia = d.dias.find((x) => x.f === fecha);
    if (!dia) return false;
    const hayS = d.dias.some((x) => x.e === 'seguro');
    if (estado === 'seguro') {
      if (!hayS) d.antes = Object.fromEntries(d.dias.map((x) => [x.f, x.e]));
      d.dias.forEach((x) => { x.e = x.f === fecha ? 'seguro' : 'descartado'; });
    } else if (dia.e === 'seguro') { restaurarDiasLocal(d); dia.e = estado; }
    else if (hayS) return false;
    else dia.e = estado;
    return true;
  }
  /* Estado al que pasa un día cuando se lo toca: posible → ideal → descartado → seguro → posible. Con el plan confirmado: otro día pasa a ser
     el seguro y el seguro vuelve a "posible" */
  function siguienteEstadoDia(d, fecha) {
    const dia = d.dias.find((x) => x.f === fecha), hayS = d.dias.some((x) => x.e === 'seguro');
    if (hayS) return dia.e === 'seguro' ? 'posible' : 'seguro';
    return ORDEN_ESTADOS[(ORDEN_ESTADOS.indexOf(dia.e) + 1) % ORDEN_ESTADOS.length];
  }
  /* ============================================================
     v2.7 — TODO INSTANTÁNEO (la pantalla no espera al servidor)
     Qué hace: cada acción (corazón, voto, tildar un elemento, comentar, publicar, editar, borrar, crear/borrar categorías, cambiar un día) se
     aplica YA en la pantalla con una copia local de las reglas del servidor y se manda a Cloudflare en segundo plano, de a una y en orden por
     publicación. Lo que se ve es siempre: "lo último que confirmó el servidor" + "las acciones que todavía no confirmó" (recomponer()).
     Si el servidor rechaza una acción (o no hay conexión) esa acción se quita de la lista, la pantalla vuelve a lo que dice el servidor y sale
     un aviso de error; si era una publicación o una edición, el formulario se vuelve a abrir con lo que se había escrito.
     Mientras una publicación tiene acciones sin confirmar, las actualizaciones automáticas del muro no la pisan.
     Para qué sirve: que la app se sienta inmediata y no dependa de la velocidad del servidor. */
  const servidor = new Map();        // id → publicación tal como la confirmó el servidor
  let catsServidor = [];             // categorías confirmadas por el servidor
  const pendientes = [];             // acciones hechas en pantalla que el servidor todavía no confirmó, en orden: { k, id, t, quien, sesion, … }
  const cola = new Map();            // clave → promesa: las acciones de una misma publicación se mandan de a una y en orden
  let generacion = 0;                // sube cada vez que algo se confirma o se rechaza (descarta actualizaciones automáticas que quedaron "viejas")
  let sesion = 0;                    // sube al cambiar de identidad (se ignoran las respuestas de la sesión anterior)
  const fotosLocales = new Map();    // id → foto (dataURL) de publicaciones recién subidas (se ve al instante, sin pedirla al servidor)
  const AVISO_ERROR = { accion: 'No se pudo guardar el cambio', crear: 'No se pudo publicar', editar: 'No se pudieron guardar los cambios', borrar: 'No se pudo eliminar', 'cat+': 'No se pudo crear la categoría', 'cat-': 'No se pudo borrar la categoría' };

  /* ----- Copias locales de las reglas del servidor (functions/api/posts/…) ----- */
  /* corazón, voto, tildar, comentar y borrar comentario sobre una copia de la publicación */
  function aplicarAccion(p, op) {
    const c = op.cuerpo, q = clon(p), d = q.datos, quien = op.quien;
    if (c.accion === 'corazon') { const l = Array.isArray(d.corazones) ? d.corazones : []; d.corazones = l.includes(quien) ? l.filter((x) => x !== quien) : [...l, quien]; }
    else if (c.accion === 'voto' && Array.isArray(d.opciones) && d.opciones[c.opcion]) {
      const yaVotaba = d.opciones[c.opcion].votos.includes(quien);
      d.opciones.forEach((o) => { o.votos = o.votos.filter((x) => x !== quien); });      // un solo voto por persona
      if (!yaVotaba) d.opciones[c.opcion].votos.push(quien);                              // tocar tu opción otra vez quita el voto
    } else if (c.accion === 'item' && Array.isArray(d.items) && d.items[c.indice]) d.items[c.indice].hecho = !!c.hecho;
    else if (c.accion === 'comentar') { const l = Array.isArray(d.comentarios) ? d.comentarios : []; if (!l.some((x) => x.id === c.id)) d.comentarios = [...l, { id: c.id, autor: quien, texto: c.texto, creado: op.t }]; }
    else if (c.accion === 'borrar_comentario') d.comentarios = (Array.isArray(d.comentarios) ? d.comentarios : []).filter((x) => x.id !== c.id);
    return q;
  }
  /* Días de un plan a partir de lo que mandó el formulario (igual que construirDatos en comun.js): fechas sueltas conservan el estado de los días
     que ya estaban; con estados + "antes" se respeta lo elegido y, si hay un día seguro, los demás quedan descartados */
  function planLocal(previo, e) {
    const crudo = Array.isArray(e.dias) ? e.dias : [], conEstados = crudo.some((x) => x && typeof x === 'object'), mapa = new Map();
    crudo.forEach((x) => { const f = typeof x === 'string' ? x : x && x.f; if (f) mapa.set(f, conEstados && x && ORDEN_ESTADOS.includes(x.e) ? x.e : 'posible'); });
    const fechas = [...mapa.keys()].sort();
    let r;
    if (!conEstados) {
      const viejos = new Map((Array.isArray(previo.dias) ? previo.dias : []).map((x) => [x.f, x.e])), confirmado = [...viejos.values()].includes('seguro');
      r = { dias: fechas.map((f) => ({ f, e: viejos.has(f) ? viejos.get(f) : confirmado ? 'descartado' : 'posible' })), antes: { ...(previo.antes || {}) } };
      Object.keys(r.antes).forEach((f) => { if (!fechas.includes(f)) delete r.antes[f]; });
      if (confirmado) { fechas.forEach((f) => { if (!viejos.has(f)) r.antes[f] = 'posible'; }); if (!r.dias.some((x) => x.e === 'seguro')) restaurarDiasLocal(r); }
    } else {
      const seguros = fechas.filter((f) => mapa.get(f) === 'seguro'), antesIn = e.antes && typeof e.antes === 'object' ? e.antes : {};
      r = { dias: [], antes: {} };
      r.dias = fechas.map((f) => {
        if (!seguros.length || f === seguros[0]) return { f, e: mapa.get(f) };
        r.antes[f] = ORDEN_ESTADOS.includes(antesIn[f]) && antesIn[f] !== 'seguro' ? antesIn[f] : 'posible';
        return { f, e: 'descartado' };
      });
    }
    return { dias: r.dias, antes: r.antes, hora: e.hora || '', lugar: String(e.lugar || '').trim() };
  }
  const claveDePlan = (d) => JSON.stringify([(d.dias || []).map((x) => x.f), d.hora || '', d.lugar || '']);   // lo que cuenta como "editar" un plan (no el estado de los días)
  /* Publicación nueva tal como se va a ver (la misma que armará el servidor) */
  function postLocal(op) {
    const c = op.cuerpo, datos = { corazones: [], categorias: c.categorias || [] };
    if (c.tipo === 'lista') datos.items = c.datos.items.map((i) => ({ t: i.t, hecho: !!i.hecho }));
    else if (c.tipo === 'encuesta') datos.opciones = c.datos.opciones.map((t) => ({ t, votos: [] }));
    else if (c.tipo === 'foto') { datos.w = c.datos.w; datos.h = c.datos.h; }
    else if (c.tipo === 'link') datos.vista = {};                                          // la vista previa del sitio llega cuando responde el servidor
    else if (c.tipo === 'plan') Object.assign(datos, planLocal({}, c.datos));
    return { id: op.id, autor: op.quien, tipo: c.tipo, titulo: c.titulo || '', texto: c.texto || '', url: c.url || '', datos, imagen: c.tipo === 'foto', creado: op.t, actualizado: op.t };
  }
  /* Edición de una publicación propia (igual que PATCH /api/posts/ID): también marca "editado" si de verdad cambió algo */
  function aplicarEdicion(p, op, cats) {
    const c = op.cuerpo, q = clon(p), d = q.datos;
    if (c.titulo !== undefined) q.titulo = c.titulo;
    if (c.texto !== undefined) q.texto = c.texto;
    if (p.tipo === 'link' && c.url !== undefined && c.url !== p.url) { q.url = c.url; d.vista = {}; }
    if (p.tipo === 'lista' && c.datos && c.datos.items) d.items = c.datos.items.map((i) => ({ t: i.t, hecho: !!i.hecho }));
    if (p.tipo === 'plan' && c.datos) Object.assign(d, planLocal(p.datos, c.datos));
    if (c.categorias !== undefined) d.categorias = c.categorias.filter((id) => cats.some((x) => x.id === id));
    const cambio = q.titulo !== p.titulo || q.texto !== p.texto || q.url !== p.url || JSON.stringify(d.items || null) !== JSON.stringify(p.datos.items || null)
      || JSON.stringify(d.categorias || []) !== JSON.stringify(p.datos.categorias || []) || (p.tipo === 'plan' && claveDePlan(d) !== claveDePlan(p.datos));
    if (cambio) d.editado = op.t;
    return q;
  }

  /* ----- Motor ----- */
  const ocupado = (id) => planesPend.has(id) || pendientes.some((o) => o.id === id);   // ¿la publicación tiene cambios sin confirmar?
  /* Arma lo que se ve (servidor + acciones sin confirmar) y repinta */
  function recomponer() {
    const mapa = new Map(servidor);
    let cats = [...catsServidor];
    pendientes.forEach((o) => { if (o.k === 'cat+' && !cats.some((x) => x.id === o.cat.id)) cats.push(o.cat); else if (o.k === 'cat-') cats = cats.filter((x) => x.id !== o.id); });
    pendientes.forEach((o) => {
      const p = mapa.get(o.id);
      if (o.k === 'crear') mapa.set(o.id, o.post);
      else if (o.k === 'accion' && p) mapa.set(o.id, aplicarAccion(p, o));
      else if (o.k === 'editar' && p) mapa.set(o.id, aplicarEdicion(p, o, cats));
      else if (o.k === 'borrar') mapa.delete(o.id);
    });
    planesPend.forEach((e, id) => { const p = mapa.get(id); if (p) mapa.set(id, { ...p, datos: { ...p.datos, ...clonarDias(e.local) } }); });   // toques de días sin guardar
    categorias = cats;
    posts = [...mapa.values()].sort((a, b) => b.creado - a.creado);
    pintar();
    if (!$('modalNuevo').hidden) pintarCatsComposer();                    // la lista de categorías del formulario sigue a los cambios
  }
  /* Une la acción a la lista, la muestra YA y la manda en segundo plano */
  function encolar(op) {
    op.t = Date.now(); op.quien = yo; op.sesion = sesion;
    pendientes.push(op);
    recomponer();
    enCola(op.k.startsWith('cat') ? 'cats' : op.id, () => ejecutar(op));
  }
  /* Ejecuta fn cuando terminen las anteriores de la misma clave (fn nunca falla: atrapa sus errores) */
  function enCola(clave, fn) {
    const sig = (cola.get(clave) || Promise.resolve()).then(fn);
    cola.set(clave, sig);
    sig.finally(() => { if (cola.get(clave) === sig) cola.delete(clave); });
    return sig;
  }
  async function ejecutar(op) {
    if (op.sesion !== sesion) return;
    let recargar = false;
    try {
      if (op.k === 'crear' || op.k === 'editar') { const c = cola.get('cats'); if (c) await c; }   // las categorías nuevas se crean antes de usarlas
      if (op.k === 'accion') { const r = await api(`/posts/${op.id}/accion`, { metodo: 'POST', cuerpo: op.cuerpo }); if (op.sesion === sesion) servidor.set(op.id, r.post); }
      else if (op.k === 'crear') { const r = await api('/posts', { metodo: 'POST', cuerpo: { ...op.cuerpo, id: op.id } }); if (op.sesion === sesion) servidor.set(r.post.id, r.post); }
      else if (op.k === 'editar') { const r = await api(`/posts/${op.id}`, { metodo: 'PATCH', cuerpo: op.cuerpo }); if (op.sesion === sesion) servidor.set(op.id, r.post); }
      else if (op.k === 'borrar') { await api(`/posts/${op.id}`, { metodo: 'DELETE' }); servidor.delete(op.id); }
      else if (op.k === 'cat+') { const r = await api('/categorias', { metodo: 'POST', cuerpo: op.cuerpo }); catsServidor = [...catsServidor.filter((x) => x.id !== r.categoria.id), r.categoria]; }
      else if (op.k === 'cat-') { await api(`/categorias/${op.id}`, { metodo: 'DELETE' }); catsServidor = catsServidor.filter((x) => x.id !== op.id); }
    } catch (e) {
      if (op.sesion !== sesion) return;
      recargar = true;
      if (op.k === 'borrar' && e.status === 404) { servidor.delete(op.id); recargar = false; }     // ya no existía: era justo lo que se quería
      else {
        avisar(`${AVISO_ERROR[op.k] || 'No se pudo guardar'}: ${e.message}`, 'error');
        if (op.k === 'cat+') { catsElegidas.delete(op.id); }
        if (op.k === 'accion' && op.cuerpo.accion === 'comentar') {                              // el comentario no se pierde: vuelve al cuadro
          borradores.set(op.id, op.cuerpo.texto);
          const campo = nodos.get(op.id) && nodos.get(op.id).querySelector('.comentar__campo');
          if (campo && !campo.value) { campo.value = op.cuerpo.texto; campo.dispatchEvent(new Event('input')); }
        }
        if (op.form) restaurarFormulario(op);
      }
    }
    if (op.sesion !== sesion) return;
    pendientes.splice(pendientes.indexOf(op), 1);
    generacion++; ultimaFirma = ''; ultimaFirmaCats = '';                // la próxima actualización automática vuelve a comparar todo
    recomponer();
    if (recargar) cargar();                                              // se vuelve a lo que dice el servidor
  }
  /* Acción rápida sobre una publicación: corazón, voto, tildar, comentar, borrar comentario */
  function accion(p, cuerpo) { encolar({ k: 'accion', id: p.id, cuerpo }); }

  /* ----- Toques sobre los días de un plan (v2.6, ahora dentro del motor) -----
     Cada toque cambia el día en pantalla al instante; el guardado se hace cuando se dejó de tocar (ESPERA_DIA ms): se manda en una sola petición la
     secuencia de toques y el servidor la repite igual. Si el servidor la rechaza, el plan vuelve a como estaba guardado. */
  const ESPERA_DIA = 600;
  const planesPend = new Map();   // id de publicación → { local: estado de días en pantalla, ops: toques sin enviar, timer, enVuelo }
  function tocarDia(p, fecha) {
    let e = planesPend.get(p.id);
    if (!e) { e = { local: clonarDias(p.datos), ops: [], timer: 0, enVuelo: false }; planesPend.set(p.id, e); }
    if (!e.local.dias.some((x) => x.f === fecha)) return;
    const sig = siguienteEstadoDia(e.local, fecha);
    if (!ponerEstadoDiaLocal(e.local, fecha, sig)) return;
    e.ops.push({ fecha, estado: sig });
    recomponer();                                                        // se ve al instante
    clearTimeout(e.timer); e.timer = setTimeout(() => enviarDias(p.id), ESPERA_DIA);
  }
  function enviarDias(id, ya) {
    const e = planesPend.get(id);
    if (!e || e.enVuelo || !e.ops.length) return;
    const lote = e.ops, ses = sesion; e.ops = []; e.enVuelo = true;
    const trabajo = async () => {
      if (ses !== sesion) return;
      try {
        const r = await api(`/posts/${id}/accion`, { metodo: 'POST', cuerpo: { accion: 'dia', cambios: lote }, keepalive: true });
        e.enVuelo = false; servidor.set(id, r.post);
        if (e.ops.length) { clearTimeout(e.timer); e.timer = setTimeout(() => enviarDias(id), ESPERA_DIA); }   // hubo más toques mientras se guardaba
        else planesPend.delete(id);
      } catch (err) {
        planesPend.delete(id); avisar(`${AVISO_ERROR.accion}: ${err.message}`, 'error');
        generacion++; ultimaFirma = ''; recomponer(); cargar();          // se vuelve a lo que quedó guardado
        return;
      }
      generacion++; ultimaFirma = ''; recomponer();
    };
    return ya ? trabajo() : enCola(id, trabajo);
  }
  /* Si se sale de la app con toques sin guardar, se guardan ya (sin esperar) */
  const guardarDiasYa = () => planesPend.forEach((e, id) => { clearTimeout(e.timer); enviarDias(id, true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarDiasYa(); });
  window.addEventListener('pagehide', guardarDiasYa);


  /* Chips de filtro por tipo (Todo + uno por tipo) */
  const chipsTipo = [['', 'apps', 'Todo'], ...Object.entries(TIPOS).map(([k, t]) => [k, t.icono, t.nombre])];
  chipsTipo.forEach(([valor, ic, texto]) => {
    const c = h('button', { class: 'chip' + (valor === '' ? ' chip--activo' : ''), type: 'button', 'data-tipo': valor }, icono(ic), h('span', { text: texto }));
    c.addEventListener('click', () => {
      filtro.tipo = valor;
      document.querySelectorAll('#filtroTipos .chip').forEach((x) => x.classList.toggle('chip--activo', x === c));
      if (vista !== 'muro') mostrarVista('muro');   // v2.8: si se estaba viendo un perfil, tocar Todo / Nota / Lista… vuelve al muro
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
  /* ----- v2.1: fila de categorías (debajo de los filtros) -----
     Qué hace: muestra en horizontal "Todas", "Sin categoría", una ficha por cada categoría existente (con su icono y cuántas publicaciones
     tiene) y "Nueva". Si no entran, la fila se desliza hacia los lados (dedo, rueda del mouse o barra); los bordes se difuminan para avisar
     que hay más. Para qué sirve: filtrar el muro por categoría con un toque. */
  const barraCats = $('filtroCategorias');
  /* Pone/quita la difuminación de los bordes según haya más fichas escondidas a la izquierda o a la derecha */
  function bordesBarra() {
    barraCats.classList.toggle('sc-izq', barraCats.scrollLeft > 4);
    barraCats.classList.toggle('sc-der', barraCats.scrollLeft + barraCats.clientWidth < barraCats.scrollWidth - 4);
  }
  barraCats.addEventListener('scroll', bordesBarra, { passive: true });
  window.addEventListener('resize', bordesBarra);
  /* Rueda del mouse: desliza la fila de lado (solo si hay algo escondido en esa dirección; si no, la página sigue su scroll normal) */
  barraCats.addEventListener('wheel', (e) => {
    if (barraCats.scrollWidth <= barraCats.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const alFinal = barraCats.scrollLeft + barraCats.clientWidth >= barraCats.scrollWidth - 1;
    if ((e.deltaY < 0 && barraCats.scrollLeft <= 0) || (e.deltaY > 0 && alFinal)) return;
    barraCats.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });

  /* Cambia el filtro de categoría (tocar la que ya está elegida la quita). subir = true cuando se toca desde una tarjeta: sube para ver el resultado */
  function elegirCategoria(valor, subir) {
    filtro.cat = filtro.cat === valor && valor !== '' ? '' : valor;
    pintar();
    if (subir) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function pintarFiltroCategorias() {
    const ids = new Set(categorias.map((c) => c.id));
    if (filtro.cat && filtro.cat !== '__sin' && !ids.has(filtro.cat)) filtro.cat = '';   // la categoría elegida ya no existe (la borraron)
    const conteo = new Map(); let sin = 0;
    posts.forEach((p) => { const cs = catsDe(p); if (!cs.length) sin++; cs.forEach((c) => conteo.set(c.id, (conteo.get(c.id) || 0) + 1)); });
    const ficha = (valor, ic, texto, n, autor) => h('button', { class: 'chip chip--cat' + (filtro.cat === valor ? ' chip--activo' : ''), type: 'button', 'data-cat': valor, 'data-autor': autor, 'aria-pressed': String(filtro.cat === valor), onclick: () => elegirCategoria(valor) },
      icono(ic), h('span', { text: texto }), n != null ? h('span', { class: 'chip__n', text: String(n) }) : null);
    const x = barraCats.scrollLeft;                                     // se conserva el desplazamiento al repintar
    barraCats.replaceChildren(
      ficha('', 'category', 'Todas', posts.length), ficha('__sin', 'label_off', 'Sin categoría', sin),
      ...categorias.map((c) => ficha(c.id, c.icono, c.nombre, conteo.get(c.id) || 0, c.autor)),
      h('button', { class: 'chip chip--nueva', type: 'button', onclick: () => abrirNuevaCategoria() }, icono('add'), h('span', { text: 'Nueva' })));
    barraCats.scrollLeft = x; bordesBarra();
  }

  /* Buscador: título, texto, link, elementos de lista y opciones de encuesta */
  $('buscador').addEventListener('input', (e) => { filtro.q = normalizar(e.target.value.trim()); pintar(); });
  $('buscador').addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.value) { e.target.value = ''; filtro.q = ''; pintar(); } });

  /* v2.1: categorías de una publicación (solo las que existen todavía), en el orden en que se crearon */
  function catsDe(p) {
    const ids = new Set((p.datos && p.datos.categorias) || []);
    return categorias.filter((c) => ids.has(c.id));
  }
  /* Texto buscable de una publicación (v2.1: también el nombre de sus categorías) */
  function textoDe(p) {
    const d = p.datos || {};
    return normalizar([p.titulo, p.texto, p.url, p.autor, (d.items || []).map((i) => i.t).join(' '), (d.opciones || []).map((o) => o.t).join(' '), d.vista && d.vista.titulo, catsDe(p).map((c) => c.nombre).join(' '), (d.comentarios || []).map((c) => c.texto).join(' ')].join(' '));   // v2.2: también se buscan los comentarios
  }
  /* v2.1: ¿pasa el filtro de categoría? '' = todas; '__sin' = ninguna categoría; si no, debe tener esa categoría */
  const pasaCategoria = (p) => !filtro.cat || (filtro.cat === '__sin' ? !catsDe(p).length : catsDe(p).some((c) => c.id === filtro.cat));
  const pasaFiltro = (p) => (!filtro.tipo || p.tipo === filtro.tipo) && (!filtro.autor || p.autor === filtro.autor) && pasaCategoria(p) && (!filtro.q || filtro.q.split(/\s+/).every((w) => textoDe(p).includes(w)));

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
  /* v2.1: texto de "editado hace…" para una publicación modificada ("editado hace 5 minutos", "editado ayer", "editado el 3 nov 2026") */
  function horaEditado(ts) {
    const t = hora(ts);
    if (t === 'ahora') return 'editado hace un momento';
    return /^(hace|ayer|anteayer|antes)/.test(t) ? `editado ${t}` : `editado el ${t}`;
  }
  /* Refresca las horas cada minuto (la de publicación y la de "editado") */
  setInterval(() => {
    document.querySelectorAll('time[data-ts]').forEach((t) => { t.textContent = hora(Number(t.dataset.ts)); });
    document.querySelectorAll('time[data-ed]').forEach((t) => { t.textContent = horaEditado(Number(t.dataset.ed)); });
  }, 60000);

  const sitioDe = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };
  /* ----- Texto con formato (NUEVO v2.1; v2.2: marcas como en WhatsApp) -----
     Qué hace: convierte el texto escrito con marcas simples en elementos con formato, igual que WhatsApp: *negrita*, _cursiva_, ~tachado~,
     ```monoespaciado```, `código`, [texto](https://link), links sueltos, # títulos, > citas, - listas, 1. listas numeradas y ``` bloques ```.
     Seguridad: se construye con h() (textContent), nunca con innerHTML; solo se aceptan links http(s). Lo que no se reconoce queda como texto.
     Para qué sirve: poder escribir notas y descripciones con distintos tipos de texto. */
  const enlace = (url, hijos) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, hijos);
  /* Marcas dentro de una línea (como en WhatsApp). Grupos: 1 ```mono``` · 2 `código` · 3/4 *negrita* · 5/6 ~tachado~ · 7/8 _cursiva_ · 9/10/11 [texto](url) · 12 link suelto.
     v2.2: antes la negrita era **así** y el tachado ~~así~~; ahora es *así* y ~así~. Lo escrito entre marcas no puede empezar ni terminar con espacio. */
  const MD_INLINE = '(```[^`\\n]+```)|(`[^`\\n]+`)|(\\*([^\\s*](?:[^*\\n]*?[^\\s*])?)\\*)|(~([^\\s~](?:[^~\\n]*?[^\\s~])?)~)|(\\b_([^\\s_](?:[^_\\n]*?[^\\s_])?)_\\b)|(\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\))|(https?:\\/\\/[^\\s<]+)';
  /* v2.7: sinEnlaces = true dentro de botones (elementos de lista, opciones de encuesta): ahí un link no puede ser clicable, se muestra como texto */
  function inline(texto, sinEnlaces) {
    const re = new RegExp(MD_INLINE, 'g'), out = [];          // una expresión nueva por llamada: la función se llama a sí misma (negrita dentro de cursiva…)
    let ultimo = 0, m;
    while ((m = re.exec(texto))) {
      if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
      if (m[1]) out.push(h('code', { text: m[1].slice(3, -3) }));
      else if (m[2]) out.push(h('code', { text: m[2].slice(1, -1) }));
      else if (m[3]) out.push(h('strong', {}, inline(m[4], sinEnlaces)));
      else if (m[5]) out.push(h('del', {}, inline(m[6], sinEnlaces)));
      else if (m[7]) out.push(h('em', {}, inline(m[8], sinEnlaces)));
      else if (m[9]) out.push(sinEnlaces ? m[10] : enlace(m[11], m[10]));
      else if (sinEnlaces) out.push(m[12]);
      else {                                                   // link suelto: se le saca la puntuación final ("mira https://x.com.")
        let url = m[12], resto = '';
        const f = url.match(/[.,;:!?)\]]+$/);
        if (f) { resto = f[0]; url = url.slice(0, -resto.length); }
        out.push(enlace(url, url)); if (resto) out.push(resto);
      }
      ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) out.push(texto.slice(ultimo));
    return out;
  }
  /* Varias líneas seguidas de un mismo párrafo/cita: se conserva cada salto de línea */
  function lineasInline(lineas) {
    const out = [];
    lineas.forEach((l, k) => { if (k) out.push(h('br')); out.push(...inline(l)); });
    return out;
  }
  const MD_BLOQUE = /^(#{1,3}\s|>|```|\s*[-*+]\s|\s*\d+[.)]\s)/;   // línea que empieza un bloque nuevo (título, cita, código, lista)
  /* Texto → <div class="md …"> con párrafos, títulos, citas, listas y código. clase = clases extra del contenedor */
  function md(texto, clase = '') {
    const caja = h('div', { class: ('md ' + clase).trim() }), ls = String(texto).replace(/\r\n?/g, '\n').split('\n');
    let i = 0, m;
    while (i < ls.length) {
      const l = ls[i];
      if (!l.trim()) { i++; continue; }
      if (/^```/.test(l) && !/^```[^`]+```\s*$/.test(l)) {          // bloque de código (una línea ```así``` es monoespaciado normal y se trata como texto)
        const cod = []; i++;
        while (i < ls.length && !/^```/.test(ls[i])) cod.push(ls[i++]);
        i++; caja.append(h('pre', {}, h('code', { text: cod.join('\n') }))); continue;
      }
      if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { caja.append(h('div', { class: `md-h md-h${m[1].length}`, role: 'heading', 'aria-level': String(m[1].length + 2) }, inline(m[2]))); i++; continue; }
      if (/^>/.test(l)) {                                            // cita
        const q = []; while (i < ls.length && /^>/.test(ls[i])) q.push(ls[i++].replace(/^>\s?/, ''));
        caja.append(h('blockquote', {}, lineasInline(q))); continue;
      }
      if (/^\s*[-*+]\s+/.test(l)) {                                  // lista con viñetas
        const it = []; while (i < ls.length && /^\s*[-*+]\s+/.test(ls[i])) it.push(ls[i++].replace(/^\s*[-*+]\s+/, ''));
        caja.append(h('ul', {}, it.map((t) => h('li', {}, inline(t))))); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(l)) {                                // lista numerada
        const it = []; while (i < ls.length && /^\s*\d+[.)]\s+/.test(ls[i])) it.push(ls[i++].replace(/^\s*\d+[.)]\s+/, ''));
        caja.append(h('ol', {}, it.map((t) => h('li', {}, inline(t))))); continue;
      }
      const p = [];                                                  // párrafo: hasta una línea vacía o el comienzo de otro bloque
      while (i < ls.length && ls[i].trim() && (!p.length || !MD_BLOQUE.test(ls[i]))) p.push(ls[i++]);
      caja.append(h('p', {}, lineasInline(p)));
    }
    return caja;
  }

  /* ----- Cuerpo de cada tipo de publicación ----- */
  function cuerpoPost(p) {
    const d = p.datos || {}, partes = [];
    if (p.titulo) partes.push(h('h3', { class: 'post__titulo' }, inline(p.titulo)));   // v2.7: el título acepta formato (negrita, cursiva…)
    /* v2.7: la lista y la encuesta también tienen descripción; va justo debajo del título (en los demás tipos sigue al final) */
    const descripcion = p.texto ? md(p.texto, 'post__texto') : null;   // v2.1: texto con formato (negrita, cursiva, listas, links…)
    const descArriba = p.tipo === 'lista' || p.tipo === 'encuesta';
    if (descripcion && descArriba) partes.push(descripcion);

    if (p.tipo === 'foto') {
      const src = fotosLocales.get(p.id) || `/api/imagen/${p.id}`;      // v2.7: una foto recién subida se ve con la copia local, sin pedirla al servidor
      const img = h('img', { class: 'post__foto', src, alt: p.titulo || p.texto || 'Foto', loading: 'lazy', decoding: 'async', onclick: () => abrirVisor(src, p.titulo || p.texto) });
      if (d.w && d.h) img.style.aspectRatio = `${d.w} / ${d.h}`;       // reserva el alto: el muro no "salta" al cargar la foto
      partes.push(img);
    }
    if (p.tipo === 'plan') partes.push(cuerpoPlan(p));   // v2.3: días con estados, hora y lugar
    if (p.tipo === 'link') partes.push(tarjetaEnlace(p, d.vista || {}, 'open_in_new'));

    if (p.tipo === 'lista') {
      const items = d.items || [], hechos = items.filter((i) => i.hecho).length, pct = items.length ? Math.round(hechos * 100 / items.length) : 0;
      const completa = items.length > 0 && hechos === items.length;     // v2.7: al 100 % casillas y línea se ponen verdes y aparece el cuadro COMPLETADO
      partes.push(h('div', { class: 'lista-bloque' + (completa ? ' lista-bloque--completa' : '') },
        /* v2.7: solo el TEXTO se tacha (span .lista__texto); la casilla ya no. El texto acepta formato (sin links: el elemento es un botón) */
        h('div', { class: 'lista' }, items.map((it, i) => h('button', { class: 'lista__item' + (it.hecho ? ' hecho' : ''), type: 'button', 'aria-pressed': String(!!it.hecho), onclick: () => accion(p, { accion: 'item', indice: i, hecho: !it.hecho }) },
          icono(it.hecho ? 'check_box' : 'check_box_outline_blank', it.hecho), h('span', { class: 'lista__texto' }, inline(it.t, true))))),
        h('div', { class: 'progreso', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, style: `--valor:${pct}%` }, h('div', { class: 'progreso__barra' })),
        h('span', { class: 'progreso__texto', text: `${hechos} de ${items.length} · ${pct}%` }),
        completa ? h('div', { class: 'completado', role: 'status' }, icono('task_alt', true), h('span', { text: 'COMPLETADO' })) : null));
    }
    if (p.tipo === 'encuesta') {
      const ops = d.opciones || [], total = ops.reduce((s, o) => s + o.votos.length, 0);
      partes.push(h('div', { class: 'encuesta' }, ops.map((o, i) => {
        const nM = o.votos.filter((v) => v === 'M').length, ancho = total ? Math.round(o.votos.length * 100 / total) : 0, corte = o.votos.length ? Math.round(nM * 100 / o.votos.length) : 50;
        return h('button', { class: 'opcion' + (o.votos.includes(yo) ? ' opcion--mia' : ''), type: 'button', 'aria-pressed': String(o.votos.includes(yo)), onclick: () => accion(p, { accion: 'voto', opcion: i }) },
          h('span', { class: 'opcion__barra', style: `--ancho:${ancho}%;--corte:${corte}%` }),
          h('span', { class: 'opcion__texto' }, inline(o.t, true)),   // v2.7: la opción acepta formato
          h('span', { class: 'opcion__votos' }, o.votos.map((v) => avatar(v, 'avatar--mini'))));
      })));
      partes.push(h('span', { class: 'progreso__texto', text: total ? `${total} ${total === 1 ? 'voto' : 'votos'}` : 'Todavía nadie votó' }));
    }
    if (descripcion && !descArriba) partes.push(descripcion);
    return partes;
  }
  /* ----- Plan (NUEVO v2.3) -----
     Qué hace: muestra el plan con sus días ordenados por fecha. Cada día es un botón con su estado (posible, ideal, descartado, seguro);
     al tocarlo cualquiera de los dos pasa al siguiente estado: posible → ideal → descartado → seguro. Solo puede haber UN día seguro:
     al marcarlo, el plan queda "Confirmado" y los demás días se descartan; tocar el día seguro lo quita y todo vuelve a como estaba.
     Con el plan confirmado, tocar otro día lo pasa a ser el seguro. Hora y lugar se muestran solo si se cargaron.
     Para qué sirve: decidir juntos en qué día se hace un plan (ej.: sábado o domingo según el clima). */
  function cuerpoPlan(p) {
    const d = p.datos || {}, dias = Array.isArray(d.dias) ? d.dias : [], seguro = dias.find((x) => x.e === 'seguro'), hoy = hoyISO();
    const partes = [];
    /* Estado general del plan y cuenta regresiva (solo si hay un día seguro) */
    if (seguro) {
      const faltan = Math.round((aFecha(seguro.f) - aFecha(hoy)) / 86400000);
      const cuando = faltan < 0 ? 'Ya pasó' : faltan === 0 ? 'Es hoy' : faltan === 1 ? 'Es mañana' : `Faltan ${faltan} días`;
      partes.push(h('div', { class: 'plan__estado plan__estado--confirmado' }, icono('event_available', true), h('span', { text: `Confirmado: ${etiquetaDia(seguro.f)}` }), h('span', { class: 'plan__cuando', text: cuando })));
    } else {
      partes.push(h('div', { class: 'plan__estado' }, icono('pending'), h('span', { text: dias.length > 1 ? 'Por definir el día' : 'Por confirmar' })));
    }
    /* Hora y lugar (opcionales): si el lugar es un link se abre tal cual; si es un texto, se ofrece buscarlo en el mapa */
    if (d.hora || d.lugar) {
      const esUrl = /^https?:\/\/\S+$/i.test(d.lugar || '');
      partes.push(h('div', { class: 'plan__datos' },
        d.hora ? h('span', { class: 'plan__dato' }, icono('schedule'), h('span', { text: d.hora })) : null,
        d.lugar ? h('span', { class: 'plan__dato' }, icono('location_on'),
          esUrl ? enlace(d.lugar, sitioDe(d.lugar)) : h('span', { text: d.lugar }),
          esUrl ? null : h('a', { class: 'plan__mapa', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.lugar), target: '_blank', rel: 'noopener noreferrer', title: 'Ver en el mapa', 'aria-label': 'Ver en el mapa' }, icono('map'))) : null));
    }
    /* Días: botones que cambian de estado al tocarlos */
    partes.push(h('div', { class: 'plan__dias' + (seguro ? ' plan__dias--confirmado' : ''), role: 'group', 'aria-label': 'Días del plan' }, dias.map((dia) => {
      const est = ESTADOS_DIA[dia.e] || ESTADOS_DIA.posible;
      const sig = siguienteEstadoDia({ dias }, dia.f);                   // v2.6: la misma regla que usa el toque
      const ayuda = seguro ? (dia.e === 'seguro' ? 'Quitar el día seguro' : 'Elegir este como día seguro') : `Pasar a "${ESTADOS_DIA[sig].nombre.toLowerCase()}"`;
      return h('button', { class: `dia dia--${dia.e}` + (dia.f < hoy ? ' dia--pasado' : ''), type: 'button', title: ayuda, 'aria-label': `${etiquetaDia(dia.f)}: ${est.nombre.toLowerCase()}. ${ayuda}`, onclick: () => tocarDia(p, dia.f) },   // v2.6: cambio instantáneo, se guarda al dejar de tocar
        icono(est.icono, dia.e === 'seguro' || dia.e === 'ideal'), h('span', { class: 'dia__fecha', text: etiquetaDia(dia.f) }), h('span', { class: 'dia__estado', text: est.nombre }));
    })));
    if (!seguro && dias.length) partes.push(h('span', { class: 'progreso__texto', text: 'Toca un día para cambiar su estado: posible, ideal, descartado o seguro.' }));
    return h('div', { class: 'plan' }, partes);
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

  /* ----- Comentarios (NUEVO v2.2) -----
     Qué hace: bajo cada publicación se puede desplegar una sección de comentarios; cada comentario lleva el color de quien lo escribió
     (azul M / rojo xB), acepta el mismo formato de texto de WhatsApp y solo su autor puede borrarlo.
     Para qué sirve: conversar sobre las publicaciones, también las del otro. */
  function seccionComentarios(p) {
    const coms = (p.datos && p.datos.comentarios) || [];
    /* v2.7: data-rico = acepta formato (barra flotante y Ctrl+B/I/K). El comentario se ve al instante (accion() lo agrega en pantalla y lo manda en segundo plano) */
    const campo = h('textarea', { class: 'campo__entrada comentar__campo', rows: '1', maxlength: '500', placeholder: 'Escribe un comentario…', 'aria-label': 'Escribir un comentario', 'data-rico': 'flota' });
    campo.value = borradores.get(p.id) || '';
    campo.addEventListener('input', () => { borradores.set(p.id, campo.value); campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight, 120) + 'px'; });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviarComentario(p, campo); } });   // Enter envía; Shift+Enter hace un salto de línea
    return h('div', { class: 'comentarios' },
      coms.map((c) => h('div', { class: 'comentario', 'data-autor': c.autor, 'data-k': c.id },
        h('div', { class: 'comentario__cab' },
          avatar(c.autor, 'avatar--mini'),
          h('time', { class: 'comentario__hora', 'data-ts': c.creado, text: hora(c.creado), title: new Date(c.creado).toLocaleString('es-AR') }),
          c.autor === yo ? h('button', { class: 'comentario__borrar', type: 'button', 'aria-label': 'Borrar comentario', title: 'Borrar comentario', onclick: () => borrarComentario(p, c) }, icono('close')) : null),
        md(c.texto, 'comentario__texto'))),
      h('div', { class: 'comentar', 'data-k': 'nuevo' }, campo,
        /* el cuadro de comentario se conserva al actualizar la tarjeta (ver morph), por eso el botón lo busca en la página en vez de usar esta copia */
        h('button', { class: 'btn-icono comentar__enviar', type: 'button', 'aria-label': 'Enviar comentario', title: 'Enviar', onclick: (e) => enviarComentario(p, e.currentTarget.closest('.comentar').querySelector('textarea')) }, icono('send'))));
  }
  /* Manda el comentario escrito: se vacía el cuadro y el comentario aparece al instante (si el servidor falla, vuelve al cuadro con un aviso) */
  function enviarComentario(p, campo) {
    const texto = campo.value.trim(); if (!texto) return;
    campo.value = ''; campo.style.height = 'auto'; borradores.delete(p.id);
    accion(p, { accion: 'comentar', texto, id: uuid() });
  }
  async function borrarComentario(p, c) {
    if (!(await confirmar({ titulo: 'Borrar comentario', texto: 'Se borrará tu comentario y no se puede deshacer.', boton: 'Borrar' }))) return;
    accion(p, { accion: 'borrar_comentario', id: c.id });
  }
  /* Despliega / pliega los comentarios de una publicación (el cambio de huella en pintar() repinta la tarjeta) */
  function alternarComentarios(p) {
    if (comentariosAbiertos.has(p.id)) comentariosAbiertos.delete(p.id); else comentariosAbiertos.add(p.id);
    pintar();
    if (comentariosAbiertos.has(p.id)) { const c = nodos.get(p.id) && nodos.get(p.id).querySelector('.comentar__campo'); if (c) c.focus(); }
  }

  /* ----- Tarjeta completa ----- */
  function crearTarjeta(p) {
    const mia = p.autor === yo, cor = (p.datos && p.datos.corazones) || [], meGusta = cor.includes(yo);
    const nComs = ((p.datos && p.datos.comentarios) || []).length, abiertos = comentariosAbiertos.has(p.id);   // v2.2
    const editado = (p.datos && p.datos.editado) || 0, cats = catsDe(p);
    const tarjeta = h('article', { class: 'post', 'data-autor': p.autor, 'data-id': p.id },
      h('div', { class: 'post__cab' },
        h('span', { class: 'autor' }, avatar(p.autor, 'avatar--autor'), h('time', { class: 'autor__hora', 'data-ts': p.creado, text: hora(p.creado), title: new Date(p.creado).toLocaleString('es-AR') })),
        h('span', { class: 'material-symbols-rounded post__tipo', text: (TIPOS[p.tipo] || TIPOS.nota).icono, 'aria-hidden': 'true' })),   // icono del tipo (nota, lista…) a la derecha
      /* v2.1: "editado hace…" solo si la publicación fue modificada después de subirla */
      editado ? h('span', { class: 'post__editado' }, icono('edit'), h('time', { 'data-ed': editado, text: horaEditado(editado), title: new Date(editado).toLocaleString('es-AR') })) : null,
      ...cuerpoPost(p),
      /* v2.1: categorías de la publicación; tocar una filtra el muro por ella */
      cats.length ? h('div', { class: 'post__cats' }, cats.map((c) => h('button', { class: 'post__cat', type: 'button', title: `Ver la categoría ${c.nombre}`, onclick: () => elegirCategoria(c.id, true) }, icono(c.icono), h('span', { text: c.nombre })))) : null,
      h('div', { class: 'post__pie' },
        h('button', { class: 'post__accion post__accion--corazon' + (meGusta ? ' activo' : ''), type: 'button', 'aria-pressed': String(meGusta), 'aria-label': 'Me gusta', onclick: () => accion(p, { accion: 'corazon' }) },
          icono('favorite', meGusta), cor.length ? h('span', { class: 'corazones' }, cor.map((q) => avatar(q, 'avatar--mini'))) : null),
        /* v2.2: botón de comentarios con su cantidad; despliega/pliega la sección */
        h('button', { class: 'post__accion post__accion--comentar' + (abiertos ? ' activo' : ''), type: 'button', 'aria-expanded': String(abiertos), 'aria-label': nComs ? `Comentarios (${nComs})` : 'Comentar', onclick: () => alternarComentarios(p) },
          icono('chat_bubble', abiertos || nComs > 0), nComs ? h('span', { class: 'contador', text: String(nComs) }) : null),
        mia ? h('button', { class: 'post__accion post__accion--der', type: 'button', 'aria-label': 'Editar', onclick: () => abrirEditor(p) }, icono('edit')) : null,   // v2.7: las encuestas también se editan (pregunta y descripción)
        mia ? h('button', { class: 'post__accion post__accion--peligro', type: 'button', 'aria-label': 'Eliminar', onclick: () => borrar(p) }, icono('delete')) : null),
      abiertos ? seccionComentarios(p) : null);                        // v2.2: sección de comentarios (solo si está desplegada)
    /* v2.7: cada bloque de la tarjeta lleva una clave (su primera clase) para que morph() los empareje aunque aparezca o desaparezca alguno (p. ej. "editado") */
    [...tarjeta.children].forEach((c) => c.setAttribute('data-k', c.className.split(' ')[0] || c.tagName));
    return tarjeta;
  }

  /* Pinta el muro: crea las tarjetas nuevas, ACTUALIZA EN EL LUGAR las que cambiaron (v2.7: morph, así las transiciones se animan), saca con
     animación las que ya no están y las ordena. Solo las tarjetas recién aparecidas llevan la animación de entrada. */
  function salirTarjeta(el) {
    el.classList.remove('entra'); el.classList.add('sale');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 450);                                  // respaldo por si la animación no corre (pestaña oculta)
  }
  function pintar() {
    const lista = posts.filter(pasaFiltro), muro = $('muro');
    const visibles = new Set(lista.map((p) => p.id));
    nodos.forEach((el, id) => { if (!visibles.has(id)) { nodos.delete(id); salirTarjeta(el); } });   // borradas (desde cualquier dispositivo) o filtradas
    let orden = 0;
    const ordenadas = [];
    lista.forEach((p) => {
      /* v2.7: la huella es el CONTENIDO de la publicación (no solo "actualizado"): así una acción instantánea (que todavía no tiene hora del servidor)
         también repinta, y la confirmación del servidor, que deja el mismo contenido, no vuelve a tocar la tarjeta */
      const firma = JSON.stringify([p.titulo, p.texto, p.url, p.datos, p.imagen, yo, catsDe(p).map((c) => [c.id, c.nombre, c.icono]), comentariosAbiertos.has(p.id), p.tipo === 'plan' ? hoyISO() : 0]);   // v2.3: los planes se repintan al cambiar el día (cuenta regresiva)
      let el = nodos.get(p.id);
      if (!el) {                                                         // tarjeta que recién aparece: entra con animación en cascada
        el = crearTarjeta(p); el._firma = firma;
        el.classList.add('entra'); el.style.setProperty('--i', Math.min(orden++, 10));
        el.addEventListener('animationend', () => el.classList.remove('entra'), { once: true });   // para que no se repita si se mueve de lugar
        nodos.set(p.id, el);
      } else if (el._firma !== firma) { morph(el, crearTarjeta(p), true); el._firma = firma; }
      ordenadas.push(el);
    });
    /* Orden: cada tarjeta va en su lugar (las que están saliendo con animación se saltean) */
    let cursor = muro.firstChild;
    ordenadas.forEach((el) => {
      while (cursor && cursor.classList && cursor.classList.contains('sale')) cursor = cursor.nextSibling;
      if (cursor === el) cursor = cursor.nextSibling; else muro.insertBefore(el, cursor);
    });
    const n = lista.length;
    $('cuenta').textContent = `${n} ${n === 1 ? 'publicación' : 'publicaciones'}`;
    $('cargando').hidden = true;
    $('vacio').hidden = n > 0;
    $('vacioTexto').textContent = posts.length ? 'No hay nada que coincida con ese filtro.' : 'Todavía no hay nada en el muro. ¡Toca el botón + y sube lo primero!';
    pintarFiltroCategorias();            // v2.1: los contadores de cada categoría siguen a las publicaciones
  }

  /* Pide las publicaciones al servidor (el navegador reutiliza la respuesta si nada cambió gracias al ETag) y repinta solo si cambió algo */
  let cargando = false;
  async function cargar() {
    if (!yo || cargando) return;
    cargando = true;
    cargarAvisos();                      // v2.5: cada vez que se actualiza el muro también se piden las notificaciones
    const gen = generacion, ses = sesion;
    try {
      /* v2.1: se piden juntas las publicaciones y las categorías; si las categorías fallan (ej. sin conexión) se siguen usando las que ya había */
      const [r, rc] = await Promise.all([api('/posts'), api('/categorias').catch(() => null)]);
      /* v2.7: si mientras tanto se confirmó o rechazó algo (o cambió la sesión), esta respuesta pudo quedar vieja: se descarta y la próxima actualización la trae */
      if (gen !== generacion || ses !== sesion) return;
      let cambioCats = false;
      if (rc && !pendientes.some((o) => o.k.startsWith('cat'))) { const fc = JSON.stringify(rc.categorias); if (fc !== ultimaFirmaCats) { ultimaFirmaCats = fc; catsServidor = rc.categorias; cambioCats = true; } }
      const firma = JSON.stringify(r.posts.map((p) => [p.id, p.actualizado]));
      if (firma !== ultimaFirma || cambioCats) {
        ultimaFirma = firma;
        /* Lo que dice el servidor reemplaza lo anterior, salvo las publicaciones con acciones sin confirmar (esas se siguen viendo como las dejaste) */
        const ids = new Set(r.posts.map((p) => p.id));
        r.posts.forEach((p) => { if (!ocupado(p.id)) servidor.set(p.id, p); });
        [...servidor.keys()].forEach((id) => { if (!ids.has(id) && !ocupado(id)) servidor.delete(id); });
        recomponer();
      }
      if (postPendiente) { const id = postPendiente; postPendiente = null; setTimeout(() => irAPost(id), 300); }   // v2.5: se abrió desde un aviso del celular
    } catch (e) {
      if (e.status !== 401) { $('cargando').hidden = true; if (!posts.length) { $('vacio').hidden = false; $('vacioTexto').textContent = 'No se pudo cargar el muro. Revisa tu conexión.'; } }
    } finally { cargando = false; }
  }
  setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, 12000);      // actualización automática
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cargar(); });

  /* ============================================================
     NOTIFICACIONES (NUEVO v2.5)
     Qué hace: muestra los avisos que genera lo que hace la OTRA persona ("M comentó en tu link", "M votó «Cine» en tu encuesta"…):
     campanita con contador, panel con la lista, aviso emergente cuando llega uno nuevo con la app abierta, y (opcional) avisos del
     celular aunque la app esté cerrada (Web Push; los recibe sw.js).
     Para qué sirve: enterarse de lo que pasa en el muro sin tener que revisarlo todo.
     ============================================================ */
  let avisos = [];                         // avisos tal como los devolvió el servidor (más nuevo primero)
  let noLeidas = 0;                        // cuántos no leí (contador de la campanita)
  const avisosVistos = new Set();          // ids que ya se conocían: solo los nuevos muestran el aviso emergente
  let primeraCargaAvisos = true;           // la primera vez no se muestran emergentes (serían los viejos pendientes)
  let resaltarAvisos = new Set();          // ids no leídos al abrir el panel (se ven resaltados aunque ya se marquen como leídos)
  const tituloBase = document.title;
  const ICONO_AVISO = { post: 'add_circle', corazon: 'favorite', comentario: 'chat_bubble', voto: 'ballot', tarea: 'check_circle', dia: 'event', editar: 'edit', borrar: 'delete', categoria: 'label' };

  /* Contador de la campanita, número en el título de la pestaña y globito en el icono de la app (si el navegador lo permite) */
  function pintarContador() {
    const b = $('notifBadge'); b.hidden = !noLeidas; b.textContent = noLeidas > 99 ? '99+' : String(noLeidas);
    $('btnNotif').setAttribute('aria-label', noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones');
    document.title = noLeidas ? `(${noLeidas}) ${tituloBase}` : tituloBase;
    try { if (noLeidas && navigator.setAppBadge) navigator.setAppBadge(noLeidas); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) { /* sin globito */ }
  }
  /* Pide los avisos al servidor; los nuevos (que no estaban antes) salen como aviso emergente */
  let cargandoAvisos = false;
  async function cargarAvisos() {
    if (!yo || cargandoAvisos) return;
    cargandoAvisos = true;
    try {
      const r = await api('/notificaciones');
      const nuevos = r.notificaciones.filter((a) => !a.leida && !avisosVistos.has(a.id));
      r.notificaciones.forEach((a) => avisosVistos.add(a.id));
      if (!primeraCargaAvisos && document.visibilityState === 'visible' && $('modalNotif').hidden) nuevos.slice(0, 3).reverse().forEach((a) => avisar(a.texto));
      primeraCargaAvisos = false;
      avisos = r.notificaciones; noLeidas = r.noLeidas;
      pintarContador();
      if (!$('modalNotif').hidden) { avisos.forEach((a) => { if (!a.leida) resaltarAvisos.add(a.id); }); pintarPanelAvisos(); marcarLeidas(); }
    } catch (e) { /* sin conexión: se reintenta en el próximo ciclo */ }
    finally { cargandoAvisos = false; }
  }
  /* Marca todos como leídos (en el servidor y aquí) */
  async function marcarLeidas() {
    if (!noLeidas) return;
    avisos.forEach((a) => { a.leida = true; }); noLeidas = 0; pintarContador();
    try { await api('/notificaciones', { metodo: 'POST', cuerpo: { accion: 'leer' } }); } catch (e) { /* se marcará la próxima vez */ }
  }
  /* Lleva a una publicación del muro: si un filtro la esconde se limpian los filtros; se desplaza hasta ella y la resalta un momento */
  function irAPost(id) {
    const p = posts.find((x) => x.id === id);
    if (!p) return void avisar('Esa publicación ya no existe.');
    if (!pasaFiltro(p)) {
      $('filtroTipos').querySelector('.chip').click();                                      // tipo: "Todo"
      $('filtroAutor').querySelector('.segmento__btn').click();                              // autor: "Todos"
      if (filtro.q) { $('buscador').value = ''; filtro.q = ''; }
      elegirCategoria('');                                                                   // categoría: "Todas"
      pintar();
    }
    const el = nodos.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('post--resalta'); setTimeout(() => el.classList.remove('post--resalta'), 2400);
  }
  /* Dibuja la lista del panel */
  function pintarPanelAvisos() {
    $('notifVaciar').disabled = !avisos.length;
    $('notifLista').replaceChildren(...(avisos.length ? avisos.map((a) => h('li', { class: 'notif' + (resaltarAvisos.has(a.id) ? ' notif--nueva' : '') + (a.post ? ' notif--enlace' : '') },
      h('button', { class: 'notif__boton', type: 'button', disabled: !a.post, onclick: () => { cerrarModal($('modalNotif')); irAPost(a.post); } },
        avatar(a.de, 'avatar--chico'),
        h('span', { class: 'notif__texto' }, h('span', { class: 'notif__msg', text: a.texto }), h('span', { class: 'notif__hora', text: hora(a.creado) })),
        icono(ICONO_AVISO[a.tipo] || 'notifications', a.tipo === 'corazon')))) : [h('li', { class: 'notif__vacio', text: 'Todavía no hay notificaciones. Acá van a aparecer los comentarios, corazones, votos y demás que haga la otra persona.' })]));
  }
  async function abrirPanelAvisos() {
    resaltarAvisos = new Set(avisos.filter((a) => !a.leida).map((a) => a.id));
    pintarPanelAvisos(); pintarEstadoPush(); abrirModal($('modalNotif'));
    marcarLeidas();
    cargarAvisos();                                                       // por si llegó algo recién
  }
  $('btnNotif').addEventListener('click', abrirPanelAvisos);
  document.querySelectorAll('#modalNotif [data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarModal($('modalNotif'))));
  $('modalNotif').addEventListener('click', (e) => { if (e.target === $('modalNotif')) cerrarModal($('modalNotif')); });   // tocar fuera cierra
  $('notifVaciar').addEventListener('click', async () => {
    /* v2.7: la lista se vacía al instante; si el servidor falla, vuelve con un aviso */
    const previos = avisos, previasNoLeidas = noLeidas, previasResaltadas = resaltarAvisos;
    avisos = []; noLeidas = 0; resaltarAvisos = new Set(); pintarContador(); pintarPanelAvisos();
    try { await api('/notificaciones', { metodo: 'POST', cuerpo: { accion: 'vaciar' } }); }
    catch (e) { avisos = previos; noLeidas = previasNoLeidas; resaltarAvisos = previasResaltadas; pintarContador(); pintarPanelAvisos(); avisar(`No se pudieron vaciar las notificaciones: ${e.message}`, 'error'); }
  });

  /* ----- Avisos del celular (Web Push) -----
     Activar pide permiso al navegador (tiene que ser con un toque), se suscribe con la clave que da el servidor y le avisa al servidor
     qué dispositivo es. El servidor manda un "toque" y sw.js muestra el aviso. */
  const hayPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const claveABytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  async function suscripcionPush() { try { return hayPush ? await (await navigator.serviceWorker.ready).pushManager.getSubscription() : null; } catch (e) { return null; } }
  async function activarPush() {
    if ((await Notification.requestPermission()) !== 'granted') return void avisar('No se dio el permiso para los avisos.', 'error');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes((await api('/push/clave')).clave) });
      await api('/push/suscribir', { metodo: 'POST', cuerpo: { endpoint: sub.endpoint } });
      avisar('Avisos del celular activados.', 'ok');
    } catch (e) { avisar('No se pudieron activar los avisos: ' + e.message, 'error'); }
    pintarEstadoPush();
  }
  async function desactivarPush() {
    const sub = await suscripcionPush();
    if (sub) { try { await api('/push/baja', { metodo: 'POST', cuerpo: { endpoint: sub.endpoint } }); } catch (e) { /* igual se desuscribe aquí */ } try { await sub.unsubscribe(); } catch (e) { /* nada */ } }
    pintarEstadoPush();
  }
  /* Al iniciar sesión: si este dispositivo ya tenía los avisos activados, se registra a nombre de quien entró (puede haber cambiado de M a xB) */
  async function sincronizarPush() {
    if (!hayPush || Notification.permission !== 'granted') return;
    const sub = await suscripcionPush();
    if (sub) { try { await api('/push/suscribir', { metodo: 'POST', cuerpo: { endpoint: sub.endpoint } }); } catch (e) { /* se reintenta en el próximo inicio */ } }
  }
  /* Al cerrar sesión: este dispositivo deja de recibir los avisos de esa persona */
  async function bajaPushDeEstaSesion() {
    const sub = await suscripcionPush();
    if (sub) { try { await api('/push/baja', { metodo: 'POST', cuerpo: { endpoint: sub.endpoint } }); } catch (e) { /* nada */ } }
  }
  /* Bloque de arriba del panel: explica el estado y ofrece activar o desactivar */
  async function pintarEstadoPush() {
    const caja = $('notifPush');
    if (!hayPush) return void caja.replaceChildren(icono('notifications_off'), h('span', { text: 'Este navegador no permite avisos del celular. En iPhone hay que instalar la app en la pantalla de inicio.' }));
    if (Notification.permission === 'denied') return void caja.replaceChildren(icono('notifications_off'), h('span', { text: 'Bloqueaste los avisos para este sitio. Para activarlos, permite las notificaciones en los ajustes del navegador.' }));
    const activo = Notification.permission === 'granted' && !!(await suscripcionPush());
    caja.replaceChildren(icono(activo ? 'notifications_active' : 'notifications', activo),
      h('span', { text: activo ? 'Avisos del celular activados en este dispositivo.' : 'Recibe los avisos aunque la app esté cerrada.' }),
      h('button', { class: 'btn btn--fantasma notif-push__btn', type: 'button', onclick: activo ? desactivarPush : activarPush, text: activo ? 'Desactivar' : 'Activar' }));
  }
  /* Tocar un aviso del celular: sw.js enfoca la app y manda el id de la publicación; si la app estaba cerrada llega como ?post=ID */
  let postPendiente = new URLSearchParams(location.search).get('post');
  if (postPendiente) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ } }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.tipo === 'ir-post') { cargar().then(() => irAPost(e.data.id)); cargarAvisos(); } });

  /* ----- Acciones sobre una publicación (corazón, voto, tildar lista, comentarios): ver accion() y el motor (v2.7) más arriba ----- */
  /* Eliminar: se pide confirmación y después la tarjeta sale al instante (si el servidor falla vuelve a aparecer con un aviso) */
  async function borrar(p) {
    if (!(await confirmar({ titulo: 'Eliminar publicación', texto: 'Se borrará para los dos y no se puede deshacer.', boton: 'Eliminar' }))) return;
    encolar({ k: 'borrar', id: p.id });
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
  let catsElegidas = new Set();           // v2.1: ids de las categorías marcadas en el formulario (vacío = "sin categoría")

  /* Botones de tipo (Nota, Lista, Encuesta, Foto, Link, Plan) */
  Object.entries(TIPOS).forEach(([clave, t]) => $('tiposNuevo').append(
    h('button', { class: 'tipo-btn', type: 'button', role: 'tab', 'data-tipo': clave, onclick: () => elegirTipo(clave) }, icono(t.icono), h('span', { text: t.nombre }))));

  /* Filas editables (elementos de lista / opciones de encuesta): cada fila es un campo de texto con su botón de quitar */
  function agregarFila(valor = '', hecho = false) {
    const max = tipoActual === 'encuesta' ? 8 : 50;
    if ($('filasItems').children.length >= max) { avisar(`Máximo ${max} elementos.`, 'error'); return; }
    /* v2.7: data-rico = el elemento / la opción acepta formato (barra flotante y Ctrl+B/I/K) */
    const entrada = h('input', { class: 'campo__entrada', type: 'text', maxlength: 200, placeholder: tipoActual === 'encuesta' ? `Opción ${$('filasItems').children.length + 1}` : 'Elemento', autocomplete: 'off', value: valor, 'data-rico': 'flota' });
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
    $('etiquetaTitulo').textContent = esEnc ? 'Pregunta' : (tipo === 'plan' ? 'Nombre del plan' : 'Título (opcional)');
    $('campoTexto').hidden = false;                                       // v2.7: TODOS los tipos tienen texto; en la lista y la encuesta es la descripción
    $('etiquetaTexto').textContent = tipo === 'nota' ? 'Texto' : (tipo === 'link' ? 'Comentario (opcional)' : 'Descripción (opcional)');
    $('campoUrl').hidden = tipo !== 'link';
    if ($('campoPlan')) $('campoPlan').hidden = tipo !== 'plan';   // v2.4.1: tolera un index.html viejo sin el campo del plan                              // v2.3: calendario de días + hora y lugar opcionales
    if (tipo === 'plan') pintarCalendario();
    $('campoItems').hidden = !['lista', 'encuesta'].includes(tipo) || (tipo === 'encuesta' && !!editando);   // v2.7: al editar una encuesta solo cambian la pregunta y la descripción (las opciones y votos no se tocan)
    $('etiquetaItems').textContent = esEnc ? 'Opciones (mínimo 2)' : 'Elementos de la lista';
    $('textoMasItems').textContent = esEnc ? 'Agregar opción' : 'Agregar elemento';
    $('campoFoto').hidden = tipo !== 'foto' || !!editando;                // al editar no se cambia la foto
    $('errorNuevo').textContent = '';
    if (!$('filasItems').children.length && !$('campoItems').hidden) { agregarFila(); agregarFila(); }
  }

  /* ----- v2.3: calendario para elegir los días de un plan -----
     Qué hace: mini calendario mensual (semana desde el lunes). Cada toque sobre un día cambia su tipo: sin elegir → posible → ideal →
     descartado → seguro → (otro toque) se quita. Abajo se listan los elegidos con su tipo. Con un día seguro el plan queda confirmado y los
     demás se descartan (quitar el seguro los devuelve a como estaban), igual que en la tarjeta. Los días ya pasados no se pueden sumar
     (pero uno que ya estaba en el plan se puede cambiar o quitar). Máximo 31 días.
     Para qué sirve: dejar el plan armado, con los tipos de día ya elegidos, desde el momento de crearlo. */
  let formDias = { dias: [], antes: {} };  // días elegidos en el formulario con su tipo: { dias: [{ f: "AAAA-MM-DD", e: estado }], antes }
  let formDiasTocados = false;             // al editar: si no se tocó el calendario solo se mandan las fechas (así no se pisan cambios de la otra persona)
  const primerDiaDelMes = (dt) => new Date(dt.getFullYear(), dt.getMonth(), 1);
  let mesCalendario = primerDiaDelMes(new Date());
  const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const LETRAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  /* v2.4.1: si el index.html guardado es más viejo que este script (no tiene el calendario), se omite el calendario en vez de romper toda la app */
  const hayCalendario = !!($('calSemana') && $('calDias') && $('calMes') && $('calAnterior') && $('calSiguiente') && $('diasElegidos'));
  if (hayCalendario) $('calSemana').append(...LETRAS_SEMANA.map((l) => h('span', { text: l })));
  /* Un toque sobre un día del calendario o de la lista de elegidos */
  function alternarDia(f) {
    const d = formDias, dia = d.dias.find((x) => x.f === f), hayS = d.dias.some((x) => x.e === 'seguro');
    if (!dia) {                                                         // todavía no elegido: entra (descartado si el plan ya está confirmado)
      if (d.dias.length >= 31) return void avisar('Un plan puede tener hasta 31 días.', 'error');
      d.dias.push({ f, e: hayS ? 'descartado' : 'posible' }); if (hayS) d.antes[f] = 'posible';
      d.dias.sort((a, b) => (a.f < b.f ? -1 : 1));
    } else if (dia.e === 'seguro') {                                    // el seguro tocado otra vez: se quita el día y los demás vuelven a como estaban
      d.dias = d.dias.filter((x) => x.f !== f); delete d.antes[f]; restaurarDiasLocal(d);
    } else ponerEstadoDiaLocal(d, f, siguienteEstadoDia(d, f));        // posible → ideal → descartado → seguro
    formDiasTocados = true;
    pintarCalendario();
  }
  function pintarCalendario() {
    if (!hayCalendario) return;   // v2.4.1: sin calendario en el HTML no hay nada que pintar
    const hoy = hoyISO(), anio = mesCalendario.getFullYear(), mes = mesCalendario.getMonth();
    $('calMes').textContent = `${NOMBRES_MES[mes]} ${anio}`;
    const celdas = [], vacias = (mesCalendario.getDay() + 6) % 7;        // huecos antes del día 1 (la semana empieza el lunes)
    for (let i = 0; i < vacias; i++) celdas.push(h('span', { class: 'cal-vacio', 'aria-hidden': 'true' }));
    for (let n = 1, total = new Date(anio, mes + 1, 0).getDate(); n <= total; n++) {
      const f = aISO(new Date(anio, mes, n)), dia = formDias.dias.find((x) => x.f === f), est = dia && ESTADOS_DIA[dia.e];
      celdas.push(h('button', { class: 'cal-dia' + (dia ? ` cal-dia--e cal-dia--${dia.e}` : '') + (f === hoy ? ' cal-dia--hoy' : ''), type: 'button', 'aria-pressed': String(!!dia), 'aria-label': `${etiquetaDia(f)}: ${est ? est.nombre.toLowerCase() : 'sin elegir'}`, disabled: f < hoy && !dia, onclick: () => alternarDia(f) },
        h('span', { text: String(n) }), est ? icono(est.icono, dia.e === 'seguro' || dia.e === 'ideal') : null));
    }
    $('calDias').replaceChildren(...celdas);
    /* Lista de días elegidos (ordenados) con su tipo; tocarlos hace lo mismo que tocarlos en el calendario */
    $('diasElegidos').replaceChildren(...(formDias.dias.length
      ? formDias.dias.map((dia) => { const est = ESTADOS_DIA[dia.e]; return h('button', { class: `dia dia--${dia.e}`, type: 'button', title: 'Tocar para cambiar el tipo de día', 'aria-label': `${etiquetaDia(dia.f)}: ${est.nombre.toLowerCase()}. Tocar para cambiar`, onclick: () => alternarDia(dia.f) },
        icono(est.icono, dia.e === 'seguro' || dia.e === 'ideal'), h('span', { class: 'dia__fecha', text: etiquetaDia(dia.f) }), h('span', { class: 'dia__estado', text: est.nombre })); })
      : [h('span', { class: 'campo__ayuda', text: 'Todavía no elegiste ningún día.' })]));
  }
  if (hayCalendario) {
    $('calAnterior').addEventListener('click', () => { mesCalendario = new Date(mesCalendario.getFullYear(), mesCalendario.getMonth() - 1, 1); pintarCalendario(); });
    $('calSiguiente').addEventListener('click', () => { mesCalendario = new Date(mesCalendario.getFullYear(), mesCalendario.getMonth() + 1, 1); pintarCalendario(); });
  }

  /* Abre el formulario vacío (publicación nueva) */
  function abrirNuevo() {
    editando = null; foto = null;
    formNuevo.reset(); $('filasItems').replaceChildren(); $('fotoPrevia').hidden = true; $('textoFoto').textContent = 'Elegir o tomar una foto';
    $('nuevoTitulo').textContent = 'Nueva publicación'; $('textoPublicar').textContent = 'Publicar';
    $('tiposNuevo').hidden = false;
    formDias = { dias: [], antes: {} }; formDiasTocados = false; mesCalendario = primerDiaDelMes(new Date());   // v2.3: plan nuevo sin días elegidos, calendario en el mes actual
    elegirTipo('nota');
    catsElegidas = new Set(); pintarCatsComposer(); reiniciarVistaTexto();   // v2.1: sin categoría y sin vista previa al empezar
    abrirModal($('modalNuevo')); setTimeout(() => $('nuevoTexto').focus(), 80);
  }
  /* Abre el formulario con los datos de una publicación propia para editarla */
  function abrirEditor(p) {
    editando = p; foto = null;
    formNuevo.reset(); $('filasItems').replaceChildren(); $('fotoPrevia').hidden = true;
    $('nuevoTitulo').textContent = `Editar ${TIPOS[p.tipo].nombre.toLowerCase()}`; $('textoPublicar').textContent = 'Guardar';
    $('tiposNuevo').hidden = true;                                       // el tipo no se cambia al editar
    /* v2.3: al editar un plan se cargan sus días, hora y lugar (el calendario abre en el primer día del plan) */
    formDias = p.tipo === 'plan' ? clonarDias(p.datos) : { dias: [], antes: {} }; formDiasTocados = false;   // v2.6: con el tipo que tiene cada día
    mesCalendario = primerDiaDelMes(formDias.dias.length ? aFecha(formDias.dias[0].f) : new Date());
    elegirTipo(p.tipo);
    if (p.tipo === 'plan' && $('planHora')) { $('planHora').value = p.datos.hora || ''; $('planLugar').value = p.datos.lugar || ''; }
    $('nuevoTituloCampo').value = p.titulo; $('nuevoTexto').value = p.texto; $('nuevoUrl').value = p.url;
    if (p.tipo === 'lista') { $('filasItems').replaceChildren(); (p.datos.items || []).forEach((i) => agregarFila(i.t, i.hecho)); }
    catsElegidas = new Set(catsDe(p).map((c) => c.id)); pintarCatsComposer(); reiniciarVistaTexto();   // v2.1: sus categorías actuales quedan marcadas
    abrirModal($('modalNuevo'));
  }
  $('btnNuevo').addEventListener('click', () => (vista === 'perfiles' ? abrirEntrada() : abrirNuevo()));   // v2.8: en la pestaña "Perfiles" el + añade una entrada al perfil que se está viendo
  document.querySelectorAll('#modalNuevo [data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarModal($('modalNuevo'))));
  $('modalNuevo').addEventListener('mousedown', (e) => { if (e.target === $('modalNuevo')) cerrarModal($('modalNuevo')); });   // clic afuera = cerrar

  /* ============================================================
     v2.1 — FORMATO DE TEXTO (barra de botones sobre el cuadro de texto)
     Qué hace: cada botón inserta o quita marcas Markdown alrededor del texto seleccionado (negrita, cursiva, tachado, código, enlace) o al
     comienzo de las líneas seleccionadas (título, cita, lista, lista numerada). Volver a tocar el botón deshace la marca.
     El botón del ojo muestra cómo va a quedar. Atajos: Ctrl/Cmd + B, I y K.
     Para qué sirve: escribir notas y descripciones con distintos tipos de texto sin saber Markdown.
     ============================================================ */
  const FORMATOS = {
    /* v2.2: marcas como en WhatsApp */
    negrita: { env: ['*', '*', 'texto en negrita'] },
    cursiva: { env: ['_', '_', 'texto en cursiva'] },
    tachado: { env: ['~', '~', 'texto tachado'] },
    codigo: { env: ['```', '```', 'código'] },
    titulo: { pre: '## ' },
    cita: { pre: '> ' },
    lista: { pre: '- ' },
    numerada: { pre: '1. ', num: true },
    enlace: { enlace: true },
  };
  const PREFIJO_BLOQUE = /^(#{1,3}\s|>\s?|[-*+]\s|\d+[.)]\s)/;   // marcas de comienzo de línea que se reemplazan al cambiar de formato
  /* v2.7: sirve para cualquier campo con formato (t = el cuadro de texto grande por defecto, o el campo de una línea que tiene la barra flotante).
     En los campos de una línea solo van las marcas que no necesitan salto de línea (negrita, cursiva, tachado, código, enlace). */
  function aplicarFormato(nombre, t = $('nuevoTexto')) {
    const f = FORMATOS[nombre], v = t.value, ini = t.selectionStart, fin = t.selectionEnd;
    if (!f || (f.pre && t.tagName !== 'TEXTAREA')) return;
    if (f.env) {                                                       // marcas a los dos lados de lo seleccionado
      const [a, b, hueco] = f.env;
      if (v.slice(ini - a.length, ini) === a && v.slice(fin, fin + b.length) === b) {
        t.setRangeText(v.slice(ini, fin), ini - a.length, fin + b.length, 'select');   // ya estaba con ese formato: se lo quita
      } else {
        const sel = v.slice(ini, fin) || hueco;                        // sin selección: pone un texto de ejemplo ya seleccionado
        t.setRangeText(a + sel + b, ini, fin, 'preserve');
        t.setSelectionRange(ini + a.length, ini + a.length + sel.length);
      }
    } else if (f.pre) {                                                // marca al comienzo de cada línea seleccionada
      const desde = v.lastIndexOf('\n', ini - 1) + 1;
      let hasta = v.indexOf('\n', fin); if (hasta === -1) hasta = v.length;
      const lineas = v.slice(desde, hasta).split('\n');
      const patron = f.num ? /^\d+[.)]\s/ : new RegExp('^' + f.pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const todas = lineas.every((l) => patron.test(l));               // si todas ya lo tienen, se quita
      const nuevas = lineas.map((l, k) => (todas ? l.replace(patron, '') : (f.num ? `${k + 1}. ` : f.pre) + l.replace(PREFIJO_BLOQUE, '')));
      t.setRangeText(nuevas.join('\n'), desde, hasta, 'select');
    } else if (f.enlace) {                                             // [texto](dirección)
      const sel = v.slice(ini, fin);
      if (/^https?:\/\/\S+$/.test(sel)) { t.setRangeText(`[enlace](${sel})`, ini, fin, 'preserve'); t.setSelectionRange(ini + 1, ini + 7); }
      else { const txt = sel || 'texto del enlace'; t.setRangeText(`[${txt}](https://)`, ini, fin, 'preserve'); t.setSelectionRange(ini + txt.length + 3, ini + txt.length + 11); }
    }
    t.focus(); t.dispatchEvent(new Event('input'));                    // avisa del cambio (actualiza la vista previa)
  }
  /* Vista previa del texto: el ojo la muestra/oculta y se actualiza mientras se escribe */
  function actualizarVistaTexto() {
    const caja = $('textoPrevia');
    if (caja.hidden) return;
    const v = $('nuevoTexto').value.trim();
    caja.replaceChildren(v ? md(v, 'post__texto') : h('span', { class: 'campo__ayuda', text: 'Todavía no escribiste nada.' }));
  }
  function reiniciarVistaTexto() {
    $('textoPrevia').hidden = true; $('btnVistaTexto').setAttribute('aria-pressed', 'false');
    $('btnVistaTexto').querySelector('.material-symbols-rounded').textContent = 'visibility';
  }
  $('barraFormato').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // los botones no le quitan el foco (ni la selección) al texto
  $('barraFormato').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]'); if (!b) return;
    if (b.dataset.fmt === 'vista') {
      const ver = $('textoPrevia').hidden;
      $('textoPrevia').hidden = !ver; b.setAttribute('aria-pressed', String(ver));
      b.querySelector('.material-symbols-rounded').textContent = ver ? 'visibility_off' : 'visibility';
      actualizarVistaTexto(); return;
    }
    aplicarFormato(b.dataset.fmt);
  });
  $('nuevoTexto').addEventListener('input', actualizarVistaTexto);
  /* ----- v2.7: formato en TODOS los campos de texto -----
     Qué hace: los campos marcados con data-rico (título, elementos de lista, opciones de encuesta, comentarios y el texto grande) aceptan los atajos
     Ctrl/Cmd + B (negrita), I (cursiva) y K (enlace). Los de una línea además muestran una barra flotante (#barraFlota) con los botones
     de formato encima del campo mientras se escribe. En la publicación el texto se ve con su formato.
     Para qué sirve: poder resaltar texto en cualquier parte, no solo en las notas. */
  document.addEventListener('keydown', (e) => {                        // atajos de teclado
    const t = e.target;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !t || !t.dataset || !t.dataset.rico) return;
    const fmt = { b: 'negrita', i: 'cursiva', k: 'enlace' }[e.key.toLowerCase()];
    if (fmt) { e.preventDefault(); aplicarFormato(fmt, t); }
  });
  const barraFlota = $('barraFlota');
  let campoFlota = null;                                               // campo de una línea que tiene el foco (el que recibe el formato)
  function ocultarBarraFlota() { campoFlota = null; barraFlota.hidden = true; }
  /* Pone la barra justo encima del campo (o debajo si arriba no hay lugar) y la oculta si el campo quedó fuera de la pantalla */
  function colocarBarraFlota() {
    if (!campoFlota || !document.body.contains(campoFlota)) return void ocultarBarraFlota();
    const r = campoFlota.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { barraFlota.hidden = true; return; }
    barraFlota.hidden = false;
    const bw = barraFlota.offsetWidth, bh = barraFlota.offsetHeight;
    let arriba = r.top - bh - 6; if (arriba < 6) arriba = Math.min(r.bottom + 6, window.innerHeight - bh - 6);
    barraFlota.style.top = `${arriba}px`; barraFlota.style.left = `${Math.max(6, Math.min(r.left, window.innerWidth - bw - 6))}px`;
  }
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.rico === 'flota') { campoFlota = t; colocarBarraFlota(); }
    else if (!barraFlota.contains(t)) ocultarBarraFlota();
  });
  document.addEventListener('focusout', (e) => { if (e.target === campoFlota) setTimeout(() => { if (document.activeElement !== campoFlota) ocultarBarraFlota(); }, 120); });
  window.addEventListener('scroll', colocarBarraFlota, true); window.addEventListener('resize', colocarBarraFlota);
  barraFlota.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // los botones no le quitan el foco (ni la selección) al campo
  barraFlota.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]');
    if (b && campoFlota) { aplicarFormato(b.dataset.fmt, campoFlota); colocarBarraFlota(); }
  });

  /* ============================================================
     v2.1 — CATEGORÍAS EN EL FORMULARIO (selector tipo "guardar en lista" de YouTube) y CREAR CATEGORÍA
     Qué hace: lista las categorías con casillas (se pueden marcar varias; "Sin categoría" las desmarca todas) y permite crear una nueva
     con nombre y un icono elegido de una selección de fonts.google.com/icons con buscador. La nueva queda marcada automáticamente.
     Quien creó una categoría puede borrarla (botón de papelera). Para qué sirve: clasificar y luego filtrar el muro.
     ============================================================ */
  /* Iconos que se pueden elegir: [nombre del icono en Material Symbols, palabras en español para el buscador] */
  const ICONOS_CAT = [
    ['favorite', 'corazon amor'],
    ['heart_broken', 'corazon roto'],
    ['volunteer_activism', 'regalo ayuda'],
    ['redeem', 'regalo'],
    ['cake', 'torta cumpleanos'],
    ['celebration', 'fiesta'],
    ['mood', 'feliz sonrisa'],
    ['sentiment_satisfied', 'contento'],
    ['star', 'estrella favorito'],
    ['bolt', 'rayo energia'],
    ['local_fire_department', 'fuego'],
    ['diamond', 'diamante joya'],
    ['workspace_premium', 'premio'],
    ['military_tech', 'medalla'],
    ['group', 'grupo gente'],
    ['person', 'persona'],
    ['diversity_1', 'amigos'],
    ['child_care', 'bebe'],
    ['pets', 'mascota perro gato'],
    ['cruelty_free', 'conejo animal'],
    ['emoji_nature', 'mariposa naturaleza'],
    ['restaurant', 'comida'],
    ['local_pizza', 'pizza'],
    ['lunch_dining', 'hamburguesa'],
    ['ramen_dining', 'ramen fideos'],
    ['icecream', 'helado'],
    ['bakery_dining', 'pan'],
    ['local_cafe', 'cafe'],
    ['coffee', 'cafe taza'],
    ['local_bar', 'bebida trago'],
    ['wine_bar', 'vino'],
    ['cookie', 'galleta'],
    ['kitchen', 'cocina heladera'],
    ['set_meal', 'pescado'],
    ['nutrition', 'fruta'],
    ['egg', 'huevo'],
    ['brunch_dining', 'desayuno'],
    ['shopping_cart', 'compras'],
    ['shopping_bag', 'bolsa compras'],
    ['storefront', 'tienda'],
    ['flight', 'avion viaje'],
    ['flight_takeoff', 'despegue viaje'],
    ['luggage', 'valija viaje'],
    ['beach_access', 'playa'],
    ['hotel', 'hotel'],
    ['map', 'mapa'],
    ['explore', 'explorar brujula'],
    ['directions_car', 'auto'],
    ['directions_bike', 'bicicleta'],
    ['train', 'tren'],
    ['sailing', 'barco'],
    ['landscape', 'paisaje montana'],
    ['forest', 'bosque'],
    ['park', 'parque'],
    ['camping', 'camping carpa'],
    ['hiking', 'caminata'],
    ['travel_explore', 'mundo'],
    ['public', 'mundo planeta'],
    ['location_on', 'lugar ubicacion'],
    ['home', 'casa'],
    ['cottage', 'cabana'],
    ['apartment', 'edificio'],
    ['movie', 'pelicula cine'],
    ['theaters', 'cine'],
    ['tv', 'television serie'],
    ['live_tv', 'television'],
    ['music_note', 'musica'],
    ['headphones', 'auriculares'],
    ['library_music', 'musica'],
    ['mic', 'microfono'],
    ['piano', 'piano'],
    ['queue_music', 'playlist'],
    ['sports_esports', 'videojuegos'],
    ['casino', 'dados juego'],
    ['extension', 'rompecabezas'],
    ['toys', 'juguete'],
    ['sports_soccer', 'futbol'],
    ['sports_basketball', 'basquet'],
    ['sports_tennis', 'tenis'],
    ['fitness_center', 'gimnasio pesas'],
    ['pool', 'natacion pileta'],
    ['sports_martial_arts', 'artes marciales'],
    ['skateboarding', 'skate'],
    ['school', 'escuela estudio'],
    ['menu_book', 'libro'],
    ['book', 'libro'],
    ['auto_stories', 'libro lectura'],
    ['edit_note', 'apuntes notas'],
    ['description', 'documento'],
    ['folder', 'carpeta'],
    ['work', 'trabajo'],
    ['laptop_mac', 'computadora'],
    ['computer', 'computadora'],
    ['code', 'codigo'],
    ['terminal', 'consola'],
    ['science', 'ciencia'],
    ['psychology', 'mente psicologia'],
    ['calculate', 'calculadora'],
    ['lightbulb', 'idea'],
    ['history_edu', 'historia'],
    ['draw', 'dibujo'],
    ['brush', 'pincel arte'],
    ['palette', 'paleta colores'],
    ['design_services', 'diseno'],
    ['translate', 'traducir idioma'],
    ['language', 'idioma'],
    ['event', 'evento'],
    ['calendar_month', 'calendario'],
    ['schedule', 'reloj hora'],
    ['alarm', 'alarma'],
    ['notifications', 'notificacion'],
    ['bookmark', 'marcador'],
    ['label', 'etiqueta'],
    ['sell', 'etiqueta precio'],
    ['flag', 'bandera'],
    ['checklist', 'lista'],
    ['task_alt', 'tarea'],
    ['list_alt', 'lista'],
    ['savings', 'ahorro'],
    ['payments', 'pagos'],
    ['account_balance_wallet', 'billetera'],
    ['attach_money', 'dinero'],
    ['health_and_safety', 'salud'],
    ['medical_services', 'medico'],
    ['spa', 'spa relax'],
    ['self_improvement', 'meditacion'],
    ['bedtime', 'dormir noche'],
    ['wb_sunny', 'sol'],
    ['dark_mode', 'luna'],
    ['cloud', 'nube'],
    ['thunderstorm', 'tormenta'],
    ['ac_unit', 'nieve frio'],
    ['water_drop', 'agua gota'],
    ['eco', 'hoja eco'],
    ['local_florist', 'flor'],
    ['grass', 'pasto'],
    ['photo_camera', 'foto camara'],
    ['videocam', 'video'],
    ['image', 'imagen'],
    ['link', 'enlace'],
    ['share', 'compartir'],
    ['chat', 'chat mensaje'],
    ['forum', 'conversacion'],
    ['mail', 'correo'],
    ['call', 'llamada telefono'],
    ['key', 'llave'],
    ['lock', 'candado'],
    ['security', 'seguridad'],
    ['shield', 'escudo'],
    ['build', 'herramientas'],
    ['handyman', 'reparar'],
    ['cleaning_services', 'limpieza'],
    ['local_laundry_service', 'lavarropas ropa'],
    ['bed', 'cama'],
    ['chair', 'silla'],
    ['weekend', 'sillon'],
    ['directions_walk', 'caminar'],
    ['ad', 'anuncio'],
    ['campaign', 'campana'],
    ['newspaper', 'noticias diario'],
    ['podcasts', 'podcast'],
    ['radio', 'radio'],
    ['sticky_note_2', 'nota'],
    ['ballot', 'encuesta'],
    ['dashboard_customize', 'tablero'],
    ['apps', 'apps'],
    ['category', 'categoria'],
    ['inventory_2', 'caja'],
    ['archive', 'archivo'],
    ['bookmarks', 'guardados'],
    ['thumb_up', 'me gusta'],
    ['rocket_launch', 'cohete'],
    ['travel', 'viaje'],
    ['memory', 'chip'],
    ['smart_toy', 'robot'],
    ['stadia_controller', 'control'],
    ['steps', 'pasos'],
    ['visibility', 'ojo'],
    ['dry_cleaning', 'ropa'],
    ['checkroom', 'ropa'],
    ['styler', 'ropa'],
    ['shoppingmode', 'compras'],
    ['nightlife', 'noche fiesta'],
    ['sunny', 'sol'],
    ['wb_twilight', 'atardecer'],
    ['rainy', 'lluvia'],
    ['filter_vintage', 'flor'],
    ['yard', 'jardin'],
    ['potted_plant', 'planta'],
    ['pest_control', 'bicho'],
    ['sports', 'juegos deporte'],
    ['hotel_class', 'estrella'],
    ['heart_plus', 'corazon'],
    ['handshake', 'acuerdo'],
    ['family_restroom', 'familia'],
    ['elderly', 'abuelo'],
    ['boy', 'nino'],
    ['girl', 'nina'],
    ['woman', 'mujer'],
    ['man', 'hombre'],
    ['pregnant_woman', 'embarazo'],
    ['monitor_heart', 'salud corazon'],
    ['vaccines', 'vacuna'],
    ['medication', 'pastilla'],
    ['stethoscope', 'medico'],
    ['dentistry', 'dentista'],
    ['fitness_tracker', 'pulsera'],
    ['directions_run', 'correr'],
    ['sports_gymnastics', 'gimnasia'],
    ['sports_kabaddi', 'lucha'],
    ['surfing', 'surf'],
    ['downhill_skiing', 'esqui'],
    ['kayaking', 'kayak'],
    ['golf_course', 'golf'],
    ['sports_baseball', 'beisbol'],
    ['sports_volleyball', 'voley'],
    ['sports_football', 'futbol americano'],
    ['sports_rugby', 'rugby'],
    ['sports_cricket', 'cricket'],
    ['sports_motorsports', 'motos'],
    ['two_wheeler', 'moto'],
    ['local_taxi', 'taxi'],
    ['directions_bus', 'colectivo bus'],
    ['subway', 'subte'],
    ['local_gas_station', 'nafta'],
    ['ev_station', 'electrico'],
    ['local_parking', 'estacionamiento'],
    ['garage', 'garage'],
    ['trophy', 'trofeo copa'],
    ['mobile', 'celular telefono'],
    ['photo_library', 'fotos galeria'],
    ['keep', 'chincheta fijar'],
    ['star_shine', 'magia brillo'],
    ['emoji_objects', 'idea'],
    ['sentiment_very_satisfied', 'contento risa'],
    ['tag', 'etiqueta numeral'],
    ['pin_drop', 'ubicacion'],
    ['heart_check', 'corazon'],
    ['new_label', 'etiqueta nueva'],
    ['bookmark_star', 'favorito'],
    ['local_activity', 'entrada ticket'],
    ['attractions', 'parque diversiones'],
    ['stadium', 'estadio'],
    ['sports_bar', 'cerveza'],
    ['tapas', 'tapas'],
    ['liquor', 'licor'],
    ['nest_eco_leaf', 'hoja'],
    ['sunny_snowing', 'clima'],
    ['travel_luggage_and_bags', 'valija'],
    ['spatial_audio', 'musica'],
    ['artist', 'artista'],
    ['trending_up', 'crecimiento'],
    ['flag_circle', 'bandera'],
    ['hourglass_top', 'tiempo'],
    ['timer', 'temporizador'],
    ['alarm_on', 'alarma']
  ];
  let iconoCat = 'label';                 // icono elegido en la ventana de nueva categoría
  let alCrearCategoria = null;            // qué hacer cuando se crea (ej.: marcarla en el formulario de publicar)

  /* Dibuja la lista de categorías del formulario con sus casillas */
  function pintarCatsComposer() {
    const lista = $('catLista'), ninguna = !catsElegidas.size;
    const fila = (ic, texto, marcada, alTocar, extra) => h('div', { class: 'cat-fila' },
      h('button', { class: 'cat-fila__tog', type: 'button', 'aria-pressed': String(marcada), onclick: alTocar },
        icono(marcada ? 'check_box' : 'check_box_outline_blank', marcada), icono(ic), h('span', { class: 'cat-fila__nombre', text: texto })), extra);
    lista.replaceChildren(
      fila('label_off', 'Sin categoría', ninguna, () => { catsElegidas.clear(); pintarCatsComposer(); }),
      ...categorias.map((c) => fila(c.icono, c.nombre, catsElegidas.has(c.id),
        () => { if (catsElegidas.has(c.id)) catsElegidas.delete(c.id); else catsElegidas.add(c.id); pintarCatsComposer(); },
        c.autor === yo ? h('button', { class: 'btn-icono cat-fila__borrar', type: 'button', 'aria-label': `Borrar la categoría ${c.nombre}`, title: 'Borrar categoría', onclick: () => borrarCategoria(c) }, icono('delete')) : null)));
  }
  async function borrarCategoria(c) {
    if (!(await confirmar({ titulo: 'Borrar categoría', texto: `Se borrará «${c.nombre}». Las publicaciones no se borran: solo dejan de tener esta categoría.`, boton: 'Borrar' }))) return;
    catsElegidas.delete(c.id);
    encolar({ k: 'cat-', id: c.id });                                   // v2.7: la ficha desaparece al instante (si el servidor falla vuelve con un aviso)
  }

  /* Ventana "Nueva categoría" */
  const modalCat = $('modalCategoria');
  /* Muestra cómo quedará la ficha (icono + nombre) mientras se escribe */
  function previaCategoria() {
    $('catPrevia').replaceChildren(icono(iconoCat), h('span', { text: $('catNombre').value.trim() || 'Nombre' }));
  }
  function elegirIconoCat(nombre) {
    iconoCat = nombre;
    $('catIconos').querySelectorAll('.icono-op').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === nombre)));
    previaCategoria();
  }
  /* Crea la grilla de iconos la primera vez que se abre la ventana (son ~250 botones) */
  function crearGrillaIconos() {
    if ($('catIconos').children.length) return;
    $('catIconos').replaceChildren(...ICONOS_CAT.map(([n, alias]) => h('button', {
      class: 'icono-op', type: 'button', title: n.replace(/_/g, ' '), 'aria-label': n.replace(/_/g, ' '), 'aria-pressed': 'false',
      'data-n': n, 'data-b': normalizar(`${n.replace(/_/g, ' ')} ${alias}`), onclick: () => elegirIconoCat(n) }, icono(n))));
  }
  /* Buscador de iconos: oculta los que no coinciden con lo escrito (nombre o palabras en español) */
  $('catBuscarIcono').addEventListener('input', () => {
    const palabras = normalizar($('catBuscarIcono').value.trim()).split(/\s+/).filter(Boolean);
    let hay = 0;
    $('catIconos').querySelectorAll('.icono-op').forEach((b) => { const ok = palabras.every((w) => b.dataset.b.includes(w)); b.hidden = !ok; if (ok) hay++; });
    $('catSinIconos').hidden = hay > 0;
  });
  $('catNombre').addEventListener('input', previaCategoria);
  /* Abre la ventana. alCrear = función a llamar con la categoría creada (opcional) */
  function abrirNuevaCategoria(alCrear) {
    alCrearCategoria = alCrear || null;
    $('formCategoria').reset(); $('errorCat').textContent = ''; $('catSinIconos').hidden = true;
    crearGrillaIconos(); $('catIconos').querySelectorAll('.icono-op').forEach((b) => { b.hidden = false; });
    elegirIconoCat('label');
    abrirModal(modalCat); setTimeout(() => $('catNombre').focus(), 80);
  }
  $('btnNuevaCat').addEventListener('click', () => abrirNuevaCategoria((c) => { catsElegidas.add(c.id); pintarCatsComposer(); }));
  document.querySelectorAll('#modalCategoria [data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarModal(modalCat)));
  modalCat.addEventListener('mousedown', (e) => { if (e.target === modalCat) cerrarModal(modalCat); });
  $('formCategoria').addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = $('catNombre').value.trim();
    if (!nombre) { $('errorCat').textContent = 'Ponle un nombre a la categoría.'; $('catNombre').focus(); return; }
    if (categorias.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) { $('errorCat').textContent = 'Ya existe una categoría con ese nombre.'; return; }
    /* v2.7: la categoría aparece al instante (con un id propio que el servidor respeta); si el servidor la rechaza se quita y sale un aviso */
    const cat = { id: uuid(), nombre, icono: iconoCat, autor: yo, creado: Date.now() };
    encolar({ k: 'cat+', id: cat.id, cat, cuerpo: { id: cat.id, nombre, icono: iconoCat } });
    cerrarModal(modalCat);
    if (alCrearCategoria) alCrearCategoria(cat);
  });

  /* ----- Foto: elegir y comprimir en el celular antes de subir ----- */
  /* Qué hace: reduce la foto a un máximo de 1280 px y la guarda como JPEG bajando la calidad hasta que pese poco (≈ 800 KB como máximo).
     Para qué sirve: las fotos se guardan en la base de datos D1, que admite filas de ~2 MB; así caben muchas y cargan rápido. */
  /* v2.8: parámetros opcionales (lado máximo en px y tope de caracteres en base64) para que las imágenes de los perfiles pesen menos que una foto de publicación */
  async function comprimirFoto(archivo, { lado: ladoMax = 1280, maxChars: topeChars = 1100000 } = {}) {
    let bmp;
    try { bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); }
    catch (e) {                                                          // respaldo para navegadores sin createImageBitmap con opciones
      bmp = await new Promise((ok, mal) => { const url = URL.createObjectURL(archivo), im = new Image(); im.onload = () => { URL.revokeObjectURL(url); ok(im); }; im.onerror = mal; im.src = url; });
    }
    const MAX_CHARS = topeChars;                                         // tope de la foto en base64 (el servidor admite 1.400.000)
    let lado = ladoMax, calidad = 0.82, dataUrl, w, hh;
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
    const tipo = tipoActual, cuerpo = { tipo, titulo: $('nuevoTituloCampo').value.trim(), texto: $('nuevoTexto').value.trim(), datos: {}, categorias: [...catsElegidas] };   // v2.1: + categorías marcadas
    const filas = [...$('filasItems').children].map((f) => ({ t: f.querySelector('input').value.trim(), hecho: !!f._hecho })).filter((f) => f.t);

    if (tipo === 'nota' && !cuerpo.texto && !cuerpo.titulo) return void (error.textContent = 'Escribe algo en la nota.');
    if (tipo === 'lista') { if (!filas.length) return void (error.textContent = 'Agrega al menos un elemento.'); cuerpo.datos.items = filas; }
    if (tipo === 'encuesta') {
      if (!cuerpo.titulo) return void (error.textContent = 'Escribe la pregunta.');
      if (!editando) {                                                  // v2.7: al editar una encuesta no se tocan las opciones
        if (filas.length < 2) return void (error.textContent = 'Agrega al menos 2 opciones.');
        cuerpo.datos.opciones = filas.map((f) => f.t);
      }
    }
    if (tipo === 'plan') {                                              // v2.3: nombre + al menos un día; hora y lugar son opcionales
      if (!cuerpo.titulo) return void (error.textContent = 'Ponle un nombre al plan.');
      if (!formDias.dias.length) return void (error.textContent = 'Elige al menos un día en el calendario.');
      /* v2.6: al crear se mandan los días con su tipo; al editar solo si se tocó el calendario (si no, solo las fechas y se conservan los tipos guardados) */
      const diasEnviar = !editando || formDiasTocados ? formDias.dias.map((x) => ({ f: x.f, e: x.e })) : formDias.dias.map((x) => x.f);
      cuerpo.datos = { dias: diasEnviar, antes: formDias.antes, hora: $('planHora') ? $('planHora').value : '', lugar: $('planLugar') ? $('planLugar').value.trim() : '' };
    }
    if (tipo === 'link') {
      cuerpo.url = arreglarUrl($('nuevoUrl').value);
      if (!cuerpo.url) return void (error.textContent = 'Pega la dirección del link.');
      try { new URL(cuerpo.url); } catch (x) { return void (error.textContent = 'Esa dirección no es válida.'); }
    }
    if (tipo === 'foto' && !editando) {
      if (!foto) return void (error.textContent = 'Elige una foto.');
      cuerpo.imagen = foto.dataUrl; cuerpo.datos.w = foto.w; cuerpo.datos.h = foto.h;
    }

    /* v2.7: se publica / guarda AL INSTANTE: la ventana se cierra y la publicación ya aparece en el muro; el servidor la recibe en segundo plano.
       Si lo rechaza, la publicación desaparece, sale un aviso de error y esta ventana se vuelve a abrir con lo que habías escrito (restaurarFormulario). */
    const form = { cuerpo: clon(cuerpo), foto: tipo === 'foto' && !editando ? foto : null };
    if (editando) encolar({ k: 'editar', id: editando.id, cuerpo, form });
    else {
      const id = uuid();
      if (cuerpo.imagen) fotosLocales.set(id, cuerpo.imagen);          // la foto se ve ya mismo con la copia local
      const op = { k: 'crear', id, cuerpo, form };
      op.t = Date.now(); op.quien = yo; op.post = postLocal(op);       // (encolar vuelve a poner la hora; la publicación local ya quedó armada)
      encolar(op);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    cerrarModal($('modalNuevo'));
  });

  /* Reabre el formulario con lo que se había escrito cuando el servidor rechazó una publicación o una edición (v2.7) */
  function restaurarFormulario(op) {
    if (!$('modalNuevo').hidden && !$('modalNuevo').classList.contains('saliendo')) return;   // ya hay otro formulario abierto: no se pisa (v2.8: una ventana que se está cerrando no cuenta como abierta)
    const c = op.form.cuerpo;
    if (op.k === 'editar') {
      const p = posts.find((x) => x.id === op.id); if (!p) return;
      abrirEditor(p);                                                   // la publicación todavía se ve con la edición aplicada: el formulario ya queda con lo escrito
      return;
    }
    abrirNuevo(); elegirTipo(c.tipo);
    $('nuevoTituloCampo').value = c.titulo || ''; $('nuevoTexto').value = c.texto || ''; $('nuevoUrl').value = c.url || '';
    if (c.tipo === 'lista' || c.tipo === 'encuesta') {
      $('filasItems').replaceChildren();
      (c.tipo === 'lista' ? c.datos.items : c.datos.opciones.map((t) => ({ t, hecho: false }))).forEach((i) => agregarFila(i.t, i.hecho));
    }
    if (c.tipo === 'plan') {
      formDias = { dias: (c.datos.dias || []).map((x) => ({ f: x.f, e: x.e })), antes: { ...(c.datos.antes || {}) } }; formDiasTocados = true;
      if ($('planHora')) { $('planHora').value = c.datos.hora || ''; $('planLugar').value = c.datos.lugar || ''; }
      if (formDias.dias.length) mesCalendario = primerDiaDelMes(aFecha(formDias.dias[0].f));
      pintarCalendario();
    }
    if (c.tipo === 'foto' && op.form.foto) { foto = op.form.foto; $('fotoPrevia').src = foto.dataUrl; $('fotoPrevia').hidden = false; $('textoFoto').textContent = 'Cambiar foto'; }
    catsElegidas = new Set(c.categorias || []); pintarCatsComposer(); actualizarVistaTexto();
  }

  /* Esc: cierra la ventana o el visor que esté arriba (la de acceso no se puede cerrar) */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('visor').hidden) cerrarVisor();
    else if (!$('modalConfirmar').hidden) { if ($('confNo').onclick) $('confNo').onclick(); }
    else if (!$('modalCategoria').hidden) cerrarModal($('modalCategoria'));   // v2.1: la ventana de nueva categoría está por encima del formulario
    else if (!$('modalNotif').hidden) cerrarModal($('modalNotif'));          // v2.5
    else if (!$('modalEntrada').hidden) cerrarModal($('modalEntrada'));      // v2.8: ventana de entrada de perfil
    else if (!$('modalNuevo').hidden) cerrarModal($('modalNuevo'));
  });

  /* ============================================================
     v2.8 — PERFILES
     Qué hace: cada persona (Mely = M, Bruu = xB) tiene un perfil con su foto, su nombre y una frase corta ("bio") que SOLO edita su dueño, y
     una lista de ENTRADAS: cada una con un ícono (de fonts.google.com/icons) + un título + un texto con formato + hasta 4 imágenes. Las
     entradas las pueden añadir, editar y borrar LOS DOS en cualquiera de los dos perfiles.
     Se entra por la pestaña "Perfiles" (junto a Todo, Nota, Lista…) con el selector Mely / Bruu, o tocando la foto de una persona (la mía, arriba
     a la derecha, abre mi perfil; la de una publicación o comentario, el de su autor). El botón "Cerrar sesión" ahora está en el perfil propio.
     Todo es instantáneo como el resto de la app (v2.7): lo que se hace se ve ya mismo y se manda al servidor en segundo plano, de a una acción y en
     orden; si el servidor la rechaza, la pantalla vuelve a lo que dice el servidor, sale un aviso de error y la ventana se reabre con lo escrito.
     Lo que se ve es siempre "último estado confirmado por el servidor" + "acciones todavía sin confirmar" (recomponerPerfiles).
     Para qué sirve: tener a mano la información de cada uno (gustos, datos, fotos…) dentro de la misma página.
     ============================================================ */
  const LIM_PERFIL = { frase: 120, titulo: 80, texto: 3000, imagenes: 4 };   // iguales a los del servidor (functions/_lib/perfiles.js)
  const AVISO_ERROR_PERFIL = { frase: 'No se pudo guardar la frase', crear: 'No se pudo añadir la entrada', editar: 'No se pudieron guardar los cambios de la entrada', borrar: 'No se pudo eliminar la entrada' };
  let vista = 'muro';                                         // 'muro' | 'perfiles' (qué pestaña se ve)
  let perfilVer = 'M';                                        // perfil que se está viendo
  let perfServidor = { frases: { M: '', xB: '' }, entradas: [] };   // lo último que confirmó el servidor
  let perfVista = { frases: { M: '', xB: '' }, entradas: [] };      // lo que se ve: servidor + acciones sin confirmar
  const perfPend = [];                                        // acciones de perfil sin confirmar, en orden: { k: 'frase' | 'crear' | 'editar' | 'borrar', sesion, … }
  let colaPerf = Promise.resolve();                           // las acciones se mandan de a una y en orden
  let perfGen = 0;                                            // sube con cada acción confirmada o rechazada (descarta actualizaciones automáticas viejas)
  let perfCargando = false, perfCargadas = false;
  const imgsLocales = new Map();                              // id de imagen → dataURL (se ve al instante, sin pedirla al servidor)
  const nodosEntradas = new Map();                            // id de entrada → tarjeta ya pintada
  let editandoFrase = false;                                  // el dueño está escribiendo su frase (no se repinta la cabecera mientras tanto)
  let perfilQ = '';                                           // v2.8.1: texto del buscador del perfil (ya normalizado: minúsculas y sin tildes)
  let perfilArmado = '', firmaFrase = '';                     // qué perfil tiene armada la pantalla / huella de la frase pintada
  let refs = null;                                            // elementos del perfil armado (cabecera, lista…)
  const chipPerfiles = h('button', { class: 'chip', type: 'button', 'data-vista': 'perfiles' }, icono('account_circle'), h('span', { text: 'Perfiles' }));
  $('filtroTipos').append(chipPerfiles);                      // la pestaña "Perfiles" va al final de la fila Todo / Nota / Lista…
  chipPerfiles.addEventListener('click', () => mostrarVista('perfiles'));
  const planoDe = (t) => String(t || '').replace(/[*_~`]/g, '');   // título sin las marcas de formato (para el pie del visor y las etiquetas)
  const srcImg = (i) => imgsLocales.get(i.id) || `/api/perfiles/imagen/${i.id}`;   // si la imagen se acaba de subir se usa la copia local

  /* Selector Mely / Bruu (se arma una sola vez; marcarSelector() cambia cuál está activo y pone "(yo)") */
  const botonesSel = ['M', 'xB'].map((q) => h('button', { class: `segmento__btn segmento__btn--${q === 'M' ? 'm' : 'xb'} perfil-sel`, type: 'button', role: 'tab', 'data-quien': q, onclick: () => elegirPerfil(q) },
    avatar(q, 'avatar--mini'), h('span', { text: NOMBRE_ESCENA[q] })));
  $('perfilSelector').append(...botonesSel);
  function marcarSelector() {
    botonesSel.forEach((b) => {
      const q = b.dataset.quien, activo = q === perfilVer;
      b.classList.toggle('segmento__btn--activo', activo); b.setAttribute('aria-selected', String(activo));
      b.querySelector('span:not(.avatar)').textContent = NOMBRE_ESCENA[q] + (q === yo ? ' (yo)' : '');
    });
  }

  /* Cambia entre el muro y los perfiles: esconde / muestra cada parte (lo marcado con data-solo-muro se esconde con CSS según body[data-vista]) y
     deja activa la ficha que corresponde en la fila de arriba */
  function mostrarVista(v) {
    vista = v; document.body.dataset.vista = v;
    $('vistaPerfiles').hidden = v !== 'perfiles';
    document.querySelectorAll('#filtroTipos .chip').forEach((x) => x.classList.toggle('chip--activo', v === 'perfiles' ? x === chipPerfiles : x !== chipPerfiles && x.dataset.tipo === filtro.tipo));
    $('btnNuevo').setAttribute('aria-label', v === 'perfiles' ? 'Nueva entrada en el perfil' : 'Nueva publicación');
    if (v === 'perfiles') { marcarSelector(); pintarPerfil(); cargarPerfiles(); }
  }
  /* Abre el perfil de una persona (tocando su foto) y sube para verlo */
  function abrirPerfil(q) {
    perfilVer = q === 'xB' ? 'xB' : 'M';
    mostrarVista('perfiles'); armarPerfil(); pintarPerfil();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function elegirPerfil(q) { if (q === perfilVer) return; perfilVer = q; marcarSelector(); armarPerfil(); pintarPerfil(); }
  /* Al iniciar sesión: se descarta todo lo de la sesión anterior y se vuelve al muro */
  function reiniciarPerfiles(quien) {
    perfPend.length = 0; perfGen++; colaPerf = Promise.resolve();
    perfServidor = { frases: { M: '', xB: '' }, entradas: [] }; perfVista = { frases: { M: '', xB: '' }, entradas: [] };
    perfCargadas = false; perfilVer = quien; editandoFrase = false; perfilArmado = ''; firmaFrase = ''; refs = null;
    nodosEntradas.clear(); imgsLocales.clear(); $('perfilCuerpo').replaceChildren();
    mostrarVista('muro'); marcarSelector();
  }
  /* Tocar la foto de una persona (la de una publicación o de un comentario) abre su perfil. Las fotos dentro de botones (corazones, selector) y la
     de la cabecera del propio perfil no hacen nada. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.avatar');
    if (!a || !yo || !a.closest('#app') || a.closest('button, a, .perfil__cab')) return;
    const q = a.classList.contains('avatar--xB') ? 'xB' : a.classList.contains('avatar--M') ? 'M' : null;
    if (q) abrirPerfil(q);
  });

  /* ----- Pantalla del perfil: se arma una vez por perfil (cabecera + barra + lista) y después solo se actualizan las partes que cambian ----- */
  function armarPerfil() {
    const q = perfilVer, mio = q === yo, nombre = NOMBRE_ESCENA[q];
    perfilArmado = q + '|' + yo; firmaFrase = ''; nodosEntradas.clear();
    const fraseCaja = h('div', { class: 'perfil__frase-caja' });
    const cuenta = h('span', { class: 'perfil__cuenta' });
    const lista = h('div', { class: 'perfil__lista' });
    const vacio = h('p', { class: 'perfil__vacio', hidden: true });
    /* v2.8.1: buscador de entradas, debajo de la cabecera (bio). Solo se muestra si el perfil ya tiene alguna entrada (lo decide pintarPerfil) */
    perfilQ = '';
    const campoBusca = h('input', { class: 'campo__entrada', type: 'search', placeholder: 'Buscar en este perfil…', 'aria-label': 'Buscar en este perfil', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    campoBusca.addEventListener('input', () => { perfilQ = normalizar(campoBusca.value.trim()); pintarPerfil(); });
    campoBusca.addEventListener('keydown', (e) => { if (e.key === 'Escape' && campoBusca.value) { e.stopPropagation(); campoBusca.value = ''; perfilQ = ''; pintarPerfil(); } });
    const buscador = h('label', { class: 'buscador perfil__buscador', hidden: true }, icono('search'), campoBusca);
    $('perfilCuerpo').dataset.quien = q;
    $('perfilCuerpo').replaceChildren(
      h('header', { class: 'perfil__cab' },
        avatar(q, 'avatar--perfil'),
        h('div', { class: 'perfil__datos' }, h('h2', { class: 'perfil__nombre' }, nombre, h('span', { class: 'perfil__id', text: q })), fraseCaja),
        /* Cerrar sesión: solo en el perfil propio (antes estaba en la foto de la barra) */
        mio ? h('button', { class: 'btn btn--peligro perfil__salir', type: 'button', onclick: cerrarSesion }, icono('logout'), h('span', { text: 'Cerrar sesión' })) : null),
      buscador,
      h('div', { class: 'perfil__barra' },
        h('h3', { class: 'perfil__subtitulo' }, icono('badge'), h('span', { text: mio ? 'Sobre mí' : `Sobre ${nombre}` }), cuenta),
        h('button', { class: 'btn btn--yo', type: 'button', onclick: () => abrirEntrada() }, icono('add'), h('span', { text: 'Añadir entrada' }))),
      lista, vacio);
    refs = { fraseCaja, cuenta, lista, vacio, buscador };
  }

  /* Frase corta bajo el nombre. Solo su dueño la edita (lápiz → campo → guardar); la otra persona solo la lee */
  function pintarFrase() {
    const q = perfilVer, mio = q === yo, f = perfVista.frases[q] || '';
    const firma = JSON.stringify([f, mio, editandoFrase]);
    if (firma === firmaFrase) return;
    firmaFrase = firma;
    if (mio && editandoFrase) {
      const campo = h('input', { class: 'campo__entrada', type: 'text', maxlength: LIM_PERFIL.frase, value: f, placeholder: 'Una frase corta sobre ti…', 'aria-label': 'Tu frase', autocomplete: 'off', 'data-rico': 'flota' });
      const guardar = () => { editandoFrase = false; const nueva = campo.value.trim(); if (nueva !== f) encolarPerfil({ k: 'frase', quien: q, frase: nueva }); else { firmaFrase = ''; pintarFrase(); } };
      const cancelar = () => { editandoFrase = false; firmaFrase = ''; pintarFrase(); };
      campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); guardar(); } else if (e.key === 'Escape') { e.stopPropagation(); cancelar(); } });
      refs.fraseCaja.replaceChildren(campo,
        h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Guardar frase', title: 'Guardar', onclick: guardar }, icono('check')),
        h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Cancelar', title: 'Cancelar', onclick: cancelar }, icono('close')));
      refs.fraseCaja.classList.add('perfil__frase-caja--edita'); campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length);
      return;
    }
    refs.fraseCaja.classList.remove('perfil__frase-caja--edita');
    refs.fraseCaja.replaceChildren(
      h('p', { class: 'perfil__frase' + (f ? '' : ' perfil__frase--vacia') }, f ? inline(f, true) : (mio ? 'Escribe una frase corta sobre ti…' : 'Todavía no escribió una frase.')),
      mio ? h('button', { class: 'btn-icono perfil__editar', type: 'button', 'aria-label': 'Editar mi frase', title: 'Editar mi frase', onclick: () => { editandoFrase = true; pintarFrase(); } }, icono('edit')) : null);
  }

  /* Una entrada: ícono + título (como una categoría), el texto con formato, las imágenes y el pie (quién la escribió, cuándo, editar y borrar: los dos pueden con cualquiera) */
  function crearEntrada(e) {
    const imgs = e.imagenes || [];
    const el = h('article', { class: 'entrada', 'data-autor': e.autor, 'data-id': e.id },
      /* v2.8.1: sin cuadro gris: el ícono va solo, con el color del perfil, y el título con la tipografía de los títulos del muro (.post__titulo);
         el texto va debajo, dentro de una caja más oscura (.entrada__caja) y admite viñetas, lista numerada y links */
      h('header', { class: 'entrada__cab' }, icono(e.icono), h('h3', { class: 'post__titulo entrada__titulo' }, inline(e.titulo))),
      e.texto ? h('div', { class: 'entrada__caja' }, md(e.texto, 'post__texto entrada__texto')) : null,
      imgs.length ? h('div', { class: 'entrada__imgs entrada__imgs--' + Math.min(imgs.length, 4) }, imgs.map((i) =>
        h('button', { class: 'entrada__img', type: 'button', 'data-k': i.id, 'aria-label': 'Ver imagen grande', onclick: () => abrirVisor(srcImg(i), planoDe(e.titulo)) },
          h('img', { src: srcImg(i), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' })))) : null,
      h('footer', { class: 'entrada__pie' },
        avatar(e.autor, 'avatar--mini'),
        h('time', { class: 'autor__hora', 'data-ts': e.creado, text: hora(e.creado), title: new Date(e.creado).toLocaleString('es-AR') }),
        h('button', { class: 'post__accion post__accion--der', type: 'button', 'aria-label': 'Editar entrada', onclick: () => abrirEntrada(e) }, icono('edit')),
        h('button', { class: 'post__accion post__accion--peligro', type: 'button', 'aria-label': 'Eliminar entrada', onclick: () => borrarEntrada(e) }, icono('delete'))));
    [...el.children].forEach((c) => c.setAttribute('data-k', c.className.split(' ')[0] || c.tagName));   // claves para morph(), igual que en las publicaciones
    return el;
  }

  /* Pinta el perfil que se está viendo: frase y entradas (las nuevas entran con animación, las que cambiaron se actualizan en el lugar, las borradas salen) */
  function pintarPerfil() {
    if (vista !== 'perfiles' || !yo) return;
    if (perfilArmado !== perfilVer + '|' + yo || !refs) armarPerfil();
    pintarFrase();
    const todas = perfVista.entradas.filter((e) => e.perfil === perfilVer);
    refs.buscador.hidden = !todas.length;                                // v2.8.1: el buscador solo aparece si ya se añadió algo
    /* v2.8.1: la búsqueda mira el título y el texto (sin importar mayúsculas ni tildes) */
    const lista = perfilQ ? todas.filter((e) => perfilQ.split(/\s+/).every((w) => normalizar(e.titulo + ' ' + e.texto).includes(w))) : todas, visibles = new Set(lista.map((e) => e.id));
    nodosEntradas.forEach((el, id) => { if (!visibles.has(id)) { nodosEntradas.delete(id); salirTarjeta(el); } });
    let orden = 0; const ordenadas = [];
    lista.forEach((e) => {
      const firma = JSON.stringify([e.icono, e.titulo, e.texto, (e.imagenes || []).map((i) => i.id), e.autor, e.actualizado, yo]);
      let el = nodosEntradas.get(e.id);
      if (!el) {
        el = crearEntrada(e); el._firma = firma;
        el.classList.add('entra'); el.style.setProperty('--i', Math.min(orden++, 10));
        el.addEventListener('animationend', () => el.classList.remove('entra'), { once: true });
        nodosEntradas.set(e.id, el);
      } else if (el._firma !== firma) { morph(el, crearEntrada(e), true); el._firma = firma; }
      ordenadas.push(el);
    });
    let cursor = refs.lista.firstChild;
    ordenadas.forEach((el) => {
      while (cursor && cursor.classList && cursor.classList.contains('sale')) cursor = cursor.nextSibling;
      if (cursor === el) cursor = cursor.nextSibling; else refs.lista.insertBefore(el, cursor);
    });
    refs.cuenta.textContent = todas.length ? (perfilQ ? `${lista.length} de ${todas.length}` : String(todas.length)) : '';
    refs.vacio.hidden = lista.length > 0 || !perfCargadas;
    refs.vacio.textContent = todas.length ? 'Ninguna entrada coincide con esa búsqueda.' : (perfilVer === yo ? 'Todavía no hay nada en tu perfil. ¡Añade tu primera entrada!' : `Todavía no hay nada en el perfil de ${NOMBRE_ESCENA[perfilVer]}. Puedes añadir la primera entrada.`);
    if (!perfCargadas && !lista.length) { refs.vacio.hidden = false; refs.vacio.textContent = 'Cargando el perfil…'; }
  }

  /* ----- Acciones instantáneas del perfil (misma idea que el motor de v2.7) ----- */
  /* Aplica una acción sobre una copia del estado (crear / editar / borrar entradas, cambiar una frase). Es idempotente: si el servidor ya la tenía, no pasa nada */
  function aplicarOpPerfil(v, op) {
    if (op.k === 'frase') v.frases[op.quien] = op.frase;
    else if (op.k === 'crear') { if (!v.entradas.some((e) => e.id === op.entrada.id)) v.entradas.push(clon(op.entrada)); }
    else if (op.k === 'editar') { const e = v.entradas.find((x) => x.id === op.id); if (e) Object.assign(e, op.campos, { actualizado: op.t, imagenes: op.imagenes.map((i) => ({ id: i.id, w: i.w, h: i.h })) }); }
    else if (op.k === 'borrar') v.entradas = v.entradas.filter((e) => e.id !== op.id);
  }
  /* Lo que se ve = lo último que confirmó el servidor + las acciones que todavía no confirmó */
  function recomponerPerfiles() {
    const v = { frases: { ...perfServidor.frases }, entradas: perfServidor.entradas.map(clon) };
    perfPend.forEach((op) => aplicarOpPerfil(v, op));
    v.entradas.sort((a, b) => b.creado - a.creado);
    perfVista = v; pintarPerfil();
  }
  /* Se ve ya y se manda en segundo plano (a la cola) */
  function encolarPerfil(op) {
    op.sesion = sesion; op.t = Date.now();
    perfPend.push(op); recomponerPerfiles();
    colaPerf = colaPerf.then(() => enviarOpPerfil(op));
  }
  async function enviarOpPerfil(op) {
    if (op.sesion !== sesion || !perfPend.includes(op)) return;       // cambió la sesión mientras esperaba
    try {
      let r;
      if (op.k === 'frase') r = await api(`/perfiles/bio/${op.quien}`, { metodo: 'PUT', cuerpo: { frase: op.frase } });
      else if (op.k === 'crear') r = await api('/perfiles/entradas', { metodo: 'POST', cuerpo: { id: op.id, perfil: op.entrada.perfil, ...op.campos, imagenes: op.nuevas } });
      else if (op.k === 'editar') r = await api(`/perfiles/entradas/${op.id}`, { metodo: 'PUT', cuerpo: { ...op.campos, conservar: op.conservar, imagenes: op.nuevas } });
      else r = await api(`/perfiles/entradas/${op.id}`, { metodo: 'DELETE' });
      if (op.sesion !== sesion) return;
      /* Confirmada: pasa a ser lo que dice el servidor */
      if (op.k === 'frase') perfServidor.frases[op.quien] = r.frase;
      else if (op.k === 'borrar') perfServidor.entradas = perfServidor.entradas.filter((e) => e.id !== op.id);
      else perfServidor.entradas = [...perfServidor.entradas.filter((e) => e.id !== r.entrada.id), r.entrada];
      perfPend.splice(perfPend.indexOf(op), 1); perfGen++; recomponerPerfiles();
      if (!perfPend.length) cargarPerfiles();                          // por si la otra persona también cambió algo
    } catch (err) {
      if (op.sesion !== sesion) return;
      /* Rechazada: se quita de lo pendiente (la pantalla vuelve a lo que dice el servidor), aviso de error y, si era una entrada, se reabre la ventana con lo escrito */
      perfPend.splice(perfPend.indexOf(op), 1); perfGen++; recomponerPerfiles();
      avisar(`${AVISO_ERROR_PERFIL[op.k]}: ${err.message}`, 'error');
      if (op.form && (op.k === 'crear' || op.k === 'editar')) restaurarEntrada(op);
      if (op.k === 'frase') { firmaFrase = ''; pintarFrase(); }
      cargarPerfiles();
    }
  }
  /* Pide los perfiles al servidor (con ETag no gasta datos si nada cambió). Si hay acciones sin confirmar, o algo se confirmó mientras tanto, la respuesta se descarta */
  async function cargarPerfiles() {
    if (!yo || perfCargando) return;
    perfCargando = true;
    const gen = perfGen, ses = sesion;
    try {
      const r = await api('/perfiles');
      if (gen !== perfGen || ses !== sesion || perfPend.length) return;
      perfServidor = { frases: { M: r.perfiles.M.frase, xB: r.perfiles.xB.frase }, entradas: r.entradas };
      perfCargadas = true; recomponerPerfiles();
    } catch (e) { /* sin conexión: se reintenta en el próximo ciclo */ }
    finally { perfCargando = false; }
  }
  setInterval(() => { if (document.visibilityState === 'visible' && vista === 'perfiles' && yo) cargarPerfiles(); }, 12000);   // actualización automática solo mientras se ve un perfil
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && vista === 'perfiles') cargarPerfiles(); });

  async function borrarEntrada(e) {
    if (!(await confirmar({ titulo: 'Eliminar entrada', texto: `Se borrará «${planoDe(e.titulo)}» del perfil de ${NOMBRE_ESCENA[e.perfil]} para los dos y no se puede deshacer.`, boton: 'Eliminar' }))) return;
    encolarPerfil({ k: 'borrar', id: e.id });                         // desaparece al instante (si el servidor falla vuelve con un aviso)
  }

  /* ----- Ventana de entrada (nueva / editar) ----- */
  const modalEnt = $('modalEntrada');
  let entEditando = null;                                  // entrada que se está editando (null = nueva)
  let entPerfil = 'M';                                     // perfil donde se añade la entrada nueva
  let entIcono = 'star';                                   // ícono elegido
  let entImgs = [];                                        // imágenes de la ventana, en orden: { id, w, h, nuevo, dataUrl }
  let entProcesando = 0;                                   // imágenes que todavía se están achicando
  /* Muestra cómo quedará la ficha (ícono + título) mientras se escribe */
  function previaEntrada() { $('entPrevia').replaceChildren(icono(entIcono), h('span', { text: $('entTituloCampo').value.trim() || 'Título' })); }
  function elegirIconoEnt(nombre) {
    entIcono = nombre;
    $('entIconos').querySelectorAll('.icono-op').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === nombre)));
    previaEntrada();
  }
  /* La grilla de íconos (los mismos de las categorías) se crea la primera vez que se abre la ventana */
  function crearGrillaIconosEnt() {
    if ($('entIconos').children.length) return;
    $('entIconos').replaceChildren(...ICONOS_CAT.map(([n, alias]) => h('button', {
      class: 'icono-op', type: 'button', title: n.replace(/_/g, ' '), 'aria-label': n.replace(/_/g, ' '), 'aria-pressed': 'false',
      'data-n': n, 'data-b': normalizar(`${n.replace(/_/g, ' ')} ${alias}`), onclick: () => elegirIconoEnt(n) }, icono(n))));
  }
  $('entBuscarIcono').addEventListener('input', () => {
    const palabras = normalizar($('entBuscarIcono').value.trim()).split(/\s+/).filter(Boolean);
    let hay = 0;
    $('entIconos').querySelectorAll('.icono-op').forEach((b) => { const ok = palabras.every((w) => b.dataset.b.includes(w)); b.hidden = !ok; if (ok) hay++; });
    $('entSinIconos').hidden = hay > 0;
  });
  $('entTituloCampo').addEventListener('input', previaEntrada);
  /* v2.8.1: barra de formato completa sobre el texto de la entrada (negrita, cursiva, tachado, código, título, cita, viñetas, lista numerada, enlace y "ver cómo queda"),
     con los mismos botones que la de las notas: aplicarFormato() hace el trabajo sobre este cuadro de texto */
  function actualizarVistaEntrada() {
    const caja = $('entTextoPrevia');
    if (caja.hidden) return;
    const v = $('entTexto').value.trim();
    caja.replaceChildren(v ? md(v, 'post__texto') : h('span', { class: 'campo__ayuda', text: 'Todavía no escribiste nada.' }));
  }
  $('entBarraFormato').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // los botones no le quitan el foco (ni la selección) al texto
  $('entBarraFormato').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]'); if (!b) return;
    if (b.dataset.fmt === 'vista') {
      const ver = $('entTextoPrevia').hidden;
      $('entTextoPrevia').hidden = !ver; b.setAttribute('aria-pressed', String(ver));
      b.querySelector('.material-symbols-rounded').textContent = ver ? 'visibility_off' : 'visibility';
      actualizarVistaEntrada(); return;
    }
    aplicarFormato(b.dataset.fmt, $('entTexto'));
  });
  $('entTexto').addEventListener('input', actualizarVistaEntrada);
  /* Miniaturas de las imágenes de la ventana, cada una con su botón para quitarla */
  function pintarImgsEnt() {
    $('entImgs').replaceChildren(...entImgs.map((i) => h('div', { class: 'ent-img' },
      h('img', { src: i.nuevo ? i.dataUrl : srcImg(i), alt: '', draggable: 'false' }),
      h('button', { class: 'btn-icono ent-img__quitar', type: 'button', 'aria-label': 'Quitar imagen', title: 'Quitar', onclick: () => { entImgs = entImgs.filter((x) => x !== i); pintarImgsEnt(); } }, icono('close')))));
    const lleno = entImgs.length >= LIM_PERFIL.imagenes;
    $('btnEntImg').hidden = lleno;
    $('entTextoImg').textContent = entProcesando ? 'Procesando imágenes…' : (entImgs.length ? 'Añadir otra imagen' : 'Añadir imágenes');
    $('btnGuardarEntrada').disabled = entProcesando > 0;             // no se guarda hasta que terminen de achicarse
  }
  $('btnEntImg').addEventListener('click', () => $('entInputImg').click());
  $('entInputImg').addEventListener('change', async () => {
    const archivos = [...$('entInputImg').files].slice(0, Math.max(0, LIM_PERFIL.imagenes - entImgs.length)); $('entInputImg').value = '';
    if (!archivos.length) return void ($('errorEntrada').textContent = `Máximo ${LIM_PERFIL.imagenes} imágenes por entrada.`);
    $('errorEntrada').textContent = ''; entProcesando += archivos.length; pintarImgsEnt();
    for (const a of archivos) {
      try { const f = await comprimirFoto(a, { lado: 1024, maxChars: 450000 }); entImgs.push({ id: uuid(), w: f.w, h: f.h, nuevo: true, dataUrl: f.dataUrl }); }
      catch (e) { $('errorEntrada').textContent = 'No se pudo leer una de las imágenes. Prueba con otra.'; }
      entProcesando--; pintarImgsEnt();
    }
  });
  /* Abre la ventana: sin argumentos = entrada nueva en el perfil que se ve; con una entrada = editarla; "borrador" = lo que se había escrito (si el servidor rechazó el envío) */
  function abrirEntrada(entrada, borrador) {
    entEditando = entrada || null; entPerfil = entrada ? entrada.perfil : (borrador ? borrador.perfil : perfilVer);
    const d = borrador || (entrada ? { icono: entrada.icono, titulo: entrada.titulo, texto: entrada.texto, imgs: (entrada.imagenes || []).map((i) => ({ id: i.id, w: i.w, h: i.h, nuevo: false })) } : { icono: 'star', titulo: '', texto: '', imgs: [] });
    $('formEntrada').reset(); $('errorEntrada').textContent = ''; $('entBuscarIcono').value = ''; $('entSinIconos').hidden = true; entProcesando = 0;
    crearGrillaIconosEnt(); $('entIconos').querySelectorAll('.icono-op').forEach((b) => { b.hidden = false; });
    $('entTitulo').textContent = entEditando ? 'Editar entrada' : `Nueva entrada en el perfil de ${NOMBRE_ESCENA[entPerfil]}`;
    $('entTextoGuardar').textContent = entEditando ? 'Guardar' : 'Añadir';
    $('entTituloCampo').value = d.titulo; $('entTexto').value = d.texto;
    $('entTextoPrevia').hidden = true; $('entBtnVista').setAttribute('aria-pressed', 'false'); $('entBtnVista').querySelector('.material-symbols-rounded').textContent = 'visibility';   // v2.8.1: la vista previa empieza cerrada
    entImgs = d.imgs.map((i) => ({ ...i })); pintarImgsEnt();
    elegirIconoEnt(d.icono);
    abrirModal(modalEnt);
    const op = $('entIconos').querySelector('.icono-op[aria-pressed="true"]');                      // el ícono elegido queda a la vista dentro de la grilla
    if (op) { const g = $('entIconos'); g.scrollTop = Math.max(0, op.getBoundingClientRect().top - g.getBoundingClientRect().top + g.scrollTop - g.clientHeight / 2); }
    setTimeout(() => $('entTituloCampo').focus(), 80);
  }
  document.querySelectorAll('#modalEntrada [data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarModal(modalEnt)));
  modalEnt.addEventListener('mousedown', (e) => { if (e.target === modalEnt) cerrarModal(modalEnt); });
  $('formEntrada').addEventListener('submit', (e) => {
    e.preventDefault();
    const titulo = $('entTituloCampo').value.trim();
    if (!titulo) { $('errorEntrada').textContent = 'Ponle un título a la entrada.'; $('entTituloCampo').focus(); return; }
    if (entProcesando) return;
    const campos = { icono: entIcono, titulo, texto: $('entTexto').value.trim() };
    const form = { perfil: entPerfil, ...campos, imgs: entImgs.map((i) => ({ ...i })) };       // copia para reabrir la ventana si el servidor rechaza
    const nuevas = entImgs.filter((i) => i.nuevo).map((i) => ({ id: i.id, imagen: i.dataUrl, w: i.w, h: i.h }));
    entImgs.forEach((i) => { if (i.nuevo) imgsLocales.set(i.id, i.dataUrl); });                   // las imágenes se ven ya mismo con la copia local
    const imagenes = entImgs.map((i) => ({ id: i.id, w: i.w, h: i.h }));
    if (entEditando) encolarPerfil({ k: 'editar', id: entEditando.id, campos, imagenes, conservar: entImgs.filter((i) => !i.nuevo).map((i) => i.id), nuevas, form });
    else {
      const id = uuid(), ahora = Date.now();
      encolarPerfil({ k: 'crear', id, campos, nuevas, form, entrada: { id, perfil: entPerfil, ...campos, autor: yo, creado: ahora, actualizado: ahora, imagenes } });
    }
    cerrarModal(modalEnt);
  });
  /* Reabre la ventana con lo que se había escrito cuando el servidor rechazó una entrada nueva o una edición */
  function restaurarEntrada(op) {
    if (!modalEnt.hidden && !modalEnt.classList.contains('saliendo')) return;   // ya hay otra ventana abierta: no se pisa (una que se está cerrando no cuenta)
    const entrada = op.k === 'editar' ? (perfVista.entradas.find((e) => e.id === op.id) || null) : null;
    if (op.k === 'editar' && !entrada) return;                         // la entrada ya no existe
    abrirEntrada(entrada, op.form);
  }

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
