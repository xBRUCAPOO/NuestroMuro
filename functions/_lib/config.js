/* ============================================================
   config.js — Configuración del servidor (Pages Functions)
   Qué hace: define las dos identidades del muro ("M" y "xB") y la contraseña predeterminada de cada una.
   Para qué sirve: es el ÚNICO lugar donde se cambian las contraseñas. El servidor las valida en cada
   petición, así que sin ellas nadie puede leer ni publicar en el muro.
   IMPORTANTE:
   - Cambia las dos contraseñas ANTES de subir esto a GitHub por primera vez.
   - Si el repositorio es público, estas contraseñas quedan visibles para cualquiera. En ese caso conviene
     dejarlas vacías aquí y cargarlas como variables secretas en Cloudflare (Settings > Variables and Secrets):
     CLAVE_M y CLAVE_XB. Si esas variables existen, tienen prioridad sobre lo que diga este archivo.
   - Esta carpeta (functions/) NO se publica como archivo estático: solo corre en el servidor.
   ============================================================ */

/* Identidades válidas (el orden es el del switch del acceso: izquierda "M", derecha "xB") */
export const IDENTIDADES = ['M', 'xB'];

/* Contraseña predeterminada de cada identidad (cámbialas) */
export const CLAVES = {
  M: 'cambia-esta-clave-M',
  xB: 'cambia-esta-clave-xB',
};

/* Secreto interno para firmar la sesión (cookie). Cualquier texto largo y propio; si lo cambias, se cierran todas las sesiones.
   También se puede definir como variable secreta MURO_SECRETO en Cloudflare. */
export const SECRETO_SESION = 'cambia-este-secreto-largo-para-firmar-sesiones';

/* Límites de contenido (se validan en el servidor; el navegador aplica los mismos) */
export const LIMITES = {
  titulo: 120,
  texto: 5000,
  item: 200,          // largo de cada elemento de una lista o de una opción de encuesta
  maxItems: 50,       // elementos por lista
  maxOpciones: 8,     // opciones por encuesta
  imagen: 1400000,    // caracteres máximos de la foto en base64 (D1 admite filas de hasta ~2 MB)
  publicaciones: 500, // publicaciones que devuelve el listado
};
