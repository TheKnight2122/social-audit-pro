# Produccion y alta disponibilidad

## Preparacion incorporada

- Configuracion por variables de entorno.
- Validacion de HTTPS y secreto de cifrado en produccion.
- Contenedor y Compose de una instancia.
- Sesiones y limitador de acceso persistentes.
- Tareas programadas con arrendamientos.
- Endpoints de vida y disponibilidad.
- Logs HTTP JSON, correlacion generada por el servidor y metricas JSON protegidas por clave operativa independiente.
- Apagado ordenado de HTTP, trabajador y base.
- Frontend estatico separable del backend.
- Copias SQLite online cifradas, verificables y programables; restauracion a ruta nueva probada con datos desechables.

## Lo que todavia impide multiples servidores

- SQLite usa un archivo local y no es una base compartida para replicas.
- No existe una cola externa para distribuir sincronizaciones.
- Los archivos generados y copias no estan en almacenamiento de objetos.
- No hay balanceador, descubrimiento, centralizacion de metricas, trazas ni alertas.
- Las migraciones no tienen aun un proceso coordinado entre replicas.

## Arquitectura objetivo

```mermaid
flowchart LR
    CDN[CDN / frontend] --> LB[Balanceador]
    LB --> API1[API replica 1]
    LB --> API2[API replica 2]
    API1 --> PG[(PostgreSQL)]
    API2 --> PG
    API1 --> Q[Cola compartida]
    API2 --> Q
    Q --> W1[Worker 1]
    Q --> W2[Worker 2]
    W1 --> PG
    W2 --> PG
    API1 --> OBS[Logs, metricas y trazas]
    API2 --> OBS
    W1 --> OBS
    W2 --> OBS
```

## Plan recomendado

1. Extraer una interfaz de persistencia y portar consultas a PostgreSQL.
2. Ejecutar migraciones en CI/CD antes de cambiar replicas.
3. Mover sincronizaciones a una cola con reintentos e idempotencia.
4. Anadir almacenamiento de objetos para exportaciones si se conservan.
5. Configurar destino externo y retencion de copias, monitoreo y alertas; probar restauracion en produccion.
6. Probar fallos de instancia, perdida de red y recuperacion de base.

Hasta completar estos pasos, el despliegue recomendado es una unica instancia con volumen persistente y copias frecuentes.

La guia `29-copias-y-restauracion.md` describe los comandos y controles incorporados en v0.5.1. No equivale a recuperacion ante la perdida completa del host sin una copia externa y claves custodiadas fuera del servidor.
