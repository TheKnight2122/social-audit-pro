# Avance 005 - Demostracion online y entorno local

## Fecha

2026-09-15

## Objetivo

Publicar una version visual compartible sin reemplazar el sistema local con backend y persistencia.

## Trabajo realizado

- Generacion estatica reproducible mediante `npm run build`.
- Deteccion automatica de disponibilidad de la API.
- Mensajes diferenciados para demostracion online y ejecucion local.
- Conservacion del flujo local de registro, sesiones, usuarios, integraciones y PDF.
- Configuracion de alojamiento para la demostracion visual.

## Resultado

El mismo repositorio produce una demostracion online navegable y mantiene la aplicacion local completa en `http://127.0.0.1:4173`.
