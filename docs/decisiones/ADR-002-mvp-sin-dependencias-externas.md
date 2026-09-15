# ADR-002 - MVP inicial sin dependencias externas

## Estado

Aceptada.

## Fecha

2026-09-15

## Situacion

El proyecto necesita avanzar desde documentacion hacia una primera experiencia funcional, pero aun no se ha creado el repositorio remoto ni se han definido restricciones finales de stack.

## Opciones consideradas

1. Crear una aplicacion con framework frontend y dependencias externas.
2. Crear un MVP con HTML, CSS, JavaScript modular y Node.js nativo.

## Decision tomada

Crear el MVP inicial sin dependencias externas.

## Motivo

Permite validar estructura, experiencia, formulas y reglas de negocio rapidamente, reduciendo riesgo de instalacion y manteniendo el repositorio simple.

## Ventajas

- Instalacion minima.
- Pruebas ejecutables con Node.js nativo.
- Facil de migrar posteriormente a un framework si el equipo lo decide.
- Menor superficie inicial de seguridad y mantenimiento.

## Desventajas

- No incluye componentes avanzados de UI de un framework.
- No incluye graficos profesionales externos.
- La escalabilidad de frontend requerira refactor si crece mucho.

## Consecuencias

El MVP se usara para validar flujos, informacion y decisiones de producto. La arquitectura objetivo sigue contemplando backend, base de datos, integraciones oficiales y reportes profesionales.
