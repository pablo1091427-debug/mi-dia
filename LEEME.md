# Mi Día

App personal para el móvil (PWA): calendario sincronizado con Google Calendar, notas, deporte,
tiempo, bares cercanos, gastos, hábitos, lista de la compra, cumpleaños, lugares favoritos y asistente con Claude.

No necesita instalación ni compilación: son archivos HTML/CSS/JS estáticos.

## Estructura

- `index.html`, `manifest.webmanifest`, `sw.js`: la app instalable y su funcionamiento sin conexión.
- `js/store.js`: datos guardados en el móvil (localStorage) + copia de seguridad.
- `js/google.js`: conexión con Google Calendar.
- `js/modules/*.js`: una pantalla por archivo (inicio, calendario, notas, deporte, tiempo, bares…).

## Servicios externos (gratis salvo el asistente)

- Tiempo: Open-Meteo · Lugares cercanos y mapa: OpenStreetMap (Overpass + Leaflet).
- Google Calendar: necesita un ID de cliente OAuth (instrucciones dentro de Ajustes).
- Asistente: clave de API de Anthropic (pago por uso).

## Publicar cambios

1. Editar los archivos.
2. Subir la versión en `sw.js` (`mi-dia-v1` → `mi-dia-v2`) para que el móvil descargue lo nuevo.
3. Subir a GitHub; GitHub Pages la publica sola.
