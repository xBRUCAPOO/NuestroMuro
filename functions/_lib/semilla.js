/* ============================================================
   semilla.js — Publicaciones iniciales del muro
   Qué hace: lista el contenido que tenía la página anterior (tests vocacionales y orientación) convertido en
   tarjetas del muro. Se cargan UNA sola vez, cuando la base de datos está vacía y se usa por primera vez.
   Para qué sirve: no perder lo que ya estaba. Después son publicaciones normales: se pueden editar o borrar.
   El orden es de arriba (más nueva) hacia abajo. "autor" es quién las "subió" (cámbialo a 'M' si quieres).
   Borrar o editar esta lista NO afecta a una base que ya fue creada.
   ============================================================ */
export const SEMILLA = [
  { autor: 'xB', tipo: 'nota', titulo: 'Según ChatGPT',
    texto: 'Para evitar que Mely termine agotada de hacer cuestionarios, los ordenaría así:\n\n1. Formate Brown: para explorar actividades variadas.\n2. InterUniversidades: para obtener una perspectiva más amplia de las áreas profesionales.\n3. Rhumbo Lab: para identificar su perfil de intereses RIASEC.\n4. EduMove: para explorar carreras concretas y simular tareas profesionales.\n5. Precavidos: como contraste opcional, especialmente si quieren revisar el perfil RIASEC con otra herramienta.' },

  { autor: 'xB', tipo: 'link', titulo: 'Test Vocacional de Formate Brown', url: 'https://formate.brown.gob.ar/test?utm_source=chatgpt.com',
    texto: 'Presenta distintas actividades y le pide elegir cuáles le gustan más y cuáles menos. Incluye opciones creativas, científicas, sociales y empresariales. Es una alternativa interesante para comparar preferencias sin limitarse a Diseño Gráfico y Psicología.' },
  { autor: 'xB', tipo: 'link', titulo: 'InterUniversidades', url: 'https://interuniversidades.com/test-vocacional/?utm_source=chatgpt.com',
    texto: 'Dura aproximadamente 15 minutos y ofrece un informe sobre intereses, características personales y once áreas profesionales. Incluye Arte, Diseño y Arquitectura, además de Ciencias Sociales y Humanas, donde puede explorar alternativas relacionadas con sus dos intereses actuales. Solicita datos personales y correo para entregar el informe.' },
  { autor: 'xB', tipo: 'link', titulo: 'Rhumbo Lab', url: 'https://rhumbo.com.ar/recursos/test-vocacional.html?utm_source=chatgpt.com',
    texto: 'Utiliza el modelo RIASEC de Holland, que organiza los intereses en seis áreas: Realista, Investigadora, Artística, Social, Emprendedora y Convencional. Su página indica que las respuestas no se almacenan y que el resultado es orientativo.\n\nHay que tener cuidado con este ya que hice el test y me dió algo nada que ver con lo que yo quiero estudiar xd' },
  { autor: 'xB', tipo: 'link', titulo: 'Precavidos — Test RIASEC', url: 'https://precavidos.com/tests_psicologicos/riasec/?utm_source=chatgpt.com',
    texto: 'Otra versión del modelo RIASEC, con afirmaciones sobre creatividad, investigación, organización, trabajo con otras personas y preferencias laborales. Sirve para contrastar el perfil anterior, aunque ambos cuestionarios comparten el mismo modelo y no constituyen dos evaluaciones totalmente independientes.' },
  { autor: 'xB', tipo: 'link', titulo: 'EduMove', url: 'https://www.edumove.com.ar/?utm_source=chatgpt.com',
    texto: 'Además del test, ofrece un simulador llamado «Un día como profesional», pensado para explorar cómo podría ser una jornada de trabajo en una carrera determinada. Para Mely, esto es especialmente útil: le permite ir más allá de los resultados de los cuestionarios y conocer actividades profesionales concretas.' },

  { autor: 'xB', tipo: 'link', titulo: 'Departamento de Orientación Vocacional de la UNC', url: 'https://www.unc.edu.ar/vida-estudiantil/orientaci%C3%B3n-vocacional',
    texto: 'Ofrece acompañamiento para elegir una carrera, conocer las alternativas públicas y privadas de Córdoba, comprender los cursos de ingreso y resolver dudas sobre la vida universitaria. Tiene atención presencial y un espacio de asesoramiento virtual.\n\nContacto\n• Correo: orientacionvocacional@estudiantiles.unc.edu.ar\n• Ubicación: Ciudad Universitaria, detrás del Comedor Universitario.' },
  { autor: 'xB', tipo: 'link', titulo: 'Servicio de Orientación Vocacional y Ocupacional de la UCC', url: 'https://www.ucc.edu.ar/ciencias-salud/orientacion-vocacional/',
    texto: 'Ofrece un proceso de seis encuentros semanales de dos horas, acompañado por profesionales de orientación vocacional. Está dirigido, entre otros, a estudiantes del último año del secundario.\n\nContacto\n• Correo: sovo.fcs@ucc.edu.ar\n• Ubicación institucional: Campus Universitario, Av. Armada Argentina 3555.' },
];
