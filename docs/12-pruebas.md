# Pruebas

## Estado

Existen pruebas unitarias del motor analitico y pruebas de integracion de la API con una base SQLite en memoria.

## Estrategia

- Pruebas unitarias.
- Pruebas de integracion.
- Pruebas funcionales.
- Pruebas de validaciones.
- Pruebas de errores.
- Pruebas basicas de seguridad.
- Pruebas manuales cuando correspondan.

## Registro de pruebas

| ID | Tipo | Objetivo | Comando | Estado |
|---|---|---|---|---|
| TEST-AN-001 | Unitario | Variacion porcentual | `npm test` | Implementado |
| TEST-AN-002 | Unitario | Engagement = interacciones / alcance x 100 | `npm test` | Implementado |
| TEST-AN-003 | Unitario | Clasificacion de rendimiento | `npm test` | Implementado |
| TEST-AN-004 | Unitario | KPIs agregados y auditoria | `npm test` | Implementado |
| TEST-AN-005 | Unitario | Deteccion de anomalias | `npm test` | Implementado |
| TEST-AN-006 | Unitario | Filtros por cuenta, tematica y campana | `npm test` | Implementado |
| TEST-AN-007 | Unitario | Ordenamiento, agrupacion y patron de contenido | `npm test` | Implementado |
| TEST-AN-008 | Unitario | Comparativa normalizada entre plataformas | `npm test` | Implementado |
| TEST-API-001 | Integracion | Salud y cabeceras de seguridad | `npm test` | Implementado |
| TEST-API-002 | Integracion | Administrador inicial y politica de contrasena | `npm test` | Implementado |
| TEST-API-003 | Integracion | Sesiones, roles y proteccion CSRF | `npm test` | Implementado |
| TEST-API-004 | Integracion | Cifrado de configuracion de integraciones | `npm test` | Implementado |
| TEST-API-005 | Integracion | Importacion e historicos persistentes | `npm test` | Implementado |
| TEST-API-006 | Integracion | Reportes, actividad y PDF valido | `npm test` | Implementado |
| TEST-API-007 | Integracion | Cierre de sesion protegido | `npm test` | Implementado |

Resultado del 2026-09-15: 15 pruebas ejecutadas, 15 exitosas y 0 fallidas.

## Verificacion funcional y visual

- Navegacion comprobada en las once rutas.
- Auditoria y Metricas muestran contenido independiente.
- Filtro por Instagram comprobado: la tabla paso de 12 a 3 publicaciones.
- Vista movil comprobada a 390 x 844 pixeles sin solapamientos.
- Consola del navegador comprobada sin advertencias ni errores.
- Registro, login, Configuracion e Integraciones comprobados contra un servidor local y SQLite temporal.
- PDF A4 de dos paginas renderizado y revisado visualmente sin cortes ni superposiciones.
