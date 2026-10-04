/* ============================================================
   script.js — Centro de información
   Qué hace: 1) tema claro/oscuro con fundido, 2) iconos "cargando" mientras llega la fuente de iconos,
   3) buscador que filtra las ventanas desplegables (sin importar mayúsculas ni tildes), 4) botón
   "Abrir todas / Cerrar todas", 5) índice de temas (chips) generado solo a partir de las secciones,
   6) enlaces internos con desplazamiento suave (#faq-id abre esa ventana), 7) onda al tocar.
   Para qué sirve: que la página tenga el mismo comportamiento que el Centro de ayuda de ÉLIX.
   Las respuestas viven en index.html (<details class="faq">), así que se pueden leer aunque este script no cargue.
   IMPORTANTE: se carga en el <head> (antes de pintar) para aplicar el tema sin parpadeo; por eso el resto
   de la lógica espera a DOMContentLoaded.
   ============================================================ */

/* ---------- 1) Tema claro / oscuro ---------- */
/* Qué hace: guarda la preferencia (localStorage, con respaldo en memoria si el navegador la bloquea), la aplica como
   data-tema="claro|oscuro" en <html>, pinta el color de la barra del navegador y avisa a quien escuche el cambio.
   Para qué sirve: que cada persona elija cómo ver la página con el botón de la barra superior. El CSS reacciona al atributo. */
const Tema = (() => {
  'use strict';
  const CLAVE = 'centro_tema';                                  // 'oscuro' (predeterminado) | 'claro'
  const VALIDOS = ['oscuro', 'claro'];
  const oyentes = [];                                           // funciones a llamar cuando el tema ya se aplicó
  /* Las animaciones siempre están activas (no se obedece "reducir movimiento" del sistema, igual que ÉLIX) */
  const sinMovimiento = () => false;

  /* Lee la preferencia guardada; si no hay (o no se puede leer) usa oscuro */
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
    if (sinMovimiento()) { aplicar(); return; }
    if (document.startViewTransition) { document.startViewTransition(aplicar); return; }
    const raiz = document.documentElement;
    raiz.classList.add('tema-cambiando'); aplicar();
    setTimeout(() => raiz.classList.remove('tema-cambiando'), 400);
  }

  aplicar();
  return { alternar, alCambiar: (fn) => { oyentes.push(fn); fn(actual); } };
})();

/* ---------- 2) Iconos cargando ---------- */
/* Qué hace: mientras la fuente de iconos (Material Symbols, fonts.google.com/icons) no terminó de descargarse, el navegador
   escribiría el NOMBRE de cada icono como texto ("search", "expand_more"…). Aquí se pone la clase "iconos-cargando" en <html> y el CSS
   muestra en su lugar una cajita con latido; apenas la fuente está lista la clase se quita. Si en 5 segundos no llegó (sin conexión), se rinde.
   Para qué sirve: que la página se vea prolija mientras carga. */
(() => {
  'use strict';
  const raiz = document.documentElement, LIMITE_MS = 5000, FAMILIA = 'Material Symbols Rounded';
  if (!document.fonts || !document.fonts[Symbol.iterator]) return;                 // navegadores muy viejos: no se toca nada
  raiz.classList.add('iconos-cargando');
  const desde = Date.now();
  const caras = () => [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === FAMILIA);
  const revisar = () => {
    const c = caras();
    c.forEach((f) => { if (f.status === 'unloaded') f.load().catch(() => { /* si falla, su estado pasa a "error" y se deja de esperar */ }); });
    const lista = c.length > 0 && c.every((f) => f.status === 'loaded' || f.status === 'error');   // sin ninguna cara registrada todavía = la hoja de Google Fonts aún no llegó
    if (lista || Date.now() - desde > LIMITE_MS) raiz.classList.remove('iconos-cargando'); else setTimeout(revisar, 80);
  };
  revisar();
})();

/* ---------- 3) Lógica de la página (cuando el HTML ya está listo) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sinMovimiento = () => false;   // animaciones siempre activas (no se obedece "reducir movimiento" del sistema, igual que ÉLIX)

  /* ----- Botón de tema (barra superior) ----- */
  /* Qué hace: al tocarlo alterna claro/oscuro y cambia su icono (sol = "pasar a claro", luna = "pasar a oscuro") y su etiqueta accesible. */
  const btnTema = $('btnTema');
  Tema.alCambiar((t) => {
    const claro = t === 'claro';
    btnTema.querySelector('.material-symbols-rounded').textContent = claro ? 'dark_mode' : 'light_mode';
    btnTema.setAttribute('aria-label', claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  });
  btnTema.addEventListener('click', Tema.alternar);

  const faqs = Array.from(document.querySelectorAll('.faq'));
  const secciones = Array.from(document.querySelectorAll('.ayuda-seccion'));
  const entrada = $('buscador');
  const indice = $('indice');
  const abiertasPorBusqueda = new Set();   // ventanas que abrió el buscador (se cierran al borrar la búsqueda)
  const MAX_AUTOABRIR = 6;                 // si hay más coincidencias que esto, no se abren solas (sería una pared de texto)

  /* ----- Índice de temas ----- */
  /* Qué hace: crea un chip por cada <section class="ayuda-seccion"> usando el icono y el texto de su título (h2).
     Para qué sirve: no hay que mantener el índice a mano; al agregar una sección nueva aparece sola. */
  secciones.forEach((s) => {
    const titulo = s.querySelector('.titulo-seccion'); if (!titulo) return;
    const chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = `#${s.id}`;
    const ico = document.createElement('span');
    ico.className = 'material-symbols-rounded';
    ico.textContent = titulo.querySelector('.material-symbols-rounded').textContent.trim();
    const txt = document.createElement('span');
    txt.textContent = titulo.querySelector('.titulo-seccion__texto').textContent.trim();
    chip.append(ico, txt);
    indice.append(chip);
  });

  /* ----- Texto buscable ----- */
  /* Minúsculas y sin tildes: "Cámara" == "camara" */
  const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /* Texto buscable de cada ventana: título + respuesta, SIN los nombres de los iconos (por ejemplo "edit" o "delete") */
  faqs.forEach((f) => {
    const copia = f.cloneNode(true);
    copia.querySelectorAll('.material-symbols-rounded').forEach((n) => n.remove());
    f._texto = normalizar(copia.textContent.replace(/\s+/g, ' '));
  });

  /* Lleva la vista hasta un elemento (suave, salvo que las animaciones estén desactivadas) */
  const irA = (el) => el.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' });

  /* ----- Contador y botón "Abrir todas / Cerrar todas" ----- */
  const visibles = () => faqs.filter((f) => !f.hidden);
  function pintarCuenta() {
    const n = visibles().length;
    $('cuenta').textContent = `${n} ${n === 1 ? 'ventana' : 'ventanas'}`;
  }
  function pintarBoton() {
    const v = visibles(), todasAbiertas = v.length > 0 && v.every((f) => f.open);
    const b = $('btnAbrirTodas');
    b.querySelector('.material-symbols-rounded').textContent = todasAbiertas ? 'unfold_less' : 'unfold_more';
    b.querySelector('.btn__texto').textContent = todasAbiertas ? 'Cerrar todas' : 'Abrir todas';
    b.hidden = v.length === 0;
  }
  $('btnAbrirTodas').addEventListener('click', () => {
    const v = visibles(), abrir = !v.every((f) => f.open);
    v.forEach((f) => { f.open = abrir; });
    abiertasPorBusqueda.clear();   // ahora el estado lo decidió la persona
    pintarBoton();
  });
  faqs.forEach((f) => f.addEventListener('toggle', () => { if (!f.open) abiertasPorBusqueda.delete(f); pintarBoton(); }));

  /* ----- Buscador ----- */
  /* Qué hace: muestra solo las ventanas que contienen TODAS las palabras escritas, oculta las secciones vacías y el índice,
     y abre solas las coincidencias si son pocas. Para qué sirve: encontrar rápido una respuesta en una página con muchas ventanas. */
  function filtrar() {
    const q = normalizar(entrada.value.trim());
    const palabras = q ? q.split(/\s+/) : [];
    faqs.forEach((f) => { f.hidden = palabras.length > 0 && !palabras.every((p) => f._texto.includes(p)); });
    /* Una sección sin ventanas visibles se oculta; mientras se busca, el índice de temas también */
    secciones.forEach((s) => { s.hidden = !s.querySelector('.faq:not([hidden])'); });
    indice.hidden = palabras.length > 0;
    const v = visibles();
    $('sinResultados').hidden = v.length > 0;
    /* Con pocas coincidencias se abren solas para leer la respuesta al instante; al borrar la búsqueda se vuelven a cerrar */
    if (palabras.length) {
      if (v.length <= MAX_AUTOABRIR) v.forEach((f) => { if (!f.open) { f.open = true; abiertasPorBusqueda.add(f); } });
    } else {
      abiertasPorBusqueda.forEach((f) => { f.open = false; });
      abiertasPorBusqueda.clear();
    }
    pintarCuenta(); pintarBoton();
  }
  entrada.addEventListener('input', filtrar);
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Escape' && entrada.value) { entrada.value = ''; filtrar(); } });   // Esc borra la búsqueda

  /* ----- Enlaces internos (chips del índice y enlaces "ver también" dentro de las respuestas) ----- */
  /* Si el destino es una ventana la abre; si está oculta por una búsqueda, limpia la búsqueda para poder mostrarla */
  function irAlDestino(id) {
    const el = id && document.getElementById(id); if (!el) return;
    if (entrada.value && (el.hidden || el.closest('[hidden]'))) { entrada.value = ''; filtrar(); }
    if (el.matches('details')) el.open = true;
    irA(el);
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();   // sin cambiar la dirección: así "volver" del navegador no recorre los anclajes
    irAlDestino(a.getAttribute('href').slice(1));
  }));

  /* Enlace directo desde otra pantalla o desde la barra del navegador: index.html#faq-colores abre esa ventana */
  function abrirDesdeHash() { const id = decodeURIComponent(location.hash.slice(1)); if (id) setTimeout(() => irAlDestino(id), 60); }
  window.addEventListener('hashchange', abrirDesdeHash);

  /* ----- Onda al tocar ----- */
  /* Qué hace: en todo elemento "tocable" (botones, iconos, chips) nace una onda en el punto exacto de la pulsación.
     Para qué sirve: dar respuesta visual al toque, igual que en ÉLIX.  */
  const SEL_ONDA = '.btn, .btn-icono, .chip';
  document.addEventListener('pointerdown', (e) => {
    if (sinMovimiento()) return;
    const host = e.target.closest ? e.target.closest(SEL_ONDA) : null;
    if (!host || host.disabled) return;
    const r = host.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
    const onda = document.createElement('span');
    onda.className = 'onda';
    onda.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    onda.addEventListener('animationend', () => onda.remove());
    host.append(onda);
  }, { passive: true });

  pintarCuenta(); pintarBoton(); abrirDesdeHash();
});