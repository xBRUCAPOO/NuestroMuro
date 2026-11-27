/* ============================================================
   novedades.js — Notas de las actualizaciones ("patch notes") de Nuestro Muro  [NUEVO v3.0]
   Qué hace: lista, de la más nueva a la más vieja, lo que cambió en cada versión. La app la muestra en Ajustes → Novedades.
   Cuando se publica una versión nueva (la primera de la lista cambia), el servidor manda UNA notificación a las dos personas
   (campanita + aviso del celular) y la marca como avisada en la tabla meta.
   Cómo agregar una actualización: poner un objeto nuevo AL PRINCIPIO de NOVEDADES con { version, fecha, titulo, resumen, items }.
   Cada item = { t: 'nuevo' | 'mejora' | 'arreglo', texto }. Los colores de cada tipo están en style.css (--color-nov-*).
   ============================================================ */
export const NOVEDADES = [
  {
    version: '3.0.0', fecha: '2026-11-27', titulo: 'El calendario de amor y un editor nuevo',
    resumen: 'Calendario de amor con avisos, editor con formato en vivo, editor de imágenes, listas con responsables y mucho más.',
    items: [
      { t: 'nuevo', texto: 'Calendario de amor: botón nuevo en la barra superior con el mes, la lista de fechas, buscador, categorías, feriados y detalle de cada fecha.' },
      { t: 'nuevo', texto: 'Avisos del calendario: "Faltan 3 días para…", "Faltan 2 días…", "¡MAÑANA es el gran día de…!" y "¡HOY es…!" llegan a los dos por notificación.' },
      { t: 'nuevo', texto: 'Cada día de un plan aparece solo en el calendario, unido con una línea a los demás días del mismo plan, y cambia o desaparece con el plan.' },
      { t: 'nuevo', texto: 'Al elegir los días de un plan se ven en color las fechas importantes que ya tienen; manteniendo apretado un día se abre una ventanita con el detalle.' },
      { t: 'nuevo', texto: 'Formato en vivo como en WhatsApp: al escribir *así* se ve en negrita al instante y las marcas quedan en gris. Los cuadros de texto crecen solos.' },
      { t: 'nuevo', texto: 'Barra de formato completa: títulos, negrita, cursiva, tachado, subrayado, resaltado, código, cita, listas, link, línea separadora, tabla y nota al pie.' },
      { t: 'nuevo', texto: 'Editor de imágenes: recortar, dibujar y poner texto antes de agregar una foto.' },
      { t: 'nuevo', texto: 'Listas con responsable por elemento y casillas del color de quien las completó.' },
      { t: 'nuevo', texto: 'Estado "Expirado" (gris oscuro): planes ya pasados, fechas de una sola vez y listas o encuestas con fecha límite. Las encuestas vencidas no se pueden votar.' },
      { t: 'nuevo', texto: 'Perfiles: las entradas se acomodan solas para coincidir con las del otro perfil y se pueden reordenar arrastrando desde el borde derecho.' },
      { t: 'nuevo', texto: 'Ajustes: este menú reemplaza al botón del tema, que ahora es un interruptor. Acá también ves las novedades.' },
      { t: 'nuevo', texto: 'Las notificaciones del celular tienen un ícono según su tipo (por ejemplo, un corazón del color de quien lo dio).' },
      { t: 'mejora', texto: 'Las animaciones ahora se ven también en la computadora y las ventanas se adaptan a pantallas grandes.' },
      { t: 'mejora', texto: 'En el celular la barra de formato queda pegada arriba del teclado.' },
      { t: 'mejora', texto: 'Si cierras una ventana con cambios sin guardar (X, Cancelar, tocar afuera, Esc o "atrás") te pregunta antes de perderlos.' },
      { t: 'mejora', texto: 'En los formularios de creación el título va primero y después el ícono.' },
    ],
  },
  {
    version: '2.10.1', fecha: '2026-11-23', titulo: 'Likes más lindos',
    resumen: 'Arreglos en la animación del corazón y en la aparición de las entradas de perfil.',
    items: [
      { t: 'arreglo', texto: 'La animación de Like (corazoncitos que vuelan) ya no se ve cortada.' },
      { t: 'mejora', texto: 'Las entradas del perfil aparecen más fluidas y una por una.' },
    ],
  },
  {
    version: '2.10.0', fecha: '2026-11-22', titulo: 'Perfil estilo Steam',
    resumen: 'El perfil se ve solo, con selector de cartas y animaciones.',
    items: [
      { t: 'nuevo', texto: 'Perfil estilo Steam: solo se ve el perfil y la campanita pasa a "volver al muro".' },
      { t: 'nuevo', texto: 'Animación de Like con corazoncitos; M siempre aparece a la derecha de xB.' },
      { t: 'mejora', texto: 'Selector de perfiles con las cartas y más íconos disponibles.' },
    ],
  },
  {
    version: '2.9.0', fecha: '2026-11-20', titulo: 'Hilos de comentarios',
    resumen: 'Respuestas a comentarios y barras de formato debajo del campo.',
    items: [
      { t: 'nuevo', texto: 'Se puede responder a un comentario (hilos).' },
      { t: 'mejora', texto: 'La barra de formato va debajo del cuadro de texto y las entradas de perfil muestran un círculo de carga.' },
    ],
  },
  {
    version: '2.8.0', fecha: '2026-11-18', titulo: 'Perfiles',
    resumen: 'Perfiles con frase, entradas con ícono, texto con formato e imágenes.',
    items: [
      { t: 'nuevo', texto: 'Pestaña Perfiles: frase, entradas con ícono, título, texto con formato e imágenes. Cerrar sesión pasó al perfil propio.' },
      { t: 'arreglo', texto: 'El tachado de las listas se ve bien en varias líneas.' },
    ],
  },
  {
    version: '2.7.0', fecha: '2026-11-15', titulo: 'Todo al instante',
    resumen: 'Cambios instantáneos, lista completada en verde y escena de inicio de sesión.',
    items: [
      { t: 'nuevo', texto: 'Todo se actualiza al instante; si el servidor falla se deshace y avisa.' },
      { t: 'nuevo', texto: 'Lista completada en verde, descripción en listas y encuestas, y escena de inicio de sesión.' },
      { t: 'mejora', texto: 'Formato de texto en todos los campos y animaciones más fluidas.' },
    ],
  },
  {
    version: '2.5.0', fecha: '2026-11-10', titulo: 'Notificaciones',
    resumen: 'Campanita y avisos del celular.',
    items: [
      { t: 'nuevo', texto: 'Notificaciones: campanita dentro de la app y avisos del celular cuando la otra persona hace algo.' },
    ],
  },
  {
    version: '2.3.0', fecha: '2026-11-05', titulo: 'Planes',
    resumen: 'Nuevo tipo de publicación "plan".',
    items: [
      { t: 'nuevo', texto: 'Tipo "plan" con días posibles, ideales, descartados y un día seguro, hora y lugar.' },
    ],
  },
];
export const ULTIMA = NOVEDADES[0];
