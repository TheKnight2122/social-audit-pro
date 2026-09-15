# Matriz de trazabilidad

La matriz relaciona requisitos, modulos, implementacion, pruebas y estado.

| Requisito | Modulo | Implementacion | Prueba | Estado |
|---|---|---|---|---|
| RF-001 | Dashboard | `index.html`, `src/app.js` | Verificacion visual 2026-09-15 | Parcial demo |
| RF-002 | Metricas | `src/analytics.js` | TEST-AN-001, TEST-AN-002 | Parcial |
| RF-003 | Auditoria | `src/analytics.js`, `src/app.js` | TEST-AN-004 | Parcial |
| RF-004 | Auditoria | `calculateAudit` | TEST-AN-004 | Parcial |
| RF-005 | Contenido | `src/app.js`, `src/data/sampleData.js` | Verificacion visual 2026-09-15 | Parcial demo |
| RF-006 | Filtros | `filterPosts`, `src/app.js` | TEST-AN-006, verificacion visual | Parcial demo |
| RF-007 | Ordenamiento | `sortPosts`, `src/app.js` | TEST-AN-007 | Parcial demo |
| RF-008 | Ranking | `rankPosts` | TEST-AN-007, verificacion visual | Parcial demo |
| RF-009 | Comparativas | `buildPlatformComparison`, `src/app.js` | TEST-AN-008 | Parcial demo |
| RF-010 | Comparativas | `percentChange`, `src/app.js` | TEST-AN-001 | Parcial demo |
| RF-012 | Insights | `detectAnomalies` | TEST-AN-005 | Parcial demo |
| RF-013 | Insights | `detectAnomalies`, `src/app.js` | TEST-AN-005, verificacion visual | Parcial demo |
| RF-014 | Recomendaciones | `buildRecommendations`, `src/app.js` | Verificacion visual 2026-09-15 | Parcial demo |
| RF-015 | Reportes | `buildReportHtml`, `buildDownloadDocument` | Verificacion visual 2026-09-15 | Parcial HTML |
| RF-016 | Usuarios | Pendiente | Pendiente | Pendiente |
| RF-017 | Roles | Pendiente | Pendiente | Pendiente |
| RF-018 | Integraciones | Pendiente | Pendiente | Pendiente |
| RF-019 | Sincronizacion | `sampleData.lastSync`, UI | Verificacion manual pendiente | Parcial |
| RF-020 | Disponibilidad de metricas | `src/app.js`, `src/data/sampleData.js` | Verificacion visual 2026-09-15 | Parcial demo |
| RF-021 | Historicos | Pendiente | Pendiente | Pendiente |
| RF-022 | Restriccion de no publicacion | Documentacion | Revision documental | Completado documental |
| RF-023 | Navegacion | `index.html`, enrutador de `src/app.js` | Recorrido visual de once rutas | Completado frontend |
