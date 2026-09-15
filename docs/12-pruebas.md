# Pruebas

## Estado

Existen pruebas unitarias para formulas, filtros, ordenamiento, patrones y comparativas del motor analitico.

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

Resultado del 2026-09-15: 8 pruebas ejecutadas, 8 exitosas y 0 fallidas.

## Verificacion funcional y visual

- Navegacion comprobada en las once rutas.
- Auditoria y Metricas muestran contenido independiente.
- Filtro por Instagram comprobado: la tabla paso de 12 a 3 publicaciones.
- Vista movil comprobada a 390 x 844 pixeles sin solapamientos.
- Consola del navegador comprobada sin advertencias ni errores.
