/* ============================================================================================================
   NUESTRO MURO — editor-imagen.js (NUEVO v3.0)
   Qué hace: antes de agregar una imagen (foto de una publicación o imágenes de una entrada de perfil) abre un editor a pantalla completa, como el
   de WhatsApp: RECORTAR (con proporciones y girar), DIBUJAR a mano alzada (colores y grosor) y escribir TEXTO (se arrastra con el dedo / mouse).
   Cómo se usa: const archivo = await EditorImagen.abrir(archivoOriginal, { contador: '1 de 3' }) → devuelve un File JPG ya editado, o null si se canceló.
   Para qué sirve: dejar la imagen como se quiere (recortada, con dibujos o texto) antes de publicarla.
   Reglas del proyecto: los colores del pincel / texto salen de variables CSS (--ei-color-1…8 en :root); los iconos son de fonts.google.com/icons.
   ============================================================================================================ */
(function () {
  'use strict';

  const LADO_MAX = 2000;                                              // lado más largo con el que se trabaja (la app la achica más al guardarla)
  const PROPORCIONES = [['libre', 'Libre', null], ['original', 'Original', 'orig'], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['3:4', '3:4', 3 / 4], ['16:9', '16:9', 16 / 9]];

  /* Crea un elemento: el(etiqueta, {class, text, …atributos, onclick}, ...hijos) */
  function el(tag, attrs, ...hijos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    hijos.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  const ico = (n) => el('span', { class: 'material-symbols-rounded', text: n, 'aria-hidden': 'true' });
  const colores = () => { const cs = getComputedStyle(document.documentElement); return [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cs.getPropertyValue('--ei-color-' + i).trim()); };

  /* Carga el archivo como imagen ya girada según su EXIF y no más grande que LADO_MAX → canvas base */
  async function cargar(archivo) {
    let fuente, w, h;
    try { fuente = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); w = fuente.width; h = fuente.height; }
    catch (e) {
      fuente = await new Promise((ok, mal) => { const i = new Image(), u = URL.createObjectURL(archivo); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = mal; i.src = u; });
      w = fuente.naturalWidth; h = fuente.naturalHeight;
    }
    const k = Math.min(1, LADO_MAX / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(fuente, 0, 0, c.width, c.height);
    if (fuente.close) fuente.close();
    return c;
  }

  function abrir(archivo, opciones = {}) {
    return new Promise(async (resolver) => {
      let base;
      try { base = await cargar(archivo); } catch (e) { return resolver(archivo); }   // no se puede leer: se sigue con el archivo tal cual (la app avisará si no sirve)
      const paleta = colores();
      /* Estado de edición */
      let modo = 'dibujar', trazos = [], textos = [], sel = -1, color = paleta[2] || '#fff', nivelPincel = 4, nivelTexto = 5, pila = [], escala = 1, proporcion = 'libre', rec = null;

      /* ----- Estructura ----- */
      const lienzo = el('canvas', { class: 'ei__lienzo' }), capaRec = el('div', { class: 'ei__recorte', hidden: true },
        el('div', { class: 'ei__rec-caja' }, ...['nw', 'ne', 'sw', 'se'].map((c) => el('span', { class: 'ei__asa ei__asa--' + c, 'data-asa': c }))));
      const escenario = el('div', { class: 'ei__escenario' }, lienzo, capaRec);
      const entradaTexto = el('input', { class: 'campo__entrada ei__texto', type: 'text', maxlength: '80', placeholder: 'Escribe el texto…', autocomplete: 'off', 'aria-label': 'Texto sobre la imagen' });
      const btnTexto = (n, t, f) => el('button', { class: 'btn-icono', type: 'button', title: t, 'aria-label': t, onclick: f }, ico(n));
      const subRecorte = el('div', { class: 'ei__sub', 'data-modo': 'recortar' },
        el('div', { class: 'ei__chips' }, PROPORCIONES.map(([k, t]) => el('button', { class: 'chip', type: 'button', 'data-prop': k, 'aria-pressed': String(k === proporcion), onclick: () => fijarProporcion(k), text: t }))),
        el('div', { class: 'ei__fila' }, btnTexto('rotate_left', 'Girar a la izquierda', () => girar(-1)), btnTexto('rotate_right', 'Girar a la derecha', () => girar(1)),
          el('button', { class: 'btn btn--fantasma', type: 'button', onclick: aplicarRecorte }, ico('crop'), 'Aplicar recorte')));
      const swatches = () => el('div', { class: 'ei__colores', role: 'group', 'aria-label': 'Color' }, paleta.map((c) => el('button', { class: 'ei__color', type: 'button', style: `--c:${c}`, 'data-color': c, 'aria-label': 'Color ' + c, 'aria-pressed': String(c === color), onclick: () => elegirColor(c) })));
      const subDibujo = el('div', { class: 'ei__sub', 'data-modo': 'dibujar' }, swatches(),
        el('label', { class: 'ei__fila' }, ico('brush'), el('input', { type: 'range', min: '1', max: '10', value: String(nivelPincel), 'aria-label': 'Grosor del pincel', oninput: (e) => { nivelPincel = Number(e.target.value); } })));
      const subTexto = el('div', { class: 'ei__sub', 'data-modo': 'texto' }, swatches(),
        el('div', { class: 'ei__fila' }, entradaTexto, btnTexto('add', 'Añadir texto', nuevoTexto), btnTexto('delete', 'Borrar el texto elegido', borrarTexto)),
        el('label', { class: 'ei__fila' }, ico('format_size'), el('input', { type: 'range', min: '1', max: '10', value: String(nivelTexto), 'aria-label': 'Tamaño del texto', oninput: (e) => { nivelTexto = Number(e.target.value); if (textos[sel]) { textos[sel].tam = tamTexto(); pintar(); } } })));
      const btnModo = (m, n, t) => el('button', { class: 'ei__modo', type: 'button', 'data-m': m, 'aria-pressed': String(m === modo), onclick: () => cambiarModo(m) }, ico(n), el('span', { text: t }));
      const btnDeshacer = el('button', { class: 'btn-icono', type: 'button', title: 'Deshacer', 'aria-label': 'Deshacer', onclick: deshacer }, ico('undo'));
      const raiz = el('div', { class: 'ei', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Editar imagen' },
        el('header', { class: 'ei__cab' },
          el('button', { class: 'btn-icono', type: 'button', title: 'Cancelar', 'aria-label': 'Cancelar', onclick: () => cerrar(null) }, ico('close')),
          el('strong', { class: 'ei__titulo', text: opciones.contador ? `Editar imagen ${opciones.contador}` : 'Editar imagen' }), btnDeshacer,
          el('button', { class: 'btn btn--yo ei__listo', type: 'button', onclick: terminar }, ico('check'), 'Listo')),
        escenario,
        el('footer', { class: 'ei__pie' }, subRecorte, subDibujo, subTexto,
          el('nav', { class: 'ei__modos', 'aria-label': 'Herramientas' }, btnModo('recortar', 'crop', 'Recortar'), btnModo('dibujar', 'draw', 'Dibujar'), btnModo('texto', 'text_fields', 'Texto'))));
      document.body.append(raiz); document.body.classList.add('modal-abierto');

      /* ----- Dibujo en pantalla ----- */
      const tamTexto = () => Math.max(base.width, base.height) * (0.03 + nivelTexto * 0.012);
      const grosor = () => Math.max(base.width, base.height) * nivelPincel * 0.0025;
      function medirEscenario() {
        const r = escenario.getBoundingClientRect(), k = Math.min(r.width / base.width, r.height / base.height);
        escala = k; lienzo.width = Math.round(base.width * k * devicePixelRatio); lienzo.height = Math.round(base.height * k * devicePixelRatio);
        lienzo.style.width = base.width * k + 'px'; lienzo.style.height = base.height * k + 'px';
      }
      /* Dibuja sobre ctx (escala px por px de la imagen) la base + trazos + textos */
      function componer(ctx, k, conSeleccion) {
        ctx.save(); ctx.scale(k, k); ctx.drawImage(base, 0, 0);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        trazos.forEach((t) => {
          ctx.strokeStyle = ctx.fillStyle = t.color; ctx.lineWidth = t.w;
          if (t.pts.length === 1) { ctx.beginPath(); ctx.arc(t.pts[0][0], t.pts[0][1], t.w / 2, 0, Math.PI * 2); ctx.fill(); return; }
          ctx.beginPath(); t.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        });
        textos.forEach((t, i) => {
          ctx.font = `700 ${t.tam}px "Space Grotesk", sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
          const m = ctx.measureText(t.texto || ' '); t.ancho = m.width; t.alto = t.tam * 1.2;
          ctx.lineWidth = t.tam * 0.16; ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ei-contorno-texto').trim() || 'transparent';   // v3.0: color del contorno desde :root (--ei-contorno-texto)
           ctx.lineJoin = 'round'; ctx.strokeText(t.texto, t.x, t.y);   // contorno oscuro: se lee sobre cualquier foto
          ctx.fillStyle = t.color; ctx.fillText(t.texto, t.x, t.y);
          if (conSeleccion && i === sel && modo === 'texto') { ctx.setLineDash([t.tam * 0.2, t.tam * 0.15]); ctx.lineWidth = Math.max(1.5, t.tam * 0.05); ctx.strokeStyle = '#fff'; ctx.strokeRect(t.x - t.ancho / 2 - t.tam * 0.2, t.y - t.alto / 2, t.ancho + t.tam * 0.4, t.alto); ctx.setLineDash([]); }
        });
        ctx.restore();
      }
      function pintar() { const ctx = lienzo.getContext('2d'); ctx.clearRect(0, 0, lienzo.width, lienzo.height); componer(ctx, escala * devicePixelRatio, true); }

      /* ----- Deshacer: se guarda una copia de todo antes de cada cambio ----- */
      const foto = () => ({ base, trazos: JSON.parse(JSON.stringify(trazos)), textos: JSON.parse(JSON.stringify(textos)) });
      function guardarPaso() { pila.push(foto()); if (pila.length > 12) pila.shift(); btnDeshacer.disabled = false; }
      function deshacer() { const f = pila.pop(); if (!f) return; base = f.base; trazos = f.trazos; textos = f.textos; sel = -1; btnDeshacer.disabled = !pila.length; medirEscenario(); pintar(); if (modo === 'recortar') iniciarRecorte(); }
      btnDeshacer.disabled = true;

      /* ----- Modos ----- */
      function cambiarModo(m) {
        if (modo === 'recortar' && m !== 'recortar') capaRec.hidden = true;
        modo = m; sel = -1;
        raiz.querySelectorAll('.ei__modo').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
        raiz.querySelectorAll('.ei__sub').forEach((s) => { s.hidden = s.dataset.modo !== m; });
        escenario.dataset.modo = m;
        if (m === 'recortar') iniciarRecorte(); pintar();
      }
      function elegirColor(c) {
        color = c; raiz.querySelectorAll('.ei__color').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === c)));
        if (modo === 'texto' && textos[sel]) { guardarPaso(); textos[sel].color = c; pintar(); }
      }

      /* ----- Coordenadas: de pantalla a imagen ----- */
      const aImagen = (ev) => { const r = lienzo.getBoundingClientRect(); return [(ev.clientX - r.left) / escala, (ev.clientY - r.top) / escala]; };

      /* ----- Dibujar y mover textos (un solo gesto: puntero) ----- */
      let gesto = null;
      lienzo.addEventListener('pointerdown', (ev) => {
        if (modo === 'dibujar') {
          guardarPaso(); const t = { color, w: grosor(), pts: [aImagen(ev)] }; trazos.push(t); gesto = { tipo: 'trazo', t };
          lienzo.setPointerCapture(ev.pointerId); pintar(); ev.preventDefault();
        } else if (modo === 'texto') {
          const [x, y] = aImagen(ev);
          let i = -1; for (let k = textos.length - 1; k >= 0; k--) { const t = textos[k]; if (Math.abs(x - t.x) <= t.ancho / 2 + t.tam * 0.3 && Math.abs(y - t.y) <= t.alto / 2 + t.tam * 0.1) { i = k; break; } }
          sel = i;
          if (i >= 0) { guardarPaso(); gesto = { tipo: 'texto', t: textos[i], dx: x - textos[i].x, dy: y - textos[i].y }; entradaTexto.value = textos[i].texto; lienzo.setPointerCapture(ev.pointerId); }
          pintar(); ev.preventDefault();
        }
      });
      lienzo.addEventListener('pointermove', (ev) => {
        if (!gesto) return;
        const [x, y] = aImagen(ev);
        if (gesto.tipo === 'trazo') gesto.t.pts.push([x, y]); else { gesto.t.x = Math.max(0, Math.min(base.width, x - gesto.dx)); gesto.t.y = Math.max(0, Math.min(base.height, y - gesto.dy)); }
        pintar();
      });
      const finGesto = () => { gesto = null; };
      lienzo.addEventListener('pointerup', finGesto); lienzo.addEventListener('pointercancel', finGesto);

      /* ----- Texto ----- */
      function nuevoTexto() {
        guardarPaso(); textos.push({ texto: 'Texto', color, tam: tamTexto(), x: base.width / 2, y: base.height / 2 }); sel = textos.length - 1;
        entradaTexto.value = 'Texto'; pintar(); entradaTexto.focus(); entradaTexto.select();
      }
      function borrarTexto() { if (!textos[sel]) return; guardarPaso(); textos.splice(sel, 1); sel = -1; entradaTexto.value = ''; pintar(); }
      entradaTexto.addEventListener('input', () => { if (textos[sel]) { textos[sel].texto = entradaTexto.value; pintar(); } });

      /* ----- Recorte ----- */
      function iniciarRecorte() {
        capaRec.hidden = false;
        const w = base.width * escala, hh = base.height * escala;
        rec = { x: 0, y: 0, w, h: hh }; if (razon()) ajustarProporcion(); pintarRecorte();   // arranca tomando TODA la imagen: solo se recorta si se mueven las asas
      }
      function razon() { const p = PROPORCIONES.find((q) => q[0] === proporcion); return !p || p[2] == null ? null : p[2] === 'orig' ? base.width / base.height : p[2]; }
      function ajustarProporcion() {
        const r = razon(), W = base.width * escala, H = base.height * escala; if (!r) return;
        let w = rec.w, h = w / r; if (h > H) { h = H; w = h * r; } if (w > W) { w = W; h = w / r; }
        rec.x = Math.max(0, Math.min(W - w, rec.x + (rec.w - w) / 2)); rec.y = Math.max(0, Math.min(H - h, rec.y + (rec.h - h) / 2)); rec.w = w; rec.h = h;
      }
      function fijarProporcion(k) { proporcion = k; raiz.querySelectorAll('[data-prop]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.prop === k))); ajustarProporcion(); pintarRecorte(); }
      function pintarRecorte() {
        const l = lienzo.offsetLeft, t = lienzo.offsetTop, caja = capaRec.firstChild;
        capaRec.style.cssText = `left:${l}px;top:${t}px;width:${lienzo.offsetWidth}px;height:${lienzo.offsetHeight}px`;
        Object.assign(caja.style, { left: rec.x + 'px', top: rec.y + 'px', width: rec.w + 'px', height: rec.h + 'px' });
      }
      let arrastre = null;
      capaRec.addEventListener('pointerdown', (ev) => {
        const asa = ev.target.dataset && ev.target.dataset.asa, r = capaRec.getBoundingClientRect();
        arrastre = { asa: asa || 'mover', px: ev.clientX - r.left, py: ev.clientY - r.top, ini: { ...rec } };
        capaRec.setPointerCapture(ev.pointerId); ev.preventDefault();
      });
      capaRec.addEventListener('pointermove', (ev) => {
        if (!arrastre) return;
        const r = capaRec.getBoundingClientRect(), W = r.width, H = r.height, mx = ev.clientX - r.left, my = ev.clientY - r.top, a = arrastre, i = a.ini, MIN = 40, ra = razon();
        if (a.asa === 'mover') { rec.x = Math.max(0, Math.min(W - i.w, i.x + mx - a.px)); rec.y = Math.max(0, Math.min(H - i.h, i.y + my - a.py)); }
        else {
          let x1 = i.x, y1 = i.y, x2 = i.x + i.w, y2 = i.y + i.h;
          if (a.asa.includes('w')) x1 = Math.max(0, Math.min(x2 - MIN, mx)); else x2 = Math.min(W, Math.max(x1 + MIN, mx));
          if (a.asa.includes('n')) y1 = Math.max(0, Math.min(y2 - MIN, my)); else y2 = Math.min(H, Math.max(y1 + MIN, my));
          if (ra) {                                                         // proporción fija: el alto sigue al ancho (se mantiene la esquina opuesta)
            let w = x2 - x1, h = w / ra; if (h > (a.asa.includes('n') ? y2 : H - y1)) { h = a.asa.includes('n') ? y2 : H - y1; w = h * ra; }
            if (a.asa.includes('w')) x1 = x2 - w; else x2 = x1 + w; if (a.asa.includes('n')) y1 = y2 - h; else y2 = y1 + h;
          }
          Object.assign(rec, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        }
        pintarRecorte();
      });
      const finRec = () => { arrastre = null; }; capaRec.addEventListener('pointerup', finRec); capaRec.addEventListener('pointercancel', finRec);

      /* Aplica el recorte: se "hornea" todo lo dibujado y se corta el rectángulo elegido; la nueva imagen pasa a ser la base */
      function aplicarRecorte() {
        guardarPaso();
        const k = 1 / escala, sx = Math.round(rec.x * k), sy = Math.round(rec.y * k), sw = Math.max(1, Math.round(rec.w * k)), sh = Math.max(1, Math.round(rec.h * k));
        const todo = hornear(), c = document.createElement('canvas'); c.width = sw; c.height = sh; c.getContext('2d').drawImage(todo, sx, sy, sw, sh, 0, 0, sw, sh);
        base = c; trazos = []; textos = []; sel = -1; medirEscenario(); iniciarRecorte(); pintar();
      }
      function girar(sentido) {
        guardarPaso(); const todo = hornear(), c = document.createElement('canvas'); c.width = todo.height; c.height = todo.width;
        const ctx = c.getContext('2d'); ctx.translate(c.width / 2, c.height / 2); ctx.rotate(sentido * Math.PI / 2); ctx.drawImage(todo, -todo.width / 2, -todo.height / 2);
        base = c; trazos = []; textos = []; sel = -1; medirEscenario(); iniciarRecorte(); pintar();
      }
      /* Imagen final a tamaño real: base + trazos + textos */
      function hornear() { const c = document.createElement('canvas'); c.width = base.width; c.height = base.height; componer(c.getContext('2d'), 1, false); return c; }

      /* ----- Terminar ----- */
      function cerrar(resultado) {
        window.removeEventListener('resize', alCambiarTamano); document.removeEventListener('keydown', alTeclear, true);
        raiz.remove(); if (!document.querySelector('.modal-fondo:not([hidden])')) document.body.classList.remove('modal-abierto');
        resolver(resultado);
      }
      function terminar() {
        if (modo === 'recortar' && rec && (rec.w < base.width * escala - 2 || rec.h < base.height * escala - 2)) aplicarRecorte();   // si el recorte quedó marcado, "Listo" también lo aplica
        hornear().toBlob((b) => cerrar(b ? new File([b], 'foto.jpg', { type: 'image/jpeg' }) : archivo), 'image/jpeg', 0.92);
      }
      const alCambiarTamano = () => { medirEscenario(); if (modo === 'recortar') iniciarRecorte(); pintar(); };
      const alTeclear = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(null); } };
      window.addEventListener('resize', alCambiarTamano); document.addEventListener('keydown', alTeclear, true);

      cambiarModo('dibujar'); requestAnimationFrame(() => { medirEscenario(); pintar(); });
    });
  }

  window.EditorImagen = { abrir };
})();
