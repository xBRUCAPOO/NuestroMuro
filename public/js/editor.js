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
  function envolver(t) {
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

  window.Editor = { MD_INLINE, resaltar, envolver, refrescar, refrescarTodo };
})();
