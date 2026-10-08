# Mi Día

App personal para el móvil (PWA): calendario sincronizado con Google Calendar, recordatorios, tareas,
vencimientos, notas, deporte, gimnasio, salud, finanzas personales (ingresos, gastos, presupuestos, metas),
tiempo, bares cercanos, lugares, planes del finde, cocina, pelis/series/libros, viajes, compra compartida,
cumpleaños, gastos compartidos, importación de extractos del banco, informes mensuales, notas de voz,
coche, cuidados recurrentes, diario, modo Hoy, sincronización entre dispositivos (Supabase), copia en
Google Drive, bloqueo con huella y asistente con Claude que apunta cosas por ti.

No necesita instalación ni compilación: son archivos HTML/CSS/JS estáticos.

## Estructura

- `index.html`, `manifest.webmanifest`, `sw.js`: la app instalable y su funcionamiento sin conexión.
- `js/store.js`: datos guardados en el móvil (localStorage) + copia de seguridad.
- `js/google.js`: conexión con Google Calendar y Drive. `js/backup.js`: copia automática en Drive.
- `js/sync.js`: sincronización con Supabase (el SQL necesario está dentro y en Ajustes).
- `js/ai.js`: llamadas a Claude. `js/ui.js`: gráficas, estrellas y pestañas. `js/lock.js`: bloqueo con huella.
- `js/modules/*.js`: una pantalla por archivo (inicio, calendario, notas, deporte, tiempo, bares…).

## Servicios externos (gratis salvo el asistente)

- Tiempo: Open-Meteo · Lugares cercanos y mapa: OpenStreetMap (Overpass + Leaflet).
- Google Calendar: necesita un ID de cliente OAuth (instrucciones dentro de Ajustes).
- Asistente: clave de API de Anthropic (pago por uso).

## Publicar cambios

1. Editar los archivos.
2. Subir la versión en `sw.js` (`mi-dia-v1` → `mi-dia-v2`) para que el móvil descargue lo nuevo.
3. Subir a GitHub; GitHub Pages la publica sola.
