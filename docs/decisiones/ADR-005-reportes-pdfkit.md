# ADR-005 - Reportes PDF generados en servidor

## Estado

Aceptada.

## Contexto

La descarga HTML del MVP no garantizaba una presentacion estable, paginada y lista para compartir.

## Decision

Generar documentos A4 con PDFKit desde un endpoint protegido por permisos y CSRF. El frontend envia un modelo estructurado, no HTML arbitrario.

## Consecuencias

- El resultado es consistente e independiente del dialogo de impresion del navegador.
- El endpoint puede probarse verificando la firma PDF y el documento puede revisarse mediante renderizado.
- Las visualizaciones complejas futuras deberan incorporarse como graficos generados de forma controlada.
