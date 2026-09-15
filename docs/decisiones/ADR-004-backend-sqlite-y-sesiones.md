# ADR-004 - Backend Express, SQLite y sesiones de servidor

## Estado

Aceptada.

## Contexto

El frontend demostrativo necesitaba persistencia, autenticacion y una API comprobable sin introducir infraestructura remota antes de definir el despliegue final.

## Decision

Usar Express para la API, SQLite mediante `better-sqlite3` para la primera persistencia real y sesiones opacas almacenadas en servidor. Los secretos se cifran con AES-256-GCM y las contrasenas se derivan con `scrypt`.

## Consecuencias

- El proyecto funciona localmente con una instalacion sencilla y pruebas en memoria.
- Las reglas de permisos viven en backend y no dependen de ocultar botones.
- Un despliegue horizontal futuro requerira migrar la base y el limitador de login a servicios compartidos.
