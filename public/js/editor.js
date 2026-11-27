/* ============================================================================================================
   NUESTRO MURO — editor.js (NUEVO v3.0)
   Qué hace:
     1) Hace que los campos de texto (los marcados con data-rico) CREZCAN hacia abajo a medida que se escribe (autogrow).
     2) Formato "en vivo" como en WhatsApp: mientras se escribe, *palabra* se ve al instante en negrita, _palabra_ en cursiva, etc.
        Las marcas (* _ ~ ` == ++ # > …) NO desaparecen: se quedan escritas pero en gris. Al publicar / guardar ya no se ven
        (el texto se muestra con su formato, ver md() en script.js).
   Cómo lo hace: cada campo se envuelve en <div class="vivo">; detrás del <textarea> (con el texto transparente, solo se ve el cursor)
        va un <div class="vivo__espejo"> que repite exactamente el mismo texto con colores y estilos. Para que el cursor nunca se
        desalinee, el espejo solo usa estilos que NO cambian el ancho de las letras (trazo grueso en vez de negrita real, etc.).
   Para qué sirve: ver el formato mientras se escribe, sin saber Markdown.
   Se carga ANTES que script.js, que usa window.Editor (MD_INLINE compartido, envolver, refrescar).
   ============================================================================================================ */
(function () {
  'use strict';

  /* Marcas dentro de una línea. Grupos (el orden NO se puede cambiar, script.js los lee por número):
     1 ```mono``` · 2 `código` · 3/4 *negrita* · 5/6 ~tachado~ · 7/8 _cursiva_ · 9/10/11 [texto](url) · 12 link suelto
     v3.0 (se agregan al final): 13/14 ==resaltado== · 15/16 ++subrayado++ · 17/18 nota al pie [^id] */
  const MD_INLINE = '(```[^`\\n]+```)|(`[^`\\n]+`)|(\\*([^\\s*](?:[^*\\n]*?[^\\s*])?)\\*)|(~([^\\s~](?:[^~\\n]*?[^\\s~])?)~)|(\\b_([^\\s_](?:[^_\\n]*?[^\\s_])?)_\\b)|(\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\))|(https?:\\/\\/[^\\s<]+)'
    + '|(==([^\\s=](?:[^=\\n]*?[^\\s=])?)==)|(\\+\\+([^\\s+](?:[^+\\n]*?[^\\s+])?)\\+\\+)|(\\[\\^([^\\]\\s]+)\\])';

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mk = (s) => `<span class="v-m">${esc(s)}</span>`;               // marca (los símbolos): se ve en gris

  /* Texto de UNA línea → HTML del espejo (las marcas en gris y lo de adentro con su estilo). Se llama a sí misma para negrita dentro de cursiva, etc. */
  function enLinea(txt) {
    const re = new RegExp(MD_INLINE, 'g');
    let out = '', ultimo = 0, m;
    while ((m = re.exec(txt))) {
      out += esc(txt.slice(ultimo, m.index));
      if (m[1]) out += mk('```') + `<span class="v-cod">${esc(m[1].slice(3, -3))}</span>` + mk('```');
      else if (m[2]) out += mk('`') + `<span class="v-cod">${esc(m[2].slice(1, -1))}</span>` + mk('`');
      else if (m[3]) out += mk('*') + `<span class="v-neg">${enLinea(m[4])}</span>` + mk('*');
      else if (m[5]) out += mk('~') + `<span class="v-tac">${enLinea(m[6])}</span>` + mk('~');
      else if (m[7]) out += mk('_') + `<span class="v-cur">${enLinea(m[8])}</span>` + mk('_');
      else if (m[9]) out += mk('[') + `<span class="v-enl">${enLinea(m[10])}</span>` + mk(`](${m[11]})`);
      else if (m[12]) out += `<span class="v-enl">${esc(m[12])}</span>`;
      else if (m[13]) out += mk('==') + `<span class="v-res">${enLinea(m[14])}</span>` + mk('==');
      else if (m[15]) out += mk('++') + `<span class="v-sub">${enLinea(m[16])}</span>` + mk('++');
      else if (m[17]) out += mk('[^') + `<span class="v-nota">${esc(m[18])}</span>` + mk(']');
      ultimo = m.index + m[0].length;
    }
    return out + esc(txt.slice(ultimo));
  }

  /* Texto completo → HTML del espejo. Reconoce también las marcas de comienzo de línea (título, cita, lista…) y los bloques de código */
  function resaltar(texto) {
    const ls = String(texto).replace(/\r\n?/g, '\n').split('\n');
    let enCodigo = false, m;
    const html = ls.map((l) => {
      if (/^```/.test(l) && !/^```[^`]+```\s*$/.test(l)) { enCodigo = !enCodigo; return `<span class="v-cod v-m">${esc(l)}</span>`; }   // línea de apertura / cierre del bloque
      if (enCodigo) return `<span class="v-cod">${esc(l)}</span>`;
      if ((m = l.match(/^(#{1,3})(\s+)(.*)$/))) return mk(m[1] + m[2]) + `<span class="v-tit v-tit${m[1].length}">${enLinea(m[3])}</span>`;
      if (/^\s*([-*_])\1{2,}\s*$/.test(l)) return `<span class="v-m">${esc(l)}</span>`;                 // línea separadora
      if ((m = l.match(/^(>\s?)(.*)$/))) return mk(m[1]) + `<span class="v-cita">${enLinea(m[2])}</span>`;
      if ((m = l.match(/^(\s*[-*+]\s+)(.*)$/))) return mk(m[1]) + enLinea(m[2]);
      if ((m = l.match(/^(\s*\d+[.)]\s+)(.*)$/))) return mk(m[1]) + enLinea(m[2]);
      if ((m = l.match(/^(\[\^[^\]\s]+\]:\s*)(.*)$/))) return mk(m[1]) + enLinea(m[2]);                  // definición de nota al pie
      if (/^\s*\|.*\|\s*$/.test(l)) {                                                                 // fila de tabla: las barras | en gris
        if (/^\s*\|?[\s:|-]+\|?\s*$/.test(l) && /-{3}/.test(l)) return `<span class="v-m">${esc(l)}</span>`;
        return l.split('|').map((c, k) => (k ? mk('|') : '') + enLinea(c)).join('');
      }
      return enLinea(l);
    });
    return html.join('\n') + '​';                                                                 // el último salto de línea también ocupa su renglón
  }

  /* Propiedades de la letra y el relleno que el espejo copia del campo (así el texto cae EXACTAMENTE encima) */
  const COPIAR = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textIndent', 'tabSize',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'];

  /* Alto automático: el campo crece con lo escrito hasta su max-height (CSS); pasado eso aparece el scroll */
  function crecer(t) {
    if (!t.offsetParent && !t.getClientRects().length) return;           // oculto (ventana cerrada): se vuelve a calcular al abrirla
    const cs = getComputedStyle(t);
    t.style.height = 'auto';
    const borde = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const tope = parseFloat(cs.maxHeight);
    let alto = t.scrollHeight + borde;
    if (!isNaN(tope) && alto > tope) { alto = tope; t.style.overflowY = 'auto'; } else t.style.overflowY = 'hidden';
    t.style.height = alto + 'px';
  }

  /* Repinta el espejo y recalcula el alto. Se llama al escribir, al cambiar el valor por código y al abrir una ventana */
  function refrescar(t) {
    const esp = t._espejo;
    if (esp) {
      const cs = getComputedStyle(t);
      COPIAR.forEach((p) => { esp.style[p] = cs[p]; });
      /* si el campo tiene barra de desplazamiento, el espejo reserva el mismo ancho para que las líneas corten en el mismo lugar */
      const barra = t.offsetWidth - t.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
      if (barra > 0) esp.style.paddingRight = (parseFloat(cs.paddingRight) || 0) + barra + 'px';
      esp.innerHTML = resaltar(t.value);
      esp.scrollTop = t.scrollTop;
    }
    crecer(t);
    if (esp) esp.scrollTop = t.scrollTop;
  }

  /* Envuelve un <textarea> en .vivo (con su espejo) y lo deja listo. Devuelve el envoltorio, que es lo que hay que poner en la página.
     Si el campo ya estaba envuelto devuelve su envoltorio. */
  function envolverSimple(t) {
    if (t._vivo) return t._vivo;
    const caja = document.createElement('div'), esp = document.createElement('div');
    caja.className = 'vivo'; esp.className = 'vivo__espejo'; esp.setAttribute('aria-hidden', 'true');
    const padre = t.parentNode, sig = t.nextSibling;                   // si el campo ya está en la página, el envoltorio ocupa su lugar
    caja.append(esp, t);
    if (padre) padre.insertBefore(caja, sig);
    t._vivo = caja; t._espejo = esp;
    /* Si el valor se cambia por código (editar una publicación, vaciar el campo al enviar…), también se repinta */
    const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    Object.defineProperty(t, 'value', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); refrescar(this); } });
    t.addEventListener('input', () => {
      if (t.hasAttribute('data-linea') && /\n/.test(t.value)) { const p = t.selectionStart; d.set.call(t, t.value.replace(/\s*\n+\s*/g, ' ')); t.setSelectionRange(p, p); }   // campos de una línea: pegar con saltos los convierte en espacios
      refrescar(t);
    });
    t.addEventListener('scroll', () => { esp.scrollTop = t.scrollTop; });
    t.addEventListener('focus', () => refrescar(t));
    if (typeof ResizeObserver !== 'undefined') {                         // si cambia el ancho (girar el celular, achicar la ventana) se vuelve a calcular el alto
      let ancho = 0;
      new ResizeObserver(() => { if (t.offsetWidth !== ancho) { ancho = t.offsetWidth; refrescar(t); } }).observe(t);
    }
    refrescar(t);
    return caja;
  }

  /* Repinta todos los campos de una ventana (se llama al abrirla: antes estaban ocultos y no se podía medir el alto) */
  function refrescarTodo(raiz) { (raiz || document).querySelectorAll('textarea[data-rico]').forEach((t) => { if (t._espejo) refrescar(t); }); }

  /* ============================================================================================================
     [v3.2] EDITOR POR BLOQUES (solo para los cuadros de texto grandes: data-rico="completo")
     Qué hace: el texto grande se divide en BLOQUES (tabla, título, lista, cita, bloque de código, línea separadora y párrafos).
       - El bloque donde está el cursor se edita como siempre (letras con las marcas en gris, barra de formato, atajos).
       - Los demás bloques se ven YA FORMATEADOS, sin símbolos, igual que quedarán en la publicación (como en Notion u Obsidian). Tocar uno lo abre para editarlo.
       - Las TABLAS se ven dibujadas y se editan celda por celda: botones para agregar / quitar filas y columnas, Tab / Enter / flechas para moverse.
     El texto real (Markdown) sigue siendo el de siempre: el <textarea> original queda oculto y guarda el texto completo, así el resto de la app
     (publicar, detectar cambios sin guardar, vista previa) funciona igual. Todo lo que se hace en los bloques se copia ahí al instante.
     Para qué sirve: escribir con formato y armar tablas viendo el resultado, sin saber Markdown.
     ============================================================================================================ */
  let mdFn = null;                                                       // lo pone script.js: md(texto, clase) → nodo con el texto formateado
  const config = (o) => { if (o && o.md) mdFn = o.md; };
  const RE_TABLA = /^\s*\|.*\|\s*$/, RE_SEPT = /^\s*\|?[\s:|-]+\|?\s*$/, RE_TIT = /^#{1,3}\s/, RE_HR = /^\s*([-*_])\1{2,}\s*$/, RE_CITA = /^>/, RE_LISTA = /^\s*([-*+]|\d+[.)])\s+/;
  const esVallaAbre = (l) => /^```/.test(l) && !/^```[^`]+```\s*$/.test(l);
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const icono = (n) => el('span', 'material-symbols-rounded', n);       // Material Symbols (fonts.google.com/icons)
  function tipoDe(l) {
    if (esVallaAbre(l)) return 'codigo';
    if (RE_TABLA.test(l)) return 'tabla';
    if (RE_TIT.test(l)) return 'titulo';
    if (RE_HR.test(l)) return 'hr';
    if (RE_CITA.test(l)) return 'cita';
    if (RE_LISTA.test(l)) return 'lista';
    return 'p';
  }
  /* Texto → { ini, bloques: [{ tipo, texto, pre }], fin }. "pre" = lo que hay entre el bloque anterior y éste (saltos de línea); ini y fin = saltos al principio y al final.
     Unir todo de nuevo (ini + pre + texto + … + fin) devuelve EXACTAMENTE el texto original. */
  function partir(texto) {
    const ls = String(texto).replace(/\r\n?/g, '\n').split('\n'), vacia = (l) => l.trim() === '', bs = [];
    let i = 0, ultimo = -1;
    while (i < ls.length && vacia(ls[i])) i++;
    if (i === ls.length) return { ini: '', bloques: [], fin: ls.length > 1 ? ls.join('\n') : '' };
    const ini = ls.slice(0, i).map((l) => l + '\n').join('');
    while (i < ls.length) {
      if (vacia(ls[i])) { i++; continue; }
      const t = tipoDe(ls[i]); let fin = i;
      if (t === 'codigo') { fin = i + 1; while (fin < ls.length && !/^```/.test(ls[fin])) fin++; fin = Math.min(fin, ls.length - 1); }
      else if (t === 'tabla' || t === 'cita' || t === 'lista') { while (fin + 1 < ls.length && !vacia(ls[fin + 1]) && tipoDe(ls[fin + 1]) === t) fin++; }
      else if (t === 'p') { while (fin + 1 < ls.length && !vacia(ls[fin + 1]) && tipoDe(ls[fin + 1]) === 'p') fin++; }
      bs.push({ tipo: t, texto: ls.slice(i, fin + 1).join('\n'), pre: ultimo < 0 ? '' : '\n' + ls.slice(ultimo + 1, i).map((l) => l + '\n').join('') });
      ultimo = fin; i = fin + 1;
    }
    return { ini, bloques: bs, fin: ls.slice(ultimo + 1).map((l) => '\n' + l).join('') };
  }

  /* ----- Tablas: texto Markdown ⇄ modelo { filas: [[celda…]…], alin: ['', 'c', 'd', 'i'…] } ----- */
  const partirFila = (l) => { let s = l.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1); return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')); };
  const esSepFila = (l) => RE_SEPT.test(l) && /-{3}/.test(l) && partirFila(l).every((c) => /^:?-{3,}:?$/.test(c));
  function parsearTabla(texto) {
    const filas = []; let alin = null;
    texto.split('\n').forEach((l, k) => {
      if (esSepFila(l)) { if (!alin) alin = partirFila(l).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'd' : c.startsWith(':') ? 'i' : '')); return; }
      filas.push(partirFila(l));
    });
    if (!filas.length) filas.push(['']);
    const n = Math.max(...filas.map((f) => f.length));
    filas.forEach((f) => { while (f.length < n) f.push(''); });
    alin = (alin || []).slice(0, n); while (alin.length < n) alin.push('');
    return { filas, alin };
  }
  function serializarTabla(m) {
    const esc = (c) => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' '), fila = (r) => '| ' + r.map(esc).join(' | ') + ' |';
    const sep = '| ' + m.alin.map((a) => (a === 'c' ? ':---:' : a === 'd' ? '---:' : a === 'i' ? ':---' : '---')).join(' | ') + ' |';
    return [fila(m.filas[0]), sep, ...m.filas.slice(1).map(fila)].join('\n');
  }
  const tablaNueva = (cols, filas) => ({ filas: Array.from({ length: filas }, (_, f) => Array.from({ length: cols }, (_, c) => (f === 0 ? 'Columna ' + (c + 1) : ''))), alin: Array(cols).fill('') });

  /* Cuántos caracteres "visibles" (sin marcas ni la dirección de un enlace) hay antes de la posición n del texto: sirve para ubicar el cursor al tocar un bloque ya formateado */
  function indiceVisible(texto, visibles) {
    const ocultos = new Set(); for (const m of texto.matchAll(/\]\(https?:\/\/[^)\s]*\)/g)) for (let k = m.index + 1; k < m.index + m[0].length; k++) ocultos.add(k);
    let vis = 0;
    for (let k = 0; k < texto.length; k++) { if (/\s/.test(texto[k]) || ocultos.has(k) || /[*_~`=+#>[\]]/.test(texto[k])) continue; if (vis === visibles) return k; vis++; }
    return texto.length;
  }

  function envolverBloques(t) {
    const nat = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const max = Number(t.getAttribute('maxlength')) || 0;
    const caja = el('div', 'vbloques campo__entrada'), cont = el('div', 'vbloques__cont');
    caja.append(cont);
    const padre = t.parentNode, sig = t.nextSibling; caja.append(t); if (padre) padre.insertBefore(caja, sig);   // el envoltorio ocupa el lugar del cuadro (que queda oculto)
    t.style.display = 'none'; t.tabIndex = -1; t.setAttribute('aria-hidden', 'true');
    let modelo = { ini: '', bloques: [], fin: '' }, act = null, reloj = 0;
    const nodos = new Map();                                              // bloque → su nodo en pantalla

    /* Texto completo a partir de los bloques (los bloques "extra" vacíos —el lugar para escribir antes/después de una tabla— no cuentan) */
    function unir() {
      let o = modelo.ini;
      modelo.bloques.forEach((b) => { if (b.extra) { if (b.texto) o += b.extra === 'fin' ? '\n\n' + b.texto : b.texto + '\n\n'; } else o += b.pre + b.texto; });
      return o + modelo.fin;
    }
    /* Copia el texto completo al cuadro oculto y avisa (así el resto de la app se entera como siempre) */
    function sincronizar() { nat.set.call(t, unir()); t.dispatchEvent(new Event('input', { bubbles: true })); }
    /* Mantiene un lugar para escribir antes / después de una tabla y un párrafo vacío si no hay nada */
    function normalizar() {
      modelo.bloques = modelo.bloques.filter((b) => !(b.extra && !b.texto));
      if (!modelo.bloques.length) modelo.bloques.push({ tipo: 'p', texto: '', pre: '' });
      if (modelo.bloques[0].tipo === 'tabla') modelo.bloques.unshift({ tipo: 'p', texto: '', pre: '', extra: 'ini' });
      const u = modelo.bloques[modelo.bloques.length - 1]; if (u.tipo === 'tabla') modelo.bloques.push({ tipo: 'p', texto: '', pre: '\n\n', extra: 'fin' });
    }
    function reconstruir() {
      act = null; nodos.clear(); modelo = partir(nat.get.call(t)); normalizar(); pintar();
    }

    /* ----- Pintado ----- */
    function crearNodo(b) { return b.tipo === 'tabla' ? nodoTabla(b) : nodoTexto(b); }
    function pintar() {
      const hijos = modelo.bloques.map((b) => { let n = nodos.get(b); if (!n) { n = crearNodo(b); nodos.set(b, n); } return n; });
      [...cont.children].forEach((x) => { if (!hijos.includes(x)) x.remove(); });   // primero se quitan los nodos que sobran, así los que quedan no se mueven (y no pierden el foco)
      hijos.forEach((n, k) => { if (cont.children[k] !== n) cont.insertBefore(n, cont.children[k] || null); });   // solo se mueve lo que cambió (no se pierde el foco)
      while (cont.children.length > hijos.length) cont.lastElementChild.remove();
      const solo = modelo.bloques.length === 1 && !modelo.bloques[0].texto;
      cont.classList.toggle('vbloques__cont--vacio', solo);
    }
    function repintarNodo(b) { const v = nodos.get(b); nodos.delete(b); const n = crearNodo(b); nodos.set(b, n); if (v && v.parentNode) v.replaceWith(n); else pintar(); }

    /* Bloque de texto: formateado (vista) o con el editor en vivo (el que tiene el cursor) */
    function nodoTexto(b) {
      const n = el('div', 'vb vb--texto');
      const prev = el('div', 'vb__prev');
      if (b.texto.trim()) { prev.append(mdFn ? mdFn(b.texto, 'post__texto') : document.createTextNode(b.texto)); }
      else { prev.classList.add('vb__prev--vacio'); prev.dataset.ph = modelo.bloques.length === 1 ? (t.getAttribute('placeholder') || '') : ''; }
      prev.addEventListener('click', (e) => { e.preventDefault(); activar(b, b.texto.trim() ? indiceVisible(b.texto, Math.max(0, posClic(prev, e))) : 0); });   // tocar = editar este bloque
      n.append(prev);
      return n;
    }
    function posClic(prev, ev) {
      let r = null;
      if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(ev.clientX, ev.clientY);
      else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(ev.clientX, ev.clientY); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
      if (!r || !prev.contains(r.startContainer)) return 1e9;
      const r2 = document.createRange(); r2.selectNodeContents(prev); r2.setEnd(r.startContainer, r.startOffset);
      return r2.toString().replace(/\s/g, '').length;
    }

    /* ----- Bloque activo (el que se edita) ----- */
    function ultimoEditable() { for (let k = modelo.bloques.length - 1; k >= 0; k--) if (modelo.bloques[k].tipo !== 'tabla') return modelo.bloques[k]; return modelo.bloques[0]; }
    function activar(b, pos) {
      if (act && act.b === b) { act.ta.focus(); if (pos != null) act.ta.setSelectionRange(pos, pos); return act.ta; }
      if (act) cerrarActivo();
      if (!modelo.bloques.includes(b)) return null;
      const ta = document.createElement('textarea');
      ta.className = 'campo__entrada vb__campo'; ta.rows = 1; ta.dataset.rico = 'completo'; ta.dataset.bloque = ''; ta._maestro = t;
      ta.setAttribute('aria-label', t.getAttribute('aria-label') || 'Texto'); ta.autocomplete = 'off';
      if (modelo.bloques.length === 1 && !b.texto) ta.placeholder = t.getAttribute('placeholder') || '';
      ta.value = b.texto;
      const envol = envolverSimple(ta);
      const n = nodos.get(b); n.replaceChildren(envol); n.classList.add('vb--activo');
      act = { b, ta };
      limitar();
      ta.addEventListener('input', () => { b.texto = ta.value; sincronizar(); limitar(); });
      ta.addEventListener('keydown', (e) => teclaBloque(e, b, ta));
      ta.focus(); const p = pos == null ? ta.value.length : Math.min(pos, ta.value.length); ta.setSelectionRange(p, p);
      refrescar(ta);
      return ta;
    }
    /* El límite de caracteres (maxlength) del cuadro original vale para el texto completo: cada bloque puede escribir solo lo que queda */
    function limitar() { if (!act || !max) return; const otros = unir().length - act.ta.value.length; act.ta.maxLength = Math.max(0, max - otros); }
    /* Deja de editar el bloque activo: lo vuelve a analizar (si se escribió un título o una tabla, o una línea en blanco, se separa en bloques) y lo muestra formateado */
    function cerrarActivo() {
      if (!act) return;
      const { b, ta } = act; act = null; b.texto = ta.value; clearTimeout(reloj);
      const k = modelo.bloques.indexOf(b); if (k < 0) return;
      if (b.extra && b.texto) { b.extra = false; if (b.pre === '' && k > 0) b.pre = '\n\n'; const sg = modelo.bloques[k + 1]; if (sg && !sg.pre && !sg.extra) sg.pre = '\n\n'; }
      const p = partir(b.texto);
      if (!p.bloques.length) {                                            // quedó vacío o solo espacios
        if (!b.texto.trim() && modelo.bloques.length > 1 && !b.extra) { const sg = modelo.bloques[k + 1]; if (sg) sg.pre = b.pre; else if (k > 0) modelo.fin = ''; modelo.bloques.splice(k, 1); nodos.delete(b); }
        else if (!b.texto.trim()) b.texto = b.extra ? '' : '';
      } else if (!(p.bloques.length === 1 && p.bloques[0].tipo === b.tipo && !p.ini && !p.fin)) {   // se separó en varios bloques o cambió de tipo
        const nuevos = p.bloques.map((x, i) => ({ tipo: x.tipo, texto: x.texto, pre: i === 0 ? b.pre + p.ini : x.pre }));
        const sg = modelo.bloques[k + 1]; if (sg) sg.pre = p.fin + sg.pre; else modelo.fin = p.fin + modelo.fin;
        modelo.bloques.splice(k, 1, ...nuevos); nodos.delete(b);
      }
      normalizar(); pintar();
      modelo.bloques.forEach((x) => { if (x.tipo !== 'tabla' && !(act && act.b === x)) { const v = nodos.get(x); if (v && (v.querySelector('.vivo') || x === b)) repintarNodo(x); } });
      sincronizar();
    }
    /* Flechas y Retroceso en los bordes del bloque pasan al bloque de al lado */
    function teclaBloque(e, b, ta) {
      const k = modelo.bloques.indexOf(b), enPrimera = !ta.value.slice(0, ta.selectionStart).includes('\n'), enUltima = !ta.value.slice(ta.selectionEnd).includes('\n');
      const sinSel = ta.selectionStart === ta.selectionEnd;
      if (e.key === 'ArrowUp' && enPrimera && sinSel && k > 0) { e.preventDefault(); irA(k - 1, 'fin'); }
      else if (e.key === 'ArrowDown' && enUltima && sinSel && k < modelo.bloques.length - 1) { e.preventDefault(); irA(k + 1, 'ini'); }
      else if (e.key === 'Backspace' && sinSel && ta.selectionStart === 0 && k > 0) {
        const ant = modelo.bloques[k - 1];
        if (ant.tipo !== 'tabla' && !ant.extra && !b.extra) {              // unir con el bloque de arriba (como borrar el salto de línea)
          e.preventDefault(); const junta = ant.texto.length + (ant.texto && ta.value ? 1 : 0);
          act = null; ant.texto = ant.texto + (ant.texto && ta.value ? '\n' : '') + ta.value; modelo.bloques.splice(k, 1); nodos.delete(b); nodos.delete(ant);
          const sg = modelo.bloques[k]; if (sg) sg.pre = b.pre;
          normalizar(); pintar(); sincronizar(); activar(ant, junta);
        } else if (ant.tipo === 'tabla') { e.preventDefault(); irA(k - 1, 'fin'); }
      }
    }
    function irA(k, donde) {
      const b = modelo.bloques[k]; if (!b) return;
      if (b.tipo === 'tabla') { if (act) cerrarActivo(); const n = nodos.get(b); if (n && n._enfocar) n._enfocar(donde === 'fin' ? -1 : 0, 0); return; }
      const ta = activar(b, donde === 'fin' ? 1e9 : 0); if (ta && donde === 'ini') ta.setSelectionRange(0, 0);
    }

    /* ----- Tabla dibujada y editable ----- */
    function nodoTabla(b) {
      const m = parsearTabla(b.texto);
      let fa = 0, ca = 0;                                                  // celda activa (fila, columna)
      const raiz = el('div', 'vb vb--tabla'), tabla = el('div', 'vtabla'), barra = el('div', 'vtabla__barra'), cuerpo = el('div', 'vtabla__cuerpo'), scroll = el('div', 'vtabla__scroll'), tb = el('table', 'vtabla__t');
      const boton = (ic, txt, ayuda, fn, extra) => { const x = el('button', 'vtabla__btn' + (extra ? ' ' + extra : '')); x.type = 'button'; x.title = ayuda; x.setAttribute('aria-label', ayuda); x.append(icono(ic)); if (txt) x.append(el('span', '', txt)); x.addEventListener('mousedown', (e) => e.preventDefault()); x.addEventListener('click', fn); return x; };
      const guardar = () => { b.texto = serializarTabla(m); sincronizar(); };
      function celda(f, c) { return tb.querySelector(`[data-f="${f}"][data-c="${c}"]`); }
      function enfocar(f, c, sel) { f = f < 0 ? m.filas.length - 1 : f; const i = celda(Math.min(f, m.filas.length - 1), Math.min(c, m.filas[0].length - 1)); if (i) { i.focus(); if (sel) i.select(); } }
      function resaltar() { tb.querySelectorAll('.vtabla__fila-act, .vtabla__col-act').forEach((x) => x.classList.remove('vtabla__fila-act', 'vtabla__col-act')); tb.querySelectorAll(`[data-f="${fa}"]`).forEach((x) => x.parentElement.classList.add('vtabla__fila-act')); tb.querySelectorAll(`[data-c="${ca}"]`).forEach((x) => x.parentElement.classList.add('vtabla__col-act')); btnQF.disabled = m.filas.length <= 1; btnQC.disabled = m.filas[0].length <= 1; }
      function pintarTabla(f, c, sel) {
        tb.style.setProperty('--cols', String(m.filas[0].length));
        tb.replaceChildren(...m.filas.map((fila, i) => { const tr = el('tr'); fila.forEach((v, j) => {
          const td = el(i === 0 ? 'th' : 'td'), inp = el('input', 'vtabla__celda'); inp.type = 'text'; inp.value = v; inp.dataset.f = String(i); inp.dataset.c = String(j); inp.autocomplete = 'off';
          inp.setAttribute('aria-label', i === 0 ? `Encabezado ${j + 1}` : `Fila ${i}, columna ${j + 1}`); if (m.alin[j] === 'c') inp.style.textAlign = 'center'; else if (m.alin[j] === 'd') inp.style.textAlign = 'right';
          inp.addEventListener('focus', () => { fa = i; ca = j; resaltar(); });
          inp.addEventListener('input', () => { m.filas[i][j] = inp.value; guardar(); });
          inp.addEventListener('keydown', (e) => {
            if (e.isComposing) return;
            if (e.key === 'Enter') { e.preventDefault(); if (i + 1 >= m.filas.length) agregarFila(m.filas.length - 1, true); else enfocar(i + 1, j); }
            else if (e.key === 'ArrowDown' && i + 1 < m.filas.length) { e.preventDefault(); enfocar(i + 1, j); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); irA(modelo.bloques.indexOf(b) + 1, 'ini'); }
            else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); enfocar(i - 1, j); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); irA(modelo.bloques.indexOf(b) - 1, 'fin'); }
            else if (e.key === 'Tab' && !e.shiftKey && i === m.filas.length - 1 && j === m.filas[0].length - 1) { e.preventDefault(); agregarFila(i, true); }   // Tab en la última celda agrega una fila
          });
          td.append(inp); tr.append(td); }); return tr; }));
        resaltar(); if (f != null) enfocar(f, c, sel);
      }
      function agregarFila(despuesDe, enfoca) { const idx = Math.max(1, despuesDe + 1); m.filas.splice(idx, 0, Array(m.filas[0].length).fill('')); guardar(); pintarTabla(enfoca ? idx : null, 0); if (!enfoca) resaltar(); }
      function agregarCol(despuesDe, enfoca) { const idx = despuesDe + 1; m.filas.forEach((f, i) => f.splice(idx, 0, i === 0 ? 'Columna ' + (m.filas[0].length + 1) : '')); m.alin.splice(idx, 0, ''); guardar(); pintarTabla(enfoca ? 0 : null, idx, true); }
      function quitarFila() { if (m.filas.length <= 1) return; m.filas.splice(fa, 1); guardar(); fa = Math.min(fa, m.filas.length - 1); pintarTabla(fa, ca); }
      function quitarCol() { if (m.filas[0].length <= 1) return; m.filas.forEach((f) => f.splice(ca, 1)); m.alin.splice(ca, 1); guardar(); ca = Math.min(ca, m.filas[0].length - 1); pintarTabla(fa, ca); }
      function borrarTabla() {
        const k = modelo.bloques.indexOf(b); if (k < 0) return;
        const sg = modelo.bloques[k + 1]; if (sg) sg.pre = b.pre; modelo.bloques.splice(k, 1); nodos.delete(b); normalizar(); pintar(); sincronizar();
        const x = modelo.bloques[Math.min(k, modelo.bloques.length - 1)]; if (x && x.tipo !== 'tabla') activar(x, x === modelo.bloques[k - 1] || k >= modelo.bloques.length ? 1e9 : 0);
      }
      const btnQF = boton('remove', 'Fila', 'Quitar la fila', quitarFila, 'vtabla__btn--quita'), btnQC = boton('remove', 'Columna', 'Quitar la columna', quitarCol, 'vtabla__btn--quita');
      barra.append(boton('add', 'Fila', 'Agregar una fila debajo', () => agregarFila(fa, true)), boton('add', 'Columna', 'Agregar una columna a la derecha', () => agregarCol(ca, true)), el('span', 'vtabla__sep'), btnQF, btnQC, el('span', 'vtabla__sep'), boton('delete', '', 'Eliminar la tabla', borrarTabla, 'vtabla__btn--quita'));
      scroll.append(tb);
      const masC = boton('add', '', 'Agregar una columna al final', () => agregarCol(m.filas[0].length - 1, true), 'vtabla__mas vtabla__mas--col'), masF = boton('add', '', 'Agregar una fila al final', () => agregarFila(m.filas.length - 1, true), 'vtabla__mas vtabla__mas--fila');
      cuerpo.append(scroll, masC); tabla.append(barra, cuerpo, masF); raiz.append(tabla);
      pintarTabla();
      raiz._enfocar = (f, c, sel) => enfocar(f, c, sel);
      return raiz;
    }

    /* Inserta una tabla (3 columnas × 3 filas) donde está el cursor: parte el bloque de texto si el cursor está en el medio */
    function insertarTabla() {
      let b, antes, despues;
      if (act) { b = act.b; const v = act.ta.value, p = act.ta.selectionStart; antes = v.slice(0, p).replace(/\s+$/, ''); despues = v.slice(act.ta.selectionEnd).replace(/^\s+/, ''); act = null; }
      else { b = ultimoEditable(); antes = b.texto.trim() ? b.texto.replace(/\s+$/, '') : ''; despues = ''; }
      const k = modelo.bloques.indexOf(b), tb = { tipo: 'tabla', texto: serializarTabla(tablaNueva(3, 3)), pre: '\n\n' };
      const resto = []; if (despues) resto.push({ tipo: 'p', texto: despues, pre: '\n\n' });
      if (!antes) { tb.pre = b.pre; const sg = modelo.bloques[k + 1]; if (!despues && sg) sg.pre = sg.pre || '\n\n'; modelo.bloques.splice(k, 1, tb, ...resto); }
      else { b.texto = antes; if (b.extra) { b.extra = false; if (!b.pre && k > 0) b.pre = '\n\n'; } modelo.bloques.splice(k + 1, 0, tb, ...resto); }
      nodos.delete(b); normalizar(); pintar(); modelo.bloques.forEach((x) => { if (x.tipo !== 'tabla') { const v = nodos.get(x); if (!v || v.querySelector('.vivo') || x === b) repintarNodo(x); } });
      sincronizar();
      const n = nodos.get(tb); if (n && n._enfocar) n._enfocar(0, 0, true);
    }

    /* ----- Conexión con el resto de la app ----- */
    Object.defineProperty(t, 'value', { configurable: true, get() { return nat.get.call(this); }, set(v) { nat.set.call(this, v); reconstruir(); } });   // t.value = '…' desde script.js reconstruye los bloques
    t.focus = () => { const b = ultimoEditable(); if (b) activar(b); };
    if (t.form) t.form.addEventListener('reset', () => setTimeout(reconstruir, 0));
    caja.addEventListener('mousedown', (e) => {
      if (e.target === caja || e.target === cont) { e.preventDefault(); const b = ultimoEditable(); if (b) activar(b); }
      else if (e.target.closest('.vb__prev')) e.preventDefault();         // tocar un bloque formateado no le quita el foco al que se edita (el 'click' lo abre sin que se pierda el toque)
    });
    caja.addEventListener('focusin', (e) => { if (act && !act.ta.parentNode.contains(e.target)) cerrarActivo(); });   // al pasar a una celda de tabla, el bloque de texto que se editaba vuelve a verse formateado
    const etiqueta = t.id && document.querySelector(`label[for="${t.id}"]`);
    if (etiqueta) etiqueta.addEventListener('click', (e) => { e.preventDefault(); t.focus(); });   // tocar la etiqueta "Texto" pone el cursor en el editor (el cuadro original está oculto)   // tocar el espacio vacío = escribir al final
    caja.addEventListener('focusout', () => { clearTimeout(reloj); reloj = setTimeout(() => { const a = document.activeElement; if (!caja.contains(a) && !(a && a.closest && a.closest('.formato'))) cerrarActivo(); }, 160); });
    t._bloques = { reconstruir, insertarTabla, activo: () => (act ? act.ta : null), activarUltimo: () => { const b = ultimoEditable(); return b ? activar(b) : null; }, cerrar: cerrarActivo };
    reconstruir();
    return caja;
  }

  /* Envuelve un campo: los de data-rico="completo" pasan a ser editores por bloques; los demás, el editor en vivo de siempre */
  function envolver(t) {
    if (t._vivo) return t._vivo;
    if (t.dataset.rico === 'completo' && !t.hasAttribute('data-bloque')) { if (!t._bloques) t._vivo = envolverBloques(t); return t._vivo; }
    return envolverSimple(t);
  }
  /* Campo donde debe aplicarse un formato: el bloque que se está editando (o el último, si no hay ninguno) */
  const activo = (t) => (t && t._bloques ? t._bloques.activo() || t._bloques.activarUltimo() || t : t);
  const insertarTabla = (t) => { const m = t && (t._maestro || t); if (m && m._bloques) { m._bloques.insertarTabla(); return true; } return false; };

  window.Editor = { MD_INLINE, resaltar, envolver, refrescar, refrescarTodo, config, activo, insertarTabla };
})();
