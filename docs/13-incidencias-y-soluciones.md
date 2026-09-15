# Incidencias y soluciones

## Formato

Cada incidencia debera incluir:

- ID.
- Fecha.
- Descripcion.
- Severidad.
- Causa.
- Diagnostico.
- Solucion.
- Archivos afectados.
- Estado.

## Incidencias registradas

### INC-001 - Navegacion monolitica

- Fecha: 2026-09-15.
- Descripcion: Auditoria, Metricas, Contenido e Insights aparecian dentro de la misma pagina.
- Severidad: media.
- Causa: el menu utilizaba anclas hacia secciones del documento.
- Diagnostico: cambiar de opcion solo desplazaba la pagina y no reemplazaba la vista.
- Solucion: implementar enrutamiento hash y un contenedor de vista unico.
- Archivos afectados: `index.html`, `src/app.js`, `src/styles.css`.
- Estado: resuelta en v0.2.0.

### INC-002 - Puerto de desarrollo ocupado

- Fecha: 2026-09-15.
- Descripcion: una segunda ejecucion del servidor devolvio `EADDRINUSE` para el puerto 4173.
- Severidad: baja.
- Causa: ya existia una instancia activa del servidor local.
- Diagnostico: el proceso anterior seguia atendiendo correctamente la aplicacion.
- Solucion: reutilizar la instancia activa sin finalizar procesos.
- Archivos afectados: ninguno.
- Estado: resuelta durante la verificacion.

### INC-003 - Paginacion incorrecta del reporte PDF

- Fecha: 2026-09-15.
- Descripcion: el primer prototipo generaba paginas adicionales y titulos fuera de posicion.
- Severidad: media.
- Causa: el cursor automatico de PDFKit se combinaba con coordenadas parciales y el pie excedia el area de contenido.
- Diagnostico: el render de control produjo seis paginas para un informe que debia ocupar dos.
- Solucion: fijar coordenadas y anchos, reservar espacio para el pie y controlar los saltos de pagina.
- Archivos afectados: `src/server/report-pdf.js`.
- Estado: resuelta en v0.3.0 y validada mediante render PNG.
